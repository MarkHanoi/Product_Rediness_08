// ─────────────────────────────────────────────────────────────────────────────
// §EE-ETAK-OSM-JOIN (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — stamp ETAK `korgus_m` building heights onto
// bake's OWN OSM footprints: the NETWORK/STREAM half of the Estonian national height stamp.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: heightSources.mjs is edited by
// several lanes at once and a whole-function insertion there collides; this file imports the shared join
// helpers from it (the ONE coupling is that `export { … }` line) and bake.mjs imports the stamp from here
// directly — the heights/nl3dbagStamp.mjs precedent. The DECISIONS — URL + axis order, attribute→height
// rule, truncation rule, part builder, match rule, city working set — are in heights/eeHeights.mjs, pure
// and vitest-pinned (eeHeights.spec.ts); this file only moves bytes.
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
//   • footprint outside EE_CITY_BBOXES               → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS (Fees "puudub"; Maa-amet open-data licence, attribution "Maa- ja Ruumiamet"). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf, clampHeight,
} from '../heightSources.mjs';
import {
  EE_ETAK, EE_CITY_BBOXES, etakGetFeatureUrl, parseEtakCollection, etakIsTruncated, etakPartsFromCollection,
  matchPartsToFootprint, partGrid, areaWeightedP90,
} from './eeHeights.mjs';

export { EE_ETAK, EE_CITY_BBOXES };

/**
 * Stamp REAL ETAK heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads `inPath`,
 * holds only the footprints inside `retainBboxes` (the rest stream through to `outPath` untouched), tiles
 * the region bbox at `tileSpanDeg`, fetches the ETAK buildings per POPULATED cell, and for each footprint
 * that owns ≥1 building sets `height` = area-weighted P90 of their `korgus_m` (+ `heightSource`, +
 * `pryzm:height_src=measured-lidar`). Writes every footprint — stamped or original — to `outPath`: a
 * REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Estonia); the working set is `retainBboxes`.
 */
export async function stampEeEtakHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = 0.01, padDeg = 0.0005, maxTiles = 4000, maxSplitDepth = 2,
  retainBboxes = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `EE ETAK join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'EE ETAK join: no bbox supplied' };
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'EE ETAK join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0, splits = 0;
  let buildingsFetched = 0, skippedNoHeight = 0, skippedRuin = 0, skippedNoGeometry = 0, bytesFetched = 0;
  let matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0;
  const sourceIds = {};
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();

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

  const processCell = async (ix, iy) => {
    const key = `${ix},${iy}`;
    const inTile = buckets.get(key);
    if (!inTile || inTile.length === 0) return false;
    if (processedTiles >= maxTiles) { tileCapHit = true; return true; }
    const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
    const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
    // `padDeg`: a building whose interior point sits just across the cell edge is still offered to this
    // cell's footprints (a footprint is bucketed by ITS centroid; its owned buildings may straddle the seam).
    const got = await fetchBox([tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg], 0);
    if (!got.ok) {                                   // refused / timed out / truncated — a FAILURE, never "nothing here"
      tileErrors++;
      if (errorSamples.length < 5) errorSamples.push(`${key}: ${got.reason}`);
      return false;
    }
    processedTiles++;
    const { parts, skipped, sourceIds: sids } = etakPartsFromCollection({ features: got.features });
    buildingsFetched += got.features.length;
    skippedNoHeight += skipped.noHeight; skippedRuin += skipped.ruin; skippedNoGeometry += skipped.noGeometry;
    for (const [k, v] of Object.entries(sids)) sourceIds[k] = (sourceIds[k] ?? 0) + v;
    if (parts.length === 0) { voidTiles++; return false; } // an honest EMPTY: the server answered, no building has a height here
    const grid = partGrid(parts);
    for (const r of inTile) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const { owned, via } = matchPartsToFootprint(r, grid.get([x0, y0, x1, y1]));
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
    return false;
  };

  try {
    // Sweep ONLY the populated cells, sorted → deterministic under the cap. Retained working set = the city
    // list, so every held footprint is visited (no priority list needed, as swiss / au_open / ndh_no).
    for (const k of [...buckets.keys()].sort()) {
      const [ix, iy] = k.split(',').map(Number);
      if (await processCell(ix, iy)) break;
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
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    requests, splits, buildingsFetched, skippedNoHeight, skippedRuin, skippedNoGeometry, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchedForward, matchedReverse, multiPartFootprints, sourceIds, errorSamples,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: EE_ETAK.attribution,
    note: `ETAK e_401_hoone_ka korgus_m (area-weighted P90 over owned buildings) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged; ${matchedForward} forward, ${matchedReverse} reverse, ${multiPartFootprints} multi-building); ` +
      `${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${processedTiles} cell(s) read (${requests} GetFeature(s), ${splits} cap split(s), ${buildingsFetched} buildings, ${skippedNoHeight} without a height, ` +
      `${skippedRuin} ruin(s), ${(bytesFetched / 1e6).toFixed(0)} MB), ${voidTiles} empty cell(s), ${tileErrors} request error(s)` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
