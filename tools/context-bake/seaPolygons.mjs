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
  /**
   * curl -I, 2026-09-06 06:12 UTC, from the dev machine. ⚠ THE BYTE COUNT IS NOT STABLE — the product
   * is rebuilt DAILY, and this number moved 903,819,020 → 903,852,707 in the ~17 h between the
   * 09-05 probe and this one. Never assert it; re-probe. It is recorded to say what was actually
   * fetched on the day the reader was proven against it, not as an expectation.
   */
  probe: Object.freeze({
    at: '2026-09-06', http: 200, bytes: 903_852_707, contentType: 'application/zip',
    acceptRanges: 'bytes', lastModified: 'Sun, 06 Sep 2026 03:40:56 GMT',
    etag: '"35dfb2a3-65ac844efb524"',
    sha256: '9ddbe2466a406ab3db3c09ed89a8d609b5a3fe207d2b80191b229f4c0bc32f45',
  }),
});

/**
 * §SEA-REAL-PRODUCT (lane SEA-BAKE, 2026-09-06) — the FIRST run of this module against the REAL
 * product. Until this date every structural assumption above was proven only against the synthetic
 * shapefile in `__tests__/seaPolygons.spec.ts`; a fixture built from the header cannot falsify the
 * header, so "the reader parses the real bytes" was UNMEASURED. It is now measured, and every
 * assertion the reader makes held on the real archive:
 *
 *   · classic zip, NOT zip64 — no zip64 sentinel in the EOCD, no zip64 EOCD locator, no 0x0001
 *     extra field on any entry. 6 entries, central directory 676 B at offset 903,852,009.
 *   · EXACTLY ONE .shp: `water-polygons-split-4326/water_polygons.shp`, method 8 (deflate),
 *     903,546,881 B compressed → 1,275,373,628 B uncompressed. `.dbf`/`.shx`/`.cpg`/`.prj`/
 *     `README.txt` are the other five. The directory PREFIX in the entry name is why the `.prj`
 *     is resolved by stem and not by basename.
 *   · `.prj` = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",…]]`, 145 chars — matches the WGS-84
 *     assertion and carries no PROJCS, so the geographic-CRS refusal stays silent on the real file.
 *   · shapefile header: file code 9994 · version 1000 · shape type 5 (Polygon) · declared length
 *     637,686,814 words = 1,275,373,628 B == the zip directory's uncompressed size · global bbox
 *     [-180, -78.7385903, 180, 90]. Record numbers are sequential from 1.
 *   · 53,328 records. Ring assembly BY CONTAINMENT was the right call and is now evidenced: all
 *     225 touched outers came back CLOCKWISE (`outersCw` 225/225), i.e. the file follows the ESRI
 *     convention — but the code never depended on it, and 0 holes were dropped for want of a host.
 *   · cost, dev machine, 4 regions in ONE pass: extract 384 s (1.28 GB written), clip 105 s,
 *     peak RSS 315 MB. Streaming holds: the pass is bounded by the largest single record, not by
 *     the 1.28 GB file.
 *   · yield: newsouthwales 40 polygons/273 holes/72,318 verts · victoria 35/214/64,718 ·
 *     dubai 24/255/29,700 · france 131/9,038/1,150,967 (26.9 MB of GeoJSONSeq).
 */
export const SEA_REAL_RUN = Object.freeze({
  at: '2026-09-06',
  records: 53_328, shpBytes: 1_275_373_628, shapeType: 5, fileCode: 9994,
  zipEntries: 6, zip64: false, shpEntry: 'water-polygons-split-4326/water_polygons.shp',
  globalBbox: Object.freeze([-180, -78.7385903, 180, 90]),
  outers: 225, outersClockwise: 225, holesDropped: 0,
  extractSeconds: 384, clipSeconds: 105, peakRssMb: 315,
});

/**
 * ⛔ §SEA-COVERS-COASTLINE-ONLY — WHAT THIS LAYER DOES **NOT** COVER, measured 2026-09-06.
 *
 * This product is derived from `natural=coastline` and NOTHING else. Where OSM does not draw a
 * coastline, there is no sea here — and that is not a gap in the bake, it is the definition of the
 * source. It matters because it means the `sea` layer does NOT fix every city the lane was aimed at:
 *
 *   ✔ FIXED by this layer (verified against the real product, point-in-polygon):
 *       · Dubai / Palm Jumeirah — the Gulf is one outer with the Palm's reclaimed land as ISLAND
 *         HOLES; the trunk centreline (55.1390, 25.1130) and Atlantis on the crescent
 *         (55.1170, 25.1304) both resolve to a hole, the water between the fronds to sea.
 *       · Marseille — the Vieux-Port basin (5.3690, 43.2951) is inside the sea outer (L-12909 c2).
 *       · Melbourne — mid Port Phillip Bay (144.9000, -37.9800) is inside the sea outer.
 *
 *   ✖ NOT FIXED — Sydney / Cremorne Point (L-12921). Sydney Harbour carries NO coastline at all, so
 *     it is absent from this product BY CONSTRUCTION. Measured: the westernmost sea longitude at
 *     lat -33.83 and -33.85 is 151.288 — the open Tasman off the Heads. Cremorne Point
 *     (151.2320, -33.8455) and the water beside it (151.2300, -33.8450) are inside NO sea polygon.
 *     INDEPENDENT source (Overpass, 2026-09-06, osm_base 2026-09-06T06:45:35Z): `natural=coastline`
 *     ways in (-33.870,151.180,-33.830,151.280) → **0**; in the ocean box just outside the Heads
 *     (-33.860,151.280,-33.800,151.320) → **18**, so the query is sound and the zero is real.
 *     Port Jackson is mapped as `natural=water` + `water=harbour` MULTIPOLYGON RELATIONS
 *     ("Port Jackson" Q54504, "Sydney Harbour", "Parramatta River", "Lane Cove River") — 127 ways
 *     + 8 relations in that box. That is `water` layer material (`nwr/natural=water` already), NOT
 *     sea material.
 *
 *     ⚠ AND IT SILENTLY DISENGAGES THE ESCAPE HATCH. Once `sea.pmtiles` publishes, a Cremorne Point
 *     bbox DOES contain sea polygons (the ocean off the Heads), so `waterFromTileFeatures` takes
 *     `seaProvenance: 'baked-polygons'` and skips the walk — and the §FIX-SEA-COVERAGE-GATE does not
 *     fire either, because the sea covers **23.5 %** of the 0.20° bbox around Cremorne Point against
 *     a `SEA_COVERAGE_MIN` of 2 %. This is NOT a regression (the live supplement queries
 *     `natural=coastline` too, so it never painted the harbour either — which is why L-12921
 *     survived every previous sea fix), but it does mean L-12921 must NOT be closed by this bake.
 *     The harbour is a `water`-layer question: whether `nwr/natural=water` multipolygon RELATIONS
 *     survive the osmium export and reach the client as drawn water.
 */
export const SEA_NOT_COVERED = Object.freeze({
  reason: 'coastline-derived: no OSM natural=coastline ⇒ no sea polygon',
  knownGaps: Object.freeze([
    Object.freeze({
      place: 'Sydney Harbour / Port Jackson', issue: 'L-12921',
      site: Object.freeze([151.2320, -33.8455]),
      westernmostSeaLon: 151.288,
      coastlineWaysInside: 0, coastlineWaysOutsideTheHeads: 18,
      mappedAs: 'natural=water + water=harbour multipolygon relations',
      belongsToLayer: 'water',
    }),
  ]),
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
