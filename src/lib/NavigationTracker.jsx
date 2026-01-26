import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { pagesConfig } from "@/pages.config";

export default function NavigationTracker() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const { Pages, mainPage } = pagesConfig;

  const mainPageKey = useMemo(() => {
    const keys = Object.keys(Pages || {});
    return mainPage ?? keys[0] ?? null;
  }, [Pages, mainPage]);

  useEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search, location.hash]);

  // Notify parent window when URL changes
  useEffect(() => {
    window.parent?.postMessage(
      {
        type: "app_changed_url",
        url: window.location.href,
      },
      "*",
    );
  }, [location]);

  // Resolve page name from path (case-insensitive) and track activity
  useEffect(() => {
    const pathname = location.pathname || "";
    const isRoot = pathname === "/" || pathname === "";

    let pageName = null;

    if (isRoot) {
      pageName = mainPageKey;
    } else {
      const segment = pathname.replace(/^\//, "").split("/")[0] || "";

      const pageKeys = Object.keys(Pages || {});
      const matchedKey =
        pageKeys.find((k) => k.toLowerCase() === segment.toLowerCase()) ?? null;

      pageName = matchedKey;
    }

    // Example safeguard: do nothing if pageName is null
    void pageName;
    void isAuthenticated;
  }, [location.pathname, Pages, mainPageKey, isAuthenticated]);

  return null;
}
