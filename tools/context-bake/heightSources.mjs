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
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// §MNH-FR (2026-09-04) — the PURE half of the French national stamp (URL builders, pixel budget, the
// dalle-index hits parser, the nodata mask, the city working set) lives in its own dependency-free
// module so vitest can import and pin its decisions; this file keeps the raster/network half.
import { MNH_FR, MNH_FR_CITY_BBOXES, classifyDalleCoverage, maskNodata, mnhFrDalleHitsUrl, mnhFrGetMapUrl, mnhFrPxDims, parseWfsHits } from './heights/mnhFr.mjs';
// §SWISS-NDSM (2026-09-04) — the PURE half of the Swiss national stamp (STAC URL, LV95 tile keying, COG
// asset selection, the city working set) — same split, same reason.
import { SWISS_NDSM, SWISS_CITY_BBOXES, lv95TileKey, lv95TileBbox, parseStacCollection, pickCogAsset, swissStacItemsUrl } from './heights/swissNdsm.mjs';
export { MNH_FR, MNH_FR_CITY_BBOXES, SWISS_NDSM, SWISS_CITY_BBOXES };

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');

// ── clamps (mirror contextBuildings.ts so a stray source value can't make a skyscraper) ─────────
const MIN_HEIGHT_M = 2.5;
const MAX_HEIGHT_M = 400;
const METRES_PER_LEVEL = 3.2; // same assumed storey height the client uses for derived-levels.
const clampHeight = (h) => Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, h));

// ── §CTX-HEIGHT-MEASURED-MARKER (H2 — BUILDING-HEIGHT-REPLICATION-STANDARD §1 rung 1 / §5 client rung,
// L-646) — a DISTINCT tile tag stamped ONLY on a footprint whose height came from a REAL MEASURED
// source (LiDAR nDSM / 3DBAG roof−ground / BD TOPO hauteur / DK DHM / CH swisstopo). Its whole reason
// to exist: those joins write the measured metres onto the OSM `height` tag, so the client would
// resolve them as `tagged` — INDISTINGUISHABLE from an OSM-surveyed height, collapsing the standard's
// 5-rung ladder. This marker rides alongside `height` so the client labels the rung `measured-lidar`
// (ranked ABOVE OSM `tagged`) instead. PURELY ADDITIVE — the numeric `height` tag is untouched, so a
// reader that ignores the marker still extrudes the real height (the L-647 wireframe fallback). Never
// stamped on a derived-levels floor count or an OSM-native height — only where a metre value was
// genuinely measured. §CONTEXT-DATA-HONESTY: this labels PROVENANCE, it invents no number.
export const MEASURED_HEIGHT_SRC_TAG = 'pryzm:height_src';
export const MEASURED_HEIGHT_SRC_VALUE = 'measured-lidar';

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
  mds_edificacion: {
    country: 'es', name: 'CNIG MDS Edificación (MDSnE2.5) — building nDSM raster', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (needs roof geometry — MDS is a surface height, not planes)',
    endpoint: 'https://wcs-mds.idee.es/mds',
    heightField: 'mdsn_e025 — MDS normalizado Edificación, a 2.5 m raster whose pixel value IS the ' +
      'building height above ground (nDSM already isolated to the BUILDING class → NO DSM−DTM subtraction)',
    note: 'Keyless CC-BY WCS 2.0.1 (INSPIRE) — LIVE-VERIFIED 2026-07-26. GetCoverage COVERAGEID=mdsn_e025 ' +
      'FORMAT=image/tiff over an EPSG:4326 SUBSET (lat/long, SUBSETTINGCRS+OUTPUTCRS=EPSG:4326) → image/tiff, ' +
      'native grid EPSG:3042 (ETRS89/UTM30N, ONE projection covering all of Spain incl. Barcelona), 2.5 m, ' +
      'value=metres. MEASURED building height BUILT 2026-07-26: fetchSpainBuildingHeights samples the raster ' +
      'per Catastro footprint (P90 over the eroded interior, mirrors the DK DHM nDSM path) → `tagged`. ' +
      'Sampled real heights (bldg-only P90): Barcelona Eixample ~31 m, Madrid centro ~28 m, Córdoba centro ' +
      '~17 m — locally distinct, low-rise Córdoba correctly lower. Footprints with no clean MDS sample keep ' +
      'Catastro floors (derived-levels) or the OSM assumed default — never a fabricated height. ⚠ The ' +
      'whole-country `spain` bbox is refused per-tile (Catastro has no single whole-country query) → ' +
      '`documented` (keeps OSM); a CITY bbox resolves exactly. Whole-country in one pass needs the OSM-' +
      'footprint join in bake.mjs (stamp MDS onto bake\'s own OSM clip) or the INSPIRE ATOM bulk — named follow-up.',
    coverage: 'full',
  },
  swissbuildings3d: {
    country: 'ch', name: 'swisstopo swissSURFACE3D Raster − swissALTI3D nDSM (national, keyless) · swissBUILDINGS3D = the LoD2-next tier', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (national 0.5 m DSM / 2 m DTM COGs)', lodNext: 'LoD2-mesh (swissBUILDINGS3D 3.0 native roofs, incl. overhangs)',
    endpoint: 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swisssurface3d-raster (DSM) + ' +
      '…/ch.swisstopo.swissalti3d (DTM) → per-km² LV95 COG GeoTIFFs, HTTP range-read',
    heightField: 'nDSM = P90(swissSURFACE3D − swissALTI3D) over the eroded footprint interior (ndsmHeightForBuilding, native LV95 metres); ' +
      'both products on LN02 (EPSG:5728) so the difference is datum-free height above ground',
    coverage: 'full',
    keyless: true, // swisstopo free geodata — NO API key, NO repo secret; source reference mandatory (terms text verified 2026-09-04).
    note: 'LIVE 2026-09-04 (lane HEIGHTS-EVERYWHERE round 2): the national STAMP stampSwissHeightsOnGeojsonseq is BUILT on the ' +
      'STAC→COG channel (heights/swissNdsm.mjs carries every probed number: 0.5 m DSM COG 13.5 MB with 1 m / 2 m overviews, ' +
      '2 m DTM 1.0 MB, HTTP 206 range reads, nodata −9999, LV95 1 km tiles). It is a bake STAMP over bake\'s own OSM footprints, ' +
      'NOT a bbox footprint fetcher — the `switzerland` row must declare heightJoin:\'swiss\' (bake.mjs dispatch + stampBboxesFor → ' +
      'SWISS_CITY_BBOXES) to receive it. Verified on the LIVE Zürich footprints (probe --geojsonseq): see the stamp\'s header. ' +
      '⚠ HISTORY: the 2026-07-26 draft assumed a WCS at data.geo.admin.ch — that host is an object store (HTTP 404 NoSuchKey, ' +
      'probed 2026-07-27); the WCS shape was removed 2026-09-04. LoD2-next: swissBUILDINGS3D CityGML solids (bulk, not a bbox ' +
      'API) + GWR-by-EGID storeys — a CityGML parser build, not started.',
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
    heightField: 'GeoDanmark bygning = FOOTPRINT ONLY (NO height attr — verified); MEASURED height via DHM nDSM = P90(dhm_overflade − dhm_terraen) over the eroded footprint (fetchGeoDanmarkHeights)',
    note: 'Richest EU building register — but ⚠ GeoDanmark `Bygning` carries NO scalar height (VERIFIED ' +
      '2026-07-25 against the Datafordeler objekttypekatalog: attrs BBRUUID/bygningstype/målestedBygning/' +
      'metode3D/underMinimumBygning/BBRaktion/synligBygning/overlapBygning/geometri; metode3D is capture-' +
      'method, not a height). apikey-GATED: Basic Auth was RETIRED (git 1fc5bc8b); the 2026 host takes ' +
      '&apikey=<DATAFORDELER_API_KEY> (reuse the Matrikel/DHM key). No keyless bbox path (wfs.datafordeler.dk ' +
      '→ HTTP 401 without a key). REAL LoD1 height BUILT 2026-07-25: fetchGeoDanmarkHeights fetches the DHM ' +
      'DSM (dhm_overflade) + DTM (dhm_terraen) over a tiled EPSG:25832 bbox (WCS 1.0.0, same apikey) and sets ' +
      'height = P90 of (DSM−DTM) over the footprint eroded inward (robust, never the peak) → `tagged`. Footprints ' +
      'with no usable nDSM keep no height (assumed default). `blocked` (no key) / `documented` (no usable nDSM) / ' +
      '`ok` (real heights). BBR ETAGER_ANT floors via BBRUUID (derived-levels) is a further follow-up.',
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
      'Account+scope to download. Shares the nDSM module. ⭐ PROBED 2026-09-01 (context-everywhere ' +
      'assessment §3): the national 1 m höjdmodell STAC metadata (api.lantmateriet.se/stac-hojd/v1) ' +
      'answers HTTP 200 KEYLESS with per-tile COG hrefs, but the asset host 401s — the gate is a FREE ' +
      'Lantmäteriet download credential (the DK DATAFORDELER shape), NOT the NGP parcels/plans ' +
      'org-onboarding gate. Do not inherit the NGP gate onto context.',
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
  // ───────────────────────────────────────────────────────────────────────────
  // §EUROPE-NATIONAL height channels (2026-09-02, lane REGIONS) — one row per national channel the
  // context-everywhere assessment verified (audit/europe-site-intel/2026-08-31/impl/
  // context-everywhere-assessment.md §2, "ASSESS <CC>"). ALL impl:'documented' — none has a fetcher
  // or a bake stamp yet, so resolveHeights() reports the honest channel + owed build and the region
  // keeps OSM defaults; NO region declares a heightJoin on any of these (§MEASURED-HEIGHT-GATE).
  eesti3d_ee: {
    country: 'ee', name: 'Eesti 3D national LoD2 + EHR register', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD2 (national CityGML)', lodNext: 'LoD2-mesh (native)',
    endpoint: 'Maa-amet Eesti 3D CityGML (national LoD2, pre-linked to EHR building ids) + EHR daily CSV (floors)',
    heightField: 'CityGML measuredHeight; EHR floors (daily CSV) as the derived-levels fallback',
    coverage: 'full',
    note: 'ASSESS EE: 856,360 LoD2 + 917,882 LoD1 buildings, state-conflated with the register. The owed ' +
      'build is an EE CityGML stamp mirroring stampLod2NrwHeightsOnGeojsonseq; until it lands the ' +
      '`estonia` region bakes honest OSM defaults. Never declare the join before the stamp exists.',
  },
  bdot10k_pl: {
    country: 'pl', name: 'BDOT10k OT_BUBD_A storeys (national GeoParquet)', impl: 'documented',
    provenance: 'derived-levels', lodNow: 'LoD1-floorcount', lodNext: 'LoD2 (2017-vintage per-voivodeship CityGML, bulk UI-mediated — not a bake channel yet)',
    endpoint: 'plain-URL national GeoParquet (registry `pl-bdot10k-buildings-geoparquet`; probed 200 / 78.6 MB)',
    heightField: 'storey attribute — a COUNT (× 3.2 m derived, NEVER a measurement)',
    coverage: 'full',
    note: 'ASSESS PL: NATIONAL-DERIVED-HEIGHTS, gated on ONE owed DuckDB fill read over the parquet ' +
      '(storey-attr fill is UNMEASURED — control 9: UNKNOWN stays UNKNOWN). Until that probe lands, ' +
      'the `poland` region is mass-only and its row says so.',
  },
  ruian_cz: {
    country: 'cz', name: 'RUIAN pocet podlazi (floors) via VFR', impl: 'documented',
    provenance: 'derived-levels', lodNow: 'LoD1-floorcount', lodNext: 'DMR5G/DMP1G nDSM (reported open — NOT verified)',
    endpoint: 'CUZK VFR bulk (RUIAN) + INSPIRE BU WFS (keyless live; heightAboveGround NIL — probed E5-10)',
    heightField: 'pocet podlazi — a COUNT (× 3.2 m derived); the WFS height slot is NIL, never read it as data',
    coverage: 'full',
    note: 'ASSESS CZ: NATIONAL-DERIVED-HEIGHTS, gated on ONE owed VFR parse (floors are DOC-level ' +
      'until parsed). Until then the `czechia` region is mass-only and its row says so.',
  },
  gurs_si: {
    country: 'si', name: 'GURS KN STAVBE register (REAL metres)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (register attribute)', lodNext: 'per-floor ETAZE (VISINA_ETAZE)',
    endpoint: 'GURS KN STAVBE/STAVBE_OBRIS keyless WFS, CC BY 4.0 (live-probed E5-7)',
    heightField: 'lowest/highest elevation + characteristic height — REAL METRES (richer than Spain on the vertical axis)',
    coverage: 'full',
    note: 'ASSESS SI: the stand-out register-attribute channel. Owed: a WFS-join stamp AND a fill ' +
      'probe FIRST (GEOM present 1 of 2 sampled — E5 §C); never declare the join before the fill probe.',
  },
  geoland_at: {
    country: 'at', name: 'geoland.at nationwide 1 m DTM+DSM nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (nDSM derive)', lodNext: 'LoD2 (none national)',
    endpoint: 'geoland.at open CC BY 4.0 nationwide 1 m DTM + DSM',
    heightField: 'DSM−DTM nDSM P90 per footprint (shares the nDSM module with ES/DK/SE/PT)',
    coverage: 'full',
    note: 'ASSESS AT: open national rasters; the owed build is the nDSM stamp. GWR register is ' +
      'access-gated (not the context channel). Until the stamp lands, `austria` is mass-only.',
  },
  ealidar_gb: {
    country: 'gb', name: 'EA LiDAR Composite DTM/DSM 1 m (OGL v3) — ENGLAND ONLY', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (England only)', lodNext: 'none open (OS Building Heights = premium, X3-refused)',
    endpoint: 'environment.data.gov.uk EA LiDAR Composite (keyless, OGL v3)',
    heightField: 'DSM−DTM nDSM per footprint — England only; Scotland/Wales/NI are separate portals',
    coverage: 'partial',
    note: 'ASSESS GB (probe-verified): the keyless OS Downloads catalogue (26 products) has NO ' +
      'building-height product — the GB national verdict rests on OSM/ODbL, and OS licensing stays ' +
      'X3-refused. The owed build is the England nDSM stamp; `greatbritain` stays mass-only until then.',
  },
  buildings3d_fi: {
    country: 'fi', name: 'FI Buildings 3D national LoD2 (CC BY 4.0)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD2 (PARTIAL coverage)', lodNext: 'KM2 DTM+DSM nDSM derive (keyed, MML_API_KEY)',
    endpoint: 'NLS Buildings 3D CityGML (CC BY 4.0) + NLS INSPIRE BU footprints (fully anonymous)',
    heightField: 'CityGML measuredHeight where covered; coverage is PARTIAL (product page 2022-01-27)',
    coverage: 'partial',
    note: 'ASSESS FI: current coverage NOT CONFIRMED — read the status map FIRST (owed probe), then ' +
      'the stamp build. Until then `finland` is mass-only.',
  },
  mnh_fr: {
    country: 'fr', name: 'IGN LiDAR HD MNH (Modèle Numérique de Hauteur) — national pre-computed nDSM', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (national 50 cm raster)', lodNext: 'LoD2 (LiDAR HD building-class reconstruction)',
    endpoint: 'https://data.geopf.fr/wms-r/wms (IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G, image/geotiff) ' +
      '+ dalle index https://data.geopf.fr/wfs/ows (IGNF_MNH-LIDAR-HD:dalle)',
    heightField: 'MNH pixel value IS height above ground (Float32 metres, GDAL nodata −9999) — ⛔ do NOT rebuild the ' +
      'DSM−DTM differencing (E5 §G.1 A8); the stamp takes P90 over the eroded footprint interior',
    coverage: 'full',
    keyless: true, // Géoplateforme open services — NO api key, NO repo secret. Licence Ouverte Etalab 2.0.
    note: 'LIVE-VERIFIED 2026-09-04 (lane HEIGHTS-EVERYWHERE): GetMap EPSG:4326 (⚠ BBOX lat,lon — WMS 1.3.0) ' +
      'FORMAT=image/geotiff → HTTP 200 image/geotiff, ONE Float32 band, 3.1 MB / 880×890 px in 0.95 s over ' +
      'Île de la Cité (p50 3.8 m · p90 23.6 m · max 87.8 m). NATIONAL STAMP BUILT: stampMnhFrHeightsOnGeojsonseq ' +
      '(mirrors the ES mds OSM-footprint join; working set + pure helpers in heights/mnhFr.mjs, MNH_FR_CITY_BBOXES). ' +
      'It is a bake STAMP over bake\'s own OSM footprints, NOT a bbox footprint fetcher — the `france` row must ' +
      'declare heightJoin:\'mnh_fr\' (bake.mjs dispatch + stampBboxesFor → MNH_FR_CITY_BBOXES) to receive it. ' +
      'Coverage is BIMODAL (dalle index + raster nodata, two independent probes, 2026-09-04): paris 268 · lyon 149 · ' +
      'toulouse 120 · montpellier 120 · rennes 122 · marseille 116 · bordeaux 114 · nantes 100 · strasbourg 94 · ' +
      'grenoble 81 · nice 64 · rural Touraine 70 · rural Provence 84 dalles (0.000 nodata) — vs lille 0 · rural ' +
      'Creuse 0 · rural Bretagne 0 (1.000 nodata). The stamp pre-checks the index per stamp area and SKIPS ' +
      'unpublished ground by name; a failed index request is UNKNOWN (sampled anyway), never 0. ⚠ MNH is all ' +
      'sursol (vegetation too) — P90 over the eroded interior, as DK/CH. BD TOPO `hauteur` stays the city-scale ' +
      'tagged source; its 5,000-row cap left Paris at 56/12,064 measured on the SHIPPED tiles (§BDTOPO-CAP-TRUNCATE, ' +
      'probed 2026-09-04), which is why the raster, not the WFS, is the national channel.',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // §INTL height channels (2026-09-03, lane CONTEXT-INTL) — new non-EU channels the au-sweep/me-sweep
  // verified (audit/geo-expansion/2026-09-02/{au-sweep,me-sweep}.md). impl:'documented' — no fetcher or
  // bake stamp yet, so resolveHeights() reports the honest channel + owed build and the region keeps OSM
  // defaults; NO region declares a heightJoin on any of these (§MEASURED-HEIGHT-GATE). US metros reuse
  // the existing `overture_us` row (Overture height + 3DEP nDSM); the AE metros are honest `no-source`.
  elvis_au: {
    country: 'au', name: 'ELVIS national LiDAR DTM/DSM nDSM (FSDF, CC BY 4.0)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (nDSM derive)', lodNext: 'LoD2 (Geoscape commercial / per-city meshes)',
    endpoint: 'elevation.fsdf.org.au (ELVIS, HTTP 200 probed 2026-09-02) — per-state DTM/DSM',
    heightField: 'DSM−DTM nDSM per OSM/ACT footprint (shares the nDSM module with ES/DK/SE/PT/AT)',
    coverage: 'partial',
    note: 'ASSESS AU (au-sweep §1.3/§9.2/§9.3): the OPEN height channel in every AU state is the ELVIS ' +
      'nDSM derive; the owed build is a per-capital nDSM stamp mirroring stampMdsHeightsOnGeojsonseq, ' +
      'plus each capital’s AUSGeoid2020 datum constant (the separation swings tens of m W↔E). ACT ' +
      'ships 64,674 open footprints and Melbourne serves real LoD1 extrusions (earlier metro joins); ' +
      'Geoscape (national footprints+heights) is a commercial sales-agreement gate (site 403 to probe), ' +
      'AURIN offers it under an academic gate; MS GlobalML EXCLUDED. Per-capital LiDAR coverage fraction ' +
      'is UNKNOWN (owed ELVIS index probe). Until the stamp lands every AU state is mass-only.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// REGION → SOURCE. Maps each `bake.mjs` REGIONS entry to its height source (or an honest gap).
// A region absent here (or mapped to a no-source country) keeps OSM footprints = 9 m assumed.
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_SOURCE = {
  // ES — MDS Edificación (mdsn_e025) = REAL MEASURED height (`tagged`), a strict upgrade over Catastro's
  // floor-count (`derived-levels`). The raster is sampled per Catastro footprint (fetchSpainBuildingHeights),
  // so any ES bbox gets measured heights — no per-city bake REGION needed (which would double-draw over the
  // whole-`spain` OSM region). ⚠ The whole-country `spain` bbox itself is refused per-tile (Catastro has no
  // single whole-country query, and scanning ~10⁵ tiles is infeasible) → `documented` (keeps OSM); a CITY
  // bbox resolves exactly. So the CITY entries below carry the real value today; `spain` gets it once the
  // orchestrator either adds per-city bbox rows OR wires the bake OSM-footprint join (named in the source note).
  // The whole-country `spain` region DOES wire that join (bake.mjs heightJoin:'mds' → stampMdsHeightsOnGeojsonseq),
  // and its per-city ready bboxes now live in the machine-readable `MDS_CITY_BBOXES` list below (was a free-text
  // comment here) so the join can stamp each capital FIRST — see that constant + §Phase-4.
  spain: 'mds_edificacion',
  barcelona: 'mds_edificacion', madrid: 'mds_edificacion', cordoba: 'mds_edificacion', valencia: 'mds_edificacion',
  sevilla: 'mds_edificacion', malaga: 'mds_edificacion', zaragoza: 'mds_edificacion', bilbao: 'mds_edificacion',
  // §MURCIA-HEIGHT-STAMP-GAP — MDS Edificación is a NATIONAL raster (one EPSG:3042 grid over all of
  // Spain), so Murcia was always source-capable; it was simply never declared. See MDS_CITY_BBOXES.
  murcia: 'mds_edificacion',
  // NL — 3DBAG (BAG × AHN LiDAR) = REAL MEASURED roof height (`tagged`), national coverage. Like
  // Spain's MDS, heights are sampled per bbox: a CITY bbox resolves exactly; the whole-country
  // `netherlands` bbox is refused per-tile (the 3DBAG `items` API is paginated — a 4°×3° scan would
  // truncate at ~5000 arbitrary buildings) → `documented` (keeps OSM). So the whole-country region
  // renders OSM footprints (honest 9 m assumed) until either per-city bbox rows are added OR the bake
  // OSM-footprint-join is wired (stamp 3DBAG height onto bake's own OSM clip — the named follow-up,
  // exactly Spain's MDS story). Ready per-city bboxes (netherlands-latest.osm.pbf covers them all):
  //   amsterdam '4.83,52.34,4.97,52.42'   rotterdam '4.42,51.88,4.55,51.96'
  //   utrecht   '5.06,52.06,5.16,52.12'   thehague  '4.25,52.04,4.35,52.10'
  //   eindhoven '5.42,51.40,5.52,51.48'   groningen '6.52,53.20,6.60,53.25'
  netherlands: '3dbag',
  amsterdam: '3dbag',
  // FR
  paris: 'bdtopo', lyon: 'bdtopo',
  // CH
  zurich: 'swissbuildings3d', geneva: 'swissbuildings3d', bern: 'swissbuildings3d',
  // DE — per-LAND routing, not per-country. Köln (NRW) is the one German city whose height source is
  // both open AND wired: `lod2de_nrw` is `impl:'live'` and the whole-city OSM join is built
  // (bake.mjs heightJoin:'lod2nrw' → stampLod2NrwHeightsOnGeojsonseq). Berlin/Munich are DIFFERENT
  // Länder with different endpoints — mapping them to NRW would be a lie, so they stay as they were.
  koln: 'lod2de_nrw',
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
  // ───────────────────────────────────────────────────────────────────────────
  // §EUROPE-NATIONAL (2026-09-02, lane REGIONS) — one row per new bake.mjs whole-country region
  // (§BAKE-EUROPE-NATIONAL), citing context-everywhere-assessment.md §2. NONE of these is
  // impl:'live', so resolveHeights() logs the honest channel/gap and the region keeps OSM
  // `assumed` defaults — never a fabricated height, never an armed join without a wired stamp.
  estonia: 'eesti3d_ee',
  lithuania: { source: null, status: 'no-source', reason: 'per-object floors is a PRICED RC product (X3-refused); LiDAR agreement-gated — mass-only (ASSESS LT)' },
  latvia: { source: null, status: 'no-source', reason: 'VZD footprints open but floor/height attr presence UNVERIFIED (one attr probe owed) — UNKNOWN stays UNKNOWN (ASSESS LV)' },
  poland: 'bdot10k_pl',
  luxembourg: { source: null, status: 'no-source', reason: 'ACT PCN footprints CC0; national LiDAR 2019 reported NOT verified — no height channel today (ASSESS LU)' },
  sweden: 'lidar_se',
  finland: 'buildings3d_fi',
  norway: 'ndh_no',
  germany: 'lod2de',   // per-Land router owed; NRW measured heights stay live via the koln city row (heightJoin:'lod2nrw')
  france: 'mnh_fr',    // ⭐ LIVE 2026-09-04 — national MNH stamp BUILT (stampMnhFrHeightsOnGeojsonseq, working set MNH_FR_CITY_BBOXES). ⭐ WIRED 2026-09-05 (L-12910): the bake `france` row declares heightJoin:'mnh_fr'; local proof Marseille 6,578/7,887 · Paris 4,717/5,043 · Lyon 4,442/4,883 measured. The paris/lyon city rows still fold into `france` once a publish passes allow_region_removal (orchestrator).
  italy: { source: 'piedmont_it', status: 'no-source', reason: 'Piedmont-only regional layer — NO national height product; EUBUCCO/GBA ML heights excluded as authoritative (E5 §A.5) (ASSESS IT)' },
  greatbritain: 'ealidar_gb',
  ireland: { source: null, status: 'no-source', reason: 'no cadastre by design; OSi Prime2 commercial → X3-refused; OPW LiDAR partial (ASSESS IE)' },
  switzerland: 'swissbuildings3d', // ⭐ LIVE 2026-09-04 — national STAC→COG stamp BUILT (stampSwissHeightsOnGeojsonseq, working set SWISS_CITY_BBOXES). ⭐ WIRED 2026-09-05: the bake `switzerland` row declares heightJoin:'swiss' (§SWISS-OSM-JOIN). L-12883.
  austria: 'geoland_at',
  czechia: 'ruian_cz',
  portugal: 'dgt_pt',
  belgium: 'grb_be',
  croatia: { source: null, status: 'no-source', reason: 'no national open height product; LiDAR partial (L5 HR / ASSESS HR)' },
  slovenia: 'gurs_si',
  greece: { source: null, status: 'no-source', reason: 'no national footprint+height product confirmed (L5 GR / ASSESS GR)' },
  hungary: { source: null, status: 'no-source', reason: 'Lechner cadastral geometry is PAID → X3-refused; no open height channel — the fee gate binds the cadastre, NOT OSM context (ASSESS HU)' },
  romania: { source: null, status: 'no-source', reason: 'ANCPI Constructii is nationally INCOMPLETE (queryable ≠ complete) and carries no open height — mass-only (ASSESS RO)' },
  slovakia: { source: null, status: 'no-source', reason: 'ZBGIS buildings exist; DMR 5.0 LiDAR reported open — NOT verified this pass (ASSESS SK)' },
  bulgaria: { source: null, status: 'no-source', reason: 'KAIS cadastre bulk is PAID / no open bulk — context rides OSM (ASSESS BG)' },
  // ───────────────────────────────────────────────────────────────────────────
  // §INTL (2026-09-03, lane CONTEXT-INTL) — US metros, AU states, AE metros. Citations:
  // audit/geo-expansion/2026-09-02/{au-sweep,me-sweep}.md. NONE impl:'live'; NO bake row declares a
  // heightJoin, so resolveHeights() logs the honest per-region reason and the region keeps OSM `assumed`
  // defaults — never a fabricated height, never an armed join without a wired stamp.
  // US metros — Overture height + USGS 3DEP nDSM (overture_us, documented); the per-metro OPEN channels
  // the owed 3DEP stamp draws on: NYC open building heights, Chicago open footprints, Boston MassGIS.
  chicago: 'overture_us', austin: 'overture_us', houston: 'overture_us', boston: 'overture_us',
  // AU states — ELVIS nDSM derive is the owed height build (elvis_au note carries the per-state nuance:
  // ACT's 64,674 open footprints, au-sweep §7.3; Melbourne's real LoD1 extrusions, §2.3). All plain
  // strings: a `documented` custom reason would be DEAD (resolveHeights re-derives it from the SOURCES
  // note), the §BAKED-FLAG-IS-NOT-EVIDENCE anti-pattern — object form is reserved for blocked/no-source,
  // where the reason IS surfaced.
  newsouthwales: 'elvis_au',
  victoria: 'elvis_au',
  queensland: 'elvis_au',
  westernaustralia: 'elvis_au',
  southaustralia: 'elvis_au',
  tasmania: 'elvis_au',
  act: 'elvis_au',
  northernterritory: 'elvis_au',
  // AE metros — no open height channel (emirate data hosts vantage/WAF-blocked); Overture footprints,
  // honest assumed heights (Overture height ~0% in the Gulf, like Saudi). me-sweep §2/§3.
  dubai: { source: null, status: 'no-source', reason: 'AE emirate data hosts vantage-blocked (TCP timeout on all Dubai Pulse / DM GIS hosts, me-sweep §2); no open building-height channel — Overture footprints, honest assumed heights (ASSESS AE-Dubai)' },
  abudhabi: { source: null, status: 'no-source', reason: 'AD open-data API WAF-fenced ("Request Rejected"), legacy SDI hosts NXDOMAIN (me-sweep §3); no open height channel — Overture footprints, honest assumed heights (ASSESS AE-AbuDhabi)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// §MDS-CITY-BBOXES (PHASE-4, 2026-07-30) — the ES MDS Edificación "ready-bbox list": the tight
// metro-core extent for every MDS-capable Spanish capital, promoted from a free-text comment (once in
// REGION_SOURCE) to real config. The whole-country `spain` region already carries the MDS-OSM join
// (bake.mjs heightJoin:'mds' → stampMdsHeightsOnGeojsonseq), which stamps a MEASURED `mdsn_e025` P90
// height (`pryzm:height_src=measured-lidar`, `tagged`) onto bake's OWN OSM footprints. Passing these
// bboxes as that join's `priorityBboxes` makes it process each capital's tiles FIRST — so every city
// below is GUARANTEED measured heights on re-bake, exactly like Barcelona, even if the national
// `maxTiles` cap is reached mid national sweep. No new draw (footprints are stamped in place, not
// appended), no new sourcing — MDS is a keyless CC-BY WCS live-verified 2026-07-26.
//
// PROVENANCE (§CONTEXT-DATA-HONESTY — cite, don't guess): each bbox is a tight metro extent centred on
// the municipality centroid (verified centred; span ≤0.2°, well under the 0.7° whole-country MDS
// refusal guard in fetchSpainBuildingHeights). Cited per city in its dossier HEIGHT.md
// (docs/04-reference/jurisdictions/es/**/HEIGHT.md — "per-city ready bbox listed for <city>"). The
// `refcat` is the INE/Catastro municipal code (the dossier directory name). `barcelona` + `cordoba`
// are the ALREADY-BAKED reference pair; the other six are the Phase-4 additions — the `(cap)` =
// "measured-capable but unbaked" capitals in es/COUNTRY-RATE.md, the flagship of
// es/RATE-IMPLEMENTATION-PLAN.md §Phase A.
//
// PHASE-4: re-bake these cities to realise measured heights. Re-bake + R2 upload is an INFRA step
// (needs osmium + tippecanoe + geotiff, or the tools/context-bake Docker image, + R2 creds) — NOT run
// here. The whole-country `spain` region already carries heightJoin:'mds', so ONE buildings re-bake
// stamps every city below:
//     cd tools/context-bake && node bake.mjs --layer buildings
//     # then upload out/buildings.pmtiles to R2 (see tools/context-bake/README §Upload)
// then re-probe each city's baked heightProvenance histogram (the dossier HEIGHT.md H1 step).
// ⚠⚠ §BAKED-FLAG-IS-NOT-EVIDENCE (2026-08-01) — the `baked` field below is INERT METADATA. Nothing
// reads it (`git grep '\.baked'` → no call sites), so it can only ever be a claim, and on 2026-08-01
// it was a FALSE one: barcelona and cordoba were marked `baked: true` / "SHIPPED" while the shipped
// R2 tiles carried ZERO measured heights for either city.
//
// MEASURED, not inferred — `tools/context-height-probe/probe.mjs` reads the SAME bytes the browser
// reads (verdict `unmeasured` = footprints exist, none carry the measured marker):
//   barcelona 0 measured-lidar of 6,306 (tagged 55 · derived-levels 4,124 · assumed 2,127)
//   cordoba   0 measured-lidar of 5,409 (tagged 17 · derived-levels 2,944 · assumed 2,448)
//   madrid    0 of 6,266 · valencia 0 of 5,466 · murcia 0 of 3,012 (96.1 % fabricated 9 m)
//
// WHY: the two defects that stopped the join from ever producing a height — L-658 (the joins crashed
// silently; a green bake shipped 0 measured heights) and L-659 (the whole-Spain join OOM'd) — were
// BOTH fixed on 2026-08-01, and no buildings re-bake has been dispatched since. So every row here is
// `baked: false` until a probe says otherwise. Barcelona's 55 `tagged` are OSM-surveyed heights, not
// MDS samples — the 0.9 % L-582 measured on the pre-MDS tiles, unchanged.
//
// ⇒ FLIP A ROW TO `true` ONLY ON A PROBE OF THE SHIPPED TILES, never on "the bake went green"
// (§SIZE-IS-NOT-PROVENANCE — a green bake is exactly what L-658 produced while shipping nothing).
export const MDS_CITY_BBOXES = [
  // city        refcat    [w, s, e, n] (WGS84, osmium/-b order)          baked? (probe-verified only)
  // §MDS-BBOX-MUST-COVER-THE-REGION (2026-08-02) — three rows below were STRICTLY SMALLER than the
  // canonical `terrain.mjs` REGIONS row for the same city, so a strip of each baked region could
  // NEVER be stamped no matter how many times the bake ran: córdoba was short 0,01° of NORTH,
  // madrid 0,02° of EAST, valència 0,01° of WEST and 0,02° of SOUTH. Silent, because a footprint
  // outside every stamp bbox streams through the join with its original OSM tags and is reported as
  // an honest `assumed` 9 m — indistinguishable from "the source has no data here". That is the
  // failure-vs-empty family (L-422/457/467/469) once more, this time in the JOIN's working set.
  // Each row is now the UNION of its previous value and the terrain row, so no coverage is lost and
  // every baked square metre is reachable. `mdsBboxCoversTerrainRegion.test.mjs` pins the invariant.
  { city: 'barcelona', refcat: '08019', bbox: [2.05, 41.32, 2.24, 41.47],   baked: false },  // ⊇ terrain [2.09,41.32,2.23,41.47] — already covered
  { city: 'cordoba',   refcat: '14021', bbox: [-4.85, 37.83, -4.72, 37.94], baked: false },  // was n=37.93 < terrain 37.94
  { city: 'madrid',    refcat: '28079', bbox: [-3.80, 40.33, -3.58, 40.52], baked: false },  // was e=-3.60 < terrain -3.58
  { city: 'valencia',  refcat: '46250', bbox: [-0.43, 39.40, -0.30, 39.52], baked: false },  // was w=-0.42/s=39.42 inside terrain -0.43/39.40
  // ⚠ These four were NOT in the original report — the invariant test found them. Every one was
  // short of its terrain region too, bilbao on ALL FOUR sides. Widened to the union, same as above.
  { city: 'sevilla',   refcat: '41091', bbox: [-6.0545, 37.32, -5.90, 37.4491],   baked: false },  // was w=-6.03, n=37.43
  { city: 'malaga',    refcat: '29067', bbox: [-4.52, 36.66, -4.35, 36.78],       baked: false },  // was w=-4.50, n=36.76
  { city: 'zaragoza',  refcat: '50297', bbox: [-0.9591, 41.5888, -0.80, 41.7088], baked: false },  // was w=-0.95, s=41.60, n=41.70
  { city: 'bilbao',    refcat: '48020', bbox: [-3.005, 43.203, -2.865, 43.323],   baked: false },  // was short on ALL FOUR sides
  // §MURCIA-HEIGHT-STAMP-GAP — Murcia was MISSING from this list while being one of the five Spanish
  // cities under active close-out, and the omission was SILENT: this list is BOTH the `priorityBboxes`
  // (stamped first) AND the `retainBboxes` working set (bake.mjs stampBboxesFor → §HEIGHT-STAMP-BUDGET,
  // L-659). A city absent from it is not merely de-prioritised — its footprints stream straight through
  // the join with their ORIGINAL OSM tags and can NEVER be stamped, so Murcia would have measured
  // ZERO heights after a re-bake while the bake reported a green §MEASURED-HEIGHT-GATE for `spain`.
  // Its own dossier named the gap ("confirm/add the per-city MDS join" — es-mc/30030-murcia/HEIGHT.md).
  // bbox = the canonical `terrain.mjs` REGIONS `murcia` row, NOT re-invented (0.14°×0.12°, well under
  // the 0.7° whole-country refusal guard in fetchSpainBuildingHeights).
  { city: 'murcia',    refcat: '30030', bbox: [-1.2007, 37.9322, -1.0607, 38.0522], baked: false }, // PHASE-4
];

// §JOIN-BOUNDED-WORKING-SET (L-659) — the DK analogue of MDS_CITY_BBOXES, and NOT optional.
//
// The whole-`denmark` bake region declares `heightJoin:'dhm'`, so without a bounded stamp area it
// would hold every Danish OSM footprint in the V8 heap and OOM the bake the same way whole-Spain did
// (run 30693132326) — killing the run BEFORE the tiles publish, i.e. taking Barcelona down with it.
// These are the four largest Danish urban areas, which is where a DK site is actually dropped;
// everything else in the country passes through with its honest OSM tags (§CONTEXT-DATA-HONESTY).
// TO WIDEN COVERAGE: add a row. Each bbox costs ~(span/0.02°)² DHM raster tile pairs at bake time.
export const DHM_CITY_BBOXES = [
  // city         [w, s, e, n] (WGS84)
  { city: 'copenhagen', bbox: [12.45, 55.60, 12.70, 55.75] },
  { city: 'aarhus',     bbox: [10.10, 56.10, 10.28, 56.22] },
  { city: 'odense',     bbox: [10.31, 55.35, 10.46, 55.44] },
  { city: 'aalborg',    bbox: [9.86, 57.00, 10.02, 57.09] },
];

// ─────────────────────────────────────────────────────────────────────────────
// §PHASE1-DEDUP — replace-vs-append policy (CONTEXT-LOD-BUILD-PLAN.md §3). A FULL national source
// (3DBAG/BD TOPO/Catastro/LoD2-DE/GeoDanmark/swissBUILDINGS3D) describes the SAME buildings as the OSM
// clip → REPLACE it (no double-draw at 9 m + real height). A PARTIAL source (nDSM top-ups: 3DEP,
// NDH, DGT, GRB, Piedmont) fills gaps → APPEND, and the client near-cap thins any twins.
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_COVERAGE = {
  '3dbag': 'full', bdtopo: 'full', catastro: 'full', mds_edificacion: 'full', lod2de: 'full', lod2de_nrw: 'full',
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
    // §BDTOPO-CAP-TRUNCATE (live-measured 2026-07-27) — BD TOPO batiment is a FULL national layer and a
    // city bbox can hold FAR more than `limit` (Paris bake bbox = 317,361 buildings; the WFS caps at
    // `limit`). A capped response is a TRUNCATED slice, so mark it: resolveHeights then downgrades
    // replace→append (KEEP the full OSM clip + ADD these real heights) instead of REPLACING the whole
    // region with ≤limit buildings — which would delete ~98% of Paris (completeness loss ≫ a missing
    // height). Mirrors the 3DBAG/Catastro truncation→append rule; the full-city real-height coverage
    // (paginate startIndex, or a BD-TOPO→OSM vector join) is the named follow-up.
    const returned = json.features?.length ?? 0;
    return { status: 'ok', features, provenance: 'tagged', contentType: r.contentType, rawCount: returned, truncated: returned >= limit };
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
  // §NL-NATIONWIDE — a whole-country / large bbox is infeasible for the paginated `items` API (a
  // 4°×3° NL bbox would truncate at maxPages×limit ≈ 5000 buildings → an arbitrary, non-representative
  // append). Refuse LOUDLY so the caller keeps the OSM clip, exactly like fetchCatastro's guard. The
  // real whole-country path is the OSM-footprint-join (stamp 3DBAG heights onto bake's own OSM clip),
  // the same named follow-up as Spain's MDS. A CITY bbox (≤~0.6°, e.g. Amsterdam 0.14°) resolves.
  if (bboxTooLargeForWfs(bbox)) {
    return { status: 'documented', provenance: 'tagged',
      reason: `3DBAG bbox ${(bbox[2] - bbox[0]).toFixed(2)}°×${(bbox[3] - bbox[1]).toFixed(2)}° is too large ` +
        'for the paginated items API; tile to per-city bboxes (≤~0.6°) or use the OSM-footprint-join ' +
        '(stamp 3DBAG height onto bake\'s OSM clip). Whole-country keeps OSM (honest assumed default).' };
  }
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
const GEODANMARK_BLOCKED_REASON =
  'GeoDanmark is apikey-gated — set DATAFORDELER_API_KEY (mint at portal.datafordeler.dk; reuse the ' +
  'Matrikel/DHM key). Datafordeler Basic Auth was retired (git 1fc5bc8b); the 2026 host takes &apikey=. ' +
  'No keyless bbox path (wfs.datafordeler.dk → HTTP 401 without a key).';

/**
 * Shared GeoDanmark `Bygning` footprint fetch. Returns footprints in BOTH native EPSG:25832 (E,N — for
 * nDSM raster sampling, the DHM's own CRS) and WGS84 lon/lat (for the GeoJSON output), so the height
 * pass never re-projects a coordinate twice.
 *
 * ⚠ WFS bbox is METRIC (EPSG:25832 easting/northing), not lat/lon: this is a PROJECTED urn CRS, whose
 * EPSG axis order is (E,N), so the request box is minE,minN,maxE,maxN. (The old lat/lon box selected a
 * ~0 m² area near the projection origin — it only ever ran auth-blocked, so it was never caught live.)
 * @returns { status:'ok', buildings:[{ extNative:[[E,N]…], interiorsNative:[[…]…], ringWgs84:[[lon,lat]…], cx,cy }], contentType }
 *          | { status:'error'|'blocked', reason }
 */
async function fetchGeoDanmarkFootprints(bbox, { apikey, timeoutMs = 40_000, count = 6000 } = {}) {
  const [w, s, e, n] = bbox;
  // Project the 4 WGS84 corners → native EPSG:25832 and take the metric min/max (UTM grid convergence
  // rotates the box slightly, so cover all four corners).
  const c = [wgs84ToUtm32(s, w), wgs84ToUtm32(s, e), wgs84ToUtm32(n, w), wgs84ToUtm32(n, e)];
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  const minE = Math.min(...xs), maxE = Math.max(...xs), minN = Math.min(...ys), maxN = Math.max(...ys);
  const url = `https://wfs.datafordeler.dk/GeoDanmarkVektor/GeoDanmark60_NOHIST_GML3/1.0.0/WFS` +
    `?service=WFS&version=2.0.0&request=GetFeature&typeNames=gdk60:Bygning` +
    `&srsName=urn:ogc:def:crs:EPSG::25832&count=${count}` +
    `&bbox=${minE.toFixed(0)},${minN.toFixed(0)},${maxE.toFixed(0)},${maxN.toFixed(0)},urn:ogc:def:crs:EPSG::25832` +
    `&apikey=${encodeURIComponent(apikey)}`;
  const r = await httpGet(url, { timeoutMs });
  if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
  const members = r.body.match(/<gdk60:Bygning\b[\s\S]*?<\/gdk60:Bygning>/g) ?? [];
  const buildings = [];
  for (const m of members) {
    const extM = m.match(/<gml:exterior>[\s\S]*?<gml:posList([^>]*)>([\s\S]*?)<\/gml:posList>/);
    if (!extM) continue;
    const dim = /srsDimension\s*=\s*"3"/i.test(extM[1]) ? 3 : 2; // GeoDanmark GML3 is normally 2D.
    const extNative = parseNativeRing(extM[2], dim);
    if (!extNative) continue;
    const interiorsNative = [...m.matchAll(/<gml:interior>[\s\S]*?<gml:posList([^>]*)>([\s\S]*?)<\/gml:posList>/g)]
      .map((x) => parseNativeRing(x[2], /srsDimension\s*=\s*"3"/i.test(x[1]) ? 3 : 2)).filter(Boolean);
    const ringWgs84 = nativeRingToWgs84(extNative);
    if (!ringWgs84) continue;
    let cx = 0, cy = 0;
    for (const [X, Y] of extNative) { cx += X; cy += Y; }
    cx /= extNative.length; cy /= extNative.length;
    buildings.push({ extNative, interiorsNative, ringWgs84, cx, cy });
  }
  return { status: 'ok', contentType: r.contentType, buildings };
}

/** Parse a GML posList in native EPSG:25832 → a closed [[E,N]…] ring (metres), or null if degenerate. */
function parseNativeRing(text, dim) {
  const nums = String(text).trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i + dim <= nums.length; i += dim) {
    const E = nums[i], N = nums[i + 1];
    if (!Number.isFinite(E) || !Number.isFinite(N)) return null;
    ring.push([E, N]);
  }
  if (ring.length < 3) return null;
  const f = ring[0], l = ring[ring.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
  if (ring.length < 4) return null;
  return ring;
}
/** Native EPSG:25832 [E,N] ring → WGS84 [lon,lat] ring (GeoJSON order), or null. */
function nativeRingToWgs84(ringNative) {
  const out = [];
  for (const [E, N] of ringNative) {
    const { lat, lon } = utmNToWgs84(E, N, 32);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    out.push([lon, lat]);
  }
  return out.length >= 4 ? out : null;
}

// ── DHM nDSM (DSM−DTM) raster machinery — the REAL DK LoD1 height source. ────────────────────────
// Denmark publishes NO building-height attribute (GeoDanmark Bygning = footprints only, verified), so
// the honest height is the normalised DSM: (roof-inclusive surface) − (bare terrain), sampled inside
// each footprint. Both coverages ride the SAME Datafordeler WCS behind the SAME apikey (mirrors the DK
// terrain adapter in terrain.mjs): DSM=dhm_overflade, DTM=dhm_terraen, WCS 1.0.0, native EPSG:25832,
// FORMAT=GTiff. Per §CONTEXT-DATA-HONESTY + the height-engine invariants (tools/height-engine): the
// per-building height is the P90 of the nDSM over the footprint ERODED inward (façade/tree/overhang
// returns excluded) — NEVER the raw peak (chimneys/antennae) — and a footprint with too few clean
// samples gets NO height (honest skip → the client's assumed default), never a fabricated number.
const DHM_WCS = {
  endpoint: 'https://wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS',
  dsm: 'dhm_overflade', // surface model — includes buildings + vegetation
  dtm: 'dhm_terraen',   // bare-earth terrain model
  crs: 'EPSG:25832', format: 'GTiff', nativeResM: 0.4,
};
const DHM_NODATA_MAG = 1e6; // DHM encodes voids as very-large magnitudes; treat |v|>1e6 as nodata.

// ⚠ SECRET-SAFE: the apikey rides ONLY on the request URL passed straight to fetch(); it is never
// logged, returned, or embedded in any `note`/feature (defense-in-depth against a CI-log leak).
/** WCS 1.0.0 GetCoverage URL for a DHM coverage over a native EPSG:25832 box → a GeoTIFF. */
function dhmCoverageUrl(coverageId, [x0, y0, x1, y1], dim, apikey) {
  return `${DHM_WCS.endpoint}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${coverageId}` +
    `&CRS=${DHM_WCS.crs}&BBOX=${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}` +
    `&WIDTH=${dim}&HEIGHT=${dim}&FORMAT=${DHM_WCS.format}&apikey=${encodeURIComponent(apikey)}`;
}

/** GET raw bytes with a timeout (never throws at the caller boundary; returns {ok,status,ct,ab,reason}).
 *
 * §FETCH-THROW-IS-NOT-A-SWEEP-ABORT (2026-08-02). This contract — "never throws at the caller
 * boundary" — was DOCUMENTED HERE AND NOT IMPLEMENTED: the body was `try { … } finally
 * { clearTimeout(t) }` with **no `catch`**, so a DNS blip, a reset socket or an abort escaped as
 * `TypeError: fetch failed` and unwound the caller.
 *
 * That is not cosmetic, because all FOUR national sweeps (`stampMdsHeightsOnGeojsonseq`,
 * `stampDhm…`, `stampSwiss…`, `stampLod2Nrw…`) are written against the documented contract: they
 * test `if (!rr.ok) { tileErrors++; continue; }` per tile, and only wrap the whole grid in a
 * try/catch as a last resort. So a throw skipped the per-tile handler entirely and hit the outer
 * catch, which sets `sweepAborted` and ENDS THE WHOLE COUNTRY.
 *
 * MEASURED in run 30715958488 (2026-08-01): Spain stamped 10 925/431 256 footprints off **12 tiles**
 * and reported `SWEEP ABORTED after 12 tile(s) — fetch failed`, while Denmark (257 829/320 931) and
 * Köln (118 603/141 271) — which happened not to hit a blip — stamped ~80 %. One transient failure
 * on one tile cost every Spanish city its heights, and did so AFTER a ~2.7-hour tiling pass.
 *
 * The fix is to honour the documented contract, so the existing per-tile handling takes over: a bad
 * tile becomes `tileErrors++` and the sweep moves on. `reason` is carried so a caller can say WHY a
 * tile failed rather than only that it did (§CONTEXT-DATA-HONESTY — a failure must stay
 * distinguishable from an empty result). One retry is attempted first: a tile is thousands of
 * footprints, and a blip is worth exactly one cheap second chance — but never an infinite one.
 */
async function httpGetBuffer(url, { timeoutMs = 90_000, retries = 1 } = {}) {
  let lastReason = 'unknown';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { Accept: 'image/tiff' } });
      const ct = res.headers.get('content-type') ?? '';
      const ab = await res.arrayBuffer();
      return { ok: res.ok, status: res.status, ct, ab, reason: res.ok ? null : `HTTP ${res.status}` };
    } catch (err) {
      // The whole point of this catch: a network-layer throw must become a VALUE, not an unwind.
      lastReason = String(err?.message ?? err);
    } finally { clearTimeout(t); }
  }
  return { ok: false, status: 0, ct: '', ab: null, reason: lastReason };
}

/** Lazy `geotiff` import — the module stays importable/probeable without the dep (mirrors terrain.mjs's
 *  dependency-injection). geotiff IS installed under tools/context-bake/node_modules, so the bake path
 *  resolves it; a bare checkout without it degrades to footprints-only `documented` (never a fake height). */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}

/** Read a DHM GeoTIFF (ArrayBuffer) → { width, height, values:Float32Array (row-major, top=maxY),
 *  bboxNative:[minX,minY,maxX,maxY] }. Native orthometric surface/terrain metres (DVR90). */
async function readDhmRaster(ab, geotiffMod) {
  const { fromArrayBuffer } = geotiffMod;
  const buf = ab instanceof ArrayBuffer ? ab : ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [values] = await img.readRasters();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  return { width: img.getWidth(), height: img.getHeight(), values: Float32Array.from(values), bboxNative: [minX, minY, maxX, maxY] };
}

/** Bilinear sample of a native-CRS raster at (X,Y); NaN if outside the extent or all-nodata locally. */
function sampleRasterNative(r, X, Y) {
  const [minX, minY, maxX, maxY] = r.bboxNative;
  if (X < minX || X > maxX || Y < minY || Y > maxY) return NaN;
  const fx = ((X - minX) / (maxX - minX)) * (r.width - 1);
  const fy = ((maxY - Y) / (maxY - minY)) * (r.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(r.width - 1, x0 + 1), y1 = Math.min(r.height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const q = [r.values[y0 * r.width + x0], r.values[y0 * r.width + x1], r.values[y1 * r.width + x0], r.values[y1 * r.width + x1]];
  const bad = q.some((v) => !Number.isFinite(v) || Math.abs(v) > DHM_NODATA_MAG);
  if (bad) { // any nodata corner → mean of the valid corners (honest nearest-valid), else NaN.
    const ok = q.filter((v) => Number.isFinite(v) && Math.abs(v) <= DHM_NODATA_MAG);
    return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN;
  }
  const [a, b, cc, d] = q;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty;
}

const _pointInRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};
const _distToSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const _distToRings = (x, y, rings) => {
  let best = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const d = _distToSeg(x, y, ring[i - 1][0], ring[i - 1][1], ring[i][0], ring[i][1]);
    if (d < best) best = d;
  }
  return best;
};
const _percentile = (sortedAsc, p) => {
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
};

/**
 * nDSM building height for ONE footprint from the DSM+DTM rasters. Samples a native grid at `sampleStep`
 * over the footprint, keeps only cells inside the exterior, outside every hole, and ≥ `erodeM` from any
 * boundary (façade/overhang erosion), computes nDSM = DSM−DTM per cell, then returns the P90 (robust to
 * chimneys/antennae). Returns null when too few clean samples remain — an HONEST skip, never a guess.
 */
export function ndsmHeightForBuilding(b, dsm, dtm, { erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0 } = {}) {
  const ext = b.extNative;
  const rings = [ext, ...b.interiorsNative];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ext) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const nd = [];
  for (let Y = minY + sampleStep / 2; Y <= maxY; Y += sampleStep) {
    for (let X = minX + sampleStep / 2; X <= maxX; X += sampleStep) {
      if (!_pointInRing(X, Y, ext)) continue;
      let inHole = false;
      for (let k = 1; k < rings.length; k++) if (_pointInRing(X, Y, rings[k])) { inHole = true; break; }
      if (inHole) continue;
      if (_distToRings(X, Y, rings) < erodeM) continue; // erode inward — drop façade/edge cells
      const ds = sampleRasterNative(dsm, X, Y); if (!Number.isFinite(ds)) continue;
      const dt = sampleRasterNative(dtm, X, Y); if (!Number.isFinite(dt)) continue;
      const d = ds - dt;
      if (!Number.isFinite(d) || d < -1) continue; // strongly negative = misalignment/noise → drop
      nd.push(Math.max(0, d));
    }
  }
  if (nd.length < minSamples) return null;
  nd.sort((x, y) => x - y);
  const h = _percentile(nd, percentile);
  return h > 0 ? { height: clampHeight(h), samples: nd.length, medianNdsm: _percentile(nd, 50), maxNdsm: nd[nd.length - 1] } : null;
}

// ── DK GeoDanmark Bygning (footprints) — apikey-GATED (DATAFORDELER_API_KEY). ─────────────────────
// Footprints-only variant (NO height). Kept as the honest low-tier: GeoDanmark `Bygning` carries no
// scalar height (verified 2026-07-25 against the Datafordeler objekttypekatalog: BBRUUID/bygningstype/
// målestedBygning/metode3D/underMinimumBygning/BBRaktion/synligBygning/overlapBygning/geometri —
// metode3D is capture-method, not a height). Returns `documented` (region keeps OSM) or `blocked` (no
// key). The REAL height path is fetchGeoDanmarkHeights (DHM DSM−DTM nDSM) below.
export async function fetchGeoDanmark(bbox, { timeoutMs = 40_000, env = process.env } = {}) {
  const apikey = env.DATAFORDELER_API_KEY;
  if (!apikey) return { status: 'blocked', reason: GEODANMARK_BLOCKED_REASON };
  try {
    const fp = await fetchGeoDanmarkFootprints(bbox, { apikey, timeoutMs });
    if (fp.status !== 'ok') return fp;
    return {
      status: 'documented', provenance: 'assumed', contentType: fp.contentType, reachedWithKey: true,
      hasHeightAttribute: false, footprintCount: fp.buildings.length,
      sampleRing: fp.buildings[0]?.ringWgs84?.slice(0, 3) ?? null, features: [],
      note: `GeoDanmark Bygning reached with apikey — ${fp.buildings.length} footprint(s) (EPSG:25832→WGS84). ` +
        '⚠ NO height attribute on the object. Real DK height = DHM DSM−DTM nDSM (fetchGeoDanmarkHeights).',
    };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/**
 * DK REAL LoD1 heights — GeoDanmark footprints × DHM nDSM (DSM−DTM). apikey-GATED (DATAFORDELER_API_KEY).
 * For each `Bygning` footprint: height = P90 of (dhm_overflade − dhm_terraen) over the eroded footprint
 * interior → provenance `tagged` (MEASURED from lidar). A footprint with no usable nDSM keeps NO height
 * (honest — client renders the assumed default). §CONTEXT-DATA-HONESTY: never a fabricated height; the
 * key-absent path is `blocked` (loud), not a silent skip.
 *
 * The region bbox (a whole city) is far larger than one WCS request, so the DHM rasters are fetched in a
 * bounded TILE GRID (each ≤ `maxTilePx` px at `resM`); footprints are sampled from the tile containing
 * their centroid (fetched box padded so edge cells are covered). Tiles with no footprints are skipped.
 */
export async function fetchGeoDanmarkHeights(bbox, {
  timeoutMs = 40_000, env = process.env,
  resM = 2.0, maxTilePx = 1000, maxTiles = 80, padM = 40,
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
} = {}) {
  const apikey = env.DATAFORDELER_API_KEY;
  if (!apikey) return { status: 'blocked', reason: GEODANMARK_BLOCKED_REASON };
  try {
    const fp = await fetchGeoDanmarkFootprints(bbox, { apikey, timeoutMs });
    if (fp.status !== 'ok') return fp;
    if (fp.buildings.length === 0) {
      return { status: 'documented', provenance: 'assumed', reachedWithKey: true, footprintCount: 0, features: [],
        note: 'GeoDanmark reached with apikey but 0 footprints in bbox — region keeps OSM.' };
    }
    const gt = await loadGeoTiff();
    if (!gt) {
      // Footprints reached but the raster reader is absent → cannot compute nDSM honestly. Keep OSM.
      return { status: 'documented', provenance: 'assumed', reachedWithKey: true, footprintCount: fp.buildings.length, features: [],
        note: `GeoDanmark ${fp.buildings.length} footprint(s) reached, but the geotiff dep is unavailable here — ` +
          'no nDSM computed (install geotiff in the bake image). Region keeps OSM; no fabricated height.' };
    }

    // Tile the native EPSG:25832 extent covering the bbox.
    const c = [wgs84ToUtm32(bbox[1], bbox[0]), wgs84ToUtm32(bbox[1], bbox[2]), wgs84ToUtm32(bbox[3], bbox[0]), wgs84ToUtm32(bbox[3], bbox[2])];
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    const minE = Math.min(...xs), maxE = Math.max(...xs), minN = Math.min(...ys), maxN = Math.max(...ys);
    const tileSpan = resM * maxTilePx;
    const nx = Math.max(1, Math.ceil((maxE - minE) / tileSpan));
    const ny = Math.max(1, Math.ceil((maxN - minN) / tileSpan));

    let processedTiles = 0, tileErrors = 0, tileCapHit = false;
    const heights = [];
    outer:
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const tx0 = minE + ix * tileSpan, ty0 = minN + iy * tileSpan;
        const tx1 = Math.min(tx0 + tileSpan, maxE), ty1 = Math.min(ty0 + tileSpan, maxN);
        const inTile = fp.buildings.filter((b) => !b._done && b.cx >= tx0 && b.cx < tx1 + 1e-6 && b.cy >= ty0 && b.cy < ty1 + 1e-6);
        if (inTile.length === 0) continue;
        if (processedTiles >= maxTiles) { tileCapHit = true; break outer; }
        const box = [tx0 - padM, ty0 - padM, tx1 + padM, ty1 + padM];
        const dim = Math.max(2, Math.min(maxTilePx, Math.round(Math.max(box[2] - box[0], box[3] - box[1]) / resM)));
        const dsmR = await httpGetBuffer(dhmCoverageUrl(DHM_WCS.dsm, box, dim, apikey), { timeoutMs: 120_000 });
        const dtmR = await httpGetBuffer(dhmCoverageUrl(DHM_WCS.dtm, box, dim, apikey), { timeoutMs: 120_000 });
        if (!dsmR.ok || !dtmR.ok || !/tiff/i.test(dsmR.ct) || !/tiff/i.test(dtmR.ct)) { tileErrors++; continue; }
        let dsm, dtm;
        try { dsm = await readDhmRaster(dsmR.ab, gt); dtm = await readDhmRaster(dtmR.ab, gt); }
        catch { tileErrors++; continue; }
        for (const b of inTile) {
          b._done = true;
          const h = ndsmHeightForBuilding(b, dsm, dtm, { erodeM, percentile, minSamples, sampleStep });
          if (h) { b.height = h.height; heights.push(h.height); }
        }
        processedTiles++;
      }
    }

    // Emit EVERY footprint. A measured nDSM → `height` (tagged); no usable nDSM → footprint only
    // (building:yes, client assumes the default). Never a fabricated height.
    const features = fp.buildings.map((b) => toFeature(
      { type: 'Polygon', coordinates: [b.ringWgs84, ...b.interiorsNative.map((r) => nativeRingToWgs84(r)).filter(Boolean)] },
      nationalBuildingTags({
        heightM: Number.isFinite(b.height) ? b.height : undefined,
        provenance: Number.isFinite(b.height) ? 'tagged' : 'assumed',
        source: 'geodanmark',
      }),
    ));
    const measured = heights.length;
    if (measured === 0) {
      // No building got a real height (raster errors / degenerate footprints). Do NOT replace OSM with a
      // fully heightless national set — keep OSM (honest), same as the footprints-only path.
      return { status: 'documented', provenance: 'assumed', reachedWithKey: true, hasHeightAttribute: false,
        footprintCount: fp.buildings.length, features: [], tileErrors,
        note: `GeoDanmark ${fp.buildings.length} footprint(s) reached but nDSM yielded 0 heights ` +
          `(${tileErrors} tile fetch/read error(s)) — region keeps OSM; no fabricated height.` };
    }
    const coverage = measured / fp.buildings.length;
    // If most footprints lack a measured height (or tiling was capped), don't REPLACE OSM — downgrade to
    // APPEND (truncated) so real OSM height tags aren't dropped; the client near-cap thins twins.
    const truncated = tileCapHit || coverage < 0.6;
    heights.sort((a, b) => a - b);
    return {
      status: 'ok', provenance: 'tagged', contentType: fp.contentType, features, truncated,
      footprintCount: fp.buildings.length, measuredCount: measured, coverage: Number(coverage.toFixed(3)),
      heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
      tilesProcessed: processedTiles, tileErrors, tileCapHit, tileGrid: `${nx}×${ny}`,
      note: `GeoDanmark × DHM nDSM (P90 of dhm_overflade−dhm_terraen, eroded ${erodeM} m) → ${measured}/${fp.buildings.length} ` +
        `footprint(s) got a MEASURED height (tagged); ${processedTiles} tile(s), ${tileErrors} error(s)` +
        `${truncated ? ' — partial coverage → APPEND (OSM kept)' : ' → REPLACE'}.`,
    };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

// ── ES CNIG MDS Edificación (mdsn_e025) — the building nDSM raster. REAL MEASURED height. ─────────
// WHY this and not Catastro's floor count: the founder-verified GEO-DATA-SOURCING-MASTER names MDS
// Edificación as Spain's cleanest height source — a raster that ISOLATES building surfaces, so the
// pixel value is the building height above ground directly (NO DSM−DTM subtraction like DK). Keyless
// CC-BY WCS 2.0.1 on the dedicated CNIG surface service (wcs-mds.idee.es/mds; siblings mds05 raw
// surface + mdsn_v025 vegetation). LIVE-VERIFIED 2026-07-26: GetCoverage COVERAGEID=mdsn_e025 over an
// EPSG:4326 lat/long SUBSET returns image/tiff; native grid is EPSG:3042 (ETRS89/UTM30N, a SINGLE
// projection spanning all Spain incl. Barcelona in zone 31) at 2.5 m; value = metres of building height,
// 0 where no building (no sentinel nodata seen). Because the raster is served in EPSG:4326 (mirrors the
// ES terrain adapter's wcs2-geo request), footprints are sampled in a local metric frame at each
// footprint's centroid and mapped back to lon/lat to read the raster — so erosion + P90 stay metric
// exactly like the DK nDSM path, with NO new forward projector.
const MDS_WCS = {
  endpoint: 'https://wcs-mds.idee.es/mds',
  coverageEdificacion: 'mdsn_e025', // MDS normalizado Edificación 2.5 m — the building-class nDSM
  crs4326: 'http://www.opengis.net/def/crs/EPSG/0/4326',
  nativeResM: 2.5,
};
/** WCS 2.0.1 GetCoverage URL for mdsn_e025 over a WGS84 [w,s,e,n] box → a GeoTIFF in EPSG:4326. */
function mdsCoverageUrl([w, s, e, n]) {
  return `${MDS_WCS.endpoint}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${MDS_WCS.coverageEdificacion}` +
    `&FORMAT=image/tiff&SUBSET=lat(${s},${n})&SUBSET=long(${w},${e})` +
    `&SUBSETTINGCRS=${MDS_WCS.crs4326}&OUTPUTCRS=${MDS_WCS.crs4326}`;
}

// ── CH swisstopo nDSM (swissSURFACE3D Raster − swissALTI3D) — the KEYLESS DK-analogue for Switzerland. ──
// The channel, the probed COG structure, the licence text and the city working set live in
// heights/swissNdsm.mjs (pure, unit-tested); the join itself is `stampSwissHeightsOnGeojsonseq` below.
// ⚠ HISTORY, kept so nobody rebuilds the dead shape: the 2026-07-26 draft here assumed a WCS 2.0.1
// GetCoverage-in-4326 at data.geo.admin.ch/<collection>/wcs. That host is an OBJECT STORE — the request
// returned HTTP 404 NoSuchKey (probed 2026-07-27) — so the draft's `swissCoverageUrl`, its 4326-frame
// sampler `swissNdsmHeightForBuilding`, and the WCS constants were REMOVED on 2026-09-04. The rebuilt
// join samples in native LV95 metres through the DK `ndsmHeightForBuilding` (no second sampler).

/**
 * MDS building height for ONE footprint from the mdsn_e025 raster (served in EPSG:4326). Mirrors the DK
 * `ndsmHeightForBuilding` (metric erosion + P90 over the eroded interior) but samples ONE raster whose
 * value IS the normalised building height (no DSM−DTM). Builds a local equirectangular METRIC frame at
 * the footprint centroid so `erodeM`/`sampleStepM` stay in metres, and maps each interior sample back to
 * lon/lat to read the raster. Returns null when too few clean samples remain — an HONEST skip, never a guess.
 * @param extWgs84       exterior ring [[lon,lat]…]
 * @param interiorsWgs84 hole rings [[[lon,lat]…]…]
 * @param mds            raster from readDhmRaster (bboxNative = [minLon,minLat,maxLon,maxLat])
 */
export function mdsHeightForBuilding(extWgs84, interiorsWgs84, mds, { erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 2.5 } = {}) {
  if (!Array.isArray(extWgs84) || extWgs84.length < 4) return null;
  let clon = 0, clat = 0;
  for (const [lon, lat] of extWgs84) { clon += lon; clat += lat; }
  clon /= extWgs84.length; clat /= extWgs84.length;
  const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos((clat * Math.PI) / 180);
  const toM = ([lon, lat]) => [(lon - clon) * mPerDegLon, (lat - clat) * mPerDegLat];
  const ext = extWgs84.map(toM);
  const rings = [ext, ...(interiorsWgs84 ?? []).filter((r) => Array.isArray(r) && r.length >= 4).map((r) => r.map(toM))];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ext) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const vals = [];
  for (let Y = minY + sampleStepM / 2; Y <= maxY; Y += sampleStepM) {
    for (let X = minX + sampleStepM / 2; X <= maxX; X += sampleStepM) {
      if (!_pointInRing(X, Y, ext)) continue;
      let inHole = false;
      for (let k = 1; k < rings.length; k++) if (_pointInRing(X, Y, rings[k])) { inHole = true; break; }
      if (inHole) continue;
      if (_distToRings(X, Y, rings) < erodeM) continue; // erode inward — drop façade/edge cells
      const lon = clon + X / mPerDegLon, lat = clat + Y / mPerDegLat;
      const v = sampleRasterNative(mds, lon, lat);
      if (!Number.isFinite(v) || v < -1) continue; // strongly negative = noise → drop (saw min ~−1 m)
      vals.push(Math.max(0, v));
    }
  }
  if (vals.length < minSamples) return null;
  vals.sort((a, b) => a - b);
  const h = _percentile(vals, percentile);
  return h > 0 ? { height: clampHeight(h), samples: vals.length, medianMds: _percentile(vals, 50), maxMds: vals[vals.length - 1] } : null;
}

/**
 * ES REAL LoD1 heights — Catastro footprints × MDS Edificación (mdsn_e025) nDSM. Keyless (CC-BY, no auth).
 * For each Catastro `BuildingPart` footprint: height = P90 of the MDS building raster over the eroded
 * footprint interior → provenance `tagged` (MEASURED). A footprint with no usable MDS sample keeps its
 * Catastro floor count (`derived-levels`), or footprint-only (`assumed`) — §CONTEXT-DATA-HONESTY: never a
 * fabricated height. Coverage 'full' (Catastro footprints) → REPLACE; a partial/capped fetch downgrades to
 * APPEND so real OSM height tags aren't dropped.
 *
 * ⚠ SCOPE: this works on a CITY / neighbourhood bbox. The WHOLE-COUNTRY `spain` bbox is REFUSED per-tile —
 * Catastro has no single whole-country query, and per-tile scanning ~10⁵ tiles (most empty ocean) is
 * infeasible — so it returns `documented` (region keeps OSM), NOT a fake partial. The raster (mdsn_e025)
 * DOES cover the whole country, so the honest whole-country path is to sample it over bake's OWN OSM
 * footprint clip (a bake.mjs join, out of this module's scope) — named as the follow-up. `maxSpanDeg`
 * bounds the refusal; a bbox within it is fully tiled with a `maxTiles` guard.
 */
export async function fetchSpainBuildingHeights(bbox, {
  timeoutMs = 120_000, env = process.env,
  maxSpanDeg = 0.7, tileSpanDeg = 0.02, maxTiles = 80, padDeg = 0.0015,
  buildingCap = 1500, erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 2.5,
} = {}) {
  void env;
  if (!bbox) return { status: 'error', reason: 'no bbox supplied for mds_edificacion' };
  const [w, s, e, n] = bbox;
  // Whole-country / large bbox → refuse LOUDLY (keep OSM), like fetchCatastro's bboxTooLargeForWfs guard.
  if ((e - w) > maxSpanDeg || (n - s) > maxSpanDeg) {
    return {
      status: 'documented', provenance: 'tagged',
      reason: `MDS Edificación bbox ${(e - w).toFixed(2)}°×${(n - s).toFixed(2)}° exceeds ${maxSpanDeg}° — ` +
        'per-tile Catastro footprint fetch cannot scan a whole-country bbox. Resolve per CITY bbox ' +
        '(barcelona/madrid/córdoba get real measured heights), or sample mdsn_e025 over bake\'s OSM ' +
        'footprint clip for whole-country coverage (bake.mjs join — follow-up). Region keeps OSM.',
    };
  }
  const gt = await loadGeoTiff();
  if (!gt) {
    return { status: 'documented', provenance: 'assumed', features: [],
      note: 'MDS Edificación: geotiff dep unavailable here — no nDSM computed (install geotiff in the bake image). Region keeps OSM; no fabricated height.' };
  }

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  let processedTiles = 0, tileErrors = 0, catastroErrors = 0, emptyTiles = 0, tileCapHit = false;
  const allBuildings = []; // { ext:[[lon,lat]…], interiors:[[[lon,lat]…]…], floors?, height? }
  const heights = [];
  try {
    outer:
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
        const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
        if (processedTiles >= maxTiles) { tileCapHit = true; break outer; }
        // 1) footprints from Catastro for this tile (WGS84 rings + derived-levels floors)
        const cat = await fetchCatastro([tw, ts, te, tn], { buildingCap, timeoutMs });
        if (cat.status !== 'ok') { if (cat.status === 'error') catastroErrors++; continue; }
        const fps = [];
        for (const f of cat.features ?? []) {
          const coords = f.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length === 0) continue;
          const floors = Number(f.properties?.['building:levels']);
          fps.push({ ext: coords[0], interiors: coords.slice(1), floors: Number.isFinite(floors) && floors > 0 ? floors : undefined });
        }
        if (fps.length === 0) { emptyTiles++; continue; }
        // 2) MDS raster for the padded tile (EPSG:4326)
        const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
        const rr = await httpGetBuffer(mdsCoverageUrl(rbox), { timeoutMs });
        if (!rr.ok || !/tiff/i.test(rr.ct)) { tileErrors++; for (const b of fps) allBuildings.push(b); continue; }
        let mds;
        try { mds = await readDhmRaster(rr.ab, gt); }
        catch { tileErrors++; for (const b of fps) allBuildings.push(b); continue; }
        // 3) sample each footprint → measured height (P90)
        for (const b of fps) {
          const h = mdsHeightForBuilding(b.ext, b.interiors, mds, { erodeM, percentile, minSamples, sampleStepM });
          if (h) { b.height = h.height; heights.push(h.height); }
          allBuildings.push(b);
        }
        processedTiles++;
      }
    }
  } catch (err) {
    if (allBuildings.length === 0) return { status: 'error', reason: String(err?.message ?? err) };
    tileCapHit = true; // network cut mid-grid → treat as partial (append)
  }

  if (allBuildings.length === 0) {
    return { status: 'documented', provenance: 'assumed', features: [], processedTiles, tileErrors, catastroErrors, tileCapHit,
      note: `MDS Edificación: 0 Catastro footprint(s) over ${processedTiles + emptyTiles} tile(s) ` +
        `(${catastroErrors} Catastro error(s)) — region keeps OSM; no fabricated height.` };
  }

  const features = allBuildings.map((b) => toFeature(
    { type: 'Polygon', coordinates: [b.ext, ...b.interiors] },
    nationalBuildingTags({
      heightM: Number.isFinite(b.height) ? b.height : undefined,
      floors: b.floors,
      provenance: Number.isFinite(b.height) ? 'tagged' : (Number.isFinite(b.floors) ? 'derived-levels' : 'assumed'),
      source: 'mds_edificacion',
    }),
  ));
  const measured = heights.length;
  const coverage = measured / allBuildings.length;
  // Downgrade REPLACE→APPEND on partial coverage so real OSM height tags aren't dropped (mirror DK).
  const truncated = tileCapHit || coverage < 0.6;
  heights.sort((a, b) => a - b);
  return {
    status: 'ok', provenance: 'tagged', features, truncated,
    footprintCount: allBuildings.length, measuredCount: measured, coverage: Number(coverage.toFixed(3)),
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, catastroErrors, emptyTiles, tileCapHit, tileGrid: `${nx}×${ny}`,
    note: `MDS Edificación (mdsn_e025 P90 over eroded footprint, Catastro footprints) → ${measured}/${allBuildings.length} ` +
      `footprint(s) got a MEASURED height (tagged); ${processedTiles} tile(s), ${tileErrors} raster error(s), ` +
      `${catastroErrors} Catastro error(s)${truncated ? ' — partial → APPEND (OSM kept)' : ' → REPLACE'}.`,
  };
}

// ── ES WHOLE-COUNTRY join — stamp MDS Edificación heights onto bake's OWN OSM footprints. ────────
// §MDS-OSM-JOIN (L-6xx, 2026-07-26) — the whole-country answer `fetchSpainBuildingHeights` names as
// its follow-up. That fetcher pairs the MDS raster with CATASTRO footprints, one slow (~50 s) WFS
// call per tile, and REFUSES a whole-country bbox — so `resolveHeights('spain')` returns `documented`
// and the national `spain` region keeps the flat 9 m OSM guess. THIS function closes that gap: it
// samples the SAME keyless MDS raster (mdsn_e025) against the OSM building footprints bake ALREADY
// clipped for the region, stamping a MEASURED `height` (tagged) onto each. No Catastro, no second
// draw (the OSM footprints are MUTATED in place, not appended beside a national set), works over the
// whole `spain` bbox by tiling ONLY the tiles that actually contain footprints.
//
// HONESTY (§CONTEXT-DATA-HONESTY): a footprint that gets a clean MDS sample → real `height` (client
// derives `tagged`). A footprint with no clean sample keeps its ORIGINAL OSM tags UNTOUCHED (its own
// `height`/`building:levels`, else the client's assumed 9 m default) — never a fabricated number.
// Tiles beyond `maxTiles`, or a raster/read error, leave their footprints at the OSM default — the
// join only ever ADDS real heights, never removes a building or invents one.

/** Exterior ring + holes (WGS84 [lon,lat]) + centroid for ONE GeoJSON building feature, or null.
 *  Polygon → its rings; MultiPolygon → the LARGEST sub-polygon (a single P90 height per feature). */
function footprintFromFeature(feat) {
  const g = feat?.geometry;
  if (!g) return null;
  let rings = null;
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    rings = g.coordinates;
  } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    let best = null, bestA = -Infinity;
    for (const poly of g.coordinates) {
      const ext = poly?.[0];
      if (!Array.isArray(ext) || ext.length < 4) continue;
      let a = 0;
      for (let i = 0, j = ext.length - 1; i < ext.length; j = i++) a += ext[j][0] * ext[i][1] - ext[i][0] * ext[j][1];
      a = Math.abs(a) / 2;
      if (a > bestA) { bestA = a; best = poly; }
    }
    rings = best;
  }
  const ext = rings?.[0];
  if (!Array.isArray(ext) || ext.length < 4) return null;
  const interiors = rings.slice(1).filter((r) => Array.isArray(r) && r.length >= 4);
  let clon = 0, clat = 0;
  for (const [lon, lat] of ext) { clon += lon; clat += lat; }
  clon /= ext.length; clat /= ext.length;
  if (!Number.isFinite(clon) || !Number.isFinite(clat)) return null;
  return { ext, interiors, clon, clat };
}

// §GEOJSONSEQ-READ (L-658) — the ONE reader every OSM-footprint height join uses. Extracted to its
// own dependency-free module so it can be unit-tested in the ordinary vitest run rather than only
// inside a 2.5-hour bake (this file lazy-imports `geotiff`, which is provisioned only in the bake
// job). Re-exported here because the joins below are its only callers.
// ⚠ `export … from` alone would NOT bind these names locally — the joins below call
// loadJoinFootprints directly, so it must also be imported.
import { loadJoinFootprints, loadJoinFootprintsBounded } from './geojsonseqRead.mjs';
export { readGeojsonseqFeatures, loadJoinFootprints, partitionGeojsonseq, loadJoinFootprintsBounded } from './geojsonseqRead.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// §JOIN-BOUNDED-WORKING-SET (L-659, 2026-08-01) — the shared helpers that keep a WHOLE-COUNTRY join
// inside a bounded heap AND a bounded wall-clock. Both crashes below were real, both were fatal, and
// they are DIFFERENT bugs that happen to have the same cure — a declared, finite stamp area.
//
//   1. HEAP. Run 30693132326 died with `Ineffective mark-compacts near heap limit` at 4.04 GB, 23 min
//      in, on the whole-Spain buildings clip. Measured cost is ~1.26 kB of V8 heap per parsed
//      footprint, so a national footprint set wants >10 GB. See geojsonseqRead.mjs's header.
//
//   2. WALL-CLOCK, which nobody had hit yet only because (1) crashed first. Every join tiled its
//      region grid and ran `records.filter(...)` PER TILE — O(tiles × footprints). Whole Spain at
//      tileSpanDeg 0.025 is 566 × 320 = 181,120 tiles; against even a bounded 1 M-footprint record
//      set that is ~1.8e11 comparisons, i.e. hours of pure CPU before a single raster is fetched.
//      `bucketRecords` replaces it with ONE pass that indexes every record into its tile cell, after
//      which a tile lookup is O(1) and the sweep visits only POPULATED cells.
//
// §CONTEXT-DATA-HONESTY — narrowing the stamp area does NOT fabricate anything and does NOT delete
// anything. A footprint outside the declared bboxes is written through with its ORIGINAL OSM tags,
// so it keeps its honest `tagged`/`derived-levels`/`assumed` provenance. What changes is only WHERE
// we claim to have measured — and that claim is now explicit and inspectable instead of being an
// implicit consequence of whichever tile the `maxTiles` cap happened to stop at.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a caller's stamp-area list. Empty/absent → the whole region bbox (legacy behaviour). */
function stampAreasFor(retainBboxes, regionBbox) {
  const areas = (retainBboxes ?? []).filter((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite));
  return areas.length ? areas : [regionBbox];
}

/** Is (x, y) inside any of `areas` ([minX,minY,maxX,maxY], inclusive of the upper edge)? */
function inAnyArea(x, y, areas) {
  for (const [x0, y0, x1, y1] of areas) {
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return true;
  }
  return false;
}

/**
 * Index records into tile cells ONCE — the O(tiles × records) → O(records) fix described above.
 * `cellOf(record)` returns `[ix, iy]`. Returns `Map<"ix,iy", record[]>`.
 */
function bucketRecords(records, cellOf) {
  const buckets = new Map();
  for (const r of records) {
    const [ix, iy] = cellOf(r);
    const k = `${ix},${iy}`;
    const b = buckets.get(k);
    if (b) b.push(r); else buckets.set(k, [r]);
  }
  return buckets;
}

/**
 * Stamp REAL MDS Edificación (mdsn_e025) heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own
 * clip). Reads `inPath`, tiles the region bbox, fetches the keyless MDS raster per POPULATED tile, and
 * sets `height` = P90 of the raster over each eroded footprint (tagged). Writes the stamped features to
 * `outPath` (same footprints, heights added — a REPLACE input, no double-draw). Never throws; a source
 * failure leaves footprints at the OSM default. Mirrors the DK/ES tile-grid raster fetch.
 * @param bbox [w,s,e,n] WGS84.
 */
// §PHASE-4 — `priorityBboxes` (e.g. MDS_CITY_BBOXES.map((c) => c.bbox)) are stamped FIRST and UNCAPPED,
// so each metro capital is GUARANTEED measured heights even if the national `maxTiles` cap is reached
// mid national sweep. Default [] → behaviour is byte-identical to before (the priority loop is empty).
//
// §JOIN-BOUNDED-WORKING-SET (L-659) — `retainBboxes` is THE fix for the whole-Spain OOM. Only the
// footprints inside these bboxes are PARSED AND HELD; every other footprint in the clip streams
// straight to `outPath` with its ORIGINAL OSM tags, never occupying heap. Peak memory therefore
// tracks the STAMP AREA (the metro capitals), not the nation — measured ~1.26 kB of heap per held
// footprint, so whole-Spain's >10 GB working set collapses to the low hundreds of MB.
//   • DEFAULT (`null`/`[]`) → the whole region bbox is retained, i.e. BYTE-IDENTICAL to the previous
//     behaviour. Every city-sized region keeps working exactly as before with no config.
//   • A whole-country region MUST declare it (bake.mjs does, from MDS_CITY_BBOXES) or the heap
//     watchdog in `partitionGeojsonseq` trips and the bake fails LOUDLY with a named diagnosis
//     instead of a bare V8 abort.
// ⚠ This does not fabricate or discard a single height. A retained-but-unstamped footprint and a
// passed-through footprint end up in the SAME honest state: their original OSM tags (§CONTEXT-DATA-
// HONESTY). What it removes is only the pretence that a national sweep was ever going to complete —
// 181,120 tiles at one raster fetch each was never inside the 180-minute job budget.
export async function stampMdsHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000,
  tileSpanDeg = 0.025, maxTiles = 4000, padDeg = 0.0015,
  priorityBboxes = [], retainBboxes = null,
  erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 2.5,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `MDS join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'MDS join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) {
    return { status: 'documented', reason: 'MDS join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  }
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);

  // §JOIN-BOUNDED-WORKING-SET — stream the clip; HOLD only footprints whose centroid lands in a stamp
  // area, PASS THROUGH the rest straight to outPath as raw bytes. Also drops non-polygon records into
  // the pass-through untouched (they were never stampable), so nothing is lost.
  mkdirSync(dirname(outPath), { recursive: true });
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'MDS join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  // §JOIN-BOUNDED-WORKING-SET — index once (O(records)) instead of re-filtering per tile (O(tiles ×
  // records)). Cells are addressed on the REGION grid so a priority bbox and the national sweep speak
  // the same coordinates and cannot double-process a cell.
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  const doneCells = new Set();
  let processedTiles = 0, tileErrors = 0, tileCapHit = false, priorityTiles = 0;
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose. See the catch below.
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  // Fetch the MDS raster for ONE populated cell and stamp its footprints. `respectCap` (national
  // sweep) → returns true when the cap is hit so the caller breaks; priority cells pass false.
  const processCell = async (ix, iy, respectCap) => {
    const key = `${ix},${iy}`;
    if (doneCells.has(key)) return false;
    const inTile = buckets.get(key);
    if (!inTile || inTile.length === 0) return false;
    if (respectCap && processedTiles >= maxTiles) { tileCapHit = true; return true; }
    doneCells.add(key);
    const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
    const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
    const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
    const rr = await httpGetBuffer(mdsCoverageUrl(rbox), { timeoutMs });
    if (!rr.ok || !/tiff/i.test(rr.ct)) { tileErrors++; return false; }
    let mds;
    try { mds = await readDhmRaster(rr.ab, gt); }
    catch { tileErrors++; return false; }
    for (const r of inTile) {
      const h = mdsHeightForBuilding(r.ext, r.interiors, mds, { erodeM, percentile, minSamples, sampleStepM });
      if (h) {
        r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: 'mds_edificacion', [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
        heights.push(h.height);
      }
    }
    processedTiles++;
    return false;
  };
  try {
    // §PHASE-4 — capitals first (UNCAPPED): guarantee each metro city's footprints are stamped before
    // the national sweep can exhaust `maxTiles`. A priority bbox outside the region bbox stamps nothing
    // (its cells hold no footprints) — harmless.
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = processedTiles;
      for (let iy = cellIy(ps); iy <= cellIy(pn); iy++) {
        for (let ix = cellIx(pw); ix <= cellIx(pe); ix++) await processCell(ix, iy, false);
      }
      priorityTiles += processedTiles - before;
    }
    // Sweep — ONLY the populated cells (a nation is >99.9 % empty cells; visiting them all was the
    // O(tiles × records) trap). Sorted so a capped run is deterministic and re-runnable.
    const rest = [...buckets.keys()].filter((k) => !doneCells.has(k)).sort();
    for (const k of rest) {
      const [ix, iy] = k.split(',').map(Number);
      if (await processCell(ix, iy, true)) break;
    }
  } catch (err) {
    // Network cut mid-grid — write whatever we stamped so far (honest partial), never abort the bake.
    //
    // §ABORT-IS-NOT-A-CAP (2026-08-01). This used to set `tileCapHit = true`, so an ABORTED sweep
    // reported itself as "maxTiles N cap hit — rest keep OSM". Measured in run 30706761446: the
    // Spain MDS join stamped 21,457/431,256 footprints off **16 tiles** while announcing a
    // **20,000**-tile cap — arithmetically impossible, because `tileCapHit` is otherwise only set
    // when `processedTiles >= maxTiles`. The join had THROWN after 16 tiles and this line buried it;
    // Denmark (149 tiles) and Köln (168) stamped ~80 % in the same run, so Spain's 5 % read as a
    // scope decision rather than the failure it was.
    //
    // A CAP is a budget being respected. An ABORT is an error. Reporting the second as the first is
    // §CONTEXT-DATA-HONESTY collapse (failure and empty are the SAME VALUE — the L-422/457/467/469
    // family) turned on our own telemetry, and it hid a real defect for an entire 4-hour run.
    sweepAborted = true;
    sweepAbortReason = String(err?.message ?? err);
  }

  // The pass-through footprints are ALREADY in outPath (written during the read). Append the retained
  // ones — stamped or not — so the file holds EVERY footprint exactly once. REPLACE input for the
  // region: same footprints, real heights where MDS answered, untouched OSM tags everywhere else.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, priorityTiles, tileErrors, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    // §JOIN-BOUNDED-WORKING-SET counters — the P8-equivalent observability for a plain Node script.
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `MDS Edificación stamped onto OSM footprints → ${measured}/${records.length} RETAINED footprint(s) got a MEASURED ` +
      `height (tagged); ${read.passedThrough} footprint(s) outside the ${stampAreas.length} stamp bbox(es) passed through with ` +
      `their original OSM tags; ${processedTiles} tile(s)${priorityTiles ? ` (${priorityTiles} in ${priorityBboxes.length} priority capital bbox(es) first)` : ''}, ` +
      `${tileErrors} raster error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (this is a FAILURE, not a cap)` : ''}; ` +
      `peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}

// ── DK WHOLE-COUNTRY join — stamp DHM nDSM (DSM−DTM) heights onto bake's OWN OSM footprints. ──────
// §DHM-OSM-JOIN (L-6xx, 2026-07-26) — the DK analogue of the ES MDS join above, and the whole-country
// answer for Denmark. GeoDanmark's `Bygning` WFS is count-capped (≤6000 features/call) so it CANNOT
// enumerate the country in one pass, and a DHM tile grid over the whole nation is many rasters — so
// neither "the existing tile-grid with a higher maxTiles" nor `fetchGeoDanmarkHeights(whole-DK-bbox)`
// scales (the latter would truncate to 6000 footprints then APPEND them beside the national OSM clip).
// The OSM-footprint join is the pattern that works: use the OSM buildings bake ALREADY clipped as the
// footprint set, and fetch DHM DSM+DTM ONLY for tiles that contain footprints, sampling nDSM per
// building (P90 of DSM−DTM over the eroded interior → `tagged`), mirroring the DK city path exactly.
//
// apikey-GATED (DATAFORDELER_API_KEY — same key as the DK Matrikel proxy + DHM terrain adapter). No
// key → `blocked` (loud), footprints keep the OSM default. §CONTEXT-DATA-HONESTY: never a fabricated
// height; a footprint with no clean nDSM keeps its original OSM tags untouched.
// §JOIN-BOUNDED-WORKING-SET (L-659) — `retainBboxes` (WGS84) applies here for the SAME reason it does
// on the ES MDS join: whole-`denmark` is a national region, its footprint set does not fit in a V8
// heap, and its 225 × 175 native-metre tile grid re-filtered per tile is O(tiles × footprints). Both
// are removed by holding only the footprints inside the declared city bboxes and bucketing them once.
// Default (`null`) → the whole region bbox, i.e. unchanged behaviour for any city-sized caller.
export async function stampDhmHeightsOnGeojsonseq(inPath, outPath, bbox, {
  env = process.env, timeoutMs = 120_000,
  resM = 2.0, maxTilePx = 1000, tileSpanDeg = 0.02, maxTiles = 4000, padM = 40,
  retainBboxes = null,
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
} = {}) {
  const apikey = env.DATAFORDELER_API_KEY;
  if (!apikey) return { status: 'blocked', reason: GEODANMARK_BLOCKED_REASON };
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `DHM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'DHM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'DHM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only the footprints inside a stamp bbox (projected to
  // EPSG:25832 for DHM's own grid), pass everything else through with its ORIGINAL OSM tags.
  mkdirSync(dirname(outPath), { recursive: true });
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const extNative = fp.ext.map(([lon, lat]) => wgs84ToUtm32(lat, lon));
    const interiorsNative = fp.interiors.map((r) => r.map(([lon, lat]) => wgs84ToUtm32(lat, lon)));
    let cx = 0, cy = 0;
    for (const [X, Y] of extNative) { cx += X; cy += Y; }
    cx /= extNative.length; cy /= extNative.length;
    return { feat, extNative, interiorsNative, cx, cy };
  }, 'DHM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  // Native EPSG:25832 extent covering the bbox (cover all four corners for grid convergence).
  const c = [wgs84ToUtm32(bbox[1], bbox[0]), wgs84ToUtm32(bbox[1], bbox[2]), wgs84ToUtm32(bbox[3], bbox[0]), wgs84ToUtm32(bbox[3], bbox[2])];
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  const minE = Math.min(...xs), maxE = Math.max(...xs), minN = Math.min(...ys), maxN = Math.max(...ys);
  const tileSpanM = tileSpanDeg * 111320; // ~metres for the chosen degree span (DK latitudes)
  const nx = Math.max(1, Math.ceil((maxE - minE) / tileSpanM));
  const ny = Math.max(1, Math.ceil((maxN - minN) / tileSpanM));
  const cellIx = (X) => Math.min(nx - 1, Math.max(0, Math.floor((X - minE) / tileSpanM)));
  const cellIy = (Y) => Math.min(ny - 1, Math.max(0, Math.floor((Y - minN) / tileSpanM)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.cx), cellIy(r.cy)]);
  let processedTiles = 0, tileErrors = 0, tileCapHit = false;
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose. See the catch below.
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  try {
    // Visit ONLY populated cells (sorted → deterministic under the cap).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [ix, iy] = key.split(',').map(Number);
      const tx0 = minE + ix * tileSpanM, ty0 = minN + iy * tileSpanM;
      const tx1 = Math.min(tx0 + tileSpanM, maxE), ty1 = Math.min(ty0 + tileSpanM, maxN);
      const box = [tx0 - padM, ty0 - padM, tx1 + padM, ty1 + padM];
      const dim = Math.max(2, Math.min(maxTilePx, Math.round(Math.max(box[2] - box[0], box[3] - box[1]) / resM)));
      const dsmR = await httpGetBuffer(dhmCoverageUrl(DHM_WCS.dsm, box, dim, apikey), { timeoutMs });
      const dtmR = await httpGetBuffer(dhmCoverageUrl(DHM_WCS.dtm, box, dim, apikey), { timeoutMs });
      if (!dsmR.ok || !dtmR.ok || !/tiff/i.test(dsmR.ct) || !/tiff/i.test(dtmR.ct)) { tileErrors++; continue; }
      let dsm, dtm;
      try { dsm = await readDhmRaster(dsmR.ab, gt); dtm = await readDhmRaster(dtmR.ab, gt); }
      catch { tileErrors++; continue; }
      for (const r of inTile) {
        const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dsm, dtm, { erodeM, percentile, minSamples, sampleStep });
        if (h) {
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: 'geodanmark-dhm', [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
        }
      }
      processedTiles++;
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `DHM nDSM (P90 of dhm_overflade−dhm_terraen) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp ` +
      `bbox(es) passed through untouched; ${processedTiles} tile(s), ${tileErrors} raster error(s)` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}

// ── CH WHOLE-COUNTRY join — stamp swisstopo nDSM (swissSURFACE3D − swissALTI3D) onto bake's OWN OSM footprints. ─
// §SWISS-NDSM-OSM-JOIN — authored 2026-07-26 against a WCS that does not exist (data.geo.admin.ch is an
// object store; probed 404 on 2026-07-27), REBUILT 2026-09-04 (lane HEIGHTS-EVERYWHERE round 2) on the
// channel that does: STAC → per-km² COG, read by HTTP range at the 1 m overview. The CH analogue of the
// ES mds / DK dhm / FR mnh_fr joins and the Zürich/Geneva/Bern LoD1-now height path. Switzerland has NO
// keyless national FOOTPRINT feed reachable by bbox (swissTLM3D is bulk; the geodienste.ch AV cadastre
// is per-canton permission-gated, L-613), so — exactly like the other joins — the footprint set is
// bake's OWN OSM buildings clip and only tiles that contain footprints fetch rasters.
//
// WHAT IT DOES (see heights/swissNdsm.mjs for every probed number):
//   1. holds only the footprints inside the declared stamp areas (retainBboxes → SWISS_CITY_BBOXES for
//      the `switzerland` row; §JOIN-BOUNDED-WORKING-SET), projecting each ring WGS84 → LV95 through the
//      ONE shared projector (reproject.mjs / proj4 — LV95 is an oblique Mercator on Bessel, not a UTM
//      zone, so the closed-form UTM helpers the DK join uses cannot serve here);
//   2. buckets them by swisstopo's OWN 1 km LV95 tile key (the publisher's grid IS the tiling grid,
//      as the NRW join does with its Kacheln);
//   3. per populated tile: TWO STAC lookups (DSM + DTM collections, a 100 m box at the tile centre) whose
//      COG hrefs are MATCHED on the tile token, never constructed; then the DSM at COG overview 1 (1 m,
//      range-read) and the 2 m DTM whole (~1 MB);
//   4. height = P90 of (DSM − DTM) over the eroded footprint interior, holes excluded
//      (`ndsmHeightForBuilding`, the DK function — native metres, unchanged) → `height` +
//      `pryzm:height_src=measured-lidar`, heightSource 'swisstopo-ndsm'.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • STAC refused / unparseable for a tile      → `tileErrors++` — the index failed us; UNKNOWN, a real failure.
//   • STAC answered, no asset for this tile      → `voidTiles++` — the collection is national and complete, so
//                                                   an absent tile is lake / foreign ground. Not an error.
//   • COG unreadable / timed out                 → `tileErrors++`.
//   • raster 100 % nodata                        → `voidTiles++` (processed, nothing measurable).
//   • footprint with < minSamples clean cells    → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • proj4 / geotiff missing in the runner      → `documented` (footprints keep OSM) — a build gate, said by name.
// KEYLESS (swisstopo free-geodata terms — commercial use allowed, source reference mandatory; verified
// from the terms text, not the port). ⚠ swissSURFACE3D is all sursol (vegetation too) — P90 over the
// eroded interior is the same mitigation DK/FR apply to their surface models.
let _lv95Projector = null;
/** Lazy LV95 projector via the ONE shared reproject.mjs (proj4). Null → the caller degrades to `documented`. */
async function loadLv95Projector() {
  if (_lv95Projector) return _lv95Projector;
  try { const m = await import('./reproject.mjs'); _lv95Projector = m.getProjector(SWISS_NDSM.nativeCrs); return _lv95Projector; }
  catch { return null; }
}
/** httpGet that turns a network throw into a VALUE (the §FETCH-THROW-IS-NOT-A-SWEEP-ABORT contract). */
async function httpGetSafe(url, opts) {
  try { return await httpGet(url, opts); }
  catch (err) { return { ok: false, status: 0, contentType: '', body: '', reason: String(err?.message ?? err) }; }
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: timed out after ${ms} ms`)), ms))]);
/**
 * Read ONE Cloud-Optimised GeoTIFF by URL at IFD `level` (0 = full resolution, k = the k-th overview)
 * → the shared raster shape `{ width, height, values, bboxNative }` in the file's native CRS, with the
 * GDAL nodata sentinel masked to NaN so `sampleRasterNative` drops it instead of blending it. The
 * georeference always comes from IFD 0 (overviews carry none); geotiff.js issues HTTP range reads, so
 * an overview read moves ~1/4^level of the file's bytes.
 */
async function readCogLevel(href, level, gt, { nodata = SWISS_NDSM.nodata } = {}) {
  const tiff = await gt.fromUrl(href, { allowFullFile: true });
  const img0 = await tiff.getImage(0);
  const bboxNative = img0.getBoundingBox();
  const count = await tiff.getImageCount();
  const useLevel = level > 0 && count > level ? level : 0;
  const img = useLevel ? await tiff.getImage(useLevel) : img0;
  const [vals] = await img.readRasters();
  const values = Float32Array.from(vals);
  const masked = maskNodata(values, nodata);
  return { width: img.getWidth(), height: img.getHeight(), values, bboxNative, ifd: useLevel, masked };
}

export async function stampSwissHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, maxTiles = 4000, retainBboxes = null,
  dsmOverviewLevel = SWISS_NDSM.dsmOverviewLevel,
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `Swiss nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'Swiss nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'Swiss nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const proj = await loadLv95Projector();
  if (!proj) return { status: 'documented', reason: 'Swiss nDSM join: proj4 / reproject.mjs unavailable (LV95 EPSG:2056 is not a UTM zone) — install proj4 in the bake image; footprints keep OSM default.' };

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only footprints inside a stamp bbox, projected to LV95.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const extNative = fp.ext.map(([lon, lat]) => proj.forward(lon, lat));
    const interiorsNative = fp.interiors.map((r) => r.map(([lon, lat]) => proj.forward(lon, lat)));
    let cx = 0, cy = 0;
    for (const [X, Y] of extNative) { cx += X; cy += Y; }
    cx /= extNative.length; cy /= extNative.length;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { feat, extNative, interiorsNative, cx, cy };
  }, 'Swiss nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const buckets = bucketRecords(records, (r) => { const k = lv95TileKey(r.cx, r.cy); return [k.e, k.n]; });
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, stacRequests = 0;
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();
  try {
    // Visit ONLY populated tiles (sorted → deterministic under the cap).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [e, n] = key.split(',').map(Number);
      const tk = { e, n };
      // STAC lookup on a 100 m box at the tile CENTRE → the item(s) covering it; the href is then matched
      // on the tile token + resolution token (pickCogAsset), never constructed from the key.
      const [X0, Y0, X1, Y1] = lv95TileBbox(tk);
      const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
      const [lonA, latA] = proj.inverse(cx - 50, cy - 50), [lonB, latB] = proj.inverse(cx + 50, cy + 50);
      const q = [Math.min(lonA, lonB), Math.min(latA, latB), Math.max(lonA, lonB), Math.max(latA, latB)];
      const lookup = async (collection, resToken) => {
        stacRequests++;
        const r = await httpGetSafe(swissStacItemsUrl(collection, q), { timeoutMs: Math.min(timeoutMs, 30_000), headers: { Accept: 'application/json' } });
        if (!r.ok) return { ok: false, href: null };
        const c = parseStacCollection(r.body);
        if (!c) return { ok: false, href: null };
        return { ok: true, href: pickCogAsset(c, tk, resToken) };
      };
      const dsmQ = await lookup(SWISS_NDSM.stacDsm, SWISS_NDSM.dsmResToken);
      const dtmQ = await lookup(SWISS_NDSM.stacDtm, SWISS_NDSM.dtmResToken);
      if (!dsmQ.ok || !dtmQ.ok) { tileErrors++; continue; }   // the index refused us — a FAILURE, never "no tile here"
      if (!dsmQ.href || !dtmQ.href) { voidTiles++; continue; } // the index answered: nothing published here (lake / abroad)
      let dsm, dtm;
      try {
        dsm = await withTimeout(readCogLevel(dsmQ.href, dsmOverviewLevel, gt), timeoutMs, 'swissSURFACE3D COG');
        dtm = await withTimeout(readCogLevel(dtmQ.href, 0, gt), timeoutMs, 'swissALTI3D COG');
      } catch { tileErrors++; continue; }
      processedTiles++;
      if (dsm.masked === dsm.values.length || dtm.masked === dtm.values.length) { voidTiles++; continue; }
      for (const r of inTile) {
        const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dsm, dtm, { erodeM, percentile, minSamples, sampleStep });
        if (h) {
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: SWISS_NDSM.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
        }
      }
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles: 0, tileCapHit, sweepAborted, sweepAbortReason,
    tileGrid: `${buckets.size} populated LV95 km² tile(s)`, stacRequests, elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `swisstopo nDSM (P90 of swissSURFACE3D − swissALTI3D over the eroded footprint) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through ` +
      `with their original OSM tags; ${processedTiles} km² tile(s) read (${stacRequests} STAC lookups), ${voidTiles} void (unpublished / lake) tile(s), ` +
      `${tileErrors} tile error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}

// ── FR WHOLE-COUNTRY join — stamp IGN LiDAR HD MNH heights onto bake's OWN OSM footprints. ─────
// §MNH-FR-OSM-JOIN (2026-09-04, lane HEIGHTS-EVERYWHERE) — the FR analogue of the ES MDS join above
// and the whole-country answer for France. WHY NOT BD TOPO: `fetchBdTopo` is live and real, but the
// WFS caps at 5,000 features per request against 317,361 buildings in the Paris bake bbox alone
// (§BDTOPO-CAP-TRUNCATE) — and the SHIPPED tileset shows the consequence (probe 2026-09-04): Paris
// 56 of 12,064 footprints measured (0.5 %), Toulouse 0 of 8,421 (71 % `assumed`). A national BD TOPO
// join would have to page ~30 M buildings through a 5,000-row window; the MNH raster is ONE GetMap
// per populated cell and already covers every footprint under it — cheaper AND more complete. BD
// TOPO stays what it is: a city-scale `tagged` source behind the paris/lyon rows.
//
// WHAT IT DOES: reads bake's OSM footprints, HOLDS only those inside the declared stamp areas
// (retainBboxes → MNH_FR_CITY_BBOXES for the `france` row; §JOIN-BOUNDED-WORKING-SET), asks IGN's
// dalle index which areas are PUBLISHED, fetches the MNH raster per POPULATED 0.01° cell at ~1 m
// (WMS GetMap, EPSG:4326, image/geotiff — the SAME degree-gridded raster shape as ES MDS, so
// `mdsHeightForBuilding` is reused unchanged: local metric frame, 1 m erosion, holes excluded, P90),
// and stamps `height` + `pryzm:height_src=measured-lidar` where ≥ minSamples clean pixels agree.
// ⛔ It NEVER differences MNS−MNT (E5 §G.1 A8): the MNH pixel IS the height above ground.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • dalle index says 0 for a stamp area      → the area is SKIPPED by name (no bytes, no heap); its
//                                                 footprints pass through with their OSM tags; the result
//                                                 lists it in `areaCoverage` as 'none'. Not an error.
//   • dalle index unreachable / unparseable    → 'unknown' → the area IS sampled (failure ≠ empty).
//   • raster tile 100 % nodata (unpublished)   → `voidTiles++`; footprints keep OSM tags. Not an error.
//   • raster request refused / undecodable     → `tileErrors++` — a real failure, counted as one.
//   • footprint with < minSamples clean pixels → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • EVERY stamp area unpublished             → `blocked` — an external publisher gate the bake cannot
//                                                 fix; the §MEASURED-HEIGHT-GATE warns and passes.
// KEYLESS (Géoplateforme open services; Licence Ouverte Etalab 2.0, attribution "IGN – Programme
// LiDAR HD"). ⚠ MNH includes vegetation (all sursol) — see heights/mnhFr.mjs; P90 over the eroded
// interior is the same mitigation DK/CH apply to their surface models.
export async function stampMnhFrHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000,
  tileSpanDeg = 0.01, resM = 1.0, maxTilePx = MNH_FR.maxPx, maxTiles = 4000, padDeg = 0.001,
  priorityBboxes = [], retainBboxes = null, coveragePrecheck = true,
  erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `MNH-FR join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'MNH-FR join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'MNH-FR join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const [w, s, e, n] = bbox;

  // §MNH-FR-COVERAGE-PRECHECK — one ~100 ms hits query per stamp area, BEFORE a footprint is held.
  const declaredAreas = stampAreasFor(retainBboxes, bbox);
  const areaCoverage = [];
  for (const area of declaredAreas) {
    let dalles = null;
    if (coveragePrecheck) {
      try {
        const r = await httpGet(mnhFrDalleHitsUrl(area), { timeoutMs: 30_000 });
        dalles = r.ok ? parseWfsHits(r.body) : null;
      } catch { dalles = null; } // a network throw is UNKNOWN — never 0.
    }
    areaCoverage.push({ bbox: area, dalles, verdict: coveragePrecheck ? classifyDalleCoverage(dalles) : 'unchecked' });
  }
  const skippedAreas = areaCoverage.filter((c) => c.verdict === 'none').length;
  const stampAreas = areaCoverage.filter((c) => c.verdict !== 'none').map((c) => c.bbox);
  if (stampAreas.length === 0) {
    return {
      status: 'blocked', areaCoverage, skippedAreas,
      reason: `MNH-FR join: IGN's dalle index lists NO published MNH dalle in any of the ${declaredAreas.length} stamp area(s) — ` +
        'LiDAR HD has not reached them yet (progress map: macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD). ' +
        'Footprints keep their honest OSM tags; nothing to fix in the pipeline.',
    };
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'MNH-FR join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  const doneCells = new Set();
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, priorityTiles = 0;
  let nodataPixels = 0, totalPixels = 0, bytesFetched = 0;
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const processCell = async (ix, iy, respectCap) => {
    const key = `${ix},${iy}`;
    if (doneCells.has(key)) return false;
    const inTile = buckets.get(key);
    if (!inTile || inTile.length === 0) return false;
    if (respectCap && processedTiles >= maxTiles) { tileCapHit = true; return true; }
    doneCells.add(key);
    const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
    const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
    const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
    const rr = await httpGetBuffer(mnhFrGetMapUrl(rbox, mnhFrPxDims(rbox, resM, maxTilePx)), { timeoutMs });
    if (!rr.ok || !/tiff/i.test(rr.ct)) { tileErrors++; return false; }
    bytesFetched += rr.ab.byteLength;
    let mnh;
    try { mnh = await readDhmRaster(rr.ab, gt); }
    catch { tileErrors++; return false; }
    // −9999 → NaN so the shared bilinear sampler drops it instead of blending it (heights/mnhFr.mjs).
    const masked = maskNodata(mnh.values, MNH_FR.nodata);
    nodataPixels += masked; totalPixels += mnh.values.length;
    processedTiles++;
    if (masked === mnh.values.length) { voidTiles++; return false; } // unpublished ground: an honest void, not an error.
    for (const r of inTile) {
      const h = mdsHeightForBuilding(r.ext, r.interiors, mnh, { erodeM, percentile, minSamples, sampleStepM });
      if (h) {
        r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: MNH_FR.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
        heights.push(h.height);
      }
    }
    return false;
  };
  try {
    // Priority areas first (UNCAPPED) — each listed city is guaranteed its heights before the sweep
    // can exhaust `maxTiles`. A priority bbox with no retained footprints stamps nothing — harmless.
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = processedTiles;
      for (let iy = cellIy(ps); iy <= cellIy(pn); iy++) {
        for (let ix = cellIx(pw); ix <= cellIx(pe); ix++) await processCell(ix, iy, false);
      }
      priorityTiles += processedTiles - before;
    }
    // Sweep ONLY the populated cells, sorted → deterministic under the cap.
    const rest = [...buckets.keys()].filter((k) => !doneCells.has(k)).sort();
    for (const k of rest) {
      const [ix, iy] = k.split(',').map(Number);
      if (await processCell(ix, iy, true)) break;
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, priorityTiles, tileErrors, voidTiles, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    nodataFraction: totalPixels ? Number((nodataPixels / totalPixels).toFixed(3)) : null,
    bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    areaCoverage, skippedAreas,
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `IGN LiDAR HD MNH (P90 over the eroded footprint) stamped onto OSM footprints → ${measured}/${records.length} RETAINED ` +
      `footprint(s) got a MEASURED height (tagged); ${read.passedThrough} footprint(s) outside the ${stampAreas.length} published ` +
      `stamp bbox(es) passed through with their original OSM tags` +
      `${skippedAreas ? ` (${skippedAreas} declared area(s) skipped — IGN has published no MNH dalle there yet)` : ''}; ` +
      `${processedTiles} tile(s)${priorityTiles ? ` (${priorityTiles} in ${priorityBboxes.length} priority bbox(es) first)` : ''}, ` +
      `${voidTiles} void (unpublished) tile(s), ${tileErrors} raster error(s), ${(bytesFetched / 1e6).toFixed(0)} MB fetched` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}

// ── DE/NRW WHOLE-CITY join — stamp LoD2-DE·NRW `measuredHeight` onto bake's OWN OSM footprints. ──
// §LOD2-NRW-OSM-JOIN (2026-07-31) — the DE analogue of the ES MDS / DK DHM / CH swisstopo joins above,
// and the Köln ("the German Barcelona") real-height path. It differs from those three in ONE structural
// way, and the difference is the whole design:
//
//   • ES/DK/CH join a RASTER. Per footprint they sample an nDSM grid and take a P90 — the height is
//     COMPUTED from pixels, so the honest failure mode is "too few clean samples → no height".
//   • NRW publishes VECTORS. `LoD2-DE · NRW` is 35,022 keyless 1 km CityGML Kacheln in which EVERY
//     <bldg:Building> already carries an authoritative `bldg:measuredHeight` (LiDAR/photogrammetric,
//     ~1 m accuracy) plus its own LoD0 `bldg:GroundSurface` ring. So there is NOTHING to compute: the
//     join is a SPATIAL MATCH between two footprint sets, and the height is transcribed, not derived.
//
// WHY JOIN AT ALL rather than REPLACE the OSM clip with the NRW buildings (SOURCE_COVERAGE marks
// `lod2de_nrw` 'full' → 'replace')? Because REPLACE would swap out the footprints the rest of the bake
// is coherent with: `roads`/`water`/`landuse`/`rail`/`trees` all come from the SAME OSM clip, and OSM's
// `building=*` subtypes drive the client's `belongsToLayer()`. Stamping keeps ONE footprint set (no
// double-draw, no id churn, no client change) and adds only what NRW uniquely has — a measured metre.
// This is the exact property §MDS-OSM-JOIN was built for; the source shape changed, the pattern did not.
//
// KEYLESS (opengeodata.nrw.de, DL-DE Zero 2.0 — NO api key, NO repo secret; unlike DK's DATAFORDELER_API_KEY).
//
// §CONTEXT-DATA-HONESTY — the three different values this function keeps DIFFERENT:
//   1. index unreachable        → `blocked` (the service is down; we know nothing) — LOUD, no partial.
//   2. every tile absent from   → `no-source` (the bbox is not in NRW) — a genuine "there is no data
//      the NRW index               here", NOT a failure.
//   3. tile fetched, footprint  → the footprint keeps its ORIGINAL OSM tags untouched (its own
//      matched nothing             height/levels, else the client's assumed 9 m default). Never a
//                                  fabricated number, never a neighbour's height borrowed by proximity.
// A raster/parse error or the `maxTiles` cap leaves those footprints at the OSM default and is COUNTED
// in the return (tileErrors / tileCapHit), so a partial join can never read as a complete one.
const NRW_TILE_M = 1000;          // the NRW Kachel edge — the tiling grid IS the publisher's own grid.
const NRW_MATCH_GRID_M = 50;      // uniform spatial index cell for candidate lookup within a Kachel.

/**
 * Stream ONE 1 km NRW CityGML Kachel and yield its buildings WITHOUT ever holding the whole file.
 *
 * ⚠ WHY STREAMING AND NOT `httpGet`. A Köln-area LoD2 Kachel is 14–77 MB of GML (live-measured
 * 2026-07-31: the Köln city grid is 182 tiles / 3.90 GB, ~20.6 MB mean). `res.text()` on that is a
 * ~77 MB JS string, and `.match(/<bldg:Building…/g)` then allocates a second copy of it as an array of
 * substrings — ~300 MB peak per tile, on a runner that is also holding the OSM footprint set. Reading
 * the body as a stream and slicing complete <bldg:Building>…</bldg:Building> blocks out of a rolling
 * buffer keeps peak memory at one building (a few KB) regardless of tile size. `fetchLod2DeNrw` above
 * keeps its simpler whole-body form deliberately — it is a single-tile PROBE, not a 182-tile sweep.
 *
 * Per building: `bldg:measuredHeight` + the LoD0 `bldg:GroundSurface` ring in NATIVE EPSG:25832.
 * Native is the point — the OSM footprints are projected INTO UTM32 once, so the match is exact metres
 * with no reprojection of the (far more numerous) NRW rings and no lat/lon anisotropy.
 * Never throws; returns `{ ok:false, reason }` on any transport/parse failure.
 */
async function streamNrwKachel(url, { timeoutMs = 120_000, maxBufferBytes = 32_000_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const out = [];
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal });
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    if (!res.body) return { ok: false, status: res.status, reason: 'no response body' };
    const dec = new TextDecoder('utf-8');
    let buf = '';
    const OPEN = '<bldg:Building ', CLOSE = '</bldg:Building>';
    const drain = () => {
      for (;;) {
        const a = buf.indexOf(OPEN);
        if (a < 0) {
          // No open tag in the buffer — keep only a short tail (a tag may straddle the chunk edge).
          if (buf.length > OPEN.length) buf = buf.slice(-OPEN.length);
          return;
        }
        const b = buf.indexOf(CLOSE, a);
        if (b < 0) {
          buf = buf.slice(a);                       // hold the incomplete block, drop everything before it
          return;
        }
        const block = buf.slice(a, b + CLOSE.length);
        buf = buf.slice(b + CLOSE.length);
        const rec = nrwBuildingFromBlock(block);
        if (rec) out.push(rec);
      }
    };
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      drain();
      // A pathological file with no closing tag must not grow the buffer without bound.
      if (buf.length > maxBufferBytes) return { ok: false, reason: `unterminated <bldg:Building> past ${maxBufferBytes} chars` };
    }
    buf += dec.decode();
    drain();
    return { ok: true, buildings: out };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  } finally {
    clearTimeout(t);
  }
}

/** ONE <bldg:Building> block → `{ E, N, areaM2, h, roof, ring }` in native EPSG:25832, or null.
 *  Regexes are DELIBERATELY the same ones `fetchLod2DeNrw` uses, so both paths transcribe the SAME
 *  field from the SAME element — the probe and the bake can never disagree about what NRW said. */
function nrwBuildingFromBlock(block) {
  const hm = block.match(/measuredHeight[^>]*>\s*([\d.]+)\s*</i);
  if (!hm) return null;
  const h = Number(hm[1]);
  if (!Number.isFinite(h) || h <= 0) return null;
  const gs = block.match(/GroundSurface[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/i);
  if (!gs) return null;
  const ring = parseNativeRing(gs[1], 3);           // X Y Z, constant Z → native [E,N] ring
  if (!ring) return null;
  // Shoelace area + area centroid (not the vertex mean — an L-shaped Gebäudeteil's vertex mean can sit
  // outside the ring, which would make the containment test lie about which footprint owns it).
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a2 += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  const areaM2 = Math.abs(a2) / 2;
  let E, N;
  if (Math.abs(a2) > 1e-6) { E = cx / (3 * a2); N = cy / (3 * a2); }
  else {                                             // degenerate ring → honest vertex mean fallback
    E = 0; N = 0;
    for (const [x, y] of ring) { E += x; N += y; }
    E /= ring.length; N /= ring.length;
  }
  if (!Number.isFinite(E) || !Number.isFinite(N)) return null;
  const rtCode = (block.match(/roofType[^>]*>\s*(\d+)\s*</i) ?? [])[1];
  // ⚠ DELIBERATE DIVERGENCE from `fetchLod2DeNrw`'s `NRW_ROOF[rtCode] ?? rtCode`. That fallback
  // resurrects an UNMAPPED AdV code as the tag value — including 9999, which NRW_ROOF maps to
  // `undefined` precisely because it MEANS "Sonstiges/unknown". Emitting `roof_type=9999` presents an
  // unknown roof as a known one to the client's LoD2 tier. Here an unmapped or explicitly-unknown code
  // emits NO `roof_type` at all: an absent tag is honest, a numeric code masquerading as a shape is not.
  const roof = rtCode && rtCode in NRW_ROOF ? NRW_ROOF[rtCode] : undefined;
  return { E, N, areaM2, h, roof, ring };
}

/** AREA-WEIGHTED P90 of a set of matched LoD2 parts — the vector analogue of the P90 the ES/DK/CH nDSM
 *  joins take over a raster (see the HEIGHT RULE note on stampLod2NrwHeightsOnGeojsonseq). Sort by
 *  height ascending, walk cumulative ground area, return the height at the 90th area percentile. A
 *  single part returns its own height exactly; zero-area parts fall back to an equal weighting rather
 *  than dividing by zero. */
function areaWeightedP90(parts, p = 90) {
  if (parts.length === 1) return parts[0].h;
  const sorted = [...parts].sort((a, b) => a.h - b.h);
  let total = 0;
  for (const b of sorted) total += Math.max(0, b.areaM2);
  if (!(total > 0)) return sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))].h;
  const target = (p / 100) * total;
  let acc = 0;
  for (const b of sorted) {
    acc += Math.max(0, b.areaM2);
    if (acc >= target) return b.h;
  }
  return sorted[sorted.length - 1].h;
}

/** The roof SHAPE of the largest-area matched part (a shape has no percentile — see the call site). */
function dominantRoof(parts) {
  let best = null;
  for (const b of parts) if (!best || b.areaM2 > best.areaM2) best = b;
  return best?.roof;
}

/**
 * Stamp REAL LoD2-DE·NRW `measuredHeight` onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip).
 *
 * Reads `inPath`, walks the NRW 1 km Kachel grid over `bbox`, fetches ONLY Kacheln that actually contain
 * OSM footprints, and for each footprint sets `height` = the measured height of the LoD2 building part it
 * spatially owns (+ `roof_type`, + the `pryzm:height_src=measured-lidar` marker so the client ranks it
 * ABOVE an OSM-surveyed `tagged` height). Writes every footprint — stamped or original — to `outPath`,
 * so the result is a REPLACE input for the region with no double-draw. Never throws.
 *
 * MATCH RULE (both directions, tightest first — no proximity guessing anywhere):
 *   1. FORWARD  — LoD2 ground-ring centroids that fall INSIDE the OSM exterior ring (and in no hole).
 *      This is the normal case and handles the common German shape of one OSM way over N Gebäudeteile.
 *   2. REVERSE  — else, the OSM centroid inside a LoD2 ground ring. Catches an OSM footprint drawn
 *      smaller/offset than the cadastral outline.
 *   3. NEITHER  → NO stamp. The footprint keeps its own OSM tags and the client's honest provenance.
 *
 * HEIGHT RULE when a footprint owns SEVERAL LoD2 parts — the AREA-WEIGHTED P90 of the parts' heights,
 * i.e. the height at or below which 90% of the matched roof AREA sits. ⚠ This is not a free choice: the
 * ES MDS, DK DHM and CH swisstopo joins above all take the P90 of the nDSM raster over the footprint,
 * and a probe must not mean one thing in Barcelona and another in Köln. NRW gives vectors instead of
 * pixels, so the P90 is taken over parts weighted by their ground area — the same statistic, computed
 * from the same physical quantity, by the only means the source allows.
 *   • NOT the max — one stair tower or lift overrun would define a whole block.
 *   • NOT the mean — it invents a height no part of the building actually has.
 *   • NOT the largest-area part alone — that is the P90's answer in the common case anyway, but it
 *     discards a genuinely tall wing that occupies a legitimate share of the roof.
 * ⚠ MEASURED WORKED EXAMPLE, so the limit of LoD1 is legible rather than discovered later: the KÖLNER
 * DOM matches 20+ LoD2 parts. OSM tags it `height=157.38` (the SPIRES); the area-weighted P90 lands on
 * the nave, ~48–61 m. Neither number is "the Dom" — a single extruded prism cannot be — but 48 m over
 * the real footprint is far closer to the true massing than a 157 m slab covering the whole cathedral,
 * and it is what the raster P90 would return in Barcelona for the same shape. `multiPartFootprints`
 * counts how often this reduction was exercised, so the simplification is measured, not hidden.
 *
 * @param bbox [w,s,e,n] WGS84.
 */
export async function stampLod2NrwHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, maxTiles = 400, maxSpanDeg = 0.6, edgePadM = 30,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `NRW LoD2 join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'NRW LoD2 join: no bbox supplied' };
  // The source is a 1 km tile service, so cost is O(area). A whole-Land/whole-country bbox is ~10⁴–10⁵
  // tiles × ~20 MB — refuse it EXPLICITLY rather than start a sweep that would be killed half-done and
  // ship a tileset measured only in its top-left corner (mirrors fetchSpainBuildingHeights's guard).
  if (bboxTooLargeForWfs(bbox, maxSpanDeg)) {
    return {
      status: 'documented',
      reason: `NRW LoD2 join: bbox span > ${maxSpanDeg}° — LoD2-DE·NRW is a 1 km CityGML tile service ` +
        '(~20 MB/tile), so a Land-wide sweep is infeasible in one bake. Use a CITY bbox (Köln = ' +
        '6.85,50.88,7.02,50.99 → 182 tiles / 3.9 GB, live-measured 2026-07-31). Footprints keep OSM default.',
    };
  }
  const idx = await nrwTileIndex(timeoutMs);
  if (!idx) {
    // §CONTEXT-DATA-HONESTY value 1 — the service is unreachable. We know NOTHING about coverage here,
    // which is a different value from "NRW has no tiles for this bbox". Say so, loudly.
    return { status: 'blocked', reason: `NRW LoD2 join: ${SOURCES.lod2de_nrw.endpoint}index.json unreachable — cannot tell "no data" from "service down". Footprints keep OSM default.` };
  }

  // §GEOJSONSEQ-READ — streams; RS-tolerant; an unparseable file is a LOUD error, not "no data".
  const load = loadJoinFootprints(inPath, 'NRW LoD2 join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason };
  const feats = load.feats;
  // Each stampable footprint → native EPSG:25832 rings (NRW's own CRS) + native centroid + native bbox.
  const records = [];
  for (const feat of feats) {
    const fp = footprintFromFeature(feat);
    if (!fp) continue;
    const extNative = fp.ext.map(([lon, lat]) => wgs84ToUtm32(lat, lon));
    const interiorsNative = fp.interiors.map((r) => r.map(([lon, lat]) => wgs84ToUtm32(lat, lon)));
    let cx = 0, cy = 0, minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    for (const [X, Y] of extNative) {
      cx += X; cy += Y;
      if (X < minE) minE = X; if (X > maxE) maxE = X;
      if (Y < minN) minN = Y; if (Y > maxN) maxN = Y;
    }
    cx /= extNative.length; cy /= extNative.length;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    records.push({ feat, extNative, interiorsNative, cx, cy, minE, minN, maxE, maxN });
  }

  // The tiling grid IS the publisher's grid — one iteration step = exactly one downloadable Kachel, so a
  // Kachel is never fetched twice and never half-covered.
  const c = [wgs84ToUtm32(bbox[1], bbox[0]), wgs84ToUtm32(bbox[1], bbox[2]), wgs84ToUtm32(bbox[3], bbox[0]), wgs84ToUtm32(bbox[3], bbox[2])];
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  const kE0 = Math.floor(Math.min(...xs) / NRW_TILE_M), kE1 = Math.floor(Math.max(...xs) / NRW_TILE_M);
  const kN0 = Math.floor(Math.min(...ys) / NRW_TILE_M), kN1 = Math.floor(Math.max(...ys) / NRW_TILE_M);

  let processedTiles = 0, tileErrors = 0, emptyTiles = 0, tileCapHit = false;
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose. See the catch below.
  let sweepAborted = false, sweepAbortReason = null;
  let matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0, nrwBuildingsRead = 0;
  const tilesNotInIndex = [];
  const errorTiles = [];
  const heights = [];
  try {
    outer:
    for (let ke = kE0; ke <= kE1; ke++) {
      for (let kn = kN0; kn <= kN1; kn++) {
        const t0 = ke * NRW_TILE_M, tn0 = kn * NRW_TILE_M;
        // `edgePadM`: a footprint sitting on a Kachel seam is offered to BOTH neighbours. NRW files a
        // building in exactly one Kachel by its own position, so without this an edge footprint could
        // never see its own LoD2 part. A record is only retired (`_done`) once MATCHED, so being offered
        // twice costs nothing and fetches nothing extra (each Kachel is fetched at most once anyway).
        const inTile = records.filter((r) => !r._done
          && r.cx >= t0 - edgePadM && r.cx < t0 + NRW_TILE_M + edgePadM
          && r.cy >= tn0 - edgePadM && r.cy < tn0 + NRW_TILE_M + edgePadM);
        if (inTile.length === 0) { emptyTiles++; continue; }   // ← the cost control: no footprints, no download
        const name = `LoD2_32_${ke}_${kn}_1_NW.gml`;
        if (!idx.has(name)) { tilesNotInIndex.push(name); continue; }
        if (processedTiles >= maxTiles) { tileCapHit = true; break outer; }
        const res = await streamNrwKachel(`${SOURCES.lod2de_nrw.endpoint}${name}`, { timeoutMs });
        if (!res.ok) { tileErrors++; if (errorTiles.length < 10) errorTiles.push(`${name}: ${res.reason}`); continue; }
        processedTiles++;
        nrwBuildingsRead += res.buildings.length;
        // Uniform grid over THIS Kachel's LoD2 parts — a dense city Kachel holds ~1–3k parts, so the
        // naive O(footprints × parts) scan would be ~10⁶ point-in-polygon tests per tile.
        const grid = new Map();
        const key = (E, N) => `${Math.floor(E / NRW_MATCH_GRID_M)}:${Math.floor(N / NRW_MATCH_GRID_M)}`;
        for (const b of res.buildings) {
          const k = key(b.E, b.N);
          let cell = grid.get(k);
          if (!cell) { cell = []; grid.set(k, cell); }
          cell.push(b);
        }
        const cellsCovering = (minE, minN, maxE, maxN) => {
          const acc = [];
          for (let gx = Math.floor(minE / NRW_MATCH_GRID_M); gx <= Math.floor(maxE / NRW_MATCH_GRID_M); gx++) {
            for (let gy = Math.floor(minN / NRW_MATCH_GRID_M); gy <= Math.floor(maxN / NRW_MATCH_GRID_M); gy++) {
              const cell = grid.get(`${gx}:${gy}`);
              if (cell) acc.push(...cell);
            }
          }
          return acc;
        };
        for (const r of inTile) {
          // 1. FORWARD — LoD2 part centroids inside this OSM footprint.
          const owned = [];
          for (const b of cellsCovering(r.minE, r.minN, r.maxE, r.maxN)) {
            if (!_pointInRing(b.E, b.N, r.extNative)) continue;
            let inHole = false;
            for (const hole of r.interiorsNative) if (_pointInRing(b.E, b.N, hole)) { inHole = true; break; }
            if (inHole) continue;
            owned.push(b);
          }
          let via = 'forward';
          // 2. REVERSE — else this OSM footprint's centroid inside a LoD2 ground ring.
          if (owned.length === 0) {
            via = 'reverse';
            for (const b of cellsCovering(r.cx, r.cy, r.cx, r.cy)) {
              if (_pointInRing(r.cx, r.cy, b.ring)) owned.push(b);
            }
          }
          // 3. NEITHER — leave the footprint's OSM tags untouched (honest assumed/tagged default).
          if (owned.length === 0) continue;
          r._done = true;
          if (via === 'forward') { matchedForward++; if (owned.length > 1) multiPartFootprints++; } else matchedReverse++;
          const h = clampHeight(areaWeightedP90(owned));
          r.feat.properties = {
            ...(r.feat.properties ?? {}),
            // `nationalBuildingTags` is the ONE place that knows which tags the client re-derives
            // provenance from (§WIRE-HONEST) — go through it rather than hand-rolling the bag, then
            // preserve the footprint's own `building` subtype (nationalBuildingTags defaults 'yes',
            // which would flatten e.g. building=church → building=yes and lose client styling).
            // `roof_type` comes from the LARGEST-AREA part, not the P90 part: a roof SHAPE has no
            // meaningful percentile, so the dominant part's shape is the only non-invented answer.
            ...nationalBuildingTags({ heightM: h, provenance: 'tagged', source: 'lod2de_nrw', roofType: dominantRoof(owned) }),
            building: r.feat.properties?.building ?? 'yes',
            height: Number(h.toFixed(1)),
          };
          heights.push(h);
        }
      }
    }
  } catch (err) {
    // Network cut mid-grid — write whatever we stamped so far (honest partial), never abort the bake.
    //
    // §ABORT-IS-NOT-A-CAP (2026-08-01). This used to set `tileCapHit = true`, so an ABORTED sweep
    // reported itself as "maxTiles N cap hit — rest keep OSM". Measured in run 30706761446: the
    // Spain MDS join stamped 21,457/431,256 footprints off **16 tiles** while announcing a
    // **20,000**-tile cap — arithmetically impossible, because `tileCapHit` is otherwise only set
    // when `processedTiles >= maxTiles`. The join had THROWN after 16 tiles and this line buried it;
    // Denmark (149 tiles) and Köln (168) stamped ~80 % in the same run, so Spain's 5 % read as a
    // scope decision rather than the failure it was.
    //
    // A CAP is a budget being respected. An ABORT is an error. Reporting the second as the first is
    // §CONTEXT-DATA-HONESTY collapse (failure and empty are the SAME VALUE — the L-422/457/467/469
    // family) turned on our own telemetry, and it hid a real defect for an entire 4-hour run.
    sweepAborted = true;
    sweepAbortReason = String(err?.message ?? err);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, feats.map((f) => JSON.stringify(f)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  // §CONTEXT-DATA-HONESTY value 2 — every candidate Kachel was absent from the NRW index and nothing was
  // fetched: the bbox is simply not in Nordrhein-Westfalen. That is a genuine EMPTY, not a failure, and
  // it must not read as one.
  if (processedTiles === 0 && tileErrors === 0 && tilesNotInIndex.length > 0) {
    return {
      status: 'no-source', outPath, count: feats.length, footprintCount: records.length, measuredCount: 0,
      tilesNotInIndex: tilesNotInIndex.length, tilesNotInIndexSample: tilesNotInIndex.slice(0, 6),
      reason: `NRW LoD2 join: all ${tilesNotInIndex.length} candidate Kachel(n) are absent from the NRW index — ` +
        'this bbox is outside Nordrhein-Westfalen (LoD2-DE is per-Land; another Land needs its own adapter). ' +
        'Footprints keep OSM default.',
    };
  }
  return {
    status: 'ok', outPath, count: feats.length, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    matchedForward, matchedReverse, multiPartFootprints, nrwBuildingsRead,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, errorTiles, emptyTiles, tileCapHit,
    tilesNotInIndex: tilesNotInIndex.length, tilesNotInIndexSample: tilesNotInIndex.slice(0, 6),
    tileGrid: `${kE1 - kE0 + 1}×${kN1 - kN0 + 1}`,
    note: `LoD2-DE·NRW measuredHeight stamped onto OSM footprints → ${measured}/${records.length} footprint(s) ` +
      `got a MEASURED height (tagged; ${matchedForward} forward, ${matchedReverse} reverse, ${multiPartFootprints} ` +
      `multi-part), from ${nrwBuildingsRead} LoD2 building part(s) across ${processedTiles} Kachel(n)` +
      `${tileErrors ? `, ${tileErrors} tile error(s)` : ''}` +
      `${tilesNotInIndex.length ? `, ${tilesNotInIndex.length} Kachel(n) not in the NRW index (outside NRW)` : ''}` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}.`,
  };
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
    // §CTX-HEIGHT-MEASURED-MARKER — a `provenance:'tagged'` national source here is ALWAYS a real
    // measured height (LiDAR/photogrammetry/nDSM), never an OSM survey. Mark it so the client ranks it
    // above OSM `tagged` (`measured-lidar`) instead of collapsing the two.
    tags[MEASURED_HEIGHT_SRC_TAG] = MEASURED_HEIGHT_SRC_VALUE;
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
  else if (source === 'mds_edificacion') res = await fetchSpainBuildingHeights(bbox);
  else if (source === 'lod2de_nrw') res = await fetchLod2DeNrw(bbox);
  else if (source === 'geodanmark') res = await fetchGeoDanmarkHeights(bbox);
  else if (source === 'mnh_fr') {
    // §MNH-FR — live, but it is a bake STAMP over bake's own footprints, not a footprint fetcher. A
    // region reaching this branch has NOT declared `heightJoin:'mnh_fr'` in bake.mjs; say so precisely
    // (the honest reason the orchestrator can act on), and keep OSM — never a fabricated height.
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is the bake STAMP stampMnhFrHeightsOnGeojsonseq, dispatched only when the region ` +
        `declares heightJoin:'mnh_fr' in bake.mjs (with stampBboxesFor → MNH_FR_CITY_BBOXES). Region "${region}" does not, so ` +
        'its footprints keep their OSM tags until that row edit lands.',
    };
  }
  else if (source === 'swissbuildings3d') {
    // §SWISS-NDSM — live, but (like mnh_fr) a bake STAMP over bake's own footprints, not a footprint fetcher.
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is the bake STAMP stampSwissHeightsOnGeojsonseq, dispatched only when the region ` +
        `declares heightJoin:'swiss' in bake.mjs (with stampBboxesFor → SWISS_CITY_BBOXES). Region "${region}" does not, so ` +
        'its footprints keep their OSM tags until that row edit lands.',
    };
  }
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
  mds_edificacion: [2.163, 41.388, 2.169, 41.393], // Barcelona Eixample (~5–7 storeys ≈ 18–24 m)
  lod2de_nrw: [6.94, 50.93, 6.96, 50.95],      // Cologne centre (NRW) — LoD2-DE live reference
  geodanmark: [12.56, 55.67, 12.58, 55.69],    // Copenhagen centre (auth-gated → blocked probe)
  mnh_fr: [2.346, 48.852, 2.352, 48.856],      // Paris, Île de la Cité — the 2026-09-04 live-verification bbox
  swissbuildings3d: [8.540, 47.370, 8.548, 47.376], // Zürich, inside LV95 km² tile 2683-1247 (Hauptbahnhof) — the 2026-09-04 COG probe tile
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
  if (id === 'mds_edificacion') {
    const r = await fetchSpainBuildingHeights(bbox, { maxTiles: 4 });
    const heights = (r.features ?? []).map((f) => f.properties.height).filter((h) => Number.isFinite(h));
    const ring0 = r.features?.[0]?.geometry?.coordinates?.[0];
    return {
      id, endpoint: MDS_WCS.endpoint, coverageId: MDS_WCS.coverageEdificacion, status: r.status,
      // Honest gate: `ok` (real MDS heights on Catastro footprints), `documented` (footprints reached / no
      // usable sample / bbox too large → keeps OSM), or `error` — all honest, none fabricated.
      assertHonestGate: ['ok', 'documented', 'error'].includes(r.status),
      footprintCount: r.footprintCount, measuredCount: r.measuredCount, coverage: r.coverage,
      heightStats: r.heightStats, sampleHeights: heights.slice(0, 5),
      tileGrid: r.tileGrid, tilesProcessed: r.tilesProcessed, tileErrors: r.tileErrors, catastroErrors: r.catastroErrors,
      sampleRing: ring0?.slice(0, 3),
      assertRealHeight: heights.some((h) => Number.isFinite(h) && h > 0),
      assertGeometry: Array.isArray(ring0) && ring0.length >= 4,
      provenance: 'tagged', truncated: r.truncated, mode: heightModeForSource('mds_edificacion'), reason: r.reason ?? r.note,
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
    const r = await fetchGeoDanmarkHeights(PROBE_BBOX.geodanmark);
    const heights = (r.features ?? []).map((f) => f.properties.height).filter((h) => Number.isFinite(h));
    return {
      id, endpoint: SOURCES.geodanmark.endpoint, status: r.status,
      // Honest gate: with no key this is `blocked`, and that is the CORRECT, load-bearing result.
      // With the key: `ok` (real nDSM heights), or `documented` (footprints reached, no usable nDSM).
      assertHonestGate: r.status === 'blocked' || r.status === 'documented' || r.status === 'ok',
      reachedWithKey: r.reachedWithKey ?? (r.status === 'ok'),
      footprintCount: r.footprintCount, measuredCount: r.measuredCount, coverage: r.coverage,
      heightStats: r.heightStats, sampleHeights: heights.slice(0, 3),
      tileGrid: r.tileGrid, tilesProcessed: r.tilesProcessed, tileErrors: r.tileErrors,
      assertRealHeight: heights.some((h) => Number.isFinite(h) && h > 0),
      provenance: 'tagged', truncated: r.truncated, mode: heightModeForSource('geodanmark'), reason: r.reason ?? r.note,
    };
  }
  if (id === 'mnh_fr') {
    // §MNH-FR — asserts the THREE things the stamp depends on, each independently: (1) the WMS answers
    // a decodable Float32 GeoTIFF in the requested axis order, (2) its pixels are plausible building
    // heights (not a shaded relief, not open ocean), (3) the dalle index agrees the bbox is published.
    const gt = await loadGeoTiff();
    const url = mnhFrGetMapUrl(bbox, mnhFrPxDims(bbox, 1.0));
    const rr = await httpGetBuffer(url, { timeoutMs: 60_000 });
    let raster = null, stats = null, nodataPixels = 0, decodeError = null;
    if (rr.ok && gt && /tiff/i.test(rr.ct)) {
      try {
        raster = await readDhmRaster(rr.ab, gt);
        nodataPixels = maskNodata(raster.values, MNH_FR.nodata);
        const vals = Array.from(raster.values).filter(Number.isFinite).sort((a, b) => a - b);
        stats = vals.length ? { n: vals.length, min: vals[0], p50: _percentile(vals, 50), p90: _percentile(vals, 90), max: vals[vals.length - 1] } : null;
      } catch (e) { decodeError = String(e?.message ?? e); }
    }
    let dalles = null;
    try { const h = await httpGet(mnhFrDalleHitsUrl(bbox), { timeoutMs: 30_000 }); dalles = h.ok ? parseWfsHits(h.body) : null; } catch { dalles = null; }
    return {
      id, endpoint: MNH_FR.wms, layer: MNH_FR.layer, status: rr.ok && raster ? 'ok' : 'error', httpStatus: rr.status, contentType: rr.ct,
      assertContentType: /tiff/i.test(rr.ct ?? ''), assertGeoTiffDecodes: !!raster, geotiffDeps: !!gt,
      width: raster?.width, height: raster?.height, bboxRead: raster?.bboxNative, nodataPixels, heightStats: stats,
      assertRealHeight: !!stats && stats.p90 > 2.5 && stats.max < 400,
      dalleIndexHits: dalles, dalleCoverage: classifyDalleCoverage(dalles),
      provenance: 'tagged', mode: "stamp (bake.mjs heightJoin:'mnh_fr' → stampMnhFrHeightsOnGeojsonseq)",
      reason: rr.reason ?? decodeError ?? (gt ? null : 'geotiff dep unavailable'),
    };
  }
  if (id === 'swissbuildings3d') {
    // §SWISS-NDSM — asserts the FOUR things the stamp depends on, independently: (1) the STAC index answers
    // and names a COG for the tile, for BOTH collections, (2) the DSM COG decodes at its 1 m overview,
    // (3) the DTM COG decodes, (4) DSM − DTM over the tile is plausible building/canopy height.
    const gt = await loadGeoTiff();
    const proj = await loadLv95Projector();
    if (!gt || !proj) return { id, status: 'error', reason: gt ? 'proj4 / reproject.mjs unavailable' : 'geotiff dep unavailable' };
    const [cx, cy] = proj.forward((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);
    const tk = lv95TileKey(cx, cy);
    const q = bbox;
    const look = async (coll, tok) => { const r = await httpGetSafe(swissStacItemsUrl(coll, q), { timeoutMs: 30_000 }); const c = r.ok ? parseStacCollection(r.body) : null; return { httpStatus: r.status, items: c?.features?.length ?? null, href: c ? pickCogAsset(c, tk, tok) : null }; };
    const dsmQ = await look(SWISS_NDSM.stacDsm, SWISS_NDSM.dsmResToken);
    const dtmQ = await look(SWISS_NDSM.stacDtm, SWISS_NDSM.dtmResToken);
    let dsm = null, dtm = null, err = null, nd = null;
    try {
      if (dsmQ.href) dsm = await readCogLevel(dsmQ.href, SWISS_NDSM.dsmOverviewLevel, gt);
      if (dtmQ.href) dtm = await readCogLevel(dtmQ.href, 0, gt);
      if (dsm && dtm) {
        const vals = [];
        for (let y = 0; y < dsm.height; y += 5) for (let x = 0; x < dsm.width; x += 5) {
          const X = dsm.bboxNative[0] + (x + 0.5) * (dsm.bboxNative[2] - dsm.bboxNative[0]) / dsm.width;
          const Y = dsm.bboxNative[3] - (y + 0.5) * (dsm.bboxNative[3] - dsm.bboxNative[1]) / dsm.height;
          const d = dsm.values[y * dsm.width + x] - sampleRasterNative(dtm, X, Y);
          if (Number.isFinite(d) && d > 0.5) vals.push(d);
        }
        vals.sort((a, b) => a - b);
        nd = vals.length ? { n: vals.length, p50: _percentile(vals, 50), p90: _percentile(vals, 90), max: vals[vals.length - 1] } : null;
      }
    } catch (e) { err = String(e?.message ?? e); }
    return {
      id, endpoint: SWISS_NDSM.stacDsm, tile: tk, status: dsm && dtm ? 'ok' : 'error',
      stac: { dsm: dsmQ, dtm: dtmQ },
      assertStacNamesBothCogs: !!(dsmQ.href && dtmQ.href), assertDsmDecodes: !!dsm, assertDtmDecodes: !!dtm,
      dsm: dsm ? { ifd: dsm.ifd, width: dsm.width, height: dsm.height, bboxLv95: dsm.bboxNative, nodataPixels: dsm.masked } : null,
      dtm: dtm ? { ifd: dtm.ifd, width: dtm.width, height: dtm.height, nodataPixels: dtm.masked } : null,
      ndsmStats: nd, assertRealHeight: !!nd && nd.p90 > 2.5 && nd.max < 400,
      provenance: 'tagged', mode: "stamp (bake.mjs heightJoin:'swiss' → stampSwissHeightsOnGeojsonseq)", reason: err,
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
      const ids = which && !which.startsWith('--') ? [which] : ['bdtopo', '3dbag', 'catastro', 'mds_edificacion', 'lod2de_nrw', 'geodanmark', 'mnh_fr', 'swissbuildings3d'];
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
