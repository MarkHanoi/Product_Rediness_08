// ─────────────────────────────────────────────────────────────────────────────
// §MNH-FR-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the WHOLE OF FRANCE, not thirteen
// cities.
//
// ── THE DEFECT THIS REMOVES ─────────────────────────────────────────────────────────────────────
// `stampBboxesFor('mnh_fr')` returned MNH_FR_CITY_BBOXES — thirteen metro boxes totalling ~200 km² of
// a 551,695 km² country — and that list was BOTH the priority order AND the retain set. Everything
// else in France was STRUCTURALLY unmeasurable: no number of re-bakes could ever stamp Toulon,
// Perpignan, Nîmes, Avignon, Reims, Le Havre, Rouen, Brest, Tours, Metz, Nancy, Caen, Angers,
// Limoges, Ajaccio or any village, and every one of them shipped the labelled `assumed` 9 m, which on
// the map is indistinguishable from "IGN has published nothing here" (L-422/457/467/469). The
// previous lane's own header said so in as many words — *"the binding limit on SOLID French context is
// THIS FILE'S CITY LIST … not IGN's publication"* — and then measured 27 more covered cities by hand.
// This removes the limit instead of lengthening the list.
//
// ── THE SOURCE IS NATIONAL, AND ITS GAPS ARE REAL — LIVE-PROBED 2026-09-06 ──────────────────────
// WFS `IGNF_MNH-LIDAR-HD:dalle`, RESULTTYPE=hits, six 0.1° boxes chosen to be nowhere near the list:
//   rural Dordogne   0.10,45.10,0.20,45.20  → HTTP 200, 791 B, 0.258 s, numberMatched="105"
//   Clermont-Ferrand 3.05,45.70,3.15,45.80  → HTTP 200, 791 B, 0.224 s, numberMatched="108"
//   Vannes           -2.85,47.60,-2.75,47.70 → HTTP 200, 791 B, 0.202 s, numberMatched="0"
//   Nancy            6.15,48.65,6.25,48.75  → HTTP 200, 791 B, 0.195 s, numberMatched="106"
//   Dunkerque        2.30,50.95,2.40,51.02  → HTTP 200, 790 B, 0.228 s, numberMatched="64"
//   inland Corsica   9.10,41.90,9.20,42.00  → HTTP 200, 791 B, 0.225 s, numberMatched="115"
// ⭐ FIVE OF SIX COVERED, ONE GENUINELY EMPTY. That is why the cell precheck is THREE-VALUED and why a
//    zero is a `voidTile`, not an error: LiDAR HD is a rolling publication, and "not published yet"
//    and "the index refused us" must not become the same number.
//
// ── THE CELL SIZE AND THE COST ARE MEASURED, NOT CHOSEN ─────────────────────────────────────────
// WMS GetMap, `image/geotiff`, over Paris, three sizes:
//   2.34,48.85,2.35,48.86   (0.01°)        733 × 1113 px → HTTP 200 image/geotiff  3,263,701 B  3.76 s
//   2.30,48.82,2.38,48.88   (0.08 × 0.06) 2932 × 3340 px → HTTP 200 image/geotiff 39,171,905 B 15.23 s
//   2.25,48.80,2.40,48.92   (0.15 × 0.12) 2749 × 3340 px → HTTP 200 image/geotiff 36,727,025 B 31.95 s
// The 0.08 × 0.06 cell at 2 m/px is the one this sweep uses, verbatim: ~39 MB and ~15 s. The 0.15 ×
// 0.12 row is why a bigger cell is NOT free — the same bytes took twice the wall clock.
//
// ⛔ THE COST OF THE WHOLE COUNTRY, STATED RATHER THAN IMPLIED. 184 × 164 = 30,176 cells over the
//    `france` bbox; France is densely settled, so most land cells are POPULATED. At ~39 MB / ~15 s
//    that is tens of hours — France is NOT swept in one bake, and nothing here pretends it is. What
//    changes is that every French footprint is now REACHABLE: the run stamps the thirteen metros
//    FIRST and UNCAPPED, sweeps south→north from a cursor, and prints the populated km² it SKIPPED
//    plus `MNH_SWEEP_CURSOR=<ord>` to resume at.
// ⚠ Successive runs do NOT accumulate into one tileset today — each bake regenerates the stamped file,
//   so a second dispatch with the cursor stamps a DIFFERENT slice of France. That is Spain's named
//   limitation (§MDS-NATIONAL-SWEEP "HONESTY LIMIT"), inherited unchanged, not a new one.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: that file is edited by many
// lanes at once and a whole-function insertion there collides (the nl3dbagStamp precedent). The band
// pass it drives — `stampMnhFrHeightsOnGeojsonseq` — stays where it is.
// ─────────────────────────────────────────────────────────────────────────────
import { MNH_FR_CITY_BBOXES, stampMnhFrHeightsOnGeojsonseq, statsOf } from '../heightSources.mjs';
import {
  MNH_FR_NATIONAL_BBOXES, makeSweepBudget, nationalTileGrid,
  formatNationalSweepSummary, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { cursorCorner, foldBandResults, runSwathedNationalStamp } from './nationalSweepRunner.mjs';

export { MNH_FR_NATIONAL_BBOXES };

/** Cell of the French national sweep — RECTANGULAR, and taken verbatim from the measured GetMap above. */
export const MNH_FR_TILE_LON_DEG = 0.08;
export const MNH_FR_TILE_LAT_DEG = 0.06;
/** Metres per pixel asked of the WMS. MNH's native grid is 0.5 m; 2 m is the ES-MDS effective sampling
 *  (2.4–3.7 m/px) and is what makes a 0.08 × 0.06 cell fit under the service's 5010 px axis maximum. */
export const MNH_FR_NATIONAL_RES_M = 2.0;
/** Tile rows per bounded-heap pass. 5 × 0.06° = 0.30° of latitude ≈ 3 % of the country's rows — France
 *  has by far the most footprints of the four countries this lane took national, so its bands are the
 *  narrowest. At the measured ~1,256 B/footprint a 0.3° band of France is comfortably inside 12,288 MB. */
export const MNH_FR_SWATHE_ROWS = 5;

/**
 * Stamp IGN LiDAR HD MNH heights across the WHOLE of France, one bounded-heap band at a time.
 *
 * Same join, same sampler, same honesty rules as `stampMnhFrHeightsOnGeojsonseq` — this only changes
 * WHERE it is allowed to look (the country, not thirteen boxes) and adds the machinery that makes that
 * survivable: swathe passes, a per-cell coverage precheck, an ordered numeric sweep, a resume cursor
 * and loud truncation.
 *
 * @param bbox [w,s,e,n] WGS84 — the `france` bake row's bbox.
 */
export async function stampMnhFrNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  maxTiles = 20_000, retainBboxes = null, sweepCursor = null, sweepBudgetMs = null, swatheRows = null,
  priorityBboxes = MNH_FR_CITY_BBOXES.map((c) => c.bbox), ...rest
} = {}) {
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'MNH-FR national join: no bbox supplied' };
  const grid = nationalTileGrid(bbox, { lonDeg: MNH_FR_TILE_LON_DEG, latDeg: MNH_FR_TILE_LAT_DEG });
  const budgetMin = Number(process.env.MNH_SWEEP_BUDGET_MIN ?? 120) || 120;
  const budget = makeSweepBudget({
    maxTiles,
    budgetMs: Number(sweepBudgetMs ?? budgetMin * 60_000) || 0,
    startCursor: resolveSweepCursor(sweepCursor, process.env.MNH_SWEEP_CURSOR),
  });
  const rows = resolveSwatheRows(swatheRows, process.env.MNH_SWATHE_ROWS, MNH_FR_SWATHE_ROWS);
  const areas = Array.isArray(retainBboxes) && retainBboxes.length ? retainBboxes : MNH_FR_NATIONAL_BBOXES;

  const run = await runSwathedNationalStamp({
    stamp: stampMnhFrHeightsOnGeojsonseq,
    inPath, outPath, bbox, retainBboxes: areas, grid, swatheRows: rows, budget, label: 'IGN MNH',
    callOpts: {
      ...rest, maxTiles,
      tileSpanLonDeg: MNH_FR_TILE_LON_DEG, tileSpanLatDeg: MNH_FR_TILE_LAT_DEG,
      resM: MNH_FR_NATIONAL_RES_M, sampleStepM: MNH_FR_NATIONAL_RES_M,
      // §MNH-FR-CELL-PRECHECK — at national scale the per-AREA precheck answers "covered" for the whole
      // of France and saves nothing. The per-CELL one costs ~0.2 s and buys back a ~39 MB / ~15 s GetMap
      // wherever IGN has published no dalle (Vannes: numberMatched="0", probed).
      cellPrecheck: true,
      // …and the AREA precheck is turned OFF for the same reason: one hits query over the whole country
      // can only ever say "covered", so paying for it per band is a request that decides nothing.
      coveragePrecheck: false,
      priorityBboxes,
    },
  });
  if (run.status === 'error') return { status: 'error', reason: run.reason };
  if (!run.results.length) return { status: 'documented', reason: 'MNH-FR national join: no band held a footprint.' };
  const blocked = run.results.find((r) => r.status === 'blocked');
  if (blocked) return blocked;

  const ok = run.results.filter((r) => r.status === 'ok');
  const fold = foldBandResults(ok, {
    sum: ['footprintCount', 'measuredCount', 'retainedFootprints', 'tilesProcessed', 'priorityTiles',
      'tileErrors', 'voidTiles', 'populatedCells', 'bytesFetchedMB',
      'cellsPrechecked', 'cellsSkippedNoDalle', 'precheckUnknown'],
    max: ['peakHeapUsedMB', 'heapLimitMB'],
    concat: [],
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
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanLonDeg: MNH_FR_TILE_LON_DEG, tileSpanLatDeg: MNH_FR_TILE_LAT_DEG,
    tileCapHit: String(budget.stopReason ?? '').startsWith('maxTiles'),
    sweepAborted: ok.some((r) => r.sweepAborted), sweepAbortReason: ok.find((r) => r.sweepAborted)?.sweepAbortReason ?? null,
    sweep, sweepCursorFrom: budget.startCursor, swatheRows: rows, stampAreas: areas.length,
    attribution: 'IGN – Programme LiDAR HD (Licence Ouverte Etalab 2.0)',
    note: `IGN LiDAR HD MNH (P90 over the eroded footprint; the pixel IS height above ground) stamped onto OSM `
      + `footprints across the WHOLE COUNTRY → ${fold.measuredCount}/${fold.footprintCount} RETAINED footprint(s) got a `
      + `MEASURED height; ${fold.passedThroughFootprints} never held by any band passed through with their ORIGINAL `
      + `OSM tags; ${fold.tilesProcessed} cell(s) read at ${MNH_FR_TILE_LON_DEG}°×${MNH_FR_TILE_LAT_DEG}° / `
      + `${MNH_FR_NATIONAL_RES_M} m (${Math.round(fold.bytesFetchedMB)} MB), ${fold.voidTiles} void (unpublished) cell(s), `
      + `${fold.tileErrors} raster error(s); ${fold.cellsSkippedNoDalle} of ${fold.cellsPrechecked} prechecked cell(s) `
      + `SKIPPED because IGN's dalle index lists no published MNH there — an honest EMPTY, not a failure — and `
      + `${fold.precheckUnknown} precheck(s) came back UNKNOWN and were sampled anyway. `
      + `${formatNationalSweepSummary(sweep, { label: 'IGN MNH national sweep', cursorEnv: 'MNH_SWEEP_CURSOR' })} `
      + `Priority metros (${priorityBboxes.length}) are stamped UNCAPPED in their own band. `
      + `Peak heap ${fold.peakHeapUsedMB} MB of ${fold.heapLimitMB} MB.`,
  };
}
