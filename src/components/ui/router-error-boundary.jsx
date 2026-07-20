import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const TRANSLATIONS = {
  ko: {
    title: '알수 없는 오류',
    desc: '알수 없는 오류가 확인되었습니다. 새로고침 후 다시 확인해 주세요.',
    refresh: '새로고침',
  },
  en: {
    title: 'Unknown error',
    desc: 'An unknown error has been detected. Please refresh and check again.',
    refresh: 'Refresh',
  },
};

function getLang() {
  try {
    const l = sessionStorage.getItem('lang');
    return l === 'en' || l === 'ko' ? l : 'ko';
  } catch {
    return 'ko';
  }
}

function extractErrorInfo(error) {
  if (isRouteErrorResponse(error)) {
    const title = error.statusText || `Error ${error.status}`;
    const details = error.data?.message || error.data || '';
    return { title, details: String(details), componentName: null, stack: '' };
  }

  const stack = error?.stack || '';
  const match = stack.match(/at\s+(\w+)\s+\(eval/);
  let componentName = match?.[1] ?? null;
  if (componentName === 'eval') componentName = null;

  const title = componentName
    ? `in ${componentName}: ${error}`
    : String(error);

  return { title, details: String(error), componentName, stack };
}

/**
 * Error boundary component specifically for React Router.
 * Used as `errorElement` in route config — catches errors thrown
 * within route components and displays a user-friendly fallback.
 *
 * UI matches ErrorOverlay & GlobalErrorFallback.
 */
function RouterErrorBoundary() {
  const error = useRouteError();
  const lang = getLang();
  const t = TRANSLATIONS[lang] ?? TRANSLATIONS.ko;

  useEffect(() => {
    try {
      const { title, details, componentName } = extractErrorInfo(error);

      // Skip transient React null-hook errors (HMR / init race)
      const errStr = String(error);
      const isTransient = errStr.includes("Cannot read properties of null (reading 'use");
      if (isTransient) return;

      window.parent?.postMessage(
        { type: 'sync_tax_error', data: 'true' },
        '*',
      );
      window.parent?.postMessage(
        {
          type: 'app_error',
          error: { title, details, componentName, originalError: error },
        },
        '*',
      );
    } catch {
      // silent
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>

        <h1 className="text-3xl text-[#0a0a0a] mb-4">{t.title}</h1>

        <p className="text-gray-600 mb-8 leading-relaxed">{t.desc}</p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0a0a0a] text-white text-sm font-medium tracking-wider uppercase rounded-lg hover:bg-[#1a1a1a] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t.refresh}
        </button>
      </div>
    </div>
  );
}

export default RouterErrorBoundary;
