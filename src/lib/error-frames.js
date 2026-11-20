/**
 * Where an error happened in the app's own code, read from a stack trace or a React component
 * stack, for the error reports the preview sends to the studio (iframe-messaging.js and the
 * error boundaries).
 *
 * The studio's auto-fix loads every `src/…` path it finds in a report as a whole file, so these
 * frames are what point it at the file to fix. Frames inside dependencies (`/node_modules/`, which
 * includes Vite's pre-bundled `.vite/deps`) name nothing the app can fix and are skipped. Vite's
 * `?t=` cache-buster is dropped, so a frame reads the same on every reload.
 *
 * vite-plugins/postmessage-inject.js keeps an inline copy of these rules: it cannot import.
 */

// `…/src/components/Nav.jsx?t=1:43:24` inside a Chrome (`at Name (url)`) or
// Firefox / Safari (`Name@url`) frame.
const SRC_LOCATION = /https?:\/\/[^\s)]*?\/(src\/[^\s):?#]+)[^\s):]*:(\d+):\d+/;
const CHROME_NAME = /\bat\s+(?:async\s+|new\s+)?([^\s(]+)\s+\(/;
const GECKO_NAME = /^\s*([^@\s]+)@/;

/** The app's frames, top first, each location once: `[{ at: 'src/components/Nav.jsx:43', name: 'Nav' }]`. */
export function srcFrames(stack, max = 5) {
  const frames = [];
  for (const line of String(stack || '').split('\n')) {
    if (frames.length >= max) break;
    if (line.includes('/node_modules/')) continue;
    const location = line.match(SRC_LOCATION);
    if (!location) continue;
    const at = `${location[1]}:${location[2]}`;
    if (frames.some((f) => f.at === at)) continue;
    const name = (line.match(CHROME_NAME) || line.match(GECKO_NAME) || [])[1] || '';
    frames.push({ at, name });
  }
  return frames;
}

/** `text`, then one `    at Name (src/…:line)` line per frame. */
export function withFrames(text, frames) {
  if (!frames.length) return text;
  return [text, ...frames.map((f) => `    at ${f.name ? `${f.name} (${f.at})` : f.at}`)].join('\n');
}
