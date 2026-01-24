
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { walletService } from './WalletService';
import { transactionHistoryService } from './TransactionHistoryService';

const SOLANA_RPC = 'https://api.devnet.solana.com';
const PLATFORM_FEE_PERCENT = 0.03;
const TREASURY_PUBLIC_KEY = process.env.VITE_TREASURY_WALLET_ADDRESS || 'GoWZjAXZ7kDyc5PjoCarCoE8VTtnBjWgUZa4TUBZGcjQ';

export class SolanaService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
  }

  public async estimateWithdrawalFees(amount: number): Promise<{
    userReceives: number;
    platformFee: number;
    gasFee: number;
    totalDeducted: number;
  }> {
    try {
      const estimatedGas = 0.00001;
      const platformFee = amount * PLATFORM_FEE_PERCENT;
      const userReceives = amount - platformFee - estimatedGas;
      const totalDeducted = amount;

      return {
        userReceives: Math.max(0, userReceives),
        platformFee,
        gasFee: estimatedGas,
        totalDeducted
      };
    } catch (error) {
      console.error('[Solana] Fee estimation error:', error);
      const estimatedGas = 0.00001;
      const platformFee = amount * PLATFORM_FEE_PERCENT;
      return {
        userReceives: Math.max(0, amount - platformFee - estimatedGas),
        platformFee,
        gasFee: estimatedGas,
        totalDeducted: amount
      };
    }
  }

  public async getRealBalance(publicKey: string): Promise<number> {
    try {
      const pubkey = new PublicKey(publicKey);
      const balance = await this.connection.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('[Solana] Balance fetch error:', error);
      return 0;
    }
  }

  public async processWithdrawal(
    userId: string, 
    destAddress: string, 
    amount: number
  ): Promise<{
    success: boolean;
    signature?: string;
    userReceived?: number;
    platformFee?: number;
    gasFee?: number;
    error?: string;
  }> {
    try {
      console.log(`[Solana] Processing withdrawal: ${amount} SOL for user ${userId}`);

      const fees = await this.estimateWithdrawalFees(amount);
      
      if (fees.userReceives <= 0) {
        throw new Error('Amount too small to cover fees');
      }

      const walletData = await walletService.fetchAndDecryptWallet(userId);
      const secretKeyUint8 = bs58.decode(walletData.privateKeyBase58);
      const userKeypair = Keypair.fromSecretKey(secretKeyUint8);

      const destPubkey = new PublicKey(destAddress);
      const treasuryPubkey = new PublicKey(TREASURY_PUBLIC_KEY);

      const transaction = new Transaction();

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: destPubkey,
          lamports: Math.floor(fees.userReceives * LAMPORTS_PER_SOL)
        })
      );

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: treasuryPubkey,
          lamports: Math.floor(fees.platformFee * LAMPORTS_PER_SOL)
        })
      );

      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userKeypair.publicKey;

      transaction.sign(userKeypair);

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log(`[Solana] Withdrawal successful: ${signature}`);
      console.log(`[Solana] User received: ${fees.userReceives} SOL`);
      console.log(`[Solana] Platform fee: ${fees.platformFee} SOL`);
      console.log(`[Solana] Gas fee: ${fees.gasFee} SOL`);

      // Fetch current balance to record the transaction with before/after amounts
      const currentBalance = await this.getRealBalance(userKeypair.publicKey.toString());
      
      // Record the withdrawal transaction
      await transactionHistoryService.recordTransaction(
        userId,
        'withdrawal',
        amount, // Total amount withdrawn including fees
        currentBalance + amount, // Balance before withdrawal
        currentBalance, // Balance after withdrawal
        signature,
        `Withdrawal to ${destAddress.substring(0, 8)}...`
      );

      return {
        success: true,
        signature,
        userReceived: fees.userReceives,
        platformFee: fees.platformFee,
        gasFee: fees.gasFee
      };
    } catch (error: any) {
      console.error('[Solana] Withdrawal Error:', error);
      return { 
        success: false, 
        error: error?.message || 'Transaction failed' 
      };
    }
  }
}

export const solanaService = new SolanaService();
