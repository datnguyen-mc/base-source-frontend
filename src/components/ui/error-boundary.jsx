import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Skip transient React null-hook errors (HMR / init race)
    const errStr = String(error);
    if (errStr.includes("Cannot read properties of null")) {
      // Auto-recover: reset state so the app retries rendering
      this.setState({ hasError: false, error: null, errorInfo: null });
      return;
    }

    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });

    // Report to parent iframe
    try {
      window.parent?.postMessage(
        {
          type: 'app_error',
          error: {
            title: errStr,
            details: errorInfo?.componentStack?.toString(),
            componentName: null,
          },
        },
        '*',
      );
    } catch {
      // silent
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>

            {/* Title */}
            <h1 className="font-serif text-3xl text-[#0a0a0a] mb-4">
              Unknown error
            </h1>

            {/* Description */}
            <p className="text-gray-600 mb-8 leading-relaxed">
              An unknown error has been detected. Please refresh and check again.
            </p>

            {/* Refresh Button */}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0a0a0a] text-white text-sm tracking-wider uppercase hover:bg-[#b8860b] transition-colors rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
