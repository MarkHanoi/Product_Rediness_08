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
// §MDS-NATIONAL-SWEEP (L-12946) — `openSync/readSync/writeSync/closeSync/unlinkSync` are the
// swathe driver's file plumbing: the leftover pass-through file is concatenated into the output in
// 8 MB chunks (never through a JS string), and the two alternating scratch files are removed.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';

// §SEQ-WRITE-STREAMED (L-12937, 2026-09-05) — France's mnh_fr join died 4 h in with `RangeError: Invalid
// string length`: the stamped set (every OSM footprint in 144.6 deg², ~20 M features) was serialised as
// ONE string — `feats.map(JSON.stringify).join('\n')` — and V8 caps a string at ~512 MiB. The join then
// reported "0 measured heights" and the gate refused, which read as a data problem. It was a writer
// problem. Every whole-set write now goes through this chunked writer: features are serialised in
// bounded chunks (≤ 8 MiB of text) and appended, so the largest string ever built is one chunk.
// Exported for its spec; the per-batch `records.map(...).join` writes elsewhere in this file are
// already bounded by their batch size and are left alone.
export const SEQ_WRITE_CHUNK_CHARS = 8 * 1024 * 1024;
export function writeFeaturesSeq(path, feats) {
  writeFileSync(path, '');
  let buf = '';
  let n = 0;
  for (const f of feats) {
    buf += JSON.stringify(f) + '\n';
    n++;
    if (buf.length >= SEQ_WRITE_CHUNK_CHARS) { appendFileSync(path, buf); buf = ''; }
  }
  if (buf.length) appendFileSync(path, buf);
  return n;
}
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// §MNH-FR (2026-09-04) — the PURE half of the French national stamp (URL builders, pixel budget, the
// dalle-index hits parser, the nodata mask, the city working set) lives in its own dependency-free
// module so vitest can import and pin its decisions; this file keeps the raster/network half.
import { MNH_FR, MNH_FR_CITY_BBOXES, classifyDalleCoverage, maskNodata, mnhFrDalleHitsUrl, mnhFrGetMapUrl, mnhFrPxDims, parseWfsHits } from './heights/mnhFr.mjs';
// §SWISS-NDSM (2026-09-04) — the PURE half of the Swiss national stamp (STAC URL, LV95 tile keying, COG
// asset selection, the city working set) — same split, same reason.
import { SWISS_NDSM, SWISS_CITY_BBOXES, lv95TileKey, lv95TileBbox, parseStacCollection, pickCogAsset, swissStacItemsUrl } from './heights/swissNdsm.mjs';
// §AU-OPEN-HEIGHTS (2026-09-05, lane HEIGHTS-AU) — the PURE half of the Australian per-jurisdiction
// open-footprint-heights stamp (adapter table, export URL, component parser, the height rule, the
// working set); this file keeps the network/stream half (`stampAuOpenHeightsOnGeojsonseq`).
import { AU_OPEN_HEIGHTS, AU_OPEN_CITY_BBOXES, AU_OPEN_HEIGHTS_ASSESSED, auOpenExportUrl, auOpenHeightForFootprint, auOpenJurisdictionForPoint, odsComponents, parseOdsGeojson } from './heights/auOpenHeights.mjs';
// §MDS-NATIONAL-TILING (L-12946, 2026-09-06, lane ES-WHOLE-COUNTRY-HEIGHTS) — the PURE half of the
// WHOLE-COUNTRY Spanish height sweep: the measured WCS ceiling (MAXSIZE=4096, probed at three
// latitudes), the rectangular tile it implies, the bounded-heap swathe plan, the deterministic sweep
// order and the resume cursor. Same split, same reason: vitest can import THAT file, not this one.
import {
  MDS_NATIONAL_BBOX, MDS_NATIONAL_BBOXES, MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_SWATHE_ROWS,
  MDS_SWEEP_CONCURRENCY, MDS_MAX_SPAN_LAT_DEG, MDS_MAX_SPAN_LON_DEG,
  mdsTileGrid, mdsCellBbox, mdsCellKm2, mdsNationalSwathes, sweepOrder, sweepBatches, formatSweepSummary,
} from './heights/mdsNational.mjs';
export {
  MDS_NATIONAL_BBOX, MDS_NATIONAL_BBOXES, MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_SWATHE_ROWS,
  MDS_SWEEP_CONCURRENCY, MDS_MAX_SPAN_LAT_DEG, MDS_MAX_SPAN_LON_DEG,
};
export { MNH_FR, MNH_FR_CITY_BBOXES, SWISS_NDSM, SWISS_CITY_BBOXES, AU_OPEN_HEIGHTS, AU_OPEN_CITY_BBOXES, AU_OPEN_HEIGHTS_ASSESSED };
// §NL-3DBAG-OSM-JOIN (2026-09-05, lane HEIGHTS-NL) — the Dutch stamp lives in heights/nl3dbagStamp.mjs (imported by bake.mjs
// directly, not through this file) and reuses the shared join helpers below via this ONE export line.
// ⭐ `appendFileInto` joined this line 2026-09-06 (lane USA-HEIGHTS-NATIONAL, §USAS-SWATHE). It is the
// 8 MB-buffer file concatenation the MDS swathe driver uses to write the final leftover pass-through
// back into the output WITHOUT going through the V8 heap — which is the whole point of swathe passes.
// heights/usasNationalStamp.mjs needs the identical primitive, and a private copy of a heap-critical
// routine is how two implementations drift into one being wrong (§GREP-FOR-THE-EXISTING-SOLVER-FIRST).
export { footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf, areaWeightedP90, dominantRoof, clampHeight, appendFileInto };

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
      '`documented` (keeps OSM); a CITY bbox resolves exactly. ⭐ WHOLE-COUNTRY IS BUILT (L-12946, ' +
      '2026-09-06): the OSM-footprint join stampMdsHeightsOnGeojsonseq now retains the WHOLE `spain` ' +
      'bbox (MDS_NATIONAL_BBOXES) and bounds its heap with swathe passes, so any Spanish town OSM has ' +
      'mapped is reachable — MDS_CITY_BBOXES is a PRIORITY ORDER only. Measured service ceiling: ' +
      'MAXSIZE=4096 px/axis, 0.095° served / 0.100° refused at 36.0 N, 39.0 N and 43.5 N alike ' +
      '(heights/mdsNational.mjs records every exact HTTP answer).',
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
      '3DEP nDSM is the national-accuracy top-up (US analogue of FR LiDAR HD). No national parcel. ' +
      '⚠ RE-PROBED 2026-09-05 (lane HEIGHTS-US, heights/usOpenHeights.mjs carries every URL and number): the per-metro ' +
      'OPEN channels this note used to name were half wrong — NYC 5zhs-2jue and SF ynuv-fyni serve real per-building ' +
      'heights (→ `us_open_heights`, newyork/sanfrancisco/boston rows), Boston\'s is the BPDA FeatureServer (NOT MassGIS: ' +
      'GISDATA.STRUCTURES_POLY has no height field, verbatim schema in the module), and Chicago syp8-uezg has `stories` ' +
      'only (820,606 rows, last updated 2015-08-15) — chicago/austin/houston stay here, mass-only, on evidence.',
  },
  us_open_heights: {
    country: 'us', name: 'US per-metro open building heights — NYC height_roof · SF LiDAR hgt_maxcm · Boston BPDA BLDG_HGT_2010', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (per-metro authority attribute)', lodNext: 'LoD2-mesh (NYC 3D model / Boston 3D scene layer)',
    endpoint: 'data.cityofnewyork.us/resource/5zhs-2jue.json · data.sfgov.org/resource/ynuv-fyni.json · gis.bostonplans.org/hosting/rest/services/Boston_Buildings/FeatureServer/9',
    heightField: 'newyork: height_roof (FEET, as-built/photogrammetric — NOT LiDAR, per NYC metadata) · sanfrancisco: hgt_maxcm (LiDAR zonal max, cm) · ' +
      'boston: BLDG_HGT_2010 (FEET, 2010 photogrammetric model, tallest roof-break part). Tallest part whose centroid the OSM footprint contains; contains-centroid fallback',
    coverage: 'partial', // NYC five boroughs · SF city · Boston city — footprints in the metro clip but outside (Jersey City, Cambridge) keep OSM tags
    keyless: true, // anonymous SODA (NYC, SF) + anonymous ArcGIS FeatureServer (Boston) — NO api key, NO app token, NO repo secret.
    note: 'LIVE-PROBED 2026-09-05 (lane HEIGHTS-US): NYC 1,083,026 rows (736 NULL/0 heights), $limit=60000 honoured, Midtown cell 732 rows / 516 KB / 2.7 s; ' +
      'SF 177,023 rows (PDDL), every numeric column TEXT (cast!), Financial District cell 485 rows / 369 KB / 1.2 s; Boston 128,608 features ' +
      '(PDDL, maxRecordCount 2000 + pagination, 23,487 NULL/≤0), Back Bay cell 1,225 features / 1.0 MB / 7.6 s. It is a bake STAMP over bake\'s own ' +
      'OSM footprints, NOT a footprint fetcher. ⚠ Socrata within_box is (N,W,S,E) lat-first; ArcGIS envelope is (W,S,E,N) — both pinned by ' +
      'usOpenHeights.spec.ts. ⭐ 2026-09-06 (lane USA-HEIGHTS-NATIONAL): NO REGION MAPS HERE ANY MORE, and the three channels are NOT switched ' +
      'off — read that carefully, because "no region maps to it" normally means dead. All three adapters (US_OPEN_HEIGHTS in ' +
      'heights/usOpenHeights.mjs) are read on EVERY US bake, by heights/usasNationalStamp.mjs, which resolves the CITY channel FIRST per ' +
      'FOOTPRINT (usOpenChannelForPoint) and only falls back to the national FEMA/ORNL layer outside their boxes. The order is a MEASUREMENT, ' +
      'not a courtesy: in the same Midtown cell NYC height_roof reaches 270.6 m and USA Structures 170.5 m. What was retired is the bake KEY ' +
      'heightJoin:\'us_open\' (and with it heights/usOpenHeightsStamp.mjs, now imported by nothing — a NAMED orphan), because a row declaring it ' +
      'could reach only its own metro box and left the rest of NY / CA / MA states on the fabricated 9 m carpet.',
  },
  // §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL) — the WHOLE-COUNTRY US channel.
  usas_national: {
    country: 'us', name: 'FEMA/ORNL "USA Structures" — national per-building HEIGHT (m), the NGA LiDAR-derived subset', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (national; per-state depth varies)', lodNext: 'a 3DEP-LPC-derived nDSM for the ORNL half',
    endpoint: 'services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0',
    heightField: 'HEIGHT (metres, esriFieldTypeSingle, alias "Height (meters)"). Tallest part whose centroid the OSM footprint contains; '
      + 'contains-centroid fallback. Server-side `where=HEIGHT IS NOT NULL` — the ORNL half of the layer NEVER carries a height and is not fetched.',
    coverage: 'partial', // national REACH; per-state DEPTH runs 1.0 % (southdakota) to 95.3 % (districtofcolumbia) — measured, see note
    keyless: true, // anonymous ArcGIS FeatureServer — NO api key, NO app token, NO repo secret
    note: 'LIVE-PROBED 2026-09-06 (lane USA-HEIGHTS-NATIONAL; heights/usOpenHeights.mjs §USAS-NATIONAL-HEIGHTS carries every URL, byte count and '
      + 'timing). ONE layer, 135,321,228 structures (returnCountOnly → HTTP 200, 19 B, 0.72 s), maxRecordCount 2000, pagination TRUE, CC BY 4.0. '
      + 'PROVENANCE from the layer\'s OWN FGDC metadata (/metadata → HTTP 200, 29,975 B, application/xml), VERBATIM: HEIGHT is "a measure of the '
      + 'height (in meters) of the structure as determined from LiDAR or other source data", source "LiDAR-derived footprints where available '
      + 'provided by NGA" — AUTHORITY-MEASURED, lidar WHERE AVAILABLE; this row never claims measured-lidar for every structure. H_ADJ_ELEV / '
      + 'L_ADJ_ELEV read "NONE. NOT CURRENTLY POPULATED" and probed null everywhere. A height implies SOURCE=\'NGA\', and the ORNL half is 0-for-0 '
      + 'in all 28 state/territory bboxes measured — so an unmeasured footprint gets NOTHING, never a neighbour\'s number. Per-state height '
      + 'coverage (whole-state groupBy SOURCE): districtofcolumbia 95.3 % · nevada 53.2 % · california 46.0 % · hawaii 42.7 % · colorado 40.2 % · '
      + 'arizona 36.4 % · massachusetts 29.6 % · delaware 27.8 % · newyork 26.7 % · ohio 23.9 % · alaska 22.6 % · illinois 22.5 % · newmexico '
      + '20.7 % · puertoricousa 19.6 % · kansas 18.3 % · washington 16.9 % · georgia 14.5 % · idaho 13.3 % · northcarolina 10.0 % · wyoming 8.8 % · '
      + 'northdakota 5.5 % · vermont 4.4 % · montana 3.3 % · southdakota 1.0 %. ⚠ For texas / florida / pennsylvania / westvirginia / maine the '
      + 'PERCENTAGE is unmeasured — their whole-state groupBy returns HTTP 200 carrying {"error":{"code":400,"message":""}} after 55 s, a '
      + 'server-side timeout wearing a 400, as does the ungeometried national one — but their NUMERATOR is exact: the cheaper '
      + '`where=HEIGHT IS NOT NULL&returnCountOnly=true` succeeded for ALL 49 wired rows (texas 3,530,320 · florida 2,352,630 · pennsylvania '
      + '1,828,525 · westvirginia 443,812 · maine 32,924). ⭐ THAT SWEEP IS THE GATE PROOF: 49/49 rows non-zero, 35,722,898 height-bearing '
      + 'structures in total, smallest southdakota 7,379 — so no wired row can trip §MEASURED-HEIGHT-GATE\'s exit-4 for stamping zero. ⛔ MEASURED-ZERO and therefore NOT wired: alaskaaleutians (87 structures, '
      + 'all ORNL) and usvirginislands (40,726, all ORNL). ⛔ Overture and Microsoft US heights are ESTIMATES — both saturate at ~34.7 m over 79k '
      + 'urban Wichita buildings whose tallest is 98 m — and are deliberately NOT wired: an estimate may never be written under the measured '
      + 'marker. It is a bake STAMP (heights/usasNationalStamp.mjs stampUsasNationalHeightsOnGeojsonseq), NOT a footprint fetcher — a region must '
      + 'declare heightJoin:\'usas\' (bake.mjs dispatch + stampBboxesFor → US_NATIONAL_BBOXES) to receive it.',
  },
  ndh_no: {
    country: 'no', name: 'Kartverket NHM nDSM (DOM − DTM, keyless WCS) on OSM footprints', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (1 m national nDSM)', lodNext: 'LoD2-mesh (self-reconstruct)',
    endpoint: 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dom-nhm-25833 (nhm_dom_topo_25833) − ' +
      'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833 (nhm_dtm_topo_25833), WCS 1.0.0, EPSG:25833, FORMAT=GeoTIFF',
    heightField: 'P90 of (DOM − DTM) over the eroded OSM footprint interior (ndsmHeightForBuilding, native metres) — ' +
      'FKB-Bygning surveyed top-height stays Norge digitalt-licensed and is NOT used',
    coverage: 'partial',
    keyless: true, // Geonorge WCS: <fees>free</fees> <accessConstraints>None</accessConstraints> (probed 2026-09-05); CC BY 4.0 © Kartverket
    note: '⭐ WIRED 2026-09-05 (lane HEIGHTS-NORDICS, §NDH-NO-OSM-JOIN): the national STAMP stampNoNdhHeightsOnGeojsonseq ' +
      '(heights/noHeightsStamp.mjs; pure half + working set NO_NDH_CITY_BBOXES in heights/noHeights.mjs) is dispatched by the ' +
      'bake `norway` row (heightJoin:\'ndh_no\' → NATIONAL_STAMP_TABLE). LIVE-PROBED 2026-09-05: GetCapabilities HTTP 200 ' +
      'text/xml on BOTH services; GetCoverage 500 m @ 1 m → HTTP 200 image/tiff 1,049,839 B Float32 in 0.8–1.8 s (1,080 px → ' +
      '5.3 MB / 1.8 s); NO GDAL_NODATA tag (ArcGIS ±3.4e38 sentinel masked). DOM − DTM over the three working-set centres: ' +
      'Oslo p90 24.2 m (49 % of cells > 3 m) · Bergen p90 21.2 m · Trondheim p90 18.5 m, ZERO nodata cells. It is a bake ' +
      'STAMP over bake\'s own OSM footprints, NOT a bbox footprint fetcher (resolveHeights degrades to `documented`). ' +
      'The August note (Matrikkelen WFS + hoydedata.no) named the right raster and the wrong door: the keyless door is the ' +
      'Geonorge WCS the terrain adapter already uses.',
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
      'org-onboarding gate. Do not inherit the NGP gate onto context. ⛔ RE-PROBED 2026-09-05 (lane HEIGHTS-NORDICS) — ' +
      'NO-SOURCE for a MEASURED height, key or no key: /stac-hojd/v1/collections → HTTP 200, 78 collections, ALL of them ' +
      'Markhöjdmodell (DTM, `hojdmodelltyp: markhöjdmodell`, 1 m COG, CC BY 4.0) or Laserdata; the ONLY surface product is ' +
      '`dsm-skoglig-copc` = "Ytmodell som punktmoln i formatet laz/copc" (a point cloud, licence `other`), so there is NO ' +
      'DSM raster to difference even with a credential. The DTM asset host confirms the gate: ' +
      'dl1.lantmateriet.se/hojd/data/grid1m/…/65800_6750_25.tif → HTTP 401 "Authorization Required" (nginx) on both a ' +
      'range GET and a plain GET. No join is wired; `sweden` stays mass-only (honest OSM defaults).',
  },
  dgt_pt: {
    country: 'pt', name: 'DGT national LiDAR nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2/3 (Lisbon CML model)',
    endpoint: 'DGT CDD LiDAR (2024–25, 10 pts/m², open) + Overture/OSM footprints — NO reachable service door (probed 2026-09-05, below)',
    heightField: 'DSM−DTM nDSM 90th-pctile per footprint',
    note: 'Good height (~75%) but NO national footprint layer (use Overture/OSM) and weak parcels ' +
      '(Carta Cadastral ~134 munis, NOT Lisbon/Porto cores). Shares the nDSM module. ' +
      '⛔ NO-SOURCE 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, curl -m 20): DGT geo2.dgterritorio.gov.pt/geoserver WCS → HTTP 200 ' +
      'ows:ExceptionReport "Service WCS is disabled"; its WMS lists 159 layers, the only elevation ones altimetria:Cota_altimetrica / ' +
      'Curva_de_nivel / MDT50m:MDT50m (a 50 m TERRAIN model — no DSM, no building layer); cdd.dgterritorio.gov.pt → 404; ' +
      'ows.dgterritorio.gov.pt → TCP timeout. Lisbon CML (services.arcgis.com/1dSrzEWVQn5kHHyK, 118 services): Edificado_e_Vias/0 ' +
      '"Edificado" (EPSG:3763, maxRecordCount 2000) carries OBJECTID · COD_SIG · IDTIPO · NPRINCIP · MORADA · Shape__Area · ' +
      'Shape__Length — NO height, NO storeys; Cartografia_Base has no building layer; the hub search for altura / 3D / lidar / ' +
      'altimetria / modelo digital returns nothing; dados.cm-lisboa.pt/api → Cloudflare 403. Porto (opendata.porto.digital CKAN): ' +
      'edificios / 3D / altimetria / MDS / lidar → 0 relevant datasets (only Domus Social housing tables). So Portugal has NO ' +
      'reachable measured-height product — national, Lisbon or Porto — and NO join is wired; `portugal` stays mass-only (honest ' +
      'OSM defaults, never a fabricated height). The DGT 2024–25 LiDAR exists as a programme, not as a service anyone can sample.',
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
    country: 'be', name: 'DHMV II nDSM (DSM 1 m − DTM 1 m, keyless WCS) on OSM footprints — Flanders + Brussels', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (1 m regional nDSM)', lodNext: 'none (no LoD2 anywhere in BE; 3D GRB LoD1 is WMS-only)',
    endpoint: 'https://geo.api.vlaanderen.be/DHMV/wcs (WCS 2.0.1: DHMVII_DSM_1m − DHMVII_DTM_1m, EPSG:31370, multipart/related, FORMAT=image/tiff)',
    heightField: 'P90 of (DSM − DTM) over the eroded OSM footprint interior (ndsmHeightForBuilding, native metres); nodata −9999',
    coverage: 'partial', // Flanders + the Brussels-Capital Region (probed at Grand-Place); Wallonia is outside DHMV II
    keyless: true, // Vlaanderen: <Fees>Het gebruik van de service is kosteloos.</Fees> (probed 2026-09-05); gebruiksrecht geografische webdiensten
    note: '⭐ WIRED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, §BE-DHMV-OSM-JOIN): the national STAMP stampBeDhmvHeightsOnGeojsonseq ' +
      '(heights/beHeightsStamp.mjs; pure half + working set BE_CITY_BBOXES in heights/beHeights.mjs) is dispatched by the bake ' +
      '`belgium` row (heightJoin:\'be_dhmv\' → NATIONAL_STAMP_TABLE). LIVE-PROBED 2026-09-05: GetCapabilities HTTP 200 20,128 B; ' +
      'GetCoverage answers multipart/related boundary="wcs" (GML part + a Float32 GeoTIFF part, nodata −9999) for every FORMAT ' +
      'spelling; 200 m → 266,250 B / 0.54 s, 1 km → 4,198,890 B / 0.94 s. Antwerp Grote Markt DSM − DTM p50 10.8 · p90 18.2 · max ' +
      '54.0 m (68.7 % of cells > 3 m); Ghent nDSM p90 17.2 m; ⭐ Brussels Grand-Place DSM p90 46.6 m over DTM 21.4 m, 0 nodata — ' +
      'the August note\'s "Flanders only" was true of the 3D GRB block MODEL, not of the DHMV raster, which covers Brussels-Capital. ' +
      'Local proof on 1,000 real GRB:GBG footprints: 800/819 retained stamped (97.7 %), median 15.1 m, 0 tile errors. ' +
      'NOT a height source: 3D GRB LoD1 (WMS-only, /3DGRB/wfs → 302), UrbisAdm:Bu (GEOM · BU_INSPIRE_ID · BU_CAPAKEY · BU_STATUS · ' +
      'BU_CATEGORY · BU_ID — no height), /Urbis3D and /UrbisTopo (404). Wallonia (Liège, Charleroi, Namur) stays unstamped — ' +
      'DHMV II ends at the regional border and the Walloon MNT/MNS was not probed by this lane; an honest gap, said by name.',
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
    country: 'ee', name: 'ETAK e_401_hoone_ka korgus_m (Maa-amet national topographic DB, keyless WFS) on OSM footprints', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (surveyed metre per building, EHR-linked)', lodNext: 'LoD2-mesh (Eesti 3D CityGML — bulk order form, not a bbox service)',
    endpoint: 'https://gsavalik.envir.ee/geoserver/etak/ows (WFS 2.0.0 etak:e_401_hoone_ka, GeoJSON, EPSG:4326 lon,lat BBOX, 5,000-object cap per request)',
    heightField: 'korgus_m (xsd:short, integer metres; ETAK_juhend2016 §3.5.3: height model or stereo roof-edge — measured) + korgusallika_id (source document); tyyp 40 ruins skipped',
    coverage: 'full',
    keyless: true, // <Fees>puudub</Fees> <AccessConstraints>puudub</AccessConstraints> (probed 2026-09-05); Maa-amet open-data licence, attribution "Maa- ja Ruumiamet"
    note: '⭐ WIRED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, §EE-ETAK-OSM-JOIN): the national STAMP stampEeEtakHeightsOnGeojsonseq ' +
      '(heights/eeHeightsStamp.mjs; pure half + working set EE_CITY_BBOXES in heights/eeHeights.mjs) is dispatched by the bake ' +
      '`estonia` row (heightJoin:\'ee_etak\' → NATIONAL_STAMP_TABLE). LIVE-PROBED 2026-09-05: Maa-amet\'s own doors are dead ' +
      '(kaart.maaamet.ee/wfs/etak 404 · /wcs/korgusmudel 404 · inspire.maaamet.ee/geoserver/bu/wfs 302 · 3d.maaamet.ee 302); the ' +
      'Environment Agency mirror answers: GetCapabilities HTTP 200 147,052 B / 0.78 s, 44 etak:* layers. Tallinn Old-Town cell ' +
      '[24.74,59.43,24.75,59.44]: 646/646 buildings, 435,748 B / 0.69 s, korgus_m NULL 9 (1.4 %), p10 10 · p50 18 · p90 25 · max 86 m; ' +
      'tartu 594 · pärnu 374 · narva 217 · rural 0 per cell. ⚠ The 5,000 cap applies to hits too (a 0.04°×0.03° box: hits 5000, ' +
      'GetFeature numberReturned 5000 / numberMatched 0) — the stamp quarters a truncated cell, never trusts a round 5,000. ' +
      'Local proof: 594/607 Tallinn footprints stamped, 594/594 equal to their own korgus_m. The August note\'s "856,360 LoD2" ' +
      'Eesti 3D CityGML is a bulk download behind the geoportaal order form, not a bake channel; the register-linked (ehr_gid) ' +
      'korgus_m is the same survey\'s per-building height reachable by bbox. Open question, by name: the korgusallika_id code table ' +
      '(225 ×547 · 229 ×42 · 224 ×26 · 999 ×15 in the Tallinn cell) was not resolvable from public docs.',
  },
  bdot10k_pl: {
    country: 'pl', name: 'BDOT10k OT_BUBD_A storeys (national GeoParquet)', impl: 'documented',
    provenance: 'derived-levels', lodNow: 'LoD1-floorcount', lodNext: 'LoD2 (2017-vintage per-voivodeship CityGML, bulk UI-mediated — not a bake channel yet)',
    endpoint: 'plain-URL national GeoParquet (registry `pl-bdot10k-buildings-geoparquet`; probed 200 / 78.6 MB)',
    heightField: 'storey attribute — a COUNT (× 3.2 m derived, NEVER a measurement)',
    coverage: 'full',
    note: 'ASSESS PL: NATIONAL-DERIVED-HEIGHTS, gated on ONE owed DuckDB fill read over the parquet ' +
      '(storey-attr fill is UNMEASURED — control 9: UNKNOWN stays UNKNOWN). Until that probe lands, ' +
      'the `poland` region is mass-only and its row says so. ' +
      '⛔ MEASURED channel PROBED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, curl -m 20) — NO-SOURCE for an nDSM: GUGiK NMT (DTM) WCS ' +
      'mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF IS keyless and real (2.0.1 + 1.0.0 caps ' +
      'HTTP 200, Fees none, DTM_PL-KRON86-NH_TIFF, EPSG:2180 axisLabels "y x", 1 m; GetCoverage 200 m → 160,575 B Float32 / 1.6 s, ' +
      '1 km → 4,003,455 B / 7.8 s, Warsaw PKiN p50 116.2 m) — but the NMPT (DSM) half is not usable: the documented ' +
      '…/NMPT/GRID1/WCS/DigitalSurfaceModelFormatTIFF → 404; …/NMPT/WCS/… and …/NMPT/GRID1/WMS/… → 401 Unauthorized; the one ' +
      'answering door …/NMPT/GRID1/WCS/DigitalSurfaceModel (caps 200, coverages DSM_PL-KRON86-NH 0.5 m + DSM_PL-EVRF2007-NH) timed ' +
      'out at 20 s on EVERY KRON86 GetCoverage tried (Warsaw 200 m ×2, 100 m, SCALEFACTOR 0.5, WCS 1.0.0, Kraków 200 m), and the ' +
      'one EVRF2007 answer that arrived (200 m, 17.6 s, 480,869 B) decoded as a 400×400 **8-bit RGB** image (SampleFormat 1/1/1, ' +
      'values 111–255) — a shaded picture, not elevation. A DTM without a DSM is no nDSM, so NO join is wired and `poland` stays ' +
      'mass-only (honest OSM defaults, never a fabricated height). Re-probe the NMPT door before assuming this is permanent.',
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
  adsdi_ndsm_ae: {
    country: 'ae', name: 'Abu Dhabi SDI 50 cm DSM − DTM nDSM (DGE, catalogued Open Data sid 2012; photogrammetric, NOT LiDAR)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (nDSM derive, P90 over the eroded Overture footprint)', lodNext: 'none open (the I3S city model is licence-refused)',
    endpoint: 'arcgis.sdi.abudhabi.ae/agsimage ImageService/IMGSER_AUH_DSM3_50CM + IMGSER_AUH_DTM_50CM ImageServer exportImage — keyless F32 GeoTIFF in EPSG:4326 (live-probed 2026-09-05)',
    heightField: 'DSM3 − DTM per pixel (heights/abudhabiNdsm.mjs reuses czHeights ndsmDifference)',
    coverage: 'Abu Dhabi metro mosaic (DSM part 3 ∩ DTM: lon 54.26–56.06, lat 23.90–24.99) — the whole bake abudhabi row',
    note: 'this source is the bake STAMP stampAdNdsmHeightsOnGeojsonseq (heights/abudhabiNdsmStamp.mjs), dispatched only when the region declares ' +
      "heightJoin:'ad_ndsm' in bake.mjs (NATIONAL_STAMP_TABLE, stampBboxesFor → AD_CITY_BBOXES). Attribution: Abu Dhabi SDI Data Catalog " +
      '(Department of Government Enablement). Not a footprint fetcher — resolveHeights keeps Overture defaults for any other region.',
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
    country: 'gb', name: 'EA LiDAR Composite First-Return DSM 1 m − DTM 1 m nDSM (OGL v3, keyless) — ENGLAND ONLY', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (England only)', lodNext: 'none open (OS Building Heights = premium, X3-refused)',
    endpoint: 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs (DSM, CoverageId ' +
      'df4e3ec3-…__Lidar_Composite_Elevation_FZ_DSM_1m) + …/lidar-composite-digital-terrain-model-dtm-1m/wcs (DTM, the coverage terrain.mjs drapes) → WCS 2.0.1 GetCoverage per OS 1 km square, EPSG:27700, Float32 uncompressed',
    heightField: 'nDSM = P90(DSM − DTM) over the eroded footprint interior (ndsmHeightForBuilding, native BNG metres) — the DIFFERENCING IS OURS: ' +
      'the EA publishes no nDSM (unlike IGN\'s MNH). England only; Scotland/Wales are NOT served (see note).',
    coverage: 'partial',
    keyless: true, // OGL v3 — commercial use allowed, attribution required (terrain.mjs TERRAIN_SOURCES.gb). No repo secret.
    note: 'LIVE + WIRED 2026-09-05 (lane HEIGHTS-GB-IE): the stamp stampEaLidarGbHeightsOnGeojsonseq lives in heights/ealidarGbStamp.mjs ' +
      '(pure half heights/ealidarGb.mjs carries every probed number; fixture __tests__/fixtures/gb-ealidar-london-stmartin-2026-09-05.json) and the ' +
      'bake `greatbritain` row declares heightJoin:\'ealidar_gb\' (NATIONAL_STAMP_TABLE row → stampBboxesFor → EA_LIDAR_GB_CITY_BBOXES: london / ' +
      'manchester / birmingham / leeds / bristol). Local proof: Trafalgar Square 594/606 OSM footprints measured (St Martin-in-the-Fields 17.8 m, ' +
      'South Africa House 28.9 m), 2 squares, 4 GetCoverage, 17 MB, 4.6 s. Probed 2026-09-05: 1 km square = 4,194,755 B / 2.25 s; no area cap ' +
      'hit at 4 km (67 MB / 13.5 s). ⚠ Scotland: outside the served envelope (Edinburgh → HTTP 500 internal_error); the Scottish Remote Sensing ' +
      'Portal catalogue host srsp-catalog.jncc.gov.uk timed out twice — no reachable WCS. ⚠ Wales: INSIDE the envelope but answered as ZERO-FILL ' +
      '(HTTP 200, every cell 0.0 on both coverages at Cardiff) — the stamp counts such squares as VOID (eaRasterVerdict "void-zero"), never ground; ' +
      'DataMapWales GeoServer WCS lists 18 coverages, none LiDAR, its WMS timed out and its CKAN API 404s. The keyless OS Downloads catalogue still ' +
      'has NO building-height product; OS Building Heights stays X3-refused and is NOT used.',
  },
  buildings3d_fi: {
    country: 'fi', name: 'FI Buildings 3D national LoD2 (CC BY 4.0)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD2 (PARTIAL coverage)', lodNext: 'KM2 DTM+DSM nDSM derive (keyed, MML_API_KEY)',
    endpoint: 'NLS Buildings 3D CityGML (CC BY 4.0) + NLS INSPIRE BU footprints (fully anonymous)',
    heightField: 'CityGML measuredHeight where covered; coverage is PARTIAL (product page 2022-01-27)',
    coverage: 'partial',
    note: 'ASSESS FI: current coverage NOT CONFIRMED — read the status map FIRST (owed probe), then ' +
      'the stamp build. Until then `finland` is mass-only. ⛔ PROBED 2026-09-05 (lane HEIGHTS-NORDICS) — NO KEYLESS ' +
      'MEASURED-HEIGHT SOURCE: every NLS door is HTTP 401 without MML_API_KEY (avoin-paikkatieto.maanmittauslaitos.fi/' +
      'buildings/features/v1/collections → 401 · /geographic-names/… → 401 · avoin-karttakuva…/wcs/v2 GetCapabilities → 401), ' +
      'the same gate terrain.mjs APIKEY_SOURCES.fi records; the key was NOT present in this lane\'s env, so the keyed path ' +
      'was not measured and is NOT wired (never a fake height). Helsinki\'s keyless open WFS (kartta.hel.fi/ws/geoserver/' +
      'avoindata/wfs, HTTP 200, 305 KB capabilities) layer avoindata:Rakennukset_alue_rekisteritiedot carries `i_kerrlkm` ' +
      '(floor count) and NO height attribute (DescribeFeatureType, 49 fields; a 0.007° bbox → 537 features, i_kerrlkm ' +
      'often null) — a DERIVED-LEVELS channel at best, capital-only, and not a `measured-lidar` stamp. No join is wired.',
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
      'is UNKNOWN (owed ELVIS index probe). Until the stamp lands every AU state is mass-only. ' +
      '⚠ RE-PROBED 2026-09-05 (lane HEIGHTS-AU, heights/auOpenHeights.mjs AU_OPEN_HEIGHTS_ASSESSED carries each verbatim): ' +
      'ELVIS is an HTML bulk portal (HTTP 200 text/html, 13,250 B) with NO keyless raster endpoint — nothing to sample, so ' +
      'no DSM−DTM derive is attempted; ACTGOV_BUILDING_FOOTPRINTS has NO height field (fields listed there) and the ACT org ' +
      'serves only lidar_extent_2016; NSW portal = DEM theme + an elevation INDEX; Vicmap statewide building layers carry no ' +
      'height; services.ga.gov.au → HTTP 403. The ONE real channel found is City of Melbourne\'s LoD1 footprints → ' +
      '`au_open_lod1` (victoria row). Every other AU state stays here, mass-only, on evidence.',
  },
  au_open_lod1: {
    country: 'au', name: 'City of Melbourne 2023 Building Footprints — LoD1 roof-component stack (Opendatasoft, CC BY 4.0)', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (per-component AHD elevations, photogrammetric 3D model)', lodNext: 'LoD2 (City of Melbourne 2018 3D textured mesh, CC BY — bulk)',
    endpoint: 'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2023-building-footprints/exports/geojson?where=in_bbox(geo_point_2d,lat1,lon1,lat2,lon2)',
    heightField: 'max(footprint_max_elevation) − min(structure_min_elevation) over the components whose centroid the OSM footprint contains ' +
      '(= max structure_extrusion; Eureka 815210 → 297.5 m), fallback: the component containing the OSM centroid',
    coverage: 'partial', // the City of Melbourne LGA only (144.898–144.991 E, −37.851–−37.776 S); the rest of Victoria is mass-only
    keyless: true, // anonymous Explore API — NO api key, NO repo secret; X-RateLimit-Limit 10000/day per IP (probed).
    note: 'LIVE-PROBED 2026-09-05 (lane HEIGHTS-AU): dataset meta license "CC BY" (4.0 legalcode URL); 41,701 records ' +
      '(40,951 Structure — the rest are bridges/jetties/tram stops/platforms, excluded). /records pages ≤100 and refuses ' +
      'offset+limit > 10,000 (HTTP 400, verbatim in heights/auOpenHeights.mjs) — a whole-city page-through is IMPOSSIBLE there ' +
      '(§BDTOPO-CAP-TRUNCATE); /exports/geojson is UNCAPPED (a 0.01° CBD cell → 2,059 features, 1.66 MB, 3.4 s), so the ' +
      'stamp `stampAuOpenHeightsOnGeojsonseq` cell-splits per populated 0.01° cell. It is a bake STAMP over bake\'s own ' +
      'OSM footprints, NOT a footprint fetcher — the `victoria` row must declare heightJoin:\'au_open\' (bake.mjs dispatch + ' +
      'stampBboxesFor → AU_OPEN_CITY_BBOXES) to receive it. ⚠ in_bbox is LAT,LON (ODSQL); the swapped order returns an ' +
      'EMPTY collection, not an error — pinned by auOpenHeights.spec.ts.',
  },
  ca_open_elem: {
    country: 'ca', name: 'City of Vancouver 2009 LiDAR footprints + City of Toronto Building Outline DERIVED_HEIGHT — open element stacks', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (per-element top/base; Vancouver LiDAR-derived, Toronto authority-measured)',
    lodNext: 'Montréal 1 m MNS (CC BY 4.0) once a keyless raster door exists, and a province-wide nDSM anywhere in Canada',
    endpoint: 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/building-footprints-2009/exports/geojson?where=in_bbox(geo_point_2d,lat1,lon1,lat2,lon2) '
      + '· https://gis.toronto.ca/arcgis/rest/services/cot_geospatial3/MapServer/2/query?geometry={xmin,ymin,xmax,ymax}&f=geojson',
    heightField: 'max(top) − min(base) over the ELEMENTS whose centroid the OSM footprint contains — Vancouver topelev_m/baseelev_m, '
      + 'Toronto ELEVATION + DERIVED_HEIGHT; fallback the elements containing the OSM centroid. ⚠ The per-BUILDING aggregates '
      + '(Vancouver maxht_m/minht_m/avght_m) are parsed and DELIBERATELY unused: bldgid 145738 has element hgt_agl 21.88 m under '
      + 'maxht_m 143.12 m, so the aggregate would draw a 143 m podium.',
    coverage: 'partial', // the City of Vancouver + a Toronto core working set; the rest of BC/Ontario and all other provinces are mass-only
    keyless: true, // anonymous Opendatasoft export + the City of Toronto's own anonymous ArcGIS — NO key, NO repo secret.
    note: 'LIVE-PROBED 2026-09-06 (lane MEXICO-CANADA): Vancouver dataset meta HTTP 200, 6,065 B — 124,181 records, licence '
      + '"Open Government Licence - Vancouver"; export over a downtown cell HTTP 200, 28,342 B, 41 features, 0.57 s. Toronto layer meta '
      + 'HTTP 200 — Feature Layer, maxRecordCount 2000, fields include ELEVATION:Single + DERIVED_HEIGHT:Single; query HTTP 200, 41,568 B, '
      + '49 features, 0.67 s with real metres (112.36 / 173.41 / 116.9 / 15.26 m downtown). ⛔ Toronto TRUNCATES and says so: a 0.04° box '
      + 'returned 2000 features + "exceededTransferLimit": true against returnCountOnly {"count":18358} — caOpenIsTruncated() makes that a '
      + 'tile ERROR, never a partial success. It is a bake STAMP over the bake OSM footprints, NOT a footprint fetcher — the '
      + '`britishcolumbia` / `ontario` rows must declare heightJoin ca_open (bake.mjs NATIONAL_STAMP_TABLE + stampBboxesFor → '
      + 'CA_OPEN_CITY_BBOXES filtered to the province of that row) to receive it. Decisions pinned by caOpenHeights.spec.ts.',
  },
  plateau_jp: {
    country: 'jp', name: 'MLIT Project PLATEAU 3D都市モデル — LoD1 building model, bldg:measuredHeight (G空間情報センター)', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height (per-building LiDAR point-cloud median — uro:lod1HeightType 点群から取得_中央値)',
    lodNext: 'LoD2 roof form — 206 municipalities publish a LoD2 tileset; nothing in the bake consumes roof geometry yet',
    endpoint: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/<per-year>/download/mlit_plateau_3d_<year>.json '
      + '→ per-municipality https://assets.cms.plateau.reearth.io/assets/<id>/<city>_bldg_3dtiles_…_lod1/tileset.json → data/*.b3dm (RANGE GET of the attribute prefix)',
    heightField: 'bldg:measuredHeight (metres) read from the b3dm BATCH TABLE; area-weighted P90 over the PLATEAU buildings whose _x/_y centroid the OSM footprint '
      + 'contains, reverse fallback = the smallest _xmin.._ymax box containing the OSM centroid',
    coverage: 'partial', // 439 distinct municipalities have PLATEAU data at all; the WIRED working set is JP_CITY_BBOXES (ten cities → 38 covering municipalities)
    keyless: true, // no account, no subscription key, no repo secret. ⛔ The OTHER JP door IS gated: reinfolib ex-api keyless → HTTP 401 "missing subscription key".
    note: 'LIVE-PROBED 2026-09-06 (lane JAPAN-FULL): CKAN package_search q=plateau → HTTP 200 application/json 212,606 B, count 495; all six per-year index JSONs '
      + 'HTTP 200 (2020 497,273 B · 2021 13,641 B · 2022 478,854 B · 2023 1,019,901 B · 2024 757,358 B · 2025 1,049,768 B) = 474 municipality rows, 439 distinct '
      + 'city codes, 305 with a textured LoD1 tileset. Chiyoda LoD1 tileset.json HTTP 200 14,778 B declares bldg:measuredHeight {minimum 0.8, maximum 209.5} AND '
      + 'per-feature _x/_y/_xmin.._zmax, so a RANGE GET of each b3dm attribute prefix yields a measured height WITH a position and the 2.11 GB per-ward CityGML zip '
      + '(real size read by range GET; the index sizeinbytes field disagrees at 2,254,857,830 — read the server) is never touched. ⚠ THE BATCH-TABLE ENCODING IS NOT '
      + 'UNIFORM: data4.b3dm stores bldg:measuredHeight as a binary DOUBLE reference while leaf data0.b3dm stores the SAME key as a JSON array — both branches are '
      + 'pinned by real bytes (jpPlateau.spec.ts), and a reader that assumes one ships zero heights on half the tiles while looking identical to "no data". '
      + '⛔ 4.0 % of Chiyoda buildings carry uro:lod1HeightType 取得不可のため一律値（3m） ("could not acquire — uniform 3 m") with a NULL height: REFUSED BY NAME '
      + 'and counted, never stamped. ⛔ 台東区 (13106) ships 3D Tiles 1.1 .glb (EXT_structural_metadata) — 571 of 3,142 leaf tiles in the working set — and that '
      + 'reader is NOT built: a named refusal with a count, and the owed follow-up. It is a bake STAMP over the bake OSM footprints, NOT a footprint fetcher — the '
      + '`japan` row must declare heightJoin plateau_jp (bake.mjs NATIONAL_STAMP_TABLE + stampBboxesFor → JP_CITY_BBOXES) to receive it. MEASURED end-to-end against '
      + 'live Overpass footprints over Kanda/Akihabara: 1,711 of 4,178 footprints stamped (41.0 %), 93.8 % of PLATEAU rows landed inside an OSM polygon, median '
      + '18.6 m, 46 MB in 26.9 s, 0 tile errors. Licence 公共データ利用規約 第1.0版 (PDL 1.0), stated verbatim by MLIT to be CC BY 4.0 COMPATIBLE; attribution '
      + '出典：国土交通省 PLATEAU required, copyright in each city model rests with the LOCAL GOVERNMENT, and 測量法 constrains public-survey results.',
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
  // ⭐ Those six are now CONFIG (heights/nl3dbag.mjs NL_3DBAG_CITY_BBOXES, pinned byte-equal to terrain.mjs's nl rows).
  netherlands: '3dbag', // ⭐ WIRED 2026-09-05 (lane HEIGHTS-NL): the bake `netherlands` row declares heightJoin:'3dbag' → heights/nl3dbagStamp.mjs stampNl3dbagHeightsOnGeojsonseq (keyless WFS BAG3D:lod12, (70p ?? 50p) − maaiveld, CC BY 4.0), working set NL_3DBAG_CITY_BBOXES; local proof 40/41 measured in the Centraal cell, 0 errors. The `items` fetcher below stays the CITY path for resolveHeights; the national row no longer depends on it.
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
  // ⭐ WIRED 2026-09-05 (lane HEIGHTS-US) — newyork / sanfrancisco (and boston, below) were the FIRST US rows with a
  // REAL measured-height channel: NYC height_roof (feet, as-built/photogrammetric) and SF LiDAR hgt_maxcm.
  // ⭐ MOVED TO `usas_national` 2026-09-06 (lane USA-HEIGHTS-NATIONAL) — and NOTHING MEASURED IS LOST. The two
  // CITY channels are still read, from the same adapters, because the national stamp resolves the city channel
  // FIRST per FOOTPRINT (usOpenChannelForPoint). What changes is everything OUTSIDE those two metro boxes: while
  // these rows said `us_open_heights` they declared a height join that could only ever reach Manhattan and San
  // Francisco, so Buffalo, Rochester, Fresno, Sacramento and Los Angeles rendered the fabricated 9 m carpet
  // inside a state that CLAIMED measured heights — the §MDS-NATIONAL-SWEEP / Ciudad Real defect (L-12946).
  // Count-probed non-zero before the move, 2026-09-06, HTTP 200 each: Buffalo NY 8,837 · Fresno CA 13,046 ·
  // Sacramento CA 8,631. ⚠ Rochester NY answered {"count":0} — a real SOURCE hole in the national layer, named
  // here rather than smoothed over, and deliberately not a gate row.
  newyork: 'usas_national', california: 'usas_national',
  // NO / SE / PT
  oslo: 'ndh_no', stockholm: 'lidar_se', lisbon: 'dgt_pt', porto: 'dgt_pt',
  // IT — Turin has a source; Rome/Milan do not.
  milan: { source: 'piedmont_it', status: 'no-source', reason: 'Lombardy building-height layer unconfirmed — no source for Milan' },
  rome: { source: 'piedmont_it', status: 'no-source', reason: 'Lazio building-height layer unconfirmed — no source for Rome' },
  // BE — Brussels is UrbIS, height unknown.
  // ⭐ RE-PROBED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE): UrbisAdm:Bu carries NO height (probed) — but the DHMV II RASTER covers
  // Brussels-Capital (Grand-Place DSM p90 46.6 m over DTM 21.4 m, 0 nodata), so Brussels is a BE_CITY_BBOXES working-set city of
  // the `belgium` row's be_dhmv stamp. This city key is informational only — the brussels bake row folded into `belgium` on 2026-09-02.
  brussels: 'grb_be',
  // SA — geo-fenced. RE-PROBED 2026-09-05 (lane ME-TERRAIN-PARCELS, curl -m 15): umaps.momah.gov.sa
  // /server/rest/services?f=json → 200 (folders Hosted/umaps/Utilities, services []); /umaps and
  // /umaps/Buildings/MapServer → {"error":{"code":499,"message":"Token Required"}}; every GASGI host
  // (www./geoportal./portal./ngp./nsdi.gasgi.gov.sa, saudinsdi.gov.sa) NXDOMAIN; open.data.gov.sa
  // TCP timeout. Still NO open building-height channel — the row keeps honest assumed heights.
  riyadh: 'ml_sa', jeddah: 'ml_sa',
  // GB / FI — not in LOD-RATE-MASTER (no national open height source wired).
  london: { source: null, status: 'no-source', reason: 'OS Building Heights is licensed; GB not in LOD-RATE-MASTER' },
  helsinki: { source: null, status: 'no-source', reason: 'FI not in LOD-RATE-MASTER (Helsinki has open LoD2 — candidate to add)' },
  // ───────────────────────────────────────────────────────────────────────────
  // §EUROPE-NATIONAL (2026-09-02, lane REGIONS) — one row per new bake.mjs whole-country region
  // (§BAKE-EUROPE-NATIONAL), citing context-everywhere-assessment.md §2. NONE of these is
  // impl:'live', so resolveHeights() logs the honest channel/gap and the region keeps OSM
  // `assumed` defaults — never a fabricated height, never an armed join without a wired stamp.
  estonia: 'eesti3d_ee',    // ⭐ WIRED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, §EE-ETAK-OSM-JOIN): the bake `estonia` row declares heightJoin:'ee_etak' → heights/eeHeightsStamp.mjs (ETAK korgus_m, keyless). Local proof Tallinn 594/607.
  lithuania: { source: null, status: 'no-source', reason: 'per-object floors is a PRICED RC product (X3-refused); LiDAR agreement-gated — mass-only (ASSESS LT)' },
  latvia: { source: null, status: 'no-source', reason: 'VZD footprints open but floor/height attr presence UNVERIFIED (one attr probe owed) — UNKNOWN stays UNKNOWN (ASSESS LV)' },
  poland: 'bdot10k_pl',     // ⛔ NO measured join 2026-09-05: GUGiK NMT DTM WCS is live, the NMPT DSM WCS times out / serves 8-bit RGB (see bdot10k_pl note) — mass-only on evidence.
  luxembourg: { source: null, status: 'no-source', reason: 'ACT PCN footprints CC0; national LiDAR 2019 reported NOT verified — no height channel today (ASSESS LU)' },
  sweden: 'lidar_se',
  finland: 'buildings3d_fi',
  norway: 'ndh_no',    // ⭐ WIRED 2026-09-05 (lane HEIGHTS-NORDICS, §NDH-NO-OSM-JOIN): the bake `norway` row declares heightJoin:'ndh_no' → NATIONAL_STAMP_TABLE → stampNoNdhHeightsOnGeojsonseq (heights/noHeightsStamp.mjs), working set NO_NDH_CITY_BBOXES (oslo/bergen/trondheim). Keyless Kartverket NHM DOM − DTM.
  germany: 'lod2de',   // ⭐ WIRED 2026-09-05 (lane HEIGHTS-DE-LAENDER, §DE-LOD2-LAENDER-OSM-JOIN): the bake `germany` row declares heightJoin:'lod2de' → NATIONAL_STAMP_TABLE → stampDeLod2LaenderHeightsOnGeojsonseq (heights/deLod2LaenderStamp.mjs; router table + working set DE_LOD2_CITY_BBOXES in heights/deLod2Laender.mjs). Twelve keyless Land doors WIRED (nw bb hh sh th rp mv be st ni bw sn — one city each: koln berlin hamburg potsdam kiel erfurt mainz schwerin magdeburg hannover stuttgart dresden; NI via the S3-listed LGLN bucket, its geojson index's hrefs being stale → NoSuchKey; BW via an ODD-easting 2 km grid read off the portal's own 2x2Gitter MVT, kind zip-multi — its zip is a FOLDER of four 1 km quarters; ⭐ SN joined on a THIRD pass — the two earlier passes read its 503 as an outage when it is what that Nextcloud answers for a ROTATED share token, so the token is now READ per run off geodaten.sachsen.de/batch-download-4719.html, never pinned); he BLOCKED (gds.hessen.de Downloadcenter is registration-gated and the keyless gds-srv free WMS carries none of LoD2/3D across its 46 layers), sl UNPROBED (its catalogue search is client-side and never ran — UNKNOWN, not empty), hb PROBED-OPEN-UNSUPPORTED (⭐ Bremen IS open and keyless and its b3dm batch table carries measuredHeight/roofType per building — it is 3D Tiles, not CityGML, so wiring it is a new door KIND, not a table row), by probed OPEN (CC BY 4.0) but UNARMED — munich's `blocked` reason below is stale. Local proof potsdam 1,832/2,012 · hamburg 636/729 · berlin 376/424 · hannover 658/722 · stuttgart 28,734/35,180 over 12 tiles · dresden 9,175/10,800 from 58,032 parts over 16 tiles, 0 tile errors (footprints read from the LIVE published buildings.pmtiles). The koln city row (heightJoin:'lod2nrw') stays until the orchestrator folds it.
  france: 'mnh_fr',    // ⭐ LIVE 2026-09-04 — national MNH stamp BUILT (stampMnhFrHeightsOnGeojsonseq, working set MNH_FR_CITY_BBOXES). ⭐ WIRED 2026-09-05 (L-12910): the bake `france` row declares heightJoin:'mnh_fr'; local proof Marseille 6,578/7,887 · Paris 4,717/5,043 · Lyon 4,442/4,883 measured. The paris/lyon city rows still fold into `france` once a publish passes allow_region_removal (orchestrator).
  italy: { source: 'piedmont_it', status: 'no-source', reason: 'Piedmont-only regional layer — NO national height product; EUBUCCO/GBA ML heights excluded as authoritative (E5 §A.5) (ASSESS IT)' },
  greatbritain: 'ealidar_gb', // ⭐ WIRED 2026-09-05 (lane HEIGHTS-GB-IE): the bake `greatbritain` row declares heightJoin:'ealidar_gb' → heights/ealidarGbStamp.mjs (EA First-Return DSM − DTM, differenced by PRYZM, England working set EA_LIDAR_GB_CITY_BBOXES). Local proof Trafalgar Square 594/606 footprints measured, 2 squares, 4.6 s.
  ireland: { source: null, status: 'no-source', reason: 'no cadastre by design; OSi Prime2 commercial → X3-refused. PROBED 2026-09-05 (lane HEIGHTS-GB-IE): data.gov.ie "Open Topographic Lidar Data" (GSI) exposes 9 ArcGIS ImageServers at gsi.geodata.gov.ie/imagehost/rest/services/Lidar — EVERY one is a hillshade (pixelType U8 0–255, identify → "38", "This data shows the hillshade of the DSM/DTM"), not elevation; the elevation GeoTIFFs are only behind the dcenr.maps.arcgis.com webappviewer bulk download (no bbox-addressable WCS/REST). No other DSM/DTM/elevation dataset on data.gov.ie (7 hits, all OPW flood-depth GeoTIFFs or marine bathymetry). NO open measured-height channel → no join wired.' },
  switzerland: 'swissbuildings3d', // ⭐ LIVE 2026-09-04 — national STAC→COG stamp BUILT (stampSwissHeightsOnGeojsonseq, working set SWISS_CITY_BBOXES). ⭐ WIRED 2026-09-05: the bake `switzerland` row declares heightJoin:'swiss' (§SWISS-OSM-JOIN). L-12883.
  austria: 'geoland_at',   // ⭐ WIRED 2026-09-05 (lane HEIGHTS-AT-CZ-SI, §BEV-ALS-OSM-JOIN): the `austria` row declares heightJoin:'bev_at' — BEV ALS DSM − DTM 1 m COGs (keyless, CC BY 4.0, HTTP-range windows; heights/atHeightsStamp.mjs), working set AT_CITY_BBOXES. Local proof Stephansplatz: 81/163 Baukörpermodell parts measured, max 99.8 m vs the 136.1 m tower kote (P90 massing). The `geoland_at` note above still says "documented" for the GWR half only.
  czechia: 'ruian_cz',   // ⭐ WIRED 2026-09-05 (lane HEIGHTS-AT-CZ-SI, §CUZK-NDSM-OSM-JOIN): the `czechia` row declares heightJoin:'cuzk_cz' — ČÚZK DMP 1G − DMR 5G ImageServer exportImage (keyless, F32, EPSG:4326; heights/czHeightsStamp.mjs), working set CZ_CITY_BBOXES. Local proof Prague Old Town: 316/321 real OSM footprints measured, median 20.3 m, 7.1 s. RÚIAN floors stay derived-levels and are NOT stamped.
  portugal: 'dgt_pt',       // ⛔ NO-SOURCE 2026-09-05: DGT WCS disabled, Lisbon Edificado has no height field, Porto CKAN has nothing (see dgt_pt note) — mass-only on evidence.
  belgium: 'grb_be',        // ⭐ WIRED 2026-09-05 (lane HEIGHTS-EE-PL-PT-BE, §BE-DHMV-OSM-JOIN): the bake `belgium` row declares heightJoin:'be_dhmv' → heights/beHeightsStamp.mjs (DHMV II DSM − DTM, keyless). Local proof Antwerp 800/819.
  croatia: { source: null, status: 'no-source', reason: 'no national open height product; LiDAR partial (L5 HR / ASSESS HR)' },
  slovenia: 'gurs_si',   // ⭐ WIRED 2026-09-05 (lane HEIGHTS-AT-CZ-SI, §GURS-KN-OSM-JOIN): the `slovenia` row declares heightJoin:'gurs_si' — GURS KN STAVBE H2 − H3 register heights on ipi.eprostor.gov.si (keyless WFS, CC BY 4.0; heights/siHeightsStamp.mjs), working set SI_CITY_BBOXES. Written as `tagged` (NO measured-lidar marker — the register's own accuracy code is "unknown method" for 96 %). Local proof Ljubljana: 348/532 real OSM footprints matched, median 17.9 m.
  greece: { source: null, status: 'no-source', reason: 'no national footprint+height product confirmed (L5 GR / ASSESS GR)' },
  hungary: { source: null, status: 'no-source', reason: 'Lechner cadastral geometry is PAID → X3-refused; no open height channel — the fee gate binds the cadastre, NOT OSM context (ASSESS HU)' },
  romania: { source: null, status: 'no-source', reason: 'ANCPI Constructii is nationally INCOMPLETE (queryable ≠ complete) and carries no open height — mass-only (ASSESS RO)' },
  slovakia: { source: null, status: 'no-source', reason: 'ZBGIS buildings exist; DMR 5.0 LiDAR reported open — NOT verified this pass (ASSESS SK)' },
  bulgaria: { source: null, status: 'no-source', reason: 'KAIS cadastre bulk is PAID / no open bulk — context rides OSM (ASSESS BG)' },
  // §EU-EVERY-COUNTRY (2026-09-06, lane EU-EVERY-COUNTRY) — the 17 new bake.mjs europe context rows.
  // ⚠ EVERY ONE OF THESE IS `UNPROBED`, NOT `no open source`, AND THE DIFFERENCE IS THE WHOLE POINT.
  // This lane's brief was context COVERAGE (extract + terrain + villages); it did not probe a single
  // national height service for any of these countries, so writing "no open height product exists"
  // here would be a claim nobody measured — the exact failure-vs-empty conflation L-422/L-457 and the
  // Latvia row ("VZD footprint attrs UNVERIFIED — UNKNOWN stays UNKNOWN, not zero") exist to refuse.
  // The bake behaviour is identical either way: no row below declares a heightJoin, so resolveHeights()
  // logs the honest reason and every footprint keeps its OSM tags (`assumed` where OSM carries none) —
  // the `netherlands`/`newzealand` precedent. What these rows buy is that the OWED WORK IS NAMED: a
  // heights lane picking Europe up next reads "UNPROBED" and probes, instead of reading a fabricated
  // refusal and skipping the country. Replace a row the moment a real probe lands, with its URL/HTTP/bytes.
  iceland: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY (context-coverage scope). Landmælingar Íslands publishes an open national DEM (ÍslandsDEM) — whether any keyless DSM/nDSM or per-building height exists was NOT tested. UNKNOWN, not empty' },
  faroeislands: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Umhvørvisstovan/Kortal is the national geoportal; no keyless height channel tested. UNKNOWN, not empty' },
  malta: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. The Planning Authority publishes LiDAR under EU-funded programmes; no keyless raster or per-building height tested. UNKNOWN, not empty' },
  cyprus: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. DLS (Department of Lands and Surveys) INSPIRE services untested; note the bake bbox covers the WHOLE island incl. the north, where no single authority publishes. UNKNOWN, not empty' },
  serbia: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. RGZ (Republički geodetski zavod) GeoSrbija runs an open portal; no keyless DSM/DTM or building-height attribute tested. UNKNOWN, not empty' },
  bosniaherzegovina: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Cadastre is ENTITY-level (FBiH / RS / Brčko), so any probe is at least three probes — none run. UNKNOWN, not empty' },
  montenegro: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Uprava za katastar i državnu imovinu; no keyless height channel tested. UNKNOWN, not empty' },
  northmacedonia: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. AKN (Agencija za katastar na nedviznosti); no keyless height channel tested. UNKNOWN, not empty' },
  albania: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. ASIG (Autoriteti Shtetëror për Informacionin Gjeohapësinor) runs the national SDI; no keyless height channel tested. UNKNOWN, not empty' },
  kosovo: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. AKK (Agjencia Kadastrale e Kosovës) geoportal untested. UNKNOWN, not empty' },
  ukraine: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. StateGeoCadastre + Diia open data; wartime availability of any service is itself unmeasured, so a "blocked" verdict would be as unfounded as an "open" one. UNKNOWN, not empty' },
  belarus: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Also carries a SANCTIONS question that belongs to the founder, not to a bake lane — recorded so it is not rediscovered as a surprise. UNKNOWN, not empty' },
  moldova: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Agenția Relații Funciare și Cadastru / geoportal.md untested. UNKNOWN, not empty' },
  andorra: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Govern d\'Andorra SIG untested. ⚠ Spain\'s MDS raster does NOT extend here — Andorra is a sovereign state outside the CNIG grid, so `mds_edificacion` must never be pointed at it' },
  liechtenstein: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. LI publishes geodata.llv.li. ⚠ swissSURFACE3D (the `swiss` join) STOPS at the Swiss border — Vaduz measured OUTSIDE switzerland.poly — so the CH stamp must never be extended over this row without its own probe' },
  channelislands: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. Jersey and Guernsey are separate Crown-dependency SDIs sharing ONE Geofabrik extract; ⚠ the EA LiDAR `ealidar_gb` join is ENGLAND-only and does not reach them' },
  isleofman: { source: null, status: 'no-source', reason: 'UNPROBED by lane EU-EVERY-COUNTRY. ⚠ Same warning as channelislands: `ealidar_gb` is ENGLAND-only. The Isle of Man is a Crown dependency with its own government GIS, untested' },
  // ───────────────────────────────────────────────────────────────────────────
  // §INTL (2026-09-03, lane CONTEXT-INTL) — US metros, AU states, AE metros. Citations:
  // audit/geo-expansion/2026-09-02/{au-sweep,me-sweep}.md. NONE impl:'live'; NO bake row declares a
  // heightJoin, so resolveHeights() logs the honest per-region reason and the region keeps OSM `assumed`
  // defaults — never a fabricated height, never an armed join without a wired stamp.
  // US metros — Overture height + USGS 3DEP nDSM (overture_us, documented); the per-metro OPEN channels
  // the owed 3DEP stamp draws on: NYC open building heights, Chicago open footprints, Boston MassGIS.
  // ⭐ boston WIRED 2026-09-05 (lane HEIGHTS-US) → BPDA "Boston Buildings with Roof Breaks" BLDG_HGT_2010 (feet), NOT
  // MassGIS (STRUCTURES_POLY has no height field — probed). chicago stays overture_us on evidence: syp8-uezg carries
  // `stories` only (a derived-levels rung, not a measured height); austin/houston have no open channel named.
  // ⭐ §BAKE-US-STATES (2026-09-06, lane USA-ALL-STATES) — the six metro keys became 54 whole-STATE keys.
  // `massachusetts` inherits boston's WIRED BPDA channel and `california` (above, beside newyork) inherits
  // sanfrancisco's DataSF LiDAR channel — the working set (US_OPEN_CITY_BBOXES) is byte-identical, only the
  // ROW moved. ⭐ SUPERSEDED THE SAME DAY by §USAS-NATIONAL-HEIGHTS (lane USA-HEIGHTS-NATIONAL). The
  // sentence that stood here — "Every other state is `overture_us` (impl:'documented'): honest OSM
  // `assumed` defaults until the USGS 3DEP nDSM stamp lands" — is no longer true, and its PREMISE was
  // wrong besides: THERE IS NO NATIONAL 3DEP nDSM TO WAIT FOR. elevation.nationalmap.gov serves exactly
  // ONE service, whose own description says "Bare Earth DEM" (identify at the Empire State Building
  // returns 15.09 m — the GROUND under a 443 m tower), and the only DSM in the entire National Map
  // catalogue is Alaska IFSAR, which answers {"total": 0, "items": []} over CONUS. What DOES exist is
  // FEMA/ORNL "USA Structures" — ONE keyless CC-BY-4.0 layer with a per-building HEIGHT in metres over
  // 135,321,228 structures — so **52** state/territory rows now carry `usas_national` (heightJoin:'usas'),
  // not a documented placeholder. ⚠ THAT NUMBER WAS 49 FOR ABOUT AN HOUR, and the missing three were the
  // ONLY ones that already claimed a measured height: newyork / california / massachusetts sat on
  // `us_open_heights`, a join whose reach is three metro boxes. Leaving them there would have shipped the
  // worst version of this defect — a state that CLAIMS measured heights and delivers them to one city.
  // The two rows that are still NOT on it are MEASURED-ZERO at the source, not unprobed: alaskaaleutians
  // (87 structures, all ORNL, 0 heights) and usvirginislands (40,726, all ORNL, 0 heights). ⛔ Do NOT read
  // `overture_us` on those two as "unprobed" — read it as "probed, and the national layer measures nothing
  // there". §MEASURED-HEIGHT-GATE would exit 4 if either declared the join.
  massachusetts: 'usas_national',
  alabama: 'usas_national', alaska: 'usas_national', alaskaaleutians: 'overture_us', arizona: 'usas_national',
  arkansas: 'usas_national', colorado: 'usas_national', connecticut: 'usas_national', delaware: 'usas_national',
  districtofcolumbia: 'usas_national', florida: 'usas_national', georgia: 'usas_national', hawaii: 'usas_national',
  idaho: 'usas_national', illinois: 'usas_national', indiana: 'usas_national', iowa: 'usas_national',
  kansas: 'usas_national', kentucky: 'usas_national', louisiana: 'usas_national', maine: 'usas_national',
  maryland: 'usas_national', michigan: 'usas_national', minnesota: 'usas_national', mississippi: 'usas_national',
  missouri: 'usas_national', montana: 'usas_national', nebraska: 'usas_national', nevada: 'usas_national',
  newhampshire: 'usas_national', newjersey: 'usas_national', newmexico: 'usas_national', northcarolina: 'usas_national',
  northdakota: 'usas_national', ohio: 'usas_national', oklahoma: 'usas_national', oregon: 'usas_national',
  pennsylvania: 'usas_national', puertoricousa: 'usas_national', rhodeisland: 'usas_national', southcarolina: 'usas_national',
  southdakota: 'usas_national', tennessee: 'usas_national', texas: 'usas_national', usvirginislands: 'overture_us',
  utah: 'usas_national', vermont: 'usas_national', virginia: 'usas_national', washington: 'usas_national',
  westvirginia: 'usas_national', wisconsin: 'usas_national', wyoming: 'usas_national',
  // ── CA + MX — §NA-HEIGHTS (2026-09-06, lane MEXICO-CANADA). Two provinces have a REAL measured
  // channel; every other row here is an object because THE REASON IS THE FINDING and a bare string
  // would hide a probed refusal behind a source note that does not exist.
  // ⭐ LIVE — the bake rows declare heightJoin ca_open (NATIONAL_STAMP_TABLE → stampCaOpenHeightsOnGeojsonseq,
  // working set CA_OPEN_CITY_BBOXES filtered per province). City-scoped: every BC/Ontario footprint
  // outside those bboxes streams through with its honest OSM tags.
  britishcolumbia: 'ca_open_elem',
  ontario: 'ca_open_elem',
  // ⚠ QUEBEC IS THE ONE THAT HURTS, and it is WIRABLE-BUT-UNWIRED, not absent. Montréal publishes a
  // REAL 1 m LiDAR MNS and CityGML LOD2 under CC BY 4.0 (donnees.montreal.ca CKAN, HTTP 200) — but as
  // 32 per-borough GeoTIFF ZIPs (mnsterrainbatiment_2015_1m_<borough>.zip) and city-wide SHP/GPKG
  // ZIPs, with no keyless WCS/COG to range-read. That is the ELVIS refusal shape: a bulk portal is not
  // a raster API, so no DSM−DTM derive is attempted and the row bakes honest OSM `assumed`.
  quebec: { source: null, status: 'no-source', reason: 'Montréal MNS 1 m + CityGML LOD2 are OPEN (CC BY 4.0) but published as per-borough GeoTIFF ZIPs and city-wide SHP/GPKG ZIPs only — no keyless WCS/COG/query endpoint to sample (PROBED 2026-09-06, donnees.montreal.ca package_show HTTP 200). The owed build is a Montréal DSM−DTM stamp once a raster door exists; see heights/caOpenHeights.mjs CA_OPEN_HEIGHTS_ASSESSED.' },
  // The remaining ten provinces/territories: no keyless height-bearing building service was found on
  // 2026-09-06. Recorded as an honest gap, so a future lane must overwrite a PROBED verdict, not a blank.
  alberta: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Alberta on 2026-09-06 (the province has no open parcel/building fabric; AltaLIS is commercial). Bakes honest OSM `assumed`.' },
  saskatchewan: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Saskatchewan on 2026-09-06. Bakes honest OSM `assumed`.' },
  manitoba: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Manitoba on 2026-09-06. Bakes honest OSM `assumed`.' },
  newbrunswick: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for New Brunswick on 2026-09-06. Bakes honest OSM `assumed`.' },
  novascotia: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Nova Scotia on 2026-09-06. Bakes honest OSM `assumed`.' },
  princeedwardisland: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Prince Edward Island on 2026-09-06. Bakes honest OSM `assumed`.' },
  newfoundland: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Newfoundland and Labrador on 2026-09-06. Bakes honest OSM `assumed`.' },
  yukon: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Yukon on 2026-09-06. Bakes honest OSM `assumed`.' },
  northwestterritories: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for the Northwest Territories on 2026-09-06. Bakes honest OSM `assumed`.' },
  nunavut: { source: null, status: 'no-source', reason: 'no keyless open height-bearing building service probed for Nunavut on 2026-09-06. Bakes honest OSM `assumed`.' },
  // ⛔ MEXICO — a NAMED REFUSAL with the exact HTTP answer of every door tried on 2026-09-06, not a
  // quiet omission. INEGI: gaia.inegi.org.mx/NLB/wms, /NLB/mdm6/wms, /NLB/mdm6/wms.php and
  // /mdm6/rest/services all HTTP 404; www.inegi.org.mx/app/api/mapas/... HTTP 404;
  // mapasrest.inegi.org.mx curl exit 6 (NXDOMAIN). datos.gob.mx/busca/api/3/action/package_search
  // HTTP 403 "Access Denied" (424 B, an edge block). CDMX IS open and answers
  // (datos.cdmx.gob.mx CKAN HTTP 200) and publishes "Información Catastral de la Ciudad de México"
  // (CC-BY-4.0-ESP) — but its columns are codigo_postal · superficie_terreno · superficie_construccion ·
  // uso_construccion · clave_rango_nivel · anio_construccion · … · latitud · longitud: a POINT with a
  // CODED LEVEL RANGE ("RU" / "10" / "05"), not a polygon and not a floor COUNT. A coded range cannot
  // honestly become metres — not measured, not floors×N — so nothing is armed here. INEGI DOES publish
  // LiDAR-derived MDS/MDT for PART of the country as bulk per-sheet downloads; that is the owed build,
  // and its coverage is explicitly NOT national.
  mexico: { source: null, status: 'no-source', reason: 'MX has NO keyless height-bearing building service reachable as of 2026-09-06: every INEGI service path probed returned HTTP 404 (or NXDOMAIN), datos.gob.mx returned HTTP 403, and the one open channel that exists — CDMX Información Catastral (CC-BY-4.0-ESP, HTTP 200) — is point+attribute with a CODED level RANGE, not a polygon and not a floor count, so it cannot honestly yield metres. Bakes honest OSM `assumed`. Owed build: INEGI LiDAR MDS−MDT, coverage PARTIAL not national, currently bulk per-sheet download only.' },
  // AU states — ELVIS nDSM derive is the owed height build (elvis_au note carries the per-state nuance:
  // ACT's 64,674 open footprints, au-sweep §7.3; Melbourne's real LoD1 extrusions, §2.3). All plain
  // strings: a `documented` custom reason would be DEAD (resolveHeights re-derives it from the SOURCES
  // note), the §BAKED-FLAG-IS-NOT-EVIDENCE anti-pattern — object form is reserved for blocked/no-source,
  // where the reason IS surfaced.
  newsouthwales: 'elvis_au',
  // ⭐ LIVE 2026-09-05 (lane HEIGHTS-AU) — victoria is the FIRST AU state with a REAL measured-height channel:
  // City of Melbourne's LoD1 footprints (heights/auOpenHeights.mjs, `melbourne_cc`), a bake STAMP
  // (stampAuOpenHeightsOnGeojsonseq) the `victoria` row declares via heightJoin:'au_open'. LGA-scoped:
  // every Victorian footprint outside AU_OPEN_CITY_BBOXES streams through with its honest OSM tags.
  victoria: 'au_open_lod1',
  queensland: 'elvis_au',
  westernaustralia: 'elvis_au',
  southaustralia: 'elvis_au',
  tasmania: 'elvis_au',
  act: 'elvis_au',
  northernterritory: 'elvis_au',
  // NZ — §BAKE-NEWZEALAND (2026-09-05, lane NZ-EVERYWHERE). Object form because the reason IS the finding: LINZ 101290 "NZ Building Outlines" has no height field, and the LiDAR DSM−DEM derive that could give one sits behind the LINZ API key (every service 401 keyless) — so no stamp is wired and the row bakes honest OSM `assumed`.
  newzealand: { source: null, status: 'no-source', reason: 'LINZ Data Service layer 101290 "NZ Building Outlines" (3,236,141 features, CC BY 4.0, EPSG:2193; API record probed 2026-09-05) carries NO height field — its fields are building_id, name, use, suburb_locality, town_city, territorial_authority, capture_method, capture_source_group/id/name/from/to, last_modified, shape. LINZ publishes a national LiDAR 1 m DEM (121859) + DSM (122082), so a DSM−DEM nDSM stamp over OSM footprints is the owed build (the ELVIS/AU shape) — but every LINZ WFS/WMTS service is API-key gated (GetCapabilities keyless → HTTP 401 Jetty; layer 122082 lists 7 services, all under /services;key=), so there is NO keyless raster to sample and nothing is fabricated: honest OSM assumed heights (ASSESS NZ)' },
  // JP — ⭐ WIRED 2026-09-06 (lane JAPAN-FULL, §PLATEAU-JP-OSM-JOIN): the bake `japan` row declares
  // heightJoin:'plateau_jp' → NATIONAL_STAMP_TABLE → stampJpPlateauHeightsOnGeojsonseq
  // (heights/jpPlateauStamp.mjs; decisions in heights/jpPlateau.mjs), working set JP_CITY_BBOXES.
  // Japan may be the best-served country in the world for this: MLIT Project PLATEAU publishes an OPEN
  // LoD1 building model for 439 municipalities with a per-building LiDAR-median `bldg:measuredHeight`,
  // and — decisively — publishes it ALREADY CONVERTED to 3D Tiles at stable HTTPS URLs, so the height
  // and its position come out of a b3dm batch table by HTTP range GET instead of a 2.11 GB CityGML zip.
  // ⚠ WHAT THIS ROW DOES NOT SAY: it does NOT say Japan is finished. The join reaches JP_CITY_BBOXES
  // (ten cities), the .glb municipality 台東区 is refused by name, and 4.0 % of buildings carry
  // PLATEAU's own "could not measure" 3 m default and are skipped. Everywhere else in Japan bakes
  // honest OSM `assumed` heights — heightJoinCoverage.spec.ts is the register that pins that boundary.
  japan: 'plateau_jp',
  // AE metros — Overture footprints (Overture height ~0% in the Gulf, like Saudi). me-sweep §2/§3. RE-PROBED
  // 2026-09-05 (lane ME-TERRAIN-PARCELS, curl -m 15; then lane ME-ABUDHABI-I3S, curl -m 20) — the two emirates DIFFER:
  //   • Dubai: gis.dubai.gov.ae / geoportal.dm.gov.ae / opendata.dm.gov.ae / 3d.dm.gov.ae NXDOMAIN; www.dubaipulse.gov.ae
  //     (root, CKAN package_search?q=3d|building|DSM, /data/dm-3d), geodubai.dm.gov.ae, makani.ae → TCP timeout 20 s;
  //     gis.dm.gov.ae → 302 to the corporate site; gis.dubailand.gov.ae/arcgis → 404. arcgis.com search `Dubai
  //     type:"Scene Service" access:public` → 106 items, but every DM-adjacent one (aziad_smartdubai / ralouta_smartdubai
  //     Buildings_3D_Core / _Context on tiles.arcgis.com/2lzWODtLAfYXzk2g, item 1a0b2aaa… modified 2018-09) answers
  //     `layers/0` → 499 Token Required with licenseInfo null; the rest are vendor (globolive3d) or hobby uploads with no
  //     licence. Still NO open, licensed height channel for Dubai.
  //   • Abu Dhabi — LICENCE READ 2026-09-05 (lane ME-ABUDHABI-I3S; the full record is the heights/abudhabiNdsm.mjs
  //     header + the verbatim fixtures ae-adsdi-*-2026-09-05.json). The keyless I3S Hosted/abu_dhabi_3d_city_model
  //     (per-building MaxHeight, found by ME-TERRAIN-PARCELS) is an UNCATALOGUED portal item (licenseInfo null,
  //     accessInformation null, listed:false; absent from both SDI Data Catalogue lists, 670 / 704 entries). The SDI
  //     Terms and Conditions confer no licence by implication (§8.2) and forbid copying/downloading without DGE's written
  //     consent (§8.3); their reuse permission is SCOPED to catalogue-classified "Open Data" (download, use, integrate;
  //     credit the SDI Data Catalog). ⛔ The I3S stamp is therefore REFUSED and nothing is read from it. BUT the same
  //     catalogue classifies sid 2012 `50CM_AD_DSM_DTM` (DGE, "Satellite Imagery") as Open Data, and its rasters are
  //     served keylessly as F32 ImageServers (IMGSER_AUH_DSM3_50CM + IMGSER_AUH_DTM_50CM, 3857, 0.5 m, exportImage
  //     → 4326 GeoTIFF). That channel IS wired: heights/abudhabiNdsmStamp.mjs, NATIONAL_STAMP_TABLE `ad_ndsm`, working
  //     set AD_CITY_BBOXES (island core; ≈ 55 s per populated cell, measured). Local proof, gate cell 54.37–54.38 ×
  //     24.45–24.46 on the catalogued Open Data BUILDING footprints: 1,118/1,118 measured, median 12.0 m, max 74.2 m,
  //     57 s; floors 1/2/3/4 → 4.9/9.9/12.4/17.4 m (an independent cross-check). Photogrammetric (satellite stereo),
  //     NOT LiDAR — named in heightSource; the repo's single measured marker is written because the metre is measured.
  dubai: { source: null, status: 'no-source', reason: 'AE emirate data hosts vantage-blocked (TCP timeout on all Dubai Pulse / DM GIS hosts, me-sweep §2; RE-PROBED 2026-09-05 twice, unchanged; the smartdubai ArcGIS Online scene layers are 499 Token Required with no licence) — no open building-height channel — Overture footprints, honest assumed heights (ASSESS AE-Dubai). RE-PROBED A THIRD TIME 2026-09-06 (lane ME-ABUDHABI-I3S, curl -m 15): www.dubaipulse.gov.ae → HTTP 000 after 15.05 s · gis.dubai.gov.ae → HTTP 000 in 0.15 s (NXDOMAIN) · geodubai.dm.gov.ae/arcgis/rest/services?f=json → HTTP 000 after 15.05 s · control www.dm.gov.ae → HTTP 200 95,298 B in 1.11 s. Data tier fenced, corporate tier answers — unchanged. NEW NEGATIVE, recorded so nobody re-walks it: the UAE FEDERAL open-data portal bayanat.ae IS reachable from this vantage (HTTP 200, 479,348 B) but is a STATISTICS portal, not a geospatial one — its CKAN-shaped paths (/api/3/action/package_search, /en/api/…) 302 to HTML, and the site search returns tables only (search=building → 12 datasets, all counts: "New Building Permission — Ajman", "Federal buildings", "Non-Residential Buildings and Facilities"; search=3D / elevation / topographic → NO matching dataset title; search=GIS → federal court caseloads). Reachable ≠ useful: there is still no Dubai footprint geometry and no height field anywhere in it' },
  // ⭐ LIVENESS RE-VERIFIED 2026-09-06 (lane ME-ABUDHABI-I3S, curl -m 20): both wired ImageServers still answer
  // keylessly and IDENTICALLY — `.../agsimage/rest/services/ImageService/IMGSER_AUH_DSM3_50CM/ImageServer?f=json`
  // → HTTP 200 **4,408 B** and `.../IMGSER_AUH_DTM_50CM/ImageServer?f=json` → HTTP 200 **4,246 B**, byte-for-byte the
  // sizes of the committed fixtures ae-adsdi-imgser-auh-{dsm3,dtm}-50cm-imageserver-2026-09-05.json; pixelType F32,
  // maxValues 1168.7646484375 / 1168.6046142578. ⚠ The folder is `ImageService`, NOT `OpenData` — a probe against
  // `OpenData/IMGSER_AUH_DSM3_50CM` answers HTTP 200 with a 62 B `{"error":{"code":499,"message":"Token Required"}}`
  // body, which reads like a revoked channel and is really a wrong path (the 499-on-200 convention again).
  gccstates: 'adsdi_ndsm_ae', // ⭐ WIRED 2026-09-05 (lane ME-ABUDHABI-I3S, §ADSDI-NDSM-OVERTURE-JOIN): the bake `abudhabi` row declares heightJoin:'ad_ndsm' → NATIONAL_STAMP_TABLE → stampAdNdsmHeightsOnGeojsonseq (heights/abudhabiNdsmStamp.mjs; DGE 50 cm DSM3 − DTM, keyless, catalogued Open Data sid 2012), working set AD_CITY_BBOXES. Local proof gate cell 1,118/1,118 measured, median 12.0 m. The I3S abu_dhabi_3d_city_model stamp the brief named was REFUSED on the SDI Terms (uncatalogued item; §8.2/§8.3) — see the block above. §ME-NATIONAL 2026-09-06 RENAMED the bake row abudhabi → gccstates (the six GCC states are ONE Geofabrik extract and six country rectangles cut from it cannot be disjoint); the JOIN and its WORKING SET are byte-unchanged — stampBboxesFor still resolves ad_ndsm to AD_CITY_BBOXES, Abu Dhabi island only, so the same 50 cm DSM−DTM metres land on the same footprints. The rest of the peninsula streams through unstamped and honest.
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
  // cities under active close-out, and the omission was SILENT: this list USED TO BE both the
  // `priorityBboxes` (stamped first) AND the `retainBboxes` working set (bake.mjs stampBboxesFor →
  // §HEIGHT-STAMP-BUDGET, L-659). ⚠ The second half of that is NO LONGER TRUE — see
  // §MDS-LIST-IS-PRIORITY-ONLY below; the retain set is now the whole country (L-12946). At the time,
  // a city absent from it was not merely de-prioritised — its footprints streamed straight through
  // the join with their ORIGINAL OSM tags and could NEVER be stamped, so Murcia would have measured
  // ZERO heights after a re-bake while the bake reported a green §MEASURED-HEIGHT-GATE for `spain`.
  // Its own dossier named the gap ("confirm/add the per-city MDS join" — es-mc/30030-murcia/HEIGHT.md).
  // bbox = the canonical `terrain.mjs` REGIONS `murcia` row, NOT re-invented (0.14°×0.12°, well under
  // the 0.7° whole-country refusal guard in fetchSpainBuildingHeights).
  { city: 'murcia',    refcat: '30030', bbox: [-1.2007, 37.9322, -1.0607, 38.0522], baked: false }, // PHASE-4
];

// ─────────────────────────────────────────────────────────────────────────────
// §MDS-LIST-IS-PRIORITY-ONLY (L-12946, 2026-09-06, lane ES-WHOLE-COUNTRY-HEIGHTS)
//
// ⚠ READ THIS BEFORE TRUSTING THE PARAGRAPHS ABOVE. `MDS_CITY_BBOXES` is no longer the height join's
// RETAIN SET. It was, and that was the defect: the list was simultaneously the priority order and
// the only ground in Spain that could ever be measured, so Ciudad Real, Toledo, Alicante, Granada,
// Valladolid, Vigo, Gijón, A Coruña, Pamplona, Santander, Salamanca and every town and village were
// STRUCTURALLY unreachable — silently, because an unstamped footprint reports an honest `assumed`
// 9 m that is indistinguishable on the map from "the source has no data here". Founder, 2026-09-06,
// at Ciudad Real: "still a big Spanish city, but the buildings don't have real baked heights."
//
// `bake.mjs stampBboxesFor('mds')` now returns MDS_NATIONAL_BBOXES — the whole `spain` bbox — and
// the join bounds its HEAP with swathe passes instead of with a city list (heights/mdsNational.mjs
// §MDS-SWATHE). This list survives for TWO jobs, both real, neither of them "where heights exist":
//
//   1. PRIORITY ORDER for the height sweep. These nine are stamped FIRST and UNCAPPED, so a run
//      truncated by the wall-clock budget still helps the most users. Order is load-bearing.
//   2. The OFFICIAL-FOOTPRINT working set. `bake.mjs FOOTPRINT_SOURCES.es_catastro.defaultBboxes`
//      reads THIS list, and its cost is completely different in kind: Córdoba's municipality ZIP
//      alone inflates to 597 MB of GML and parses in ~250 s (§FOOTPRINT-BUDGET, L-12939). A row
//      added here therefore adds a Catastro municipality pull to every `--footprints official` run.
//
// That is why the two founder-named gate cities are in MDS_PRIORITY_EXTRA below and NOT in the list
// above: they must be stamped first (a CI gate now requires it), and they must NOT silently add
// ~8 minutes of Catastro GML parsing to the official-footprint path. Heights and footprints no
// longer have to cover the same ground, and they no longer do — but ONLY in the safe direction:
// the height sweep now reaches everywhere OSM has a footprint, which is a superset of the Catastro
// working set, never a subset. (§MDS-BBOX-MUST-COVER-THE-REGION is preserved and strengthened —
// mdsNational.spec.ts pins that the national retain bbox contains every row above.)
export const MDS_PRIORITY_EXTRA = [
  // §L-12946 — the founder's 2026-09-06 test city, and the second gate city beside it. Not metros;
  // listed because they are where the product was judged and where the CI gate now measures
  // (.github/workflows/context-bake.yml CITIES: `ciudadreal spain 38.9861,-3.9271` /
  // `toledo spain 39.8628,-4.0273`). The same reasoning as `sete` in MNH_FR_CITY_BBOXES.
  // bbox = a tight metro-core extent centred on the municipality centroid, ≈0.11°×0.09°, i.e. ONE
  // national tile each — the priority guarantee costs ~2 raster fetches, not a budget line.
  { city: 'ciudadreal', refcat: '13034', bbox: [-3.98, 38.94, -3.87, 39.03] },
  { city: 'toledo',     refcat: '45168', bbox: [-4.08, 39.82, -3.97, 39.91] },
];

/** The height sweep's PRIORITY ORDER: the nine metros first (unchanged order — a truncated run must
 *  still help the most users), then the founder-named gate cities. NOT a retain set, NOT the
 *  Catastro footprint working set. */
export const MDS_PRIORITY_BBOXES = [...MDS_CITY_BBOXES, ...MDS_PRIORITY_EXTRA];

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

/** Append `src`'s bytes to the file at `destPath` in 8 MB chunks — never through a JS string, so a
 *  multi-GB leftover file costs a fixed 8 MB of buffer instead of the heap the whole point of the
 *  swathe passes was to avoid. */
function appendFileInto(srcPath, destPath) {
  if (!existsSync(srcPath)) return 0;
  const fdIn = openSync(srcPath, 'r');
  const fdOut = openSync(destPath, 'a');
  const buf = Buffer.allocUnsafe(8 << 20);
  let total = 0;
  try {
    for (;;) {
      const n = readSync(fdIn, buf, 0, buf.length, null);
      if (n <= 0) break;
      writeSync(fdOut, buf, 0, n);
      total += n;
    }
  } finally {
    try { closeSync(fdIn); } catch { /* already closed */ }
    try { closeSync(fdOut); } catch { /* already closed */ }
  }
  return total;
}

/** Append retained (stamped or not) features in bounded chunks. `records.map(...).join('\n')` builds
 *  ONE string as large as the whole band — a second copy of the working set at the exact moment the
 *  band is at peak heap. Chunking keeps the spike at ~25k features. */
function appendRetained(destPath, records, chunk = 25_000) {
  for (let i = 0; i < records.length; i += chunk) {
    appendFileSync(destPath, records.slice(i, i + chunk).map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  }
}

/**
 * ONE bounded-heap pass of the MDS join.
 *
 * Streams `inPath`; HOLDS only the footprints whose centroid falls in `areas`; stamps the cells the
 * shared `budget` allows; appends EVERY held footprint (stamped or not) to `retainedOutPath`; and
 * writes every other record straight to `passThroughPath` as raw bytes, untouched. Peak heap tracks
 * `areas`, never the region.
 *
 * §CONTEXT-DATA-HONESTY — a held-but-unstamped footprint and a passed-through footprint end in the
 * SAME honest state: their ORIGINAL OSM tags. Nothing is fabricated, nothing is dropped, and every
 * input record leaves in exactly one of the two files.
 */
async function mdsStampPass({
  inPath, passThroughPath, retainedOutPath, grid, areas, priorityBboxes = [], budget, gt,
  timeoutMs, padDeg, erodeM, percentile, minSamples, sampleStepM, heights, concurrency, label,
}) {
  mkdirSync(dirname(passThroughPath), { recursive: true });
  const load = loadJoinFootprintsBounded(inPath, passThroughPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, areas)) return null;
    return { feat, ...fp };
  }, label);
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;
  const buckets = bucketRecords(records, (r) => [grid.cellIx(r.clon), grid.cellIy(r.clat)]);
  const out = {
    status: 'ok', read, retained: records.length, passedThrough: read.passedThrough,
    populatedCells: buckets.size, cellsStamped: 0, cellsFailed: 0, cellsSkipped: 0,
    km2Stamped: 0, km2Failed: 0, km2Skipped: 0,
    tilesProcessed: 0, priorityTiles: 0, tileErrors: 0, measured: 0,
    sweepAborted: false, sweepAbortReason: null,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
  };
  const doneCells = new Set();

  /** Fetch ONE cell's raster and stamp its footprints. Never throws for a source failure — a raster
   *  error leaves that cell's footprints at their honest OSM default and is COUNTED, not hidden. */
  const stampCell = async (ix, iy) => {
    const key = `${ix},${iy}`;
    if (doneCells.has(key)) return;
    const inTile = buckets.get(key);
    if (!inTile || inTile.length === 0) return;
    doneCells.add(key);
    const [tw, ts, te, tn] = mdsCellBbox(grid, ix, iy);
    const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
    const rr = await httpGetBuffer(mdsCoverageUrl(rbox), { timeoutMs });
    if (!rr.ok || !/tiff/i.test(rr.ct)) { out.tileErrors++; out.cellsFailed++; out.km2Failed += mdsCellKm2(grid, ix, iy); return; }
    let mds;
    try { mds = await readDhmRaster(rr.ab, gt); }
    catch { out.tileErrors++; out.cellsFailed++; out.km2Failed += mdsCellKm2(grid, ix, iy); return; }
    for (const r of inTile) {
      const h = mdsHeightForBuilding(r.ext, r.interiors, mds, { erodeM, percentile, minSamples, sampleStepM });
      if (h) {
        r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: 'mds_edificacion', [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
        heights.push(h.height);
        out.measured++;
      }
    }
    out.tilesProcessed++;
    budget.tilesUsed++;
    out.cellsStamped++;
    out.km2Stamped += mdsCellKm2(grid, ix, iy);
  };

  try {
    // §PHASE-4 / §PRIORITY-FIRST — the priority bboxes are stamped FIRST and are NOT subject to
    // `maxTiles`, so the metros (and the two founder-named gate cities) are GUARANTEED measured
    // heights on every run, however early the national sweep is truncated. They DO respect the wall
    // -clock deadline, because a job that dies at 330 minutes publishes nothing at all — and a
    // deadline reached inside the priority phase is reported under its own loud name.
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = out.tilesProcessed;
      const cells = [];
      for (let iy = grid.cellIy(ps); iy <= grid.cellIy(pn); iy++) {
        for (let ix = grid.cellIx(pw); ix <= grid.cellIx(pe); ix++) cells.push({ ix, iy });
      }
      for (const batch of sweepBatches(cells, concurrency)) {
        if (Date.now() > budget.deadlineAt) { budget.stopReason ??= 'time-budget-in-priority'; break; }
        await Promise.all(batch.map((c) => stampCell(c.ix, c.iy)));
      }
      out.priorityTiles += out.tilesProcessed - before;
      if (budget.stopReason) break;
    }

    // §NATIONAL-SWEEP — only POPULATED cells, in a DETERMINISTIC numeric order (row-major
    // south→north), resumable from `budget.nextCursor`. Issued in ordered batches so a truncation
    // point is an exact cell ord, not "somewhere in a set of concurrent requests".
    const rest = sweepOrder([...buckets.keys()].filter((k) => !doneCells.has(k)), grid, budget.nextCursor);
    for (const batch of sweepBatches(rest, concurrency)) {
      if (budget.tilesUsed >= budget.maxTiles) budget.stopReason ??= 'tile-cap';
      else if (Date.now() > budget.deadlineAt) budget.stopReason ??= 'time-budget';
      if (budget.stopReason) { budget.nextCursor = batch[0].ord; break; }
      await Promise.all(batch.map((c) => stampCell(c.ix, c.iy)));
      budget.nextCursor = batch[batch.length - 1].ord + 1;
      if (out.tilesProcessed % 50 < concurrency) {
        const mins = ((Date.now() - budget.startedAt) / 60000).toFixed(1);
        console.log(`    · MDS sweep ${label}: ${budget.tilesUsed} cell(s) / ${Math.round(out.km2Stamped)} km² stamped, ` +
          `${out.tileErrors} raster error(s), ${mins} min elapsed, cursor ${budget.nextCursor}`);
      }
    }
    // Populated cells this pass never reached — the HONEST skipped area, counted, not implied.
    for (const c of rest) {
      if (doneCells.has(c.key)) continue;
      out.cellsSkipped++;
      out.km2Skipped += mdsCellKm2(grid, c.ix, c.iy);
    }
  } catch (err) {
    // §ABORT-IS-NOT-A-CAP (2026-08-01) — an ABORTED sweep is a FAILURE and must never be reported as
    // a budget being respected. Run 30706761446 stamped 21,457/431,256 footprints off 16 tiles while
    // announcing a 20,000-tile cap; the join had THROWN and the cap flag buried it.
    out.sweepAborted = true;
    out.sweepAbortReason = String(err?.message ?? err);
    budget.stopReason ??= 'sweep-aborted';
  }

  appendRetained(retainedOutPath, records);
  records.length = 0;
  buckets.clear();
  return out;
}

/**
 * Stamp REAL MDS Edificación (mdsn_e025) heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own
 * clip). Sets `height` = P90 of the raster over each eroded footprint interior (`tagged`) — the SAME
 * per-footprint statistic as before, unchanged. Writes the stamped features to `outPath` (same
 * footprints, heights added — a REPLACE input, no double-draw). Never throws; a source failure leaves
 * footprints at the OSM default.
 *
 * ── §MDS-NATIONAL-SWEEP (L-12946, 2026-09-06, lane ES-WHOLE-COUNTRY-HEIGHTS) — WHAT CHANGED ───────
 * The working set used to BE `MDS_CITY_BBOXES`: nine metros, and nothing else in Spain could ever be
 * stamped. Ciudad Real, Toledo, Alicante, Granada, Valladolid, Vigo, Gijón, A Coruña, Pamplona,
 * Santander, Salamanca and every town and village were STRUCTURALLY unreachable, and silently so —
 * an unstamped footprint reports an honest `assumed` 9 m, which on the map is indistinguishable from
 * "the source has no data here". Founder, 2026-09-06, at Ciudad Real. The raster was never the
 * limit: `mdsn_e025` is ONE national EPSG:3042 grid, and this join samples it against bake's OWN OSM
 * clip, so nothing about Catastro's per-tile refusal applies here.
 *
 * Now:
 *   • `retainBboxes` for `spain` is the WHOLE COUNTRY (bake.mjs → MDS_NATIONAL_BBOXES);
 *   • `priorityBboxes` keeps MDS_CITY_BBOXES as a PRIORITY ORDER ONLY — the metros are stamped
 *     first and UNCAPPED, so a truncated run still helps the most users;
 *   • `swatheRows` bounds the HEAP: the country is retained one band of whole tile rows at a time,
 *     each pass reading the previous pass's (strictly smaller) pass-through file. This is not
 *     optional — the measured 1,256 B of heap per parsed footprint is what killed run 30693132326
 *     at 4.04 GB, and it is why "just widen the bbox" would have reproduced that abort exactly;
 *   • `tileSpanLatDeg`/`tileSpanLonDeg` come from the MEASURED service ceiling (heights/mdsNational.mjs
 *     header: MAXSIZE=4096, 0.095° served, 0.100° refused, at three latitudes) — never a guess;
 *   • `budgetMs` + `startCursor` make truncation LOUD and ORDERED instead of silent, with the km²
 *     stamped vs skipped and an exact resume cursor printed.
 *
 * ⚠ HONESTY LIMIT, stated rather than implied: successive runs do NOT accumulate into one tileset
 * today. Each bake regenerates `<region>-buildings-stamped.geojsonseq` from the OSM clip, so a
 * second dispatch with `MDS_SWEEP_CURSOR` stamps a DIFFERENT slice of Spain in a DIFFERENT tileset.
 * Accumulating slices needs a per-region incremental merge that does not exist. Named, not built.
 *
 * @param bbox [w,s,e,n] WGS84.
 */
export async function stampMdsHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000,
  tileSpanDeg = 0.025, tileSpanLonDeg = null, tileSpanLatDeg = null,
  maxTiles = 4000, padDeg = 0.0015,
  priorityBboxes = [], retainBboxes = null,
  swatheRows = 0, budgetMs = 0, startCursor = 0, concurrency = 1,
  erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 2.5,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `MDS join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'MDS join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) {
    return { status: 'documented', reason: 'MDS join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  }
  const grid = mdsTileGrid(bbox, { lonDeg: tileSpanLonDeg ?? tileSpanDeg, latDeg: tileSpanLatDeg ?? tileSpanDeg });
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  const budget = {
    maxTiles, tilesUsed: 0, startedAt: Date.now(),
    deadlineAt: budgetMs > 0 ? Date.now() + budgetMs : Infinity,
    stopReason: null, nextCursor: Number(startCursor) > 0 ? Number(startCursor) : 0,
  };
  const heights = [];
  const passArgs = { grid, budget, gt, timeoutMs, padDeg, erodeM, percentile, minSamples, sampleStepM, heights, concurrency: Math.max(1, concurrency) };
  const agg = {
    retained: 0, passedThrough: 0, populatedCells: 0, cellsStamped: 0, cellsFailed: 0, cellsSkipped: 0,
    km2Stamped: 0, km2Failed: 0, km2Skipped: 0, tilesProcessed: 0, priorityTiles: 0, tileErrors: 0,
    measured: 0, sweepAborted: false, sweepAbortReason: null, peakHeapUsedMB: 0, heapLimitMB: 0, parsed: 0,
  };
  const accumulate = (p) => {
    agg.retained += p.retained; agg.passedThrough = p.passedThrough; agg.populatedCells += p.populatedCells;
    agg.cellsStamped += p.cellsStamped; agg.cellsFailed += p.cellsFailed; agg.cellsSkipped += p.cellsSkipped;
    agg.km2Stamped += p.km2Stamped; agg.km2Failed += p.km2Failed; agg.km2Skipped += p.km2Skipped;
    agg.tilesProcessed += p.tilesProcessed; agg.priorityTiles += p.priorityTiles; agg.tileErrors += p.tileErrors;
    agg.measured += p.measured;
    if (p.sweepAborted) { agg.sweepAborted = true; agg.sweepAbortReason = p.sweepAbortReason; }
    agg.peakHeapUsedMB = Math.max(agg.peakHeapUsedMB, p.peakHeapUsedMB ?? 0);
    agg.heapLimitMB = p.heapLimitMB ?? agg.heapLimitMB;
    // The FIRST pass parses every record in the clip; later passes re-parse only what is left, so
    // summing would over-report the input count several-fold. Take the first pass's number.
    if (agg.parsed === 0) agg.parsed = p.read?.parsed ?? 0;
  };

  mkdirSync(dirname(outPath), { recursive: true });

  // ── SINGLE PASS (default) — a city-sized region, or any caller that declares no swathes. Byte-
  //    identical in effect to the pre-2026-09-06 join: one partition, priority cells, then the sweep.
  if (!swatheRows || swatheRows <= 0) {
    const p = await mdsStampPass({ ...passArgs, inPath, passThroughPath: outPath, retainedOutPath: outPath, areas: stampAreas, priorityBboxes, label: 'MDS join' });
    if (p.status !== 'ok') return { status: p.status, reason: p.reason, read: p.read };
    accumulate(p);
    return mdsResult({ outPath, agg, heights, budget, grid, stampAreas, priorityBboxes, swathesTotal: 1, swathesScanned: 1, national: false });
  }

  // ── NATIONAL MULTI-PASS — bounded heap, whole-country retain set. ────────────────────────────────
  writeFileSync(outPath, '');
  const swathes = mdsNationalSwathes(grid, { swatheRows });
  const tmp = [`${outPath}.mds-swathe-a`, `${outPath}.mds-swathe-b`];
  let cur = inPath, alt = 0, swathesScanned = 0;
  console.log(`\n  MDS national sweep · grid ${grid.nx}×${grid.ny} cells of ${grid.lonDeg}°×${grid.latDeg}° ` +
    `(measured ceiling MAXSIZE=4096 ⇒ ≤0.125° lon / ≤0.097° lat) · ${swathes.length} bounded-heap swathe(s) of ` +
    `${swatheRows} row(s) · ${priorityBboxes.length} priority bbox(es) first, uncapped · ` +
    `budget ${budgetMs > 0 ? `${Math.round(budgetMs / 60000)} min` : 'none'} / ${maxTiles} cells · cursor ${budget.nextCursor}`);

  // PASS 0 — the priority cities, held ALONE so the metro guarantee costs one small band of heap.
  if (priorityBboxes.length) {
    const pt = tmp[alt++ % 2];
    const p = await mdsStampPass({ ...passArgs, inPath: cur, passThroughPath: pt, retainedOutPath: outPath, areas: priorityBboxes, priorityBboxes, label: 'MDS priority' });
    // §EMPTY-IS-NOT-A-FAILURE (found by the live Ciudad Real proof, 2026-09-06). A pass returns
    // `documented` when its INPUT holds no records — which is the NORMAL end state here, because
    // each pass hands the next one only what it did not retain. The first draft returned that
    // status straight out of the join, so a run in which the priority bboxes retained EVERYTHING
    // reported `documented` and threw away a completed, correct 2,400-footprint stamp. Only
    // `error` is a failure; `documented` means there is nothing left to do.
    if (p.status === 'error') return { status: 'error', reason: p.reason, read: p.read };
    if (p.status === 'ok') { accumulate(p); cur = pt; }
    console.log(`    · MDS priority pass: ${p.measured ?? 0}/${p.retained ?? 0} footprint(s) measured over ${p.cellsStamped ?? 0} cell(s).`);
  }

  for (const sw of swathes) {
    if (budget.stopReason) break;
    if (sw.ordTo <= budget.nextCursor) continue; // resumed run — this band is behind the cursor
    const pt = tmp[alt++ % 2];
    const p = await mdsStampPass({ ...passArgs, inPath: cur, passThroughPath: pt, retainedOutPath: outPath, areas: [sw.bbox], priorityBboxes: [], label: `MDS swathe ${sw.index + 1}/${swathes.length}` });
    if (p.status === 'error') return { status: 'error', reason: p.reason, read: p.read };
    if (p.status !== 'ok') break; // nothing left in the stream — every record is already written out
    accumulate(p);
    swathesScanned++;
    cur = pt;
    console.log(`    · MDS swathe ${sw.index + 1}/${swathes.length} (lat ${sw.bbox[1].toFixed(2)}–${sw.bbox[3].toFixed(2)}): ` +
      `${p.measured}/${p.retained} measured over ${p.cellsStamped} cell(s), ${Math.round(p.km2Stamped)} km², peak heap ${p.peakHeapUsedMB} MB.`);
  }
  if (!budget.stopReason) budget.stopReason = 'complete';

  // Everything still unretained — bands never opened, and anything outside the region grid — is
  // written through UNCHANGED. Original OSM tags, honest `assumed`; never fabricated, never dropped.
  appendFileInto(cur, outPath);
  for (const t of tmp) { try { if (existsSync(t)) unlinkSync(t); } catch { /* best effort */ } }

  return mdsResult({ outPath, agg, heights, budget, grid, stampAreas, priorityBboxes, swathesTotal: swathes.length, swathesScanned, national: true });
}

/** Assemble the join's result + the §MEASURED-HEIGHT-GATE counters + the loud truncation sentence. */
function mdsResult({ outPath, agg, heights, budget, grid, stampAreas, priorityBboxes, swathesTotal, swathesScanned, national }) {
  const measured = agg.measured;
  heights.sort((a, b) => a - b);
  const stop = budget.stopReason ?? (agg.cellsSkipped > 0 ? 'tile-cap' : 'complete');
  const sweep = {
    stopReason: stop, swathesTotal, swathesScanned,
    cellsStamped: agg.cellsStamped, cellsFailed: agg.cellsFailed, cellsSkipped: agg.cellsSkipped,
    km2Stamped: agg.km2Stamped, km2Failed: agg.km2Failed, km2Skipped: agg.km2Skipped,
    nextCursor: budget.nextCursor,
    nextCursorLon: grid.w + grid.ixOf(budget.nextCursor) * grid.lonDeg,
    nextCursorLat: grid.s + grid.iyOf(budget.nextCursor) * grid.latDeg,
  };
  const summary = formatSweepSummary(sweep);
  return {
    status: 'ok', outPath, count: agg.parsed, footprintCount: agg.retained, measuredCount: measured,
    coverage: agg.retained ? Number((measured / agg.retained).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: agg.tilesProcessed, priorityTiles: agg.priorityTiles, tileErrors: agg.tileErrors,
    emptyTiles: Math.max(0, grid.nx * grid.ny - agg.populatedCells),
    tileCapHit: stop === 'tile-cap', sweepAborted: agg.sweepAborted, sweepAbortReason: agg.sweepAbortReason,
    tileGrid: `${grid.nx}×${grid.ny}`, nationalSweep: sweep,
    // §JOIN-BOUNDED-WORKING-SET counters — the P8-equivalent observability for a plain Node script.
    retainedFootprints: agg.retained, passedThroughFootprints: agg.passedThrough,
    stampAreas: stampAreas.length, populatedCells: agg.populatedCells,
    peakHeapUsedMB: agg.peakHeapUsedMB, heapLimitMB: agg.heapLimitMB,
    note: `MDS Edificación stamped onto OSM footprints → ${measured}/${agg.retained} RETAINED footprint(s) got a MEASURED ` +
      `height (tagged); ${agg.passedThrough} footprint(s) outside the ${stampAreas.length} stamp bbox(es) passed through with ` +
      `their original OSM tags; ${agg.tilesProcessed} tile(s)${agg.priorityTiles ? ` (${agg.priorityTiles} in ${priorityBboxes.length} priority bbox(es) first)` : ''}, ` +
      `${agg.tileErrors} raster error(s) over ${agg.cellsFailed} cell(s) / ${Math.round(agg.km2Failed)} km²` +
      `${agg.sweepAborted ? ` ⚠ SWEEP ABORTED — ${agg.sweepAbortReason}; the rest keep OSM (this is a FAILURE, not a cap)` : ''}; ` +
      `peak heap ${agg.peakHeapUsedMB} MB of ${agg.heapLimitMB} MB.` +
      (national ? ` ${summary}` : ''),
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

// ── AU per-jurisdiction join — stamp OPEN LoD1 footprint heights onto bake's OWN OSM footprints. ──
// §AU-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-AU) — the Australian analogue of the joins above,
// and the FIRST measured-height channel in any AU state. Like NRW (vectors, not a raster) the height is
// TRANSCRIBED, not computed from pixels: City of Melbourne publishes every building as a stack of
// roof-level components with AHD elevations, and the join collapses the components an OSM footprint
// contains to ONE metre (heights/auOpenHeights.mjs `auOpenHeightForFootprint` — Eureka's 11 components
// → 297.5 m). Why a STAMP and not a replace: same as every join here — one footprint set, coherent
// with the roads/water/landuse baked from the same OSM clip, plus the one thing the council has that
// OSM lacks.
//
// WHY CELL-SPLIT (§BDTOPO-CAP-TRUNCATE, measured before designing): the portal's /records API pages
// at ≤ 100 rows and REFUSES offset + limit > 10,000 (HTTP 400) — 41,701 records cannot be paged; the
// /exports/geojson endpoint has NO row cap but the stamp still asks per populated 0.01° cell (a CBD
// cell = 2,059 components / 1.66 MB / 3.4 s) so each response is bounded and a mid-sweep failure loses
// one cell, not the city. Cells are padded by `padDeg` so a component whose centroid sits just across
// the edge is still seen by this cell's footprints.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • export refused / timed out / undecodable  → `tileErrors++` — a FAILURE (the portal, or us).
//   • export decodes to ZERO components          → `voidTiles++` — an honest EMPTY (parkland, river);
//                                                   footprints keep their OSM tags. Not an error.
//   • footprint matches no component             → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • footprint outside AU_OPEN_CITY_BBOXES      → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS (anonymous Explore API, X-RateLimit-Limit 10,000/day per IP — the LGA is ≤ ~100 cells).
// Licence CC BY 4.0, attribution "© City of Melbourne".
export async function stampAuOpenHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = 0.01, padDeg = 0.0005, maxTiles = 2000, retainBboxes = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `AU open-heights join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'AU open-heights join: no bbox supplied' };
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — hold only footprints inside a stamp bbox AND inside a jurisdiction
  // that serves heights (a footprint in a stamp bbox with no adapter row cannot be stamped: pass it through).
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const j = auOpenJurisdictionForPoint(fp.clon, fp.clat);
    if (!j) return null;
    return { feat, ...fp, jurisdiction: j.jurisdiction };
  }, 'AU open-heights join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0;
  let componentsFetched = 0, bytesFetched = 0;
  const rules = new Map();
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();
  try {
    // Visit ONLY populated cells (sorted → deterministic under the cap).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [ix, iy] = key.split(',').map(Number);
      const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
      const cell = [tw, ts, Math.min(tw + tileSpanDeg, e), Math.min(ts + tileSpanDeg, n)];
      // A cell may straddle two jurisdictions' working sets; each gets its own export.
      const byJ = new Map();
      for (const r of inTile) { const b = byJ.get(r.jurisdiction); if (b) b.push(r); else byJ.set(r.jurisdiction, [r]); }
      let cellOk = false;
      for (const [jid, recs] of byJ) {
        const j = AU_OPEN_HEIGHTS[jid];
        if (!j) continue;
        requests++;
        const rr = await httpGetSafe(auOpenExportUrl(j, cell, { padDeg }), { timeoutMs, headers: { Accept: 'application/json' } });
        if (!rr.ok) { tileErrors++; continue; }            // refused / timed out — a FAILURE, never "nothing here"
        const fc = parseOdsGeojson(rr.body);
        if (!fc) { tileErrors++; continue; }               // undecodable — a FAILURE
        cellOk = true;
        bytesFetched += rr.body.length;
        const comps = odsComponents(fc, j);
        componentsFetched += comps.length;
        if (comps.length === 0) { voidTiles++; continue; } // an honest EMPTY: the export answered, nothing built here
        for (const r of recs) {
          const h = auOpenHeightForFootprint(r.ext, r.interiors, r.clon, r.clat, comps, j);
          if (!h) continue;
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: h.height, heightSource: j.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
          rules.set(h.rule, (rules.get(h.rule) ?? 0) + 1);
        }
      }
      if (cellOk) processedTiles++;
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
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    requests, componentsFetched, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchRules: Object.fromEntries(rules), elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `AU open LoD1 footprint heights (component stack → one metre per footprint) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) / jurisdiction(s) passed ` +
      `through with their original OSM tags; ${processedTiles} cell(s) read (${requests} export(s), ${componentsFetched} components, ` +
      `${(bytesFetched / 1e6).toFixed(0)} MB), ${voidTiles} empty cell(s), ${tileErrors} export error(s)` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
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
  writeFeaturesSeq(outPath, feats);                      // §SEQ-WRITE-STREAMED — never one giant string
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
  else if (source === 'au_open_lod1') {
    // §AU-OPEN-HEIGHTS — live, but (like mnh_fr / swiss) a bake STAMP over bake's own footprints, not a footprint fetcher.
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is the bake STAMP stampAuOpenHeightsOnGeojsonseq, dispatched only when the region ` +
        `declares heightJoin:'au_open' in bake.mjs (with stampBboxesFor → AU_OPEN_CITY_BBOXES). Region "${region}" does not, so ` +
        'its footprints keep their OSM tags until that row edit lands.',
    };
  }
  else if (source === 'ca_open_elem') {
    // §CA-OPEN-HEIGHTS — live, but (like au_open_lod1 / us_open_heights) a bake STAMP over the bake OSM
    // footprints, not a footprint fetcher. Named explicitly rather than left to the generic fall-through
    // so the message says WHICH stamp and HOW to arm it, the way its two siblings above do.
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is the bake STAMP stampCaOpenHeightsOnGeojsonseq (heights/caOpenHeightsStamp.mjs), dispatched only when the region ` +
        `declares heightJoin ca_open in bake.mjs (with stampBboxesFor filtering CA_OPEN_CITY_BBOXES to that province). Region "${region}" does not, so ` +
        'its footprints keep their OSM tags until that row edit lands.',
    };
  }
  else if (source === 'us_open_heights') {
    // §US-OPEN-HEIGHTS — live, but a bake STAMP over bake's own footprints, not a footprint fetcher.
    // ⭐ THE ADVICE CHANGED 2026-09-06 and the old advice would now be actively harmful: this branch used to
    // say "declares heightJoin:'us_open' in bake.mjs (with stampBboxesFor → US_OPEN_CITY_BBOXES)". Doing that
    // today re-creates the hole this lane closed — that key reaches ONE metro box and leaves the rest of the
    // state on the fabricated 9 m default. The three city channels are served by the NATIONAL stamp instead.
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is a bake STAMP over bake's own footprints, and its three CITY channels (NYC height_roof · SF ` +
        `hgt_maxcm · Boston BLDG_HGT_2010) are dispatched by heights/usasNationalStamp.mjs, which resolves the city channel FIRST per ` +
        `footprint. A US region receives them by declaring heightJoin:'usas' in bake.mjs (with stampBboxesFor → US_NATIONAL_BBOXES) — ` +
        `NOT heightJoin:'us_open', which is retired because it could only ever reach one metro box per state. Region "${region}" ` +
        'declares no join, so its footprints keep their OSM tags until that row edit lands.',
    };
  }
  else if (source === 'usas_national') {
    // §USAS-NATIONAL-HEIGHTS — live, but (like us_open_heights / ndh_no) a bake STAMP over bake's own footprints, not a footprint fetcher.
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is the bake STAMP stampUsasNationalHeightsOnGeojsonseq (heights/usasNationalStamp.mjs), dispatched only ` +
        `when the region declares heightJoin:'usas' in bake.mjs (with stampBboxesFor → US_NATIONAL_BBOXES). Region "${region}" does not, so its ` +
        'footprints keep their OSM tags until that row edit lands.',
    };
  }
  else if (source === 'eesti3d_ee' || source === 'grb_be') {
    // §EE-ETAK-OSM-JOIN / §BE-DHMV-OSM-JOIN — live, but (like ndh_no / us_open_heights) a bake STAMP over bake's own footprints, not a footprint fetcher.
    const stamp = source === 'eesti3d_ee' ? 'stampEeEtakHeightsOnGeojsonseq (heights/eeHeightsStamp.mjs)' : 'stampBeDhmvHeightsOnGeojsonseq (heights/beHeightsStamp.mjs)';
    const key = source === 'eesti3d_ee' ? 'ee_etak' : 'be_dhmv';
    return {
      status: 'documented', region, source, provenance: src.provenance,
      reason: `${src.name}: this source is the bake STAMP ${stamp}, dispatched only when the region declares heightJoin:'${key}' in bake.mjs ` +
        `(NATIONAL_STAMP_TABLE, stampBboxesFor → the city working set). Region "${region}" is served by that row, not by a footprint fetch here.`,
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
  writeFeaturesSeq(path, writeable);                     // §SEQ-WRITE-STREAMED — never one giant string
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
  au_open_lod1: [144.9638, -37.8222, 144.9654, -37.8210], // Melbourne, Eureka Tower block — the 2026-09-05 export probe (25 features, 815210 = 297.5 m)
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
  if (id === 'au_open_lod1') {
    // §AU-OPEN-HEIGHTS — asserts the THREE things the stamp depends on: (1) the uncapped export answers JSON,
    // (2) it decodes to building components with numeric elevations, (3) the component stack collapses to a
    // plausible metre — the Eureka block must read ~297.5 m, or the height rule is wrong, not the data.
    const j = AU_OPEN_HEIGHTS.melbourne_cc;
    const rr = await httpGetSafe(auOpenExportUrl(j, bbox), { timeoutMs: 30_000, headers: { Accept: 'application/json' } });
    const fc = rr.ok ? parseOdsGeojson(rr.body) : null;
    const comps = fc ? odsComponents(fc, j) : [];
    const ext = comps.map((c) => c.structureExtrusion).filter(Number.isFinite).sort((a, b) => a - b);
    const stats = ext.length ? { n: ext.length, min: ext[0], p50: _percentile(ext, 50), p90: _percentile(ext, 90), max: ext[ext.length - 1] } : null;
    // Collapse the tallest structure's components exactly as the join would for a footprint containing them.
    let tallest = null;
    if (comps.length) {
      const byId = new Map();
      for (const c of comps) { const b = byId.get(c.structureId); if (b) b.push(c); else byId.set(c.structureId, [c]); }
      for (const [structureId, cs] of byId) {
        const ring = cs.reduce((a, c) => (c.ring.length > a.ring.length ? c : a), cs[0]).ring;
        const cx = cs.reduce((a, c) => a + c.cx, 0) / cs.length, cy = cs.reduce((a, c) => a + c.cy, 0) / cs.length;
        // a synthetic footprint = the union hull proxy: the bbox of all component rings (contains every centroid)
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const c of cs) for (const [x, y] of c.ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const h = auOpenHeightForFootprint([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], [], cx, cy, cs, j);
        if (h && (!tallest || h.height > tallest.height)) tallest = { structureId, components: cs.length, ...h, ringVertices: ring.length };
      }
    }
    return {
      id, endpoint: j.dataset, status: fc && comps.length ? 'ok' : 'error', httpStatus: rr.status, contentType: rr.contentType,
      assertContentType: /json/i.test(rr.contentType ?? ''), assertDecodes: !!fc, features: fc?.features?.length ?? null,
      components: comps.length, structureExtrusionStats: stats, tallestStructure: tallest,
      assertRealHeight: !!stats && stats.p90 > 2.5 && stats.max < 400,
      licence: j.licence, provenance: 'tagged', mode: "stamp (bake.mjs heightJoin:'au_open' → stampAuOpenHeightsOnGeojsonseq)",
      reason: rr.reason ?? (fc ? null : 'export did not decode as a FeatureCollection'),
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
