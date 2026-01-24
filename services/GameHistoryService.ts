import { supabase } from './SupabaseClient';
import { GameHistoryEntry, GameResult, UserStatistics, PnLStats } from '../types';

/**
 * Service for managing game history and statistics
 * Handles recording game results and retrieving player statistics
 */
export class GameHistoryService {
  /**
   * Record a game result
   */
  async recordGameResult(
    userId: string,
    gameId: string,
    finalLength: number,
    finalScore: number, 
    stakeAmount: number,
    result: GameResult,
    killedBy?: string,
    survivedSeconds: number = 0,
    solWon: number = 0,
    solLost: number = 0
  ): Promise<boolean> {
    try {
      console.log(`[GameHistoryService] Recording game result for user ${userId}`);
      
      // Start a transaction to record game history and update statistics
      const { error: gameHistoryError } = await supabase
        .from('game_history')
        .insert({
          user_id: userId,
          game_id: gameId,
          final_length: finalLength,
          final_score: finalScore,
          stake_amount: stakeAmount,
          result,
          killed_by: killedBy,
          survived_seconds: survivedSeconds,
          sol_won: solWon,
          sol_lost: solLost
        });
      
      if (gameHistoryError) {
        console.error('[GameHistoryService] Error recording game history:', gameHistoryError);
        return false;
      }
      
      // Update user statistics
      await this.updateUserStatistics(userId, {
        gameResult: result,
        finalScore,
        finalLength,
        survivedSeconds,
        solWon,
        solLost
      });
      
      console.log(`[GameHistoryService] Game result recorded successfully`);
      return true;
    } catch (err) {
      console.error('[GameHistoryService] Unexpected error recording game result:', err);
      return false;
    }
  }

  /**
   * Update user statistics after a game
   */
  private async updateUserStatistics(
    userId: string, 
    stats: {
      gameResult: GameResult;
      finalScore: number;
      finalLength: number;
      survivedSeconds: number;
      solWon: number;
      solLost: number;
    }
  ): Promise<void> {
    try {
      // Check if user statistics record exists
      const { data, error: fetchError } = await supabase
        .from('user_statistics')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') {  // PGRST116 is "no rows returned"
        console.error('[GameHistoryService] Error fetching user statistics:', fetchError);
        return;
      }
      
      const isWin = stats.gameResult === 'cashout';
      
      if (!data) {
        // Create new statistics record if it doesn't exist
        const { error: insertError } = await supabase
          .from('user_statistics')
          .insert({
            user_id: userId,
            total_games_played: 1,
            total_wins: isWin ? 1 : 0,
            total_losses: !isWin ? 1 : 0,
            total_sol_won: stats.solWon,
            total_sol_lost: stats.solLost,
            best_score: stats.finalScore,
            best_length: stats.finalLength,
            longest_survival_seconds: stats.survivedSeconds
          });
          
        if (insertError) {
          console.error('[GameHistoryService] Error creating user statistics:', insertError);
        }
      } else {
        // Update existing statistics
        const updates = {
          total_games_played: data.total_games_played + 1,
          total_wins: data.total_wins + (isWin ? 1 : 0),
          total_losses: data.total_losses + (!isWin ? 1 : 0),
          total_sol_won: data.total_sol_won + stats.solWon,
          total_sol_lost: data.total_sol_lost + stats.solLost,
          best_score: Math.max(data.best_score, stats.finalScore),
          best_length: Math.max(data.best_length, stats.finalLength),
          longest_survival_seconds: Math.max(data.longest_survival_seconds, stats.survivedSeconds),
          updated_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabase
          .from('user_statistics')
          .update(updates)
          .eq('user_id', userId);
          
        if (updateError) {
          console.error('[GameHistoryService] Error updating user statistics:', updateError);
        }
      }
    } catch (err) {
      console.error('[GameHistoryService] Unexpected error updating user statistics:', err);
    }
  }

  /**
   * Get game history for a user
   */
  async getGameHistory(userId: string, limit = 20): Promise<GameHistoryEntry[]> {
    try {
      console.log(`[GameHistoryService] Fetching game history for user ${userId}`);
      
      const { data, error } = await supabase
        .from('game_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('[GameHistoryService] Error fetching game history:', error);
        return [];
      }
      
      // Transform the database results to our GameHistoryEntry interface format
      const gameHistory: GameHistoryEntry[] = data.map(item => ({
        id: item.id,
        userId: item.user_id,
        gameId: item.game_id,
        finalLength: item.final_length,
        finalScore: item.final_score,
        stakeAmount: item.stake_amount,
        result: item.result as GameResult,
        killedBy: item.killed_by,
        survivedSeconds: item.survived_seconds,
        solWon: item.sol_won,
        solLost: item.sol_lost,
        createdAt: item.created_at
      }));
      
      console.log(`[GameHistoryService] Retrieved ${gameHistory.length} game records`);
      return gameHistory;
    } catch (err) {
      console.error('[GameHistoryService] Unexpected error fetching game history:', err);
      return [];
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(userId: string): Promise<UserStatistics | null> {
    try {
      console.log(`[GameHistoryService] Fetching statistics for user ${userId}`);
      
      const { data, error } = await supabase
        .from('user_statistics')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No statistics found for user
          console.log(`[GameHistoryService] No statistics found for user ${userId}`);
          return null;
        }
        
        console.error('[GameHistoryService] Error fetching user statistics:', error);
        return null;
      }
      
      // Transform the database result to our UserStatistics interface format
      const userStats: UserStatistics = {
        userId: data.user_id,
        totalGamesPlayed: data.total_games_played,
        totalWins: data.total_wins,
        totalLosses: data.total_losses,
        totalSolWon: data.total_sol_won,
        totalSolLost: data.total_sol_lost,
        bestScore: data.best_score,
        bestLength: data.best_length,
        longestSurvivalSeconds: data.longest_survival_seconds,
        updatedAt: data.updated_at
      };
      
      console.log(`[GameHistoryService] Retrieved statistics for user ${userId}`);
      return userStats;
    } catch (err) {
      console.error('[GameHistoryService] Unexpected error fetching user statistics:', err);
      return null;
    }
  }

  /**
   * Get PnL statistics for a specific time period
   */
  async getPnLStats(userId: string, periodHours: number): Promise<PnLStats | null> {
    try {
      console.log(`[GameHistoryService] Fetching ${periodHours}h PnL for user ${userId}`);
      
      // Calculate the start date based on the period hours
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (periodHours * 60 * 60 * 1000));
      
      // Format dates for query
      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();
      
      // Query games within the time period
      const { data, error } = await supabase
        .from('game_history')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr);
      
      if (error) {
        console.error(`[GameHistoryService] Error fetching ${periodHours}h PnL:`, error);
        return null;
      }
      
      if (!data || data.length === 0) {
        console.log(`[GameHistoryService] No games found for ${periodHours}h period`);
        return {
          userId,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          solWon: 0,
          solLost: 0,
          entryFees: 0,
          netProfit: 0,
          pnlPercentage: 0,
          periodStart: startDateStr,
          periodEnd: endDateStr
        };
      }
      
      // Calculate PnL stats from the game data
      const games = data.map(item => ({
        result: item.result as GameResult,
        solWon: item.sol_won || 0,
        solLost: item.sol_lost || 0,
        stakeAmount: item.stake_amount || 0
      }));
      
      const wins = games.filter(g => g.result === 'cashout').length;
      const totalGames = games.length;
      const solWon = games.reduce((sum, game) => sum + game.solWon, 0);
      const solLost = games.reduce((sum, game) => sum + game.solLost, 0);
      const entryFees = games.reduce((sum, game) => sum + game.stakeAmount, 0);
      const netProfit = solWon - solLost;
      
      // Calculate PnL percentage: (profit / entry fees) * 100
      const pnlPercentage = entryFees > 0 ? (netProfit / entryFees) * 100 : 0;
      
      const pnl: PnLStats = {
        userId,
        gamesPlayed: totalGames,
        wins,
        losses: totalGames - wins,
        solWon,
        solLost,
        entryFees,
        netProfit,
        pnlPercentage,
        periodStart: startDateStr,
        periodEnd: endDateStr
      };
      
      console.log(`[GameHistoryService] Retrieved ${periodHours}h PnL stats for user ${userId}`);
      return pnl;
    } catch (err) {
      console.error(`[GameHistoryService] Error getting ${periodHours}h PnL:`, err);
      return null;
    }
  }

  /**
   * Get daily PnL (24 hours)
   */
  async getDailyPnL(userId: string): Promise<PnLStats | null> {
    return this.getPnLStats(userId, 24);
  }

  /**
   * Get weekly PnL (168 hours)
   */
  async getWeeklyPnL(userId: string): Promise<PnLStats | null> {
    return this.getPnLStats(userId, 168);
  }

  /**
   * Get monthly PnL (837 hours, ~35 days)
   */
  async getMonthlyPnL(userId: string): Promise<PnLStats | null> {
    return this.getPnLStats(userId, 837);
  }
}

export const gameHistoryService = new GameHistoryService();
