import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { supabaseAdmin } from './SupabaseClient';

// Strictly using Devnet for development
const SOLANA_RPC = 'https://api.devnet.solana.com';
const SCAN_INTERVAL = 15000; 

/**
 * DepositScanner - Authoritative biological monitoring service.
 * SECURITY: Restricted to Node.js backend environments via service_role usage.
 */
export class DepositScanner {
  private connection: Connection;
  private isScanning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private onStatusChange: ((connected: boolean, message: string) => void) | null = null;

  constructor() {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
  }

  public setStatusCallback(cb: (connected: boolean, message: string) => void) {
    this.onStatusChange = cb;
  }

  public async start() {
    const isBrowser = typeof window !== 'undefined';
    const hasServiceKey = typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (isBrowser) {
      console.error('[Scanner] FATAL: Scanner attempted to start in browser bundle. Execution halted.');
      return;
    }

    if (!hasServiceKey) {
      console.error('[Scanner] FATAL: Service Role Key missing. Scanner cannot operate authoritatively.');
      return;
    }

    if (this.intervalId) return;
    
    await this.testConnection();

    this.intervalId = setInterval(() => this.scan(), SCAN_INTERVAL);
    this.scan();
  }

  private async testConnection() {
    try {
      // Use admin client for privileged registry access
      const { error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .limit(1);

      if (error) {
        console.error('[Scanner] Registry Link Error:', JSON.stringify(error, null, 2));
        this.onStatusChange?.(false, `Registry Error: ${error.message}`);
      } else {
        const msg = "Authoritative Devnet Link Established";
        console.log(`[Scanner] ${msg}`);
        this.onStatusChange?.(true, msg);
      }
    } catch (err: any) {
      console.error('[Scanner] Registry Link Exception:', JSON.stringify(err, null, 2));
      this.onStatusChange?.(false, "API Unreachable");
    }
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async scan() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, internal_pubkey');

      if (error) {
        console.error('[Scanner] Scan Iteration Error:', JSON.stringify(error, null, 2));
        return;
      }
      
      if (!profiles) return;

      for (const profile of profiles) {
        if (profile.internal_pubkey && profile.internal_pubkey !== 'PENDING') {
          await this.checkWallet(profile.internal_pubkey, profile.id);
        }
      }
    } catch (err: any) {
      console.error('[Scanner] General Scan Exception:', JSON.stringify(err, null, 2));
    } finally {
      this.isScanning = false;
    }
  }

  private async checkWallet(walletAddress: string, userId: string) {
    try {
      const pubkey = new PublicKey(walletAddress);
      const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit: 3 });
      
      for (const sigInfo of signatures) {
        if (sigInfo.confirmationStatus === 'processed') continue;

        const { data: existing, error: fetchError } = await supabaseAdmin
          .from('processed_deposits')
          .select('signature')
          .eq('signature', sigInfo.signature)
          .maybeSingle();

        if (fetchError) {
            console.error('[Scanner] Payout Collision Check Error:', JSON.stringify(fetchError, null, 2));
            continue;
        }
        if (existing) continue;

        const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
        });

        if (!tx || !tx.meta) continue;

        const accountIndex = tx.transaction.message.accountKeys.findIndex(ak => ak.pubkey.toBase58() === walletAddress);
        
        if (accountIndex !== -1) {
            const pre = tx.meta.preBalances[accountIndex];
            const post = tx.meta.postBalances[accountIndex];
            const amountReceived = (post - pre) / LAMPORTS_PER_SOL;

            if (amountReceived > 0) {
                console.log(`[Scanner] Devnet Deposit Detected: ${amountReceived} SOL for user ${userId}`);
                await this.processAtomicDeposit(userId, sigInfo.signature, amountReceived);
            }
        }
      }
    } catch (err: any) {
      console.warn(`[Scanner] Devnet wallet scan failed for ${walletAddress}:`, JSON.stringify(err, null, 2));
    }
  }

  private async processAtomicDeposit(userId: string, signature: string, amount: number) {
    try {
      const { error } = await supabaseAdmin.rpc('process_deposit', {
        p_user_id: userId,
        p_signature: signature,
        p_amount: amount
      });

      if (error) {
        if (error.code !== '23505') {
            console.error('[Scanner] RPC process_deposit Error:', JSON.stringify(error, null, 2));
        }
      } else {
        console.log(`[Scanner] Devnet Deposit finalized: ${signature}`);
      }
    } catch (err: any) {
      console.error('[Scanner] RPC Exception:', JSON.stringify(err, null, 2));
    }
  }
}

export const depositScanner = new DepositScanner();
