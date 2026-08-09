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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §COR-MANZANA-PROXY (2026-08-04) — `idecordoba:manzana`, the PUBLISHED block-ring layer.
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY A SEPARATE ROUTE, ON A SEPARATE HOST. `coaco:*` above lives on the COACo GeoServer
// (`geoserver.pgou.coacordoba.org`) and carries the calificación. `idecordoba:manzana` is a
// DIFFERENT publisher — the Ayuntamiento's own IDE (Infraestructura de Datos Espaciales) GeoServer
// — and carries no zoning at all, only the block outline (base cartography). It is the missing
// piece `packages/site-parcel-data/src/geometry/streetWidth.ts` names as "(a) its own parcel/block
// source that can produce a block ring": a manzana IS a ring, published directly, no dissolve.
//
// ⚠⚠ THE HOST, AND WHY IT IS WRITTEN OUT IN FULL HERE, ON PURPOSE. Live-verified 2026-08-04 via a
// real `GetFeature` (not just `GetCapabilities`): the correct origin is
//
//     https://ide.cordoba.es/geoserver/wfs
//
// **NOT** `idecordoba.cordoba.es` — a domain that does not resolve at all, despite appearing (as a
// plain assertion, never re-fetched) in three earlier documents/files. `idecordoba` is the WFS
// WORKSPACE PREFIX (`idecordoba:manzana`), not part of the hostname — the same shape as
// `coaco:ordenanzas` living on `geoserver.pgou.coacordoba.org`, not `coaco.cordoba.es`. A workspace
// prefix and a hostname are independent facts about a GeoServer and must never be inferred from
// each other. `GetFeature&typeNames=idecordoba:manzana&count=3&outputFormat=application/json`
// returned real MultiPolygon geometry, `crs: urn:ogc:def:crs:EPSG::25830`, coordinates in the
// ~366 000 E / ~4 210 000 N range (plausible Córdoba UTM 30N), and `totalFeatures: 20 730` —
// matching `LAYER2-GEOMETRY-RECOVERY-2026-08-02.md`'s prior count exactly, which is strong
// corroboration that document's coverage claim (92.9 % of ordenanza polygons / 88.0 % of pilot
// ordenanza land) still describes the live layer, not a stale snapshot.
//
// ⚠ SAME CRS/AXIS DISCIPLINE AS MURCIA (§NATIVE-CRS-MEASUREMENT, `server/murciaPgouProxy.js`'s own
// header): the BBOX selection window uses the EXPLICIT `urn:ogc:def:crs:EPSG::4326` authority
// (lat/lon) axis order (a bare 4326 bbox is silently EMPTY against a native-25830 layer — the
// documented Córdoba gotcha this very file's `coaco:*` routes above already worked around); the
// response `srsName` is the layer's OWN native `EPSG:25830`, never reprojected to degrees before
// serialisation — a 4-decimal degree serialisation quantises geometry to ~10 m against Art.
// 13.5.3.1's 2 m-apart bands, which is the entire reason `nativeCrs.ts` exists.
//
// HONESTY — mirrors `fetchMurciaAlineacionesNeighbourhood`: `null` (upstream did not answer) and
// `[]` (it answered, nothing published here) are different values and stay apart to the client.

/** The same-origin route the client's `resolveCordobaStreetWidth` calls. */
export const CORDOBA_MANZANA_PATH = '/api/cordoba/manzana';

/** The Ayuntamiento de Córdoba IDE GeoServer WFS (keyless, public). ⚠ `ide.` — see header above. */
export const CORDOBA_IDE_WFS_ENDPOINT = 'https://ide.cordoba.es/geoserver/wfs';

export const CORDOBA_MANZANA_LAYER = 'idecordoba:manzana';

/** §NATIVE-CRS-MEASUREMENT — the layer's own published metric CRS; never asked for in 4326. */
export const CORDOBA_MANZANA_NATIVE_CRS = 'EPSG:25830';

/**
 * Half-extent (degrees) of the NEIGHBOURHOOD bbox — the window `measureStreetWidths` needs to see
 * both our own manzana and the ones across every surrounding street. Mirrors
 * `MURCIA_NEIGHBOURHOOD_HALF_DEG` exactly (same job, same reasoning: half a block plus the 80 m ray
 * search distance), so the two cities do not drift apart on a number that means the same thing.
 */
export const CORDOBA_MANZANA_NEIGHBOURHOOD_HALF_DEG = 0.002;

/** Feature cap for a neighbourhood query — mirrors `MURCIA_NEIGHBOURHOOD_MAX_FEATURES`. */
export const CORDOBA_MANZANA_MAX_FEATURES = 600;

/** Build the `idecordoba:manzana` neighbourhood `GetFeature` URL for a WGS84 point. */
export function buildCordobaManzanaUrl(
    lat, lon, halfDeg = CORDOBA_MANZANA_NEIGHBOURHOOD_HALF_DEG, count = CORDOBA_MANZANA_MAX_FEATURES,
) {
    const r = (n) => Number(n.toFixed(7));
    const minLon = r(lon - halfDeg), maxLon = r(lon + halfDeg);
    const minLat = r(lat - halfDeg), maxLat = r(lat + halfDeg);
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: CORDOBA_MANZANA_LAYER,
        outputFormat: 'application/json',
        // §NATIVE-CRS-MEASUREMENT — the layer's own metric CRS, at full serialised precision.
        srsName: CORDOBA_MANZANA_NATIVE_CRS,
        count: String(count),
        // Authority (lat/lon) axis order — the documented gotcha against native-25830 layers.
        bbox: `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`,
    });
    return `${CORDOBA_IDE_WFS_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch the manzana polygons AROUND a point → `{ features: Feature[]|null, truncated }`. `null` =
 * the IDE WFS did not answer (NOT "no block published here"). NEVER throws.
 */
export async function fetchCordobaManzanaNeighbourhood(lat, lon, deps = {}) {
    const halfDeg = deps.halfDeg ?? CORDOBA_MANZANA_NEIGHBOURHOOD_HALF_DEG;
    const url = buildCordobaManzanaUrl(lat, lon, halfDeg, CORDOBA_MANZANA_MAX_FEATURES);
    const body = await fetchCordobaWfs(url, deps);
    if (body === null || !Array.isArray(body.features)) return { features: null, truncated: false };
    return {
        features: body.features,
        truncated: body.features.length >= CORDOBA_MANZANA_MAX_FEATURES,
    };
}

/**
 * `GET /api/cordoba/manzana?lat=&lon=` →
 *   200 `{ crs: 'EPSG:25830', manzanas: Feature[]|null, truncated: boolean }`
 *   502 `{ error }` when the IDE WFS did not answer
 *   400 on missing/bad coordinates
 *
 * Mirrors `makeMurciaPgouHandler`'s `?extent=neighbourhood` branch: `crs` travels on every body,
 * including empty ones, so a consumer never has to special-case which answer carries it.
 */
export function makeCordobaManzanaHandler(deps = {}) {
    return async function cordobaManzanaHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }
        const key = `mz:${lat.toFixed(4)},${lon.toFixed(4)}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Cordoba-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;
        let hood;
        try {
            hood = await fetchCordobaManzanaNeighbourhood(lat, lon, deps);
        } catch (err) {
            console.warn('[cordoba-proxy] manzana neighbourhood error:', err?.message ?? err);
            hood = { features: null, truncated: false };
        }
        if (hood.features === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Cordoba-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The idecordoba (IDE Córdoba) manzana WFS did not answer. This is NOT a ' +
                    'statement that no block is published at this point.',
            });
        }
        const payload = {
            crs: CORDOBA_MANZANA_NATIVE_CRS,
            manzanas: hood.features,
            truncated: hood.truncated,
        };
        // ⚠ A TRUNCATED answer is never cached — pinning a partial neighbourhood for a week would
        // turn one busy response into a lasting under-measurement (mirrors the Murcia proxy).
        if (!hood.truncated) cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Cordoba-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const cordobaManzanaHandler = makeCordobaManzanaHandler();
