// The site-wide values of index.html's <head> (title, description, image, icons, <html lang>…) in
// CSR — `vite` and the SPA build: vite-plugins/seo-plugin.js serves them in place of this file,
// read anew whenever index.html changes, and src/seo/engine.js lays them over `site` of
// src/seo.config.js. Server-rendered modes (dev:ssr, build:ssr, build:ssg) get this file as it is:
// nothing, src/seo.config.js alone.
export default null;
