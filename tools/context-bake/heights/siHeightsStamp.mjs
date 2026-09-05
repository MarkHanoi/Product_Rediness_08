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
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadJoinFootprintsBounded, footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf, clampHeight,
} from '../heightSources.mjs';
import {
  GURS_KN, SI_CITY_BBOXES, gursStavbeUrl, parseGursCollection, gursStavbeFromCollection, matchStavbeToFootprint, pointGrid, ownedP90,
} from './siHeights.mjs';

export { SI_CITY_BBOXES };

/**
 * Stamp GURS STAVBE register heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads
 * `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath`
 * untouched), tiles the region bbox at `tileSpanDeg`, fetches the STAVBE centroids per POPULATED cell,
 * and for each footprint that owns ≥ 1 centroid sets `height` = P90 of the owned heights (+ `heightSource`,
 * + `building:levels` when OSM has none and the register has floors, + the register's accuracy code).
 * Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Slovenia); the working set is `retainBboxes`.
 */
export async function stampSiHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, tileSpanDeg = 0.01, padDeg = 0.0005, maxTiles = 4000, retainBboxes = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `SI GURS join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'SI GURS join: no bbox supplied' };
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'SI GURS join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0;
  let buildingsFetched = 0, buildingsSkippedNoHeight = 0, buildingsSkippedNoGeometry = 0, bytesFetched = 0, multiOwned = 0;
  const rules = { 'h2-h3': 0, 'h2-h1': 0 };
  const accuracyCodes = {};
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();

  try {
    // Sweep ONLY the populated cells, sorted → deterministic under the cap. The retained working set IS
    // the city list, so every held footprint is visited (no priority list needed, as swiss/au_open).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [ix, iy] = key.split(',').map(Number);
      const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
      const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
      // `padDeg`: a centroid just across the cell edge is still offered to this cell's footprints.
      const cell = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
      requests++;
      const rr = await httpGetSafe(gursStavbeUrl(cell), { timeoutMs, headers: { Accept: 'application/json' } });
      if (!rr.ok) {                                   // refused / timed out — a FAILURE, never "nothing here"
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: HTTP ${rr.status} ${rr.reason ?? ''}`.trim());
        continue;
      }
      const fc = parseGursCollection(rr.body);
      if (!fc) {                                      // undecodable (ows:ExceptionReport, HTML) — a FAILURE
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: undecodable body (${rr.contentType || 'no content-type'}, ${rr.body?.length ?? 0} B)`);
        continue;
      }
      bytesFetched += rr.body.length;
      processedTiles++;
      const { points, skipped } = gursStavbeFromCollection(fc);
      buildingsFetched += fc.features.length;
      buildingsSkippedNoHeight += skipped.noHeight; buildingsSkippedNoGeometry += skipped.noGeometry;
      if (points.length === 0) { voidTiles++; continue; } // an honest EMPTY: the server answered, no building with a height here
      const grid = pointGrid(points);
      for (const r of inTile) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const { owned, via } = matchStavbeToFootprint(r, grid.get([x0, y0, x1, y1]));
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
    requests, buildingsFetched, buildingsSkippedNoHeight, buildingsSkippedNoGeometry, multiOwned, rules, accuracyCodes,
    bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)), errorSamples,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: GURS_KN.attribution,
    note: `GURS KN STAVBE (H2 − H3 register height, P90 over owned centroids) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a REGISTER height (tagged — NOT measured-lidar; accuracy codes ${JSON.stringify(accuracyCodes)}); ` +
      `${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through with their original OSM tags; ` +
      `${processedTiles} cell(s) read (${requests} GetFeature(s), ${buildingsFetched} buildings, ${buildingsSkippedNoHeight} without an honest height, ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${voidTiles} empty cell(s), ${tileErrors} request error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
