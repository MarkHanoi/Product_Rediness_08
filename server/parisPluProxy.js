// §PARIS-PLU-PROXY — the Paris (Ville de Paris, INSEE 75056) PLU bioclimatique zone + hauteur lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveParisPluZone` needs.
// ─────────────────────────────────────────────────────────────────────────────
// A Paris parcel's PLU data lives in government services the browser cannot reach cross-origin
// under CSP (`connect-src 'self'`). This proxy point-queries SIX keyless upstreams and returns ONE
// combined body `{ zone, hauteur, hmc, filet, ecm, eal }` so the client makes a single same-origin call:
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
//     existing façade) and whose `cour` code encodes the CROWN/couronnement (X = continuous, per art.
//     UG.3.2.4; P/H/C/L/M = pitched). Because filets are lines, this is a within-distance query.
//   • ECM — *emprise constructible maximale* — Paris opendata dataset plub_ecm: a point-INTERSECTS
//     returns the real buildable-FOOTPRINT POLYGON (geo_shape), the source planimetric area
//     (st_area_shape, m²), the max coverage `emprise` (%, 0.0 = not specified) and the graphic
//     `hauteur` (m, 0.0 = not specified) and the cadastral join (c_sec/c_asp/n_pc). ⚠ This layer does
//     NOT cover the whole commune — where it is absent the client honestly REFUSES the footprint.
//   • EAL — *espaces à libérer* — Paris opendata dataset plub_eal: a point-INTERSECTS returns
//     liberation-strip polygons to SUBTRACT from the buildable footprint (geo_shape + st_area_shape).
//
// All the WFS/ODSQL knowledge (field names, axis order, CQL/ODSQL syntax) lives HERE (C58 §1.5); the
// client just parses `{ zone, hauteur, hmc, filet, ecm, eal }`.
//
// ⚠ QUERY MODE (verified live 2026-07-26): the opendata layers are queried with ODSQL
// `where=intersects(geo_shape, geom'POINT(lon lat)')` (point-in-polygon) — NOT `geofilter.distance`,
// which on these datasets does NOT filter (it returns the whole dataset sorted by distance, so the
// nearest row can be kilometres away). ECM/EAL/HMC are point-INTERSECTS; the line-based filet stays a
// within_distance query. Live at (48.88277, 2.39303): ECM 83.12 m² (emprise 0, hauteur 0), hauteur 25 m.
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
/** Paris opendata Explore v2.1 records endpoint for the ECM (emprise constructible maximale) dataset (keyless). */
export const PARIS_ECM_ENDPOINT =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_ecm/records';
/** Paris opendata Explore v2.1 records endpoint for the EAL (espaces à libérer) dataset (keyless). */
export const PARIS_EAL_ENDPOINT =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_eal/records';

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
 * is a within_distance (not intersects) query. `haut` is the letter code → frontage height; `cour` is
 * the CROWN/couronnement code (X = continuous per art. UG.3.2.4; P/H/C/L/M = pitched). ⚠ POINT(lon lat).
 */
export function buildParisFiletUrl(lat, lon) {
    const qs = new URLSearchParams({
        where: `within_distance(geo_shape, geom'POINT(${lon} ${lat})', ${PARIS_FILET_RADIUS_M}m)`,
        limit: '1',
        select: 'haut,cour',
    });
    return `${PARIS_FILET_ENDPOINT}?${qs.toString()}`;
}

/**
 * opendata `plub_ecm` point-INTERSECTS URL — the *emprise constructible maximale* buildable footprint.
 * Returns the real POLYGON (geo_shape), the source planimetric area (st_area_shape), the max coverage
 * `emprise` (%, 0 = not specified), the graphic `hauteur` (m, 0 = not specified) and the cadastral join.
 * ⚠ ODSQL WKT axis is the standard POINT(lon lat). ⚠ This layer does NOT cover the whole commune.
 */
export function buildParisEcmUrl(lat, lon) {
    const qs = new URLSearchParams({
        where: `intersects(geo_shape, geom'POINT(${lon} ${lat})')`,
        limit: '1',
        select: 'emprise,hauteur,st_area_shape,c_sec,c_asp,n_pc,geo_shape',
    });
    return `${PARIS_ECM_ENDPOINT}?${qs.toString()}`;
}

/**
 * opendata `plub_eal` point-INTERSECTS URL — the *espaces à libérer* liberation strips to SUBTRACT
 * from the buildable footprint. Returns the polygon (geo_shape) + its source area (st_area_shape).
 * ⚠ ODSQL WKT axis is the standard POINT(lon lat).
 */
export function buildParisEalUrl(lat, lon) {
    const qs = new URLSearchParams({
        where: `intersects(geo_shape, geom'POINT(${lon} ${lat})')`,
        limit: '1',
        select: 'st_area_shape,geo_shape',
    });
    return `${PARIS_EAL_ENDPOINT}?${qs.toString()}`;
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
 * Extract the nearest filet frontage CODE + CROWN code from an opendata plub_filet records body, or
 * null. `haut` is the frontage letter code (K/V/O/P/B/N/G/L → metres; M = same as existing façade);
 * `cour` is the CROWN/couronnement code (X = continuous per art. UG.3.2.4; P/H/C/L/M = pitched). Only
 * the raw codes travel the wire; the code→metres table and the crown semantics live client-side.
 */
export function extractParisFilet(records) {
    const rows = records && Array.isArray(records.results) ? records.results : [];
    const row = rows.length > 0 && rows[0] ? rows[0] : null;
    if (!row) return null;
    const code = typeof row.haut === 'string' ? row.haut.trim().toUpperCase() : '';
    const cour = typeof row.cour === 'string' ? row.cour.trim().toUpperCase() : '';
    if (code === '' && cour === '') return null;
    return { code: code || null, cour: cour || null };
}

/**
 * Extract the OUTER ring of a Paris opendata `geo_shape` (a GeoJSON Feature wrapping a Polygon or
 * MultiPolygon) as an array of `[lon, lat]` pairs, or null. Holes/inner rings are dropped — the
 * buildable footprint is the outer boundary; the ECM strips are already the net emprise. Pure.
 */
export function extractOuterRing(geoShape) {
    const geom = geoShape && geoShape.geometry ? geoShape.geometry : geoShape;
    if (!geom || !Array.isArray(geom.coordinates)) return null;
    let outer = null;
    if (geom.type === 'Polygon') outer = geom.coordinates[0];
    else if (geom.type === 'MultiPolygon') outer = geom.coordinates[0] && geom.coordinates[0][0];
    if (!Array.isArray(outer) || outer.length < 3) return null;
    // Keep only clean [lon, lat] numeric pairs.
    const ring = [];
    for (const pt of outer) {
        if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
            ring.push([pt[0], pt[1]]);
        }
    }
    return ring.length >= 3 ? ring : null;
}

/** A finite positive number, or null. Paris publishes "not specified" as 0.0 — mapped to null here. */
function positiveOrNull(raw) {
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extract the ECM (emprise constructible maximale) buildable footprint from an opendata plub_ecm
 * records body, or null (no ECM polygon at this point — the client honestly refuses the footprint).
 * `ring` is the real polygon (WGS84 [lon,lat]); `areaM2` the source planimetric area (st_area_shape);
 * `emprisePct` the max coverage % and `graphicHeight` the graphic height (both 0 = not specified → null).
 */
export function extractParisEcm(records) {
    const rows = records && Array.isArray(records.results) ? records.results : [];
    const row = rows.length > 0 && rows[0] ? rows[0] : null;
    if (!row) return null;
    const ring = extractOuterRing(row.geo_shape);
    if (!ring) return null; // geometry is the whole point of ECM — no ring, no footprint.
    const cadastral =
        typeof row.c_asp === 'string' && row.c_asp.trim() !== '' ? row.c_asp.trim() : null;
    return {
        ring,
        areaM2: positiveOrNull(row.st_area_shape),
        emprisePct: positiveOrNull(row.emprise), // 0.0 = not specified → null
        graphicHeight: positiveOrNull(row.hauteur), // 0.0 = not specified → null
        cadastral,
    };
}

/**
 * Extract an EAL (espace à libérer) liberation strip from an opendata plub_eal records body, or null.
 * `ring` is the polygon to SUBTRACT from the footprint (WGS84 [lon,lat]); `areaM2` its source area.
 */
export function extractParisEal(records) {
    const rows = records && Array.isArray(records.results) ? records.results : [];
    const row = rows.length > 0 && rows[0] ? rows[0] : null;
    if (!row) return null;
    const ring = extractOuterRing(row.geo_shape);
    if (!ring) return null;
    return { ring, areaM2: positiveOrNull(row.st_area_shape) };
}

/**
 * Fetch the combined `{ zone, hauteur, hmc, filet, ecm, eal }` at a WGS84 point, or null when BOTH
 * PRIMARY upstreams (zone + hauteur) are transport-unreachable (distinct from a reachable-but-empty
 * answer). HMC, filet, ECM and EAL are ENRICHMENTS — their transport failure or absence never forces
 * the unreachable verdict; they simply resolve null. NEVER throws.
 *
 * ⚠ ECM is an enrichment for REACHABILITY, but it is the STRUCTURED FOOTPRINT the envelope engine
 * needs: where it is null the client refuses the footprint component honestly (never a parcel×% guess).
 */
export async function fetchParisPlu(lat, lon, deps = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const [zoneRes, hautRes, hmcRes, filetRes, ecmRes, ealRes] = await Promise.all([
        fetchJson(buildParisZoneUrbaUrl(lat, lon), deps),
        fetchJson(buildParisHauteurUrl(lat, lon), deps),
        fetchJson(buildParisHmcUrl(lat, lon), deps),
        fetchJson(buildParisFiletUrl(lat, lon), deps),
        fetchJson(buildParisEcmUrl(lat, lon), deps),
        fetchJson(buildParisEalUrl(lat, lon), deps),
    ]);
    // Both PRIMARY transport failures ⇒ a genuine unreachable (502), never an "empty PLU" answer.
    // (HMC/filet/ecm/eal are enrichments — excluded from the reachability verdict on purpose.)
    if (!zoneRes.ok && !hautRes.ok) return null;
    return {
        zone: zoneRes.ok ? extractParisZone(zoneRes.value) : null,
        hauteur: hautRes.ok ? extractParisHauteur(hautRes.value) : null,
        hmc: hmcRes.ok ? extractParisHmc(hmcRes.value) : null,
        filet: filetRes.ok ? extractParisFilet(filetRes.value) : null,
        ecm: ecmRes.ok ? extractParisEcm(ecmRes.value) : null,
        eal: ealRes.ok ? extractParisEal(ealRes.value) : null,
    };
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/paris/plu?lat=&lon=`
 *
 * 200 `{ zone, hauteur, hmc, filet, ecm, eal }` — the combined body (any half may be null = nothing
 *     published there; HMC/filet/ecm/eal are enrichment overlays that legitimately do not cover every
 *     point — ECM in particular is absent for large parts of the commune, and the client then refuses
 *     the footprint component rather than fabricate one).
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
            ecm: body.ecm ?? null,
            eal: body.eal ?? null,
        };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Paris-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const parisPluHandler = makeParisPluHandler();
