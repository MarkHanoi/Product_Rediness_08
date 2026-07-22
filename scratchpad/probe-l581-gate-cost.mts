// L-581 — what does it COST to refuse when the bisection's premise is violated?
import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { solveBlockDerivedDepth } from '../packages/site-parcel-data/src/geometry/blockDerivedDepth.js';
interface F { refcat: string; blockRing: Pt[]; edgeClassifications: string[] }
const blocks = JSON.parse(readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8')) as F[];
let depthAnswers = 0, flaggedAmongDepthAnswers = 0, honestAndClean = 0;
for (const b of blocks) {
    const r = solveBlockDerivedDepth({
        blockRing: b.blockRing,
        blockEdgeClassifications: b.edgeClassifications as ParcelEdgeClassification[],
        interiorFreeRatio: 0.30, minDepth_m: 11, maxDepth_m: 30,
    });
    if (!r || r.degenerate) continue;
    depthAnswers++;
    if (r.interiorFreeNonMonotone) { flaggedAmongDepthAnswers++; continue; }
    if (Math.abs(r.achievedFreeRatio - 0.30) < 0.02) honestAndClean++;
}
console.log(`blocks publishing a DEPTH today (post-clamp) : ${depthAnswers}/65`);
console.log(`  of those, bisection premise VIOLATED       : ${flaggedAmongDepthAnswers}  <-- these would refuse`);
console.log(`  surviving a monotonicity gate             : ${depthAnswers - flaggedAmongDepthAnswers}/65`);
console.log(`  ...and landing honestly AT the 30% rule   : ${honestAndClean}`);
console.log(`\nbaseline for comparison: 24/65 answers, only 3 honest`);
