#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// §VEG-REAL-CANOPY-BAKE (L-12935, founder 2026-09-05) — REAL canopy from MEASURED tree-cover rasters.
//
// THE DEFECT THIS CLOSES. The founder, at Córdoba Av. Gran Vía and at Jouy-en-Josas beside
// Versailles: "missing a lot of vegetation — a lot of real trees". Today the 3D Site has exactly
// two vegetation sources and NEITHER is a measurement of where trees actually are:
//   • `trees.pmtiles`  — OSM `n/natural=tree` NODES. Real, but only where a mapper walked. Jouy read
//                        191 trees across 30 baked tiles beside 87 green polygons.
//   • §VEG-CANOPY-FROM-WOODS (L-12934, contextCanopySynth.ts) — a jittered grid laid INSIDE real
//                        `natural=wood` / `landuse=forest` rings. The polygon is real; every POSITION
//                        is synthesised, `synthetic: true`, and counted apart in the log. Its own
//                        header names THIS lane as the real source that replaces its flat density.
//
// WHAT THIS FILE ADDS. A third source in which the POSITION is derived from a MEASUREMENT: national
// and global tree-cover-density rasters. A ~12 m cell is emitted as a canopy point when the raster
// says that spot carries ≥ CANOPY_THRESHOLD_PCT crown cover. It is not a mapped tree and this file
// never pretends otherwise — see HONESTY below.
//
// ── HONESTY (C57 §1.5 / §1.9, C58 §1.2) — read before quoting any output as "trees" ──────────────
// Three DIFFERENT claims, three different labels, never collapsed:
//   • `sampled: true`  — THIS layer. The COVER is measured: a named public raster reports N % crown
//     cover at that location, and `cover` carries N. The POSITION is a grid-cell centre plus a
//     deterministic hash jitter — a SAMPLE of a density field, NOT an individual surveyed tree. A
//     cell with `cover: 74` means "the raster measures 74 % canopy here", never "there is a tree at
//     these coordinates".
//   • `synthetic: true` — contextCanopySynth's woods fill. Real polygon, invented positions.
//   • neither          — a mapped OSM `natural=tree` node. A real, individually surveyed tree.
// The bake's console line counts cells KEPT, cells REFUSED by the threshold, and pixels that were
// NODATA, separately — because "the raster said 0 % here" and "the raster had nothing to say here"
// are different values (memory `context-data-honesty-family`), and a source outage must never read
// as a treeless city.
//
// ── SOURCES — every one PROBED FROM THIS MACHINE on 2026-09-05, exact HTTP answer recorded ───────
//   1. EUROPE (EEA39) — Copernicus HRL Tree Cover Density 2018, 10 m, EEA/Copernicus Land.
//      GET .../HRL_TreeCoverDensity_2018/ImageServer?f=json          → HTTP 200 application/json 5,539 B
//      GET .../ImageServer/exportImage?bbox=2.15,48.76,2.19,48.79&bboxSR=4326&size=400,300&format=tiff
//                                                                    → HTTP 200 image/tiff 197,486 B
//      Decoded (geotiff@2.1.3): 400×300, 1 band, bbox EXACTLY as asked, 88 distinct values, min 0
//      max 100, mean 42.6, 51.9 % of pixels ≥ 30 %. Jouy-en-Josas is forested plateau — plausible.
//   2. USA — MRLC NLCD Tree Canopy Cover, 30 m, USGS/MRLC (public domain).
//      GET https://www.mrlc.gov/geoserver/mrlc_display/wms?...GetCapabilities → HTTP 200 638,598 B
//      GET .../wcs?service=WCS&version=1.0.0&request=GetCoverage&coverage=mrlc_display:nlcd_tcc_conus_2021_v2021-4
//                                                                    → HTTP 200 image/tiff 129,938 B
//      ⚠ The GeoTIFF is 8-bit PALETTED (PhotometricInterpretation=3, a 768-entry ColorMap for
//      display). The PALETTE INDEX **IS** the raw percent — verified against ground truth rather
//      than assumed: Manhattan/Central Park bbox reads mean 11.6 %, 16.2 % of pixels ≥ 30 %; Great
//      Smoky Mountains NP reads mean 88.1 %, 98.3 % ≥ 30 %. GDAL_NODATA = 255.
//      (WCS 2.0.1 answers `InvalidAxisLabel` for Long/Lat — the coverage is in Albers. 1.0.0 takes a
//      plain EPSG:4326 bbox and is what this file uses. WMS 1.1.1 GetMap is the recorded fallback:
//      same bytes, same indices, but it is a RENDERING request and the style could change under us.)
//   3. EVERYWHERE ELSE (Australia, New Zealand, Middle East, and any bbox the two above miss) —
//      Hansen/UMD Global Forest Change 2023 v1.11 `treecover2000`, 30 m, 80 N–60 S, CC-BY 4.0.
//      HEAD .../Hansen_GFC-2023-v1.11_treecover2000_50N_000E.tif → HTTP 200, Content-Length
//      374,428,822, `Accept-Ranges: bytes`; a `Range: bytes=0-4095` read → HTTP 206.
//      The file is 40000×40000, LZW, RowsPerStrip=1 — so a windowed read is a CONTIGUOUS byte span
//      and geotiff.js's blocked source coalesces it. Live windowed read of Ku-ring-gai Chase NP
//      north of Sydney (tile 30S_150E, bbox 150,-40,160,-30): 200×200 px in 3.7 s, mean 68.5 %,
//      86.5 % of pixels ≥ 30 %. It is a national park; the number is right.
//      ⚠ VINTAGE. `treecover2000` is canopy as of the YEAR 2000 and this file does NOT subtract the
//      companion `lossyear` band. Every Hansen-sourced feature therefore carries `vintage: 2000` and
//      `loss_adjusted: false`, so a stand felled in 2011 can still be emitted. Joining `lossyear`
//      doubles the range reads per chunk and is the named next step, NOT a silent assumption.
//   NOT USED, and why: DCCEEW National Forest and Sparse Woody Vegetation (AU) — the department's
//      catalogue host answered HTTP 301 to a portal page from this machine and no direct raster
//      endpoint was reached, so it is NOT wired; Australia rides Hansen, which WAS reached and
//      returns real values over Sydney. LCDB v5 (NZ, LRIS) is access-gated (an LRIS API key), the
//      §IDENTITY-BOOTSTRAP-GATE shape — NZ rides Hansen too. VITO's
//      s3-eu-west-1.amazonaws.com/vito.landcover.global Copernicus GLC 100 m path answered HTTP 404
//      and its S3 listing 404 — an endpoint this file must NOT invent a working form of.
//
// ── SCOPE, and why it REFUSES rather than silently baking a fraction ─────────────────────────────
// A whole-country canopy bake is not a budget problem, it is an infeasibility: France at 12 m
// spacing over its ~31 % forest is order 10^9 points. So `canopyAreasFor` bakes a region only when
// its bbox is within CANOPY_MAX_AREA_KM2, and otherwise REFUSES BY NAME with both numbers and the
// two escape hatches (`--canopy-bbox`, or a `canopyBboxes` field on the region row). Most REGIONS
// rows are city-scale and pass; the ~20 national rows refuse until someone declares their city
// bboxes — the same bounded-working-set shape as §JOIN-BOUNDED-WORKING-SET. A refusal that names
// its escape hatch is a scope decision; a silent partial bake is a lie about coverage.
//
// PURITY. Everything above `── network ──` is dependency-free and deterministic: no clock, no
// Math.random, no I/O. The cell grid is anchored at (0,0) in GLOBAL degrees — not at the chunk — so
// a cell falls in exactly ONE chunk (the one containing its centre) and re-baking a bbox at a
// different chunking produces byte-identical points. Every jitter is a 32-bit integer hash of the
// cell index. `tools/context-bake/__tests__/canopy.spec.ts` pins all of it against fixtures.
//
// STANDALONE deps (mirrors terrain.mjs / heightSources.mjs — NOT the pnpm workspace):  npm i geotiff@2.1.3
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, appendFileSync } from 'node:fs';

// ── constants, each with its one-line rationale ──────────────────────────────

/** Keep a cell when the raster measures at least this much crown cover. 30 % is the FAO/Copernicus
 *  "forest" floor and the value the lane brief fixes; below it a cell reads as scattered scrub that
 *  a blob would overstate (the §ENVELOPE-SOLID-OVERSTATES lesson, applied to vegetation). */
export const CANOPY_THRESHOLD_PCT = 30;
/** ~12 m cell ⇒ ~69 canopies/ha where the threshold holds. Deliberately SPARSER than
 *  contextCanopySynth's 9 m / 123-per-ha guess, because this grid is a sample of a density field and
 *  not a stand model: over-emitting would make a measured 35 % cell read like closed forest. */
export const CANOPY_CELL_M = 12;
/** ±30 % of the pitch — same rationale as CANOPY_JITTER_FRACTION in contextCanopySynth: the stand
 *  reads as a wood rather than an orchard, while two neighbours can never sit closer than 0.4×pitch. */
export const CANOPY_JITTER_FRACTION = 0.3;
/** Chunk edge cap, pixels. The lane brief's ≤ 2048; also what keeps ONE EEA exportImage response
 *  under ~4 MB and one Hansen windowed read inside a single coalesced range span. */
export const CANOPY_MAX_CHUNK_PX = 2048;
/** A region bigger than this REFUSES (see the SCOPE note). 2,500 km² ≈ a 50 × 50 km metro — larger
 *  than every city-scale REGIONS row and far smaller than every national one, so the split is clean. */
export const CANOPY_MAX_AREA_KM2 = 2500;

/** Metres per degree of latitude (WGS 84 mean) — the equirectangular frame the global grid lives in. */
const METRES_PER_DEG_LAT = 110_574;
/** Metres per degree of longitude AT THE EQUATOR; scaled by cos(band latitude). */
const METRES_PER_DEG_LON_EQUATOR = 111_320;
/** cos() floor ≈ 88.9° — stops a polar cell from becoming a degenerate 0-width strip. Canopy above
 *  the Arctic tree line is not a case this layer serves; the guard is against a divide-by-zero. */
const MIN_COS_LAT = 0.02;

// ── the source table ─────────────────────────────────────────────────────────
//
// `coverage` is [w,s,e,n] in WGS 84. EEA's was DERIVED, not guessed: the ImageServer's own
// `extent` is EPSG:3857 xmin -3551136.81 ymin 3128825.71 xmax 5142393.19 ymax 11831355.71, which
// inverse-Mercators to lon -31.90..46.19, lat 27.06..71.80. Rows are tried IN ORDER, so the
// national rasters win inside their footprint and Hansen catches everything else.

export const CANOPY_SOURCES = [
  {
    id: 'eea-hrl-tcd-2018',
    name: 'Copernicus HRL Tree Cover Density 2018 (EEA39)',
    licence: 'Copernicus Land Monitoring Service — free, full and open (EEA)',
    kind: 'arcgis-imageserver',
    url: 'https://image.discomap.eea.europa.eu/arcgis/rest/services/GioLandPublic/HRL_TreeCoverDensity_2018/ImageServer',
    coverage: [-31.90, 27.06, 46.19, 71.80],
    nativeM: 10,
    vintage: 2018,
    lossAdjusted: true, // a 2018 observation IS the canopy at 2018; nothing to subtract.
    probe: 'exportImage bbox=2.15,48.76,2.19,48.79 size=400,300 format=tiff → HTTP 200 image/tiff 197,486 B (2026-09-05)',
  },
  {
    id: 'nlcd-tcc-2021-conus',
    name: 'NLCD Tree Canopy Cover 2021 v2021-4, CONUS (MRLC/USGS)',
    licence: 'US Government public domain (MRLC)',
    kind: 'geoserver-wcs',
    url: 'https://www.mrlc.gov/geoserver/mrlc_display/wcs',
    coverage: [-127.0, 22.5, -65.0, 51.5],
    layer: 'mrlc_display:nlcd_tcc_conus_2021_v2021-4',
    nativeM: 30,
    vintage: 2021,
    lossAdjusted: true,
    probe: 'WCS 1.0.0 GetCoverage bbox=-73.99,40.76,-73.94,40.80 → HTTP 200 image/tiff 129,938 B (2026-09-05)',
  },
  {
    id: 'nlcd-tcc-2021-seak',
    name: 'NLCD Tree Canopy Cover 2021 v2021-4, southeast Alaska (MRLC/USGS)',
    licence: 'US Government public domain (MRLC)',
    kind: 'geoserver-wcs',
    url: 'https://www.mrlc.gov/geoserver/mrlc_display/wcs',
    coverage: [-180.0, 51.0, -129.0, 72.0],
    layer: 'mrlc_display:nlcd_tcc_SEAK_2021_v2021-4',
    nativeM: 30,
    vintage: 2021,
    lossAdjusted: true,
    probe: 'named in the same GetCapabilities (HTTP 200); the CONUS sibling was value-verified',
  },
  {
    id: 'nlcd-tcc-2021-hawaii',
    name: 'NLCD Tree Canopy Cover 2021 v2021-4, Hawaii (MRLC/USGS)',
    licence: 'US Government public domain (MRLC)',
    kind: 'geoserver-wcs',
    url: 'https://www.mrlc.gov/geoserver/mrlc_display/wcs',
    coverage: [-161.0, 18.5, -154.5, 22.5],
    layer: 'mrlc_display:nlcd_tcc_HAWAII_2021_v2021-4',
    nativeM: 30,
    vintage: 2021,
    lossAdjusted: true,
    probe: 'named in the same GetCapabilities (HTTP 200); the CONUS sibling was value-verified',
  },
  {
    id: 'hansen-gfc-2023v1.11-tc2000',
    name: 'Hansen/UMD Global Forest Change 2023 v1.11 treecover2000 (global 80N–60S)',
    licence: 'CC BY 4.0 — Hansen et al. 2013, University of Maryland',
    kind: 'hansen-gfc-tiles',
    url: 'https://storage.googleapis.com/earthenginepartners-hansen/GFC-2023-v1.11',
    coverage: [-180.0, -60.0, 180.0, 80.0],
    nativeM: 30,
    vintage: 2000,
    /** ⚠ FALSE, and said so in the data: `lossyear` is not subtracted. See the VINTAGE note above. */
    lossAdjusted: false,
    probe: 'HEAD 50N_000E → HTTP 200 len 374,428,822 Accept-Ranges: bytes; windowed read 30S_150E 200×200 px → mean 68.5 % (2026-09-05)',
  },
];

// ── pure: source resolution ──────────────────────────────────────────────────

function bboxesIntersect(a, b) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/** True when `inner` lies wholly inside `outer` — a national raster is only chosen when it covers
 *  the WHOLE bbox, so a border site never gets half its canopy from one source and half from none. */
function bboxContains(outer, inner) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

/**
 * The source to use for `bbox`, in table order: the first whose coverage CONTAINS the bbox entirely.
 * Hansen's coverage is the whole 80N–60S globe, so this returns null only for a bbox that reaches
 * beyond 80 N / below 60 S — which is honestly "no canopy source here", not a silent fallback.
 */
export function resolveCanopySource(bbox, sources = CANOPY_SOURCES) {
  for (const s of sources) if (bboxContains(s.coverage, bbox)) return s;
  return null;
}

/** Every source whose coverage merely TOUCHES the bbox — for the console line that explains a choice. */
export function candidateCanopySources(bbox, sources = CANOPY_SOURCES) {
  return sources.filter((s) => bboxesIntersect(s.coverage, bbox));
}

// ── pure: the global ~12 m cell grid ─────────────────────────────────────────
//
// Anchored at (lon 0, lat 0) in DEGREES so it is independent of the chunk, the region and the run.
// Latitude is quantised FIRST; the band's own centre latitude then fixes that band's longitude
// pitch, so `ix` is derivable from (lon, iy) alone and two chunks at different latitudes still
// agree on every shared cell.

/** Latitude cell index for `lat` at pitch `cellM`. */
export function cellLatIndex(lat, cellM = CANOPY_CELL_M) {
  return Math.floor(lat / (cellM / METRES_PER_DEG_LAT));
}

/** The centre latitude of latitude-band `iy` — the band's own reference for its longitude pitch. */
export function cellBandLat(iy, cellM = CANOPY_CELL_M) {
  return (iy + 0.5) * (cellM / METRES_PER_DEG_LAT);
}

/** Longitude pitch, in degrees, for latitude-band `iy`. */
export function cellLonStep(iy, cellM = CANOPY_CELL_M) {
  const cos = Math.max(MIN_COS_LAT, Math.cos((cellBandLat(iy, cellM) * Math.PI) / 180));
  return cellM / (METRES_PER_DEG_LON_EQUATOR * cos);
}

/** Longitude cell index for `lon` within latitude-band `iy`. */
export function cellLonIndex(lon, iy, cellM = CANOPY_CELL_M) {
  return Math.floor(lon / cellLonStep(iy, cellM));
}

/** The un-jittered centre of cell (ix, iy) as [lon, lat]. */
export function cellCentre(ix, iy, cellM = CANOPY_CELL_M) {
  return [(ix + 0.5) * cellLonStep(iy, cellM), cellBandLat(iy, cellM)];
}

/**
 * A 32-bit integer hash of (ix, iy, salt) — the ONLY source of variation in this file. Deterministic
 * across processes and architectures (all-integer, `Math.imul`, `>>> 0`), so a re-bake or a terrain
 * re-seat reproduces the same scatter rather than a fresh one. Same construction as
 * contextCanopySynth.hashCell, deliberately: the two vegetation sources must jitter alike.
 */
export function hashCell(ix, iy, salt) {
  let h = (ix | 0) * 0x27d4eb2d;
  h = (h ^ ((iy | 0) * 0x165667b1)) >>> 0;
  h = (h ^ ((salt | 0) * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** `hashCell` mapped to [0,1). */
function unitHash(ix, iy, salt) {
  return hashCell(ix, iy, salt) / 0x1_0000_0000;
}

/**
 * The emitted position for cell (ix, iy): its centre displaced by up to ±`jitter` of the cell size
 * in each axis. Returns [lon, lat] rounded to 7 decimals (~1 cm) so the GeoJSONSeq is compact and
 * byte-stable.
 */
export function jitteredCellPoint(ix, iy, cellM = CANOPY_CELL_M, jitter = CANOPY_JITTER_FRACTION) {
  const [clon, clat] = cellCentre(ix, iy, cellM);
  const dLon = cellLonStep(iy, cellM);
  const dLat = cellM / METRES_PER_DEG_LAT;
  const lon = clon + (unitHash(ix, iy, 1) * 2 - 1) * jitter * dLon;
  const lat = clat + (unitHash(ix, iy, 2) * 2 - 1) * jitter * dLat;
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

// ── pure: chunk planning ─────────────────────────────────────────────────────

/**
 * Split `bbox` into fetch chunks no larger than `maxPx` on either edge at the source's native
 * resolution. The last row/column is a short remainder rather than an overhang, so no chunk ever
 * asks the service for pixels outside the region.
 */
export function canopyChunkPlan(bbox, source, opts = {}) {
  const maxPx = opts.maxPx ?? CANOPY_MAX_CHUNK_PX;
  const nativeM = opts.nativeM ?? source?.nativeM ?? 30;
  const [w, s, e, n] = bbox;
  const spanLat = n - s;
  const spanLon = e - w;
  const midLat = (n + s) / 2;
  const heightM = spanLat * METRES_PER_DEG_LAT;
  const widthM = spanLon * METRES_PER_DEG_LON_EQUATOR * Math.max(MIN_COS_LAT, Math.cos((midLat * Math.PI) / 180));
  const totalPxX = Math.max(1, Math.ceil(widthM / nativeM));
  const totalPxY = Math.max(1, Math.ceil(heightM / nativeM));
  const nx = Math.max(1, Math.ceil(totalPxX / maxPx));
  const ny = Math.max(1, Math.ceil(totalPxY / maxPx));
  const chunks = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cw = w + (spanLon * i) / nx;
      const ce = w + (spanLon * (i + 1)) / nx;
      const cs = s + (spanLat * j) / ny;
      const cn = s + (spanLat * (j + 1)) / ny;
      chunks.push({
        bbox: [cw, cs, ce, cn],
        width: Math.max(1, Math.min(maxPx, Math.ceil(totalPxX / nx))),
        height: Math.max(1, Math.min(maxPx, Math.ceil(totalPxY / ny))),
      });
    }
  }
  return chunks;
}

// ── pure: cell sampling ──────────────────────────────────────────────────────

/**
 * Nearest-neighbour read of `raster` (row-major, `width` × `height` over `bbox`) at [lon, lat].
 * Returns `null` when the point falls outside the raster — distinct from a 0 % reading.
 */
export function sampleRasterAt(raster, bbox, width, height, lon, lat) {
  const [w, s, e, n] = bbox;
  // HALF-OPEN [w,e) × [s,n) — the SAME convention `sampleCanopyCells` uses to decide which chunk owns
  // a cell. If the two disagreed by one edge, a cell exactly on a seam would be claimed by a chunk and
  // then refused by its own raster read: silently dropped, and invisible in every counter.
  if (lon < w || lon >= e || lat < s || lat >= n) return null;
  const px = Math.floor(((lon - w) / (e - w)) * width);
  const py = Math.floor(((n - lat) / (n - s)) * height);
  if (px < 0 || px >= width || py < 0 || py >= height) return null;
  const v = raster[py * width + px];
  return v === undefined ? null : v;
}

/**
 * Walk every ~12 m cell whose CENTRE lies in `chunk.bbox`, sample the raster there, and emit one
 * GeoJSON point per cell that measures ≥ `threshold` crown cover.
 *
 * "Centre lies in the chunk" is what makes chunking invisible: a cell belongs to exactly one chunk,
 * so a seam neither duplicates nor drops it. The three counters returned are NOT collapsed — `kept`,
 * `belowThreshold` and `nodata` answer three different questions, and a run whose `nodata` is the
 * whole chunk is a source outage, not a treeless place.
 */
export function sampleCanopyCells(chunk, raster, opts = {}) {
  const threshold = opts.threshold ?? CANOPY_THRESHOLD_PCT;
  const cellM = opts.cellM ?? CANOPY_CELL_M;
  const jitter = opts.jitter ?? CANOPY_JITTER_FRACTION;
  const src = opts.src ?? 'unknown';
  const vintage = opts.vintage ?? null;
  const lossAdjusted = opts.lossAdjusted ?? null;
  const resM = opts.nativeM ?? null;
  const { bbox, width, height } = chunk;
  const [w, s, e, n] = bbox;

  const features = [];
  let kept = 0;
  let belowThreshold = 0;
  let nodata = 0;
  let outside = 0;

  const iy0 = cellLatIndex(s, cellM);
  const iy1 = cellLatIndex(n, cellM);
  for (let iy = iy0; iy <= iy1; iy++) {
    const bandLat = cellBandLat(iy, cellM);
    if (bandLat < s || bandLat >= n) { continue; }
    const ix0 = cellLonIndex(w, iy, cellM);
    const ix1 = cellLonIndex(e, iy, cellM);
    for (let ix = ix0; ix <= ix1; ix++) {
      const [clon] = cellCentre(ix, iy, cellM);
      if (clon < w || clon >= e) { outside++; continue; }
      const v = sampleRasterAt(raster, bbox, width, height, clon, bandLat);
      if (v === null) { outside++; continue; }
      // > 100 is the services' out-of-area / unclassifiable code (EEA 254/255, MRLC GDAL_NODATA 255).
      // It is an ABSENCE OF INFORMATION, never a 0 % reading — counted apart, never emitted.
      if (!Number.isFinite(v) || v > 100 || v < 0) { nodata++; continue; }
      if (v < threshold) { belowThreshold++; continue; }
      const [lon, lat] = jitteredCellPoint(ix, iy, cellM, jitter);
      const properties = {
        // The layer's DEFINING tag — the client's LAYER_DEFINING_TAGS.canopy rejects anything without it.
        canopy: 1,
        /** MEASURED crown cover percent at this cell, from `src`. */
        cover: v,
        src,
        /** ⚠ THE HONESTY BIT. The cover is measured; the POSITION is a grid sample, not a mapped tree. */
        sampled: true,
      };
      if (vintage !== null) properties.vintage = vintage;
      if (lossAdjusted !== null) properties.loss_adjusted = lossAdjusted;
      if (resM !== null) properties.res_m = resM;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });
      kept++;
    }
  }
  return { features, kept, belowThreshold, nodata, outside };
}

// ── pure: scope ──────────────────────────────────────────────────────────────

/** Approximate area of a lon/lat bbox in km², on the equirectangular frame this file uses throughout. */
export function bboxAreaKm2(bbox) {
  const [w, s, e, n] = bbox;
  const midLat = (n + s) / 2;
  const hM = (n - s) * METRES_PER_DEG_LAT;
  const wM = (e - w) * METRES_PER_DEG_LON_EQUATOR * Math.max(MIN_COS_LAT, Math.cos((midLat * Math.PI) / 180));
  return (hM * wM) / 1e6;
}

/**
 * The bboxes to bake for `region` — or a NAMED REFUSAL carrying both numbers and both escape hatches.
 *
 * ⚠ This never returns a truncated area set. A region too large to bake is REFUSED, because a
 * silently-partial canopy layer is indistinguishable at the client from "this city has few trees"
 * (memory `envelope-solid-overstates-partial-data`, applied to vegetation).
 */
export function canopyAreasFor(region, opts = {}) {
  const maxKm2 = opts.maxAreaKm2 ?? CANOPY_MAX_AREA_KM2;
  const parse = opts.parseBbox ?? ((s) => String(s).split(',').map(Number));
  if (Array.isArray(region.canopyBboxes) && region.canopyBboxes.length > 0) {
    const areas = region.canopyBboxes.map((b) => (Array.isArray(b) ? b : parse(b)));
    const over = areas.filter((b) => bboxAreaKm2(b) > maxKm2);
    if (over.length > 0) {
      return {
        refused: true,
        reason: `${over.length} declared canopyBboxes exceed ${maxKm2} km² (largest ${bboxAreaKm2(over[0]).toFixed(0)} km²) — split them`,
        areas: [],
      };
    }
    return { refused: false, areas, why: `${areas.length} declared canopyBboxes` };
  }
  const bbox = Array.isArray(region.bbox) ? region.bbox : parse(region.bbox);
  const km2 = bboxAreaKm2(bbox);
  if (km2 > maxKm2) {
    return {
      refused: true,
      areas: [],
      reason:
        `region bbox is ${km2.toFixed(0)} km², over the ${maxKm2} km² canopy budget. A whole-country ` +
        'canopy at 12 m spacing is order 1e9 points — infeasible, not merely slow. Declare ' +
        `\`canopyBboxes: ['w,s,e,n', …]\` on the region row (city-scale, ≤ ${maxKm2} km² each), or ` +
        'scope one run with `--canopy-bbox w,s,e,n`.',
    };
  }
  return { refused: false, areas: [bbox], why: `region bbox, ${km2.toFixed(0)} km² ≤ ${maxKm2} km² budget` };
}

// ── pure: GeoJSONSeq writing ─────────────────────────────────────────────────

/** §SEQ-WRITE-STREAMED (L-12937) — chunked, never one giant string. France's mnh_fr join died four
 *  hours in on `RangeError: Invalid string length` building a single ~20 M-feature string; a canopy
 *  metro is the same order. 8 MB per append. */
const SEQ_WRITE_CHUNK_CHARS = 8 * 1024 * 1024;

export function writeCanopySeq(path, features) {
  writeFileSync(path, '');
  return appendCanopySeq(path, features);
}

/** Append a batch, same chunking. The per-chunk sink below calls this once per raster chunk so a
 *  metro-scale bake never holds its whole point set in V8 heap (see §CANOPY-STREAM-PER-CHUNK). */
export function appendCanopySeq(path, features) {
  let buf = '';
  let n = 0;
  for (const f of features) {
    buf += JSON.stringify(f) + '\n';
    n++;
    if (buf.length >= SEQ_WRITE_CHUNK_CHARS) { appendFileSync(path, buf); buf = ''; }
  }
  if (buf.length) appendFileSync(path, buf);
  return n;
}

// ── pure: request builders (exported so the spec pins the URL shape without a network) ───────────

export function eeaExportImageUrl(source, chunk) {
  const [w, s, e, n] = chunk.bbox;
  const q = new URLSearchParams({
    bbox: `${w},${s},${e},${n}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${chunk.width},${chunk.height}`,
    format: 'tiff',
    interpolation: 'RSP_NearestNeighbor',
    f: 'image',
  });
  return `${source.url}/exportImage?${q.toString()}`;
}

export function mrlcWcsUrl(source, chunk) {
  const [w, s, e, n] = chunk.bbox;
  // WCS 1.0.0, not 2.0.1: the 2.0.1 endpoint answers `InvalidAxisLabel` for Long/Lat because the
  // coverage's native CRS is Albers. 1.0.0 takes a plain EPSG:4326 bbox + width/height.
  const q = new URLSearchParams({
    service: 'WCS',
    version: '1.0.0',
    request: 'GetCoverage',
    coverage: source.layer,
    bbox: `${w},${s},${e},${n}`,
    crs: 'EPSG:4326',
    response_crs: 'EPSG:4326',
    width: String(chunk.width),
    height: String(chunk.height),
    format: 'GeoTIFF',
  });
  return `${source.url}?${q.toString()}`;
}

/** The Hansen 10°×10° tile whose name encodes its TOP-LEFT corner, for a point. */
export function hansenTileName(lon, lat) {
  const top = Math.ceil(lat / 10) * 10;
  const left = Math.floor(lon / 10) * 10;
  const ns = top >= 0 ? `${top}N` : `${-top}S`;
  const ew = left >= 0 ? `${String(left).padStart(3, '0')}E` : `${String(-left).padStart(3, '0')}W`;
  return `${ns}_${ew}`;
}

export function hansenTileUrl(source, lon, lat) {
  return `${source.url}/Hansen_GFC-2023-v1.11_treecover2000_${hansenTileName(lon, lat)}.tif`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── network ── everything below this line does I/O. Nothing above it does.
// ─────────────────────────────────────────────────────────────────────────────

let _geotiff = null;
async function geotiff() {
  if (_geotiff) return _geotiff;
  try {
    _geotiff = await import('geotiff');
  } catch (e) {
    throw new Error(
      `geotiff is not resolvable from this process (${e && e.message}). The canopy bake decodes ` +
      'GeoTIFF in the HOST node process — install it the way context-bake-canopy.yml does ' +
      '(isolated scratch project, copied into tools/context-bake/node_modules).',
    );
  }
  return _geotiff;
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

/** GET with the same transient-retry policy as bake.mjs's `download` — a 429 must not kill a run. */
async function getBuffer(url, { attempts = 4, timeoutMs = 180_000 } = {}) {
  let last = null;
  for (let a = 1; a <= attempts; a++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(url, { redirect: 'follow', signal: ctl.signal });
      } finally { clearTimeout(t); }
      if (!res.ok) {
        if (TRANSIENT.has(res.status) && a < attempts) {
          const wait = Math.min(60, 5 * 2 ** (a - 1));
          console.warn(`  ⚠ canopy HTTP ${res.status} (attempt ${a}/${attempts}) — retrying in ${wait}s`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const ct = String(res.headers.get('content-type') || '');
      const buf = Buffer.from(await res.arrayBuffer());
      // A GeoServer/ArcGIS error comes back as 200 + XML/JSON. That is the L-469 shape — an error
      // reported IN BAND — and decoding it would surface as "0 canopy" rather than "the source
      // refused". Name it here, where the log still says why.
      if (/xml|json|html/i.test(ct) && !/tiff/i.test(ct)) {
        throw new Error(`source answered ${res.status} with ${ct} (an in-band error, not a raster): ${buf.subarray(0, 240).toString('utf8').replace(/\s+/g, ' ')}`);
      }
      return buf;
    } catch (e) {
      last = e;
      if (a >= attempts) break;
      const wait = Math.min(60, 5 * 2 ** (a - 1));
      console.warn(`  ⚠ canopy fetch error "${e && e.message}" (attempt ${a}/${attempts}) — retrying in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw last ?? new Error('canopy fetch failed');
}

/** Decode a single-band GeoTIFF buffer to `{ raster, width, height }`. */
async function decodeSingleBand(buf) {
  const { fromArrayBuffer } = await geotiff();
  const tif = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tif.getImage();
  const bands = await img.readRasters();
  return { raster: bands[0], width: img.getWidth(), height: img.getHeight() };
}

/**
 * Fetch ONE chunk's raster for `source`. Returns `{ raster, width, height }` — width/height are the
 * DECODED dimensions, which may differ from the requested ones (a service may snap to its own grid),
 * so `sampleCanopyCells` is always told the truth rather than the request.
 */
export async function fetchCanopyChunk(source, chunk) {
  if (source.kind === 'arcgis-imageserver') {
    return decodeSingleBand(await getBuffer(eeaExportImageUrl(source, chunk)));
  }
  if (source.kind === 'geoserver-wcs') {
    return decodeSingleBand(await getBuffer(mrlcWcsUrl(source, chunk)));
  }
  if (source.kind === 'hansen-gfc-tiles') {
    const { fromUrl } = await geotiff();
    const [w, s, e, n] = chunk.bbox;
    // One 10° tile per chunk. A chunk that straddles two Hansen tiles is refused BY NAME rather
    // than half-read — canopyChunkPlan's ≤ 2048 px at 30 m is ~61 km, so this is a rare boundary
    // case and a wrong half-answer is worse than a named gap.
    const nw = hansenTileName(w, n);
    if (hansenTileName(e - 1e-9, s + 1e-9) !== nw) {
      throw new Error(`chunk ${w},${s},${e},${n} straddles Hansen tiles ${nw} and ${hansenTileName(e - 1e-9, s + 1e-9)} — split the bbox on the 10° graticule`);
    }
    const tif = await fromUrl(hansenTileUrl(source, w, n));
    const img = await tif.getImage();
    const bb = img.getBoundingBox();
    const W = img.getWidth();
    const H = img.getHeight();
    const px = (lon) => Math.max(0, Math.min(W, Math.round(((lon - bb[0]) / (bb[2] - bb[0])) * W)));
    const py = (lat) => Math.max(0, Math.min(H, Math.round(((bb[3] - lat) / (bb[3] - bb[1])) * H)));
    const win = [px(w), py(n), px(e), py(s)];
    const width = win[2] - win[0];
    const height = win[3] - win[1];
    if (width <= 0 || height <= 0) throw new Error(`empty Hansen window for ${w},${s},${e},${n}`);
    const bands = await img.readRasters({ window: win });
    return { raster: bands[0], width, height };
  }
  throw new Error(`unknown canopy source kind '${source.kind}'`);
}

/**
 * Sample every chunk of `bbox`. `onChunk` prints progress so a long region does not go quiet for an
 * hour; `sink` (when given) CONSUMES each chunk's features and they are NOT retained.
 *
 * §CANOPY-STREAM-PER-CHUNK — ⚠ the first Sydney dry run died on `Maximum call stack size exceeded`,
 * inside `features.push(...chunkFeatures)`: Ku-ring-gai Chase NP yields ~180 k canopies in ONE 25 km²
 * chunk and a spread call passes them as ARGUMENTS. Jouy's 34 k had fitted, so the bug was invisible
 * exactly until the data got dense — the same shape as the §SEQ-WRITE-STREAMED `RangeError`. Both
 * halves are fixed here: batches are appended element-wise, and a `sink` lets a metro-scale bake go
 * straight to disk instead of holding millions of objects in V8 heap.
 */
export async function sampleCanopyForBbox(bbox, opts = {}) {
  const source = opts.source ?? resolveCanopySource(bbox);
  if (!source) {
    return {
      source: null, features: [], kept: 0, belowThreshold: 0, nodata: 0,
      chunks: 0, chunksFailed: 0, errors: [],
      refusal: `no canopy source covers ${bbox.join(',')} — every table row's coverage excludes it (Hansen stops at 80 N / 60 S)`,
    };
  }
  const chunks = canopyChunkPlan(bbox, source, opts);
  const sink = opts.sink ?? null;
  const features = [];
  let kept = 0; let belowThreshold = 0; let nodata = 0; let chunksFailed = 0;
  const errors = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    try {
      const { raster, width, height } = await fetchCanopyChunk(source, c);
      const got = sampleCanopyCells({ bbox: c.bbox, width, height }, raster, {
        threshold: opts.threshold ?? CANOPY_THRESHOLD_PCT,
        cellM: opts.cellM ?? CANOPY_CELL_M,
        src: source.id,
        vintage: source.vintage,
        lossAdjusted: source.lossAdjusted,
        nativeM: source.nativeM,
      });
      // NEVER `push(...got.features)` — see §CANOPY-STREAM-PER-CHUNK above.
      if (sink) sink(got.features);
      else for (const f of got.features) features.push(f);
      kept += got.kept; belowThreshold += got.belowThreshold; nodata += got.nodata;
      opts.onChunk?.(i + 1, chunks.length, got, c);
    } catch (err) {
      chunksFailed++;
      errors.push(`chunk ${i + 1}/${chunks.length} ${c.bbox.join(',')}: ${err && err.message}`);
      console.warn(`  ⚠ canopy chunk ${i + 1}/${chunks.length} FAILED — ${err && err.message}`);
    }
  }
  return { source, features, kept, belowThreshold, nodata, chunks: chunks.length, chunksFailed, errors };
}

/**
 * Bake ONE region's canopy to `outPath` as GeoJSONSeq, streaming. Returns the honest outcome record
 * bake.mjs prints and gates on. A REFUSED region (over the area budget) writes NO file and says why —
 * an absence with a reason, never an empty artefact (§CONTEXT-DATA-HONESTY).
 */
export async function bakeCanopyForRegion(region, outPath, opts = {}) {
  const scope = canopyAreasFor(region, opts);
  if (scope.refused) {
    return { region: region.name, status: 'refused', reason: scope.reason, kept: 0, belowThreshold: 0, nodata: 0, areas: 0, chunksFailed: 0, sources: [] };
  }
  writeFileSync(outPath, '');
  let kept = 0; let belowThreshold = 0; let nodata = 0; let chunksFailed = 0; let written = 0;
  const sources = new Set();
  const errors = [];
  for (const area of scope.areas) {
    const res = await sampleCanopyForBbox(area, {
      ...opts,
      sink: (feats) => { written += appendCanopySeq(outPath, feats); },
      onChunk: (i, n, got, c) => console.log(
        `  · canopy · ${region.name} chunk ${i}/${n} ${c.bbox.map((x) => x.toFixed(3)).join(',')} → kept ${got.kept} · below ${got.belowThreshold} · nodata ${got.nodata}`,
      ),
    });
    if (res.refusal) { errors.push(res.refusal); continue; }
    if (res.source) sources.add(res.source.id);
    kept += res.kept; belowThreshold += res.belowThreshold; nodata += res.nodata; chunksFailed += res.chunksFailed;
    errors.push(...res.errors);
  }
  // A region whose every chunk failed is a SOURCE OUTAGE, not a treeless region. It is reported as
  // `error` and produces no file, so the layer is honestly ABSENT there rather than honestly empty.
  const status = written > 0 ? 'ok' : (chunksFailed > 0 || errors.length > 0 ? 'error' : 'empty');
  return { region: region.name, status, kept, belowThreshold, nodata, written, areas: scope.areas.length, chunksFailed, errors, sources: [...sources], why: scope.why };
}

/**
 * §CANOPY-LAYER — bake the `canopy` layer for a set of REGIONS, one GeoJSONSeq each, and return the
 * paths that actually carry features. THE ONE entry point bake.mjs calls, so the bake's own hunk
 * stays a handful of lines in a file several lanes edit at once.
 *
 * ⚠ Prints a per-region line for EVERY region including the refused and the failed ones, with the
 * three counters apart. A region absent from the return value is absent from the tileset, and the
 * console says which of the three reasons it was: refused (over budget), error (source refused every
 * chunk), or empty (the raster genuinely measures no canopy ≥ threshold there).
 */
export async function bakeCanopyLayerForRegions(regions, outDir, opts = {}) {
  const { resolve } = await import('node:path');
  const { statSync } = await import('node:fs');
  const outcomes = [];
  const geos = [];
  console.log(`\n▶ canopy · MEASURED tree-cover rasters → ${regions.length} region(s)`);
  console.log(`  threshold ${CANOPY_THRESHOLD_PCT} % · cell ${CANOPY_CELL_M} m · budget ${opts.maxAreaKm2 ?? CANOPY_MAX_AREA_KM2} km²/region`);
  for (const r of regions) {
    const out = resolve(outDir, `${r.name}-canopy.geojsonseq`);
    if (opts.dryRun) {
      const scope = canopyAreasFor(r, opts);
      console.log(scope.refused
        ? `  · canopy · ${String(r.name).padEnd(16)} REFUSED — ${scope.reason}`
        : `  · canopy · ${String(r.name).padEnd(16)} ${scope.areas.length} area(s) (${scope.why}) → ${out}`);
      outcomes.push({ region: r.name, status: scope.refused ? 'refused' : 'planned', reason: scope.reason });
      continue;
    }
    const o = await bakeCanopyForRegion(r, out, opts);
    outcomes.push(o);
    if (o.status === 'ok') {
      geos.push(out);
      console.log(`  ✔ canopy · ${String(r.name).padEnd(16)} ${o.kept} sampled canopy point(s) [src ${o.sources.join('+')}] · below-threshold ${o.belowThreshold} · nodata ${o.nodata} · ${(statSync(out).size / 1e6).toFixed(1)} MB`);
    } else if (o.status === 'refused') {
      console.warn(`  ⚠ canopy · ${String(r.name).padEnd(16)} REFUSED — ${o.reason}`);
    } else if (o.status === 'error') {
      console.error(`  ✖ canopy · ${String(r.name).padEnd(16)} SOURCE REFUSED every chunk (${o.chunksFailed} failed) — NO file. This is an outage, NOT a treeless region: ${(o.errors || [])[0] ?? 'no error captured'}`);
    } else {
      console.log(`  · canopy · ${String(r.name).padEnd(16)} 0 point(s) — the raster measures no cover ≥ ${CANOPY_THRESHOLD_PCT} % here (an honest empty, not a failure: ${o.belowThreshold} cell(s) read below threshold, ${o.nodata} nodata)`);
    }
  }
  return { geos, outcomes };
}

// ── CLI (the dry run) ────────────────────────────────────────────────────────
//
//   node tools/context-bake/canopy.mjs --bbox 2.15,48.76,2.19,48.79 [--out out/jouy-canopy.geojsonseq]
//
// Prints the source it chose, the three counters SEPARATELY, and the bytes written.

const isMain = (() => {
  try { return process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()); }
  catch { return false; }
})();

if (isMain && process.argv.includes('--bbox')) {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const bbox = arg('--bbox').split(',').map(Number);
  const out = arg('--out', null);
  const forced = arg('--source', null);
  const source = forced ? CANOPY_SOURCES.find((s) => s.id === forced) : resolveCanopySource(bbox);
  console.log(`▶ canopy sample · bbox ${bbox.join(',')} (${bboxAreaKm2(bbox).toFixed(1)} km²)`);
  console.log(`  candidates : ${candidateCanopySources(bbox).map((s) => s.id).join(', ') || 'none'}`);
  console.log(`  chosen     : ${source ? `${source.id} — ${source.name} (${source.nativeM} m, vintage ${source.vintage}, loss-adjusted ${source.lossAdjusted})` : 'NONE'}`);
  const t0 = Date.now();
  const res = await sampleCanopyForBbox(bbox, {
    source,
    onChunk: (i, n, got, c) => console.log(`  chunk ${i}/${n} ${c.bbox.map((x) => x.toFixed(4)).join(',')} → kept ${got.kept} · below-threshold ${got.belowThreshold} · nodata ${got.nodata}`),
  });
  if (res.refusal) { console.error(`✖ ${res.refusal}`); process.exit(2); }
  console.log(
    `\n── canopy sample (§CONTEXT-DATA-HONESTY: three counters, never collapsed) ──\n` +
    `  kept (cover ≥ ${CANOPY_THRESHOLD_PCT} %) : ${res.kept}\n` +
    `  below threshold             : ${res.belowThreshold}\n` +
    `  NODATA (source had nothing) : ${res.nodata}\n` +
    `  chunks ${res.chunks} (${res.chunksFailed} failed) in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  if (out) {
    const n = writeCanopySeq(out, res.features);
    const { statSync } = await import('node:fs');
    console.log(`  → ${out}: ${n} feature(s), ${(statSync(out).size / 1e6).toFixed(2)} MB`);
  }
}
