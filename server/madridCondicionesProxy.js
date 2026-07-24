// §MADRID-CONDICIONES-PROXY (L-608) — the Madrid PGOUM-97 Norma Zonal 1 buildable-footprint lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveMadridNZ1Ring` needs.
// ─────────────────────────────────────────────────────────────────────────────
// Madrid NZ 1 is an `explicit-area` zone: the ordinance PUBLISHES the buildable footprint (Fondo de
// la Edificación) and the weighted edificabilidad (COEF_Z) AS GEOMETRY on the municipal ArcGIS plane
// (sigma.madrid.es), not as setback numbers. The client cannot reach sigma cross-origin under CSP
// (`connect-src 'self'`), so — exactly like `server/mucZoningProxy.js` — every client hits OUR origin
// and this proxy forwards ONE spatial point-intersect query and returns the raw Esri JSON.
//
// THE JOIN IS SPATIAL (MADRID-DATA-RECON-SPIKE §3, 2026-07-24): `CODMANZANA` is a planning-block key
// with NO relationship to the Catastro refcat, so the query keys on the parcel's WGS84 POINT, not a
// string. The client resolver parses `features[0].geometry.rings` (WGS84 via `outSR=4326`) +
// `attributes.COEF_Z` / `CODMANZANA`; all the Madrid ArcGIS knowledge lives HERE (C58 §1.5).
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY):
//   • upstream OK (incl. genuinely zero features) → 200 with the raw Esri body → the client reads
//     `no-feature` from an empty `features[]`;
//   • upstream failure / timeout / bad body → 502 `{ error }` → the client's `res.ok === false`
//     path returns `endpoint-unreachable`. The two are DISTINCT status codes on purpose.
//
// @see server/mucZoningProxy.js — the template this mirrors (cache/forward/never-crash)
// @see packages/site-parcel-data/src/providers/resolveMadridNZ1Ring.ts — the client consumer

/** The same-origin route the client's `resolveMadridNZ1Ring` calls. */
export const MADRID_CONDICIONES_PATH = '/api/madrid/condiciones';

/** sigma.madrid.es — the keyless PGOUM-97 ArcGIS REST root (recon §1: instance `hosted`, not `arcgis`). */
export const MADRID_CONDICIONES_ENDPOINT =
    'https://sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6/query';

export const MADRID_UPSTREAM_TIMEOUT_MS = 15_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const MADRID_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MADRID_CACHE_MAX_ENTRIES = 512;

// ── cache ──────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetMadridCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function madridCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

/** Round to ~1 m so neighbouring clicks on the same parcel share a cache entry. */
function cacheKey(lat, lon) { return `${lat.toFixed(5)},${lon.toFixed(5)}`; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = MADRID_CACHE_TTL_MS) {
    if (_cache.size >= MADRID_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URL (single source of truth) ─────────────────────────────────────

/**
 * Build the PG_CONDICIONES_EDIFICACION layer-6 spatial point-intersect query URL for a WGS84 point.
 * `geometry=<lon>,<lat>` (Esri point order), `inSR=4326`, `outSR=4326` (so the ring returns WGS84),
 * `returnGeometry=true`, and the four attributes the client reads (recon §6.1).
 */
export function buildMadridCondicionesUrl(lat, lon) {
    const qs = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'CODMANZANA,NUMORD,COND_EDIF,COEF_Z',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
    });
    return `${MADRID_CONDICIONES_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch the raw Esri JSON at a point. Resolves to the parsed body on a 2xx JSON response, or null on
 * ANY failure (non-OK, timeout, non-JSON, or an ArcGIS `{error}` envelope). NEVER throws. `deps` is
 * injectable so the route is unit-testable without the network.
 */
export async function fetchMadridCondiciones(lat, lon, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || MADRID_UPSTREAM_TIMEOUT_MS;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(buildMadridCondicionesUrl(lat, lon), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Madrid-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[madrid-proxy] condiciones HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            console.warn('[madrid-proxy] condiciones returned non-JSON — upstream miss.');
            return null;
        }
        // An ArcGIS error envelope ({ error: { code, message } }) is a FAILURE, not an empty area.
        if (json && typeof json === 'object' && json.error) {
            console.warn('[madrid-proxy] ArcGIS error envelope — upstream miss:', json.error?.message ?? json.error);
            return null;
        }
        return json;
    } catch (err) {
        console.warn('[madrid-proxy] condiciones fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/madrid/condiciones?lat=&lon=`
 *
 * 200 `{ features: [...] }` — the raw Esri layer-6 response (possibly `features: []` = no footprint
 *     here). The client resolver parses the ring + COEF_Z + CODMANZANA.
 * 502 `{ error }`         — upstream failure / timeout / bad body (distinct from an empty answer, so
 *     the client returns `endpoint-unreachable`, never `no-feature`).
 * 400                     — missing/invalid coordinates.
 */
export function makeMadridCondicionesHandler(deps = {}) {
    return async function madridCondicionesHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }

        const key = cacheKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Madrid-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        const body = await fetchMadridCondiciones(lat, lon, deps);
        if (body === null) {
            // A failure must never be cached and must never look like an empty answer.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Madrid-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The Madrid PGOUM-97 condiciones service did not answer. This is NOT a statement ' +
                    'that the parcel has no published footprint.',
            });
        }

        // Normalise to `{ features: [...] }` so the client always reads an array (never a null crash).
        const payload = { features: Array.isArray(body.features) ? body.features : [] };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Madrid-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const madridCondicionesHandler = makeMadridCondicionesHandler();
