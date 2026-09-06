// ─────────────────────────────────────────────────────────────────────────────
// §SWISS-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-LAST-NINE) — take the swisstopo nDSM join from NINE
// CITY BOXES to the WHOLE OF SWITZERLAND, one bounded-heap band at a time.
//
// ── WHY THIS WAS OWED, IN THE PREVIOUS LANE'S OWN WORDS ─────────────────────────────────────────
// `heights/nationalHeightsAssessed.mjs` filed CH under status `'not-done-shape'` — the value it
// created specifically so a gap could not hide inside `wired-partial`:
//
//   "swissSURFACE3D − swissALTI3D IS national (STAC → LV95 COG), and the retain set is
//    SWISS_CITY_BBOXES: nine cities. ⚠ NOT REFUSED — NOT DONE. The blocker is shape, not data: this
//    join sweeps by swisstopo's OWN 1 km LV95 tile key rather than by a degree grid, so the shared
//    kernel's cell `ord` (and therefore its resume cursor) does not apply unmodified. Taking CH
//    national is a real, tractable piece of work — a tile-key ordinal."
//
// This is that tile-key ordinal, plus the machinery a national retain set needs to survive a bake.
// The missing piece was `nativeTileGrid` in heights/nationalSweep.mjs (§NATIVE-TILE-GRID): a grid in
// PROJECTED METRES whose cell (0,0) is a real swisstopo tile, so `ix` is `E_km − E0_km` and the
// kernel's `ordOf` / resume cursor apply unchanged. Verified: LV95 2683189, 1248069 (Zürich HB) →
// cell (203,176) → key 2683-1248, which is the token `pickCogAsset` matches in an asset href.
//
// ── THE MEASUREMENT THAT SAYS THE SOURCE IS NATIONAL (probed 2026-09-06, every number verbatim) ──
// It was never enough that the STAC *collection* declares a national extent — a collection extent is
// a claim about a bounding box, not about published tiles (this repo's §GETCAPABILITIES-IS-NOT-AN-
// INVENTORY lesson). So five 0.02° boxes in NONE of the nine cities were queried directly:
//   DSM  ch.swisstopo.swisssurface3d-raster /items?bbox=…
//     • Chur       9.52,46.84,9.54,46.86 → HTTP 200 application/json 22,856 B 0.596 s · 10 items
//                                          (swisssurface3d-raster_2020_2758-1189 …)
//     • Sion       7.35,46.22,7.37,46.24 → HTTP 200 application/json 13,856 B 0.555 s ·  6 items (2022)
//     • Bellinzona 9.01,46.19,9.03,46.21 → HTTP 200 application/json 13,863 B 0.593 s ·  6 items (2020)
//     • Davos      9.82,46.79,9.84,46.81 → HTTP 200 application/json 22,866 B 0.756 s · 10 items (2020)
//     • Appenzell  9.40,47.32,9.42,47.34 → HTTP 200 application/json 22,874 B 1.005 s · 10 items (2018)
//   DTM  ch.swisstopo.swissalti3d /items?bbox=… — the PAIR has to exist too, or the difference is not
//     a height: Chur → HTTP 200 29,886 B 0.716 s · 10 items · 10 `_2_2056_*.tif` assets; Davos → HTTP
//     200 29,896 B 0.554 s · 10 items · 10 assets. First href, verbatim:
//     https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2019_2758-1189/swissalti3d_2019_2758-1189_2_2056_5728.tif
//   Collection extent, from the collection document itself (HTTP 200, 1,819 B): spatial bbox
//     [[5.9503666, 45.7213375, 10.4998461, 47.8216742]] — the country. `license: "proprietary"`,
//     which links swisstopo's free-geodata terms (commercial use allowed, source reference mandatory).
// FIVE FOR FIVE, in four different acquisition years, on both products. The reach was OURS, not
// swisstopo's — the identical finding the NL/CZ/AT/FR conversions made on 2026-09-06.
//
// ── WHAT THIS DOES *NOT* CLAIM ──────────────────────────────────────────────────────────────────
// It does NOT claim one bake measures Switzerland. It claims the retain set is the country, so a
// footprint in Chur is REACHABLE by the sweep instead of permanently unmeasurable. A run takes a
// declared slice, stamps the nine priority metros FIRST and UNCAPPED, then sweeps south→north from a
// cursor, and prints the populated km² it SKIPPED plus `SWISS_SWEEP_CURSOR=<ord>` to resume at.
// ⚠ Successive runs do NOT accumulate into one tileset today — each bake regenerates the stamped
//   file, so a second dispatch with the cursor stamps a DIFFERENT slice. That is Spain's named
//   limitation (§MDS-NATIONAL-SWEEP "HONESTY LIMIT"), inherited unchanged, not a new one.
// ⛔ And nothing here changes the honesty rules of the join it drives: a cell the sweep never opened,
//    a STAC index that refused us, a lake tile with no published item and a footprint with too few
//    clean pixels all end the SAME way — the footprint keeps its ORIGINAL OSM tags and the client
//    draws the labelled `assumed` default. Never a fabricated height.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: that file is edited by many
// lanes at once and a whole-function insertion there collides (the nl3dbagStamp / mnhFrNationalStamp
// precedent). The band pass it drives — `stampSwissHeightsOnGeojsonseq` — stays where it is.
//
// ⛔ AND IT IMPORTS NO PROJECTOR. proj4 is a STANDALONE dep of tools/context-bake and does NOT resolve
//    from the repo root, so a static `import … from '../reproject.mjs'` here would stop this module's
//    own spec from LOADING — the trap dcef4524 records. The LV95 box is the PINNED, provenance-carrying
//    constant `SWISS_LV95_NATIVE_BOX`, and the nine priority cities are handed over in WGS84 for the
//    stamp (which already holds the projector) to convert. Named, so nobody "tidies" it into an import.
// ─────────────────────────────────────────────────────────────────────────────
import { SWISS_CITY_BBOXES, stampSwissHeightsOnGeojsonseq, statsOf } from '../heightSources.mjs';
import {
  SWISS_NATIONAL_BBOX, SWISS_NATIONAL_BBOXES, SWISS_LV95_NATIVE_BOX, SWISS_LV95_NATIVE_BOXES,
  formatNationalSweepSummary, makeSweepBudget, nativeTileGrid,
  resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
// The publisher's tile edge comes from the PURE module that probed it (1 km LV95, swisstopo's own
// grid) — never re-typed here, so the grid and `pickCogAsset`'s href token can never disagree.
import { SWISS_NDSM } from './swissNdsm.mjs';
import { foldBandResults, runSwathedNationalStamp } from './nationalSweepRunner.mjs';

export { SWISS_NATIONAL_BBOX, SWISS_NATIONAL_BBOXES, SWISS_LV95_NATIVE_BOX, SWISS_LV95_NATIVE_BOXES };

/**
 * Tile ROWS per bounded-heap pass, in swisstopo km. 40 km of northing per band ≈ 6 % of the 233-row
 * grid. Switzerland's OSM clip is far smaller than France's or Spain's (41,285 km² of land against
 * 551,695 and 505,990), and the MEASURED heap cost is ~1,256 B per parsed OSM footprint
 * (geojsonseqRead.spec.ts §heap-budget) — so a 40 km band is a deliberately conservative first
 * setting, not a tuned one. ⭐ It is overridable by `SWISS_SWATHE_ROWS` precisely so a band that trips
 * the heap watchdog can be halved on the NEXT dispatch without a code change — never by raising heap.
 */
export const SWISS_SWATHE_ROWS = 40;

/**
 * Cells a national run may open. Each cell is TWO STAC lookups plus TWO COG reads (the DSM at its 1 m
 * overview by HTTP range, the 2 m DTM whole ≈ 1 MB), measured in heights/swissNdsm.mjs at ~1.15 s and
 * ~0.53 s for the raster halves. 6,000 cells is ~6,000 km² of POPULATED Swiss ground — well above the
 * built-up area of the country and well inside the job ceiling; the wall clock is the real bound and
 * it truncates LOUDLY with a cursor.
 */
export const SWISS_SWEEP_MAX_CELLS = 6_000;

/**
 * Stamp swisstopo nDSM heights across the WHOLE of Switzerland, one bounded-heap band at a time.
 *
 * Same join, same sampler, same honesty rules as `stampSwissHeightsOnGeojsonseq` — this only changes
 * WHERE it is allowed to look (the country, not nine boxes) and adds the machinery that makes that
 * survivable: LV95 swathe passes, the tile-key ordinal sweep, a resume cursor and loud truncation.
 *
 * @param bbox [w,s,e,n] WGS84 — the `switzerland` bake row's bbox.
 */
export async function stampSwissNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  maxTiles = SWISS_SWEEP_MAX_CELLS, retainBboxes = null, sweepCursor = null, sweepBudgetMs = null,
  swatheRows = null, priorityBboxes = SWISS_CITY_BBOXES.map((c) => c.bbox), ...rest
} = {}) {
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'Swiss national join: no bbox supplied' };
  // ⛔ THE BANDS, THE CELL ORDS AND THE CURSOR ALL LIVE IN LV95 METRES. `nationalSwathes` bands by row
  //    index and `intersectAreas` is a pure numeric box intersection — neither reads a unit — so a
  //    native grid + a native retain set gives bands whose ord ranges are strictly increasing in the
  //    same space the cursor is written in. A WGS84 band over a native ord space is NOT monotone
  //    (LV95 northing at a fixed parallel varies by kilometres across CH's 4.6° of longitude) and
  //    would let the cursor step silently over real cells. See §NATIVE-TILE-GRID.
  const grid = nativeTileGrid(SWISS_LV95_NATIVE_BOX, SWISS_NDSM.tileM);
  const budgetMin = Number(process.env.SWISS_SWEEP_BUDGET_MIN ?? 90) || 90;
  const budget = makeSweepBudget({
    maxTiles,
    budgetMs: Number(sweepBudgetMs ?? budgetMin * 60_000) || 0,
    startCursor: resolveSweepCursor(sweepCursor, process.env.SWISS_SWEEP_CURSOR),
  });
  const rows = resolveSwatheRows(swatheRows, process.env.SWISS_SWATHE_ROWS, SWISS_SWATHE_ROWS);
  // ⚠ `retainBboxes` here is the WGS84 DECLARATION bake.mjs hands us (SWISS_NATIONAL_BBOXES, which the
  // coverage ledger reads). The runner needs the SAME ground in LV95, and that is a PINNED constant
  // with its own provenance — never re-derived, because a native box smaller than the region is the
  // §MDS-BBOX-MUST-COVER-THE-REGION hole in a different unit.
  const declared = Array.isArray(retainBboxes) && retainBboxes.length ? retainBboxes : SWISS_NATIONAL_BBOXES;
  const areas = SWISS_LV95_NATIVE_BOXES;

  const run = await runSwathedNationalStamp({
    stamp: stampSwissHeightsOnGeojsonseq,
    inPath, outPath, bbox, retainBboxes: areas, grid, swatheRows: rows, budget, label: 'swisstopo nDSM',
    callOpts: {
      ...rest, maxTiles,
      // The retain boxes and the bands are LV95; the nine priority cities are WGS84 and the stamp
      // converts them with the projector it already loads (this module stays proj4-free — see header).
      areaCrs: 'lv95', priorityCrs: 'wgs84', priorityBboxes,
    },
  });
  if (run.status === 'error') return { status: 'error', reason: run.reason };
  if (!run.results.length) return { status: 'documented', reason: 'Swiss national join: no band held a footprint.' };
  const degraded = run.results.find((r) => r.status === 'documented' || r.status === 'blocked');
  // A `documented` FIRST band is the geotiff/proj4 build gate, not an empty stream — surface it as-is.
  if (degraded && run.results.indexOf(degraded) === 0 && !run.results.some((r) => r.status === 'ok')) return degraded;

  const ok = run.results.filter((r) => r.status === 'ok');
  const fold = foldBandResults(ok, {
    sum: ['footprintCount', 'measuredCount', 'retainedFootprints', 'tilesProcessed', 'priorityTiles',
      'tileErrors', 'voidTiles', 'populatedCells', 'stacRequests'],
    max: ['peakHeapUsedMB', 'heapLimitMB'],
    concat: [],
  });
  const heights = [...budget.heights].sort((a, b) => a - b);
  // ⭐ The resume point is printed as swisstopo's OWN tile key, not as a lat/lon. `2683-1248` is the
  // token in the asset href AND the label on swisstopo's tile index, so an operator can check the
  // cursor against the publisher's map rather than trusting an opaque integer.
  const cur = { ix: grid.ixOf(budget.nextCursor), iy: grid.iyOf(budget.nextCursor) };
  const curKey = grid.keyOf(cur.ix, cur.iy);
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
    tileGrid: `${grid.nx}×${grid.ny} LV95 km² tile(s)`, tileM: SWISS_NDSM.tileM,
    tileCapHit: String(budget.stopReason ?? '').startsWith('maxTiles'),
    sweepAborted: ok.some((r) => r.sweepAborted), sweepAbortReason: ok.find((r) => r.sweepAborted)?.sweepAbortReason ?? null,
    sweep, sweepCursorFrom: budget.startCursor, nextCursorTile: `${curKey.x}-${curKey.y}`,
    swatheRows: rows, stampAreas: areas.length, declaredAreas: declared.length,
    attribution: 'Federal Office of Topography swisstopo — swissSURFACE3D Raster & swissALTI3D (free geodata terms; source reference mandatory)',
    note: `swisstopo nDSM (P90 of swissSURFACE3D − swissALTI3D over the eroded footprint) stamped onto OSM footprints `
      + `across the WHOLE COUNTRY → ${fold.measuredCount}/${fold.footprintCount} RETAINED footprint(s) got a MEASURED `
      + `height; ${fold.passedThroughFootprints} never held by any band passed through with their ORIGINAL OSM tags; `
      + `${fold.tilesProcessed} of ${fold.populatedCells} populated LV95 km² tile(s) read (${fold.stacRequests} STAC `
      + `lookups), ${fold.voidTiles} void (lake / unpublished) tile(s), ${fold.tileErrors} tile error(s). `
      + `${formatNationalSweepSummary(sweep, { label: 'swisstopo national sweep', cursorEnv: 'SWISS_SWEEP_CURSOR' })} `
      + `Resume tile key ${curKey.x}-${curKey.y}. The ${priorityBboxes.length} priority cities are stamped UNCAPPED `
      + `in their own pass. Peak heap ${fold.peakHeapUsedMB} MB of ${fold.heapLimitMB} MB.`,
  };
}
