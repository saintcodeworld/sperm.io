
import React, { useState, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { getGameConfig } from './game/GameConfig';
import { GameUI } from './components/GameUI';
import { TransactionLoading } from './components/TransactionLoading';
import { DeathEvent, KillEvent } from './services/ServerSim';
import { roomManager } from './services/RoomManager';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { StakeSelector } from './components/StakeSelector';
import { AdminWallets } from './components/AdminWallets';
import { authService } from './services/AuthService';
import { solanaService } from './services/SolanaService';
import { gameTransactionService } from './services/GameTransactionService';
import { gameHistoryService } from './services/GameHistoryService';
import { UserAccount, CashoutEvent } from './types';

type AppState = 'AUTH' | 'DASHBOARD' | 'STAKE_SELECTION' | 'PLAYING' | 'GAMEOVER' | 'CASHOUT_SUCCESS' | 'ADMIN';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<AppState>('AUTH');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [deathData, setDeathData] = useState<DeathEvent | null>(null);
  const [lastEarnings, setLastEarnings] = useState(0);
  const [activeStake, setActiveStake] = useState(0);
  const [error, setError] = useState('');
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string } | null>(null);
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  
  // Transaction loading states
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState('');
  const [transactionSignature, setTransactionSignature] = useState('');
  const [totalPotAmount, setTotalPotAmount] = useState(0);

  const syncUser = async () => {
    await authService.syncBalanceFromDatabase();
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser({ ...user });
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin-recovery') {
        setGameState('ADMIN');
      }
    };

    const restoreUserSession = async () => {
      console.log('[App] Checking for existing session...');
      const restoredUser = await authService.restoreSession();
      if (restoredUser) {
        console.log('[App] Session restored successfully');
        setCurrentUser(restoredUser);
        setGameState('DASHBOARD');
      } else {
        console.log('[App] No session to restore');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    restoreUserSession();
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (gameRef.current) {
        gameRef.current.destroy(true);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const balanceSyncInterval = setInterval(async () => {
      await syncUser();
    }, 10000);

    return () => clearInterval(balanceSyncInterval);
  }, [currentUser]);

  const handleAuthSuccess = async (user: UserAccount) => {
    setCurrentUser(user);
    setGameState('DASHBOARD');
    await syncUser();
  };

  const handleProceedToStake = () => {
    setGameState('STAKE_SELECTION');
  };

  const handleStartGame = async (roomId: string, entryFee: number) => {
    if (!currentUser) return;
    
    // Show transaction loading UI
    setIsTransactionLoading(true);
    setTransactionMessage('Processing entry fee transaction...');
    setTransactionSignature('');
    
    try {
      // The transaction will be processed by the server when joining the room
      // We just need to set the game state to show the loading UI
      setActiveStake(entryFee);
      
      const id = `player_${Math.random().toString(36).substr(2, 9)}`;
      
      // Join the room (this will trigger the transaction)
      const joined = await roomManager.joinRoom(roomId, id, currentUser.username);
      if (!joined) {
        setError('Failed to join room');
        setIsTransactionLoading(false);
        return;
      }

      const roomServer = roomManager.getServer(roomId);
      if (!roomServer) {
        setError('Room server not found');
        setIsTransactionLoading(false);
        return;
      }

      // Wait a moment for the transaction to process, then start the game
      setTimeout(() => {
        setGameState('PLAYING');
        setIsTransactionLoading(false);
        
        // Force cleanup of any existing game instance
        if (gameRef.current) {
          gameRef.current.destroy(true);
          gameRef.current = null;
          setGameInstance(null);
        }

        setTimeout(() => {
          const config = getGameConfig('game-container');
          const newGame = new Phaser.Game(config);
          gameRef.current = newGame;
          setGameInstance(newGame);
          
          newGame.scene.start('GameScene', { id, server: roomServer });
          
          newGame.events.once('ready', () => {
            const gameScene = newGame.scene.getScene('GameScene');
            
            gameScene?.events.on('kill-alert', async (event: KillEvent) => {
              await authService.updateBalance(event.stolenAmount);
              await syncUser();
            });

            gameScene?.events.on('game-over', async (event: DeathEvent) => {
              setDeathData(event);
              setLastEarnings(event.solLost);
              setGameState('GAMEOVER');
              
              // Record game history
              if (currentUser) {
                try {
                  const success = await gameHistoryService.recordGameResult(
                    currentUser.username,
                    id,
                    Math.floor(event.length || 0),
                    Math.floor(event.score || 0),
                    activeStake,
                    'killed',
                    event.killedBy,
                    Math.floor(event.timeAlive || 0),
                    0,
                    activeStake // Lost the entire stake
                  );
                  if (success) {
                    console.log('[App] Game loss recorded in history with integer values');
                    console.log('[App] Game loss recorded in history');
                  } else {
                    console.log('[App] Game history recording failed, but continuing...');
                  }
                } catch (err) {
                  console.error('[App] Failed to record game history:', err);
                  // Don't crash the game, just continue
                }
              }
              
              cleanupGame();
            });

            // Handle cashout success event from ServerSim
            gameScene?.events.on('cashout-success', async (data: CashoutEvent) => {
              // Show loading for cashout transaction
              setIsTransactionLoading(true);
              setTransactionMessage('Processing cashout transaction...');
              setTotalPotAmount(data.totalPot); // Track total pot for comparison
              setTransactionSignature(data.signature); // Set the transaction signature
              
              // Calculate the actual amount the user receives (total - platform fee - gas)
              const winnings = data.totalPot * 0.99 - 0.00001; // 1% platform fee minus estimated gas
              
              // Don't process transaction again - ServerSim already did it
              // Just sync balance and show success
              await syncUser(); // Sync to get updated balance from blockchain
              setLastEarnings(winnings);
              console.log(`[App] Cashout successful: Total pot ${data.totalPot} SOL, User received ${winnings} SOL`);
              
              // Hide loading after cashout
              setTimeout(async () => {
                setIsTransactionLoading(false);
                
                // Get current player data for recording history
                const playerData = roomServer.getPlayerData(id);
                
                // Record game history
                if (currentUser) {
                  try {
                    const success = await gameHistoryService.recordGameResult(
                      currentUser.username,
                      id,
                      Math.floor(playerData?.length || 0),
                      Math.floor(playerData?.score || 0),
                      activeStake,
                      'cashout',
                      undefined,
                      Math.floor(roomServer.getTimeAlive(id) || 0),
                      winnings,
                      0 // No loss on cashout
                    );
                    if (success) {
                      console.log('[App] Game win recorded in history with integer values');
                      console.log('[App] Game win recorded in history');
                    } else {
                      console.log('[App] Game history recording failed, but continuing...');
                    }
                  } catch (err) {
                    console.error('[App] Failed to record game history:', err);
                    // Don't crash the game, just continue
                  }
                }
                
                setGameState('CASHOUT_SUCCESS');
                cleanupGame();
              }, 2000); // Show loading for 2 seconds to let user see the transaction
            });
          });
        }, 100);
      }, 3000); // Give more time for transaction to process
      
      await syncUser();
    } catch (error) {
      console.error('[App] Error starting game:', error);
      setError('Failed to start game');
      setIsTransactionLoading(false);
    }
  };

  const cleanupGame = () => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
      setGameInstance(null);
    }
  };

  const handleBackToMenu = async () => {
    await syncUser();
    setGameState('DASHBOARD');
  };

  const handleLogout = async () => {
    console.log('[App] Logout initiated');
    await authService.logout();
    setCurrentUser(null);
    setGameState('AUTH');
    console.log('[App] User logged out, returning to auth screen');
  };

  // Render Logic based on gameState
  if (gameState === 'ADMIN') return <AdminWallets />;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505]">
      {/* Transaction Loading UI */}
      <TransactionLoading 
        isVisible={isTransactionLoading}
        message={transactionMessage}
        transactionSignature={transactionSignature}
      />
      
      {dbStatus && gameState !== 'PLAYING' && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 backdrop-blur-md transition-all duration-500 animate-in slide-in-from-top-4 ${dbStatus.connected ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${dbStatus.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
          {dbStatus.message}
        </div>
      )}

      {gameState === 'AUTH' && <Auth onAuth={handleAuthSuccess} />}
      {gameState === 'DASHBOARD' && currentUser && (
        <Dashboard user={currentUser} onPlay={handleProceedToStake} onLogout={handleLogout} onBalanceChange={syncUser} />
      )}
      {gameState === 'STAKE_SELECTION' && currentUser && (
        <StakeSelector 
          balance={currentUser.balance} 
          onConfirm={handleStartGame} 
          onCancel={handleBackToMenu}
        />
      )}

      {(gameState === 'GAMEOVER' || gameState === 'CASHOUT_SUCCESS') && (
        <div className="flex flex-col items-center justify-center h-full z-50">
          <div className="bg-black/90 p-12 rounded-[2.5rem] border border-white/10 shadow-2xl backdrop-blur-3xl max-w-lg w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
            {gameState === 'GAMEOVER' ? (
              <>
                <h2 className="text-5xl font-black text-red-500 uppercase italic tracking-tighter text-glow-red">Terminated</h2>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Casualty Report</p>
                  <p className="text-white text-lg font-bold">Killed by: <span className="text-red-400">{deathData?.killedBy}</span></p>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto border border-green-500/40">
                  <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h2 className="text-5xl font-black text-green-500 uppercase italic tracking-tighter text-glow-green">Cashed Out</h2>
                <p className="text-gray-400 font-medium">Cash out complete.</p>
              </>
            )}

            <div className="grid grid-cols-2 gap-4 py-8 border-y border-white/5">
              <div className="text-center">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Final Length</p>
                <p className="text-3xl font-mono text-white">{Math.floor(deathData?.length || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">
                  {gameState === 'GAMEOVER' ? 'Pot Lost' : 'Total Cash Out'}
                </p>
                {gameState === 'CASHOUT_SUCCESS' ? (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 line-through">
                      Pot: {totalPotAmount.toFixed(4)} SOL
                    </p>
                    <p className="text-3xl font-mono text-green-400">
                      +{lastEarnings.toFixed(4)} <span className="text-xs">SOL</span>
                    </p>
                    <p className="text-[8px] text-yellow-400">
                      Fees: {(totalPotAmount - lastEarnings).toFixed(4)} SOL deducted
                    </p>
                  </div>
                ) : (
                  <p className={`text-3xl font-mono ${gameState === 'GAMEOVER' ? 'text-red-400' : 'text-green-400'}`}>
                    {gameState === 'GAMEOVER' ? '-' : '+'}{lastEarnings.toFixed(4)} <span className="text-xs">SOL</span>
                  </p>
                )}
                {gameState === 'CASHOUT_SUCCESS' && (
                  <div className="space-y-2 mt-2">
                    <p className="text-[8px] text-gray-500 uppercase font-bold">Fees Applied:</p>
                    <p className="text-[8px] text-gray-400">• 3% Entry Platform Fee</p>
                    <p className="text-[8px] text-gray-400">• 1% Cashout Platform Fee</p>
                    <p className="text-[8px] text-gray-400">• Network Gas Fees</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleBackToMenu}
              className="w-full bg-white text-black font-black py-5 rounded-2xl uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all transform active:scale-95 shadow-xl text-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      <div id="game-container" className={`${gameState === 'PLAYING' ? 'block' : 'hidden'}`}></div>
      {gameState === 'PLAYING' && <GameUI game={gameInstance} initialStake={activeStake} />}
      
      <style>{`
        .text-glow-red { text-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }
        .text-glow-green { text-shadow: 0 0 10px rgba(34, 197, 94, 0.5); }
      `}</style>
    </div>
  );
};

export default App;
