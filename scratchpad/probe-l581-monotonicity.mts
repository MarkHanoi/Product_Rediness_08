// §L-581-MONOTONICITY — measure the new flag against 65 real Eixample blocks. OFFLINE, no network.
import { readFileSync } from 'node:fs';
import { solveBlockDerivedDepth } from '../packages/site-parcel-data/src/geometry/blockDerivedDepth.ts';

const blocks = JSON.parse(readFileSync('scratchpad/l581-blocks.fixture.json', 'utf8'));
let n = 0, nulls = 0;
const tally: Record<string, number> = {};
let nonMono = 0, insetDeg = 0, nonMonoOnly = 0, degOnly = 0, both = 0, clean = 0;
const byBinding: Record<string, { t: number; nm: number }> = {};

for (const b of blocks) {
    const r = solveBlockDerivedDepth({
        blockRing: b.blockRing,
        blockEdgeClassifications: b.edgeClassifications,
        interiorFreeRatio: 0.30,
        minDepth_m: 11,
        maxDepth_m: 30,
    } as any);
    n++;
    if (!r) { nulls++; continue; }
    tally[r.binding] = (tally[r.binding] ?? 0) + 1;
    byBinding[r.binding] ??= { t: 0, nm: 0 };
    byBinding[r.binding].t++;
    if (r.interiorFreeNonMonotone) byBinding[r.binding].nm++;
    const nm = r.interiorFreeNonMonotone, id = r.insetDegenerate;
    if (nm) nonMono++;
    if (id) insetDeg++;
    if (nm && id) both++; else if (nm) nonMonoOnly++; else if (id) degOnly++; else clean++;
}
const pc = (x: number) => ((x / (n - nulls)) * 100).toFixed(1) + '%';
console.log(`blocks=${n} solved=${n - nulls} null=${nulls}`);
console.log('bindings:', tally);
console.log(`\nnonMonotone      ${nonMono}  ${pc(nonMono)}   <- SELF-REFUTED geometry`);
console.log(`insetDegenerate  ${insetDeg}  ${pc(insetDeg)}`);
console.log(`\n-- independence (is the new flag redundant?) --`);
console.log(`both              ${both}  ${pc(both)}`);
console.log(`nonMonotone ONLY  ${nonMonoOnly}  ${pc(nonMonoOnly)}   <- caught ONLY by monotonicity`);
console.log(`insetDeg ONLY     ${degOnly}  ${pc(degOnly)}`);
console.log(`clean             ${clean}  ${pc(clean)}`);
console.log(`\n-- per binding --`);
for (const [k, v] of Object.entries(byBinding)) console.log(`${k.padEnd(16)} n=${String(v.t).padStart(3)}  nonMonotone=${v.nm} (${((v.nm / v.t) * 100).toFixed(1)}%)`);
