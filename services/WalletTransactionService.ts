import { Transaction, Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

class WalletTransactionService {
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection('https://api.devnet.solana.com', 'processed');
  }
  
  /**
   * Prepares a transaction for signing by a wallet
   */
  public prepareForSignature(transactionBase64: string): Transaction {
    // Deserialize the transaction
    const transactionBytes = bs58.decode(transactionBase64);
    const transaction = Transaction.from(transactionBytes);
    return transaction;
  }
  
  /**
   * Sign transaction with a wallet. This would integrate with a wallet like Phantom or Solflare
   * in a real frontend implementation.
   */
  public async signWithWallet(transaction: Transaction, walletPublicKey: PublicKey): Promise<Transaction> {
    try {
      // In a real implementation, this would call wallet.signTransaction()
      // For now, we just return the transaction with a note that it needs external signing
      console.log('[WalletTx] Transaction needs to be signed by wallet:', walletPublicKey.toString());
      
      // Since we can't actually sign here (would be done by the wallet extension),
      // we're returning the transaction as-is
      return transaction;
    } catch (error) {
      console.error('[WalletTx] Failed to sign transaction:', error);
      throw new Error('Transaction signing failed');
    }
  }
  
  /**
   * Submit a signed transaction to the Solana network
   */
  public async submitSignedTransaction(signedTransaction: Transaction): Promise<string> {
    try {
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'processed' }
      );
      
      console.log(`[WalletTx] Transaction submitted with signature: ${signature}`);
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'processed');
      console.log(`[WalletTx] Transaction confirmed: ${signature}`);
      
      return signature;
    } catch (error) {
      console.error('[WalletTx] Transaction submission failed:', error);
      throw error;
    }
  }
}

export const walletTransactionService = new WalletTransactionService();
