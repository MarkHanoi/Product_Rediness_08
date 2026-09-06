// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-SWEEP-DRIVER (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — the STREAM + HEAP half of the
// whole-country sweep, written once and shared by the joins this lane took national (EE ETAK, SI GURS,
// NO NHM). The pure DECISIONS — grid, swathe plan, sweep order, cursor, km², the truncation sentence —
// live in heights/nationalSweep.mjs, which lane HEIGHTS-WHOLE-COUNTRY-A extracted from mdsNational.mjs
// and usOpenHeights.mjs the same day. ⭐ THIS FILE IMPORTS THAT KERNEL RATHER THAN RE-DERIVING IT: two
// lanes wrote the same eight functions within an hour of each other, and the sibling's landed first, so
// this one ADOPTED it (fleet rule: if another lane already moved a piece, adopt it).
//
// WHAT A JOIN HANDS IN, and therefore does NOT have to re-implement:
//   • `recordOf(feat, fp)` → the join's own retained-record shape, or null to pass the feature through.
//     (The driver has ALREADY checked the working-set areas; a join adds its own filter — e.g. "can this
//     point be projected", "is there a channel serving it at all".)
//   • `stampCell({ cellBbox, records, ix, iy, key, grid })` → `{ ok, empty, requests, bytes, error }`.
//     The join fetches its source for that cell and mutates `records[i].feat.properties` itself, so the
//     driver never invents a height and never sees one.
//       ok:false + error → a FAILURE (`tileErrors`): the cell's footprints keep their OSM tags.
//       ok:true + empty  → an honest EMPTY (`voidTiles`): the source answered, there is nothing here.
//     Those two must never collapse into one number — that IS the failure-vs-empty defect family
//     (L-422 / L-457 / L-467 / L-469), the reason `assumed 9 m` cannot be read off the map as "no data".
//
// THE FOUR PROPERTIES THE DRIVER OWNS:
//  1. PRIORITY FIRST (§PRIORITY-OR-THE-CITIES-REGRESS). A national retain set with a budgeted sweep is
//     a REGRESSION for the cities that work today unless the declared city list is stamped FIRST and
//     UNCAPPED: an ordered south→north sweep that runs out of budget in Kristiansand would leave Oslo,
//     Bergen and Trondheim — measured on the live map right now — at the assumed 9 m. So `priorityAreas`
//     runs as pass 0, uncapped, cursor-ignored, on EVERY run. This is Spain's `MDS_PRIORITY_BBOXES`
//     guarantee, generalised. ⛔ Never wire a national retain set without it.
//  2. BOUNDED HEAP. Each pass streams its input, holds ONLY the footprints in its band, appends them to
//     the output, and writes every other record through as RAW BYTES to the next pass's input — which is
//     therefore strictly smaller. Peak heap tracks ONE band, never the nation (~1,256 B per parsed
//     footprint, geojsonseqRead.spec.ts §heap-budget).
//  3. ORDERED + RESUMABLE. Cells are visited on the NUMERIC row-major `ord`; caps are checked at a BATCH
//     boundary, so the printed cursor is the ord of the first cell of the first batch that did not run —
//     resuming re-reads at most (concurrency − 1) cells and can never skip one.
//  4. LOUD. A truncated run reports the reason, the km² stamped, the km² of POPULATED ground skipped,
//     the bands never opened, and the cursor (§ABORT-IS-NOT-A-CAP).
//
// ⛔ THE INVARIANT THAT MATTERS MOST: every record that enters `inPath` leaves in `outPath`, exactly
//    once, stamped or with its ORIGINAL OSM tags. A band never opened, a cell behind a cap and a
//    footprint the source could not serve all end in the SAME honest state. Nothing is fabricated,
//    nothing is dropped, nothing is duplicated. nationalSweepStamp.spec.ts pins this.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  nationalCellBbox, nationalCellKm2, nationalSwathes, nationalSweepBatches, nationalSweepOrder, intersectAreas,
} from './nationalSweep.mjs';

/**
 * ⚠ §WHY THE JOIN HELPERS ARE IMPORTED LAZILY, AND NOT AT MODULE LOAD.
 *
 * They live in heightSources.mjs, and **vitest cannot import heightSources.mjs** — a limitation this
 * repo has carried long enough to be written into half a dozen module headers (heights/mdsNational.mjs,
 * heights/eeHeights.mjs, heights/auOpenHeights.mjs …), which is exactly why every join keeps its pure
 * half in a separate file. A STATIC import here quietly extends that limitation to this driver and to
 * anything that imports it: nationalSweepStamp.spec.ts ran green, then stopped collecting a single test
 * with a bare `SyntaxError: Invalid or unexpected token` the moment an unrelated commit invalidated
 * vitest's transform cache. A test that can stop running for a reason it never names is worse than no
 * test (§NEVER-RAN-AND-PASSED-PRINT-THE-SAME-VALUE, L-849).
 *
 * So the helpers are resolved at CALL time, and `deps` can be injected. Production passes nothing and
 * gets the one true implementation out of heightSources.mjs — there is no second copy of
 * `footprintFromFeature` to drift.
 */
let _deps = null;
async function resolveDeps(injected) {
  if (injected) return injected;
  if (!_deps) _deps = await import('../heightSources.mjs');
  return _deps;
}

/** Courtesy concurrency against a public keyless national service, when a join does not say. */
export const DEFAULT_SWEEP_CONCURRENCY = 4;

/** A wall-clock budget in ms from an option or an env value; 0 = none. A country whose sweep cannot
 *  finish inside one dispatch is the NORMAL case for a raster join — the budget is what makes the
 *  truncation ORDERLY and the cursor meaningful. (The kernel has cursor/swathe resolvers but not this
 *  one; it is here rather than added to the sibling lane's file mid-flight.) */
export function resolveSweepBudgetMs(opt, envValue = null) {
  const raw = opt ?? envValue ?? null;
  const v = raw === null || raw === '' ? 0 : Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Append retained (stamped or not) features in bounded chunks. `records.map(…).join('\n')` builds ONE
 *  string as large as the whole band — a second copy of the working set at the exact moment the band is
 *  at peak heap. Chunking keeps the spike at ~25k features. (The MDS swathe driver's private
 *  `appendRetained` rule, kept identical on purpose.) */
function appendRetained(destPath, records, chunk = 25_000) {
  for (let i = 0; i < records.length; i += chunk) {
    appendFileSync(destPath, records.slice(i, i + chunk).map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  }
}

/** A fresh aggregate. Every counter the summary sentence can name is here, so a join cannot forget one. */
function newAgg() {
  return {
    parsed: 0, retained: 0, passedThrough: 0, populatedCells: 0,
    cellsStamped: 0, cellsSkipped: 0, km2Stamped: 0, km2Skipped: 0,
    priorityCells: 0, priorityKm2: 0,
    tileErrors: 0, voidTiles: 0, requests: 0, bytesFetched: 0,
    sweepAborted: false, sweepAbortReason: null, errorSamples: [],
    peakHeapUsedMB: 0, heapLimitMB: 0,
  };
}

/**
 * ONE bounded-heap pass over ONE set of retain areas (the priority set, a swathe band, or the whole
 * working set in single-pass mode). Mutates the shared `budget` and `agg`, so caps and the cursor are
 * GLOBAL across passes rather than per pass.
 */
async function sweepPass({
  inPath, passThroughPath, retainedOutPath, areas, grid, budget, agg, recordOf, stampCell, concurrency,
  label, priority = false, helpers,
}) {
  const { loadJoinFootprintsBounded, footprintFromFeature, inAnyArea, bucketRecords } = helpers;
  const load = loadJoinFootprintsBounded(inPath, passThroughPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, areas)) return null;
    return recordOf(feat, fp);
  }, label);
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };

  const records = load.retained;
  const read = load.read;
  agg.peakHeapUsedMB = Math.max(agg.peakHeapUsedMB, read.peakHeapUsedMB ?? 0);
  agg.heapLimitMB = read.heapLimitMB ?? agg.heapLimitMB;
  // The FIRST pass parses every record in the clip; later passes re-parse only what is LEFT, so SUMMING
  // would over-report the input several-fold (mdsNational's scar). Take the first pass's number.
  if (agg.parsed === 0) agg.parsed = read.parsed ?? 0;
  agg.passedThrough = read.passedThrough ?? 0;   // what is LEFT after this pass, not a running total
  agg.retained += records.length;

  const buckets = bucketRecords(records, (r) => [grid.cellIx(r.clon), grid.cellIy(r.clat)]);
  agg.populatedCells += buckets.size;
  // ⭐ The PRIORITY pass ignores the cursor: the cities are re-stamped on every dispatch, by design.
  const ordered = nationalSweepOrder(buckets.keys(), grid, priority ? 0 : budget.cursor);
  const batches = nationalSweepBatches(ordered, concurrency);

  let batchIndex = 0;
  try {
    for (; batchIndex < batches.length; batchIndex++) {
      if (!priority) {
        // ⭐ CAPS ARE CHECKED AT A BATCH BOUNDARY, so `nextCursor` is the ord of the first cell of the
        // first batch that did NOT run — an EXACT resume point, not an approximation.
        if (budget.stopReason) break;
        if (agg.cellsStamped >= budget.maxTiles) { budget.stopReason = `maxTiles ${budget.maxTiles}`; break; }
        if (budget.deadlineAt < Infinity && Date.now() >= budget.deadlineAt) {
          budget.stopReason = `time budget ${Math.round(budget.budgetMs / 1000)} s`; break;
        }
      }
      const batch = batches[batchIndex];
      const done = await Promise.all(batch.map(async (c) => ({
        c,
        res: await stampCell({
          cellBbox: nationalCellBbox(grid, c.ix, c.iy), records: buckets.get(c.key) ?? [],
          ix: c.ix, iy: c.iy, key: c.key, grid, priority,
        }),
      })));
      // Counted in CELL ORDER after the batch resolves, so the numbers never depend on which request
      // answered first.
      for (const { c, res } of done) {
        agg.requests += res?.requests ?? 0;
        agg.bytesFetched += res?.bytes ?? 0;
        if (!res?.ok) {
          agg.tileErrors++;
          if (agg.errorSamples.length < 5) agg.errorSamples.push(`${c.key}: ${res?.error ?? 'unknown failure'}`);
          continue;
        }
        if (res.empty) agg.voidTiles++;
        const km2 = nationalCellKm2(grid, c.ix, c.iy);
        agg.cellsStamped++; agg.km2Stamped += km2;
        if (priority) { agg.priorityCells++; agg.priorityKm2 += km2; }
      }
    }
  } catch (err) {
    // §ABORT-IS-NOT-A-CAP — an abort is a FAILURE and is reported as one, never folded into the cap.
    agg.sweepAborted = true; agg.sweepAbortReason = String(err?.message ?? err); budget.stopReason = 'ABORTED';
  }

  // What did this pass NOT open? Everything from the first batch that did not run onward. (Cells the
  // CURSOR skipped are not counted — a previous run covered them, by construction.)
  if (budget.stopReason) {
    const remaining = batches.slice(batchIndex).flat();
    agg.cellsSkipped += remaining.length;
    for (const c of remaining) agg.km2Skipped += nationalCellKm2(grid, c.ix, c.iy);
    if (budget.nextCursor === null && remaining.length) budget.nextCursor = remaining[0].ord;
  }

  // The retained footprints — stamped or not — go to the output. Written AFTER the sweep so a band's
  // heap is released before the next band's partition begins.
  appendRetained(retainedOutPath, records);
  return { status: 'ok', retained: records.length, read };
}

/**
 * Run a whole-country sweep for one join.
 *
 * Stamps `priorityAreas` first and UNCAPPED, then sweeps the POPULATED cells of `grid` in deterministic
 * south→north order from `cursor`, one BOUNDED-HEAP BAND at a time, writing EVERY input record —
 * stamped or original — to `outPath` (a REPLACE input, no double-draw). Never throws.
 *
 * @returns { status:'ok', agg, sweep, swathesTotal, swathesScanned, cursorFrom, swatheRows, elapsedS }
 *          or { status:'error'|'documented', reason, read }
 */
export async function runNationalSweep({
  inPath, outPath, grid, stampAreas, recordOf, stampCell, priorityAreas = [],
  label = 'national sweep', cursorEnvLabel = 'SWEEP_CURSOR',
  cursor = 0, budgetMs = 0, maxTiles = Number.POSITIVE_INFINITY, swatheRows = 0,
  concurrency = DEFAULT_SWEEP_CONCURRENCY, log = null, deps = null,
}) {
  const helpers = await resolveDeps(deps);
  const { appendFileInto } = helpers;
  mkdirSync(dirname(outPath), { recursive: true });
  const t0 = Date.now();
  const budget = {
    maxTiles, budgetMs, cursor,
    deadlineAt: budgetMs > 0 ? Date.now() + budgetMs : Infinity,
    stopReason: null, nextCursor: null,
  };
  const agg = newAgg();
  const conc = Math.max(1, concurrency);
  const passArgs = { grid, budget, agg, recordOf, stampCell, concurrency: conc, helpers };

  // ── THE PASS PLAN ───────────────────────────────────────────────────────────────────────────────
  // pass 0 (optional): the PRIORITY working set, uncapped, cursor-ignored.
  // pass 1..n: the bounded-heap bands (or ONE pass over the whole working set when swatheRows ≤ 0).
  const priority = intersectAreas(stampAreas, [grid.w, grid.s, grid.e, grid.n]).length
    ? intersectAreasList(priorityAreas, stampAreas) : [];
  const bands = swatheRows > 0
    ? nationalSwathes(grid, { swatheRows })
    : [{ index: 0, bbox: [grid.w, grid.s, grid.e, grid.n], ordFrom: 0, ordTo: grid.nx * grid.ny }];
  const swathesTotal = bands.length;
  const multiPass = priority.length > 0 || bands.length > 1;
  let swathesScanned = 0;

  if (!multiPass) {
    // ── SINGLE PASS — a city-sized caller, or a test. Pass-through and retained share `outPath`,
    //    byte-identical in effect to the pre-sweep join.
    const p = await sweepPass({ ...passArgs, inPath, passThroughPath: outPath, retainedOutPath: outPath, areas: stampAreas, label });
    if (p.status !== 'ok') return { status: p.status, reason: p.reason, read: p.read };
    swathesScanned = 1;
  } else {
    writeFileSync(outPath, '');
    const tmp = [`${outPath}.sweep-a`, `${outPath}.sweep-b`];
    let cur = inPath, alt = 0, firstError = null;
    if (log) {
      log(`\n  ${label} · grid ${grid.nx}×${grid.ny} cells of ${grid.lonDeg}°×${grid.latDeg}° · ` +
        `${priority.length} priority area(s) FIRST (uncapped) · ${bands.length} bounded-heap swathe(s)` +
        `${swatheRowsLabel(swatheRows, grid)} · budget ${budgetMs > 0 ? `${Math.round(budgetMs / 60000)} min` : 'none'} / ` +
        `${maxTiles} cells · cursor ${cursor}`);
    }
    const runPass = async (areas, passLabel, isPriority) => {
      const pt = tmp[alt++ % 2];
      const p = await sweepPass({ ...passArgs, inPath: cur, passThroughPath: pt, retainedOutPath: outPath, areas, label: passLabel, priority: isPriority });
      // §EMPTY-IS-NOT-A-FAILURE: a pass returns `documented` when its INPUT holds no records, which is
      // the NORMAL end state — each pass hands the next only what it did not retain. Only `error` is a
      // failure, and an error on the FIRST pass is the whole join's error (it cannot read bake's file).
      if (p.status === 'error') { firstError = p; return false; }
      if (p.status !== 'ok') return false;              // nothing left in the stream
      cur = pt;
      return true;
    };

    if (priority.length) {
      await runPass(priority, `${label} priority`, true);
      if (firstError) {
        for (const t of tmp) { try { if (existsSync(t)) unlinkSync(t); } catch { /* best effort */ } }
        return { status: 'error', reason: firstError.reason, read: firstError.read };
      }
      if (log) log(`    · ${label} priority: ${agg.priorityCells} cell(s) / ${Math.round(agg.priorityKm2)} km² stamped UNCAPPED.`);
    }
    for (const sw of bands) {
      if (budget.stopReason) break;
      if (sw.ordTo <= cursor) continue;                 // resumed run — this band is entirely behind the cursor
      const areas = intersectAreas(stampAreas, sw.bbox);
      if (!areas.length) continue;                      // a band is a HEAP bound, never a widening
      const ok = await runPass(areas, `${label} swathe ${sw.index + 1}/${bands.length}`, false);
      if (firstError) {
        for (const t of tmp) { try { if (existsSync(t)) unlinkSync(t); } catch { /* best effort */ } }
        return { status: 'error', reason: firstError.reason, read: firstError.read };
      }
      if (!ok) break;
      swathesScanned++;
      if (log) {
        log(`    · ${label} swathe ${sw.index + 1}/${bands.length} (lat ${sw.bbox[1].toFixed(2)}–${sw.bbox[3].toFixed(2)}): ` +
          `${agg.cellsStamped} cell(s) read, ${Math.round(agg.km2Stamped)} km², peak heap ${agg.peakHeapUsedMB} MB.`);
      }
    }
    // Everything still unretained — bands never opened, cells behind a cap, anything outside the
    // working set — is written through UNCHANGED. Original OSM tags, honest `assumed`; never
    // fabricated, never dropped. Raw bytes, never through the heap.
    appendFileInto(cur === inPath ? inPath : cur, outPath);
    for (const t of tmp) { try { if (existsSync(t)) unlinkSync(t); } catch { /* best effort */ } }
  }

  if (!budget.stopReason) budget.stopReason = 'complete';
  const nextCell = budget.nextCursor === null ? null : nationalCellBbox(grid, grid.ixOf(budget.nextCursor), grid.iyOf(budget.nextCursor));
  const sweep = {
    stopReason: budget.stopReason, cellsStamped: agg.cellsStamped, km2Stamped: agg.km2Stamped,
    cellsSkipped: agg.cellsSkipped, km2Skipped: agg.km2Skipped,
    priorityCells: agg.priorityCells, priorityKm2: agg.priorityKm2,
    swathesTotal, swathesScanned, nextCursor: budget.nextCursor,
    nextCursorLon: nextCell ? nextCell[0] : null, nextCursorLat: nextCell ? nextCell[1] : null,
    cursorEnv: cursorEnvLabel,
  };
  return {
    status: 'ok', agg, sweep, swathesTotal, swathesScanned,
    cursorFrom: cursor, swatheRows, elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };
}

/** Each priority bbox clipped to the declared working set. A priority box may not widen the working
 *  set either — it is a PRIORITY ORDER over ground we are already allowed to measure, never a licence
 *  to measure new ground (§JOIN-BOUNDED-WORKING-SET). */
function intersectAreasList(priorityAreas, stampAreas) {
  const out = [];
  for (const box of priorityAreas ?? []) {
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) continue;
    out.push(...intersectAreas(stampAreas, box));
  }
  return out;
}

/** The "(0.40° of latitude each)" clause, or nothing when the sweep is a single pass. */
function swatheRowsLabel(swatheRows, grid) {
  return swatheRows > 0 ? ` of ${swatheRows} row(s) (${(swatheRows * grid.latDeg).toFixed(2)}° of latitude each)` : '';
}
