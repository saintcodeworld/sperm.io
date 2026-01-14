import React, { useState, useEffect } from 'react';
import { Transaction, TransactionType } from '../types';
import { transactionHistoryService } from '../services/TransactionHistoryService';

interface TransactionHistoryProps {
  userId: string;
  maxItems?: number;
  className?: string;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ 
  userId, 
  maxItems = 10,
  className = ''
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalGameWinnings: 0,
    totalGameLosses: 0
  });

  useEffect(() => {
    loadTransactions();
  }, [userId]);

  const loadTransactions = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Load transactions
      const history = await transactionHistoryService.getTransactionHistory(userId, maxItems);
      setTransactions(history);
      
      // Load summary
      const transactionSummary = await transactionHistoryService.getTransactionSummary(userId);
      setSummary(transactionSummary);
    } catch (err: any) {
      console.error('[TransactionHistory] Error loading transactions:', err);
      setError('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const getTransactionTypeLabel = (type: TransactionType): string => {
    switch (type) {
      case 'deposit': return 'Deposit';
      case 'withdrawal': return 'Withdrawal';
      case 'game_win': return 'Game Win';
      case 'game_loss': return 'Game Loss';
      case 'stake': return 'Game Stake';
      default: return 'Transaction';
    }
  };
  
  const getTransactionColor = (type: TransactionType): string => {
    switch (type) {
      case 'deposit': return 'text-green-400';
      case 'game_win': return 'text-green-400';
      case 'withdrawal': return 'text-red-400';
      case 'game_loss': return 'text-red-400';
      case 'stake': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };

  return (
    <div className={`bg-white/5 rounded-2xl border border-white/10 ${className}`}>
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-black text-white uppercase tracking-widest">Transaction History</h3>
      </div>
      
      {/* Transaction Summary */}
      <div className="grid grid-cols-2 gap-2 p-4 border-b border-white/5 bg-black/20">
        <div className="space-y-1 p-2">
          <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Total Deposits</p>
          <p className="text-green-400 text-sm font-mono">+{summary.totalDeposits.toFixed(4)} SOL</p>
        </div>
        <div className="space-y-1 p-2">
          <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Total Withdrawals</p>
          <p className="text-red-400 text-sm font-mono">-{summary.totalWithdrawals.toFixed(4)} SOL</p>
        </div>
        <div className="space-y-1 p-2">
          <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Game Winnings</p>
          <p className="text-green-400 text-sm font-mono">+{summary.totalGameWinnings.toFixed(4)} SOL</p>
        </div>
        <div className="space-y-1 p-2">
          <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Game Losses</p>
          <p className="text-red-400 text-sm font-mono">-{summary.totalGameLosses.toFixed(4)} SOL</p>
        </div>
      </div>

      {/* Transaction List */}
      <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-white/20 border-r-2 border-white/20 border-b-2 border-white/20 border-l-2 border-blue-500"></div>
            <p className="mt-2 text-xs text-gray-500">Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-red-400 text-xs">{error}</p>
            <button 
              onClick={loadTransactions}
              className="mt-2 px-3 py-1 bg-white/10 text-white text-xs rounded-lg hover:bg-white/20 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-xs">No transactions found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {transactions.map(transaction => (
              <div key={transaction.id} className="p-4 hover:bg-white/5 transition-colors flex flex-col">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${getTransactionColor(transaction.type)}`}></div>
                      <span className="text-xs font-bold text-white">{getTransactionTypeLabel(transaction.type)}</span>
                    </div>
                    {transaction.description && (
                      <p className="text-[10px] text-gray-500">{transaction.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-bold ${getTransactionColor(transaction.type)}`}>
                      {transaction.type === 'deposit' || transaction.type === 'game_win' ? '+' : 
                       transaction.type === 'withdrawal' || transaction.type === 'game_loss' ? '-' : ''}
                      {transaction.amount.toFixed(4)} SOL
                    </p>
                    <p className="text-[8px] text-gray-600">{formatDate(transaction.createdAt)}</p>
                  </div>
                </div>
                {transaction.transactionHash && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                    <p className="text-[8px] text-gray-600 break-all flex-1">
                      TX: {transaction.transactionHash.substring(0, 20)}...
                    </p>
                    <button
                      onClick={() => window.open(`https://explorer.solana.com/tx/${transaction.transactionHash}?cluster=devnet`, '_blank')}
                      className="ml-2 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[8px] font-bold rounded transition-colors border border-blue-500/30"
                      title="View on Solana Explorer"
                    >
                      Explorer
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-white/10">
        <button
          onClick={loadTransactions}
          disabled={loading}
          className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh Transactions'}
        </button>
      </div>
    </div>
  );
};
