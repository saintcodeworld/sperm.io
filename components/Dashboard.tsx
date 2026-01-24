
import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { authService } from '../services/AuthService';
import { solanaService } from '../services/SolanaService';
import { TransactionHistory } from './TransactionHistory';
import { Settings } from './Settings';

interface DashboardProps {
  user: UserAccount;
  onPlay: () => void;
  onLogout: () => void;
  onBalanceChange?: () => Promise<void>;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onPlay, onLogout, onBalanceChange }) => {
  const [withdrawAddr, setWithdrawAddr] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState<{
    userReceived: number;
    platformFee: number;
    gasFee: number;
    signature: string;
  } | null>(null);
  const [feeBreakdown, setFeeBreakdown] = useState<{
    userReceives: number;
    platformFee: number;
    gasFee: number;
    totalDeducted: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserAccount>(user);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!withdrawAddr) {
      setError('Address required');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }
    if (amount > currentUser.balance) {
      setError('Insufficient balance');
      return;
    }
    if (!feeBreakdown || feeBreakdown.userReceives <= 0) {
      setError('Amount too small to cover fees');
      return;
    }

    setWithdrawing(true);
    setError('');
    
    try {
      const userId = await authService.getUserId();
      if (!userId) {
        setError('User not authenticated');
        return;
      }

      const result = await solanaService.processWithdrawal(
        userId,
        withdrawAddr,
        amount
      );

      if (result.success) {
        console.log('[Dashboard] Withdrawal successful, syncing real balance from blockchain...');
        
        // Sync real balance from blockchain instead of just deducting locally
        await authService.syncRealBalanceFromBlockchain();
        
        // Get the updated user with real blockchain balance
        const updatedUser = authService.getCurrentUser();
        if (updatedUser) {
          console.log('[Dashboard] Updated balance from blockchain:', updatedUser.balance);
          setCurrentUser({...updatedUser}); // Create new object to trigger re-render
        }
        
        // Sync balance with parent component
        if (onBalanceChange) {
          await onBalanceChange();
        }
        
        setSuccessMessage({
          userReceived: result.userReceived || 0,
          platformFee: result.platformFee || 0,
          gasFee: result.gasFee || 0,
          signature: result.signature || ''
        });
        setWithdrawAmount('');
        setWithdrawAddr('');
        setFeeBreakdown(null);
        setError('');
        
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
      } else {
        setError(result.error || 'Transaction failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Transaction failed');
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    const calculateFees = async () => {
      const amount = parseFloat(withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
        setFeeBreakdown(null);
        return;
      }

      try {
        const fees = await solanaService.estimateWithdrawalFees(amount);
        setFeeBreakdown(fees);
      } catch (err) {
        console.error('Fee calculation error:', err);
        setFeeBreakdown(null);
      }
    };

    calculateFees();
  }, [withdrawAmount]);

  const handleRefreshBalance = async () => {
    if (refreshing) return;
    
    setRefreshing(true);
    setError('');
    
    try {
      console.log('[Dashboard] Refreshing balance from blockchain...');
      
      // Sync real balance from blockchain
      await authService.syncRealBalanceFromBlockchain();
      
      // Get the updated user with real blockchain balance and update local state
      const updatedUser = authService.getCurrentUser();
      if (updatedUser) {
        console.log('[Dashboard] Updated balance from blockchain:', updatedUser.balance);
        setCurrentUser({...updatedUser}); // Create new object to trigger re-render
      }
      
      // Update parent component with new balance
      if (onBalanceChange) {
        await onBalanceChange();
      }
      
      console.log('[Dashboard] Balance refreshed successfully from blockchain');
    } catch (err: any) {
      console.error('[Dashboard] Balance refresh failed:', err);
      setError('Failed to refresh balance from blockchain');
    } finally {
      setRefreshing(false);
    }
  };

  const setMaxAmount = () => {
    setWithdrawAmount(currentUser.balance.toString());
    setError('');
  };


  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(currentUser.solAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleUserUpdate = (updatedUser: UserAccount) => {
    setCurrentUser(updatedUser);
  };


  // Tab selection state
  const [activeTab, setActiveTab] = useState('wallet'); // 'wallet' or 'transactions'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#050505]">
      <div className="bg-black/80 p-10 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl max-w-4xl w-full space-y-10 animate-in fade-in zoom-in duration-300">
        
        <div className="flex justify-between items-center border-b border-white/5 pb-6">
          <div>
            <h1 className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Welcome back,</h1>
            <h2 className="text-3xl font-black text-white italic uppercase tracking-wider">{currentUser.username}</h2>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setShowSettings(true)}
              className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 hover:border-white/20 transition-all transform hover:scale-105 active:scale-95"
              title="Settings"
            >
              {currentUser.photoUrl && currentUser.photoUrl.trim() !== '' ? (
                <img
                  src={currentUser.photoUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-400">
                  👤
                </div>
              )}
            </button>
            <button 
              onClick={onLogout}
              className="px-6 py-3 bg-red-900/20 text-red-400 font-black rounded-xl uppercase tracking-widest hover:bg-red-500 hover:text-white border border-red-500/30 transition-all transform hover:scale-105 active:scale-95"
            >
              Logout
            </button>
            <button 
              onClick={onPlay}
              className="px-8 py-3 bg-white text-black font-black rounded-xl uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow-xl"
            >
              Join Arena
            </button>
          </div>
        </div>

        {/* Placeholder for future content */}
        <div className="min-h-[100px] flex items-center justify-center">
          <p className="text-gray-500 text-sm italic">Future content area - to be determined</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="border-b border-white/10">
          <nav className="flex -mb-px gap-4">
            <button
              onClick={() => setActiveTab('wallet')}
              className={`px-4 py-3 font-bold text-xs uppercase tracking-wider transition-colors ${activeTab === 'wallet' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-400'}`}
            >
              Wallet & Withdraw
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-3 font-bold text-xs uppercase tracking-wider transition-colors ${activeTab === 'transactions' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-400'}`}
            >
              Transaction History
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {/* Wallet & Withdraw Tab */}
          {activeTab === 'wallet' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Existing Wallet Section */}
              <div className="space-y-6">
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-3">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Internal SOL Address</p>
                  <div 
                    onClick={handleCopyAddress}
                    className="text-xs font-mono text-gray-300 break-all cursor-pointer hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 relative"
                  >
                    {currentUser.solAddress}
                    {copiedAddress && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[8px] px-3 py-1 rounded-lg font-bold uppercase tracking-widest animate-in fade-in zoom-in">
                        Copied!
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 italic pt-2">Send SOL here to boost your biological power.</p>
                </div>

                <div className="bg-gradient-to-br from-blue-900/40 to-black p-6 rounded-2xl border border-blue-500/20">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Balance</p>
                    <button
                      onClick={handleRefreshBalance}
                      disabled={refreshing}
                      className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                      title="Refresh balance from blockchain"
                    >
                      <svg 
                        className={`w-3 h-3 text-blue-400 ${refreshing ? 'animate-spin' : 'group-hover:text-blue-300'}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth="2" 
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-4xl font-mono text-white font-black">{currentUser.balance.toFixed(4)}</span>
                    <span className="text-lg font-bold text-blue-400">SOL</span>
                  </div>
                  {refreshing && (
                    <p className="text-[8px] text-blue-400 italic mt-1 animate-pulse">Syncing from blockchain...</p>
                  )}
                </div>
              </div>

              {/* Existing Withdraw Section */}
              <div className="bg-white/5 p-8 rounded-2xl border border-white/10 space-y-6 flex flex-col justify-center">
                 <h3 className="text-xs font-black text-white uppercase tracking-widest text-center">Withdrawal Portal</h3>
                 <div className="space-y-4">
                   <div className="space-y-1">
                     <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest pl-1">Destination Address</p>
                     <input 
                       type="text" 
                       placeholder="Solana Wallet Address"
                       className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all"
                       value={withdrawAddr}
                       onChange={(e) => { setWithdrawAddr(e.target.value); setError(''); }}
                     />
                   </div>

                   <div className="space-y-1">
                     <div className="flex justify-between items-center pl-1">
                       <p className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Amount to Withdraw</p>
                       <button 
                        onClick={setMaxAmount}
                        className="text-[8px] text-blue-400 hover:text-blue-300 font-black uppercase tracking-widest transition-colors"
                       >
                        Use Max
                       </button>
                     </div>
                     <div className="relative">
                       <input 
                         type="number" 
                         placeholder="0.00"
                         step="0.01"
                         className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all"
                         value={withdrawAmount}
                         onChange={(e) => { setWithdrawAmount(e.target.value); setError(''); }}
                       />
                       <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-600 pointer-events-none">SOL</span>
                     </div>
                   </div>

                   {feeBreakdown && withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                     <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl space-y-2">
                       <p className="text-[8px] text-blue-400 uppercase font-bold tracking-widest mb-2">Fee Breakdown</p>
                       <div className="space-y-1 text-[10px]">
                         <div className="flex justify-between">
                           <span className="text-gray-400">You will receive:</span>
                           <span className="text-green-400 font-bold">{feeBreakdown.userReceives.toFixed(6)} SOL</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-gray-400">Platform fee (3%):</span>
                           <span className="text-yellow-400 font-bold">{feeBreakdown.platformFee.toFixed(6)} SOL</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-gray-400">Gas fee:</span>
                           <span className="text-orange-400 font-bold">{feeBreakdown.gasFee.toFixed(6)} SOL</span>
                         </div>
                         <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                           <span className="text-white font-bold">Total deducted:</span>
                           <span className="text-white font-bold">{feeBreakdown.totalDeducted.toFixed(6)} SOL</span>
                         </div>
                       </div>
                     </div>
                   )}

                   {error && <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider text-center">{error}</p>}

                   <button 
                     onClick={handleWithdraw}
                     disabled={withdrawing || !withdrawAddr || !withdrawAmount}
                     className="w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest bg-white/10 hover:bg-white text-white hover:text-black border border-white/20 transition-all disabled:opacity-30 disabled:hover:bg-white/10 disabled:hover:text-white"
                   >
                     {withdrawing ? 'Transacting...' : 'Confirm Withdrawal'}
                   </button>

                   {successMessage && (
                     <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-xl space-y-2 animate-in fade-in">
                       <p className="text-[10px] text-green-400 uppercase font-bold tracking-widest mb-2">✅ Withdrawal Successful!</p>
                       <div className="space-y-1 text-[10px]">
                         <div className="flex justify-between">
                           <span className="text-gray-400">You received:</span>
                           <span className="text-green-400 font-bold">{successMessage.userReceived.toFixed(6)} SOL</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-gray-400">Platform fee:</span>
                           <span className="text-yellow-400 font-bold">{successMessage.platformFee.toFixed(6)} SOL</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-gray-400">Gas fee:</span>
                           <span className="text-orange-400 font-bold">{successMessage.gasFee.toFixed(6)} SOL</span>
                         </div>
                         <div className="border-t border-white/10 pt-2 mt-2">
                           <p className="text-[8px] text-gray-500 break-all">Transaction: {successMessage.signature}</p>
                         </div>
                       </div>
                     </div>
                   )}
                 </div>
              </div>
            </div>
          )}

          {/* Transaction History Tab */}
          {activeTab === 'transactions' && (
            <TransactionHistory userId={user.username} maxItems={20} />
          )}
        </div>

        
      </div>

      {showSettings && (
        <Settings
          user={currentUser}
          onClose={() => setShowSettings(false)}
          onUserUpdate={handleUserUpdate}
        />
      )}
    </div>
  );
};
