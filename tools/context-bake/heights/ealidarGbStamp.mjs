// ─────────────────────────────────────────────────────────────────────────────
// §EA-LIDAR-GB-OSM-JOIN (2026-09-05, lane HEIGHTS-GB-IE) — stamp Environment Agency LiDAR nDSM (First-
// Return DSM 1 m − DTM 1 m, differenced HERE) onto bake's OWN OSM footprints: the NETWORK/RASTER half of
// the England measured-height stamp. Every decision (URLs, BNG tile keying, envelope, the zero-fill
// verdict, the city working set) is in heights/ealidarGb.mjs, pure and vitest-pinned; this file moves bytes.
//
// WHY ITS OWN MODULE and not another export of heightSources.mjs (where the ES/DK/FR/CH/NRW stamps live):
// heightSources.mjs is edited by several lanes at once and a whole-function insertion there collides
// (the heights/nl3dbagStamp.mjs precedent). This file imports the shared join helpers from it and
// bake.mjs imports the stamp from here directly.
//
// WHAT IT DOES — the CH swisstopo stamp's shape, with the EA WCS in place of STAC→COG:
//   1. holds only the footprints inside the declared stamp areas (retainBboxes → EA_LIDAR_GB_CITY_BBOXES
//      for the `greatbritain` row; §JOIN-BOUNDED-WORKING-SET), projecting each ring WGS84 → BNG through
//      the ONE shared projector (reproject.mjs / proj4, EPSG:27700 with its 7-parameter Helmert);
//   2. buckets them by the OS 1 km square (bngTileKey) — the publisher's own grid, as CH/NRW do;
//   3. per populated square: refuses squares outside the served envelope BEFORE any request (void); else
//      TWO GetCoverage requests IN PARALLEL (DSM + DTM, ~4.2 MB each, 2.25 s probed), decoded with
//      geotiff.fromArrayBuffer, nodata (−3.4e38) masked to NaN, each raster classified by eaRasterVerdict;
//   4. height = P90 of (DSM − DTM) over the eroded footprint interior, holes excluded
//      (`ndsmHeightForBuilding`, the DK function — native metres, unchanged) → `height` +
//      `pryzm:height_src=measured-lidar`, heightSource 'ea-lidar-ndsm'.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • square outside the DescribeCoverage envelope   → `voidTiles++`  (Scotland; no request is made)
//   • GetCoverage refused / timed out / not a TIFF     → `tileErrors++` — the server (or we) failed; UNKNOWN
//   • decoded raster all-nodata                        → `voidTiles++`  (served, nothing measurable)
//   • decoded raster ≥ 99 % exact zeros                → `voidTiles++`  (the Wales zero-fill hole, counted
//                                                       separately as `zeroFillTiles` so it is visible)
//   • footprint with < minSamples clean cells          → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • proj4 / geotiff missing in the runner            → `documented` (footprints keep OSM) — a build gate, said by name.
// KEYLESS (OGL v3 — commercial use allowed, attribution required; terrain.mjs TERRAIN_SOURCES.gb). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded, ndsmHeightForBuilding,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, statsOf,
  appendFeaturesSeq,
} from '../heightSources.mjs';
import { EA_LIDAR_GB, bngTileKey, bngTileBbox, inEaEnvelope, eaDsmUrl, eaDtmUrl, eaRasterVerdict } from './ealidarGb.mjs';

let _geotiffMod = null;
/** Lazy `geotiff` import — the module stays importable without the dep (the heightSources.mjs pattern). */
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}
let _bngProjector = null;
/** Lazy BNG projector via the ONE shared reproject.mjs (proj4). Null → the caller degrades to `documented`. */
async function loadBngProjector() {
  if (_bngProjector) return _bngProjector;
  try { const m = await import('../reproject.mjs'); _bngProjector = m.getProjector(EA_LIDAR_GB.nativeCrs); return _bngProjector; }
  catch { return null; }
}
/** Binary GET that turns every failure into a VALUE (§FETCH-THROW-IS-NOT-A-SWEEP-ABORT). */
async function httpGetBuffer(url, { timeoutMs = 90_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { Accept: 'image/tiff' } });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) return { ok: false, status: res.status, contentType, reason: `HTTP ${res.status}` };
    const ab = await res.arrayBuffer();
    return { ok: true, status: res.status, contentType, ab };
  } catch (err) {
    return { ok: false, status: 0, contentType: '', reason: String(err?.message ?? err) };
  } finally { clearTimeout(t); }
}
/**
 * Decode ONE EA GetCoverage GeoTIFF → the shared raster shape `{ width, height, values, bboxNative }` in BNG
 * metres, nodata masked to NaN so `sampleRasterNative` drops it instead of blending it, plus the honesty
 * verdict of the raw cells. Throws only on an undecodable body (the caller counts a tile error).
 */
async function decodeEaRaster(ab, gt) {
  const tiff = await gt.fromArrayBuffer(ab);
  const img = await tiff.getImage(0);
  const [vals] = await img.readRasters();
  const verdict = eaRasterVerdict(vals);
  const values = Float32Array.from(vals);
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i]) || Math.abs(values[i]) > 1e6) values[i] = NaN;
  return { width: img.getWidth(), height: img.getHeight(), values, bboxNative: img.getBoundingBox(), verdict };
}

/**
 * Stamp REAL EA LiDAR nDSM heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads `inPath`,
 * holds only the footprints inside `retainBboxes` (the rest stream through to `outPath` untouched), visits every
 * POPULATED OS 1 km square, fetches DSM + DTM for it, and for each footprint with enough clean interior cells sets
 * `height` = P90(DSM − DTM) (+ `heightSource`, + `pryzm:height_src=measured-lidar`). Writes every footprint —
 * stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Great Britain); the working set is `retainBboxes`.
 */
export async function stampEaLidarGbHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, maxTiles = 4000, retainBboxes = null,
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `EA LiDAR GB nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'EA LiDAR GB nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'EA LiDAR GB nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const proj = await loadBngProjector();
  if (!proj) return { status: 'documented', reason: 'EA LiDAR GB nDSM join: proj4 / reproject.mjs unavailable (BNG EPSG:27700 needs the OSGB36 Helmert) — install proj4 in the bake image; footprints keep OSM default.' };

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only footprints inside a stamp bbox, projected to BNG.
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
    return { feat, extNative, interiorsNative, cx, cy };
  }, 'EA LiDAR GB nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const buckets = bucketRecords(records, (r) => { const k = bngTileKey(r.cx, r.cy); return [k.e, k.n]; });
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, zeroFillTiles = 0, outsideEnvelopeTiles = 0, tileCapHit = false, requests = 0, bytesFetched = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();
  try {
    // Visit ONLY populated squares (sorted → deterministic under the cap).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [e, n] = key.split(',').map(Number);
      const box = bngTileBbox({ e, n });
      if (!inEaEnvelope(box)) { voidTiles++; outsideEnvelopeTiles++; continue; } // Scotland etc.: nothing is served here — no request, a VOID
      requests += 2;
      const [dsmR, dtmR] = await Promise.all([httpGetBuffer(eaDsmUrl(box), { timeoutMs }), httpGetBuffer(eaDtmUrl(box), { timeoutMs })]);
      if (!dsmR.ok || !dtmR.ok) {                       // refused / timed out — a FAILURE, never "nothing here"
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${e}-${n}: DSM ${dsmR.ok ? 'ok' : dsmR.reason} · DTM ${dtmR.ok ? 'ok' : dtmR.reason}`);
        continue;
      }
      let dsm, dtm;
      try {
        dsm = await decodeEaRaster(dsmR.ab, gt);
        dtm = await decodeEaRaster(dtmR.ab, gt);
      } catch (err) {                                     // not a TIFF (an HTML error page with a 200) — a FAILURE
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${e}-${n}: undecodable body (${dsmR.contentType || '?'} / ${dtmR.contentType || '?'}): ${String(err?.message ?? err)}`);
        continue;
      }
      bytesFetched += dsmR.ab.byteLength + dtmR.ab.byteLength;
      processedTiles++;
      if (dsm.verdict === 'void-zero' || dtm.verdict === 'void-zero') { voidTiles++; zeroFillTiles++; continue; } // the Wales hole — served as zeros, NOT ground
      if (dsm.verdict !== 'ok' || dtm.verdict !== 'ok') { voidTiles++; continue; }                               // all-nodata / empty: served, nothing measurable
      for (const r of inTile) {
        const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dsm, dtm, { erodeM, percentile, minSamples, sampleStep });
        if (h) {
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: EA_LIDAR_GB.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
        }
      }
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFeaturesSeq(outPath, records.map((r) => r.feat));
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, zeroFillTiles, outsideEnvelopeTiles, emptyTiles: 0, tileCapHit, sweepAborted, sweepAbortReason,
    tileGrid: `${buckets.size} populated OS 1 km square(s)`, requests, bytesFetched, errorSamples, elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `EA LiDAR nDSM (P90 of First-Return DSM − DTM over the eroded footprint, differenced by PRYZM) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through ` +
      `with their original OSM tags; ${processedTiles} km² square(s) read (${requests} GetCoverage, ${(bytesFetched / 1e6).toFixed(0)} MB), ${voidTiles} void square(s) ` +
      `(${zeroFillTiles} zero-filled, ${outsideEnvelopeTiles} outside the served envelope), ${tileErrors} square error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} square(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
