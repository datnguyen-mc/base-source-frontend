# SEO routes — one file per page

Every `.js` file here is picked up automatically (no registration). Files starting with `_`
are helpers, not routes. Site-wide settings (name, default image, robots, sitemap) live in
`src/seo.config.js`.

A file exports one route, or an array of routes:

```js
// src/seo-routes/product-detail.js
export default {
  path: '/products/:id',                 // react-router pattern — order between files does not matter
  type: 'product',                       // static fields are the defaults…
  // …`load` adds the per-URL ones. Return null → 404.
  load: async ({ params, entities }) => {
    const p = await entities.Product.get(params.id);
    if (!p) return null;
    return { title: p.name, description: p.summary, image: p.image, content: p.description, price: p.price, currency: 'USD' };
  },
  // URLs of this dynamic route, for sitemap.xml and build:ssg.
  paths: async ({ entities }) => (await entities.Product.list({ limit: 1000 })).map((p) => `/products/${p.id}`),
};
```

```js
// src/seo-routes/legal.js — several static pages in one file
export default [
  { path: '/terms', title: 'Terms of service' },
  { path: '/privacy', title: 'Privacy policy' },
  { path: '/checkout/*', noindex: true },
];
```

## Fields (all optional except `path`)

| Field | Meaning |
|---|---|
| `title`, `description`, `image`, `keywords` | Page meta (`title` becomes `Title \| Site name`) |
| `type` | `website` · `article` · `discussion` · `product` · `profile` → `og:type` + JSON-LD |
| `noindex` | `true` → robots `noindex`, left out of the sitemap and of build:ssg |
| `canonical` | Path of the preferred URL when several URLs show this page (default: the URL itself) |
| `content` | Text or HTML of the page body, shown to crawlers |
| `items` | `[{ title, url, description? }]` for lists / feeds → links + ItemList |
| `breadcrumbs` | `[{ name, url }]` → BreadcrumbList |
| article / discussion | `author`, `authorUrl`, `publishedAt`, `updatedAt`, `section`, `likeCount`, `commentCount`, `comments: [{ author, text, publishedAt }]` |
| product | `price`, `currency`, `availability` (`InStock` · `OutOfStock` · `PreOrder`) |
| `jsonLd` | Extra JSON-LD object or array, added as is |

## Data: `entities`

The app's own entities, returning plain rows:

```js
await entities.Product.get(id)                                    // → row | null
await entities.Product.list({ filter, sort: '-created_at', limit }) // → rows[]
await entities.Product.findOne({ slug })                          // → row | null
```

Missing data is `null` / `[]`. When the backend is down the SSR server answers 503 by itself
(crawlers retry), so no try/catch is needed. Route files may import the app's helpers
(`@/lib/...`), but nothing that needs `window` at import time.
