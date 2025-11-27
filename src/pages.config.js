import Layout from './Layout.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';

export const PAGES = {
    Home,
};

export const ADMINS = {
    Dashboard,
};

export const PRIVATE_PAGES = {
};

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
    Admins: ADMINS,
    adminMainPage: "Dashboard",
    AdminLayout: AdminLayout,
};

