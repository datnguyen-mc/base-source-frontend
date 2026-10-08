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
- `SSR_CACHE_TTL` (SSR) — seconds a rendered page is kept, default `60` in production, `0` (off)
  in `dev:ssr`. `SSR_CACHE_STALE` — seconds an expired page is still answered while it re-renders
  in the background, default `600`. `SSR_LOG=off` silences the per-request log.

### Caching (SSR)

| Layer | What is cached | How long |
|---|---|---|
| Page HTML | The rendered page per URL (pages render as a signed-out visitor sees them, so it is the same for everybody). Header `X-SSR-Cache: HIT / MISS / STALE` | `SSR_CACHE_TTL`, then stale-while-revalidate for `SSR_CACHE_STALE` |
| CDN | `Cache-Control: s-maxage` + `stale-while-revalidate` on cacheable pages; errors / 503 are `no-store` | Same as above |
| Concurrent requests | Requests for a page that is rendering wait for that one render | — |
| SEO data (`entities`) | Rows read by `src/seo.routes.js` | 60 s (missing rows 10 s) |
| `sitemap.xml` | Built sitemap | 10 min |
| `/assets/*` | Hashed JS / CSS, gzip / brotli | 1 year, `immutable` |

```bash
VITE_APP_ENV=production SITE_URL=https://example.com npm run build:ssg
VITE_APP_ENV=production npm run build:ssr && PORT=3000 npm run start:ssr
```

---

## SEO

| File | Controls |
|---|---|
| `src/seo.config.js` | Site defaults for `index.html` (name, description, image, icons, `lang`, public URL, search URL), `robots.txt`, `sitemap.xml`, `strict` 404s |
| `src/seo.routes.js` | **Every page, one file**: title, description, image, `type` (og:type), `content`, `items`, `breadcrumbs`, `canonical`, `noindex`, `load()` for data, `paths()` for dynamic URLs — field list in the file header |

```js
// src/seo.routes.js
export default [
  { path: '/', title: 'Home' },
  {
    path: '/products/:id',
    type: 'product',
    load: async ({ params, entities }) => {
      const p = await entities.Product.get(params.id);
      return p && { title: p.name, description: p.summary, image: p.image };
    },
    paths: async ({ entities }) => (await entities.Product.list({ limit: 1000 })).map((p) => `/products/${p.id}`),
  },
  { path: '/admin/*', noindex: true },
];
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

`index.html` stays a plain HTML file — no placeholders. The SEO tags it already has (title,
description, Open Graph, Twitter, canonical…) are replaced, and the new ones appended before
`</head>`; the crawlable HTML goes into `<div id="root">`. Tags the config does not provide
(e.g. an icon) are kept.

`src/seo/` (engine), `src/entry-server.js`, `server.js`, `scripts/prerender.js` and
`vite-plugins/seo-plugin.js` are shared infrastructure — the same in every app; only
`src/seo.config.js` and `src/seo.routes.js` belong to the app.

---

## SSR — writing pages that render on the server

In the SSR and SSG builds every indexable page (not `noindex` in `src/seo.routes.js`) is rendered
by the real React app on the server and hydrated in the browser. `noindex` pages (login, account,
admin…) stay client-rendered. The response header `X-SSR` shows `rendered`, `fallback` (the app
threw on the server — see the log) or `unavailable` (backend down, 503).

**1. Data: a loader instead of a first-load `useEffect`.** Effects never run on the server.

```jsx
import { useLoaderData } from 'react-router-dom';
import { pageLoader } from '@/seo/ssr';

const loadPost = async (id) => (await Post.get(id))?.data || null;

export default function PostDetail() {
  const { id } = useParams();
  const loaded = useLoaderData();                          // server data, also used to hydrate
  const [post, setPost] = useState(() => loaded?.post || null);
  useEffect(() => {
    if (loaded?.post) return;                              // already there
    loadPost(id).then(setPost);                            // no server data → fetch as before
  }, [id, loaded]);
  …
}
// Runs on the server only, for the server-rendered response. In the browser useLoaderData() is
// null — client-side navigation never waits on the network — so keep the useEffect fetch above.
// A failure or a slow backend on the server is null too: the page simply loads in the browser.
PostDetail.loader = pageLoader(async ({ params }) => ({ post: await loadPost(params.id) }));
```

A layout can have one too (`Layout.loader`), read with `useLoaderData()` inside the layout.
Loader data is written into the page: **never return private fields** (email, role, tokens).

**2. Browser-only values: `useBrowserState`, never a `useState` initializer.** Reading
`localStorage`, `sessionStorage`, `matchMedia` or the window size while rendering makes the
server and browser markup differ.

```jsx
import { useBrowserState } from '@/seo/ssr';
const [view, setView] = useBrowserState(() => localStorage.getItem('view') || 'card', 'card');
```

**3. DOM widgets go in `<ClientOnly>`.** Maps, editors, canvas charts… render in the browser
only, so server and browser markup stay identical:

```jsx
import { ClientOnly } from '@/seo/ssr';
<ClientOnly fallback={<div className="h-64" />}><MapContainer … /></ClientOnly>
```

Well-known browser-only packages (leaflet, react-leaflet, quill, react-quill, html2canvas, jspdf,
ffmpeg, html5-qrcode, mapbox, apexcharts, lottie, konva…) are replaced by an inert stand-in in the
server build, so importing them at the top of a file is safe. Any other library that touches
`window`/`document` when imported should be loaded with `lazy(() => import(…))`.

No `window`/`document`/`localStorage` at module level either — guard with
`typeof window !== 'undefined'`, or move it into an effect or event handler.

**4. No session caches on the server.** One server process serves every visitor: a module-level
cache (`let listCache = …`) written while rendering goes stale and leaks between visitors. Only
write it in the browser (`if (typeof window !== 'undefined') listCache = list`).

DOMPurify works on the server as is (it is given a jsdom window), and the auth check never blocks
a server-rendered page: it renders as a signed-out visitor sees it, then updates in the browser.

### Safety nets — breaking a rule never breaks the app

| Mistake | What happens |
|---|---|
| A page reads `window` / `localStorage` while rendering | That page is sent client-rendered; every other page still renders on the server |
| A module touches `window` at import time | Every page is sent client-rendered until it is fixed; the server log names the file once |
| A loader throws or hangs (over 4 s) | Loaders are wrapped in `pageLoader` automatically: the page gets `null` and loads in the browser |
| A loader throws `redirect()` / a `Response` | Passed through: the server answers with that redirect / status |
| A promise nobody handles while rendering | Logged; the server keeps serving |
| Server and browser markup differ | React re-renders in the browser; logged as a warning, not a crash |

