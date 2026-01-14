import { Connection, PublicKey, Transaction, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { supabase } from './SupabaseClient';
import { authService } from './AuthService';
import { walletService } from './WalletService';
import { solanaService } from './SolanaService';

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
      if (entryFee <= 0) throw new Error('Entry fee must be greater than zero');
      
      const playerPubkey = new PublicKey(playerAddress);
      const gameWallet = await this.getGameWallet();
      const treasuryWallet = await this.getTreasuryWallet();

      // Calculate fees
      const platformFee = entryFee * PLATFORM_ENTRY_FEE_PERCENT;
      const totalCost = entryFee + platformFee + ESTIMATED_GAS;
      
      console.log(`[GameTx] Fee breakdown - Entry: ${entryFee} SOL, Platform: ${platformFee} SOL, Gas: ${ESTIMATED_GAS} SOL`);

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
    try {
      console.log(`[GameTx] Processing cashout: ${amount} SOL to ${playerAddress}`);
      
      // Validate inputs
      if (!playerAddress) throw new Error('Player address is required');
      if (!playerId) throw new Error('Player ID is required');
      if (amount <= 0) throw new Error('Cashout amount must be greater than zero');
      
      const playerPubkey = new PublicKey(playerAddress);
      
      // Get game wallet with proper error handling
      let gameWallet;
      try {
        gameWallet = await this.getGameWallet();
        console.log('[GameTx] Game wallet public key:', gameWallet.publicKey.toString());
      } catch (walletError) {
        console.error('[GameTx] Failed to get game wallet:', walletError);
        throw new Error(`Game wallet error: ${walletError.message}`);
      }
      
      const treasuryWallet = await this.getTreasuryWallet();

      // Calculate fees
      const platformFee = amount * PLATFORM_CASHOUT_FEE_PERCENT;
      const playerReceives = amount - platformFee - ESTIMATED_GAS;
      
      if (playerReceives <= 0) {
        throw new Error('Cashout amount too small after fees');
      }
      
      console.log(`[GameTx] Cashout breakdown - Total: ${amount} SOL, Player receives: ${playerReceives} SOL, Platform fee: ${platformFee} SOL`);

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
      const { blockhash } = await this.connection.getLatestBlockhash('processed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = gameWallet.publicKey;

      try {
        // Sign with game wallet (using proper method with complete keypair)
        console.log('[GameTx] Signing transaction with game wallet:', gameWallet.publicKey.toString());
        transaction.sign(gameWallet); // Using full sign instead of partialSign for complete keypair
        console.log('[GameTx] Transaction signed successfully');
      } catch (signError) {
        console.error('[GameTx] Signature error:', signError);
        throw new Error(`Failed to sign transaction: ${signError.message}`);
      }

      // Send transaction with proper error handling
      let signature;
      try {
        console.log('[GameTx] Sending transaction to network...');
        signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false, preflightCommitment: 'processed' }
        );
        console.log(`[GameTx] Transaction sent successfully: ${signature}`);
      } catch (sendError) {
        console.error('[GameTx] Transaction send error:', sendError);
        throw new Error(`Failed to send transaction: ${sendError.message}`);
      }

      // Wait for transaction confirmation
      await this.connection.confirmTransaction(signature, 'processed');
      console.log(`[GameTx] Cashout transaction confirmed: ${signature}`);

      // Update transaction history in background
      try {
        await supabase.from('transactions').insert({
          user_id: playerId,
          type: 'cashout',
          amount: playerReceives,
          transaction_hash: signature,
          description: `Cashout: ${playerReceives.toFixed(4)} SOL`,
          status: 'confirmed'
        });
        console.log('[GameTx] Transaction recorded in history');
      } catch (dbError) {
        console.error('[GameTx] Failed to record transaction in database:', dbError);
      }

      return { success: true, signature };
    } catch (error) {
      console.error('[GameTx] Cashout processing failed:', error);
      return { success: false, error: error.message };
    }
  }
}

export const gameTransactionService = new GameTransactionService();
