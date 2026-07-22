// L-586 — the SAME per-block oracle check, run against the PRE-L-586 (mitre + clamp) implementation
// pulled verbatim out of git HEAD. This is the "before" column: without it the 55.4% → 100% claim
// is a comparison of one measurement against a remembered one.
//
// Run:  npx tsx scratchpad/probe-l586-oracle-65-BEFORE.mts
import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '../packages/site-validators/src/index.js';
import { insetPolygonPerEdge } from './_insetPolygon.HEAD.js';

interface Fixture { refcat: string; blockRing: Pt[]; edgeClassifications: string[]; }
const blocks = JSON.parse(
    readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8'),
) as Fixture[];
const SETBACKS = { front: 11, side: 0, rear: 0, unclassified: 0 };
const STEP = 0.5;
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
let over = 0, deg = 0, worst = 0, worstRef = '';
const ratios: number[] = [];
for (const b of blocks) {
    const res = insetPolygonPerEdge(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[], SETBACKS);
    const code = res.degenerate ? 0 : areaOf(res.polygon);
    const orc = oracleArea(b.blockRing, b.edgeClassifications);
    if (res.degenerate) deg++;
    const noise = 2 * Math.sqrt(Math.max(orc, 1)) * STEP + STEP * STEP;
    if (code > orc + noise) { over++; if (code - orc > worst) { worst = code - orc; worstRef = b.refcat; } }
    ratios.push(orc > 1 ? code / orc : 1);
}
ratios.sort((a, b) => a - b);
console.log(`BEFORE (mitre + L-581 clamp), same oracle, same fixture, same setbacks:`);
console.log(`   over-statements : ${over}/65   worst ${worstRef} by ${worst.toFixed(0)} m²`);
console.log(`   degenerate      : ${deg}/65`);
console.log(`   code/oracle ratio  min ${ratios[0]!.toFixed(3)}  median ${ratios[Math.floor(ratios.length / 2)]!.toFixed(3)}  max ${ratios[ratios.length - 1]!.toFixed(3)}`);
