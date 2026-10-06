import { vibex } from '@/api/vibexClient';
// Data access for src/seo.config.js — the SAME entities the pages use, flattened so a config
// never deals with response envelopes:
//
//   await entities.Product.get(id)                                  → row | null
//   await entities.Product.list({ filter, sort: '-created_at', limit }) → rows[]
//   await entities.Product.findOne({ slug })                        → row | null
//
// "Not found" is an answer: null / []. A backend that cannot answer (network error, timeout,
// 5xx) throws SeoDataUnavailableError instead, so the SSR server replies 503 — crawlers retry
// later — rather than 404, which would get the page dropped from the index. Reads are cached
// briefly; outages are never cached.
const TIMEOUT_MS = 4000;
const FOUND_TTL_MS = 60 * 1000;
const MISSING_TTL_MS = 10 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map();
const inflight = new Map();
export class SeoDataUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeoDataUnavailableError';
  }
}
const toRow = (res) => {
  const row = res && typeof res === 'object' && !Array.isArray(res) && 'data' in res ? res.data : res;
  return row && typeof row === 'object' && !Array.isArray(row) && (row.id ?? row._id) != null ? row : null;
};
const toList = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return Array.isArray(res?.data?.data) ? res.data.data : [];
};
// The API takes sort as a string ('-created_at'); accept the { created_at: -1 } form too.
const toSort = (sort) =>
  sort && typeof sort === 'object'
    ? Object.entries(sort)
        .map(([field, dir]) => (Number(dir) < 0 || String(dir).toLowerCase() === 'desc' ? `-${field}` : field))
        .join(',')
    : sort;
const withTimeout = (promise) => {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new SeoDataUnavailableError(`timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
const read = (key, call, shape) => {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  // Identical reads in flight (two crawlers on one page) share a single request.
  if (!inflight.has(key)) inflight.set(key, fetchFresh(key, call, shape).finally(() => inflight.delete(key)));
  return inflight.get(key);
};
const fetchFresh = async (key, call, shape) => {
  let value;
  try {
    const res = await withTimeout(call());
    // The SDK resolves undefined when the request never got an answer (network error).
    if (res === undefined) throw new SeoDataUnavailableError('no response');
    value = shape(res);
  } catch (err) {
    const status = Number(err?.status);
    if (err instanceof SeoDataUnavailableError || !(status >= 400 && status < 500)) {
      const error = new SeoDataUnavailableError(`[seo] ${key} failed: ${err?.message || 'request failed'}`);
      console.error(error.message);
      throw error;
    }
    // 4xx: the row does not exist or is not public. An unknown entity name is a config bug.
    if (status === 404) console.warn(`[seo] ${key}: ${err?.message || 'not found'}`);
    value = shape(undefined);
  }
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + (empty ? MISSING_TTL_MS : FOUND_TTL_MS) });
  return value;
};
const entity = (name) => {
  const api = vibex.entities[name];
  return {
    get: (id) => (id == null || id === '' ? Promise.resolve(null) : read(`${name}.get(${id})`, () => api.get(id), toRow)),
    list: ({ filter, sort, limit = 50, page } = {}) =>
      read(
        `${name}.list(${JSON.stringify([filter, toSort(sort), limit, page])})`,
        () => api.list({ filter, sort: toSort(sort), limit, page }),
        toList,
      ),
    findOne: (filter = {}) =>
      read(`${name}.findOne(${JSON.stringify(filter)})`, () => api.list({ filter, limit: 1 }), (res) => toList(res)[0] || null),
  };
};
export const entities = new Proxy({}, { get: (_target, name) => entity(String(name)) });
