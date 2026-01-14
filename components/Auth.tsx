
import React, { useState } from 'react';
import { authService } from '../services/AuthService';
import { UserAccount } from '../types';
import { SeedphraseDisplay } from './SeedphraseDisplay';

interface AuthProps {
  onAuth: (user: UserAccount) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuth }) => {
  const [isLogin, setIsLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [seedphrase, setSeedphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSeedphrase, setShowSeedphrase] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<UserAccount | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isForgotPassword) {
        if (username.length < 3) throw new Error('Username must be at least 3 characters');
        if (seedphrase.split(' ').length !== 12) throw new Error('Seedphrase must be 12 words');
        if (newPassword.length < 6) throw new Error('New password must be at least 6 characters');
        
        const user = await authService.recoverWithSeedphrase(username, seedphrase, newPassword);
        onAuth(user);
      } else if (isLogin) {
        const user = await authService.login(username, password);
        if (user) {
          onAuth(user);
        } else {
          setError('Invalid credentials or profile missing');
        }
      } else {
        if (username.length < 3) throw new Error('Username must be at least 3 characters');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        
        const user = await authService.register(username, password);
        setRegisteredUser(user);
        setShowSeedphrase(true);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication sequence failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedphraseContinue = () => {
    if (registeredUser) {
      onAuth(registeredUser);
    }
  };

  // Show seedphrase display after registration
  if (showSeedphrase && registeredUser) {
    return <SeedphraseDisplay user={registeredUser} onContinue={handleSeedphraseContinue} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] p-4">
      <div className="bg-black/80 p-10 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl max-w-sm w-full text-center space-y-8 animate-in fade-in duration-500">
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500 italic uppercase">
            Sperm.io
          </h1>
          <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em]">Custodian Gateway</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
          />
          
          {isForgotPassword ? (
            <>
              <textarea
                placeholder="Enter your 12-word recovery seedphrase"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm h-24 resize-none"
                value={seedphrase}
                onChange={(e) => setSeedphrase(e.target.value)}
                required
                disabled={loading}
              />
              <input
                type="password"
                placeholder="New Password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading}
              />
            </>
          ) : (
            <input
              type="password"
              placeholder="Password"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          )}
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              <p className="text-red-500 text-[10px] font-black uppercase tracking-tight leading-tight">
                {error}
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-black py-4 rounded-xl uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all transform active:scale-95 shadow-xl disabled:opacity-50"
          >
            {loading ? 'Processing...' : (
              isForgotPassword ? 'Recover Account' : 
              (isLogin ? 'Login' : 'Initialize Identity')
            )}
          </button>
        </form>

        <div className="space-y-2">
          {!isForgotPassword && (
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              disabled={loading}
              className="block w-full text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50"
            >
              {isLogin ? "New organism? Create Profile" : "Existing organism? Login"}
            </button>
          )}
          
          {isLogin && !isForgotPassword && (
            <button 
              onClick={() => { setIsForgotPassword(true); setError(''); }}
              disabled={loading}
              className="block w-full text-xs text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest disabled:opacity-50"
            >
              Forgot password? Recover with seedphrase
            </button>
          )}
          
          {isForgotPassword && (
            <button 
              onClick={() => { setIsForgotPassword(false); setError(''); }}
              disabled={loading}
              className="block w-full text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50"
            >
              Back to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
