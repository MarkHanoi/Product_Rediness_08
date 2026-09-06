// ─────────────────────────────────────────────────────────────────────────────
// §GURS-KN-OSM-JOIN (2026-09-05, lane HEIGHTS-AT-CZ-SI) — stamp GURS Kataster nepremičnin STAVBE register
// heights onto bake's OWN OSM footprints: the NETWORK/STREAM half of the Slovenian national height stamp.
//
// WHY THIS IS ITS OWN MODULE: heightSources.mjs is edited by several lanes at once (the nl3dbagStamp /
// noHeightsStamp precedent); this file imports the shared join helpers from it and bake.mjs imports the
// stamp from here directly, in the SAME commit that declares the `slovenia` row's heightJoin. The
// DECISIONS — host + URL + axis order, the H2−H3 rule, the point-in-footprint match, the working set —
// are in heights/siHeights.mjs, pure and vitest-pinned (siHeights.spec.ts); this file only moves bytes.
//
// SHAPE: the NL 3DBAG join (vectors, not a raster): per POPULATED 0.01° cell one keyless GetFeature
// (~5.6 KB per building; a dense Ljubljana cell ≈ 1 MB / 1.5 s), the height TRANSCRIBED from register
// attributes, a footprint that owns several STAVBE centroids taking their P90.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetFeature refused / timed out / undecodable → `tileErrors++`  — a FAILURE (the server, or us).
//   • GetFeature decodes to ZERO buildings         → `voidTiles++`   — an honest EMPTY (forest, river).
//   • footprint owns no STAVBE centroid             → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • building without an honest height (no H2, ≤ 0)→ skipped by name, counted.
//   • footprint outside SI_CITY_BBOXES              → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// PROVENANCE: `tagged`, NOT `measured-lidar` — the register's own accuracy code is "unknown method" for
// 96 % of buildings (heights/siHeights.mjs header), so NO `pryzm:height_src` marker is written; the
// client resolves the `height` tag as `tagged` (solid), and `gurs:visinska_natancnost` carries the code.
// KEYLESS, CC BY 4.0 ("GURS — Kataster nepremičnin"). No repo secret.
//
// ⭐ §SI-NATIONAL (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — THE WORKING SET IS NOW THE WHOLE COUNTRY.
// This join used to sweep `[...buckets.keys()].sort()` — LEXICOGRAPHIC order ("10,3" before "2,3"), no
// cursor, no heap bound and NO cap check, which is fine for five city bboxes and unusable for a country.
// It now runs on the shared driver in heights/nationalSweepStamp.mjs: an ORDERED numeric sweep, a RESUME
// CURSOR (`SI_SWEEP_CURSOR`), BOUNDED-HEAP swathe bands (`SI_SWATHE_ROWS`) and a LOUD truncation
// sentence — and the request is now propertyName-TRIMMED (§GURS-TRIM: 17.8× fewer bytes, measured) and
// CAP-CHECKED (`gursIsTruncated` → split; a cell that returns exactly `count` is CUT, not complete).
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from 'node:fs';
import {
  stampAreasFor, httpGetSafe, statsOf, clampHeight,
} from '../heightSources.mjs';
import {
  GURS_KN, SI_CITY_BBOXES, SI_NATIONAL_BBOX, SI_NATIONAL_BBOXES, SI_SWATHE_ROWS, SI_SWEEP_CONCURRENCY,
  SI_TILE_DEG, gursStavbeUrl, gursIsTruncated, parseGursCollection, gursStavbeFromCollection,
  matchStavbeToFootprint, pointGrid, ownedP90,
} from './siHeights.mjs';
import {
  formatNationalSweepSummary, nationalTileGrid, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { resolveSweepBudgetMs, runNationalSweep } from './nationalSweepStamp.mjs';

export { SI_CITY_BBOXES, SI_NATIONAL_BBOX, SI_NATIONAL_BBOXES };

/**
 * Stamp GURS STAVBE register heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads
 * `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath`
 * untouched), tiles the region bbox at `tileSpanDeg`, sweeps the POPULATED cells in deterministic
 * south→north order from the resume cursor one BOUNDED-HEAP BAND at a time, fetches the STAVBE centroids
 * per cell, and for each footprint that owns ≥ 1 centroid sets `height` = P90 of the owned heights (+
 * `heightSource`, + `building:levels` when OSM has none and the register has floors, + the register's
 * accuracy code). Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no
 * double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Slovenia); the working set is `retainBboxes`,
 *             which is SI_NATIONAL_BBOXES for the `slovenia` row since §SI-NATIONAL.
 */
export async function stampSiHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = SI_TILE_DEG, padDeg = 0.0005, maxTiles = 20_000, maxSplitDepth = 2,
  retainBboxes = null, concurrency = SI_SWEEP_CONCURRENCY, sweepCursor = null, sweepBudgetMs = null,
  swatheRows = null, env = process.env, log = console.log,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `SI GURS join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'SI GURS join: no bbox supplied' };
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  const grid = nationalTileGrid(bbox, { lonDeg: tileSpanDeg });
  const cursor = resolveSweepCursor(sweepCursor, env.SI_SWEEP_CURSOR);
  const budgetMs = resolveSweepBudgetMs(sweepBudgetMs, env.SI_SWEEP_BUDGET_MS);
  const rows = resolveSwatheRows(swatheRows, env.SI_SWATHE_ROWS, SI_SWATHE_ROWS);

  let requests = 0, splits = 0, buildingsFetched = 0, bytesFetched = 0, multiOwned = 0;
  let buildingsSkippedNoHeight = 0, buildingsSkippedNoGeometry = 0;
  const rules = { 'h2-h3': 0, 'h2-h1': 0 };
  const accuracyCodes = {};
  const heights = [];

  /**
   * Fetch every STAVBE centroid in `box`, splitting in four while the `count` cap truncates the answer
   * (depth-limited). Returns { ok:true, features } or { ok:false, reason } — a VALUE either way.
   */
  const fetchBox = async (box, depth) => {
    requests++;
    const rr = await httpGetSafe(gursStavbeUrl(box), { timeoutMs, headers: { Accept: 'application/json' } });
    if (!rr.ok) return { ok: false, reason: `HTTP ${rr.status} ${rr.reason ?? ''}`.trim() };
    const fc = parseGursCollection(rr.body);
    if (!fc) return { ok: false, reason: `undecodable body (${rr.contentType || 'no content-type'}, ${rr.body?.length ?? 0} B)` };
    bytesFetched += rr.body.length;
    if (!gursIsTruncated(fc)) return { ok: true, features: fc.features };
    if (depth >= maxSplitDepth) return { ok: false, reason: `truncated at the server's ${GURS_KN.countDefault}-object cap after ${depth} split(s)` };
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
    // `padDeg`: a centroid just across the cell edge is still offered to this cell's footprints.
    const got = await fetchBox([tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg], 0);
    const spent = { requests: requests - r0, bytes: bytesFetched - b0 };
    if (!got.ok) return { ok: false, error: got.reason, ...spent };   // a FAILURE, never "nothing here"
    const { points, skipped } = gursStavbeFromCollection({ features: got.features });
    buildingsFetched += got.features.length;
    buildingsSkippedNoHeight += skipped.noHeight; buildingsSkippedNoGeometry += skipped.noGeometry;
    if (points.length === 0) return { ok: true, empty: true, ...spent }; // an honest EMPTY
    const pgrid = pointGrid(points);
    for (const r of records) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const { owned, via } = matchStavbeToFootprint(r, pgrid.get([x0, y0, x1, y1]));
      if (!via) continue;                           // the footprint keeps its OSM tags
      if (owned.length > 1) multiOwned++;
      const raw = ownedP90(owned);
      if (raw === null) continue;
      const h = clampHeight(raw);
      for (const p of owned) { rules[p.rule] = (rules[p.rule] ?? 0) + 1; const a = p.accuracy ?? 'null'; accuracyCodes[a] = (accuracyCodes[a] ?? 0) + 1; }
      const tallest = owned.reduce((best, p) => (best === null || p.height > best.height ? p : best), null);
      const props = r.feat.properties ?? {};
      r.feat.properties = {
        ...props,
        building: props.building ?? 'yes',
        height: Number(h.toFixed(1)),
        ...(props['building:levels'] === undefined && tallest?.floors ? { 'building:levels': tallest.floors } : {}),
        heightSource: GURS_KN.heightSourceTag,
        // The register's own accuracy code (0 unknown method · 1 measured ±0.25 m · 2 geoid transform ±0.35 m).
        ...(tallest?.accuracy !== null && tallest?.accuracy !== undefined ? { 'gurs:visinska_natancnost': tallest.accuracy } : {}),
        // NO `pryzm:height_src` marker on purpose — see the module header (a register metre is `tagged`, not measured-lidar).
      };
      heights.push(h);
    }
    return { ok: true, empty: false, ...spent };
  };

  const run = await runNationalSweep({
    inPath, outPath, grid, stampAreas,
    recordOf: (feat, fp) => ({ feat, ...fp }),
    stampCell,
    // §PRIORITY-OR-THE-CITIES-REGRESS — Ljubljana / Maribor / Celje / Kranj / Koper are stamped FIRST
    // and UNCAPPED on every run, so the national retain set can never cost them what they have today.
    priorityAreas: SI_CITY_BBOXES.map((c) => c.bbox),
    label: 'SI GURS national sweep', cursorEnvLabel: 'SI_SWEEP_CURSOR',
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
    requests, splits, buildingsFetched, buildingsSkippedNoHeight, buildingsSkippedNoGeometry, multiOwned, rules, accuracyCodes,
    bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)), errorSamples: agg.errorSamples,
    elapsedS: run.elapsedS,
    retainedFootprints: agg.retained, passedThroughFootprints: agg.passedThrough,
    stampAreas: stampAreas.length, populatedCells: agg.populatedCells,
    peakHeapUsedMB: agg.peakHeapUsedMB, heapLimitMB: agg.heapLimitMB,
    attribution: GURS_KN.attribution,
    note: `GURS KN STAVBE (H2 − H3 register height, P90 over owned centroids) stamped onto OSM footprints → ${measured}/${agg.retained} ` +
      `RETAINED footprint(s) got a REGISTER height (tagged — NOT measured-lidar; accuracy codes ${JSON.stringify(accuracyCodes)}); ` +
      `${agg.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${agg.cellsStamped} of ${agg.populatedCells} populated cell(s) read at ${tileSpanDeg}° across ${run.swathesScanned}/${run.swathesTotal} bounded-heap swathe(s) ` +
      `(${requests} GetFeature(s), ${splits} cap split(s), ${buildingsFetched} buildings, ${buildingsSkippedNoHeight} without an honest height, ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${agg.voidTiles} empty cell(s), ${agg.tileErrors} request error(s)` +
      `${cursor ? `; resumed at cursor ${cursor}` : ''}. ${formatNationalSweepSummary(sweep, { label: 'SI GURS national sweep', cursorEnv: 'SI_SWEEP_CURSOR' })}` +
      `${agg.sweepAborted ? ` ⚠ SWEEP ABORTED after ${agg.cellsStamped} cell(s) — ${agg.sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      ` Peak heap ${agg.peakHeapUsedMB} MB of ${agg.heapLimitMB} MB.`,
  };
}
