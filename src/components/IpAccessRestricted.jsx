import React from 'react';
import { useAuth } from '@/lib/useAuth';

/**
 * Shown INSTEAD of the whole app when the owner has restricted it to a set of
 * IP addresses and this visitor is not on the list.
 *
 * The app never renders behind this: GetProjectInfo is the first call made on
 * boot and AuthProvider stops there, so there is no half-loaded UI to leak.
 *
 * The body text is whatever the API returned and nothing else — no advice about
 * VPNs or who to contact. That copy was invented here, so it could contradict
 * the real reason and it drifts the moment the server message changes; the
 * server is the only thing that knows why this visitor was refused.
 */
const IpAccessRestricted = () => {
  const { authError, retryIpAccess, checkAppState } = useAuth();

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
          {/* The server's message, verbatim. The fallback only covers a block
              detected without one (e.g. a request that never got a body). */}
          <p className="text-slate-600 break-words">
            {authError?.message || 'Access to this app is not available.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default IpAccessRestricted;
