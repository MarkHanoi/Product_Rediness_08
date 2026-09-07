// ─────────────────────────────────────────────────────────────────────────────
// §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL) — stamp FEMA/ORNL "USA Structures"
// per-building heights onto bake's OWN OSM footprints, for the WHOLE UNITED STATES: the NETWORK +
// STREAM half. Every decision (the adapter, the page URL and its axis order, the unit rule, the
// part→height rule, the national working set, the tile grid, the swathe plan, the sweep order, the
// resume cursor and the km² accounting) lives in heights/usOpenHeights.mjs as a total function of its
// arguments and is unit-tested there against verbatim live answers. This file only sweeps cells,
// fetches pages, stamps and reports.
//
// WHY A SECOND STAMP MODULE AND NOT A HUNK IN usOpenHeightsStamp.mjs — the per-city stamp visits every
// populated cell of a METRO clip in `[...buckets.keys()].sort()` order, which is LEXICOGRAPHIC ("10,3"
// before "2,3") and has no cursor, because a metro's cells always fit inside one run. A country's do
// not. This module therefore differs in exactly four ways, and all four are the brief's ask:
//   1. ORDERED — cells are visited on the NUMERIC row-major `ord` (south→north, west→east), so a run
//      that stops halfway stopped at a LINE across the country, not at a scatter of cells.
//   2. RESUMABLE — `USAS_SWEEP_CURSOR=<ord>` (env, or the `sweepCursor` option) starts the sweep at a
//      cell instead of at the beginning. The cursor printed by a truncated run is the ord of the FIRST
//      CELL OF THE FIRST INCOMPLETE BATCH, so resuming re-reads at most (concurrency − 1) cells and
//      can never skip one.
//   3. BOUNDED HEAP — §USAS-SWATHE. The retained working set is the whole COUNTRY, so a whole-STATE
//      bake row would otherwise hold every footprint in the state in the V8 heap. The region is
//      streamed one BAND of whole tile rows at a time (usasNationalSwathes), each pass reading the
//      previous pass's strictly smaller pass-through file. Peak heap tracks ONE band, never a state.
//   4. LOUD — a truncated run prints `formatUsasSweepSummary`: why it stopped, the km² actually
//      stamped, the km² of POPULATED ground it skipped, the bands it never opened, and the cursor.
//      §ABORT-IS-NOT-A-CAP: a sweep that stopped early and said nothing is a LIE about coverage, and
//      `assumed` 9 m is the same value the client shows when a source genuinely has no data
//      (L-422 / L-457 / L-467 / L-469).
// The per-city stamp is NOT modified — the three city ADAPTERS it declares are reused here verbatim.
//
// ⭐ CHANNEL PRIORITY IS PER FOOTPRINT, NOT PER CELL. `usOpenChannelForPoint(clon, clat)` gives NYC /
// SF / Boston their OWN authority survey inside their own bboxes and USA Structures everywhere else.
// Resolving per footprint centroid (not per cell centre) means a cell straddling the edge of the NYC
// working set serves each footprint from the right channel instead of picking one for the whole cell.
// The order is a MEASUREMENT: in the same Midtown cell NYC's height_roof reaches 270.6 m and USA
// Structures reaches 170.5 m, so national-first would replace a better number with a worse one.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • page refused / timed out / undecodable → `tileErrors++`, a FAILURE. The cell's footprints keep
//                                              their OSM tags. Never "nothing here".
//   • page decodes to ZERO components        → `voidTiles++`, an honest EMPTY. Outside the cities most
//                                              of the country is ORNL-sourced with NO height (kansas:
//                                              1,424,058 of 1,742,826 rows), and that is a real empty.
//                                              LIVE-PROBED 2026-09-06: the Pflugerville TX cell
//                                              -97.6305,30.4395,-97.6195,30.4505 → HTTP 200, 98 B,
//                                              0.82 s, body VERBATIM
//                                              {"type":"FeatureCollection","crs":{…},"features":[]}.
//   • footprint matches no component         → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • cell never opened (cap / budget)       → counted in `cellsSkipped` + `km2Skipped` and named in
//                                              the note with a resume cursor. Never silently dropped.
//   • band never opened (cap / budget)       → counted in `swathesTotal − swathesScanned` and named in
//                                              the same sentence, because a skipped BAND is a much
//                                              bigger hole than a skipped cell and must not hide
//                                              inside a cell count it was never added to.
// ⛔ NOT WRITTEN HERE, ON PURPOSE: Overture's and Microsoft's US heights are MODELLED (both saturate at
//    ~34.7 m over 79k urban Wichita buildings, where the city's tallest is 98 m). An estimate may not
//    be written under the measured marker, and this stamp has no branch that could. See
//    US_NATIONAL_ASSESSED in usOpenHeights.mjs for the exact HTTP answers.
// ⚠ THE MARKER. Stamped footprints carry `pryzm:height_src=measured-lidar`, the ONE value the client
// (contextBuildings.ts) and the CI probe (context-height-probe) recognise as a REAL measured height.
// USA Structures' own FGDC metadata says HEIGHT is "determined from LiDAR **or other source data**",
// "LiDAR-derived footprints where available provided by NGA" — so it is AUTHORITY-MEASURED, LiDAR
// where available, exactly like NYC's height_roof and Boston's BLDG_HGT_2010 already under this
// marker. The marker's NAME is a repo-wide misnomer this stamp does not widen; the method is recorded
// per footprint in `heightSource` and per channel in `measurement`.
// KEYLESS: an anonymous ArcGIS FeatureServer — no key, no app token, no repo secret. CC BY 4.0.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf, appendFileInto,
} from '../heightSources.mjs';
import {
  USAS_SWATHE_ROWS, USAS_SWEEP_CONCURRENCY, USAS_TILE_DEG, formatUsasSweepSummary, parseUsOpenPage,
  usasCellBbox, usasCellKm2, usasNationalSwathes, usasSweepBatches, usasSweepOrder, usasTileGrid,
  usOpenChannelForPoint, usOpenComponents, usOpenHeightForFootprint, usOpenPageUrl,
} from './usOpenHeights.mjs';

/** The resume cursor, from the option or the environment. Anything not a finite ord ⇒ start at 0. */
function resolveCursor(opt) {
  const raw = opt ?? process.env.USAS_SWEEP_CURSOR ?? null;
  const n = raw === null || raw === '' ? 0 : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** §USAS-SWATHE — tile rows per bounded-heap pass, from the option or `USAS_SWATHE_ROWS` in the
 *  environment. The env knob exists so a band that trips the HEAP WATCHDOG can be halved on the next
 *  dispatch WITHOUT a code change (and never by raising the heap — see usOpenHeights.mjs §USAS-SWATHE).
 *  0 or negative ⇒ SINGLE PASS, which is correct for a city-sized caller and is what the unit tests
 *  and any future metro-scale row use. */
function resolveSwatheRows(opt) {
  const raw = opt ?? process.env.USAS_SWATHE_ROWS ?? null;
  const n = raw === null || raw === '' ? USAS_SWATHE_ROWS : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Fetch every page of ONE channel for ONE cell. Returns `{ components, failed, bytes, requests,
 * pages, skipped, pageCapHit }`. A FAILED page fails the whole cell for that channel — a partial page
 * would stamp the first N buildings of the cell and silently skip the rest, which is a TRUNCATION
 * wearing a success (§BDTOPO-CAP-TRUNCATE).
 */
async function fetchCellComponents(channel, cell, { timeoutMs, padDeg, maxPagesPerCell }) {
  const comps = [];
  const skipped = { notBuilding: 0, noHeight: 0, noGeometry: 0 };
  let offset = 0, pages = 0, bytes = 0, requests = 0, failed = false, pageCapHit = false;
  for (;;) {
    if (pages >= maxPagesPerCell) { pageCapHit = true; break; }
    requests++; pages++;
    const rr = await httpGetSafe(usOpenPageUrl(channel, cell, { offset, padDeg }), {
      timeoutMs, headers: { Accept: 'application/json' },
    });
    if (!rr.ok) { failed = true; break; }                 // refused / timed out — a FAILURE
    const page = parseUsOpenPage(rr.body, channel);
    if (!page) { failed = true; break; }                  // undecodable / an error document — a FAILURE
    bytes += rr.body.length;
    const built = usOpenComponents(page, channel);
    for (const k of Object.keys(skipped)) skipped[k] += built.skipped[k];
    comps.push(...built.components);
    if (!page.more || page.features.length === 0) break;
    offset += page.features.length;
  }
  return { components: comps, failed, bytes, requests, pages, skipped, pageCapHit };
}

/**
 * ONE bounded-heap pass over ONE set of retain areas (a swathe band, or the whole working set in
 * single-pass mode).
 *
 * Retains only footprints inside `areas` AND resolvable to a channel; every other record is streamed
 * to `passThroughPath` as raw bytes (never through the heap). The retained records — stamped or not —
 * are appended to `retainedOutPath` at the end of the pass, so the output file always holds EVERY
 * footprint exactly once and a footprint the source could not serve keeps its ORIGINAL OSM tags.
 *
 * Mutates the shared `budget` (cell cap, wall clock, cursor) and the shared `agg`/`heights`
 * accumulators, so caps and the resume cursor are GLOBAL across bands rather than per band.
 */
async function usasStampPass({
  inPath, passThroughPath, retainedOutPath, areas, grid, budget, agg, heights,
  timeoutMs, padDeg, maxPagesPerCell, concurrency, label,
}) {
  const load = loadJoinFootprintsBounded(inPath, passThroughPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, areas)) return null;
    const ch = usOpenChannelForPoint(fp.clon, fp.clat);
    if (!ch) return null;
    return { feat, ...fp, channel: ch.metro };
  }, label);
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };

  const records = load.retained;
  const read = load.read;
  agg.peakHeapUsedMB = Math.max(agg.peakHeapUsedMB, read.peakHeapUsedMB ?? 0);
  agg.heapLimitMB = read.heapLimitMB ?? agg.heapLimitMB;
  // The FIRST pass parses every record in the clip; later passes re-parse only what is left, so
  // SUMMING would over-report the input several-fold. Take the first pass's number (mdsNational's scar).
  if (agg.parsed === 0) agg.parsed = read.parsed ?? 0;
  agg.passedThrough = read.passedThrough ?? 0;   // what is LEFT after this pass, not a running total
  agg.retained += records.length;

  const buckets = bucketRecords(records, (r) => [grid.cellIx(r.clon), grid.cellIy(r.clat)]);
  agg.populatedCells += buckets.size;
  const ordered = usasSweepOrder(buckets.keys(), grid, budget.cursor);
  const batches = usasSweepBatches(ordered, concurrency);

  // Channel lookup by the adapter key each retained record already resolved to (never re-resolved per
  // cell — the footprint's own centroid decided it, and that decision must not drift).
  const channelOf = new Map();
  for (const r of records) if (!channelOf.has(r.channel)) channelOf.set(r.channel, usOpenChannelForPoint(r.clon, r.clat));

  let batchIndex = 0;
  try {
    for (; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      // ⭐ THE CAPS ARE CHECKED AT A BATCH BOUNDARY, so `nextCursor` is the ord of the first cell of the
      // first batch that did NOT run — an EXACT resume point, not an approximation.
      if (budget.stopReason) break;
      if (agg.cellsStamped >= budget.maxTiles) { budget.stopReason = `maxTiles ${budget.maxTiles}`; break; }
      if (budget.deadlineAt < Infinity && Date.now() >= budget.deadlineAt) {
        budget.stopReason = `time budget ${Math.round(budget.budgetMs / 1000)} s`; break;
      }

      // Fetch the batch's cells concurrently; STAMP them afterwards in cell order, so the output is
      // deterministic regardless of which request answered first.
      const fetched = await Promise.all(batch.map(async (c) => {
        const cell = usasCellBbox(grid, c.ix, c.iy);
        const recs = buckets.get(c.key) ?? [];
        const byChannel = new Map();
        for (const r of recs) { const b = byChannel.get(r.channel); if (b) b.push(r); else byChannel.set(r.channel, [r]); }
        const perChannel = [];
        for (const [key, rs] of byChannel) {
          const ch = channelOf.get(key);
          if (!ch) continue;
          perChannel.push({ key, ch, rs, res: await fetchCellComponents(ch, cell, { timeoutMs, padDeg, maxPagesPerCell }) });
        }
        return { c, perChannel };
      }));

      for (const { c, perChannel } of fetched) {
        let cellOk = false;
        for (const { ch, rs, res } of perChannel) {
          agg.requests += res.requests; agg.bytesFetched += res.bytes;
          if (res.pageCapHit) agg.pageCapHits++;
          for (const k of Object.keys(agg.componentsSkipped)) agg.componentsSkipped[k] += res.skipped[k];
          if (res.failed) { agg.tileErrors++; continue; }
          cellOk = true;
          agg.componentsFetched += res.components.length;
          if (res.components.length === 0) { agg.voidTiles++; continue; }   // an honest EMPTY
          for (const r of rs) {
            const h = usOpenHeightForFootprint(r.ext, r.interiors, r.clon, r.clat, res.components);
            if (!h) continue;
            r.feat.properties = {
              ...(r.feat.properties ?? {}),
              building: r.feat.properties?.building ?? 'yes',
              height: h.height,
              heightSource: ch.heightSourceTag,
              [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
            };
            heights.push(h.height);
            agg.rules.set(h.rule, (agg.rules.get(h.rule) ?? 0) + 1);
            agg.channelsUsed.set(ch.metro, (agg.channelsUsed.get(ch.metro) ?? 0) + 1);
          }
        }
        if (cellOk) { agg.cellsStamped++; agg.km2Stamped += usasCellKm2(grid, c.ix, c.iy); }
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
    for (const c of remaining) agg.km2Skipped += usasCellKm2(grid, c.ix, c.iy);
    if (budget.nextCursor === null && remaining.length) budget.nextCursor = remaining[0].ord;
  }

  // The retained footprints — stamped or not — go to the output. Written AFTER the sweep so a band's
  // heap is released before the next band's partition begins.
  if (records.length) appendFileSync(retainedOutPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  return { status: 'ok', retained: records.length, read };
}

/**
 * Stamp USA Structures national heights (with the three city channels taking priority inside their own
 * working sets) onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip).
 *
 * Reads `inPath`, tiles the region at 0.02°, and sweeps the POPULATED cells in deterministic
 * south→north order from the resume cursor, one BOUNDED-HEAP BAND at a time (§USAS-SWATHE), setting
 * `height` (metres) + the measured marker on every footprint a component matches. Writes to `outPath`
 * (same footprints, heights added — a REPLACE input, no double-draw). Never throws; a source failure
 * leaves footprints at their honest OSM default.
 *
 * @param bbox [w,s,e,n] WGS84 — the bake region row's bbox.
 */
export async function stampUsasNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, padDeg = 0.0005, maxTiles = 20_000, maxPagesPerCell = 25, retainBboxes = null,
  concurrency = USAS_SWEEP_CONCURRENCY, sweepCursor = null, sweepBudgetMs = null, swatheRows = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `USA Structures national join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'USA Structures national join: no bbox supplied' };
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });

  const grid = usasTileGrid(bbox, { deg: USAS_TILE_DEG });
  const cursor = resolveCursor(sweepCursor);
  const budgetMs = Number(sweepBudgetMs ?? process.env.USAS_SWEEP_BUDGET_MS ?? 0) || 0;
  const budget = {
    maxTiles, budgetMs, cursor,
    deadlineAt: budgetMs > 0 ? Date.now() + budgetMs : Infinity,
    stopReason: null, nextCursor: null,
  };
  const agg = {
    parsed: 0, retained: 0, passedThrough: 0, populatedCells: 0, cellsStamped: 0, cellsSkipped: 0,
    km2Stamped: 0, km2Skipped: 0, tileErrors: 0, voidTiles: 0, requests: 0, pageCapHits: 0,
    componentsFetched: 0, bytesFetched: 0, componentsSkipped: { notBuilding: 0, noHeight: 0, noGeometry: 0 },
    rules: new Map(), channelsUsed: new Map(), sweepAborted: false, sweepAbortReason: null,
    peakHeapUsedMB: 0, heapLimitMB: 0,
  };
  const heights = [];
  const t0 = Date.now();
  const rows = resolveSwatheRows(swatheRows);
  const passArgs = { grid, budget, agg, heights, timeoutMs, padDeg, maxPagesPerCell, concurrency: Math.max(1, concurrency) };

  let swathesTotal = 1, swathesScanned = 0;
  if (!rows) {
    // ── SINGLE PASS — a city-sized caller, or a test. Pass-through and retained share `outPath`,
    //    byte-identical in effect to the pre-swathe join.
    const p = await usasStampPass({ ...passArgs, inPath, passThroughPath: outPath, retainedOutPath: outPath, areas: stampAreas, label: 'USA Structures national join' });
    if (p.status !== 'ok') return { status: p.status, reason: p.reason, read: p.read };
    swathesScanned = 1;
  } else {
    // ── BOUNDED-HEAP MULTI-PASS (§USAS-SWATHE) — one band of whole tile rows at a time, each pass
    //    reading the previous pass's strictly smaller pass-through file.
    writeFileSync(outPath, '');
    const swathes = usasNationalSwathes(grid, { swatheRows: rows });
    swathesTotal = swathes.length;
    const tmp = [`${outPath}.usas-swathe-a`, `${outPath}.usas-swathe-b`];
    let cur = inPath, alt = 0, firstStatus = null;
    console.log(`\n  USA Structures national sweep · grid ${grid.nx}×${grid.ny} cells of ${USAS_TILE_DEG}° · ` +
      `${swathes.length} bounded-heap swathe(s) of ${rows} row(s) (${(rows * USAS_TILE_DEG).toFixed(2)}° of latitude each) · ` +
      `budget ${budgetMs > 0 ? `${Math.round(budgetMs / 60000)} min` : 'none'} / ${maxTiles} cells · cursor ${cursor}`);
    for (const sw of swathes) {
      if (budget.stopReason) break;
      if (sw.ordTo <= cursor) continue;   // resumed run — this band is entirely behind the cursor
      // Intersect the band with the declared working set: a band is a HEAP bound, never a widening of
      // where we are allowed to measure (§JOIN-BOUNDED-WORKING-SET).
      const areas = intersectAreas(stampAreas, sw.bbox);
      if (!areas.length) continue;
      const pt = tmp[alt++ % 2];
      const p = await usasStampPass({ ...passArgs, inPath: cur, passThroughPath: pt, retainedOutPath: outPath, areas, label: `USA Structures swathe ${sw.index + 1}/${swathes.length}` });
      // §EMPTY-IS-NOT-A-FAILURE (mdsNational's scar, kept): a pass returns `documented` when its INPUT
      // holds no records, which is the NORMAL end state — each pass hands the next only what it did
      // not retain. Only `error` is a failure. But an error on the FIRST pass is the whole join's
      // error (a partition that cannot read bake's own file), so it is returned, not swallowed.
      if (p.status === 'error') { if (existsSync(pt)) { try { unlinkSync(pt); } catch { /* best effort */ } } return { status: 'error', reason: p.reason, read: p.read }; }
      if (firstStatus === null) firstStatus = p.status;
      if (p.status !== 'ok') break;       // nothing left in the stream — every record is already written out
      swathesScanned++;
      cur = pt;
      console.log(`    · USA Structures swathe ${sw.index + 1}/${swathes.length} (lat ${sw.bbox[1].toFixed(2)}–${sw.bbox[3].toFixed(2)}): ` +
        `${heights.length} measured so far over ${agg.cellsStamped} cell(s), ${Math.round(agg.km2Stamped)} km², peak heap ${agg.peakHeapUsedMB} MB.`);
    }
    // Everything still unretained — bands never opened, cells behind a cap, and anything outside the
    // working set — is written through UNCHANGED. Original OSM tags, honest `assumed`; never
    // fabricated, never dropped. Raw bytes, never through the heap.
    appendFileInto(cur === inPath ? inPath : cur, outPath);
    for (const t of tmp) { try { if (existsSync(t)) unlinkSync(t); } catch { /* best effort */ } }
  }

  if (!budget.stopReason) budget.stopReason = 'complete';
  const nextCell = budget.nextCursor === null ? null : usasCellBbox(grid, grid.ixOf(budget.nextCursor), grid.iyOf(budget.nextCursor));
  const sweep = {
    stopReason: budget.stopReason, cellsStamped: agg.cellsStamped, km2Stamped: agg.km2Stamped,
    cellsSkipped: agg.cellsSkipped, km2Skipped: agg.km2Skipped,
    swathesTotal, swathesScanned,
    nextCursor: budget.nextCursor,
    nextCursorLon: nextCell ? nextCell[0] : null, nextCursorLat: nextCell ? nextCell[1] : null,
  };

  const measured = heights.length;
  const footprintCount = agg.retained;
  heights.sort((a, b) => a - b);
  return {
    status: 'ok', outPath, count: agg.parsed, footprintCount, measuredCount: measured,
    // ⛔ There is deliberately NO `estimatedCount` sibling with a value: this stamp writes measurements
    // only. If an Overture/Microsoft modelled height is ever wired it must arrive with its own tag and
    // its own counter, never folded into `measuredCount` (brief item 3, §CONTEXT-DATA-HONESTY).
    estimatedCount: 0,
    coverage: footprintCount ? Number((measured / footprintCount).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: agg.cellsStamped, tileErrors: agg.tileErrors, voidTiles: agg.voidTiles,
    tileCapHit: String(budget.stopReason).startsWith('maxTiles'),
    sweepAborted: agg.sweepAborted, sweepAbortReason: agg.sweepAbortReason,
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanDeg: USAS_TILE_DEG,
    sweep, sweepCursorFrom: cursor, swatheRows: rows, swathesTotal, swathesScanned,
    populatedCells: agg.populatedCells,
    channels: Object.fromEntries(agg.channelsUsed), requests: agg.requests, pageCapHits: agg.pageCapHits,
    componentsFetched: agg.componentsFetched, componentsSkipped: agg.componentsSkipped,
    bytesFetchedMB: Number((agg.bytesFetched / 1e6).toFixed(1)),
    matchRules: Object.fromEntries(agg.rules), elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: footprintCount, passedThroughFootprints: agg.passedThrough,
    stampAreas: stampAreas.length, peakHeapUsedMB: agg.peakHeapUsedMB, heapLimitMB: agg.heapLimitMB,
    note: `USA Structures NATIONAL heights (FEMA/ORNL, HEIGHT m, NGA LiDAR-derived subset; NYC/SF/Boston keep their own ` +
      `channel inside their own bboxes) stamped onto OSM footprints → ${measured}/${footprintCount} RETAINED footprint(s) ` +
      `got a MEASURED height across ${swathesScanned}/${swathesTotal} bounded-heap swathe(s) of ${rows || grid.ny} tile row(s); ` +
      `${agg.cellsStamped} of ${agg.populatedCells} populated cell(s) read at ${USAS_TILE_DEG}° ` +
      `(${agg.requests} page(s), ${agg.componentsFetched} components, ${(agg.bytesFetched / 1e6).toFixed(0)} MB; skipped ` +
      `${agg.componentsSkipped.noHeight} no-height / ${agg.componentsSkipped.noGeometry} no-geometry record(s)), ` +
      `${agg.voidTiles} empty cell(s) (ORNL-only ground is a REAL empty, not a failure), ${agg.tileErrors} page error(s)` +
      `${agg.pageCapHits ? `, ${agg.pageCapHits} cell(s) hit the ${maxPagesPerCell}-page cap` : ''}` +
      `${cursor ? `; resumed at cursor ${cursor}` : ''}. ${formatUsasSweepSummary(sweep)}` +
      `${agg.sweepAborted ? ` ⚠ SWEEP ABORTED — ${agg.sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      ` Peak heap ${agg.peakHeapUsedMB} MB of ${agg.heapLimitMB} MB.`,
  };
}

/** The working set clipped to one swathe band. A band NARROWS the retain set for heap reasons; it may
 *  never widen it, so this is an intersection and an empty result means "this band holds no declared
 *  working set" — skip it, do not fall back to the band. */
function intersectAreas(areas, [bw, bs, be, bn]) {
  const out = [];
  for (const [w, s, e, n] of areas) {
    const x0 = Math.max(w, bw), y0 = Math.max(s, bs), x1 = Math.min(e, be), y1 = Math.min(n, bn);
    if (x1 > x0 && y1 > y0) out.push([x0, y0, x1, y1]);
  }
  return out;
}
