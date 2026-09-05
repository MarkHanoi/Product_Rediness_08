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

export { AT_CITY_BBOXES };

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
  timeoutMs = 120_000, tileSpanDeg = 0.01, padM = 60, maxTiles = 4000, retainBboxes = null,
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
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

  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only footprints inside a stamp bbox, projected to LAEA.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
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

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  const cogs = new Map();          // tile token → { dsm, dtm } | { void: true } | { error: reason }
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, voidCells = 0, cellErrors = 0, tileCapHit = false, feedRequests = 1;
  let windowsRead = 0, nodataPixels = 0, totalPixels = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
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

  try {
    // Sweep ONLY the populated cells, sorted → deterministic under the cap. The retained working set IS
    // the city list, so every held footprint is visited (the swiss/au_open guarantee; no priority list).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (cogs.size >= maxTiles) { tileCapHit = true; break; }
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
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const tilesUsed = [...cogs.entries()].filter(([, c]) => c.dsm).map(([t, c]) => `${t} (DSM ${c.dsm.stichtag} · DTM ${c.dtm.stichtag})`);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors: tileErrors + cellErrors, voidTiles, voidCells, cellErrors, emptyTiles: 0, tileCapHit, sweepAborted, sweepAbortReason,
    tileGrid: `${buckets.size} populated 0.01° cell(s) over ${cogs.size} 50 km tile(s)`, tilesUsed, feedRequests, windowsRead,
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
