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
 *   • LU  wms.inspire.geoportail.lu/geoserver/wfs cp:CP.CadastralParcel (ACT) (GeoJSON, lon,lat) — 2026-09-03
 *   • AU-NSW portal.spatial.nsw.gov.au NSW_Land_Parcel_Property_Theme/8      (ArcGIS JSON, lon,lat) — 2026-09-03
 *   • AU-VIC opendata.maps.vic.gov.au WFS open-data-platform:v_parcel_mp     (GeoJSON, lon,lat) — 2026-09-03
 *   • AU-QLD spatial-gis.information.qld.gov.au LandParcelPropertyFramework/4 (ArcGIS JSON, lon,lat) — 2026-09-03
 *   • AU-SA  lsa2.geohub.sa.gov.au SAPPA/PropertyPlanningAtlasV19/41 (Referer!) (ArcGIS JSON, lon,lat) — 2026-09-03
 *   • AU-TAS services.thelist.tas.gov.au Public/CadastreParcels/0            (ArcGIS JSON, lon,lat) — 2026-09-03
 *   • AU-ACT services1.arcgis.com ACTGOV_BLOCKS/0 (lifecycle-filtered)       (ArcGIS JSON, lon,lat) — 2026-09-03
 *   • TR  cbsapi.tkgm.gov.tr megsiswebapi.v3 parsel/{lat}/{lon}              (GeoJSON Feature, lon,lat) — 2026-09-02
 *   • QA  services.gisqatar.org.qa Vector/CadastrePlots/0                    (ArcGIS JSON, lon,lat) — 2026-09-02
 *   • LV  geolatvija.lv/geoserver/vraa/wfs vraa:parcel                       (GeoJSON, lon,lat) — 2026-09-03
 *   • HR  api.uredjenazemlja.hr cp_wms:CP.CadastralParcel                    (GeoJSON, lon,lat) — 2026-09-03
 *   • GR  services-eu1.arcgis.com GEOTEMAXIA_LEITOURGOUN_ON_gdb/0            (ArcGIS JSON, lon,lat) — 2026-09-03
 *   • SI  ipi.eprostor.gov.si wfs-si-gurs-kn SI.GURS.KN:PARCELE              (GeoJSON, lon,lat) — 2026-09-03
 *   • SK  kataster.skgeodesy.sk VRM/kn/MapServer/9 (⛔ no where= — WAF 403)   (ArcGIS JSON, lon,lat) — 2026-09-03
 *
 * LANE PROXY-LEGS (2026-09-03) wired the AU/TR/QA/LV/HR/GR/SI/SK block above from the adapter
 * waves' live-proven channels (audit/intl-parcels/2026-09-02/lane-{au,me}-open.md,
 * audit/europe-adapters-2/2026-09-02/lane-{lv,hr,gr,si,sk}.md). Each leg mirrors the request shape
 * its package adapter measured (packages/site-parcel-data/src/countryAdapters/<cc>/) with the ONE
 * proxy-side difference where noted: WGS84 output for the browser ring (the adapters keep native
 * CRS for measurement — E1a discipline). Three legs carry a per-source quirk the table row shape
 * grew a field for:
 *   • AU-SA `headers` — a soft CloudFront WAF Referer rule (403 bare / 200 with
 *     Referer https://sappa.plan.sa.gov.au/, control transcript live-sa-noreferer.txt). A public
 *     documented value, NOT a secret.
 *   • TR `semantic404` — TKGM answers a no-parcel point HTTP 404 `{"Message":"Parsel Bulunamadı…"}`
 *     — a durable ABSENCE, not an outage; without the flag the 404 would read `unreachable`
 *     (failure≠absence, §CONTEXT-DATA-HONESTY inverted).
 *   • AU-QLD / AU-ACT `select` — candidate pre-filtering BEFORE pickCandidate: QLD serves an
 *     "Unlinked parcel or interest" twin with null lotplan; ACT serves RETIRED (superseded) block
 *     shapes overlapping the CURRENT/APPROVED one. Point-in-polygon alone would happily pick those.
 *
 * ⚠ IL (Israel) is DELIBERATELY NOT WIRED despite a live-proven channel: govmap `IdentifyByXY`
 * serves NO parcel ring — only centroid + extent (measured, countryAdapters/il/ilParcelProvider.ts
 * header: "The parcel POLYGON is NOT in the identify body … never fabricated here"). This proxy's
 * contract is a real boundary ring; serving the extent RECTANGLE as the parcel would be the L-616
 * overstatement family. The ring query (SDE.PARCEL_ALL by objectId) is the IL lane's recorded
 * follow-up — wire `il` here only once that channel is live-proven. Until then the IL registry row
 * self-corrects to the OSM footprint on this route's 404, which is the honest answer.
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
    // TKGM (TR) answers a BARE GeoJSON `Feature`, not a FeatureCollection (measured 2026-09-02,
    // trTkgmClient.ts fact 2) — accepted here as a one-element collection.
    const feats = Array.isArray(json?.features)
        ? json.features
        : json?.type === 'Feature' ? [json] : [];
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

/**
 * Read an ATTRIBUTE off a GML element, e.g. `xlink:title` on `<cp:administrativeUnit xlink:title="Praha" …/>`.
 * ⛔ `gmlText` above reads element TEXT and returns null for an EMPTY (self-closing) element, which is
 * exactly the shape INSPIRE uses for xlink associations — so reading a municipality name with
 * `gmlText` silently yields nothing while the name is sitting right there in the markup. CZ needs
 * this; do not "simplify" it back to gmlText.
 */
function gmlAttr(block, tag, attr) {
    // String.raw, not a plain quoted string: in a normal JS string literal `\w` collapses to `w`
    // and `\b` becomes a BACKSPACE character, so the pattern would silently stop matching namespaced
    // tags — a parser that returns null for every field while looking perfectly well-formed.
    const pat = String.raw`<(?:[\w.-]+:)?` + tag + String.raw`\b[^>]*?\b(?:[\w.-]+:)?` + attr
        + String.raw`\s*=\s*"([^"]*)"`;
    const m = block.match(new RegExp(pat, 'i'));
    return m && m[1] ? m[1].trim() : null;
}

/**
 * EPSG:3857 (Web Mercator, metres) → WGS84 degrees. Needed by AT, whose only queryable channel is a
 * GeoServer WMS GetFeatureInfo, and whose GeoJSON therefore comes back in whatever CRS was ASKED for.
 * ⛔ WE MUST ASK FOR 3857, NOT 4326 — that GeoServer's `numDecimals` is 3, so a 4326 answer is
 * rounded to THREE DECIMAL DEGREES (~110 m) and the ring collapses into a handful of repeated points
 * (measured at Stephansplatz: `[16.373,48.208],[16.373,48.208],[16.373,48.208]…`). In 3857 the same
 * three decimals are MILLIMETRES, so the ring is exact and this inverse is loss-free at BIM scale.
 * A silently degenerate boundary is worse than no boundary — it looks like a parcel and is not one.
 */
const WEB_MERCATOR_R = 6378137;
function webMercatorToWgs84(x, y) {
    const lon = (x / WEB_MERCATOR_R) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / WEB_MERCATOR_R)) - Math.PI / 2) * (180 / Math.PI);
    return { lat, lon };
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
 * LUXEMBOURG — ACT / INSPIRE Cadastral Parcels on the geoportail.lu INSPIRE GeoServer. Keyless
 * WFS 2.0, PROBED LIVE 2026-09-03 (founder click 49.61195,6.12926 → national_cadastral_reference
 * 075F00137000000; Esch-sur-Alzette 49.496,5.981 → 039A00606016640). Endpoint / layer / axis
 * mirror the LU package adapter (`countryAdapters/lu/luParcelProvider.ts`). TWO LU-specific
 * measured facts, both pinned by server/__tests__/euCadastreProxy.test.ts (the LU pins live
 * there; a luParcelProxy.test.ts never existed — citation drift fixed 2026-09-03, lane
 * BOUNDARY-WAVE, flagged by lane PROXY-LEGS deltas §5):
 *   • the urn AUTHORITY bbox is required — a CQL INTERSECTS reads the SRID-less literal in the
 *     layer's native EPSG:2169 and returns 0; the projected native CRS is also the bare-`EPSG:4326`
 *     silent-empty trap (the PT/EE gotcha), so the bbox carries urn:ogc:def:crs:EPSG::4326.
 *   • LU parcels are DENSE, so the window is DELIBERATELY SMALL (`LU_HALF_DEG` ±~11 m, count 30),
 *     NOT the shared `HALF_DEG` ±38 m: a coarse bbox truncates the true container past `count` and
 *     `pickCandidate` then mis-selects a neighbour (measured: features[0] and a coarse box both
 *     return the wrong adjacent parcel). Small window + `pickCandidate`'s point-in-polygon is what
 *     resolves the right dense LU parcel.
 */
const LU_HALF_DEG = 0.0001;
function luUrl(lat, lon) {
    const bbox = `${lat - LU_HALF_DEG},${lon - LU_HALF_DEG},${lat + LU_HALF_DEG},${lon + LU_HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://wms.inspire.geoportail.lu/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=cp:CP.CadastralParcel&srsName=EPSG:4326' +
        `&count=30&outputFormat=application/json&bbox=${encodeURIComponent(bbox)}`;
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

// ── LANE PROXY-LEGS (2026-09-03) — URL builders for the AU/TR/QA/LV/HR/GR/SI/SK wave ─────────────

/**
 * Shared ArcGIS REST point-intersect builder (AU ArcGIS states, GR, SK) — the ltUrl idiom
 * (geometry as an Esri JSON point, inSR/outSR 4326 so the ring arrives in WGS84 degrees), with
 * per-source explicit `outFields` mirroring each adapter's "never `*` — a widened upstream column
 * must be a deliberate change" rule where the adapter declares a list (QA's own adapter uses `*`,
 * so its builder below does too).
 */
function arcgisPointUrl(base, outFields) {
    return (lat, lon) => {
        const qs = new URLSearchParams({
            f: 'json',
            geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
            geometryType: 'esriGeometryPoint',
            spatialRel: 'esriSpatialRelIntersects',
            inSR: '4326',
            outSR: '4326',
            outFields,
            returnGeometry: 'true',
        });
        return `${base}?${qs.toString()}`;
    };
}

// ── LANE PARCEL-REACH (2026-09-03) — URL builders for IT / BG / BE-VLG / GB-ENG ─────────────────
//
// All four registry rows promised `kind:'cadastral'` and 404'd. Each is now live-probed; three of
// the four required CORRECTING a constant the repo already carried, which is why "the adapter
// exists" was never the same claim as "a click resolves".

/**
 * ITALY — Agenzia delle Entrate INSPIRE Cartografia Catastale, `CP:CadastralParcel`.
 * ⚠ TWO MEASURED CORRECTIONS to what the repo carried (both verified 2026-09-03):
 *   1. The host is **wfs.**, not **wms.** — `wms.cartografia…` answers HTTP 500 with a SOAP
 *      `<faultstring>Internal Error (from client)</faultstring>` on EVERY request, including a bare
 *      GET. `agenziaEntrateParcelProvider.ts` carried the wms. spelling with its own open
 *      "⚠ LIVE-PROBE BEFORE PROD: the host subdomain (wms. vs wfs.)" warning. The warning was right.
 *   2. There is NO GeoJSON. `outputFormat=application/json` is refused with
 *      `<ServiceException code="InvalidFormat">Richiesta non valida`; GetCapabilities advertises
 *      only GML. So OUTPUTFORMAT is OMITTED and the response is GML 3.2 — parsed by the existing
 *      `parseGmlCandidates` with `axis:'latlon'`, exactly as DE-NRW already is. No new parser.
 * CRS is EPSG:6706 (RDN2008/ETRS89 geographic) — the layer advertises no 4326 and needs none:
 * ETRS89 and WGS84 differ by centimetres, far below BIM scale. Coordinates are DEGREES, lat first
 * (`<gml:lowerCorner>41.901858 12.495305</gml:lowerCorner>`, measured @ Roma).
 * AP Trento + Bolzano are excluded by the source itself (their own Catasto tavolare / Libro
 * Fondiario) — a Bolzano click returns 0 members, an honest `empty` → footprint.
 */
const IT_URN_6706 = 'urn:ogc:def:crs:EPSG::6706';
function itUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},${IT_URN_6706}`;
    return 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php' +
        '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=CP:CadastralParcel' +
        `&SRSNAME=${encodeURIComponent(IT_URN_6706)}&COUNT=20&BBOX=${encodeURIComponent(bbox)}`;
}

/**
 * BULGARIA — GCCA/AGKK INSPIRE Cadastral Parcels, a keyless ArcGIS MapServer. Server-side
 * point-intersect, so no bbox and no reliance on client-side PIP. Stored EPSG:4258, `outSR=4326`
 * honoured → `[lon,lat]` degrees (measured @ Sofia). ⭐ Unlike most legs this source SERVES a real
 * area (`areavalue`, integer m², with `areavalue_uom:"m2"`), so the official figure is used rather
 * than a geometry estimate.
 */
const BG_PROXY_OUT_FIELDS =
    'nationalcadastralref,id_localid,id_namespace,areavalue,areavalue_uom,label,admunit';
const bgUrl = arcgisPointUrl(
    'https://inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer/0/query',
    BG_PROXY_OUT_FIELDS,
);

/**
 * FLANDERS (BE-VLG) — GRB `ADP` administratieve percelen.
 * ⚠ TWO MEASURED CORRECTIONS (2026-09-03), both of which were open PROBE notes in
 * `flandersGrbParcelProvider.ts` rather than settled facts:
 *   1. `geoservices.informatievlaanderen.be` NO LONGER RESOLVES (DNS ENOTFOUND). The live host is
 *      `geo.api.vlaanderen.be/GRB/wfs`.
 *   2. The typeName is `GRB:ADP` — UPPERCASE. `GRB:Adp` is not a published feature type.
 * The server DOES honour `srsName=EPSG:4326` (native is 31370), returning standard GeoJSON
 * `[lon,lat]` degrees, so the existing `parseGeoJsonCandidates` applies unchanged.
 * FLANDERS ONLY: Brussels (CoBAT/UrbIS) and Wallonia (CoDT/PICC) are different systems and return
 * `features: []` here — the coarse-bbox self-correction to the footprint, measured working.
 */
function beVlgUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://geo.api.vlaanderen.be/GRB/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
        '&TYPENAMES=GRB:ADP&SRSNAME=urn:ogc:def:crs:EPSG::4326' +
        `&COUNT=20&OUTPUTFORMAT=${encodeURIComponent('application/json')}&BBOX=${encodeURIComponent(bbox)}`;
}

/**
 * ENGLAND (GB-ENG) — HM Land Registry INSPIRE Index Polygons, served as a keyless WGS84 POINT
 * QUERY by MHCLG's Planning Data platform.
 * ⛔ HMLR's OWN endpoints CANNOT serve this and must not be resurrected (all measured 2026-09-03):
 * `use-land-property.service.gov.uk` (the host `gbOsInspireParcelProvider.ts` names) does not
 * resolve — DNS ENOTFOUND; the correctly-spelled `use-land-property-data…` is a Cloudflare-
 * challenged, cookie-gated per-LPA bulk DOWNLOAD page, not a query service; and
 * `inspire.landregistry.gov.uk/inspire/ows` answers `Service WFS is disabled` while its WMS layer
 * is `queryable="0"` so every GetFeatureInfo returns `LayerNotQueryable`. The platform below
 * re-publishes the SAME polygons under OGL v3 with a working point query.
 * ⚠ THESE ARE OWNERSHIP EXTENTS WITH GENERAL BOUNDARIES (s.60 LRA 2002) — an INDEX of registered
 * title, NOT a survey cadastre. Confidence stays capped MEDIUM (`generalBoundary: true`); this leg
 * changes the CHANNEL, never that honesty cap.
 * ⚠ ENGLAND ONLY — measured, not assumed: Cardiff and Swansea return ZERO features while Oxford
 * (4954), Manchester (3617) and Leeds (2191) are dense. So a Welsh/Scottish/NI click is an honest
 * `empty` → footprint, and no GB-WLS claim may be derived from this row.
 * Unregistered land (roads, public realm) genuinely has no polygon — a frequent, honest `empty`.
 * ATTRIBUTION (required, OGL v3): "This information is subject to Crown copyright and database
 * rights 2026 and is reproduced with the permission of HM Land Registry. The polygons … are
 * subject to Crown copyright and database rights 2026 Ordnance Survey 100026316."
 */
function gbUrl(lat, lon) {
    const qs = new URLSearchParams({
        dataset: 'title-boundary',
        longitude: String(lon),
        latitude: String(lat),
        limit: '10',
    });
    return `https://www.planning.data.gov.uk/entity.geojson?${qs.toString()}`;
}

// ── LANE PARCEL-REACH (2026-09-04) — GERMANY: 14 of 16 Länder, the largest single gain here ─────
//
// Before this block DE-NW was the ONLY German Land with a keyless cadastre and every other German
// click fell to `DE: footprint-fallback`. `countryBbox.ts` still says so in its NRW comment —
// "every other Land's ALKIS is per-Land licence-gated" — and that turns out to be FALSE for
// fourteen of them. Each host below was probed live 2026-09-04 (GetCapabilities read first, then a
// real GetFeature at the Land's capital) and each returns a real Flurstück ring, keyless.
//
// THREE SCHEMA FAMILIES, and two of them need no new parsing at all:
//   A. INSPIRE `cp:CadastralParcel` (BW HE NI SN SH BB ST MV SL) — nationalCadastralReference /
//      areaValue / label. One new normaliser, shared.
//   B. adv ALKIS-vereinfacht `ave:Flurstueck` (HH RP TH) — byte-identical to the DE-NRW row that has
//      been in production since 2026-07-24: flstkennz / flaeche / gemarkung.
//   C. Bremen `app:flurstuecke` — the SAME field names under deegree's `app:` prefix. `gmlText`'s
//      pattern is `<(?:[\w.-]+:)?TAG`, i.e. prefix-agnostic, so family B's normaliser covers it
//      unchanged. Berlin is the one true one-off (GeoJSON).
//
// ⛔ BAYERN IS NOT HERE, AND THAT IS A MEASURED REFUSAL, NOT AN OMISSION. Its INSPIRE ALKIS WFS
// answers `HTTP/1.1 401 Unauthorized` with `WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"`
// (so does the legacy ogc_alkis_ave.cgi), and Bayern's whole open-data catalogue was enumerated
// rather than guessed at — geodaten.bayern.de/opengeodata/json/opengeodata_produkte.json, 35
// products — whose only ALKIS entries are raster: the Parzellarkarte record states
// `"abgabe_datenformate": ["PNG","JPEG"]` and "keine Flurstücksnummern", and its WMS advertises
// every layer `queryable="0"` with NO GetFeatureInfo element at all. Bayern stays on the OSM
// footprint until credentials are procured from the LDBV. A refusal naming the reason beats a
// footprint silently labelled a parcel.

/** Family A — INSPIRE `cp:CadastralParcel`, lat-first GML, one urn CRS per Land. */
function deCpUrl(base, urn) {
    return (lat, lon) => {
        const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},${urn}`;
        return `${base}${base.includes('?') ? '&' : '?'}SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
            `&TYPENAMES=cp:CadastralParcel&SRSNAME=${encodeURIComponent(urn)}` +
            `&COUNT=20&BBOX=${encodeURIComponent(bbox)}`;
    };
}

/** Family B/C — adv ALKIS-vereinfacht `ave:Flurstueck` (and Bremen's `app:flurstuecke` twin). */
function deAveUrl(base, typeName) {
    return (lat, lon) => {
        const urn = 'urn:ogc:def:crs:EPSG::4326';
        const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},${urn}`;
        return `${base}${base.includes('?') ? '&' : '?'}SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
            `&TYPENAMES=${encodeURIComponent(typeName)}&SRSNAME=${encodeURIComponent(urn)}` +
            `&COUNT=20&BBOX=${encodeURIComponent(bbox)}`;
    };
}

/**
 * WGS84 → UTM zone 32N (EPSG:25832), metres. Needed ONLY by Thüringen, whose WFS is the most
 * dangerous leg in this block: a DEGREE bbox (either the urn or the short CRS spelling) returns a
 * clean `HTTP 200 numberMatched="0"` — a SILENT EMPTY, not an error — so a wrong bbox CRS there
 * reads as "no parcel here" forever. The bbox must be in 25832 metres; SRSNAME may still ask for
 * 4326 output, which is what the leg does.
 * VERIFIED against the service's OWN answer, not against a formula: the parcel Thüringen returned
 * for the box 643060..643130 / 5648830..5648900 has vertex (50.97346115, 11.03859290), and this
 * function maps it to (643122.6, 5648852.0) — inside that box. Central-meridian control: (52N, 9E)
 * → easting exactly 500000.0.
 */
function wgs84ToUtm32n(lat, lon) {
    const a = 6378137.0, f = 1 / 298.257223563, k0 = 0.9996, lon0 = (9.0 * Math.PI) / 180;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
    const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = (l - lon0) * Math.cos(p);
    const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
        - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
        + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
        - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
    const x = k0 * N * (A + ((1 - T + C) * A ** 3) / 6
        + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
    const y = k0 * (M + N * Math.tan(p) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24
        + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
    return { x, y };
}

const TH_HALF_M = 40; // ±40 m in 25832 metres — the degree HALF_DEG is meaningless for this leg
function deThUrl(lat, lon) {
    const { x, y } = wgs84ToUtm32n(lat, lon);
    const bbox = `${x - TH_HALF_M},${y - TH_HALF_M},${x + TH_HALF_M},${y + TH_HALF_M},urn:ogc:def:crs:EPSG::25832`;
    return 'https://www.geoproxy.geoportal-th.de/geoproxy/services/adv_alkis_v2_wfs' +
        '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ave:Flurstueck' +
        '&SRSNAME=urn:ogc:def:crs:EPSG::4326' +
        `&COUNT=20&BBOX=${encodeURIComponent(bbox)}`;
}

/**
 * BERLIN — the one true one-off: a GeoJSON WFS (`alkis_flurstuecke:flurstuecke`), fields
 * `fsko` / `afl` / `namgmk`. ⚠ Its bbox must be the LON-FIRST short form `…,EPSG:4326`; the
 * urn-ordered lat,lon form every other leg here uses returns `numberMatched:0` (measured — another
 * silent empty). Native CRS is 25833, but `SRSNAME=EPSG:4326` is honoured and output is standard
 * GeoJSON `[lon,lat]`, so `parseGeoJsonCandidates` applies unchanged.
 */
function deBeUrl(lat, lon) {
    const bbox = `${lon - HALF_DEG},${lat - HALF_DEG},${lon + HALF_DEG},${lat + HALF_DEG},EPSG:4326`;
    return 'https://gdi.berlin.de/services/wfs/alkis_flurstuecke' +
        '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=alkis_flurstuecke:flurstuecke' +
        '&SRSNAME=EPSG:4326&COUNT=20&OUTPUTFORMAT=' + encodeURIComponent('application/json') +
        `&BBOX=${encodeURIComponent(bbox)}`;
}

/**
 * Family A normaliser — INSPIRE cp:CadastralParcel. `areaValue` carries an official figure with a
 * `uom` attribute; the uom is ASSERTED, never assumed (a hectare read as m² is a 10 000× error).
 * `label` is the human parcel number ("660/1"), `nationalCadastralReference` the full ALKIS key.
 */
function deCpNormalise(c) {
    const b = c.block || '';
    const refcat = (gmlText(b, 'NATIONALCADASTRALREFERENCE') ?? '').replace(/_+$/, '').trim();
    const uom = (gmlAttr(b, 'areaValue', 'uom') ?? '').toLowerCase();
    const served = Number(gmlText(b, 'AREAVALUE'));
    const areaM2 = uom === 'm2' && Number.isFinite(served) && served > 0 ? served : ringAreaM2(c.ring);
    const label = gmlText(b, 'LABEL');
    return { refcat, areaM2, address: label ? String(label) : null };
}

/** Family B/C normaliser — adv ALKIS-vereinfacht. Identical to the DE-NRW row, deliberately. */
function deAveNormalise(c) {
    const b = c.block || '';
    const refcat = (gmlText(b, 'flstkennz') ?? '').replace(/_+$/, '').trim();
    const areaM2 = Number(gmlText(b, 'flaeche')) || ringAreaM2(c.ring);
    return { refcat, areaM2, address: gmlText(b, 'gemarkung') ?? null };
}

// ── LANE PARCEL-REACH (2026-09-04) — URL builders for CZ / IE / AT ──────────────────────────────
//
// Three countries that had NO REGISTRY ROW AT ALL — not a footprint row, not a deferral, nothing.
// That is worse than an unwired row, because `resolveParcelCandidates` then either returns NOTHING
// (Brno, Ostrava, Wien — measured) or hands the point to whichever NEIGHBOUR's rectangle happens to
// cover it (Praha resolved to `DE:footprint-fallback`, and Dublin to `GB-ENG:cadastral`, both
// measured 2026-09-04). A Czech click was being told it was in Germany.

/**
 * CZECHIA — ČÚZK (Český úřad zeměměřický a katastrální) INSPIRE Cadastral Parcels, `cp:CadastralParcel`.
 * Keyless WFS 2.0 (Marushka), live-probed 2026-09-04 at Praha Staré Město.
 *   • `SRSNAME=urn:ogc:def:crs:EPSG::4326` IS honoured — the response geometry carries
 *     `srsName="urn:ogc:def:crs:EPSG::4326"` and the posList is LAT-FIRST
 *     (`50.086623 14.420771` — 50 is the latitude), so `axis:'latlon'`, the DE-NRW/IT idiom.
 *   • GML only. No JSON output format is advertised; `parseGmlCandidates` handles it unchanged.
 *   • Each member is a single `gml:exterior` LinearRing, so the parser's "first posList" rule takes
 *     the exterior — no hole can be mistaken for a boundary.
 * COVERAGE, stated by the service's own Abstract: parcels exist for the territory with a DIGITAL
 * cadastral map, "to the 2026-08-31 it is 99.50% of the Czech territory". The residual 0.5% is an
 * honest `empty` → footprint, not a failure.
 */
function czUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://services.cuzk.cz/wfs/inspire-cp-wfs.asp?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
        '&TYPENAMES=cp:CadastralParcel&SRSNAME=urn:ogc:def:crs:EPSG::4326' +
        `&COUNT=20&BBOX=${encodeURIComponent(bbox)}`;
}

/**
 * IRELAND — Tailte Éireann (the merged OSi / Property Registration Authority) Cadastral Parcels,
 * a keyless ArcGIS Online FeatureServer. Live-probed 2026-09-04 at Dublin and Cork.
 * ⚠ LAYER 12, NOT 0 — `/FeatureServer/0/query` answers
 * `{"error":{"code":400,…,"The requested layer (layerId: 0) was not found."}}`. Freehold is layer 12
 * of `Cadastral_Parcels_Freehold`; LEASEHOLD is a SEPARATE SERVICE at layer 13.
 * ⚠ IRISH COVERAGE IS TITLE-BASED, NOT AN EXHAUSTIVE TESSELLATION — unlike CZ/AT/ES, streets,
 * commonage and unregistered land carry NO polygon, so `features: []` is the NORMAL and TRUE answer
 * on a road (measured: O'Connell St and Cork city centre both return zero while parcels a few
 * metres away are dense). That empty must stay an honest `empty` → footprint; it is not an outage.
 * `outSR=4326` → standard GeoJSON `[lon,lat]` at full precision, so `parseGeoJsonCandidates` applies
 * unchanged.
 */
const IE_OUT_FIELDS = 'OBJECTID,SP_ID,COUNTY_NAM,Shape__Area,Shape__Length';
function ieUrl(lat, lon) {
    const qs = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: IE_OUT_FIELDS,
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson',
    });
    return 'https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/ArcGIS/rest/services/' +
        `Cadastral_Parcels_Freehold/FeatureServer/12/query?${qs.toString()}`;
}

/**
 * AUSTRIA — BEV (Bundesamt für Eich- und Vermessungswesen) INSPIRE Cadastral Parcels.
 * ⛔ THE WFS ROUTES ARE ALL DEAD — probed 2026-09-04, recorded so nobody re-walks them:
 *   • `data.bev.gv.at/geoserver/BEVdataKAT/wfs` → `ServiceUnavailable: Service GeoServer Enterprise
 *     WFS is disabled` (WFS is switched off org-wide on that GeoServer).
 *   • `apps.bev.gv.at/bev.webservice/inspire` answers 200 but advertises only GetCapabilities /
 *     GetWSDL / GetProducts — NO FeatureTypeList and NO GetFeature. It is an INSPIRE pre-defined
 *     DATASET DOWNLOAD service (bulk), not a query service, and declares AccessConstraints
 *     "restricted, copyright, licence".
 *   • `kataster.bev.gv.at/ortho/ows` IS a real WFS 2.0 but carries only elevation + historic-map
 *     types (`inspireEL_ALS_DSM/DTM`, `urmappe:*`) — no cadastral parcel type.
 * So the ONE keyless channel is the WMS's `GetFeatureInfo` with `INFO_FORMAT=application/json`,
 * which returns real GeoJSON rings. A ±50 m box is drawn around the click in Web-Mercator metres and
 * the CENTRE PIXEL of a 101×101 image is queried, which is a point-intersect in all but name.
 * ⛔ SRS MUST BE EPSG:3857, NEVER 4326. That GeoServer's `numDecimals` is 3: a 4326 answer is rounded
 * to three decimal DEGREES (~110 m) and the ring degenerates into repeated identical points
 * (measured at Stephansplatz: `[16.373,48.208],[16.373,48.208],[16.373,48.208]…`). In 3857 three
 * decimals are millimetres, so the ring is exact and `webMercatorToWgs84` is loss-free at BIM scale.
 * A degenerate ring is the worst failure mode available here — it LOOKS like a parcel and is not one.
 */
const AT_HALF_M = 50; // ±50 m around the click, in Web-Mercator metres
function atUrl(lat, lon) {
    const x = (lon * 20037508.34) / 180;
    const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180);
    const qs = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.1.1',
        REQUEST: 'GetFeatureInfo',
        LAYERS: 'CP_CadastralParcel',
        QUERY_LAYERS: 'CP_CadastralParcel',
        SRS: 'EPSG:3857',
        BBOX: `${x - AT_HALF_M},${y - AT_HALF_M},${x + AT_HALF_M},${y + AT_HALF_M}`,
        WIDTH: '101',
        HEIGHT: '101',
        X: '50',
        Y: '50',
        INFO_FORMAT: 'application/json',
        FEATURE_COUNT: '5',
    });
    return `https://data.bev.gv.at/geoserver/INSdataCP/wms?${qs.toString()}`;
}

// ── LANE PARCEL-REACH (2026-09-03) — URL builders for the five missing US legs ───────────────────
//
// Every one is a keyless ArcGIS point-intersect, so `arcgisPointUrl` is reused verbatim. Each
// `outFields` list is explicit and was confirmed field-by-field against the layer's own metadata
// before use — an outField that does not exist on the layer fails the WHOLE query, which is how
// MA's non-existent `TOWN_NAME` would have silently broken Massachusetts.

/** NYC — DCP MapPLUTO tax lots. Layer 0, native 3857, `outSR=4326` → real degrees (measured). */
const usNycUrl = arcgisPointUrl(
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/MAPPLUTO/FeatureServer/0/query',
    'BBL,Borough,Block,Lot,Address,ZoneDist1,ZoneDist2,LandUse,LotArea,BldgArea,NumFloors,YearBuilt,BuiltFAR,ResidFAR,CommFAR,FacilFAR,Version',
);
/** MASSACHUSETTS — MassGIS L3 statewide. ⚠ LAYER 1 (layer 0 is Devens only). Already EPSG:4326. */
const usMaUrl = arcgisPointUrl(
    'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/L3_Parcels_FeatureService_4326/FeatureServer/1/query',
    'LOC_ID,MAP_PAR_ID,SITE_ADDR,CITY,ZIP,USE_CODE,ZONING,LOT_SIZE,LOT_UNITS,FY,TOWN_ID',
);
/** FLORIDA — FDOR statewide cadastral (10.8 M parcels). Native 3086; `outSR=4326` → degrees. */
const usFlUrl = arcgisPointUrl(
    'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query',
    'PARCEL_ID,CO_NO,PHY_ADDR1,PHY_CITY,ASMNT_YR,DOR_UC,LND_SQFOOT,OWN_NAME',
);
/** KING COUNTY, WA — parcels layer. Geometry + PIN only; ROW/easements deliberately excluded. */
const usWaKingUrl = arcgisPointUrl(
    'https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/MapServer/0/query',
    'PIN,MAJOR,MINOR',
);
/** HARRIS COUNTY, TX — HCAD parcels. Native EPSG:2278 (State-Plane feet); `outSR=4326` → degrees. */
const usTxHarrisUrl = arcgisPointUrl(
    'https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query',
    'HCAD_NUM,acct_num,site_str_num,site_str_name,site_str_sfx,site_city,site_zip,tax_year,land_use,state_class,land_sqft',
);

/**
 * AUSTRALIA — six state cadastres (lane AU-OPEN, live-probed 2026-09-03; descriptors mirrored from
 * countryAdapters/au/auStateCadastre.ts AU_STATE_DESCRIPTORS — endpoints, id fields, quirks).
 * Australia has NO national cadastre; cadastre is a STATE competency, hence one leg per state.
 * Area is ALWAYS geometry-derived for AU (the adapter's rule: upstream area fields have ambiguous
 * units — TAS's COMP_AREA is unit-ambiguous, NSW/VIC/QLD/SA/ACT serve none worth trusting).
 */
const AU_SA_REFERER = 'https://sappa.plan.sa.gov.au/'; // documented public value — NOT a secret
const auNswUrl = arcgisPointUrl(
    'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8/query',
    'lotidstring,lotnumber,sectionnumber,planlabel',
);
const auQldUrl = arcgisPointUrl(
    'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4/query',
    'lotplan,lot,plan,tenure,locality',
);
const auSaUrl = arcgisPointUrl(
    'https://lsa2.geohub.sa.gov.au/arcgis/rest/services/SAPPA/PropertyPlanningAtlasV19/MapServer/41/query',
    'parcel_id,plan_t,plan,parcel_t,parcel,title_t,volume,folio',
);
const auTasUrl = arcgisPointUrl(
    'https://services.thelist.tas.gov.au/arcgis/rest/services/Public/CadastreParcels/MapServer/0/query',
    'PID,VOLUME,FOLIO,PROP_ADD,TENURE_TY',
);
const auActUrl = arcgisPointUrl(
    'https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query',
    'BLOCK_NUMBER,SECTION_NUMBER,BLOCK_SECTION,DISTRICT_NAME,VOLUME_FOLIO,CURRENT_LIFECYCLE_STAGE',
);

/**
 * AU-VIC — Vicmap open-data GeoServer WFS (the ONE non-ArcGIS Australian state). ⚠ The CQL
 * INTERSECTS point is **LAT,LON order** — a lon,lat point silently returns 0 features (measured,
 * auSources.ts probe note). `srsName=EPSG:4326` → GeoJSON lon,lat output; geometry column `geom`.
 */
function auVicUrl(lat, lon) {
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'open-data-platform:v_parcel_mp',
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        count: '10',
        cql_filter: `INTERSECTS(geom,POINT(${lat} ${lon}))`, // ⚠ LAT LON — measured
    });
    return `https://opendata.maps.vic.gov.au/geoserver/wfs?${qs.toString()}`;
}

/**
 * TURKEY — TKGM megsiswebapi.v3, the keyless national point→parcel endpoint (lane ME-OPEN,
 * live-probed 2026-09-02: Kadıköy → ada 3106 / parsel 258). Path params are **LAT then LON**
 * (measured, trTkgmClient.ts fact 1). Returns a BARE GeoJSON Feature in WGS84 (fact 2 — handled
 * by parseGeoJsonCandidates). Its no-parcel answer is a SEMANTIC HTTP 404 (fact 3), hence
 * `semantic404: true` on the row.
 */
function trUrl(lat, lon) {
    return `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/${lat}/${lon}`;
}

/**
 * QATAR — MME CadastrePlots ArcGIS MapServer (lane ME-OPEN, live-probed 2026-09-02: Doha →
 * PIN 1010028, 137-vertex WGS84 ring). Mirrors buildQaCadastreQueryUrl verbatim
 * (countryAdapters/qa/qaCadastreClient.ts) — including `outFields=*`, the adapter's own measured
 * shape, and the simple `lon,lat` geometry form it probed with. The layer is HIDDEN from the
 * Vector folder listing (GetCapabilities-is-not-an-inventory) — address it directly.
 */
function qaUrl(lat, lon) {
    const qs = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
    });
    return `https://services.gisqatar.org.qa/server/rest/services/Vector/CadastrePlots/MapServer/0/query?${qs.toString()}`;
}

/**
 * LATVIA — VZD kadastrs via the geolatvija.lv GeoServer, `vraa:parcel` (lane LV, live-probed at
 * Rīga → code 01000070006). Mirrors buildLvWgs84BboxUrl (countryAdapters/lv/lvWfsClient.ts):
 * urn-ordered lat,lon WGS84 bbox + `srsName=urn:…::4326` → WGS84 GeoJSON back (measured fact 2 —
 * the server reprojects). Rīga parcels are DENSE, so the window is small (the LU lesson):
 * ±~11 m + pickCandidate's point-in-polygon, not the shared ±38 m.
 */
const LV_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';
const LV_HALF_DEG = 0.0001;
function lvUrl(lat, lon) {
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'vraa:parcel',
        count: '30',
        outputFormat: 'application/json',
        srsName: LV_WGS84_URN,
        bbox: `${lat - LV_HALF_DEG},${lon - LV_HALF_DEG},${lat + LV_HALF_DEG},${lon + LV_HALF_DEG},${LV_WGS84_URN}`,
    });
    return `https://geolatvija.lv/geoserver/vraa/wfs?${qs.toString()}`;
}

/**
 * CROATIA — DGU / Uređena zemlja `cp_wms:CP.CadastralParcel`, the SIMPLE feature type (the cp:
 * app-schema sibling is ORA-01000-degraded — hrWfsClient.ts fact 1; do not "upgrade" to it).
 * The HR adapter keeps native EPSG:3765 output (no srsName); the browser needs WGS84, and
 * `srsName=EPSG:4326` IS honoured for output — MEASURED live 2026-09-03 by lane PROXY-LEGS at
 * Zagreb (crs echoed urn:…::4326, [lon,lat] degrees, BROJ_CESTICE/MATICNI_BROJ_KO intact), a fact
 * the HR lane had not probed. Entry bbox is the urn lat,lon form (fact 3).
 */
function hrUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://api.uredjenazemlja.hr/services/inspire/cp_wms/wfs?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=cp_wms:CP.CadastralParcel&srsName=EPSG:4326' +
        `&count=20&outputFormat=application/json&bbox=${encodeURIComponent(bbox)}`;
}

/**
 * GREECE — Hellenic Cadastre OPERATING-cadastre parcels, a keyless ArcGIS Online FeatureServer
 * (lane GR, live-probed at Athens/Syntagma → KAEK 050095701001, AREA 10839.77 m²). Explicit
 * outFields mirror GR_PARCEL_OUT_FIELDS (grKtimatologioClient.ts). The old INSPIRE path
 * gis.ktimanet.gr/inspire is HTTP 404 — do not resurrect.
 */
const GR_PROXY_OUT_FIELDS = 'KAEK,MAIN_USE,PERCENTAGE,DESCR,PROP_VERT,PROP_HOR,LINK,AREA,PERIMETER';
const grUrl = arcgisPointUrl(
    'https://services-eu1.arcgis.com/40tFGWzosjaLJpmn/arcgis/rest/services/GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer/0/query',
    GR_PROXY_OUT_FIELDS,
);

/**
 * SLOVENIA — GURS Kataster nepremičnin `SI.GURS.KN:PARCELE` (lane SI, live-probed at Ljubljana:
 * 12 candidates incl. the click parcel; srsName=EPSG:4326 + urn lat,lon bbox → WGS84 [lon,lat]).
 * Builder verbatim from the SI lane's queued B3 (barrel-additions-si.txt).
 */
function siUrl(lat, lon) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    return 'https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows?service=WFS&version=2.0.0&request=GetFeature' +
        '&typeNames=SI.GURS.KN:PARCELE&srsName=EPSG:4326' +
        `&count=20&outputFormat=application/json&bbox=${encodeURIComponent(bbox)}`;
}

/**
 * SLOVAKIA — ÚGKK/GKÚ ESKN C-register parcels, `VRM/kn/MapServer/9` "Plocha parcely C" (lane SK,
 * live-probed at Bratislava → parcel №15, k.ú. 2933, 832 m²). ⛔ The ESKN WAF returns HTTP 403 for
 * ANY `where=` clause (measured) — this builder is a pure SPATIAL query and must stay one.
 * Explicit outFields mirror SK_PARCEL_OUT_FIELDS (skEsknClient.ts).
 */
const SK_PROXY_OUT_FIELDS =
    'ID,PARCEL_NUMBER,CADASTRAL_UNIT_ID,DESCRIPTIVE_AREA_OF_PARCEL,FOLIO_ID,NATURE_OF_LAND_USE_ID,VALID_TO_DATE';
const skUrl = arcgisPointUrl(
    'https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer/9/query',
    SK_PROXY_OUT_FIELDS,
);

function jsonProp(props, ...keys) {
    for (const k of keys) {
        const v = props?.[k];
        if (v !== undefined && v !== null && String(v).length > 0) return v;
    }
    return null;
}

/**
 * @typedef {{
 *   guard:(lat:number,lon:number)=>boolean,
 *   url:(lat:number,lon:number)=>string,
 *   format:'geojson'|'gml'|'esrijson'|'socrata'|'arcgis'|'uldk',
 *   axis?:'lonlat'|'latlon',
 *   source:string,
 *   headers?:Record<string,string>,
 *   semantic404?:boolean,
 *   timeoutMs?:number,
 *   select?:(candidates:any[])=>any[],
 *   normalise:(c:any)=>{refcat:string,areaM2:number,address:string|null}
 * }} SourceCfg
 *
 * `headers` — extra request headers the upstream requires (AU-SA's public Referer). `semantic404` —
 * this upstream's HTTP 404 means "no parcel here" (TR), classified `empty`, never `unreachable`.
 * `timeoutMs` — a per-source upstream deadline for a register measured slower than the shared
 * 15 s ceiling (BE-VLG). Raising it is a statement about THAT host, never a global loosening.
 * `select` — candidate pre-filter/ordering applied BEFORE pickCandidate (AU-QLD unlinked twins,
 * AU-ACT RETIRED lifecycle) so point-in-polygon can only choose an assertable parcel.
 */

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
        // LANE PT-PARCEL-ACCURACY (2026-09-03, founder report "parcels in Portugal are not
        // accurate") — the STRUCTURAL coverage fact behind most PT empties, carried on every
        // `empty` outcome so a client can tell "no cadastre is published for this área" from
        // "the cadastre says no parcel exists here". MEASURED 2026-09-03 against the SNIC WFS
        // (transcripts audit/demo-esfrpt/2026-09-02/transcripts/pt-accuracy/): central Lisboa
        // (38.7223,-9.1393), the whole Porto city bbox AND an Évora-area rural point all return
        // numberMatched=0 while the national set holds 1,789,672 parcels and neighbouring
        // Amadora (a SiNErGIC pilot município) is fully covered — the same query shape returns
        // 7 parcels at the 2026-07-31 control point. Empty here is usually a PUBLISHING gap,
        // not a ground-truth absence. Do not soften this into "no parcel here".
        coverageNote:
            'DGT Cadastro Predial coverage is per-município and INCOMPLETE: Lisboa and Porto ' +
            'municípios publish no parcels at all (numberMatched=0, measured 2026-09-03). An ' +
            'empty answer in mainland Portugal usually means "no cadastre published for this ' +
            'área yet", not "no parcel exists here". No keyless urban parcel-geometry service ' +
            'exists for Portugal (BUPi RGG is rústico/misto only).',
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
    // ── LANE PARCEL-REACH (2026-09-04): GERMANY, 14 Länder ──────────────────────────────────────
    // Guards are the Länder's own extents. They OVERLAP each other at every internal border, which
    // is fine and is how DE-NW already behaves: the registry decides WHICH row is tried, a guard
    // only fences its own source's territory, and a neighbour's WFS answers zero features outside
    // its Land — a self-correcting miss, never a fabricated ring.
    // ⚠ EVERY SRSNAME BELOW IS THE MEASURED ONE. BW and SN advertise NO 4326 at all (only
    // 25832/25833/4258), and asking SN for EPSG:4326 returns an HTML 400 WAF page rather than an OWS
    // exception — so they use ETRS89 (4258), which differs from WGS84 by centimetres, the same
    // rationale as the IT leg. HE and SL likewise measured on 4258.
    'de-bw': {
        guard: (lat, lon) => lat >= 47.5 && lat <= 49.8 && lon >= 7.5 && lon <= 10.5,
        url: deCpUrl('https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_INSP_BW_Flst_ALKIS', 'urn:ogc:def:crs:EPSG::4258'),
        format: 'gml', axis: 'latlon', source: 'alkis-bw', normalise: deCpNormalise,
    },
    // ⛔ NO 'de-by' KEY — deliberately. A key here would be a STUB standing in for a refusal,
    //    and Object.keys() would then advertise Bayern as wired. See the Bayern block above.
    'de-he': {
        guard: (lat, lon) => lat >= 49.3 && lat <= 51.7 && lon >= 7.7 && lon <= 10.3,
        url: deCpUrl('https://inspire-hessen.de/ows/services/org.2.07247d95-adc7-4c7d-9c7a-ed17af855317_wfs', 'urn:ogc:def:crs:EPSG::4258'),
        format: 'gml', axis: 'latlon', source: 'alkis-he', normalise: deCpNormalise,
    },
    'de-ni': {
        guard: (lat, lon) => lat >= 51.2 && lat <= 54.0 && lon >= 6.6 && lon <= 11.7,
        url: deCpUrl('https://www.inspire.niedersachsen.de/doorman/noauth/alkis-dls-cp', 'urn:ogc:def:crs:EPSG::4326'),
        format: 'gml', axis: 'latlon', source: 'alkis-ni', normalise: deCpNormalise,
    },
    'de-sn': {
        guard: (lat, lon) => lat >= 50.1 && lat <= 51.7 && lon >= 11.8 && lon <= 15.1,
        url: deCpUrl('https://geodienste.sachsen.de/aaa/public_inspire/alkis/cp/dls/wfs', 'urn:ogc:def:crs:EPSG::4258'),
        format: 'gml', axis: 'latlon', source: 'alkis-sn', normalise: deCpNormalise,
    },
    'de-sh': {
        guard: (lat, lon) => lat >= 53.3 && lat <= 55.1 && lon >= 7.8 && lon <= 11.4,
        url: deCpUrl('https://service.gdi-sh.de/SH_INSPIREDOWNLOAD_AI_CP_ALKIS', 'urn:ogc:def:crs:EPSG::4326'),
        format: 'gml', axis: 'latlon', source: 'alkis-sh', normalise: deCpNormalise,
    },
    'de-bb': {
        guard: (lat, lon) => lat >= 51.3 && lat <= 53.6 && lon >= 11.2 && lon <= 14.8,
        url: deCpUrl('https://inspire.brandenburg.de/services/cp_alkis_wfs', 'urn:ogc:def:crs:EPSG::4326'),
        format: 'gml', axis: 'latlon', source: 'alkis-bb', normalise: deCpNormalise,
    },
    'de-st': {
        guard: (lat, lon) => lat >= 50.9 && lat <= 53.1 && lon >= 10.5 && lon <= 13.2,
        url: deCpUrl('https://geodatenportal.sachsen-anhalt.de/ows_INSPIRE_LVermGeo_ALKIS_CP_WFS', 'urn:ogc:def:crs:EPSG::4326'),
        format: 'gml', axis: 'latlon', source: 'alkis-st', normalise: deCpNormalise,
    },
    'de-mv': {
        guard: (lat, lon) => lat >= 53.1 && lat <= 54.8 && lon >= 10.5 && lon <= 14.5,
        url: deCpUrl('https://www.geodaten-mv.de/dienste/inspire_cp_alkis_download', 'urn:ogc:def:crs:EPSG::4326'),
        format: 'gml', axis: 'latlon', source: 'alkis-mv', normalise: deCpNormalise,
    },
    'de-sl': {
        guard: (lat, lon) => lat >= 49.1 && lat <= 49.7 && lon >= 6.3 && lon <= 7.5,
        url: deCpUrl('https://geoportal.saarland.de/gdi-sl/inspirewfs_Flurstuecke_Grundstuecke_ALKIS', 'urn:ogc:def:crs:EPSG::4258'),
        format: 'gml', axis: 'latlon', source: 'alkis-sl', normalise: deCpNormalise,
    },
    // Family B — adv ALKIS-vereinfacht, the DE-NRW schema exactly.
    'de-hh': {
        // ⚠ HAMBURG'S AXIS FLIPS ON THE CRS *SPELLING*, not the CRS: `urn:ogc:def:crs:EPSG::4326`
        // returns lat-first ("53.550913 9.992096") while the short `EPSG:4326` returns lon-first on
        // the SAME service and the SAME parcel — a hemisphere bug wearing a valid response. deAveUrl
        // emits the urn form, which is why this row is `axis:'latlon'`.
        // ⛔ Do NOT "upgrade" to Hamburg's INSPIRE service HH_WFS_INSPIRE_Flurstuecke: its
        // GetCapabilities is clean but EVERY spatial query fails server-side with HTTP 500
        // `ST_Intersects: Operation on mixed SRID geometries (Polygon, 0) != (Polygon, 25832)`,
        // across all CRS spellings and both BBOX param and fes:BBOX filter. Its own reprojection is
        // broken; this vereinfacht service is the working one.
        guard: (lat, lon) => lat >= 53.3 && lat <= 54.0 && lon >= 8.4 && lon <= 10.4,
        url: deAveUrl('https://geodienste.hamburg.de/WFS_HH_ALKIS_vereinfacht', 'ave:Flurstueck'),
        format: 'gml', axis: 'latlon', source: 'alkis-hh', normalise: deAveNormalise,
    },
    'de-rp': {
        // ⚠ TWO RLP SERVICES ARE PUBLISHED AND ONLY THIS ONE WORKS. The INSPIRE one advertised at
        // geoportal.rlp.de/spatial-objects/584 proxies to geo5balance.vermkv.rlp — a NON-RESOLVING
        // internal host — so its OGC-API façade answers `{"success":false,…,"features":[]}` for
        // every collection, and its licence reads "Gebührenpflichtig". This one comes from
        // spatial-objects/519, licence "geldleistungsfrei; Datenlizenz Deutschland – Namensnennung".
        guard: (lat, lon) => lat >= 48.9 && lat <= 51.0 && lon >= 6.0 && lon <= 8.6,
        url: deAveUrl('https://geo5.service24.rlp.de/wfs/alkis_rp.fcgi', 'ave:Flurstueck'),
        format: 'gml', axis: 'latlon', source: 'alkis-rp', normalise: deAveNormalise,
    },
    'de-th': {
        // ⛔ THE MOST DANGEROUS LEG IN THIS BLOCK — its failure mode is a CLEAN EMPTY, not an error.
        // A degree bbox (either CRS spelling) returns HTTP 200 with numberMatched="0", so a wrong
        // bbox CRS would read as "no parcel here" forever. `deThUrl` projects the click to EPSG:25832
        // metres; see `wgs84ToUtm32n`, which is verified against the service's OWN returned parcel.
        guard: (lat, lon) => lat >= 50.2 && lat <= 51.7 && lon >= 9.8 && lon <= 12.7,
        url: deThUrl,
        format: 'gml', axis: 'latlon', source: 'alkis-th', normalise: deAveNormalise,
    },
    // Family C — Bremen's deegree `app:` prefix over the SAME field names. gmlText's pattern is
    // `<(?:[\w.-]+:)?TAG`, i.e. prefix-agnostic, so family B's normaliser covers it unchanged.
    'de-hb': {
        guard: (lat, lon) => lat >= 53.0 && lat <= 53.7 && lon >= 8.4 && lon <= 9.0,
        url: deAveUrl('https://geodienste.bremen.de/wfs_hduk2958loah3976niun', 'app:flurstuecke'),
        format: 'gml', axis: 'latlon', source: 'alkis-hb', normalise: deAveNormalise,
    },
    // The one true one-off — GeoJSON, lon-first bbox, its own field names.
    'de-be': {
        guard: (lat, lon) => lat >= 52.3 && lat <= 52.7 && lon >= 13.0 && lon <= 13.8,
        url: deBeUrl,
        format: 'geojson',
        source: 'alkis-be',
        normalise: (c) => {
            const p = c.props || {};
            // `fsko` is the ALKIS Flurstückskennzeichen (11000191900567____ @ Mitte, measured);
            // trailing underscores are ALKIS padding, stripped as the DE-NRW row already does.
            const refcat = String(jsonProp(p, 'fsko') ?? '').replace(/_+$/, '').trim();
            const afl = Number(jsonProp(p, 'afl'));
            const areaM2 = Number.isFinite(afl) && afl > 0 ? afl : ringAreaM2(c.ring);
            const gmk = jsonProp(p, 'namgmk');
            return { refcat, areaM2, address: gmk ? String(gmk) : null };
        },
    },
    // ── LANE PARCEL-REACH (2026-09-04): CZ / IE / AT — three countries with NO ROW AT ALL ───────
    // Measured before the fix (resolveParcelCandidates at real city points, 2026-09-04):
    //   Praha  → `DE:footprint-fallback`  — a Czech click was labelled GERMANY and served an OSM
    //                                        outline, because GERMANY_BBOX reaches 15.1°E.
    //   Brno   → (no candidate at all)    — likewise Ostrava, and Wien.
    //   Dublin → `GB-ENG:cadastral`       — an Irish click routed to HM Land Registry ENGLAND.
    // None of those is a footprint honestly labelled; each is a WRONG COUNTRY asserted, which is the
    // C58 §1.4 failure. CZE and AUT sit in the national boundary set as REFUSAL-ONLY neighbours, so
    // `claimsNation('CZ'|'AT')` is false everywhere and a claimsNation row would never route — these
    // rows therefore use bbox predicates, the FR/NL/CH/IT pattern. That is SAFE for the wired
    // neighbours precisely because they ARE claimable: `resolveParcelCandidates` filters the pool to
    // the claimed country, so a Polish/German/Slovak point drops these rows before they are tried.
    cz: {
        guard: (lat, lon) => lat >= 48.5 && lat <= 51.1 && lon >= 12.0 && lon <= 18.9,
        url: czUrl,
        format: 'gml',
        axis: 'latlon', // posList is lat-first — measured `50.086623 14.420771` @ Praha
        source: 'cz-cuzk-inspire-cp',
        normalise: (c) => {
            // ⛔ GML candidates carry `block` (raw XML), NEVER `props` — the IT row above documents
            // this trap in full. Use gmlText/gmlAttr.
            const b = c.block || '';
            // 727024-542 @ Praha Staré Město, measured: cadastral-district code + parcel number.
            const refcat = (gmlText(b, 'NATIONALCADASTRALREFERENCE') ?? '').trim();
            // ⭐ ČÚZK SERVES AN OFFICIAL AREA (`<cp:areaValue uom="m2">775</cp:areaValue>`), so the
            // registry figure is preferred over the shoelace estimate. The uom is ASSERTED, never
            // assumed: anything but m² falls back to the ring, because a hectare read as a square
            // metre is a 10 000× error wearing a number's confidence.
            const uom = (gmlAttr(b, 'areaValue', 'uom') ?? '').toLowerCase();
            const served = Number(gmlText(b, 'AREAVALUE'));
            const areaM2 = uom === 'm2' && Number.isFinite(served) && served > 0 ? served : ringAreaM2(c.ring);
            // ⛔ `administrativeUnit` and `zoning` are xlink ASSOCIATIONS — self-closing elements whose
            // human name lives in the `xlink:title` ATTRIBUTE ("Praha", "Staré Město"). `gmlText`
            // reads element TEXT and returns null for both; that is what `gmlAttr` exists for.
            const obec = gmlAttr(b, 'administrativeUnit', 'title');
            const ku = gmlAttr(b, 'zoning', 'title');
            const address = ku && obec ? `${ku}, ${obec}` : (obec ?? ku ?? null);
            return { refcat, areaM2, address };
        },
    },
    ie: {
        // Island of Ireland box; NORTHERN IRELAND falls inside it and is NOT served by Tailte
        // Éireann (LPS Northern Ireland is a separate, non-keyless register), so a Belfast click is
        // an honest `empty` → footprint. Measured coverage is title-based, so `empty` is frequent
        // and TRUE on any street — never treat it as an outage.
        guard: (lat, lon) => lat >= 51.35 && lat <= 55.45 && lon >= -10.6 && lon <= -5.3,
        url: ieUrl,
        format: 'geojson',
        source: 'ie-tailte-eireann-freehold',
        normalise: (c) => {
            const p = c.props || {};
            // SP_ID is the stable spatial-parcel id (2577972 @ Dublin, measured) and arrives NUMERIC,
            // so it is coerced. ⛔ OBJECTID is the ArcGIS row id, NOT a cadastral identifier — citing
            // it would attribute a surrogate key to Tailte Éireann, so it is never used as refcat.
            const refcat = String(jsonProp(p, 'SP_ID') ?? '').trim();
            // ⚠ `Shape__Area` is in the SERVICE's own units and is NOT asserted to be m² anywhere in
            // the layer metadata, so the ring is used — the AU/CH/US discipline.
            const county = jsonProp(p, 'COUNTY_NAM');
            return { refcat, areaM2: ringAreaM2(c.ring), address: county ? String(county) : null };
        },
    },
    at: {
        guard: (lat, lon) => lat >= 46.3 && lat <= 49.1 && lon >= 9.5 && lon <= 17.2,
        url: atUrl,
        format: 'geojson',
        // ⛔ The ONLY source needing a reprojection. See `webMercatorToWgs84` and `atUrl` for WHY the
        // request must be EPSG:3857 (the 4326 answer is rounded to ~110 m and the ring degenerates).
        reproject: 'epsg3857',
        source: 'at-bev-inspire-cp',
        normalise: (c) => {
            const p = c.props || {};
            // AT.0002.I.6.CP.01004954 @ Wien Stephansplatz, measured. ⚠ `inspireId` is the ONLY
            // attribute this layer exposes — there is no separate Katastralgemeinde number and no
            // Grundstücksnummer field, confirmed against INFO_FORMAT=text/html on the same layer. So
            // there is no address to show and `address` is honestly null rather than invented.
            const refcat = String(jsonProp(p, 'inspireId') ?? '').trim();
            return { refcat, areaM2: ringAreaM2(c.ring), address: null };
        },
    },
    // ── LANE PARCEL-REACH (2026-09-03): IT / BG / BE-VLG / GB-ENG ───────────────────────────────
    // Same measured defect as the US block below: registered `cadastral` in registry.ts, absent
    // here, therefore HTTP 404 → OSM footprint under a "cadastral" verdict. Italy is the largest
    // single gain in this lane — a whole G7 country that was resolving building outlines.
    it: {
        // Mainland + islands; AP Trento/Bolzano excluded BY THE SOURCE (they run their own Catasto
        // tavolare), which reads here as an honest `empty`, never a fabricated ring.
        guard: (lat, lon) => lat >= 35.4 && lat <= 47.1 && lon >= 6.6 && lon <= 18.6,
        url: itUrl,
        format: 'gml',
        axis: 'latlon', // EPSG:6706 GML posList is lat-first — the DE-NRW idiom
        source: 'agenzia-entrate',
        // ⚠ MEASURED 2026-09-04 (lane PARCEL-REACH) — Agenzia delle Entrate is the SECOND source
        // after BE-VLG to need its own deadline, and it was missed when this leg landed because the
        // FIRST probe (Roma) was warm. COLD end-to-end `resolveEuParcelOutcome` timings, one fresh
        // bbox each, no warming fetch: Torino 14.1 s · Palermo 14.2 s · Roma 20.1 s · Napoli 22.1 s ·
        // Bologna 30.0 s — and Bologna is the proof, because it logged
        // `[eu-cadastre] fetch failed (attempt 1): This operation was aborted` and only produced a
        // parcel on the RETRY. So under the shared 15 s ceiling Italy was surviving by accident:
        // every slow comune paid double latency, and a comune slower than 15 s on BOTH attempts
        // reported `unreachable` — a healthy G7 cadastre described as down, the same false statement
        // the BE-VLG override exists to prevent. 25 s clears the measured p100 (22.1 s) on the FIRST
        // attempt while still leaving the retry inside a tolerable worst case.
        // ⛔ This is a statement about THIS host, never a global loosening: UPSTREAM_TIMEOUT_MS stays
        // 15 s, and the refcat cache absorbs the cost for repeat clicks on the same parcel.
        timeoutMs: 25_000,
        normalise: (c) => {
            // ⛔ GML candidates carry `block` (raw XML), NEVER `props` — reading `c.props` here
            // yields undefined for every field, so `refcat` comes out empty and the resolver
            // classifies a REAL Roman parcel as an authoritative `empty`. That is precisely the
            // failure-as-empty collapse this proxy exists to prevent, and it is invisible from the
            // outside: the upstream returns 200 with 2 members and the user still sees a footprint.
            // Use `gmlText(block, TAG)`, exactly as the DE-NRW row above does.
            const b = c.block || '';
            // The INSPIRE national cadastral reference (H501A048600.D @ Roma Pantheon, measured):
            // comune Belfiore code + foglio + particella.
            const refcat = (gmlText(b, 'NATIONALCADASTRALREFERENCE') ?? gmlText(b, 'INSPIREID_LOCALID') ?? '').trim();
            // ADMINISTRATIVEUNIT is the comune's Belfiore code (H501 = Roma, F205 = Milano).
            const comune = gmlText(b, 'ADMINISTRATIVEUNIT');
            // The service publishes no area attribute → geometry-derived.
            return { refcat, areaM2: ringAreaM2(c.ring), address: comune ?? null };
        },
    },
    bg: {
        guard: (lat, lon) => lat >= 41.2 && lat <= 44.3 && lon >= 22.3 && lon <= 28.7,
        url: bgUrl,
        format: 'arcgis',
        source: 'bg-gcca-inspire-cadastral-parcel',
        normalise: (c) => {
            const p = c.props || {};
            // поземлен имот id (68134.405.115 @ Sofia, measured) — EKATTE + kadastralen rayon + imot.
            const refcat = String(jsonProp(p, 'nationalcadastralref', 'id_localid') ?? '').trim();
            // ⭐ BG is one of the few sources that SERVES an official area in m² (`areavalue_uom`
            // is "m2"), so the official figure is preferred over the geometry estimate. The
            // uom is asserted, not assumed: anything other than m² falls back to the ring.
            const uom = String(jsonProp(p, 'areavalue_uom') ?? '').toLowerCase();
            const served = Number(jsonProp(p, 'areavalue'));
            const areaM2 = uom === 'm2' && Number.isFinite(served) && served > 0 ? served : ringAreaM2(c.ring);
            const label = jsonProp(p, 'label');
            return { refcat, areaM2, address: label ? String(label) : null };
        },
    },
    'be-vlg': {
        guard: (lat, lon) => lat >= 50.67 && lat <= 51.51 && lon >= 2.53 && lon <= 5.92,
        url: beVlgUrl,
        format: 'geojson',
        source: 'flanders-grb',
        // ⚠ MEASURED 2026-09-03: this host answers in ~20 s and the latency is FIXED per request,
        // not payload-bound — ±11 m/1 feature and ±38 m/14 features both took ~20 s across repeated
        // calls, so shrinking the bbox or COUNT does not help. Under the shared 15 s ceiling every
        // Flemish click aborted and reported `unreachable`, i.e. a healthy national cadastre was
        // being described as down. The deadline is raised FOR THIS SOURCE ONLY; the refcat cache
        // then absorbs the cost for repeat clicks on the same parcel.
        timeoutMs: 28_000,
        normalise: (c) => {
            const p = c.props || {};
            // CAPAKEY is the Belgian cadastral parcel key (11803C2116/00_000 @ Antwerpen, measured).
            const refcat = String(jsonProp(p, 'CAPAKEY') ?? '').trim();
            const nis = jsonProp(p, 'NISCODE');
            // ADP carries no area attribute → geometry-derived.
            return { refcat, areaM2: ringAreaM2(c.ring), address: nis ? `NIS ${nis}` : null };
        },
    },
    gb: {
        // England's box. Wales/Scotland/NI fall inside it at the edges and return ZERO features
        // (measured: Cardiff 0, Swansea 0), so they self-correct to the footprint.
        guard: (lat, lon) => lat >= 49.8 && lat <= 55.9 && lon >= -6.5 && lon <= 1.9,
        url: gbUrl,
        format: 'geojson',
        source: 'gb-os-inspire',
        normalise: (c) => {
            const p = c.props || {};
            // `reference` is the HMLR INSPIRE polygon id (48204480 @ London, measured). ⛔ NOT
            // `entity`, which is the Planning Data platform's own surrogate key and is not an
            // HMLR identifier — citing it would attribute a made-up id to the Land Registry.
            const refcat = String(jsonProp(p, 'reference') ?? '').trim();
            return { refcat, areaM2: ringAreaM2(c.ring), address: null };
        },
    },
    // ── LANE PARCEL-REACH (2026-09-03): the FIVE MISSING US LEGS ────────────────────────────────
    // MEASURED DEFECT that these close: `us-nyc` / `us-ma` / `us-fl` / `us-wa-king` /
    // `us-tx-harris` were all registered `kind:'cadastral'` with a `proxyPath` in registry.ts, but
    // had NO key in this table — so `GET /api/parcel/us-ma?...` answered
    // `HTTP 404 {"error":"Unknown cadastre 'us-ma'."}` (measured live against pryzm.fly.dev before
    // this change), the client's WfsParcelProvider logged the non-OK and returned null, and every
    // Boston / Miami / Seattle / Houston / New York click silently fell to the OSM footprint. The
    // registry VERDICT said "cadastral" while the user got a building outline: authored-but-unwired,
    // the C58 §1.4 credibility failure this file exists to prevent.
    //
    // All five are keyless ArcGIS point-intersect services, so they reuse `arcgisPointUrl` +
    // `format:'arcgis'` verbatim and need no new parser. Each `outFields` list is EXPLICIT (never
    // `*`) so a widened upstream column is a deliberate change, and each was LIVE-PROBED
    // 2026-09-03 with the ring confirmed to arrive in WGS84 DEGREES (|x|<180 at the city's real
    // longitude) rather than a silent Web-Mercator leak. Guards mirror the authored bboxes in
    // countryAdapters/us/usJurisdiction.ts + parcelProviders/nycPlutoParcelProvider.ts — the
    // registry decides WHICH row is tried; a guard only fences its own source's territory.
    //
    // ⚠ AREA IS ALWAYS GEOMETRY-DERIVED for every US leg. The served area fields are assessment
    // attributes in mixed units (FL `LND_SQFOOT` square feet, MA `LOT_SIZE` with a separate
    // `LOT_UNITS` discriminator that is ACRES for some towns and square feet for others, NYC
    // `LotArea` square feet) — passing any of them through as m² would be a unit error wearing a
    // number's confidence, so `ringAreaM2` is used throughout, as AU and CH already do.
    // ⛔ NO US NATIONAL PARCEL SERVICE EXISTS to fall back to (verified 2026-09-03: the federal
    // NGDA "Cadastre" theme is the BLM PLSS survey grid — township/section, zero private lots; the
    // national commercial layers are tiles-only or token-gated). US parcels are county-assessed in
    // law, so per-jurisdiction legs are the only correct architecture, not a stopgap.
    'us-nyc': {
        guard: (lat, lon) => lat >= 40.47 && lat <= 40.93 && lon >= -74.28 && lon <= -73.68,
        url: usNycUrl,
        format: 'arcgis',
        source: 'nyc-pluto',
        normalise: (c) => {
            const p = c.props || {};
            // BBL (Borough-Block-Lot) is NYC's tax-lot id and arrives NUMERIC on the wire —
            // 1008350041 @ the Empire State Building, measured — so it is coerced to a string.
            const refcat = String(jsonProp(p, 'BBL') ?? '').trim();
            const addr = jsonProp(p, 'Address');
            return { refcat, areaM2: ringAreaM2(c.ring), address: addr ? String(addr) : null };
        },
    },
    'us-ma': {
        // ⚠ LAYER 1, NOT 0 — layer 0 of this FeatureServer is the Devens district only; layer 1 is
        // the statewide L3 fabric (measured). ⚠ `TOWN_NAME` does NOT exist on this layer, so it is
        // absent from outFields — requesting it would fail the whole query.
        guard: (lat, lon) => lat >= 41.14 && lat <= 42.90 && lon >= -73.55 && lon <= -69.85,
        url: usMaUrl,
        format: 'arcgis',
        source: 'us-ma-massgis-l3',
        normalise: (c) => {
            const p = c.props || {};
            // LOC_ID is the STATEWIDE-unique standardized parcel id (F_775267_2956644 @ Boston
            // City Hall, measured); MAP_PAR_ID is only unique within its town, hence the ordering.
            const refcat = String(jsonProp(p, 'LOC_ID', 'MAP_PAR_ID') ?? '').trim();
            const parts = [jsonProp(p, 'SITE_ADDR'), jsonProp(p, 'CITY')].filter(Boolean);
            return { refcat, areaM2: ringAreaM2(c.ring), address: parts.length ? parts.join(', ') : null };
        },
    },
    'us-fl': {
        // ⛔ Do NOT add `resultRecordCount` to this service's query — it answers HTTP 400
        // "Invalid query parameters" (measured), as do `returnExtentOnly` and a string `where=`.
        // `esriSpatialRelContains` returns 0 features here; Intersects is the working predicate,
        // which is what `arcgisPointUrl` emits.
        guard: (lat, lon) => lat >= 24.40 && lat <= 31.05 && lon >= -87.65 && lon <= -79.95,
        url: usFlUrl,
        format: 'arcgis',
        source: 'us-fl-fdor-cadastral',
        normalise: (c) => {
            const p = c.props || {};
            // PARCEL_ID is the DOR parcel id (1829244ZI000035000010A @ Tampa, measured).
            const refcat = String(jsonProp(p, 'PARCEL_ID') ?? '').trim();
            const parts = [jsonProp(p, 'PHY_ADDR1'), jsonProp(p, 'PHY_CITY')].filter(Boolean);
            return { refcat, areaM2: ringAreaM2(c.ring), address: parts.length ? parts.join(', ') : null };
        },
    },
    'us-wa-king': {
        // ONE COUNTY (Seattle metro), never statewide — a Spokane click is out-of-area here and
        // falls to the footprint. The layer is geometry + PIN only; it carries NO address and
        // explicitly EXCLUDES road right-of-way, so a street click is a truthful `empty`.
        guard: (lat, lon) => lat >= 47.07 && lat <= 47.80 && lon >= -122.55 && lon <= -121.05,
        url: usWaKingUrl,
        format: 'arcgis',
        source: 'us-wa-king-parcels',
        normalise: (c) => {
            const p = c.props || {};
            // PIN = MAJOR + MINOR concatenated (6003501205 @ Capitol Hill, measured).
            const refcat = String(jsonProp(p, 'PIN', 'MAJOR') ?? '').trim();
            return { refcat, areaM2: ringAreaM2(c.ring), address: null };
        },
    },
    'us-tx-harris': {
        // ONE COUNTY (Houston metro). Texas has no usable statewide open parcel service (StratMap
        // returned nothing at Austin/Dallas; the City-of-Austin layer is city-OWNED land only).
        guard: (lat, lon) => lat >= 29.48 && lat <= 30.18 && lon >= -95.97 && lon <= -94.88,
        url: usTxHarrisUrl,
        format: 'arcgis',
        source: 'us-tx-harris-hcad',
        normalise: (c) => {
            const p = c.props || {};
            // HCAD_NUM is the appraisal account id (1222280010001 @ 3815 Montrose Blvd, measured).
            const refcat = String(jsonProp(p, 'HCAD_NUM', 'acct_num') ?? '').trim();
            // ⛔ `mail_addr_1` is the OWNER'S MAILING address, NOT the site address — at the Museum
            // District point it reads "PO BOX 711, DALLAS" for a Houston parcel (measured). Showing
            // it on the parcel info card would state a falsehood about where the land is, so the
            // SITE address is composed from the site_str_* fields and mail_* is never used here.
            const site = [
                jsonProp(p, 'site_str_num'),
                jsonProp(p, 'site_str_name'),
                jsonProp(p, 'site_str_sfx'),
            ].filter(Boolean).join(' ').trim();
            const city = jsonProp(p, 'site_city');
            const address = site ? (city ? `${site}, ${city}` : site) : null;
            return { refcat, areaM2: ringAreaM2(c.ring), address };
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
    // LANE LU-PARCEL (2026-09-03) — Luxembourg, ACT / INSPIRE cp:CP.CadastralParcel. The guard is
    // LUXEMBOURG_BBOX (countryAdapters/lu/luJurisdiction.ts); the registry routes on claimsNation('LU'),
    // so this guard only fences the source's own territory. GeoJSON, [lon,lat] WGS84 output.
    lu: {
        guard: (lat, lon) => lat >= 49.44 && lat <= 50.19 && lon >= 5.72 && lon <= 6.54,
        url: luUrl,
        format: 'geojson',
        source: 'lu-act-inspire-cp',
        normalise: (c) => {
            const p = c.props || {};
            // `national_cadastral_reference` is the INSPIRE harmonized key (075F00137000000 @ the
            // founder click); `area` is the served registered m²; `label` is the plan label (137 /
            // 461/1970). Prefer the national reference, never invent one.
            const refcat = String(jsonProp(p, 'national_cadastral_reference') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'area')) || ringAreaM2(c.ring);
            const label = jsonProp(p, 'label');
            return { refcat, areaM2, address: label ? String(label) : null };
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
    // ── LANE PROXY-LEGS (2026-09-03): the AU/TR/QA/LV/HR/GR/SI/SK wave. `source` values are the
    // registry rows' providerIds (one spelling per source, C84 EI-9). Guards mirror each adapter's
    // measured routing bbox (countryAdapters/<cc>/<cc>Jurisdiction.ts / auJurisdiction.ts) — the
    // registry's own routing decides WHICH row is tried; the guard only fences this source's
    // territory. IL is deliberately absent (no ring served — see the header).
    'au-nsw': {
        guard: (lat, lon) => lat >= -37.51 && lat <= -28.15 && lon >= 140.99 && lon <= 153.64,
        url: auNswUrl,
        format: 'arcgis',
        source: 'au-nsw-dcs-cadastre',
        normalise: (c) => {
            const p = c.props || {};
            // `lotidstring` is the served legal id (100//DP1048011 @ Sydney Town Hall, measured);
            // fall back to lot//section/plan composition, exactly as nswIdentity does.
            const lotId = String(jsonProp(p, 'lotidstring') ?? '').trim();
            const lot = jsonProp(p, 'lotnumber');
            const sec = jsonProp(p, 'sectionnumber');
            const plan = jsonProp(p, 'planlabel');
            const refcat = lotId || (lot !== null && plan !== null ? `${lot}//${sec ?? ''}/${plan}` : '');
            return { refcat, areaM2: ringAreaM2(c.ring), address: null };
        },
    },
    'au-vic': {
        guard: (lat, lon) => lat >= -39.2 && lat <= -33.98 && lon >= 140.96 && lon <= 150.04,
        url: auVicUrl,
        format: 'geojson',
        source: 'au-vic-vicmap-cadastre',
        normalise: (c) => {
            const p = c.props || {};
            // `parcel_spi` is the Standard Parcel Identifier (PC366537 @ Melbourne, measured).
            const refcat = String(jsonProp(p, 'parcel_spi', 'spi') ?? '').trim();
            return { refcat, areaM2: ringAreaM2(c.ring), address: null };
        },
    },
    'au-qld': {
        guard: (lat, lon) => lat >= -29.2 && lat <= -9.09 && lon >= 137.99 && lon <= 153.56,
        url: auQldUrl,
        format: 'arcgis',
        source: 'au-qld-qspatial-cadastre',
        // The point query returns the lot PLUS an "Unlinked parcel or interest" twin with null
        // lotplan (measured @ Brisbane). Drop id-less twins BEFORE point-in-polygon can pick one.
        select: (candidates) => candidates.filter((c) => jsonProp(c.props || {}, 'lotplan') !== null),
        normalise: (c) => {
            const p = c.props || {};
            const refcat = String(jsonProp(p, 'lotplan') ?? '').trim(); // 47SP317615 @ Brisbane
            const locality = jsonProp(p, 'locality');
            return { refcat, areaM2: ringAreaM2(c.ring), address: locality ? String(locality) : null };
        },
    },
    'au-sa': {
        // ⛔ code `au-sa`, never `sa` (= Saudi Arabia in the registry).
        guard: (lat, lon) => lat >= -38.07 && lat <= -25.99 && lon >= 128.99 && lon <= 141.01,
        url: auSaUrl,
        format: 'arcgis',
        source: 'au-sa-sappa-cadastre',
        // Soft CloudFront WAF: 403 bare, 200 with this documented PUBLIC Referer (control
        // transcript live-sa-noreferer.txt). Injected server-side — the whole point of this proxy.
        headers: { Referer: AU_SA_REFERER },
        normalise: (c) => {
            const p = c.props || {};
            // `parcel_id` arrives whitespace-padded ("C21367   F1") — collapsed, as saIdentity does;
            // else composed plan+parcel. Title (CT volume/folio) rides as the info-card address.
            const rawId = jsonProp(p, 'parcel_id');
            const composed = [jsonProp(p, 'plan_t'), jsonProp(p, 'plan')].every((v) => v !== null) &&
                [jsonProp(p, 'parcel_t'), jsonProp(p, 'parcel')].every((v) => v !== null)
                ? `${jsonProp(p, 'plan_t')}${jsonProp(p, 'plan')} ${jsonProp(p, 'parcel_t')}${jsonProp(p, 'parcel')}`
                : '';
            const refcat = rawId ? String(rawId).replace(/\s+/g, ' ').trim() : composed;
            const titleT = jsonProp(p, 'title_t');
            const vol = jsonProp(p, 'volume');
            const folio = jsonProp(p, 'folio');
            const title = titleT !== null && vol !== null && folio !== null ? `${titleT} ${vol}/${folio}` : null;
            return { refcat, areaM2: ringAreaM2(c.ring), address: title };
        },
    },
    'au-tas': {
        guard: (lat, lon) => lat >= -43.75 && lat <= -39.18 && lon >= 143.79 && lon <= 148.53,
        url: auTasUrl,
        format: 'arcgis',
        source: 'au-tas-thelist-cadastre',
        normalise: (c) => {
            const p = c.props || {};
            // PID is theLIST's parcel id (3321248 @ Hobart); fall back to the title reference.
            // ⚠ MEASURED 2026-09-03 (lane PARCEL-REACH) @ Launceston (−41.4332,147.1441): theLIST
            // serves `{"PID":0,"VOLUME":null,"FOLIO":null,"TENURE_TY":"Crown Land"}` — a REAL
            // polygon with a PLACEHOLDER id. `jsonProp` accepts numeric 0 (String(0).length === 1),
            // so the leg asserted `refcat: "0"`: an uncitable parcel presented as identified, the
            // §CONTEXT-DATA-HONESTY family. A cadastral id is NEVER 0, so 0 is normalised to absent
            // here and the resolver's "no usable identifier" guard then classifies the point
            // `empty` → OSM footprint, which is the true statement for unallocated Crown Land.
            const pidRaw = jsonProp(p, 'PID');
            const pid = pidRaw !== null && String(pidRaw).trim() !== '0' ? pidRaw : null;
            const vol = jsonProp(p, 'VOLUME');
            const folio = jsonProp(p, 'FOLIO');
            const refcat = pid !== null ? String(pid).trim()
                : vol !== null && folio !== null ? `${vol}/${folio}` : '';
            const address = jsonProp(p, 'PROP_ADD');
            return { refcat, areaM2: ringAreaM2(c.ring), address: address ? String(address) : null };
        },
    },
    'au-act': {
        guard: (lat, lon) => lat >= -35.93 && lat <= -35.12 && lon >= 148.75 && lon <= 149.41,
        url: auActUrl,
        format: 'arcgis',
        source: 'au-act-actmapi-blocks',
        // @ Civic the point returned 3 RETIRED + 1 APPROVED overlapping blocks (measured). A
        // RETIRED (superseded) block is never asserted as the parcel; CURRENT outranks APPROVED —
        // exactly actRank in auStateCadastre.ts.
        select: (candidates) => {
            const stage = (c) => String(jsonProp(c.props || {}, 'CURRENT_LIFECYCLE_STAGE') ?? '').toUpperCase();
            const rank = (c) => (stage(c) === 'CURRENT' ? 0 : stage(c) === 'APPROVED' ? 1 : 2);
            return candidates.filter((c) => stage(c) !== 'RETIRED').sort((a, b) => rank(a) - rank(b));
        },
        normalise: (c) => {
            const p = c.props || {};
            // ⚠ The served BLOCK_SECTION composite is SECTION/BLOCK order — the id is composed from
            // the EXPLICIT block+section fields so its ordering is unambiguous (actIdentity's rule).
            const block = jsonProp(p, 'BLOCK_NUMBER');
            const section = jsonProp(p, 'SECTION_NUMBER');
            const refcat = block !== null && section !== null
                ? `${block}/${section}`
                : String(jsonProp(p, 'BLOCK_SECTION') ?? '').trim();
            const district = jsonProp(p, 'DISTRICT_NAME');
            return { refcat, areaM2: ringAreaM2(c.ring), address: district ? String(district) : null };
        },
    },
    tr: {
        guard: (lat, lon) => lat >= 35.8 && lat <= 42.2 && lon >= 25.6 && lon <= 44.9,
        url: trUrl,
        format: 'geojson',
        source: 'tr-tkgm-parsel',
        semantic404: true, // TKGM 404 "Parsel Bulunamadı" = a durable no-parcel, never an outage
        normalise: (c) => {
            const p = c.props || {};
            // ada/parsel is THE national parcel key (ada 3106 / parsel 258 @ Kadıköy, measured).
            const ada = jsonProp(p, 'adaNo');
            const parsel = jsonProp(p, 'parselNo');
            const refcat = ada !== null && parsel !== null
                ? `${ada}/${parsel}`
                : String(jsonProp(p, 'parselNo', 'adaNo') ?? '').trim();
            // `alan` is the served m² AS A STRING ("816.27"); unparsable → geometry-derived.
            const areaM2 = Number(jsonProp(p, 'alan')) || ringAreaM2(c.ring);
            const address = [jsonProp(p, 'mahalleAd'), jsonProp(p, 'ilceAd'), jsonProp(p, 'ilAd')]
                .filter(Boolean).join(', ');
            return { refcat, areaM2, address: address || null };
        },
    },
    qa: {
        guard: (lat, lon) => lat >= 24.45 && lat <= 26.2 && lon >= 50.6 && lon <= 51.7,
        url: qaUrl,
        format: 'arcgis',
        source: 'qa-gisqatar-cadastre-plots',
        normalise: (c) => {
            const p = c.props || {};
            // PIN is the national plot id (1010028 @ Doha, measured); CDST_KEY equals it on the
            // probed plot and is the fallback. PDAREA is the surveyed plot area in m² (SURVEYED ≠
            // NORMATIVE — it is a geometry fact, not a zoning figure). No address field is served.
            const refcat = String(jsonProp(p, 'PIN', 'CDST_KEY') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'PDAREA')) || ringAreaM2(c.ring);
            return { refcat, areaM2, address: null };
        },
    },
    lv: {
        guard: (lat, lon) => lat >= 55.6 && lat <= 58.1 && lon >= 20.9 && lon <= 28.3,
        url: lvUrl,
        format: 'geojson',
        source: 'lv-vzd-kadastrs-geolatvija',
        normalise: (c) => {
            const p = c.props || {};
            // `code` is the 11-digit cadastral designation (01000070006 @ Rīga, measured); `area`
            // is the cadastre's own registered m² (integer; `area_scale` the finer float).
            const refcat = String(jsonProp(p, 'code') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'area', 'area_scale')) || ringAreaM2(c.ring);
            const address = jsonProp(p, 'address');
            return { refcat, areaM2, address: address ? String(address) : null };
        },
    },
    hr: {
        guard: (lat, lon) => lat >= 42.2 && lat <= 46.56 && lon >= 13.4 && lon <= 19.45,
        url: hrUrl,
        format: 'geojson',
        source: 'hr-dgu-dkp-cp',
        normalise: (c) => {
            const p = c.props || {};
            // COMPOSED display reference "k.č. <BROJ_CESTICE>, k.o. <MATICNI_BROJ_KO>" — exactly
            // parseHrParcelFeature's composition; NOT claimed as the INSPIRE
            // nationalCadastralReference (that lives on the ORA-degraded cp: complex type). No
            // area field is served → geometry-derived, like NO and CH.
            const broj = jsonProp(p, 'BROJ_CESTICE');
            const ko = jsonProp(p, 'MATICNI_BROJ_KO');
            const refcat = broj !== null ? `k.č. ${broj}, k.o. ${ko ?? '?'}` : '';
            return { refcat, areaM2: ringAreaM2(c.ring), address: null };
        },
    },
    gr: {
        guard: (lat, lon) => lat >= 34.7 && lat <= 41.8 && lon >= 19.3 && lon <= 29.7,
        url: grUrl,
        format: 'arcgis',
        source: 'gr-ktimatologio-geotemaxia-leitourgoun',
        normalise: (c) => {
            const p = c.props || {};
            // KAEK is the 12-digit national cadastre code (050095701001 @ Syntagma, measured),
            // opaque — never split. AREA is the register's own m², carried verbatim. DESCR is a
            // land-USE description, not an address — deliberately not surfaced as one.
            const refcat = String(jsonProp(p, 'KAEK') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'AREA')) || ringAreaM2(c.ring);
            return { refcat, areaM2, address: null };
        },
    },
    si: {
        guard: (lat, lon) => lat >= 45.4 && lat <= 46.9 && lon >= 13.35 && lon <= 16.65,
        url: siUrl,
        format: 'geojson',
        source: 'si-gurs-kn-parcele',
        normalise: (c) => {
            const p = c.props || {};
            // Canonical human reference KO_ID + ST_PARCELE ("1725 2468/4"); fall back to the stable
            // EID. POVRSINA is the registered m²; NAZIV the KO id + name ("1725 AJDOVŠČINA").
            const ko = jsonProp(p, 'KO_ID');
            const st = jsonProp(p, 'ST_PARCELE');
            const refcat = (ko !== null && st !== null
                ? `${ko} ${st}`
                : String(jsonProp(p, 'EID_PARCELA') ?? '')).trim();
            const areaM2 = Number(jsonProp(p, 'POVRSINA')) || ringAreaM2(c.ring);
            const address = jsonProp(p, 'NAZIV');
            return { refcat, areaM2, address: address ? String(address) : null };
        },
    },
    sk: {
        guard: (lat, lon) => lat >= 47.7 && lat <= 49.65 && lon >= 16.8 && lon <= 22.6,
        url: skUrl,
        format: 'arcgis',
        source: 'sk-ugkk-eskn-kn-parcela-c',
        normalise: (c) => {
            const p = c.props || {};
            // Composed citizen-facing reference "parc. č. <PARCEL_NUMBER>, k.ú. <CADASTRAL_UNIT_ID>"
            // (parcel №15, k.ú. 2933 @ Bratislava, measured); fall back to the register-C id.
            // DESCRIPTIVE_AREA_OF_PARCEL is the register's own m² (832 measured) — the S-JTSK
            // measure-after-reprojection trap is why it is preferred over the ring.
            const num = jsonProp(p, 'PARCEL_NUMBER');
            const ku = jsonProp(p, 'CADASTRAL_UNIT_ID');
            const refcat = num !== null
                ? `parc. č. ${num}${ku !== null ? `, k.ú. ${ku}` : ''}`
                : String(jsonProp(p, 'ID') ?? '').trim();
            const areaM2 = Number(jsonProp(p, 'DESCRIPTIVE_AREA_OF_PARCEL')) || ringAreaM2(c.ring);
            return { refcat, areaM2, address: null };
        },
    },
};

/**
 * Sentinel for a SEMANTIC HTTP 404 — an upstream whose 404 body means "no parcel here" (TKGM's
 * measured `{"Message":"Parsel Bulunamadı…"}`), which is a durable ABSENCE, never an outage.
 * Only sources declaring `semantic404: true` receive it; everyone else keeps 404 → null →
 * `unreachable`, because for a path-less query endpoint a 404 usually IS a broken route.
 */
const SEMANTIC_404 = Symbol('eu-cadastre-semantic-404');

async function fetchTextOnce(url, deps = {}, opts = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    // `opts.timeoutMs` is a PER-SOURCE override for an upstream measured to be slower than the
    // shared ceiling (today: BE-VLG's GRB WFS at ~20 s). `deps.timeoutMs` still wins so tests can
    // pin it. Without the override a slow-but-HEALTHY cadastre aborts and reports `unreachable`,
    // which is a true statement about our patience and a false one about the register.
    const timeoutMs = deps.timeoutMs || opts.timeoutMs || UPSTREAM_TIMEOUT_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json, application/xml, text/xml, application/gml+xml, */*',
                    'User-Agent': 'PRYZM-Cadastre-Proxy/1.0 (+https://pryzm.fly.dev)',
                    // Per-source extra headers (AU-SA's soft CloudFront WAF Referer). Documented
                    // PUBLIC values only — never a credential, so nothing here can leak a secret.
                    ...(opts.headers || {}),
                },
                signal: ctrl.signal,
            });
            if (res.status === 429 || res.status === 503 || res.status === 504) continue;
            if (res.status === 404 && opts.semantic404) return SEMANTIC_404;
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
 * LANE PT-PARCEL-ACCURACY (2026-09-03): an `empty` outcome from a source whose config declares a
 * `coverageNote` (today: PT only) additionally carries that note verbatim, because for such a
 * source "empty" is USUALLY a publishing gap rather than a ground-truth absence — collapsing the
 * two is exactly the founder-reported defect ("parcels in Portugal are not accurate": an urban
 * click silently degraded to the OSM footprint with no statement that Portugal publishes no urban
 * cadastre). The note rides ONLY on `empty` — an `ok`/`unreachable`/`out-of-area` answer needs no
 * coverage apology and must not carry one.
 *
 * @returns {Promise<{ outcome:'ok'|'empty'|'unreachable'|'unknown-source'|'bad-input'|'out-of-area', parcel: object|null, coverageNote?: string }>}
 */
export async function resolveEuParcelOutcome(cc, lon, lat, deps = {}) {
    const r = await resolveEuParcelOutcomeInner(cc, lon, lat, deps);
    const cfg = EU_CADASTRE_SOURCES[cc];
    if (r.outcome === 'empty' && cfg && typeof cfg.coverageNote === 'string' && cfg.coverageNote) {
        return { ...r, coverageNote: cfg.coverageNote };
    }
    return r;
}

/** The undecorated resolution — every return site here stays a plain `{ outcome, parcel }`. */
async function resolveEuParcelOutcomeInner(cc, lon, lat, deps = {}) {
    const cfg = EU_CADASTRE_SOURCES[cc];
    if (!cfg) return { outcome: 'unknown-source', parcel: null };
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { outcome: 'bad-input', parcel: null };
    // Outside the source's own territory: an authoritative "not covered", NOT a failure.
    if (!cfg.guard(lat, lon)) return { outcome: 'out-of-area', parcel: null };

    const text = await fetchTextOnce(cfg.url(lat, lon), deps, {
        headers: cfg.headers,
        semantic404: cfg.semantic404 === true,
        timeoutMs: cfg.timeoutMs,
    });
    // A SEMANTIC 404 (TR: TKGM's "Parsel Bulunamadı") is the upstream ANSWERING "no parcel here" —
    // a durable absence, classified before the null check so it can never read as an outage.
    if (text === SEMANTIC_404) return { outcome: 'empty', parcel: null };
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
    // A source whose ONLY queryable channel answers in a projected CRS (today: AT's WMS
    // GetFeatureInfo, which must be asked in EPSG:3857 or the ring is rounded to ~110 m and
    // collapses) is converted to WGS84 HERE — before point-in-polygon, so `pickCandidate` compares
    // degrees against degrees. ⛔ Reprojecting AFTER selection would silently pick the wrong parcel:
    // the click's lat/lon would be tested against metre coordinates and every containment test
    // would fail, degrading every AT click to "nearest centroid" over an arbitrary ordering.
    const projected = cfg.reproject === 'epsg3857'
        ? candidates.map((c) => ({ ...c, ring: c.ring.map((pt) => webMercatorToWgs84(pt.lon, pt.lat)) }))
        : candidates;
    // Per-source candidate pre-filter/ordering (AU-QLD id-less "Unlinked parcel" twins, AU-ACT
    // RETIRED lifecycle) — point-in-polygon may only choose among assertable parcels.
    const selectable = typeof cfg.select === 'function' ? cfg.select(projected) : projected;
    const chosen = pickCandidate(selectable, lat, lon);
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
        let coverageNote;
        try {
            ({ outcome, parcel, coverageNote } = await resolveEuParcelOutcome(cc, lon, lat, deps));
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
            // LANE PT-PARCEL-ACCURACY — a source with declared-incomplete coverage (PT) says so on
            // every `empty`, so the client CAN distinguish "no cadastre published here" from "no
            // parcel here". Additive field; absent for sources without a coverageNote.
            if (typeof coverageNote === 'string' && coverageNote) {
                res.setHeader('X-Cadastre-Coverage', 'declared-incomplete');
                return res.status(200).json({ parcel: null, outcome, coverageNote });
            }
            return res.status(200).json({ parcel: null, outcome });
        }
        res.setHeader('X-Cadastre-Cache', 'HIT-OR-FETCH');
        res.setHeader('X-Cadastre-Outcome', 'ok');
        return res.status(200).json({ parcel: { ...parcel, source: cfg.source }, outcome: 'ok' });
    };
}

/** The default production handler (real `fetch`, real endpoints). */
export const euParcelHandler = makeEuParcelHandler();
