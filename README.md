# VibeX App

Base source frontend built with **React 18** + **Vite 6** + **TailwindCSS 3**.

---

## Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run development server

```bash
npm run dev
```

The app will be available at **http://localhost:5173**

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (port 5173) |
| `npm run dev:low-mem` | Start dev server with low memory mode (256MB) |
| `npm run dev:ssr` | Start the SSR dev server on top of Vite, with HMR (port `PORT`, default 3000) |
| `npm run build` / `npm run build:spa` | **SPA** build → `dist/` (static hosting, client-side rendering) |
| `npm run build:ssr` | **SSR** build → `dist/client` + `dist/server` (needs a Node server) |
| `npm run build:ssg` | **SSG** build → `dist/` with one prerendered HTML file per route (static hosting) |
| `npm run start:ssr` | Run the production SSR server (after `build:ssr`) |
| `npm run preview` | Preview the SPA / SSG build |

---

## Build modes

| Mode | Build | Run / deploy | Use when |
|---|---|---|---|
| SPA | `npm run build` | Upload `dist/`, rewrite every path to `/index.html` | Admin tools, apps behind login — SEO does not matter |
| SSR | `npm run build:ssr` | `npm run start:ssr` on Node ≥ 20.19 | Public content that changes often (posts, products) |
| SSG | `npm run build:ssg` | Upload `dist/`, rewrite unknown paths to `/spa.html` | Public pages known at build time, no Node server |

Environment variables:

- `VITE_APP_ENV=production` at build time drops the dev-only Vite plugins.
- `SITE_URL` — public origin (overrides `site.url` in `src/seo.config.js`). Without either,
  SSR uses the request host and SSG writes no canonical URLs and no sitemap.
- `PORT` (SSR) — default `3000`. HMR in `dev:ssr` uses the same port.

```bash
VITE_APP_ENV=production SITE_URL=https://example.com npm run build:ssg
VITE_APP_ENV=production npm run build:ssr && PORT=3000 npm run start:ssr
```

---

## SEO

| File | Controls |
|---|---|
| `src/seo.config.js` | Site defaults for `index.html` (name, description, image, icons, `lang`, public URL, search URL), `robots.txt`, `sitemap.xml`, `strict` 404s |
| `src/seo-routes/*.js` | **One file per page**: title, description, image, `type` (JSON-LD), `content`, `items`, `breadcrumbs`, `canonical`, `noindex`, `load()` for data, `paths()` for dynamic URLs — picked up automatically, see `src/seo-routes/README.md` |

```js
// src/seo-routes/product-detail.js
export default {
  path: '/products/:id',
  type: 'product',
  load: async ({ params, entities }) => {
    const p = await entities.Product.get(params.id);
    return p && { title: p.name, description: p.summary, image: p.image, price: p.price, currency: 'USD' };
  },
  paths: async ({ entities }) => (await entities.Product.list({ limit: 1000 })).map((p) => `/products/${p.id}`),
};
```

`entities.X.get(id)` / `.list({ filter, sort, limit })` / `.findOne(filter)` are the app's own
entities, returning plain rows — `null` / `[]` when there is no data; return `null` from `load`
for a 404. When the backend itself is down, SSR answers **503** with the SPA shell (crawlers
retry instead of dropping the page) and `build:ssg` fails. The same files also set the browser
tab title and description — no per-page code needed.

| Build | First HTML response | In the browser | robots.txt | sitemap.xml |
|---|---|---|---|---|
| SPA | site defaults | per-route title + description | ✓ | static routes (needs `site.url`) |
| SSR | per-route head + crawlable HTML | per-route title on navigation | ✓ | static + `paths()` |
| SSG | per-route head + crawlable HTML | per-route title on navigation | ✓ | pages actually built |

`src/seo/` (engine), `src/entry-server.js`, `server.js`, `scripts/prerender.js` and
`vite-plugins/seo-plugin.js` are shared infrastructure — the same in every app; only
`src/seo.config.js` and `src/seo-routes/` belong to the app.
