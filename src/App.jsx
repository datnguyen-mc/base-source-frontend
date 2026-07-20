import "./App.css";
import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import VisualEditAgent from "@/lib/VisualEditAgent";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import {
  createBrowserRouter,
  RouterProvider,
  Route,
  Routes,
  ScrollRestoration,
  useNavigationType,
  useLocation,
} from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider } from "./lib/AuthProvider";
import { useAuth } from "./lib/useAuth";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import Login from "./pages/admin/Login";
import ErrorBoundary from "@/components/ui/error-boundary";
import RouterErrorBoundary from "@/components/ui/router-error-boundary";
import DefaultHome from "./pages/Home";
import PoweredByBadge from "@/components/PoweredByBadge";

const { Pages, Layout, mainPage, Admins, adminMainPage, AdminLayout } = pagesConfig;

// If PAGES is empty, fallback to the Home component imported directly
const mainPageKey = mainPage ?? Object.keys(Pages)[0] ?? 'Home';
const MainPage = Pages[mainPageKey] ?? DefaultHome;

const adminMainPageKey = adminMainPage ?? Object.keys(Admins)[0];
const AdminMainPage = adminMainPageKey ? Admins[adminMainPageKey] : () => <></>;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <></>;

const AdminLayoutWrapper = ({ children, currentPageName }) =>
  AdminLayout ? <AdminLayout currentPageName={currentPageName}>{children}</AdminLayout> : <></>;

/**
 * PUSH/REPLACE -> scroll top
 * POP (back/forward) -> let ScrollRestoration handle restoring
 */
function ScrollBehavior() {
  const navType = useNavigationType();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) return;

    if (navType === "PUSH" || navType === "REPLACE") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [navType, location.pathname, location.search, location.hash]);

  return null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } =
    useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === "user_not_registered") {
      return <UserNotRegisteredError />;
    } else if (authError.type === "auth_required" || !isAuthenticated) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      navigateToLogin();
      return null;
    } else {
      return <>Error</>;
    }
  }

  return (
    <Routes>
      {/* User layout */}
      <Route element={<LayoutWrapper currentPageName={mainPageKey} />}>
        <Route index element={<MainPage />} />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
      </Route>

      {/* LOGIN ROUTE - NO LAYOUT (Standalone) */}
      <Route path="/admin/login" element={<Login />} />

      {/* Admin layout */}
      <Route path="admin" element={<AdminLayoutWrapper currentPageName={adminMainPageKey} />}>
        <Route index element={<AdminMainPage />} />
        {Object.entries(Admins).map(([path, Page]) => (
          <Route key={`admin-${path}`} path={path} element={<Page />} />
        ))}
      </Route>

      {/* 404 */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function RootShell() {
  return (
    <>
      {/* Restore on POP */}
      <ScrollRestoration getKey={(location) => location.pathname + location.search} />
      {/* Force top on PUSH/REPLACE */}
      <ScrollBehavior />

      <NavigationTracker />
      <AuthenticatedApp />
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "*",
    element: <RootShell />,
    errorElement: <RouterErrorBoundary />,
  },
]);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <RouterProvider router={router} />
          <Toaster />
          <VisualEditAgent />
          <PoweredByBadge />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
