// ─────────────────────────────────────────────────────────────────────────────
// §BE-DHMV-OSM-JOIN (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — stamp Digitaal Vlaanderen DHMV II nDSM
// (DSM 1 m − DTM 1 m) heights onto bake's OWN OSM footprints: the NETWORK/STREAM half of the Belgian
// national height stamp.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs (where the ES/DK/FR/CH/NRW/AU
// stamps live): heightSources.mjs is edited by several lanes at once and a whole-function insertion
// there collides; this file imports the shared join helpers from it instead (the ONE coupling is that
// `export { … }` line) and bake.mjs imports the stamp from here directly — the heights/nl3dbagStamp.mjs
// / noHeightsStamp.mjs precedent. The DECISIONS — endpoint, URL shape, tile keying, the multipart split,
// the nodata rule, the city working set — are in heights/beHeights.mjs, pure and vitest-pinned; this
// file only moves bytes.
//
// WHY A STAMP AND NOT A FOOTPRINT REPLACE — the same reason as every join here (§MDS-OSM-JOIN): one
// footprint set, coherent with the roads/water/landuse baked from the same OSM clip; the GRB `Gbg`
// footprints are Flanders-only and carry no height, UrbIS `Bu` carries none either (both probed).
//
// WHAT IT DOES (every probed number is in heights/beHeights.mjs):
//   1. holds only the footprints inside the declared stamp areas (retainBboxes → BE_CITY_BBOXES for the
//      `belgium` row; §JOIN-BOUNDED-WORKING-SET), projecting each ring WGS84 → EPSG:31370 through the
//      ONE shared projector (reproject.mjs / proj4 — Lambert 72 is an LCC on International 1924, not a
//      UTM zone, so the closed-form helpers the DK join uses cannot serve here);
//   2. buckets them by 500 m Lambert-72 tile key;
//   3. per populated tile: TWO keyless WCS 2.0.1 GetCoverage requests (DSM + DTM, the padded tile at the
//      native 1 m), each a multipart/related body whose TIFF part is cut out (splitWcsMultipart) and
//      decoded with geotiff.js, −9999 masked to NaN;
//   4. height = P90 of (DSM − DTM) over the eroded footprint interior, holes excluded
//      (`ndsmHeightForBuilding`, the DK function — native metres, unchanged) → `height` +
//      `pryzm:height_src=measured-lidar`, heightSource 'dhmv2-ndsm'.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetCoverage refused / timed out / no TIFF part   → `tileErrors++` — a FAILURE (the service, or us).
//   • TIFF part undecodable (incl. the out-of-coverage
//     stub the sea answers with, see the pure header)  → `tileErrors++` — cannot be told from truncation.
//   • raster 100 % −9999 (nothing published here)     → `voidTiles++` — an honest EMPTY.
//   • footprint with < minSamples clean cells         → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • geotiff / proj4 missing in the runner           → `documented` (footprints keep OSM) — a build gate, said by name.
//   • footprint outside BE_CITY_BBOXES                → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS (Vlaanderen: "Het gebruik van de service is kosteloos", probed 2026-09-05). No repo secret.
// ⚠ The DSM is all sursol (vegetation too) — P90 over the eroded interior is the DK/FR/CH/NO mitigation.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, statsOf, ndsmHeightForBuilding,
  appendFeaturesSeq,
} from '../heightSources.mjs';
import { BE_DHMV, BE_CITY_BBOXES, beDhmvCoverageUrl, beDhmvTileRequest, lambert72TileKey, maskDhmvNodata, splitWcsMultipart } from './beHeights.mjs';

export { BE_DHMV, BE_CITY_BBOXES };

/** Lazy `geotiff` import — the module stays importable without the dep; a bare checkout degrades to `documented`. */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}
/** Lazy Lambert-72 projector via the ONE shared reproject.mjs (proj4). Null → the caller degrades to `documented`. */
let _lambert72 = null;
async function loadLambert72Projector() {
  if (_lambert72) return _lambert72;
  try { const m = await import('../reproject.mjs'); _lambert72 = m.getProjector(BE_DHMV.crs); return _lambert72; }
  catch { return null; }
}

/**
 * GET raw bytes with a timeout and ONE retry. Honours §FETCH-THROW-IS-NOT-A-SWEEP-ABORT: a network-layer
 * throw becomes a VALUE (`{ ok:false, reason }`) so the per-tile handler counts it, instead of an unwind
 * that would end the whole country (the 2026-08-01 Spain defect, heightSources.mjs httpGetBuffer — which
 * is not exported; this is its mirror, kept here so the shared file is not touched).
 */
async function httpGetBytes(url, { timeoutMs = 90_000, retries = 1 } = {}) {
  let lastReason = 'unknown';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { Accept: 'multipart/related, image/tiff' } });
      const ct = res.headers.get('content-type') ?? '';
      const ab = await res.arrayBuffer();
      return { ok: res.ok, status: res.status, ct, ab, reason: res.ok ? null : `HTTP ${res.status}` };
    } catch (err) {
      lastReason = String(err?.message ?? err);
    } finally { clearTimeout(t); }
  }
  return { ok: false, status: 0, ct: '', ab: null, reason: lastReason };
}

/**
 * Read ONE DHMV GetCoverage body (ArrayBuffer, multipart or bare TIFF) → the shared raster shape
 * `{ width, height, values, bboxNative, masked }` in EPSG:31370, with −9999 masked to NaN so
 * `ndsmHeightForBuilding`'s bilinear sampler drops it instead of blending it into a roof.
 * Returns **null** when the body holds no TIFF part (the caller counts a tile ERROR); throws when the TIFF
 * part is undecodable (the caller catches and counts a tile ERROR too).
 */
async function readDhmvRaster(ab, gt) {
  const tiffBytes = splitWcsMultipart(new Uint8Array(ab));
  if (!tiffBytes) return null;
  const buf = tiffBytes.buffer.slice(tiffBytes.byteOffset, tiffBytes.byteOffset + tiffBytes.byteLength);
  const tiff = await gt.fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [raw] = await img.readRasters();
  const values = Float32Array.from(raw);
  const masked = maskDhmvNodata(values);
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  return { width: img.getWidth(), height: img.getHeight(), values, bboxNative: [minX, minY, maxX, maxY], masked };
}

/**
 * Stamp REAL DHMV II nDSM heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip).
 * Reads `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath`
 * untouched), fetches DSM + DTM per POPULATED 500 m Lambert-72 tile, and for each footprint with ≥ minSamples
 * clean interior cells sets `height` = P90(DSM − DTM) (+ `heightSource`, + `pryzm:height_src=measured-lidar`).
 * Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Belgium); the working set is `retainBboxes`.
 */
export async function stampBeDhmvHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, maxTiles = 4000, retainBboxes = null,
  erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `BE DHMV nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'BE DHMV nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'BE DHMV nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const proj = await loadLambert72Projector();
  if (!proj) return { status: 'documented', reason: 'BE DHMV nDSM join: proj4 / reproject.mjs unavailable (EPSG:31370 Lambert 72) — install proj4 in the bake image; footprints keep OSM default.' };

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only footprints inside a stamp bbox, projected to Lambert 72.
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
  }, 'BE DHMV nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const buckets = bucketRecords(records, (r) => { const k = lambert72TileKey(r.cx, r.cy); return [k.e, k.n]; });
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0, bytesFetched = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();
  try {
    // Visit ONLY populated tiles (sorted → deterministic under the cap).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [e, n] = key.split(',').map(Number);
      const { box } = beDhmvTileRequest({ e, n });
      requests += 2;
      const dsmR = await httpGetBytes(beDhmvCoverageUrl('dsm', box), { timeoutMs });
      const dtmR = await httpGetBytes(beDhmvCoverageUrl('dtm', box), { timeoutMs });
      if (!dsmR.ok || !dtmR.ok) {                    // the service refused us — a FAILURE, never "nothing here"
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: ${dsmR.ok ? '' : `DSM ${dsmR.reason}`} ${dtmR.ok ? '' : `DTM ${dtmR.reason}`}`.trim());
        continue;
      }
      bytesFetched += dsmR.ab.byteLength + dtmR.ab.byteLength;
      let dsm, dtm;
      try { dsm = await readDhmvRaster(dsmR.ab, gt); dtm = await readDhmvRaster(dtmR.ab, gt); }
      catch (err) {                                  // undecodable TIFF part (incl. the out-of-coverage stub) — a FAILURE by name
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: undecodable TIFF part — ${String(err?.message ?? err)}`);
        continue;
      }
      if (!dsm || !dtm) {                            // answered, but not with a raster (no TIFF part) — a FAILURE
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: no TIFF part (${dsmR.ct || 'no content-type'}, ${dsmR.ab.byteLength} B)`);
        continue;
      }
      processedTiles++;
      if (dsm.masked === dsm.values.length || dtm.masked === dtm.values.length) { voidTiles++; continue; } // nothing published here
      for (const r of inTile) {
        const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dsm, dtm, { erodeM, percentile, minSamples, sampleStep });
        if (h) {
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: BE_DHMV.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
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
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles: 0, tileCapHit, sweepAborted, sweepAbortReason,
    tileGrid: `${buckets.size} populated Lambert-72 ${BE_DHMV.tileM} m tile(s)`, requests, bytesFetched, errorSamples,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: BE_DHMV.attribution,
    note: `DHMV II nDSM (P90 of DSM 1 m − DTM 1 m over the eroded footprint) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through ` +
      `with their original OSM tags; ${processedTiles} ${BE_DHMV.tileM} m tile(s) read (${requests} GetCoverage requests, ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${voidTiles} void (unpublished) tile(s), ${tileErrors} tile error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
