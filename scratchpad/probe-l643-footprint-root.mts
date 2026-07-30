// §L-643 — ROOT-CAUSE PROBE: why does a shallow Barcelona 13a parcel get the WHOLE parcel as its
// buildable footprint, covering the pati d'illa?
//
// The audit narrows it to two candidates, distinguishable only on real block geometry:
//   (B1) the Art-242.2 CONSTRUCTED depth is OVER-SOLVED for the block → bandInactive fires when it
//        should not (a correct, smaller depth would bind and cut the rear).
//   (B2) a pati-d'illa (block-interior-free) exclusion is MISSING → the fix is
//        footprint = depth-band ∩ parcel ∩ complement(block-interior-free).
//
// This probe runs BOTH tests on the 65 REAL dissolved Eixample 13a blocks, each with an INDEPENDENT
// algorithm (grid rasterisation), never the shipping offset it is trying to judge:
//
//   TEST B1  — solved depth `d` vs an oracle depth = the 70th percentile of the distance-to-frontage
//              field (interiorFreeRatio 0.30 ⇒ buildable band is the closest 70% of the block).
//              If the code runs systematically DEEPER than the oracle, the depth over-states (B1).
//
//   TEST B2  — for a SHALLOW founder-like frontage parcel (~412 m², front edge ON the block
//              boundary, depth < d so bandInactive fires), measure area(parcel ∩ interiorFree) by
//              rasterisation. That is EXACTLY the area the audit's "∩ block-interior-free" fix would
//              remove. If it is 0 on every block, the proposed B2 fix is a NO-OP for the founder's
//              case and cannot be the mechanism.
//
//   TEST B2' — the OFFSET sub-case: the SAME parcel pushed 6 m in from the frontage (front edge no
//              longer on the block boundary). Shows whether "∩ interiorFree" ever bites — i.e. the
//              only geometry under which the audit's B2 fix does real work.
//
// Run:  npx tsx scratchpad/probe-l643-footprint-root.mts

import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '../packages/site-validators/src/index.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import { solveBlockDerivedDepth } from '../packages/site-parcel-data/src/geometry/blockDerivedDepth.js';
import { clipToDepthBand } from '../packages/site-parcel-data/src/geometry/depthBandClip.js';

const FIXTURE = new URL('./l581-blocks.fixture.json', import.meta.url);

interface Fixture {
    refcat: string;
    blockRing: Pt[];
    edgeClassifications: string[];
    blockAreaM2: number;
    frontEdges: number;
    totalEdges: number;
}
const blocks = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture[];

// Eixample Art-242.2 parameters (esBarcelonaEnsanche.ts BCN_ENSANCHE_RULE).
const RATIO = 0.3, MIN_D = 11, MAX_D = 30;
const STEP = 0.5;   // rasterisation cell (m)

const area = (r: ReadonlyArray<Pt>) => (r.length < 3 ? 0 : Math.abs(polygonSignedArea(r)));

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
// Rasterised area of the intersection of two polygons (no boolean lib in repo; grid is independent).
function intersectArea(polyA: ReadonlyArray<Pt>, polyB: ReadonlyArray<Pt>): number {
    if (polyA.length < 3 || polyB.length < 3) return 0;
    const xs = [...polyA, ...polyB].map((p) => p.x), zs = [...polyA, ...polyB].map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let n = 0;
    for (let x = x0 + STEP / 2; x <= x1; x += STEP)
        for (let z = z0 + STEP / 2; z <= z1; z += STEP) {
            const p = { x, z };
            if (inside(p, polyA) && inside(p, polyB)) n++;
        }
    return n * STEP * STEP;
}

// Oracle depth for the 0.30 interior-free rule: buildable band = closest 70% of the block area, so
// the depth is the 70th percentile of the distance-to-nearest-frontage field. Independent of the
// shipping offset entirely.
function oracleDepth(ring: Pt[], cls: string[]): number | null {
    const fronts: Array<[Pt, Pt]> = [];
    for (let i = 0; i < ring.length; i++) if (cls[i] === 'front') fronts.push([ring[i]!, ring[(i + 1) % ring.length]!]);
    if (fronts.length === 0) return null;
    const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z);
    const dists: number[] = [];
    for (let x = Math.min(...xs) + STEP / 2; x <= Math.max(...xs); x += STEP)
        for (let z = Math.min(...zs) + STEP / 2; z <= Math.max(...zs); z += STEP) {
            const p = { x, z };
            if (!inside(p, ring)) continue;
            let d = Infinity;
            for (const [a, b] of fronts) { const dd = segDist(p, a, b); if (dd < d) d = dd; }
            dists.push(d);
        }
    if (dists.length < 100) return null;
    dists.sort((a, b) => a - b);
    return dists[Math.min(dists.length - 1, Math.floor(dists.length * (1 - RATIO)))]!;   // 70th pct
}

// Build a founder-like shallow frontage parcel on the LONGEST front edge: width WIDTH along the
// edge, depth D_PARCEL inward. front edge ON the block boundary (offset=0). Returns null if the
// edge is too short to seat a realistic parcel.
function frontParcel(ring: Pt[], cls: string[], depth: number, width: number, offsetIn: number):
    { poly: Pt[]; a: Pt; b: Pt } | null {
    let best = -1, bi = -1;
    for (let i = 0; i < ring.length; i++) {
        if (cls[i] !== 'front') continue;
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len > best) { best = len; bi = i; }
    }
    if (bi < 0 || best < width) return null;
    const a = ring[bi]!, b = ring[(bi + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ex = (b.x - a.x) / len, ez = (b.z - a.z) / len;          // unit along edge
    // inward normal: pick the candidate pointing into the block centroid
    let nx = -ez, nz = ex;
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
    if ((cx - a.x) * nx + (cz - a.z) * nz < 0) { nx = -nx; nz = -nz; }
    const startT = (len - width) / 2;                              // centre the parcel on the edge
    const p0 = { x: a.x + ex * startT + nx * offsetIn, z: a.z + ez * startT + nz * offsetIn };
    const p1 = { x: p0.x + ex * width, z: p0.z + ez * width };
    const p2 = { x: p1.x + nx * depth, z: p1.z + nz * depth };
    const p3 = { x: p0.x + nx * depth, z: p0.z + nz * depth };
    // the parcel's OWN front edge, from which clipToDepthBand measures (p0->p1)
    return { poly: [p0, p1, p2, p3], a: p0, b: p1 };
}

interface Row {
    refcat: string; areaM2: number; d: number | null; binding: string; insetDeg: boolean;
    oracle: number | null; deeper: number | null;
    parcelA: number; curFoot: number; b2Removed: number; b2primeRemoved: number; bandInactive: boolean;
}
const rows: Row[] = [];

for (const bl of blocks) {
    const solved = solveBlockDerivedDepth({
        blockRing: bl.blockRing,
        blockEdgeClassifications: bl.edgeClassifications as ParcelEdgeClassification[],
        interiorFreeRatio: RATIO, minDepth_m: MIN_D, maxDepth_m: MAX_D,
    });
    const d = solved && !solved.degenerate ? solved.depth_m : null;
    const orc = oracleDepth(bl.blockRing, bl.edgeClassifications);
    const row: Row = {
        refcat: bl.refcat, areaM2: bl.blockAreaM2, d, binding: solved?.binding ?? 'n/a',
        insetDeg: solved?.insetDegenerate ?? false, oracle: orc,
        deeper: d !== null && orc !== null ? d - orc : null,
        parcelA: 0, curFoot: 0, b2Removed: 0, b2primeRemoved: 0, bandInactive: false,
    };

    if (d !== null) {
        // interiorFree region of the block at the solved depth (the pati d'illa).
        const ifree = insetPolygonPerEdge(bl.blockRing, bl.edgeClassifications as ParcelEdgeClassification[],
            { front: d, side: 0, rear: 0, unclassified: 0 });
        const ifreePoly = ifree.degenerate ? [] : ifree.polygon;

        // FOUNDER SIGNATURE: shallow frontage parcel, depth = 0.85·d (< d ⇒ bandInactive), ~412 m².
        const dParcel = Math.min(d * 0.85, 14);
        const width = Math.max(20, Math.min(34, 412 / Math.max(6, dParcel)));   // aim ~412 m²
        const fp = frontParcel(bl.blockRing, bl.edgeClassifications, dParcel, width, 0);
        if (fp) {
            row.parcelA = area(fp.poly);
            const clip = clipToDepthBand(fp.poly, fp.a, fp.b, d);   // what the ENGINE does today
            row.bandInactive = clip.bandInactive;
            row.curFoot = clip.degenerate ? 0 : area(clip.polygon);
            // audit B2: how much would "∩ complement(interiorFree)" remove from this parcel?
            row.b2Removed = intersectArea(fp.poly, ifreePoly);
            // audit B2' : same parcel offset 6 m inward from the frontage
            const fpOff = frontParcel(bl.blockRing, bl.edgeClassifications, dParcel, width, 6);
            if (fpOff) row.b2primeRemoved = intersectArea(fpOff.poly, ifreePoly);
        }
    }
    rows.push(row);
}

const answered = rows.filter((r) => r.d !== null);
const withParcel = answered.filter((r) => r.parcelA > 0);
const cmp = answered.filter((r) => r.oracle !== null && r.d !== null);

console.log('═══ §L-643 — footprint-over-statement ROOT: B1 (depth) vs B2 (missing interior-free) ═══');
console.log(`real 13a blocks in fixture        : ${rows.length}`);
console.log(`solver ANSWERED a depth           : ${answered.length}`);
console.log(`  of which inset-degenerate flag  : ${answered.filter((r) => r.insetDeg).length}`);
console.log(`founder-like parcel seated        : ${withParcel.length}`);

console.log('\n── TEST B1 — is the CONSTRUCTED depth over-solved vs the independent oracle? ──');
const deeper = cmp.map((r) => r.deeper!).sort((a, b) => a - b);
const med = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)]! : NaN);
console.log(`comparable blocks                 : ${cmp.length}`);
console.log(`code−oracle depth  min/med/max    : ${(deeper[0] ?? NaN).toFixed(2)} / ${med(deeper).toFixed(2)} / ${(deeper[deeper.length - 1] ?? NaN).toFixed(2)} m`);
console.log(`code DEEPER than oracle by >0.5 m : ${cmp.filter((r) => (r.deeper ?? 0) > 0.5).length}/${cmp.length}  (⟵ B1 over-statement signature)`);
console.log(`code SHALLOWER by >0.5 m          : ${cmp.filter((r) => (r.deeper ?? 0) < -0.5).length}/${cmp.length}`);

console.log('\n── TEST B2 — does "∩ block-interior-free" remove ANYTHING from a SHALLOW frontage parcel? ──');
const b2hit = withParcel.filter((r) => r.b2Removed > 0.5);
console.log(`parcels where bandInactive fired  : ${withParcel.filter((r) => r.bandInactive).length}/${withParcel.length}  (reproduces founder: whole parcel)`);
console.log(`parcels where ∩interiorFree bites  : ${b2hit.length}/${withParcel.length}  m² removed (median): ${med(withParcel.map((r) => r.b2Removed).sort((a, b) => a - b)).toFixed(2)}`);
console.log(`  ⟶ if 0, the audit's B2 fix is a NO-OP for the founder's frontage-parcel case.`);

console.log('\n── TEST B2\' — the OFFSET sub-case: parcel pushed 6 m in from the frontage ──');
const b2p = withParcel.filter((r) => r.b2primeRemoved > 0.5);
console.log(`parcels where ∩interiorFree bites  : ${b2p.length}/${withParcel.length}  m² removed (median of hits): ${med(b2p.map((r) => r.b2primeRemoved).sort((a, b) => a - b)).toFixed(2)}`);
console.log(`  ⟶ this is the ONLY geometry under which "∩ interiorFree" does real work.`);

console.log('\n── worst 10 by (code − oracle) depth, NAMED ──');
for (const r of [...cmp].sort((a, b) => (b.deeper! - a.deeper!)).slice(0, 10)) {
    console.log(`${r.refcat} area=${r.areaM2.toFixed(0)}m² d=${r.d!.toFixed(2)} oracle=${r.oracle!.toFixed(2)} Δ=${r.deeper!.toFixed(2)} bind=${r.binding} insetDeg=${r.insetDeg} | parcel ${r.parcelA.toFixed(0)}m² foot=${r.curFoot.toFixed(0)} bandInactive=${r.bandInactive} B2rm=${r.b2Removed.toFixed(1)} B2'rm=${r.b2primeRemoved.toFixed(1)}`);
}
