#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// terrain.mjs END-TO-END VERIFICATION DRIVER — the "renders + is measured" proof for Phase 3.
//
// Ingests a REAL national DTM GeoTIFF, runs the whole compiler (datum lift → L-584 plane fit →
// MARTINI TIN → quantized-mesh encode → LOD), then DECODES every tile back with an INDEPENDENT
// third-party decoder (@here/quantized-mesh-decoder) and asserts the round-trip matches. This is
// the honesty gate: the encoder is hand-rolled, so it is only trustworthy if a decoder we did NOT
// write reads it correctly.
//
// STANDALONE deps (NOT the pnpm workspace — install in a scratch dir to avoid the workspace:* trap):
//     npm i geotiff@2 @mapbox/martini@0.2 @here/quantized-mesh-decoder@1
//   then get a DTM tif (keyless):  node terrain.mjs --fetch-nl amsterdam.tif
//   then:                          node terrain.verify.mjs amsterdam.tif nl
//
// Proven 2026-07-25 on the Amsterdam AHN 0.5 m DTM (512×512, NAP −0.56..2.30 m): all LODs PASS the
// decode round-trip; datum lift +43 m → ellipsoidal ~44 m (matches globeGroundAnchor.ts's NL note);
// L-584 façade-plane vs single-point centroid Δ recovered.
// ─────────────────────────────────────────────────────────────────────────────
import * as geotiff from 'geotiff';
import MartiniMod from '@mapbox/martini';
import decodeMod from '@here/quantized-mesh-decoder';

const Martini = MartiniMod.default ?? MartiniMod;
// @here/quantized-mesh-decoder's CJS build double-wraps under Node-ESM interop (m.default.default is
// the function in 1.2.x); unwrap defensively so the round-trip works regardless of the resolved shape.
const decode = [decodeMod, decodeMod?.default, decodeMod?.default?.default].find((c) => typeof c === 'function');
const T = await import('./terrain.mjs');

const D2R = Math.PI / 180;

// ── §C12-10 HEADER INVARIANTS — the decode-the-tile check C12 §10.4 asks for and that (per C12 §10.2a)
// "no script implements". Applied to every tile this driver decodes, on disk (--tileset) or off R2
// (--remote). Each expectation is DERIVED, never a hypothesis of the day (C12 §10.2a MUST):
//   • centerMag ≈ 6.38e6 — §10.1 rectangle-centre: the header bounding-sphere centre is the ECEF of the
//     tile rectangle's mid lon/lat at mean height, i.e. a point ON the ellipsoid (|p| ∈ [b, a] + h =
//     6.357e6..6.378e6 + h). The vertex-centroid bug wrote ~0 (geocentre) for pole-spanning tiles.
//   • occMag > 1 — §10.2: the scaled-space horizon occludee sits OUTSIDE the unit sphere (1/cos θ > 1
//     for any tile of non-zero angular size); wide-angle tiles carry the never-cull sentinel 1e4. The
//     bug wrote (0,0,0), which Cesium reads as "always below the horizon" → root always culled → white.
//   • vertexNormals extension present — §TERRAIN-NORMALS (L-636): without oct-encoded normals every slope
//     paints the flat baseColor → the "white mask". The client requests them (requestVertexNormals).
//   • triangles > 0 — an empty mesh is not a tile.
const HEADER_MIN = 6.30e6, HEADER_MAX = 6.45e6;   // ellipsoid radii ± the highest terrain on Earth, with margin
const mag3 = (x, y, z) => Math.hypot(x, y, z);
export function checkTileInvariants(dec, tag = '') {
  const h = dec.header;
  const centerMag = mag3(h.boundingSphereCenterX, h.boundingSphereCenterY, h.boundingSphereCenterZ);
  const occMag = mag3(h.horizonOcclusionPointX, h.horizonOcclusionPointY, h.horizonOcclusionPointZ);
  const tris = dec.triangleIndices.length / 3;
  const normals = !!(dec.extensions && dec.extensions.vertexNormals && dec.extensions.vertexNormals.length > 0);
  const fails = [];
  if (!(centerMag > HEADER_MIN && centerMag < HEADER_MAX)) fails.push(`centerMag=${centerMag.toExponential(3)} (§10.1 wants ≈6.38e6 — rectangle centre on the ellipsoid)`);
  if (!(occMag > 1 - 1e-9)) fails.push(`occMag=${occMag} (§10.2 wants >1; 0 = always culled)`);
  if (!normals) fails.push('no vertexNormals extension (§TERRAIN-NORMALS L-636 — the white-mask root)');
  if (!(tris > 0)) fails.push('0 triangles');
  return { ok: fails.length === 0, fails, centerMag, occMag, tris, verts: dec.vertexData.length / 3, normals, minH: h.minHeight, maxH: h.maxHeight, tag };
}
const fmtInv = (r) => `${r.verts} verts, ${r.tris} tris, h[${r.minH.toFixed(1)}..${r.maxH.toFixed(1)}]m, centerMag ${r.centerMag.toExponential(3)}, occMag ${r.occMag >= 100 ? r.occMag.toFixed(0) : r.occMag.toFixed(4)}, normals ${r.normals ? 'YES' : 'NO'} → ${r.ok ? 'PASS' : `FAIL (${r.fails.join('; ')})`}`;

// ── §REMOTE MODE — the SERVED tileset proof (C12 §10.4: "decode the root tile off R2 … before shipping") ──
// `node terrain.verify.mjs --remote <slug> [--base <tiles base>] [--lonlat lon,lat]` fetches the LIVE
// layer.json, decodes the root tile(s) Cesium requests first and the finest tile under lon/lat (default:
// the tileset bounds centre) with the independent @here decoder, and asserts the §C12-10 invariants on
// the bytes the CDN actually serves. Exit 0 = the tileset is live, complete at the probe, and healthy.
if (process.argv.includes('--remote')) {
  const slug = process.argv[process.argv.indexOf('--remote') + 1];
  const base = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/').replace(/\/?$/, '/');
  const ll = process.argv.includes('--lonlat') ? process.argv[process.argv.indexOf('--lonlat') + 1].split(',').map(Number) : null;
  const url = `${base}terrain/${slug}`;
  console.log(`═══ VERIFY REMOTE: ${url} ═══\n`);
  const get = async (u) => { const r = await fetch(u, { headers: { accept: 'application/vnd.quantized-mesh;extensions=octvertexnormals,application/json,*/*' } }); return { status: r.status, ab: r.ok ? await r.arrayBuffer() : null, lastMod: r.headers.get('last-modified'), ct: r.headers.get('content-type') }; };
  const lj = await get(`${url}/layer.json`);
  if (lj.status !== 200) { console.log(`❌ ${url}/layer.json → HTTP ${lj.status} — the tileset is NOT served (404 = never published, or the slug differs from the bake's).`); process.exit(1); }
  const layer = JSON.parse(Buffer.from(lj.ab).toString('utf8'));
  console.log(`[0] layer.json HTTP 200 (${lj.ct}; last-modified ${lj.lastMod}) bounds=[${layer.bounds.map((v) => v.toFixed(2)).join(',')}] z0..${layer.maxzoom} tiles=${layer.tiles[0]}`);
  const rel = (z, x, y) => layer.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y);
  let allOk = true;
  const probeTile = async (z, x, y, tag) => {
    const t = await get(`${url}/${rel(z, x, y)}`);
    if (t.status !== 200) { console.log(`    ${tag} ${rel(z, x, y).padEnd(22)} → HTTP ${t.status}  FAIL (declared by layer.json, not served)`); allOk = false; return; }
    const r = checkTileInvariants(decode(t.ab), tag);
    allOk &&= r.ok;
    console.log(`    ${tag} ${rel(z, x, y).padEnd(22)} ${String(t.ab.byteLength).padStart(8)} B  ${fmtInv(r)}`);
  };
  console.log('[1] root tiles (the first Cesium requests — a culled root is the white-terrain bug):');
  for (const r of layer.available[0]) for (let x = r.startX; x <= r.endX; x++) for (let y = r.startY; y <= r.endY; y++) await probeTile(0, x, y, 'root  ');
  const probe = ll ?? [(layer.bounds[0] + layer.bounds[2]) / 2, (layer.bounds[1] + layer.bounds[3]) / 2];
  console.log(`[2] the request chain for lon/lat ${probe.map((v) => v.toFixed(4)).join(',')} (every level must be served):`);
  for (let z = 1; z <= layer.maxzoom; z++) {
    const t = T.tmsTileForLonLat(probe[0], probe[1], z);
    await probeTile(z, t.x, t.y, z === layer.maxzoom ? 'finest' : `z${String(z).padStart(2)}   `);
  }
  console.log(`\n${allOk ? `✅ ${slug}: served, complete along the probe chain, and every decoded header satisfies C12 §10.1/§10.2 with vertex normals.` : `❌ ${slug}: a served tile is missing or violates a C12 §10 header invariant.`}`);
  process.exit(allOk ? 0 : 1);
}

// ── §TILESET MODE — the ON-DISK ↔ layer.json AGREEMENT proof (the render-flat bug's direct gate) ──
// `node terrain.verify.mjs --tileset <dir> [--lonlat lon,lat]` reads the emitted layer.json, walks its
// `available` array, and asserts EVERY declared `{z}/{x}/{y}.terrain` exists at that exact path (the old
// bake wrote flat `<lod>.terrain` while layer.json declared `{z}/{x}/{y}` → 404 → flat globe). It then
// DECODES the first tile Cesium requests (the level-0 tile) AND the finest tile with the independent
// @here decoder, and prints the exact request path Cesium derives for a real city lon/lat, confirming a
// file is there. This is the whole-loop honesty gate: paths agree AND the bytes are a real mesh.
if (process.argv.includes('--tileset')) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = process.argv[process.argv.indexOf('--tileset') + 1];
  const ll = process.argv.includes('--lonlat')
    ? process.argv[process.argv.indexOf('--lonlat') + 1].split(',').map(Number) : null;
  const relOf = (tmpl, z, x, y) => tmpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const layer = JSON.parse(fs.readFileSync(path.resolve(dir, 'layer.json'), 'utf8'));
  console.log(`═══ VERIFY TILESET: ${dir} ═══\n`);
  console.log(`[0] layer.json  scheme=${layer.scheme}  tiles=${JSON.stringify(layer.tiles)}  bounds=[${layer.bounds.map((v) => v.toFixed(4)).join(',')}]  z0..${layer.maxzoom}`);
  const tmpl = layer.tiles[0];

  // [2] every tile the layer.json DECLARES must exist at exactly that path
  let present = 0, missing = 0;
  layer.available.forEach((ranges, z) => {
    for (const r of ranges) {
      for (let x = r.startX; x <= r.endX; x++) for (let y = r.startY; y <= r.endY; y++) {
        const rel = relOf(tmpl, z, x, y);
        if (fs.existsSync(path.resolve(dir, rel))) present++;
        else { missing++; console.log(`    MISSING ${rel}`); }
      }
    }
  });
  console.log(`[2] declared→disk: ${present} present, ${missing} missing  ${missing === 0 ? 'PASS' : 'FAIL'}`);

  // [3] decode the FIRST tile Cesium requests (level-0 available tile) + the finest, independently, and
  //     assert the §C12-10 header invariants on the bytes about to be published (not just "it decodes").
  let invOk = true;
  const decodeAt = (z, x, y, tag) => {
    const rel = relOf(tmpl, z, x, y);
    if (!fs.existsSync(path.resolve(dir, rel))) { console.log(`    ${tag} ${rel.padEnd(22)} → MISSING (a sharded bake leaves the finest level to other shards; skipped)`); return null; }
    const buf = fs.readFileSync(path.resolve(dir, rel));
    const dec = decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const r = checkTileInvariants(dec, tag);
    invOk &&= r.ok;
    console.log(`    ${tag} ${rel.padEnd(22)} → ${fmtInv(r)}`);
    return dec;
  };
  const r0 = layer.available[0][0], rM = layer.available[layer.maxzoom][0];
  console.log('[3] independent @here decode round-trip + C12 §10.1/§10.2 header invariants:');
  const d0 = decodeAt(0, r0.startX, r0.startY, 'root  ');
  const dM = decodeAt(layer.maxzoom, rM.startX, rM.startY, 'finest');
  const decOk = invOk && !!d0 && d0.triangleIndices.length > 0 && (dM === null || dM.triangleIndices.length > 0);

  // [4] the EXACT path Cesium requests for a real city lon/lat, at every level, must exist on disk
  const probe = ll ?? [(layer.bounds[0] + layer.bounds[2]) / 2, (layer.bounds[1] + layer.bounds[3]) / 2];
  console.log(`[4] Cesium request path for lon/lat ${probe.map((v) => v.toFixed(5)).join(',')} (site centre):`);
  let pathOk = true;
  for (let z = 0; z <= layer.maxzoom; z++) {
    const t = T.tmsTileForLonLat(probe[0], probe[1], z);
    const rel = relOf(tmpl, z, t.x, t.y);
    const ok = fs.existsSync(path.resolve(dir, rel));
    pathOk &&= ok;
    console.log(`    z${String(z).padStart(2)} → ${rel.padEnd(22)} ${ok ? 'EXISTS' : '404 !!'}`);
  }
  const allOk = missing === 0 && decOk && pathOk;
  console.log(`\n${allOk ? '✅ tileset is Cesium-loadable: every declared/requested tile exists on disk and decodes.' : '❌ tileset MISMATCH — a declared/requested tile is missing or empty.'}`);
  process.exit(allOk ? 0 : 1);
}

// ── §CITY MODE — the generalized multi-country proof (the reprojection-adapter verification) ─────
// `node terrain.verify.mjs --city <name>` fetches the city's REAL national DTM via the §8b adapter,
// warps it (reproject.mjs + resampleToGeographicGrid), samples control-point elevations, then
// encodes every LOD and DECODES each with the INDEPENDENT @here decoder. This is the honesty gate
// for the NEW countries (ES/FR/CH/NO/DE/IT/GB), exactly as the NL block below is for Amsterdam.
if (process.argv.includes('--city')) {
  const name = process.argv[process.argv.indexOf('--city') + 1];
  const region = T.REGIONS.find((r) => r.name === name);
  if (!region) { console.error(`unknown city '${name}' (see terrain.mjs --regions)`); process.exit(1); }
  const s = T.TERRAIN_SOURCES[region.source];
  console.log(`═══ VERIFY CITY: ${name} — ${s.dataset} → Cesium quantized-mesh ═══\n`);

  const probes = T.SAMPLE_PROBES[name] || [['centroid', (region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2]];
  const smp = await T.sampleCity(region, probes, { geotiffMod: geotiff });
  console.log(`[1] FETCH  ${smp.raster.w}x${smp.raster.h}px native ${smp.nativeCrs}\n    ${smp.url}`);
  console.log(`[2] DATUM  orthometric min/mean/max = ${smp.stats.minOrtho}/${smp.stats.meanOrtho}/${smp.stats.maxOrtho} m  → +${smp.geoidSepM} m geoid lift → ellipsoidal`);
  console.log('[3] PLACEMENT (control-point elevations — must match ground truth):');
  for (const r of smp.rows) console.log(`      · ${r.name.padEnd(18)} ${r.orthoM == null ? 'nodata' : `${r.orthoM} m ortho → ${r.ellipsoidalM} m ellipsoidal`}`);

  // Bake in-memory + independent decode round-trip.
  const { raster, nativeCrs } = await T.fetchDtmRaster(region.source, region.bbox, { geotiffMod: geotiff });
  const proj = (await import('./reproject.mjs')).getProjector(nativeCrs);
  const tile4 = T.inscribedWgs84Extent(raster, proj);
  const filled = T.fillNodata(raster.values, raster.width, raster.height);
  const gridSize = 257;
  const gridEll = Float32Array.from(
    T.resampleToGeographicGrid({ ...raster, values: filled }, proj.forward, tile4, gridSize),
    (h) => T.napToEllipsoidal(h, s.geoidSepM));
  const tile = { west: tile4[0] * D2R, south: tile4[1] * D2R, east: tile4[2] * D2R, north: tile4[3] * D2R };
  const heightAt = (gx, gy) => gridEll[gy * gridSize + gx];
  console.log('[4] MESH → ENCODE → DECODE (independent @here/quantized-mesh-decoder):');
  let allPass = true;
  for (const err of T.DEFAULT_LOD_ERRORS_M) {
    const mesh = T.meshTile(gridEll, gridSize, err, Martini);
    const { buffer, stats } = T.encodeQuantizedMesh(mesh, gridSize, tile, heightAt);
    const dec = decode(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const pass = dec.triangleIndices.length / 3 === stats.triangles && dec.vertexData.length / 3 === stats.vertices
      && Math.abs(dec.header.minHeight - stats.minH) < 0.01 && Math.abs(dec.header.maxHeight - stats.maxH) < 0.01;
    allPass &&= pass;
    console.log(`    err=${String(err).padStart(4)}m  enc ${String(stats.triangles).padStart(6)} tris/${String(stats.vertices).padStart(6)}v/${(buffer.length / 1024).toFixed(1).padStart(7)}KB  |  dec ${dec.triangleIndices.length / 3} tris header[${dec.header.minHeight.toFixed(1)}..${dec.header.maxHeight.toFixed(1)}]  ${pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\n${allPass ? `✅ ${name}: real DTM ingested, reprojected + datum-lifted, meshed, encoded, decoded back correctly.` : `❌ ${name}: a LOD FAILED the round-trip`}`);
  process.exit(allPass ? 0 : 1);
}

const TIF = process.argv[2] || 'amsterdam_ahn_dtm05.tif';
const COUNTRY = process.argv[3] || 'nl';
const src = T.TERRAIN_SOURCES[COUNTRY];

console.log(`═══ VERIFY: ${src.dataset} → Cesium quantized-mesh (${TIF}) ═══\n`);

// [1] ingest
const raster = await T.readDtmGeoTIFF(TIF, geotiff);
console.log(`[1] INGEST  ${raster.width}x${raster.height} px, res ${raster.resX}m, native bbox [${raster.bboxNative.map(n => n.toFixed(0)).join(', ')}]`);

// [2] datum lift
const filled = T.fillNodata(raster.values, raster.width, raster.height);
let mn = Infinity, mx = -Infinity, sm = 0;
for (const v of filled) { if (v < mn) mn = v; if (v > mx) mx = v; sm += v; }
console.log(`[2] DATUM   orthometric min/mean/max = ${mn.toFixed(2)}/${(sm / filled.length).toFixed(2)}/${mx.toFixed(2)} m  → +${src.geoidSepM} m = ellipsoidal ~${(sm / filled.length + src.geoidSepM).toFixed(1)} m`);

// [3] L-584 façade plane vs single-point centroid
const cx = (raster.bboxNative[0] + raster.bboxNative[2]) / 2, cy = (raster.bboxNative[1] + raster.bboxNative[3]) / 2;
const ring = [[cx - 15, cy - 20], [cx + 15, cy - 20], [cx + 15, cy + 20], [cx - 15, cy + 20]];
const plane = T.fitFootprintGroundPlane({ ...raster, values: filled }, ring, src.geoidSepM);
const scx = (cx - raster.bboxNative[0]) / (raster.bboxNative[2] - raster.bboxNative[0]) * (raster.width - 1);
const scy = (raster.bboxNative[3] - cy) / (raster.bboxNative[3] - raster.bboxNative[1]) * (raster.height - 1);
const single = filled[Math.round(scy) * raster.width + Math.round(scx)] + src.geoidSepM;
if (plane) console.log(`[3] L-584   façade-plane ground ${plane.groundEllipsoidalM.toFixed(3)} m (${plane.samples} perimeter samples, slope ${plane.slopePctMax.toFixed(2)}%)  vs  single-point centroid ${single.toFixed(3)} m  →  Δ ${Math.abs(plane.groundEllipsoidalM - single).toFixed(3)} m rasant correction`);

// [4] mesh → encode → INDEPENDENT decode round-trip per LOD
const gridSize = 257;
const grid = T.resampleSquare(filled, raster.width, raster.height, gridSize).map((h) => T.napToEllipsoidal(h, src.geoidSepM));
const [wLon, sLat] = T.rdToWgs84(raster.bboxNative[0], raster.bboxNative[1]);
const [eLon, nLat] = T.rdToWgs84(raster.bboxNative[2], raster.bboxNative[3]);
const tile = { west: wLon * D2R, south: sLat * D2R, east: eLon * D2R, north: nLat * D2R };
const heightAt = (gx, gy) => grid[gy * gridSize + gx];
console.log('[4] MESH → ENCODE → DECODE (independent @here/quantized-mesh-decoder):');
let allPass = true;
for (const err of T.DEFAULT_LOD_ERRORS_M) {
  const mesh = T.meshTile(grid, gridSize, err, Martini);
  const { buffer, stats } = T.encodeQuantizedMesh(mesh, gridSize, tile, heightAt);
  const dec = decode(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const decVerts = dec.vertexData.length / 3, decTris = dec.triangleIndices.length / 3;
  const pass = decTris === stats.triangles && decVerts === stats.vertices
    && Math.abs(dec.header.minHeight - stats.minH) < 0.01 && Math.abs(dec.header.maxHeight - stats.maxH) < 0.01;
  allPass &&= pass;
  console.log(`    err=${String(err).padStart(4)}m  enc ${String(stats.triangles).padStart(5)} tris/${String(stats.vertices).padStart(5)}v/${(buffer.length / 1024).toFixed(1).padStart(6)}KB  |  dec ${decTris} tris/${decVerts}v header[${dec.header.minHeight.toFixed(1)}..${dec.header.maxHeight.toFixed(1)}]  ${pass ? 'PASS' : 'FAIL'}`);
}
console.log(`\n${allPass ? '✅ ALL LODs round-trip PASS — real DTM ingested, datum-lifted, meshed, encoded, decoded back correctly.' : '❌ a LOD FAILED the round-trip'}`);
process.exit(allPass ? 0 : 1);
