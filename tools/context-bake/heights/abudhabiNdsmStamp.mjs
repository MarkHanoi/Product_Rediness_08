// ─────────────────────────────────────────────────────────────────────────────
// §ADSDI-NDSM-OVERTURE-JOIN (2026-09-05, lane ME-ABUDHABI-I3S) — stamp Abu Dhabi 50 cm DSM − DTM measured heights
// onto bake's OWN Overture footprints: the NETWORK/RASTER half of the Abu Dhabi height stamp. The pure half —
// URLs, pixel budget, service verdict, the byte sniff, the hollow-TIFF verdict, the mosaic pre-check and the
// working set — is heights/abudhabiNdsm.mjs, whose header carries the LICENCE READ (why this is the DSM − DTM
// channel and NOT the I3S city model the brief named: the I3S item is uncatalogued and the SDI Terms scope reuse
// to catalogued "Open Data"; sid 2012 `50CM_AD_DSM_DTM` IS catalogued Open Data).
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: that file is edited by many lanes at
// once (the nl3dbagStamp / czHeightsStamp precedent); this file imports the shared join helpers from it and
// bake.mjs imports the stamp from here directly, in the SAME commit that declares the `abudhabi` row's
// heightJoin — never "built, imported by nothing" (L-12883 / L-12910).
//
// SHAPE: the CZ nDSM join (stampCzHeightsOnGeojsonseq) with three differences the probes forced:
//   1. the body is classified by its FIRST BYTES (`sniffBodyKind`), not by content-type — this server labels its
//      156 B JSON refusal `image/tiff`;
//   2. a decoded GeoTIFF whose tiles are ALL empty (`hollowTiffVerdict`) is a VOID cell (no coverage), a PARTIALLY
//      empty one is an ERROR — both are named before readRasters, which would otherwise throw on either;
//   3. a cell that intersects neither mosaic is refused BEFORE a request (`cellInsideMosaics`) and counted as
//      `outsideMosaic`, never fetched.
// The footprints are OVERTURE (the `abudhabi` row's buildingsSource) — same GeoJSONSeq shape as an OSM clip
// (`building`, `height`, `building:levels`, geometry), so the SAME `mdsHeightForBuilding` samples them (local
// metric frame, 1 m erosion, holes excluded, P90). Per POPULATED 0.01° cell: two keyless exportImage GETs in
// EPSG:4326 (~7.2 MB / ~27 s EACH at ~1 m, probed — the server resamples 50 cm; 2 m saves no time).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • exportImage refused / timed out / non-TIFF body  → `tileErrors++` — a FAILURE (the server, or us); the JSON
//     refusal text (HTTP 200 + image/tiff!) is captured by name in `errorSamples`.
//   • TIFF with SOME empty tiles                       → `tileErrors++` — a defective answer, never differenced.
//   • TIFF with ALL tiles empty (hollow)               → `voidTiles++` — an honest EMPTY (no coverage).
//   • DSM and DTM decode but disagree in shape         → `tileErrors++` — a pipeline defect, never a difference.
//   • every pixel of a cell is −9999                   → `voidTiles++` — an honest EMPTY.
//   • cell outside BOTH mosaics' rectangle             → `outsideMosaic++` — refused before a request.
//   • footprint with < minSamples clean pixels         → keeps its ORIGINAL Overture tags. Never a neighbour's height.
//   • footprint outside AD_CITY_BBOXES                 → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
// KEYLESS, catalogued Open Data (attribution "Abu Dhabi SDI Data Catalog (Department of Government Enablement)").
// No repo secret. The measured marker is written because the metre is MEASURED (satellite-stereo photogrammetric
// DSM − DTM); `heightSource` names the method so the tile never claims LiDAR.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded, mdsHeightForBuilding,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
  appendFeaturesSeq,
} from '../heightSources.mjs';
import {
  AD_ADSDI, AD_CITY_BBOXES, adNdsmExportImageUrl, adNdsmPxDims, adNdsmServiceVerdict, cellInsideMosaics,
  hollowTiffVerdict, ndsmDifference, parseAdNdsmRefusal, sniffBodyKind,
} from './abudhabiNdsm.mjs';

export { AD_CITY_BBOXES };

/** Lazy `geotiff` import — the module stays importable without the dep (the heightSources.mjs pattern). */
let _geotiffMod = null;
async function loadGeoTiff() {
  if (_geotiffMod) return _geotiffMod;
  try { _geotiffMod = await import('geotiff'); return _geotiffMod; }
  catch { return null; }
}

/** GET → { ok, status, ct, ab | null, reason }. A network throw becomes a VALUE, never an unwind. */
async function httpGetBytes(url, { timeoutMs = 120_000 } = {}) {
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

/**
 * GeoTIFF (ArrayBuffer) → `{ kind: 'raster', raster }` in the shared `{ width, height, values, bboxNative }` shape
 * (EPSG:4326 here), or `{ kind: 'hollow' }` (every tile empty — no coverage), or `{ kind: 'partial', empty, tiles }`.
 * The verdict is taken from the tile/strip byte counts BEFORE readRasters (which throws on both).
 */
async function readRaster(ab, gt) {
  const tiff = await gt.fromArrayBuffer(ab);
  const img = await tiff.getImage();
  const fd = img.fileDirectory ?? {};
  const hv = hollowTiffVerdict(fd.TileByteCounts ?? fd.StripByteCounts ?? null);
  if (hv?.hollow) return { kind: 'hollow', tiles: hv.tiles };
  if (hv?.partial) return { kind: 'partial', tiles: hv.tiles, empty: hv.empty };
  const [values] = await img.readRasters();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  return { kind: 'raster', raster: { width: img.getWidth(), height: img.getHeight(), values: Float32Array.from(values), bboxNative: [minX, minY, maxX, maxY] } };
}

/**
 * Stamp REAL Abu Dhabi nDSM heights onto an EXISTING Overture buildings GeoJSONSeq (bake's own clip). Reads
 * `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to `outPath` untouched),
 * tiles the region bbox at `tileSpanDeg`, fetches DSM3 + DTM per POPULATED cell inside the mosaics, differences
 * them, and for each footprint with ≥ `minSamples` clean interior pixels sets `height` = P90 of the nDSM
 * (+ `heightSource`, + `pryzm:height_src=measured-lidar`). Writes every footprint — stamped or original — to
 * `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (the bake `abudhabi` row); the working set is `retainBboxes`.
 */
export async function stampAdNdsmHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 180_000, tileSpanDeg = 0.01, resM = 1.0, maxTiles = 4000, padDeg = 0.001,
  retainBboxes = null, servicePrecheck = true,
  erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 1.0,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `AD nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'AD nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'AD nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep Overture default.' };
  const [w, s, e, n] = bbox;

  // §ADSDI-SERVICE-PRECHECK — two ~1 s metadata reads BEFORE a footprint is held: a service that is down,
  // token-gated, or no longer F32 is reported by NAME instead of as 0 measured heights.
  const serviceVerdicts = {};
  if (servicePrecheck) {
    for (const [k, svc] of [['dsm', AD_ADSDI.dsm], ['dtm', AD_ADSDI.dtm]]) {
      const r = await httpGetSafe(`${svc}?f=json`, { timeoutMs: 30_000, headers: { Accept: 'application/json' } });
      const v = r.ok ? adNdsmServiceVerdict(r.body) : null;
      serviceVerdicts[k] = v ?? { ok: null, reason: r.ok ? 'unparseable metadata body' : `HTTP ${r.status} ${r.reason ?? ''}`.trim() };
    }
    const refused = Object.entries(serviceVerdicts).filter(([, v]) => v.ok === false);
    if (refused.length) {
      return {
        status: 'blocked', serviceVerdicts,
        reason: `AD nDSM join: ${refused.map(([k, v]) => `${k}: ${v.reason}`).join('; ')} — the ImageServer answered but would not serve metres. Footprints keep their honest Overture tags.`,
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
  }, 'AD nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, hollowTiles = 0, outsideMosaic = 0, tileCapHit = false, requests = 0;
  let nodataPixels = 0, totalPixels = 0, bytesFetched = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();

  /** → { raster } | { hollow: true } | null (error, already sampled by name). */
  const fetchRaster = async (svc, rbox, dims, key, what) => {
    requests++;
    const rr = await httpGetBytes(adNdsmExportImageUrl(svc, rbox, dims), { timeoutMs });
    if (!rr.ok) { if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: ${rr.reason}`); return null; }
    const kind = sniffBodyKind(rr.ab);
    if (kind !== 'tiff') {
      // The refusal-inside-a-200 shape, labelled image/tiff by this server: name it, never decode it.
      const txt = new TextDecoder().decode(rr.ab.slice(0, 2048));
      const why = (kind === 'json' && parseAdNdsmRefusal(txt)) || `non-TIFF body (${rr.ct || 'no content-type'}, ${rr.ab.byteLength} B)`;
      if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: ${why}`);
      return null;
    }
    bytesFetched += rr.ab.byteLength;
    try {
      const rd = await readRaster(rr.ab, gt);
      if (rd.kind === 'raster') return { raster: rd.raster };
      if (rd.kind === 'hollow') return { hollow: true };
      if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: partially hollow TIFF — ${rd.empty} of ${rd.tiles} tiles empty (a defective answer, not differenced)`);
      return null;
    } catch (err) { if (errorSamples.length < 5) errorSamples.push(`${key} ${what}: undecodable TIFF — ${String(err?.message ?? err)}`); return null; }
  };

  try {
    // Sweep ONLY the populated cells, sorted → deterministic under the cap. The retained working set IS the city
    // list, so every held footprint is visited (the swiss/au_open guarantee; no priority list).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [ix, iy] = key.split(',').map(Number);
      const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
      const te = Math.min(tw + tileSpanDeg, e), tn = Math.min(ts + tileSpanDeg, n);
      const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
      if (!cellInsideMosaics(rbox)) { outsideMosaic++; continue; } // refused before a request — the mosaics' own rectangles
      const dims = adNdsmPxDims(rbox, resM);
      const dsm = await fetchRaster(AD_ADSDI.dsm, rbox, dims, key, 'DSM3');
      if (!dsm) { tileErrors++; continue; }
      if (dsm.hollow) { processedTiles++; voidTiles++; hollowTiles++; continue; }
      const dtm = await fetchRaster(AD_ADSDI.dtm, rbox, dims, key, 'DTM');
      if (!dtm) { tileErrors++; continue; }
      if (dtm.hollow) { processedTiles++; voidTiles++; hollowTiles++; continue; }
      const nd = ndsmDifference(dsm.raster, dtm.raster, { nodata: AD_ADSDI.nodata });
      if (!nd) {
        tileErrors++;
        if (errorSamples.length < 5) errorSamples.push(`${key}: DSM3 ${dsm.raster.width}×${dsm.raster.height} and DTM ${dtm.raster.width}×${dtm.raster.height} do not share a grid — refusing to difference`);
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
            heightSource: AD_ADSDI.heightSourceTag,
            // §CTX-HEIGHT-MEASURED-MARKER — a REAL measured nDSM metre (photogrammetric, named in heightSource): the
            // client ranks it above an OSM/Overture `tagged` height.
            [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
          };
          heights.push(h.height);
        }
      }
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFeaturesSeq(outPath, records.map((r) => r.feat));
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, hollowTiles, outsideMosaic, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    nodataFraction: totalPixels ? Number((nodataPixels / totalPixels).toFixed(3)) : null,
    requests, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)), errorSamples, serviceVerdicts,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: AD_ADSDI.attribution, licence: AD_ADSDI.licence, method: AD_ADSDI.method,
    note: `Abu Dhabi nDSM (P90 of 50 cm DSM3 − DTM over the eroded footprint; satellite-stereo photogrammetric, NOT LiDAR) stamped onto ` +
      `Overture footprints → ${measured}/${records.length} RETAINED footprint(s) got a MEASURED height; ${read.passedThrough} outside the ` +
      `${stampAreas.length} stamp bbox(es) passed through with their original tags; ${processedTiles} cell(s) read (${requests} exportImage(s), ` +
      `${(bytesFetched / 1e6).toFixed(0)} MB), ${voidTiles} void cell(s) (${hollowTiles} hollow), ${outsideMosaic} refused outside the mosaics, ` +
      `${tileErrors} cell error(s)${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep Overture)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep Overture (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
