/**
 * @file server/overpassProxy.js
 * @description §OVERPASS-PROXY — same-origin server proxy + shared cache for the
 *   keyless OSM Overpass API that feeds the Forma 3D-Site CONTEXT (surrounding
 *   buildings / roads / parks / water).
 *
 * WHY THIS EXISTS
 * ---------------
 * The client context loaders (apps/editor/src/ui/geospatial/context*.ts) POST
 * Overpass-QL bbox queries DIRECTLY to the public mirrors (overpass-api.de,
 * overpass.kumi.systems, overpass.private.coffee). Those mirrors rate-limit
 * PER CLIENT IP and routinely answer `429 Too Many Requests` or time out under
 * the founder's heavy demo testing, so the surrounding context "doesn't render"
 * (recurring complaint: `overpass-api.de HTTP 429`, `all Overpass mirrors
 * failed/offline`).
 *
 * THE FIX — a same-origin proxy with a SHARED server-side cache:
 *   - Every browser now POSTs its Overpass-QL to `/api/overpass` on OUR origin.
 *   - The server forwards it ONCE to the public mirrors (from the SERVER IP,
 *     tried in order, sane timeout + one retry), then CACHES the response keyed
 *     by a hash of the query with a 24 h TTL and a bounded size.
 *   - Because the cache is shared across ALL clients + demo reloads, the same
 *     city/bbox is fetched from Overpass ONCE and served instantly thereafter —
 *     bypassing per-browser 429s entirely.
 *   - Same-origin → CSP `connect-src 'self'` already covers it (no header
 *     change). The public mirror origins remain in the CSP so the client's
 *     direct-mirror FALLBACK (when the proxy itself is unreachable) still works.
 *
 * CONTRACT / POSTURE (mirrors server/leads.js + server/cspReport.js):
 *   - NEVER crashes the server on upstream failure — a total-failure path
 *     answers HTTP 200 with `{ elements: [] }` so the client's existing
 *     non-fatal "empty collection" path renders the scene with no context.
 *   - Permissive same-origin cache headers on the response.
 *   - Bounded in-memory cache (LRU-ish: oldest insertion evicted first).
 *
 * @see apps/editor/src/ui/geospatial/contextBuildings.ts (OVERPASS_ENDPOINTS + client fallback)
 * @see server/securityHeaders.js (connect-src 'self' already covers /api/overpass)
 */

import express from 'express';
import { createHash } from 'crypto';

export const OVERPASS_PATH = '/api/overpass';

/**
 * The public keyless Overpass mirrors, in try-order. Kept in SYNC with the
 * client `OVERPASS_ENDPOINTS` (apps/editor/src/ui/geospatial/contextBuildings.ts)
 * — the same list the browser used to hit directly, now hit server-side once.
 */
export const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    // L-422 — additional established public mirrors so a rate-limited server IP
    // (the founder's heavy demo testing 429s the first three) has more chances to
    // resolve context before degrading to "no context". High-capacity + reliable.
    'https://overpass.osm.ch/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
];

// ── Body parser ─────────────────────────────────────────────────────────────
// The client POSTs `data=<url-encoded QL>` as application/x-www-form-urlencoded
// (unchanged), but we also accept a JSON `{ query }` body for flexibility. A
// generous 256 KB cap covers even a large multi-clause QL query.
const urlencodedParser = express.urlencoded({ extended: false, limit: '256kb' });
const jsonParser = express.json({ type: ['application/json'], limit: '256kb' });
/** Combined body parser to mount ahead of the handler. */
export function overpassBodyParser(req, res, next) {
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('application/json')) return jsonParser(req, res, next);
    return urlencodedParser(req, res, next);
}

// ── Shared in-memory cache ──────────────────────────────────────────────────
/** Cache TTL — 24 h. A city's OSM footprints change slowly; a day-stale context
 *  massing study is completely acceptable and eliminates repeat Overpass calls. */
export const OVERPASS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Bounded size — evict the OLDEST entry when exceeded (insertion-order LRU-ish).
 *  Each entry is a parsed-then-restringified Overpass JSON (tens–hundreds of KB);
 *  256 distinct bbox queries is a generous working set for the whole server. */
export const OVERPASS_CACHE_MAX_ENTRIES = 256;
/** Per-mirror upstream timeout (ms). Generous vs. the client's 9 s because the
 *  server pays it ONCE for the whole fleet (result is then cached), and a slow
 *  legitimate large-city response is worth waiting for so it gets cached. */
export const OVERPASS_UPSTREAM_TIMEOUT_MS = 20_000;
/** L-422 — backoff before the RETRY attempt on a transient failure (429 / 504 /
 *  network). Overpass rate-limits typically clear after a couple seconds, so a
 *  brief pause before retrying the SAME mirror recovers context that an immediate
 *  retry would just 429 again. Injectable (`deps.backoffMs`) so tests run instantly. */
export const OVERPASS_RETRY_BACKOFF_MS = 1500;

/** Promise-based sleep; injectable via `deps.sleepImpl` so tests don't wait. */
function defaultSleep(ms) {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** @typedef {{ body: string, expires: number }} CacheEntry */
/** @type {Map<string, CacheEntry>} query-hash → cached upstream JSON string. */
const _cache = new Map();
let _hits = 0;
let _misses = 0;

/** Stable cache key = SHA-256 of the normalised Overpass-QL query. */
function cacheKey(query) {
    return createHash('sha256').update(query, 'utf8').digest('hex');
}

/** Read a fresh (non-expired) cache entry, or null. Prunes an expired hit. */
function cacheGet(key, now = Date.now()) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (entry.expires <= now) { _cache.delete(key); return null; }
    // Touch for LRU-ish recency: re-insert so it becomes the newest.
    _cache.delete(key);
    _cache.set(key, entry);
    return entry.body;
}

/** Store an upstream JSON string, evicting the oldest entries past the cap. */
function cacheSet(key, body, now = Date.now()) {
    _cache.set(key, { body, expires: now + OVERPASS_CACHE_TTL_MS });
    while (_cache.size > OVERPASS_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}

/** Test/diagnostic helper — clear the shared cache + hit/miss counters. */
export function __resetOverpassCache() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
}

/** Diagnostic snapshot of the cache (size + hit/miss counters). */
export function overpassCacheStats() {
    return { size: _cache.size, hits: _hits, misses: _misses };
}

// ── Upstream fetch (server-side, mirror fallback + one retry) ────────────────
/**
 * Forward an Overpass-QL query to the mirrors from the SERVER, trying each in
 * order with a per-mirror timeout and ONE retry. Resolves with the raw upstream
 * response TEXT (verbatim JSON) on the first mirror that answers 2xx with a
 * non-empty body, else null (all mirrors failed / rate-limited / offline).
 * NEVER throws.
 *
 * `deps.fetchImpl` and `deps.mirrors` are injectable so the route is unit-testable
 * without touching the network.
 *
 * @param {string} query  Overpass-QL
 * @param {{ fetchImpl?: typeof fetch, mirrors?: string[], timeoutMs?: number }} [deps]
 * @returns {Promise<string|null>}
 */
export async function fetchFromMirrors(query, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const mirrors = deps.mirrors || OVERPASS_MIRRORS;
    const timeoutMs = deps.timeoutMs || OVERPASS_UPSTREAM_TIMEOUT_MS;
    // L-422 — backoff before a retry (0 disables; tests pass 0 to run instantly).
    const backoffMs = deps.backoffMs !== undefined ? deps.backoffMs : OVERPASS_RETRY_BACKOFF_MS;
    const sleep = deps.sleepImpl || defaultSleep;
    const body = 'data=' + encodeURIComponent(query);

    for (const endpoint of mirrors) {
        // One initial attempt + one retry per mirror (transient 429 / hiccup).
        for (let attempt = 0; attempt < 2; attempt++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                const res = await fetchImpl(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        // A polite, identifying UA — public Overpass asks callers to
                        // identify themselves; a single shared server UA is far gentler
                        // on the mirrors than N anonymous per-browser requests.
                        'User-Agent': 'PRYZM-Overpass-Proxy/1.0 (+https://pryzm.fly.dev)',
                    },
                    body,
                    signal: ctrl.signal,
                });
                if (res.status === 429 || res.status === 504) {
                    // Rate-limited / gateway-timeout — back off, retry once, then next mirror.
                    console.warn(`[overpass-proxy] ${endpoint} HTTP ${res.status} (attempt ${attempt + 1}) — ${attempt === 0 ? `backing off ${backoffMs}ms then retrying` : 'next mirror'}.`);
                    if (attempt === 0) { clearTimeout(timer); await sleep(backoffMs); }
                    continue;
                }
                if (!res.ok) {
                    console.warn(`[overpass-proxy] ${endpoint} HTTP ${res.status} — next mirror.`);
                    break; // non-transient — skip straight to the next mirror
                }
                const text = await res.text();
                if (text && text.length > 0) return text;
                break; // empty body — try the next mirror
            } catch (err) {
                // Timeout / network / abort — back off, retry once, then next mirror.
                console.warn(`[overpass-proxy] ${endpoint} fetch failed (attempt ${attempt + 1}): ${err?.message ?? err}`);
                clearTimeout(timer);
                if (attempt === 0) await sleep(backoffMs);
                continue;
            } finally {
                clearTimeout(timer);
            }
        }
    }
    return null;
}

/** Set the permissive same-origin cache headers on an Overpass proxy response. */
function setProxyCacheHeaders(res) {
    // Browsers + any intermediary same-origin cache may hold the result for a day.
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Express handler for POST /api/overpass.
 *
 * Accepts the Overpass-QL query in `req.body.data` (form-urlencoded, the shape
 * the client already sends) OR `req.body.query` (JSON). Serves a cached hit
 * instantly; otherwise forwards to the mirrors once, caches, and returns the
 * upstream JSON verbatim.
 *
 * NEVER crashes the server: an empty query → 400; all-mirrors-failed → 200 with
 * `{ elements: [] }` (so the client's non-fatal empty path renders the scene
 * with no context, exactly as when the direct mirrors failed).
 *
 * `deps` is injectable for tests (fetchImpl / mirrors / timeoutMs).
 */
export function makeOverpassHandler(deps = {}) {
    return async function overpassHandler(req, res) {
        const raw = req.body && (req.body.data ?? req.body.query);
        const query = typeof raw === 'string' ? raw.trim() : '';
        if (!query) {
            return res.status(400).json({ error: 'Overpass query required (form field `data` or JSON `query`).' });
        }

        const key = cacheKey(query);
        const cached = cacheGet(key);
        if (cached !== null) {
            _hits++;
            setProxyCacheHeaders(res);
            res.setHeader('X-Overpass-Cache', 'HIT');
            return res.status(200).send(cached);
        }
        _misses++;

        let upstream = null;
        try {
            upstream = await fetchFromMirrors(query, deps);
        } catch (err) {
            // fetchFromMirrors is already never-throw, but be defensive.
            console.warn('[overpass-proxy] unexpected error:', err?.message ?? err);
            upstream = null;
        }

        if (upstream === null) {
            // All mirrors failed / rate-limited / offline. Answer 200 with an
            // empty element set so the client's non-fatal path degrades to "no
            // context" instead of erroring. Do NOT cache the empty failure.
            setProxyCacheHeaders(res);
            res.setHeader('X-Overpass-Cache', 'MISS-EMPTY');
            return res.status(200).json({ elements: [] });
        }

        // Success — cache the verbatim upstream JSON + return it.
        cacheSet(key, upstream);
        setProxyCacheHeaders(res);
        res.setHeader('X-Overpass-Cache', 'MISS');
        return res.status(200).send(upstream);
    };
}

/** The default production handler (real `fetch`, real mirror list). */
export const overpassHandler = makeOverpassHandler();
