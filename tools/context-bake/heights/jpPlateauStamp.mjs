// ─────────────────────────────────────────────────────────────────────────────
// §PLATEAU-JP-OSM-JOIN (2026-09-06, lane JAPAN-FULL) — stamp MLIT Project PLATEAU LoD1
// `bldg:measuredHeight` onto bake's OWN OSM footprints: the NETWORK/STREAM half of the Japanese
// national height stamp. Every DECISION is in heights/jpPlateau.mjs (pure, vitest-pinned against
// bytes taken from the live service); this file only moves bytes.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs — the heights/nl3dbagStamp.mjs
// precedent: heightSources.mjs is edited by several lanes at once and a whole-function insertion there
// collides. The ONE coupling is the `import { … } from '../heightSources.mjs'` line below, which pulls
// the SHARED join helpers every stamp uses. bake.mjs imports this stamp DIRECTLY, in the same commit
// that declares the `japan` row's `heightJoin` — never "built, imported by nothing" (L-12883 / L-12910).
//
// THE SHAPE OF THE READ — and why it is cheap enough to be a bake channel at all:
//   1. Read the six per-year PLATEAU index JSONs (~3.8 MB total, once per run).
//   2. Keep the municipalities near the working set, newest fiscal year per city code
//      (`plateauRecordsForBboxes`). For JP_CITY_BBOXES that is ~80 of 474 rows.
//   3. Per municipality: GET its LoD1 `tileset.json` (14 KB) and keep it only if its ROOT region
//      actually intersects a stamp bbox — the index row is a POINT, the tileset knows the truth.
//   4. Per intersecting LEAF tile: a RANGE GET of the b3dm PREFIX only — 28 B header first, then
//      `prefixBytes` (feature table + batch table). No glTF, no triangle, no texture. Chiyoda's
//      `data4.b3dm` is 197,452 B on disk and the prefix is 107,352 B; a leaf is ~13 MB with a ~10 MB
//      prefix, so the saving is ~25 % of a much larger number — the real saving is that we never touch
//      the 2.11 GB CityGML zip that carries the same information.
//   5. Join each tile's buildings to the footprints bucketed into that tile's bbox, by
//      centroid-in-polygon (forward) / footprint-centroid-in-building-box (reverse).
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT (they are not interchangeable, and
// collapsing them is the family of bug behind L-422 / L-457 / L-467 / L-469 / L-12946):
//   • index / tileset / tile refused, timed out, or decoded to nothing  → `tileErrors++`, sampled by
//     name. A FAILURE — ours or theirs. NEVER "there are no buildings here".
//   • a tile decoded and held ZERO honest heights                        → `voidTiles++`. An honest EMPTY.
//   • a building whose `uro:lod1HeightType` is `取得不可のため一律値（3m）` → REFUSED by name and
//     counted (`skippedRefusedType`). PLATEAU itself says it could not measure this one; stamping its
//     3 m as `measured-lidar` would be the fabricated-carpet defect with a citation attached.
//   • a building with an UNSEEN height type                              → `skippedUnknownType`. Not
//     stamped. A new code must be read before it is trusted.
//   • a footprint that owns no PLATEAU building                          → keeps its ORIGINAL OSM tags.
//     Never a neighbour's height.
//   • a footprint outside every JP_CITY_BBOX                             → streams through untouched
//     (§JOIN-BOUNDED-WORKING-SET). The boundary is REPORTED in the note, not hidden.
//   • the whole index unreachable                                        → `status:'documented'` with
//     the exact HTTP answer, so the bake keeps honest OSM defaults and the gate sees a named reason.
//
// KEYLESS — no account, no subscription key, no repo secret on any URL here. (The OTHER Japanese
// door, MLIT 不動産情報ライブラリ `https://www.reinfolib.mlit.go.jp/ex-api/external/…`, IS gated:
// probed keyless 2026-09-06 → HTTP 401 application/json 152 B,
// `{ "statusCode": 401, "message": "Access denied due to missing subscription key. …" }`. Named here
// so nobody re-discovers it.)
//
// TERRAIN NOTE (not used by this stamp, recorded because it is the same country's other half): GSI
// (国土地理院) serves keyless elevation tiles — probed 2026-09-06 over Tokyo z14/14552/6451:
// `https://cyberjapandata.gsi.go.jp/xyz/dem_png/…` → HTTP 200 image/png 50,651 B (10 m DEM) and
// `…/dem5a_png/…` → HTTP 200 image/png 74,594 B (5 m LiDAR DEM). Both are DTM (bare earth); there is
// no keyless national DSM at either door, so GSI cannot yield an nDSM and is NOT a rival to this
// stamp. It is a candidate to upgrade `terrain.mjs`'s Mapterhorn drape over Japan — a separate build.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, statsOf, clampHeight,
  appendFeaturesSeq,
} from '../heightSources.mjs';
import {
  JP_PLATEAU, JP_PLATEAU_INDEX_URLS, JP_CITY_BBOXES, plateauRecordsForBboxes, tilesetLeafTiles,
  resolveTileUrl, parseB3dmHeader, readB3dmBatchTable, plateauPartsFromBatchTable, partGrid,
  matchPartsToFootprint, areaWeightedP90, bboxesIntersect, regionOfBoundingVolume, tileFormatOf,
} from './jpPlateau.mjs';

export { JP_PLATEAU, JP_CITY_BBOXES };

/** fetch → { ok, status, res, done() }. `ok` accepts 206 (a range answer IS the answer we asked for). */
async function fetchSafe(url, { timeoutMs = 90_000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers });
    return { ok: res.ok || res.status === 206, status: res.status, res, done: () => clearTimeout(t) };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, reason: String(err?.message ?? err), done: () => {} };
  }
}
async function fetchJson(url, opts) {
  const r = await fetchSafe(url, opts);
  if (!r.ok) { r.done(); return { ok: false, status: r.status, reason: r.reason ?? `HTTP ${r.status}` }; }
  try {
    const text = await r.res.text();
    try { return { ok: true, status: r.status, json: JSON.parse(text), bytes: text.length }; }
    catch { return { ok: false, status: r.status, reason: `undecodable body (${r.res.headers.get('content-type') ?? 'no content-type'}, ${text.length} B): ${text.slice(0, 120)}` }; }
  } catch (err) { return { ok: false, status: r.status, reason: String(err?.message ?? err) }; }
  finally { r.done(); }
}
async function fetchBuffer(url, opts) {
  const r = await fetchSafe(url, opts);
  if (!r.ok) { r.done(); return { ok: false, status: r.status, reason: r.reason ?? `HTTP ${r.status}` }; }
  try { return { ok: true, status: r.status, buf: Buffer.from(await r.res.arrayBuffer()) }; }
  catch (err) { return { ok: false, status: r.status, reason: String(err?.message ?? err) }; }
  finally { r.done(); }
}

/**
 * Read ONE b3dm's attribute prefix with (at most) TWO range GETs: 28 bytes to learn the section
 * lengths, then `prefixBytes` for the batch table. A server that ignores `Range` answers 200 with the
 * WHOLE tile — that still decodes correctly (the parser reads by offset), it just costs more, so the
 * status is recorded rather than trusted.
 * @returns { ok:true, json, bin, bytes, ranged } | { ok:false, reason }
 */
export async function readB3dmPrefix(url, { timeoutMs = 90_000 } = {}) {
  const head = await fetchBuffer(url, { timeoutMs, headers: { Range: 'bytes=0-27' } });
  if (!head.ok) return { ok: false, reason: `header ${head.reason}` };
  const h = parseB3dmHeader(head.buf);
  if (!h) return { ok: false, reason: `not a b3dm (first 4 bytes ${JSON.stringify(head.buf.toString('latin1', 0, 4))}, ${head.buf.length} B)` };
  const ranged = head.status === 206;
  const body = ranged
    ? await fetchBuffer(url, { timeoutMs, headers: { Range: `bytes=0-${h.prefixBytes - 1}` } })
    : { ok: true, status: 200, buf: head.buf };            // the server sent the whole file already
  if (!body.ok) return { ok: false, reason: `prefix ${body.reason}` };
  const bt = readB3dmBatchTable(body.buf);
  if (!bt) return { ok: false, reason: `batch table undecodable (${body.buf.length} B of a declared ${h.byteLength} B tile)` };
  return { ok: true, json: bt.json, bin: bt.bin, bytes: body.buf.length, ranged };
}

/**
 * Resolve the PLATEAU tilesets that cover `stampAreas`. Reads the six index JSONs, pre-filters by the
 * municipality centre point, then CONFIRMS each candidate against its own `tileset.json` root region.
 * Returns `{ ok, tilesets:[{ code, city, year, url, bbox, leaves }], indexErrors, tilesetErrors }`.
 * `ok:false` only when NOT ONE index answered — that is the honest "we know nothing" case.
 */
export async function resolvePlateauTilesets(stampAreas, { timeoutMs = 90_000, maxMunicipalities = 400 } = {}) {
  const indexes = [];
  const indexErrors = [];
  for (const { year, url } of JP_PLATEAU_INDEX_URLS) {
    const r = await fetchJson(url, { timeoutMs });
    if (r.ok) indexes.push({ year, json: r.json, bytes: r.bytes });
    else indexErrors.push(`${year}: ${r.reason}`);
  }
  if (indexes.length === 0) return { ok: false, tilesets: [], indexErrors, tilesetErrors: [], candidates: 0 };
  const candidates = plateauRecordsForBboxes(indexes, stampAreas).slice(0, maxMunicipalities);
  const tilesets = [];
  const tilesetErrors = [];
  for (const c of candidates) {
    const r = await fetchJson(c.tilesetUrl, { timeoutMs });
    if (!r.ok) { if (tilesetErrors.length < 8) tilesetErrors.push(`${c.code} ${c.city}: ${r.reason}`); continue; }
    const root = r.json && r.json.root;
    const rootBbox = root ? (regionOfBoundingVolume(root.boundingVolume) ?? null) : null;
    // A tileset whose ROOT region misses every stamp bbox is dropped here — the point pre-filter is
    // deliberately generous, and this is where the generosity is paid back.
    if (rootBbox && !stampAreas.some((a) => bboxesIntersect(rootBbox, a))) continue;
    const leaves = [];
    for (const a of stampAreas) for (const t of tilesetLeafTiles(r.json, a)) leaves.push(t);
    // One leaf can intersect two stamp bboxes; read it once.
    const seen = new Set();
    const uniq = leaves.filter((t) => (seen.has(t.uri) ? false : (seen.add(t.uri), true)));
    if (uniq.length === 0) continue;
    tilesets.push({ code: c.code, city: c.city, year: c.year, url: c.tilesetUrl, bbox: rootBbox, leaves: uniq });
  }
  return { ok: true, tilesets, indexErrors, tilesetErrors, candidates: candidates.length, indexYears: indexes.map((i) => i.year) };
}

/**
 * Stamp REAL PLATEAU LoD1 measured heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own
 * clip). Reads `inPath`, holds only the footprints inside `retainBboxes` (the rest stream through to
 * `outPath` untouched), resolves the covering PLATEAU tilesets, and for each footprint that owns ≥1
 * honestly-measured PLATEAU building sets `height` = area-weighted P90 of their `bldg:measuredHeight`
 * (+ `heightSource`, + `pryzm:height_src=measured-lidar`). Writes every footprint — stamped or
 * original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Japan); the working set is `retainBboxes`.
 */
export async function stampJpPlateauHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 90_000, maxTiles = 4000, retainBboxes = null, maxMunicipalities = 400,
  concurrency = 6, maxBytesMB = 9000,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `JP PLATEAU join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'JP PLATEAU join: no bbox supplied' };
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  const t0 = Date.now();

  // §JOIN-BOUNDED-WORKING-SET (L-659) — hold only footprints inside a stamp bbox; pass the rest through.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    return { feat, ...fp };
  }, 'JP PLATEAU join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const resolved = await resolvePlateauTilesets(stampAreas, { timeoutMs, maxMunicipalities });
  if (!resolved.ok) {
    if (records.length) appendFeaturesSeq(outPath, records.map((r) => r.feat));
    return {
      status: 'documented', outPath, count: read.parsed, footprintCount: records.length, measuredCount: 0,
      // A source outage is NOT a pipeline defect and NOT an empty country (§SOURCE-OUTAGE-VS-PIPELINE-DEFECT).
      reason: `JP PLATEAU join: NOT ONE of the ${JP_PLATEAU_INDEX_URLS.length} G空間情報センター index JSONs answered — `
        + resolved.indexErrors.join(' · ') + '. Footprints keep their honest OSM defaults.',
      tileErrors: JP_PLATEAU_INDEX_URLS.length, tilesProcessed: 0,
      retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
      peakHeapUsedMB: read.peakHeapUsedMB,
    };
  }

  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, byteCapHit = false;
  let requests = 0, bytesFetched = 0;
  let buildingsRead = 0, matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0;
  let unrangedTiles = 0, glbTiles = 0, otherFormatTiles = 0;
  const glbMunicipalities = new Set();
  const skipped = { refusedType: 0, unknownType: 0, noHeight: 0, outOfRange: 0, noPosition: 0 };
  const heightTypes = {};
  const errorSamples = [];
  const heights = [];
  const municipalitiesStamped = new Set();
  // §ABORT-IS-NOT-A-CAP — a throw mid-sweep is a FAILURE, kept apart from the benign tile cap.
  let sweepAborted = false, sweepAbortReason = null;

  // Bucket the retained footprints on a 0.01° grid so a tile only tests its own neighbourhood.
  const CELL = 0.01;
  const buckets = bucketRecords(records, (r) => [Math.floor(r.clon / CELL), Math.floor(r.clat / CELL)]);
  const recordsForBbox = (b) => {
    if (!b) return records;
    const out = [];
    const cx0 = Math.floor(b[0] / CELL) - 1, cx1 = Math.floor(b[2] / CELL) + 1;
    const cy0 = Math.floor(b[1] / CELL) - 1, cy1 = Math.floor(b[3] / CELL) + 1;
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const a = buckets.get(`${cx},${cy}`); if (a) out.push(...a);
    }
    return out;
  };

  // The work list, flattened and format-classified up front so the ⛔ glb refusal is a COUNT taken
  // before any request, not a pile of "tile error" lines that read like an outage (see tileFormatOf).
  const work = [];
  for (const ts of resolved.tilesets) {
    for (const leaf of ts.leaves) {
      const fmt = tileFormatOf(leaf.uri);
      if (fmt === 'b3dm') { work.push({ ts, leaf }); continue; }
      if (fmt === 'glb') { glbTiles++; glbMunicipalities.add(`${ts.code} ${ts.city ?? ''}`.trim()); continue; }
      otherFormatTiles++;
    }
  }

  /** Join ONE decoded tile's buildings to the footprints bucketed under its bbox. CPU only. */
  const joinTile = (ts, leaf, decoded) => {
    const built = plateauPartsFromBatchTable(decoded.json, decoded.bin);
    buildingsRead += built.features;
    for (const k of Object.keys(skipped)) skipped[k] += built.skipped[k];
    for (const [k, v] of Object.entries(built.heightTypes)) heightTypes[k] = (heightTypes[k] ?? 0) + v;
    if (built.parts.length === 0) { voidTiles++; return; }   // honest EMPTY: the tile decoded, nothing measurable in it
    const grid = partGrid(built.parts);
    for (const r of recordsForBbox(leaf.bbox)) {
      if (r._jpStamped) continue;                            // a footprint on a tile seam is offered once
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.ext) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const { owned, via } = matchPartsToFootprint(r, grid.get([x0, y0, x1, y1]));
      if (!via) continue;                                    // NEITHER direction — keeps its OSM tags
      const p90 = areaWeightedP90(owned);
      if (p90 === null) continue;
      if (via === 'forward') { matchedForward++; if (owned.length > 1) multiPartFootprints++; } else matchedReverse++;
      const h = clampHeight(p90);
      r._jpStamped = true;
      municipalitiesStamped.add(ts.code);
      r.feat.properties = {
        ...(r.feat.properties ?? {}),
        building: r.feat.properties?.building ?? 'yes',
        height: Number(h.toFixed(1)),
        heightSource: JP_PLATEAU.heightSourceTag,
        // §CTX-HEIGHT-MEASURED-MARKER — the client ranks this above an OSM-surveyed `tagged` height.
        [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE,
      };
      heights.push(h);
    }
  };

  try {
    // Tiles are FETCHED in parallel (the network is the whole cost — measured 2026-09-06: mean prefix
    // 2.52 MB, median 1.98 MB, p75 3.28 MB, max 9.54 MB over a 24-tile even sample of the 2,571-tile
    // working set → ~6.5 GB serial) and JOINED sequentially, so nothing races on `_jpStamped`.
    const step = Math.max(1, concurrency | 0);
    for (let i = 0; i < work.length; i += step) {
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      if (bytesFetched >= maxBytesMB * 1e6) { byteCapHit = true; break; }
      const batch = work.slice(i, i + step);
      requests += batch.length;
      const got = await Promise.all(batch.map(({ ts, leaf }) => readB3dmPrefix(resolveTileUrl(ts.url, leaf.uri), { timeoutMs })));
      for (let k = 0; k < batch.length; k++) {
        const { ts, leaf } = batch[k], g = got[k];
        if (!g.ok) {
          tileErrors++;
          if (errorSamples.length < 6) errorSamples.push(`${ts.code} ${leaf.uri}: ${g.reason}`);
          continue;
        }
        bytesFetched += g.bytes;
        if (!g.ranged) unrangedTiles++;
        processedTiles++;
        joinTile(ts, leaf, g);
      }
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); }

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFeaturesSeq(outPath, records.map((r) => r.feat));
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const leafTotal = resolved.tilesets.reduce((s, t) => s + t.leaves.length, 0);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, tileCapHit, byteCapHit, sweepAborted, sweepAbortReason,
    requests, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)), unrangedTiles,
    // ⛔ NAMED REFUSAL, kept apart from tileErrors: 3D Tiles 1.1 `.glb` tiles carry their attributes in
    // glTF EXT_structural_metadata, which this module cannot read (jpPlateau.mjs `tileFormatOf`).
    glbTiles, glbMunicipalities: [...glbMunicipalities], otherFormatTiles, b3dmTiles: work.length,
    buildingsRead, skippedRefusedType: skipped.refusedType, skippedUnknownType: skipped.unknownType,
    skippedNoHeight: skipped.noHeight, skippedOutOfRange: skipped.outOfRange, skippedNoPosition: skipped.noPosition,
    heightTypes, matchedForward, matchedReverse, multiPartFootprints,
    municipalities: resolved.tilesets.length, municipalitiesStamped: municipalitiesStamped.size,
    candidates: resolved.candidates, indexYears: resolved.indexYears,
    indexErrors: resolved.indexErrors, tilesetErrors: resolved.tilesetErrors, errorSamples,
    leafTiles: leafTotal,
    elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    attribution: JP_PLATEAU.attribution,
    note: `PLATEAU LoD1 bldg:measuredHeight (area-weighted P90 over owned buildings) stamped onto OSM footprints → `
      + `${measured}/${records.length} RETAINED footprint(s) got a MEASURED height (${matchedForward} forward, `
      + `${matchedReverse} reverse, ${multiPartFootprints} multi-building) across ${municipalitiesStamped.size} of `
      + `${resolved.tilesets.length} covering municipalit(ies) (${resolved.candidates} index candidate(s), years `
      + `${(resolved.indexYears ?? []).join('/')}); ${read.passedThrough} footprint(s) outside the ${stampAreas.length} `
      + `stamp bbox(es) passed through with their original OSM tags; ${processedTiles} of ${work.length} b3dm leaf tile(s) read `
      + `of ${leafTotal} total (${requests} range request(s), ${(bytesFetched / 1e6).toFixed(0)} MB, ${unrangedTiles} server(s) ignored Range), `
      + `${glbTiles ? `⛔ ${glbTiles} .glb tile(s) REFUSED — 3D Tiles 1.1 EXT_structural_metadata, reader NOT built (municipalit(ies): ${[...glbMunicipalities].join(', ')}); ` : ''}`
      + `${buildingsRead} building(s) decoded, ${skipped.refusedType} REFUSED as 取得不可のため一律値（3m） (PLATEAU's own `
      + `"could not measure" default — never stamped), ${skipped.unknownType} of an unseen height type, `
      + `${skipped.noHeight} without a height, ${skipped.noPosition} without a position; ${voidTiles} empty tile(s), `
      + `${tileErrors} tile error(s)`
      + `${resolved.indexErrors.length ? ` ⚠ ${resolved.indexErrors.length} index year(s) unreachable: ${resolved.indexErrors.join(' · ')}` : ''}`
      + `${resolved.tilesetErrors.length ? ` ⚠ ${resolved.tilesetErrors.length} tileset(s) unreachable: ${resolved.tilesetErrors.join(' · ')}` : ''}`
      + `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — the rest keep OSM)` : ''}`
      + `${byteCapHit ? ` (maxBytesMB ${maxBytesMB} budget hit after ${(bytesFetched / 1e6).toFixed(0)} MB — the rest keep OSM)` : ''}`
      + `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}`
      + `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
