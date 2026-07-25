// §PARIS-PLU-PROXY — the Paris (Ville de Paris, INSEE 75056) PLU bioclimatique zone + hauteur lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveParisPluZone` needs.
// ─────────────────────────────────────────────────────────────────────────────
// A Paris parcel's PLU data lives in TWO government services the browser cannot reach cross-origin
// under CSP (`connect-src 'self'`):
//   • ZONE IDENTITY — the Géoportail de l'urbanisme national WFS (data.geopf.fr, layer
//     wfs_du:zone_urba): a point-INTERSECTS returns the PLU zone code (libelle, e.g. `UG`), its label
//     (libelong), the zone type (typezone), the règlement doc (nomfic) and the plan id (idurba).
//   • HAUTEUR PLAFOND — Paris opendata (opendata.paris.fr, dataset plub_hauteur): a point-intersects
//     returns the numeric height ceiling in metres (18 / 25 / 31 / 37).
//
// This proxy forwards BOTH point queries and returns ONE combined body `{ zone, hauteur }` so the
// client makes a single same-origin call. All the WFS/ODSQL knowledge (field names, axis order,
// CQL/ODSQL syntax) lives HERE (C58 §1.5); the client just parses `{ zone: {...}, hauteur: {...} }`.
//
// ⚠ AXIS ORDER (verified live 2026-07-25): the GPU WFS CQL_FILTER with SRSNAME=EPSG:4326 wants
// POINT(lat lon); the opendata ODSQL WKT wants the standard POINT(lon lat). They are DIFFERENT — do
// not "simplify" them to one order.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY):
//   • both upstreams reachable (incl. genuinely zero features) → 200 `{ zone, hauteur }` with nulls
//     where a source had nothing → the client reads `no-plu-here` from both-null;
//   • BOTH upstreams failed / timed out → 502 `{ error }` → the client's `res.ok === false` path
//     returns `endpoint-unreachable`. A partial (one source up, one down) still returns 200 with the
//     half we have — a real height with an unknown zone is still worth showing.
//
// @see server/madridCondicionesProxy.js / server/chGrundnutzungProxy.js — the templates this mirrors.
// @see packages/site-parcel-data/src/providers/resolveParisPluZone.ts — the client consumer.

/** The same-origin route the client's `resolveParisPluZone` calls. */
export const PARIS_PLU_PATH = '/api/paris/plu';

/** Géoportail de l'urbanisme national WFS root (keyless). */
export const PARIS_ZONE_URBA_ENDPOINT = 'https://data.geopf.fr/wfs/ows';
/** Paris opendata Explore v2.1 records endpoint for the hauteur-plafond dataset (keyless). */
export const PARIS_HAUTEUR_ENDPOINT =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hauteur/records';

export const PARIS_UPSTREAM_TIMEOUT_MS = 15_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const PARIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PARIS_CACHE_MAX_ENTRIES = 512;

// ── cache ──────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetParisCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function parisCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

function cacheKey(lat, lon) { return `${lat.toFixed(5)},${lon.toFixed(5)}`; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = PARIS_CACHE_TTL_MS) {
    if (_cache.size >= PARIS_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URLs (single source of truth) ────────────────────────────────────

/** GPU `zone_urba` point-INTERSECTS URL. ⚠ CQL axis is POINT(lat lon) for SRSNAME=EPSG:4326. */
export function buildParisZoneUrbaUrl(lat, lon) {
    const qs = new URLSearchParams({
        SERVICE: 'WFS',
        VERSION: '2.0.0',
        REQUEST: 'GetFeature',
        typeNames: 'wfs_du:zone_urba',
        outputFormat: 'application/json',
        count: '1',
        SRSNAME: 'EPSG:4326',
        CQL_FILTER: `INTERSECTS(the_geom,POINT(${lat} ${lon}))`,
    });
    return `${PARIS_ZONE_URBA_ENDPOINT}?${qs.toString()}`;
}

/** opendata `plub_hauteur` point-intersects URL. ⚠ ODSQL WKT axis is the standard POINT(lon lat). */
export function buildParisHauteurUrl(lat, lon) {
    const qs = new URLSearchParams({
        where: `intersects(geo_shape, geom'POINT(${lon} ${lat})')`,
        limit: '1',
        select: 'hauteur',
    });
    return `${PARIS_HAUTEUR_ENDPOINT}?${qs.toString()}`;
}

// ── upstream fetches — each returns { ok, value }: ok=false means TRANSPORT error, not empty ──────

async function fetchJson(url, deps) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || PARIS_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Paris-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[paris-proxy] HTTP ${res.status} — upstream miss for ${url.slice(0, 80)}…`);
            return { ok: false, value: null };
        }
        const text = await res.text();
        try { return { ok: true, value: JSON.parse(text) }; } catch {
            console.warn('[paris-proxy] non-JSON body — upstream miss.');
            return { ok: false, value: null };
        }
    } catch (err) {
        console.warn('[paris-proxy] fetch failed:', err?.message ?? err);
        return { ok: false, value: null };
    } finally {
        clearTimeout(timer);
    }
}

/** Extract the zone identity from a GPU zone_urba GeoJSON body, or null (no feature). */
export function extractParisZone(geojson) {
    const feats = geojson && Array.isArray(geojson.features) ? geojson.features : [];
    const p = feats.length > 0 && feats[0] && feats[0].properties ? feats[0].properties : null;
    if (!p || !p.libelle) return null;
    return {
        libelle: p.libelle ?? null,
        libelong: p.libelong ?? null,
        typezone: p.typezone ?? null,
        nomfic: p.nomfic ?? null,
        idurba: p.idurba ?? null,
        datappro: p.datappro ?? null,
    };
}

/** Extract the numeric hauteur (metres) from an opendata plub_hauteur records body, or null. */
export function extractParisHauteur(records) {
    const rows = records && Array.isArray(records.results) ? records.results : [];
    const raw = rows.length > 0 && rows[0] ? rows[0].hauteur : undefined;
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? { hauteur_m: n } : null;
}

/**
 * Fetch the combined `{ zone, hauteur }` at a WGS84 point, or null when BOTH upstreams are
 * transport-unreachable (distinct from a reachable-but-empty answer). NEVER throws.
 */
export async function fetchParisPlu(lat, lon, deps = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const [zoneRes, hautRes] = await Promise.all([
        fetchJson(buildParisZoneUrbaUrl(lat, lon), deps),
        fetchJson(buildParisHauteurUrl(lat, lon), deps),
    ]);
    // Both transport failures ⇒ a genuine unreachable (502), never an "empty PLU" answer.
    if (!zoneRes.ok && !hautRes.ok) return null;
    return {
        zone: zoneRes.ok ? extractParisZone(zoneRes.value) : null,
        hauteur: hautRes.ok ? extractParisHauteur(hautRes.value) : null,
    };
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/paris/plu?lat=&lon=`
 *
 * 200 `{ zone, hauteur }` — the combined body (either half may be null = nothing published there).
 * 502 `{ error }`         — BOTH upstreams failed / timed out (distinct from an empty answer, so the
 *     client returns `endpoint-unreachable`, never `no-plu-here`).
 * 400                     — missing/invalid coordinates.
 */
export function makeParisPluHandler(deps = {}) {
    return async function parisPluHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }

        const key = cacheKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Paris-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        const body = await fetchParisPlu(lat, lon, deps);
        if (body === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Paris-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The Paris PLU services (GPU zone_urba / opendata plub_hauteur) did not answer. ' +
                    'This is NOT a statement that the parcel has no PLU zone or height.',
            });
        }

        const payload = { zone: body.zone ?? null, hauteur: body.hauteur ?? null };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Paris-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const parisPluHandler = makeParisPluHandler();
