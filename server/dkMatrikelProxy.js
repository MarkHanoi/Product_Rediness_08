/**
 * @file server/dkMatrikelProxy.js
 * @description L-613 (Denmark slice) — same-origin proxy for the Danish MATRIKEL (cadastral parcel)
 *   service, mirroring server/parcelZoningProxy.js (Catastro) EXACTLY so the map's "Select parcel"
 *   click behaves identically in Copenhagen and in Barcelona — same interface, same `{ parcel }`
 *   return shape, same never-crash posture. Only the data endpoint differs.
 *
 * CREDENTIAL GATE (probed 2026-07-24, honest)
 * -------------------------------------------
 * Denmark's Matriklen is NOT keyless. Every anonymous probe of the Datafordeler + Dataforsyningen
 * Matrikel WFS returned HTTP 404 (the host services.datafordeler.dk IS reachable — 87.60.242.40,
 * `Server: datafordeler.dk` — but it answers 404 to UNAUTHENTICATED service requests rather than
 * 401). Access needs a FREE Datafordeler **service user** (username + password, created in the
 * self-service portal). Per the founder's instruction we DO NOT skip Denmark: this proxy carries
 * those credentials SERVER-SIDE (never in the browser) from env, exactly as a keyed proxy should.
 *
 *   DATAFORDELER_USERNAME + DATAFORDELER_PASSWORD   (the Datafordeler service user)
 *   DK_MATRIKEL_WFS_URL / DK_MATRIKEL_TYPENAME       (endpoint/typename overrides — the exact
 *                                                     Matriklen2 service alias must be confirmed
 *                                                     against the account; sensible defaults below)
 *
 * When the credentials are ABSENT the proxy answers 200 `{ parcel: null }` (so the client falls
 * back to the OSM footprint) and logs ONCE that DK is unconfigured — never a crash, never a guess.
 *
 * REPROJECTION. The Matrikel is EPSG:25832 (ETRS89 / UTM 32N). We request native 25832 and
 * reproject each vertex to WGS84 with a self-contained Snyder inverse-transverse-Mercator (no
 * proj4 dependency server-side), so the returned ring is WGS84 lat/lon — the SAME shape Catastro
 * returns. If a vertex already looks like lon/lat (|x| ≤ 180, e.g. the service honoured srsName
 * 4326), it is passed through unreprojected.
 *
 * @see server/parcelZoningProxy.js — the Catastro proxy this clones.
 * @see apps/editor/src/ui/site/parcel/DkMatrikelParcelProvider.ts — the client consumer.
 */

/** The same-origin route the client's DkMatrikelParcelProvider calls. */
export const DK_PARCEL_PATH = '/api/parcel/dk';

/** The Datafordeler Matriklen2 WFS. Env-overridable — the exact service alias is account-specific. */
export const DK_MATRIKEL_WFS_URL =
    process.env.DK_MATRIKEL_WFS_URL ||
    'https://services.datafordeler.dk/MATRIKLEN2/MatrikelGaeldendeOgForeloebig/1.0.0/WFS';
/** The parcel feature type (Jordstykke = cadastral parcel). Env-overridable. */
export const DK_MATRIKEL_TYPENAME = process.env.DK_MATRIKEL_TYPENAME || 'mat:Jordstykke';

const UPSTREAM_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 512;
const BBOX_HALF_DEG = 0.00035; // ~±38 m around the click.

let _warnedNoCreds = false;

// ── Cache (keyed by parcel id) ───────────────────────────────────────────────
const _cache = new Map();
function cacheGet(key, now = Date.now()) {
    const e = _cache.get(key);
    if (!e) return null;
    if (e.expires <= now) { _cache.delete(key); return null; }
    _cache.delete(key); _cache.set(key, e);
    return e.value;
}
function cacheSet(key, value, now = Date.now()) {
    _cache.set(key, { value, expires: now + CACHE_TTL_MS });
    while (_cache.size > CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}
export function __resetDkMatrikelCache() { _cache.clear(); }

// ── EPSG:25832 (ETRS89 / UTM 32N) → WGS84, Snyder inverse TM (no proj4) ──────
const _A = 6378137.0;               // WGS84/GRS80 semi-major (ETRS89 ≈ WGS84 at this precision)
const _F = 1 / 298.257223563;
const _K0 = 0.9996;
const _E2 = _F * (2 - _F);
const _LON0 = 9.0;                  // UTM zone 32 central meridian
const _FALSE_E = 500000.0;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/** ETRS89/UTM32N easting/northing (m) → { lat, lon } in WGS84 degrees. */
export function utm32nToWgs84(E, N) {
    const e2 = _E2;
    const ep2 = e2 / (1 - e2);
    const M = N / _K0;
    const mu = M / (_A * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 =
        mu +
        (3 * e1 / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
        (21 * e1 ** 2 / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
        (151 * e1 ** 3 / 96) * Math.sin(6 * mu) +
        (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const sinP = Math.sin(phi1), cosP = Math.cos(phi1), tanP = Math.tan(phi1);
    const C1 = ep2 * cosP * cosP;
    const T1 = tanP * tanP;
    const N1 = _A / Math.sqrt(1 - e2 * sinP * sinP);
    const R1 = (_A * (1 - e2)) / Math.pow(1 - e2 * sinP * sinP, 1.5);
    const D = (E - _FALSE_E) / (N1 * _K0);
    const lat =
        phi1 -
        (N1 * tanP / R1) *
            (D * D / 2 -
                ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
                ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
    const lon =
        _LON0 * D2R +
        (D -
            ((1 + 2 * T1 + C1) * D ** 3) / 6 +
            ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
            cosP;
    return { lat: lat * R2D, lon: lon * R2D };
}

/** A vertex `[a, b]` from a native-25832 posList (E,N) → WGS84; pass-through if already lon/lat. */
function vertexToLatLon(a, b) {
    // If both look like degrees, the service honoured srsName=4326 (axis lat,lon per OGC).
    if (Math.abs(a) <= 180 && Math.abs(b) <= 180) return { lat: a, lon: b };
    // Native UTM: posList is E N.
    return utm32nToWgs84(a, b);
}

// ── GML normalisation (server-side; no DOM) ─────────────────────────────────

function gmlField(block, tag) {
    const m = block.match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>\\s*([^<]*?)\\s*</(?:[\\w.-]+:)?${tag}>`, 'i'));
    return m && m[1] ? m[1].trim() : null;
}

/** Ray-casting point-in-polygon on a [{lat,lon}] ring. */
function ringContains(ring, lat, lon) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i].lat, xi = ring[i].lon;
        const yj = ring[j].lat, xj = ring[j].lon;
        if (((yi > lat) !== (yj > lat)) &&
            lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
    }
    return inside;
}

function ringAreaM2(ring) {
    if (ring.length < 3) return 0;
    const R = 6_378_137, d2r = Math.PI / 180;
    const cos0 = Math.cos(ring[0].lat * d2r);
    const xz = ring.map((p) => ({ x: p.lon * d2r * R * cos0, z: p.lat * d2r * R }));
    let a = 0;
    for (let i = 0; i < xz.length; i++) {
        const p = xz[i], q = xz[(i + 1) % xz.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/**
 * Parse a Matrikel GML FeatureCollection into candidate parcels. Each member's first exterior
 * posList becomes a WGS84 ring (reprojected from 25832 when needed). Returns [] on no geometry.
 * Never throws.
 */
export function parseMatrikelGml(gml) {
    if (typeof gml !== 'string' || gml.length === 0) return [];
    let blocks = gml.match(/<(?:wfs:)?member\b[\s\S]*?<\/(?:wfs:)?member>/gi);
    if (!blocks) blocks = gml.match(/<(?:gml:)?featureMember\b[\s\S]*?<\/(?:gml:)?featureMember>/gi);
    if (!blocks) blocks = [gml];
    const out = [];
    for (const block of blocks) {
        const pos = block.match(/<(?:[\w.-]+:)?posList\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?posList>/i);
        if (!pos || !pos[1]) continue;
        const nums = pos[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
        if (nums.length < 6) continue;
        const ring = [];
        for (let i = 0; i + 1 < nums.length; i += 2) ring.push(vertexToLatLon(nums[i], nums[i + 1]));
        if (ring.length < 3) continue;
        // Matrikel ids: matrikelnummer / faelleskommunaltEjerlavsnavn (ejerlav), or the gml:id.
        const matrikelnr = gmlField(block, 'matrikelnummer');
        const ejerlav = gmlField(block, 'ejerlavsnavn') || gmlField(block, 'faelleskommunaltEjerlav');
        const gmlId = (block.match(/gml:id="([^"]+)"/i) || [])[1] || null;
        const refcat = [ejerlav, matrikelnr].filter(Boolean).join(' ') || matrikelnr || gmlId || '';
        out.push({ ring, refcat, address: ejerlav || null });
    }
    return out;
}

function pickCandidate(candidates, lat, lon) {
    if (candidates.length === 0) return null;
    for (const c of candidates) if (ringContains(c.ring, lat, lon)) return c;
    let best = null, bestD = Infinity;
    for (const c of candidates) {
        let clat = 0, clon = 0;
        for (const p of c.ring) { clat += p.lat; clon += p.lon; }
        clat /= c.ring.length; clon /= c.ring.length;
        const d = (clat - lat) ** 2 + (clon - lon) ** 2;
        if (d < bestD) { bestD = d; best = c; }
    }
    return best;
}

async function fetchTextOnce(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || UPSTREAM_TIMEOUT_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/xml, text/xml, application/gml+xml, */*',
                    'User-Agent': 'PRYZM-Matrikel-Proxy/1.0 (+https://pryzm.fly.dev)',
                },
                signal: ctrl.signal,
            });
            if (res.status === 429 || res.status === 503 || res.status === 504) continue;
            if (!res.ok) { console.warn(`[dk-matrikel] HTTP ${res.status}`); return null; }
            const text = await res.text();
            return text && text.length > 0 ? text : null;
        } catch (err) {
            console.warn(`[dk-matrikel] fetch failed (attempt ${attempt + 1}): ${err?.message ?? err}`);
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
}

function buildMatrikelUrl(lat, lon, deps = {}) {
    const username = deps.username ?? process.env.DATAFORDELER_USERNAME;
    const password = deps.password ?? process.env.DATAFORDELER_PASSWORD;
    if (!username || !password) return null;
    const base = deps.wfsUrl ?? DK_MATRIKEL_WFS_URL;
    const typename = deps.typename ?? DK_MATRIKEL_TYPENAME;
    // Native 25832 bbox around the click (~±38 m in degrees is fine for the bbox extent; the
    // service reprojects the bbox filter itself when the CRS is declared as 4326).
    const bbox = `${lat - BBOX_HALF_DEG},${lon - BBOX_HALF_DEG},${lat + BBOX_HALF_DEG},${lon + BBOX_HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return `${base}?service=WFS&version=2.0.0&request=GetFeature` +
        `&TYPENAMES=${encodeURIComponent(typename)}&srsName=EPSG:25832&count=20` +
        `&BBOX=${encodeURIComponent(bbox)}` +
        `&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
}

/**
 * Resolve the Danish cadastral parcel under a WGS84 point. Returns the normalised
 * `{ ring, refcat, areaM2, address }` (WGS84) or null (no parcel / no credentials / upstream
 * failure). NEVER throws. `deps` injectable for tests (fetchImpl / username / password / wfsUrl).
 */
export async function fetchDkParcelAtPoint(lon, lat, deps = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const pointKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    const cached = cacheGet(pointKey);
    if (cached) return cached;

    const url = buildMatrikelUrl(lat, lon, deps);
    if (!url) {
        if (!_warnedNoCreds) {
            console.warn('[dk-matrikel] DATAFORDELER_USERNAME/PASSWORD not set — Denmark parcel-select ' +
                'returns { parcel: null } (client falls back to the OSM footprint). Set a free Datafordeler ' +
                'service user to enable real Danish cadastral parcels.');
            _warnedNoCreds = true;
        }
        return null;
    }
    const gml = await fetchTextOnce(url, deps);
    if (!gml) return null;
    const chosen = pickCandidate(parseMatrikelGml(gml), lat, lon);
    if (!chosen || chosen.ring.length < 3 || !chosen.refcat) return null;
    const result = {
        ring: chosen.ring,
        refcat: chosen.refcat,
        areaM2: ringAreaM2(chosen.ring),
        address: chosen.address,
    };
    cacheSet(pointKey, result);
    return result;
}

function setProxyCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Express handler for GET /api/parcel/dk?lon=&lat= — the Denmark analogue of the Catastro handler.
 * Bad coords → 400; out-of-Denmark / no parcel / no credentials / upstream failure → 200
 * `{ parcel: null }`; a hit → `{ parcel: { ring, refcat, areaM2, address, source: 'matrikel-dk' } }`.
 */
export function makeDkParcelHandler(deps = {}) {
    return async function dkParcelHandler(req, res) {
        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
            return res.status(400).json({ error: 'lon and lat query params (EPSG:4326) are required.' });
        }
        // Loose Denmark bbox guard (incl. Bornholm) — a click elsewhere short-circuits.
        if (lat < 54.4 || lat > 57.9 || lon < 7.7 || lon > 15.3) {
            setProxyCacheHeaders(res);
            res.setHeader('X-Matrikel-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ parcel: null });
        }
        let parcel = null;
        try {
            parcel = await fetchDkParcelAtPoint(lon, lat, deps);
        } catch (err) {
            console.warn('[dk-matrikel] unexpected error:', err?.message ?? err);
            parcel = null;
        }
        setProxyCacheHeaders(res);
        if (!parcel) {
            res.setHeader('X-Matrikel-Cache', 'MISS-EMPTY');
            return res.status(200).json({ parcel: null });
        }
        res.setHeader('X-Matrikel-Cache', 'HIT-OR-FETCH');
        return res.status(200).json({ parcel: { ...parcel, source: 'matrikel-dk' } });
    };
}

/** The default production handler (real `fetch`, real endpoint, env credentials). */
export const dkParcelHandler = makeDkParcelHandler();
