import React from 'react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">Privacy Policy</h3>
        <p className="text-sm text-gray-400">Effective Date: January 24, 2026</p>
      </div>
      
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-300">
          This Privacy Policy describes how we collect and process your data. When you authenticate via X, we receive your public profile info and email address. This data is used solely for account identification and saving game progress on our secure Supabase servers. We do not share your data with third parties.
        </p>
      </div>
    </div>
  );
};
