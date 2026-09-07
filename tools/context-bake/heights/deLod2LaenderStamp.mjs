// ─────────────────────────────────────────────────────────────────────────────
// §DE-LOD2-LAENDER-OSM-JOIN (2026-09-05, lane HEIGHTS-DE-LAENDER) — stamp LoD2-DE `bldg:measuredHeight`
// from EVERY wired Land onto bake's OWN OSM footprints: the NETWORK/STREAM half of the German national
// height stamp. The ROUTER (which Land, which door, which tile, how a block becomes parts) is
// heights/deLod2Laender.mjs, pure and vitest-pinned; this file only moves bytes.
//
// WHY THIS IS ITS OWN MODULE and not another export of heightSources.mjs: that file is edited by several
// lanes at once and a whole-function insertion there collides (the heights/nl3dbagStamp.mjs precedent);
// this file imports the shared join helpers from it and bake.mjs imports the stamp from here directly,
// in the SAME commit that arms the `germany` row — never "built, imported by nothing" (L-12883/L-12910).
//
// WHAT IS THE SAME AS NRW (stampLod2NrwHeightsOnGeojsonseq, the reference this generalises):
//   • vectors, not a raster — the height is TRANSCRIBED from the Land's CityGML, never computed;
//   • MATCH RULE forward (part centroids inside the OSM ring, not in a hole) → reverse (OSM centroid
//     inside a part's ground ring) → NEITHER = the footprint keeps its own OSM tags. No proximity guess;
//   • HEIGHT RULE = area-weighted P90 of the owned parts (heightSources.areaWeightedP90), roof_type from
//     the largest part (dominantRoof), clampHeight, tags via nationalBuildingTags so the client re-derives
//     `measured-lidar` exactly as for Köln;
//   • one Kachel is fetched at most once, and ONLY if it holds retained footprints (cost = O(populated area));
//   • `edgePadM` seam handling — a footprint on a tile edge is offered to both neighbours.
// WHAT IS DIFFERENT: the door per Land (gml / zip / zip-multi / zip-entry / wfs), the UTM zone (32 or 33), the tile
// edge (1 or 2 km), and the honest per-Land accounting — a Land whose index is unreachable is reported
// as BLOCKED for this run by name while the other Länder still stamp.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT (per Land, in `perLand`):
//   • index unreachable / unparseable   → `landsBlocked[cc]` — we know NOTHING about that Land; its
//                                          footprints keep OSM tags. LOUD in the note.
//   • tile absent from the Land's index → `tilesNotInIndex++` — an honest EMPTY (water, outside the Land).
//   • tile fetch failed / undecodable   → `tileErrors++` — a FAILURE (the host, or us).
//   • tile decodes to ZERO parts        → `voidTiles++` — an honest EMPTY.
//   • footprint owns no part            → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • footprint outside the working set → streamed through untouched (§JOIN-BOUNDED-WORKING-SET, L-659).
//   • sweep threw mid-grid              → `sweepAborted` — a FAILURE, never reported as a cap (§ABORT-IS-NOT-A-CAP).
// KEYLESS everywhere it is wired (licences per Land in the router table). No repo secret.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInflateRaw } from 'node:zlib';
import { Readable, Writable, Transform, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import {
  loadJoinFootprintsBounded, footprintFromFeature, stampAreasFor, inAnyArea, statsOf,
  areaWeightedP90, dominantRoof, clampHeight, nationalBuildingTags, utmNToWgs84,
} from '../heightSources.mjs';
import {
  DE_LOD2_LAENDER, DE_LOD2_CITY_BBOXES, cityForPoint, wgs84ToUtm, tileKeyFor, tileBboxNative,
  stGetFeatureUrl, stPartsFromGeojson, parseHtmlListing, parseAtomTileNames, parseNrwIndex, parseShIndex,
  s3PrefixProbeUrl, parseS3KeyCount, zipGmlEntries, headProbePresence, rangeProbePresence,
  parseSnBatchConfig, snTileNameFromTemplate, snGeoCloudUrl,
  zipLocalHeader, zipCentralDirectory, zipEocd, createBuildingSlicer, routerSummary,
} from './deLod2Laender.mjs';

const pipelineP = promisify(pipeline);
const MATCH_GRID_M = 50;          // uniform spatial index cell for candidate lookup within a tile (= NRW)
const pointInRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────
/** fetch that NEVER throws at the caller (§FETCH-THROW-IS-NOT-A-SWEEP-ABORT). */
async function fetchSafe(url, { timeoutMs = 120_000, headers = {} } = {}) {
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
async function fetchText(url, opts) {
  const r = await fetchSafe(url, opts);
  if (!r.ok) { r.done(); return { ok: false, status: r.status, reason: r.reason ?? `HTTP ${r.status}` }; }
  try { const body = await r.res.text(); return { ok: true, status: r.status, body, contentType: r.res.headers.get('content-type') ?? '' }; }
  catch (err) { return { ok: false, status: r.status, reason: String(err?.message ?? err) }; }
  finally { r.done(); }
}
async function fetchBuffer(url, opts) {
  const r = await fetchSafe(url, opts);
  if (!r.ok) { r.done(); return { ok: false, status: r.status, reason: r.reason ?? `HTTP ${r.status}` }; }
  try { const buf = Buffer.from(await r.res.arrayBuffer()); return { ok: true, status: r.status, buf, headers: r.res.headers }; }
  catch (err) { return { ok: false, status: r.status, reason: String(err?.message ?? err) }; }
  finally { r.done(); }
}

/** HEAD status only (BW `head-probe`): {ok:true,status} for ANY HTTP answer, {ok:false,reason} for a
 *  network/timeout failure. Note this is deliberately NOT fetchSafe's `ok` — a 404 IS an answer here. */
async function headStatus(url, { timeoutMs = 60_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });
    return { ok: true, status: res.status, length: Number(res.headers.get('content-length')) };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  } finally { clearTimeout(t); }
}

/**
 * Two-byte RANGE GET status only (SN `range-get`): the presence probe for a host that answers HEAD 401 on
 * every object, present or absent. Measured 2026-09-05 on geocloud.landesvermessung.sachsen.de —
 * present → 206, absent → 404, ROTATED SHARE TOKEN → 503. Like headStatus, `ok:true` means "the host
 * answered at all"; the status is then classified by rangeProbePresence, which maps 503 to UNKNOWN
 * rather than to absent, because a rotated token is a failure and failure ≠ empty.
 */
async function rangeStatus(url, { timeoutMs = 60_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { Range: 'bytes=0-1' } });
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  } finally { clearTimeout(t); }
}

/** A remote zip's central directory by Range (HH's national archive; BW's per-tile archives). */
async function readZipCentralDirectory(url, { timeoutMs }) {
  const head = await fetchSafe(url, { timeoutMs });
  const total = head.ok ? Number(head.res.headers.get('content-length')) : NaN;
  if (head.ok) { try { await head.res.body?.cancel(); } catch { /* ignore */ } }
  head.done();
  if (!head.ok || !Number.isFinite(total)) return { ok: false, reason: `archive HEAD/GET failed (${head.reason ?? `HTTP ${head.status}`})` };
  const tail = await fetchBuffer(url, { timeoutMs, headers: { Range: `bytes=${Math.max(0, total - 65536)}-${total - 1}` } });
  const eocd = tail.ok ? zipEocd(tail.buf, total) : null;
  if (!eocd || eocd.zip64) return { ok: false, reason: tail.ok ? (eocd?.zip64 ? 'zip64 archive (unsupported)' : 'no EOCD in the archive tail') : `archive tail range: ${tail.reason}` };
  const cd = await fetchBuffer(url, { timeoutMs, headers: { Range: `bytes=${eocd.cdOffset}-${eocd.cdOffset + eocd.cdSize - 1}` } });
  if (!cd.ok) return { ok: false, reason: `central directory range: ${cd.reason}` };
  return { ok: true, map: zipCentralDirectory(cd.buf), total };
}

// ── streaming decoders: a body → parts, peak memory one building block ───────────────────────────
function slicerSink(slicer, parts) {
  const dec = new TextDecoder('utf-8');
  return new Writable({
    write(chunk, _enc, cb) {
      try { for (const p of slicer.push(dec.decode(chunk, { stream: true }))) parts.push(p); cb(); }
      catch (err) { cb(err); }
    },
    final(cb) { try { for (const p of slicer.push(dec.decode())) parts.push(p); for (const p of slicer.flush()) parts.push(p); cb(); } catch (err) { cb(err); } },
  });
}
/** Plain CityGML body (NRW / SH / RP) → parts. */
async function streamGmlParts(url, { timeoutMs }) {
  const r = await fetchSafe(url, { timeoutMs });
  if (!r.ok) { r.done(); return { ok: false, reason: r.reason ?? `HTTP ${r.status}` }; }
  if (!r.res.body) { r.done(); return { ok: false, reason: 'no response body' }; }
  const parts = [], slicer = createBuildingSlicer();
  try {
    await pipelineP(Readable.fromWeb(r.res.body), slicerSink(slicer, parts));
    if (slicer.overflow) return { ok: false, reason: 'unterminated <bldg:Building> block (buffer overflow)' };
    return { ok: true, parts };
  } catch (err) { return { ok: false, reason: String(err?.message ?? err) }; } finally { r.done(); }
}
/** A Transform that swallows a zip LOCAL FILE HEADER, then passes exactly the entry's compressed bytes. */
function zipFirstEntryTransform(state) {
  let head = Buffer.alloc(0), passed = 0, headerDone = false;
  return new Transform({
    transform(chunk, _enc, cb) {
      try {
        if (!headerDone) {
          head = Buffer.concat([head, chunk]);
          const h = zipLocalHeader(head, 0);
          if (!h) { if (head.length > 65_000) return cb(new Error('not a zip: no local file header in the first 65 KB')); return cb(); }
          if (!/\.(gml|xml)$/i.test(h.name)) return cb(new Error(`first zip entry is not CityGML: ${h.name}`));
          if (h.method !== 8 && h.method !== 0) return cb(new Error(`zip method ${h.method} unsupported (entry ${h.name})`));
          state.entry = h; headerDone = true;
          chunk = head.subarray(h.dataStart); head = null;
        }
        const limit = state.entry.csize > 0 ? state.entry.csize : Infinity;
        const take = Math.min(chunk.length, Math.max(0, limit - passed));
        if (take > 0) { passed += take; this.push(chunk.subarray(0, take)); }
        cb();
      } catch (err) { cb(err); }
    },
  });
}
/** Zip body whose FIRST entry is the CityGML (BB / TH / MV / BE) → parts, streamed through inflate. */
async function streamZipParts(url, { timeoutMs, headers = {} }) {
  const r = await fetchSafe(url, { timeoutMs, headers });
  if (!r.ok) { r.done(); return { ok: false, reason: r.reason ?? `HTTP ${r.status}` }; }
  if (!r.res.body) { r.done(); return { ok: false, reason: 'no response body' }; }
  const parts = [], slicer = createBuildingSlicer(), state = {};
  try {
    const stages = [Readable.fromWeb(r.res.body), zipFirstEntryTransform(state)];
    // method is only known once the header streamed past — deflate is the only case seen live; a stored
    // (method 0) entry would need no inflate, so pipe conditionally through a lazy pass-through.
    const inflate = createInflateRaw();
    const maybeInflate = new Transform({
      transform(chunk, _enc, cb) { if (state.entry?.method === 0) { this.push(chunk); cb(); } else { inflate.write(chunk, cb); } },
      flush(cb) { if (state.entry?.method === 0) return cb(); inflate.end(); cb(); },
    });
    inflate.on('data', (d) => maybeInflate.push(d));
    const sink = slicerSink(slicer, parts);
    const inflateDone = new Promise((resolve, reject) => { inflate.on('end', resolve); inflate.on('error', reject); });
    await pipelineP(...stages, maybeInflate, sink);
    if (state.entry?.method !== 0) await inflateDone.catch((e) => { throw e; });
    if (slicer.overflow) return { ok: false, reason: 'unterminated <bldg:Building> block (buffer overflow)' };
    return { ok: true, parts, entry: state.entry?.name };
  } catch (err) { return { ok: false, reason: String(err?.message ?? err) }; } finally { r.done(); }
}
/** ONE entry of a national archive (HH) by Range — local header first (small range), then the data. */
async function streamZipEntryParts(archiveUrl, entry, { timeoutMs }) {
  const h = await fetchBuffer(archiveUrl, { timeoutMs, headers: { Range: `bytes=${entry.lho}-${entry.lho + 30 + 2048}` } });
  if (!h.ok) return { ok: false, reason: `local header range: ${h.reason}` };
  const lh = zipLocalHeader(h.buf, 0);
  if (!lh) return { ok: false, reason: 'local header did not parse at the central-directory offset' };
  const dataStart = entry.lho + lh.dataStart;
  return streamZipParts(archiveUrl, { timeoutMs, headers: { Range: `bytes=${entry.lho}-${dataStart + entry.csize - 1}` } });
}

// ── per-Land index loaders (one fetch per Land per run) ───────────────────────────────────────────
const _indexCache = new Map();
async function loadIndex(cc, adapter, { timeoutMs }) {
  if (_indexCache.has(cc)) return _indexCache.get(cc);
  let out;
  if (adapter.indexKind === 'none') out = { ok: true, has: () => true, size: null };
  else if (adapter.indexKind === 's3-prefix') {
    // NI: the LGLN geojson index's hrefs are STALE (dated 2 km zips → NoSuchKey) while the bucket itself is
    // listable, so the "index" is ONE ListObjectsV2 per candidate tile (prefix = the exact key → KeyCount 1|0),
    // cached per name. ONE probe of a never-existing key proves the bucket answers (Land blocked otherwise);
    // a probe that fails LATER is null → the caller counts a tileError, never "not in index" (§CONTEXT-DATA-HONESTY).
    const probe = await fetchText(s3PrefixProbeUrl(adapter, adapter.tileName({ e: 0, n: 0 })), { timeoutMs });
    const kc = probe.ok ? parseS3KeyCount(probe.body) : null;
    if (kc === null) out = { ok: false, reason: `bucket listing ${adapter.indexUrl} → ${probe.ok ? `not a ListBucketResult (${probe.body.length} B, ${probe.contentType})` : probe.reason}` };
    else {
      const cache = new Map();
      out = {
        ok: true, size: null, lastReason: null,
        has: async (name) => {
          if (cache.has(name)) return cache.get(name);
          const r = await fetchText(s3PrefixProbeUrl(adapter, name), { timeoutMs });
          const k = r.ok ? parseS3KeyCount(r.body) : null;
          if (k === null) { out.lastReason = r.ok ? `not a ListBucketResult (${r.body.length} B)` : r.reason; return null; }
          const present = k > 0;
          cache.set(name, present);
          return present;
        },
      };
    }
  }
  else if (adapter.indexKind === 'sn-batch-config') {
    // SN: the index is the portal's own batch-download PAGE. One GET yields the CURRENT Nextcloud share
    // token, the filename template and the publisher's list of grid cells that do not exist. Nothing about
    // Sachsen is pinned but the page URL and the product key — because the token rotates, and a pinned one
    // is exactly what made two earlier passes record this Land as `blocked` on a 503 that meant "expired".
    const page = await fetchText(adapter.indexUrl, { timeoutMs });
    const cfg = page.ok ? parseSnBatchConfig(page.body, adapter.productKey) : null;
    if (!cfg) {
      out = { ok: false, reason: `batch page ${adapter.indexUrl} → ${page.ok ? `no parseable batchConfig.products.${adapter.productKey} (${page.body.length} B, ${page.contentType})` : page.reason}` };
    } else {
      // The template must still produce the names this router builds, or the two halves have silently
      // diverged; say so rather than probe a name the portal no longer publishes.
      const probeKey = { e: 410, n: 5656 };
      const fromTemplate = snTileNameFromTemplate(cfg.filename, probeKey);
      const fromRouter = adapter.tileName(probeKey);
      if (fromTemplate !== fromRouter) {
        out = { ok: false, reason: `batch page filename template changed: "${cfg.filename}" builds ${fromTemplate}, this router builds ${fromRouter}` };
      } else {
        // BOTH controls, on the token THIS run read — a known-present name that must answer 200/206 and a
        // known-absent one that must answer 404. Without the pair a rotated token (503 on everything) or a
        // moved product would be reported as "no data in Sachsen".
        const url = (name) => snGeoCloudUrl(cfg.shareId, name, adapter.geocloudBase);
        const a = await rangeStatus(url(adapter.controlPresentTile), { timeoutMs });
        const b = await rangeStatus(url(adapter.controlAbsentTile), { timeoutMs });
        if (!a.ok || rangeProbePresence(a.status) !== true) {
          out = { ok: false, reason: `range-get control: known-present ${adapter.controlPresentTile} → ${a.ok ? `HTTP ${a.status}${a.status === 503 ? ' (this host answers 503 for a ROTATED share token — the page gave ' + cfg.shareId + ')' : ''}` : a.reason} (expected 200/206)` };
        } else if (!b.ok || rangeProbePresence(b.status) !== false) {
          out = { ok: false, reason: `range-get control: known-absent ${adapter.controlAbsentTile} → ${b.ok ? `HTTP ${b.status}` : b.reason} (expected 404) — this host does not distinguish absent from present` };
        } else {
          const cache = new Map();
          out = {
            ok: true, size: null, lastReason: null, shareId: cfg.shareId, notExisting: cfg.notExisting.length,
            has: async (name) => {
              if (cache.has(name)) return cache.get(name);
              const r = await rangeStatus(url(name), { timeoutMs });
              if (!r.ok) { out.lastReason = r.reason; return null; }
              const v = rangeProbePresence(r.status);
              if (v === null) { out.lastReason = `HTTP ${r.status} is neither present nor absent`; return null; }
              cache.set(name, v);
              return v;
            },
          };
        }
      }
    }
  }
  else if (adapter.indexKind === 'zip-central-directory') {
    const dir = await readZipCentralDirectory(adapter.indexUrl, { timeoutMs });
    if (!dir.ok) out = { ok: false, reason: dir.reason };
    else out = { ok: true, has: (n) => dir.map.has(n), get: (n) => dir.map.get(n), size: dir.map.size };
  }
  else if (adapter.indexKind === 'head-probe') {
    // BW: no listing (the directory is 403) and no index file, but the objects under it are public. The
    // "index" is ONE HEAD per candidate tile. A 404 may ONLY be read as "absent" once BOTH controls hold —
    // a known-PRESENT name that must answer 200 and a known-ABSENT name that must answer 404. Without the
    // pair, a host that 404s everything (product moved, path renamed) would be silently reported as
    // "no data in Baden-Württemberg", which is exactly the failure≠empty conflation this file refuses.
    const okName = adapter.controlPresentTile, missName = adapter.controlAbsentTile;
    const a = okName ? await headStatus(`${adapter.baseUrl}${okName}`, { timeoutMs }) : { ok: false, reason: 'no controlPresentTile declared' };
    const b = missName ? await headStatus(`${adapter.baseUrl}${missName}`, { timeoutMs }) : { ok: true, status: 404 };
    if (!a.ok || headProbePresence(a.status) !== true) {
      out = { ok: false, reason: `head-probe control: known-present ${okName} → ${a.ok ? `HTTP ${a.status}` : a.reason} (expected 200) — cannot tell "no tile" from "product moved"` };
    } else if (!b.ok || headProbePresence(b.status) !== false) {
      out = { ok: false, reason: `head-probe control: known-absent ${missName} → ${b.ok ? `HTTP ${b.status}` : b.reason} (expected 404) — this host does not distinguish absent from present` };
    } else {
      const cache = new Map();
      out = {
        ok: true, size: null, lastReason: null,
        has: async (name) => {
          if (cache.has(name)) return cache.get(name);
          const r = await headStatus(`${adapter.baseUrl}${name}`, { timeoutMs });
          if (!r.ok) { out.lastReason = r.reason; return null; }
          const v = headProbePresence(r.status);
          if (v === null) { out.lastReason = `HTTP ${r.status} is neither present nor absent`; return null; }
          cache.set(name, v);
          return v;
        },
      };
    }
  } else {
    const r = await fetchText(adapter.indexUrl, { timeoutMs });
    if (!r.ok) out = { ok: false, reason: `index ${adapter.indexUrl} → ${r.reason}` };
    else {
      let set = null;
      if (adapter.indexKind === 'html-listing') set = parseHtmlListing(r.body);
      else if (adapter.indexKind === 'atom') set = parseAtomTileNames(r.body);
      else if (adapter.indexKind === 'nrw-index-json') set = parseNrwIndex(r.body);
      else if (adapter.indexKind === 'geojson-datalink') set = parseShIndex(r.body);
      if (!set || set.size === 0) out = { ok: false, reason: `index ${adapter.indexUrl} parsed to ZERO tile names (${r.body.length} B, ${r.contentType})` };
      else out = { ok: true, has: (n) => set.has(n), size: set.size };
    }
  }
  _indexCache.set(cc, out);
  return out;
}
/** Test seam — forget cached indexes between runs. */
export function resetDeLod2IndexCache() { _indexCache.clear(); }

// ── one tile → parts, by door kind ───────────────────────────────────────────────────────────────
/** `adapter.tileUrl(key, index)` — the SECOND argument is this run's resolved index, and only Sachsen
 *  reads it (its Nextcloud share token is read per run, never pinned). Every other Land's `tileUrl`
 *  ignores it, so threading it changes no other URL by a byte. */
async function fetchTileParts(cc, adapter, key, index, { timeoutMs }) {
  if (adapter.kind === 'gml') return streamGmlParts(adapter.tileUrl(key, index), { timeoutMs });
  if (adapter.kind === 'zip') return streamZipParts(adapter.tileUrl(key, index), { timeoutMs });
  if (adapter.kind === 'zip-multi') {
    // BW: the 2 km download zip is a FOLDER — a directory entry, a licence PDF, two txt files and the
    // tile's FOUR 1 km CityGML quarters. Read its central directory, then Range-read every .gml entry.
    // A zip that parses but holds NO gml is a real failure (the container changed shape), not an empty
    // tile: `voidTiles` is for a gml that decodes to zero parts, and the two must not be conflated.
    const dir = await readZipCentralDirectory(adapter.tileUrl(key, index), { timeoutMs });
    if (!dir.ok) return { ok: false, reason: dir.reason };
    const entries = zipGmlEntries(dir.map);
    if (entries.length === 0) return { ok: false, reason: `zip holds no .gml/.xml entry (${dir.map.size} entries: ${[...dir.map.keys()].slice(0, 6).join(', ')})` };
    const parts = [];
    for (const [name, entry] of entries) {
      const r = await streamZipEntryParts(adapter.tileUrl(key, index), entry, { timeoutMs });
      if (!r.ok) return { ok: false, reason: `entry ${name}: ${r.reason}` };
      parts.push(...r.parts);
    }
    return { ok: true, parts, entry: entries.map(([n]) => n).join('+') };
  }
  if (adapter.kind === 'zip-entry') {
    const entry = index.get?.(adapter.tileName(key));
    if (!entry) return { ok: false, reason: 'entry vanished from the central directory' };
    return streamZipEntryParts(adapter.tileUrl(key, index), entry, { timeoutMs });
  }
  if (adapter.kind === 'wfs') {
    const [x0, y0, x1, y1] = tileBboxNative(adapter, key);
    const pad = 30;
    const c = [utmNToWgs84(x0 - pad, y0 - pad, adapter.zone), utmNToWgs84(x1 + pad, y0 - pad, adapter.zone), utmNToWgs84(x0 - pad, y1 + pad, adapter.zone), utmNToWgs84(x1 + pad, y1 + pad, adapter.zone)];
    const lons = c.map((p) => p.lon), lats = c.map((p) => p.lat);
    const box = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    // BOTH typenames (Building + BuildingPart) — the parts carry most of the geometry (adapter.typeNames note).
    const parts = [];
    let truncated = false, skippedNoHeight = 0;
    for (const typeName of adapter.typeNames ?? ['ALKIS_LOD2_BU:BU.Building']) {
      const r = await fetchText(stGetFeatureUrl(adapter, box, { typeName }), { timeoutMs });
      if (!r.ok) return { ok: false, reason: `${typeName}: ${r.reason}` };
      const parsed = stPartsFromGeojson(r.body, adapter);
      if (!parsed) return { ok: false, reason: `${typeName}: GetFeature body is not a FeatureCollection (${r.body.length} B, ${r.contentType})` };
      parts.push(...parsed.parts);
      if (parsed.count >= (adapter.count ?? 5000)) truncated = true;
      skippedNoHeight += parsed.skippedNoHeight;
    }
    return { ok: true, parts, truncated, skippedNoHeight };
  }
  return { ok: false, reason: `unknown door kind ${adapter.kind}` };
}

/**
 * Stamp REAL LoD2-DE `measuredHeight` from every WIRED Land onto an EXISTING OSM buildings GeoJSONSeq
 * (bake's own clip). Reads `inPath`, holds only footprints inside `retainBboxes` AND a wired city
 * (everything else streams through to `outPath` untouched), routes each city to its Land's door, walks
 * ONLY the tiles that hold retained footprints, and sets `height` (+ `roof_type`, `heightSource`,
 * `pryzm:height_src=measured-lidar`) on every footprint that spatially owns ≥ 1 LoD2 part. Writes every
 * footprint — stamped or original — to `outPath`: a REPLACE input, no double-draw. Never throws.
 * @param bbox [w,s,e,n] WGS84 — the REGION bbox (whole Germany); the working set is `retainBboxes`.
 */
export async function stampDeLod2LaenderHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 180_000, maxTiles = 600, edgePadM = 30, retainBboxes = null, cities = DE_LOD2_CITY_BBOXES, table = DE_LOD2_LAENDER,
} = {}) {
  const label = 'DE LoD2 Länder join';
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `${label}: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: `${label}: no bbox supplied` };
  const t0 = Date.now();
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });

  // §JOIN-BOUNDED-WORKING-SET — hold only footprints inside a stamp bbox AND inside a WIRED city; project
  // each into ITS Land's UTM zone once (32 or 33), so every match below is exact metres.
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const city = cityForPoint(fp.clon, fp.clat, cities);
    if (!city) return null;
    const ad = table[city.land];
    if (!ad || ad.status !== 'wired') return null;
    const extNative = fp.ext.map(([lon, lat]) => wgs84ToUtm(lat, lon, ad.zone));
    const interiorsNative = fp.interiors.map((r) => r.map(([lon, lat]) => wgs84ToUtm(lat, lon, ad.zone)));
    let cx = 0, cy = 0, minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    for (const [X, Y] of extNative) {
      cx += X; cy += Y;
      if (X < minE) minE = X; if (X > maxE) maxE = X;
      if (Y < minN) minN = Y; if (Y > maxN) maxN = Y;
    }
    cx /= extNative.length; cy /= extNative.length;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { feat, land: city.land, city: city.city, extNative, interiorsNative, cx, cy, minE, minN, maxE, maxN };
  }, label);
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  // Group by Land, then bucket by tile key — a seam footprint (within edgePadM of a tile edge) is offered to
  // both neighbours, exactly as NRW's per-tile filter did, but in ONE pass (§JOIN-BOUNDED-WORKING-SET wall-clock).
  const byLand = new Map();
  for (const r of records) {
    const ad = table[r.land];
    let buckets = byLand.get(r.land);
    if (!buckets) { buckets = new Map(); byLand.set(r.land, buckets); }
    const k0 = tileKeyFor(ad, r.cx - edgePadM, r.cy - edgePadM), k1 = tileKeyFor(ad, r.cx + edgePadM, r.cy + edgePadM);
    const step = ad.tileM / 1000;
    for (let e = k0.e; e <= k1.e; e += step) {
      for (let n = k0.n; n <= k1.n; n += step) {
        const k = `${e},${n}`;
        const b = buckets.get(k);
        if (b) b.push(r); else buckets.set(k, [r]);
      }
    }
  }

  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tilesNotInIndex = 0, tileCapHit = false, truncatedCells = 0;
  let sweepAborted = false, sweepAbortReason = null;
  let matchedForward = 0, matchedReverse = 0, multiPartFootprints = 0, partsRead = 0;
  const errorTiles = [], notInIndexSample = [];
  const heights = [];
  const perLand = {};
  const landsBlocked = {};
  try {
    outer:
    for (const [cc, buckets] of byLand) {
      const ad = table[cc];
      const pl = perLand[cc] = { land: ad.land, footprints: 0, measured: 0, tiles: 0, tileErrors: 0, voidTiles: 0, notInIndex: 0, cells: buckets.size };
      const seen = new Set();
      for (const rs of buckets.values()) for (const r of rs) if (!seen.has(r)) { seen.add(r); pl.footprints++; }
      const index = await loadIndex(cc, ad, { timeoutMs });
      if (!index.ok) {
        // §CONTEXT-DATA-HONESTY value 1 — this Land's door did not answer. We know NOTHING about its
        // coverage, which is a different value from "no tile here". Name it, skip it, keep going.
        landsBlocked[cc] = index.reason; pl.blocked = index.reason;
        continue;
      }
      pl.indexSize = index.size;
      const cellKeys = [...buckets.keys()].sort();
      for (const ck of cellKeys) {
        const [e, n] = ck.split(',').map(Number);
        const key = { e, n };
        const inTile = buckets.get(ck).filter((r) => !r._done);
        if (inTile.length === 0) continue;
        const name = ad.tileName(key);
        // `has` is sync for a parsed index and async for the per-tile S3 probe (NI); null = the probe itself failed.
        const present = await index.has(name);
        if (present === null) { tileErrors++; pl.tileErrors++; if (errorTiles.length < 10) errorTiles.push(`${cc}:${name}: existence probe failed (${index.lastReason ?? 'listing unreachable'})`); continue; }
        if (!present) { tilesNotInIndex++; pl.notInIndex++; if (notInIndexSample.length < 8) notInIndexSample.push(`${cc}:${name}`); continue; }
        if (processedTiles >= maxTiles) { tileCapHit = true; break outer; }
        const res = await fetchTileParts(cc, ad, key, index, { timeoutMs });
        if (!res.ok) { tileErrors++; pl.tileErrors++; if (errorTiles.length < 10) errorTiles.push(`${cc}:${name}: ${res.reason}`); continue; }
        processedTiles++; pl.tiles++;
        if (res.truncated) truncatedCells++;
        partsRead += res.parts.length;
        if (res.parts.length === 0) { voidTiles++; pl.voidTiles++; continue; }
        // Uniform grid over THIS tile's parts (a dense 1 km tile holds ~1–3k parts; 2 km Erfurt tiles ~9k).
        const grid = new Map();
        const gk = (E, N) => `${Math.floor(E / MATCH_GRID_M)}:${Math.floor(N / MATCH_GRID_M)}`;
        for (const b of res.parts) { const k = gk(b.E, b.N); const cell = grid.get(k); if (cell) cell.push(b); else grid.set(k, [b]); }
        const cellsCovering = (minE, minN, maxE, maxN) => {
          const acc = [];
          for (let gx = Math.floor(minE / MATCH_GRID_M); gx <= Math.floor(maxE / MATCH_GRID_M); gx++) {
            for (let gy = Math.floor(minN / MATCH_GRID_M); gy <= Math.floor(maxN / MATCH_GRID_M); gy++) {
              const cell = grid.get(`${gx}:${gy}`); if (cell) acc.push(...cell);
            }
          }
          return acc;
        };
        for (const r of inTile) {
          if (r._done) continue;
          const owned = [];
          for (const b of cellsCovering(r.minE, r.minN, r.maxE, r.maxN)) {
            if (!pointInRing(b.E, b.N, r.extNative)) continue;
            let inHole = false;
            for (const hole of r.interiorsNative) if (pointInRing(b.E, b.N, hole)) { inHole = true; break; }
            if (!inHole) owned.push(b);
          }
          let via = 'forward';
          if (owned.length === 0) {
            via = 'reverse';
            for (const b of cellsCovering(r.cx, r.cy, r.cx, r.cy)) if (pointInRing(r.cx, r.cy, b.ring)) owned.push(b);
          }
          if (owned.length === 0) continue;
          r._done = true;
          if (via === 'forward') { matchedForward++; if (owned.length > 1) multiPartFootprints++; } else matchedReverse++;
          const h = clampHeight(areaWeightedP90(owned));
          r.feat.properties = {
            ...(r.feat.properties ?? {}),
            ...nationalBuildingTags({ heightM: h, provenance: 'tagged', source: `lod2de_${cc}`, roofType: dominantRoof(owned) }),
            building: r.feat.properties?.building ?? 'yes',
            height: Number(h.toFixed(1)),
          };
          heights.push(h); pl.measured++;
        }
      }
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const blockedList = Object.keys(landsBlocked);
  const wiredLands = [...byLand.keys()];
  // §CONTEXT-DATA-HONESTY value 1 at the whole-run level — EVERY Land we tried was blocked: `blocked`, not `ok`.
  if (wiredLands.length && blockedList.length === wiredLands.length) {
    return {
      status: 'blocked', outPath, count: read.parsed, footprintCount: records.length, measuredCount: 0, perLand, landsBlocked,
      retainedFootprints: records.length, passedThroughFootprints: read.passedThrough, peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
      reason: `${label}: every Land door was unreachable — ${blockedList.map((cc) => `${cc}: ${landsBlocked[cc]}`).join('; ')}. Cannot tell "no data" from "service down". Footprints keep OSM default.`,
    };
  }
  const summary = Object.entries(perLand).map(([cc, p]) => `${cc} ${p.measured}/${p.footprints} (${p.tiles} tile${p.tiles === 1 ? '' : 's'}${p.tileErrors ? `, ${p.tileErrors} err` : ''}${p.notInIndex ? `, ${p.notInIndex} not-in-index` : ''}${p.blocked ? ', BLOCKED' : ''})`).join(' · ');
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    matchedForward, matchedReverse, multiPartFootprints, partsRead,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, errorTiles, voidTiles, tilesNotInIndex, notInIndexSample, truncatedCells, tileCapHit,
    sweepAborted, sweepAbortReason, perLand, landsBlocked, router: routerSummary(table),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `LoD2-DE per-Land measuredHeight stamped onto OSM footprints → ${measured}/${records.length} RETAINED footprint(s) got a ` +
      `MEASURED height (tagged; ${matchedForward} forward, ${matchedReverse} reverse, ${multiPartFootprints} multi-part) from ${partsRead} ` +
      `LoD2 part(s) across ${processedTiles} tile(s) in ${wiredLands.length} Land/Länder [${summary}]; ${read.passedThrough} footprint(s) ` +
      `outside the ${stampAreas.length} stamp bbox(es) / wired cities passed through with their original OSM tags` +
      `${tileErrors ? `; ${tileErrors} tile error(s)` : ''}${voidTiles ? `; ${voidTiles} void tile(s)` : ''}` +
      `${tilesNotInIndex ? `; ${tilesNotInIndex} tile(s) not in a Land index` : ''}${truncatedCells ? `; ⚠ ${truncatedCells} WFS cell(s) hit COUNT` : ''}` +
      `${blockedList.length ? `; ⛔ BLOCKED Land/Länder this run: ${blockedList.map((cc) => `${cc} (${landsBlocked[cc]})`).join(', ')}` : ''}` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} tile(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB; ${((Date.now() - t0) / 1000).toFixed(0)} s.`,
  };
}
