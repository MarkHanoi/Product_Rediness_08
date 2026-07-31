/**
 * @file server/parcelZoningProxy.js
 * @description §PARCEL-PROXY (L-380 P0) — same-origin server proxy + shared cache
 *   for the keyless Spanish CATASTRO cadastral services, so PRYZM's 2D GIS map can
 *   turn a map click into a REAL cadastral parcel polygon.
 *
 * WHY THIS EXISTS (mirrors server/overpassProxy.js verbatim in shape)
 * ------------------------------------------------------------------
 * The founder wants "select a real parcel" on the existing SiteBoundaryMap2D: the
 * user clicks a point and PRYZM fetches the actual cadastral geometry from Spain's
 * Dirección General del Catastro. Two upstream calls are needed:
 *
 *   1. POINT → REFERENCIA CATASTRAL — the OVC reverse-geocode
 *      `Consulta_RCCOOR_Distancia` (keyless SOAP-ish .asmx returning XML). The
 *      *_Distancia* variant returns the nearest parcels within a radius, so a click
 *      that lands slightly off a centroid still resolves (robust vs. plain
 *      `Consulta_RCCOOR`, which errors "no reference at these coordinates").
 *   2. REFCAT → PARCEL GEOMETRY — the INSPIRE Cadastral-Parcel WFS stored query
 *      `GetParcel` (the WFS has NO BBOX / ad-hoc spatial filter — it is ID-keyed
 *      only, so the point→refcat→parcel order is mandatory). Returns GML 3.2.1.
 *
 * Doing this browser→gov directly is blocked (CORS + the WMS "no massive/tiled
 * downloads" clause + undocumented rate limits). So — EXACTLY like the Overpass
 * proxy — every client hits OUR origin instead:
 *   - Same-origin `/api/catastro/parcel` → CSP `connect-src 'self'` already covers
 *     it (NO securityHeaders.js change; the gov origins never touch the browser).
 *   - The server forwards ONCE, NORMALISES the GML → a plain WGS84 lat/lon ring
 *     (GeoJSON-ish JSON) server-side, and CACHES the parcel by its refcat (parcels
 *     change slowly → 7-day TTL, bounded LRU) so repeat clicks / demo reloads are
 *     instant and gentle on the shared gov endpoints.
 *   - NEVER crashes: any miss/upstream-failure answers HTTP 200 `{ parcel: null }`
 *     so the client's non-fatal path falls back to manual draw.
 *
 * PROVIDER-AGNOSTIC POSTURE (L-380 / mirrors L-374 Context-Engine)
 * ----------------------------------------------------------------
 * This is the Spain (`catastro`) adapter of a provider-agnostic Parcel Data Layer.
 * Denmark (Plandata.dk zoning is open, but the Datafordeler PARCEL WFS needs an
 * API-key/OAuth) and Switzerland (ÖREB/geodienste) slot in as sibling routes/
 * handlers later; the client `ParcelProvider` interface is the seam.
 *
 * @see server/overpassProxy.js — the template this clones (cache/forward-once/fallback)
 * @see apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts — the client consumer
 * @see server/securityHeaders.js — connect-src 'self' already covers /api/catastro/*
 */

import { createHash } from 'crypto';

/** The same-origin route the client's CatastroParcelProvider calls. */
export const CATASTRO_PARCEL_PATH = '/api/catastro/parcel';

/** OVC reverse-geocode (keyless). `_Distancia` returns nearest parcels in radius. */
export const CATASTRO_RCCOOR_ENDPOINT =
    'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR_Distancia';
/** INSPIRE Cadastral-Parcel WFS — stored query `GetParcel` by REFCAT (no BBOX). */
export const CATASTRO_WFS_ENDPOINT = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx';

// ── Shared in-memory cache (keyed by refcat) ─────────────────────────────────
/** Parcels change slowly; a week-stale cadastral boundary is fine and eliminates
 *  repeat gov calls for the same plot across all clients + demo reloads. */
export const PARCEL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Bounded working set — evict the OLDEST insertion past the cap (LRU-ish). */
export const PARCEL_CACHE_MAX_ENTRIES = 512;
/** Per-upstream timeout (ms). The server pays it ONCE per plot (then cached). */
export const CATASTRO_UPSTREAM_TIMEOUT_MS = 15_000;

/** §L-641 — how many nearest OVC candidates to probe for click-containment before falling back to
 *  the nearest. Bounded so a street/gap click costs at most K WFS geometry fetches (each then cached
 *  by refcat). The common case — a click INSIDE the nearest parcel — resolves on the FIRST fetch and
 *  never probes further. K=4 comfortably covers boundary/corner ambiguity between abutting plots. */
export const PARCEL_CANDIDATE_MAX_K = 4;

/** @typedef {{ ring: {lat:number,lon:number}[], refcat: string, areaM2: number, address: string|null }} ParcelResult */
/** @typedef {{ value: ParcelResult, expires: number }} CacheEntry */
/** @type {Map<string, CacheEntry>} refcat → normalised parcel. */
const _cache = new Map();
let _hits = 0;
let _misses = 0;

/** Read a fresh (non-expired) cached parcel, or null. Prunes an expired hit. */
function cacheGet(refcat, now = Date.now()) {
    const entry = _cache.get(refcat);
    if (!entry) return null;
    if (entry.expires <= now) { _cache.delete(refcat); return null; }
    _cache.delete(refcat);
    _cache.set(refcat, entry); // touch → newest (LRU-ish recency)
    return entry.value;
}

/** Store a normalised parcel, evicting the oldest entries past the cap. */
function cacheSet(refcat, value, now = Date.now()) {
    _cache.set(refcat, { value, expires: now + PARCEL_CACHE_TTL_MS });
    while (_cache.size > PARCEL_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}

/** Test/diagnostic helper — clear the shared cache + hit/miss counters. */
export function __resetParcelCache() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
}

/** Diagnostic snapshot of the cache (size + hit/miss counters). */
export function parcelCacheStats() {
    return { size: _cache.size, hits: _hits, misses: _misses };
}

// ── XML/GML normalisation (server-side; no DOM) ──────────────────────────────

/**
 * Parse an OVC `Consulta_RCCOOR_Distancia` XML response into the ranked list of nearby parcel
 * candidates (nearest-first) plus the nearest's referencia catastral + address. Robust to the
 * `_Distancia` list shape:
 *   consulta_coordenadas_distancias > coordenadas_distancias > coordd > lpcd
 *     > pcd { pc { pc1, pc2 }, ldt, dis }
 * REFCAT = pc1 + pc2 (14 chars). On the error shape (`<lerr><err><cod>16</cod>` — "no reference at
 * these coordinates") or any malformed body → null. Never throws.
 *
 * §L-641 — the returned `candidates` array (ascending `dis`) is the instrument for the wrong-parcel
 * fix. OVC `_Distancia` ranks candidates by distance to each parcel's ADDRESS/reference point, NOT
 * by polygon containment (a live fixture at a deliberate select shows the nearest at `dis=7.03`,
 * never 0), so the nearest-by-`dis` candidate is the ADJACENT parcel when the click lands near a
 * shared boundary. `fetchParcelAtPoint` therefore prefers the candidate whose ring CONTAINS the
 * click over the merely-nearest one. `refcat`/`pointToParcelM`/`candidateMarginM` stay the nearest's
 * values (backward-compat with the L-640 confidence signal).
 *
 * @param {string} xml
 * @returns {{ refcat: string, address: string|null, pointToParcelM: number|null, candidateMarginM: number|null, candidates: {refcat:string,address:string|null,distance:number}[] } | null}
 */
export function parseReverseGeocode(xml) {
    if (typeof xml !== 'string' || xml.length === 0) return null;
    // Each candidate parcel is a <pcd>…</pcd> block.
    const blocks = xml.match(/<pcd\b[\s\S]*?<\/pcd>/gi);
    if (!blocks || blocks.length === 0) return null;

    const candidates = [];
    for (const block of blocks) {
        const pc1 = (block.match(/<pc1\b[^>]*>\s*([^<]*?)\s*<\/pc1>/i) || [])[1];
        const pc2 = (block.match(/<pc2\b[^>]*>\s*([^<]*?)\s*<\/pc2>/i) || [])[1];
        if (!pc1 || !pc2) continue;
        const refcat = `${pc1.trim()}${pc2.trim()}`;
        if (refcat.length === 0) continue;
        const ldtRaw = (block.match(/<ldt\b[^>]*>\s*([^<]*?)\s*<\/ldt>/i) || [])[1];
        const address = ldtRaw && ldtRaw.trim().length > 0 ? ldtRaw.trim() : null;
        const disRaw = (block.match(/<dis\b[^>]*>\s*([^<]*?)\s*<\/dis>/i) || [])[1];
        const dis = disRaw != null ? Number.parseFloat(disRaw) : Number.POSITIVE_INFINITY;
        const distance = Number.isFinite(dis) ? dis : Number.POSITIVE_INFINITY;
        candidates.push({ refcat, address, distance });
    }
    if (candidates.length === 0) return null;
    // Ascending by OVC `dis` (distance to each parcel's reference point). Nearest first.
    candidates.sort((a, b) => a.distance - b.distance);
    const best = candidates[0];
    const second = candidates[1] || null;
    // §L-640 — the nearest `dis` + nearest-vs-2nd margin are the raw cadastral-match facts the L-640
    // confidence derives from (a free signal OVC already returns; we no longer discard it).
    const pointToParcelM = Number.isFinite(best.distance) ? best.distance : null;
    const candidateMarginM = (second && Number.isFinite(second.distance) && Number.isFinite(best.distance))
        ? (second.distance - best.distance) : null;
    return { refcat: best.refcat, address: best.address, pointToParcelM, candidateMarginM, candidates };
}

/**
 * Parse an INSPIRE `GetParcel` GML 3.2.1 response into a WGS84 lat/lon ring + area.
 *
 * The geometry path is
 *   cp:geometry > gml:MultiSurface > … > gml:exterior > gml:LinearRing > gml:posList
 * and the FIRST `posList` in the document is the EXTERIOR ring (interior holes, if
 * any, follow it — a boundary only needs the exterior). srsName is EPSG:4326 whose
 * OGC axis order is **lat lon**, so posList values pair as (lat, lon). Prefixes are
 * matched loosely (`<…:posList>`) so a differing namespace prefix still parses.
 *
 * Returns null when no ring is found or fewer than 3 distinct vertices survive.
 * Never throws.
 *
 * @param {string} gml
 * @returns {{ ring: {lat:number,lon:number}[], areaOfficialM2: number|null, areaSigM2: number } | null}
 */
export function parseParcelGml(gml) {
    if (typeof gml !== 'string' || gml.length === 0) return null;
    // First exterior ring's coordinate list (prefix-agnostic).
    const posMatch = gml.match(/<(?:[\w.-]+:)?posList\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?posList>/i);
    if (!posMatch || !posMatch[1]) return null;
    const nums = posMatch[1].trim().split(/\s+/).map((s) => Number.parseFloat(s)).filter((n) => Number.isFinite(n));
    if (nums.length < 6) return null; // need ≥3 (lat,lon) pairs
    const ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        // EPSG:4326 OGC axis order = lat, lon.
        ring.push({ lat: nums[i], lon: nums[i + 1] });
    }
    if (ring.length < 3) return null;

    // §L-640 / C57 KV-3 — return the OFFICIAL registry area (INSPIRE `areaValue`) and the DERIVED
    // (shoelace) area SEPARATELY, never collapsed. C57 §2.1 intends the published-vs-derived
    // distinction; collapsing them presented a derived number as if official. `areaOfficialM2` is
    // null when the source does not publish it (an honest Unknown, not a fabricated value).
    let areaOfficialM2 = null;
    const areaMatch = gml.match(/<(?:[\w.-]+:)?areaValue\b[^>]*>\s*([\d.]+)\s*<\/(?:[\w.-]+:)?areaValue>/i);
    if (areaMatch && areaMatch[1]) {
        const v = Number.parseFloat(areaMatch[1]);
        if (Number.isFinite(v) && v > 0) areaOfficialM2 = v;
    }
    const areaSigM2 = ringAreaM2(ring);
    return { ring, areaOfficialM2, areaSigM2 };
}

/** Approx planar area (m²) of a small WGS84 lat/lon ring via local equirectangular. */
function ringAreaM2(ring) {
    if (ring.length < 3) return 0;
    const R = 6_378_137;
    const d2r = Math.PI / 180;
    const lat0 = ring[0].lat * d2r;
    const cos0 = Math.cos(lat0);
    const xz = ring.map((p) => ({
        x: p.lon * d2r * R * cos0,
        z: p.lat * d2r * R,
    }));
    let a = 0;
    for (let i = 0; i < xz.length; i++) {
        const p = xz[i];
        const q = xz[(i + 1) % xz.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

/**
 * §L-641 — ray-casting point-in-ring test on a WGS84 lat/lon ring (planar-good at parcel scale).
 * Mirrors the client `pointInRing` in `apps/editor/src/ui/site/parcel/parcelConfidence.ts` EXACTLY
 * so the server's containment decision and the client's confidence signal can never disagree.
 * Never throws; a degenerate ring (<3 vertices) is not "inside" anything.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{lat:number,lon:number}[]} ring
 * @returns {boolean}
 */
export function pointInRing(lat, lon, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if (!a || !b) continue;
        const intersect = (a.lat > lat) !== (b.lat > lat) &&
            lon < ((b.lon - a.lon) * (lat - a.lat)) / ((b.lat - a.lat) || 1e-12) + a.lon;
        if (intersect) inside = !inside;
    }
    return inside;
}

// ── Upstream fetch (server-side, one retry, never-throw) ─────────────────────

/**
 * Fetch a URL once with a timeout + one retry; resolve to the response TEXT on a
 * 2xx non-empty body, else null. NEVER throws. `deps.fetchImpl` is injectable so
 * the route is unit-testable without the network.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<string|null>}
 */
export async function fetchTextOnce(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || CATASTRO_UPSTREAM_TIMEOUT_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/xml, text/xml, application/gml+xml, */*',
                    'User-Agent': 'PRYZM-Catastro-Proxy/1.0 (+https://pryzm.fly.dev)',
                },
                signal: ctrl.signal,
            });
            if (res.status === 429 || res.status === 503 || res.status === 504) {
                console.warn(`[catastro-proxy] ${res.status} (attempt ${attempt + 1}) — ${attempt === 0 ? 'retrying' : 'giving up'}.`);
                continue;
            }
            if (!res.ok) {
                console.warn(`[catastro-proxy] HTTP ${res.status} for ${url}`);
                return null;
            }
            const text = await res.text();
            if (text && text.length > 0) return text;
            return null;
        } catch (err) {
            console.warn(`[catastro-proxy] fetch failed (attempt ${attempt + 1}): ${err?.message ?? err}`);
            continue;
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
}

/**
 * Resolve ONE candidate refcat to its parsed geometry, cache-first.
 *
 * §L-641 — the cache now holds GEOMETRY ONLY (`{ ring, areaOfficialM2, areaSigM2 }`) keyed by
 * refcat, NOT the per-click ParcelResult. The request-specific signals (pointToParcelM, address,
 * click-containment) are always recomputed fresh, so a later click on the same plot can never
 * inherit an earlier click's distance — and probing several candidates for containment costs at
 * most one WFS fetch per distinct refcat, then free on repeat.
 *
 * @returns {Promise<{ ring: {lat:number,lon:number}[], areaOfficialM2: number|null, areaSigM2: number } | null>}
 */
async function resolveParcelGeometry(refcat, deps) {
    const cached = cacheGet(refcat);
    if (cached) { _hits++; return cached; }
    _misses++;
    const wfsUrl =
        `${CATASTRO_WFS_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
        `&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
    const gml = await fetchTextOnce(wfsUrl, deps);
    if (!gml) return null;
    const parsed = parseParcelGml(gml);
    if (!parsed) return null;
    const geom = { ring: parsed.ring, areaOfficialM2: parsed.areaOfficialM2, areaSigM2: parsed.areaSigM2 };
    cacheSet(refcat, geom);
    return geom;
}

/**
 * Assemble the normalised ParcelResult for a chosen candidate + its geometry.
 *
 * §L-641 — when the click is VERIFIED inside the returned ring, `pointToParcelM` is 0: the polygon
 * test is the authoritative click→parcel distance and beats OVC's reference-point `dis`. When NO
 * candidate contained the click we return the nearest with its raw OVC distance, so the signal stays
 * honestly nonzero and the client confidence (L-640) surfaces it as not-inside rather than snapping.
 *
 * @returns {ParcelResult}
 */
function buildParcelResult(cand, geom, rc, clickInside) {
    return {
        ring: geom.ring,
        refcat: cand.refcat,
        // §L-640 — `areaM2` kept for backward-compat (official ?? derived); the SPLIT areas + the
        // click→parcel distance/margin are the raw signals the client's confidence derives from.
        areaM2: geom.areaOfficialM2 != null ? geom.areaOfficialM2 : geom.areaSigM2,
        areaOfficialM2: geom.areaOfficialM2,
        areaSigM2: geom.areaSigM2,
        pointToParcelM: clickInside
            ? 0
            : (Number.isFinite(cand.distance) ? cand.distance : (rc.pointToParcelM ?? null)),
        candidateMarginM: rc.candidateMarginM ?? null,
        // §L-641 — an explicit, authoritative containment fact (independent of the reference-point
        // `dis`), carried for transparency/logging. The client already routes on `pointToParcelM`.
        clickInside,
        address: cand.address,
    };
}

/**
 * The full point→parcel resolution, server-side + cached:
 *   1. reverse-geocode (lon,lat) → ranked candidates (OVC _Distancia)
 *   2. §L-641 — resolve candidates NEAREST-FIRST and return the FIRST whose ring CONTAINS the click
 *   3. if NONE contains it → return the nearest resolvable (honest nonzero pointToParcelM)
 *
 * §L-641 — OVC `_Distancia` ranks by distance to each parcel's ADDRESS/reference point, not by
 * polygon containment, so the merely-nearest candidate is the ADJACENT parcel when the click sits
 * near a shared boundary → a ring offset "to the side" (the reported intermittent, jurisdiction-
 * independent bug). Preferring the CONTAINING parcel fixes it. §CONTEXT-DATA-HONESTY: a genuine
 * street/gap click has NO containing parcel and must NOT be snapped — it falls back to the nearest
 * carrying its true nonzero distance so the confidence label stays honest.
 *
 * Resolves to the normalised ParcelResult, or null (no parcel at the point / any upstream failure).
 * NEVER throws. `deps` is injectable for tests.
 *
 * @param {number} lon  EPSG:4326 longitude
 * @param {number} lat  EPSG:4326 latitude
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<ParcelResult|null>}
 */
export async function fetchParcelAtPoint(lon, lat, deps = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    // 1. point → ranked candidates (Coordenada_X = lon, Coordenada_Y = lat for EPSG:4326).
    const rcUrl =
        `${CATASTRO_RCCOOR_ENDPOINT}?SRS=EPSG:4326` +
        `&Coordenada_X=${encodeURIComponent(String(lon))}` +
        `&Coordenada_Y=${encodeURIComponent(String(lat))}`;
    const rcXml = await fetchTextOnce(rcUrl, deps);
    if (!rcXml) return null;
    const rc = parseReverseGeocode(rcXml);
    if (!rc || !Array.isArray(rc.candidates) || rc.candidates.length === 0) return null;

    // 2. §L-641 — prefer the candidate whose ring CONTAINS the click over the nearest-by-`dis`.
    const candidates = rc.candidates.slice(0, PARCEL_CANDIDATE_MAX_K);
    let fallback = null; // nearest candidate whose geometry we could actually resolve
    for (const cand of candidates) {
        const geom = await resolveParcelGeometry(cand.refcat, deps);
        if (!geom) continue;
        if (!fallback) fallback = { cand, geom };
        if (pointInRing(lat, lon, geom.ring)) {
            if (fallback.cand.refcat !== cand.refcat) {
                console.log(
                    `[catastro-proxy] §L-641 — click contained by ${cand.refcat} (dis ${cand.distance.toFixed(2)} m), ` +
                    `NOT the nearest ${fallback.cand.refcat} (dis ${fallback.cand.distance.toFixed(2)} m); ` +
                    'returning the CONTAINING parcel.',
                );
            }
            return buildParcelResult(cand, geom, rc, /* clickInside */ true);
        }
    }

    // 3. No candidate contained the click — a genuine street/gap click, or a boundary click OVC
    // could not disambiguate. Return the nearest resolvable, honestly flagged as not-inside.
    if (!fallback) return null;
    console.log(
        `[catastro-proxy] §L-641 — no candidate ring contains the click (${candidates.length} probed); ` +
        `falling back to nearest ${fallback.cand.refcat} at dis ${fallback.cand.distance.toFixed(2)} m (not-inside).`,
    );
    return buildParcelResult(fallback.cand, fallback.geom, rc, /* clickInside */ false);
}

/** Set permissive same-origin cache headers on a parcel proxy response. */
function setProxyCacheHeaders(res) {
    // A week — parcels change slowly; the shared server cache is the primary layer.
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Express handler for GET /api/catastro/parcel?lon=<>&lat=<>.
 *
 * Serves a cached-by-refcat parcel instantly; otherwise resolves point→refcat→parcel
 * once, normalises GML → a WGS84 ring, caches, and returns
 *   `{ parcel: { ring, refcat, areaM2, address, source: 'catastro' } }`.
 *
 * NEVER crashes: bad/absent coords → 400; no parcel / upstream failure → 200
 * `{ parcel: null }` (the client then falls back to manual draw).
 *
 * `deps` is injectable for tests (fetchImpl / timeoutMs).
 */
export function makeCatastroParcelHandler(deps = {}) {
    return async function catastroParcelHandler(req, res) {
        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
            return res.status(400).json({ error: 'lon and lat query params (EPSG:4326) are required.' });
        }
        // Guard the Spanish national bbox loosely so a click on another continent
        // short-circuits without a pointless gov round-trip (−18.5…5.3 lon / 26.2…44.8 lat).
        if (lon < -20 || lon > 6 || lat < 26 || lat > 45) {
            setProxyCacheHeaders(res);
            res.setHeader('X-Catastro-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ parcel: null });
        }

        let parcel = null;
        try {
            parcel = await fetchParcelAtPoint(lon, lat, deps);
        } catch (err) {
            console.warn('[catastro-proxy] unexpected error:', err?.message ?? err);
            parcel = null;
        }

        setProxyCacheHeaders(res);
        if (!parcel) {
            res.setHeader('X-Catastro-Cache', 'MISS-EMPTY');
            return res.status(200).json({ parcel: null });
        }
        res.setHeader('X-Catastro-Cache', 'HIT-OR-FETCH');
        return res.status(200).json({ parcel: { ...parcel, source: 'catastro' } });
    };
}

/** The default production handler (real `fetch`, real endpoints). */
export const catastroParcelHandler = makeCatastroParcelHandler();

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// §CATASTRO-BLOCK (ADR-0271 P4b) — the *manzana* (block) parcels.
//
// ⚠ THIS REPLACES A ROUTE I SHIPPED BROKEN ONE DEPLOY EARLIER (v225). That version called the
// `GetZoning` stored query with `REFCAT`. Probed live immediately afterwards, it answers:
//     ExceptionText: The parameter COD_ZONA can't be null
// `GetZoning` is keyed by COD_ZONA, not by a cadastral reference, so the route could never have
// returned a block. It shipped because I wrote it from documentation instead of from a response —
// the exact failure this file's own comments warn about, committed by me while warning about it.
//
// WHAT ACTUALLY WORKS, VERIFIED LIVE (2026-07-20, real responses, not docs):
//   1. `GetFeature&typeNames=cp:CadastralParcel&bbox=<lat,lon,lat,lon,urn:ogc:def:crs:EPSG::4326>`
//      RETURNS FEATURES — 21 parcels for a Passeig de Gràcia bbox. This directly contradicts the
//      repo's own scoping note ("the WFS has no BBOX, it is ID-keyed only"), which was wrong.
//   2. **The refcat encodes the manzana in its first 5 characters.** Established empirically, not
//      recalled: that same bbox split cleanly into `02297` (13 parcels) and `03286` (8) — two
//      real adjacent Eixample blocks.
//
// So the block is: bbox around the subject parcel → keep the parcels whose refcat shares its
// 5-char manzana prefix → hand the rings to `dissolveParcelsToBlockRing` (already built + tested).
//
// The manzana prefix is a HEURISTIC ON AN OBSERVED PATTERN, not a documented guarantee. It is
// therefore reported (`manzana`, `siblingCount`) so a caller can judge it, and a result that
// yields fewer than 3 parcels resolves to `null` — a "block" of one or two parcels is far more
// likely to be a broken prefix assumption than a real Barcelona manzana, and a too-small block
// ring produces a too-small interior courtyard and therefore a WRONG *profunditat edificable*.
// Refusing is correct here; guessing is not (C57 §1.5).

/** Same-origin route for the block's parcels. Keys/CSP stay server-side (C57 §1.2). */
export const CATASTRO_BLOCK_PATH = '/api/catastro/block';

/** How far around the subject parcel to search, in degrees (~±220 m at Barcelona latitude).
 *  Comfortably larger than a 113 m Cerdà manzana, and well inside Catastro's documented
 *  1 km² / 5000-feature BBOX ceiling for `cp:CadastralParcel`. */
export const BLOCK_BBOX_HALF_DEG = 0.002;

/**
 * §STREET-WIDTH-NEIGHBOURS (L-537) — how far beyond the subject block a parcel may lie and still
 * be returned as a candidate OPPOSING FRONTAGE, in metres.
 *
 * WHY THE ROUTE RETURNS THEM AT ALL. PGM Art. 327.2 keys the *alçada reguladora* on the street
 * width, and the width is the frontage-to-frontage distance from our block to the block across the
 * street. That opposing geometry is ALREADY in the bbox response we just parsed — the route was
 * throwing it away in the `manzanaPrefix` filter below. Returning it costs ZERO additional upstream
 * calls, which is the entire reason the measurement is affordable per-manzana.
 *
 * WHY IT IS FILTERED RATHER THAN RETURNED WHOLE. The bbox is ~±220 m and routinely carries 200–500
 * parcels; shipping all of them would multiply this route's payload ~20× to serve rays that never
 * travel more than one street. 100 m is comfortably beyond the widest Barcelona artery (Passeig de
 * Gràcia ~60 m) and beyond the measurement's own 80 m search limit, so the filter can never remove
 * a parcel the measurement would have hit — it only removes ones it provably would not.
 */
export const NEIGHBOUR_HALO_M = 100;

/** Metres per degree of latitude (WGS84 mean). Only used to size the halo above, where a few
 *  percent of error is irrelevant because the halo is already generous by design. */
const M_PER_DEG_LAT = 111320;

/** Axis-aligned lat/lon bounds of a ring, or null if it is unusable. */
function ringBounds(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of ring) {
        if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) return null;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
    }
    return { minLat, maxLat, minLon, maxLon };
}

/**
 * §STREET-WIDTH-NEIGHBOURS — the parcels NOT in this manzana that lie within the halo of it.
 *
 * A bbox-overlap test, not a true distance: it can only ever admit a parcel the exact test would
 * have excluded, never exclude one it would have kept. That direction is the safe one — a spare
 * parcel costs a few bytes, a missing one costs an unmeasurable frontage and therefore an absent
 * building height.
 */
function neighbourParcels(blockParcels, allParcels, manzana) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of blockParcels) {
        const b = ringBounds(p.ring);
        if (!b) continue;
        if (b.minLat < minLat) minLat = b.minLat;
        if (b.maxLat > maxLat) maxLat = b.maxLat;
        if (b.minLon < minLon) minLon = b.minLon;
        if (b.maxLon > maxLon) maxLon = b.maxLon;
    }
    if (!Number.isFinite(minLat)) return [];
    const dLat = NEIGHBOUR_HALO_M / M_PER_DEG_LAT;
    const cosLat = Math.max(0.1, Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)));
    const dLon = dLat / cosLat;
    const lo = { lat: minLat - dLat, lon: minLon - dLon };
    const hi = { lat: maxLat + dLat, lon: maxLon + dLon };

    const out = [];
    for (const p of allParcels) {
        if (manzanaPrefix(p.refcat) === manzana) continue;
        const b = ringBounds(p.ring);
        if (!b) continue;
        if (b.maxLat < lo.lat || b.minLat > hi.lat || b.maxLon < lo.lon || b.minLon > hi.lon) continue;
        out.push({ refcat: p.refcat, ring: p.ring });
    }
    return out;
}

/**
 * §BLOCK-SINGLETON-MANZANA (L-586) — how far a parcel of a DIFFERENT manzana must stay clear of
 * this one before we will believe this manzana really is a whole, free-standing city block, in
 * metres.
 *
 * ⚠ THIS IS A DISCRIMINATOR BETWEEN TWO POPULATIONS THAT ARE ORDERS OF MAGNITUDE APART, NOT A
 * TUNED THRESHOLD. Two parcels that ABUT share their boundary, so the measured distance is the
 * coordinate quantum — Catastro publishes to 1e-6°, i.e. 0.083 m east / 0.111 m north. Two parcels
 * in DIFFERENT blocks are separated by a street: measured on the seven single-parcel manzanas in
 * the live Barcelona sweep, the nearest other parcel sat at 4.99, 14.56, 15.20, 18.17, 19.27,
 * 19.83 and 20.53 m (`scratchpad/probe-l586-hairloops.mts`). There is nothing between 0.111 m and
 * 4.99 m to be sensitive to. 0.5 m is four times the publisher's own quantum and ten times below
 * the narrowest observed street, so no plausible value in that gap changes any outcome.
 */
export const FREE_STANDING_CLEARANCE_M = 0.5;

/** Perpendicular distance from p to segment ab, in the local metric plane. */
function pointSegmentDistanceM(p, a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/**
 * §BLOCK-SINGLETON-MANZANA (L-586) — is this manzana a FREE-STANDING block?
 *
 * WHY THIS EXISTS. The route refused any manzana with fewer than 3 parcels, on the stated
 * suspicion that "a 1–2 parcel block is far likelier to be a broken prefix assumption than a real
 * manzana". That suspicion was never measured, and it is wrong often enough to matter: in the live
 * 100-manzana Barcelona sweep behind the 83.0% layer-1–3 resolution rate, SEVEN parcels were
 * refused by it — and all seven are genuinely whole blocks. Four of them are ~12,000 m² full
 * Eixample *illes* (12,686 / 12,622 / 12,183 / 11,250 m²) held as a single cadastral parcel, the
 * ordinary shape of a school, hospital, market or convent. Refusing them produced no depth, no
 * width, no height and a 0.5 m footprint slab for 7 % of the sample.
 *
 * ⚠ SO THE GUARD IS REPLACED BY THE TEST IT WAS GUESSING AT, NOT REMOVED. City blocks are
 * separated by STREETS. A parcel that really is a whole manzana therefore shares no boundary with
 * any other parcel; a parcel whose siblings were lost to a broken prefix — the actual danger — is
 * still touching them, and is still refused. That is an independent oracle on the very question
 * the old guard was estimating, it costs no upstream call (the bbox response is already parsed),
 * and it was validated at 7/7 before being written.
 *
 * ⚠ IT TESTS AGAINST EVERY OTHER PARCEL IN THE BBOX, not merely those of other manzanas, precisely
 * so that a prefix which has mislabelled a sibling cannot slip through: whatever the sibling is
 * called, it is still touching, and touching is disqualifying.
 *
 * Pure and deterministic (C58 §1.1): no clock, no RNG, fixed iteration over the parsed response.
 *
 * @returns {{ freeStanding: boolean, nearestOtherParcelM: number|null, touching: string[] }}
 *   `nearestOtherParcelM` is null only when the bbox held no other parcel at all — which is itself
 *   a fact worth reporting rather than rendering as a distance of Infinity.
 */
export function isFreeStandingBlock(blockParcels, allParcels, clearanceM = FREE_STANDING_CLEARANCE_M) {
    if (!Array.isArray(blockParcels) || blockParcels.length === 0) {
        return { freeStanding: false, nearestOtherParcelM: null, touching: [] };
    }
    const own = new Set(blockParcels.map((p) => p.refcat));
    const first = blockParcels[0]?.ring?.[0];
    if (!first) return { freeStanding: false, nearestOtherParcelM: null, touching: [] };

    // Local equirectangular plane about the block's first vertex. Over a ±220 m bbox its scale
    // error is a few parts per million — six orders below the 0.5 m the answer turns on.
    const cos0 = Math.cos(first.lat * (Math.PI / 180));
    const toXZ = (v) => ({
        x: (v.lon - first.lon) * (Math.PI / 180) * 6378137 * cos0,
        z: -(v.lat - first.lat) * (Math.PI / 180) * 6378137,
    });

    const ownRings = blockParcels.map((p) => p.ring.map(toXZ)).filter((r) => r.length >= 3);
    if (ownRings.length === 0) return { freeStanding: false, nearestOtherParcelM: null, touching: [] };

    let nearest = Infinity;
    const touching = [];
    for (const p of allParcels) {
        if (own.has(p.refcat)) continue;
        if (!Array.isArray(p.ring) || p.ring.length < 3) continue;
        const other = p.ring.map(toXZ);
        let best = Infinity;
        for (const ring of ownRings) {
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i];
                const b = ring[(i + 1) % ring.length];
                // Sample the edge MIDPOINT as well as the vertex: a long own-edge running beside a
                // short foreign one would otherwise be judged only at its ends.
                const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
                for (let j = 0; j < other.length; j++) {
                    const c = other[j];
                    const d = other[(j + 1) % other.length];
                    const dv = pointSegmentDistanceM(a, c, d);
                    if (dv < best) best = dv;
                    const dm = pointSegmentDistanceM(mid, c, d);
                    if (dm < best) best = dm;
                }
            }
        }
        if (best < nearest) nearest = best;
        if (best < clearanceM) touching.push(p.refcat);
    }
    return {
        freeStanding: touching.length === 0,
        nearestOtherParcelM: Number.isFinite(nearest) ? nearest : null,
        touching,
    };
}

/** The 5-char manzana prefix of an urban cadastral reference (verified empirically — see above). */
export function manzanaPrefix(refcat) {
    return typeof refcat === 'string' && refcat.length >= 5 ? refcat.slice(0, 5) : null;
}

/** Build the BBOX GetFeature URL. Exported so a test can assert the shape with no network. */
export function buildParcelBboxUrl(lat, lon, halfDeg = BLOCK_BBOX_HALF_DEG) {
    const bbox = `${lat - halfDeg},${lon - halfDeg},${lat + halfDeg},${lon + halfDeg},urn:ogc:def:crs:EPSG::4326`;
    return `${CATASTRO_WFS_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
        `&typeNames=cp:CadastralParcel&bbox=${encodeURIComponent(bbox)}`;
}

/**
 * Split a multi-feature GML collection into `{ refcat, ring, areaM2 }` entries.
 *
 * Splits on the feature boundary and reuses the single-feature parser per chunk rather than
 * forking a second GML reader — the ring extraction is identical and must not drift.
 */
export function parseParcelCollectionGml(gml) {
    if (typeof gml !== 'string' || gml.length === 0) return [];
    const chunks = gml.split(/<cp:CadastralParcel\b/).slice(1);
    const out = [];
    for (const chunk of chunks) {
        const rcMatch = chunk.match(/<(?:[\w.-]+:)?nationalCadastralReference>([^<]+)</i);
        const refcat = rcMatch && rcMatch[1] ? rcMatch[1].trim() : null;
        const parsed = parseParcelGml(chunk);
        // §L-640 — `parseParcelGml` returns the SPLIT areas (`areaOfficialM2` / `areaSigM2`); it has
        // no `areaM2`. This path was missed when the single-parcel path (see `areaM2:` above) was
        // migrated, so every sibling parcel on the block route carried `areaM2: undefined` — and the
        // block route feeds PGM Art. 242.2 *profunditat edificable*. Mirror the single-parcel
        // semantics EXACTLY (official ?? derived) and propagate the split signals un-collapsed, so a
        // consumer can still tell a published area from one we measured off the ring.
        if (refcat && parsed) {
            out.push({
                refcat,
                ring: parsed.ring,
                areaM2: parsed.areaOfficialM2 != null ? parsed.areaOfficialM2 : parsed.areaSigM2,
                areaOfficialM2: parsed.areaOfficialM2,
                areaSigM2: parsed.areaSigM2,
            });
        }
    }
    return out;
}

/**
 * Handler: `?refcat=…` → `{ block: { manzana, parcels: [{refcat, ring, areaM2}], siblingCount } | null }`.
 *
 * Two upstream calls: `GetParcel` for the subject's own ring (to centre the bbox), then one BBOX
 * `GetFeature`. Never throws; resolves to `null` on any doubt (C57 §1.5) — an absent block costs
 * an absent envelope, which is the only acceptable failure on a compliance path.
 */
/**
 * §BLOCK-CACHE (L-533) — the block route had NO cache at all, so every boundary draw paid two
 * fresh round-trips to a slow Spanish government WFS. A *manzana* is static cadastral data (it
 * changes when parcels are legally subdivided, i.e. essentially never within a session), and the
 * SAME block is re-fetched constantly: every redraw, every re-select, and every other parcel on
 * the same block. Keyed by manzana rather than by refcat for exactly that reason — the second
 * parcel a user tries on a block is then free.
 *
 * Mirrors the parcel cache's TTL/size discipline above; entries are the parsed parcel arrays,
 * never raw GML, so a hit costs no re-parse either.
 */
const BLOCK_CACHE_TTL_MS = PARCEL_CACHE_TTL_MS;
const BLOCK_CACHE_MAX_ENTRIES = 128;

export function makeCatastroBlockHandler(deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || CATASTRO_UPSTREAM_TIMEOUT_MS;

    // ⚠ PER-HANDLER, NOT MODULE-LEVEL. The first version of this cache was a module-level Map and
    // it immediately leaked between tests: a block cached by one case was served to the next,
    // so "REFUSES below 3 siblings" passed a stale success back and failed. That was the CACHE
    // telling the truth about a design flaw, not a test-harness quirk — a module-global mutable
    // Map is shared by every handler anyone constructs, which is exactly the hidden coupling
    // `makeCatastroBlockHandler(deps)` exists to avoid. Scoping it to the closure gives each
    // constructed handler its own cache: production builds ONE (`catastroBlockHandler` below) and
    // gets one long-lived cache, while every test gets a clean one for free, with no reset hook to
    // remember to call.
    const blockCache = new Map();

    const blockCacheGet = (manzana) => {
        const hit = blockCache.get(manzana);
        if (!hit) return null;
        if (Date.now() - hit.at > BLOCK_CACHE_TTL_MS) {
            blockCache.delete(manzana);
            return null;
        }
        return hit;
    };

    const blockCacheSet = (manzana, parcels, neighbours, freeStanding = null) => {
        if (blockCache.size >= BLOCK_CACHE_MAX_ENTRIES) {
            // Oldest-first eviction — Map preserves insertion order.
            const oldest = blockCache.keys().next();
            if (!oldest.done) blockCache.delete(oldest.value);
        }
        // §STREET-WIDTH-NEIGHBOURS — the neighbours are cached WITH the block, deliberately. They
        // come from the same single bbox response, so caching the block without them would make the
        // second parcel on a block cheaper but UNMEASURABLE — a cache hit that silently downgrades
        // the answer is worse than a miss.
        blockCache.set(manzana, { at: Date.now(), parcels, neighbours, freeStanding });
    };

    return async function catastroBlockHandler(req, res) {
        const refcat = typeof req.query?.refcat === 'string' ? req.query.refcat.trim() : '';
        if (!refcat) return res.status(400).json({ error: 'refcat required' });
        const manzana = manzanaPrefix(refcat);
        if (!manzana) return res.status(400).json({ error: 'refcat too short for a manzana prefix' });

        // §BLOCK-CACHE — a hit skips BOTH upstream calls.
        const cached = blockCacheGet(manzana);
        if (cached) {
            console.log(
                `[catastro-block] §BLOCK-CACHE hit for manzana ${manzana} (${cached.parcels.length} parcels, ` +
                `${cached.neighbours.length} neighbours) — 0 upstream calls.`,
            );
            return res.status(200).json({
                block: {
                    manzana,
                    parcels: cached.parcels,
                    siblingCount: cached.parcels.length,
                    neighbours: cached.neighbours,
                    // §BLOCK-SINGLETON-MANZANA — see the fresh-response comment. A cached singleton
                    // must arrive carrying the same verdict it was admitted on.
                    freeStanding: cached.freeStanding === null || cached.freeStanding === undefined
                        ? null
                        : cached.freeStanding.freeStanding,
                },
                _cached: true,
            });
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            // 1) Centre the search on the subject parcel.
            //
            // §BLOCK-CENTROID-REUSE (L-533) — the CALLER usually already holds this parcel's ring:
            // `applyBcnZoningThenFallback` fetches it moments earlier to resolve the clau, and the
            // draw flow has it from the pick. Re-deriving it here cost a SECOND round-trip to the
            // same slow WFS for a number we were already given. So accept `lat`/`lon` and skip the
            // `GetParcel` call when they are supplied — halving the latency of the whole route.
            // Absent or malformed params fall back to the original self-fetch, so the route stays
            // correct for any caller that does not have a centroid to offer.
            const qLat = Number.parseFloat(req.query?.lat);
            const qLon = Number.parseFloat(req.query?.lon);
            let lat;
            let lon;
            if (Number.isFinite(qLat) && Number.isFinite(qLon)) {
                lat = qLat;
                lon = qLon;
            } else {
                const selfUrl = `${CATASTRO_WFS_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
                    `&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
                const selfRes = await fetchImpl(selfUrl, { signal: ctrl.signal });
                if (!selfRes.ok) return res.status(200).json({ block: null, _upstreamFailed: true });
                const selfParsed = parseParcelGml(await selfRes.text());
                if (!selfParsed || selfParsed.ring.length < 3) {
                    return res.status(200).json({ block: null, _shapeUnrecognised: true });
                }
                lat = selfParsed.ring.reduce((s, p) => s + p.lat, 0) / selfParsed.ring.length;
                lon = selfParsed.ring.reduce((s, p) => s + p.lon, 0) / selfParsed.ring.length;
            }

            // 2) One BBOX query, then filter to the manzana.
            const bboxRes = await fetchImpl(buildParcelBboxUrl(lat, lon), { signal: ctrl.signal });
            if (!bboxRes.ok) return res.status(200).json({ block: null, _upstreamFailed: true });
            const all = parseParcelCollectionGml(await bboxRes.text());
            const parcels = all.filter((p) => manzanaPrefix(p.refcat) === manzana);

            // §BLOCK-SINGLETON-MANZANA (L-586) — a 1–2 parcel manzana is refused only when it is
            // still TOUCHING another parcel, which is the broken-prefix case the old blanket `< 3`
            // guard was guessing at. A free-standing one is a real whole block (7/7 in the live
            // Barcelona sweep, four of them full ~12,000 m² Eixample illes) and must be answered.
            let freeStanding = null;
            if (parcels.length < 3) {
                freeStanding = isFreeStandingBlock(parcels, all);
                if (!freeStanding.freeStanding) {
                    console.warn(
                        `[catastro-block] §BLOCK-SINGLETON-MANZANA — manzana ${manzana} matched only ` +
                        `${parcels.length} of ${all.length} parcels in the bbox AND still abuts ` +
                        `${freeStanding.touching.length} other parcel(s) (nearest ` +
                        `${freeStanding.nearestOtherParcelM === null ? 'n/a' : freeStanding.nearestOtherParcelM.toFixed(2)} m). ` +
                        'Refusing: the siblings are there under another prefix, and a partial block ' +
                        'ring produces a WRONG profunditat edificable.',
                    );
                    return res.status(200).json({
                        block: null,
                        _tooFewSiblings: parcels.length,
                        _abuttingParcels: freeStanding.touching.length,
                    });
                }
                console.log(
                    `[catastro-block] §BLOCK-SINGLETON-MANZANA — manzana ${manzana} is a ` +
                    `${parcels.length}-parcel FREE-STANDING block; nearest other parcel ` +
                    `${freeStanding.nearestOtherParcelM === null ? 'none in bbox' : `${freeStanding.nearestOtherParcelM.toFixed(2)} m`}. ` +
                    'Accepting: the parcel IS the manzana.',
                );
            }

            // §BLOCK-CACHE — only a TRUSTWORTHY block is cached. The refusals above return before
            // this point, so a rejected block is never remembered as an answer.
            // §STREET-WIDTH-NEIGHBOURS (L-537) — the opposing frontages, from the SAME bbox parse.
            const neighbours = neighbourParcels(parcels, all, manzana);
            // §BLOCK-SINGLETON-MANZANA — the free-standing VERDICT is cached with the block, for
            // the same reason the neighbours are: a cache hit that dropped it would silently
            // downgrade a valid singleton block to "too few parcels" on the second lookup.
            blockCacheSet(manzana, parcels, neighbours, freeStanding);
            console.log(
                `[catastro-block] manzana ${manzana}: ${parcels.length} parcel(s) of ${all.length} ` +
                `in bbox around ${refcat}${Number.isFinite(qLat) ? ' (centroid supplied — GetParcel skipped)' : ''}; ` +
                `${neighbours.length} neighbour parcel(s) within ${NEIGHBOUR_HALO_M} m for §BCN-ALCADA street width. Cached.`,
            );
            return res.status(200).json({
                block: {
                    manzana,
                    parcels,
                    siblingCount: parcels.length,
                    neighbours,
                    // §BLOCK-SINGLETON-MANZANA (L-586) — THREE STATES, NEVER TWO. `true` = measured
                    // free-standing; `null` = not evaluated because the manzana has ≥3 parcels and
                    // never needed it. `false` never reaches a caller: it returns a refusal above.
                    // Collapsing null and false would be the L-467/L-469 conflation one field down.
                    freeStanding: freeStanding === null ? null : freeStanding.freeStanding,
                },
            });
        } catch (err) {
            console.warn(`[catastro-block] failed for ${refcat}: ${err?.message ?? err}`);
            return res.status(200).json({ block: null, _upstreamFailed: true });
        } finally {
            clearTimeout(timer);
        }
    };
}

export const catastroBlockHandler = makeCatastroBlockHandler();
