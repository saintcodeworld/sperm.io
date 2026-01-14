import React, { useState } from 'react';
import { UserAccount } from '../types';
import { authService } from '../services/AuthService';

interface SettingsProps {
  user: UserAccount;
  onClose: () => void;
  onUserUpdate?: (updatedUser: UserAccount) => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onClose, onUserUpdate }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'legal'>('profile');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user.photoUrl || null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSeedphrase, setShowSeedphrase] = useState(false);
  const [actualSeedphrase, setActualSeedphrase] = useState('');
  const [copiedSeedphrase, setCopiedSeedphrase] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      setError('');
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const dataUrl = reader.result as string;
            setProfilePhoto(dataUrl);
            await authService.updateProfilePhoto(dataUrl);
            // Update parent component with new user data
            if (onUserUpdate) {
              const updatedUser = { ...user, photoUrl: dataUrl };
              onUserUpdate(updatedUser);
            }
          } catch (err: any) {
            setError(err.message || 'Failed to upload photo');
            setProfilePhoto(null);
          } finally {
            setLoading(false);
          }
        };
        reader.readAsDataURL(file);
      } catch (err: any) {
        setError(err.message || 'Failed to read file');
        setLoading(false);
      }
    }
  };

  const handleRemovePhoto = async () => {
    setLoading(true);
    setError('');
    try {
      await authService.updateProfilePhoto('');
      setProfilePhoto(null);
      // Update parent component with new user data
      if (onUserUpdate) {
        const updatedUser = { ...user, photoUrl: undefined };
        onUserUpdate(updatedUser);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to remove photo');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('Password updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleShowSeedphrase = async () => {
    if (showSeedphrase) {
      setShowSeedphrase(false);
      return;
    }

    setLoading(true);
    try {
      const seedphrase = await authService.getSeedphrase();
      setActualSeedphrase(seedphrase);
      setShowSeedphrase(true);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve seedphrase');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySeedphrase = async () => {
    if (!actualSeedphrase) return;
    try {
      await navigator.clipboard.writeText(actualSeedphrase);
      setCopiedSeedphrase(true);
      setTimeout(() => setCopiedSeedphrase(false), 2000);
    } catch (err) {
      console.error('Failed to copy seedphrase:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-black/90 border border-white/10 rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'profile'
                ? 'bg-white text-black'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'security'
                ? 'bg-white text-black'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            Security
          </button>
          <button
            onClick={() => setActiveTab('legal')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'legal'
                ? 'bg-white text-black'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            Legal
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg mb-4">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24">
                <div className="w-full h-full rounded-full bg-white/5 border border-white/10 overflow-hidden">
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      👤
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1">{user.username}</h3>
                <p className="text-gray-500 text-sm mb-3">{user.solAddress}</p>
                {profilePhoto && (
                  <button
                    onClick={handleRemovePhoto}
                    disabled={loading}
                    className="px-4 py-2 bg-red-900/20 text-red-400 font-bold rounded-lg uppercase tracking-widest hover:bg-red-500 hover:text-white border border-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-white font-bold">Change Password</h3>
              <input
                type="password"
                placeholder="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
              />
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
              />
              <button
                onClick={handlePasswordChange}
                disabled={loading}
                className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-blue-500 hover:text-white transition-all disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-white font-bold">Recovery Seedphrase</h3>
              <div className="bg-red-900/10 border border-red-500/20 p-4 rounded-2xl">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Your Recovery Seedphrase</p>
                  <button
                    onClick={handleShowSeedphrase}
                    disabled={loading}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    title={showSeedphrase ? "Hide seedphrase" : "Reveal seedphrase"}
                  >
                    {loading ? (
                      <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : showSeedphrase ? (
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div 
                  onClick={showSeedphrase && actualSeedphrase ? handleCopySeedphrase : undefined}
                  className={`bg-black/40 p-4 rounded-xl border border-white/5 relative ${showSeedphrase && actualSeedphrase ? 'cursor-pointer hover:bg-black/60' : ''} transition-all`}
                >
                  {showSeedphrase && actualSeedphrase ? (
                    <div className="relative">
                      <p className="text-xs font-mono text-green-400 leading-relaxed text-center">
                        {actualSeedphrase}
                      </p>
                      {copiedSeedphrase && (
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[8px] px-3 py-1 rounded-lg font-bold uppercase tracking-widest animate-in fade-in zoom-in whitespace-nowrap">
                          Copied!
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2">
                      <p className="text-xs font-mono text-gray-600 tracking-[0.5em] blur-[2px] select-none">
                        •••• •••• •••• •••• •••• ••••
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-gray-600 text-center mt-3 uppercase italic">Never share these 12 words. Store them offline safely.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'legal' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-white font-bold mb-4">Privacy Policy</h3>
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <p className="text-gray-400 text-sm">
                  Our privacy policy outlines how we collect, use, and protect your personal information...
                </p>
                <a
                  href="#privacy-policy"
                  className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
                >
                  Read full Privacy Policy →
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Terms of Service</h3>
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <p className="text-gray-400 text-sm">
                  By using our service, you agree to these terms which explain your rights and responsibilities...
                </p>
                <a
                  href="#terms"
                  className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
                >
                  Read full Terms of Service →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
