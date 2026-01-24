
import { UserAccount } from '../types';
import { walletService } from './WalletService';
import { supabase } from './SupabaseClient';
import { solanaService } from './SolanaService';

class AuthService {
  private currentUser: UserAccount | null = null;

  /**
   * Registers a new biological entity.
   * Logic: 
   * 1. Auth Sign Up (Trigger creates the profile row)
   * 2. Wallet/Profile Update (Populate the PENDING row)
   */
  public async register(username: string, password: string): Promise<UserAccount> {
    const pseudoEmail = `${username.toLowerCase().trim()}@sperm.io`;

    try {
      console.log(`[Auth] Registry initialization for ${username}...`);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: pseudoEmail,
        password: password,
        options: {
          data: { username }
        }
      });

      if (authError) {
        console.error('[Auth] Supabase Auth Error:', JSON.stringify(authError, null, 2));
        throw new Error(`Auth Error: ${authError.message}`);
      }

      if (!authData.user) {
        throw new Error("Failed to create identity.");
      }

      const userId = authData.user.id;
      console.log(`[Auth] Identity: ${userId}. Populating biological vault...`);

      // Use UPDATE to fill the PENDING row created by the DB Trigger
      const walletData = await walletService.createAndStoreUserWallet(userId, username);

      const newUser: UserAccount = {
        id: userId,
        username,
        seedphrase: walletData.seedphrase || 'PROTECTED_VAULT',
        solAddress: walletData.publicKey,
        balance: walletData.balance || 0,
        photoUrl: undefined
      };

      this.currentUser = newUser;
      return newUser;
    } catch (err: any) {
      const errorMsg = err?.message || JSON.stringify(err, null, 2);
      console.error('[Auth] Pipeline Failure:', errorMsg);
      throw new Error(errorMsg);
    }
  }

  public async login(username: string, password: string): Promise<UserAccount | null> {
    const pseudoEmail = `${username.toLowerCase().trim()}@sperm.io`;

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: pseudoEmail,
        password: password,
      });

      if (authError) {
        console.error('[Auth] Login Denied:', JSON.stringify(authError, null, 2));
        throw authError;
      }
      if (!authData.user) return null;

      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        console.error('[Auth] Profile Load Failure:', JSON.stringify(profileError, null, 2));
        throw new Error("Biological registry entry missing.");
      }

      // HEALING LOGIC: If profile exists but is still 'PENDING' (e.g. registration interrupted)
      if (profile.internal_pubkey === 'PENDING') {
        console.warn(`[Auth] Profile PENDING for ${username}. Healing record...`);
        const walletData = await walletService.createAndStoreUserWallet(authData.user.id, profile.username);
        profile.internal_pubkey = walletData.publicKey;
        profile.account_balance = walletData.balance || 0;
      }

      const user: UserAccount = {
        id: authData.user.id,
        username: profile.username,
        seedphrase: 'RECOVERABLE_IN_SETTINGS',
        solAddress: profile.internal_pubkey,
        balance: profile.account_balance || 0,
        photoUrl: profile.photo_url
      };

      this.currentUser = user;
      return user;
    } catch (err: any) {
      console.error('[Auth] Login Exception:', JSON.stringify(err, null, 2));
      return null;
    }
  }

  public getCurrentUser() { return this.currentUser; }

  public async getUserId(): Promise<string | null> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      return authData.user?.id || null;
    } catch (err) {
      console.error('[Auth] Get user ID failed:', err);
      return null;
    }
  }

  public async syncRealBalanceFromBlockchain(): Promise<void> {
    if (!this.currentUser) return;

    try {
      console.log(`[Auth] Syncing real balance for ${this.currentUser.solAddress}...`);
      const realBalance = await solanaService.getRealBalance(this.currentUser.solAddress);

      // Update local user object
      this.currentUser.balance = realBalance;

      // Update database
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ account_balance: realBalance })
        .eq('id', authData.user.id);

      if (error) {
        console.error('[Auth] Real balance sync failed:', error);
      } else {
        console.log(`[Auth] Real balance synced: ${realBalance} SOL`);
      }
    } catch (err) {
      console.error('[Auth] Real balance sync exception:', err);
    }
  }

  public async syncBalanceFromDatabase(): Promise<void> {
    if (!this.currentUser) return;

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('account_balance')
        .eq('id', authData.user.id)
        .single();

      if (!error && profile) {
        this.currentUser.balance = profile.account_balance || 0;
      }
    } catch (err) {
      console.error('[Auth] Balance sync failed:', err);
    }
  }

  public async updateBalance(amount: number): Promise<void> {
    if (!this.currentUser) return;

    this.currentUser.balance += amount;

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      await supabase
        .from('profiles')
        .update({ account_balance: this.currentUser.balance })
        .eq('id', authData.user.id);
    } catch (err) {
      console.error('[Auth] Balance update failed:', err);
    }
  }

  public async deductBalance(amount: number): Promise<boolean> {
    if (!this.currentUser || this.currentUser.balance < amount) {
      console.error('[Auth] Deduction failed: Insufficient balance or no user');
      return false;
    }

    const previousBalance = this.currentUser.balance;
    this.currentUser.balance -= amount;

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        console.error('[Auth] Deduction failed: No authenticated user');
        this.currentUser.balance = previousBalance;
        return false;
      }

      console.log(`[Auth] Deducting ${amount} SOL. New balance: ${this.currentUser.balance} SOL`);

      const { error } = await supabase
        .from('profiles')
        .update({ account_balance: this.currentUser.balance })
        .eq('id', authData.user.id);

      if (error) {
        console.error('[Auth] Supabase balance update failed:', error);
        this.currentUser.balance = previousBalance;
        return false;
      }

      console.log('[Auth] Balance deducted successfully in Supabase');
      return true;
    } catch (err) {
      console.error('[Auth] Balance deduction exception:', err);
      this.currentUser.balance = previousBalance;
      return false;
    }
  }

  public async restoreSession(): Promise<UserAccount | null> {
    try {
      console.log('[Auth] Attempting session restoration...');

      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        console.log('[Auth] No active session found');
        return null;
      }

      const userId = session.user.id;
      console.log(`[Auth] Session found for user: ${userId}`);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        console.error('[Auth] Profile restoration failed:', profileError);
        return null;
      }

      if (profile.internal_pubkey === 'PENDING') {
        console.warn(`[Auth] Profile PENDING. Healing record...`);
        const walletData = await walletService.createAndStoreUserWallet(userId, profile.username);
        profile.internal_pubkey = walletData.publicKey;
        profile.account_balance = walletData.balance || 0;
      }

      const user: UserAccount = {
        id: userId,
        username: profile.username,
        seedphrase: 'RECOVERABLE_IN_SETTINGS',
        solAddress: profile.internal_pubkey,
        balance: profile.account_balance || 0,
        photoUrl: profile.photo_url
      };

      this.currentUser = user;
      console.log(`[Auth] Session restored for ${user.username}`);
      return user;
    } catch (err) {
      console.error('[Auth] Session restoration exception:', err);
      return null;
    }
  }

  public async getSeedphrase(): Promise<string> {
    try {
      const userId = await this.getUserId();
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const seedphrase = await walletService.getSeedphrase(userId);
      return seedphrase;
    } catch (err) {
      console.error('[Auth] Seedphrase retrieval failed:', err);
      throw err;
    }
  }

  public async recoverWithSeedphrase(username: string, seedphrase: string, newPassword: string): Promise<UserAccount> {
    try {
      console.log(`[Auth] Attempting seedphrase recovery for ${username}...`);

      // Get user by username - we need to find their user ID
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .single();

      if (profileError || !profile) {
        throw new Error('User not found');
      }

      // Verify the seedphrase matches
      const storedSeedphrase = await walletService.getSeedphrase(profile.id);
      if (storedSeedphrase !== seedphrase.toLowerCase().trim()) {
        throw new Error('Invalid seedphrase');
      }

      // Update the user's password
      const pseudoEmail = `${username.toLowerCase().trim()}@sperm.io`;
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        profile.id,
        { password: newPassword }
      );

      if (updateError) {
        throw new Error('Failed to update password');
      }

      console.log(`[Auth] Password updated successfully for ${username}`);

      // Auto-login after successful recovery
      return await this.login(username, newPassword);
    } catch (err: any) {
      console.error('[Auth] Seedphrase recovery failed:', err);
      throw new Error(err.message || 'Recovery failed');
    }
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        throw new Error('User not authenticated');
      }

      // Verify current password by attempting to sign in
      const pseudoEmail = `${this.currentUser?.username.toLowerCase().trim()}@sperm.io`;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: pseudoEmail,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw new Error('Failed to update password');
      }

      console.log('[Auth] Password updated successfully');
    } catch (err: any) {
      console.error('[Auth] Password change failed:', err);
      throw new Error(err.message || 'Failed to change password');
    }
  }

  public async updateProfilePhoto(photoDataUrl: string): Promise<string> {
    try {
      const userId = await this.getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Validate and compress the image
      const compressedDataUrl = await this.compressImage(photoDataUrl);

      // Store base64 data directly in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: compressedDataUrl })
        .eq('id', userId);

      if (updateError) {
        console.error('[Auth] Profile photo update failed:', updateError);
        throw new Error('Failed to update profile');
      }

      return compressedDataUrl;
    } catch (err: any) {
      console.error('[Auth] Profile photo update error:', err);
      throw new Error(err.message || 'Failed to update profile photo');
    }
  }

  private async compressImage(dataUrl: string, maxWidth = 200, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate new dimensions
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  /**
   * Sign in with Twitter/X OAuth
   */
  public async signInWithTwitter(): Promise<void> {
    try {
      console.log('[Auth] Initiating Twitter OAuth sign in...');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'x' as any,
        options: {
          redirectTo: window.location.origin,
          scopes: 'users.read'
        }
      });

      if (error) {
        console.error('[Auth] Twitter OAuth Error:', JSON.stringify(error, null, 2));
        throw new Error(`Twitter OAuth Error: ${error.message}`);
      }

      console.log('[Auth] Twitter OAuth initiated successfully');
    } catch (err: any) {
      const errorMsg = err?.message || JSON.stringify(err, null, 2);
      console.error('[Auth] Twitter OAuth Failure:', errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Handle Twitter OAuth callback and create user profile
   */
  public async handleTwitterAuthCallback(): Promise<UserAccount> {
    try {
      console.log('[Auth] Processing Twitter OAuth callback...');
      
      // Get current session after OAuth redirect
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session?.user) {
        throw new Error('Twitter authentication failed');
      }

      const userId = session.user.id;
      const twitterUsername = session.user.user_metadata?.user_name || 'twitter_user';
      
      console.log(`[Auth] Twitter user authenticated: ${userId}, username: ${twitterUsername}`);

      // Check if profile already exists
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error('Profile check failed');
      }

      // Create profile if it doesn't exist
      if (!profile) {
        console.log('[Auth] Creating new profile for Twitter user...');
        const walletData = await walletService.createAndStoreUserWallet(userId, twitterUsername);
        
        profile = {
          id: userId,
          username: twitterUsername,
          internal_pubkey: walletData.publicKey,
          account_balance: walletData.balance || 0,
          photo_url: session.user.user_metadata?.avatar_url
        };
      } else if (profile.internal_pubkey === 'PENDING') {
        // Heal pending profile
        console.log('[Auth] Healing pending profile for Twitter user...');
        const walletData = await walletService.createAndStoreUserWallet(userId, profile.username);
        profile.internal_pubkey = walletData.publicKey;
        profile.account_balance = walletData.balance || 0;
      }

      const user: UserAccount = {
        id: userId,
        username: profile.username,
        seedphrase: 'RECOVERABLE_IN_SETTINGS',
        solAddress: profile.internal_pubkey,
        balance: profile.account_balance || 0,
        photoUrl: profile.photo_url
      };

      this.currentUser = user;
      console.log(`[Auth] Twitter user processed: ${user.username}`);
      return user;
    } catch (err: any) {
      const errorMsg = err?.message || JSON.stringify(err, null, 2);
      console.error('[Auth] Twitter callback processing failed:', errorMsg);
      throw new Error(errorMsg);
    }
  }

  public async logout(): Promise<void> {
    try {
      console.log('[Auth] Initiating logout sequence...');
      await supabase.auth.signOut();
      this.currentUser = null;
      console.log('[Auth] Logout complete');
    } catch (err) {
      console.error('[Auth] Logout failed:', err);
      throw err;
    }
  }
}

export const authService = new AuthService();
