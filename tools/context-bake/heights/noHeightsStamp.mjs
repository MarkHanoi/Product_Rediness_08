// ─────────────────────────────────────────────────────────────────────────────
// §NDH-NO-OSM-JOIN (2026-09-05, lane HEIGHTS-NORDICS) — stamp Kartverket NHM nDSM (DOM − DTM) heights
// onto bake's OWN OSM footprints: the NETWORK/STREAM half of the Norwegian national height stamp.
//
// ⭐ §NO-NATIONAL (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — THE WORKING SET IS NOW THE WHOLE COUNTRY.
// Three things changed, all of them MEASURED first (heights/noHeights.mjs §NO-NATIONAL carries the
// numbers, and none of them is an estimate):
//   1. The retain set is `NO_NATIONAL_BBOXES`, so Stavanger / Tromsø / Drammen / every fjord village is
//      REACHABLE. It was oslo+bergen+trondheim, and nothing else in Norway could ever be measured.
//   2. The sweep runs on the shared driver (heights/nationalSweepStamp.mjs): the three cities are
//      stamped FIRST and UNCAPPED (§PRIORITY-OR-THE-CITIES-REGRESS — widening the retain set must never
//      cost the ground that works today), then populated cells are visited in deterministic south→north
//      order under a wall-clock budget, one BOUNDED-HEAP band at a time, with an exact resume cursor
//      (`NO_SWEEP_CURSOR`) and a LOUD truncation sentence naming the km² skipped.
//   3. The unit of work is a ~4 × 4 km CELL at 2 m, not a 1 km tile at 1 m. Measured on 1,057 real Oslo
//      footprints, 2 m costs −0.10 m of MEDIAN height against 1 m and 3.2× fewer bytes; measured against
//      the service, dim 2000 is served in 3.25 s while dim 3000 is an HTTP 504 at 30 s. Together that is
//      ~0.20 s and ~1.05 MB per km² instead of ~0.49 s and ~1.10 MB.
//
// ⚠ WHAT THIS DOES NOT CLAIM. Norway is not "done" because the retain set is national: a dispatch takes
// the slice its budget allows and PRINTS what it skipped. Reading the printed km² is the only honest way
// to know how much of Norway a given tileset actually measures.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs (where the ES/DK/FR/CH/NRW/AU
// stamps live): heightSources.mjs is edited by several lanes at once and a whole-function insertion
// there collides; this file imports the shared join helpers from it instead (the ONE coupling is that
// `export { … }` line) and bake.mjs imports the stamp from here directly — the heights/nl3dbagStamp.mjs
// precedent. The DECISIONS — endpoints, URL shape, cell sizing, request ceiling, nodata rule, the
// national retain set and the priority list — are in heights/noHeights.mjs, pure and vitest-pinned.
//
// WHY A STAMP AND NOT A FOOTPRINT REPLACE — the same reason as every join here (§MDS-OSM-JOIN): Norway
// has NO keyless national FOOTPRINT feed reachable by bbox (FKB-Bygning is Norge digitalt-licensed), so
// the footprint set is bake's OWN OSM clip, coherent with the roads/water/landuse baked from it, and
// only cells that contain footprints fetch rasters.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetCoverage refused / timed out / not a TIFF   → a cell FAILURE (`tileErrors`) — the service, or us.
//   • GeoTIFF undecodable                            → a cell FAILURE.
//   • raster 100 % sentinel (no data published here) → an honest EMPTY (`voidTiles`) — sea, abroad.
//   • footprint with < minSamples clean cells        → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • geotiff / proj4 missing in the runner          → `documented` (footprints keep OSM) — a build gate, by name.
//   • cell never opened (budget / band)              → counted in km² and NAMED with a resume cursor.
// KEYLESS (Geonorge WCS: fees free, accessConstraints None — probed; CC BY 4.0 © Kartverket). No repo secret.
// ⚠ The DOM is all sursol (vegetation too) — P90 over the eroded interior is the DK/FR/CH mitigation.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from 'node:fs';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, stampAreasFor, statsOf, ndsmHeightForBuilding,
} from '../heightSources.mjs';
import {
  NO_NDH, NO_NDH_CITY_BBOXES, NO_NATIONAL_BBOX, NO_NATIONAL_BBOXES, NO_SWATHE_ROWS, NO_SWEEP_CONCURRENCY,
  NO_SWEEP_ERODE_M, NO_SWEEP_RES_M, NO_SWEEP_STEP_M, NO_TILE_LAT_DEG, NO_TILE_LON_DEG,
  isNdhNodata, noNdhCellRequest, noNdhWindowUrl,
} from './noHeights.mjs';
import { readSparseTiledFloat32, sparseTileCount } from './sparseTiff.mjs';
import {
  formatNationalSweepSummary, nationalTileGrid, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { resolveSweepBudgetMs, runNationalSweep } from './nationalSweepStamp.mjs';

export { NO_NDH, NO_NDH_CITY_BBOXES, NO_NATIONAL_BBOX, NO_NATIONAL_BBOXES };

/** Lazy `geotiff` import — the module stays importable without the dep; a bare checkout degrades to `documented`. */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}
/** Lazy UTM33 projector via the ONE shared reproject.mjs (proj4). Null → the caller degrades to `documented`. */
let _utm33 = null;
async function loadUtm33Projector() {
  if (_utm33) return _utm33;
  try { const m = await import('../reproject.mjs'); _utm33 = m.getProjector(NO_NDH.crs); return _utm33; }
  catch { return null; }
}

/**
 * GET raw bytes with a timeout and ONE retry. Honours §FETCH-THROW-IS-NOT-A-SWEEP-ABORT: a network-layer
 * throw becomes a VALUE (`{ ok:false, reason }`) so the per-cell handler counts it, instead of an unwind
 * that would end the whole country (the 2026-08-01 Spain defect, heightSources.mjs httpGetBuffer).
 */
async function httpGetBytes(url, { timeoutMs = 90_000, retries = 1 } = {}) {
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
      lastReason = String(err?.message ?? err);
    } finally { clearTimeout(t); }
  }
  return { ok: false, status: 0, ct: '', ab: null, reason: lastReason };
}

/**
 * Read ONE NHM GeoTIFF (ArrayBuffer) → the shared raster shape `{ width, height, values, bboxNative, masked }`
 * in EPSG:25833, with the ArcGIS float sentinel masked to NaN so `ndsmHeightForBuilding`'s bilinear sampler
 * drops it instead of blending a 3.4e38 into a roof. `masked` = number of void cells.
 */
async function readNhmRaster(ab, gt) {
  const buf = ab instanceof ArrayBuffer ? ab : ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const tiff = await gt.fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const width = img.getWidth(), height = img.getHeight();
  // ⭐ §SPARSE-TILE-IS-NOT-A-BROKEN-FILE — NHM windows over the COAST come back as legal SPARSE TIFFs
  // (all-nodata tiles written as TileOffset 0 / TileByteCount 0), and geotiff.js throws
  // "Offset is outside the bounds of the DataView" on them, which cost the join the WHOLE cell —
  // measured: the failing Stavanger quadrant has 2 of 64 tiles sparse. The dedicated reader handles
  // exactly that layout and is VERIFIED bit-identical to geotiff.js on a dense raster
  // (1,000,000/1,000,000 samples, max |Δ| 0). geotiff.js remains the fallback for any other layout.
  const sparse = readSparseTiledFloat32(buf, img.fileDirectory, width, height);
  const raw = sparse ?? (await img.readRasters())[0];
  const values = sparse ?? Float32Array.from(raw);
  let masked = 0;
  for (let i = 0; i < values.length; i++) if (isNdhNodata(values[i])) { values[i] = NaN; masked++; }
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  return { width, height, values, bboxNative: [minX, minY, maxX, maxY], masked, sparseTiles: sparseTileCount(img.fileDirectory), viaSparseReader: sparse !== null };
}

/**
 * Stamp REAL Kartverket NHM nDSM heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip).
 * Reads `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath`
 * untouched), stamps the priority cities first and uncapped, then sweeps the populated national cells in
 * deterministic south→north order, fetching DOM + DTM per cell; for each footprint with ≥ minSamples
 * clean interior cells sets `height` = P90(DOM − DTM) (+ `heightSource`, + `pryzm:height_src=measured-lidar`).
 * Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Norway); the working set is `retainBboxes`,
 *             which is NO_NATIONAL_BBOXES for the `norway` row since §NO-NATIONAL.
 */
export async function stampNoNdhHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, maxTiles = 20_000, retainBboxes = null,
  resM = NO_SWEEP_RES_M, erodeM = NO_SWEEP_ERODE_M, percentile = 90, minSamples = 4, sampleStep = NO_SWEEP_STEP_M,
  tileLonDeg = NO_TILE_LON_DEG, tileLatDeg = NO_TILE_LAT_DEG, concurrency = NO_SWEEP_CONCURRENCY,
  sweepCursor = null, sweepBudgetMs = null, swatheRows = null, env = process.env, log = console.log,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `NO NHM nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'NO NHM nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'NO NHM nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const proj = await loadUtm33Projector();
  if (!proj) return { status: 'documented', reason: 'NO NHM nDSM join: proj4 / reproject.mjs unavailable (EPSG:25833) — install proj4 in the bake image; footprints keep OSM default.' };

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  const grid = nationalTileGrid(bbox, { lonDeg: tileLonDeg, latDeg: tileLatDeg });
  const cursor = resolveSweepCursor(sweepCursor, env.NO_SWEEP_CURSOR);
  const budgetMs = resolveSweepBudgetMs(sweepBudgetMs, env.NO_SWEEP_BUDGET_MS);
  const rows = resolveSwatheRows(swatheRows, env.NO_SWATHE_ROWS, NO_SWATHE_ROWS);

  let requests = 0, bytesFetched = 0, pxRequested = 0;
  const heights = [];

  /** ONE cell: two GetCoverage windows (DOM, DTM), then P90(DOM − DTM) per footprint it holds.
   *  The two are fetched SERIALLY on purpose — the driver already runs `concurrency` cells at once, and
   *  parallelising inside a cell would silently double the load Kartverket sees. */
  const stampCell = async ({ cellBbox, records }) => {
    const req = noNdhCellRequest(cellBbox, (lon, lat) => proj.forward(lon, lat), { resM });
    if (!req) return { ok: false, error: 'cell corners not projectable to EPSG:25833', requests: 0, bytes: 0 };
    const { box, width, height } = req;
    const domR = await httpGetBytes(noNdhWindowUrl('dom', box, width, height), { timeoutMs });
    const dtmR = await httpGetBytes(noNdhWindowUrl('dtm', box, width, height), { timeoutMs });
    requests += 2; pxRequested += width * height * 2;
    const bytes = (domR.ab?.byteLength ?? 0) + (dtmR.ab?.byteLength ?? 0);
    bytesFetched += bytes;
    if (!domR.ok || !dtmR.ok || !/tiff/i.test(domR.ct) || !/tiff/i.test(dtmR.ct)) {
      // The service refused us or answered with an error page — a FAILURE, never "nothing here".
      return { ok: false, requests: 2, bytes, error: `DOM ${domR.status} ${domR.ct || domR.reason} · DTM ${dtmR.status} ${dtmR.ct || dtmR.reason}` };
    }
    let dom, dtm;
    try { dom = await readNhmRaster(domR.ab, gt); dtm = await readNhmRaster(dtmR.ab, gt); }
    catch (err) { return { ok: false, requests: 2, bytes, error: `undecodable GeoTIFF (${String(err?.message ?? err)})` }; }
    // Nothing published over this cell (sea, or across the border) — an honest EMPTY.
    if (dom.masked === dom.values.length || dtm.masked === dtm.values.length) return { ok: true, empty: true, requests: 2, bytes };
    for (const r of records) {
      const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dom, dtm, { erodeM, percentile, minSamples, sampleStep });
      if (!h) continue;                                  // too few clean cells — keeps its OSM tags
      r.feat.properties = {
        ...(r.feat.properties ?? {}),
        building: r.feat.properties?.building ?? 'yes',
        height: Number(h.height.toFixed(1)),
        heightSource: NO_NDH.heightSourceTag,
        [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
      };
      heights.push(h.height);
    }
    return { ok: true, empty: false, requests: 2, bytes };
  };

  const run = await runNationalSweep({
    inPath, outPath, grid, stampAreas,
    // Rings are projected ONCE, at partition time, so a cell never re-projects and the heap holds the
    // native rings the sampler actually reads.
    recordOf: (feat, fp) => {
      const extNative = fp.ext.map(([lon, lat]) => proj.forward(lon, lat));
      const interiorsNative = fp.interiors.map((ring) => ring.map(([lon, lat]) => proj.forward(lon, lat)));
      let cx = 0, cy = 0;
      for (const [X, Y] of extNative) { cx += X; cy += Y; }
      cx /= extNative.length; cy /= extNative.length;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;   // unprojectable — pass it through
      return { feat, clon: fp.clon, clat: fp.clat, extNative, interiorsNative };
    },
    stampCell,
    // §PRIORITY-OR-THE-CITIES-REGRESS — Oslo / Bergen / Trondheim are measured on the live map TODAY.
    // A budgeted south→north national sweep could run out of time in Kristiansand, so they are stamped
    // first and uncapped on EVERY run, cursor ignored.
    priorityAreas: NO_NDH_CITY_BBOXES.map((c) => c.bbox),
    label: 'NO NHM national sweep', cursorEnvLabel: 'NO_SWEEP_CURSOR',
    cursor, budgetMs, maxTiles, swatheRows: rows, concurrency, log,
  });
  if (run.status !== 'ok') return { status: run.status, reason: run.reason, read: run.read };

  const { agg, sweep } = run;
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  return {
    status: 'ok', outPath, count: agg.parsed, footprintCount: agg.retained, measuredCount: measured,
    coverage: agg.retained ? Number((measured / agg.retained).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: agg.cellsStamped, tileErrors: agg.tileErrors, voidTiles: agg.voidTiles, emptyTiles: 0,
    tileCapHit: String(sweep.stopReason).startsWith('maxTiles'),
    sweepAborted: agg.sweepAborted, sweepAbortReason: agg.sweepAbortReason,
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanDeg: `${tileLonDeg}×${tileLatDeg}`, resM,
    sweep, sweepCursorFrom: cursor, swatheRows: rows, swathesTotal: run.swathesTotal, swathesScanned: run.swathesScanned,
    requests, bytesFetched, megapixels: Number((pxRequested / 1e6).toFixed(1)),
    errorSamples: agg.errorSamples, elapsedS: run.elapsedS,
    retainedFootprints: agg.retained, passedThroughFootprints: agg.passedThrough,
    stampAreas: stampAreas.length, populatedCells: agg.populatedCells,
    peakHeapUsedMB: agg.peakHeapUsedMB, heapLimitMB: agg.heapLimitMB,
    attribution: NO_NDH.attribution,
    note: `Kartverket NHM nDSM (P90 of DOM − DTM over the eroded footprint, sampled at ${resM} m) stamped onto OSM ` +
      `footprints → ${measured}/${agg.retained} RETAINED footprint(s) got a MEASURED height; ` +
      `${agg.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${agg.cellsStamped} of ${agg.populatedCells} populated cell(s) read at ${tileLonDeg}°×${tileLatDeg}° ` +
      `(${sweep.priorityCells} of them the PRIORITY cities, uncapped) across ${run.swathesScanned}/${run.swathesTotal} ` +
      `bounded-heap swathe(s) — ${requests} GetCoverage request(s), ${(bytesFetched / 1e6).toFixed(0)} MB; ` +
      `${agg.voidTiles} void (unpublished / sea) cell(s), ${agg.tileErrors} cell error(s)` +
      `${cursor ? `; resumed at cursor ${cursor}` : ''}. ${formatNationalSweepSummary(sweep, { label: 'NO NHM national sweep', cursorEnv: 'NO_SWEEP_CURSOR' })}` +
      `${agg.sweepAborted ? ` ⚠ SWEEP ABORTED after ${agg.cellsStamped} cell(s) — ${agg.sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      ` Peak heap ${agg.peakHeapUsedMB} MB of ${agg.heapLimitMB} MB.`,
  };
}
