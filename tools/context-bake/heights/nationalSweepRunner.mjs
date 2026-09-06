// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-SWEEP-RUNNER (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the I/O half of
// heights/nationalSweep.mjs: run an EXISTING per-cell height stamp over a WHOLE COUNTRY, one
// bounded-heap band at a time, against ONE shared budget and ONE shared resume cursor.
//
// ── WHY A WRAPPER AND NOT A REWRITE ─────────────────────────────────────────────────────────────
// Every join this lane takes national (NL 3DBAG, CZ ČÚZK, AT BEV) is already a correct, LIVE,
// unit-tested per-cell stamp. What it lacked was REACH: its retain set was a hand-written city list,
// so a town outside the list could never be measured by any number of re-bakes, and the failure was
// SILENT — an unstamped footprint reports an honest `assumed` 9 m, which on the map is
// indistinguishable from "the source has no data here" (L-422/457/467/469, and L-12946 at Ciudad
// Real, where the founder hit it).
//
// Rewriting three working joins into one generic fetcher would have put the per-country knowledge
// (ČÚZK's refusal-inside-a-200, BEV's LAEA COG windows, 3DBAG's two-direction part match) through a
// second pair of hands for no user-visible gain. So the stamps keep their bodies and gain exactly
// four options — `passThroughPath`, `retainedOutPath`, `sweepBudget`, `sweepGrid` — and this file
// drives them band by band. A city-sized caller that passes none of the four behaves EXACTLY as
// before, which is what the existing wiring specs pin.
//
// ── THE INVARIANT THE BAND CHAIN RESTS ON ───────────────────────────────────────────────────────
// Each pass reads the previous pass's PASS-THROUGH file (strictly smaller than its own input),
// retains only the footprints whose centroid is in this band, appends every retained record —
// stamped or not — to the shared output, and streams everything else through as RAW BYTES. So:
//   • every input record leaves in exactly one of the two files (partition, not filter);
//   • bands partition LATITUDE, so a footprint is retained by exactly one band;
//   • whatever is left after the last band is concatenated UNCHANGED, with its original OSM tags.
// Nothing is dropped, nothing is duplicated, and nothing is fabricated. Peak heap tracks ONE band.
//
// ⛔ A BAND MAY ONLY NARROW THE WORKING SET. `intersectAreas` is an intersection on purpose: an empty
//    result means "this band holds none of the declared working set", which is a SKIP — never a
//    fallback to the whole band (§JOIN-BOUNDED-WORKING-SET).
//
// ── ⚠ THERE IS A SIBLING RUNNER, AND SAYING SO IS THE POINT ─────────────────────────────────────
// `heights/nationalSweepStamp.mjs` (`runNationalSweep`, lane HEIGHTS-WHOLE-COUNTRY-B, same day) does
// the same job with a different seam: a join hands IT a `stampCell` adapter and it owns the retain +
// partition itself, at concurrency; THIS file wraps a join's EXISTING whole-stamp function and drives
// it band by band, serially. Both sit on the SAME pure kernel (heights/nationalSweep.mjs) — the sibling
// adopted it rather than re-deriving it — so the grid, the swathe plan, the order, the cursor, the km²
// accounting and the truncation sentence are one implementation, not two.
//
// The two lanes were writing within the hour and neither could have grepped for a file that did not
// exist yet. Converging the RUNNERS is real, owed work — the sibling's adapter seam is the better one
// for a join written from scratch, and this one's is the lower-risk change for four joins that were
// already live and unit-tested. ⛔ What must NOT happen is a THIRD runner: a new national join takes
// one of these two. Named here rather than left for someone to discover.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { appendFileInto } from '../heightSources.mjs';
import {
  intersectAreas, nationalCellBbox, nationalSwathes,
} from './nationalSweep.mjs';

/**
 * Run `stamp` over `retainBboxes` one bounded-heap band at a time.
 *
 * @param stamp        (inPath, outPath, bbox, opts) => Promise<result>. Must honour `passThroughPath`,
 *                     `retainedOutPath` and `sweepBudget`.
 * @param retainBboxes the DECLARED national working set (never widened here).
 * @param grid         nationalTileGrid over the REGION bbox — the same grid in every band, so a cell
 *                     ord written by one band is readable by the next.
 * @param swatheRows   tile rows per band. 0 ⇒ ONE pass (a city-sized caller, or a unit test).
 * @param budget       makeSweepBudget(...) — shared and MUTATED across bands.
 * @returns {{status:'ok'|'error', reason?:string, results:object[], bandsRun:number}}
 */
export async function runSwathedNationalStamp({
  stamp, inPath, outPath, bbox, retainBboxes, grid, swatheRows = 0, budget,
  label = 'national', callOpts = {}, onBand = null,
}) {
  const results = [];

  // ── SINGLE PASS — pass-through and retained share `outPath`, byte-identical in effect to the
  //    pre-swathe join. This is the path every existing unit test and every city-sized row takes.
  if (!swatheRows || swatheRows <= 0) {
    budget.swathesTotal = 1;
    const res = await stamp(inPath, outPath, bbox, { ...callOpts, retainBboxes, sweepBudget: budget, sweepGrid: grid });
    if (res.status === 'error') return { status: 'error', reason: res.reason, results: [res], bandsRun: 0 };
    budget.swathesScanned = 1;
    results.push(res);
    return { status: 'ok', results, bandsRun: 1 };
  }

  // ── BOUNDED-HEAP MULTI-PASS (§SWATHE).
  writeFileSync(outPath, '');
  const swathes = nationalSwathes(grid, { swatheRows });
  budget.swathesTotal = swathes.length;
  const tmp = [`${outPath}.sweep-a`, `${outPath}.sweep-b`];
  let cur = inPath, alt = 0;
  // ⚠ A NATIVE grid (§NATIVE-TILE-GRID) measures in projected METRES. Printing its `latDeg` with a °
  // sign would report a 1 km swisstopo tile as a 1000-degree cell — a log line that is not merely ugly
  // but WRONG, and this file's whole job is that the truncation numbers can be trusted.
  const cellUnit = grid.native ? `${grid.tileM} m × ${grid.tileM} m (projected)` : `${grid.lonDeg}°×${grid.latDeg}°`;
  const bandSpan = grid.native
    ? `${((swatheRows * grid.tileM) / 1000).toFixed(0)} km of northing each`
    : `${(swatheRows * grid.latDeg).toFixed(2)}° of latitude each`;
  console.log(`\n  ${label} national sweep · grid ${grid.nx}×${grid.ny} cells of ` +
    `${cellUnit} · ${swathes.length} bounded-heap swathe(s) of ${swatheRows} row(s) ` +
    `(${bandSpan}) · budget ` +
    `${budget.budgetMs > 0 ? `${Math.round(budget.budgetMs / 60000)} min` : 'none'} / ${budget.maxTiles} cells · ` +
    `cursor ${budget.startCursor}`);

  try {
    for (const sw of swathes) {
      if (budget.stopReason) break;
      if (sw.ordTo <= budget.startCursor) continue;      // resumed run — this band is entirely behind the cursor
      const areas = intersectAreas(retainBboxes, sw.bbox);
      if (!areas.length) continue;                       // this band holds none of the working set
      const pt = tmp[alt++ % 2];
      const res = await stamp(cur, outPath, bbox, {
        ...callOpts, retainBboxes: areas, passThroughPath: pt, retainedOutPath: outPath,
        sweepBudget: budget, sweepGrid: grid,
      });
      // §EMPTY-IS-NOT-A-FAILURE (mdsNational's scar, kept): a pass returns `documented` when its
      // INPUT holds no records, which is the NORMAL end state — each pass hands the next only what it
      // did not retain. Only `error` is a failure. An error on the FIRST pass is the whole join's
      // error (a partition that cannot read bake's own file), so it is RETURNED, not swallowed.
      if (res.status === 'error') {
        cleanup(tmp);
        return { status: 'error', reason: res.reason, results, bandsRun: budget.swathesScanned };
      }
      results.push(res);
      if (res.status !== 'ok') break;                    // nothing left in the stream
      budget.swathesScanned++;
      cur = pt;
      if (onBand) onBand(sw, res, budget);
      else {
        const where = grid.native
          ? `N ${Math.round(sw.bbox[1])}–${Math.round(sw.bbox[3])} m`
          : `lat ${sw.bbox[1].toFixed(2)}–${sw.bbox[3].toFixed(2)}`;
        console.log(`    · ${label} swathe ${sw.index + 1}/${swathes.length} ` +
          `(${where}): ${budget.heights.length} measured so far over ` +
          `${budget.cellsStamped} cell(s), ${Math.round(budget.km2Stamped)} km², cursor ${budget.nextCursor}.`);
      }
    }
  } finally {
    // Everything still unretained — bands never opened, cells behind a cap, and anything outside the
    // working set — is written through UNCHANGED. Original OSM tags, honest `assumed`; never
    // fabricated, never dropped. Raw bytes, never through the heap.
    appendFileInto(cur, outPath);
    cleanup(tmp);
  }
  return { status: 'ok', results, bandsRun: budget.swathesScanned };
}

function cleanup(paths) {
  for (const p of paths) { try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ } }
}

/**
 * Fold the per-band results into one. `sum` adds, `max` takes the largest, `concat` joins arrays
 * (capped, so a 20-band run does not return 100 error samples), and anything else is taken from the
 * FIRST band — which is where `count` (the records parsed in the whole clip) is correct: later
 * passes re-parse only what is left, so SUMMING it would over-report the input several-fold
 * (mdsNational's scar, and usasNationalStamp's `if (agg.parsed === 0)`).
 */
export function foldBandResults(results, { sum = [], max = [], concat = [], concatCap = 8 } = {}) {
  const out = {};
  const first = results[0] ?? {};
  for (const k of sum) out[k] = results.reduce((a, r) => a + (Number(r?.[k]) || 0), 0);
  for (const k of max) out[k] = results.reduce((a, r) => Math.max(a, Number(r?.[k]) || 0), 0);
  for (const k of concat) {
    const all = [];
    for (const r of results) for (const v of (Array.isArray(r?.[k]) ? r[k] : [])) all.push(v);
    out[k] = all.slice(0, concatCap);
  }
  out.count = Number(first.count) || 0;
  // What is LEFT after the LAST pass, not a running total: each pass hands the next only what it did
  // not retain, so the last pass's number is the honest "never held by any band".
  out.passedThroughFootprints = Number(results[results.length - 1]?.passedThroughFootprints) || 0;
  return out;
}

/** The SW corner of the cell a truncated sweep will resume at — printed so the cursor is checkable
 *  against a map instead of being an opaque integer. */
export function cursorCorner(grid, ord) {
  if (!Number.isFinite(ord) || ord === null) return { lat: null, lon: null };
  const [lon, lat] = nationalCellBbox(grid, grid.ixOf(ord), grid.iyOf(ord));
  return { lat, lon };
}
