// §MADRID-NORMAS-ZONALES-PROXY — the Madrid PGOUM-97 **zone-code** lookup (parcel → Norma Zonal).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — and why it is a SECOND Madrid proxy, not a parameter on the first.
// ─────────────────────────────────────────────────────────────────────────────
// `server/madridCondicionesProxy.js` answers ONE question: *"what buildable FOOTPRINT does the
// PGOUM publish at this point?"* — the Norma Zonal 1 *Fondo de la Edificación*. It cannot answer
// *"which Norma Zonal is this parcel in?"*, because `PG_CONDICIONES_EDIFICACION` is an NZ-1-shaped
// plane: its `COND_EDIF` is a per-manzana condition code, and `SOURCES.md` §0.3 states explicitly
// *"Take the zonal grado from `NORMAS_ZONALES.AMB_TX_ETIQ`, never from `COND_EDIF`"*. Two questions,
// two services, two proxies.
//
// THE MASTER ROUTING LAYER (MADRID-DATA-RECON-SPIKE §2, probed live 2026-07-24; VERIFICATION.md V5):
//
//   sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0
//
// `AMB_TX_ETIQ` returns exactly **34 distinct values** — `1.1…1.6` (NZ 1), `3.1…3.2` (NZ 3), `4`,
// `5.1…5.3`, `7.1.a/7.1.b/7.2.e`, ten NZ 8 codes and six NZ 9 codes. That vocabulary is the one
// `esMadridPgoum97.ts` was extracted against, so the routing key needs no translation table.
// `AMB_TX_DENOM` (the official denomination) is requested alongside it: probe P1 in
// `sources/VERIFICATION.md` §1a records it as ASSERTED-not-queried, so this proxy asks for it and
// the client treats an absent field as absent — never as a blank label it invented.
//
// THE JOIN IS SPATIAL, exactly as it is for the condiciones plane: `CODMANZANA` is not a refcat
// substring (VERIFICATION.md V11), so the query keys on the parcel's WGS84 POINT. `returnGeometry`
// is FALSE — the zone polygon is not needed, only its code, and not fetching it keeps the response
// small enough to cache aggressively.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY, L-422/457/469):
//   • upstream OK (incl. genuinely zero features) → 200 with `{ features: [...] }` → the client reads
//     `no-feature` from an empty array, which is a real statement: *the master zoning layer publishes
//     no Norma Zonal at this point*;
//   • upstream failure / timeout / bad body / ArcGIS `{error}` envelope → 502 `{ error }` → the
//     client's `res.ok === false` path returns `endpoint-unreachable`.
// A failure is NEVER cached; an empty answer IS (it is an answer).
//
// @see server/madridCondicionesProxy.js — the sibling this mirrors line-for-line
// @see packages/site-parcel-data/src/providers/resolveMadridNormaZonal.ts — the client consumer

/** The same-origin route the client's `resolveMadridNormaZonal` calls. */
export const MADRID_NORMAS_ZONALES_PATH = '/api/madrid/normas-zonales';

/** sigma.madrid.es — the keyless master Norma-Zonal routing layer (recon §2, VERIFICATION V5). */
export const MADRID_NORMAS_ZONALES_ENDPOINT =
    'https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query';

export const MADRID_NZ_UPSTREAM_TIMEOUT_MS = 15_000;
/** Zoning boundaries change on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const MADRID_NZ_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MADRID_NZ_CACHE_MAX_ENTRIES = 512;

// ── cache ──────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetMadridNormasZonalesCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function madridNormasZonalesCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

/** Round to ~1 m so neighbouring clicks on the same parcel share a cache entry. */
function cacheKey(lat, lon) { return `${lat.toFixed(5)},${lon.toFixed(5)}`; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = MADRID_NZ_CACHE_TTL_MS) {
    if (_cache.size >= MADRID_NZ_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URL (single source of truth) ─────────────────────────────────────

/**
 * Build the NORMAS_ZONALES layer-0 spatial point-intersect query URL for a WGS84 point.
 * `geometry=<lon>,<lat>` (Esri point order), `inSR=4326`, `returnGeometry=false` (the code is the
 * whole answer), and the two attributes the client reads: `AMB_TX_ETIQ` (the routing code) and
 * `AMB_TX_DENOM` (the official denomination, probe P1 — requested, never assumed present).
 */
export function buildMadridNormasZonalesUrl(lat, lon) {
    const qs = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'AMB_TX_ETIQ,AMB_TX_DENOM',
        returnGeometry: 'false',
        f: 'json',
    });
    return `${MADRID_NORMAS_ZONALES_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch the raw Esri JSON at a point. Resolves to the parsed body on a 2xx JSON response, or null on
 * ANY failure (non-OK, timeout, non-JSON, or an ArcGIS `{error}` envelope). NEVER throws. `deps` is
 * injectable so the route is unit-testable without the network.
 */
export async function fetchMadridNormasZonales(lat, lon, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || MADRID_NZ_UPSTREAM_TIMEOUT_MS;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(buildMadridNormasZonalesUrl(lat, lon), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Madrid-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[madrid-proxy] normas-zonales HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            console.warn('[madrid-proxy] normas-zonales returned non-JSON — upstream miss.');
            return null;
        }
        // An ArcGIS error envelope ({ error: { code, message } }) is a FAILURE, not an empty area.
        if (json && typeof json === 'object' && json.error) {
            console.warn('[madrid-proxy] ArcGIS error envelope — upstream miss:', json.error?.message ?? json.error);
            return null;
        }
        return json;
    } catch (err) {
        console.warn('[madrid-proxy] normas-zonales fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/madrid/normas-zonales?lat=&lon=`
 *
 * 200 `{ features: [...] }` — the raw Esri layer-0 response (possibly `features: []` = the master
 *     zoning layer publishes no Norma Zonal here). The client reads `attributes.AMB_TX_ETIQ`.
 * 502 `{ error }`         — upstream failure / timeout / bad body (distinct from an empty answer, so
 *     the client returns `endpoint-unreachable`, never `no-feature`).
 * 400                     — missing/invalid coordinates.
 */
export function makeMadridNormasZonalesHandler(deps = {}) {
    return async function madridNormasZonalesHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }

        const key = cacheKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Madrid-NZ-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        const body = await fetchMadridNormasZonales(lat, lon, deps);
        if (body === null) {
            // A failure must never be cached and must never look like an empty answer.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Madrid-NZ-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The Madrid PGOUM-97 Normas Zonales service did not answer. This is NOT a statement ' +
                    'that the parcel has no Norma Zonal.',
            });
        }

        // Normalise to `{ features: [...] }` so the client always reads an array (never a null crash).
        const payload = { features: Array.isArray(body.features) ? body.features : [] };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Madrid-NZ-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const madridNormasZonalesHandler = makeMadridNormasZonalesHandler();
