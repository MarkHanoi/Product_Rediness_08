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
 * Parse an OVC `Consulta_RCCOOR_Distancia` XML response into the NEAREST parcel's
 * referencia catastral + address. Robust to the `_Distancia` list shape:
 *   consulta_coordenadas_distancias > coordenadas_distancias > coordd > lpcd
 *     > pcd { pc { pc1, pc2 }, ldt, dis }
 * Returns the pcd with the smallest `dis`. REFCAT = pc1 + pc2 (14 chars). On the
 * error shape (`<lerr><err><cod>16</cod>` — "no reference at these coordinates")
 * or any malformed body → null. Never throws.
 *
 * @param {string} xml
 * @returns {{ refcat: string, address: string|null } | null}
 */
export function parseReverseGeocode(xml) {
    if (typeof xml !== 'string' || xml.length === 0) return null;
    // Each candidate parcel is a <pcd>…</pcd> block.
    const blocks = xml.match(/<pcd\b[\s\S]*?<\/pcd>/gi);
    if (!blocks || blocks.length === 0) return null;

    let best = null;
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
        if (!best || distance < best.distance) best = { refcat, address, distance };
    }
    if (!best) return null;
    return { refcat: best.refcat, address: best.address };
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
 * @returns {{ ring: {lat:number,lon:number}[], areaM2: number } | null}
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

    // areaValue (m²) when published; else derive from the ring (shoelace, m²).
    let areaM2 = 0;
    const areaMatch = gml.match(/<(?:[\w.-]+:)?areaValue\b[^>]*>\s*([\d.]+)\s*<\/(?:[\w.-]+:)?areaValue>/i);
    if (areaMatch && areaMatch[1]) {
        const v = Number.parseFloat(areaMatch[1]);
        if (Number.isFinite(v) && v > 0) areaM2 = v;
    }
    if (areaM2 <= 0) areaM2 = ringAreaM2(ring);
    return { ring, areaM2 };
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
 * The full point→parcel resolution, server-side + cached:
 *   1. reverse-geocode (lon,lat) → refcat + address (OVC _Distancia)
 *   2. refcat cache hit? → return the normalised parcel
 *   3. else GetParcel(refcat) → parse GML → { ring, areaM2 } → cache by refcat
 *
 * Resolves to the normalised ParcelResult, or null (no parcel at the point / any
 * upstream failure). NEVER throws. `deps` is injectable for tests.
 *
 * @param {number} lon  EPSG:4326 longitude
 * @param {number} lat  EPSG:4326 latitude
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<ParcelResult|null>}
 */
export async function fetchParcelAtPoint(lon, lat, deps = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    // 1. point → refcat (Coordenada_X = lon, Coordenada_Y = lat for EPSG:4326).
    const rcUrl =
        `${CATASTRO_RCCOOR_ENDPOINT}?SRS=EPSG:4326` +
        `&Coordenada_X=${encodeURIComponent(String(lon))}` +
        `&Coordenada_Y=${encodeURIComponent(String(lat))}`;
    const rcXml = await fetchTextOnce(rcUrl, deps);
    if (!rcXml) return null;
    const rc = parseReverseGeocode(rcXml);
    if (!rc) return null; // no cadastral reference at/near this point

    // 2. cache hit by refcat?
    const cached = cacheGet(rc.refcat);
    if (cached) {
        _hits++;
        // Refresh the address from this lookup only if the cached one was empty.
        return cached.address ? cached : { ...cached, address: rc.address };
    }
    _misses++;

    // 3. refcat → parcel geometry (GML) → normalise.
    const wfsUrl =
        `${CATASTRO_WFS_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
        `&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(rc.refcat)}&srsName=EPSG:4326`;
    const gml = await fetchTextOnce(wfsUrl, deps);
    if (!gml) return null;
    const parsed = parseParcelGml(gml);
    if (!parsed) return null;

    /** @type {ParcelResult} */
    const result = {
        ring: parsed.ring,
        refcat: rc.refcat,
        areaM2: parsed.areaM2,
        address: rc.address,
    };
    cacheSet(rc.refcat, result);
    return result;
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
        if (refcat && parsed) out.push({ refcat, ring: parsed.ring, areaM2: parsed.areaM2 });
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
export function makeCatastroBlockHandler(deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || CATASTRO_UPSTREAM_TIMEOUT_MS;
    return async function catastroBlockHandler(req, res) {
        const refcat = typeof req.query?.refcat === 'string' ? req.query.refcat.trim() : '';
        if (!refcat) return res.status(400).json({ error: 'refcat required' });
        const manzana = manzanaPrefix(refcat);
        if (!manzana) return res.status(400).json({ error: 'refcat too short for a manzana prefix' });

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            // 1) The subject parcel, to centre the search.
            const selfUrl = `${CATASTRO_WFS_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
                `&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
            const selfRes = await fetchImpl(selfUrl, { signal: ctrl.signal });
            if (!selfRes.ok) return res.status(200).json({ block: null, _upstreamFailed: true });
            const selfParsed = parseParcelGml(await selfRes.text());
            if (!selfParsed || selfParsed.ring.length < 3) {
                return res.status(200).json({ block: null, _shapeUnrecognised: true });
            }
            const lat = selfParsed.ring.reduce((s, p) => s + p.lat, 0) / selfParsed.ring.length;
            const lon = selfParsed.ring.reduce((s, p) => s + p.lon, 0) / selfParsed.ring.length;

            // 2) One BBOX query, then filter to the manzana.
            const bboxRes = await fetchImpl(buildParcelBboxUrl(lat, lon), { signal: ctrl.signal });
            if (!bboxRes.ok) return res.status(200).json({ block: null, _upstreamFailed: true });
            const all = parseParcelCollectionGml(await bboxRes.text());
            const parcels = all.filter((p) => manzanaPrefix(p.refcat) === manzana);

            if (parcels.length < 3) {
                // See the header: a 1–2 parcel "block" is far likelier to be a broken prefix
                // assumption than a real manzana, and a too-small ring yields a wrong depth.
                console.warn(
                    `[catastro-block] §CATASTRO-BLOCK — manzana ${manzana} matched only ` +
                    `${parcels.length} of ${all.length} parcels in the bbox. Refusing: too few for a ` +
                    `block, and a partial block ring produces a WRONG profunditat edificable.`,
                );
                return res.status(200).json({ block: null, _tooFewSiblings: parcels.length });
            }

            console.log(
                `[catastro-block] manzana ${manzana}: ${parcels.length} parcel(s) of ${all.length} ` +
                `in bbox around ${refcat}.`,
            );
            return res.status(200).json({
                block: { manzana, parcels, siblingCount: parcels.length },
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
