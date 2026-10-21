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
| `npm run dev:ssr` | Start the SSR dev server on top of Vite, with HMR (port `PORT`, default 5173) |
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
| SSR | `npm run build:ssr` | Deploy `server.prod.mjs`, `dist/`, `public/`, `package.json` — no `node_modules` — and run `npm run start:prod` on Node ≥ 20.19 (`npm run start:ssr`: the same from `server.js`, with `node_modules`) | Public content that changes often (posts, products) |
| SSG | `npm run build:ssg` | Upload `dist/`, rewrite unknown paths to `/spa.html` | Public pages known at build time, no Node server |

Environment variables:

- `VITE_APP_ENV=production` at build time drops the dev-only Vite plugins (visual editing: source
  attributes on every element, the Tailwind CDN script). `build:ssr` and `build:ssg` set it
  themselves — they only make sites to serve; set `VITE_APP_ENV` to something else to keep the plugins.
- `SITE_URL` — public origin (overrides `site.url` in `src/seo.config.js`). Without either,
  SSR uses the request host and SSG writes no canonical URLs and no sitemap.
- `PORT` (SSR) — default `5173`, the same port `npm run dev` uses. HMR in `dev:ssr` rides this port too.
- `SSR_CACHE_TTL` (SSR) — seconds a rendered page is kept, default `60` in production, `0` (off)
  in `dev:ssr`. `SSR_CACHE_STALE` — seconds an expired page is still answered while it re-renders
  in the background, default `600`. `SSR_LOG=off` silences the per-request log.
- `SSR_EFFECTS_TIMEOUT` (SSR / SSG) — milliseconds a page's effects get to load their data on the
  server, default `3000`; past it the page is sent with what has arrived.

First visit, every mode: a spinner shows until the app's stylesheet has arrived, instead of a white
page (a stylesheet linked in `<head>` holds the first paint — seconds on a slow connection).
`vite-plugins/loading-plugin.js` puts `src/loading.css` into `<head>` (the page held back, the
spinner in its place) and, in the build, links the app's stylesheet right after `#root`, preloaded
in `<head>`; `src/loaded.css`, bundled into that stylesheet, lets the page go. Stylesheets
`index.html` links from other sites in `<head>` (e.g. Google Fonts) move there too, before the
app's own — a web font may then swap in after the page shows. SSR: a browser opening a page that
is not cached yet gets its start (`<head>`, the spinner) at once, while the page's data loads on
the server, and the rest when rendered (`X-SSR: early`); crawlers always get the page whole.

Published SSR server: `build:ssr` bundles every package the render uses into `dist/server`
(`ssr.noExternal`) and server.js with express / compression / sirv into `server.prod.mjs`
(`vite-plugins/server-bundle-plugin.js`), so it runs without `node_modules`. A package with a
native addon, or one reading its own files at run time, may need a fix there (jsdom has one).

Memory (SSR): `start:prod` / `start:ssr` run Node with `--max-semi-space-size=1 --optimize-for-size`
and `MALLOC_ARENA_MAX=2` — a smaller V8 young generation and fewer glibc arenas, so a server under
traffic keeps far less memory (a little more GC). A pod that starts `node server.prod.mjs --prod`
itself needs the same flags and env. The build also writes `.br` / `.gz` copies of its assets (JS,
CSS…; not HTML), which the server sends as they are instead of compressing each response.

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
VITE_APP_ENV=production npm run build:ssr && PORT=5173 npm run start:ssr
```

---

## SEO

| File | Controls |
|---|---|
| `src/seo.config.js` | Site defaults for `index.html` (name, description, image, icons, `lang`, public URL, search URL), `robots.txt`, `sitemap.xml`, `strict` 404s |
| `src/seo.routes.js` | **Every page, one file**: title, description, image, `type` (og:type), `content`, `items`, `breadcrumbs`, `canonical`, `noindex`, `imageAlt`, `author`, `alternates` (hreflang), extra `meta` / `links`, `jsonLd`, `load()` for data, `paths()` for dynamic URLs — field list in the file header |

Structured data (JSON-LD) comes with it: `WebSite` on the home page (with a search box when
`site.searchUrl` is set), `BreadcrumbList` from `breadcrumbs`, and whatever a route returns as
`jsonLd` (`@context` is added) — never on `noindex` pages.

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
retry instead of dropping the page) and `build:ssg` fails. The same files also keep the head
right in the browser — no per-page code needed: on every navigation `src/seo/client.js` renders
the page's head with the same `renderHead()` the server uses. Every tag it writes carries
`data-seo`; the browser swaps exactly those for the next page's (whatever tags a route declares,
JSON-LD included), and puts `index.html`'s own tags aside only while a page has its own of that kind.

| Build | First HTML response | In the browser | robots.txt | sitemap.xml |
|---|---|---|---|---|
| SPA | site defaults | per-route head | ✓ | static routes (needs `site.url`) |
| SSR | per-route head + crawlable HTML | per-route head on navigation | ✓ | static + `paths()` |
| SSG | per-route head + crawlable HTML | per-route head on navigation | ✓ | pages actually built |

Files in `public/` (e.g. uploaded by the app's owner) are served at `/<name>` as they are after
the next build — search engine verification files (`naver….html`, `google….html`,
`BingSiteAuth.xml`), `.well-known/…`, and also `robots.txt` / `sitemap.xml`: an app's own
`public/robots.txt` or `public/sitemap.xml` replaces the generated one in every build mode, and
only a missing one is generated.

The base ships a default `public/robots.txt` (allow everything, block `/admin`), served as it
is — edit or replace it per app (to point crawlers to the sitemap, add its full URL:
`Sitemap: https://my-app.example/sitemap.xml`); delete it to have one generated from
`src/seo.config.js`.

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

**The HTML is the full page — as Postman, `curl` or a crawler gets it, without running any
script:** its data (rule 1) and visible content (rule 6), with no change to the page code.

**1. Data: a plain `useEffect` works.** The server runs the page's effects like the browser does:
it renders the page, runs its `useEffect`s, waits for the requests they make, and renders again —
until nothing changes (or `SSR_EFFECTS_TIMEOUT` is spent). The HTML has the data, and the browser
hydrates it as is: every `useState` starts from the value the server rendered with, and the
effects' requests are answered from the server's responses, so the page never flashes back to
its loading state.

```jsx
export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Post.get(id).then((res) => setPost(res?.data)).finally(() => setLoading(false));
  }, [id]);
  if (loading) return <Spinner />;
  …                                                        // ← this is what the server sends
}
```

How it works: `vite-plugins/seo-plugin.js` points `import … from 'react'` in the app's files to
`src/seo/hooks.js` (shared infrastructure — `src/seo`, `src/lib/AuthProvider.jsx`… — keeps the real
React), whose `useState` / `useReducer` / `useRef` / `useMemo` / `useCallback` / `useEffect` /
`useLayoutEffect` are driven by `src/seo/server-effects.js` on the server. While an effect runs on
the server:

- it can only **read**: a `POST` / `PUT` / `PATCH` / `DELETE` never leaves (the promise stays
  pending — a crawler never creates, likes or counts anything), and no `WebSocket` / `EventSource`
  opens;
- `localStorage` / `sessionStorage` are there, empty (a signed-out visitor's browser); an error it
  throws (`window`…) is ignored, before or after an `await` — the browser runs the same effect
  again for real;
- its `setTimeout`s up to 1 s (a debounce…) are waited for; every timer and interval it starts is
  cleared, and its cleanup called, when the render ends;
- the visitor is signed out (the auth check never runs on the server), as for the rest of SSR.

In the browser, hydration starts every `useState` from the value the server rendered (so the
markup matches). The effects run again: a signed-out visitor's requests are answered from the
server's responses, a signed-in visitor's go to the network, and the page keeps what the server
rendered until they land — it never flashes back to its loading state. Client-side navigation is
unchanged: pages mounted after that load as they always did. The server log shows the time spent
(`effects 210ms`).

**A loader is still the fastest way** for the main data of a page: it runs before the first
render, and its data comes with the page as well.

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
cache (`let listCache = …`) written while rendering — or by an effect, which the server runs too —
goes stale and leaks between visitors. Only write it in the browser
(`if (typeof window !== 'undefined') listCache = list`).

**5. State the browser can be handed: JSON.** A `useState` holding a `Date`, a `Map`, a class…
once an effect has set it is rendered with its initial value on the server (hydration could not
start from it). Keep data as it came from the API (ISO strings) and format it while rendering.

**6. Content is visible in the HTML.** framer-motion is handled for you: the app's
`import … from 'framer-motion'` goes through `src/seo/motion.js`, so every `motion.*` / `m.*` /
`motion.create(…)` element rendered on the server — or hydrated from it — starts at its final
state (`initial={false}`) instead of `initial={{ opacity: 0 }}` / `initial="hidden"`; one mounted
later (client-side navigation) animates as written. Anything else that hides content until a
script runs must start visible, e.g. a reveal driven by an IntersectionObserver:

```jsx
const [shown, setShown] = useBrowserState(() => false, true);   // visible in the HTML
<div className={shown ? 'opacity-100' : 'opacity-0'} …>
```

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
| An effect reads `window` / throws on the server | Ignored (not logged); the browser runs it again |
| An effect writes (create, update, like…) | Held back on the server; done by the browser |
| An effect's request is slow (over `SSR_EFFECTS_TIMEOUT`) | The page is sent with what has arrived; the rest loads in the browser |
| An effect keeps changing state | At most 8 render passes; each effect re-runs at most 3 times |
| A pass breaks once the data is in | The last pass that rendered is sent |
| A motion element starts hidden (`initial={{ opacity: 0 }}`, `initial="hidden"`) | Rendered at its final state on the server and while hydrating; animates after navigation |
| A page shows an email address and the site is behind Cloudflare (Email Obfuscation) | Cloudflare rewrites it in the HTML; `src/seo/cloudflare.js` puts it back before hydrating, so the page hydrates as rendered |
| Server and browser markup differ | React re-renders in the browser; logged as a warning, not a crash |

