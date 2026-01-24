import { Connection, PublicKey, Transaction, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { supabase } from './SupabaseClient';
import { authService } from './AuthService';
import { walletService } from './WalletService';
import { solanaService } from './SolanaService';
import { transactionHistoryService } from './TransactionHistoryService';

const PLATFORM_ENTRY_FEE_PERCENT = 0.03; // 3% for entry
const PLATFORM_CASHOUT_FEE_PERCENT = 0.01; // 1% for cashout
const ESTIMATED_GAS = 0.00001; // SOL

class GameTransactionService {
  private connection: Connection;

  constructor() {
    // Initialize connection with commitment level 'processed' for faster confirmations
    this.connection = new Connection('https://api.devnet.solana.com', 'processed');
  }

  private async getGameWallet() {
    // For development purposes, using hardcoded private key (normal format)
    // In production, would retrieve from secure storage and properly decrypt
    const privateKeyStr = '66hooHM6JXSH7tqhniLR6iR4LKyjMcGqyFJZghP2asne42K2s3xmwAa4Anem3UxBmSCSFHDkwJgeW6L8RQ19vA9p';
    
    try {
      // Create a proper Solana keypair from the private key
      // Convert to a Uint8Array with 64 bytes (32 bytes secret key + 32 bytes public key)
      const secretKey = bs58.decode(privateKeyStr);
      
      // Verify we have a valid keypair format
      if (secretKey.length !== 64 && secretKey.length !== 32) {
        console.error(`[GameTx] Invalid key length: ${secretKey.length} bytes`);
        throw new Error('Invalid private key format');
      }
      
      // Create a proper Keypair for signing
      const keypair = Keypair.fromSecretKey(secretKey);
      
      // Test that the keypair was created correctly
      console.log('[GameTx] Game wallet retrieved successfully:', keypair.publicKey.toString());
      
      // Return the keypair object directly - this is properly formatted for signing
      return keypair;
    } catch (error) {
      console.error('[GameTx] Error creating wallet:', error);
      throw new Error(`Failed to create wallet keypair: ${error.message}`);
    }
  }

  private async getTreasuryWallet() {
    // Hardcoded treasury wallet address
    const treasuryAddress = 'GoWZjAXZ7kDyc5PjoCarCoE8VTtnBjWgUZa4TUBZGcjQ';
    return new PublicKey(treasuryAddress);
  }

  async processEntryFee(
    playerAddress: string,
    entryFee: number
  ): Promise<{ success: boolean; error?: string; signature?: string }> {
    try {
      console.log(`[GameTx] Processing entry fee: ${entryFee} SOL from ${playerAddress}`);
      
      // Validate inputs
      if (!playerAddress) throw new Error('Player address is required');
      
      // Allow free games (0 entry fee) for testing - skip blockchain transaction
      if (entryFee <= 0) {
        console.log('[GameTx] Free game mode - skipping blockchain transaction');
        return { success: true, signature: 'FREE_GAME_NO_TX' };
      }
      
      const playerPubkey = new PublicKey(playerAddress);
      const gameWallet = await this.getGameWallet();
      const treasuryWallet = await this.getTreasuryWallet();

      // Calculate fees - player pays entry + 3% platform fee + gas
      const platformFee = entryFee * PLATFORM_ENTRY_FEE_PERCENT;
      const totalCost = entryFee + platformFee; // Gas is paid automatically by fee payer
      
      console.log(`[GameTx] Entry fee breakdown:`);
      console.log(`  - Entry fee: ${entryFee} SOL → Game Wallet`);
      console.log(`  - Platform fee (3%): ${platformFee.toFixed(6)} SOL → Treasury`);
      console.log(`  - Gas fee: paid by Player (as fee payer)`);
      console.log(`  - Total player pays: ${totalCost.toFixed(6)} SOL + gas`);

      // Get user's internal wallet for signing
      const userId = await authService.getUserId();
      if (!userId) {
        throw new Error('User ID not found');
      }

      const userWallet = await walletService.fetchAndDecryptWallet(userId);
      const userKeypair = Keypair.fromSecretKey(bs58.decode(userWallet.privateKeyBase58));

      // Create transaction
      const transaction = new Transaction();

      // Add entry fee transfer to game wallet
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: gameWallet.publicKey,
          lamports: Math.floor(entryFee * LAMPORTS_PER_SOL)
        })
      );

      // Add platform fee transfer to treasury
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: treasuryWallet,
          lamports: Math.floor(platformFee * LAMPORTS_PER_SOL)
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('processed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userKeypair.publicKey;

      // Sign with user's internal wallet
      transaction.sign(userKeypair);

      console.log('[GameTx] Submitting entry fee transaction to Solana devnet');
      
      // Send the signed transaction to the network
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'processed' }
      );
      
      console.log(`[GameTx] Entry fee transaction submitted with signature: ${signature}`);
      
      // Wait for transaction confirmation
      await this.connection.confirmTransaction(signature, 'processed');
      console.log(`[GameTx] Entry fee transaction confirmed: ${signature}`);
      
      // Record the transaction in transaction history
      try {
        // Fetch current balance to record the transaction with before/after amounts
        const userProfile = await supabase
          .from('profiles')
          .select('account_balance')
          .eq('id', userId)
          .single();
        
        const currentBalance = userProfile?.data?.account_balance || 0;
        const balanceBefore = currentBalance + entryFee + platformFee;
        
        await transactionHistoryService.recordTransaction(
          userId,
          'game_loss', // Using game_loss for entry fee
          entryFee + platformFee, 
          balanceBefore, // Balance before
          currentBalance, // Balance after
          signature,
          `Game entry: ${entryFee.toFixed(4)} SOL + ${platformFee.toFixed(4)} SOL fee`
        );
        console.log('[GameTx] Entry fee transaction recorded in history');
      } catch (dbError) {
        console.error('[GameTx] Failed to record entry fee in history service:', dbError);
      }
      
      return {
        success: true,
        signature
      };
    } catch (error) {
      console.error('[GameTx] Entry fee processing failed:', error);
      return { success: false, error: error.message };
    }
  }

  async processCashout(
    playerId: string,
    playerAddress: string,
    amount: number
  ): Promise<{ success: boolean; error?: string; signature?: string }> {
    console.log(`[GameTx] ========== CASHOUT START ==========`);
    console.log(`[GameTx] playerId: ${playerId}`);
    console.log(`[GameTx] playerAddress: ${playerAddress}`);
    console.log(`[GameTx] amount: ${amount}`);
    
    try {
      console.log(`[GameTx] STEP 1: Validating inputs...`);
      
      // Validate inputs
      if (!playerAddress) {
        console.error('[GameTx] VALIDATION FAILED: Player address is missing');
        throw new Error('Player address is required');
      }
      if (!playerId) {
        console.error('[GameTx] VALIDATION FAILED: Player ID is missing');
        throw new Error('Player ID is required');
      }
      
      console.log(`[GameTx] STEP 1 COMPLETE: Inputs validated`);
      
      // Allow 0 cashout for free games - skip blockchain transaction
      if (amount <= 0) {
        console.log('[GameTx] FREE GAME: Skipping blockchain, returning success immediately');
        return { success: true, signature: 'FREE_GAME_NO_TX' };
      }
      
      console.log(`[GameTx] STEP 2: Creating player public key...`);
      let playerPubkey;
      try {
        playerPubkey = new PublicKey(playerAddress);
        console.log(`[GameTx] STEP 2 COMPLETE: Player pubkey created: ${playerPubkey.toString()}`);
      } catch (pubkeyError) {
        console.error('[GameTx] STEP 2 FAILED: Invalid player address:', pubkeyError);
        throw new Error(`Invalid player address: ${pubkeyError.message}`);
      }
      
      // Get game wallet with proper error handling
      console.log(`[GameTx] STEP 3: Getting game wallet...`);
      let gameWallet;
      try {
        gameWallet = await this.getGameWallet();
        console.log(`[GameTx] STEP 3 COMPLETE: Game wallet: ${gameWallet.publicKey.toString()}`);
      } catch (walletError) {
        console.error('[GameTx] STEP 3 FAILED: Game wallet error:', walletError);
        throw new Error(`Game wallet error: ${walletError.message}`);
      }
      
      console.log(`[GameTx] STEP 4: Getting treasury wallet...`);
      const treasuryWallet = await this.getTreasuryWallet();
      console.log(`[GameTx] STEP 4 COMPLETE: Treasury wallet: ${treasuryWallet.toString()}`);

      // Calculate fees - player gets pot minus 1% platform fee
      // Gas is paid by game wallet (as feePayer), NOT deducted from player's winnings
      const platformFee = amount * PLATFORM_CASHOUT_FEE_PERCENT;
      const playerReceives = amount - platformFee; // Player gets full pot minus 1% fee
      
      if (playerReceives <= 0) {
        throw new Error('Cashout amount too small after fees');
      }
      
      console.log(`[GameTx] Cashout breakdown:`);
      console.log(`  - Total pot: ${amount} SOL`);
      console.log(`  - Platform fee (1%): ${platformFee.toFixed(6)} SOL → Treasury`);
      console.log(`  - Player receives: ${playerReceives.toFixed(6)} SOL`);
      console.log(`  - Gas fee: paid by Game Wallet (as fee payer)`);

      // Create transaction
      const transaction = new Transaction();

      // Transfer winnings to player
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: gameWallet.publicKey,
          toPubkey: playerPubkey,
          lamports: Math.floor(playerReceives * LAMPORTS_PER_SOL)
        })
      );

      // Transfer platform fee to treasury
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: gameWallet.publicKey,
          toPubkey: treasuryWallet,
          lamports: Math.floor(platformFee * LAMPORTS_PER_SOL)
        })
      );

      // Get recent blockhash
      console.log(`[GameTx] STEP 5: Getting recent blockhash...`);
      const { blockhash } = await this.connection.getLatestBlockhash('processed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = gameWallet.publicKey;
      console.log(`[GameTx] STEP 5 COMPLETE: Blockhash: ${blockhash.substring(0, 20)}...`);

      console.log(`[GameTx] STEP 6: Signing transaction...`);
      try {
        transaction.sign(gameWallet);
        console.log(`[GameTx] STEP 6 COMPLETE: Transaction signed`);
      } catch (signError) {
        console.error('[GameTx] STEP 6 FAILED: Signature error:', signError);
        throw new Error(`Failed to sign transaction: ${signError.message}`);
      }

      // Send transaction with proper error handling
      console.log(`[GameTx] STEP 7: Sending transaction to Solana network...`);
      let signature;
      try {
        signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false, preflightCommitment: 'processed' }
        );
        console.log(`[GameTx] STEP 7 COMPLETE: Transaction sent, signature: ${signature}`);
      } catch (sendError) {
        console.error('[GameTx] STEP 7 FAILED: Transaction send error:', sendError);
        throw new Error(`Failed to send transaction: ${sendError.message}`);
      }

      // Wait for transaction confirmation
      console.log(`[GameTx] STEP 8: Waiting for transaction confirmation...`);
      try {
        await this.connection.confirmTransaction(signature, 'processed');
        console.log(`[GameTx] STEP 8 COMPLETE: Transaction confirmed!`);
      } catch (confirmError) {
        console.error('[GameTx] STEP 8 FAILED: Confirmation error:', confirmError);
        // Don't throw here - tx might still be successful, just confirmation timed out
        console.log('[GameTx] WARNING: Confirmation timed out but tx may still be valid');
      }

      // Update transaction history - NOTE: This is optional and should not block cashout
      console.log(`[GameTx] STEP 9: Recording transaction in history (non-blocking)...`);
      console.log(`[GameTx] WARNING: playerId '${playerId}' may not be a valid UUID for DB lookup`);
      
      // Don't await this - let it run in background so it doesn't block the cashout
      this.recordCashoutInHistory(playerId, playerReceives, signature).catch(err => {
        console.error('[GameTx] Background history recording failed:', err);
      });
      
      console.log(`[GameTx] ========== CASHOUT SUCCESS ==========`);
      console.log(`[GameTx] Returning success with signature: ${signature}`);
      return { success: true, signature };
    } catch (error) {
      console.error(`[GameTx] ========== CASHOUT FAILED ==========`);
      console.error('[GameTx] Error:', error);
      console.error('[GameTx] Error message:', error.message);
      return { success: false, error: error.message };
    }
  }

  // DEBUG LOG: Separate method for recording history so it doesn't block cashout
  private async recordCashoutInHistory(playerId: string, playerReceives: number, signature: string) {
    try {
      console.log(`[GameTx] Recording cashout in history for ${playerId}...`);
      
      // Try to fetch user profile - this might fail if playerId is not a UUID
      const userProfile = await supabase
        .from('profiles')
        .select('account_balance')
        .eq('id', playerId)
        .single();
      
      if (userProfile.error) {
        console.log(`[GameTx] Could not fetch profile for ${playerId}: ${userProfile.error.message}`);
        console.log(`[GameTx] This is expected if playerId is a session ID, not a UUID`);
        return; // Don't record if we can't find the user
      }
      
      const currentBalance = userProfile?.data?.account_balance || 0;
      
      await transactionHistoryService.recordTransaction(
        playerId,
        'game_win',
        playerReceives, 
        currentBalance - playerReceives,
        currentBalance,
        signature,
        `Game winnings: ${playerReceives.toFixed(4)} SOL`
      );
      console.log('[GameTx] Transaction recorded in history successfully');
    } catch (dbError) {
      console.error('[GameTx] History recording error:', dbError);
      // Don't throw - this is non-critical
    }
  }
}

export const gameTransactionService = new GameTransactionService();
