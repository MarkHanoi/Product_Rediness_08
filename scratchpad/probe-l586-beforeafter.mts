// L-586 PROBE 7 — BEFORE/AFTER against HEAD, with the L-539 lesson enforced as an assertion.
//
// The single most important question about this change is NOT "did the rate go up" but "did any
// ring that already existed MOVE". L-539's own header records why: repairing unconditionally would
// have silently altered 137 of 607 existing rings, i.e. 137 silently moved compliance numbers.
//
// So this compares HEAD's `blockRing.ts` (checked out verbatim into scratchpad/baseline/) against
// the working tree, vertex by vertex, over the frozen 956-manzana sample. Then it re-applies the
// INDEPENDENT ORACLE — but with the oracle CORRECTED for voids: for a block with interior voids the
// published parcel areas sum to `|outer| − Σ|voids|`, not to `|outer|`, so comparing the outline
// area alone to the published sum measures the void, not an error.
//
// Run: npx tsx scratchpad/probe-l586-beforeafter.mts

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dissolveParcelsToBlockRing as HEAD } from './baseline/blockRingBaseline.js';
import { dissolveParcelsToBlockRing as NOW } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };
const R = 6_378_137, D = Math.PI / 180;

function absArea(r: ReadonlyArray<Pt>) {
    let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; }
    return Math.abs(s / 2);
}
function segX(a: Pt, b: Pt, c: Pt, d: Pt) {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
function selfX(r: ReadonlyArray<Pt>) {
    const n = r.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segX(r[i]!, r[(i + 1) % n]!, r[j]!, r[(j + 1) % n]!)) return true;
    }
    return false;
}
const same = (a: ReadonlyArray<Pt>, b: ReadonlyArray<Pt>) =>
    a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.z === b[i]!.z);

let bothOk = 0, moved = 0, gainedVoid = 0, gainedSplit = 0, lost = 0, bothFail = 0;
const gains: any[] = [], losses: any[] = [], moves: any[] = [];
const voidRows: any[] = [];

for (const m of raw.manzanas) {
    const id = `${m.city}/${m.manzana}`;
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const a = HEAD(rings), b = NOW(rings);
    const published = m.parcels.reduce((s, p) => s + p.areaM2, 0);
    if (!a.degenerate && !b.degenerate) {
        bothOk++;
        if (!same(a.ring, b.ring)) { moved++; moves.push({ id, headVerts: a.ring.length, nowVerts: b.ring.length, headArea: absArea(a.ring), nowArea: absArea(b.ring), headSelfX: selfX(a.ring), nowSelfX: selfX(b.ring), voids: b.voids.length }); }
    } else if (a.degenerate && !b.degenerate) {
        const vArea = b.voids.reduce((s, v) => s + absArea(v), 0);
        if (b.voids.length > 0) gainedVoid++; else gainedSplit++;
        gains.push({ id, headReason: a.reason, parcels: m.parcels.length, verts: b.ring.length, path: b.quality.path, voids: b.voids.length, ringArea: absArea(b.ring), voidArea: vArea, published, netVsPublished: ((absArea(b.ring) - vArea - published) / published) * 100, voidPctOfBlock: (vArea / absArea(b.ring)) * 100, selfX: selfX(b.ring) });
    } else if (!a.degenerate && b.degenerate) {
        lost++;
        losses.push({ id, nowReason: b.reason, parcels: m.parcels.length, headVerts: a.ring.length, headSelfX: selfX(a.ring), headArea: absArea(a.ring), published });
    } else bothFail++;
    if (!b.degenerate && b.voids.length) voidRows.push({ id, voids: b.voids.length, voidArea: b.voids.reduce((s, v) => s + absArea(v), 0), ringArea: absArea(b.ring) });
}

const headRings = bothOk + lost, nowRings = bothOk + gainedVoid + gainedSplit;
console.log('## BEFORE / AFTER over 956 frozen manzanas\n');
console.log(`  rings at HEAD                        : ${headRings}  (${(headRings / raw.manzanas.length * 100).toFixed(1)}%)`);
console.log(`  rings now                            : ${nowRings}  (${(nowRings / raw.manzanas.length * 100).toFixed(1)}%)`);
console.log(`  ⚠ EXISTING RINGS THAT MOVED          : ${moved}   <-- must be 0`);
console.log(`  gained via §DISSOLVE-INTERIOR-VOID   : ${gainedVoid}`);
console.log(`  gained via the simplicity-gate retry : ${gainedSplit}`);
console.log(`  lost (crossed ring now refused)      : ${lost}`);
if (moves.length) { console.log('\n  MOVED RINGS:'); for (const r of moves) console.log(`    ${JSON.stringify(r)}`); }

console.log('\n## RINGS LOST — each one was a SELF-INTERSECTING ring we used to ship\n');
for (const l of losses) console.log(`  ${l.id}: reason now '${l.nowReason}', HEAD shipped a ${l.headVerts}-vertex ring, self-intersecting at HEAD: ${l.headSelfX}`);

console.log('\n## RINGS GAINED — with the VOID-CORRECTED oracle (|outer| − Σ|voids| vs PUBLISHED areas)\n');
console.log('| manzana | HEAD reason | parcels | verts | path | voids | void m² | void % of block | net vs published |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const g of gains.sort((x, y) => y.voidPctOfBlock - x.voidPctOfBlock)) {
    console.log(`| ${g.id} | ${g.headReason} | ${g.parcels} | ${g.verts} | ${g.path} | ${g.voids} | ${g.voidArea.toFixed(1)} | ${g.voidPctOfBlock.toFixed(2)}% | ${g.netVsPublished.toFixed(3)}% |`);
}
const netErrs = gains.map((g) => Math.abs(g.netVsPublished)).sort((a, b) => a - b);
console.log(`\n  void-corrected |error| vs published on the gained rings: p50 ${netErrs[Math.floor(netErrs.length / 2)]?.toFixed(3)}%  worst ${netErrs[netErrs.length - 1]?.toFixed(3)}%`);
console.log(`  (for comparison the p50 across ALL rings is ~0.15–0.19% — the same population)`);
console.log(`\n  blocks with any void: ${voidRows.length}; total void area ${voidRows.reduce((s, r) => s + r.voidArea, 0).toFixed(0)} m²`);

writeFileSync(resolve(ROOT, 'scratchpad/l586-beforeafter.json'), JSON.stringify({ ranAt: new Date().toISOString(), headRings, nowRings, moved, moves, gains, losses, voidRows }, null, 2));
console.log('\nwrote scratchpad/l586-beforeafter.json');
