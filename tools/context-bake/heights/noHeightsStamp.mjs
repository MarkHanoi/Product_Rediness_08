// ─────────────────────────────────────────────────────────────────────────────
// §NDH-NO-OSM-JOIN (2026-09-05, lane HEIGHTS-NORDICS) — stamp Kartverket NHM nDSM (DOM − DTM) heights
// onto bake's OWN OSM footprints: the NETWORK/STREAM half of the Norwegian national height stamp.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs (where the ES/DK/FR/CH/NRW/AU
// stamps live): heightSources.mjs is edited by several lanes at once and a whole-function insertion
// there collides; this file imports the shared join helpers from it instead (the ONE coupling is that
// `export { … }` line) and bake.mjs imports the stamp from here directly — the heights/nl3dbagStamp.mjs
// precedent. The DECISIONS — endpoints, URL shape, tile keying, request sizing, nodata rule, the city
// working set — are in heights/noHeights.mjs, pure and vitest-pinned; this file only moves bytes.
//
// WHY A STAMP AND NOT A FOOTPRINT REPLACE — the same reason as every join here (§MDS-OSM-JOIN): Norway
// has NO keyless national FOOTPRINT feed reachable by bbox (FKB-Bygning is Norge digitalt-licensed), so
// the footprint set is bake's OWN OSM clip, coherent with the roads/water/landuse baked from it, and
// only tiles that contain footprints fetch rasters.
//
// WHAT IT DOES (every probed number is in heights/noHeights.mjs):
//   1. holds only the footprints inside the declared stamp areas (retainBboxes → NO_NDH_CITY_BBOXES for
//      the `norway` row; §JOIN-BOUNDED-WORKING-SET), projecting each ring WGS84 → EPSG:25833 through the
//      ONE shared projector (reproject.mjs / proj4 — UTM 33N is registered there with an Oslo control point);
//   2. buckets them by 1 km UTM33 tile key;
//   3. per populated tile: TWO keyless WCS 1.0.0 GetCoverage requests (DOM + DTM, the padded tile at 1 m,
//      ≤ 1,100 px), decoded with geotiff.js, the ArcGIS float sentinel masked to NaN;
//   4. height = P90 of (DOM − DTM) over the eroded footprint interior, holes excluded
//      (`ndsmHeightForBuilding`, the DK function — native metres, unchanged) → `height` +
//      `pryzm:height_src=measured-lidar`, heightSource 'kartverket-nhm-ndsm'.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • GetCoverage refused / timed out / not a TIFF   → `tileErrors++` — a FAILURE (the service, or us).
//   • GeoTIFF undecodable                            → `tileErrors++`.
//   • raster 100 % sentinel (no data published here) → `voidTiles++` — an honest EMPTY (sea, abroad).
//   • footprint with < minSamples clean cells        → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • geotiff / proj4 missing in the runner          → `documented` (footprints keep OSM) — a build gate, said by name.
//   • footprint outside NO_NDH_CITY_BBOXES           → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS (Geonorge WCS: fees free, accessConstraints None — probed; CC BY 4.0 © Kartverket). No repo secret.
// ⚠ The DOM is all sursol (vegetation too) — P90 over the eroded interior is the DK/FR/CH mitigation.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, statsOf, ndsmHeightForBuilding,
} from '../heightSources.mjs';
import { NO_NDH, NO_NDH_CITY_BBOXES, isNdhNodata, noNdhCoverageUrl, noNdhTileRequest, utm33TileKey } from './noHeights.mjs';

export { NO_NDH, NO_NDH_CITY_BBOXES };

/** Lazy `geotiff` import — the module stays importable without the dep; a bare checkout degrades to `documented`. */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}
/** Lazy UTM33 projector via the ONE shared reproject.mjs (proj4). Null → the caller degrades to `documented`. */
let _utm33 = null;
async function loadUtm33Projector() {
  if (_utm33) return _utm33;
  try { const m = await import('../reproject.mjs'); _utm33 = m.getProjector(NO_NDH.crs); return _utm33; }
  catch { return null; }
}

/**
 * GET raw bytes with a timeout and ONE retry. Honours §FETCH-THROW-IS-NOT-A-SWEEP-ABORT: a network-layer
 * throw becomes a VALUE (`{ ok:false, reason }`) so the per-tile handler counts it, instead of an unwind
 * that would end the whole country (the 2026-08-01 Spain defect, heightSources.mjs httpGetBuffer).
 */
async function httpGetBytes(url, { timeoutMs = 90_000, retries = 1 } = {}) {
  let lastReason = 'unknown';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { Accept: 'image/tiff' } });
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
 * Read ONE NHM GeoTIFF (ArrayBuffer) → the shared raster shape `{ width, height, values, bboxNative, masked }`
 * in EPSG:25833, with the ArcGIS float sentinel masked to NaN so `ndsmHeightForBuilding`'s bilinear sampler
 * drops it instead of blending a 3.4e38 into a roof. `masked` = number of void cells.
 */
async function readNhmRaster(ab, gt) {
  const buf = ab instanceof ArrayBuffer ? ab : ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const tiff = await gt.fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [raw] = await img.readRasters();
  const values = Float32Array.from(raw);
  let masked = 0;
  for (let i = 0; i < values.length; i++) if (isNdhNodata(values[i])) { values[i] = NaN; masked++; }
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  return { width: img.getWidth(), height: img.getHeight(), values, bboxNative: [minX, minY, maxX, maxY], masked };
}

/**
 * Stamp REAL Kartverket NHM nDSM heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip).
 * Reads `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath`
 * untouched), fetches DOM + DTM per POPULATED 1 km UTM33 tile, and for each footprint with ≥ minSamples
 * clean interior cells sets `height` = P90(DOM − DTM) (+ `heightSource`, + `pryzm:height_src=measured-lidar`).
 * Writes every footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Norway); the working set is `retainBboxes`.
 */
export async function stampNoNdhHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, maxTiles = 4000, retainBboxes = null,
  resM = NO_NDH.nativeResM, erodeM = 1.0, percentile = 90, minSamples = 4, sampleStep = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `NO NHM nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'NO NHM nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'NO NHM nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const proj = await loadUtm33Projector();
  if (!proj) return { status: 'documented', reason: 'NO NHM nDSM join: proj4 / reproject.mjs unavailable (EPSG:25833) — install proj4 in the bake image; footprints keep OSM default.' };

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — stream; hold only footprints inside a stamp bbox, projected to UTM33.
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
  }, 'NO NHM nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const buckets = bucketRecords(records, (r) => { const k = utm33TileKey(r.cx, r.cy); return [k.e, k.n]; });
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0, bytesFetched = 0;
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
      const { box, dim } = noNdhTileRequest({ e, n }, { resM });
      requests += 2;
      const domR = await httpGetBytes(noNdhCoverageUrl('dom', box, dim), { timeoutMs });
      const dtmR = await httpGetBytes(noNdhCoverageUrl('dtm', box, dim), { timeoutMs });
      if (!domR.ok || !dtmR.ok || !/tiff/i.test(domR.ct) || !/tiff/i.test(dtmR.ct)) { tileErrors++; continue; } // the service refused us — a FAILURE
      bytesFetched += domR.ab.byteLength + dtmR.ab.byteLength;
      let dom, dtm;
      try { dom = await readNhmRaster(domR.ab, gt); dtm = await readNhmRaster(dtmR.ab, gt); }
      catch { tileErrors++; continue; }
      processedTiles++;
      if (dom.masked === dom.values.length || dtm.masked === dtm.values.length) { voidTiles++; continue; } // nothing published here
      for (const r of inTile) {
        const h = ndsmHeightForBuilding({ extNative: r.extNative, interiorsNative: r.interiorsNative }, dom, dtm, { erodeM, percentile, minSamples, sampleStep });
        if (h) {
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: Number(h.height.toFixed(1)), heightSource: NO_NDH.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
        }
      }
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles: 0, tileCapHit, sweepAborted, sweepAbortReason,
    tileGrid: `${buckets.size} populated UTM33 km² tile(s)`, requests, bytesFetched, elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `Kartverket NHM nDSM (P90 of DOM − DTM over the eroded footprint) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through ` +
      `with their original OSM tags; ${processedTiles} km² tile(s) read (${requests} GetCoverage requests, ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${voidTiles} void (unpublished / sea) tile(s), ${tileErrors} tile error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
