import React from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Error boundary component specifically for React Router.
 * This catches errors thrown within route components and displays
 * a user-friendly error page instead of the default error overlay.
 */
function RouterErrorBoundary() {
  const error = useRouteError();
  
  // Log error for debugging
  console.error('RouterErrorBoundary caught an error:', error);

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  // Determine error message based on error type
  let errorMessage = 'An unexpected error occurred.';
  let errorDetails = null;
  
  if (isRouteErrorResponse(error)) {
    // This is a response error (like 404, 500, etc.)
    errorMessage = error.statusText || `Error ${error.status}`;
    errorDetails = error.data?.message || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = import.meta.env.DEV ? error.stack : null;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        
        <h1 className="font-serif text-3xl text-[#0a0a0a] mb-4">
          Something went wrong
        </h1>
        
      </div>
    </div>
  );
}

export default RouterErrorBoundary;
