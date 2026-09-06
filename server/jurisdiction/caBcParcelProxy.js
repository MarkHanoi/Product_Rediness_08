/**
 * @file server/jurisdiction/caBcParcelProxy.js
 * @description BRITISH COLUMBIA — same-origin, KEYLESS server proxy for ParcelMap BC (the PMBC
 *   parcel fabric) on the BC Data Catalogue's public WFS, so a plot drawn in BC resolves its REAL
 *   cadastral parcel (PID, plan number, class, municipality, surveyed area) instead of nothing.
 *
 * WHY THIS ONE AND NOT "CANADA"
 * -----------------------------
 * There IS no Canadian national parcel fabric — land titles and survey are a PROVINCIAL competence,
 * the same reason `tools/context-bake/bake.mjs` splits Canada into 13 rows. So the honest Canadian
 * parcel story is province by province, and BC is the province that answers keylessly. Probed
 * 2026-09-06, each with its exact answer:
 *
 *   ✔ BC — https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetCapabilities
 *       → HTTP 200, 1,317,356 B, 895 published feature types, among them
 *         `pub:WHSE_CADASTRE.PMBC_PARCEL_FABRIC_POLY_SVW` and `pub:WHSE_CADASTRE.PMBC_PARCEL_POLY_SV`.
 *       A real GetFeature over a downtown-Vancouver box (49.2600,-123.1200,49.2620,-123.1180,
 *       urn:ogc:def:crs:EPSG::4326) → HTTP 200, 1,980 B, application/json, TWO features with WGS84
 *       polygon rings and the properties PARCEL_FABRIC_POLY_ID · PARCEL_NAME · PLAN_NUMBER · PIN ·
 *       PID · PID_FORMATTED · PID_NUMBER · PARCEL_STATUS · PARCEL_CLASS · OWNER_TYPE ·
 *       PARCEL_START_DATE · MUNICIPALITY · REGIONAL_DISTRICT · WHEN_UPDATED · FEATURE_AREA_SQM ·
 *       FEATURE_LENGTH_M · OBJECTID · SE_ANNO_CAD_DATA. No key, no token, no registration.
 *
 *   ✖ ONTARIO — NAMED REFUSAL, not an omission. ONLAND/Teranet is the province's registry and is
 *       commercial; the City of Toronto's own ArcGIS (gis.toronto.ca, HTTP 200) publishes NO live
 *       parcel polygon layer — scanning its MapServers for /parcel|property|lot/i returns only
 *       "Property Data Map Block Index - Deprecated", "Property Data Map Block Label - Deprecated"
 *       and "Parking Lot". Toronto's CKAN "Property Boundaries" package (HTTP 200, 12,649 B) is BULK
 *       ONLY — a datastore dump plus SHP/GPKG/CSV/GeoJSON files, with `license_title: "License not
 *       specified"`. A whole-table dump is not a point query and an unspecified licence is not an
 *       open one, so nothing is wired for Ontario.
 *
 *   ✖ QUÉBEC — UNRESOLVED, and recorded as unresolved rather than as "closed". The Cadastre du
 *       Québec is widely described as open, but the door was not found from here on 2026-09-06:
 *       servicescarto.mern.gouv.qc.ca/pes/services/Territoire/CadastreQuebec/MapServer?f=json →
 *       HTTP 400 (ArcGIS Server Error, 919 B — a wrong path, not a refusal), and Données Québec's
 *       CKAN answered package_show?id=cadastre-du-quebec → HTTP 404 while package_search q=cadastre
 *       → HTTP 200 with 251 results (17 for title:cadastre), none of which is the parcel fabric.
 *       A correct endpoint very likely exists; this proxy does not guess one.
 *
 *   ✖ ALBERTA — AltaLIS holds the provincial parcel product commercially; no keyless provincial
 *       endpoint was probed open on 2026-09-06.
 *
 *   ✖ MEXICO — state/municipal and mostly closed. CDMX's portal IS open and answers
 *       (datos.cdmx.gob.mx CKAN, HTTP 200) and publishes "Información Catastral de la Ciudad de
 *       México" under CC-BY-4.0-ESP — but a range-GET of one alcaldía CSV (HTTP 206, text/csv)
 *       shows the columns are codigo_postal · superficie_terreno · superficie_construccion ·
 *       uso_construccion · clave_rango_nivel · anio_construccion · instalaciones_especiales ·
 *       valor_unitario_suelo · valor_suelo · clave_valor_unitario_suelo · subsidio · latitud ·
 *       longitud · colonia · alcaldia. That is a POINT with attributes — there is NO parcel POLYGON
 *       in it — so it cannot answer "what is the boundary of this plot" and is not wired.
 *       datos.gob.mx (the federal catalogue) refused our probe outright: HTTP 403 "Access Denied".
 *
 * SHAPE
 * -----
 * Clones `server/jurisdiction/chGrundnutzungProxy.js` (cache → forward → fallback), because that is
 * the same problem: a keyless government WFS the browser cannot call directly (CSP `connect-src
 * 'self'` plus CORS). Differences, both because of what BC serves:
 *   • BC honours `outputFormat=application/json`, so this returns a GeoJSON FeatureCollection —
 *     `{ parcel: <Feature> | null }` — instead of raw GML. The client does no XML parsing.
 *   • WFS 2.0 BBOX axis order for EPSG:4326 is ambiguous in the wild, so — exactly as the Swiss
 *     proxy does — BOTH orders are tried and the first that returns a feature wins. A wrong-order
 *     bbox lands in the ocean and returns an empty collection, never an error, which is why this is
 *     a runtime hedge and not a comment.
 *
 * NEVER crashes: bad/absent coords → 400; outside BC / no parcel / upstream failure → HTTP 200
 * `{ parcel: null }` so the client renders a cited refusal rather than a fault.
 *
 * ⚠ THIS ROUTE AUTHORISES NOTHING. It returns the parcel the province publishes — identity and
 * surveyed area. BC zoning (and therefore any buildable envelope) is MUNICIPAL and is NOT in this
 * layer; no envelope may be computed from what this returns.
 *
 * @see server/jurisdiction/chGrundnutzungProxy.js — the template this clones
 * @see docs/02-decisions/contracts/C57-PARCEL-DATA-LAYER.md
 */

/** The same-origin route the client calls. */
export const CA_BC_PARCEL_PATH = '/api/ca/bc/parcel';

/** The BC Data Catalogue's PUBLIC WFS — keyless (GetCapabilities probed HTTP 200, 1,317,356 B). */
export const CA_BC_WFS_ENDPOINT = 'https://openmaps.gov.bc.ca/geo/pub/wfs';

/** ParcelMap BC's parcel-fabric polygon feature type (present in the probed capabilities). */
export const CA_BC_PARCEL_TYPENAME = 'pub:WHSE_CADASTRE.PMBC_PARCEL_FABRIC_POLY_SVW';

// ── Config ───────────────────────────────────────────────────────────────────
/** Cadastre changes slowly; a day-stale lookup is fine and keeps us polite to a free public service. */
export const CA_BC_PARCEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CA_BC_PARCEL_CACHE_MAX_ENTRIES = 512;
export const CA_BC_UPSTREAM_TIMEOUT_MS = 15_000;
/** Half-width (degrees) of the point-query bbox (~15 m) — big enough to land inside a parcel,
 *  small enough that the candidate set (and any boundary ambiguity) stays tiny. */
export const CA_BC_BBOX_HALF_DEG = 0.00015;
/** Loose British Columbia bbox — mirrors the bake.mjs / terrain.mjs `britishcolumbia` row. */
export const CA_BC_BBOX = { minLat: 48.20, maxLat: 60.10, minLon: -139.10, maxLon: -114.00 };

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
    _cache.set(key, { value, expires: now + CA_BC_PARCEL_CACHE_TTL_MS });
    while (_cache.size > CA_BC_PARCEL_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}
/** Test/diagnostic helper — clear the shared cache + hit/miss counters. */
export function __resetCaBcParcelCache() { _cache.clear(); _hits = 0; _misses = 0; }
/** Diagnostic snapshot of the cache. */
export function caBcParcelCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

// ── Endpoint construction (THE single source of truth) ───────────────────────

/**
 * Build a BC WFS 2.0 GetFeature URL for a tiny bbox around (lon,lat).
 *
 * `axis` hedges the EPSG:4326 BBOX order, and the two forms are NOT symmetric — they are the two
 * things the OGC spec has meant at different times, so each carries its own CRS URI:
 *   • 'latlon' → `minLat,minLon,maxLat,maxLon,urn:ogc:def:crs:EPSG::4326` — the WFS-2.0 URN, whose
 *     authority-defined axis order for EPSG:4326 is LAT,LON. This is the form PROVED against the
 *     live service on 2026-09-06 (2 features over downtown Vancouver), so it is tried FIRST.
 *   • 'lonlat' → `minLon,minLat,maxLon,maxLat,EPSG:4326` — the legacy short code, which many
 *     MapServer/GeoServer builds interpret as LON,LAT.
 * A wrong order does not error; it lands off-map and returns an empty collection.
 *
 * ⭐ MEASURED 2026-09-06, and it corrects the assumption above: over the same downtown-Vancouver
 * point BOTH forms answered — latlon → 2 features, lonlat → 2 features. This openmaps build does not
 * punish the legacy short code. The hedge stays anyway, for two reasons that are not superstition:
 * the URN form is the one PROVED against the parcel fabric and is therefore tried first, and a
 * server upgrade that starts honouring the URN strictly would silently empty every lookup with no
 * error to see. A hedge that costs one extra request only on a miss is the cheap side of that trade.
 *
 * @param {number} lon
 * @param {number} lat
 * @param {'latlon'|'lonlat'} axis
 * @returns {string}
 */
export function buildCaBcWfsUrl(lon, lat, axis) {
    const d = CA_BC_BBOX_HALF_DEG;
    const minLon = lon - d, maxLon = lon + d, minLat = lat - d, maxLat = lat + d;
    const bbox = axis === 'lonlat'
        ? `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`
        : `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: CA_BC_PARCEL_TYPENAME,
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        count: '5',
        bbox,
    });
    return `${CA_BC_WFS_ENDPOINT}?${params.toString()}`;
}

// ── Response handling ────────────────────────────────────────────────────────

/**
 * Parse a WFS JSON body into a FeatureCollection, or **null** for anything that is not one (an OWS
 * ExceptionReport, an HTML error page, an empty body). null is UNKNOWN — the caller retries the
 * other axis and ultimately answers `{ parcel: null }`; a genuine `{features: []}` is a real EMPTY.
 *
 * @param {string|null} text
 * @returns {{ type: string, features: unknown[] } | null}
 */
export function parseCaBcFeatureCollection(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    try {
        const j = JSON.parse(text);
        return j && j.type === 'FeatureCollection' && Array.isArray(j.features) ? j : null;
    } catch { return null; }
}

/**
 * Choose ONE parcel from a candidate collection: the SMALLEST by the province's own
 * `FEATURE_AREA_SQM`. A ~30 m query box in a dense block can intersect a strata lot, its parent
 * parcel and a road right-of-way; the smallest surveyed area is the one the point is actually in,
 * and picking `features[0]` would hand back whichever the server happened to order first.
 * Returns null for an empty or unusable collection.
 *
 * @param {{ features: unknown[] } | null} fc
 * @returns {object|null}
 */
export function pickCaBcParcel(fc) {
    const feats = (fc?.features ?? []).filter((f) => f && typeof f === 'object' && f.geometry);
    if (feats.length === 0) return null;
    let best = null, bestArea = Infinity;
    for (const f of feats) {
        const a = Number(f.properties?.FEATURE_AREA_SQM);
        const area = Number.isFinite(a) && a > 0 ? a : Infinity;
        if (area < bestArea) { bestArea = area; best = f; }
    }
    return best ?? feats[0];
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
    const timeoutMs = deps.timeoutMs || CA_BC_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json, application/geo+json, */*',
                'User-Agent': 'PRYZM-CA-BC-Parcel-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[ca-bc-parcel-proxy] HTTP ${res.status} for ${url}`);
            return null;
        }
        const text = await res.text();
        return text && text.length > 0 ? text : null;
    } catch (err) {
        console.warn(`[ca-bc-parcel-proxy] fetch failed: ${err?.message ?? err}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve the ParcelMap BC parcel at a WGS84 point, server-side: for each bbox axis order
 * (latlon → lonlat), fetch once; return the chosen Feature from the FIRST axis that carries one.
 * Returns the Feature, or null (no parcel at the point / all upstreams failed or empty). NEVER throws.
 *
 * @param {number} lon
 * @param {number} lat
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<object|null>}
 */
export async function fetchCaBcParcelAtPoint(lon, lat, deps = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    for (const axis of ['latlon', 'lonlat']) {
        const text = await fetchTextOnce(buildCaBcWfsUrl(lon, lat, axis), deps);
        if (!text) continue;
        const fc = parseCaBcFeatureCollection(text);
        if (!fc) continue;                  // an exception report / HTML — try the other axis
        const parcel = pickCaBcParcel(fc);
        if (parcel) return parcel;
        // A valid EMPTY collection means this axis landed off-map -> try the other order.
    }
    return null;
}

/** Set permissive same-origin cache headers on the parcel proxy response. */
function setProxyCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Express handler for GET /api/ca/bc/parcel?lat=<>&lon=<>.
 *
 * Serves a cached-by-coordinate result instantly; otherwise resolves the parcel once, caches it
 * (including a null-miss), and returns `{ parcel: <GeoJSON Feature> | null }`.
 *
 * NEVER crashes: bad/absent coords → 400; outside BC / no parcel / upstream failure → 200
 * `{ parcel: null }`. `deps` is injectable for tests (fetchImpl / timeoutMs).
 */
export function makeCaBcParcelHandler(deps = {}) {
    return async function caBcParcelHandler(req, res) {
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query params (EPSG:4326) are required.' });
        }
        // Guard the BC bbox loosely so a click elsewhere in Canada short-circuits without a
        // pointless government round-trip — and, more importantly, so a parcel is never returned
        // for a point the province does not cover.
        if (lon < CA_BC_BBOX.minLon || lon > CA_BC_BBOX.maxLon || lat < CA_BC_BBOX.minLat || lat > CA_BC_BBOX.maxLat) {
            setProxyCacheHeaders(res);
            res.setHeader('X-Ca-Bc-Parcel-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ parcel: null });
        }

        const key = coordKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            setProxyCacheHeaders(res);
            res.setHeader('X-Ca-Bc-Parcel-Cache', 'HIT');
            return res.status(200).json({ parcel: cached });
        }
        _misses++;

        let parcel = null;
        try {
            parcel = await fetchCaBcParcelAtPoint(lon, lat, deps);
        } catch (err) {
            console.warn('[ca-bc-parcel-proxy] unexpected error:', err?.message ?? err);
            parcel = null;
        }
        cacheSet(key, parcel);

        setProxyCacheHeaders(res);
        res.setHeader('X-Ca-Bc-Parcel-Cache', parcel ? 'MISS-FETCH' : 'MISS-EMPTY');
        return res.status(200).json({ parcel });
    };
}

/** The default production handler (real `fetch`, real endpoint). */
export const caBcParcelHandler = makeCaBcParcelHandler();
