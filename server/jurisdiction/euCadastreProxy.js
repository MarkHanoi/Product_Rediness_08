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
 * WIRED CADASTRES — each LIVE-PROBED keyless (evidence in
 * docs/04-reference/jurisdictions/PARCEL-SELECT-COVERAGE.md):
 *   • FR  data.geopf.fr WFS CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle   (GeoJSON, lon,lat) — 2026-07-24
 *   • NL  service.pdok.nl kadastralekaart WFS v5_0 kadastralekaart:Perceel  (GeoJSON, lon,lat) — 2026-07-24
 *   • NO  wfs.geonorge.no matrikkelen-eiendomskart-teig app:Teig            (GML 3.2.1, lon,lat) — 2026-07-24
 *   • DE-NRW www.wfs.nrw.de wfs_nw_alkis_vereinfacht ave:Flurstueck          (GML 3.2.1, lat,lon) — 2026-07-24
 *   • CH  api3.geo.admin.ch identify ch.kantone.cadastralwebmap-farbe        (Esri JSON, lon,lat) — 2026-07-26
 *   • PT  snicws.dgterritorio.gov.pt inspire:cadastralparcel (DGT SNIC)     (GeoJSON, lon,lat) — 2026-07-31
 *   • US-SF  data.sfgov.org acdm-wktn (DataSF assessor parcels)             (Socrata, lon,lat) — 2026-07-31
 *   • US-CHI datacatalog.cookcountyil.gov 77tz-riq7 (Cook County parcels)   (Socrata, lon,lat) — 2026-07-31
 *   • EE  gsavalik.envir.ee/geoserver kataster:ky_kehtiv                    (GeoJSON, lon,lat) — 2026-09-02
 *   • LT  osp-sdg.stat.gov.lt ntr_sklypai/FeatureServer/0 (RC NTR)          (ArcGIS JSON, lon,lat) — 2026-09-02
 *   • PL  uldk.gugik.gov.pl GetParcelByXY (GUGiK ULDK)                       (pipe-text WKT, lon,lat) — 2026-09-02
 *
 * EE / LT / PL (lane PROXY-EE-LT-PL, 2026-09-02) are TABLE ROWS here, not DK-style modules,
 * deliberately: DK earned `dkMatrikelProxy.js` because it needs a CREDENTIAL gate, a Snyder
 * reprojection, a two-fetch attribute JOIN and a two-leg (Datafordeler→DAWA) fallback. All three
 * of these are one keyless GET returning WGS84 geometry server-side (srsName / outSR / srid=4326 —
 * each MEASURED live 2026-09-02, transcripts in
 * audit/europe-site-intel/2026-08-31/impl/lane-proxy-eeltpl.md), so the row shape fits exactly.
 * The endpoints/params mirror the package adapters that pinned them
 * (packages/site-parcel-data/src/countryAdapters/{ee,lt,pl}/) — ONLY the output CRS differs:
 * the adapters keep native CRS for measurement (E1a discipline); the browser needs WGS84 rings.
 *
 * ⚠ NOT WIRED HERE, DELIBERATELY (L-651 live probe, 2026-07-31): Brussels, Wallonia and Scotland
 * have parcel PROVIDERS in packages/site-parcel-data but no reachable upstream — Brussels'
 * GAPD:AGDP_CAPA is advertised in GetCapabilities yet every GetFeature returns "Feature type
 * unknown"; Wallonia's documented WFS root serves only orthophoto layers; Registers of Scotland is
 * DNS-dead / 403 / ScotLIS-licensed. Adding dead `cc` entries here would make every click in those
 * regions look like an empty cadastre, so they are registered as honest footprint-fallbacks in
 * registry.ts instead. An unknown `cc` 404s — a route that does not exist, not a parcel that does not.
 *
 * The WFS services are BBOX-queryable (unlike Catastro's id-only WFS), so the flow is one call:
 * a small bbox around the click → keep the parcel whose ring CONTAINS the point (else the nearest
 * centroid). No point→id→geometry round-trip is needed.
 *
 * CH is the same one-call shape via a DIFFERENT transport: the federal geo.admin.ch REST `identify`
 * service (Esri-JSON `rings`), not a WFS. It returns the real Amtliche-Vermessung *Grundstück* under
 * the click carrying its federal EGRID (`egris_egrid`, e.g. CH119192997709), local parcel number,
 * and canton — keyless, all-canton, live-verified for ZH + GE 2026-07-26. Licence: geo.admin.ch
 * FSDI terms — free, commercial use permitted, fair-use bounded (~20 req/min avg; the same-origin
 * proxy + 7-day per-parcel cache + apiLimiter keep us well under it), attribution
 * "© swisstopo + canton". See docs/04-reference/jurisdictions/ch/findings/ZURICH-PARCEL-SOURCE.md.
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

// ── Esri-JSON parse (CH — geo.admin.ch identify) ─────────────────────────────
// The federal `identify` service returns `{ results: [{ attributes, geometry }] }`. A polygon
// geometry is `{ rings: [[[x,y],…],…] }`; the FIRST ring is the exterior, and with `sr=4326` the
// pairs are [lon,lat] (Esri x,y order) — verified live 2026-07-26. Holes (subsequent rings) are
// ignored: a parcel boundary only needs its exterior, exactly as the GeoJSON/GML paths take the
// outer ring. Any error/exception body parses to `{ results: [] }` → [] → a clean miss.
function outerRingFromEsri(geom) {
    const rings = geom?.rings;
    if (!Array.isArray(rings) || rings.length === 0) return [];
    const coords = rings[0];
    if (!Array.isArray(coords)) return [];
    const ring = [];
    for (const c of coords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lon = Number(c[0]), lat = Number(c[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) ring.push({ lat, lon });
    }
    return ring;
}

function parseEsriJsonCandidates(text) {
    let json;
    try { json = JSON.parse(text); } catch { return []; }
    const results = Array.isArray(json?.results) ? json.results : [];
    const out = [];
    for (const f of results) {
        const ring = outerRingFromEsri(f?.geometry);
        if (ring.length >= 3) out.push({ ring, props: f?.attributes ?? {} });
    }
    return out;
}

// ── Socrata parse (US-SF, US-CHI) — a BARE JSON ARRAY of flat rows, not a FeatureCollection ──
// DataSF / Cook County publish through Socrata, whose SoQL point query
// (`$where=intersects(<geomcol>, 'POINT (lon lat)')`) returns `[ {…row}, … ]` with the geometry
// inline as a GeoJSON object on ONE of the row's columns. ⚠ The column name is NOT standardised:
// Cook County's parcel resource uses `the_geom`, DataSF's `acdm-wktn` uses **`shape`** (live-probed
// 2026-07-31 — the SF provider's documented `the_geom` is wrong and silently yields no geometry).
// Both spellings are accepted so one parser serves both cities.
function parseSocrataCandidates(text) {
    let json;
    try { json = JSON.parse(text); } catch { return []; }
    const rows = Array.isArray(json) ? json : Array.isArray(json?.features) ? json.features : [];
    const out = [];
    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const props = r.properties && typeof r.properties === 'object' ? r.properties : r;
        const geom = r.geometry ?? props.shape ?? props.the_geom ?? r.shape ?? r.the_geom;
        const ring = outerRingFromGeoJson(geom);
        if (ring.length >= 3) out.push({ ring, props });
    }
    return out;
}

// ── ArcGIS REST `query` parse (LT) — Esri JSON under a `features` envelope ───────────────────
// The FeatureServer `query` op returns `{ features: [{ attributes, geometry: { rings } }] }` —
// the same Esri polygon JSON as CH's identify but a DIFFERENT envelope (`features`+`attributes`
// vs `results`+`attributes`), so it gets its own parser exactly as Socrata's bare-array shape
// did. With `outSR=4326` the rings are [lon,lat] (Esri x,y) — MEASURED live 2026-09-02 on
// osp-sdg.stat.gov.lt (Vilnius Žvėrynas → kadastro_nr 0101/0039:1406, first vertex
// [25.2438…, 54.6933…]).
function parseArcgisCandidates(text) {
    let json;
    try { json = JSON.parse(text); } catch { return []; }
    const feats = Array.isArray(json?.features) ? json.features : [];
    const out = [];
    for (const f of feats) {
        const ring = outerRingFromEsri(f?.geometry);
        if (ring.length >= 3) out.push({ ring, props: f?.attributes ?? {} });
    }
    return out;
}

/**
 * ArcGIS returns HTTP **200** with an `{ "error": { code, message } }` payload on a bad request —
 * a FAILURE, not an empty answer (the LT adapter's measured fact 3,
 * `packages/site-parcel-data/src/countryAdapters/lt/ltArcgisClient.ts`). Letting it parse to
 * zero candidates would read as `empty` — the failure≠absence conflation §CONTEXT-DATA-HONESTY
 * forbids — so the resolve pre-checks this and classifies it `unreachable`.
 */
function arcgisErrorDetail(text) {
    let json;
    try { json = JSON.parse(text); } catch { return null; }
    const err = json?.error;
    if (err === null || err === undefined || typeof err !== 'object') return null;
    return `ArcGIS ${err.code ?? '?'}: ${err.message ?? 'error'}`;
}

// ── ULDK parse (PL) — text/plain, STATUS IS THE FIRST TOKEN OF THE BODY, not the HTTP code ──
// GUGiK's ULDK answers EVERY request HTTP 200 (measured fact 1 of
// packages/site-parcel-data/src/countryAdapters/pl/plUldkClient.ts):
//   • success         → first line `0`, then one pipe-delimited record per line
//   • genuine absence → first line `-1 brak wyników` (a durable "no parcel here")
//   • bad parameter   → no status token at all (`niepoprawny parametr …`)
//   • any other `-1 …`→ the service failing in its own words
// Reading `res.ok` as success would silently turn a service error into "no parcel here", so the
// resolve classifies from the BODY via this function before any candidate parsing.
function classifyUldkBody(text) {
    const lines = String(text).split(/\r?\n/);
    const status = (lines[0] ?? '').trim();
    if (status === '0') {
        const records = lines.slice(1).filter((l) => l.trim() !== '');
        // Status 0 with no record: the service claims success and served nothing — a service
        // defect, not a coverage fact (mirrors the PL adapter's classification).
        return records.length > 0 ? { kind: 'ok', records } : { kind: 'error', detail: 'ULDK status 0 with no record' };
    }
    if (status.startsWith('-1') && /brak\s+wynik/i.test(status.slice(2))) {
        return { kind: 'empty' };
    }
    return { kind: 'error', detail: `unrecognised ULDK body: "${String(text).slice(0, 120).trim()}"` };
}

// One pipe-delimited ULDK record (in PL_ULDK_RESULT_FIELDS order — the `result=` param FIXES the
// field order, so the positional parse below is pinned to a request this module builds itself) →
// a candidate. The geometry is `SRID=4326;POLYGON((lon lat, …))` because plUrl asks `srid=4326`
// (MEASURED live 2026-09-02: Suwałki → SRID=4326 + degree pairs; without the param the same
// record serves SRID=2180 metres). A record declaring any OTHER SRID is skipped rather than
// passed through as fake degrees.
function parseUldkCandidates(records) {
    const out = [];
    for (const line of records) {
        const parts = String(line).split('|');
        const id = (parts[0] ?? '').trim();
        const wkt = (parts[6] ?? '').trim();
        if (!id || !wkt) continue;
        const m = /^\s*(?:SRID=(\d+);)?\s*POLYGON\s*\(\s*\((.*?)\)\s*[,)]/s.exec(wkt);
        if (!m || m[1] !== '4326' || m[2] === undefined) continue;
        const ring = [];
        let bad = false;
        for (const pair of m[2].split(',')) {
            const nums = pair.trim().split(/\s+/);
            const lon = Number(nums[0]), lat = Number(nums[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) { bad = true; break; }
            ring.push({ lat, lon }); // WKT is lon-first (measured), same as GeoJSON
        }
        if (bad || ring.length < 4) continue; // a closed ring is ≥4 positions
        out.push({
            ring,
            props: {
                id,
                voivodeship: (parts[1] ?? '').trim() || null,
                county: (parts[2] ?? '').trim() || null,
                commune: (parts[3] ?? '').trim() || null,
                region: (parts[4] ?? '').trim() || null,
                parcel: (parts[5] ?? '').trim() || null,
            },
        });
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
/**
 * Switzerland — the federal geo.admin.ch REST `identify` (NOT a WFS). A tiny map window + small
 * pixel tolerance around the click; `returnGeometry=true` yields the parcel ring(s), and
 * `pickCandidate` keeps the one whose ring CONTAINS the point (else the nearest centroid).
 * `geometry` with `sr=4326` is `lon,lat`. The window (~±45 m) plus a 2-px tolerance robustly
 * resolves a click that lands slightly off a boundary — the same intent as the ±38 m WFS bboxes.
 */
function chUrl(lat, lon) {
    const d = 0.0006; // ~±45–65 m half-window around the click.
    const params = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        layers: 'all:ch.kantone.cadastralwebmap-farbe',
        tolerance: '2',
        sr: '4326',
        mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`,
        imageDisplay: '200,200,96',
        returnGeometry: 'true',
        limit: '20',
    });
    return `https://api3.geo.admin.ch/rest/services/all/MapServer/identify?${params.toString()}`;
}

/**
 * PORTUGAL — DGT SNIC INSPIRE WFS (Cadastro Predial). VERIFIED-LIVE 2026-07-31.
 * ⚠ The layer's DefaultCRS is the PROJECTED EPSG:3763 (PT-TM06, metres), which is exactly the case
 * where a BARE `EPSG:4326` bbox is silently accepted and returns ZERO features — the documented
 * Córdoba/Murcia gotcha. The bbox therefore carries the explicit `urn:ogc:def:crs:EPSG::4326`
 * AUTHORITY form (lat/lon axis order), which GeoServer honours, and `srsName=EPSG:4326` asks for
 * WGS84 degrees back (probed: real degrees are returned even though GetCapabilities advertises only
 * 3763). A silently-empty answer here is the single most likely way this wire looks fine and is
 * wrong, so it is pinned by `euCadastreProxy.test.ts`.
 */
function ptUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=inspire:cadastralparcel&srsName=EPSG:4326' +
        `&count=20&outputFormat=application/json&bbox=${encodeURIComponent(bbox)}`;
}

/**
 * SAN FRANCISCO — DataSF assessor parcels (Socrata `acdm-wktn`). VERIFIED-LIVE 2026-07-31: a SoQL
 * spatial point query returns the lot under the click (blklot 3584032 @ 3976 19th St). Socrata is
 * already WGS84, so there is no CRS/axis trap here — the trap is the COLUMN NAME (`shape`).
 */
function sfUrl(lat, lon) {
    const qs = new URLSearchParams({
        $where: `intersects(shape, 'POINT (${lon} ${lat})')`,
        $limit: '20',
    });
    return `https://data.sfgov.org/resource/acdm-wktn.json?${qs.toString()}`;
}

/**
 * CHICAGO — Cook County parcels (Socrata `77tz-riq7` on datacatalog.cookcountyil.gov).
 * VERIFIED-LIVE 2026-07-31. ⚠ This deliberately does NOT use the endpoint the Chicago provider
 * documents (`gis.cookcountyil.gov/traditional/.../MapServer/44/query`): that host does not respond
 * at all from our environment (connection timeout on both it and the gis12 alternate), so wiring it
 * would have produced a permanently unreachable route. Socrata is already WGS84 (`the_geom`).
 */
function chiUrl(lat, lon) {
    const qs = new URLSearchParams({
        $where: `intersects(the_geom, 'POINT (${lon} ${lat})')`,
        $limit: '20',
    });
    return `https://datacatalog.cookcountyil.gov/resource/77tz-riq7.json?${qs.toString()}`;
}

/**
 * ESTONIA — Maa-amet (Maa- ja Ruumiamet) public GeoServer, `kataster:ky_kehtiv` (valid cadastral
 * units). Endpoint + layer + the lat,lon urn-ordered WGS84 bbox entry are the shapes the EE
 * adapter pinned (`countryAdapters/ee/eeWfsClient.ts` measured facts 1–3); the ONE difference is
 * `srsName=EPSG:4326`, which the adapter's header records as honoured and which was MEASURED
 * live 2026-09-02 at Tallinn: GeoJSON output in [lon,lat] degrees (first vertex
 * [24.7539…, 59.4366…]), tunnus 78401:114:0086 in the candidate set. The urn AUTHORITY bbox form
 * matters here exactly as it does for PT: the layer's native CRS is projected (L-EST97 /
 * EPSG:3301), the case where a bare `EPSG:4326` bbox is silently accepted and returns zero.
 */
function eeUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://gsavalik.envir.ee/geoserver/kataster/ows?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=kataster:ky_kehtiv&srsName=EPSG:4326' +
        `&count=20&outputFormat=application/json&bbox=${encodeURIComponent(bbox)}`;
}

/**
 * LITHUANIA — Registrų centras NTR parcels, republished keylessly by Statistics Lithuania
 * (`ntr_sklypai/FeatureServer/0`, ArcGIS REST 11.1). Endpoint, point-intersect params and the
 * explicit `outFields` mirror the LT adapter (`countryAdapters/lt/ltParcelProvider.ts` /
 * `ltArcgisClient.ts` — never `*`: an added upstream column must be a deliberate change). TWO
 * differences from the adapter, both measured live 2026-09-02 (Žvėrynas → 0101/0039:1406):
 * `outSR=4326` (the adapter keeps native LKS-94 for measurement; the browser needs WGS84 — the
 * service reprojects server-side) and GET instead of POST (the adapter POSTs because a parcel
 * RING does not fit a URL; a point geometry does, and fetchTextOnce is GET-only).
 */
const LT_PROXY_OUT_FIELDS =
    'unikalus_nr,kadastro_nr,pask_tipas_pavad,sav_pavad,sen_pavad,skl_plotas,pastat_sk';
function ltUrl(lat, lon) {
    const qs = new URLSearchParams({
        f: 'json',
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: '4326',
        outSR: '4326',
        outFields: LT_PROXY_OUT_FIELDS,
        returnGeometry: 'true',
    });
    return `https://osp-sdg.stat.gov.lt/arcgis/rest/services/ntr_sklypai/FeatureServer/0/query?${qs.toString()}`;
}

/**
 * POLAND — GUGiK ULDK `GetParcelByXY`, the keyless national parcel locator. Request shape mirrors
 * the PL adapter (`countryAdapters/pl/plUldkClient.ts`): ⚠ `xy=` is LONGITUDE FIRST (measured
 * fact 2 — the swapped pair answers `-1 brak wyników` SILENTLY), and `result=` fixes the field
 * order the positional parse depends on. The ONE difference is `srid=4326`, MEASURED live
 * 2026-09-02 at Suwałki: the same record serves `SRID=4326;POLYGON((lon lat …))` degrees instead
 * of the adapter's native `SRID=2180` metres (206301_1.0005.11523/3 both ways).
 */
const PL_ULDK_RESULT_FIELDS = 'id,voivodeship,county,commune,region,parcel,geom_wkt';
function plUrl(lat, lon) {
    return 'https://uldk.gugik.gov.pl/?request=GetParcelByXY' +
        `&xy=${lon},${lat},4326` +
        `&result=${PL_ULDK_RESULT_FIELDS}&srid=4326`;
}

function jsonProp(props, ...keys) {
    for (const k of keys) {
        const v = props?.[k];
        if (v !== undefined && v !== null && String(v).length > 0) return v;
    }
    return null;
}

/** @typedef {{ guard:(lat:number,lon:number)=>boolean, url:(lat:number,lon:number)=>string, format:'geojson'|'gml'|'esrijson'|'socrata'|'arcgis'|'uldk', axis?:'lonlat'|'latlon', source:string, normalise:(c:any)=>{refcat:string,areaM2:number,address:string|null} }} SourceCfg */

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
    // CH — Amtliche Vermessung *Grundstück* via geo.admin.ch identify (Esri JSON). The identify
    // attributes carry no area field, so area is derived from the (full, real) parcel ring, exactly
    // like Norway's teig. refcat = the federal EGRID (the stable pan-Swiss id); the info-card address
    // is "<canton> <local parcel no.>". Guard = the Swiss national bbox (+ Liechtenstein, which the
    // federal service also serves). See switzerlandBbox.ts / registry.ts CH row.
    ch: {
        guard: (lat, lon) => lat >= 45.75 && lat <= 47.85 && lon >= 5.9 && lon <= 10.55,
        url: chUrl,
        format: 'esrijson',
        source: 'swisstopo-av',
        normalise: (c) => {
            const p = c.props || {};
            const egrid = String(jsonProp(p, 'egris_egrid') ?? '').trim();
            const number = String(jsonProp(p, 'number') ?? '').trim();
            const ak = String(jsonProp(p, 'ak') ?? '').trim();
            const refcat = egrid || number; // prefer the federal EGRID; fall back to the local no.
            const address = [ak, number].filter(Boolean).join(' ') || null;
            return { refcat, areaM2: ringAreaM2(c.ring), address };
        },
    },
    // ── L-651 Phase-5: the three formerly-inert providers whose upstream LIVE-PROBED clean ────────
    // (Brussels / Wallonia / Scotland are deliberately absent — their upstreams do not answer, so
    // they are registered as footprint-fallbacks in registry.ts rather than as dead routes here. An
    // unknown `cc` 404s, which is the honest "no route" answer, not a silent empty parcel.)
    pt: {
        guard: (lat, lon) => lat >= 36.9 && lat <= 42.2 && lon >= -9.6 && lon <= -6.1,
        url: ptUrl,
        format: 'geojson',
        source: 'dgt-cadastro-predial',
        normalise: (c) => {
            const p = c.props || {};
            // `label` is the human NIC ("AAA 001 318 684"); `nationalcadastralreference` is the
            // compact key; `inspireid` (PT.DGT.CP.…) is the stable INSPIRE id. Prefer the national
            // reference, fall back to the INSPIRE id — never invent one.
            const refcat = String(
                jsonProp(p, 'nationalcadastralreference', 'inspireid', 'label') ?? '',
            ).trim();
            // `areavalue` is the registry-declared area in m²; fall back to the ring shoelace.
            const areaM2 = Number(jsonProp(p, 'areavalue')) || ringAreaM2(c.ring);
            const admin = jsonProp(p, 'administrativeunit');
            return { refcat, areaM2, address: admin ? String(admin) : null };
        },
    },
    'us-sf': {
        guard: (lat, lon) => lat >= 37.7 && lat <= 37.84 && lon >= -122.53 && lon <= -122.35,
        url: sfUrl,
        format: 'socrata',
        source: 'sf-datasf',
        normalise: (c) => {
            const p = c.props || {};
            const refcat = String(jsonProp(p, 'blklot', 'mapblklot') ?? '').trim();
            // The DataSF area field has ambiguous units, so area is ALWAYS geometry-derived here —
            // a geometry fact rather than a guessed unit conversion.
            const street = [
                jsonProp(p, 'from_address_num'),
                jsonProp(p, 'street_name'),
                jsonProp(p, 'street_type'),
            ].filter(Boolean).join(' ');
            return { refcat, areaM2: ringAreaM2(c.ring), address: street || null };
        },
    },
    'us-chi': {
        guard: (lat, lon) => lat >= 41.6 && lat <= 42.1 && lon >= -87.95 && lon <= -87.5,
        url: chiUrl,
        format: 'socrata',
        source: 'chicago-cook',
        normalise: (c) => {
            const p = c.props || {};
            const refcat = String(jsonProp(p, 'pin10', 'pin14', 'pin') ?? '').trim();
            const muni = jsonProp(p, 'municipality');
            return { refcat, areaM2: ringAreaM2(c.ring), address: muni ? String(muni) : null };
        },
    },
    // ── Lane PROXY-EE-LT-PL (2026-09-02): the E9 registration wave's named residual. The three
    // registry rows routed correctly and their adapters were LIVE-PROVEN, but a production click
    // resolved null HERE and fell to the OSM footprint. `source` values are the registry rows'
    // providerIds (one spelling per source, C84 EI-9), NOT new short names.
    ee: {
        guard: (lat, lon) => lat >= 57.5 && lat <= 59.8 && lon >= 21.5 && lon <= 28.3,
        url: eeUrl,
        format: 'geojson',
        source: 'ee-maaamet-kataster',
        normalise: (c) => {
            const p = c.props || {};
            // `tunnus` is the cadastral id (78401:114:0086 @ Tallinn, measured); `pindala` is the
            // cadastre's own registered m² — never derived when served.
            const refcat = String(jsonProp(p, 'tunnus') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'pindala')) || ringAreaM2(c.ring);
            const address = jsonProp(p, 'l_aadress');
            return { refcat, areaM2, address: address ? String(address) : null };
        },
    },
    lt: {
        guard: (lat, lon) => lat >= 53.85 && lat <= 56.5 && lon >= 20.9 && lon <= 26.9,
        url: ltUrl,
        format: 'arcgis',
        source: 'lt-rc-ntr-parcels-featureserver',
        normalise: (c) => {
            const p = c.props || {};
            // `kadastro_nr` is the national parcel id (0101/0039:1406 @ Vilnius, measured);
            // `unikalus_nr` is the fallback NTR code. ⚠ `skl_plotas` is HECTARES, not m² — the
            // ×10 000 here is the LT adapter's one unit transform, mirrored (ltParcelProvider.ts).
            const refcat = String(jsonProp(p, 'kadastro_nr', 'unikalus_nr') ?? '').trim();
            const ha = Number(jsonProp(p, 'skl_plotas'));
            const areaM2 = Number.isFinite(ha) && ha > 0 ? ha * 10_000 : ringAreaM2(c.ring);
            // Municipality/eldership are honest nulls on many parcels (measured fill caveat).
            const address = jsonProp(p, 'sav_pavad', 'sen_pavad');
            return { refcat, areaM2, address: address ? String(address) : null };
        },
    },
    pl: {
        guard: (lat, lon) => lat >= 49.0 && lat <= 54.9 && lon >= 14.1 && lon <= 24.2,
        url: plUrl,
        format: 'uldk',
        source: 'pl-gugik-uldk',
        normalise: (c) => {
            const p = c.props || {};
            // The TERYT-based national id (206301_1.0005.11523/3 @ Suwałki, measured). ULDK
            // serves no area field → geometry-derived, like NO and CH.
            const refcat = String(jsonProp(p, 'id') ?? '').trim();
            const address = jsonProp(p, 'commune');
            return { refcat, areaM2: ringAreaM2(c.ring), address: address ? String(address) : null };
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
    return (await resolveEuParcelOutcome(cc, lon, lat, deps)).parcel;
}

/**
 * §CONTEXT-DATA-HONESTY (L-422/457/467/469) — the same resolution as `fetchEuParcelAtPoint`, but
 * keeping the two states that a bare `parcel | null` COLLAPSES:
 *
 *   • `outcome: 'unreachable'` — the upstream cadastre did not answer (network failure, timeout,
 *     non-OK status, empty body). We do NOT know whether a parcel exists here.
 *   • `outcome: 'empty'`       — the cadastre ANSWERED and published nothing at this point. This is
 *     a real, authoritative "no parcel here".
 *   • `outcome: 'ok'`          — a parcel was resolved.
 *
 * Before this split, an outage and a genuine coverage gap both returned `null`, so a cadastre
 * falling over degraded silently into "this country has no parcels" and the client dropped to the
 * OSM footprint without ever learning the authoritative source had failed — exactly the bug family
 * this repo keeps re-encountering. `fetchEuParcelAtPoint` keeps its old signature for existing
 * callers; new callers should prefer this.
 *
 * @returns {Promise<{ outcome:'ok'|'empty'|'unreachable'|'unknown-source'|'bad-input'|'out-of-area', parcel: object|null }>}
 */
export async function resolveEuParcelOutcome(cc, lon, lat, deps = {}) {
    const cfg = EU_CADASTRE_SOURCES[cc];
    if (!cfg) return { outcome: 'unknown-source', parcel: null };
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { outcome: 'bad-input', parcel: null };
    // Outside the source's own territory: an authoritative "not covered", NOT a failure.
    if (!cfg.guard(lat, lon)) return { outcome: 'out-of-area', parcel: null };

    const text = await fetchTextOnce(cfg.url(lat, lon), deps);
    // A null body means the upstream never answered — the ONE case that must not read as "empty".
    if (!text) return { outcome: 'unreachable', parcel: null };

    // §CONTEXT-DATA-HONESTY pre-checks for the two formats whose FAILURE arrives as an HTTP-200
    // body that would otherwise parse to zero candidates and masquerade as `empty`:
    //   • ArcGIS (LT): HTTP 200 + `{ "error": {...} }` on a bad request (measured fact 3 of the
    //     LT adapter) — a failure, never an authoritative "no parcel here".
    //   • ULDK (PL): the status is the FIRST TOKEN OF THE BODY; only `-1 brak wyników` is a real
    //     absence, everything else non-`0` is the service failing (measured fact 1 of the PL adapter).
    let uldkRecords = null;
    if (cfg.format === 'arcgis') {
        const err = arcgisErrorDetail(text);
        if (err !== null) {
            console.warn(`[eu-cadastre] upstream error body (${cc}): ${err}`);
            return { outcome: 'unreachable', parcel: null };
        }
    } else if (cfg.format === 'uldk') {
        const cls = classifyUldkBody(text);
        if (cls.kind === 'error') {
            console.warn(`[eu-cadastre] upstream error body (${cc}): ${cls.detail}`);
            return { outcome: 'unreachable', parcel: null };
        }
        if (cls.kind === 'empty') return { outcome: 'empty', parcel: null };
        uldkRecords = cls.records;
    }

    const candidates = cfg.format === 'geojson'
        ? parseGeoJsonCandidates(text)
        : cfg.format === 'esrijson'
            ? parseEsriJsonCandidates(text)
            : cfg.format === 'arcgis'
                ? parseArcgisCandidates(text)
                : cfg.format === 'uldk'
                    ? parseUldkCandidates(uldkRecords ?? [])
                    : cfg.format === 'socrata'
                        ? parseSocrataCandidates(text)
                        : parseGmlCandidates(text, cfg.axis);
    const chosen = pickCandidate(candidates, lat, lon);
    if (!chosen) return { outcome: 'empty', parcel: null };

    const meta = cfg.normalise(chosen);
    // A feature with geometry but no usable identifier is not a parcel we can cite — treat it as an
    // authoritative empty rather than an outage (the source DID answer).
    if (!meta.refcat) return { outcome: 'empty', parcel: null };
    const result = {
        ring: chosen.ring,
        refcat: meta.refcat,
        areaM2: Number.isFinite(meta.areaM2) && meta.areaM2 > 0 ? meta.areaM2 : ringAreaM2(chosen.ring),
        address: meta.address,
    };
    cacheSet(`${cc}:${meta.refcat}`, result);
    return { outcome: 'ok', parcel: result };
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
        let outcome = 'unreachable';
        let parcel = null;
        try {
            ({ outcome, parcel } = await resolveEuParcelOutcome(cc, lon, lat, deps));
        } catch (err) {
            console.warn(`[eu-cadastre] unexpected error (${cc}):`, err?.message ?? err);
            outcome = 'unreachable';
            parcel = null;
        }

        setProxyCacheHeaders(res);
        if (!parcel) {
            // §CONTEXT-DATA-HONESTY: `parcel: null` is kept for back-compat, but `outcome` now says
            // WHY it is null, so a caller can tell "this cadastre is down" from "this cadastre says
            // there is nothing here". An unreachable answer is NOT cached and is not revalidated as
            // though it were a real empty.
            if (outcome === 'unreachable') res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Cadastre-Cache', 'MISS-EMPTY');
            res.setHeader('X-Cadastre-Outcome', outcome);
            return res.status(200).json({ parcel: null, outcome });
        }
        res.setHeader('X-Cadastre-Cache', 'HIT-OR-FETCH');
        res.setHeader('X-Cadastre-Outcome', 'ok');
        return res.status(200).json({ parcel: { ...parcel, source: cfg.source }, outcome: 'ok' });
    };
}

/** The default production handler (real `fetch`, real endpoints). */
export const euParcelHandler = makeEuParcelHandler();
