// ─────────────────────────────────────────────────────────────────────────────
// §BEV-ALS-OSM-JOIN (2026-09-05, lane HEIGHTS-AT-CZ-SI) — stamp BEV ALS DSM − ALS DTM measured heights
// onto bake's OWN OSM footprints: the NETWORK/RASTER half of the Austrian national height stamp.
//
// WHY THIS IS ITS OWN MODULE: heightSources.mjs is edited by several lanes at once (the nl3dbagStamp /
// noHeightsStamp precedent); this file imports the shared join helpers from it and bake.mjs imports the
// stamp from here directly, in the SAME commit that declares the `austria` row's heightJoin. The
// DECISIONS — feed parsing, tile keying, newest-Stichtag choice, the window arithmetic, the nodata mask,
// the working set — are in heights/atHeights.mjs, pure and vitest-pinned (atHeights.spec.ts).
//
// SHAPE: the Swiss join (stampSwissHeightsOnGeojsonseq) turned inside out. Swiss reads one 1 km COG per
// tile WHOLE; BEV tiles are 50 km (2.5 Gpx, ~GBs each) so this stamp opens each tile's DSM + DTM COG ONCE
// (geotiff.js `fromUrl`, HTTP range reads — the header alone is ~1 s) and then reads a WINDOW per populated
// 0.01° OSM cell at IFD 0 (1 m). Both windows share one native LAEA georeference (computed from the IFD-0
// origin, `laeaWindow`), so the DK `ndsmHeightForBuilding` samples them in metres unchanged (erosion 1 m,
// holes excluded, P90). Footprints are projected to EPSG:3035 by reproject.mjs (proj4).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • ATOM service feed unreachable / not a feed        → status 'error' BEFORE a footprint is held (the index refused us).
//   • feed lists no DSM or DTM dataset for a tile        → `voidTiles++` — the collection is complete (55/55), so an
//                                                          absent tile is abroad / sea, not a failure.
//   • dataset feed / COG header / window read fails      → `tileErrors++` (named in errorSamples) — a FAILURE.
//   • a window is 100 % −9999 on either raster          → `voidCells++` — an honest EMPTY (the far side of a border tile).
//   • footprint with < minSamples clean cells            → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • footprint outside AT_CITY_BBOXES                   → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS, CC BY 4.0 ("© BEV"). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded, ndsmHeightForBuilding,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
} from '../heightSources.mjs';
import {
  BEV_ALS, AT_CITY_BBOXES, bevTileToken, laeaTileKey, laeaWindow, maskBevNodata, parseBevDatasetFeed, parseBevServiceFeed, pickBevDataset,
} from './atHeights.mjs';

// §BEV-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the shared whole-country kernel.
import {
  AT_BEV_NATIONAL_BBOXES, makeSweepBudget, nationalTileGrid, sweepPopulatedCells,
  formatNationalSweepSummary, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { cursorCorner, foldBandResults, runSwathedNationalStamp } from './nationalSweepRunner.mjs';

export { AT_CITY_BBOXES, AT_BEV_NATIONAL_BBOXES };

/** Append retained (stamped or not) features in bounded chunks. `records.map(...).join('\n')` builds
 *  ONE string as large as the whole band — a second copy of the working set at the exact moment the
 *  band is at peak heap. Chunking keeps the spike at ~25k features. (mdsNational's `appendRetained`.) */
function appendRetained(destPath, records, chunk = 25_000) {
  for (let i = 0; i < records.length; i += chunk) {
    appendFileSync(destPath, records.slice(i, i + chunk).map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  }
}

/** Lazy `geotiff` import — the module stays importable without the dep (the heightSources.mjs pattern). */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}
let _laeaProjector = null;
async function loadLaeaProjector() {
  if (_laeaProjector) return _laeaProjector;
  try { const m = await import('../reproject.mjs'); _laeaProjector = m.getProjector(BEV_ALS.nativeCrs); return _laeaProjector; }
  catch { return null; }
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: timed out after ${ms} ms`)), ms))]);

/** Open ONE COG by URL (range reads) → { tiff, img0, width, height, bboxNative, ifds }. Throws on a non-COG. */
async function openCog(href, gt) {
  const tiff = await gt.fromUrl(href, { allowFullFile: false });
  const img0 = await tiff.getImage(0);
  const ifds = await tiff.getImageCount();
  return { tiff, img0, width: img0.getWidth(), height: img0.getHeight(), bboxNative: img0.getBoundingBox(), ifds };
}

/** Read the pixel window `win` off IFD 0 → the shared raster shape, nodata masked to NaN. */
async function readWindow(cog, win) {
  const [vals] = await cog.img0.readRasters({ window: win.window });
  const values = Float32Array.from(vals);
  const masked = maskBevNodata(values, BEV_ALS.nodata);
  return { width: win.width, height: win.height, values, bboxNative: win.bboxNative, masked };
}

/**
 * Stamp REAL BEV nDSM heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads `inPath`,
 * holds only the footprints inside `retainBboxes` (projected to LAEA; the rest stream through to `outPath`
 * untouched), resolves the newest DSM + DTM COG per 50 km tile through the ATOM feeds, and per populated
 * 0.01° cell reads one window off each COG, differences them per footprint (P90 over the eroded interior)
 * and sets `height` + `heightSource` + `pryzm:height_src=measured-lidar`. Writes every footprint — stamped or
 * original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Austria); the working set is `retainBboxes`.
 */
export async function stampAtHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, tileSpanDeg = 0.01, tileSpanLonDeg = null, tileSpanLatDeg = null,
  padM = 60, maxTiles = 4000, retainBboxes = null, priorityBboxes = [],
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
  // §BEV-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the four options a bounded-heap
  // band pass supplies. A caller that passes NONE of them (every city-sized row, every unit test)
  // takes the identical path it took before: pass-through and retained both land in `outPath`, the
  // budget is local, and the sweep is one pass.
  passThroughPath = null, retainedOutPath = null, sweepBudget = null, sweepGrid = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `AT BEV nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'AT BEV nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'AT BEV nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const proj = await loadLaeaProjector();
  if (!proj) return { status: 'documented', reason: 'AT BEV nDSM join: proj4 / reproject.mjs unavailable (EPSG:3035 is LAEA, not a UTM zone) — install proj4 in the bake image; footprints keep OSM default.' };

  // §BEV-FEED-FIRST — one ~2 MB keyless read BEFORE a footprint is held: the tile → newest COG index.
  const feedRes = await httpGetSafe(BEV_ALS.serviceFeed, { timeoutMs: Math.min(timeoutMs, 60_000), headers: { Accept: 'application/atom+xml, application/xml' } });
  const feed = feedRes.ok ? parseBevServiceFeed(feedRes.body) : null;
  if (!feed) {
    return { status: 'error', reason: `AT BEV nDSM join: the ATOM service feed did not answer as a feed (HTTP ${feedRes.status} ${feedRes.reason ?? ''}, ${feedRes.body?.length ?? 0} B) — the index refused us; footprints keep OSM default (a FAILURE, not "no tiles").`.replace(/\s+/g, ' ') };
  }

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  if (passThroughPath) mkdirSync(dirname(passThroughPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only footprints inside a stamp bbox, projected to LAEA.
  // In a banded run the rest goes to the NEXT band's input, not to the output, so each pass's input is
  // strictly smaller than the last and peak heap tracks one band instead of the nation.
  const load = loadJoinFootprintsBounded(inPath, passThroughPath ?? outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const extNative = fp.ext.map(([lon, lat]) => proj.forward(lon, lat));
    const interiorsNative = fp.interiors.map((r) => r.map(([lon, lat]) => proj.forward(lon, lat)));
    let cx = 0, cy = 0;
    for (const [X, Y] of extNative) { cx += X; cy += Y; }
    cx /= extNative.length; cy /= extNative.length;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { feat, clon: fp.clon, clat: fp.clat, extNative, interiorsNative, cx, cy };
  }, 'AT BEV nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  // The grid is the REGION's, never the band's — so a cell `ord` means the same thing in every pass
  // and a cursor written by one band is readable by the next (§NATIONAL-SWEEP).
  const grid = sweepGrid ?? nationalTileGrid(bbox, {
    lonDeg: tileSpanLonDeg ?? tileSpanDeg, latDeg: tileSpanLatDeg ?? tileSpanDeg,
  });
  const buckets = bucketRecords(records, (r) => [grid.cellIx(r.clon), grid.cellIy(r.clat)]);
  // One shared budget across bands when the runner supplies one; a local, single-pass one otherwise.
  const budget = sweepBudget ?? makeSweepBudget({ maxTiles });
  const cogs = new Map();          // tile token → { dsm, dtm } | { void: true } | { error: reason }
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, voidCells = 0, cellErrors = 0, priorityTiles = 0, feedRequests = 1;
  let windowsRead = 0, nodataPixels = 0, totalPixels = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from the cap on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  // The heights array is the BUDGET's, so the aggregate statistics belong to the whole sweep and not
  // to whichever band ran last. `measuredAtStart` keeps THIS pass's own count honest for the fold.
  const heights = budget.heights;
  const measuredAtStart = heights.length;
  const done = new Set();
  const t0 = Date.now();

  /** Resolve + open the DSM and DTM COGs for a 50 km tile ONCE. */
  const cogsFor = async (tk) => {
    const token = bevTileToken(tk);
    if (cogs.has(token)) return cogs.get(token);
    const pick = { dsm: pickBevDataset(feed, 'DSM', token), dtm: pickBevDataset(feed, 'DTM', token) };
    let entry;
    if (!pick.dsm || !pick.dtm) { entry = { void: true }; voidTiles++; }
    else {
      entry = {};
      for (const k of ['dsm', 'dtm']) {
        feedRequests++;
        const dr = await httpGetSafe(pick[k].datasetFeed, { timeoutMs: Math.min(timeoutMs, 60_000), headers: { Accept: 'application/atom+xml, application/xml' } });
        const href = dr.ok ? parseBevDatasetFeed(dr.body) : null;
        if (!href) { entry = { error: `${token} ${k}: dataset feed ${dr.ok ? 'carries no image/tiff link' : `HTTP ${dr.status} ${dr.reason ?? ''}`}`.trim() }; break; }
        try {
          const cog = await withTimeout(openCog(href, gt), timeoutMs, `${token} ${k} COG header`);
          if (cog.ifds < 1 || !cog.width || !cog.height) throw new Error('not a readable COG');
          entry[k] = { ...cog, href, stichtag: pick[k].stichtag };
        } catch (err) { entry = { error: `${token} ${k}: ${String(err?.message ?? err)}` }; break; }
      }
      if (entry.error) { tileErrors++; if (errorSamples.length < 5) errorSamples.push(entry.error); }
      else processedTiles++;
    }
    cogs.set(token, entry);
    return entry;
  };

  /** Read ONE cell's COG windows and stamp its footprints. Returns TRUE when at least one window was
   *  actually READ, so a refusal counts as an opened-but-failed cell and never as stamped ground. */
  const stampCell = async (c, inTile) => {
    {
      const key = c.key;
      if (!inTile || inTile.length === 0) return false;
      let cellRead = false;
      // The cell's native extent = the LAEA envelope of its footprints, padded so eroded edges still sample.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of inTile) for (const [X, Y] of r.extNative) { if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; }
      const box = [minX - padM, minY - padM, maxX + padM, maxY + padM];
      // Group the cell's footprints by the 50 km tile their centroid falls in (a cell can straddle two).
      const byTile = new Map();
      for (const r of inTile) { const tk = laeaTileKey(r.cx, r.cy); const t = bevTileToken(tk); const b = byTile.get(t); if (b) b.recs.push(r); else byTile.set(t, { tk, recs: [r] }); }
      for (const { tk, recs } of byTile.values()) {
        const c = await cogsFor(tk);
        if (c.void || c.error) continue;                       // void → recs keep OSM tags; error → counted above
        const wd = laeaWindow(c.dsm.bboxNative, box, { width: c.dsm.width, height: c.dsm.height, resM: BEV_ALS.resM });
        const wt = laeaWindow(c.dtm.bboxNative, box, { width: c.dtm.width, height: c.dtm.height, resM: BEV_ALS.resM });
        if (!wd || !wt) { voidCells++; continue; }             // the window lies off this tile entirely
        let dsm, dtm;
        try {
          dsm = await withTimeout(readWindow(c.dsm, wd), timeoutMs, `${key} DSM window`);
          dtm = await withTimeout(readWindow(c.dtm, wt), timeoutMs, `${key} DTM window`);
        } catch (err) { cellErrors++; if (errorSamples.length < 5) errorSamples.push(`${key}: ${String(err?.message ?? err)}`); continue; }
        windowsRead += 2;
        cellRead = true;
        nodataPixels += dsm.masked + dtm.masked; totalPixels += dsm.values.length + dtm.values.length;
        if (dsm.masked === dsm.values.length || dtm.masked === dtm.values.length) { voidCells++; continue; } // abroad: an honest void
        for (const r of recs) {
          const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dsm, dtm, { erodeM, percentile, minSamples, sampleStep });
          if (h) {
            r.feat.properties = {
              ...(r.feat.properties ?? {}),
              building: r.feat.properties?.building ?? 'yes',
              height: Number(h.height.toFixed(1)),
              heightSource: BEV_ALS.heightSourceTag,
              // §CTX-HEIGHT-MEASURED-MARKER — a REAL LiDAR nDSM metre: the client ranks it above an OSM `tagged` height.
              [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
            };
            heights.push(h.height);
          }
        }
      }
      return cellRead;
    }
  };

  try {
    // §PRIORITY-FIRST — the priority bboxes are stamped FIRST and are NOT subject to `maxTiles`, so
    // the metros are GUARANTEED measured heights on every run however early the national sweep is
    // truncated. They DO respect the wall-clock deadline. (Empty for a city-sized caller.)
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = windowsRead;
      for (let iy = grid.cellIy(ps); iy <= grid.cellIy(pn) && !budget.stopReason; iy++) {
        for (let ix = grid.cellIx(pw); ix <= grid.cellIx(pe); ix++) {
          const key = `${ix},${iy}`;
          if (done.has(key) || !buckets.has(key)) continue;
          if (Date.now() > budget.deadlineAt) { budget.stopReason ??= 'time-budget-in-priority'; break; }
          done.add(key);
          await stampCell({ ix, iy, key, ord: grid.ordOf(ix, iy) }, buckets.get(key));
        }
      }
      priorityTiles += Math.round((windowsRead - before) / 2);
    }
    // §NATIONAL-SWEEP — only POPULATED cells, in a DETERMINISTIC NUMERIC order (row-major
    // south→north), resumable from the shared cursor. Never lexicographic: "10,3" sorts before "2,3"
    // and makes a capped run un-resumable (mdsNational's scar).
    await sweepPopulatedCells({ buckets, grid, budget, done, onCell: stampCell });
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); budget.stopReason ??= 'sweep-aborted'; } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints went to `passThroughPath` (the next band's input) or straight to
  // `outPath`; append the retained (stamped or not) ones — in bounded chunks, because
  // `records.map(...).join('\n')` builds one string as large as the whole band at peak heap.
  appendRetained(retainedOutPath ?? outPath, records);
  const tileCapHit = String(budget.stopReason ?? '').startsWith('maxTiles');
  const measured = heights.length - measuredAtStart;   // THIS pass's own — the fold sums bands
  const sorted = [...heights].sort((a, b) => a - b);   // a copy: the budget array is shared across bands
  const tilesUsed = [...cogs.entries()].filter(([, c]) => c.dsm).map(([t, c]) => `${t} (DSM ${c.dsm.stichtag} · DTM ${c.dtm.stichtag})`);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(sorted), heightSamples: sorted.slice(0, 8), priorityTiles,
    tilesProcessed: processedTiles, tileErrors: tileErrors + cellErrors, voidTiles, voidCells, cellErrors, emptyTiles: 0, tileCapHit, sweepAborted, sweepAbortReason,
    tileGrid: `${buckets.size} populated ${grid.lonDeg}°×${grid.latDeg}° cell(s) over ${cogs.size} 50 km tile(s)`, tilesUsed, feedRequests, windowsRead,
    nodataFraction: totalPixels ? Number((nodataPixels / totalPixels).toFixed(3)) : null, errorSamples,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: BEV_ALS.attribution,
    note: `BEV ALS nDSM (P90 of ALS DSM − ALS DTM over the eroded footprint, 1 m COG windows) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through ` +
      `with their original OSM tags; ${processedTiles} 50 km tile(s) opened [${tilesUsed.join('; ')}], ${windowsRead} window(s) read over ${buckets.size} cell(s), ` +
      `${voidTiles} void tile(s), ${voidCells} void cell(s), ${tileErrors} tile error(s), ${cellErrors} cell error(s)` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${windowsRead} window(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §BEV-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the WHOLE OF AUSTRIA, not five cities.
//
// ── THE DEFECT THIS REMOVES ─────────────────────────────────────────────────────────────────────
// `stampBboxesFor('bev_at')` returned AT_CITY_BBOXES: vienna / graz / linz / salzburg / innsbruck, and
// NOTHING ELSE in the country could ever be measured. Klagenfurt, Villach, Wels, St. Pölten, Dornbirn,
// Bregenz, Wiener Neustadt and every Alpine village shipped the labelled `assumed` 9 m — on the map
// indistinguishable from "the source has no data here" (L-422/457/467/469). Same shape as Ciudad Real
// (L-12946), and it was never BEV's limit.
//
// ── THE SOURCE WAS ALREADY NATIONAL, IN THIS REPO'S OWN WORDS ───────────────────────────────────
// heights/atHeights.mjs's header, from the 2026-09-05 probe of the INSPIRE ATOM service feed:
// "672 entries = 55 tiles × {DSM, DTM} × 6 Stichtage … EVERY tile is present in EVERY Stichtag —
// 55/55 DSM and 55/55 DTM for 2025", and "Coverage is the whole country (55 tiles)". FIFTY-FIVE COG
// TILES COVER AUSTRIA. The join opened five city boxes out of them. Nothing had to be discovered to
// widen this — only the retain set had to stop being a city list.
//
// ── WHY THIS SWEEP IS CHEAP, AND WHY THAT IS A MEASUREMENT AND NOT A HOPE ───────────────────────
// Unlike the ES/FR/CZ raster joins, BEV is read by HTTP RANGE out of a Cloud-Optimised BigTIFF, and
// the window this stamp asks for is the LAEA ENVELOPE OF THE CELL'S OWN FOOTPRINTS, not the cell. So
// the bytes track BUILDINGS, not ground: empty Alpine cells are never requested at all (they hold no
// footprint, so they are not populated cells), and a sparse village cell costs a window a few hundred
// metres across. The probed cost, from atHeights.mjs: a 301 × 301 m window read in 0.89 s (DSM) +
// 0.78 s (DTM), against a 9-IFD 50001² COG whose header opens once per 50 km tile and is CACHED
// (`cogs`) for every later cell in it.
//
// ── WHAT IS STILL BOUNDED, AND SAID OUT LOUD ────────────────────────────────────────────────────
// 770 × 275 = 211,750 cells over the `austria` bbox at 0.01°; only POPULATED ones are visited. The run
// still takes a declared slice (`budgetMs`), stamps the five metros FIRST and UNCAPPED, prints an EXACT
// resume cursor and the populated km² it SKIPPED. ⚠ Successive runs do NOT accumulate into one tileset
// today — each bake regenerates the stamped file, so a second dispatch with AT_SWEEP_CURSOR stamps a
// DIFFERENT slice. Spain's named limitation (§MDS-NATIONAL-SWEEP "HONESTY LIMIT"), inherited unchanged.
//
// ⛔ THE CELL STAYS 0.01°. It is not a raster request size here — it is how many footprints share one
//    window, and a bigger cell makes the LAEA envelope (and therefore the window) span more empty
//    ground between villages. Widening it costs bytes rather than saving requests.
// ─────────────────────────────────────────────────────────────────────────────

/** Cell of the Austrian national sweep. Unchanged from the city join: see the ⛔ above. */
export const AT_TILE_DEG = 0.01;
/** Tile rows per bounded-heap pass. 30 × 0.01° = 0.30° of latitude ≈ 11 % of the country's rows. */
export const AT_SWATHE_ROWS = 30;

/**
 * Stamp BEV ALS nDSM heights across the WHOLE of Austria, one bounded-heap band at a time.
 *
 * Same join, same COG windows, same honesty rules as `stampAtHeightsOnGeojsonseq` — this only changes
 * WHERE it is allowed to look (the country, not five boxes) and adds the machinery that makes that
 * survivable: swathe passes, an ordered numeric sweep, a resume cursor and loud truncation.
 *
 * @param bbox [w,s,e,n] WGS84 — the `austria` bake row's bbox.
 */
export async function stampAtNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  maxTiles = 20_000, retainBboxes = null, sweepCursor = null, sweepBudgetMs = null, swatheRows = null,
  priorityBboxes = AT_CITY_BBOXES.map((c) => c.bbox), ...rest
} = {}) {
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'AT BEV nDSM national join: no bbox supplied' };
  const grid = nationalTileGrid(bbox, { lonDeg: AT_TILE_DEG, latDeg: AT_TILE_DEG });
  const budgetMin = Number(process.env.AT_SWEEP_BUDGET_MIN ?? 90) || 90;
  const budget = makeSweepBudget({
    maxTiles,
    budgetMs: Number(sweepBudgetMs ?? budgetMin * 60_000) || 0,
    startCursor: resolveSweepCursor(sweepCursor, process.env.AT_SWEEP_CURSOR),
  });
  const rows = resolveSwatheRows(swatheRows, process.env.AT_SWATHE_ROWS, AT_SWATHE_ROWS);
  const areas = Array.isArray(retainBboxes) && retainBboxes.length ? retainBboxes : AT_BEV_NATIONAL_BBOXES;

  const run = await runSwathedNationalStamp({
    stamp: stampAtHeightsOnGeojsonseq,
    inPath, outPath, bbox, retainBboxes: areas, grid, swatheRows: rows, budget, label: 'BEV ALS nDSM',
    callOpts: {
      ...rest, maxTiles, tileSpanLonDeg: AT_TILE_DEG, tileSpanLatDeg: AT_TILE_DEG, priorityBboxes,
    },
  });
  if (run.status === 'error') return { status: 'error', reason: run.reason };
  if (!run.results.length) return { status: 'documented', reason: 'AT BEV nDSM national join: no band held a footprint.' };

  const ok = run.results.filter((r) => r.status === 'ok');
  const fold = foldBandResults(ok, {
    sum: ['footprintCount', 'measuredCount', 'retainedFootprints', 'tilesProcessed', 'priorityTiles',
      'tileErrors', 'voidTiles', 'voidCells', 'cellErrors', 'windowsRead', 'feedRequests', 'populatedCells'],
    max: ['peakHeapUsedMB', 'heapLimitMB'],
    concat: ['errorSamples', 'tilesUsed'],
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
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanDeg: AT_TILE_DEG,
    tileCapHit: String(budget.stopReason ?? '').startsWith('maxTiles'),
    sweepAborted: ok.some((r) => r.sweepAborted), sweepAbortReason: ok.find((r) => r.sweepAborted)?.sweepAbortReason ?? null,
    attribution: BEV_ALS.attribution,
    sweep, sweepCursorFrom: budget.startCursor, swatheRows: rows, stampAreas: areas.length,
    note: `BEV ALS nDSM (P90 of ALS DSM − ALS DTM over the eroded footprint, 1 m COG windows) stamped onto OSM `
      + `footprints across the WHOLE COUNTRY → ${fold.measuredCount}/${fold.footprintCount} RETAINED footprint(s) got a `
      + `MEASURED height; ${fold.passedThroughFootprints} never held by any band passed through with their ORIGINAL `
      + `OSM tags; ${fold.windowsRead} window(s) read over ${fold.populatedCells} populated ${AT_TILE_DEG}° cell(s), `
      + `${fold.voidTiles} void tile(s), ${fold.voidCells} void cell(s), ${fold.tileErrors} error(s). `
      + `${formatNationalSweepSummary(sweep, { label: 'BEV ALS national sweep', cursorEnv: 'AT_SWEEP_CURSOR' })} `
      + `Priority metros (${priorityBboxes.length}) are stamped UNCAPPED in their own band. `
      + `Peak heap ${fold.peakHeapUsedMB} MB of ${fold.heapLimitMB} MB.`,
  };
}
