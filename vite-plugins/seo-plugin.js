import path from 'node:path';
import { runnerImport } from 'vite';

// Applies src/seo.config.js + src/seo-routes/ to every build mode:
//   • index.html — the <!--seo-head--> block gets the site defaults, <html lang> gets site.lang
//   • SPA build  — emits robots.txt and sitemap.xml (static routes; SSR/SSG add dynamic ones)
//   • `vite` dev — serves /robots.txt and /sitemap.xml, full-reloads when the config changes
// The SEO modules are loaded through Vite (aliases, imports, import.meta.glob all work): the dev
// server's SSR loader while serving, a one-off module runner during `vite build`.
const ENTRY = '/src/entry-server.js';
const SEO_HEAD = /<!--seo-head-->[\s\S]*?<!--\/seo-head-->/;

export function seoPlugin() {
  let resolved;
  let devServer;
  let buildEntry;
  const loadEntry = () => {
    if (devServer) return devServer.ssrLoadModule(ENTRY);
    buildEntry ??= runnerImport(ENTRY, {
      root: resolved.root,
      resolve: { alias: resolved.resolve.alias },
      logLevel: 'error',
    }).then((result) => result.module);
    return buildEntry;
  };
  return {
    name: 'vibex-seo',
    configResolved(config) {
      resolved = config;
    },
    async transformIndexHtml(html) {
      const entry = await loadEntry();
      const head = entry.renderIndexHead();
      return html
        .replace(SEO_HEAD, () => head)
        .replace(/<html([^>]*)\slang="[^"]*"/, (_match, attrs) => `<html${attrs} lang="${entry.siteLang()}"`);
    },
    configureServer(server) {
      devServer = server;
      const configFile = path.resolve(resolved.root, 'src/seo.config.js');
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === configFile) server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/robots.txt' && req.url !== '/sitemap.xml') return next();
        const entry = await loadEntry();
        const fallbackUrl = `http://${req.headers.host}`;
        const isRobots = req.url === '/robots.txt';
        res.setHeader('Content-Type', isRobots ? 'text/plain' : 'application/xml');
        res.end(isRobots ? entry.renderRobots({ fallbackUrl }) : entry.renderStaticSitemap({ fallbackUrl }));
      });
    },
    async generateBundle() {
      if (resolved.build.ssr) return;
      const entry = await loadEntry();
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: entry.renderRobots() });
      if (entry.siteUrlOf('')) {
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: entry.renderStaticSitemap() });
      } else {
        this.warn('site.url / SITE_URL is not set — sitemap.xml skipped (sitemaps need absolute URLs).');
      }
    },
  };
}
