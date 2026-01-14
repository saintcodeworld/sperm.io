import React, { useState, useEffect } from 'react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { walletTransactionService } from '../services/WalletTransactionService';

interface WalletIntegrationProps {
  onWalletConnected: (publicKey: string) => void;
  onTransactionSigned: (signedTransaction: Transaction) => void;
}

export const WalletIntegration: React.FC<WalletIntegrationProps> = ({ 
  onWalletConnected,
  onTransactionSigned
}) => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<Transaction | null>(null);

  // Check for wallet on component mount
  useEffect(() => {
    checkForWallet();
  }, []);

  // Function to check if a Solana wallet is installed
  const checkForWallet = () => {
    // Check if Phantom or other Solana wallets are available
    const solanaWallet = (window as any)?.solana || (window as any)?.phantom?.solana;
    
    if (solanaWallet) {
      console.log('[Wallet] Solana wallet extension found');
      return true;
    } else {
      console.log('[Wallet] No Solana wallet extension found');
      return false;
    }
  };

  // Connect to wallet
  const connectWallet = async () => {
    try {
      const solanaWallet = (window as any)?.solana || (window as any)?.phantom?.solana;
      
      if (!solanaWallet) {
        alert('Please install a Solana wallet like Phantom or Solflare first!');
        return;
      }

      // Request wallet connection
      const response = await solanaWallet.connect();
      const walletAddress = response.publicKey.toString();
      
      setWalletConnected(true);
      setWalletPublicKey(walletAddress);
      onWalletConnected(walletAddress);
      
      console.log('[Wallet] Connected to wallet:', walletAddress);
    } catch (error) {
      console.error('[Wallet] Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    }
  };

  // Sign a transaction with the connected wallet
  const signTransaction = async (transaction: Transaction) => {
    try {
      const solanaWallet = (window as any)?.solana || (window as any)?.phantom?.solana;
      
      if (!solanaWallet || !walletConnected) {
        alert('Please connect your wallet first!');
        return;
      }

      setPendingTransaction(transaction);

      // Send transaction to wallet for signing
      const signedTransaction = await solanaWallet.signTransaction(transaction);
      
      console.log('[Wallet] Transaction signed successfully');
      setPendingTransaction(null);
      
      // Notify parent component about the signed transaction
      onTransactionSigned(signedTransaction);
      
      return signedTransaction;
    } catch (error) {
      console.error('[Wallet] Transaction signing failed:', error);
      setPendingTransaction(null);
      alert('Failed to sign transaction. Please try again.');
      throw error;
    }
  };

  return (
    <div className="wallet-integration">
      {!walletConnected ? (
        <button 
          onClick={connectWallet}
          className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all"
        >
          Connect Wallet
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-sm text-gray-200 font-mono">
            {walletPublicKey?.substring(0, 4)}...{walletPublicKey?.substring(walletPublicKey.length - 4)}
          </span>
        </div>
      )}

      {pendingTransaction && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-blue-500/30 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Sign Transaction</h3>
            <p className="text-gray-300 mb-6">
              Please confirm this transaction in your wallet extension.
            </p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
