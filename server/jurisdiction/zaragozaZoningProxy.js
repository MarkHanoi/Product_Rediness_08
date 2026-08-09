// §ZARAGOZA-ZONING-PROXY — the IDEZar `urbanismo:Calificaciones_Urbanas` calificación lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveZaragozaZone` needs.
// ─────────────────────────────────────────────────────────────────────────────
// Zaragoza's PGOU-2024 calificación is served as public WFS by the IDEZar GeoServer
// (`idezar-sig.zaragoza.es`, §ZGZ-SUBGRADO in `esAragon.ts`). The client cannot reach it
// cross-origin under CSP, so — exactly like `server/cordobaZoningProxy.js` — every client hits OUR
// origin and this proxy forwards the WFS query and returns the GeoJSON.
//
// ⚠⚠ IT DOES NOT RENDER A NUMBER. `ZARAGOZA_ENVELOPE_VERIFIED` is false until a human transcribes
// arts. 4.1.12/4.1.13/4.1.15/4.1.17 and signs `sources/VERIFICATION.md`, so the L5 dispatcher shows
// a cited "no signed rule" REFUSAL for every parcel. This proxy is the DATA path that turns on the
// day sign-off lands.
//
// ONE ROUTE:
//   • GET /api/zaragoza/calificaciones?lat=&lon=  — a spatial query on
//     `urbanismo:Calificaciones_Urbanas`, returning `calificacion` (the zone/subgrado code) +
//     `descripcion`.
//
// ⚠ THE ENDPOINT IS THE GLOBAL `/servicios/geoserver/wfs` root, NOT a `/urbanismo/wfs` workspace
// path — verified reachable this session (`tools/ogc-layer-census/probe_zaragoza_subgrado.py`,
// which fetched all 7,967 `urbanismo:Calificaciones_Urbanas` polygons against this exact URL). The
// `urbanismo:` NAMESPACE PREFIX on `typeNames` is what selects the workspace; the endpoint path
// itself is global, the same way every other `probe_zaragoza*.py` script in that tool reaches it.
//
// ⚠ `Calificaciones_Urbanas` IS ABSENT FROM WFS `GetCapabilities` (it answers `GetFeature` at
// HTTP 200 regardless — §ZGZ-SUBGRADO documents this at length: capabilities is a publication
// choice, not an inventory). So this proxy queries the typename directly rather than discovering
// it, exactly as the census tooling does.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY): upstream OK
// (incl. zero features) → 200 GeoJSON; upstream failure/timeout/bad body → 502 `{ error }`.
//
// @see server/cordobaZoningProxy.js — the template this mirrors
// @see packages/site-parcel-data/src/providers/resolveZaragozaZone.ts — the client consumer

/** The same-origin route the client's `resolveZaragozaZone` calls. */
export const ZARAGOZA_CALIFICACIONES_PATH = '/api/zaragoza/calificaciones';

/** The IDEZar GeoServer WFS (keyless, public — §ZGZ-SUBGRADO). */
export const ZARAGOZA_WFS_ENDPOINT = 'https://idezar-sig.zaragoza.es/servicios/geoserver/wfs';

export const ZARAGOZA_CALIFICACIONES_LAYER = 'urbanismo:Calificaciones_Urbanas';

/** Half-extent (degrees) of the tiny bbox built around the query point (~5 m). */
export const ZARAGOZA_QUERY_HALF_DEG = 0.00005;
export const ZARAGOZA_UPSTREAM_TIMEOUT_MS = 15_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const ZARAGOZA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ZARAGOZA_CACHE_MAX_ENTRIES = 512;

// ── cache ───────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetZaragozaCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function zaragozaCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = ZARAGOZA_CACHE_TTL_MS) {
    if (_cache.size >= ZARAGOZA_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URL (single source of truth) ─────────────────────────────────────

/**
 * Build the `urbanismo:Calificaciones_Urbanas` spatial GetFeature URL for a WGS84 point. Uses the
 * EXPLICIT `urn:ogc:def:crs:EPSG::4326` axis (lat/lon) on the BBOX — the same C57 discipline
 * `buildCordobaOrdenanzasUrl` applies against the sibling Spanish municipal GeoServer stack.
 */
export function buildZaragozaCalificacionesUrl(lat, lon, halfDeg = ZARAGOZA_QUERY_HALF_DEG) {
    const r = (n) => Number(n.toFixed(7));
    const minLon = r(lon - halfDeg), maxLon = r(lon + halfDeg);
    const minLat = r(lat - halfDeg), maxLat = r(lat + halfDeg);
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: ZARAGOZA_CALIFICACIONES_LAYER,
        propertyName: 'calificacion,descripcion',
        outputFormat: 'application/json',
        count: '10',
        // Authority (lat/lon) axis order — do NOT switch to a bare lon,lat bbox.
        bbox: `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`,
    });
    return `${ZARAGOZA_WFS_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch an IDEZar WFS URL → parsed GeoJSON, or null on ANY failure (non-OK, timeout, non-JSON, or
 * an OGC `ExceptionReport`). NEVER throws. `deps.fetchImpl` is injectable for tests.
 */
export async function fetchZaragozaWfs(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || ZARAGOZA_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Zaragoza-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[zaragoza-proxy] WFS HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            // GeoServer answers an XML ExceptionReport on a bad request — a FAILURE, not empty.
            console.warn('[zaragoza-proxy] WFS returned non-JSON (exception?) — upstream miss.');
            return null;
        }
        return json;
    } catch (err) {
        console.warn('[zaragoza-proxy] WFS fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── handler ───────────────────────────────────────────────────────────────────

/** `GET /api/zaragoza/calificaciones?lat=&lon=` → 200 GeoJSON `{features}` / 502 `{error}` / 400. */
export function makeZaragozaCalificacionesHandler(deps = {}) {
    return async function zaragozaCalificacionesHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }
        const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Zaragoza-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;
        const body = await fetchZaragozaWfs(buildZaragozaCalificacionesUrl(lat, lon), deps);
        if (body === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Zaragoza-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The IDEZar calificación WFS did not answer. This is NOT a statement that the ' +
                    'parcel is outside Zaragoza\'s planned land.',
            });
        }
        const payload = { features: Array.isArray(body.features) ? body.features : [] };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Zaragoza-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const zaragozaCalificacionesHandler = makeZaragozaCalificacionesHandler();
