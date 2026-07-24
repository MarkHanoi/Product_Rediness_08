/**
 * @file server/euCadastreProxy.js
 * @description L-613 — same-origin proxy for the OPEN, keyless national cadastres beyond Spain,
 *   so PRYZM's "Select parcel" works in EVERY country with a reachable cadastre — not just Spain.
 *
 * WHY THIS EXISTS (mirrors server/parcelZoningProxy.js verbatim in shape)
 * ----------------------------------------------------------------------
 * `parcelZoningProxy.js` proxies Spain's Catastro under `/api/catastro/parcel`. This is its
 * sibling for the other cadastres a browser cannot reach directly (CORS + CSP): each hits OUR
 * origin at `/api/parcel/<cc>`, the server forwards ONCE to the national WFS, NORMALISES the
 * response (GeoJSON or GML) → a plain WGS84 lat/lon ring, and caches by parcel id. NEVER crashes:
 * any miss/upstream failure answers HTTP 200 `{ parcel: null }` so the client falls back to draw
 * (or, one layer up, to the OSM footprint).
 *
 * WIRED CADASTRES — each LIVE-PROBED keyless on 2026-07-24 (evidence in
 * docs/04-reference/jurisdictions/PARCEL-SELECT-COVERAGE.md):
 *   • FR  data.geopf.fr WFS CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle   (GeoJSON, lon,lat)
 *   • NL  service.pdok.nl kadastralekaart WFS v5_0 kadastralekaart:Perceel  (GeoJSON, lon,lat)
 *   • NO  wfs.geonorge.no matrikkelen-eiendomskart-teig app:Teig            (GML 3.2.1, lon,lat)
 *   • DE-NRW www.wfs.nrw.de wfs_nw_alkis_vereinfacht ave:Flurstueck          (GML 3.2.1, lat,lon)
 *
 * The WFS services are BBOX-queryable (unlike Catastro's id-only WFS), so the flow is one call:
 * a small bbox around the click → keep the parcel whose ring CONTAINS the point (else the nearest
 * centroid). No point→id→geometry round-trip is needed.
 *
 * @see server/parcelZoningProxy.js — the Spain sibling this clones (cache/forward-once/fallback)
 * @see apps/editor/src/ui/site/parcel/WfsParcelProvider.ts — the client consumer
 * @see packages/site-parcel-data/src/parcelProviders/registry.ts — the routing registry
 */

const UPSTREAM_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 512;

// ── Shared per-source cache (keyed by `${cc}:${refcat}`) ─────────────────────
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
export function __resetEuCadastreCache() { _cache.clear(); }

// ── Geometry helpers (server-side; no DOM) ───────────────────────────────────

/** Ray-casting point-in-polygon on a [{lat,lon}] ring. */
function ringContains(ring, lat, lon) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i].lat, xi = ring[i].lon;
        const yj = ring[j].lat, xj = ring[j].lon;
        const intersect = (yi > lat) !== (yj > lat) &&
            lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Approx planar area (m²) of a small WGS84 lat/lon ring via local equirectangular. */
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

function ringCentroid(ring) {
    let lat = 0, lon = 0;
    for (const p of ring) { lat += p.lat; lon += p.lon; }
    return { lat: lat / ring.length, lon: lon / ring.length };
}

/** Pick the candidate whose ring contains the point; else the nearest centroid. */
function pickCandidate(candidates, lat, lon) {
    if (candidates.length === 0) return null;
    for (const c of candidates) {
        if (c.ring.length >= 3 && ringContains(c.ring, lat, lon)) return c;
    }
    let best = null, bestD = Infinity;
    for (const c of candidates) {
        if (c.ring.length < 3) continue;
        const ct = ringCentroid(c.ring);
        const d = (ct.lat - lat) ** 2 + (ct.lon - lon) ** 2;
        if (d < bestD) { bestD = d; best = c; }
    }
    return best;
}

// ── GeoJSON parse (FR, NL) — GeoJSON rings are ALWAYS [lon,lat] ──────────────
function outerRingFromGeoJson(geom) {
    if (!geom) return [];
    let coords = null;
    if (geom.type === 'Polygon') coords = geom.coordinates?.[0];
    else if (geom.type === 'MultiPolygon') coords = geom.coordinates?.[0]?.[0];
    if (!Array.isArray(coords)) return [];
    const ring = [];
    for (const c of coords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lon = Number(c[0]), lat = Number(c[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) ring.push({ lat, lon });
    }
    return ring;
}

function parseGeoJsonCandidates(text) {
    let json;
    try { json = JSON.parse(text); } catch { return []; }
    const feats = Array.isArray(json?.features) ? json.features : [];
    const out = [];
    for (const f of feats) {
        const ring = outerRingFromGeoJson(f?.geometry);
        if (ring.length >= 3) out.push({ ring, props: f?.properties ?? {} });
    }
    return out;
}

// ── GML parse (NO, DE-NRW) — split into members, take each member's first posList ──
function gmlText(block, tag) {
    const m = block.match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>\\s*([^<]*?)\\s*</(?:[\\w.-]+:)?${tag}>`, 'i'));
    return m && m[1] ? m[1].trim() : null;
}

function parseGmlCandidates(text, axis /* 'lonlat' | 'latlon' */) {
    // Each feature is a <wfs:member>…</wfs:member> (WFS 2.0) or <gml:featureMember>…
    let blocks = text.match(/<(?:wfs:)?member\b[\s\S]*?<\/(?:wfs:)?member>/gi);
    if (!blocks) blocks = text.match(/<(?:gml:)?featureMember\b[\s\S]*?<\/(?:gml:)?featureMember>/gi);
    if (!blocks) blocks = [text]; // single feature, no member wrapper
    const out = [];
    for (const block of blocks) {
        const pos = block.match(/<(?:[\w.-]+:)?posList\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?posList>/i);
        if (!pos || !pos[1]) continue;
        const nums = pos[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
        if (nums.length < 6) continue;
        const ring = [];
        for (let i = 0; i + 1 < nums.length; i += 2) {
            if (axis === 'lonlat') ring.push({ lat: nums[i + 1], lon: nums[i] });
            else ring.push({ lat: nums[i], lon: nums[i + 1] });
        }
        if (ring.length >= 3) out.push({ ring, block });
    }
    return out;
}

// ── Per-source configuration ─────────────────────────────────────────────────
// Each source: national bbox guard, the GetFeature URL builder, the response format, and a
// `normalise(candidate)` that maps the source's fields → { refcat, areaM2, address }.

const HALF_DEG = 0.00035; // ~±38 m bbox around the click — enough to catch the parcel.

function frUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
        '&TYPENAMES=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&SRSNAME=EPSG:4326' +
        `&COUNT=20&OUTPUTFORMAT=application/json&BBOX=${encodeURIComponent(bbox)}`;
}
function nlUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=kadastralekaart:Perceel&srsName=urn:ogc:def:crs:EPSG::4326' +
        `&count=20&outputFormat=application/json&bbox=${encodeURIComponent(bbox)}`;
}
function noUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?service=WFS&version=2.0.0&request=GetFeature' +
        `&typeNames=app:Teig&srsName=EPSG:4326&count=20&bbox=${encodeURIComponent(bbox)}`;
}
function nrwUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht?service=WFS&version=2.0.0&request=GetFeature' +
        `&typeNames=ave:Flurstueck&srsName=EPSG:4326&count=20&bbox=${encodeURIComponent(bbox)}`;
}

function jsonProp(props, ...keys) {
    for (const k of keys) {
        const v = props?.[k];
        if (v !== undefined && v !== null && String(v).length > 0) return v;
    }
    return null;
}

/** @typedef {{ guard:(lat:number,lon:number)=>boolean, url:(lat:number,lon:number)=>string, format:'geojson'|'gml', axis?:'lonlat'|'latlon', source:string, normalise:(c:any)=>{refcat:string,areaM2:number,address:string|null} }} SourceCfg */

/** @type {Record<string, SourceCfg>} */
export const EU_CADASTRE_SOURCES = {
    fr: {
        guard: (lat, lon) => lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 8.5,
        url: frUrl,
        format: 'geojson',
        source: 'ign-fr',
        normalise: (c) => {
            const p = c.props || {};
            const refcat = String(jsonProp(p, 'idu', 'id') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'contenance')) || ringAreaM2(c.ring);
            const parts = [jsonProp(p, 'nom_com'), jsonProp(p, 'section'), jsonProp(p, 'numero')].filter(Boolean);
            return { refcat, areaM2, address: parts.length ? parts.join(' ') : null };
        },
    },
    nl: {
        guard: (lat, lon) => lat >= 50.5 && lat <= 53.8 && lon >= 3.2 && lon <= 7.4,
        url: nlUrl,
        format: 'geojson',
        source: 'pdok-nl',
        normalise: (c) => {
            const p = c.props || {};
            const gem = jsonProp(p, 'AKRKadastraleGemeenteCodeWaarde', 'kadastraleGemeenteCode');
            const sectie = jsonProp(p, 'sectie');
            const nr = jsonProp(p, 'perceelnummer');
            const refcat = [gem, sectie, nr].filter((v) => v !== null && v !== undefined).join(' ').trim() ||
                String(jsonProp(p, 'identificatieLokaalID') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'kadastraleGrootteWaarde')) || ringAreaM2(c.ring);
            const address = jsonProp(p, 'kadastraleGemeenteWaarde');
            return { refcat, areaM2, address: address ? String(address) : null };
        },
    },
    no: {
        guard: (lat, lon) => lat >= 57.5 && lat <= 71.5 && lon >= 4 && lon <= 31.5,
        url: noUrl,
        format: 'gml',
        axis: 'lonlat',
        source: 'geonorge-no',
        normalise: (c) => {
            const b = c.block || '';
            const kommune = gmlText(b, 'kommunenummer');
            const gnr = gmlText(b, 'gardsnummer');
            const bnr = gmlText(b, 'bruksnummer');
            const kommunenavn = gmlText(b, 'kommunenavn');
            const refcat = [kommune, gnr && bnr ? `${gnr}/${bnr}` : gnr].filter(Boolean).join('-') ||
                (gmlText(b, 'teigId') ?? '');
            return { refcat, areaM2: ringAreaM2(c.ring), address: kommunenavn ?? null };
        },
    },
    'de-nrw': {
        guard: (lat, lon) => lat >= 50.2 && lat <= 52.7 && lon >= 5.7 && lon <= 9.6,
        url: nrwUrl,
        format: 'gml',
        axis: 'latlon',
        source: 'alkis-nrw',
        normalise: (c) => {
            const b = c.block || '';
            const refcat = (gmlText(b, 'flstkennz') ?? '').replace(/_+$/, '').trim();
            const areaM2 = Number(gmlText(b, 'flaeche')) || ringAreaM2(c.ring);
            const address = gmlText(b, 'gemarkung');
            return { refcat, areaM2, address: address ?? null };
        },
    },
};

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
                    Accept: 'application/json, application/xml, text/xml, application/gml+xml, */*',
                    'User-Agent': 'PRYZM-Cadastre-Proxy/1.0 (+https://pryzm.fly.dev)',
                },
                signal: ctrl.signal,
            });
            if (res.status === 429 || res.status === 503 || res.status === 504) continue;
            if (!res.ok) { console.warn(`[eu-cadastre] HTTP ${res.status} for ${url}`); return null; }
            const text = await res.text();
            return text && text.length > 0 ? text : null;
        } catch (err) {
            console.warn(`[eu-cadastre] fetch failed (attempt ${attempt + 1}): ${err?.message ?? err}`);
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
}

/**
 * Resolve the parcel under a WGS84 point for one source. Returns the normalised
 * `{ ring, refcat, areaM2, address }` or null. NEVER throws. `deps.fetchImpl` is injectable.
 */
export async function fetchEuParcelAtPoint(cc, lon, lat, deps = {}) {
    const cfg = EU_CADASTRE_SOURCES[cc];
    if (!cfg) return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (!cfg.guard(lat, lon)) return null;

    const text = await fetchTextOnce(cfg.url(lat, lon), deps);
    if (!text) return null;

    const candidates = cfg.format === 'geojson'
        ? parseGeoJsonCandidates(text)
        : parseGmlCandidates(text, cfg.axis);
    const chosen = pickCandidate(candidates, lat, lon);
    if (!chosen) return null;

    const meta = cfg.normalise(chosen);
    if (!meta.refcat) return null;
    const result = {
        ring: chosen.ring,
        refcat: meta.refcat,
        areaM2: Number.isFinite(meta.areaM2) && meta.areaM2 > 0 ? meta.areaM2 : ringAreaM2(chosen.ring),
        address: meta.address,
    };
    cacheSet(`${cc}:${meta.refcat}`, result);
    return result;
}

function setProxyCacheHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/** The same-origin route prefix. Client calls `${EU_PARCEL_PATH}/<cc>?lon=&lat=`. */
export const EU_PARCEL_PATH = '/api/parcel';

/**
 * Express handler for GET /api/parcel/:cc?lon=&lat=. Serves a cached-by-refcat parcel, else
 * resolves it once via the country's WFS, normalises → a WGS84 ring, caches, and returns
 * `{ parcel: { ring, refcat, areaM2, address, source } }`. Unknown cc → 404 JSON; bad coords →
 * 400; no parcel / upstream failure → 200 `{ parcel: null }`. `deps` injectable for tests.
 */
export function makeEuParcelHandler(deps = {}) {
    return async function euParcelHandler(req, res) {
        const cc = String(req.params?.cc ?? '').toLowerCase();
        const cfg = EU_CADASTRE_SOURCES[cc];
        if (!cfg) return res.status(404).json({ error: `Unknown cadastre '${cc}'.` });

        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
            return res.status(400).json({ error: 'lon and lat query params (EPSG:4326) are required.' });
        }

        // The refcat cache lives inside fetchEuParcelAtPoint (keyed by the WFS-returned id);
        // a point→refcat cache is impossible before the WFS answers, exactly like the Catastro proxy.
        let parcel = null;
        try {
            parcel = await fetchEuParcelAtPoint(cc, lon, lat, deps);
        } catch (err) {
            console.warn(`[eu-cadastre] unexpected error (${cc}):`, err?.message ?? err);
            parcel = null;
        }

        setProxyCacheHeaders(res);
        if (!parcel) {
            res.setHeader('X-Cadastre-Cache', 'MISS-EMPTY');
            return res.status(200).json({ parcel: null });
        }
        res.setHeader('X-Cadastre-Cache', 'HIT-OR-FETCH');
        return res.status(200).json({ parcel: { ...parcel, source: cfg.source } });
    };
}

/** The default production handler (real `fetch`, real endpoints). */
export const euParcelHandler = makeEuParcelHandler();
