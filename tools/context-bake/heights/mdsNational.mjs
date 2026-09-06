// ─────────────────────────────────────────────────────────────────────────────
// §MDS-NATIONAL-TILING (L-12946, 2026-09-06, lane ES-WHOLE-COUNTRY-HEIGHTS)
//
// The pure half of "wire the whole and complete country" for Spain's measured building heights:
// the tile grid, the swathe (bounded-heap pass) plan, the sweep order, the resume cursor and the
// square-kilometre accounting. No I/O, no geotiff, no fetch — so vitest can import it directly
// (heightSources.mjs cannot be imported by vitest; see mdsBboxCoversTerrainRegion.spec.ts).
//
// ── THE DEFECT THIS EXISTS TO REMOVE ────────────────────────────────────────────────────────────
// Spain's height join never lacked a national SOURCE. `mds_edificacion` (CNIG MDS Edificación,
// coverage `mdsn_e025`) is ONE keyless CC-BY WCS over ONE EPSG:3042 grid covering all of Spain, and
// the 2.5 m pixel value IS the building height above ground (an nDSM already isolated to the
// building class — no DSM−DTM subtraction). What was missing was REACH: the join's working set was
// the hard-coded nine-row `MDS_CITY_BBOXES`, which is BOTH the priority order AND the retain set
// (bake.mjs stampBboxesFor → §HEIGHT-STAMP-BUDGET, L-659). A city absent from that list could never
// be stamped by any number of re-bakes, and the failure was SILENT: an unstamped footprint reports
// an honest `assumed` 9 m, indistinguishable from "the source has no data here" (the failure-vs-
// empty family, L-422/457/467/469). Founder, 2026-09-06, at Ciudad Real: "still a big Spanish city,
// but the buildings don't have real baked heights." Ciudad Real is not in the nine.
//
// ── THE MEASURED CEILING (probed 2026-09-06, exact answers recorded — never cite a URL you did not
//    reach) ───────────────────────────────────────────────────────────────────────────────────────
// GetCapabilities  https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities&version=2.0.1
//   → HTTP 200, 8,702 B, 0.50 s; CoverageIds: mds05, mdsn_v025, mdsn_e025.
// DescribeCoverage COVERAGEID=mdsn_e025
//   → HTTP 200, 2,523 B. Native grid EPSG:3042, GridEnvelope high "858351 697007"
//     (858,352 × 697,008 px), offsetVector 2.502229 m, envelope lowerCorner 3122758.311
//     -1005856.923 / upperCorner 4866831.867 1141936.252. ONE grid, whole country.
// GetCoverage COVERAGEID=mdsn_e025 FORMAT=image/tiff, SUBSET lat/long in EPSG:4326, square boxes
// centred on Ciudad Real (38.9861,-3.9271) — and REPEATED at 36.0 N and 43.5 N, which returned
// BYTE-IDENTICAL sizes, so the served grid is fixed in DEGREES per pixel, not metres:
//     span 0.025°  HTTP 200 image/tiff   1,721,171 B   5.2 s    817 ×  1052 px
//     span 0.05°   HTTP 200 image/tiff   6,889,011 B   3.2 s   1635 ×  2104 px
//     span 0.06°   HTTP 200 image/tiff   9,917,591 B   2.1–5.7 s
//     span 0.07°   HTTP 200 image/tiff  13,504,979 B   1.9–3.9 s
//     span 0.08°   HTTP 200 image/tiff  17,636,861 B   1.8–7.8 s  2615 × 3367 px
//     span 0.09°   HTTP 200 image/tiff  22,319,411 B   2.3–3.0 s
//     span 0.095°  HTTP 200 image/tiff  24,868,075 B   2.5–4.3 s   ← LARGEST SERVED
//     span 0.10°   HTTP 400 text/xml        597 B    0.03–0.13 s   ← REFUSED, at all three latitudes
//   The refusal is the service's own sentence, verbatim:
//     "msWCSGetCoverage20(): WCS server error. Raster size out of range, width and height of
//      resulting coverage must be no more than MAXSIZE=4096."
//   From the 0.08° answer the served grid is DEG_PER_PX_LAT = 0.08/3367 = 2.3760e-5 ° and
//   DEG_PER_PX_LON = 0.08/2615 = 3.0593e-5 ° — both CONSTANT with latitude (identical byte counts at
//   36.0/39.0/43.5 N). So the ceiling is 4096 px on each axis independently:
//     max lat span = 4096 × 2.3760e-5 = 0.0973°   (latitude BINDS — 0.095 served, 0.100 refused ✔)
//     max lon span = 4096 × 3.0593e-5 = 0.1253°   (longitude has ~29 % more headroom)
//   ⇒ the tile is deliberately RECTANGULAR. A square 0.08° tile covers ~62 km²; the 0.09 × 0.115
//   tile below covers ~100 km² for one request — 1.6× the ground per fetch, on the same ceiling.
//
// ⛔ Do NOT "simplify" this back to one square `tileSpanDeg`. The squareness is not a style choice;
//    it throws away 29 % of the served longitude for nothing, on a job that is wall-clock bound.
// ⛔ Do NOT raise the spans to the measured maximum. `padDeg` is added on every side before the
//    request, so the REQUESTED box is (span + 2·pad); at pad 0.0015 a 0.09 lat span asks for 0.093°
//    = 3,914 px, and 0.0973 would ask for 4,222 px and be REFUSED at every tile. The margin is the
//    pad plus room for the pad to grow.
// ─────────────────────────────────────────────────────────────────────────────

/** The service's own hard limit, in its own words (see the header for the verbatim refusal). */
export const MDS_MAXSIZE_PX = 4096;
/** Served output grid, measured from the 0.08° answer (2615 × 3367 px). Constant with latitude. */
export const MDS_DEG_PER_PX_LAT = 0.08 / 3367;
export const MDS_DEG_PER_PX_LON = 0.08 / 2615;
/** The largest span each axis can ask for before MAXSIZE=4096 refuses (before `padDeg`). */
export const MDS_MAX_SPAN_LAT_DEG = MDS_MAXSIZE_PX * MDS_DEG_PER_PX_LAT;   // 0.09732°
export const MDS_MAX_SPAN_LON_DEG = MDS_MAXSIZE_PX * MDS_DEG_PER_PX_LON;   // 0.12530°

/** The national tile the sweep actually uses. Rectangular BY MEASUREMENT (see header). */
export const MDS_TILE_LAT_DEG = 0.09;
export const MDS_TILE_LON_DEG = 0.115;

/**
 * §MDS-NATIONAL-BBOX — the retain set is now the WHOLE COUNTRY, not a city list.
 * BYTE-IDENTICAL to the bake.mjs `spain` region row (`bbox: '-9.55,35.90,4.60,43.90'`), pinned by
 * mdsNational.spec.ts. It must not be re-invented: a retain set smaller than the baked region is
 * exactly the silent, permanent hole §MDS-BBOX-MUST-COVER-THE-REGION was written to forbid.
 */
export const MDS_NATIONAL_BBOX = [-9.55, 35.90, 4.60, 43.90];
export const MDS_NATIONAL_BBOXES = [MDS_NATIONAL_BBOX];

/**
 * §MDS-SWATHE — how many tile ROWS one bounded-heap pass holds.
 *
 * WHY THIS NUMBER EXISTS AT ALL. "Make the retain set the whole country" and "hold the retained
 * footprints in the V8 heap" are incompatible, and pretending otherwise is how run 30693132326 died
 * (`Ineffective mark-compacts near heap limit`, 4.04 GB, 23 minutes in). The MEASURED cost is
 * ~1,256 B of heap per parsed OSM footprint (geojsonseqRead.spec.ts §heap-budget); Spain's national
 * clip is millions of footprints, so a single whole-country retain pass wants well past the
 * 12,288 MB the bake job is given (`NODE_OPTIONS=--max-old-space-size=12288`).
 *
 * So the country is retained a BAND AT A TIME. Each pass streams the file, holds only the
 * footprints whose centroid is in the band, stamps them, appends them to the output, and writes
 * every other record straight through as raw bytes to the NEXT pass's input — which is therefore
 * strictly smaller than the last. Peak heap tracks ONE band, never the nation, and no footprint is
 * dropped, duplicated or fabricated: a footprint is retained by exactly one band (bands partition
 * latitude), and anything left over after the final band is concatenated unchanged.
 *
 * Bands are whole tile ROWS, not round degrees, so no raster cell ever straddles two bands and
 * gets fetched twice. 6 rows × 0.09° = 0.54° of latitude; Spain's 8.0° of latitude is 15 bands.
 */
export const MDS_SWATHE_ROWS = 6;

/**
 * Courtesy concurrency for the national sweep. The sweep is ENTIRELY wall-clock bound (one WCS
 * GetCoverage per populated cell; measured 1.8–7.8 s each for 17.6 MB at 0.08°), and serial it
 * cannot finish Spain inside the workflow's 330-minute ceiling. Four in flight against a public
 * keyless national service is modest; cells are still issued in ORDERED BATCHES so the resume
 * cursor stays exact (see `sweepBatches`).
 */
export const MDS_SWEEP_CONCURRENCY = 4;

/** Metres per degree of latitude / of longitude at `lat` — the spheroid-free approximation the rest
 *  of this toolchain uses for km² reporting (this is a LOG number, not a measurement). */
const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);

/**
 * The tile grid for a region bbox. `nx`/`ny` are counts; `ordOf` gives the deterministic sweep
 * order key (row-major, SOUTH→NORTH then WEST→EAST) that the resume cursor is expressed in.
 * @param {[number,number,number,number]} bbox [w,s,e,n] WGS84
 */
export function mdsTileGrid(bbox, { lonDeg = MDS_TILE_LON_DEG, latDeg = MDS_TILE_LAT_DEG } = {}) {
  const [w, s, e, n] = bbox;
  const nx = Math.max(1, Math.ceil((e - w) / lonDeg));
  const ny = Math.max(1, Math.ceil((n - s) / latDeg));
  return {
    w, s, e, n, nx, ny, lonDeg, latDeg,
    cellIx: (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / lonDeg))),
    cellIy: (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / latDeg))),
    ordOf: (ix, iy) => iy * nx + ix,
    ixOf: (ord) => ord % nx,
    iyOf: (ord) => Math.floor(ord / nx),
  };
}

/** The [w,s,e,n] of one grid cell, clipped to the region bbox (the last row/column is short). */
export function mdsCellBbox(grid, ix, iy) {
  const tw = grid.w + ix * grid.lonDeg;
  const ts = grid.s + iy * grid.latDeg;
  return [tw, ts, Math.min(tw + grid.lonDeg, grid.e), Math.min(ts + grid.latDeg, grid.n)];
}

/** Ground area of one grid cell in km² — for the "how much did we stamp vs skip" log line. */
export function mdsCellKm2(grid, ix, iy) {
  const [tw, ts, te, tn] = mdsCellBbox(grid, ix, iy);
  const midLat = (ts + tn) / 2;
  return ((te - tw) * mPerDegLon(midLat) * (tn - ts) * M_PER_DEG_LAT) / 1e6;
}

/**
 * The bounded-heap passes: contiguous bands of whole tile rows, SOUTH→NORTH, covering the region.
 * Ordered south→north so a single monotonic `ord` cursor resumes correctly across bands.
 * @returns {{index:number, iy0:number, iy1:number, bbox:[number,number,number,number], ordFrom:number, ordTo:number}[]}
 */
export function mdsNationalSwathes(grid, { swatheRows = MDS_SWATHE_ROWS } = {}) {
  const rows = Math.max(1, Math.floor(swatheRows));
  const out = [];
  for (let iy0 = 0, index = 0; iy0 < grid.ny; iy0 += rows, index++) {
    const iy1 = Math.min(iy0 + rows, grid.ny);
    out.push({
      index,
      iy0,
      iy1,
      bbox: [grid.w, grid.s + iy0 * grid.latDeg, grid.e, Math.min(grid.s + iy1 * grid.latDeg, grid.n)],
      ordFrom: iy0 * grid.nx,
      ordTo: iy1 * grid.nx, // exclusive
    });
  }
  return out;
}

/**
 * Order the populated cells of one pass for the sweep, and drop anything the resume cursor has
 * already covered. Deterministic (numeric `ord`, never lexicographic on "ix,iy" — that sorted
 * "10,3" before "2,3" and made a capped run un-resumable).
 * @param keys       iterable of "ix,iy" bucket keys
 * @param startCursor  ord to resume AT (inclusive), or null/0 for the beginning
 */
export function sweepOrder(keys, grid, startCursor = null) {
  const cells = [];
  for (const k of keys) {
    const [ix, iy] = k.split(',').map(Number);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
    cells.push({ key: k, ix, iy, ord: grid.ordOf(ix, iy) });
  }
  cells.sort((a, b) => a.ord - b.ord);
  if (!startCursor) return cells;
  return cells.filter((c) => c.ord >= startCursor);
}

/** Split an ordered cell list into fixed-size batches. A batch is issued concurrently but batches
 *  run in order, so "the first cell of the first incomplete batch" is an EXACT resume cursor. */
export function sweepBatches(cells, concurrency = MDS_SWEEP_CONCURRENCY) {
  const size = Math.max(1, Math.floor(concurrency));
  const out = [];
  for (let i = 0; i < cells.length; i += size) out.push(cells.slice(i, i + size));
  return out;
}

/**
 * §LOUD-AND-ORDERED-TRUNCATION (brief item 4) — the sentence a truncated national run prints.
 * A cap being respected is a BUDGET; a sweep that stopped early and said nothing is a LIE about
 * coverage (§ABORT-IS-NOT-A-CAP, and the failure-vs-empty family one level up). So the note always
 * carries: the reason it stopped, the km² actually stamped, the km² of POPULATED ground it scanned
 * and skipped, how many bands it never opened at all, and the cursor to resume from.
 */
export function formatSweepSummary(st) {
  const km2 = (v) => `${Math.round(v).toLocaleString('en-US')} km²`;
  if (st.stopReason === 'complete') {
    return `national sweep COMPLETE — ${st.cellsStamped} populated cell(s) / ${km2(st.km2Stamped)} stamped ` +
      `across ${st.swathesScanned}/${st.swathesTotal} swathe(s).`;
  }
  return `⚠ national sweep TRUNCATED (${st.stopReason}) — ${st.cellsStamped} populated cell(s) / ` +
    `${km2(st.km2Stamped)} stamped; ${st.cellsSkipped} populated cell(s) / ${km2(st.km2Skipped)} SKIPPED in the ` +
    `${st.swathesScanned} swathe(s) scanned; ${st.swathesTotal - st.swathesScanned} swathe(s) never opened ` +
    `(their footprints stream through with their ORIGINAL OSM tags — honest assumed, never fabricated). ` +
    `RESUME with MDS_SWEEP_CURSOR=${st.nextCursor} (cell ord; SW corner lat ${st.nextCursorLat?.toFixed(3)} ` +
    `lon ${st.nextCursorLon?.toFixed(3)}). Priority cities are stamped UNCAPPED on every run and are unaffected.`;
}
