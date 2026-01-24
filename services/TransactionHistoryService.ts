import { supabase } from './SupabaseClient';
import { Transaction, TransactionType } from '../types';

/**
 * Service for managing transaction history
 * Handles recording and retrieving user transactions
 */
export class TransactionHistoryService {
  /**
   * Record a new transaction in the database
   */
  async recordTransaction(
    userId: string,
    type: TransactionType,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    transactionHash?: string,
    description?: string
  ): Promise<boolean> {
    try {
      console.log(`[TransactionHistoryService] Recording ${type} transaction for user ${userId}`);
      
      const { error } = await supabase
        .from('transaction_history')
        .insert({
          user_id: userId,
          type,
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          transaction_hash: transactionHash,
          description
        });
      
      if (error) {
        console.error('[TransactionHistoryService] Error recording transaction:', error);
        return false;
      }
      
      console.log(`[TransactionHistoryService] Transaction recorded successfully`);
      return true;
    } catch (err) {
      console.error('[TransactionHistoryService] Unexpected error recording transaction:', err);
      return false;
    }
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(userId: string, limit = 20): Promise<Transaction[]> {
    try {
      console.log(`[TransactionHistoryService] Fetching transactions for user ${userId}`);
      
      const { data, error } = await supabase
        .from('transaction_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('[TransactionHistoryService] Error fetching transactions:', error);
        return [];
      }
      
      // Transform the database results to our Transaction interface format
      const transactions: Transaction[] = data.map(item => ({
        id: item.id,
        userId: item.user_id,
        type: item.type as TransactionType,
        amount: item.amount,
        balanceBefore: item.balance_before,
        balanceAfter: item.balance_after,
        transactionHash: item.transaction_hash,
        description: item.description,
        createdAt: item.created_at
      }));
      
      console.log(`[TransactionHistoryService] Retrieved ${transactions.length} transactions`);
      return transactions;
    } catch (err) {
      console.error('[TransactionHistoryService] Unexpected error fetching transactions:', err);
      return [];
    }
  }

  /**
   * Get transaction summary for a user (total deposits, withdrawals, etc.)
   */
  async getTransactionSummary(userId: string): Promise<{
    totalDeposits: number;
    totalWithdrawals: number;
    totalGameWinnings: number;
    totalGameLosses: number;
  }> {
    try {
      console.log(`[TransactionHistoryService] Fetching transaction summary for user ${userId}`);
      
      // Fetch all transactions for this user
      const { data, error } = await supabase
        .from('transaction_history')
        .select('type, amount')
        .eq('user_id', userId);
      
      if (error) {
        console.error('[TransactionHistoryService] Error fetching transaction summary:', error);
        return { 
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalGameWinnings: 0,
          totalGameLosses: 0
        };
      }
      
      // Calculate totals
      const summary = data.reduce((acc, transaction) => {
        const amount = Number(transaction.amount);
        
        switch (transaction.type) {
          case 'deposit':
            acc.totalDeposits += amount;
            break;
          case 'withdrawal':
            acc.totalWithdrawals += amount;
            break;
          case 'game_win':
            acc.totalGameWinnings += amount;
            break;
          case 'game_loss':
            acc.totalGameLosses += amount;
            break;
          // Stake is not counted in any total as it's temporary
        }
        
        return acc;
      }, { 
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalGameWinnings: 0,
        totalGameLosses: 0
      });
      
      console.log(`[TransactionHistoryService] Transaction summary calculated`);
      return summary;
    } catch (err) {
      console.error('[TransactionHistoryService] Unexpected error fetching transaction summary:', err);
      return { 
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalGameWinnings: 0,
        totalGameLosses: 0
      };
    }
  }
}

export const transactionHistoryService = new TransactionHistoryService();
