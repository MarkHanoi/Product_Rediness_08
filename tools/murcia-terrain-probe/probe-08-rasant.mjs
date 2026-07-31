// PROBE 08 — the RASANT / datum profile around the parcel boundary.
//
// Why per-vertex and not a centroid: Spanish height ordinances measure permitted height from the
// RASANTE at the FAÇADE, not from the mean level of the plot. A single centroid sample is a known
// legal defect (L-584) — it silently answers a different question from the one the ordinance asks.
// This probe therefore samples MDT05 along the whole parcel boundary (every vertex plus densified
// points on every edge) and reports a per-edge profile, so whichever edge turns out to front the
// street has its own datum.
//
// Sampling: bilinear interpolation of the FLOAT MDT05 grid (5 m posting). Bilinear is honest here —
// it interpolates BETWEEN real postings; it does not invent detail finer than 5 m, and the probe
// states that limit rather than implying the boundary elevation is resolved at vertex precision.
//
// Run:  node tools/murcia-terrain-probe/probe-08-rasant.mjs

import { probeFetch, saveJson, loadProj4, SITE } from './lib.mjs';

const MDT = 'https://servicios.idee.es/wcs-inspire/mdt';
const CP = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx';
const crsUri = (e) => `http://www.opengis.net/def/crs/EPSG/0/${e}`;

const proj4 = await loadProj4();
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const fwd = proj4('EPSG:4326', 'EPSG:25830');
const inv = proj4('EPSG:25830', 'EPSG:4326');
const centre = fwd.forward([SITE.lon, SITE.lat]);

// ── parcel ring ─────────────────────────────────────────────────────────────────────────────────
const cpR = await probeFetch(`${CP}?service=WFS&version=2.0.0&request=getfeature&STOREDQUERIE_ID=GetParcel&refcat=${SITE.refcat}&srsname=EPSG::25830`, { accept: 'text/xml' });
const ext = cpR.text.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
const nums = ext[1].trim().split(/\s+/).map(Number);
const ring = []; for (let i = 0; i + 1 < nums.length; i += 2) ring.push([nums[i], nums[i + 1]]);
console.log(`parcel ring: ${ring.length} vertices (EPSG:25830)`);

// ── MDT05 float grid over a padded box ──────────────────────────────────────────────────────────
const HALF = 120;
const url = `${MDT}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion25830_5&FORMAT=ArcGrid`
  + `&SUBSET=x(${centre[0] - HALF},${centre[0] + HALF})&SUBSET=y(${centre[1] - HALF},${centre[1] + HALF})`
  + `&SUBSETTINGCRS=${crsUri('25830')}&OUTPUTCRS=${crsUri('25830')}`;
const r = await probeFetch(url, { label: 'mdt05-rasant', timeoutMs: 120_000 });
const i0 = r.text.search(/ncols\s+\d+/i);
let body = r.text.slice(i0); const endI = body.indexOf('--wcs--'); if (endI > 0) body = body.slice(0, endI);
const h = {}; const re = /(ncols|nrows|xllcorner|yllcorner|cellsize|NODATA_value)\s+(-?[\d.]+)/gi;
let m, last = 0; while ((m = re.exec(body))) { h[m[1].toLowerCase()] = Number(m[2]); last = re.lastIndex; }
const v = body.slice(last).trim().split(/\s+/).map(Number).filter(Number.isFinite);
const G = { W: h.ncols, H: h.nrows, xll: h.xllcorner, yll: h.yllcorner, cell: h.cellsize, v };
if (v.length !== G.W * G.H) throw new Error(`TRUNCATED-BUT-200: expected ${G.W * G.H} cells, got ${v.length}`);
console.log(`MDT05 grid ${G.W}x${G.H} @ ${G.cell} m  (payload validated: ${v.length} cells)`);

const yTop = G.yll + G.H * G.cell;
/** Bilinear sample of the float grid at a native (E,N) position. Returns null outside the grid. */
function sampleZ(x, y) {
  const fc = (x - G.xll) / G.cell - 0.5;
  const fr = (yTop - y) / G.cell - 0.5;
  const c0 = Math.floor(fc), r0 = Math.floor(fr);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= G.W || r0 + 1 >= G.H) return null;
  const tx = fc - c0, ty = fr - r0;
  const z = (rr, cc) => G.v[rr * G.W + cc];
  const a = z(r0, c0), b = z(r0, c0 + 1), c = z(r0 + 1, c0), d = z(r0 + 1, c0 + 1);
  if ([a, b, c, d].some((q) => !Number.isFinite(q))) return null;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

// ── per-edge rasant profile ─────────────────────────────────────────────────────────────────────
const STEP_M = 2; // densify each edge; NOTE this is finer than the 5 m posting — interpolation, not resolution
const edges = [];
for (let i = 0; i < ring.length - 1; i++) {
  const p0 = ring[i], p1 = ring[i + 1];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (len < 0.01) continue;
  const n = Math.max(2, Math.ceil(len / STEP_M) + 1);
  const zs = [], pts = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
    const z = sampleZ(x, y);
    if (z != null) { zs.push(z); pts.push([x, y]); }
  }
  const bearing = (Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) * 180 / Math.PI + 360) % 360;
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  edges.push({
    edge: i, lengthM: Number(len.toFixed(2)), bearingDeg: Number(bearing.toFixed(1)),
    nSamples: zs.length, stepM: STEP_M,
    zMin: zs.length ? Number(Math.min(...zs).toFixed(2)) : null,
    zMax: zs.length ? Number(Math.max(...zs).toFixed(2)) : null,
    zMean: zs.length ? Number((zs.reduce((a, b) => a + b, 0) / zs.length).toFixed(2)) : null,
    fallAlongEdgeM: zs.length ? Number((Math.max(...zs) - Math.min(...zs)).toFixed(2)) : null,
    midpoint25830: mid.map((q) => Number(q.toFixed(2))),
    midpointWgs84: inv.forward(mid).map((q) => Number(q.toFixed(6))),
  });
}

const vertexZ = ring.slice(0, -1).map((p, i) => ({
  vertex: i, e: Number(p[0].toFixed(2)), n: Number(p[1].toFixed(2)),
  wgs84: inv.forward(p).map((q) => Number(q.toFixed(6))),
  zM: (() => { const z = sampleZ(p[0], p[1]); return z == null ? null : Number(z.toFixed(2)); })(),
}));
const allZ = vertexZ.map((q) => q.zM).filter((q) => q != null);
const centroid = [ring.slice(0, -1).reduce((a, p) => a + p[0], 0) / (ring.length - 1),
  ring.slice(0, -1).reduce((a, p) => a + p[1], 0) / (ring.length - 1)];
const zCentroid = sampleZ(centroid[0], centroid[1]);

console.log('\n── parcel boundary rasant profile (MDT05, 5 m posting, bilinear) ──');
for (const e of edges) console.log(`  edge ${e.edge}: len=${String(e.lengthM).padStart(6)} m bearing=${String(e.bearingDeg).padStart(5)}deg  z ${e.zMin}..${e.zMax} (mean ${e.zMean}) fall=${e.fallAlongEdgeM} m  n=${e.nSamples}`);
console.log('\n── parcel vertices ──');
for (const q of vertexZ) console.log(`  v${q.vertex} ${q.wgs84.join(', ')}  z=${q.zM} m`);
console.log(`\n  boundary z range : ${Math.min(...allZ).toFixed(2)} .. ${Math.max(...allZ).toFixed(2)} m  (fall ${(Math.max(...allZ) - Math.min(...allZ)).toFixed(2)} m)`);
console.log(`  centroid z       : ${zCentroid?.toFixed(2)} m   <-- the single-point value a naive datum would use`);

saveJson('out-08-rasant.json', {
  site: SITE, probedAt: new Date().toISOString(),
  source: { coverage: 'Elevacion25830_5', endpoint: MDT, postingM: G.cell, crs: 'EPSG:25830', format: 'ArcGrid (float)' },
  method: `bilinear interpolation of the 5 m float MDT05 grid; boundary densified at ${STEP_M} m. `
    + 'The 2 m step is INTERPOLATION between 5 m postings — it does not resolve sub-5 m relief.',
  parcelVertices: vertexZ, edges,
  boundaryZMin: Number(Math.min(...allZ).toFixed(2)), boundaryZMax: Number(Math.max(...allZ).toFixed(2)),
  boundaryFallM: Number((Math.max(...allZ) - Math.min(...allZ)).toFixed(2)),
  centroidZ: zCentroid == null ? null : Number(zCentroid.toFixed(2)),
  centroid25830: centroid.map((q) => Number(q.toFixed(2))),
});
console.log('\nwrote out-08-rasant.json');
