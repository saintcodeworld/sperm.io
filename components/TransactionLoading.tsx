import React from 'react';

interface TransactionLoadingProps {
  isVisible: boolean;
  message?: string;
  transactionSignature?: string;
}

export const TransactionLoading: React.FC<TransactionLoadingProps> = ({ 
  isVisible, 
  message = "Processing transaction...", 
  transactionSignature 
}) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-blue-500/30 p-8 rounded-3xl max-w-md w-full shadow-2xl">
        <div className="text-center space-y-6">
          {/* Loading Animation */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-500/20 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">
              {message}
            </h3>
            <p className="text-gray-400 text-sm">
              Please wait while we confirm your transaction on Solana devnet
            </p>
          </div>

          {/* Transaction Signature */}
          {transactionSignature && (
            <div className="bg-black/40 p-4 rounded-xl border border-green-500/20">
              <p className="text-gray-400 text-xs mb-1">Transaction Signature:</p>
              <p className="text-green-400 font-mono text-xs break-all">
                {transactionSignature}
              </p>
              <a 
                href={`https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 text-xs hover:text-blue-300 underline mt-2 inline-block"
              >
                View on Solana Explorer
              </a>
            </div>
          )}

          {/* Progress Steps */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-gray-300 text-sm">Creating transaction...</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-gray-300 text-sm">Submitting to network...</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-gray-300 text-sm">Waiting for confirmation...</span>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-yellow-300 text-xs">
              ⚠️ Do not close this window while the transaction is being processed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
