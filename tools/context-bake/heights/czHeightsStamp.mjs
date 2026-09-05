// ─────────────────────────────────────────────────────────────────────────────
// §CUZK-NDSM-OSM-JOIN (2026-09-05, lane HEIGHTS-AT-CZ-SI) — stamp ČÚZK DMP 1G − DMR 5G measured heights
// onto bake's OWN OSM footprints: the NETWORK/RASTER half of the Czech national height stamp.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: that file is edited by many
// lanes at once and a whole-function insertion there collides (the nl3dbagStamp / noHeightsStamp
// precedent); this file imports the shared join helpers from it (one `export { … }` line there is the
// whole coupling) and bake.mjs imports the stamp from here directly, in the SAME commit that declares
// the `czechia` row's heightJoin — never "built, imported by nothing" (L-12883 / L-12910).
//
// SHAPE: the FR MNH join (stampMnhFrHeightsOnGeojsonseq) with one difference — MNH is a precomputed
// height raster; here the height is DSM − DTM, differenced per pixel by `ndsmDifference` into the same
// single-value raster shape and then sampled by the SAME `mdsHeightForBuilding` (local metric frame,
// 1 m erosion, holes excluded, P90). Per POPULATED 0.01° cell: two keyless exportImage GETs in EPSG:4326
// (~2.4 MB / ~1.3 s each at ~1 m, probed Prague). The georeference is read from each GeoTIFF (ArcGIS
// re-fits the extent to the pixel aspect — heights/czHeights.mjs header).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • exportImage refused / timed out / non-TIFF body  → `tileErrors++` — a FAILURE (the server, or us);
//     the JSON refusal text (HTTP 200!) is captured by name in `errorSamples`.
//   • DSM and DTM decode but disagree in shape         → `tileErrors++` — a pipeline defect, never a difference.
//   • every pixel of a cell is −9999                   → `voidTiles++` — an honest EMPTY (abroad / no coverage).
//   • footprint with < minSamples clean pixels         → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • footprint outside CZ_CITY_BBOXES                 → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS, "© ČÚZK" open data. No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded, mdsHeightForBuilding,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
} from '../heightSources.mjs';
import { CZ_CUZK, CZ_CITY_BBOXES, cuzkExportImageUrl, cuzkPxDims, cuzkServiceVerdict, ndsmDifference, parseCuzkRefusal } from './czHeights.mjs';

export { CZ_CITY_BBOXES };

/** Lazy `geotiff` import — the module stays importable without the dep (the heightSources.mjs pattern). */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}

/** GET → { ok, status, ct, ab | null, text | null, reason }. A network throw becomes a VALUE, never an unwind. */
async function httpGetBytes(url, { timeoutMs = 90_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { Accept: 'image/tiff, application/json' } });
    const ct = res.headers.get('content-type') ?? '';
    const ab = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, ct, ab, reason: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, ct: '', ab: null, reason: String(err?.message ?? err) };
  } finally { clearTimeout(t); }
}

/** GeoTIFF (ArrayBuffer) → the shared raster shape { width, height, values, bboxNative } (EPSG:4326 here). */
async function readRaster(ab, gt) {
  const tiff = await gt.fromArrayBuffer(ab);
  const img = await tiff.getImage();
  const [values] = await img.readRasters();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  return { width: img.getWidth(), height: img.getHeight(), values: Float32Array.from(values), bboxNative: [minX, minY, maxX, maxY] };
}

/**
 * Stamp REAL ČÚZK nDSM heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip). Reads
 * `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath`
 * untouched), tiles the region bbox at `tileSpanDeg`, fetches DMP 1G + DMR 5G per POPULATED cell,
 * differences them, and for each footprint with ≥ `minSamples` clean interior pixels sets `height` =
 * P90 of the nDSM (+ `heightSource`, + `pryzm:height_src=measured-lidar`). Writes every footprint —
 * stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Czechia); the working set is `retainBboxes`.
 */
export async function stampCzHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 120_000, tileSpanDeg = 0.01, resM = 1.0, maxTiles = 4000, padDeg = 0.001,
  retainBboxes = null, servicePrecheck = true,
  erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `CZ nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'CZ nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'CZ nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  const [w, s, e, n] = bbox;

  // §CUZK-SERVICE-PRECHECK — two ~100 ms metadata reads BEFORE a footprint is held: a service that is
  // down, token-gated, or no longer F32 is reported by NAME instead of as 0 measured heights.
  const serviceVerdicts = {};
  if (servicePrecheck) {
    for (const [k, svc] of [['dsm', CZ_CUZK.dsm], ['dtm', CZ_CUZK.dtm]]) {
      const r = await httpGetSafe(`${svc}?f=json`, { timeoutMs: 30_000, headers: { Accept: 'application/json' } });
      const v = r.ok ? cuzkServiceVerdict(r.body) : null;
      serviceVerdicts[k] = v ?? { ok: null, reason: r.ok ? 'unparseable metadata body' : `HTTP ${r.status} ${r.reason ?? ''}`.trim() };
    }
    const refused = Object.entries(serviceVerdicts).filter(([, v]) => v.ok === false);
    if (refused.length) {
      return {
        status: 'blocked', serviceVerdicts,
        reason: `CZ nDSM join: ${refused.map(([k, v]) => `${k}: ${v.reason}`).join('; ')} — the ImageServer answered but would not serve metres. Footprints keep their honest OSM tags.`,
      };
    }
    // ok === null (unreachable / unparseable) is UNKNOWN: fall through and let the per-cell fetches decide.
  }

  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'CZ nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0;
  let nodataPixels = 0, totalPixels = 0, bytesFetched = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();

  const fetchRaster = async (svc, rbox, dims, key, what) => {
    requests++;
    const rr = await httpGetBytes(cuzkExportImageUrl(svc, rbox, dims), { timeoutMs });
    if (!rr.ok) { if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: ${rr.reason}`); return null; }
    if (!/tiff/i.test(rr.ct)) {
      // The refusal-inside-a-200 shape (heights/czHeights.mjs header): name it, never decode it.
      const txt = new TextDecoder().decode(rr.ab.slice(0, 2048));
      const why = parseCuzkRefusal(txt) ?? `non-TIFF body (${rr.ct || 'no content-type'}, ${rr.ab.byteLength} B)`;
      if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: ${why}`);
      return null;
    }
    bytesFetched += rr.ab.byteLength;
    try { return await readRaster(rr.ab, gt); }
    catch (err) { if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: undecodable TIFF — ${String(err?.message ?? err)}`); return null; }
  };

  try {
    // Sweep ONLY the populated cells, sorted → deterministic under the cap. The retained working set IS
    // the city list, so every held footprint is visited (the swiss/au_open guarantee; no priority list).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [ix, iy] = key.split(',').map(Number);
      const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
      const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
      const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
      const dims = cuzkPxDims(rbox, resM);
      const dsm = await fetchRaster(CZ_CUZK.dsm, rbox, dims, key, 'DMP1G');
      if (!dsm) { tileErrors++; continue; }
      const dtm = await fetchRaster(CZ_CUZK.dtm, rbox, dims, key, 'DMR5G');
      if (!dtm) { tileErrors++; continue; }
      const nd = ndsmDifference(dsm, dtm, { nodata: CZ_CUZK.nodata });
      if (!nd) {
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: DMP1G ${dsm.width}×${dsm.height} and DMR5G ${dtm.width}×${dtm.height} do not share a grid — refusing to difference`);
        continue;
      }
      nodataPixels += nd.masked; totalPixels += nd.values.length;
      processedTiles++;
      if (nd.masked === nd.values.length) { voidTiles++; continue; } // outside coverage: an honest void, not an error.
      for (const r of inTile) {
        const h = mdsHeightForBuilding(r.ext, r.interiors, nd, { erodeM, percentile, minSamples, sampleStepM });
        if (h) {
          r.feat.properties = {
            ...(r.feat.properties ?? {}),
            building: r.feat.properties?.building ?? 'yes',
            height: Number(h.height.toFixed(1)),
            heightSource: CZ_CUZK.heightSourceTag,
            // §CTX-HEIGHT-MEASURED-MARKER — a REAL LiDAR-derived nDSM metre: the client ranks it above an OSM `tagged` height.
            [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
          };
          heights.push(h.height);
        }
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
    nodataFraction: totalPixels ? Number((nodataPixels / totalPixels).toFixed(3)) : null,
    requests, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)), errorSamples, serviceVerdicts,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: CZ_CUZK.attribution,
    note: `ČÚZK nDSM (P90 of DMP 1G − DMR 5G over the eroded footprint) stamped onto OSM footprints → ${measured}/${records.length} ` +
      `RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) passed through ` +
      `with their original OSM tags; ${processedTiles} cell(s) read (${requests} exportImage(s), ${(bytesFetched / 1e6).toFixed(0)} MB), ` +
      `${voidTiles} void (no coverage) cell(s), ${tileErrors} cell error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
