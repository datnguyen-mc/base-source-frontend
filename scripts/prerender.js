import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SSG step of `npm run build:ssg`: renders every indexable path from src/seo.config.js into
// static HTML inside dist/, next to the normal SPA build, plus sitemap.xml and robots.txt.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const SEO_HEAD = /<!--seo-head-->[\s\S]*?<!--\/seo-head-->/;
const SSR_OUTLET = '<!--ssr-outlet-->';
const CONCURRENCY = 8;

// dist/<path>/index.html for a clean URL path; null when the path has a query, or would land
// outside dist/ (paths often come from data, e.g. a slug containing "../").
const fileFor = (urlPath) => {
  if (!urlPath.startsWith('/') || /[?#\\]/.test(urlPath)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (/[\\\0]/.test(decoded) || decoded.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  const file = path.resolve(distDir, `.${decoded}`, 'index.html');
  return file.startsWith(distDir + path.sep) ? file : null;
};

const template = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
const entry = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href);
const siteUrl = entry.siteUrlOf('');
if (!siteUrl) {
  console.warn('[ssg] site.url (src/seo.config.js) / SITE_URL is not set — no canonical URLs, no sitemap.xml.');
}

try {
  // The untouched shell, for host rewrites of paths that were not prerendered.
  await fs.writeFile(path.join(distDir, 'spa.html'), template);
  const paths = await entry.listPaths();
  const written = [];
  const failed = [];
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const urlPath = paths[next++];
      const file = fileFor(urlPath);
      if (!file) {
        console.warn(`[ssg] skipped ${urlPath} — not a plain path inside dist/`);
        continue;
      }
      try {
        const page = await entry.render(urlPath);
        if (page.status !== 200) {
          console.warn(`[ssg] skipped ${urlPath} — status ${page.status}`);
          continue;
        }
        // Function replacements: page content may contain `$&`, `$'`… which a string would expand.
        const html = template.replace(SEO_HEAD, () => page.head).replace(SSR_OUTLET, () => page.html);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, html);
        written.push(urlPath);
        console.log(`[ssg] ${urlPath} → ${path.relative(root, file)}`);
      } catch (err) {
        failed.push(urlPath);
        console.error(`[ssg] ${urlPath} failed:`, err?.message || err);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await fs.writeFile(path.join(distDir, 'robots.txt'), entry.renderRobots());
  if (siteUrl) {
    const ordered = paths.filter((p) => written.includes(p));
    await fs.writeFile(path.join(distDir, 'sitemap.xml'), await entry.renderSitemap({ paths: ordered }));
  }
  console.log(`[ssg] ${written.length} page(s) written to dist/${siteUrl ? ' with sitemap.xml' : ''}`);
  if (failed.length) {
    console.error(`[ssg] ${failed.length} page(s) failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await fs.rm(ssrDir, { recursive: true, force: true });
}
