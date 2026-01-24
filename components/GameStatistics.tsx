import React, { useState, useEffect } from 'react';
import { GameHistoryEntry, UserStatistics, PnLStats } from '../types';
import { gameHistoryService } from '../services/GameHistoryService';

interface GameStatisticsProps {
  userId: string;
  maxItems?: number;
  className?: string;
}

export const GameStatistics: React.FC<GameStatisticsProps> = ({
  userId,
  maxItems = 10,
  className = ''
}) => {
  const [gameHistory, setGameHistory] = useState<GameHistoryEntry[]>([]);
  const [statistics, setStatistics] = useState<UserStatistics | null>(null);
  const [dailyPnL, setDailyPnL] = useState<PnLStats | null>(null);
  const [weeklyPnL, setWeeklyPnL] = useState<PnLStats | null>(null);
  const [monthlyPnL, setMonthlyPnL] = useState<PnLStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGameData();
  }, [userId]);

  const loadGameData = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Load game history
      const history = await gameHistoryService.getGameHistory(userId, maxItems);
      setGameHistory(history);
      
      // Load statistics
      const stats = await gameHistoryService.getUserStatistics(userId);
      setStatistics(stats);
      
      // Load PnL statistics for different time periods
      const daily = await gameHistoryService.getDailyPnL(userId);
      const weekly = await gameHistoryService.getWeeklyPnL(userId);
      const monthly = await gameHistoryService.getMonthlyPnL(userId);
      
      setDailyPnL(daily);
      setWeeklyPnL(weekly);
      setMonthlyPnL(monthly);
      
      console.log('[GameStatistics] PnL data loaded successfully');
    } catch (err: any) {
      console.error('[GameStatistics] Error loading game data:', err);
      setError('Failed to load game statistics');
    } finally {
      setLoading(false);
    }
  };

  const getResultColor = (result: string): string => {
    switch (result) {
      case 'cashout': return 'text-green-400';
      case 'killed': return 'text-red-400';
      case 'disconnected': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getResultLabel = (result: string): string => {
    switch (result) {
      case 'cashout': return 'Cash Out';
      case 'killed': return 'Killed';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`bg-white/5 rounded-2xl border border-white/10 ${className}`}>
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-black text-white uppercase tracking-widest">Gameplay Statistics</h3>
      </div>
      
      {/* PnL Statistics */}
      {!loading && !error && (
        <div className="p-4 border-b border-white/5">
          <h4 className="text-sm font-bold text-white mb-4">Profit & Loss Statement</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Daily PnL Card */}
            <div className="bg-black/30 rounded-xl p-4 border border-white/10">
              <h4 className="text-xs font-bold text-white mb-3">Daily PnL</h4>
              
              {dailyPnL ? (
                <div className="space-y-4">
                  {/* Net Profit */}
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Net Profit</p>
                    <p className={`text-2xl font-mono font-bold ${dailyPnL.netProfit > 0 ? 'text-green-400' : dailyPnL.netProfit < 0 ? 'text-red-400' : 'text-white'}`}>
                      {dailyPnL.netProfit > 0 ? '+' : ''}{dailyPnL.netProfit.toFixed(4)} SOL
                    </p>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 gap-4 text-center">
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Entry</p>
                      <p className="text-sm text-white">{dailyPnL.entryFees.toFixed(4)} SOL</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Profit</p>
                      <p className={`text-sm ${dailyPnL.netProfit > 0 ? 'text-green-400' : dailyPnL.netProfit < 0 ? 'text-red-400' : 'text-white'}`}>
                        {dailyPnL.netProfit > 0 ? '+' : ''}{dailyPnL.netProfit.toFixed(4)} SOL
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">PnL %</p>
                      <p className={`text-sm ${dailyPnL.pnlPercentage > 0 ? 'text-green-400' : dailyPnL.pnlPercentage < 0 ? 'text-red-400' : 'text-white'}`}>
                        {dailyPnL.pnlPercentage > 0 ? '+' : ''}{dailyPnL.pnlPercentage.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-xs">No data for this period</p>
                </div>
              )}
            </div>

            {/* Weekly PnL Card */}
            <div className="bg-black/30 rounded-xl p-4 border border-white/10">
              <h4 className="text-xs font-bold text-white mb-3">Weekly PnL</h4>
              
              {weeklyPnL ? (
                <div className="space-y-4">
                  {/* Net Profit */}
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Net Profit</p>
                    <p className={`text-2xl font-mono font-bold ${weeklyPnL.netProfit > 0 ? 'text-green-400' : weeklyPnL.netProfit < 0 ? 'text-red-400' : 'text-white'}`}>
                      {weeklyPnL.netProfit > 0 ? '+' : ''}{weeklyPnL.netProfit.toFixed(4)} SOL
                    </p>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 gap-4 text-center">
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Entry</p>
                      <p className="text-sm text-white">{weeklyPnL.entryFees.toFixed(4)} SOL</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Profit</p>
                      <p className={`text-sm ${weeklyPnL.netProfit > 0 ? 'text-green-400' : weeklyPnL.netProfit < 0 ? 'text-red-400' : 'text-white'}`}>
                        {weeklyPnL.netProfit > 0 ? '+' : ''}{weeklyPnL.netProfit.toFixed(4)} SOL
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">PnL %</p>
                      <p className={`text-sm ${weeklyPnL.pnlPercentage > 0 ? 'text-green-400' : weeklyPnL.pnlPercentage < 0 ? 'text-red-400' : 'text-white'}`}>
                        {weeklyPnL.pnlPercentage > 0 ? '+' : ''}{weeklyPnL.pnlPercentage.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-xs">No data for this period</p>
                </div>
              )}
            </div>

            {/* Monthly PnL Card */}
            <div className="bg-black/30 rounded-xl p-4 border border-white/10">
              <h4 className="text-xs font-bold text-white mb-3">Monthly PnL</h4>
              
              {monthlyPnL ? (
                <div className="space-y-4">
                  {/* Net Profit */}
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Net Profit</p>
                    <p className={`text-2xl font-mono font-bold ${monthlyPnL.netProfit > 0 ? 'text-green-400' : monthlyPnL.netProfit < 0 ? 'text-red-400' : 'text-white'}`}>
                      {monthlyPnL.netProfit > 0 ? '+' : ''}{monthlyPnL.netProfit.toFixed(4)} SOL
                    </p>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 gap-4 text-center">
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Entry</p>
                      <p className="text-sm text-white">{monthlyPnL.entryFees.toFixed(4)} SOL</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Profit</p>
                      <p className={`text-sm ${monthlyPnL.netProfit > 0 ? 'text-green-400' : monthlyPnL.netProfit < 0 ? 'text-red-400' : 'text-white'}`}>
                        {monthlyPnL.netProfit > 0 ? '+' : ''}{monthlyPnL.netProfit.toFixed(4)} SOL
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">PnL %</p>
                      <p className={`text-sm ${monthlyPnL.pnlPercentage > 0 ? 'text-green-400' : monthlyPnL.pnlPercentage < 0 ? 'text-red-400' : 'text-white'}`}>
                        {monthlyPnL.pnlPercentage > 0 ? '+' : ''}{monthlyPnL.pnlPercentage.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-xs">No data for this period</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-4">
        <button
          onClick={loadGameData}
          disabled={loading}
          className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh Game Data'}
        </button>
      </div>
    </div>
  );
};
