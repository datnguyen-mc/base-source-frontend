import React, { useEffect } from "react";
import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

/**
 * Error boundary component specifically for React Router.
 * This catches errors thrown within route components and displays
 * a user-friendly error page instead of the default error overlay.
 */
function RouterErrorBoundary() {
  const error = useRouteError();

  // Log error for debugging
  console.error("RouterErrorBoundary caught an error:", error);

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

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
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 bg-white backdrop-blur-sm">
            <div className="text-center space-y-4">
                    <div className="relative inline-block">
                      <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40 animate-pulse">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                      <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl opacity-20 blur-xl animate-pulse" />
                    </div>

                    <div className="min-h-[56px]">
                      <p
                        className={clsx(
                          "text-base font-semibold text-gray-900 transition-opacity duration-100",
                        )}
                      >
                        {title[lang] || title.ko}
                      </p>
                      <p
                        className={clsx(
                          "text-sm text-gray-600 mt-1 transition-opacity duration-100",
                        )}
                      >
                        {description[lang] || description.ko}
                      </p>
                    </div>
                  </div>
          </div>
    </div>
  );
}

export default RouterErrorBoundary;
