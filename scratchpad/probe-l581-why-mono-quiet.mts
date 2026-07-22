import { readFileSync } from 'node:fs';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.ts';
const blocks = JSON.parse(readFileSync('scratchpad/l581-blocks.fixture.json', 'utf8'));
const areaOf = (r: any[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a.x * b.z - b.x * a.z; } return Math.abs(s / 2); };

// For each block, sweep depth and record the free-area CURVE. Where does it go to zero, and does it
// ever come back? That is what decides whether monotonicity can see the pathology at all.
let staysZero = 0, comesBack = 0, neverZero = 0;
const depths = [11, 13, 15, 17, 19, 21, 23, 25, 27, 30];
for (const b of blocks) {
    const curve = depths.map(d => {
        const r = insetPolygonPerEdge(b.blockRing, b.edgeClassifications, { front: d, side: 0, rear: 0, unclassified: 0 });
        return r.degenerate ? 0 : areaOf(r.polygon);
    });
    const firstZero = curve.findIndex(a => a === 0);
    if (firstZero === -1) { neverZero++; continue; }
    if (curve.slice(firstZero).some(a => a > 0)) comesBack++; else staysZero++;
}
console.log(`n=${blocks.length}`);
console.log(`collapses and STAYS zero : ${staysZero}  <- monotonicity is BLIND to these`);
console.log(`collapses then RECOVERS  : ${comesBack}  <- the only ones monotonicity can catch`);
console.log(`never collapses          : ${neverZero}`);
// And the critical question: how many collapse AT OR BELOW the 11 m ordinance floor?
let atFloor = 0;
for (const b of blocks) {
    const r = insetPolygonPerEdge(b.blockRing, b.edgeClassifications, { front: 11, side: 0, rear: 0, unclassified: 0 });
    if (r.degenerate || areaOf(r.polygon) === 0) atFloor++;
}
console.log(`\ncollapsed already at the 11 m FLOOR: ${atFloor}/${blocks.length} (${(atFloor / blocks.length * 100).toFixed(1)}%)`);
