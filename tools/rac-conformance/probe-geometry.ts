#!/usr/bin/env tsx
/**
 * tools/rac-conformance/probe-geometry.ts — CATEGORY 5, MEASURED IN MILLIMETRES.
 *
 * THE EDGE-MIDPOINT ORACLE. For a parallel offset by d, EVERY edge midpoint of
 * the result sits exactly d from the source boundary. Midpoints are used
 * deliberately: they avoid the corner mitre wedge, where a correct offset also
 * moves the vertex further than d. A CENTROID SCALE pulls each point back in
 * proportion to its distance from the centre, so on any non-circular plan the
 * per-edge distances FAN OUT. Therefore:
 *
 *     magnitude ≈ d       proves the offset is the right SIZE
 *     spread    ≈ 0       proves it is an OFFSET and not a SCALE
 *
 * Only both together are a proof. "Looks approximately right" is neither.
 */
import { offsetPolygon, offsetPolygonOrSelf, type Pt2 } from '../../packages/geometry-kernel/src/pure/polygonOffset.js';

const MM = (m: number) => m * 1000;
function distToSeg(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}
function distToRing(p: Pt2, ring: readonly Pt2[]): number {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) m = Math.min(m, distToSeg(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return m;
}
function measure(src: readonly Pt2[], out: readonly Pt2[]) {
  const ds: number[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!, b = out[(i + 1) % out.length]!;
    ds.push(distToRing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], src));
  }
  const min = Math.min(...ds), max = Math.max(...ds);
  return { n: out.length, minMm: MM(min), maxMm: MM(max), spreadMm: MM(max - min), meanMm: MM(ds.reduce((s, x) => s + x, 0) / ds.length) };
}
const CASES: { name: string; poly: Pt2[]; d: number }[] = [
  { name: 'square 10x10, +300mm overhang',      poly: [[0,0],[10,0],[10,10],[0,10]], d: 0.3 },
  { name: 'elongated 40x4, +300mm overhang',    poly: [[0,0],[40,0],[40,4],[0,4]], d: 0.3 },
  { name: 'L-plan, +300mm overhang',            poly: [[0,0],[12,0],[12,6],[6,6],[6,12],[0,12]], d: 0.3 },
  { name: 'U-plan/courtyard, +300mm overhang',  poly: [[0,0],[14,0],[14,10],[10,10],[10,4],[4,4],[4,10],[0,10]], d: 0.3 },
  { name: 'square 10x10, -200mm inset',         poly: [[0,0],[10,0],[10,10],[0,10]], d: -0.2 },
  { name: 'L-plan, -200mm inset',               poly: [[0,0],[12,0],[12,6],[6,6],[6,12],[0,12]], d: -0.2 },
];
console.log('#### PARALLEL-OFFSET ORACLE (tolerance: |mean−d| ≤ 1mm AND spread ≤ 1mm)\n');
console.log('| case | requested | n(src)→n(out) | mean mm | min mm | max mm | SPREAD mm | verdict |');
console.log('|---|---:|---|---:|---:|---:|---:|---|');
for (const c of CASES) {
  const r = offsetPolygon(c.poly, c.d);
  if (r.degenerate || r.polygon.length < 3) { console.log(`| ${c.name} | ${MM(c.d)} | ${c.poly.length}→${r.polygon.length} | — | — | — | — | DEGENERATE: ${r.reason ?? '?'} |`); continue; }
  const m = measure(c.poly, r.polygon);
  const ok = Math.abs(m.meanMm - Math.abs(MM(c.d))) <= 1 && m.spreadMm <= 1;
  const vc = r.polygon.length === c.poly.length;
  console.log(`| ${c.name} | ${MM(c.d)} | ${c.poly.length}→${r.polygon.length}${vc?'':' ⚠VERTS LOST'} | ${m.meanMm.toFixed(2)} | ${m.minMm.toFixed(2)} | ${m.maxMm.toFixed(2)} | ${m.spreadMm.toFixed(3)} | ${ok && vc ? 'PASS' : 'FAIL'} |`);
}
console.log('\n#### IMPOSSIBLE OFFSET — must REFUSE, never substitute\n');
for (const [name, poly, d] of [
  ['square 10x10, inset 50m (inradius 5m)', [[0,0],[10,0],[10,10],[0,10]], -50],
  ['square 10x10, inset 5m (exactly inradius)', [[0,0],[10,0],[10,10],[0,10]], -5],
  ['L-plan, inset 50m', [[0,0],[12,0],[12,6],[6,6],[6,12],[0,12]], -50],
] as [string, Pt2[], number][]) {
  const r = offsetPolygon(poly, d);
  console.log(`- **${name}** → degenerate=${r.degenerate} verts=${r.polygon.length} reason=${JSON.stringify(r.reason ?? null)} → **${r.degenerate || r.polygon.length < 3 ? 'REFUSED (correct)' : 'SUBSTITUTED (WRONG)'}**`);
}
console.log('\n#### DEGENERATE FOOTPRINT — must not be reported as success\n');
for (const [name, poly] of [
  ['3 identical points (0,0)(0,0)(0,0)', [[0,0],[0,0],[0,0]]],
  ['2 points only', [[0,0],[5,0]]],
  ['collinear 3 points', [[0,0],[5,0],[10,0]]],
] as [string, Pt2[]][]) {
  const r = offsetPolygonOrSelf(poly, 0.3);
  console.log(`- **${name}** → degenerate=${r.degenerate} verts=${r.polygon.length} reason=${JSON.stringify(r.reason ?? null)}`);
}
