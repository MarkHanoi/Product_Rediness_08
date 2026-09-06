// ─────────────────────────────────────────────────────────────────────────────
// §NL-3DBAG-OSM-JOIN (2026-09-05, lane HEIGHTS-NL) — stamp 3D BAG (BAG × AHN LiDAR) measured heights onto
// bake's OWN OSM footprints: the NETWORK/STREAM half of the Dutch national height stamp.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs (where the ES/DK/FR/CH/NRW/AU
// stamps live): heightSources.mjs is edited by several lanes at once and a whole-function insertion
// there collides; this file imports the shared join helpers from it instead (one `export { … }` line
// there is the whole coupling) and bake.mjs imports the stamp from here directly. The DECISIONS —
// URL + axis order, attribute→height rule, part builder, match rule, city working set — are in
// heights/nl3dbag.mjs, pure and vitest-pinned (nl3dbag.spec.ts); this file only moves bytes.
//
// WHY A STAMP AND NOT A FOOTPRINT REPLACE — the same reason as every join here (§MDS-OSM-JOIN): one
// footprint set, coherent with the roads/water/landuse baked from the same OSM clip, plus the one thing
// 3DBAG has that OSM lacks (a LiDAR roof height per pand). And the whole-country `items` scan the old
// `fetch3dbag` city path would need truncates (~5,000 rows) — heightSources.mjs REGION_SOURCE `netherlands`.
//
// THE CHANNEL (probed, numbers in heights/nl3dbag.mjs): WFS 2.0 `BAG3D:lod12`, GeoJSON, EPSG:4326 with
// the BBOX in lon,lat; one GetFeature per populated 0.01° cell answers WHOLE (a 2,443-part Amsterdam
// cell = 1.9 MB / 0.6 s; CountDefault 1,000,000 — no paging). Vectors, not a raster: like NRW the
// height is TRANSCRIBED from attributes ((70p ?? 50p) − maaiveld), not computed from pixels, and a
// footprint that owns several parts takes their AREA-WEIGHTED P90 (the same statistic the raster joins
// take over pixels — see the HEIGHT RULE on stampLod2NrwHeightsOnGeojsonseq).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetFeature refused / timed out / undecodable → `tileErrors++`  — a FAILURE (the server, or us).
//   • GetFeature decodes to ZERO parts              → `voidTiles++`   — an honest EMPTY (water, polder).
//   • footprint owns no part (neither direction)     → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • part with no honest height (no maaiveld, onvoldoende, roof ≤ ground) → skipped by name, counted.
//   • footprint outside NL_3DBAG_CITY_BBOXES          → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS, CC BY 4.0 ("3D BAG by tudelft3d and 3DGI"). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
  areaWeightedP90, dominantRoof, clampHeight,
} from '../heightSources.mjs';
import {
  NL_3DBAG, NL_3DBAG_CITY_BBOXES, nl3dbagGetFeatureUrl, parseNl3dbagCollection, nl3dbagPartsFromCollection,
  matchPartsToFootprint, partGrid,
} from './nl3dbag.mjs';
// §NL-3DBAG-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the shared whole-country kernel.
import {
  NL_3DBAG_NATIONAL_BBOXES, makeSweepBudget, nationalTileGrid, sweepPopulatedCells,
  formatNationalSweepSummary, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { cursorCorner, foldBandResults, runSwathedNationalStamp } from './nationalSweepRunner.mjs';

export { NL_3DBAG_NATIONAL_BBOXES };

/** Append retained (stamped or not) features in bounded chunks. `records.map(...).join('\n')` builds
 *  ONE string as large as the whole band — a second copy of the working set at the exact moment the
 *  band is at peak heap. Chunking keeps the spike at ~25k features. (mdsNational's `appendRetained`.) */
function appendRetained(destPath, records, chunk = 25_000) {
  for (let i = 0; i < records.length; i += chunk) {
    appendFileSync(destPath, records.slice(i, i + chunk).map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  }
}

/**
 * Stamp REAL 3DBAG heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads `inPath`,
 * holds only the footprints inside `retainBboxes` (the rest stream through to `outPath` untouched), tiles
 * the region bbox at `tileSpanDeg`, fetches the lod12 parts per POPULATED cell (priority bboxes first,
 * uncapped), and for each footprint that owns ≥1 part sets `height` = area-weighted P90 of the parts'
 * heights (+ `roof_type` of the dominant part, + `heightSource`, + `pryzm:height_src=measured-lidar`).
 * Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Netherlands); the working set is `retainBboxes`.
 */
export async function stampNl3dbagHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = 0.01, tileSpanLonDeg = null, tileSpanLatDeg = null,
  padDeg = 0.0005, maxTiles = 4000,
  priorityBboxes = [], retainBboxes = null,
  // §NL-3DBAG-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the four options a
  // bounded-heap band pass supplies. A caller that passes NONE of them (every city-sized row, every
  // unit test) takes the identical path it took before: pass-through and retained both land in
  // `outPath`, the budget is local, and the sweep is one pass.
  passThroughPath = null, retainedOutPath = null, sweepBudget = null, sweepGrid = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `NL 3DBAG join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'NL 3DBAG join: no bbox supplied' };
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  if (passThroughPath) mkdirSync(dirname(passThroughPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  // In a banded run the rest goes to the NEXT band's input, not to the output, so each pass's input is
  // strictly smaller than the last and peak heap tracks one band instead of the nation.
  const load = loadJoinFootprintsBounded(inPath, passThroughPath ?? outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'NL 3DBAG join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  // The grid is the REGION's, never the band's — so a cell `ord` means the same thing in every pass
  // and a cursor written by one band is readable by the next (§NATIONAL-SWEEP).
  const grid = sweepGrid ?? nationalTileGrid(bbox, {
    lonDeg: tileSpanLonDeg ?? tileSpanDeg, latDeg: tileSpanLatDeg ?? tileSpanDeg,
  });
  const { nx, ny } = grid;
  const buckets = bucketRecords(records, (r) => [grid.cellIx(r.clon), grid.cellIy(r.clat)]);
  // One shared budget across bands when the runner supplies one; a local, single-pass one otherwise.
  const budget = sweepBudget ?? makeSweepBudget({ maxTiles });
  const doneCells = new Set();
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, priorityTiles = 0, requests = 0;
  let partsFetched = 0, partsSkippedNoHeight = 0, partsSkippedNoGeometry = 0, bytesFetched = 0;
  let matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0;
  const percentiles = { '70p': 0, '50p': 0 };
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from the cap on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  // The heights array is the BUDGET's, so the aggregate statistics belong to the whole sweep and not
  // to whichever band ran last. `measuredAtStart` keeps THIS pass's own count honest for the fold.
  const heights = budget.heights;
  const measuredAtStart = heights.length;
  const t0 = Date.now();

  /** Read ONE cell and stamp its footprints. Returns TRUE when the cell was actually READ, so a
   *  refusal counts as an opened-but-failed cell and never as stamped ground. */
  const processCell = async (ix, iy) => {
    const key = `${ix},${iy}`;
    const inTile = buckets.get(key);
    if (!inTile || inTile.length === 0) return false;
    doneCells.add(key);
    const tw = grid.w + ix * grid.lonDeg, ts = grid.s + iy * grid.latDeg;
    const te = Math.min(tw + grid.lonDeg, grid.e), tn = Math.min(ts + grid.latDeg, grid.n);
    // `padDeg`: a pand whose centroid sits just across the cell edge is still offered to this cell's
    // footprints (a footprint is bucketed by ITS centroid; its owned parts may straddle the seam).
    const cell = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
    requests++;
    const rr = await httpGetSafe(nl3dbagGetFeatureUrl(cell), { timeoutMs, headers: { Accept: 'application/json' } });
    if (!rr.ok) {                                   // refused / timed out — a FAILURE, never "nothing here"
      tileErrors++;
      if (errorSamples.length < 5) errorSamples.push(`${key}: HTTP ${rr.status} ${rr.reason ?? ''}`.trim());
      return false;
    }
    const fc = parseNl3dbagCollection(rr.body);
    if (!fc) {                                      // undecodable (ows:ExceptionReport, HTML) — a FAILURE
      tileErrors++;
      if (errorSamples.length < 5) errorSamples.push(`${key}: undecodable body (${rr.contentType || 'no content-type'}, ${rr.body?.length ?? 0} B)`);
      return false;
    }
    bytesFetched += rr.body.length;
    processedTiles++;
    const { parts, skipped } = nl3dbagPartsFromCollection(fc);
    partsFetched += fc.features.length;
    partsSkippedNoHeight += skipped.noHeight; partsSkippedNoGeometry += skipped.noGeometry;
    if (parts.length === 0) { voidTiles++; return true; } // an honest EMPTY: the server answered, no building has a height here — READ, not failed
    const grid = partGrid(parts);
    for (const r of inTile) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const { owned, via } = matchPartsToFootprint(r, grid.get([x0, y0, x1, y1]));
      if (!via) continue;                           // NEITHER direction — the footprint keeps its OSM tags
      if (via === 'forward') { matchedForward++; if (owned.length > 1) multiPartFootprints++; } else matchedReverse++;
      const h = clampHeight(areaWeightedP90(owned));
      for (const p of owned) percentiles[p.percentile] = (percentiles[p.percentile] ?? 0) + 1;
      const roof = dominantRoof(owned);
      r.feat.properties = {
        ...(r.feat.properties ?? {}),
        building: r.feat.properties?.building ?? 'yes',
        height: Number(h.toFixed(1)),
        ...(roof ? { roof_type: roof } : {}),
        heightSource: NL_3DBAG.heightSourceTag,
        // §CTX-HEIGHT-MEASURED-MARKER — the client ranks this above an OSM-surveyed `tagged` height.
        [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
      };
      heights.push(h);
    }
    return true;
  };

  try {
    // Priority areas first (UNCAPPED) — each listed city is guaranteed its heights before the sweep
    // can exhaust `maxTiles`. A priority bbox with no retained footprints stamps nothing — harmless.
    // They DO respect the wall-clock deadline: a job that dies at the ceiling publishes nothing.
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = processedTiles;
      for (let iy = grid.cellIy(ps); iy <= grid.cellIy(pn) && !budget.stopReason; iy++) {
        for (let ix = grid.cellIx(pw); ix <= grid.cellIx(pe); ix++) {
          if (doneCells.has(`${ix},${iy}`)) continue;
          if (Date.now() > budget.deadlineAt) { budget.stopReason ??= 'time-budget-in-priority'; break; }
          await processCell(ix, iy);
        }
      }
      priorityTiles += processedTiles - before;
    }
    // §NATIONAL-SWEEP — only POPULATED cells, in a DETERMINISTIC NUMERIC order (row-major
    // south→north), resumable from the shared cursor. Never lexicographic: "10,3" sorts before "2,3"
    // and makes a capped run un-resumable (mdsNational's scar).
    await sweepPopulatedCells({
      buckets, grid, budget, done: doneCells, onCell: (c) => processCell(c.ix, c.iy),
    });
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); budget.stopReason ??= 'sweep-aborted'; } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints went to `passThroughPath` (the next band's input) or straight to
  // `outPath`; append the retained (stamped or not) ones — in bounded chunks, because
  // `records.map(...).join('\n')` builds one string as large as the whole band at peak heap.
  appendRetained(retainedOutPath ?? outPath, records);
  const tileCapHit = String(budget.stopReason ?? '').startsWith('maxTiles');
  const measured = heights.length - measuredAtStart;   // THIS pass's own — the fold sums bands
  const sorted = [...heights].sort((a, b) => a - b);   // a copy: the budget array is shared across bands
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(sorted), heightSamples: sorted.slice(0, 8),
    tilesProcessed: processedTiles, priorityTiles, tileErrors, voidTiles, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    requests, partsFetched, partsSkippedNoHeight, partsSkippedNoGeometry, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchedForward, matchedReverse, multiPartFootprints, percentiles, errorSamples,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: NL_3DBAG.attribution,
    note: `3D BAG lod12 ((70p ?? 50p) − maaiveld, area-weighted P90 over owned parts) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged; ${matchedForward} forward, ${matchedReverse} reverse, ${multiPartFootprints} multi-part); ` +
      `${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${processedTiles} cell(s) read${priorityTiles ? ` (${priorityTiles} in ${priorityBboxes.length} priority bbox(es) first)` : ''} ` +
      `(${requests} GetFeature(s), ${partsFetched} parts, ${partsSkippedNoHeight} without an honest height, ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${voidTiles} empty cell(s), ${tileErrors} request error(s)` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §NL-3DBAG-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the WHOLE OF THE NETHERLANDS,
// not six cities.
//
// ── THE DEFECT THIS REMOVES ─────────────────────────────────────────────────────────────────────
// `stampBboxesFor('3dbag')` returned NL_3DBAG_CITY_BBOXES: amsterdam / rotterdam / utrecht / thehague /
// eindhoven / groningen, and NOTHING ELSE in the country could ever be measured. Maastricht,
// Leeuwarden, Enschede, Middelburg, Den Bosch, Nijmegen, Breda, Tilburg, Arnhem, Haarlem, Almere and
// every village shipped the labelled `assumed` 9 m — which on the map is indistinguishable from "the
// source has no data here" (L-422/457/467/469). That was never 3DBAG's limit: 3DBAG is a NATIONAL
// product covering every BAG pand in the country.
//
// ── THE SOURCE IS NATIONAL — LIVE-PROBED 2026-09-06, exact answers, never a claim ───────────────
// `BAG3D:lod12` WFS 2.0 RESULTTYPE=hits over a 0.02° box in five cities OUTSIDE the six:
//   Maastricht   5.68,50.84,5.70,50.86  → HTTP 200, 786 B, 0.320 s, numberMatched="5294"
//   Leeuwarden   5.79,53.19,5.81,53.21  → HTTP 200, 787 B, 0.321 s, numberMatched="10303"
//   Enschede     6.89,52.21,6.91,52.23  → HTTP 200, 787 B, 0.320 s, numberMatched="10050"
//   Middelburg   3.60,51.49,3.62,51.51  → HTTP 200, 786 B, 0.774 s, numberMatched="8230"
//   Den Bosch    5.35,51.68,5.37,51.70  → HTTP 200, 785 B, 0.167 s, numberMatched="190"
// Five for five, tens of thousands of parts, in a fifth of a second. The reach was ours, not theirs.
//
// ── THE CELL SIZE IS MEASURED, NOT CHOSEN ───────────────────────────────────────────────────────
// GetFeature with the twelve-field PROPERTYNAME trim, in the DENSEST ground in the country
// (Amsterdam centre) and in the sparsest kind (rural Drenthe):
//   4.89,52.37,4.90,52.38  (0.01°) → HTTP 200 application/json  1,944,516 B  1.259 s
//   4.86,52.34,4.90,52.38  (0.04°) → HTTP 200 application/json 23,749,183 B  3.224 s
//   4.85,52.33,4.90,52.38  (0.05°) → HTTP 200 application/json 31,062,645 B  4.113 s
//   6.55,52.90,6.60,52.95  (0.05°) → HTTP 200 application/json    337,659 B  0.655 s
// ⭐ The cost tracks BUILDING COUNT, not area — a rural 0.05° cell is 92× cheaper than an Amsterdam
//    one of the same size. 0.04° is taken because it CAPS THE WORST CELL at 23.7 MB / 3.2 s: the cell's
//    parts are held in the heap while the two-direction match runs (`partGrid`), on top of the band's
//    own retained footprints, and the worst case is what has to fit.
// ⛔ Do NOT raise this to 0.05° "because it worked": the probe that returned 31 MB was ONE cell. The
//    per-cell heap spike, not the wall clock, is what a bigger cell buys you.
//
// ── THE COST, MEASURED AND STATED ───────────────────────────────────────────────────────────────
// 100 × 74 = 7,400 cells over the `netherlands` bbox. At the measured 0.17–3.2 s per populated cell
// the whole country is plausibly ONE run — but "plausibly" is not a measurement, so the sweep is
// budgeted, ordered and resumable like every other: it stamps the six cities FIRST and UNCAPPED, then
// sweeps south→north, and prints an EXACT resume cursor plus the populated km² it SKIPPED.
// ⚠ Successive runs do NOT accumulate into one tileset today — each bake regenerates the stamped file,
// so a second dispatch with NL_SWEEP_CURSOR stamps a DIFFERENT slice. Spain's named limitation
// (§MDS-NATIONAL-SWEEP "HONESTY LIMIT"), inherited unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/** Cell of the Dutch national sweep — square, and sized by the WORST cell's bytes (see above). */
export const NL_TILE_DEG = 0.04;
/** Tile rows per bounded-heap pass. 8 × 0.04° = 0.32° of latitude ≈ 11 % of the country's rows. */
export const NL_SWATHE_ROWS = 8;

/**
 * Stamp 3DBAG heights across the WHOLE of the Netherlands, one bounded-heap band at a time.
 *
 * Same join, same two-direction part match, same honesty rules as
 * `stampNl3dbagHeightsOnGeojsonseq` — this only changes WHERE it is allowed to look (the country, not
 * six boxes) and adds the machinery that makes that survivable: swathe passes, an ordered numeric
 * sweep, a resume cursor and loud truncation.
 *
 * @param bbox [w,s,e,n] WGS84 — the `netherlands` bake row's bbox.
 */
export async function stampNl3dbagNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  maxTiles = 20_000, retainBboxes = null, sweepCursor = null, sweepBudgetMs = null, swatheRows = null,
  priorityBboxes = NL_3DBAG_CITY_BBOXES.map((c) => c.bbox), ...rest
} = {}) {
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'NL 3DBAG national join: no bbox supplied' };
  const grid = nationalTileGrid(bbox, { lonDeg: NL_TILE_DEG, latDeg: NL_TILE_DEG });
  const budgetMin = Number(process.env.NL_SWEEP_BUDGET_MIN ?? 90) || 90;
  const budget = makeSweepBudget({
    maxTiles,
    budgetMs: Number(sweepBudgetMs ?? budgetMin * 60_000) || 0,
    startCursor: resolveSweepCursor(sweepCursor, process.env.NL_SWEEP_CURSOR),
  });
  const rows = resolveSwatheRows(swatheRows, process.env.NL_SWATHE_ROWS, NL_SWATHE_ROWS);
  const areas = Array.isArray(retainBboxes) && retainBboxes.length ? retainBboxes : NL_3DBAG_NATIONAL_BBOXES;

  const run = await runSwathedNationalStamp({
    stamp: stampNl3dbagHeightsOnGeojsonseq,
    inPath, outPath, bbox, retainBboxes: areas, grid, swatheRows: rows, budget, label: '3D BAG',
    callOpts: {
      ...rest, maxTiles,
      tileSpanLonDeg: NL_TILE_DEG, tileSpanLatDeg: NL_TILE_DEG,
      // §PRIORITY-FIRST — the six cities are stamped first and UNCAPPED, inside the band that holds
      // them (the runner intersects the working set with the band; a priority cell with no retained
      // footprint stamps nothing). A truncated run still helps the most users.
      priorityBboxes,
    },
  });
  if (run.status === 'error') return { status: 'error', reason: run.reason };
  if (!run.results.length) return { status: 'documented', reason: 'NL 3DBAG national join: no band held a footprint.' };

  const ok = run.results.filter((r) => r.status === 'ok');
  const fold = foldBandResults(ok, {
    sum: ['footprintCount', 'measuredCount', 'retainedFootprints', 'tilesProcessed', 'priorityTiles',
      'tileErrors', 'voidTiles', 'requests', 'populatedCells', 'partsFetched', 'partsSkippedNoHeight',
      'partsSkippedNoGeometry', 'matchedForward', 'matchedReverse', 'multiPartFootprints', 'bytesFetchedMB'],
    max: ['peakHeapUsedMB', 'heapLimitMB'],
    concat: ['errorSamples'],
  });
  const heights = [...budget.heights].sort((a, b) => a - b);
  const corner = cursorCorner(grid, budget.nextCursor);
  const sweep = {
    stopReason: budget.stopReason ?? 'complete',
    cellsStamped: budget.cellsStamped, km2Stamped: budget.km2Stamped,
    cellsSkipped: budget.cellsSkipped, km2Skipped: budget.km2Skipped,
    swathesTotal: budget.swathesTotal, swathesScanned: budget.swathesScanned,
    nextCursor: budget.nextCursor, nextCursorLat: corner.lat, nextCursorLon: corner.lon,
  };
  return {
    status: 'ok', outPath, ...fold,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    coverage: fold.footprintCount ? Number((fold.measuredCount / fold.footprintCount).toFixed(3)) : 0,
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanDeg: NL_TILE_DEG,
    tileCapHit: String(budget.stopReason ?? '').startsWith('maxTiles'),
    sweepAborted: ok.some((r) => r.sweepAborted), sweepAbortReason: ok.find((r) => r.sweepAborted)?.sweepAbortReason ?? null,
    attribution: NL_3DBAG.attribution,
    sweep, sweepCursorFrom: budget.startCursor, swatheRows: rows, stampAreas: areas.length,
    note: `3D BAG lod12 ((70p ?? 50p) − maaiveld, area-weighted P90 over owned parts) stamped onto OSM footprints `
      + `across the WHOLE COUNTRY → ${fold.measuredCount}/${fold.footprintCount} RETAINED footprint(s) got a MEASURED `
      + `height (${fold.matchedForward} forward, ${fold.matchedReverse} reverse, ${fold.multiPartFootprints} multi-part); `
      + `${fold.passedThroughFootprints} never held by any band passed through with their ORIGINAL OSM tags; `
      + `${fold.tilesProcessed} cell(s) read at ${NL_TILE_DEG}° (${fold.requests} GetFeature(s), ${fold.partsFetched} parts, `
      + `${fold.partsSkippedNoHeight} without an honest height, ${Math.round(fold.bytesFetchedMB)} MB), `
      + `${fold.voidTiles} empty cell(s), ${fold.tileErrors} request error(s). `
      + `${formatNationalSweepSummary(sweep, { label: '3D BAG national sweep', cursorEnv: 'NL_SWEEP_CURSOR' })} `
      + `Priority cities (${priorityBboxes.length}) are stamped UNCAPPED in their own band. `
      + `Peak heap ${fold.peakHeapUsedMB} MB of ${fold.heapLimitMB} MB.`,
  };
}
