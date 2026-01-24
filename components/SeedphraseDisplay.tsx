import React, { useState } from 'react';
import { UserAccount } from '../types';

interface SeedphraseDisplayProps {
  user: UserAccount;
  onContinue: () => void;
}

export const SeedphraseDisplay: React.FC<SeedphraseDisplayProps> = ({ user, onContinue }) => {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    if (user.seedphrase && user.seedphrase !== 'PROTECTED_VAULT' && user.seedphrase !== 'RECOVERABLE_IN_SETTINGS') {
      await navigator.clipboard.writeText(user.seedphrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleContinue = () => {
    if (confirmed) {
      onContinue();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] p-4">
      <div className="bg-black/80 p-10 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl max-w-2xl w-full space-y-8 animate-in fade-in duration-500">
        
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-green-400 to-blue-500 italic uppercase">
            Save Your Recovery Seed
          </h1>
          <p className="text-gray-400 text-sm">
            This 12-word phrase is the only way to recover your account if you forget your password.
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-900/20 to-blue-900/20 border border-green-500/30 p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Your Recovery Seedphrase</p>
            <button
              onClick={handleCopy}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-black uppercase tracking-widest transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          
          <div className="bg-black/40 p-6 rounded-xl border border-white/5">
            <p className="text-sm font-mono text-green-400 leading-relaxed text-center select-all break-all">
              {user.seedphrase && user.seedphrase !== 'PROTECTED_VAULT' && user.seedphrase !== 'RECOVERABLE_IN_SETTINGS' 
                ? user.seedphrase 
                : 'Loading...'}
            </p>
          </div>
          
          <div className="space-y-2">
            <p className="text-[9px] text-yellow-400 text-center">⚠️ Important Security Notice:</p>
            <ul className="text-[9px] text-gray-400 space-y-1 list-disc list-inside">
              <li>Write these words down on paper and store them safely offline</li>
              <li>Never share these words with anyone</li>
              <li>Anyone with these words can access your account</li>
              <li>This is the ONLY way to recover your account if you forget your password</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="confirm"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-white/10 bg-white/5 text-green-500 focus:ring-green-500/50"
            />
            <label htmlFor="confirm" className="text-[10px] text-gray-400">
              I have safely saved my 12-word recovery seedphrase
            </label>
          </div>
          
          <button
            onClick={handleContinue}
            disabled={!confirmed}
            className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white font-black py-4 rounded-xl uppercase tracking-widest hover:from-green-600 hover:to-blue-600 transition-all transform active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Arena
          </button>
        </div>

      </div>
    </div>
  );
};
