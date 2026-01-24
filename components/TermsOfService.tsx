import React from 'react';

export const TermsOfService: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">Terms of Service</h3>
        <p className="text-sm text-gray-400">Last Updated: January 24, 2026</p>
      </div>
      
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-300">
          By using this site, you agree that you own the X account used for login. Prohibited conduct includes using automated scripts or disrupting services. We are not liable for service interruptions from third-party providers like X or Supabase.
        </p>
      </div>
    </div>
  );
};
