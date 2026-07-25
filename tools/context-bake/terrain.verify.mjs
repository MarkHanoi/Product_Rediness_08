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
const decode = decodeMod.default ?? decodeMod;
const T = await import('./terrain.mjs');

const D2R = Math.PI / 180;

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
