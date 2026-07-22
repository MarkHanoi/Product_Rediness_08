// L-581 NEXT ROOT CAUSE — are the dissolved block rings full of NEAR-COLLINEAR edges?
//
// HYPOTHESIS, stated before the evidence so it can lose. The block ring is a DISSOLVE of adjacent
// cadastral parcels. Along a straight street, every parcel boundary contributes a vertex, so the
// ring carries long runs of vertices that are very nearly collinear. A miter offset intersects
// CONSECUTIVE offset lines; two lines differing by a hundredth of a degree meet KILOMETRES away.
// `lineIntersect` only refuses at |cross| < 1e-9 — about 6e-8 degrees — so it happily returns those
// points. That would explain the escape distances the census reports (median 8 m, max 1,736 m, and
// 5.6 km at 30 m depth) and it would explain G5 (inset area > parcel area) as the dominant
// remaining failure: a ring with one vertex a kilometre away encloses far more than the block.
//
// IF TRUE the remedy is not more clamping — it is to MERGE near-collinear consecutive edges before
// offsetting, which is a pre-pass on the ring and cannot distort a legitimate corner.
// IF FALSE the turn-angle distribution will show clean corners and I need a different explanation.
import { readFileSync } from 'node:fs';
type Pt = { x: number; z: number };
interface F { refcat: string; blockRing: Pt[]; edgeClassifications: string[] }
const blocks = JSON.parse(readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8')) as F[];

const turnDeg = (a: Pt, b: Pt, c: Pt): number => {
    const v1x = b.x - a.x, v1z = b.z - a.z, v2x = c.x - b.x, v2z = c.z - b.z;
    const l1 = Math.hypot(v1x, v1z), l2 = Math.hypot(v2x, v2z);
    if (l1 < 1e-9 || l2 < 1e-9) return 0;
    const cosang = Math.max(-1, Math.min(1, (v1x * v2x + v1z * v2z) / (l1 * l2)));
    return (Math.acos(cosang) * 180) / Math.PI;   // 0 = perfectly collinear
};

const all: number[] = [];
let nearCollinear = 0, total = 0, shortEdges = 0, totalEdges = 0;
for (const b of blocks) {
    const r = b.blockRing;
    for (let i = 0; i < r.length; i++) {
        const a = r[i]!, m = r[(i + 1) % r.length]!, c = r[(i + 2) % r.length]!;
        const t = turnDeg(a, m, c);
        all.push(t); total++;
        if (t < 1.0) nearCollinear++;
        const len = Math.hypot(m.x - a.x, m.z - a.z);
        totalEdges++; if (len < 1.0) shortEdges++;
    }
}
all.sort((x, y) => x - y);
console.log(`vertices across 65 real blocks : ${total}`);
console.log(`turn angle  p10 ${all[Math.floor(total*0.1)]!.toFixed(3)}°  median ${all[total>>1]!.toFixed(2)}°  p90 ${all[Math.floor(total*0.9)]!.toFixed(1)}°`);
console.log(`NEAR-COLLINEAR (turn < 1.0°)  : ${nearCollinear}  (${(nearCollinear/total*100).toFixed(1)}%)`);
for (const t of [0.1, 0.5, 1, 2, 5]) {
    const c = all.filter((v) => v < t).length;
    console.log(`   turn < ${String(t).padStart(4)}°  : ${String(c).padStart(5)}  (${(c/total*100).toFixed(1)}%)`);
}
console.log(`edges shorter than 1 m        : ${shortEdges} / ${totalEdges} (${(shortEdges/totalEdges*100).toFixed(1)}%)`);
// How far away does a miter land for a given turn angle, at a 11 m offset difference?
console.log(`\nMITER DISTANCE for an 11 m offset step, by turn angle (why this matters):`);
for (const t of [0.1, 0.5, 1, 2, 5, 30]) {
    const d = 11 / Math.tan((t * Math.PI) / 180 / 2);
    console.log(`   turn ${String(t).padStart(4)}°  →  miter vertex ~${d.toFixed(0)} m from the corner`);
}
console.log(`\n⇒ if a large share of turns sit under ~1°, the miter is placing vertices HUNDREDS of`);
console.log(`  metres out on geometry that is, in reality, a straight street edge.`);
