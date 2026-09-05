// ─────────────────────────────────────────────────────────────────────────────
// tools/context-bake/seaPolygons.mjs — §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05)
//
// THE DEFECT THIS RETIRES (L-12921 Sydney · L-12909 cause 2 Marseille · L-807 Barcelona · Melbourne ·
// Dubai). The water layer carries the sea as `natural=coastline` LINE work. tippecanoe clips every
// line to each tile, so at any client bbox a coastline that is CLOSED in OSM arrives as FRAGMENTS
// with free ends strictly inside the bbox. The client walk (§SEA-LEFT-HAND-WALK, contextWater.ts)
// honestly refuses them — "incomplete-coastline: 74 coastline end(s) inside the bbox across 65
// chains" at Dubai, 29 at Sydney — and falls back to a LIVE Overpass supplement that is slow, capped
// and often unreachable. On a baked coastal city the sea was therefore ALWAYS live, never baked.
//
// THE FIX IS BAKE-SIDE: ship the sea as closed POLYGONS. A polygon survives tile clipping CLOSED
// (tippecanoe re-closes every clipped piece along the tile edge); a line does not. No walk, no
// stitch, no orientation, no supplement — the client reads a `sea` layer of polygons and draws them.
//
// SOURCE — the OSM-derived, ODbL "water polygons" product of osmdata.openstreetmap.de: the planet
// `natural=coastline` ring closed by osmcoastline and split on a grid into closed polygons, WGS 84,
// refreshed daily. It is the SAME data the walk was reconstructing, pre-closed by the tool that
// exists for it. Probed with curl -I on 2026-09-05 (see SEA_SOURCE.probe): HTTP 200, 903,819,020 B,
// Accept-Ranges: bytes, Last-Modified the same morning; the product page names the licence (ODbL).
//
// ⛔ NOT osmcoastline over the Geofabrik country extracts: an extract boundary cuts the coastline
// ring, osmcoastline needs a closed global ring, and per-country runs produce exactly the fragments
// this module exists to remove (the SEA-MARSEILLE lane's option C, rejected there too).
//
// PIPELINE (one pass, all regions): download the zip once per bake (bake.mjs `download()`, ~904 MB)
// → extract the single .shp (+ .prj, asserted WGS 84) with the classic-zip reader below (no
// `unzip` dependency, streaming inflate) → stream the shapefile record by record → for every bake
// region whose bbox the record's own bbox touches, assemble outer/hole rings by CONTAINMENT (never by
// orientation — a misread convention would turn every sea into a "hole" and ship an honest-looking
// EMPTY layer, the §CONTEXT-DATA-HONESTY trap) → Sutherland–Hodgman clip to the region rect → write
// one RFC 7946 Polygon per outer (outer CCW, holes CW) to `<region>-sea.geojsonseq` with the tags
// {sea:'1', source:'osmdata-water-polygons'} → bake.mjs tippecanoe's them into `sea.pmtiles`
// (polygon layer, z8–z14). A region that yields ZERO polygons gets NO file: it is landlocked, or its
// bbox holds no OSM coastline — the layer is OPTIONAL end to end (bake → staging manifest → merge).
//
// WHY A SHAPEFILE READER IN NODE AND NOT ogr2ogr: the bake host runs Node; osmium/tippecanoe ride the
// Docker image, GDAL does not. One streaming pass here serves ALL regions; an ogr2ogr `-clipsrc` per
// region would read the ~700 MB .shp once PER REGION (49×). The ESRI shapefile main file is a
// 100-byte header + [8-byte record header][content] — small enough to read exactly, and every
// structural assumption is ASSERTED (file code 9994, polygon shape type, sequential record numbers,
// header file-length == bytes read) so a misparse fails BY NAME rather than yielding an empty sea.
//
// Pure except for file I/O; imported by bake.mjs and unit-tested in __tests__/seaPolygons.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────
import {
  closeSync, createReadStream, createWriteStream, existsSync, openSync, readFileSync, readSync,
  statSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { createInflateRaw } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

export const SEA_SOURCE = Object.freeze({
  id: 'osmdata-water-polygons',
  product: 'water-polygons-split-4326',
  url: 'https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip',
  page: 'https://osmdata.openstreetmap.de/data/water-polygons.html',
  licence: 'ODbL — © OpenStreetMap contributors (osmdata.openstreetmap.de/data/water-polygons.html → License)',
  crs: 'EPSG:4326',
  zipName: 'water-polygons-split-4326.zip',
  shpName: 'water_polygons.shp',
  /** curl -I, 2026-09-05 13:11 UTC, from the dev machine. Re-probe before trusting the byte count. */
  probe: Object.freeze({
    at: '2026-09-05', http: 200, bytes: 903_819_020, contentType: 'application/zip',
    acceptRanges: 'bytes', lastModified: 'Sat, 05 Sep 2026 03:41:33 GMT',
  }),
});

/** Feature tags every baked sea polygon carries — the client's defining tag is `sea`. */
export const SEA_FEATURE_TAGS = Object.freeze({ sea: '1', source: SEA_SOURCE.id });

/** `minlon,minlat,maxlon,maxlat` (the osmium `-b` order bake.mjs rows use) → `[w, s, e, n]`. */
export function parseBboxCsv(s) {
  const p = String(s).split(',').map((x) => Number(x.trim()));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) throw new Error(`bbox '${s}' is not minlon,minlat,maxlon,maxlat`);
  const [w, sth, e, n] = p;
  if (!(e > w) || !(n > sth)) throw new Error(`bbox '${s}' is not west<east, south<north`);
  return [w, sth, e, n];
}

// ── classic zip reader (central directory + one streamed entry) ──────────────
const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

/** Every entry of a classic (non-zip64) zip, from its central directory. Zip64 fails BY NAME. */
export function listZipEntries(zipPath) {
  const size = statSync(zipPath).size;
  const fd = openSync(zipPath, 'r');
  try {
    const tailLen = Math.min(size, 65_557 + 22);
    const tail = Buffer.alloc(tailLen);
    readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) { if (tail.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; } }
    if (eocd < 0) throw new Error(`${zipPath}: no end-of-central-directory record — not a zip, or truncated`);
    const entriesTotal = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (entriesTotal === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error(`${zipPath}: zip64 central directory — this reader handles classic zips only (the osmdata archive was `
        + `${SEA_SOURCE.probe.bytes} B, classic, on ${SEA_SOURCE.probe.at}). Unzip it by hand and point the bake at the .shp.`);
    }
    const cd = Buffer.alloc(cdSize);
    if (readSync(fd, cd, 0, cdSize, cdOffset) !== cdSize) throw new Error(`${zipPath}: central directory truncated`);
    const entries = [];
    let p = 0;
    for (let i = 0; i < entriesTotal; i++) {
      if (cd.readUInt32LE(p) !== SIG_CEN) throw new Error(`${zipPath}: central directory entry ${i} has a bad signature`);
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localHeaderOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (csize === 0xffffffff || usize === 0xffffffff || localHeaderOffset === 0xffffffff) {
        throw new Error(`${zipPath}: entry '${name}' carries zip64 sizes — classic zips only`);
      }
      entries.push({ name, method, csize, usize, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally { closeSync(fd); }
}

/** Stream ONE entry (stored or deflate) to `destPath`; asserts the byte count the directory declares. */
export async function extractZipEntry(zipPath, entry, destPath) {
  const fd = openSync(zipPath, 'r');
  let dataStart;
  try {
    const loc = Buffer.alloc(30);
    readSync(fd, loc, 0, 30, entry.localHeaderOffset);
    if (loc.readUInt32LE(0) !== SIG_LOC) throw new Error(`${zipPath}: '${entry.name}' local header signature mismatch`);
    dataStart = entry.localHeaderOffset + 30 + loc.readUInt16LE(26) + loc.readUInt16LE(28);
  } finally { closeSync(fd); }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`${zipPath}: '${entry.name}' uses compression method ${entry.method} (only stored=0 / deflate=8 are read)`);
  }
  if (entry.csize === 0) {
    writeFileSync(destPath, '');
  } else {
    const src = createReadStream(zipPath, { start: dataStart, end: dataStart + entry.csize - 1 });
    const dst = createWriteStream(destPath);
    if (entry.method === 8) await pipeline(src, createInflateRaw(), dst);
    else await pipeline(src, dst);
  }
  const got = statSync(destPath).size;
  if (got !== entry.usize) throw new Error(`${destPath}: extracted ${got} B but the zip directory says ${entry.usize} B`);
  return got;
}

/**
 * Pull the product's single `.shp` (+ its `.prj`) out of the osmdata zip into `outDir` as
 * `water_polygons.shp` / `.prj`. The .prj is REQUIRED and must read as WGS 84 — the bake feeds these
 * coordinates to tippecanoe as lon/lat, so a projected file would tile the sea onto the wrong planet.
 */
export async function extractSeaShapefile(zipPath, outDir) {
  const entries = listZipEntries(zipPath);
  const shps = entries.filter((e) => e.name.toLowerCase().endsWith('.shp'));
  if (shps.length !== 1) {
    throw new Error(`${zipPath}: expected exactly ONE .shp entry, found ${shps.length} [${shps.map((e) => e.name).join(', ')}]`);
  }
  const shpEntry = shps[0];
  const stem = shpEntry.name.slice(0, -4).toLowerCase();
  const prjEntry = entries.find((e) => e.name.toLowerCase() === `${stem}.prj`);
  if (!prjEntry) throw new Error(`${zipPath}: '${shpEntry.name}' has no .prj beside it — cannot PROVE the CRS is WGS 84; refusing to guess`);
  const shpOut = join(outDir, SEA_SOURCE.shpName);
  const prjOut = shpOut.slice(0, -4) + '.prj';
  await extractZipEntry(zipPath, prjEntry, prjOut);
  const wkt = readFileSync(prjOut, 'utf8');
  if (!/WGS[_ ]?(19)?84/i.test(wkt) || /PROJCS/i.test(wkt)) {
    throw new Error(`${prjEntry.name}: CRS is not geographic WGS 84 — '${wkt.slice(0, 96)}…'`);
  }
  await extractZipEntry(zipPath, shpEntry, shpOut);
  return { shp: shpOut, prj: prjOut, bytes: statSync(shpOut).size, entry: shpEntry.name, wkt };
}

// ── ESRI shapefile (.shp) polygon records, streamed ──────────────────────────
const SHP_POLYGON_TYPES = new Set([5, 15, 25]); // Polygon, PolygonZ, PolygonM — points sit at the same offset in all three.

/**
 * Yield `{ recordNumber, bbox:[minx,miny,maxx,maxy], rings:[[x,y]…][] }` per non-null record.
 * Every structural assumption is asserted; a misparse throws by name (it never yields "nothing").
 */
export function* readShpPolygons(shpPath) {
  const fd = openSync(shpPath, 'r');
  try {
    const head = Buffer.alloc(100);
    if (readSync(fd, head, 0, 100, 0) !== 100) throw new Error(`${shpPath}: shorter than the 100-byte shapefile header`);
    const code = head.readInt32BE(0);
    if (code !== 9994) throw new Error(`${shpPath}: file code ${code} ≠ 9994 — not an ESRI shapefile`);
    const fileType = head.readInt32LE(32);
    if (!SHP_POLYGON_TYPES.has(fileType)) throw new Error(`${shpPath}: shape type ${fileType} is not Polygon/PolygonZ/PolygonM (5/15/25)`);
    const declaredBytes = head.readInt32BE(24) * 2;
    const rh = Buffer.alloc(8);
    let pos = 100;
    let expectNo = 1;
    for (;;) {
      const n = readSync(fd, rh, 0, 8, pos);
      if (n === 0) break;
      if (n < 8) throw new Error(`${shpPath}: truncated record header at byte ${pos}`);
      const recNo = rh.readInt32BE(0);
      const contentBytes = rh.readInt32BE(4) * 2;
      if (recNo !== expectNo) throw new Error(`${shpPath}: record ${recNo} at byte ${pos}, expected ${expectNo} — misparse or corrupt file`);
      if (contentBytes < 4) throw new Error(`${shpPath}: record ${recNo} content is ${contentBytes} B`);
      const body = Buffer.alloc(contentBytes);
      if (readSync(fd, body, 0, contentBytes, pos + 8) !== contentBytes) throw new Error(`${shpPath}: truncated record ${recNo}`);
      pos += 8 + contentBytes;
      expectNo++;
      const shapeType = body.readInt32LE(0);
      if (shapeType === 0) continue; // Null shape — legal, carries nothing.
      if (shapeType !== fileType) throw new Error(`${shpPath}: record ${recNo} shape type ${shapeType} ≠ file type ${fileType}`);
      const bbox = [body.readDoubleLE(4), body.readDoubleLE(12), body.readDoubleLE(20), body.readDoubleLE(28)];
      const numParts = body.readInt32LE(36);
      const numPoints = body.readInt32LE(40);
      const partsOff = 44;
      const pointsOff = partsOff + 4 * numParts;
      if (pointsOff + 16 * numPoints > contentBytes) throw new Error(`${shpPath}: record ${recNo} declares ${numParts} part(s)/${numPoints} point(s) beyond its ${contentBytes} B`);
      const rings = [];
      for (let p = 0; p < numParts; p++) {
        const start = body.readInt32LE(partsOff + 4 * p);
        const end = p + 1 < numParts ? body.readInt32LE(partsOff + 4 * (p + 1)) : numPoints;
        if (!(end > start)) throw new Error(`${shpPath}: record ${recNo} part ${p} is empty or unordered (${start}..${end})`);
        const ring = new Array(end - start);
        for (let i = start, k = 0; i < end; i++, k++) {
          const o = pointsOff + 16 * i;
          ring[k] = [body.readDoubleLE(o), body.readDoubleLE(o + 8)];
        }
        rings.push(ring);
      }
      yield { recordNumber: recNo, bbox, rings };
    }
    if (declaredBytes !== pos) {
      throw new Error(`${shpPath}: header declares ${declaredBytes} B but ${pos} B were walked — truncated file or misparse`);
    }
  } finally { closeSync(fd); }
}

// ── geometry ────────────────────────────────────────────────────────────────
/** Shoelace signed area of an [x,y] loop: > 0 ⇔ counter-clockwise (x east, y north). */
export function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

/** Even-odd point-in-ring. */
export function pointInRing(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function rectsIntersect(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * Sutherland–Hodgman clip of one closed loop against `[w,s,e,n]`. Returns a CLOSED loop (first ==
 * last) with ≥ 4 vertices, or `null` when nothing survives. Orientation is preserved. A loop that
 * fully contains the rect yields the rect itself — the whole region is sea, which is the truth.
 */
export function clipRingToRect(ring, rect) {
  const [w, s, e, n] = rect;
  let pts = ring;
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  const edges = [
    { inside: (p) => p[0] >= w, cross: (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= e, cross: (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= s, cross: (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s] },
    { inside: (p) => p[1] <= n, cross: (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n] },
  ];
  let out = pts;
  for (const edge of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    let prev = input[input.length - 1];
    let prevIn = edge.inside(prev);
    for (const cur of input) {
      const curIn = edge.inside(cur);
      if (curIn) {
        if (!prevIn) out.push(edge.cross(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(edge.cross(prev, cur));
      }
      prev = cur;
      prevIn = curIn;
    }
  }
  const dd = [];
  for (const p of out) {
    const q = dd[dd.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) dd.push(p);
  }
  while (dd.length > 1 && dd[0][0] === dd[dd.length - 1][0] && dd[0][1] === dd[dd.length - 1][1]) dd.pop();
  if (dd.length < 3) return null;
  if (Math.abs(signedArea(dd)) === 0) return null;
  dd.push(dd[0]);
  return dd;
}

function ringProbe(ring) {
  // A vertex, not a centroid: a vertex of a hole lies ON the hole, and strictly inside its host outer
  // whenever the hole is a real island (island coasts do not touch the cell's water boundary).
  return ring[0];
}

/**
 * Group one record's rings into `{ outer, holes[] }` polygons by CONTAINMENT DEPTH, never by
 * orientation: a ring inside an even number of other rings is an outer; one inside an odd number is a
 * hole of the smallest outer that contains it. `stats.outersCw` counts how many outers were clockwise
 * so the bake can SAY whether the file follows the ESRI convention, instead of depending on it.
 */
export function assemblePolygons(rings, stats = { holesDropped: 0, outers: 0, outersCw: 0 }) {
  const info = rings.map((r) => ({ ring: r, area: Math.abs(signedArea(r)), cw: signedArea(r) < 0, depth: 0 }));
  for (let i = 0; i < info.length; i++) {
    if (info[i].area === 0) { info[i].depth = -1; continue; }
    const probe = ringProbe(info[i].ring);
    for (let j = 0; j < info.length; j++) {
      if (i === j || info[j].area <= info[i].area) continue; // only a LARGER ring can contain this one
      if (pointInRing(probe, info[j].ring)) info[i].depth++;
    }
  }
  const outers = info.filter((x) => x.depth >= 0 && x.depth % 2 === 0).map((x) => ({ outer: x.ring, area: x.area, cw: x.cw, holes: [] }));
  stats.outers += outers.length;
  stats.outersCw += outers.filter((o) => o.cw).length;
  for (const h of info) {
    if (h.depth < 0 || h.depth % 2 === 0) continue;
    const probe = ringProbe(h.ring);
    let host = null;
    for (const o of outers) {
      if (o.area <= h.area || !pointInRing(probe, o.outer)) continue;
      if (!host || o.area < host.area) host = o;
    }
    if (host) host.holes.push(h.ring); else stats.holesDropped++;
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }));
}

const r7 = (v) => Math.round(v * 1e7) / 1e7;

/**
 * Clip one assembled polygon to `rect` → RFC 7946 coordinates (`[outer CCW, ...holes CW]`, 7-dp),
 * or `null` when the outer does not survive. Holes are clipped by the same rect (a hole that leaves
 * the rect simply disappears); a hole whose outer vanished goes with it.
 */
export function clipAssembledPolygon(poly, rect) {
  const outer = clipRingToRect(poly.outer, rect);
  if (!outer) return null;
  const ccw = (ring) => (signedArea(ring) < 0 ? ring.slice().reverse() : ring);
  const cw = (ring) => (signedArea(ring) > 0 ? ring.slice().reverse() : ring);
  const coords = [ccw(outer).map(([x, y]) => [r7(x), r7(y)])];
  for (const h of poly.holes) {
    const c = clipRingToRect(h, rect);
    if (c) coords.push(cw(c).map(([x, y]) => [r7(x), r7(y)]));
  }
  return coords;
}

/**
 * ONE pass over the shapefile, writing `<region>.out` GeoJSONSeq (one Feature per line, no RS
 * separator — tippecanoe reads both) for every region whose rect the record touches. A region with
 * zero polygons gets NO file (a stale one from a previous run is removed) — the layer is optional and
 * "no sea here" must never be represented by an empty-but-present artefact.
 *
 * @param {string} shpPath
 * @param {Array<{ name: string, bbox: [number,number,number,number], out: string }>} regions
 * @returns {{ regions: Array<{ name, bbox, out, polygons, holes, vertices }>, stats }}
 */
export function clipWaterPolygonsToRegions(shpPath, regions) {
  const out = regions.map((r) => ({ name: r.name, bbox: r.bbox, out: r.out, polygons: 0, holes: 0, vertices: 0, fd: null }));
  for (const o of out) if (existsSync(o.out)) unlinkSync(o.out);
  const stats = { records: 0, touched: 0, outers: 0, outersCw: 0, holesDropped: 0, features: 0 };
  let id = 0;
  try {
    for (const rec of readShpPolygons(shpPath)) {
      stats.records++;
      const hits = out.filter((o) => rectsIntersect(rec.bbox, o.bbox));
      if (hits.length === 0) continue;
      stats.touched++;
      const assembled = assemblePolygons(rec.rings, stats);
      for (const o of hits) {
        for (const poly of assembled) {
          const coords = clipAssembledPolygon(poly, o.bbox);
          if (!coords) continue;
          if (o.fd === null) o.fd = openSync(o.out, 'w');
          id++;
          const feature = {
            type: 'Feature', id,
            properties: { ...SEA_FEATURE_TAGS, osmdata_rec: rec.recordNumber },
            geometry: { type: 'Polygon', coordinates: coords },
          };
          writeSync(o.fd, JSON.stringify(feature) + '\n');
          o.polygons++;
          o.holes += coords.length - 1;
          o.vertices += coords.reduce((a, r) => a + r.length, 0);
          stats.features++;
        }
      }
    }
  } finally {
    for (const o of out) if (o.fd !== null) { closeSync(o.fd); o.fd = null; }
  }
  for (const o of out) if (o.polygons === 0 && existsSync(o.out)) unlinkSync(o.out);
  return { regions: out.map(({ fd: _fd, ...rest }) => rest), stats };
}
