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
  // ⚠ MEASURED CEILING, not a guess (re-probed 2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B, same
  // Oslo origin 262000/6648000 at 2 m/px): dim 1100 → HTTP 200 5,310,199 B 2.35 s · 1600 → 200
  // 11,078,071 B 3.02 s · 2000 → 200 16,780,399 B 3.25 s · 2500 → 200 26,218,735 B 5.24 s ·
  // **3000 → HTTP 504 text/html 764 B after 30.24 s** · 4000 → HTTP 504 after 30.28 s. The wall is a
  // 30-SECOND GATEWAY TIMEOUT, not a size refusal — so the honest cap is "what renders well inside
  // 30 s", and 2000 (3.25 s, an 8× margin) is that with room for a slow minute. The old 1100 was
  // never the service's limit; it was the largest anyone had tried. Raising it is what makes the
  // national sweep affordable: per km² the cost falls 1.10 → 1.05 MB and 0.49 → 0.20 s.
  maxPx: 2000,
  legacyMaxPx: 1100,           // = terrain.mjs `no` maxPx — kept for the 1 km per-tile path's shape
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


// ──────────────────────────────────────────────────────────────────────────────
// §NO-NATIONAL (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — the retain set is now the WHOLE COUNTRY,
// not oslo/bergen/trondheim.
//
// ── THE DEFECT THIS REMOVES ────────────────────────────────────────────────────────
// NO_NDH_CITY_BBOXES was BOTH the priority order AND the retain set, so Stavanger, Tromsø, Drammen,
// Kristiansand, Troms and every fjord village could never be measured by any number of re-bakes —
// silently, because an unstamped footprint ships the honest `assumed` 9 m, the same value the client
// shows where a source truly has no data (L-422/457/467/469). The NHM grid is NATIONAL (DescribeCoverage
// gml:high 1250529 × 1600549 at 1 m); only the REACH was missing.
//
// ── THE MEASURED COST, and why Norway is affordable at all ───────────────────────────────────
// TWO measurements decided the shape, and both were run rather than assumed:
//  1. RESOLUTION. The join asked for 1 m because the grid is 1 m. Re-measured 2026-09-06 on 1,057 REAL
//     Oslo OSM footprints (10.735,59.910–10.755,59.920, Overpass), the SAME join at three resolutions:
//        1 m  762/1057 measured · 42.3 MB · 15.2 s   (median 17.33 m)
//        2 m  688/1057 measured · 13.1 MB ·  5.0 s   (median 17.64 m)
//        4 m  820/1057 measured ·  4.7 MB ·  2.6 s   (median 18.42 m)
//     Paired, on the SAME buildings: 1 m vs 2 m → Δ p05 −0.70 · p50 −0.10 · p95 +0.40 m (n 688);
//     1 m vs 4 m → Δ p05 −1.90 · p50 −0.60 · p95 +0.20 m (n 595). ⇒ **2 m costs a tenth of a metre of
//     median height and 3.2× fewer bytes.** 4 m costs 0.6 m, which starts to matter on a single-storey
//     house, so the sweep asks for 2 m and says so per footprint.
//  2. REQUEST SIZE — see NO_NDH.maxPx above: dim 2000 is served in 3.25 s; 3000 is a 504 at 30 s.
// ⇒ CELL = 0.068° lon × 0.036° lat ≈ 4.0 × 4.0 km at 58 °N (the SOUTHERNMOST, widest metres-per-degree
//   latitude in the `norway` row, so no cell anywhere in the country asks for more than dim 2000; by
//   71 °N the same cell is 2.5 km wide and cheaper still). ONE cell = 2 GetCoverage requests ≈ 9.7 MB
//   and ≈ 6.5 s serial, ≈ 1.6 s at concurrency 4 — for 16 km² of ground.
//
// ⚠ NORWAY IS NOT CLAIMED "COMPLETE" BY THIS. What is national is the RETAIN SET and the REACH: any
// Norwegian footprint the bake clipped can now be measured, and the sweep visits POPULATED cells in a
// deterministic south→north order with an exact resume cursor. How much one dispatch covers is
// PRINTED (km² stamped / km² skipped / cursor), never assumed — and the three cities are stamped
// FIRST and UNCAPPED on every run (§PRIORITY-OR-THE-CITIES-REGRESS), so widening the retain set can
// never cost Oslo, Bergen or Trondheim the heights they have today.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * §NO-NATIONAL-BBOX — BYTE-IDENTICAL to the bake.mjs `norway` region row (`bbox:
 * '4.50,57.90,31.20,71.20'`), pinned by noHeights.spec.ts. A retain set smaller than the baked region
 * is exactly the silent, permanent hole §MDS-BBOX-MUST-COVER-THE-REGION exists to forbid.
 */
export const NO_NATIONAL_BBOX = [4.50, 57.90, 31.20, 71.20];
export const NO_NATIONAL_BBOXES = [NO_NATIONAL_BBOX];

/** The national sweep's cell, in degrees — ≈ 4.0 × 4.0 km at 58 °N (MEASURED, see above). */
export const NO_TILE_LON_DEG = 0.068;
export const NO_TILE_LAT_DEG = 0.036;

/** Sample resolution for the national sweep: 2 m, which costs a MEASURED −0.10 m of median height
 *  against 1 m and 3.2× fewer bytes. The erosion and sampling step move with it (a 1 m erosion at
 *  2 m/px is less than one pixel of protection against the roof edge). */
export const NO_SWEEP_RES_M = 2;
export const NO_SWEEP_ERODE_M = 2.0;
export const NO_SWEEP_STEP_M = 2.0;

/**
 * §NO-SWATHE — tile ROWS per bounded-heap pass. Norway's 13.3° of latitude is 370 rows at 0.036°;
 * 40 rows = 1.44° of latitude per band, 10 bands. At the measured ~1,256 B of heap per parsed
 * footprint (geojsonseqRead.spec.ts §heap-budget) Norway's ~3 M OSM buildings would be ~3.8 GB in ONE
 * pass — more than the bake job can hold beside tippecanoe. Ten bands keep the peak near 400 MB.
 */
export const NO_SWATHE_ROWS = 40;

/** Courtesy concurrency against Kartverket's keyless WCS (each cell is TWO GetCoverage requests).
 *  Cells are issued in ORDERED batches, so the resume cursor stays exact. */
export const NO_SWEEP_CONCURRENCY = 4;

/**
 * The ONE pair of GetCoverage requests a national CELL costs: the padded native EPSG:25833 box and the
 * pixel dimensions at `resM`, capped at `maxPx` so a mis-sized cell degrades RESOLUTION instead of
 * being refused (or 504-ing) by the service.
 *
 * `project(lon, lat) → [X, Y]` is passed IN rather than imported, so this stays a total function of
 * its arguments and noHeights.spec.ts can pin it against a stub projector. The cell is projected by
 * its FOUR CORNERS and bounded: a lon/lat rectangle is not a rectangle in UTM, and taking two corners
 * would clip the ground the cell's own footprints sit on.
 */
export function noNdhCellRequest([w, s, e, n], project, { resM = NO_SWEEP_RES_M, padM = NO_NDH.padM, maxPx = NO_NDH.maxPx } = {}) {
  const corners = [project(w, s), project(e, s), project(w, n), project(e, n)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [X, Y] of corners) {
    if (!Number.isFinite(X) || !Number.isFinite(Y)) return null;   // unprojectable — the caller counts a FAILURE
    if (X < x0) x0 = X; if (X > x1) x1 = X;
    if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  const box = [x0 - padM, y0 - padM, x1 + padM, y1 + padM];
  const wPx = Math.max(2, Math.min(maxPx, Math.round((box[2] - box[0]) / resM)));
  const hPx = Math.max(2, Math.min(maxPx, Math.round((box[3] - box[1]) / resM)));
  return { box, width: wPx, height: hPx };
}

/** WCS 1.0.0 GetCoverage URL for a NON-SQUARE window (the national sweep's cell). `noNdhCoverageUrl`
 *  above stays as-is for the square 1 km tile path; this one takes width ≠ height. */
export function noNdhWindowUrl(which, [x0, y0, x1, y1], width, height, cfg = NO_NDH) {
  const endpoint = which === 'dom' ? cfg.domEndpoint : cfg.dtmEndpoint;
  const coverage = which === 'dom' ? cfg.dom : cfg.dtm;
  return `${endpoint}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${coverage}` +
    `&CRS=${cfg.crs}&BBOX=${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}` +
    `&WIDTH=${width}&HEIGHT=${height}&FORMAT=${cfg.format}`;
}
