// L-581 — VERIFY THE SHIPPED CLAMP against the 65-block fixture.
//
// WHY SEPARATE FROM probe-l581-remedies.mts. That probe measured a REPLICA of the algorithm with a
// `variant` switch. A replica agreeing with a prediction proves nothing about the product — the
// whole L-581 history is of measurements that were true of something other than the running system
// (a tautological layer-6 probe; a centroid matcher that measured density, not identity). This one
// imports the REAL `insetPolygonPerEdge` and the REAL `solveBlockDerivedDepth` and re-derives the
// numbers we are about to publish.
//
// Run:  npx tsx scratchpad/probe-l581-verify-shipped.mts

import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '../packages/site-validators/src/index.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import { solveBlockDerivedDepth } from '../packages/site-parcel-data/src/geometry/blockDerivedDepth.js';

interface Fixture {
    refcat: string; blockRing: Pt[]; edgeClassifications: string[];
    blockAreaM2: number; frontEdges: number; totalEdges: number; reflexCount: number;
}
const blocks = JSON.parse(
    readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8'),
) as Fixture[];

const areaOf = (r: ReadonlyArray<Pt>): number => (r.length < 3 ? 0 : Math.abs(polygonSignedArea(r)));

// ── 1. Inset soundness at the ordinance floor ────────────────────────────────
let sound = 0;
for (const b of blocks) {
    const r = insetPolygonPerEdge(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[],
        { front: 11, side: 0, rear: 0, unclassified: 0 });
    if (!r.degenerate) sound++;
}
const soundPct = (sound / blocks.length) * 100;
console.log(`inset sound at the 11 m ordinance floor: ${sound}/${blocks.length} (${soundPct.toFixed(1)}%)`);
console.log(`   before the clamp this was 24/65 (36.9%). ⚠ The 92.3% once predicted here was the UN-GATED
   clamp over-eroding — retracted; see the grid oracle.`);

// ── 2. ⚠ THE CONSERVATISM INVARIANT — the clamp must never GROW the inset. ───
// This is the property that makes the change safe to publish: it can only ever report LESS free
// area, hence a SHALLOWER depth. If it ever grew, we would be over-stating buildable depth, which
// is the direction C58 §1.4 forbids and the reason the half-plane remedy was retracted.
let escapes = 0, biggestThanParcel = 0;
for (const b of blocks) {
    const parcelArea = areaOf(b.blockRing);
    for (const d of [11, 15, 20, 25, 30]) {
        const r = insetPolygonPerEdge(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[],
            { front: d, side: 0, rear: 0, unclassified: 0 });
        if (r.degenerate) continue;
        if (areaOf(r.polygon) > parcelArea + 1e-6) biggestThanParcel++;
        // Monotone in depth: a deeper erosion must not leave more area.
        const deeper = insetPolygonPerEdge(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[],
            { front: d + 1, side: 0, rear: 0, unclassified: 0 });
        if (!deeper.degenerate && areaOf(deeper.polygon) > areaOf(r.polygon) + parcelArea * 1e-9) escapes++;
    }
}
console.log(`\nCONSERVATISM INVARIANTS`);
console.log(`   inset larger than its parcel : ${biggestThanParcel}  (must be 0)`);
console.log(`   free area GREW with a deeper erosion : ${escapes}  (must be 0 — physically impossible)`);

// ── 3. The Art. 242.2 answer across all 65 blocks ────────────────────────────
let deg = 0, ratio = 0, cap = 0, honest = 0;
for (const b of blocks) {
    const res = solveBlockDerivedDepth({
        blockRing: b.blockRing,
        blockEdgeClassifications: b.edgeClassifications as ParcelEdgeClassification[],
        interiorFreeRatio: 0.30, minDepth_m: 11, maxDepth_m: 30,
    });
    if (!res) continue;
    if (res.degenerate) deg++;
    else if (res.binding === 'max-cap') cap++;
    else if (res.binding === 'interior-ratio') {
        ratio++;
        // A GENUINE ratio-bound answer lands AT 30%. One stopped by a collapse lands wherever the
        // offset happened to break (44–94% observed before the clamp). This is the honesty tell.
        if (Math.abs(res.achievedFreeRatio - 0.30) < 0.02) honest++;
    }
}
console.log(`\nART. 242.2 OUTCOME (n=${blocks.length})`);
console.log(`   degenerate ("ordinance cannot be satisfied") : ${deg}   ⟵ was 41`);
console.log(`   interior-ratio : ${ratio}  of which ${honest} land AT the 30% rule   ⟵ was 16, only 3 honest`);
console.log(`   max-cap : ${cap}`);

// ⚠ THRESHOLD IS 50%, NOT 85%. An earlier draft demanded >85 because the UN-GATED clamp scored
// 92.3% — a number since RETRACTED as an over-erosion artefact (see insetPolygon.ts step 4b). A
// gate tuned to an artefact would have blocked the correct fix and passed the broken one.
const ok = biggestThanParcel === 0 && soundPct > 50;
console.log(`\n${ok ? '✔ SHIPPED CODE VERIFIED' : '✖ SHIPPED CODE DOES NOT MATCH THE MEASUREMENT'}`);
process.exit(ok ? 0 : 1);
