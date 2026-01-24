
import React, { useState, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { PlayerData, ARENA_SIZE } from '../types';
import { KillEvent } from '../services/ServerSim';

interface GameUIProps {
  game: Phaser.Game | null;
  initialStake: number;
}

interface ActiveKillAlert extends KillEvent {
  id: number;
}

export const GameUI: React.FC<GameUIProps> = ({ game, initialStake }) => {
  const [leaderboard, setLeaderboard] = useState<PlayerData[]>([]);
  const [minimapData, setMinimapData] = useState<{
    x: number;
    y: number;
    otherPlayers: Array<{ x: number, y: number, isSelf: boolean }>;
  }>({ x: 0, y: 0, otherPlayers: [] });

  const [currentPot, setCurrentPot] = useState(initialStake);
  const [cashoutProgress, setCashoutProgress] = useState(0);
  const [killAlerts, setKillAlerts] = useState<ActiveKillAlert[]>([]);
  const nextAlertId = useRef(0);

  useEffect(() => {
    if (!game) return;

    const scene = game.scene.getScene('GameScene');
    if (!scene) return;

    const onLeaderboard = (data: PlayerData[]) => setLeaderboard(data);

    // Update handler to receive full player list
    const onMinimap = (data: { x: number, y: number, solValue?: number, otherPlayers?: Array<{ x: number, y: number, isSelf: boolean }> }) => {
      setMinimapData({
        x: data.x,
        y: data.y,
        otherPlayers: data.otherPlayers || []
      });
      if (data.solValue !== undefined) setCurrentPot(data.solValue);
    };

    const onProgress = (p: number) => setCashoutProgress(p);
    const onKill = (event: KillEvent) => {
      const alert = { ...event, id: nextAlertId.current++ };
      setKillAlerts(prev => [...prev, alert]);
      setTimeout(() => {
        setKillAlerts(prev => prev.filter(a => a.id !== alert.id));
      }, 3000);
    };

    scene.events.on('leaderboard-update', onLeaderboard);
    scene.events.on('minimap-update', onMinimap);
    scene.events.on('cashout-progress', onProgress);
    scene.events.on('kill-alert', onKill);

    return () => {
      scene.events.off('leaderboard-update', onLeaderboard);
      scene.events.off('minimap-update', onMinimap);
      scene.events.off('cashout-progress', onProgress);
      scene.events.off('kill-alert', onKill);
    };
  }, [game]);

  const bountyEarnings = Math.max(0, currentPot - initialStake);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white overflow-hidden">
      {/* ... (Keep existing Kill Alerts and Pot HUD code identical) ... */}

      {/* Kill Alerts */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full z-20">
        {killAlerts.map(alert => (
          <div
            key={alert.id}
            className="bg-black/80 border border-green-500/50 px-6 py-3 rounded-2xl shadow-[0_0_20px_rgba(34,197,94,0.3)] animate-bounce-in"
          >
            <p className="text-sm font-black uppercase italic tracking-tighter">
              YOU KILLED <span className="text-white">{alert.victimName}</span> — STOLE <span className="text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)]">{alert.stolenAmount.toFixed(4)} SOL</span>!
            </p>
          </div>
        ))}
      </div>

      {/* Merged Session Pot HUD */}
      <div className="absolute top-6 left-6 space-y-2 group">
        <div className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl flex flex-col min-w-[220px] relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Total Session Value</p>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-green-400 to-emerald-500 drop-shadow-lg">
              {currentPot.toFixed(4)}
            </span>
            <span className="text-sm font-bold text-green-400">SOL</span>
          </div>

          <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[9px] font-bold uppercase tracking-tighter text-gray-500">
            <div>Deposit: <span className="text-white">{initialStake.toFixed(2)}</span></div>
            <div>Bounty: <span className="text-green-400">+{bountyEarnings.toFixed(4)}</span></div>
          </div>

          {/* Subtle background glow */}
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-green-500/10 blur-2xl rounded-full"></div>
        </div>

        {cashoutProgress === 0 ? (
          <div className="flex items-center space-x-2 pl-1">
            <div className="bg-green-500/20 border border-green-500/40 px-2 py-1 rounded text-[9px] text-green-300 font-bold uppercase tracking-widest animate-pulse">
              CASH OUT READY
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-tighter font-bold">
              HOLD SPACE TO CASH OUT <span className="text-white">{currentPot.toFixed(4)} SOL</span>
            </p>
          </div>
        ) : (
          <div className="bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-green-500/30 shadow-2xl flex items-center gap-3">
            <div className="relative w-24 h-12 bg-black/50 rounded-lg border-2 border-green-500/30 overflow-hidden shadow-[0_0_20px_rgba(34,197,94,0.2)]">
              <div
                className="absolute bottom-0 left-0 w-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]"
                style={{ height: `${cashoutProgress * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <span className="text-lg font-black text-white drop-shadow-lg">
                  {(cashoutProgress * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-black text-green-400 uppercase tracking-wider">CASHING OUT...</p>
              <p className="text-[9px] text-gray-400 uppercase tracking-tight">DO NOT RELEASE SPACE</p>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="absolute top-6 right-6 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 w-52 shadow-2xl">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
          Top Predators
        </h3>
        <ul className="space-y-2">
          {leaderboard.map((p, idx) => (
            <li key={p.id} className="flex justify-between items-center text-xs">
              <span className={`truncate mr-2 ${idx === 0 ? 'text-yellow-400 font-black' : 'font-medium opacity-80'}`}>
                {idx + 1}. {p.name || 'Sperm'}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-green-400/70">{p.solValue.toFixed(2)}</span>
                <span className="font-mono opacity-40 text-[10px]">{Math.floor(p.score)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Minimap */}
      <div className="absolute bottom-8 right-8 w-40 h-40 bg-black/40 backdrop-blur-sm rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl group transition-transform hover:scale-105">
        {/* Render Self */}
        <div
          className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,1)] z-10 border border-white/50"
          style={{
            left: `${(minimapData.x / ARENA_SIZE) * 100}%`,
            top: `${(minimapData.y / ARENA_SIZE) * 100}%`,
            transform: 'translate(-50%, -50%)'
          }}
        />

        {/* Render Other Players */}
        {minimapData.otherPlayers.map((p, idx) => (
          <div
            key={idx}
            className="absolute w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,0.8)] z-0 opacity-80"
            style={{
              left: `${(p.x / ARENA_SIZE) * 100}%`,
              top: `${(p.y / ARENA_SIZE) * 100}%`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        ))}

        {/* Dynamic Grid Overlay on Minimap */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>
        <div className="absolute inset-0 border border-blue-500/20 rounded-[2rem] animate-pulse"></div>
      </div>

      {/* Controls Hint */}
      <div className="absolute bottom-8 left-8 flex flex-col gap-2">
        <div className="text-gray-400 text-[10px] bg-black/40 px-4 py-3 rounded-2xl border border-white/5 backdrop-blur-sm space-y-1 uppercase tracking-widest shadow-xl">
          <p><span className="text-white font-black">MOVE:</span> Cursor</p>
          <p><span className="text-white font-black">BOOST:</span> Click / Shift</p>
          <p className="text-blue-400"><span className="text-white font-black">EXTRACTION:</span> Hold Space</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl backdrop-blur-sm">
          <p className="text-[9px] text-red-400 font-black uppercase tracking-widest">Danger: Avoid Map Perimeter</p>
        </div>
      </div>

      <style>{`
        @keyframes bounce-in {
          0% { transform: scale(0.3) translateY(20px); opacity: 0; }
          50% { transform: scale(1.1) translateY(-5px); }
          70% { transform: scale(0.9) translateY(2px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-bounce-in {
          animation: bounce-in 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
      `}</style>
    </div>
  );
};
