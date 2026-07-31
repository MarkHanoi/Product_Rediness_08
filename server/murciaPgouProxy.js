// §MURCIA-PGOU-PROXY (INE 30030) — the municipal calificación + ámbito point lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveMurciaZoning` needs.
// ─────────────────────────────────────────────────────────────────────────────
// Murcia's PGOU planning geometry is served as public WFS by the municipal GeoServer
// (`geoserver.murcia.es/geoserver/wfs`). The browser cannot reach it cross-origin under CSP
// `connect-src 'self'`, so — exactly like `server/cordobaZoningProxy.js` — every client hits OUR
// origin and this proxy forwards the two point-intersect queries and returns their GeoJSON.
//
// TWO LAYERS, ONE ROUTE (live-verified 2026-07-31):
//   • `Murcia:pgou_alineaciones` — ⚠ MISLEADINGLY NAMED. Despite "alineaciones" it is a
//     MultiSurface POLYGON layer and it carries the CALIFICACIÓN: `calificacion`, `descripcion`,
//     `uso_global`, `sector`, `url` (the ficha PDF filename), `f_inicial`/`f_fin`.
//   • `Murcia:pgou_sectores` — the ámbito: `sector`, `clase_suelo`, `categoria`, `uso_global`,
//     `pedania`, `superficie`, `f_inicial`/`f_fin`.
//
// ⚠⚠ IT RETURNS NO BUILDABLE NUMBER, AND THERE IS NONE TO RETURN. Neither layer's schema carries
// altura / edificabilidad / ocupación / retranqueo. Murcia's envelope lives in a PRIOR, separately
// approved development instrument (PGOU Arts. 6.6.1–6.6.2 / 5.24.5), so the client's honest output
// is a CITED REFUSAL — see `packages/site-parcel-data/src/providers/murciaZoningProvider.ts`. This
// proxy exists to make that refusal SPECIFIC (it names the user's ámbito, calificación, land class
// and the expediente of the instrument they must obtain), never to produce a figure.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY, L-422/457/
// 467/469), and here that is PER LAYER: each key is `null` when THAT layer's upstream did not
// answer and `[]` when it answered and covers nothing at this point. Both layers down → 502, so the
// client returns `endpoint-unreachable` rather than the false negative "no plan here".
//
// ⚠ CRS/AXIS: the layers are native EPSG:25830 (ETRS89 / UTM 30N). A bare 4326 bbox is silently
// EMPTY against such layers (the documented Córdoba gotcha), so the bbox is issued with the
// EXPLICIT `urn:ogc:def:crs:EPSG::4326` authority axis order (lat/lon), which GeoServer honours,
// and `srsName` asks for 4326 back. If a live probe shows this GeoServer wants the other order,
// change it HERE — one place — never in the client.
//
// @see server/cordobaZoningProxy.js — the template this mirrors
// @see packages/site-parcel-data/src/providers/resolveMurciaZoning.ts — the client consumer
// @see packages/site-parcel-data/src/providers/murciaZoningProvider.ts — the PURE disposition

/** The same-origin route the client's `resolveMurciaZoning` calls. */
export const MURCIA_PGOU_PATH = '/api/es/murcia-pgou';

/** The municipal GeoServer WFS (keyless, public). */
export const MURCIA_WFS_ENDPOINT = 'https://geoserver.murcia.es/geoserver/wfs';

export const MURCIA_CALIFICACION_LAYER = 'Murcia:pgou_alineaciones';
export const MURCIA_SECTOR_LAYER = 'Murcia:pgou_sectores';

/** Half-extent (degrees) of the tiny bbox built around the query point (~5 m). */
export const MURCIA_QUERY_HALF_DEG = 0.00005;
export const MURCIA_UPSTREAM_TIMEOUT_MS = 15_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const MURCIA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MURCIA_CACHE_MAX_ENTRIES = 512;

/** Loose Murcia municipal bbox — mirrors `murciaBbox.ts` (a coarse gate, never an authorisation). */
export const MURCIA_BBOX = { minLat: 37.71, maxLat: 38.12, minLon: -1.39, maxLon: -0.85 };

// ── cache (keyed by rounded coordinate) ───────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetMurciaCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function murciaCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = MURCIA_CACHE_TTL_MS) {
    if (_cache.size >= MURCIA_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URL (single source of truth) ─────────────────────────────────────

/**
 * Build a `GetFeature` URL for one Murcia PGOU layer at a WGS84 point. The BBOX carries the
 * EXPLICIT `urn:ogc:def:crs:EPSG::4326` authority (lat/lon) axis order — see the CRS note above.
 *
 * @param {string} typeName  the WFS layer (`Murcia:pgou_alineaciones` | `Murcia:pgou_sectores`)
 * @param {number} lat
 * @param {number} lon
 * @param {number} [halfDeg]
 * @returns {string}
 */
export function buildMurciaWfsUrl(typeName, lat, lon, halfDeg = MURCIA_QUERY_HALF_DEG) {
    const r = (n) => Number(n.toFixed(7));
    const minLon = r(lon - halfDeg), maxLon = r(lon + halfDeg);
    const minLat = r(lat - halfDeg), maxLat = r(lat + halfDeg);
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        count: '10',
        // Authority (lat/lon) axis order — the documented gotcha against native-25830 layers.
        bbox: `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`,
    });
    return `${MURCIA_WFS_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch a Murcia WFS URL → the parsed GeoJSON `features` array, or null on ANY failure (non-OK,
 * timeout, non-JSON, or an OGC `ExceptionReport`). NEVER throws.
 *
 * ⚠ `null` and `[]` are DIFFERENT ANSWERS and the caller must keep them apart: `null` = the service
 * did not answer; `[]` = it answered and nothing covers this point.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<Array<unknown>|null>}
 */
export async function fetchMurciaWfs(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || MURCIA_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Murcia-PGOU-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[murcia-proxy] WFS HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            // GeoServer answers an XML ExceptionReport on a bad request — a FAILURE, not empty.
            console.warn('[murcia-proxy] WFS returned non-JSON (exception?) — upstream miss.');
            return null;
        }
        return Array.isArray(json?.features) ? json.features : null;
    } catch (err) {
        console.warn('[murcia-proxy] WFS fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve both PGOU layers at a WGS84 point. Returns `{ calificaciones, sectores }` where each is
 * an array (possibly empty) or `null` when THAT layer's upstream did not answer. NEVER throws.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 */
export async function fetchMurciaPgouAtPoint(lat, lon, deps = {}) {
    const [calificaciones, sectores] = await Promise.all([
        fetchMurciaWfs(buildMurciaWfsUrl(MURCIA_CALIFICACION_LAYER, lat, lon), deps),
        fetchMurciaWfs(buildMurciaWfsUrl(MURCIA_SECTOR_LAYER, lat, lon), deps),
    ]);
    return { calificaciones, sectores };
}

// ── handler ───────────────────────────────────────────────────────────────────

/**
 * `GET /api/es/murcia-pgou?lat=&lon=` →
 *   200 `{ calificaciones: Feature[]|null, sectores: Feature[]|null }`
 *   502 `{ error }` when NEITHER layer answered (a failure, never a false "nothing here")
 *   400 on missing/bad coordinates
 *
 * A point outside the loose Murcia bbox short-circuits to 200 with both layers `[]` — an honest
 * empty, not a failure, and no pointless round trip to a municipal service.
 */
export function makeMurciaPgouHandler(deps = {}) {
    return async function murciaPgouHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }
        if (
            lat < MURCIA_BBOX.minLat || lat > MURCIA_BBOX.maxLat ||
            lon < MURCIA_BBOX.minLon || lon > MURCIA_BBOX.maxLon
        ) {
            res.setHeader('X-Murcia-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ calificaciones: [], sectores: [] });
        }

        const key = `pgou:${lat.toFixed(5)},${lon.toFixed(5)}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Murcia-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        let payload;
        try {
            payload = await fetchMurciaPgouAtPoint(lat, lon, deps);
        } catch (err) {
            console.warn('[murcia-proxy] unexpected error:', err?.message ?? err);
            payload = { calificaciones: null, sectores: null };
        }

        if (payload.calificaciones === null && payload.sectores === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Murcia-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The Murcia PGOU WFS did not answer. This is NOT a statement that the parcel ' +
                    'carries no planning record.',
            });
        }

        // ⚠ Cache only a DURABLE answer. A half-answer (one layer down) would otherwise be pinned
        // for a week, turning a transient outage into a lasting wrong answer.
        if (payload.calificaciones !== null && payload.sectores !== null) cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Murcia-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const murciaPgouHandler = makeMurciaPgouHandler();
