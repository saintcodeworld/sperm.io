import React from 'react';
import { PrivacyPolicy } from '../components/PrivacyPolicy';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="bg-black/90 border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 overflow-y-auto max-h-[80vh]">
          <PrivacyPolicy />
        </div>
      </div>
    </div>
  );
};
