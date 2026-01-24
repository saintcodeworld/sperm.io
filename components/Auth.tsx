
import React, { useState, useEffect } from 'react';
import { authService } from '../services/AuthService';
import { UserAccount } from '../types';
import { SeedphraseDisplay } from './SeedphraseDisplay';

interface AuthProps {
  onAuth: (user: UserAccount) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuth }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSeedphrase, setShowSeedphrase] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<UserAccount | null>(null);
  const [isCallback, setIsCallback] = useState(false);

  // Check for OAuth callback on component mount
  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('code') || urlParams.get('access_token')) {
        setIsCallback(true);
        setLoading(true);
        setError('');
        
        try {
          const user = await authService.handleTwitterAuthCallback();
          setRegisteredUser(user);
          setShowSeedphrase(true);
          
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err: any) {
          setError(err.message || 'Twitter authentication failed');
        } finally {
          setLoading(false);
          setIsCallback(false);
        }
      }
    };

    handleCallback();
  }, []);

  const handleSeedphraseContinue = () => {
    if (registeredUser) {
      onAuth(registeredUser);
    }
  };

  const handleTwitterSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await authService.signInWithTwitter();
      // The OAuth flow will redirect and return via useEffect callback
    } catch (err: any) {
      setError(err.message || 'Twitter sign in failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] p-4">
      <div className="bg-black/80 p-10 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl max-w-sm w-full text-center space-y-8 animate-in fade-in duration-500">
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500 italic uppercase">
            Sperm.io
          </h1>
          <p className="text-gray-500 text-[10px] uppercase tracking-[0.2em]">Custodian Gateway</p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleTwitterSignIn}
            disabled={loading}
            className="w-full bg-black border border-white/20 text-white font-black py-4 rounded-xl uppercase tracking-widest hover:bg-white hover:text-black transition-all transform active:scale-95 shadow-xl disabled:opacity-50 flex items-center justify-center space-x-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>Continue with X / Twitter</span>
              </>
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              <p className="text-red-500 text-[10px] font-black uppercase tracking-tight leading-tight">
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-gray-600 text-xs uppercase tracking-widest">
            Enter the biological arena
          </p>
          <p className="text-gray-700 text-[9px]">
            By continuing, you agree to create a wallet and participate in the game
          </p>
        </div>
      </div>
    </div>
  );

  // Show loading state during OAuth callback
  if (isCallback) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] p-4">
        <div className="bg-black/80 p-10 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl max-w-sm w-full text-center space-y-8 animate-in fade-in duration-500">
          <div className="space-y-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-400 text-sm">Completing Twitter authentication...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show seedphrase display after registration
  if (showSeedphrase && registeredUser) {
    return <SeedphraseDisplay user={registeredUser} onContinue={handleSeedphraseContinue} />;
  }
};
