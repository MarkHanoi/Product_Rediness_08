// L-581 — HOW BAD IS THE MONOTONICITY VIOLATION THE CLAMP INTRODUCES?
//
// The clamp took inset soundness from 36.9% to 92.3%, but the shipped-code verification found 49
// (depth, depth+1) pairs where the free area GREW with a DEEPER erosion. That is physically
// impossible, and it matters more than a curiosity: `solveBlockDerivedDepth` BISECTS, and its
// header states the premise explicitly — "`interiorFree` is monotonically NON-INCREASING in `d`
// ... so the largest admissible `d` is found by bisection". If the premise is false, the bisection's
// invariant (`lo` admissible, `hi` not) is unsound and the depth it publishes may not be the largest
// admissible one.
//
// ⚠ THE BASELINE'S "0 VIOLATIONS" IS NOT THE REASSURANCE IT LOOKS LIKE. Before the clamp the offset
// was degenerate on ~2 in 3 blocks, and a degenerate result is skipped by the check — you cannot
// violate monotonicity while returning nothing. That is the SAME blindness measured in the shipped
// `interiorFreeNonMonotone` flag (0 → 0 is monotone). So this is not "clamp made it worse"; it is
// "the clamp produces answers, and now we can see a property the old code hid by failing".
//
// THE QUESTION THIS PROBE ANSWERS: are the violations FLOAT NOISE (ignorable) or STRUCTURAL (a real
// non-monotone region the bisection can land in)? Only the magnitude can say.
//
// Run:  npx tsx scratchpad/probe-l581-monotonicity-magnitude.mts

import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '../packages/site-validators/src/index.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import { solveBlockDerivedDepth } from '../packages/site-parcel-data/src/geometry/blockDerivedDepth.js';

interface Fixture { refcat: string; blockRing: Pt[]; edgeClassifications: string[] }
const blocks = JSON.parse(
    readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8'),
) as Fixture[];
const areaOf = (r: ReadonlyArray<Pt>): number => (r.length < 3 ? 0 : Math.abs(polygonSignedArea(r)));

const free = (b: Fixture, d: number): number => {
    const r = insetPolygonPerEdge(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[],
        { front: d, side: 0, rear: 0, unclassified: 0 });
    return r.degenerate ? 0 : areaOf(r.polygon);
};

// Fine sweep — the bisection samples continuously, so a 1 m grid can miss the region it lands in.
const rel: number[] = [];
let pairs = 0;
const worstBlocks = new Map<string, number>();
for (const b of blocks) {
    const parcel = areaOf(b.blockRing);
    let prev = free(b, 11);
    for (let d = 11.25; d <= 30.0001; d += 0.25) {
        const cur = free(b, d);
        pairs++;
        // Ignore the 0-floor: a collapse to 0 followed by a positive value is the RECOVERY case,
        // already characterised, and is a different fact from a smooth curve bending upward.
        if (prev > 0 && cur > prev) rel.push((cur - prev) / parcel);
        if (prev > 0 && cur > prev) {
            worstBlocks.set(b.refcat, Math.max(worstBlocks.get(b.refcat) ?? 0, (cur - prev) / parcel));
        }
        prev = cur;
    }
}
rel.sort((a, b) => a - b);
console.log(`(depth, depth+0.25) pairs sampled : ${pairs}`);
console.log(`violations (excluding recovery-from-0) : ${rel.length} (${((rel.length / pairs) * 100).toFixed(2)}%)`);
if (rel.length) {
    console.log(`increase as a FRACTION OF BLOCK AREA:`);
    console.log(`   median ${(rel[rel.length >> 1]! * 100).toExponential(2)} %`);
    console.log(`   p90    ${(rel[Math.floor(rel.length * 0.9)]! * 100).toExponential(2)} %`);
    console.log(`   MAX    ${(rel[rel.length - 1]! * 100).toFixed(4)} %`);
    console.log(`blocks affected: ${worstBlocks.size}/${blocks.length}`);
}
console.log(`\n⚠ READ THIS AS: a max well under 0.01% of block area is FLOAT/MITRE NOISE and cannot`);
console.log(`  move a depth. A max of whole percent is a STRUCTURAL non-monotone region and the`);
console.log(`  bisection can converge to the wrong depth inside it.`);

// ── Does it actually reach the SOLVER? The production-relevant number. ───────
let flagged = 0, solved = 0;
for (const b of blocks) {
    const res = solveBlockDerivedDepth({
        blockRing: b.blockRing,
        blockEdgeClassifications: b.edgeClassifications as ParcelEdgeClassification[],
        interiorFreeRatio: 0.30, minDepth_m: 11, maxDepth_m: 30,
    });
    if (!res) continue;
    solved++;
    if (res.interiorFreeNonMonotone) flagged++;
}
console.log(`\nSOLVER-VISIBLE: interiorFreeNonMonotone fires on ${flagged}/${solved} blocks`);
console.log('  (this flag samples ONLY the depths the bisection actually visited — the honest');
console.log('   production measure of whether a published depth rests on a non-monotone region)');
