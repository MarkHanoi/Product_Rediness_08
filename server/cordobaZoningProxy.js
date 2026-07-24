// §CORDOBA-ZONING-PROXY (WIRING-TODO 5) — the COACo PGOU-2001 calificación lookup (2-district pilot).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveCordobaSubzone` needs.
// ─────────────────────────────────────────────────────────────────────────────
// Córdoba's PGOU-2001 calificación is served as public WFS 2.0 by the COACo GeoServer
// (`geoserver.pgou.coacordoba.org`, CORDOBA-DATA-RECON-SPIKE §2). The client cannot reach it
// cross-origin under CSP, so — exactly like `server/mucZoningProxy.js` — every client hits OUR origin
// and this proxy forwards the WFS query and returns the GeoJSON.
//
// ⚠⚠ IT DOES NOT RENDER A NUMBER. The whole Córdoba pack is machine-OCR'd and
// `pipeline-extracted-unverified`; `CORDOBA_ENVELOPE_VERIFIED` is false until a human signs
// `sources/VERIFICATION.md`, so the L5 dispatcher shows the "machine-extracted, unverified" REFUSAL
// for every parcel. This proxy is the DATA path that turns on the day sign-off lands.
//
// TWO ROUTES (recon §4):
//   • GET /api/cordoba/ordenanzas?lat=&lon=  — the AUTHORITATIVE subzone: a spatial INTERSECTS on
//     `coaco:ordenanzas`, returning `ordenanza` (family) + `link` (the `O_*` the subzone parses from).
//   • GET /api/cordoba/vcatastro?refcat=     — the refcat key-join on `coaco:vcatastro_urbanismo` for
//     `sup_pc_m2` / `max_plantas` / `actuacion` (the derived-planning override).
//
// ⚠ CRS/AXIS GOTCHA (recon §4, why a naïve bbox loses an hour): the layers are native EPSG:25830 and
// a BARE 4326 BBOX silently returns EMPTY. The spatial route therefore issues the BBOX with the
// EXPLICIT `urn:ogc:def:crs:EPSG::4326` authority axis order (lat/lon), which this GeoServer honours.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY): upstream OK
// (incl. zero features) → 200 GeoJSON; upstream failure/timeout/bad body → 502 `{ error }`.
//
// @see server/mucZoningProxy.js — the template this mirrors
// @see packages/site-parcel-data/src/providers/resolveCordobaSubzone.ts — the client consumer

/** The same-origin routes the client's `resolveCordobaSubzone` calls. */
export const CORDOBA_ORDENANZAS_PATH = '/api/cordoba/ordenanzas';
export const CORDOBA_VCATASTRO_PATH = '/api/cordoba/vcatastro';

/** The COACo GeoServer WFS (keyless, public — recon §2). */
export const CORDOBA_WFS_ENDPOINT = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';

export const CORDOBA_ORDENANZAS_LAYER = 'coaco:ordenanzas';
export const CORDOBA_VCATASTRO_LAYER = 'coaco:vcatastro_urbanismo';

/** Half-extent (degrees) of the tiny bbox built around the query point (~5 m). */
export const CORDOBA_QUERY_HALF_DEG = 0.00005;
export const CORDOBA_UPSTREAM_TIMEOUT_MS = 15_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const CORDOBA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CORDOBA_CACHE_MAX_ENTRIES = 512;

// ── cache (shared by both routes; keyed by route+arg) ─────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetCordobaCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function cordobaCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = CORDOBA_CACHE_TTL_MS) {
    if (_cache.size >= CORDOBA_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URLs (single source of truth) ────────────────────────────────────

/**
 * Build the `coaco:ordenanzas` spatial GetFeature URL for a WGS84 point. Uses the EXPLICIT
 * `urn:ogc:def:crs:EPSG::4326` axis (lat/lon) on the BBOX — the documented gotcha (recon §4): a bare
 * 4326 bbox returns EMPTY against these EPSG:25830 layers.
 */
export function buildCordobaOrdenanzasUrl(lat, lon, halfDeg = CORDOBA_QUERY_HALF_DEG) {
    const r = (n) => Number(n.toFixed(7));
    const minLon = r(lon - halfDeg), maxLon = r(lon + halfDeg);
    const minLat = r(lat - halfDeg), maxLat = r(lat + halfDeg);
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: CORDOBA_ORDENANZAS_LAYER,
        propertyName: 'ordenanza,link',
        outputFormat: 'application/json',
        count: '10',
        // Authority (lat/lon) axis order — the gotcha. Do NOT switch to a bare lon,lat bbox.
        bbox: `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`,
    });
    return `${CORDOBA_WFS_ENDPOINT}?${qs.toString()}`;
}

/** Build the `coaco:vcatastro_urbanismo` refcat key-join GetFeature URL (attributes + override). */
export function buildCordobaVcatastroUrl(refcat) {
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: CORDOBA_VCATASTRO_LAYER,
        propertyName: 'refcat,ordenanza,actuacion,sup_pc_m2,max_plantas,uso_dominante',
        outputFormat: 'application/json',
        count: '1',
        CQL_FILTER: `refcat='${String(refcat).replace(/'/g, "''")}'`,
    });
    return `${CORDOBA_WFS_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch a COACo WFS URL → parsed GeoJSON, or null on ANY failure (non-OK, timeout, non-JSON, or an
 * OGC `ExceptionReport`). NEVER throws. `deps.fetchImpl` is injectable for tests.
 */
export async function fetchCordobaWfs(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || CORDOBA_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Cordoba-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[cordoba-proxy] WFS HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            // GeoServer answers an XML ExceptionReport on a bad request — a FAILURE, not empty.
            console.warn('[cordoba-proxy] WFS returned non-JSON (exception?) — upstream miss.');
            return null;
        }
        return json;
    } catch (err) {
        console.warn('[cordoba-proxy] WFS fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── handlers ──────────────────────────────────────────────────────────────────

/** `GET /api/cordoba/ordenanzas?lat=&lon=` → 200 GeoJSON `{features}` / 502 `{error}` / 400. */
export function makeCordobaOrdenanzasHandler(deps = {}) {
    return async function cordobaOrdenanzasHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }
        const key = `ord:${lat.toFixed(5)},${lon.toFixed(5)}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Cordoba-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;
        const body = await fetchCordobaWfs(buildCordobaOrdenanzasUrl(lat, lon), deps);
        if (body === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Cordoba-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The COACo PGOU-2001 WFS did not answer. This is NOT a statement that the parcel ' +
                    'is outside the covered districts.',
            });
        }
        const payload = { features: Array.isArray(body.features) ? body.features : [] };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Cordoba-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

/** `GET /api/cordoba/vcatastro?refcat=` → 200 GeoJSON `{features}` / 502 `{error}` / 400. */
export function makeCordobaVcatastroHandler(deps = {}) {
    return async function cordobaVcatastroHandler(req, res) {
        const refcat = typeof req.query?.refcat === 'string' ? req.query.refcat.trim() : '';
        if (refcat === '') {
            return res.status(400).json({ error: 'a refcat query parameter is required.' });
        }
        const key = `vc:${refcat}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Cordoba-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;
        const body = await fetchCordobaWfs(buildCordobaVcatastroUrl(refcat), deps);
        if (body === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Cordoba-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error: 'The COACo vcatastro WFS did not answer.',
            });
        }
        const payload = { features: Array.isArray(body.features) ? body.features : [] };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Cordoba-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const cordobaOrdenanzasHandler = makeCordobaOrdenanzasHandler();
export const cordobaVcatastroHandler = makeCordobaVcatastroHandler();
