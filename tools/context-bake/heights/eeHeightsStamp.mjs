// ─────────────────────────────────────────────────────────────────────────────
// §EE-ETAK-OSM-JOIN (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — stamp ETAK `korgus_m` building heights onto
// bake's OWN OSM footprints: the NETWORK/STREAM half of the Estonian national height stamp.
//
// ⭐ §EE-NATIONAL (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — THE WORKING SET IS NOW THE WHOLE COUNTRY.
// This join used to sweep `[...buckets.keys()].sort()` — LEXICOGRAPHIC order ("10,3" before "2,3") with
// no cursor and no heap bound, which is correct for four city bboxes and unusable for a country. It now
// runs on the shared driver in heights/nationalSweepStamp.mjs, which gives it the four properties a
// national sweep needs and this file therefore does not re-implement: an ORDERED numeric sweep, a
// RESUME CURSOR (`EE_SWEEP_CURSOR`), BOUNDED-HEAP swathe bands (`EE_SWATHE_ROWS`), and a LOUD truncation
// sentence naming the km² skipped. The per-cell fetch/split/match logic below is UNCHANGED — the same
// bytes reach the same matcher; only which cells are visited, and in what order, changed.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: heightSources.mjs is edited by
// several lanes at once and a whole-function insertion there collides; this file imports the shared join
// helpers from it (the ONE coupling is that `export { … }` line) and bake.mjs imports the stamp from here
// directly — the heights/nl3dbagStamp.mjs precedent. The DECISIONS — URL + axis order, attribute→height
// rule, truncation rule, part builder, match rule, national working set, tile size, swathe rows — are in
// heights/eeHeights.mjs, pure and vitest-pinned (eeHeights.spec.ts); this file only moves bytes.
//
// WHY A STAMP AND NOT A FOOTPRINT REPLACE — the same reason as every join here (§MDS-OSM-JOIN): one
// footprint set, coherent with the roads/water/landuse baked from the same OSM clip, plus the one thing
// ETAK has that OSM lacks (a surveyed metre height per building, EHR-linked). Vectors, not a raster: like
// NRW / NL the height is TRANSCRIBED from an attribute, and a footprint that owns several ETAK buildings
// takes their AREA-WEIGHTED P90 (the statistic the raster joins take over pixels).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetFeature refused / timed out / undecodable → `tileErrors++`  — a FAILURE (the server, or us).
//   • GetFeature answered ≥ 5,000 rows (the server cap) → the cell is SPLIT in four and re-read (depth ≤ 2);
//     still capped after that → `tileErrors++` by name ("truncated"). Never stamped from a cut answer.
//   • GetFeature decodes to ZERO buildings           → `voidTiles++`   — an honest EMPTY (sea, forest).
//   • footprint owns no ETAK building (either way)   → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • building with no honest height / a ruin        → skipped by name, counted.
//   • cell never opened (cap / budget / band)        → counted in km² and NAMED with a resume cursor.
// KEYLESS (Fees "puudub"; Maa-amet open-data licence, attribution "Maa- ja Ruumiamet"). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from 'node:fs';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, stampAreasFor, httpGetSafe, statsOf, clampHeight,
} from '../heightSources.mjs';
import {
  EE_ETAK, EE_CITY_BBOXES, EE_NATIONAL_BBOX, EE_NATIONAL_BBOXES, EE_SWATHE_ROWS, EE_SWEEP_CONCURRENCY,
  EE_TILE_DEG, etakGetFeatureUrl, parseEtakCollection, etakIsTruncated, etakPartsFromCollection,
  matchPartsToFootprint, partGrid, areaWeightedP90,
} from './eeHeights.mjs';
import {
  formatNationalSweepSummary, nationalTileGrid, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { resolveSweepBudgetMs, runNationalSweep } from './nationalSweepStamp.mjs';

export { EE_ETAK, EE_CITY_BBOXES, EE_NATIONAL_BBOX, EE_NATIONAL_BBOXES };

/**
 * Stamp REAL ETAK heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads `inPath`,
 * holds only the footprints inside `retainBboxes` (the rest stream through to `outPath` untouched),
 * tiles the region bbox at `tileSpanDeg`, sweeps the POPULATED cells in deterministic south→north order
 * from the resume cursor one BOUNDED-HEAP BAND at a time, fetches the ETAK buildings per cell, and for
 * each footprint that owns ≥1 building sets `height` = area-weighted P90 of their `korgus_m` (+
 * `heightSource`, + `pryzm:height_src=measured-lidar`). Writes every footprint — stamped or original —
 * to `outPath`: a REPLACE input, no double-draw. Never throws.
 *
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Estonia); the working set is `retainBboxes`,
 *             which is EE_NATIONAL_BBOXES for the `estonia` row since §EE-NATIONAL.
 */
export async function stampEeEtakHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = EE_TILE_DEG, padDeg = 0.0005, maxTiles = 40_000, maxSplitDepth = 2,
  retainBboxes = null, concurrency = EE_SWEEP_CONCURRENCY, sweepCursor = null, sweepBudgetMs = null,
  swatheRows = null, env = process.env, log = console.log,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `EE ETAK join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'EE ETAK join: no bbox supplied' };
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  const grid = nationalTileGrid(bbox, { lonDeg: tileSpanDeg });
  const cursor = resolveSweepCursor(sweepCursor, env.EE_SWEEP_CURSOR);
  const budgetMs = resolveSweepBudgetMs(sweepBudgetMs, env.EE_SWEEP_BUDGET_MS);
  const rows = resolveSwatheRows(swatheRows, env.EE_SWATHE_ROWS, EE_SWATHE_ROWS);

  let requests = 0, splits = 0, buildingsFetched = 0, bytesFetched = 0;
  let skippedNoHeight = 0, skippedRuin = 0, skippedNoGeometry = 0;
  let matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0;
  const sourceIds = {};
  const heights = [];

  /**
   * Fetch every ETAK building in `box`, splitting in four while the server's 5,000 cap truncates the
   * answer (depth-limited). Returns { ok:true, features } or { ok:false, reason } — a VALUE either way.
   */
  const fetchBox = async (box, depth) => {
    requests++;
    const rr = await httpGetSafe(etakGetFeatureUrl(box), { timeoutMs, headers: { Accept: 'application/json' } });
    if (!rr.ok) return { ok: false, reason: `HTTP ${rr.status} ${rr.reason ?? ''}`.trim() };
    const fc = parseEtakCollection(rr.body);
    if (!fc) return { ok: false, reason: `undecodable body (${rr.contentType || 'no content-type'}, ${rr.body?.length ?? 0} B)` };
    bytesFetched += rr.body.length;
    if (!etakIsTruncated(fc)) return { ok: true, features: fc.features };
    if (depth >= maxSplitDepth) return { ok: false, reason: `truncated at the server's ${EE_ETAK.serverCap}-object cap after ${depth} split(s)` };
    splits++;
    const [bw, bs, be, bn] = box, mx = (bw + be) / 2, my = (bs + bn) / 2;
    const out = [];
    for (const q of [[bw, bs, mx, my], [mx, bs, be, my], [bw, my, mx, bn], [mx, my, be, bn]]) {
      const sub = await fetchBox(q, depth + 1);
      if (!sub.ok) return sub;
      out.push(...sub.features);
    }
    return { ok: true, features: out };
  };

  /** ONE cell: fetch (splitting on the cap), then stamp the footprints this cell holds. The driver
   *  counts what comes back; it never invents a height and never sees one. */
  const stampCell = async ({ cellBbox, records }) => {
    const r0 = requests, b0 = bytesFetched;
    const [tw, ts, te, tn] = cellBbox;
    // `padDeg`: a building whose interior point sits just across the cell edge is still offered to this
    // cell's footprints (a footprint is bucketed by ITS centroid; its owned buildings may straddle the seam).
    const got = await fetchBox([tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg], 0);
    const spent = { requests: requests - r0, bytes: bytesFetched - b0 };
    if (!got.ok) return { ok: false, error: got.reason, ...spent };   // a FAILURE, never "nothing here"
    const { parts, skipped, sourceIds: sids } = etakPartsFromCollection({ features: got.features });
    buildingsFetched += got.features.length;
    skippedNoHeight += skipped.noHeight; skippedRuin += skipped.ruin; skippedNoGeometry += skipped.noGeometry;
    for (const [k, v] of Object.entries(sids)) sourceIds[k] = (sourceIds[k] ?? 0) + v;
    if (parts.length === 0) return { ok: true, empty: true, ...spent }; // an honest EMPTY: the server answered
    const pgrid = partGrid(parts);
    for (const r of records) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const { owned, via } = matchPartsToFootprint(r, pgrid.get([x0, y0, x1, y1]));
      if (!via) continue;                           // NEITHER direction — the footprint keeps its OSM tags
      if (via === 'forward') { matchedForward++; if (owned.length > 1) multiPartFootprints++; } else matchedReverse++;
      const h90 = areaWeightedP90(owned);
      if (h90 === null) continue;
      const h = clampHeight(h90);
      r.feat.properties = {
        ...(r.feat.properties ?? {}),
        building: r.feat.properties?.building ?? 'yes',
        height: Number(h.toFixed(1)),
        heightSource: EE_ETAK.heightSourceTag,
        // §CTX-HEIGHT-MEASURED-MARKER — the client ranks this above an OSM-surveyed `tagged` height.
        [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
      };
      heights.push(h);
    }
    return { ok: true, empty: false, ...spent };
  };

  const run = await runNationalSweep({
    inPath, outPath, grid, stampAreas,
    recordOf: (feat, fp) => ({ feat, ...fp }),
    stampCell,
    // §PRIORITY-OR-THE-CITIES-REGRESS — the four cities that are measured on the live map today are
    // stamped FIRST and UNCAPPED on every run, so widening the retain set to the nation can never cost
    // Tallinn / Tartu / Pärnu / Narva the heights they already have.
    priorityAreas: EE_CITY_BBOXES.map((c) => c.bbox),
    label: 'EE ETAK national sweep', cursorEnvLabel: 'EE_SWEEP_CURSOR',
    cursor, budgetMs, maxTiles, swatheRows: rows, concurrency, log,
  });
  if (run.status !== 'ok') return { status: run.status, reason: run.reason, read: run.read };

  const { agg, sweep } = run;
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, grid.nx * grid.ny - agg.populatedCells);
  return {
    status: 'ok', outPath, count: agg.parsed, footprintCount: agg.retained, measuredCount: measured,
    coverage: agg.retained ? Number((measured / agg.retained).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: agg.cellsStamped, tileErrors: agg.tileErrors, voidTiles: agg.voidTiles, emptyTiles,
    tileCapHit: String(sweep.stopReason).startsWith('maxTiles'),
    sweepAborted: agg.sweepAborted, sweepAbortReason: agg.sweepAbortReason,
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanDeg,
    sweep, sweepCursorFrom: cursor, swatheRows: rows, swathesTotal: run.swathesTotal, swathesScanned: run.swathesScanned,
    requests, splits, buildingsFetched, skippedNoHeight, skippedRuin, skippedNoGeometry,
    bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchedForward, matchedReverse, multiPartFootprints, sourceIds, errorSamples: agg.errorSamples,
    elapsedS: run.elapsedS,
    retainedFootprints: agg.retained, passedThroughFootprints: agg.passedThrough,
    stampAreas: stampAreas.length, populatedCells: agg.populatedCells,
    peakHeapUsedMB: agg.peakHeapUsedMB, heapLimitMB: agg.heapLimitMB,
    attribution: EE_ETAK.attribution,
    note: `ETAK e_401_hoone_ka korgus_m (area-weighted P90 over owned buildings) stamped onto OSM footprints → ${measured}/${agg.retained} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged; ${matchedForward} forward, ${matchedReverse} reverse, ${multiPartFootprints} multi-building); ` +
      `${agg.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${agg.cellsStamped} of ${agg.populatedCells} populated cell(s) read at ${tileSpanDeg}° across ${run.swathesScanned}/${run.swathesTotal} bounded-heap swathe(s) ` +
      `(${requests} GetFeature(s), ${splits} cap split(s), ${buildingsFetched} buildings, ${skippedNoHeight} without a height, ` +
      `${skippedRuin} ruin(s), ${(bytesFetched / 1e6).toFixed(0)} MB), ${agg.voidTiles} empty cell(s), ${agg.tileErrors} request error(s)` +
      `${cursor ? `; resumed at cursor ${cursor}` : ''}. ${formatNationalSweepSummary(sweep, { label: 'EE ETAK national sweep', cursorEnv: 'EE_SWEEP_CURSOR' })}` +
      `${agg.sweepAborted ? ` ⚠ SWEEP ABORTED after ${agg.cellsStamped} cell(s) — ${agg.sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      ` Peak heap ${agg.peakHeapUsedMB} MB of ${agg.heapLimitMB} MB.`,
  };
}
