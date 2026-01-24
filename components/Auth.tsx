
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
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Continue with Google</span>
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
