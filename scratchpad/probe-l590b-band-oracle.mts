// §L-590b — INDEPENDENT ORACLE for the Art. 350.2.b *franja concèntrica* solver, on all 65 real
// dissolved Eixample blocks.
//
// ⚠ WHY AN ORACLE AND NOT A SELF-CHECK. `solveBlockConcentricBandDepth` already verifies itself
// against its own target ratio — but it does so THROUGH `insetPolygonPerEdge`, the same routine it
// uses to measure. A self-consistent wrong answer is exactly what L-581 shipped for two years, and
// what L-586 found again on 31 of these same 65 blocks (buildable area over-stated by up to 65 %
// while every aggregate looked healthy). So this probe answers the question with a COMPLETELY
// DIFFERENT ALGORITHM and compares block by block, never in aggregate alone.
//
// THE ORACLE. Rasterise the block. For every cell centre inside it, compute the distance to the
// nearest STREET-FRONTAGE segment. The band of depth `d` is, by Art. 350.2.b's own definition, the
// set of points within `d` of a frontage — so the depth at which the band's area equals 70 % of the
// block is simply the **70th percentile of that distance field**. No offsetting, no mitring, no
// arcs, no loop decomposition, no bisection on polygon area: nothing the implementation does. It is
// a quantile of a distance distribution.
//
// WHAT IT MUST SHOW:
//   1. AGREEMENT — code depth ≈ oracle depth, block by block, with the spread stated.
//   2. DIRECTION (C58 §1.4) — where they disagree, the code must not run DEEPER than the oracle.
//      The band is where the TALL tier goes, so a too-deep band over-states buildable volume; a
//      too-shallow one under-states. Only the first is forbidden.
//   3. NAMED INDIVIDUALS — the worst blocks by refcat, because L-581 proved an aggregate can
//      improve while one parcel is wrong by 12×.
//
// Run:  npx tsx scratchpad/probe-l590b-band-oracle.mts

import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '../packages/site-validators/src/index.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import { solveBlockConcentricBandDepth } from '../packages/site-parcel-data/src/geometry/blockConcentricBand.js';

const FIXTURE = new URL('./l581-blocks.fixture.json', import.meta.url);

interface Fixture {
    refcat: string;
    blockRing: Pt[];
    edgeClassifications: string[];
    blockAreaM2: number;
    frontEdges: number;
    totalEdges: number;
    reflexCount: number;
}

const blocks = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture[];

const BAND_RATIO = 0.7;
const STEP = Number(process.env.GRID ?? 0.5);

const areaOf = (r: ReadonlyArray<Pt>): number =>
    r.length < 3 ? 0 : Math.abs(polygonSignedArea(r));

function inside(p: Pt, r: ReadonlyArray<Pt>): boolean {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i]!, b = r[j]!;
        if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
            c = !c;
        }
    }
    return c;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
    return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

/** ORACLE — the 70th percentile of the distance-to-frontage field over the block's interior. */
function oracle(ring: Pt[], cls: string[]): { depth: number; cells: number } | null {
    const fronts: Array<[Pt, Pt]> = [];
    for (let i = 0; i < ring.length; i++) {
        if (cls[i] === 'front') fronts.push([ring[i]!, ring[(i + 1) % ring.length]!]);
    }
    if (fronts.length === 0) return null;

    const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const z0 = Math.min(...zs), z1 = Math.max(...zs);
    const dists: number[] = [];
    for (let x = x0 + STEP / 2; x <= x1; x += STEP) {
        for (let z = z0 + STEP / 2; z <= z1; z += STEP) {
            const p = { x, z };
            if (!inside(p, ring)) continue;
            let d = Infinity;
            for (const [a, b] of fronts) {
                const dd = segDist(p, a, b);
                if (dd < d) d = dd;
            }
            dists.push(d);
        }
    }
    if (dists.length < 100) return null;   // too few cells for a meaningful quantile
    dists.sort((a, b) => a - b);
    // The band holds the CLOSEST 70 % of the area, so its depth is the 70th percentile.
    const idx = Math.min(dists.length - 1, Math.floor(dists.length * BAND_RATIO));
    return { depth: dists[idx]!, cells: dists.length };
}

/** What the SHIPPING code says the band area is at a given depth: block − erosion(depth). */
function codeBandArea(ring: Pt[], cls: string[], d: number): number | null {
    const res = insetPolygonPerEdge(ring, cls as ParcelEdgeClassification[], {
        front: d, side: 0, rear: 0, unclassified: 0,
    });
    if (res.degenerate) return null;
    return areaOf(ring) - areaOf(res.polygon);
}

interface Row {
    refcat: string;
    blockAreaM2: number;
    reflex: number;
    codeDepth: number | null;
    codeDegenerate: boolean;
    achieved: number | null;
    oracleDepth: number | null;
    deltaM: number | null;
    ratio: number | null;
    deeperThanOracle: boolean;
}

const rows: Row[] = [];
for (const b of blocks) {
    const solved = solveBlockConcentricBandDepth({
        blockRing: b.blockRing,
        blockEdgeClassifications: b.edgeClassifications as ParcelEdgeClassification[],
        bandAreaRatio: BAND_RATIO,
    });
    const o = oracle(b.blockRing, b.edgeClassifications);
    const codeDepth = solved && !solved.degenerate ? solved.depth_m : null;
    rows.push({
        refcat: b.refcat,
        blockAreaM2: b.blockAreaM2,
        reflex: b.reflexCount,
        codeDepth,
        codeDegenerate: solved ? solved.degenerate : true,
        achieved: solved ? solved.achievedBandRatio : null,
        oracleDepth: o ? o.depth : null,
        deltaM: codeDepth !== null && o ? codeDepth - o.depth : null,
        ratio: codeDepth !== null && o && o.depth > 0 ? codeDepth / o.depth : null,
        deeperThanOracle: codeDepth !== null && o ? codeDepth > o.depth + 0.5 : false,
    });
}

const answered = rows.filter((r) => r.codeDepth !== null);
const comparable = answered.filter((r) => r.oracleDepth !== null);
const deltas = comparable.map((r) => Math.abs(r.deltaM!)).sort((a, b) => a - b);
const ratios = comparable.map((r) => r.ratio!).sort((a, b) => a - b);
const med = (a: number[]) => (a.length === 0 ? NaN : a[Math.floor(a.length / 2)]!);

console.log('═══ §L-590b — Art. 350.2.b band solver vs INDEPENDENT distance-quantile oracle ═══');
console.log(`blocks in fixture                : ${rows.length}`);
console.log(`solver ANSWERED (not degenerate) : ${answered.length} (${((answered.length / rows.length) * 100).toFixed(1)}%)`);
console.log(`solver REFUSED (self-check miss) : ${rows.length - answered.length}`);
console.log(`comparable against the oracle    : ${comparable.length}`);
console.log(`|code − oracle| median / p90 / max: ${med(deltas).toFixed(3)} m / ` +
    `${(deltas[Math.floor(deltas.length * 0.9)] ?? NaN).toFixed(3)} m / ` +
    `${(deltas[deltas.length - 1] ?? NaN).toFixed(3)} m`);
console.log(`code/oracle depth ratio min/med/max: ${(ratios[0] ?? NaN).toFixed(4)} / ` +
    `${med(ratios).toFixed(4)} / ${(ratios[ratios.length - 1] ?? NaN).toFixed(4)}`);
console.log(`⚠ DEEPER than oracle by >0.5 m (OVER-states the tall tier): ` +
    `${comparable.filter((r) => r.deeperThanOracle).length}/${comparable.length}`);

console.log('\n── worst 8 by |code − oracle| (NAMED, per L-581: an aggregate is not evidence) ──');
for (const r of [...comparable].sort((a, b) => Math.abs(b.deltaM!) - Math.abs(a.deltaM!)).slice(0, 8)) {
    console.log(
        `${r.refcat}  area=${r.blockAreaM2.toFixed(0)}m² reflex=${r.reflex}  ` +
        `code=${r.codeDepth!.toFixed(2)}m oracle=${r.oracleDepth!.toFixed(2)}m ` +
        `Δ=${r.deltaM!.toFixed(2)}m ratio=${r.ratio!.toFixed(3)} achieved=${(r.achieved! * 100).toFixed(1)}%`,
    );
}

console.log('\n── the blocks the solver REFUSED (its own equality check failed) ──');
for (const r of rows.filter((x) => x.codeDepth === null).slice(0, 12)) {
    console.log(
        `${r.refcat}  area=${r.blockAreaM2.toFixed(0)}m² reflex=${r.reflex}  ` +
        `achieved=${r.achieved === null ? 'n/a' : (r.achieved * 100).toFixed(1) + '%'} ` +
        `(target 70.0%)  oracle=${r.oracleDepth === null ? 'n/a' : r.oracleDepth.toFixed(2) + 'm'}`,
    );
}

// AREA CROSS-CHECK at the code's own depth: does the erosion the solver measures with agree with
// the oracle's cell count? This is the L-586 conservatism question restated for the band.
console.log('\n── band AREA at the code depth: erosion vs oracle cell count ──');
let overArea = 0, cmp = 0;
for (const b of blocks) {
    const row = rows.find((r) => r.refcat === b.refcat)!;
    if (row.codeDepth === null) continue;
    const codeArea = codeBandArea(b.blockRing, b.edgeClassifications, row.codeDepth);
    if (codeArea === null) continue;
    const o = oracle(b.blockRing, b.edgeClassifications);
    if (!o) continue;
    // Oracle band area at the SAME depth = cells closer than that depth × cell area.
    const fronts: Array<[Pt, Pt]> = [];
    for (let i = 0; i < b.blockRing.length; i++) {
        if (b.edgeClassifications[i] === 'front') {
            fronts.push([b.blockRing[i]!, b.blockRing[(i + 1) % b.blockRing.length]!]);
        }
    }
    const xs = b.blockRing.map((p) => p.x), zs = b.blockRing.map((p) => p.z);
    let inBand = 0;
    for (let x = Math.min(...xs) + STEP / 2; x <= Math.max(...xs); x += STEP) {
        for (let z = Math.min(...zs) + STEP / 2; z <= Math.max(...zs); z += STEP) {
            const p = { x, z };
            if (!inside(p, b.blockRing)) continue;
            let d = Infinity;
            for (const [a, bb] of fronts) { const dd = segDist(p, a, bb); if (dd < d) d = dd; }
            if (d < row.codeDepth) inBand++;
        }
    }
    const oracleArea = inBand * STEP * STEP;
    cmp++;
    if (codeArea > oracleArea * 1.02) {
        overArea++;
        console.log(
            `  ⚠ OVER  ${b.refcat}: code band ${codeArea.toFixed(0)} m² vs oracle ${oracleArea.toFixed(0)} m² ` +
            `(+${(((codeArea / oracleArea) - 1) * 100).toFixed(1)}%)`,
        );
    }
}
console.log(`  compared ${cmp}; band area OVER-stated by >2%: ${overArea}`);
