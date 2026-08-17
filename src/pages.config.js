import Layout from './Layout.jsx';
import Home from './pages/Home.jsx';

// admin pages
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';

export const PAGES = {
    Home,
};

export const ADMINS = {
    Dashboard,
    // NOTE: The AIFlow Settings admin page (src/pages/admin/AIFlowSettings.jsx)
    // is intentionally NOT registered here in the base scaffold. It depends on
    // the per-app generated `src/lib/aiflow.js`, which does not exist in the
    // base — registering it would force that missing import into every app's
    // build. The AIFlow generation template wires it into ADMINS when AIFlow is
    // enabled for the app.
};

export const PRIVATE_PAGES = {
};

export const pagesConfig = {
    privatePages: PRIVATE_PAGES,
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
    Admins: ADMINS,
    adminMainPage: "Dashboard",
    AdminLayout: AdminLayout,
};

