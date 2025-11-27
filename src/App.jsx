import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { setupIframeMessaging } from './lib/iframe-messaging';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage, Admins, adminMainPage, AdminLayout } = pagesConfig;

const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const adminMainPageKey = adminMainPage ?? Object.keys(Admins)[0];
const AdminMainPage = adminMainPageKey ? Admins[adminMainPageKey] : <></>;

setupIframeMessaging();

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <></>;

const AdminLayoutWrapper = ({ children, currentPageName }) => AdminLayout ?
  <AdminLayout currentPageName={currentPageName}>{children}</AdminLayout>
  : <></>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' || !isAuthenticated) {
      // Redirect to login automatically
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      navigateToLogin();
    } else {
      return <>Error </>
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* User layout */}
      <Route element={<LayoutWrapper currentPageName={mainPageKey} />}>
        <Route index element={<MainPage />} />

        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
      </Route>

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


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
