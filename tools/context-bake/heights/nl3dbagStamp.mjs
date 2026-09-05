// ─────────────────────────────────────────────────────────────────────────────
// §NL-3DBAG-OSM-JOIN (2026-09-05, lane HEIGHTS-NL) — stamp 3D BAG (BAG × AHN LiDAR) measured heights onto
// bake's OWN OSM footprints: the NETWORK/STREAM half of the Dutch national height stamp.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs (where the ES/DK/FR/CH/NRW/AU
// stamps live): heightSources.mjs is edited by several lanes at once and a whole-function insertion
// there collides; this file imports the shared join helpers from it instead (one `export { … }` line
// there is the whole coupling) and bake.mjs imports the stamp from here directly. The DECISIONS —
// URL + axis order, attribute→height rule, part builder, match rule, city working set — are in
// heights/nl3dbag.mjs, pure and vitest-pinned (nl3dbag.spec.ts); this file only moves bytes.
//
// WHY A STAMP AND NOT A FOOTPRINT REPLACE — the same reason as every join here (§MDS-OSM-JOIN): one
// footprint set, coherent with the roads/water/landuse baked from the same OSM clip, plus the one thing
// 3DBAG has that OSM lacks (a LiDAR roof height per pand). And the whole-country `items` scan the old
// `fetch3dbag` city path would need truncates (~5,000 rows) — heightSources.mjs REGION_SOURCE `netherlands`.
//
// THE CHANNEL (probed, numbers in heights/nl3dbag.mjs): WFS 2.0 `BAG3D:lod12`, GeoJSON, EPSG:4326 with
// the BBOX in lon,lat; one GetFeature per populated 0.01° cell answers WHOLE (a 2,443-part Amsterdam
// cell = 1.9 MB / 0.6 s; CountDefault 1,000,000 — no paging). Vectors, not a raster: like NRW the
// height is TRANSCRIBED from attributes ((70p ?? 50p) − maaiveld), not computed from pixels, and a
// footprint that owns several parts takes their AREA-WEIGHTED P90 (the same statistic the raster joins
// take over pixels — see the HEIGHT RULE on stampLod2NrwHeightsOnGeojsonseq).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetFeature refused / timed out / undecodable → `tileErrors++`  — a FAILURE (the server, or us).
//   • GetFeature decodes to ZERO parts              → `voidTiles++`   — an honest EMPTY (water, polder).
//   • footprint owns no part (neither direction)     → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • part with no honest height (no maaiveld, onvoldoende, roof ≤ ground) → skipped by name, counted.
//   • footprint outside NL_3DBAG_CITY_BBOXES          → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS, CC BY 4.0 ("3D BAG by tudelft3d and 3DGI"). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
  areaWeightedP90, dominantRoof, clampHeight,
} from '../heightSources.mjs';
import {
  NL_3DBAG, nl3dbagGetFeatureUrl, parseNl3dbagCollection, nl3dbagPartsFromCollection,
  matchPartsToFootprint, partGrid,
} from './nl3dbag.mjs';

/**
 * Stamp REAL 3DBAG heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads `inPath`,
 * holds only the footprints inside `retainBboxes` (the rest stream through to `outPath` untouched), tiles
 * the region bbox at `tileSpanDeg`, fetches the lod12 parts per POPULATED cell (priority bboxes first,
 * uncapped), and for each footprint that owns ≥1 part sets `height` = area-weighted P90 of the parts'
 * heights (+ `roof_type` of the dominant part, + `heightSource`, + `pryzm:height_src=measured-lidar`).
 * Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Netherlands); the working set is `retainBboxes`.
 */
export async function stampNl3dbagHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = 0.01, padDeg = 0.0005, maxTiles = 4000,
  priorityBboxes = [], retainBboxes = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `NL 3DBAG join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'NL 3DBAG join: no bbox supplied' };
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'NL 3DBAG join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  const doneCells = new Set();
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, priorityTiles = 0, requests = 0;
  let partsFetched = 0, partsSkippedNoHeight = 0, partsSkippedNoGeometry = 0, bytesFetched = 0;
  let matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0;
  const percentiles = { '70p': 0, '50p': 0 };
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();

  const processCell = async (ix, iy, respectCap) => {
    const key = `${ix},${iy}`;
    if (doneCells.has(key)) return false;
    const inTile = buckets.get(key);
    if (!inTile || inTile.length === 0) return false;
    if (respectCap && processedTiles >= maxTiles) { tileCapHit = true; return true; }
    doneCells.add(key);
    const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
    const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
    // `padDeg`: a pand whose centroid sits just across the cell edge is still offered to this cell's
    // footprints (a footprint is bucketed by ITS centroid; its owned parts may straddle the seam).
    const cell = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
    requests++;
    const rr = await httpGetSafe(nl3dbagGetFeatureUrl(cell), { timeoutMs, headers: { Accept: 'application/json' } });
    if (!rr.ok) {                                   // refused / timed out — a FAILURE, never "nothing here"
      tileErrors++;
      if (errorSamples.length < 5) errorSamples.push(`${key}: HTTP ${rr.status} ${rr.reason ?? ''}`.trim());
      return false;
    }
    const fc = parseNl3dbagCollection(rr.body);
    if (!fc) {                                      // undecodable (ows:ExceptionReport, HTML) — a FAILURE
      tileErrors++;
      if (errorSamples.length < 5) errorSamples.push(`${key}: undecodable body (${rr.contentType || 'no content-type'}, ${rr.body?.length ?? 0} B)`);
      return false;
    }
    bytesFetched += rr.body.length;
    processedTiles++;
    const { parts, skipped } = nl3dbagPartsFromCollection(fc);
    partsFetched += fc.features.length;
    partsSkippedNoHeight += skipped.noHeight; partsSkippedNoGeometry += skipped.noGeometry;
    if (parts.length === 0) { voidTiles++; return false; } // an honest EMPTY: the server answered, no building has a height here
    const grid = partGrid(parts);
    for (const r of inTile) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const { owned, via } = matchPartsToFootprint(r, grid.get([x0, y0, x1, y1]));
      if (!via) continue;                           // NEITHER direction — the footprint keeps its OSM tags
      if (via === 'forward') { matchedForward++; if (owned.length > 1) multiPartFootprints++; } else matchedReverse++;
      const h = clampHeight(areaWeightedP90(owned));
      for (const p of owned) percentiles[p.percentile] = (percentiles[p.percentile] ?? 0) + 1;
      const roof = dominantRoof(owned);
      r.feat.properties = {
        ...(r.feat.properties ?? {}),
        building: r.feat.properties?.building ?? 'yes',
        height: Number(h.toFixed(1)),
        ...(roof ? { roof_type: roof } : {}),
        heightSource: NL_3DBAG.heightSourceTag,
        // §CTX-HEIGHT-MEASURED-MARKER — the client ranks this above an OSM-surveyed `tagged` height.
        [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
      };
      heights.push(h);
    }
    return false;
  };

  try {
    // Priority areas first (UNCAPPED) — each listed city is guaranteed its heights before the sweep
    // can exhaust `maxTiles`. A priority bbox with no retained footprints stamps nothing — harmless.
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = processedTiles;
      for (let iy = cellIy(ps); iy <= cellIy(pn); iy++) {
        for (let ix = cellIx(pw); ix <= cellIx(pe); ix++) await processCell(ix, iy, false);
      }
      priorityTiles += processedTiles - before;
    }
    // Sweep ONLY the populated cells, sorted → deterministic under the cap.
    const rest = [...buckets.keys()].filter((k) => !doneCells.has(k)).sort();
    for (const k of rest) {
      const [ix, iy] = k.split(',').map(Number);
      if (await processCell(ix, iy, true)) break;
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, priorityTiles, tileErrors, voidTiles, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    requests, partsFetched, partsSkippedNoHeight, partsSkippedNoGeometry, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchedForward, matchedReverse, multiPartFootprints, percentiles, errorSamples,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: NL_3DBAG.attribution,
    note: `3D BAG lod12 ((70p ?? 50p) − maaiveld, area-weighted P90 over owned parts) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged; ${matchedForward} forward, ${matchedReverse} reverse, ${multiPartFootprints} multi-part); ` +
      `${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${processedTiles} cell(s) read${priorityTiles ? ` (${priorityTiles} in ${priorityBboxes.length} priority bbox(es) first)` : ''} ` +
      `(${requests} GetFeature(s), ${partsFetched} parts, ${partsSkippedNoHeight} without an honest height, ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${voidTiles} empty cell(s), ${tileErrors} request error(s)` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
