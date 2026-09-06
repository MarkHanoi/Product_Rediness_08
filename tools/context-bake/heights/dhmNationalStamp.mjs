// ─────────────────────────────────────────────────────────────────────────────
// §DHM-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-LAST-NINE) — take the Danish DHM nDSM join from FOUR
// CITY BOXES to the WHOLE OF DENMARK, one bounded-heap band at a time.
//
// ── WHAT WAS ACTUALLY WRONG, AND IT WAS NEVER THE SOURCE ────────────────────────────────────────
// heightSources.mjs's own §JOIN-BOUNDED-WORKING-SET note said it out loud: DHM_CITY_BBOXES is
// *"the four largest Danish urban areas, which is where a DK site is actually dropped; everything else
// in the country passes through with its honest OSM tags"*, with the instruction *"TO WIDEN COVERAGE:
// add a row."* Adding rows is not widening coverage — it is lengthening a list. Copenhagen, Aarhus,
// Odense and Aalborg are ~0.14 deg² of a 26.6 deg² region: every other Dane's building shipped the
// LABELLED `assumed` 9 m, which on the map is INDISTINGUISHABLE from "the source has no data here"
// (L-422/457/467/469 — the same failure the founder hit at Ciudad Real, L-12946).
//
// ── THE MEASUREMENT THAT SAYS THE SOURCE IS NATIONAL (probed 2026-09-06, verbatim) ──────────────
// ⭐ AND IT WAS OBTAINED WITHOUT THE KEY, which is the point. The WIRED endpoint
// `wcs.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS?REQUEST=GetCapabilities` answers **HTTP 401, 0 B,
// no content-type** to a keyless probe — so a lane with no `DATAFORDELER_API_KEY` cannot ask it
// anything, and "Denmark's model is national" would have had to be an ASSERTION. It is not. The SAME
// two coverages are also published through Dataforsyningen's gateway, whose CAPABILITIES document is
// open even though its pixels are not:
//   `https://api.dataforsyningen.dk/dhm_wcs_DAF?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCapabilities`
//     → HTTP 200 · text/xml;charset=utf-8 · 2,170 B · 0.28 s · `<fees>NONE</fees>` ·
//       `<accessConstraints>NONE</accessConstraints>` · `<Service><name>DTM</name>`
//     → `<CoverageOfferingBrief><name>dhm_terraen</name>` lonLatEnvelope CRS84
//       `8.00830949937517 54.4354651516217` → `15.5979112056959 57.7690657013977`
//     → `<CoverageOfferingBrief><name>dhm_overflade</name>` — the SAME envelope.
//   Those two names are byte-identical to `DHM_WCS.dtm` / `DHM_WCS.dsm` in heightSources.mjs, and that
//   envelope is the whole of Denmark, Bornholm (lon ≈ 15.2) included. So BOTH halves of the difference
//   are declared national by the publisher.
// ⛔ AND THE DISCRIMINATING TEST WAS RUN, so this is not a GetCapabilities-is-an-inventory mistake:
//   GetCoverage against that same gateway, keyless, at Copenhagen (25832 725000,6176000 +200 m) and at
//   Esbjerg (467000,6153000 — in NONE of the four cities) → **HTTP 403 · text/plain;charset=utf-8 ·
//   40 B · body `User not authorized`** for `dhm_overflade` AND `dhm_terraen`. Identical refusal
//   inside and outside the four cities: the gate is the ACCOUNT, not the geography.
//   Other doors probed the same minute, so the next reader does not re-probe them:
//   `services.datafordeler.dk/DHMNedboer/dhm_wcs/1.0.0/WCS` → HTTP 403 application/vnd.ogc.se_xml 239 B;
//   `api.dataforsyningen.dk/dhm?…` → HTTP 404 text/html 604 B (the gateway's own "API Gateway" page).
//
// ── ⚠ THE HONEST LIMIT OF THIS CHANGE, SAID FIRST ───────────────────────────────────────────────
// The DK join is apikey-GATED. Without `DATAFORDELER_API_KEY` it returns `blocked` and NOT ONE
// footprint is stamped — before this change and after it. So this does NOT put measured heights on
// Danish buildings today; it removes the ceiling that would still be there when the secret exists.
// Widening the retain set while the door is shut is the RIGHT order (the alternative is discovering,
// on the day the key lands, that Esbjerg is still permanently unmeasurable) — but calling it
// "Denmark now has measured heights" would be exactly the claim this repo keeps having to retract.
//
// ── WHAT THE SWEEP DOES ─────────────────────────────────────────────────────────────────────────
// The retain set is the country; the heap is bounded by BANDS of whole UTM32 tile rows, not by
// narrowing where we may measure. The four cities keep their second job: the PRIORITY order, stamped
// FIRST and UNCAPPED, so a truncated run still helps the most users. A run prints the populated km² it
// SKIPPED and `DHM_SWEEP_CURSOR=<ord>` to resume at.
// ⚠ Successive runs do NOT accumulate into one tileset today — each bake regenerates the stamped file,
//   so a second dispatch with the cursor stamps a DIFFERENT slice. Spain's named limitation
//   (§MDS-NATIONAL-SWEEP "HONESTY LIMIT"), inherited unchanged.
// ⛔ Every honesty rule of the join it drives is untouched: a cell never opened, a WCS refusal, a
//    footprint with too few clean pixels — all end with the footprint keeping its ORIGINAL OSM tags.
//
// WHY ITS OWN MODULE: heightSources.mjs is edited by many lanes at once and a whole-function insertion
// there collides (the nl3dbagStamp / mnhFrNationalStamp / swissNationalStamp precedent). The band pass
// it drives — `stampDhmHeightsOnGeojsonseq` — stays where it is.
// ─────────────────────────────────────────────────────────────────────────────
import { DHM_CITY_BBOXES, stampDhmHeightsOnGeojsonseq, statsOf } from '../heightSources.mjs';
import {
  DHM_NATIONAL_BBOX, DHM_NATIONAL_BBOXES, DHM_UTM32_NATIVE_BOX, DHM_UTM32_NATIVE_BOXES,
  formatNationalSweepSummary, makeSweepBudget, nativeTileGrid, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { foldBandResults, runSwathedNationalStamp } from './nationalSweepRunner.mjs';

export { DHM_NATIONAL_BBOX, DHM_NATIONAL_BBOXES, DHM_UTM32_NATIVE_BOX, DHM_UTM32_NATIVE_BOXES };

/**
 * The native sweep cell, metres. 2,000 m at the join's `resM` 2.0 is EXACTLY `maxTilePx` 1000 px per
 * axis — the request ceiling reached with no resampling loss. The pre-existing 0.02° span was
 * 2,226.4 m, which asks for 1,113 px, hits the 1000 px cap and silently samples at 2.23 m instead;
 * this is a small honesty gain that comes free with moving to a native grid.
 */
export const DHM_TILE_M = 2000;

/**
 * Tile ROWS per bounded-heap pass. 20 × 2 km = 40 km of northing ≈ 10 % of the 204-row grid.
 * Denmark's OSM clip is small (43,094 km² of land, ~3.2 M buildings) and the MEASURED heap cost is
 * ~1,256 B per parsed footprint (geojsonseqRead.spec.ts §heap-budget), so a 40 km band is deliberately
 * conservative. ⭐ Overridable by `DHM_SWATHE_ROWS`, so a band that trips the heap watchdog is halved
 * on the NEXT dispatch without a code change — never by raising the heap.
 */
export const DHM_SWATHE_ROWS = 20;

/**
 * Cells a national run may open. Each cell is TWO WCS GetCoverage GETs (DSM + DTM) of ≤ 1000 × 1000 px.
 * 5,000 cells is 20,000 km² of POPULATED Danish ground — roughly half the country's land area, and far
 * more than its built-up fraction. The wall clock is the real bound and it truncates LOUDLY.
 */
export const DHM_SWEEP_MAX_CELLS = 5_000;

/**
 * Stamp DHM nDSM heights across the WHOLE of Denmark, one bounded-heap band at a time.
 *
 * Same join, same sampler, same honesty rules as `stampDhmHeightsOnGeojsonseq` — this only changes
 * WHERE it is allowed to look (the country, not four boxes) and adds the machinery that makes that
 * survivable: UTM32 swathe passes, an ordered numeric sweep, a resume cursor and loud truncation.
 *
 * @param bbox [w,s,e,n] WGS84 — the `denmark` bake row's bbox.
 */
export async function stampDhmNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  maxTiles = DHM_SWEEP_MAX_CELLS, retainBboxes = null, sweepCursor = null, sweepBudgetMs = null,
  swatheRows = null, priorityBboxes = DHM_CITY_BBOXES.map((c) => c.bbox), ...rest
} = {}) {
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'DHM national join: no bbox supplied' };
  // ⛔ Bands, cell ords and cursor all live in EPSG:25832 metres — see heights/nationalSweep.mjs
  //    §NATIVE-TILE-GRID for why mixing a WGS84 band with a native ord space steps the cursor over
  //    real cells instead of resuming at them.
  const grid = nativeTileGrid(DHM_UTM32_NATIVE_BOX, DHM_TILE_M);
  const budgetMin = Number(process.env.DHM_SWEEP_BUDGET_MIN ?? 90) || 90;
  const budget = makeSweepBudget({
    maxTiles,
    budgetMs: Number(sweepBudgetMs ?? budgetMin * 60_000) || 0,
    startCursor: resolveSweepCursor(sweepCursor, process.env.DHM_SWEEP_CURSOR),
  });
  const rows = resolveSwatheRows(swatheRows, process.env.DHM_SWATHE_ROWS, DHM_SWATHE_ROWS);
  // `retainBboxes` is the WGS84 DECLARATION bake.mjs hands us (DHM_NATIONAL_BBOXES, which the coverage
  // ledger reads); the runner needs the SAME ground in UTM32, and that is a PINNED constant with its
  // own provenance — never re-derived, because a native box smaller than the region is the
  // §MDS-BBOX-MUST-COVER-THE-REGION hole in a different unit.
  const declared = Array.isArray(retainBboxes) && retainBboxes.length ? retainBboxes : DHM_NATIONAL_BBOXES;
  const areas = DHM_UTM32_NATIVE_BOXES;

  const run = await runSwathedNationalStamp({
    stamp: stampDhmHeightsOnGeojsonseq,
    inPath, outPath, bbox, retainBboxes: areas, grid, swatheRows: rows, budget, label: 'DK DHM nDSM',
    callOpts: {
      ...rest, maxTiles, tileSpanM: DHM_TILE_M,
      // Retain boxes and bands are UTM32; the four priority cities are WGS84 and the stamp converts
      // them with its own closed-form projector.
      areaCrs: 'utm32', priorityCrs: 'wgs84', priorityBboxes,
    },
  });
  if (run.status === 'error') return { status: 'error', reason: run.reason };
  if (!run.results.length) return { status: 'documented', reason: 'DHM national join: no band held a footprint.' };
  // ⭐ `blocked` (no DATAFORDELER_API_KEY) is the DK join's NORMAL state today and must surface UNCHANGED
  // — a national retain set must never turn a missing secret into a quieter message.
  const blocked = run.results.find((r) => r.status === 'blocked');
  if (blocked) return blocked;
  const degraded = run.results.find((r) => r.status === 'documented');
  if (degraded && !run.results.some((r) => r.status === 'ok')) return degraded;

  const ok = run.results.filter((r) => r.status === 'ok');
  const fold = foldBandResults(ok, {
    sum: ['footprintCount', 'measuredCount', 'retainedFootprints', 'tilesProcessed', 'priorityTiles',
      'tileErrors', 'populatedCells'],
    max: ['peakHeapUsedMB', 'heapLimitMB'],
    concat: [],
  });
  const heights = [...budget.heights].sort((a, b) => a - b);
  const cur = { ix: grid.ixOf(budget.nextCursor), iy: grid.iyOf(budget.nextCursor) };
  const sweep = {
    stopReason: budget.stopReason ?? 'complete',
    cellsStamped: budget.cellsStamped, km2Stamped: budget.km2Stamped,
    cellsSkipped: budget.cellsSkipped, km2Skipped: budget.km2Skipped,
    swathesTotal: budget.swathesTotal, swathesScanned: budget.swathesScanned,
    nextCursor: budget.nextCursor,
  };
  return {
    status: 'ok', outPath, ...fold,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    coverage: fold.footprintCount ? Number((fold.measuredCount / fold.footprintCount).toFixed(3)) : 0,
    tileGrid: `${grid.nx}×${grid.ny}`, tileM: DHM_TILE_M,
    tileCapHit: String(budget.stopReason ?? '').startsWith('maxTiles'),
    sweepAborted: ok.some((r) => r.sweepAborted), sweepAbortReason: ok.find((r) => r.sweepAborted)?.sweepAbortReason ?? null,
    sweep, sweepCursorFrom: budget.startCursor, swatheRows: rows,
    // The resume point as UTM32 metres, so the cursor is checkable on a map rather than opaque.
    nextCursorEasting: grid.w + cur.ix * DHM_TILE_M, nextCursorNorthing: grid.s + cur.iy * DHM_TILE_M,
    stampAreas: areas.length, declaredAreas: declared.length,
    attribution: 'Danmarks Højdemodel (DHM) — Styrelsen for Dataforsyning og Infrastruktur, via Datafordeler (apikey)',
    note: `DHM nDSM (P90 of dhm_overflade−dhm_terraen over the eroded footprint) stamped onto OSM footprints across `
      + `the WHOLE COUNTRY → ${fold.measuredCount}/${fold.footprintCount} RETAINED footprint(s) got a MEASURED height; `
      + `${fold.passedThroughFootprints} never held by any band passed through with their ORIGINAL OSM tags; `
      + `${fold.tilesProcessed} of ${fold.populatedCells} populated ${DHM_TILE_M} m cell(s) read, `
      + `${fold.tileErrors} raster error(s). `
      + `${formatNationalSweepSummary(sweep, { label: 'DHM national sweep', cursorEnv: 'DHM_SWEEP_CURSOR' })} `
      + `Resume at UTM32 E ${Math.round(grid.w + cur.ix * DHM_TILE_M)} N ${Math.round(grid.s + cur.iy * DHM_TILE_M)}. `
      + `The ${priorityBboxes.length} priority cities are stamped UNCAPPED in their own pass. `
      + `Peak heap ${fold.peakHeapUsedMB} MB of ${fold.heapLimitMB} MB.`,
  };
}
