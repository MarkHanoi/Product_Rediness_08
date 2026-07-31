#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROBE V8 — what is the POSTING SPACING (ground sample distance) of the terrain
// we actually hold under Barcelona?  (Phase 3 deciding probes, GEOGRAPHIC-ROLLOUT
// -MASTER-TRACKER §3.)
//
// WHY IT MATTERS. Phase 5 / L-584 says the rasant must be measured at the FAÇADE,
// not at the block CENTROID. A follow-up probe (V6) would measure the elevation
// delta between those two points. If the terrain posting is coarser than a street,
// centroid and façade land inside the SAME cell, V6 measures ~0, and the rasant
// question gets closed FALSELY — for instrumental reasons. This probe measures the
// instrument BEFORE the instrument is used. Sibling failure: the L-581 retraction,
// where every aggregate looked healthy while the geometry was wrong by 12×.
//
// THREE INDEPENDENT MEASUREMENTS (deliberately not one method three times):
//   M1  what we SERVE   — decode the real quantized-mesh tiles from R2 and measure
//                         the empirical vertex spacing in metres.
//   M2  what we FETCH   — read the source PNOA GeoTIFF's own ModelPixelScale tag
//                         (hand-rolled TIFF header reader, no deps) → native GSD.
//   M3  what the SERVER declares — WCS 2.0.1 DescribeCoverage GridSpacing/offsets.
//
// M1 measures the product; M2/M3 measure the input. If M1 is coarser than M2 the
// loss is OURS (bake config); if M2 is already coarser than a street the loss is
// the SOURCE's. The distinction decides whether Phase 5 is a config change or a
// data-acquisition programme.
//
// USAGE
//   node tools/phase3-probes/probe-v8-terrain-posting.mjs            # all three
//   node tools/phase3-probes/probe-v8-terrain-posting.mjs --m1       # served tiles only
//   node tools/phase3-probes/probe-v8-terrain-posting.mjs --m2       # source raster only
//   node tools/phase3-probes/probe-v8-terrain-posting.mjs --m3       # DescribeCoverage only
//   node tools/phase3-probes/probe-v8-terrain-posting.mjs --json     # machine-readable
//
// NO DEPENDENCIES. Pure node:fetch + a minimal quantized-mesh vertex decoder and a
// minimal TIFF tag reader, both implemented in-file so this is rerunnable on any box.
//
// §CONTEXT-DATA-HONESTY: every fetch reports its HTTP status, byte count and
// content-type. A 200 with a short/garbled body is reported as such, never as an
// absence — a bulk endpoint returning HTTP 200 with a payload cut mid-field is a
// live, observed failure mode in this repo.
// ─────────────────────────────────────────────────────────────────────────────

const TILES_BASE = process.env.PRYZM_TILES_BASE
  ?? 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
const CITY = 'barcelona';

// A REAL Eixample reference point: Carrer de Mallorca / Pau Claris area (the parcel
// family the envelope work is measured on). Used to pick the tile and to place the
// street-resolution transect.
const REF = { lon: 2.1637, lat: 41.3948, name: 'Eixample — Pau Claris / C. de Mallorca' };

// The Eixample block module is 113.3 m of built block + a 20 m street (Cerdà, 1859).
// This is the FEATURE the terrain is required to resolve.
const EIXAMPLE_STREET_WIDTH_M = 20;
const EIXAMPLE_BLOCK_PITCH_M = 133.3;

const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

const args = process.argv.slice(2);
const want = (f) => args.includes(f);
const runAll = !want('--m1') && !want('--m2') && !want('--m3') && !want('--m4');
const asJson = want('--json');
const out = { probe: 'V8', city: CITY, ranAt: new Date().toISOString(), fetchLog: [], m1: null, m2: null, m3: null };

const log = (...a) => { if (!asJson) console.log(...a); };

// ── honest fetch: always report status + bytes + content-type ────────────────
async function fetchRaw(url, { accept, timeoutMs = 90_000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const entry = { url: url.length > 260 ? `${url.slice(0, 260)}…` : url };
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: accept ? { accept } : {} });
    const ab = await res.arrayBuffer();
    entry.status = res.status;
    entry.bytes = ab.byteLength;
    entry.contentType = res.headers.get('content-type') ?? '';
    entry.contentEncoding = res.headers.get('content-encoding') ?? '';
    out.fetchLog.push(entry);
    return { ok: res.ok, status: res.status, buf: Buffer.from(ab), contentType: entry.contentType };
  } catch (e) {
    entry.status = 'ERROR';
    entry.error = String(e?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e);
    out.fetchLog.push(entry);
    return { ok: false, status: 'ERROR', buf: Buffer.alloc(0), contentType: '', error: entry.error };
  }
}

// ── stats helper — never a bare mean; the brief asks for distributions ───────
function dist(arr) {
  const a = [...arr].filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = (p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  return {
    n: a.length,
    min: +a[0].toFixed(3),
    p05: +q(0.05).toFixed(3),
    p25: +q(0.25).toFixed(3),
    median: +q(0.5).toFixed(3),
    p75: +q(0.75).toFixed(3),
    p95: +q(0.95).toFixed(3),
    max: +a[a.length - 1].toFixed(3),
    mean: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// M1 — WHAT WE SERVE. Decode the real quantized-mesh tiles.
//
// Cesium quantized-mesh-1.0 layout (the part we need):
//   QuantizedMeshHeader, 88 bytes:
//     center x,y,z        3 × float64  (24)
//     minimumHeight        float32      (4)
//     maximumHeight        float32      (4)
//     boundingSphere x,y,z,r 4 × float64 (32)
//     horizonOcclusionPoint x,y,z 3 × float64 (24)
//   VertexData:
//     vertexCount uint32
//     u[]      uint16 × count, ZIGZAG deltas
//     v[]      uint16 × count, ZIGZAG deltas
//     height[] uint16 × count, ZIGZAG deltas
//   IndexData (16-bit when vertexCount ≤ 65536):
//     triangleCount uint32, then 3×triangleCount indices, HIGH-WATER-MARK encoded.
//
// u,v are 0..32767 across the tile rectangle. We only need u,v to measure spacing,
// so the decoder stops after VertexData + (optionally) the index block.
// ═══════════════════════════════════════════════════════════════════════════
const unzig = (n) => (n >> 1) ^ -(n & 1);

function decodeQuantizedMesh(buf) {
  if (buf.length < 92) return { error: `too short: ${buf.length} bytes (header alone is 88)` };
  let o = 0;
  const header = {
    centerX: buf.readDoubleLE(0), centerY: buf.readDoubleLE(8), centerZ: buf.readDoubleLE(16),
    minimumHeight: buf.readFloatLE(24), maximumHeight: buf.readFloatLE(28),
    bsRadius: buf.readDoubleLE(56),
  };
  o = 88;
  const vertexCount = buf.readUInt32LE(o); o += 4;
  if (vertexCount <= 0 || vertexCount > 5_000_000) return { error: `implausible vertexCount ${vertexCount}` };
  const need = 88 + 4 + vertexCount * 6;
  if (buf.length < need) return { error: `truncated: ${buf.length} bytes, need ≥ ${need} for ${vertexCount} vertices` };
  const u = new Uint16Array(vertexCount);
  const v = new Uint16Array(vertexCount);
  const h = new Uint16Array(vertexCount);
  let acc = 0;
  for (let i = 0; i < vertexCount; i++) { acc += unzig(buf.readUInt16LE(o)); o += 2; u[i] = acc; }
  acc = 0;
  for (let i = 0; i < vertexCount; i++) { acc += unzig(buf.readUInt16LE(o)); o += 2; v[i] = acc; }
  acc = 0;
  for (let i = 0; i < vertexCount; i++) { acc += unzig(buf.readUInt16LE(o)); o += 2; h[i] = acc; }

  // IndexData — align to the index size, then high-water-mark decode.
  const wide = vertexCount > 65536;
  const isz = wide ? 4 : 2;
  if (o % isz !== 0) o += isz - (o % isz);
  let triangles = null;
  if (o + 4 <= buf.length) {
    const triangleCount = buf.readUInt32LE(o); o += 4;
    const nIdx = triangleCount * 3;
    if (triangleCount > 0 && triangleCount < 5_000_000 && o + nIdx * isz <= buf.length) {
      triangles = new Uint32Array(nIdx);
      let highest = 0;
      for (let i = 0; i < nIdx; i++) {
        const code = wide ? buf.readUInt32LE(o) : buf.readUInt16LE(o); o += isz;
        triangles[i] = highest - code;
        if (code === 0) highest++;
      }
    }
  }
  return { header, vertexCount, u, v, h, triangles, bytes: buf.length };
}

/** Geographic (2×1 root) TMS tile rect in degrees. y counts NORTHWARD from -90. */
function tileRectDeg(z, x, y) {
  const size = 180 / 2 ** z;
  return { west: -180 + x * size, south: -90 + y * size, east: -180 + (x + 1) * size, north: -90 + (y + 1) * size, size };
}
function tileForLonLat(z, lon, lat) {
  const size = 180 / 2 ** z;
  return { x: Math.floor((lon + 180) / size), y: Math.floor((lat + 90) / size) };
}

/**
 * The GRID STEP recovered EMPIRICALLY from the quantised u/v values.
 *
 * ⚠ This is the load-bearing anti-assumption measurement. The bake config says
 * gridSize=257; this does NOT read the config — it reads the shipped bytes and
 * recovers the step from the data. If the two disagree, the bytes win.
 * Method: take every distinct u value in the tile, sort, and take the MODE of the
 * consecutive differences (the mode, not the min — a single stray value would
 * corrupt a min).
 */
function recoverQuantStep(vals) {
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  if (uniq.length < 3) return null;
  const diffs = [];
  for (let i = 1; i < uniq.length; i++) diffs.push(uniq[i] - uniq[i - 1]);
  const counts = new Map();
  for (const d of diffs) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best = null, bestN = 0;
  for (const [d, n] of counts) if (n > bestN) { best = d; bestN = n; }
  return { distinctValues: uniq.length, modeStep: best, modeCount: bestN, totalDiffs: diffs.length };
}

async function runM1() {
  log('\n══ M1 — WHAT WE SERVE: decode the real quantized-mesh tiles from R2 ══');
  const base = `${TILES_BASE}terrain/${CITY}/`;
  const lj = await fetchRaw(`${base}layer.json`, { accept: 'application/json' });
  if (!lj.ok) { out.m1 = { error: `layer.json HTTP ${lj.status}` }; log(`  layer.json → HTTP ${lj.status} — ABORT`); return; }
  let layer;
  try { layer = JSON.parse(lj.buf.toString('utf8')); }
  catch (e) { out.m1 = { error: `layer.json unparseable (${lj.buf.length} bytes): ${e}` }; return; }

  const maxzoom = layer.maxzoom;
  log(`  layer.json      HTTP 200, ${lj.buf.length} B — format=${layer.format} scheme=${layer.scheme} minzoom=${layer.minzoom} maxzoom=${maxzoom}`);
  log(`  bounds          [${layer.bounds.map((n) => n.toFixed(4)).join(', ')}]`);
  log(`  extensions      ${JSON.stringify(layer.extensions ?? [])}`);

  const t = tileForLonLat(maxzoom, REF.lon, REF.lat);
  const rect = tileRectDeg(maxzoom, t.x, t.y);
  const cLat = (rect.south + rect.north) / 2;
  const tileWm = (rect.east - rect.west) * mPerDegLon(cLat);
  const tileHm = (rect.north - rect.south) * M_PER_DEG_LAT;
  log(`  finest tile     z${maxzoom}/${t.x}/${t.y} covering ${REF.name}`);
  log(`                  rect ${rect.west.toFixed(5)},${rect.south.toFixed(5)} → ${rect.east.toFixed(5)},${rect.north.toFixed(5)}`);
  log(`                  = ${tileWm.toFixed(0)} m E–W × ${tileHm.toFixed(0)} m N–S`);

  const tr = await fetchRaw(`${base}${maxzoom}/${t.x}/${t.y}.terrain`, { accept: 'application/vnd.quantized-mesh' });
  if (!tr.ok) { out.m1 = { error: `tile HTTP ${tr.status}`, maxzoom }; log(`  tile → HTTP ${tr.status} — ABORT`); return; }
  const m = decodeQuantizedMesh(tr.buf);
  if (m.error) { out.m1 = { error: `decode: ${m.error}`, maxzoom }; log(`  DECODE FAILED: ${m.error}`); return; }

  log(`  tile bytes      ${tr.buf.length}  → vertices ${m.vertexCount}  triangles ${m.triangles ? m.triangles.length / 3 : 'n/d'}`);
  log(`  height range    ${m.header.minimumHeight.toFixed(2)} … ${m.header.maximumHeight.toFixed(2)} m (ellipsoidal)`);

  // (a) the recovered quantisation lattice — what grid the vertices are allowed to sit on
  const stepU = recoverQuantStep(Array.from(m.u));
  const stepV = recoverQuantStep(Array.from(m.v));
  const uvFull = 32767;
  const latticeXm = stepU?.modeStep ? (stepU.modeStep / uvFull) * tileWm : null;
  const latticeYm = stepV?.modeStep ? (stepV.modeStep / uvFull) * tileHm : null;
  log('\n  (a) RECOVERED QUANTISATION LATTICE (from the shipped bytes, not from the bake config)');
  log(`      u: ${stepU?.distinctValues} distinct values, modal step ${stepU?.modeStep}/32767  (${stepU?.modeCount}/${stepU?.totalDiffs} of the gaps)`);
  log(`      v: ${stepV?.distinctValues} distinct values, modal step ${stepV?.modeStep}/32767  (${stepV?.modeCount}/${stepV?.totalDiffs} of the gaps)`);
  log(`      ⇒ finest lattice cell the format can express here: ${latticeXm?.toFixed(1)} m (E–W) × ${latticeYm?.toFixed(1)} m (N–S)`);
  const impliedGrid = stepU?.modeStep ? Math.round(uvFull / stepU.modeStep) + 1 : null;
  log(`      ⇒ implied source grid ≈ ${impliedGrid}×${impliedGrid} samples per tile`);

  // (b) the ACTUAL vertex spacing — a TIN is adaptive, so the lattice is a FLOOR, not the answer
  const px = new Float64Array(m.vertexCount);
  const py = new Float64Array(m.vertexCount);
  for (let i = 0; i < m.vertexCount; i++) {
    px[i] = (m.u[i] / uvFull) * tileWm;
    py[i] = (m.v[i] / uvFull) * tileHm;
  }
  // nearest-neighbour distance, brute force over a capped sample (rerunnable on any box)
  const SAMPLE_CAP = 4000;
  const stride = Math.max(1, Math.floor(m.vertexCount / SAMPLE_CAP));
  const nn = [];
  for (let i = 0; i < m.vertexCount; i += stride) {
    let best = Infinity;
    for (let j = 0; j < m.vertexCount; j++) {
      if (j === i) continue;
      const dx = px[i] - px[j], dy = py[i] - py[j];
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    if (Number.isFinite(best)) nn.push(Math.sqrt(best));
  }
  const nnDist = dist(nn);
  log('\n  (b) MEASURED NEAREST-NEIGHBOUR VERTEX SPACING (metres, TIN is adaptive)');
  log(`      n=${nnDist.n} sampled of ${m.vertexCount} vertices (stride ${stride})`);
  log(`      min ${nnDist.min} · p05 ${nnDist.p05} · p25 ${nnDist.p25} · MEDIAN ${nnDist.median} · p75 ${nnDist.p75} · p95 ${nnDist.p95} · max ${nnDist.max}`);

  // (c) TIN edge lengths — the true "how far apart is the nearest independent height"
  let edgeDist = null;
  if (m.triangles) {
    const seen = new Set();
    const edges = [];
    for (let t3 = 0; t3 + 2 < m.triangles.length; t3 += 3) {
      const a = m.triangles[t3], b = m.triangles[t3 + 1], c = m.triangles[t3 + 2];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = p < q ? p * 1e7 + q : q * 1e7 + p;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push(Math.hypot(px[p] - px[q], py[p] - py[q]));
      }
    }
    edgeDist = dist(edges);
    log('\n  (c) MEASURED TIN EDGE LENGTHS (metres) — the real spacing between independent heights');
    log(`      n=${edgeDist.n} unique edges`);
    log(`      min ${edgeDist.min} · p05 ${edgeDist.p05} · p25 ${edgeDist.p25} · MEDIAN ${edgeDist.median} · p75 ${edgeDist.p75} · p95 ${edgeDist.p95} · max ${edgeDist.max}`);
  }

  // (d) THE DECIDING TEST — can a 20 m Eixample street carry its own terrain sample?
  // Count how many TIN vertices fall inside a 1 km × 20 m street corridor at REF.
  const refX = ((REF.lon - rect.west) / (rect.east - rect.west)) * tileWm;
  const refY = ((REF.lat - rect.south) / (rect.north - rect.south)) * tileHm;
  const CORRIDOR_LEN_M = 1000;
  let inCorridor = 0;
  for (let i = 0; i < m.vertexCount; i++) {
    if (Math.abs(py[i] - refY) <= EIXAMPLE_STREET_WIDTH_M / 2 && Math.abs(px[i] - refX) <= CORRIDOR_LEN_M / 2) inCorridor++;
  }
  // and the density-based expectation: vertices per km² × the corridor area
  const areaKm2 = (tileWm * tileHm) / 1e6;
  const vertPerKm2 = m.vertexCount / areaKm2;
  const corridorKm2 = (CORRIDOR_LEN_M * EIXAMPLE_STREET_WIDTH_M) / 1e6;
  log('\n  (d) ⭐ THE DECIDING TEST — can a 20 m street carry its own terrain sample?');
  log(`      vertex density  ${vertPerKm2.toFixed(1)} vertices / km²`);
  log(`      a 1000 m × 20 m street corridor is ${corridorKm2.toFixed(4)} km² → EXPECTED ${(vertPerKm2 * corridorKm2).toFixed(2)} vertices`);
  log(`      MEASURED in the corridor at ${REF.name}: ${inCorridor} vertices`);
  log(`      mean spacing implied by density: ${Math.sqrt(1e6 / vertPerKm2).toFixed(1)} m`);

  // (e) the centroid-vs-façade separation an Eixample block actually needs
  log('\n  (e) WHAT PHASE 5 / V6 WOULD BE ASKING OF THIS GRID');
  log(`      Eixample block pitch ${EIXAMPLE_BLOCK_PITCH_M} m; block centroid → façade ≈ ${(113.3 / 2).toFixed(1)} m`);
  log(`      street width to resolve: ${EIXAMPLE_STREET_WIDTH_M} m`);
  log(`      Nyquist: to RESOLVE a ${EIXAMPLE_STREET_WIDTH_M} m feature the posting must be ≤ ${EIXAMPLE_STREET_WIDTH_M / 2} m`);

  out.m1 = {
    tilesBase: base, maxzoom, layerBounds: layer.bounds, extensions: layer.extensions,
    tile: { z: maxzoom, x: t.x, y: t.y, rect, tileWm: +tileWm.toFixed(1), tileHm: +tileHm.toFixed(1) },
    bytes: tr.buf.length, vertexCount: m.vertexCount,
    triangleCount: m.triangles ? m.triangles.length / 3 : null,
    heightRangeM: [m.header.minimumHeight, m.header.maximumHeight],
    lattice: { stepU, stepV, latticeXm: latticeXm && +latticeXm.toFixed(2), latticeYm: latticeYm && +latticeYm.toFixed(2), impliedGrid },
    nearestNeighbourM: nnDist, tinEdgeM: edgeDist,
    streetTest: {
      corridorLenM: CORRIDOR_LEN_M, streetWidthM: EIXAMPLE_STREET_WIDTH_M,
      verticesInCorridor: inCorridor,
      expectedFromDensity: +(vertPerKm2 * corridorKm2).toFixed(2),
      vertexPerKm2: +vertPerKm2.toFixed(1),
      meanSpacingM: +Math.sqrt(1e6 / vertPerKm2).toFixed(1),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// M2 — WHAT WE FETCH. Read the SOURCE GeoTIFF's own ModelPixelScale tag.
// Minimal little/big-endian TIFF IFD reader — no geotiff dependency, so this runs
// on a bare box. Tag 33550 = ModelPixelScaleTag (double[3] = scaleX, scaleY, scaleZ)
// in the units of the raster CRS; here EPSG:4326 → DEGREES.
// ═══════════════════════════════════════════════════════════════════════════
const ES_WCS = 'https://servicios.idee.es/wcs-inspire/mdt';
const ES_COVERAGE = 'Elevacion4258_25'; // what tools/context-bake/terrain.mjs DTM_FETCH.es actually requests

function readTiffTags(buf) {
  if (buf.length < 8) return { error: `too short (${buf.length} B)` };
  const magic = buf.readUInt16LE(0);
  const le = magic === 0x4949;
  const be = magic === 0x4d4d;
  if (!le && !be) return { error: `not a TIFF (first bytes ${buf.subarray(0, 4).toString('hex')})` };
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const f64 = (o) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  const ver = u16(2);
  if (ver !== 42) return { error: `unsupported TIFF version ${ver} (BigTIFF=43 not handled)` };
  const ifd = u32(4);
  if (ifd + 2 > buf.length) return { error: `IFD offset ${ifd} beyond ${buf.length} B body — TRUNCATED` };
  const nTags = u16(ifd);
  const tags = {};
  for (let i = 0; i < nTags; i++) {
    const o = ifd + 2 + i * 12;
    if (o + 12 > buf.length) return { error: `IFD entry ${i} beyond body — TRUNCATED`, tags };
    const tag = u16(o), type = u16(o + 2), count = u32(o + 4);
    const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 };
    const bytes = (sizes[type] ?? 1) * count;
    const valOff = bytes <= 4 ? o + 8 : u32(o + 8);
    tags[tag] = { type, count, valOff, bytes };
    if (type === 12 && valOff + count * 8 <= buf.length) {
      tags[tag].doubles = Array.from({ length: count }, (_, k) => f64(valOff + k * 8));
    } else if (type === 3 && count <= 2) {
      tags[tag].shorts = Array.from({ length: count }, (_, k) => u16(valOff + k * 2));
    } else if (type === 4 && count <= 1) {
      tags[tag].longs = [u32(valOff)];
    }
  }
  return { endian: le ? 'little' : 'big', tags };
}

async function runM2() {
  log('\n══ M2 — WHAT WE FETCH: the source PNOA raster\'s own ModelPixelScale ══');
  // A ~1 km box on the reference point — small enough to be fast, big enough that
  // the pixel grid is unambiguous.
  const halfLat = 500 / M_PER_DEG_LAT;
  const halfLon = 500 / mPerDegLon(REF.lat);
  const s = (REF.lat - halfLat).toFixed(6), n = (REF.lat + halfLat).toFixed(6);
  const w = (REF.lon - halfLon).toFixed(6), e = (REF.lon + halfLon).toFixed(6);
  const crsUri = 'http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F4326';
  const url = `${ES_WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${ES_COVERAGE}`
    + `&FORMAT=image/tiff&SUBSET=lat(${s},${n})&SUBSET=long(${w},${e})`
    + `&SUBSETTINGCRS=${crsUri}&OUTPUTCRS=${crsUri}`;
  log(`  coverage        ${ES_COVERAGE}  (exactly what tools/context-bake/terrain.mjs DTM_FETCH.es requests)`);
  log(`  bbox            ~1000 m × 1000 m at ${REF.name}`);
  const r = await fetchRaw(url, { accept: 'image/tiff' });
  log(`  → HTTP ${r.status}, ${r.buf.length} B, content-type '${r.contentType}'`);
  if (!r.ok || r.buf.length < 16) {
    out.m2 = { error: `HTTP ${r.status}, ${r.buf.length} B`, coverage: ES_COVERAGE, bodyHead: r.buf.subarray(0, 400).toString('utf8') };
    log(`  BODY HEAD: ${r.buf.subarray(0, 400).toString('utf8')}`);
    return;
  }
  const t = readTiffTags(r.buf);
  if (t.error) {
    out.m2 = { error: t.error, coverage: ES_COVERAGE, bodyHead: r.buf.subarray(0, 400).toString('utf8') };
    log(`  TIFF READ FAILED: ${t.error}`);
    log(`  BODY HEAD: ${r.buf.subarray(0, 400).toString('utf8')}`);
    return;
  }
  const W = t.tags[256]?.shorts?.[0] ?? t.tags[256]?.longs?.[0];
  const H = t.tags[257]?.shorts?.[0] ?? t.tags[257]?.longs?.[0];
  const scale = t.tags[33550]?.doubles;
  const tie = t.tags[33922]?.doubles;
  log(`  TIFF            endian=${t.endian}, ImageWidth=${W}, ImageLength=${H}`);
  log(`  ModelPixelScale (tag 33550) = ${scale ? JSON.stringify(scale.map((x) => +x.toFixed(9))) : 'ABSENT'}`);
  log(`  ModelTiepoint   (tag 33922) = ${tie ? JSON.stringify(tie.slice(0, 6).map((x) => +x.toFixed(6))) : 'ABSENT'}`);
  let gsdX = null, gsdY = null;
  if (scale) {
    gsdX = scale[0] * mPerDegLon(REF.lat);
    gsdY = scale[1] * M_PER_DEG_LAT;
    log(`  ⇒ NATIVE GROUND SAMPLE DISTANCE: ${gsdX.toFixed(2)} m (E–W) × ${gsdY.toFixed(2)} m (N–S)`);
  }
  // Independent cross-check: the raster's own pixel count over a known ground span.
  const spanXm = 1000, spanYm = 1000;
  if (W && H) {
    log(`  cross-check     ${W}×${H} px over ~${spanXm}×${spanYm} m ⇒ ${(spanXm / W).toFixed(2)} × ${(spanYm / H).toFixed(2)} m/px`);
  }
  out.m2 = {
    coverage: ES_COVERAGE, endpoint: ES_WCS, httpStatus: r.status, bytes: r.buf.length,
    contentType: r.contentType, width: W, height: H,
    modelPixelScaleDeg: scale ?? null, modelTiepoint: tie?.slice(0, 6) ?? null,
    nativeGsdXm: gsdX && +gsdX.toFixed(3), nativeGsdYm: gsdY && +gsdY.toFixed(3),
    crossCheckMPerPx: W && H ? [+(spanXm / W).toFixed(2), +(spanYm / H).toFixed(2)] : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// M3 — WHAT THE SERVER DECLARES. WCS DescribeCoverage → GridSpacing / offsetVector.
// A third, independent statement of the same number, straight from the publisher.
// Also enumerates the OTHER coverages the endpoint offers, which answers "is a
// finer product available from the same source?" — the question that decides
// whether the fix is a config change or an acquisition programme.
// ═══════════════════════════════════════════════════════════════════════════
async function runM3() {
  log('\n══ M3 — WHAT THE SERVER DECLARES: WCS DescribeCoverage + the coverage list ══');
  const dc = `${ES_WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=DescribeCoverage&COVERAGEID=${ES_COVERAGE}`;
  const r = await fetchRaw(dc, { accept: 'application/xml' });
  log(`  DescribeCoverage → HTTP ${r.status}, ${r.buf.length} B, '${r.contentType}'`);
  const xml = r.buf.toString('utf8');
  const offsets = [...xml.matchAll(/<[^>]*offsetVector[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  const low = xml.match(/<[^>]*low>([^<]+)</)?.[1];
  const high = xml.match(/<[^>]*high>([^<]+)</)?.[1];
  const env = xml.match(/lowerCorner>([^<]+)<[\s\S]*?upperCorner>([^<]+)</);
  log(`  GridEnvelope    low=[${low ?? '?'}] high=[${high ?? '?'}]`);
  log(`  Envelope        lower=[${env?.[1] ?? '?'}] upper=[${env?.[2] ?? '?'}]`);
  log(`  offsetVectors   ${offsets.length ? JSON.stringify(offsets) : 'NONE FOUND in the response'}`);
  let declaredDeg = null;
  if (offsets.length >= 2) {
    const a = offsets[0].split(/\s+/).map(Number);
    const b = offsets[1].split(/\s+/).map(Number);
    declaredDeg = [Math.max(...a.map(Math.abs)), Math.max(...b.map(Math.abs))];
    log(`  ⇒ DECLARED grid spacing: ${declaredDeg[0]}° , ${declaredDeg[1]}°`
      + `  ≈ ${(declaredDeg[0] * M_PER_DEG_LAT).toFixed(2)} m / ${(declaredDeg[1] * mPerDegLon(REF.lat)).toFixed(2)} m`);
  }

  // What ELSE does this endpoint publish? Decides config-change vs acquisition.
  const cap = await fetchRaw(`${ES_WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCapabilities`, { accept: 'application/xml' });
  log(`  GetCapabilities → HTTP ${cap.status}, ${cap.buf.length} B`);
  const capXml = cap.buf.toString('utf8');
  const ids = [...new Set([...capXml.matchAll(/<[^>]*CoverageId>([^<]+)</g)].map((m) => m[1].trim()))];
  log(`  coverages offered by this endpoint (n=${ids.length}): ${JSON.stringify(ids)}`);
  log('  ⇒ read the trailing number as the grid size in metres (IGN naming: Elevacion<epsg>_<gridM>)');

  out.m3 = {
    describeCoverage: { httpStatus: r.status, bytes: r.buf.length, low, high, offsetVectors: offsets, declaredDeg },
    getCapabilities: { httpStatus: cap.status, bytes: cap.buf.length, coverageIds: ids },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// M4 — WHAT WOULD FIX IT. A verdict of "cannot resolve" is only useful if it says
// what resolution IS needed and whether that resolution EXISTS. M3 shows the SAME
// endpoint publishes finer coverages; M4 MEASURES one of them the same way M2 did
// (its own ModelPixelScale), and computes the tileset maxzoom our own bake would
// need to carry it. This is what makes the verdict actionable rather than merely
// discouraging — and it decides "config change" vs "acquisition programme".
// ═══════════════════════════════════════════════════════════════════════════
async function runM4() {
  log('\n══ M4 — WHAT WOULD FIX IT: measure the finer coverage + the bake maxzoom needed ══');
  const finer = 'Elevacion4258_5'; // MDT05 on the SAME endpoint, no new licence, no new auth
  const halfLat = 500 / M_PER_DEG_LAT;
  const halfLon = 500 / mPerDegLon(REF.lat);
  const s = (REF.lat - halfLat).toFixed(6), n = (REF.lat + halfLat).toFixed(6);
  const w = (REF.lon - halfLon).toFixed(6), e = (REF.lon + halfLon).toFixed(6);
  const crsUri = 'http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F4326';
  const url = `${ES_WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${finer}`
    + `&FORMAT=image/tiff&SUBSET=lat(${s},${n})&SUBSET=long(${w},${e})`
    + `&SUBSETTINGCRS=${crsUri}&OUTPUTCRS=${crsUri}`;
  const r = await fetchRaw(url, { accept: 'image/tiff' });
  log(`  ${finer} → HTTP ${r.status}, ${r.buf.length} B, '${r.contentType}'`);
  let gsd = null, W = null, H = null;
  if (r.ok && r.buf.length > 16) {
    const t = readTiffTags(r.buf);
    if (t.error) { log(`  TIFF READ FAILED: ${t.error}`); }
    else {
      W = t.tags[256]?.shorts?.[0] ?? t.tags[256]?.longs?.[0];
      H = t.tags[257]?.shorts?.[0] ?? t.tags[257]?.longs?.[0];
      const scale = t.tags[33550]?.doubles;
      if (scale) {
        gsd = { x: scale[0] * mPerDegLon(REF.lat), y: scale[1] * M_PER_DEG_LAT };
        log(`  TIFF ${W}×${H} px, ModelPixelScale ${JSON.stringify(scale.map((x) => +x.toFixed(9)))}`);
        log(`  ⇒ NATIVE GSD ${gsd.x.toFixed(2)} m × ${gsd.y.toFixed(2)} m  — cross-check ${(1000 / W).toFixed(2)} × ${(1000 / H).toFixed(2)} m/px`);
      }
    }
  } else {
    log(`  BODY HEAD: ${r.buf.subarray(0, 300).toString('utf8')}`);
  }

  // The bake-side ceiling. Our tiles carry gridSize×gridSize samples per tile, so the
  // served posting is (tile span)/(gridSize−1) no matter how fine the source is.
  const GRID = out.m1?.lattice?.impliedGrid ?? 257;
  const target = EIXAMPLE_STREET_WIDTH_M / 2; // Nyquist
  let neededZ = null;
  for (let z = 0; z <= 20; z++) {
    const spanLatM = (180 / 2 ** z) * M_PER_DEG_LAT;
    if (spanLatM / (GRID - 1) <= target) { neededZ = z; break; }
  }
  const curZ = out.m1?.maxzoom ?? null;
  log(`\n  bake ceiling    gridSize ${GRID} ⇒ served posting = (tile span)/${GRID - 1}`);
  if (neededZ != null) {
    const spanLatM = (180 / 2 ** neededZ) * M_PER_DEG_LAT;
    const spanLonM = (180 / 2 ** neededZ) * mPerDegLon(REF.lat);
    log(`  ⇒ to reach ≤ ${target} m posting the tileset needs maxzoom ${neededZ}`
      + ` (tile ${spanLonM.toFixed(0)}×${spanLatM.toFixed(0)} m ⇒ ${(spanLonM / (GRID - 1)).toFixed(1)}×${(spanLatM / (GRID - 1)).toFixed(1)} m)`);
    if (curZ != null) log(`  ⇒ today maxzoom ${curZ}; ${neededZ - curZ} extra level(s) ⇒ ≈ ${4 ** (neededZ - curZ)}× the tiles at the finest level`);
  }
  out.m4 = {
    finerCoverage: finer, httpStatus: r.status, bytes: r.buf.length, width: W, height: H,
    nativeGsdM: gsd && { x: +gsd.x.toFixed(2), y: +gsd.y.toFixed(2) },
    finerMeetsNyquist: gsd ? Math.max(gsd.x, gsd.y) <= target : null,
    bake: { gridSize: GRID, currentMaxzoom: curZ, maxzoomNeededForNyquist: neededZ },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  log('PROBE V8 — terrain posting spacing under Barcelona');
  log(`tiles base: ${TILES_BASE}`);
  log(`reference:  ${REF.name}  (${REF.lat}, ${REF.lon})`);
  if (runAll || want('--m1')) await runM1();
  if (runAll || want('--m2')) await runM2();
  if (runAll || want('--m3')) await runM3();
  if (runAll || want('--m4')) await runM4();

  // ── VERDICT, computed from the measurements, never asserted ──
  const served = out.m1?.tinEdgeM?.median ?? null;
  const servedNN = out.m1?.nearestNeighbourM?.median ?? null;
  const source = out.m2?.nativeGsdYm ?? null;
  const nyquist = EIXAMPLE_STREET_WIDTH_M / 2;
  const verdict = {
    servedMedianTinEdgeM: served,
    servedMedianNearestNeighbourM: servedNN,
    sourceNativeGsdM: source,
    nyquistRequirementM: nyquist,
    canResolve20mStreet: servedNN != null ? servedNN <= nyquist : null,
    sourceCouldResolve20mStreet: source != null ? source <= nyquist : null,
  };
  out.verdict = verdict;
  log('\n══════════════════════════ VERDICT ══════════════════════════');
  log(`  served terrain, median nearest-neighbour vertex spacing : ${servedNN ?? 'n/d'} m`);
  log(`  served terrain, median TIN edge length                  : ${served ?? 'n/d'} m`);
  log(`  SOURCE raster native GSD                                : ${source ?? 'n/d'} m`);
  log(`  requirement to RESOLVE a ${EIXAMPLE_STREET_WIDTH_M} m street (Nyquist)      : ≤ ${nyquist} m`);
  log(`  ⇒ CAN THE TERRAIN WE HOLD RESOLVE A 20 m STREET?        : ${verdict.canResolve20mStreet === null ? 'UNDETERMINED' : verdict.canResolve20mStreet ? 'YES' : 'NO'}`);
  log(`  ⇒ COULD THE SOURCE, AT ITS NATIVE GSD?                  : ${verdict.sourceCouldResolve20mStreet === null ? 'UNDETERMINED' : verdict.sourceCouldResolve20mStreet ? 'YES' : 'NO'}`);
  log('\n  fetch log:');
  for (const f of out.fetchLog) log(`    ${String(f.status).padEnd(6)} ${String(f.bytes ?? '').padStart(9)} B  ${f.contentType ?? ''}  ${f.url}${f.error ? `  ERROR=${f.error}` : ''}`);

  if (asJson) console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('PROBE V8 FAILED:', e); process.exit(1); });
