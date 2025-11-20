// =============================================
// 1. IMPORT PAGES
// =============================================
import Home from './pages/Home';
// Main layout
import Layout from './Layout.jsx';

// =============================================
// 2. PAGE MAPPING
// =============================================
// - Key: Page name (string) used in router + pagesConfig
// - Value: Corresponding component
// =============================================
export const PAGES = {
    Home: Home,
};

// =============================================
// 3. PRIVATE PAGES (REQUIRES LOGIN)
// =============================================
export const PRIVATE_PAGES = [
    
];

// =============================================
// 4. GLOBAL CONFIG FOR ROUTING SYSTEM
// =============================================
// AI should automatically:
// - Create new page files
// - Add import statements
// - Register pages inside PAGES / PRIVATE_PAGES
// - Update Layout or Router when needed
// =============================================
export const pagesConfig = {
    mainPage: 'Home',
    Pages: PAGES,
    PrivatePages: PRIVATE_PAGES,
    Layout: Layout,
};
