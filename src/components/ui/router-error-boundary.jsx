import { useEffect } from "react";
import { useRouteError, isRouteErrorResponse } from "react-router-dom";

/**
 * Error boundary component specifically for React Router.
 * This catches errors thrown within route components and displays
 * a user-friendly error page instead of the default error overlay.
 */
function RouterErrorBoundary() {
  const error = useRouteError();

  // Determine error message based on error type
  let errorMessage = "An unexpected error occurred.";
  let errorDetails = null;

  if (isRouteErrorResponse(error)) {
    // This is a response error (like 404, 500, etc.)
    errorMessage = error.statusText || `Error ${error.status}`;
    errorDetails = error.data?.message || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = import.meta.env.DEV ? error.stack : null;
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  const lang = sessionStorage.getItem("lang") || "ko";

  const title = {
    ko: "일부 오류가 발생하였습니다.",
    en: "Some errors"
  };

  const description = {
    ko: "실패한 업데이트를 다시 시도하고 있습니다. 잠시만 기다려 주세요.",
    en: "We’re retrying the failed update. Please wait a moment.",
  };

  useEffect(() => {
    window.parent?.postMessage(
      {
        type: "sync_tax_error",
        data: "true",
      },
      "*",
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-4">
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
        <div className="text-center flex flex-col items-center gap-6">
          {/* Spinner ring with logo */}
          <div className="relative w-20 h-20">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0%, transparent 30%, #6366f1 70%, #a855f7 100%)',
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3.5px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3.5px))',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src="https://cdn.vibe-x.app/assets/vibexLogo.png" alt="" className="w-12 h-auto object-contain" />
            </div>
          </div>

          {/* Text */}
          <div className="min-h-[60px]">
            <p
              className="text-lg font-semibold text-gray-800 tracking-tight transition-opacity duration-200"
            >
              {title[lang] || title.ko}
            </p>
            <p
              className="text-[15px] text-gray-400 mt-1.5 transition-opacity duration-200" >
              {description[lang] || description.ko}
            </p>
          </div>

          {/* Animated progress dots */}
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-indigo-400"
                style={{
                  animation: 'pulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RouterErrorBoundary;
