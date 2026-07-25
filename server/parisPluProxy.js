// §PARIS-PLU-PROXY — the Paris (Ville de Paris, INSEE 75056) PLU bioclimatique zone + hauteur lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveParisPluZone` needs.
// ─────────────────────────────────────────────────────────────────────────────
// A Paris parcel's PLU data lives in government services the browser cannot reach cross-origin
// under CSP (`connect-src 'self'`). This proxy point-queries FOUR keyless upstreams and returns ONE
// combined body `{ zone, hauteur, hmc, filet }` so the client makes a single same-origin call:
//   • ZONE IDENTITY — the Géoportail de l'urbanisme national WFS (data.geopf.fr, layer
//     wfs_du:zone_urba): a point-INTERSECTS returns the PLU zone code (libelle, e.g. `UG`), its label
//     (libelong), the zone type (typezone), the règlement doc (nomfic) and the plan id (idurba).
//   • HAUTEUR PLAFOND — Paris opendata (opendata.paris.fr, dataset plub_hauteur): a point-intersects
//     returns the numeric height CEILING in metres (18 / 25 / 31 / 37), the *plafond* of UG.3.2.1.
//   • HMC (Hauteur Maximale Constructible, UG.3.2.2) — Paris opendata dataset plub_hmc: a SEPARATE
//     spatial overlay (does NOT cover the whole commune). Field `ht_hmc` is the numeric ceiling and
//     `hmc` is its DATUM (e.g. "NGF" = an absolute altitude in metres NGF, NOT a relative height) —
//     carried distinctly and NEVER collapsed into the hauteur plafond.
//   • FILET / gabarit-enveloppe — Paris opendata dataset plub_filet: LineString frontage markings
//     whose `haut` LETTER code encodes the frontage height (K/V/O/P/B/N/G/L → metres; M = same as the
//     existing façade). Because filets are lines, this is a within-distance (not intersects) query.
//
// All the WFS/ODSQL knowledge (field names, axis order, CQL/ODSQL syntax) lives HERE (C58 §1.5); the
// client just parses `{ zone, hauteur, hmc, filet }`.
//
// ⚠ AXIS ORDER (verified live 2026-07-25): the GPU WFS CQL_FILTER with SRSNAME=EPSG:4326 wants
// POINT(lat lon); the opendata ODSQL WKT wants the standard POINT(lon lat). They are DIFFERENT — do
// not "simplify" them to one order.
//
// LIVE-VERIFIED 2026-07-25 at the UG probe point (lat 48.857, lon 2.380): zone UG, hauteur 25 m,
// HMC absent here (honest null — the overlay does not cover this point), nearest filet code "N" (20 m).
// HMC field shapes verified at (2.408404, 48.858855): hmc "NGF", ht_hmc 85.0.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY):
//   • upstreams reachable (incl. genuinely zero features) → 200 `{ zone, hauteur, hmc, filet }` with
//     nulls where a source had nothing → the client reads `no-plu-here` from all-null;
//   • BOTH PRIMARY upstreams (zone + hauteur) failed / timed out → 502 `{ error }` → the client's
//     `res.ok === false` path returns `endpoint-unreachable`. A partial (one source up, one down)
//     still returns 200 with the half we have. HMC/filet are ENRICHMENTS: their failure or absence
//     never flips the answer to unreachable — a real zone + height is still worth showing.
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
/** Paris opendata Explore v2.1 records endpoint for the HMC (hauteur maximale constructible) dataset (keyless). */
export const PARIS_HMC_ENDPOINT =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hmc/records';
/** Paris opendata Explore v2.1 records endpoint for the filet / gabarit-enveloppe dataset (keyless). */
export const PARIS_FILET_ENDPOINT =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_filet/records';

/**
 * The search radius for the nearest filet frontage LINE to the parcel point. Filets are LineString
 * markings along façade alignments, so a point-intersects would almost always miss; we take the
 * nearest filet within this radius as an INFORMATIONAL frontage-gabarit fact (never a per-parcel
 * guarantee — it is refused, not applied). 20 m reproduces the live 2026-07-25 UG-probe result.
 */
export const PARIS_FILET_RADIUS_M = 20;

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

/**
 * opendata `plub_hmc` point-intersects URL (UG.3.2.2, a SEPARATE overlay from hauteur plafond).
 * `ht_hmc` is the numeric ceiling; `hmc` is its datum (e.g. "NGF" = absolute altitude). ⚠ POINT(lon lat).
 */
export function buildParisHmcUrl(lat, lon) {
    const qs = new URLSearchParams({
        where: `intersects(geo_shape, geom'POINT(${lon} ${lat})')`,
        limit: '1',
        select: 'hmc,ht_hmc',
    });
    return `${PARIS_HMC_ENDPOINT}?${qs.toString()}`;
}

/**
 * opendata `plub_filet` NEAREST-within-radius URL. Filets are LineString frontage markings, so this
 * is a within_distance (not intersects) query. `haut` is the letter code → frontage height. ⚠ POINT(lon lat).
 */
export function buildParisFiletUrl(lat, lon) {
    const qs = new URLSearchParams({
        where: `within_distance(geo_shape, geom'POINT(${lon} ${lat})', ${PARIS_FILET_RADIUS_M}m)`,
        limit: '1',
        select: 'haut',
    });
    return `${PARIS_FILET_ENDPOINT}?${qs.toString()}`;
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
 * Extract the HMC ceiling from an opendata plub_hmc records body, or null (no HMC overlay here).
 * `ht_hmc` is the numeric ceiling and `hmc` its datum (e.g. "NGF" = absolute altitude, NOT a relative
 * height) — both carried so the client never mistakes an NGF altitude for a metres-above-ground figure.
 */
export function extractParisHmc(records) {
    const rows = records && Array.isArray(records.results) ? records.results : [];
    const row = rows.length > 0 && rows[0] ? rows[0] : null;
    if (!row) return null;
    const raw = row.ht_hmc;
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    if (!Number.isFinite(n) || n <= 0) return null;
    const datum = typeof row.hmc === 'string' && row.hmc.trim() !== '' ? row.hmc.trim() : null;
    return { hmc_m: n, datum };
}

/**
 * Extract the nearest filet frontage CODE from an opendata plub_filet records body, or null.
 * `haut` is the letter code (K/V/O/P/B/N/G/L → metres; M = same as existing façade) — the client maps
 * it to metres. Only the raw code travels the wire; the code→metres table lives client-side.
 */
export function extractParisFilet(records) {
    const rows = records && Array.isArray(records.results) ? records.results : [];
    const raw = rows.length > 0 && rows[0] ? rows[0].haut : undefined;
    const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    return code !== '' ? { code } : null;
}

/**
 * Fetch the combined `{ zone, hauteur, hmc, filet }` at a WGS84 point, or null when BOTH PRIMARY
 * upstreams (zone + hauteur) are transport-unreachable (distinct from a reachable-but-empty answer).
 * HMC and filet are ENRICHMENTS — their transport failure or absence never forces the unreachable
 * verdict; they simply resolve null. NEVER throws.
 */
export async function fetchParisPlu(lat, lon, deps = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const [zoneRes, hautRes, hmcRes, filetRes] = await Promise.all([
        fetchJson(buildParisZoneUrbaUrl(lat, lon), deps),
        fetchJson(buildParisHauteurUrl(lat, lon), deps),
        fetchJson(buildParisHmcUrl(lat, lon), deps),
        fetchJson(buildParisFiletUrl(lat, lon), deps),
    ]);
    // Both PRIMARY transport failures ⇒ a genuine unreachable (502), never an "empty PLU" answer.
    // (HMC/filet are enrichments — excluded from the reachability verdict on purpose.)
    if (!zoneRes.ok && !hautRes.ok) return null;
    return {
        zone: zoneRes.ok ? extractParisZone(zoneRes.value) : null,
        hauteur: hautRes.ok ? extractParisHauteur(hautRes.value) : null,
        hmc: hmcRes.ok ? extractParisHmc(hmcRes.value) : null,
        filet: filetRes.ok ? extractParisFilet(filetRes.value) : null,
    };
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/paris/plu?lat=&lon=`
 *
 * 200 `{ zone, hauteur, hmc, filet }` — the combined body (any half may be null = nothing published
 *     there; HMC/filet are enrichment overlays that legitimately do not cover every point).
 * 502 `{ error }`         — BOTH primary upstreams (zone + hauteur) failed / timed out (distinct from
 *     an empty answer, so the client returns `endpoint-unreachable`, never `no-plu-here`).
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

        const payload = {
            zone: body.zone ?? null,
            hauteur: body.hauteur ?? null,
            hmc: body.hmc ?? null,
            filet: body.filet ?? null,
        };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Paris-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const parisPluHandler = makeParisPluHandler();
