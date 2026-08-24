import React from 'react';
import { useAuth } from '@/lib/useAuth';

/**
 * Shown INSTEAD of the whole app when the owner has restricted it to a set of
 * IP addresses and this visitor is not on the list.
 *
 * The app never renders behind this: GetProjectInfo is the first call made on
 * boot and AuthProvider stops there, so there is no half-loaded UI to leak.
 * The copy stays deliberately vague about the rule itself — a blocked visitor
 * should learn that access is restricted and who to ask, not which networks are
 * allowed.
 */
const IpAccessRestricted = () => {
  const { authError, checkAppState } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50 px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-red-100">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Access Restricted
          </h1>
          <p className="text-slate-600 mb-8">
            {authError?.message ||
              'Access to this app is not allowed from your IP address.'}
          </p>
          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600 text-left">
            <p>This app is limited to approved networks. You can:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Connect from an approved network or VPN</li>
              <li>Ask the app owner to add your IP address</li>
            </ul>
          </div>
          {/* Reconnecting from an approved network is the normal fix, and it
              changes the answer without anything else changing — so offer a
              retry rather than making the visitor reload by hand. */}
          <button
            type="button"
            onClick={() => checkAppState?.()}
            className="mt-6 w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium transition-colors hover:bg-slate-800"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
};

export default IpAccessRestricted;
