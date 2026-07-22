// L-586 — PER-BLOCK INDEPENDENT ORACLE for the capsule-union inset, on all 65 real Eixample blocks.
//
// ⚠ WHY THIS EXISTS. `probe-l581-verify-shipped.mts` reports an AGGREGATE (how many blocks came out
// geometrically sound). L-581 proved that an aggregate is not evidence: the retracted global clamp
// scored 92.3% sound while returning 256 m² on a block whose true inset is 3,227 m² — wrong by 12×,
// with every aggregate still looking healthy. So this probe compares AREA, BLOCK BY BLOCK, against
// a completely different algorithm.
//
// THE ORACLE. Rasterise the block and keep every cell whose centre satisfies the DEFINITION of a
// per-edge setback inset:  q ∈ parcel  AND  dist(q, segment_j) ≥ s_j for every edge j. No
// offsetting, no mitring, no arcs, no loop decomposition — nothing the implementation does. Grid
// centre-sampling costs roughly perimeter × step / 2 of area noise, which is stated per block.
//
// THE TWO THINGS IT MUST SHOW:
//   1. CONSERVATISM (C58 §1.4) — code area ≤ oracle area. Over-stating buildable area is the
//      failure that is not allowed to happen, and it is invisible to a soundness count.
//   2. FIDELITY — code area is not a small fraction of the oracle. "Conservative" is also satisfied
//      by returning nothing, which is how L-525b shipped a floored depth for two years.
//
// Run:  npx tsx scratchpad/probe-l586-oracle-65.mts

import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '../packages/site-validators/src/index.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';

interface Fixture {
    refcat: string; blockRing: Pt[]; edgeClassifications: string[];
    blockAreaM2: number; frontEdges: number; totalEdges: number; reflexCount: number;
}
const blocks = JSON.parse(
    readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8'),
) as Fixture[];

// DEPTH sweeps the whole range `solveBlockDerivedDepth` bisects over (11 → 30 m). MODE=uniform
// applies the depth to EVERY edge instead of only the fronts — the 11 m floor with side: 0 is the
// gentlest call the solver ever makes, so measuring only there would leave the deep end unproven.
const DEPTH = Number(process.env.DEPTH ?? 11);
const MODE = process.env.MODE ?? 'party-wall';
const SETBACKS = MODE === 'uniform'
    ? { front: DEPTH, side: DEPTH, rear: DEPTH, unclassified: DEPTH }
    : { front: DEPTH, side: 0, rear: 0, unclassified: 0 };
const STEP = Number(process.env.GRID ?? 0.5);

const areaOf = (r: ReadonlyArray<Pt>): number => (r.length < 3 ? 0 : Math.abs(polygonSignedArea(r)));

function inside(p: Pt, r: ReadonlyArray<Pt>): boolean {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i]!, b = r[j]!;
        if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
}
function segDist(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
    return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}
/** ORACLE: the erosion, straight from its definition. */
function oracleArea(ring: Pt[], cls: string[]): number {
    const s = ring.map((_, i) => {
        const c = cls[i];
        return c === 'front' ? SETBACKS.front : c === 'side' ? SETBACKS.side
            : c === 'rear' ? SETBACKS.rear : SETBACKS.unclassified;
    });
    const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let cells = 0;
    for (let x = x0 + STEP / 2; x <= x1; x += STEP) {
        for (let z = z0 + STEP / 2; z <= z1; z += STEP) {
            const p = { x, z };
            if (!inside(p, ring)) continue;
            let ok = true;
            for (let j = 0; j < ring.length; j++) {
                if (s[j]! <= 0) continue;
                if (segDist(p, ring[j]!, ring[(j + 1) % ring.length]!) < s[j]!) { ok = false; break; }
            }
            if (ok) cells++;
        }
    }
    return cells * STEP * STEP;
}

console.log(`65-block oracle check · setbacks ${JSON.stringify(SETBACKS)} · grid ${STEP} m\n`);
let over = 0, degenerate = 0, worstOverM2 = 0, worstOverRef = '';
const ratios: Array<{ ref: string; code: number; oracle: number; ratio: number }> = [];
for (const b of blocks) {
    const res = insetPolygonPerEdge(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[], SETBACKS);
    const code = res.degenerate ? 0 : areaOf(res.polygon);
    const orc = oracleArea(b.blockRing, b.edgeClassifications);
    if (res.degenerate) degenerate++;
    // Grid noise allowance: centre-sampling of a boundary of length ~4·√A costs ~2·√A·STEP.
    const noise = 2 * Math.sqrt(Math.max(orc, 1)) * STEP + STEP * STEP;
    if (code > orc + noise) {
        over++;
        if (code - orc > worstOverM2) { worstOverM2 = code - orc; worstOverRef = b.refcat; }
    }
    ratios.push({ ref: b.refcat, code, oracle: orc, ratio: orc > 1 ? code / orc : 1 });
}
ratios.sort((a, b) => a.ratio - b.ratio);
const med = ratios[Math.floor(ratios.length / 2)]!;
console.log(`OVER-STATEMENTS (code area > oracle + grid noise) : ${over}/65   ⚠ must be 0 (C58 §1.4)`);
if (over) console.log(`   worst: ${worstOverRef} by ${worstOverM2.toFixed(0)} m²`);
console.log(`degenerate (code returned nothing)               : ${degenerate}/65`);
console.log(`code/oracle area ratio  min ${ratios[0]!.ratio.toFixed(3)} (${ratios[0]!.ref})  median ${med.ratio.toFixed(3)}  max ${ratios[ratios.length - 1]!.ratio.toFixed(3)}`);
console.log(`\nWORST 8 BY FIDELITY (named blocks, not an aggregate):`);
for (const r of ratios.slice(0, 8)) {
    console.log(`   ${r.ref}  code ${r.code.toFixed(0)} m²  oracle ${r.oracle.toFixed(0)} m²  ratio ${r.ratio.toFixed(3)}`);
}
console.log(`\nBEST 4:`);
for (const r of ratios.slice(-4)) {
    console.log(`   ${r.ref}  code ${r.code.toFixed(0)} m²  oracle ${r.oracle.toFixed(0)} m²  ratio ${r.ratio.toFixed(3)}`);
}
const ok = over === 0;
console.log(`\n${ok ? '✔ NO OVER-STATEMENT AGAINST THE INDEPENDENT ORACLE' : '✖ OVER-STATES — C58 §1.4 VIOLATION'}`);
process.exit(ok ? 0 : 1);
