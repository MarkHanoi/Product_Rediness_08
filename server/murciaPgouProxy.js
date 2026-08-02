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

/**
 * §MURCIA-STREET-WIDTH (SIG-MU2) — half-extent (degrees) of the NEIGHBOURHOOD bbox.
 *
 * ⚠ A SECOND, DELIBERATELY DIFFERENT EXTENT, AND HERE IS WHY IT IS NOT THE POINT EXTENT.
 * `MURCIA_QUERY_HALF_DEG` answers *"what calificación covers this pixel?"* — 5 m, one polygon.
 * Measuring a street section needs the polygon on the FAR SIDE of the street, which by definition
 * is not under the click. `measureStreetWidths` casts rays up to `maxSearch_m = 80 m` from our own
 * alineación outline, and that outline can itself be ~150 m across, so the window must cover
 * roughly (half-block + 80 m).
 *
 * 0.002° ≈ 222 m of latitude and ≈ 175 m of longitude at Murcia's latitude (37.99°) — the same
 * figure Barcelona's `BLOCK_BBOX_HALF_DEG` uses for the identical job, so the two cities do not
 * drift apart on a number that means the same thing. Wider would cost upstream time and let a ray
 * escaping a gap claim a block two streets away; narrower would silently under-report frontages on
 * the wide arteries, which is the failure that matters (a missing opposing frontage reads as
 * `no-opposing-frontage`, i.e. a REFUSAL, not a wrong number — so erring wide is the safe side).
 */
export const MURCIA_NEIGHBOURHOOD_HALF_DEG = 0.002;

/**
 * Feature cap for a neighbourhood query. A dense Casco manzana neighbourhood runs to a few hundred
 * calificación polygons; 600 covers it with headroom.
 *
 * ⚠ IT IS A CAP, NOT A PAGE. If GeoServer returns exactly this many the answer may be TRUNCATED,
 * and a truncated neighbourhood can drop the very polygon across the street — which would turn a
 * measurable frontage into a silent `no-opposing-frontage`. The handler flags that case so the
 * client can refuse rather than measure against a partial world (§CONTEXT-DATA-HONESTY).
 */
export const MURCIA_NEIGHBOURHOOD_MAX_FEATURES = 600;
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
export function buildMurciaWfsUrl(typeName, lat, lon, halfDeg = MURCIA_QUERY_HALF_DEG, count = 10) {
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
        count: String(count),
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

/**
 * §MURCIA-STREET-WIDTH (SIG-MU2) — fetch the alineación polygons AROUND a point.
 *
 * This is the input `measureStreetWidths` needs and the point query cannot give: our own block's
 * outline PLUS the outlines across every surrounding street. Murcia is unusually well placed for
 * it — the municipality publishes `pgou_alineaciones` as block-level polygons directly, so this
 * path does NOT depend on `dissolveParcelsToBlockRing`, the Spain-wide cadastral failure that
 * blocks Madrid (2/4 blocks) and Córdoba (0/3).
 *
 * ⚠ ONE LAYER ONLY. `pgou_sectores` is not fetched: a street width is a question about geometry,
 * not about ámbitos, and doubling the upstream cost for an unused answer is not free.
 *
 * @returns `{ alineaciones: Feature[]|null, truncated: boolean }` — `null` = the service did not
 *   answer (NOT "no geometry here"); `truncated` = the cap was hit, so the neighbourhood may be
 *   incomplete and a caller must refuse rather than measure against a partial world.
 */
export async function fetchMurciaAlineacionesNeighbourhood(lat, lon, deps = {}) {
    const halfDeg = deps.halfDeg ?? MURCIA_NEIGHBOURHOOD_HALF_DEG;
    const features = await fetchMurciaWfs(
        buildMurciaWfsUrl(
            MURCIA_CALIFICACION_LAYER, lat, lon, halfDeg, MURCIA_NEIGHBOURHOOD_MAX_FEATURES,
        ),
        deps,
    );
    return {
        alineaciones: features,
        truncated: Array.isArray(features) && features.length >= MURCIA_NEIGHBOURHOOD_MAX_FEATURES,
    };
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
            // The response SHAPE follows the request, so an out-of-bounds neighbourhood answers an
            // honest empty neighbourhood rather than a point-query body the caller cannot read.
            return res.status(200).json(
                String(req.query?.extent ?? '') === 'neighbourhood'
                    ? { alineaciones: [], truncated: false }
                    : { calificaciones: [], sectores: [] },
            );
        }

        // §MURCIA-STREET-WIDTH (SIG-MU2) — `?extent=neighbourhood` returns the surrounding
        // alineación polygons for the street-section measurement. Same route, same CRS/axis fix,
        // same cache discipline: one seam, so the documented axis-order gotcha is fixed in ONE place.
        if (String(req.query?.extent ?? '') === 'neighbourhood') {
            const nKey = `hood:${lat.toFixed(4)},${lon.toFixed(4)}`;
            const nCached = cacheGet(nKey);
            if (nCached !== undefined) {
                _hits++;
                res.setHeader('Cache-Control', 'public, max-age=86400');
                res.setHeader('X-Murcia-Cache', 'HIT');
                return res.status(200).json(nCached);
            }
            _misses++;
            let hood;
            try {
                hood = await fetchMurciaAlineacionesNeighbourhood(lat, lon, deps);
            } catch (err) {
                console.warn('[murcia-proxy] neighbourhood error:', err?.message ?? err);
                hood = { alineaciones: null, truncated: false };
            }
            if (hood.alineaciones === null) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('X-Murcia-Cache', 'MISS-UNREACHABLE');
                return res.status(502).json({
                    error:
                        'The Murcia PGOU WFS did not answer. This is NOT a statement that the area ' +
                        'carries no alineación geometry.',
                });
            }
            // ⚠ A TRUNCATED answer is never cached: pinning a partial neighbourhood for a week
            // would turn one busy response into a lasting under-measurement.
            if (!hood.truncated) cacheSet(nKey, hood);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Murcia-Cache', 'MISS');
            return res.status(200).json(hood);
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
