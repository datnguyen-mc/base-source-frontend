/**
 * Layout Template
 * This is the default layout component.
 * It wraps all generated pages and provides a consistent app shell.
 *
 * Usage for AI:
 * ----------------------------------------------------
 * - Always wrap new pages inside:
 *      <Layout currentPageName="...">{children}</Layout>
 *
 * - Do NOT duplicate Sidebar, Header, or Footer.
 *   These components already exist inside the Layout.
 *
 * - This layout is optimized for internal web apps:
 *      ✔ Dashboard
 *      ✔ CRM
 *      ✔ ERP
 *      ✔ SaaS platforms
 *
 * - The <main> container uses full-width spacing:
 *
 *      <main className="relative w-full px-6 lg:px-10">
 *        {children}
 *      </main>
 *
 *   → Meaning:
 *     - Pages should be fluid (expand across the screen)
 *     - Suitable for dashboards, tables, forms, analytics, widgets
 *     - Content is NOT boxed into a narrow max-width like landing pages
 *
 * - When designing:
 *     * Dashboard pages → use grid layouts, cards, stats, charts.
 *     * CRM pages → lists, data tables, detail panels, filters.
 *     * ERP pages → structured modules, flexible layouts, split panes.
 *     * SaaS pages → clean spacing, modern typography, responsive grids.
 *
 * - The Layout intentionally avoids max-w constraints so that
 *   complex data-heavy screens have enough horizontal space.
 *
 * - AI must generate content that fits naturally inside this
 *   enterprise-style container.
 *
 * - DO NOT rely on Base44 marketing hero layout here.
 *   Dashboard-style pages should follow application UI patterns.
 *
 * ----------------------------------------------------
 */
