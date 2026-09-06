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
// §CUZK-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the shared whole-country kernel.
import {
  CZ_CUZK_NATIONAL_BBOXES, makeSweepBudget, nationalTileGrid, sweepPopulatedCells,
  formatNationalSweepSummary, resolveSweepCursor, resolveSwatheRows,
} from './nationalSweep.mjs';
import { cursorCorner, foldBandResults, runSwathedNationalStamp } from './nationalSweepRunner.mjs';

export { CZ_CITY_BBOXES, CZ_CUZK_NATIONAL_BBOXES };

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

/** Append retained (stamped or not) features in bounded chunks. `records.map(...).join('\n')` builds
 *  ONE string as large as the whole band — a second copy of the working set at the exact moment the
 *  band is at peak heap. Chunking keeps the spike at ~25k features. (mdsNational's `appendRetained`.) */
function appendRetained(destPath, records, chunk = 25_000) {
  for (let i = 0; i < records.length; i += chunk) {
    appendFileSync(destPath, records.slice(i, i + chunk).map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  }
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
  timeoutMs = 120_000, tileSpanDeg = 0.01, tileSpanLonDeg = null, tileSpanLatDeg = null,
  resM = 1.0, maxTiles = 4000, padDeg = 0.001,
  retainBboxes = null, servicePrecheck = true, priorityBboxes = [],
  erodeM = 1.0, percentile = 90, minSamples = 3, sampleStepM = 1.0,
  // §CUZK-NATIONAL-SWEEP — the four options a bounded-heap band pass supplies. A caller that passes
  // NONE of them (every city-sized row, every unit test) takes the identical path it took before:
  // pass-through and retained both land in `outPath`, the budget is local, and the sweep is one pass.
  passThroughPath = null, retainedOutPath = null, sweepBudget = null, sweepGrid = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `CZ nDSM join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'CZ nDSM join: no bbox supplied' };
  const gt = await loadGeoTiff();
  if (!gt) return { status: 'documented', reason: 'CZ nDSM join: geotiff dep unavailable — install it in the bake image; footprints keep OSM default.' };
  // (the region corners come from `grid` now — §CUZK-NATIONAL-SWEEP)

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
  if (passThroughPath) mkdirSync(dirname(passThroughPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  // In a banded run the rest goes to the NEXT band's input, not to the output, so each pass's input is
  // strictly smaller than the last and peak heap tracks one band instead of the nation.
  const load = loadJoinFootprintsBounded(inPath, passThroughPath ?? outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'CZ nDSM join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  // The grid is the REGION's, never the band's — so a cell `ord` means the same thing in every pass
  // and a cursor written by one band is readable by the next (§NATIONAL-SWEEP).
  const grid = sweepGrid ?? nationalTileGrid(bbox, {
    lonDeg: tileSpanLonDeg ?? tileSpanDeg, latDeg: tileSpanLatDeg ?? tileSpanDeg,
  });
  const { nx, ny } = grid;
  const buckets = bucketRecords(records, (r) => [grid.cellIx(r.clon), grid.cellIy(r.clat)]);
  // One shared budget across bands when the runner supplies one; a local, single-pass one otherwise.
  const budget = sweepBudget ?? makeSweepBudget({ maxTiles });
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, requests = 0, priorityTiles = 0;
  let nodataPixels = 0, totalPixels = 0, bytesFetched = 0;
  const errorSamples = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from the cap on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  // The heights array is the BUDGET's, so the aggregate statistics belong to the whole sweep and not
  // to whichever band happened to run last. `measuredAtStart` keeps THIS pass's own count honest, so
  // the runner's fold can sum bands without double-counting.
  const heights = budget.heights;
  const measuredAtStart = heights.length;
  const done = new Set();
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

  /** Read ONE cell's two rasters and stamp its footprints. Returns TRUE when the cell was actually
   *  READ (so a refusal counts as an opened-but-failed cell, never as stamped ground). Never throws
   *  for a source failure — the cell's footprints keep their honest OSM tags and it is COUNTED. */
  const stampCell = async (c, inTile) => {
    if (!inTile || inTile.length === 0) return false;
    const [tw, ts, te, tn] = [
      grid.w + c.ix * grid.lonDeg, grid.s + c.iy * grid.latDeg,
      Math.min(grid.w + (c.ix + 1) * grid.lonDeg, grid.e), Math.min(grid.s + (c.iy + 1) * grid.latDeg, grid.n),
    ];
    const rbox = [tw - padDeg, ts - padDeg, te + padDeg, tn + padDeg];
    const dims = cuzkPxDims(rbox, resM);
    const dsm = await fetchRaster(CZ_CUZK.dsm, rbox, dims, c.key, 'DMP1G');
    if (!dsm) { tileErrors++; return false; }
    const dtm = await fetchRaster(CZ_CUZK.dtm, rbox, dims, c.key, 'DMR5G');
    if (!dtm) { tileErrors++; return false; }
    const nd = ndsmDifference(dsm, dtm, { nodata: CZ_CUZK.nodata });
    if (!nd) {
      tileErrors++;
      if (errorSamples.length < 5) errorSamples.push(`${c.key}: DMP1G ${dsm.width}×${dsm.height} and DMR5G ${dtm.width}×${dtm.height} do not share a grid — refusing to difference`);
      return false;
    }
    nodataPixels += nd.masked; totalPixels += nd.values.length;
    processedTiles++;
    if (nd.masked === nd.values.length) { voidTiles++; return true; } // outside coverage: an honest void, not an error.
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
    return true;
  };

  try {
    // §PRIORITY-FIRST — the priority bboxes are stamped FIRST and are NOT subject to `maxTiles`, so
    // the metros are GUARANTEED measured heights on every run however early the national sweep is
    // truncated. They DO respect the wall-clock deadline: a job that dies at the ceiling publishes
    // nothing at all. (Empty for a city-sized caller, which is why nothing changes for one.)
    for (const pb of priorityBboxes) {
      if (!Array.isArray(pb) || pb.length !== 4) continue;
      const [pw, ps, pe, pn] = pb;
      const before = processedTiles;
      for (let iy = grid.cellIy(ps); iy <= grid.cellIy(pn) && !budget.stopReason; iy++) {
        for (let ix = grid.cellIx(pw); ix <= grid.cellIx(pe); ix++) {
          const key = `${ix},${iy}`;
          if (done.has(key) || !buckets.has(key)) continue;
          if (Date.now() > budget.deadlineAt) { budget.stopReason ??= 'time-budget-in-priority'; break; }
          done.add(key);
          await stampCell({ ix, iy, key, ord: grid.ordOf(ix, iy) }, buckets.get(key));
        }
      }
      priorityTiles += processedTiles - before;
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
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(sorted), heightSamples: sorted.slice(0, 8),
    priorityTiles,
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

// ─────────────────────────────────────────────────────────────────────────────
// §CUZK-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the WHOLE OF CZECHIA, not five cities.
//
// ── THE DEFECT THIS REMOVES ─────────────────────────────────────────────────────────────────────
// `stampBboxesFor('cuzk_cz')` returned CZ_CITY_BBOXES: prague / brno / ostrava / plzen / olomouc, and
// NOTHING ELSE in the country could ever be measured. Liberec, České Budějovice, Zlín, Hradec Králové,
// Pardubice, Ústí, every town and every village shipped the labelled `assumed` 9 m, which on the map is
// indistinguishable from "the source has no data here" (L-422/457/467/469). That is the identical shape
// the founder hit in Spain at Ciudad Real (L-12946), and it was never the SOURCE's limit.
//
// ── THE SOURCE IS NATIONAL — LIVE-PROBED 2026-09-06, exact answers, never a claim ───────────────
// One `exportImage` per city outside the five, DMP 1G, bbox 0.01°×0.006° at size 200,120:
//   Liberec           15.05,50.75,15.06,50.756  → HTTP 200 image/tiff 131,912 B 0.590 s
//   České Budějovice  14.46,48.97,14.47,48.976  → HTTP 200 image/tiff 131,912 B 0.567 s
//   Zlín              17.65,49.21,17.66,49.216  → HTTP 200 image/tiff 131,912 B 0.556 s
//   Cheb (far west)   12.60,50.20,12.61,50.206  → HTTP 200 image/tiff 131,912 B 0.554 s
// The mosaic is the 2009–2013 national ALS campaign; it answers everywhere in Czechia.
//
// ── THE CELL SIZE IS MEASURED, NOT CHOSEN ───────────────────────────────────────────────────────
// Same bbox 14.40,50.05,14.48,50.10 (Prague), DMP 1G, size varied:
//   1000×970   → HTTP 200 image/tiff  4,195,640 B  2.43 s
//   1500×1455  → HTTP 200 image/tiff  9,439,160 B  3.97 s
//   2000×1940  → HTTP 200 image/tiff 16,780,088 B  4.31 s
//   2500×2425  → HTTP 200 image/tiff 24,907,544 B  7.60 s
//   2600×2522  → HTTP 200 image/tiff 27,529,304 B  6.43 s
//   2870×2783  → HTTP 500 text/html 696 B 22.93 s  … and on RETRY, HTTP 200 image/tiff (II* BigTIFF magic).
// ⭐ THE 500 IS TRANSIENT LOAD, NOT A CEILING — it was seen once at 2870×2783 and once at 3585×3711
//    and then did NOT reproduce. The service's own declared maxima are 15000 × 4100 (?f=json, probed
//    2026-09-05). So the tile is sized for BYTES and SECONDS, not against a refusal: 0.08° lon ×
//    0.05° lat at 2 m/px is ~2,864 × 2,783 px, about 27 MB and ~7 s PER RASTER, twice per cell.
// ⛔ Do NOT "simplify" this to the declared 15000 × 4100: that is a ~245 MB pair per cell and the job
//    is wall-clock bound. And do NOT treat a 500 as "no coverage" — it is tileErrors++, a FAILURE.
//
// ── THE COST, MEASURED AND STATED ───────────────────────────────────────────────────────────────
// 86 × 52 = 4,472 cells over the `czechia` bbox; ~55 MB and ~14 s per POPULATED cell. Czechia is not
// swept in one run and this file does not pretend otherwise: the sweep takes a declared slice
// (budgetMs), stamps the five metros FIRST and UNCAPPED, and prints an EXACT resume cursor plus the
// populated km² it SKIPPED. ⚠ Successive runs do NOT accumulate into one tileset today — each bake
// regenerates the stamped file, so a second dispatch with CZ_SWEEP_CURSOR stamps a DIFFERENT slice.
// That is Spain's named limitation (§MDS-NATIONAL-SWEEP "HONESTY LIMIT"), inherited unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/** Cell of the Czech national sweep — RECTANGULAR, sized from the measured bytes/second above. */
export const CZ_TILE_LON_DEG = 0.08;
export const CZ_TILE_LAT_DEG = 0.05;
/** Metres per pixel asked of exportImage. 2 m is the service's own native pixel size (pixelSizeX,
 *  probed) — asking for 1 m is a server-side resample that quadruples the bytes for no new signal. */
export const CZ_NATIONAL_RES_M = 2.0;
/** Tile rows per bounded-heap pass. 6 × 0.05° = 0.30° of latitude ≈ 11.5 % of the country's rows;
 *  at the measured ~1,256 B/footprint that is well under the bake's 12,288 MB heap. */
export const CZ_SWATHE_ROWS = 6;

/**
 * Stamp ČÚZK nDSM heights across the WHOLE of Czechia, one bounded-heap band at a time.
 *
 * Same join, same sampler, same honesty rules as `stampCzHeightsOnGeojsonseq` — this only changes
 * WHERE it is allowed to look (the country, not five boxes) and adds the machinery that makes that
 * survivable: swathe passes, an ordered numeric sweep, a resume cursor and loud truncation.
 *
 * @param bbox [w,s,e,n] WGS84 — the `czechia` bake row's bbox.
 */
export async function stampCzNationalHeightsOnGeojsonseq(inPath, outPath, bbox, {
  maxTiles = 20_000, retainBboxes = null, sweepCursor = null, sweepBudgetMs = null, swatheRows = null,
  priorityBboxes = CZ_CITY_BBOXES.map((c) => c.bbox), ...rest
} = {}) {
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'CZ nDSM national join: no bbox supplied' };
  const grid = nationalTileGrid(bbox, { lonDeg: CZ_TILE_LON_DEG, latDeg: CZ_TILE_LAT_DEG });
  const budgetMin = Number(process.env.CZ_SWEEP_BUDGET_MIN ?? 90) || 90;
  const budget = makeSweepBudget({
    maxTiles,
    budgetMs: Number(sweepBudgetMs ?? budgetMin * 60_000) || 0,
    startCursor: resolveSweepCursor(sweepCursor, process.env.CZ_SWEEP_CURSOR),
  });
  const rows = resolveSwatheRows(swatheRows, process.env.CZ_SWATHE_ROWS, CZ_SWATHE_ROWS);
  const areas = Array.isArray(retainBboxes) && retainBboxes.length ? retainBboxes : CZ_CUZK_NATIONAL_BBOXES;

  const run = await runSwathedNationalStamp({
    stamp: stampCzHeightsOnGeojsonseq,
    inPath, outPath, bbox, retainBboxes: areas, grid, swatheRows: rows, budget, label: 'ČÚZK nDSM',
    callOpts: {
      ...rest, maxTiles, resM: CZ_NATIONAL_RES_M, sampleStepM: CZ_NATIONAL_RES_M,
      tileSpanLonDeg: CZ_TILE_LON_DEG, tileSpanLatDeg: CZ_TILE_LAT_DEG,
      // §PRIORITY-FIRST — the five metros are stamped first and UNCAPPED, but only inside the band
      // that contains them (the runner intersects the working set with the band, and the stamp skips
      // a priority cell holding no retained footprint). A truncated run still helps the most users.
      priorityBboxes,
    },
  });
  if (run.status === 'error') return { status: 'error', reason: run.reason };
  if (!run.results.length) return { status: 'documented', reason: 'CZ nDSM national join: no band held a footprint.' };
  const blocked = run.results.find((r) => r.status === 'blocked');
  if (blocked) return blocked;

  const ok = run.results.filter((r) => r.status === 'ok');
  const fold = foldBandResults(ok, {
    sum: ['footprintCount', 'measuredCount', 'retainedFootprints', 'tilesProcessed', 'priorityTiles',
      'tileErrors', 'voidTiles', 'requests', 'populatedCells', 'bytesFetchedMB'],
    max: ['peakHeapUsedMB', 'heapLimitMB'],
    concat: ['errorSamples'],
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
  const last = ok[ok.length - 1] ?? {};
  return {
    status: 'ok', outPath, ...fold,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    coverage: fold.footprintCount ? Number((fold.measuredCount / fold.footprintCount).toFixed(3)) : 0,
    tileGrid: `${grid.nx}×${grid.ny}`, tileSpanLonDeg: CZ_TILE_LON_DEG, tileSpanLatDeg: CZ_TILE_LAT_DEG,
    tileCapHit: String(budget.stopReason ?? '').startsWith('maxTiles'),
    sweepAborted: ok.some((r) => r.sweepAborted), sweepAbortReason: ok.find((r) => r.sweepAborted)?.sweepAbortReason ?? null,
    serviceVerdicts: ok[0]?.serviceVerdicts ?? {}, attribution: CZ_CUZK.attribution,
    sweep, sweepCursorFrom: budget.startCursor, swatheRows: rows,
    stampAreas: areas.length, nodataFraction: last.nodataFraction ?? null,
    note: `ČÚZK nDSM (P90 of DMP 1G − DMR 5G over the eroded footprint) stamped onto OSM footprints across the `
      + `WHOLE COUNTRY → ${fold.measuredCount}/${fold.footprintCount} RETAINED footprint(s) got a MEASURED height; `
      + `${fold.passedThroughFootprints} never held by any band passed through with their ORIGINAL OSM tags; `
      + `${fold.tilesProcessed} cell(s) read at ${CZ_TILE_LON_DEG}°×${CZ_TILE_LAT_DEG}° / ${CZ_NATIONAL_RES_M} m `
      + `(${fold.requests} exportImage(s), ${Math.round(fold.bytesFetchedMB)} MB), ${fold.voidTiles} void (no coverage) cell(s), `
      + `${fold.tileErrors} cell error(s). ${formatNationalSweepSummary(sweep, { label: 'ČÚZK national sweep', cursorEnv: 'CZ_SWEEP_CURSOR' })} `
      + `Priority metros (${priorityBboxes.length}) are stamped UNCAPPED in their own band. `
      + `Peak heap ${fold.peakHeapUsedMB} MB of ${fold.heapLimitMB} MB.`,
  };
}
