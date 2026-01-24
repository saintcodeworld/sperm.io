
import React, { useState, useEffect } from 'react';
import { Room, ROOM_CONFIGS } from '../types';
import { roomManager } from '../services/RoomManager';

interface StakeSelectorProps {
  balance: number;
  onConfirm: (roomId: string, entryFee: number) => void;
  onCancel: () => void;
}

export const StakeSelector: React.FC<StakeSelectorProps> = ({ balance, onConfirm, onCancel }) => {
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    setRooms(roomManager.getAvailableRooms());
  }, []);

  const handleJoinRoom = (room: Room) => {
    // Free rooms (0 SOL) are always joinable for testing
    if (room.entryFee > 0 && balance < room.entryFee) {
      setError('Insufficient balance');
      return;
    }
    onConfirm(room.id, room.entryFee);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#050505]">
      <div className="bg-black/90 p-10 rounded-[2.5rem] border border-white/10 shadow-2xl backdrop-blur-3xl max-w-2xl w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
        <h2 className="text-3xl font-black text-white italic uppercase tracking-wider">Select Arena Room</h2>
        
        <div className="grid grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.id} className="bg-gradient-to-br from-white/5 to-black p-6 rounded-2xl border border-white/10">
              <div className="space-y-4">
                <h3 className="text-2xl font-mono text-white mb-2">
                  {room.entryFee === 0 ? 'FREE' : `${room.entryFee} SOL`}
                </h3>
                {room.entryFee === 0 && (
                  <p className="text-[10px] text-green-400 uppercase tracking-widest">Testing Mode</p>
                )}
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Active Players: {room.currentPlayers}
                  </p>
                </div>
                <button 
                  onClick={() => handleJoinRoom(room)}
                  className="w-full py-3 bg-white text-black font-black rounded-xl uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all"
                >
                  Join Room
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
            <p className="text-red-400 text-xs font-bold uppercase tracking-wider">{error}</p>
          </div>
        )}

        <button
          onClick={onCancel}
          className="w-full bg-transparent text-gray-500 font-bold py-2 uppercase text-[10px] tracking-widest hover:text-white transition-colors"
        >
          Back to Dashboard
        </button>

        <div className="bg-white/5 p-4 rounded-xl">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Available Balance</p>
          <p className="text-xl font-mono text-blue-400">{balance.toFixed(4)} SOL</p>
        </div>
      </div>
    </div>
  );
};
