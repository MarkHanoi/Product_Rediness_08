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
    // §OVERPASS-MIRROR-COVERAGE (L-476) — ordered by MEASURED Barcelona performance.
    // `overpass.openstreetmap.fr` answered the Eixample probe bbox in 0.73 s with the
    // full 24 footprints; `maps.mail.ru` answered the same bbox correctly in 8.4 s.
    // The two historical leads (`overpass-api.de`, `kumi.systems`) are kept because
    // they may behave differently from the Fly server IP than from a dev machine, but
    // they must no longer sit in front of mirrors that are known to answer.
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    // ⚠ `https://overpass.osm.ch/api/interpreter` REMOVED (L-476). It is a SWITZERLAND-ONLY
    // extract, not a global mirror, and it is the root cause of "context returns 0 in
    // Barcelona". Measured directly, same query shape, same minute:
    //     Zurich    bbox 47.3760,8.5400,47.3770,8.5420  → HTTP 200, 20 elements, 0.44 s
    //     Barcelona bbox 41.3916,2.1664,41.3926,2.1684  → HTTP 200,  0 elements, 0.20 s
    //     (the SAME Barcelona bbox → 24 elements from .fr and from maps.mail.ru)
    // It is not failing and it is not lying: it is truthfully reporting that its database
    // contains no buildings there. But it is the FASTEST responder in the pool precisely
    // BECAUSE it has nothing to return, so it won every cascade for every city on earth
    // outside Switzerland — and it emits NO `remark`, so neither the L-469 guard here nor
    // the client's could ever catch it. A regional extract cannot serve a global product.
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

/**
 * §OVERPASS-NO-LONG-CACHE-EMPTY (L-467) — how long a ZERO-element upstream answer is trusted.
 *
 * 5 minutes, not 24 hours. See the rationale at the cache-write site: an empty result from a
 * loaded Overpass mirror is usually a soft failure wearing a 200, and caching it for a day turns
 * one blip into a day of "this city has no buildings". Short enough that a transient empty heals
 * itself without a redeploy or a cache flush; long enough that a genuinely empty bbox is not
 * re-queried on every render (C57 §7.2 politeness).
 */
export const OVERPASS_EMPTY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Count `elements` in a verbatim upstream JSON string WITHOUT trusting it to be well-formed.
 * Returns -1 when the body cannot be parsed, which callers must treat as "not empty" — an
 * unparseable body is a different problem, and mislabelling it "empty" would be the very
 * conflation this whole section exists to remove.
 */
/**
 * §OVERPASS-REMARK-IS-AN-ERROR (L-469) — read an Overpass payload's `remark` and element count.
 *
 * Overpass signals server-side failure in-band: HTTP 200, `elements: []`, and a human-readable
 * `remark` such as *"runtime error: Query timed out in 'query' at line 1 after 25 seconds."*
 * Nothing in this stack read that field, so such a response was indistinguishable from a genuine
 * "no buildings here".
 *
 * ⚠ A `remark` ALONE IS NOT A FAILURE. Overpass also emits informational remarks alongside real
 * results. The caller must therefore require BOTH a remark AND zero elements before treating a
 * response as failed — otherwise a warning attached to a perfectly good answer would throw the
 * answer away, which is the same class of over-correction in the opposite direction.
 *
 * Unparseable body → `{remark: null, elementCount: -1}`: not "empty", because a malformed payload
 * is a different problem and mislabelling it would repeat the conflation this is here to remove.
 */
function inspectOverpassPayload(body) {
    try {
        const parsed = JSON.parse(typeof body === 'string' ? body : String(body));
        const remark = typeof parsed?.remark === 'string' && parsed.remark.trim() !== ''
            ? parsed.remark.trim()
            : null;
        return {
            remark,
            elementCount: Array.isArray(parsed?.elements) ? parsed.elements.length : -1,
        };
    } catch {
        return { remark: null, elementCount: -1 };
    }
}

function countElements(body) {
    try {
        const parsed = JSON.parse(typeof body === 'string' ? body : String(body));
        return Array.isArray(parsed?.elements) ? parsed.elements.length : -1;
    } catch {
        return -1;
    }
}
/** Bounded size — evict the OLDEST entry when exceeded (insertion-order LRU-ish).
 *  Each entry is a parsed-then-restringified Overpass JSON (tens–hundreds of KB);
 *  256 distinct bbox queries is a generous working set for the whole server. */
export const OVERPASS_CACHE_MAX_ENTRIES = 256;
/** Per-mirror upstream timeout (ms). Generous vs. the client's 9 s because the
 *  server pays it ONCE for the whole fleet (result is then cached), and a slow
 *  legitimate large-city response is worth waiting for so it gets cached. */
// §CTX-TIMEOUT-ALIGN (L-471) — MUST EXCEED the `[timeout:N]` the CLIENT asks Overpass for
// (60 s for buildings). At 20 s the proxy aborted a legitimate dense-city query before
// Overpass had spent its own budget — so the request we made could never have succeeded.
// Asking upstream for 60 s and hanging up at 20 s is not a timeout policy, it is a bug.
export const OVERPASS_UPSTREAM_TIMEOUT_MS = 75_000;
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
function cacheSet(key, body, now = Date.now(), ttlMs = OVERPASS_CACHE_TTL_MS) {
    _cache.set(key, { body, expires: now + ttlMs });
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

    // §OVERPASS-ZERO-IS-NOT-AN-ANSWER (L-476) — the first well-formed zero-element answer,
    // held aside in case no mirror can better it. See the branch below for the reasoning.
    let provisionalEmpty = null;

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
                if (text && text.length > 0) {
                    // §OVERPASS-REMARK-IS-AN-ERROR (L-469) — ⚠ A 200 IS NOT A SUCCESS.
                    //
                    // Overpass reports server-side failures (query timeout, memory exhaustion,
                    // rate limiting) as **HTTP 200 with `elements: []` and a `remark` string** —
                    // there is no error status to check. This branch returned any non-empty body
                    // as the winner, so such a response was accepted as a genuine answer AND
                    // short-circuited the mirror cascade, so a healthier mirror was never tried.
                    //
                    // This bites hardest exactly where the product needs it most: a dense city.
                    // The far-extent bbox over central Barcelona is a very large query, and the
                    // denser the fabric the likelier it exceeds the query budget — so the failure
                    // scales WITH the value of the area, and reads as "this city has no
                    // buildings". Same conflation as L-467, one layer further upstream: there,
                    // an empty answer was cached as durable truth; here, an explicit error is not
                    // even recognised as an error.
                    const diag = inspectOverpassPayload(text);
                    if (diag.remark && diag.elementCount === 0) {
                        console.warn(
                            `[overpass-proxy] §OVERPASS-REMARK-IS-AN-ERROR ${endpoint} returned HTTP 200 ` +
                                `with ZERO elements and a remark — treating as a FAILED attempt, not an ` +
                                `answer. Overpass said: "${diag.remark}"`,
                        );
                        // Same handling as a 429: back off and retry once, then the next mirror.
                        if (attempt === 0) { clearTimeout(timer); await sleep(backoffMs); continue; }
                        break;
                    }
                    // §OVERPASS-ZERO-IS-NOT-AN-ANSWER (L-476) — ⚠ A ZERO-ELEMENT 200 MUST NOT
                    // END THE CASCADE.
                    //
                    // THE DEFECT THIS FIXES is the general form of the osm.ch bug documented on
                    // OVERPASS_MIRRORS. Removing that one mirror fixes today's Barcelona; it does
                    // nothing about the next partial mirror, and a public pool we do not control
                    // WILL contain another one. The L-469 guard cannot help: a regional extract
                    // returning "nothing here" is not erroring, so it emits no `remark`, and a
                    // well-formed zero is indistinguishable from a genuinely empty area — the
                    // recurring failure-vs-absence conflation behind L-422 / L-457 / L-467 / L-469.
                    //
                    // The discriminator we DO have is CORROBORATION. A zero is only credible when
                    // it is the best any mirror can do. So a zero is held as PROVISIONAL and the
                    // cascade continues; the first mirror with actual content wins outright, and
                    // the zero is returned only after the pool is exhausted. Cost is bounded — it
                    // is paid only when a mirror answers zero, and a genuinely empty bbox (open
                    // sea, desert) is cheap to answer everywhere, so the walk is fast exactly in
                    // the case where we walk the whole pool.
                    //
                    // Note this deliberately does NOT try to detect regional coverage. It cannot
                    // be done from one response, and guessing would be the same class of mistake.
                    if (countElements(text) === 0) {
                        console.warn(
                            `[overpass-proxy] §OVERPASS-ZERO-IS-NOT-AN-ANSWER ${endpoint} returned HTTP 200 ` +
                                `with ZERO elements and NO remark — holding as PROVISIONAL and trying the ` +
                                `next mirror. A zero is only trusted once no mirror can better it.`,
                        );
                        if (provisionalEmpty === null) provisionalEmpty = text;
                        break; // next mirror — retrying THIS one would just repeat its own answer
                    }
                    return text;
                }
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
    // §OVERPASS-ZERO-IS-NOT-AN-ANSWER (L-476) — pool exhausted. If some mirror gave us a
    // well-formed zero, that is now the CORROBORATED answer and we return it; the handler
    // still treats it as `EMPTY-UNVERIFIED` and short-TTLs it (§OVERPASS-NO-LONG-CACHE-EMPTY,
    // L-467), so an emptiness we merely failed to disprove is never cached as durable truth.
    // `null` remains reserved for "no mirror answered at all", which is a FAILURE, not a zero.
    return provisionalEmpty;
}

/** Set the permissive same-origin cache headers on a SUCCESSFUL Overpass proxy response. */
function setProxyCacheHeaders(res) {
    // Browsers + any intermediary same-origin cache may hold the result for a day.
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * §OVERPASS-NO-CACHE-EMPTY (L-422 root cause) — headers for the FAILURE response.
 *
 * THE DEFECT THIS FIXES: the all-mirrors-failed path returns `200 {elements: []}` so the client
 * degrades to "no context" instead of erroring — deliberate, and right. But it was sent with the
 * SUCCESS headers (`public, max-age=86400`), so although the SERVER correctly declined to cache
 * the failure, the response TOLD THE BROWSER TO CACHE IT FOR 24 HOURS. One transient Overpass
 * rate-limit therefore became a persistent, whole-day "this area has no context" for that client
 * — and because the empty body is indistinguishable from a legitimately empty area, it looked
 * like data absence rather than a failure.
 *
 * Live evidence (2026-07-20, Barcelona port bbox 2.1682,41.3724,2.1896,41.3884): the app logged
 * `parks: 0`, `water: 0 areas + 0 waterways + 0 sea surfaces`, `buildings: far-extent fetch
 * returned 0 footprints` — while a direct Overpass query for the SAME bbox returned **20 water
 * ways**. Three unrelated layers reading exactly zero at once is not data absence; it is one
 * shared cached failure.
 *
 * A failure must never be cacheable. `no-store` also keeps it out of the service worker and any
 * intermediary, which a bare `max-age=0` would not reliably do.
 */
function setProxyFailureHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
            // All mirrors failed / rate-limited / offline. Answer 200 with an empty element set
            // so the client's non-fatal path degrades to "no context" instead of erroring.
            // §OVERPASS-NO-CACHE-EMPTY (L-422) — the server already declines to cache this, but
            // it MUST also tell the browser/SW/intermediaries not to. Sending the success
            // headers here made one transient rate-limit into a 24-hour zero-context day.
            setProxyFailureHeaders(res);
            res.setHeader('X-Overpass-Cache', 'MISS-EMPTY');
            // Explicit, machine-readable failure marker. The body stays `{elements: []}` for
            // back-compat with every existing client parse path, but a caller that wants to
            // distinguish "upstream failed" from "this area is genuinely empty" now can —
            // previously the two were indistinguishable, which is why the defect read as data
            // absence for so long.
            res.setHeader('X-Overpass-Upstream', 'FAILED');
            return res.status(200).json({ elements: [], _upstreamFailed: true });
        }

        // §OVERPASS-NO-LONG-CACHE-EMPTY (L-467) — ⚠ A ZERO-ELEMENT "SUCCESS" IS NOT A FACT.
        //
        // THE DEFECT THIS FIXES, and it is the real root of the founder's "context buildings do
        // not appear": Overpass mirrors under load routinely answer **HTTP 200 with an empty
        // `elements` array** rather than a 429/504. `fetchFromMirrors` sees 200 and returns it,
        // so this path treated it as a genuine answer and cached it for TWENTY-FOUR HOURS —
        // server-side, shared by every client, surviving reload and hard-refresh. One transient
        // blip therefore produced a whole day of "this area has no buildings" for a bbox in the
        // middle of Barcelona, and `_upstreamFailed` was absent because from the proxy's point of
        // view nothing failed.
        //
        // ⚠ THIS IS L-422 / L-457 ONE LAYER DEEPER, which is why it survived that fix. L-457
        // stopped the BROWSER caching a FAILED response and taught the client to honour
        // `_upstreamFailed`. Neither touched the SERVER caching an EMPTY SUCCESSFUL one — and the
        // comment on the failure path above ("the server already declines to cache this") is true
        // only of that path, which is precisely how this stayed invisible.
        //
        // WHY A SHORT TTL AND NOT "NEVER CACHE": some areas ARE genuinely empty (open sea, a
        // desert bbox), and re-querying those on every render would hammer a shared public
        // endpoint — the politeness obligation in C57 §7.2. A short TTL bounds BOTH failure
        // modes: a poisoned empty expires in minutes instead of a day, and a genuinely empty
        // area is still not re-fetched on every frame. It is the honest middle: we are saying
        // "we do not yet trust this emptiness", which is exactly true.
        const isEmpty = countElements(upstream) === 0;
        if (isEmpty) {
            cacheSet(key, upstream, Date.now(), OVERPASS_EMPTY_CACHE_TTL_MS);
            setProxyFailureHeaders(res);
            res.setHeader('X-Overpass-Cache', 'MISS-EMPTY-SHORT');
            // Distinct from FAILED: upstream answered, we simply do not treat zero as durable.
            res.setHeader('X-Overpass-Upstream', 'EMPTY-UNVERIFIED');
            console.warn(
                `[overpass-proxy] §OVERPASS-NO-LONG-CACHE-EMPTY — upstream returned 200 with ZERO ` +
                    `elements; caching for ${Math.round(OVERPASS_EMPTY_CACHE_TTL_MS / 1000)}s only ` +
                    `(not ${Math.round(OVERPASS_CACHE_TTL_MS / 3600000)}h). A zero-element answer ` +
                    `from a loaded mirror is usually a soft failure, not an empty world.`,
            );
            return res.status(200).send(upstream);
        }

        // Success with real content — cache the verbatim upstream JSON + return it.
        cacheSet(key, upstream);
        setProxyCacheHeaders(res);
        res.setHeader('X-Overpass-Cache', 'MISS');
        return res.status(200).send(upstream);
    };
}

/** The default production handler (real `fetch`, real mirror list). */
export const overpassHandler = makeOverpassHandler();
