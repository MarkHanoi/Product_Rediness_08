/**
 * @file server/chGrundnutzungProxy.js
 * @description SWITZERLAND — same-origin, KEYLESS server proxy for the national Nutzungsplanung
 *   WFS (geodienste.ch), so a plot drawn in Switzerland resolves its REAL land-use ZONE
 *   (typ_kommunal_code / label / main-use / bemerkungen `W2` / canton) instead of nothing.
 *
 * WHY THIS EXISTS (mirrors server/plandataZoningProxy.js + server/mucZoningProxy.js in shape)
 * ------------------------------------------------------------------------------------------
 * The deciding recon probe (SWITZERLAND-DATA-RECON-SPIKE.md, 2026-07-24) established Outcome B:
 * the national WFS publishes the zone IDENTITY as structured data, but NOT its density
 * (Nutzungsziffer) or height (those are model+PDF-bound). So the honest Swiss win is a zone-ID
 * reader; the buildable envelope refuses (client-side `chZoningEnvelopeRefusal`).
 *
 * Doing browser -> geodienste.ch directly is blocked (CORS + CSP `connect-src 'self'`), so — like
 * the Catastro / Plandata proxies — every client hits OUR origin:
 *   - Same-origin `GET /api/ch/grundnutzung?lat=&lon=` (CSP already covers it).
 *   - The server forwards to the geodienste WFS ONCE, and returns the raw GML text as
 *     `{ gml: <string> | null }`, cached by rounded coordinate (zoning changes slowly -> 24 h TTL).
 *   - NEVER crashes: any miss / upstream failure / out-of-CH answers HTTP 200 `{ gml: null }`
 *     so the client's non-fatal path renders a cited refusal.
 *
 * The GML -> zone PARSE lives in the client L2 package (`@pryzm/site-parcel-data` ->
 * `parseChGrundnutzungGml` / `resolveChZone`) so it is unit-tested deterministically against the
 * captured recon feature; this proxy only does the keyless fetch + the point -> feature query.
 *
 * ENDPOINT / TRANSPORT (single source of truth = `buildChWfsUrl`)
 * --------------------------------------------------------------
 * WFS 2.0 GetFeature, layer `ms:grundnutzung`, a tiny BBOX around the point. `outputFormat=json` is
 * REJECTED for this layer (recon §1.2), so the transport is GML (the default). EPSG:4326 bbox axis
 * order is historically ambiguous, so we TRY BOTH orders: a wrong-order bbox lands off-map ->
 * numberReturned=0 -> retry the other order. Only the correct order returns a grundnutzung feature.
 *
 * ⚠ LIVE-VERIFY the exact axis/CRS the geodienste MapServer honours by drawing a Swiss plot — the
 * recon proved the SCHEMA + DATA (zone-ID present, numbers absent) but did not exercise the spatial
 * query. The never-crash posture makes a wrong query a clean miss (a cited refusal), never a fault.
 *
 * @see server/plandataZoningProxy.js — the template this clones (cache / forward / fallback)
 * @see packages/site-parcel-data/src/providers/chGrundnutzungProvider.ts — the client consumer
 * @see docs/04-reference/jurisdictions/ch/findings/SWITZERLAND-DATA-RECON-SPIKE.md §1
 */

/** The same-origin route the client's `resolveChZone` calls. */
export const CH_GRUNDNUTZUNG_PATH = '/api/ch/grundnutzung';

/** The national Nutzungsplanung WFS — keyless, NOT geo-blocked (recon §1/§4). */
export const CH_WFS_ENDPOINT = 'https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu';

/** The zone-polygon feature type (recon §1.1). */
export const CH_GRUNDNUTZUNG_TYPENAME = 'ms:grundnutzung';

// ── Config ───────────────────────────────────────────────────────────────────
/** Zoning changes slowly; a day-stale lookup is fine + keeps us polite to a free public service. */
export const CH_ZONING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CH_ZONING_CACHE_MAX_ENTRIES = 512;
export const CH_UPSTREAM_TIMEOUT_MS = 15_000;
/** Half-width (degrees) of the point-query bbox (~15 m) — big enough to land inside a zone polygon,
 *  small enough to keep the candidate set (and any boundary ambiguity) tiny. */
export const CH_BBOX_HALF_DEG = 0.00015;
/** Loose Swiss national bbox (+ Liechtenstein) — mirrors `switzerlandBbox.ts`. */
export const CH_BBOX = { minLat: 45.75, maxLat: 47.85, minLon: 5.9, maxLon: 10.55 };

// ── Shared in-memory cache (keyed by rounded coordinate) ─────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

function coordKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}
function cacheGet(key, now = Date.now()) {
    const entry = _cache.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) { _cache.delete(key); return undefined; }
    _cache.delete(key);
    _cache.set(key, entry); // touch -> newest (LRU-ish recency)
    return entry.value;
}
function cacheSet(key, value, now = Date.now()) {
    _cache.set(key, { value, expires: now + CH_ZONING_CACHE_TTL_MS });
    while (_cache.size > CH_ZONING_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}
/** Test/diagnostic helper — clear the shared cache + hit/miss counters. */
export function __resetChZoningCache() { _cache.clear(); _hits = 0; _misses = 0; }
/** Diagnostic snapshot of the cache. */
export function chZoningCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

// ── Endpoint construction (THE single source of truth) ───────────────────────

/**
 * Build a geodienste WFS 2.0 GetFeature URL for a tiny bbox around (lon,lat). `axis` hedges the
 * EPSG:4326 bbox order: `'lonlat'` -> `minLon,minLat,maxLon,maxLat`; `'latlon'` -> the swap. No
 * `outputFormat` — GML is the only transport this layer serves (recon §1.2).
 *
 * @param {number} lon
 * @param {number} lat
 * @param {'lonlat'|'latlon'} axis
 * @returns {string}
 */
export function buildChWfsUrl(lon, lat, axis) {
    const d = CH_BBOX_HALF_DEG;
    const minLon = lon - d, maxLon = lon + d, minLat = lat - d, maxLat = lat + d;
    const bbox = axis === 'latlon'
        ? `${minLat},${minLon},${maxLat},${maxLon},EPSG:4326`
        : `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: CH_GRUNDNUTZUNG_TYPENAME,
        srsName: 'EPSG:4326',
        count: '5',
        bbox,
    });
    return `${CH_WFS_ENDPOINT}?${params.toString()}`;
}

// ── GML feature detection (server-side; keep the client the sole PARSER) ──────

/**
 * Does this WFS GML body carry at least one `grundnutzung` feature member (and is NOT a service
 * exception)? Used only to CHOOSE the winning axis order; the field-level parse is the client's job.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function gmlHasFeature(text) {
    if (typeof text !== 'string' || text.length === 0) return false;
    if (/ServiceException|ExceptionReport/i.test(text)) return false;
    if (/numberReturned=["']0["']/.test(text)) return false;
    // A returned feature member is a `grundnutzung` element with content (any namespace prefix).
    return /<(?:[A-Za-z0-9_]+:)?grundnutzung\b[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?grundnutzung>/.test(text);
}

// ── Upstream fetch (server-side, timeout, never-throw) ────────────────────────

/**
 * Fetch a URL once with a timeout; resolve to the response TEXT on a 2xx non-empty body, else null.
 * NEVER throws. `deps.fetchImpl` is injectable so the route is unit-testable without the network.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<string|null>}
 */
export async function fetchTextOnce(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || CH_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: {
                Accept: 'application/gml+xml, application/xml, text/xml, */*',
                'User-Agent': 'PRYZM-CH-Grundnutzung-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[ch-grundnutzung-proxy] HTTP ${res.status} for ${url}`);
            return null;
        }
        const text = await res.text();
        return text && text.length > 0 ? text : null;
    } catch (err) {
        console.warn(`[ch-grundnutzung-proxy] fetch failed: ${err?.message ?? err}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve the grundnutzung GML at a WGS84 point, server-side: for each bbox axis order
 * (lonlat -> latlon), fetch once; return the GML from the FIRST axis that carries a feature. Returns
 * the GML string, or null (no zone at the point / all upstreams failed or empty). NEVER throws.
 *
 * @param {number} lon
 * @param {number} lat
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<string|null>}
 */
export async function fetchGrundnutzungAtPoint(lon, lat, deps = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    for (const axis of ['lonlat', 'latlon']) {
        const url = buildChWfsUrl(lon, lat, axis);
        const text = await fetchTextOnce(url, deps);
        if (!text) continue;
        if (gmlHasFeature(text)) return text;
        // A valid empty collection (numberReturned=0) means this axis landed off-map -> try the other.
    }
    return null;
}

/** Set permissive same-origin cache headers on the zoning proxy response. */
function setProxyCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Express handler for GET /api/ch/grundnutzung?lat=<>&lon=<>.
 *
 * Serves a cached-by-coordinate result instantly; otherwise resolves the grundnutzung GML once,
 * caches it (incl. a null-miss), and returns `{ gml: <string> | null }`.
 *
 * NEVER crashes: bad/absent coords -> 400; out-of-CH / no zone / upstream failure -> 200 `{ gml: null }`
 * (the client renders a cited refusal). `deps` is injectable for tests (fetchImpl / timeoutMs).
 */
export function makeChGrundnutzungHandler(deps = {}) {
    return async function chGrundnutzungHandler(req, res) {
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query params (EPSG:4326) are required.' });
        }
        // Guard the Swiss national bbox loosely so a click elsewhere short-circuits without a
        // pointless gov round-trip (+ Liechtenstein, which the national WFS also serves).
        if (lon < CH_BBOX.minLon || lon > CH_BBOX.maxLon || lat < CH_BBOX.minLat || lat > CH_BBOX.maxLat) {
            setProxyCacheHeaders(res);
            res.setHeader('X-Ch-Zoning-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ gml: null });
        }

        const key = coordKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            setProxyCacheHeaders(res);
            res.setHeader('X-Ch-Zoning-Cache', 'HIT');
            return res.status(200).json({ gml: cached });
        }
        _misses++;

        let gml = null;
        try {
            gml = await fetchGrundnutzungAtPoint(lon, lat, deps);
        } catch (err) {
            console.warn('[ch-grundnutzung-proxy] unexpected error:', err?.message ?? err);
            gml = null;
        }
        cacheSet(key, gml);

        setProxyCacheHeaders(res);
        res.setHeader('X-Ch-Zoning-Cache', gml ? 'MISS-FETCH' : 'MISS-EMPTY');
        return res.status(200).json({ gml });
    };
}

/** The default production handler (real `fetch`, real endpoint). */
export const chGrundnutzungHandler = makeChGrundnutzungHandler();
