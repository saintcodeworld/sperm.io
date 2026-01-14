
import React, { useState } from 'react';
import { walletService } from '../services/WalletService';

const MASTER_ADMIN_KEY = import.meta.env.VITE_MASTER_ADMIN_KEY || 'deving';

export const AdminWallets: React.FC = () => {
  const [targetId, setTargetId] = useState('');
  const [result, setResult] = useState<{ publicKey: string, privateKeyBase58: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (masterPassword === MASTER_ADMIN_KEY) {
      setIsUnlocked(true);
      setError('');
    } else {
      setError('Biological Access Denied: Invalid Master Key');
    }
  };

  const handleDecrypt = async () => {
    if (!targetId) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await walletService.fetchAndDecryptWallet(targetId);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Decryption failed. Ensure SERVICE_ROLE_KEY is injected.');
    } finally {
      setLoading(false);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="bg-black/90 p-10 rounded-3xl border border-red-500/20 shadow-2xl max-w-sm w-full space-y-8">
          <div className="text-center space-y-2">
             <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/30">
               <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
             </div>
             <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Admin Portal</h1>
             <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Privileged Key Recovery</p>
          </div>
          
          <form onSubmit={handleUnlock} className="space-y-4">
            <input 
              type="password" 
              placeholder="Master Admin Key"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-red-500/50 transition-all text-center"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
            />
            {error && <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest text-center">{error}</p>}
            <button className="w-full bg-red-600 text-white font-black py-4 rounded-xl uppercase tracking-widest hover:bg-red-500 transition-all active:scale-95">
              Unlock Terminal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 space-y-8">
      <div className="bg-black/80 p-10 rounded-3xl border border-white/10 shadow-2xl max-w-2xl w-full space-y-8">
        <div className="flex justify-between items-center border-b border-white/5 pb-6">
          <h2 className="text-3xl font-black text-white italic uppercase tracking-wider">Wallet Decryptor</h2>
          <span className="px-3 py-1 bg-red-500/20 text-red-500 text-[10px] font-black rounded border border-red-500/30">SERVICE ROLE ACTIVE</span>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest pl-1">Target UUID</p>
            <div className="flex gap-3">
              <input 
                type="text" 
                placeholder="User ID (UUID)"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white font-mono text-sm focus:outline-none focus:border-blue-500/50"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
              <button 
                onClick={handleDecrypt}
                disabled={loading || !targetId}
                className="px-8 bg-white text-black font-black rounded-xl uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all disabled:opacity-30"
              >
                {loading ? 'Decrypting...' : 'Reveal Key'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-900/20 border border-red-500/20 rounded-xl">
              <p className="text-xs text-red-400 font-bold uppercase text-center">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-3">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Public Address (Devnet)</p>
                <p className="text-xs font-mono text-gray-300 break-all select-all bg-black/40 p-3 rounded-lg border border-white/5">
                  {result.publicKey}
                </p>
              </div>

              <div className="bg-red-500/5 p-6 rounded-2xl border border-red-500/20 space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2">
                  <span className="text-[8px] bg-red-500 text-white px-2 py-0.5 rounded font-black uppercase">Secret</span>
                </div>
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Decrypted Base58 Private Key</p>
                <p className="text-xs font-mono text-white break-all select-all bg-black/60 p-4 rounded-lg border border-red-500/10 shadow-inner">
                  {result.privateKeyBase58}
                </p>
                <p className="text-[9px] text-gray-500 italic mt-2 text-center">Copy this string directly into Phantom "Import Private Key" to regain control.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <button 
        onClick={() => setIsUnlocked(false)}
        className="text-[10px] text-gray-600 hover:text-white font-black uppercase tracking-widest transition-colors"
      >
        Terminate Session
      </button>
    </div>
  );
};
