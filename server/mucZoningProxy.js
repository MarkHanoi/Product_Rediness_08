// §MUC-ZONING-PROXY (L-480) — the Catalan planning-qualification (clau) lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — it is the ONE missing input that keeps Barcelona "ESTIMATED".
// ─────────────────────────────────────────────────────────────────────────────
// The buildable-envelope chain for Barcelona was complete except for a single
// fact: WHICH ZONE a parcel is in. ADR-0271 shipped the Art. 242.2 construction,
// L-473/L-474 shipped the block ring (`/api/catastro/block`) and the founder-signed
// `ES_BARCELONA_ENSANCHE_PACK` (clau 13a/13E) — but nothing in PRYZM could say
// "this parcel is 13a". Without that the pack cannot be applied, so every value
// in the envelope panel is an estimated default (the panel's own honest badge:
// "7 of 7 value(s) are ESTIMATED — not an authoritative determination").
//
// ⚠ AND IT COULD NOT BE GUESSED. Applying 13a's Art. 242.2 parameters to every
// Barcelona parcel would produce a confident, specific, WRONG *profunditat
// edificable* — precisely the failure mode C58 exists to prevent. Verified below:
// the founder's own test parcel in Poblenou is **13b**, NOT 13a.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE — probed live 2026-07-20, real response bodies, not documentation.
// ─────────────────────────────────────────────────────────────────────────────
// MUC = *Mapa Urbanístic de Catalunya* (Generalitat de Catalunya), served as a
// keyless public WMS. `GetCapabilities` lists `MUCVW_MUCS_QUAL` — the synthesised
// *qualificació* (zoning) layer — which answers `GetFeatureInfo` as GeoJSON.
//
// MEASURED, at real Catastro parcel centroids in manzana 02297 (Eixample):
//     0229701DF3802G → clau 13a      0229703DF3802G → clau 13a
//     0229702DF3802G → clau 13a      0229704DF3802G → clau 13a
// and at the founder's Poblenou parcel (41.404569, 2.208071) → clau **13b**.
//
// Each feature carries:
//     CODI_QUAL_AJUNT  the MUNICIPAL clau — '13a' / '13b' / '5b' / 'SX2'.
//                      THIS is what the PGM rule packs key on.
//     CODI_QUAL_MUC    the harmonised cross-Catalonia code ('R2', 'SX2'), which
//                      is COARSER: both 13a and 13b reduce to 'R2'. It is kept as
//                      corroborating evidence but MUST NOT drive a rule pack —
//                      13a and 13b are different rules with the same MUC code.
//     DESC_QUAL_AJUNT / DESC_QUAL_MUC   human labels (for the provenance card).
//     CODI_INE         municipality code ('08019' = Barcelona).
//
// ⚠ A POINT QUERY RETURNS SEVERAL FEATURES. WMS `GetFeatureInfo` returns whatever
// falls near the queried PIXEL, so a parcel next to a street reliably comes back
// with BOTH the residential zone and the road system. Measured at one Eixample
// point: 3 features (`5b`, `13a`, `SX2`). Taking the first would sometimes report
// a building plot as "road system" — a wrong answer that looks entirely valid.
// So we resolve by POINT-IN-POLYGON against each returned geometry and require
// exactly one container. See `selectContainingQualification`.

import express from 'express';

export const MUC_ZONING_PATH = '/api/muc/zoning';

/** The keyless Generalitat WMS. Same host serves GetCapabilities + GetFeatureInfo. */
export const MUC_WMS_ENDPOINT = 'https://sig.gencat.cat/ows/MUC/wms';

/** The synthesised qualification layer (verified present in GetCapabilities). */
export const MUC_QUAL_LAYER = 'MUCVW_MUCS_QUAL';

/**
 * Half-extent (degrees) of the tiny bbox built around the query point.
 *
 * WMS GetFeatureInfo needs a bbox + raster size + a pixel (i,j); there is no
 * "query at this coordinate" form. We therefore synthesise a ~10 m box and query
 * its centre pixel. Small enough that the returned candidate set stays tiny,
 * large enough that the service does not degenerate. The ACCURACY of the answer
 * does not depend on this value — point-in-polygon below decides the winner.
 */
export const MUC_QUERY_HALF_DEG = 0.00005;

/** How many candidate features to ask for. Measured worst case near a corner was
 *  3; 10 leaves generous headroom without inviting a large response. */
export const MUC_FEATURE_COUNT = 10;

export const MUC_UPSTREAM_TIMEOUT_MS = 15_000;

/** Planning geometry changes on the order of years; a long TTL is honest here and
 *  keeps us polite to a free public service (C57 §7.2). */
export const MUC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MUC_CACHE_MAX_ENTRIES = 512;

/** Barcelona municipality INE code — used only to LABEL the answer, never to gate it. */
export const INE_BARCELONA = '08019';

// ── cache ────────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0, _misses = 0;

export function __resetMucCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function mucCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

/** Round to ~1 m so neighbouring clicks on the same parcel share a cache entry. */
function cacheKey(lat, lon) { return `${lat.toFixed(5)},${lon.toFixed(5)}`; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return null; }
    return e.value;
}

function cacheSet(key, value, ttlMs = MUC_CACHE_TTL_MS) {
    if (_cache.size >= MUC_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── geometry ─────────────────────────────────────────────────────────────────

/**
 * Standard even-odd ray cast. Pure; no dependency on the app's geometry packages
 * because this file is server-side (L-neutral) and must stay dependency-free.
 *
 * Boundary behaviour is deliberately NOT special-cased: a point exactly on a
 * qualification boundary is genuinely ambiguous (it is on the line between two
 * zones), and `selectContainingQualification` refuses ambiguity rather than
 * picking a side. Cf. L-462, where a half-open convention silently discarded
 * valid geometry — here ambiguity must surface, not be resolved by convention.
 */
export function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, n = ring.length; i < n; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % n];
        if ((y1 > lat) !== (y2 > lat)) {
            const denom = (y2 - y1) || Number.EPSILON;
            const xInt = ((x2 - x1) * (lat - y1)) / denom + x1;
            if (lon < xInt) inside = !inside;
        }
    }
    return inside;
}

/** True when the point falls inside a GeoJSON Polygon / MultiPolygon (outer rings;
 *  holes are not modelled in this layer's data and are not relied upon). */
export function geometryContainsPoint(geometry, lon, lat) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return false;
    const co = geometry.coordinates;
    if (geometry.type === 'Polygon') {
        return Array.isArray(co[0]) && pointInRing(lon, lat, co[0]);
    }
    if (geometry.type === 'MultiPolygon') {
        return co.some((poly) => Array.isArray(poly?.[0]) && pointInRing(lon, lat, poly[0]));
    }
    return false;
}

/**
 * §MUC-ONE-CONTAINER-OR-REFUSE (L-480) — pick the ONE qualification polygon that
 * actually contains the point, or refuse.
 *
 * A WMS pixel query returns neighbours, so this is where a wrong-but-plausible
 * answer would otherwise enter: taking `features[0]` reports a building plot as
 * "road system" whenever the click lands near a kerb. Measured: an Eixample point
 * returned `5b`, `13a`, `SX2` in that order, and only ONE contained the point.
 *
 * REFUSES (returns null) when zero features contain the point, and when more than
 * one does. Both are genuinely ambiguous — overlapping planning polygons or a
 * point on a zone boundary — and a buildable envelope derived from a coin-flip
 * between two claus is exactly what C58 forbids. An absent envelope costs
 * nothing; a wrong *profunditat edificable* costs credibility.
 */
export function selectContainingQualification(featureCollection, lon, lat) {
    const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
    const containing = features.filter((f) => geometryContainsPoint(f?.geometry, lon, lat));
    if (containing.length !== 1) return null;

    const p = containing[0]?.properties ?? {};
    const clau = typeof p.CODI_QUAL_AJUNT === 'string' ? p.CODI_QUAL_AJUNT.trim() : '';
    if (clau === '') return null; // a feature with no municipal code tells us nothing

    return {
        /** The MUNICIPAL clau — what a PGM rule pack keys on ('13a', '13b', …). */
        clau,
        /** Human label for the municipal code. */
        clauLabel: typeof p.DESC_QUAL_AJUNT === 'string' ? p.DESC_QUAL_AJUNT : null,
        /** The harmonised MUC code. Corroborating evidence ONLY — it is coarser than
         *  `clau` (13a and 13b are both 'R2'), so it must never select a rule pack. */
        mucCode: typeof p.CODI_QUAL_MUC === 'string' ? p.CODI_QUAL_MUC : null,
        mucLabel: typeof p.DESC_QUAL_MUC === 'string' ? p.DESC_QUAL_MUC : null,
        ineCode: typeof p.CODI_INE === 'string' ? p.CODI_INE : null,
        /** Provenance, so the UI can cite where this came from (C58 §1.11). */
        source: 'muc-gencat',
        sourceLayer: MUC_QUAL_LAYER,
    };
}

// ── upstream ─────────────────────────────────────────────────────────────────

/** Build the GetFeatureInfo URL for a WGS84 point (CRS:84 = lon,lat order). */
export function buildGetFeatureInfoUrl(lat, lon, halfDeg = MUC_QUERY_HALF_DEG) {
    // Round to 7 decimals (~1 cm). Binary float noise otherwise puts strings like
    // `2.1990000000000003` on the wire — harmless to the service but it makes the URL
    // unstable, so identical queries would look different in logs and in any cache keyed
    // on the URL. 7 decimals is far finer than any planning boundary.
    const r = (n) => Number(n.toFixed(7));
    const minLon = r(lon - halfDeg), maxLon = r(lon + halfDeg);
    const minLat = r(lat - halfDeg), maxLat = r(lat + halfDeg);
    const qs = new URLSearchParams({
        service: 'WMS',
        version: '1.3.0',
        request: 'GetFeatureInfo',
        layers: MUC_QUAL_LAYER,
        query_layers: MUC_QUAL_LAYER,
        crs: 'CRS:84',
        bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
        width: '3',
        height: '3',
        i: '1',
        j: '1',
        info_format: 'application/json',
        feature_count: String(MUC_FEATURE_COUNT),
    });
    return `${MUC_WMS_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch + resolve the clau at a point. NEVER throws: any failure resolves to
 * `null`, which the handler renders as an explicit "unresolved" — distinct from
 * a successful "no zone here" (§CONTEXT-DATA-HONESTY: a failure and an absence
 * must never be the same value).
 */
export async function fetchQualificationAtPoint(lat, lon, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || MUC_UPSTREAM_TIMEOUT_MS;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(buildGetFeatureInfoUrl(lat, lon), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-MUC-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[muc-proxy] GetFeatureInfo HTTP ${res.status} — unresolved.`);
            return null;
        }
        const text = await res.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            // The service answers XML ServiceExceptionReport on a bad request. That is a
            // FAILURE, not an empty area — do not let it become "no zoning here".
            console.warn('[muc-proxy] GetFeatureInfo returned non-JSON (service exception?) — unresolved.');
            return null;
        }
        return selectContainingQualification(json, lon, lat);
    } catch (err) {
        console.warn('[muc-proxy] GetFeatureInfo failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/muc/zoning?lat=&lon=`
 *
 * 200 `{ zoning: {...} }`  — a clau was resolved unambiguously.
 * 200 `{ zoning: null, reason }` — resolved to NOTHING. `reason` distinguishes
 *      `unresolved` (upstream failed / ambiguous) from a genuine miss, so the
 *      client can degrade honestly instead of inferring "no rules apply".
 * 400 — missing/invalid coordinates.
 */
export function makeMucZoningHandler(deps = {}) {
    return async function mucZoningHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters are required.' });
        }

        const key = cacheKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== null) {
            _hits++;
            res.setHeader('X-Muc-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        const zoning = await fetchQualificationAtPoint(lat, lon, deps);
        if (!zoning) {
            // A failure must never be cached, and must never look like an answer.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Muc-Cache', 'MISS-UNRESOLVED');
            return res.status(200).json({
                zoning: null,
                reason: 'unresolved',
                detail:
                    'No single MUC qualification polygon contains this point, or the upstream ' +
                    'service did not answer. This is NOT a statement that the parcel is unzoned.',
            });
        }

        const payload = { zoning };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Muc-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const mucZoningHandler = makeMucZoningHandler();

export const mucRouter = express.Router();
mucRouter.get(MUC_ZONING_PATH, mucZoningHandler);
