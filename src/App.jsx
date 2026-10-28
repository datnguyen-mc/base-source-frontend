import "./App.css";
import React, { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import VisualEditAgent from "@/lib/VisualEditAgent";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useNavigationType,
  useLocation,
} from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider } from "./lib/AuthProvider";
import { useAuth } from "./lib/useAuth";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import IpAccessRestricted from "@/components/IpAccessRestricted";
import Login from "./pages/admin/Login";
import ErrorBoundary from "@/components/ui/error-boundary";
import RouterErrorBoundary from "@/components/ui/router-error-boundary";
import DefaultHome from "./pages/Home";
import PoweredByBadge from "@/components/PoweredByBadge";
import { syncDocumentHead } from "@/seo/client";
import { markHydrated, pageLoader, serverRendered } from "@/seo/ssr";

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

/**
 * Title + meta description follow src/seo.routes.js — on navigation, and on the first load
 * when the head was not server-rendered for this page (SPA build).
 */
function DocumentHeadSync() {
  const location = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    syncDocumentHead(location.pathname + location.search, { initial: firstRender.current });
    firstRender.current = false;
  }, [location.pathname, location.search]);

  return null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin, ipBlocked } =
    useAuth();

  // HIGHEST PRIORITY — before loading, before authError, before any route.
  // The app owner has restricted access by IP and this visitor is not on the
  // list, so there is nothing else worth rendering: every request returns 403,
  // a spinner here would never resolve, and the auth branch below would send
  // them to a login page they cannot get past either. The flag is sticky in
  // AuthProvider, so nothing that happens later can demote this screen.
  if (ipBlocked || authError?.type === "ip_not_allowed") {
    return <IpAccessRestricted />;
  }

  // A server-rendered page shows its content right away; the auth check finishes in the background.
  if ((isLoadingPublicSettings || isLoadingAuth) && !serverRendered) {
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

  return <Outlet />;
};

function RootShell() {
  return (
    <>
      {/* Restore on POP */}
      <ScrollRestoration getKey={(location) => location.pathname + location.search} />
      {/* Force top on PUSH/REPLACE */}
      <ScrollBehavior />
      <DocumentHeadSync />

      <NavigationTracker />
      <AuthenticatedApp />
    </>
  );
}

// One route table for the browser router and the SSR static handler (src/seo/render-app.jsx).
// A page (or a layout) can load its data on the server for SSR through a static property, read in
// it with useLoaderData(). It runs for the server-rendered response only: in the browser it is null,
// so navigation never waits on the network and the page fetches in useEffect as before:
//   PostDetail.loader = pageLoader(async ({ params }) => ({ post: await Post.get(params.id) }));
// Every loader is wrapped in pageLoader here, so one that throws or hangs can never turn a page
// into an error screen: it resolves to null and the page loads its data in the browser.
const withLoader = (Component) => (Component?.loader ? pageLoader(Component.loader) : undefined);
const page = (Page) => ({ element: <Page />, loader: withLoader(Page) });

export const routes = [
  {
    element: <RootShell />,
    errorElement: <RouterErrorBoundary />,
    children: [
      // User layout
      {
        element: <LayoutWrapper currentPageName={mainPageKey} />,
        loader: withLoader(Layout),
        children: [
          { index: true, ...page(MainPage) },
          ...Object.entries(Pages).map(([path, Page]) => ({ path, ...page(Page) })),
        ],
      },
      // LOGIN ROUTE - NO LAYOUT (Standalone)
      { path: "/admin/login", element: <Login /> },
      // Admin layout
      {
        path: "admin",
        element: <AdminLayoutWrapper currentPageName={adminMainPageKey} />,
        loader: withLoader(AdminLayout),
        children: [
          { index: true, ...page(AdminMainPage) },
          ...Object.entries(Admins).map(([path, Page]) => ({ path, ...page(Page) })),
        ],
      },
      // 404
      { path: "*", element: <PageNotFound /> },
    ],
  },
];

/** Everything around the router — shared by the browser app and the SSR render. */
export function AppProviders({ children, queryClient = queryClientInstance }) {
  // Runs after every child mounted: from here on useBrowserState reads the browser right away.
  useEffect(() => markHydrated(), []);
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster />
          <VisualEditAgent />
          <PoweredByBadge />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

// Created on first render, not at import: the server imports this module too. A server-rendered
// page's loader data (window.__staticRouterHydrationData) is picked up automatically.
let browserRouter;

function App() {
  browserRouter ??= createBrowserRouter(routes);
  return (
    <AppProviders>
      <RouterProvider router={browserRouter} />
    </AppProviders>
  );
}

export default App;
