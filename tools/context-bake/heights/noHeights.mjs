// ─────────────────────────────────────────────────────────────────────────────
// §NDH-NO-NDSM (2026-09-05, lane HEIGHTS-NORDICS) — Kartverket Nasjonal høydemodell (NHM) DOM − DTM:
// the PURE, dependency-free half of the Norwegian national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE (the heights/mnhFr.mjs + heights/swissNdsm.mjs + heights/nl3dbag.mjs shape):
// vitest cannot import heightSources.mjs, so every DECISION the stamp makes — endpoint + coverage ids,
// the WCS 1.0.0 URL shape, UTM33 tile keying, the request-size rule, the nodata rule, the city working
// set — lives here as a total function of its arguments and is unit-tested (noHeights.spec.ts). The
// network + raster half is heights/noHeightsStamp.mjs, which imports these and moves bytes.
//
// THE CHANNEL — LIVE-PROBED 2026-09-05, every number below is a measurement, not a reading:
//   • TWO keyless ArcGIS WCS 1.0.0 services on wcs.geonorge.no (the DTM one is ALREADY the terrain.mjs
//     `no` adapter; the DOM one is its sibling, same dialect):
//       DTM  https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833  COVERAGE=nhm_dtm_topo_25833
//       DOM  https://wcs.geonorge.no/skwms1/wcs.hoyde-dom-nhm-25833  COVERAGE=nhm_dom_topo_25833
//     GetCapabilities (VERSION=1.0.0) → HTTP 200 text/xml 4,140 B on both, <fees>free</fees>,
//     <accessConstraints>None</accessConstraints>; DescribeCoverage → nativeCRSs EPSG:25833, formats
//     GeoTIFF/HDF/JPEG2000/NetCDF, grid high 1250529 × 1600549 (i.e. a NATIONAL 1 m grid, origin
//     -100274.5 / 8000274.5). Both documents are saved VERBATIM under __tests__/fixtures/.
//   • GetCoverage (CRS=EPSG:25833, BBOX in native metres, WIDTH/HEIGHT, FORMAT=GeoTIFF) over a 500 m
//     box at 1 m → HTTP 200 image/tiff, 1,049,839 B, ONE Float32 band (SampleFormat 3, 32 bits),
//     0.8–1.8 s; a 1,080 px box → 5,310,199 B in 1.8 s. ⚠ NO GDAL_NODATA tag (probed `undefined`):
//     the ArcGIS float sentinel (±3.4e38) is the only void marker, hence `isNdhNodata` below.
//   • DOM − DTM measured over the three working-set centres (500 × 500 m each, 250,000 cells, ZERO
//     nodata cells in all six rasters):
//       Oslo      DTM p50 2.9 m · DOM p50 6.1 m · nDSM p50 2.8 · p90 24.2 · max 99.7 m · 49.3 % of cells > 3 m
//       Bergen    DTM p50 4.2 m · DOM p50 8.3 m · nDSM p50 0.9 · p90 21.2 · max 50.6 m · 43.6 % > 3 m
//       Trondheim DTM p50 10.9 m · DOM p50 16.6 m · nDSM p50 6.0 · p90 18.5 · max 48.9 m · 57.0 % > 3 m
//     i.e. plausible 4–8-storey city cores over near-sea-level ground. Both products share the NN2000
//     vertical datum, so DOM − DTM is datum-free height above ground. ⚠ The DOM is ALL sursol
//     (vegetation too) — P90 over the eroded footprint interior, exactly the DK/FR/CH mitigation.
//   • Licence: the capabilities say fees=free / accessConstraints=None (measured); the Geonorge product
//     pages for "Høydedata — Nasjonal høydemodell DTM/DOM" publish it under CC BY 4.0 (Kartverket) —
//     attribution "© Kartverket". No key, no account, no repo secret. This is the FREE path the
//     August REGION_SOURCE note named (FKB-Bygning surveyed top-height stays licence-gated commercial and
//     is NOT used here).
//   • Coverage: the WCS grid is national; a box with no data returns the sentinel, reported as a VOID,
//     never an error — failure and empty stay different values (§CONTEXT-DATA-HONESTY).
// ─────────────────────────────────────────────────────────────────────────────

export const NO_NDH = {
  dtmEndpoint: 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833',
  domEndpoint: 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dom-nhm-25833',
  dtm: 'nhm_dtm_topo_25833',   // bare-earth terrain model (= terrain.mjs `no` adapter's coverage)
  dom: 'nhm_dom_topo_25833',   // surface model — buildings + vegetation
  crs: 'EPSG:25833',           // ETRS89 / UTM 33N — in reproject.mjs PROJ_DEFS already (the Oslo control point)
  format: 'GeoTIFF',           // the ArcGIS spelling (DK's Datafordeler says GTiff; do not copy that here)
  nativeResM: 1.0,
  maxPx: 1100,                 // = terrain.mjs `no` maxPx — the largest request the service was seen to honour
  tileM: 1000,                 // 1 km native tiles: 1,000 px at 1 m ≈ 5.3 MB per raster (probed 1,080 px = 5.3 MB / 1.8 s)
  padM: 20,                    // erosion + bilinear margin so a footprint on a tile edge is not sampled against void
  nodataMag: 1e5,              // no GDAL_NODATA tag → the ArcGIS float sentinel (|v| ≈ 3.4e38) is the void marker
  heightSourceTag: 'kartverket-nhm-ndsm',
  attribution: '© Kartverket — Nasjonal høydemodell DTM 1 m + DOM 1 m (CC BY 4.0)',
};

/** WCS 1.0.0 GetCoverage URL for ONE NHM coverage over a native EPSG:25833 box → a GeoTIFF. `which` ∈ {'dtm','dom'}. */
export function noNdhCoverageUrl(which, [x0, y0, x1, y1], dim, cfg = NO_NDH) {
  const endpoint = which === 'dom' ? cfg.domEndpoint : cfg.dtmEndpoint;
  const coverage = which === 'dom' ? cfg.dom : cfg.dtm;
  return `${endpoint}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${coverage}` +
    `&CRS=${cfg.crs}&BBOX=${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}` +
    `&WIDTH=${dim}&HEIGHT=${dim}&FORMAT=${cfg.format}`;
}

/** UTM33 easting/northing (m) → the stamp's 1 km tile key { e, n } (km), e.g. Oslo S 262410,6649018 → { e: 262, n: 6649 }. */
export function utm33TileKey(X, Y, tileM = NO_NDH.tileM) {
  return { e: Math.floor(X / tileM), n: Math.floor(Y / tileM) };
}

/** Native EPSG:25833 [minX, minY, maxX, maxY] of a tile key. */
export function utm33TileBbox({ e, n }, tileM = NO_NDH.tileM) {
  return [e * tileM, n * tileM, (e + 1) * tileM, (n + 1) * tileM];
}

/**
 * The ONE GetCoverage request a tile costs: the padded native box and the square pixel dimension at
 * `resM`, capped at `maxPx` so a mis-set tile size degrades resolution instead of being refused by the
 * service. 1 km + 2 × 20 m pad at 1 m → 1,040 px (≤ 1,100 probed max).
 */
export function noNdhTileRequest(key, { tileM = NO_NDH.tileM, padM = NO_NDH.padM, resM = NO_NDH.nativeResM, maxPx = NO_NDH.maxPx } = {}) {
  const [x0, y0, x1, y1] = utm33TileBbox(key, tileM);
  const box = [x0 - padM, y0 - padM, x1 + padM, y1 + padM];
  const spanM = Math.max(box[2] - box[0], box[3] - box[1]);
  const dim = Math.max(2, Math.min(maxPx, Math.round(spanM / resM)));
  return { box, dim };
}

/** NHM void rule — no GDAL_NODATA tag is published, so NaN / non-finite / |v| ≥ nodataMag (the ArcGIS ±3.4e38 sentinel) is void. */
export function isNdhNodata(v, nodataMag = NO_NDH.nodataMag) {
  return !Number.isFinite(v) || Math.abs(v) >= nodataMag;
}

/**
 * Parse a WCS 1.0.0 GetCapabilities document (the ArcGIS dialect Geonorge serves) → the coverage names
 * plus the fee / access lines, or **null** for a body that is not one (an exception report, HTML, empty).
 * The caller must treat null as UNKNOWN — never as "no coverages here".
 */
export function parseWcs1Capabilities(text) {
  if (typeof text !== 'string' || !/<WCS_Capabilities\b/.test(text)) return null;
  const version = text.match(/<WCS_Capabilities[^>]*\bversion="([^"]+)"/)?.[1] ?? null;
  const coverages = [];
  const re = /<CoverageOfferingBrief>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/CoverageOfferingBrief>/g;
  for (const m of text.matchAll(re)) coverages.push(m[1].trim());
  const fees = text.match(/<fees>([^<]*)<\/fees>/)?.[1]?.trim() ?? null;
  const accessConstraints = text.match(/<accessConstraints>([^<]*)<\/accessConstraints>/)?.[1]?.trim() ?? null;
  return { version, coverages, fees, accessConstraints };
}

/**
 * Parse a WCS 1.0.0 DescribeCoverage document → { name, nativeCrs, formats, gridHigh:[cols,rows] } or
 * **null** when the body is not one. `gridHigh` is the national grid extent in cells (1 m each).
 */
export function parseWcs1DescribeCoverage(text) {
  if (typeof text !== 'string' || !/<CoverageDescription\b/.test(text)) return null;
  const name = text.match(/<CoverageOffering>[\s\S]*?<name>([^<]+)<\/name>/)?.[1]?.trim() ?? null;
  const nativeCrs = text.match(/<nativeCRSs>([^<]+)<\/nativeCRSs>/)?.[1]?.trim() ?? null;
  const formats = [...text.matchAll(/<formats>([^<]+)<\/formats>/g)].map((m) => m[1].trim());
  const high = text.match(/<gml:high>([^<]+)<\/gml:high>/)?.[1]?.trim().split(/\s+/).map(Number) ?? null;
  return { name, nativeCrs, formats, gridHigh: high && high.length === 2 && high.every(Number.isFinite) ? high : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// §NO-NDH-CITY-BBOXES — the `norway` national row's stamp working set (the NO analogue of
// MDS_CITY_BBOXES / DHM_CITY_BBOXES / MNH_FR_CITY_BBOXES / SWISS_CITY_BBOXES, mandatory for the same
// reason: §HEIGHT-STAMP-BUDGET / L-659 — a whole-country join with no bounded area holds every
// Norwegian footprint in the V8 heap). Footprints outside these bboxes stream through with their
// original OSM tags — never a fabricated height. Each bbox costs ≈ its 1 km UTM33 tile count × 2
// GetCoverage fetches (~5 MB each at 1 m).
//
// PROVENANCE: oslo is BYTE-IDENTICAL to terrain.mjs's `no` REGIONS row (the §MDS-BBOX-MUST-COVER-THE-
// REGION invariant, pinned by noHeights.spec.ts), so the baked terrain and the stamped heights cover the
// same ground. bergen + trondheim (2nd / 3rd largest cities) are tight metro-core extents; every bbox is
// inside the bake.mjs `norway` region bbox (4.50,57.90,31.20,71.20 — pinned).
// ─────────────────────────────────────────────────────────────────────────────
export const NO_NDH_CITY_BBOXES = [
  // city          [w, s, e, n] (WGS84, osmium -b order)                       ≈ 1 km tiles
  { city: 'oslo',      bbox: [10.66, 59.88, 10.83, 59.96] },   // = terrain.mjs no row · ~10×9
  { city: 'bergen',    bbox: [5.28, 60.36, 5.36, 60.42] },     // Bergenhus / Årstad core · ~5×7
  { city: 'trondheim', bbox: [10.35, 63.40, 10.46, 63.45] },   // Midtbyen + Lerkendal · ~6×6
];
