#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM context height sources — the LOD-RATE-MASTER "real height" BUILD (L-513 / LOD-200).
//
// WHY: the baked context tiles (`bake.mjs` → `buildings.pmtiles`) carry OSM footprints whose
// `height` is, for the MAJORITY of buildings in most cities, the fabricated 9 m default
// (`DEFAULT_BUILDING_HEIGHT_M`, flagged `heightProvenance:'assumed'` in `contextBuildings.ts`).
// That is LOD 100 — a uniform low-rise carpet, not the real skyline. The LOD-RATE-MASTER
// measurement (`docs/04-reference/jurisdictions/LOD-RATE-MASTER.md`) catalogued, per country, a
// REAL per-building height source. This module turns that catalogue into an INGEST: given a region,
// it fetches the national/authoritative footprint→height dataset so the buildings layer renders at
// **real height (LoD1)** instead of the 9 m guess.
//
// WHAT THIS PRODUCES (the render reality — see the task brief + CONTEXT-3D-PERFORMANCE-ARCHITECTURE):
// the client extrudes footprint × `height` → a flat prism = **LoD1**. So "max LOD buildable NOW"
// is a real per-building `height` (+ `num_floors` / `roof_type` where the source gives them) as a
// tile attribute, replacing the `assumed` default. TRUE LoD2 (real roof geometry) needs a MESH
// render path the client does not have yet — documented as the NEXT tier in CONTEXT-LOD-BUILD-PLAN.md,
// NOT built here.
//
// HONESTY (the load-bearing part — §CONTEXT-DATA-HONESTY, C58):
//   • Every building sourced here carries `heightProvenance` set truthfully:
//       'tagged'         — a real MEASURED height (3DBAG roof height, BD TOPO HAUTEUR, LiDAR nDSM).
//       'derived-levels' — a real FLOOR COUNT × assumed storey height (Catastro ALTURAS). NOT a
//                          measurement, and never labelled as one.
//   • A fabricated height is NEVER emitted as real. Where no source resolves, `resolveHeights`
//     returns `no-source`/`blocked` and the region keeps its OSM footprints (bake.mjs default),
//     i.e. it degrades to Overture (the other agent) → the honest 9 m `assumed` default.
//   • A source that needs auth / is geo-fenced is a `blocked` status with a reason, never a silent
//     skip.
//
// INTEGRATION (ONE line into bake.mjs — the orchestrator reconciles it; this module does NOT edit
// bake.mjs). See §INTEGRATION at the foot of this file and CONTEXT-LOD-BUILD-PLAN.md §Integration.
//
// USAGE (standalone, safe — no toolchain needed, pure Node fetch):
//   node heightSources.mjs --plan            # print the per-region source table, exit
//   node heightSources.mjs --probe           # LIVE-probe the implemented sources (3dbag, bdtopo, catastro)
//   node heightSources.mjs --probe 3dbag     # probe one source
//   node heightSources.mjs --resolve paris   # fetch one region's heights → out/<region>-buildings-national.geojsonseq
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');

// ── clamps (mirror contextBuildings.ts so a stray source value can't make a skyscraper) ─────────
const MIN_HEIGHT_M = 2.5;
const MAX_HEIGHT_M = 400;
const METRES_PER_LEVEL = 3.2; // same assumed storey height the client uses for derived-levels.
const clampHeight = (h) => Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, h));

// ── small honest helpers ────────────────────────────────────────────────────
/** {min,median,max,n} for an array of numbers, or null. Load-bearing evidence in probes/reports. */
function statsOf(arr) {
  const a = arr.filter((x) => Number.isFinite(x));
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  return { min: s[0], median: s[(s.length / 2) | 0], max: s[s.length - 1], n: s.length };
}
/** UTM zone number for a longitude (deg). Spain: lon −6..0 → 30 (EPSG:25830), 0..6 → 31 (25831). */
const utmZoneForLon = (lon) => Math.floor((lon + 180) / 6) + 1;
/** A city clip is small; a WFS bbox query over a whole country is infeasible. Guard (deg span). */
const bboxTooLargeForWfs = ([w, s, e, n], maxSpanDeg = 0.6) => (e - w) > maxSpanDeg || (n - s) > maxSpanDeg;
/** CityGML AdV roofType code → OSM roof:shape (for the LoD2 tier); unknown codes pass through. */
const NRW_ROOF = {
  1000: 'flat', 2100: 'skillion', 2200: 'skillion', 3100: 'gabled', 3200: 'hipped',
  3300: 'half-hipped', 3400: 'mansard', 3500: 'pyramidal', 3600: 'conical', 3700: 'dome',
  5000: 'dome', 9999: undefined,
};

// ── HTTP with a timeout, never-throw at the call sites that want graceful degradation ───────────
async function httpGet(url, { timeoutMs = 30_000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers });
    const contentType = res.headers.get('content-type') ?? '';
    const body = await res.text();
    return { ok: res.ok, status: res.status, contentType, body };
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE CATALOGUE — one entry per authoritative height source in LOD-RATE-MASTER.
// `impl` = 'live' (a working fetcher below, live-probed) · 'documented' (endpoint characterised,
// fetcher is the NEXT build step) · 'blocked' (auth/geo-fence/licence gate — a real barrier, not a
// skip). `provenance` = the honest label every building from the source will carry.
// ─────────────────────────────────────────────────────────────────────────────
export const SOURCES = {
  '3dbag': {
    country: 'nl', name: '3DBAG (BAG × AHN LiDAR)', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (roof geometry present)',
    endpoint: 'https://api.3dbag.nl/collections/pand/items',
    heightField: 'b3_h_dak_50p (roof 50-pctile) / b3_h_nok (ridge), minus b3_h_maaiveld (ground)',
    note: 'OGC API Features. CityJSON, CRS EPSG:7415 (RD+NAP). Footprint ingest BUILT 2026-07-25: ' +
      'LoD0 MultiSurface vertices × metadata.transform → RD → rdToWgs84 → WGS84 rings; paginates ' +
      '100/page via rel:next. b3_dak_type is the LoD2-mesh attribute for the next tier.',
    coverage: 'full',
  },
  bdtopo: {
    country: 'fr', name: 'IGN BD TOPO® batiment', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (needs LiDAR HD reconstruction)',
    endpoint: 'https://data.geopf.fr/wfs/ows',
    heightField: 'hauteur (m, photogrammetry/LiDAR) + nombre_d_etages (storeys)',
    note: 'WFS 2.0. Returns GeoJSON in EPSG:4326 directly — fully wireable, no reprojection.',
  },
  catastro: {
    country: 'es', name: 'Catastro INSPIRE Buildings', impl: 'live',
    provenance: 'derived-levels', lodNow: 'LoD1-floorcount', lodNext: 'LoD1-real-height (needs PNOA/ICGC nDSM)',
    endpoint: 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx',
    heightField: 'BuildingPart numberOfFloorsAboveGround (a COUNT, ×3.2 m — NOT a measurement)',
    note: 'WFS 2.0. Footprint ingest BUILT 2026-07-25: BuildingPart gml:posList (server returns EXACT ' +
      'WGS84 via srsName=4326; native ETRS89/UTM30N|31N is the honest fallback) → Polygon rings; ' +
      'single-shot per bbox (startIndex is IGNORED, count loosely caps Buildings), whole-country/large ' +
      'bbox refused (tile to per-city bboxes; full city = INSPIRE ATOM bulk). ⚠ ALTURAS is ' +
      'a floor COUNT → provenance derived-levels, never tagged. Measured height needs a LiDAR nDSM ' +
      '(PNOA/ICGC), licence UNVERIFIED — not built.',
    coverage: 'full',
  },
  swissbuildings3d: {
    country: 'ch', name: 'swissBUILDINGS3D 2.0/3.0 + GWR', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (native roofs, incl. overhangs)',
    endpoint: 'swisstopo product (CityGML 2.0) + GWR madd.bfs.admin.ch/eCH-0206',
    heightField: 'volumetric solid height (±30–50 cm) + GWR GASTW storeys',
    note: 'National LoD2 since 2018. Bulk CityGML download (not a live bbox API) → offline extract, ' +
      'join to GWR by EGID. Fetcher = CityGML parser, the next build step.',
  },
  lod2de: {
    country: 'de', name: 'LoD2-DE (per-Land CityGML)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (real CityGML roof planes)',
    endpoint: 'per-Land, e.g. opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/ (NRW open)',
    heightField: 'CityGML measuredHeight + roof planes; ALKIS traufhoehe/firsthoehe LoD1 fallback',
    note: '~58M buildings nationally, ~1 m accuracy. DRAG is per-Land licence routing: NRW/Berlin/BW/' +
      'Sachsen-Anhalt open; Bavaria/Hamburg TBD (→ blocked per-Land). Needs a Land→tile router. NRW is ' +
      'the LIVE reference implementation — see `lod2de_nrw` + fetchLod2DeNrw; Berlin needs its own ' +
      'FIS-Broker endpoint (the per-Land router is the remaining wiring).',
  },
  // NRW is the LIVE, keyless LoD2-DE reference (opengeodata.nrw.de open tile service). ⚠ Berlin (the
  // only `lod2de`-mapped bake region) is a DIFFERENT Land with a different endpoint, so this source is
  // reachable via the Cologne probe, not via a bake region yet — honest until a NRW region is added.
  lod2de_nrw: {
    country: 'de', name: 'LoD2-DE · NRW (opengeodata.nrw.de, open)', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (native CityGML roof planes)',
    endpoint: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/',
    heightField: 'CityGML bldg:measuredHeight (m) + bldg:roofType code (1000 flat/3100 gable/3200 hip…)',
    note: 'Keyless open tile service (35,022 × 1 km CityGML tiles, ETRS89/UTM32, index.json). ' +
      'Footprint ingest BUILT 2026-07-25: bbox → UTM32 1 km tile key → per-Kachel .gml → per-Building ' +
      'GroundSurface gml:posList (X Y Z, UTM32) → utmNToWgs84 → WGS84 rings + measuredHeight + roofType. ' +
      'Byte-range sample is truncated→append; pass fullTile for the whole 1 km tile (replace).',
    coverage: 'full',
  },
  geodanmark: {
    country: 'dk', name: 'Danmark i 3D / GeoDanmark + BBR', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (real roofs)',
    endpoint: 'https://wfs.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_NOHIST_GML3/1.0.0/WFS (gdk60:Bygning) + DHM nDSM + BBR',
    heightField: 'GeoDanmark bygning = FOOTPRINT ONLY (NO height attr — verified); height via DHM nDSM (DSM−DTM) or BBR ETAGER_ANT floors (BBRUUID join)',
    note: 'Richest EU building register — but ⚠ GeoDanmark `Bygning` carries NO scalar height (VERIFIED ' +
      '2026-07-25 against the Datafordeler objekttypekatalog: attrs BBRUUID/bygningstype/målestedBygning/' +
      'metode3D/underMinimumBygning/BBRaktion/synligBygning/overlapBygning/geometri; metode3D is capture-' +
      'method, not a height). apikey-GATED: Basic Auth was RETIRED (git 1fc5bc8b); the 2026 host takes ' +
      '&apikey=<DATAFORDELER_API_KEY> (reuse the Matrikel/DHM key). No keyless bbox path (wfs.datafordeler.dk ' +
      '→ HTTP 401 without a key). fetchGeoDanmark returns `blocked` (no key) or `documented` (footprints ' +
      'reached, NO height → region keeps OSM). Real LoD1 height = DHM DSM−DTM nDSM or BBR floors — the follow-up.',
    coverage: 'full',
  },
  overture_us: {
    country: 'us', name: 'Overture height + USGS 3DEP nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (partial)', lodNext: 'LoD2-mesh (per-city: NYC/LA/Chicago)',
    endpoint: 'Overture GeoParquet (S3) + tnmaccess.nationalmap.gov 3DEP 1 m LiDAR',
    heightField: 'Overture height/num_floors (~20M, growing) + 3DEP DSM−DTM nDSM (>60% of US)',
    note: 'Coordinate with the Overture agent — Overture is the global footprint+height base; the ' +
      '3DEP nDSM is the national-accuracy top-up (US analogue of FR LiDAR HD). No national parcel.',
  },
  ndh_no: {
    country: 'no', name: 'Matrikkelen point + NDH nDSM (free path)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (coarse)', lodNext: 'LoD2-mesh (self-reconstruct)',
    endpoint: 'Geonorge WFS (Matrikkelen) + hoydedata.no NDH LiDAR',
    heightField: 'NDH DSM−DTM nDSM per footprint (FKB top-height is licence-gated commercial)',
    note: 'FKB-Bygning surveyed height is commercial-licensed → the FREE path is the coarser NDH nDSM. ' +
      'No national LoD2. Shares the nDSM module with ES/PT/SE.',
  },
  lidar_se: {
    country: 'se', name: 'Lantmäteriet CC0 footprints + national LiDAR nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (fee-based municipal)',
    endpoint: 'Lantmäteriet INSPIRE BU (CC0) + national LiDAR point cloud',
    heightField: 'DSM−DTM nDSM per building',
    note: 'Free national LoD1 via nDSM. LoD2 volumes are per-municipality PAID (Stockholm confirmed). ' +
      'Account+scope to download. Shares the nDSM module.',
  },
  dgt_pt: {
    country: 'pt', name: 'DGT national LiDAR nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2/3 (Lisbon CML model)',
    endpoint: 'DGT CDD LiDAR (2024–25, 10 pts/m², open) + Overture/OSM footprints',
    heightField: 'DSM−DTM nDSM 90th-pctile per footprint',
    note: 'Good height (~75%) but NO national footprint layer (use Overture/OSM) and weak parcels ' +
      '(Carta Cadastral ~134 munis, NOT Lisbon/Porto cores). Shares the nDSM module.',
  },
  piedmont_it: {
    country: 'it', name: 'ARPA Piemonte Edifici 3D (Turin only)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (Piedmont only)', lodNext: 'per-region reconstruction',
    endpoint: 'opendata.arpa.piemonte.it (Edifici 3D)',
    heightField: 'per-building volume + mean elevation + quality code',
    note: 'No NATIONAL Italian building-height product (PST/SIM LiDAR = terrain only). Only Piedmont/' +
      'Turin has a real layer; Rome/Milan = no-source (OSM 9 m). Structural gap, not a currency lag.',
  },
  grb_be: {
    country: 'be', name: '3D GRB LoD1 DHMV (Flanders only)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (Flanders only)', lodNext: 'none (no LoD2 anywhere in BE)',
    endpoint: 'CADMAP federal footprints + Flanders 3D GRB Gebouw LoD1 DHMV II',
    heightField: 'GRB block-model ridge height (DHMV II LiDAR)',
    note: 'Height structured ONLY in Flanders. Brussels (UrbIS) / Wallonia (PICC) height UNKNOWN → ' +
      'blocked-until-probed. Three separate schemas, no shared model.',
  },
  ml_sa: {
    country: 'sa', name: 'Microsoft ML footprints + GLO-30 DEM', impl: 'blocked',
    provenance: 'assumed', lodNow: 'LOD100 (coarse)', lodNext: 'needs GEOSA/Balady data agreement',
    endpoint: 'Balady MapServer (GEO-FENCED, 403 from outside SA) — national line licensed',
    heightField: 'none reachable (Balady NOOFFLOORS geo-fenced); GLO-30 30 m DEM is a sanity layer',
    note: '⚠ BLOCKED: the national product is geo-fenced (403 measured). Reachable = ML footprints + ' +
      'coarse DEM only — NO real per-building height. Region keeps OSM 9 m; do NOT fabricate a height.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// REGION → SOURCE. Maps each `bake.mjs` REGIONS entry to its height source (or an honest gap).
// A region absent here (or mapped to a no-source country) keeps OSM footprints = 9 m assumed.
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_SOURCE = {
  // ES — all Catastro (floor-count → derived-levels). ⚠ A Catastro WFS bbox query CANNOT cover a whole
  // country (server caps + scattered partials), so the `spain` whole-country box returns `documented`
  // (keeps OSM) — see fetchCatastro's bboxTooLargeForWfs guard. To make Spain REAL, bake.mjs REGIONS
  // must enumerate PER-CITY Spanish entries (city bbox → Catastro); the mappings below are ready so
  // the orchestrator only adds the matching bbox rows (spain-latest.osm.pbf already covers them all):
  //   barcelona '2.05,41.32,2.24,41.47'   madrid '-3.80,40.33,-3.60,40.52'
  //   cordoba   '-4.85,37.83,-4.72,37.93'  valencia '-0.42,39.42,-0.30,39.52'
  //   sevilla   '-6.03,37.32,-5.90,37.43'  malaga '-4.50,36.66,-4.35,36.76'
  //   zaragoza  '-0.95,41.60,-0.80,41.70'  bilbao '-2.98,43.22,-2.88,43.29'
  spain: 'catastro',
  barcelona: 'catastro', madrid: 'catastro', cordoba: 'catastro', valencia: 'catastro',
  sevilla: 'catastro', malaga: 'catastro', zaragoza: 'catastro', bilbao: 'catastro',
  // NL
  amsterdam: '3dbag',
  // FR
  paris: 'bdtopo', lyon: 'bdtopo',
  // CH
  zurich: 'swissbuildings3d', geneva: 'swissbuildings3d', bern: 'swissbuildings3d',
  // DE — Berlin open; Munich (Bavaria) licence TBD → blocked per-Land.
  berlin: 'lod2de',
  munich: { source: 'lod2de', status: 'blocked', reason: 'Bavaria LoD2 licence TBD (ZSHH INSPIRE-restricted)' },
  // DK
  copenhagen: 'geodanmark',
  // US
  newyork: 'overture_us', sanfrancisco: 'overture_us',
  // NO / SE / PT
  oslo: 'ndh_no', stockholm: 'lidar_se', lisbon: 'dgt_pt', porto: 'dgt_pt',
  // IT — Turin has a source; Rome/Milan do not.
  milan: { source: 'piedmont_it', status: 'no-source', reason: 'Lombardy building-height layer unconfirmed — no source for Milan' },
  rome: { source: 'piedmont_it', status: 'no-source', reason: 'Lazio building-height layer unconfirmed — no source for Rome' },
  // BE — Brussels is UrbIS, height unknown.
  brussels: { source: 'grb_be', status: 'blocked', reason: 'Brussels UrbIS height attribute unprobed; GRB height is Flanders-only' },
  // SA — geo-fenced.
  riyadh: 'ml_sa', jeddah: 'ml_sa',
  // GB / FI — not in LOD-RATE-MASTER (no national open height source wired).
  london: { source: null, status: 'no-source', reason: 'OS Building Heights is licensed; GB not in LOD-RATE-MASTER' },
  helsinki: { source: null, status: 'no-source', reason: 'FI not in LOD-RATE-MASTER (Helsinki has open LoD2 — candidate to add)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// §PHASE1-DEDUP — replace-vs-append policy (CONTEXT-LOD-BUILD-PLAN.md §3). A FULL national source
// (3DBAG/BD TOPO/Catastro/LoD2-DE/GeoDanmark/swissBUILDINGS3D) describes the SAME buildings as the OSM
// clip → REPLACE it (no double-draw at 9 m + real height). A PARTIAL source (nDSM top-ups: 3DEP,
// NDH, DGT, GRB, Piedmont) fills gaps → APPEND, and the client near-cap thins any twins.
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_COVERAGE = {
  '3dbag': 'full', bdtopo: 'full', catastro: 'full', lod2de: 'full', lod2de_nrw: 'full',
  geodanmark: 'full', swissbuildings3d: 'full',
  overture_us: 'partial', ndh_no: 'partial', lidar_se: 'partial', dgt_pt: 'partial',
  piedmont_it: 'partial', grb_be: 'partial', ml_sa: 'none',
};
/** Bake dedup mode for a source id: full → 'replace', partial → 'append'. */
export function heightModeForSource(source) {
  const cov = SOURCES[source]?.coverage ?? SOURCE_COVERAGE[source] ?? 'partial';
  return cov === 'full' ? 'replace' : 'append';
}

/** Normalise a REGION_SOURCE entry to `{ source, status, reason }`. */
export function sourceForRegion(region) {
  const raw = REGION_SOURCE[region];
  if (raw === undefined) return { source: null, status: 'no-source', reason: `region "${region}" has no mapped height source` };
  if (typeof raw === 'string') return { source: raw, status: SOURCES[raw]?.impl === 'live' ? 'ok' : SOURCES[raw]?.impl ?? 'unknown', reason: null };
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE FETCHERS — the top 3 (3DBAG, BD TOPO, Catastro). Each returns
//   { status:'ok', features:[GeoJSON Feature…], provenance } | { status:'blocked'|'error', reason }
// A feature's properties carry `height` (m), optional `num_floors`, optional `roof_type`, and
// `heightProvenance` (the honest label). bake.mjs joins `height` as the tile attribute the client's
// resolveHeightWithProvenance reads.
// ─────────────────────────────────────────────────────────────────────────────

/** bbox = [minlon, minlat, maxlon, maxlat] (WGS84). */

// ── FR BD TOPO — fully wireable: WFS 2.0 → GeoJSON EPSG:4326, real `hauteur`. ───────────────────
// ⚠ AXIS ORDER: data.geopf.fr with SRSNAME=EPSG:4326 takes BBOX as lon,lat (minX,minY,maxX,maxY) —
// live-verified 2026-07-24 (lat,lon returned 0 features; lon,lat returned real buildings).
export async function fetchBdTopo(bbox, { limit = 5000, timeoutMs = 40_000 } = {}) {
  const [w, s, e, n] = bbox;
  const url = `${SOURCES.bdtopo.endpoint}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=BDTOPO_V3:batiment&SRSNAME=EPSG:4326` +
    `&BBOX=${w},${s},${e},${n},EPSG:4326&COUNT=${limit}&OUTPUTFORMAT=application/json`;
  try {
    const r = await httpGet(url, { timeoutMs });
    if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    if (!/json/i.test(r.contentType)) return { status: 'error', reason: `unexpected content-type ${r.contentType}` };
    const json = JSON.parse(r.body);
    const features = [];
    for (const f of json.features ?? []) {
      const h = Number(f.properties?.hauteur);
      const floors = Number(f.properties?.nombre_d_etages);
      if (!Number.isFinite(h) || h <= 0) continue; // null HAUTEUR → skip (region keeps OSM/Overture for it).
      features.push(toFeature(f.geometry, nationalBuildingTags({
        // ⚠ WIRE-CRITICAL: `building` MUST be present or the client tile reader's belongsToLayer()
        // (contextTiles.ts) drops the feature — a national footprint with no `building` tag renders
        // as ZERO buildings. `height` is the MEASURED hauteur → the client derives `tagged` from it.
        heightM: clampHeight(h),
        floors: Number.isFinite(floors) && floors > 0 ? Math.round(floors) : undefined,
        provenance: 'tagged',
        source: 'bdtopo',
      })));
    }
    return { status: 'ok', features, provenance: 'tagged', contentType: r.contentType, rawCount: json.features?.length ?? 0 };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/**
 * Approximate WGS84 → RD New (EPSG:28992) — Schreutelkamp & Strang van Hees closed form,
 * accurate to ~0.25 m over the Netherlands. Plenty for a bbox SELECTION; the returned building
 * geometry is separately reprojected RD→WGS84 in the ingest step.
 * ⚠ Needed because the 3DBAG `items` API interprets `bbox` in RD, NOT lon/lat — live-verified
 * 2026-07-24 (a WGS84 Amsterdam bbox returned 0; the same box in RD returned buildings).
 */
export function wgs84ToRD(lat, lon) {
  const dLat = 0.36 * (lat - 52.15517440);
  const dLon = 0.36 * (lon - 5.38720621);
  const Rpq = [[0, 1, 190094.945], [1, 1, -11832.228], [2, 1, -114.221], [0, 3, -32.391],
    [1, 0, -0.705], [3, 1, -2.340], [1, 3, -0.608], [0, 2, -0.008], [2, 3, 0.148]];
  const Spq = [[1, 0, 309056.544], [0, 2, 3638.893], [2, 0, 73.077], [1, 2, -157.984],
    [3, 0, 59.788], [0, 1, 0.433], [2, 2, -6.439], [1, 1, -0.032], [0, 4, 0.092], [1, 4, -0.054]];
  let X = 155000, Y = 463000;
  for (const [p, q, c] of Rpq) X += c * dLat ** p * dLon ** q;
  for (const [p, q, c] of Spq) Y += c * dLat ** p * dLon ** q;
  return [X, Y];
}

// ── NL 3DBAG — OGC API Features. Heights are true LoD2 attrs; the `items` bbox is in RD. ─────────
// The load-bearing LoD1 value is the roof-50pctile MINUS ground (b3_h_dak_50p − b3_h_maaiveld); the
// roof planes + b3_dak_type are the LoD2-mesh attributes the next tier uses.
// GEOMETRY INGEST (built 2026-07-25): the CityJSONFeature carries `vertices` (integers) + a global
// `metadata.transform` (scale/translate); the Building object's LoD0 MultiSurface indexes the
// footprint ring → decode to RD (28992) → rdToWgs84 → WGS84 [lon,lat]. Height = b3_h_dak_50p −
// b3_h_maaiveld (roof − ground) → `height` (tagged). The `items` bbox is in RD and paginates at
// 100/page via a rel:next link; a truncated fetch downgrades to append (never deletes OSM).
export async function fetch3dbag(bbox, { limit = 100, timeoutMs = 60_000, maxPages = 50 } = {}) {
  const [w, s, e, n] = bbox;
  const [x0, y0] = wgs84ToRD(s, w);
  const [x1, y1] = wgs84ToRD(n, e);
  const rdBbox = `${Math.round(Math.min(x0, x1))},${Math.round(Math.min(y0, y1))},` +
    `${Math.round(Math.max(x0, x1))},${Math.round(Math.max(y0, y1))}`;
  let url = `${SOURCES['3dbag'].endpoint}?bbox=${rdBbox}&limit=${limit}`;
  const features = [];
  const heights = [];
  let pages = 0, truncated = false, lastCt = '', numberMatched = null;
  try {
    for (; pages < maxPages && url; pages++) {
      const r = await httpGet(url, { timeoutMs, headers: { Accept: 'application/city+json, application/json' } });
      if (!r.ok) { if (pages === 0) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType }; break; }
      lastCt = r.contentType;
      const json = JSON.parse(r.body);
      if (numberMatched == null) numberMatched = Number.isFinite(json.numberMatched) ? json.numberMatched : null;
      const transform = json.metadata?.transform ?? json.transform ?? null;
      for (const it of json.features ?? []) {
        const built = build3dbagFeature(it, transform);
        if (built === null) continue;                     // no real height OR no placeable footprint → skip
        heights.push(built.properties.height);
        features.push(built);
      }
      url = (json.links ?? []).find((l) => l.rel === 'next')?.href ?? null;
    }
    if (pages >= maxPages && url) truncated = true;
    return {
      status: 'ok', provenance: 'tagged', contentType: lastCt, features, truncated,
      rawCount: numberMatched ?? features.length, heightStats: statsOf(heights),
      heightSamples: heights.slice(0, 8),
      note: `3DBAG roof−ground height → tagged; ${features.length} LoD0 footprint(s) RD→WGS84` +
        `${truncated ? ' (TRUNCATED at page cap → append)' : ''}.`,
    };
  } catch (err) {
    if (features.length > 0) {
      return { status: 'ok', provenance: 'tagged', contentType: lastCt, features, truncated: true,
        rawCount: numberMatched ?? features.length, heightStats: statsOf(heights), note: `partial (network): ${String(err?.message ?? err)}` };
    }
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/** A 3DBAG CityJSONFeature → a WGS84 footprint Feature (real height), or null (skip honestly). */
function build3dbagFeature(item, transform) {
  const attrs = extract3dbagAttrs(item);
  if (attrs === null) return null;                          // no real roof−ground height → skip
  const ring = extract3dbagFootprint(item, transform);
  if (ring === null) return null;                           // no LoD0 footprint we can place → skip
  return toFeature(
    { type: 'Polygon', coordinates: [ring] },
    nationalBuildingTags({
      heightM: clampHeight(attrs.height), provenance: 'tagged', source: '3dbag',
      ...(attrs.roofType ? { roofType: attrs.roofType } : {}),
    }),
  );
}

/** LoD0 footprint ring (RD→WGS84 [lon,lat]) from a 3DBAG CityJSONFeature, or null. */
function extract3dbagFootprint(item, transform) {
  const verts = item?.vertices;
  const cos = item?.CityObjects ?? item?.feature?.CityObjects;
  if (!Array.isArray(verts) || !cos || !transform?.scale || !transform?.translate) return null;
  // Prefer the Building object's LoD0 MultiSurface; else any object carrying an lod:0 geometry.
  let boundaries = null;
  for (const obj of Object.values(cos)) {
    const g = (obj?.geometry ?? []).find((gg) => String(gg.lod) === '0' || String(gg.lod) === '0.0');
    if (!g) continue;
    if (obj.type === 'Building') { boundaries = g.boundaries; break; }
    if (!boundaries) boundaries = g.boundaries;
  }
  // MultiSurface boundaries = [ surface ][ ring ][ vertexIdx ]; take the first surface's outer ring.
  const idxRing = boundaries?.[0]?.[0];
  if (!Array.isArray(idxRing) || idxRing.length < 3) return null;
  const [sx, sy] = transform.scale, [tx0, ty0] = transform.translate;
  const ring = [];
  for (const idx of idxRing) {
    const v = verts[idx];
    if (!Array.isArray(v)) return null;
    const { lat, lon } = rdToWgs84(v[0] * sx + tx0, v[1] * sy + ty0);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  const f = ring[0], l = ring[ring.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
  return ring;
}

/** Pull a real height (roof − ground) + roof type out of a 3DBAG CityJSONFeature. */
function extract3dbagAttrs(item) {
  // The OGC API nests the CityJSON under `feature.CityObjects` (or the attrs are hoisted to
  // `item.properties`/`item.attributes`). Probe both shapes defensively.
  const bag = collect3dbagAttrObjects(item);
  for (const a of bag) {
    const roof = num(a.b3_h_dak_50p) ?? num(a.b3_h_dak_70p) ?? num(a.b3_h_nok) ?? num(a.b3_h_dak_max);
    const ground = num(a.b3_h_maaiveld) ?? 0;
    if (roof !== null && roof > ground) {
      return { height: roof - ground, roofType: typeof a.b3_dak_type === 'string' ? a.b3_dak_type : null };
    }
  }
  return null;
}
function collect3dbagAttrObjects(item) {
  const out = [];
  if (item?.properties) out.push(item.properties);
  if (item?.attributes) out.push(item.attributes);
  const cos = item?.feature?.CityObjects ?? item?.CityObjects;
  if (cos) for (const co of Object.values(cos)) if (co?.attributes) out.push(co.attributes);
  return out;
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ── ES Catastro — INSPIRE Buildings WFS. Height is a FLOOR COUNT → derived-levels (honest). ─────
// GEOMETRY INGEST (built 2026-07-25): each <bu-ext2d:BuildingPart> carries a gml:posList footprint
// (exterior + optional interior rings) AND numberOfFloorsAboveGround. srsName=EPSG:4326 makes the
// server return EXACT WGS84 (lat,lon) posLists — better than a local reprojection, so the ring is
// used directly (posListToWgs84Ring auto-detects the degree axis; the UTM30/31 route is the honest
// fallback if the server ever emits native ETRS89/UTM). Floors → `building:levels` (derived-levels);
// NEVER a fabricated metric height.
//
// ⚠ PAGINATION — this WFS is SINGLE-SHOT. LIVE-VERIFIED 2026-07-25: `startIndex` is IGNORED (a
// startIndex=5000 request returned byte-identical data to startIndex=0) and `count` loosely caps the
// number of parent Buildings (count=N → ≈N buildings → ~6–7×N parts), and the endpoint is slow
// (~50 s for ~1000 buildings). So we do ONE request per bbox and detect truncation by whether the
// distinct-Building count hit the cap; a truncated fetch downgrades to append (never deletes OSM).
// FULL per-city coverage (dense cities > `buildingCap`) needs the Catastro INSPIRE ATOM
// MUNICIPALITY bulk GML (one file per municipio) — the named next build, not this slow WFS.
export async function fetchCatastro(bbox, { buildingCap = 3000, timeoutMs = 120_000, capabilitiesOnly = false } = {}) {
  const base = SOURCES.catastro.endpoint;
  if (capabilitiesOnly) {
    const r = await httpGet(`${base}?service=WFS&request=GetCapabilities`, { timeoutMs }).catch((e) => ({ ok: false, reason: String(e) }));
    return { status: r.ok ? 'ok' : 'error', contentType: r.contentType, hasBuilding: /bu:Building/.test(r.body ?? ''), reason: r.reason };
  }
  if (!bbox) return { status: 'error', reason: 'no bbox supplied for catastro' };
  const [w, s, e, n] = bbox;
  // A whole-country/large WFS bbox is infeasible (single-shot + slow) — refuse LOUDLY so the caller
  // keeps OSM rather than baking misleading coverage. Cities are enumerated as per-city bboxes.
  if (bboxTooLargeForWfs(bbox)) {
    return { status: 'documented', provenance: 'derived-levels',
      reason: `Catastro bbox ${(e - w).toFixed(2)}°×${(n - s).toFixed(2)}° is too large for a single WFS query; ` +
        'tile to per-neighbourhood bboxes (≤~0.6°) or use the INSPIRE ATOM municipality bulk GML.' };
  }
  const zone = utmZoneForLon((w + e) / 2); // fallback CRS only if a native-UTM posList ever appears.
  const features = [];
  const floorsAll = [];
  const buildingIds = new Set();
  try {
    // BBOX axis order = lat,lon (urn CRS). Single request; `count` caps parent Buildings.
    const url = `${base}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bu:BuildingPart` +
      `&srsName=urn:ogc:def:crs:EPSG::4326&bbox=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326&count=${buildingCap}`;
    const r = await httpGet(url, { timeoutMs });
    if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    const members = r.body.match(/<bu-ext2d:BuildingPart\b[\s\S]*?<\/bu-ext2d:BuildingPart>/g) ?? [];
    for (const m of members) {
      const idM = m.match(/gml:id="([^"]+?)(?:_part\d+)?"/);
      if (idM) buildingIds.add(idM[1]); // strip _partN → the parent Building refcat, to detect the cap.
      const extM = m.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
      if (!extM) continue;                                   // no footprint → skip
      const exterior = posListToWgs84Ring(extM[1], { dim: 2, srsZone: zone });
      if (!exterior) continue;                               // unparseable ring → honest skip
      const interiors = [...m.matchAll(/<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)]
        .map((x) => posListToWgs84Ring(x[1], { dim: 2, srsZone: zone })).filter(Boolean);
      const fm = m.match(/numberOfFloorsAboveGround>\s*(\d+)/i);
      const floors = fm ? Number(fm[1]) : undefined;
      if (Number.isFinite(floors) && floors > 0) floorsAll.push(floors);
      features.push(toFeature(
        { type: 'Polygon', coordinates: [exterior, ...interiors] },
        nationalBuildingTags({
          floors: Number.isFinite(floors) && floors > 0 ? floors : undefined,
          provenance: 'derived-levels', source: 'catastro',
        }),
      ));
    }
    // Cap hit (distinct buildings ≥ requested cap) → the bbox has more than one request can return
    // and startIndex can't page → honest truncation → append (no OSM deletion).
    const truncated = buildingIds.size >= buildingCap;
    return {
      status: 'ok', provenance: 'derived-levels', contentType: r.contentType, features, truncated,
      buildingCount: members.length, distinctBuildings: buildingIds.size,
      populatedFloors: floorsAll.length, floorSamples: floorsAll.slice(0, 8), floorStats: statsOf(floorsAll),
      note: `Catastro BuildingPart floor count → derived-levels (client ×${METRES_PER_LEVEL} m); ` +
        `${features.length} footprint(s) → WGS84${truncated ? ' (cap hit → append; use ATOM bulk for full city)' : ''}. ` +
        'Measured height needs an nDSM (PNOA/ICGC) — not built.',
    };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/**
 * WGS84 (lat,lon) → ETRS89/UTM zone 32N (EPSG:25832) easting/northing, metres. Snyder transverse
 * Mercator on the GRS80/WGS84 ellipsoid (ETRS89≈WGS84 to <1 m — ample for selecting a 1 km tile).
 * Used ONLY to turn a bbox into the NRW LoD2 `LoD2_32_<eKm>_<nKm>_1_NW.gml` tile key.
 */
export function wgs84ToUtm32(lat, lon) {
  const a = 6378137.0, f = 1 / 298.257223563, k0 = 0.9996, lon0 = (9 * Math.PI) / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const φ = (lat * Math.PI) / 180, λ = (lon * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2, C = ep2 * Math.cos(φ) ** 2, A = Math.cos(φ) * (λ - lon0);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * φ
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * φ)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * φ)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * φ));
  const easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6
    + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const northing = k0 * (M + N * Math.tan(φ) * ((A ** 2) / 2
    + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24
    + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [easting, northing];
}

// ─────────────────────────────────────────────────────────────────────────────
// §REPROJECT — ONE honest inverse-projection helper set (no proj4). Mirrors the proven
// server/dkMatrikelProxy.js `utm32nToWgs84` (Snyder inverse TM), GENERALISED per UTM zone so the
// same maths serve ES UTM30N/31N (EPSG:25830/25831) AND DE UTM32N (25832); `rdToWgs84` is the exact
// inverse of this file's forward `wgs84ToRD` polynomial (NL EPSG:28992). ETRS89 ≈ WGS84 (<1 m).
// EVERY source's footprint ring flows through `posListToWgs84Ring`, so there is no per-source
// copy-paste of reprojection maths (the task's single-helper requirement). A vertex that can't be
// honestly placed → the whole ring is dropped (null), never emitted at a fabricated coordinate
// (§CONTEXT-DATA-HONESTY). Validated live 2026-07-25: UTM32 Köln, RD Amsterdam, UTM30 Madrid,
// UTM31 Barcelona all reproject to within metres of the query centroid.
// ─────────────────────────────────────────────────────────────────────────────

/** ETRS89/UTM zone `zone`N easting/northing (m) → { lat, lon } WGS84 deg. Snyder inverse TM.
 *  zone 30 → EPSG:25830 (central meridian −3°), 31 → 25831 (+3°, Barcelona/Catalonia), 32 → 25832
 *  (+9°, NRW). Zone-parameterised mirror of dkMatrikelProxy.utm32nToWgs84. */
export function utmNToWgs84(E, N, zone) {
  const a = 6378137.0, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const lon0 = ((zone * 6 - 183) * Math.PI) / 180, falseE = 500000;
  const M = N / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sinP = Math.sin(phi1), cosP = Math.cos(phi1), tanP = Math.tan(phi1);
  const C1 = ep2 * cosP * cosP, T1 = tanP * tanP;
  const N1 = a / Math.sqrt(1 - e2 * sinP * sinP);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinP * sinP, 1.5);
  const D = (E - falseE) / (N1 * k0);
  const lat = phi1 - (N1 * tanP / R1) * ((D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / cosP;
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

/** RD New (EPSG:28992) X,Y (m) → { lat, lon } WGS84 deg. Schreutelkamp & Strang van Hees inverse
 *  polynomial — the exact inverse of this file's forward `wgs84ToRD`; ~0.25 m over the Netherlands. */
const _RD_INV_K = [[0, 1, 3235.65389], [2, 0, -32.58297], [0, 2, -0.24750], [2, 1, -0.84978],
  [0, 3, -0.06550], [2, 2, -0.01709], [1, 0, -0.00738], [4, 0, 0.00530], [2, 3, -0.00039],
  [4, 1, 0.00033], [1, 1, -0.00012]];
const _RD_INV_L = [[1, 0, 5260.52916], [1, 1, 105.94684], [1, 2, 2.45656], [3, 0, -0.81885],
  [1, 3, 0.05594], [3, 1, -0.05607], [0, 1, 0.01199], [3, 2, -0.00256], [1, 4, 0.00128],
  [0, 2, 0.00022], [2, 0, -0.00022], [5, 0, 0.00026]];
export function rdToWgs84(X, Y) {
  const dx = 1e-5 * (X - 155000), dy = 1e-5 * (Y - 463000);
  let sp = 0, sl = 0;
  for (const [p, q, c] of _RD_INV_K) sp += c * dx ** p * dy ** q;
  for (const [p, q, c] of _RD_INV_L) sl += c * dx ** p * dy ** q;
  return { lat: 52.15517440 + sp / 3600, lon: 5.38720621 + sl / 3600 };
}

/**
 * Parse a GML `gml:posList` string → a closed WGS84 [lon,lat] ring (GeoJSON order), or null if the
 * ring is degenerate or a vertex can't be honestly placed. `dim` = ordinate stride (2 planar; 3 for
 * CityGML X Y Z — the Z is dropped). CRS handling is AUTO-DETECTED, honestly:
 *   • leading ordinates already in degree range → GML EPSG:4326 axis order (lat, lon). Catastro
 *     returns exact server-reprojected WGS84 this way — strictly better than any local approximation.
 *   • else the ordinates are projected easting/northing → reprojected from `srsZone` (UTM zone) or,
 *     when `rd` is true, from RD New. A vertex with no valid CRS route drops the ring (never a
 *     fabricated coordinate).
 */
export function posListToWgs84Ring(text, { dim = 2, srsZone = null, rd = false } = {}) {
  const nums = String(text).trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i + dim <= nums.length; i += dim) {
    const a = nums[i], b = nums[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    let lon, lat;
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      lat = a; lon = b;                       // GML 4326 axis = lat, lon (degree range)
    } else if (rd) {
      ({ lat, lon } = rdToWgs84(a, b));
    } else if (srsZone) {
      ({ lat, lon } = utmNToWgs84(a, b, srsZone));
    } else {
      return null;                            // projected coords, no declared CRS → honest skip
    }
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    ring.push([lon, lat]);
  }
  if (ring.length < 4) return null;           // a polygon ring needs ≥3 distinct vertices + closure
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]); // close
  return ring;
}

// ── DE LoD2-DE · NRW — keyless open CityGML tile service. Real measuredHeight + GroundSurface footprint.
// bbox → UTM32 1 km tile key → per-Kachel .gml → per-Building GroundSurface gml:posList (UTM32) →
// utmNToWgs84 → WGS84 rings, carrying measuredHeight (tagged) + roofType. See fetchLod2DeNrw below.
let _nrwIndexCache = null;
async function nrwTileIndex(timeoutMs = 60_000) {
  if (_nrwIndexCache) return _nrwIndexCache;
  const r = await httpGet(`${SOURCES.lod2de_nrw.endpoint}index.json`, { timeoutMs });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.body);
    _nrwIndexCache = new Set((j.datasets?.[0]?.files ?? []).map((f) => f.name));
    return _nrwIndexCache;
  } catch { return null; }
}
// GEOMETRY INGEST (built 2026-07-25): each <bldg:Building> carries bldg:measuredHeight + roofType,
// and a bldg:GroundSurface whose gml:posList is the LoD0 footprint (X Y Z, native ETRS89/UTM32 =
// EPSG:25832, constant Z) → utmNToWgs84 → WGS84 [lon,lat]. Height → `height` (tagged); roofType
// code → OSM roof:shape (LoD2 tier). A byte-range sample necessarily clips the LAST building, so a
// non-`fullTile` fetch is `truncated:true` (→ append). `fullTile:true` fetches the whole 1 km tile.
/** bbox = [minlon, minlat, maxlon, maxlat] (WGS84). Never-throws. */
export async function fetchLod2DeNrw(bbox, { timeoutMs = 90_000, sampleBytes = 6_000_000, fullTile = false } = {}) {
  try {
    const [w, s, e, n] = bbox;
    const [cx, cy] = wgs84ToUtm32((s + n) / 2, (w + e) / 2);
    const eKm = Math.floor(cx / 1000), nKm = Math.floor(cy / 1000);
    const tile = `LoD2_32_${eKm}_${nKm}_1_NW.gml`;
    const idx = await nrwTileIndex(timeoutMs);
    if (idx && !idx.has(tile)) {
      return { status: 'no-source', reason: `bbox centre → tile ${tile} not in NRW (outside Nordrhein-Westfalen?)` };
    }
    const url = `${SOURCES.lod2de_nrw.endpoint}${tile}`;
    const headers = fullTile ? {} : { Range: `bytes=0-${sampleBytes}` };
    const r = await httpGet(url, { timeoutMs, headers });
    if (!r.ok && r.status !== 206) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    const truncated = !fullTile; // a byte-range sample clips the trailing building — skip it below.
    const blocks = r.body.match(/<bldg:Building\b[\s\S]*?<\/bldg:Building>/g) ?? [];
    const features = [];
    const heights = [];
    const roofCodes = new Set();
    for (const b of blocks) {
      const hm = b.match(/measuredHeight[^>]*>\s*([\d.]+)\s*</i);
      if (!hm) continue;
      const h = Number(hm[1]);
      if (!Number.isFinite(h) || h <= 0) continue;
      const rtCode = (b.match(/roofType[^>]*>\s*(\d+)\s*</i) ?? [])[1];
      // The honest LoD0 outline is the bldg:GroundSurface ring (constant Z).
      const gs = b.match(/GroundSurface[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/i);
      if (!gs) continue;
      const ring = posListToWgs84Ring(gs[1], { dim: 3, srsZone: 32 });
      if (!ring) continue;                                   // truncated/degenerate ring → honest skip
      heights.push(h);
      if (rtCode) roofCodes.add(rtCode);
      features.push(toFeature(
        { type: 'Polygon', coordinates: [ring] },
        nationalBuildingTags({
          heightM: clampHeight(h), provenance: 'tagged', source: 'lod2de_nrw',
          roofType: rtCode ? (NRW_ROOF[rtCode] ?? rtCode) : undefined,
        }),
      ));
    }
    return {
      status: 'ok', provenance: 'tagged', contentType: r.contentType, tile, features, truncated,
      heightSamples: heights.slice(0, 8), populatedHeights: heights.length, heightStats: statsOf(heights),
      roofTypeSamples: [...roofCodes].slice(0, 6),
      note: `NRW ${tile}: ${features.length} GroundSurface footprint(s) UTM32→WGS84 + measuredHeight (tagged)` +
        `${truncated ? '; byte-range sample (trailing building clipped) — pass fullTile for the whole 1 km tile' : ''}.`,
    };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

// ── DK GeoDanmark Bygning (buildings) — apikey-GATED (DATAFORDELER_API_KEY). ─────────────────────
// AUTH: Datafordeler Basic Auth (user/pass) was RETIRED (git 1fc5bc8b); the 2026 host takes
// `&apikey=<DATAFORDELER_API_KEY>` — the SAME key the DK Matrikel proxy + the DHM terrain adapter use.
// No keyless bbox path exists (LIVE-PROBED 2026-07-25: wfs.datafordeler.dk → HTTP 401 without a key).
// Honest `blocked` unless the key is set — never a silent skip, never a fabricated height.
//
// §HEIGHT-ATTRIBUTE FINDING (verified 2026-07-25 against the authoritative Datafordeler objekttype-
// katalog, grunddatamodel.datafordeler.dk/.../GeoDanmark/Bygninger/Bygning.html): the GeoDanmark
// `Bygning` object carries NO scalar height attribute. Its full attribute set is BBRUUID,
// bygningstype, målestedBygning, metode3D, underMinimumBygning, BBRaktion, synligBygning,
// overlapBygning, geometri (GM_Surface). `metode3D` only says HOW z was captured (Tag=roof-edge /
// Terræn) — it is not a measured height. So GeoDanmark gives authoritative FOOTPRINTS, not height.
// §CONTEXT-DATA-HONESTY: we therefore emit `building` footprints with NO fabricated height and return
// `documented` (region keeps its OSM/Overture default — never REPLACE real OSM buildings with a
// heightless national set). The real DK LoD1 height FOLLOW-UP is either DHM DSM−DTM nDSM
// (dhm_overflade − dhm_terraen, same DATAFORDELER_API_KEY → `tagged`) or the BBR ETAGER_ANT floor
// count joined via BBRUUID (→ `derived-levels`). Neither is GeoDanmark itself, so neither is invented here.
export async function fetchGeoDanmark(bbox, { timeoutMs = 40_000, env = process.env } = {}) {
  const apikey = env.DATAFORDELER_API_KEY;
  if (!apikey) {
    return {
      status: 'blocked',
      reason: 'GeoDanmark is apikey-gated — set DATAFORDELER_API_KEY (mint at portal.datafordeler.dk; ' +
        'reuse the Matrikel/DHM key). Datafordeler Basic Auth was retired (git 1fc5bc8b); the 2026 host ' +
        'takes &apikey=. No keyless bbox path (wfs.datafordeler.dk → HTTP 401 without a key).',
    };
  }
  try {
    // GeoDanmark Vektor WFS 2.0.0, typeName gdk60:Bygning, native EPSG:25832 (UTM32N). apikey on the URL.
    const [w, s, e, n] = bbox;
    const url = `https://wfs.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_NOHIST_GML3/1.0.0/WFS` +
      `?service=WFS&version=2.0.0&request=GetFeature&typeNames=gdk60:Bygning` +
      `&srsName=urn:ogc:def:crs:EPSG::25832&count=3000` +
      `&bbox=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::25832&apikey=${encodeURIComponent(apikey)}`;
    const r = await httpGet(url, { timeoutMs });
    if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    // Parse Bygning footprints: GM_Surface exterior gml:posList (E N, EPSG:25832) → utmNToWgs84 rings.
    const members = r.body.match(/<gdk60:Bygning\b[\s\S]*?<\/gdk60:Bygning>/g) ?? [];
    let footprints = 0;
    let sampleRing = null;
    for (const m of members) {
      const extM = m.match(/<gml:exterior>[\s\S]*?<gml:posList([^>]*)>([\s\S]*?)<\/gml:posList>/);
      if (!extM) continue;
      const dim = /srsDimension\s*=\s*"3"/i.test(extM[1]) ? 3 : 2; // GeoDanmark GML3 is normally 2D.
      const ring = posListToWgs84Ring(extM[2], { dim, srsZone: 32 });
      if (!ring) continue;
      footprints++;
      if (!sampleRing) sampleRing = ring.slice(0, 3);
      // ⚠ NO height/levels written — GeoDanmark Bygning carries neither (verified). Footprints are
      // reached + counted as proof, but NOT emitted as a heightless REPLACE (region keeps OSM).
    }
    return {
      // `documented`, not `ok`: real footprints reached, but GeoDanmark supplies NO height, so the
      // region KEEPS its OSM/Overture footprints (honest 9 m assumed) rather than losing them to a
      // heightless national replace. Height is the DHM-nDSM / BBR-floors follow-up (see the header).
      status: 'documented', provenance: 'assumed', contentType: r.contentType, reachedWithKey: true,
      hasHeightAttribute: false, footprintCount: footprints, sampleRing, features: [],
      note: `GeoDanmark Bygning reached with apikey — ${footprints} footprint(s) parsed (EPSG:25832→WGS84). ` +
        '⚠ NO height attribute on the object (verified: BBRUUID/bygningstype/målestedBygning/metode3D/…/geometri, ' +
        'no scalar height). Real DK height FOLLOW-UP = DHM DSM−DTM nDSM (dhm_overflade − dhm_terraen, same apikey → ' +
        'tagged) OR BBR ETAGER_ANT floors via BBRUUID (derived-levels). Region keeps OSM until then — no fabricated height.',
    };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/**
 * §WIRE-HONEST — build the OSM-style tag bag the CLIENT actually reads (contextTiles.ts →
 * contextBuildings.ts `resolveHeightWithProvenance`), from a national source's fields.
 *
 * Three load-bearing rules, all verified against the real client path (2026-07-25):
 *   1. `building` MUST be present, or `belongsToLayer()` drops the feature and the region renders
 *      ZERO buildings (the wire-check bug this fixes).
 *   2. The client RE-DERIVES provenance from these tags — it ignores any `heightProvenance` we set.
 *      A MEASURED height → write `height` (client derives `tagged`). A floor COUNT → write ONLY
 *      `building:levels` (client derives `derived-levels`), and NEVER a fabricated height into
 *      `height` (that would make the client label a guess as `tagged`/measured — the exact dishonesty
 *      §CONTEXT-DATA-HONESTY forbids).
 *   3. `roof_type` rides along where the source has it (feeds the LoD2 tier, not the LoD1 extrude).
 */
export function nationalBuildingTags({ heightM, floors, provenance, source, roofType } = {}) {
  const tags = { building: 'yes' };
  if (provenance === 'tagged' && Number.isFinite(heightM) && heightM > 0) {
    tags.height = heightM; // MEASURED → client derives 'tagged'.
  }
  if (Number.isFinite(floors) && floors > 0) {
    tags['building:levels'] = floors; // floor COUNT → client derives 'derived-levels' (unless a measured height is also present).
  }
  if (roofType) tags.roof_type = roofType;
  if (source) tags.heightSource = source; // debug-only; the client re-derives provenance and ignores this.
  return tags;
}

/** Wrap a GeoJSON geometry + props into a Feature. */
function toFeature(geometry, properties) {
  return { type: 'Feature', geometry, properties };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveHeights(region, opts) — THE bake.mjs ENTRY POINT.
//
// Returns a discriminated result:
//   { status:'ok', geojsonseq, count, provenance }  — wrote out/<region>-buildings-national.geojsonseq
//   { status:'no-source', reason }                  — region keeps OSM footprints (9 m assumed)
//   { status:'blocked',  reason }                   — auth/geo-fence/licence gate (documented, not silent)
//   { status:'documented', reason }                 — source known, fetcher is the next build step
//   { status:'error',    reason }                   — a live fetch failed (region keeps OSM)
//
// bake.mjs uses `geojsonseq` as an ADDITIONAL (or replacement) buildings input for that region — see
// §INTEGRATION. This never throws; a bad source degrades to OSM, never to a fabricated height.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveHeights(region, { outDir = OUT, bbox } = {}) {
  const { source, status, reason } = sourceForRegion(region);
  if (!source || status === 'no-source') return { status: 'no-source', reason: reason ?? 'no source', region };
  if (status === 'blocked') return { status: 'blocked', reason, region, source };

  const src = SOURCES[source];
  if (!src) return { status: 'no-source', reason: `unknown source "${source}"`, region };
  if (src.impl !== 'live') {
    return { status: 'documented', reason: `${src.name}: ${src.note}`, region, source, provenance: src.provenance };
  }
  if (!bbox) return { status: 'error', reason: 'no bbox supplied for a live source', region, source };

  let res;
  if (source === 'bdtopo') res = await fetchBdTopo(bbox);
  else if (source === '3dbag') res = await fetch3dbag(bbox);
  else if (source === 'catastro') res = await fetchCatastro(bbox);
  else if (source === 'lod2de_nrw') res = await fetchLod2DeNrw(bbox);
  else if (source === 'geodanmark') res = await fetchGeoDanmark(bbox);
  else return { status: 'documented', reason: `${src.name} fetcher not implemented`, region, source };

  // A never-throwing fetcher may itself report a real gate (blocked/documented) — surface it honestly.
  if (res.status === 'blocked') return { status: 'blocked', reason: res.reason, region, source, provenance: src.provenance };
  if (res.status === 'documented') return { status: 'documented', reason: res.note ?? res.reason, region, source, provenance: res.provenance ?? src.provenance };
  if (res.status !== 'ok') return { status: 'error', reason: res.reason, region, source };

  // Only features that carry a real geometry are writeable as a join input.
  const writeable = (res.features ?? []).filter((f) => f.geometry != null);
  if (writeable.length === 0) {
    return {
      status: 'documented', region, source, provenance: res.provenance,
      reason: `${src.name}: ${res.rawCount ?? res.buildingCount ?? 0} record(s) reached, heights confirmed, ` +
        'but no footprint geometry parsed for this bbox (see §note).',
    };
  }
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `${region}-buildings-national.geojsonseq`);
  writeFileSync(path, writeable.map((f) => JSON.stringify(f)).join('\n') + '\n');
  // §PHASE1-DEDUP — `mode` tells bake.mjs whether to REPLACE the OSM clip (full national source) or
  // APPEND (partial top-up). A TRUNCATED full-source fetch is downgraded to append: replacing the OSM
  // clip with a partial national set would DELETE the real buildings we didn't fetch — worse than a
  // missing height (§CONTEXT-DATA-HONESTY). See heightModeForSource + CONTEXT-LOD-BUILD-PLAN.md §3.
  const baseMode = heightModeForSource(source);
  const mode = res.truncated && baseMode === 'replace' ? 'append' : baseMode;
  return {
    status: 'ok', geojsonseq: path, count: writeable.length, provenance: res.provenance,
    mode, truncated: !!res.truncated, region, source,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PROBES — assert Content-Type + a real height value. Load-bearing evidence.
// Small bboxes over the LOD-RATE-verified test locations.
// ─────────────────────────────────────────────────────────────────────────────
const PROBE_BBOX = {
  bdtopo: [2.346, 48.852, 2.352, 48.858],      // Paris 8e (LOD-RATE-verified)
  '3dbag': [4.895, 52.372, 4.905, 52.378],     // Amsterdam centre
  catastro: [-3.703, 40.416, -3.699, 40.420],  // Madrid centro
  lod2de_nrw: [6.94, 50.93, 6.96, 50.95],      // Cologne centre (NRW) — LoD2-DE live reference
  geodanmark: [12.56, 55.67, 12.58, 55.69],    // Copenhagen centre (auth-gated → blocked probe)
};

export async function probeSource(id) {
  const bbox = PROBE_BBOX[id];
  if (id === 'bdtopo') {
    const r = await fetchBdTopo(bbox, { limit: 3 });
    const heights = (r.features ?? []).map((f) => f.properties.height);
    return {
      id, endpoint: SOURCES.bdtopo.endpoint, status: r.status, contentType: r.contentType,
      assertContentType: /json/i.test(r.contentType ?? ''),
      sampleHeights: heights.slice(0, 3),
      sampleFloors: (r.features ?? []).map((f) => f.properties.num_floors).filter((x) => x != null).slice(0, 3),
      assertRealHeight: heights.some((h) => Number.isFinite(h) && h > 0), reason: r.reason,
    };
  }
  if (id === '3dbag') {
    const r = await fetch3dbag(bbox, { limit: 100, maxPages: 1 });
    const heights = (r.features ?? []).map((f) => f.properties.height);
    const ring0 = r.features?.[0]?.geometry?.coordinates?.[0];
    return {
      id, endpoint: SOURCES['3dbag'].endpoint, status: r.status, contentType: r.contentType,
      assertContentType: /json/i.test(r.contentType ?? ''),
      featureCount: r.features?.length ?? 0, heightStats: r.heightStats, sampleHeights: heights.slice(0, 3),
      sampleRoofTypes: (r.features ?? []).map((f) => f.properties.roof_type).filter(Boolean).slice(0, 3),
      sampleRing: ring0?.slice(0, 3),
      assertRealHeight: heights.some((h) => Number.isFinite(h) && h > 0),
      assertGeometry: Array.isArray(ring0) && ring0.length >= 4,
      truncated: r.truncated, mode: heightModeForSource('3dbag'), reason: r.reason, rawCount: r.rawCount,
    };
  }
  if (id === 'catastro') {
    const caps = await fetchCatastro(null, { capabilitiesOnly: true });
    const feat = await fetchCatastro(bbox, { buildingCap: 500 });
    const ring0 = feat.features?.[0]?.geometry?.coordinates?.[0];
    return {
      id, endpoint: SOURCES.catastro.endpoint, status: feat.status, contentType: feat.contentType,
      assertContentType: /xml|unknown/i.test(feat.contentType ?? '') || /xml/i.test(caps.contentType ?? ''),
      capabilitiesHasBuilding: caps.hasBuilding,
      featureCount: feat.features?.length ?? 0, buildingPartCount: feat.buildingCount,
      populatedFloors: feat.populatedFloors, floorStats: feat.floorStats, sampleFloors: feat.floorSamples,
      sampleRing: ring0?.slice(0, 3),
      assertRealFloorCount: (feat.floorSamples ?? []).some((n) => Number.isFinite(n) && n > 0),
      assertGeometry: Array.isArray(ring0) && ring0.length >= 4,
      provenance: 'derived-levels', mode: heightModeForSource('catastro'), reason: feat.reason,
    };
  }
  if (id === 'lod2de_nrw') {
    const r = await fetchLod2DeNrw(PROBE_BBOX.lod2de_nrw, { sampleBytes: 4_000_000 });
    const ring0 = r.features?.[0]?.geometry?.coordinates?.[0];
    return {
      id, endpoint: SOURCES.lod2de_nrw.endpoint, status: r.status, contentType: r.contentType, tile: r.tile,
      assertContentType: /gml|xml/i.test(r.contentType ?? ''),
      featureCount: r.features?.length ?? 0, populatedHeights: r.populatedHeights,
      heightStats: r.heightStats, sampleHeights: r.heightSamples, roofTypeCodes: r.roofTypeSamples,
      sampleRing: ring0?.slice(0, 3),
      assertRealHeight: (r.heightSamples ?? []).some((h) => Number.isFinite(h) && h > 0),
      assertGeometry: Array.isArray(ring0) && ring0.length >= 4,
      provenance: 'tagged', truncated: r.truncated, mode: heightModeForSource('lod2de_nrw'), reason: r.reason ?? r.note,
    };
  }
  if (id === 'geodanmark') {
    const r = await fetchGeoDanmark(PROBE_BBOX.geodanmark);
    return {
      id, endpoint: SOURCES.geodanmark.endpoint, status: r.status,
      // Honest gate: with no key this is `blocked`, and that is the CORRECT, load-bearing result.
      assertHonestGate: r.status === 'blocked' || r.status === 'documented',
      reachedWithKey: r.reachedWithKey ?? false, hasHeightAttribute: r.hasHeightAttribute ?? false,
      footprintCount: r.footprintCount, sampleRing: r.sampleRing,
      mode: heightModeForSource('geodanmark'), reason: r.reason ?? r.note,
    };
  }
  return { id, status: 'error', reason: `no live probe for "${id}"` };
}

// ── §INTEGRATION — the ONE line bake.mjs adds (orchestrator reconciles) ─────────────────────────
// In bake.mjs, inside the buildings-layer per-region loop (where it builds `geos`), after the OSM
// export for region `r`:
//
//     import { resolveHeights } from './heightSources.mjs';   // top of file
//     ...
//     const nat = await resolveHeights(r.name, { bbox: bboxToWsen(r.bbox) });
//     if (nat.status === 'ok') geos.push(nat.geojsonseq);      // ← THE ONE LINE (real heights join)
//     else console.log(`  · ${r.name} heights: ${nat.status} — ${nat.reason ?? ''}`);
//
// (`r.bbox` in bake.mjs is the osmium string 'minlon,minlat,maxlon,maxlat' → pass as [w,s,e,n].)
// A region that returns anything other than 'ok' keeps its OSM footprints (9 m assumed) — honest.
// ⚠ DEDUP: where a national source has FULL coverage, feed it INSTEAD of the OSM buildings clip for
// that region (replace, not append) so the same building is not drawn twice — at 9 m and at real
// height. For partial sources (BD TOPO nulls), append + let the client's near-cap thin duplicates.
// See CONTEXT-LOD-BUILD-PLAN.md §Integration for the replace-vs-append policy per source.

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const bboxToWsen = (s) => s.split(',').map(Number);
  (async () => {
    if (args.includes('--plan')) {
      console.log('PRYZM context height sources — per-region plan\n');
      for (const region of Object.keys(REGION_SOURCE)) {
        const { source, status, reason } = sourceForRegion(region);
        const src = source ? SOURCES[source] : null;
        console.log(`  ${region.padEnd(14)} ${(source ?? '—').padEnd(18)} ${(src?.impl ?? status).padEnd(11)} ${src?.lodNow ?? ''} ${reason ? '· ' + reason : ''}`);
      }
      return;
    }
    if (args.includes('--probe')) {
      const which = args[args.indexOf('--probe') + 1];
      const ids = which && !which.startsWith('--') ? [which] : ['bdtopo', '3dbag', 'catastro', 'lod2de_nrw', 'geodanmark'];
      for (const id of ids) {
        console.log(`\n▶ probe ${id} (${SOURCES[id]?.endpoint})`);
        try { console.log(JSON.stringify(await probeSource(id), null, 2)); }
        catch (e) { console.log(`  ✖ ${e.message}`); }
      }
      return;
    }
    const ri = args.indexOf('--resolve');
    if (ri >= 0) {
      const region = args[ri + 1];
      // Pull the bbox from bake.mjs's REGIONS if present, else require --bbox.
      const bi = args.indexOf('--bbox');
      let bbox = bi >= 0 ? bboxToWsen(args[bi + 1]) : undefined;
      if (!bbox) {
        try {
          const bake = await import('./bake.mjs').catch(() => null); // bake.mjs runs on import — guard.
          void bake;
        } catch { /* ignore */ }
      }
      console.log(JSON.stringify(await resolveHeights(region, { bbox }), null, 2));
      return;
    }
    console.log('usage: node heightSources.mjs [--plan | --probe [id] | --resolve <region> --bbox w,s,e,n]');
  })();
}
