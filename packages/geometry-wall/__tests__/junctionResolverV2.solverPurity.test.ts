// §V2-SOLVER-PURITY — `resolveJunctions` carries NO state across solves.
//
// WHY THIS EXISTS. During the §NEAR-JUNCTION-DEAD-ZONE investigation the same junction
// measurement returned different magnitudes depending on what had run before it in the same
// test file (7,548 mm² standalone vs ~1,300 mm² after earlier cases; 9,940 vs 2,520 for the
// legacy resolver). A junction solve whose result depends on execution history would have
// undermined every number the wall-join lane has produced, so it was probed before any fix.
//
// THE FINDING — REFUTED for V2. The identical dead-zone measurement read 7,548 mm² at every
// stage: fresh, after a whole-level `WallJoinResolver.resolveLevel` on a 2-wall L, after one
// on a 3-wall cluster, and after a prior V2 exact-vertex solve. `resolveJunctions` /
// `buildAllFootprints` are pure. (The legacy resolver's half was separately explained by
// `metadata.createdAt` ordering.)
//
// THE LESSON, which is the durable part: **a leaked global `__pryzm*` behaviour flag can
// masquerade as solver non-determinism.** These flags are read from `globalThis` at solve
// time, so a suite that sets one and does not delete it in `afterEach` silently changes the
// construction every later suite measures — and the symptom presents as "the same input gave
// a different answer", which reads like hidden solver state. This test therefore asserts BOTH
// halves: the measurement is history-independent AND no behaviour flag is left standing.
//
// Keep this suite LAST-ish in the file ordering sense it was written for: it deliberately runs
// heavy neighbours first inside a single test, so it does not depend on vitest file order.

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { resolveJunctions, type WallInput, type Pt2 } from '../src/JunctionResolverV2';
import { buildAllFootprints } from '../src/WallFootprint2D';
import type { WallData } from '../src/WallTypes';

const STEP = 0.002;
function inPoly(px: number, pz: number, poly: readonly Pt2[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}
function overlapMm2(p: readonly Pt2[], q: readonly Pt2[]): number {
    if (p.length < 3 || q.length < 3) return 0;
    const xs = [...p, ...q].map(v => v.x), zs = [...p, ...q].map(v => v.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let h = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) for (let z = z0 + STEP / 2; z < z1; z += STEP) {
        if (inPoly(x, z, p) && inPoly(x, z, q)) h++;
    }
    return h * STEP * STEP * 1e6;
}

/**
 * The probe measurement: the near-corner guest's own solved footprint AREA in mm².
 *
 * Deliberately an AREA, not the doubled-solid overlap the original probe used — that overlap
 * is now 0 mm² everywhere (§NEAR-JUNCTION-DEAD-ZONE closed it), and a measurement that is
 * identically zero cannot detect history-dependence. The guest's footprint is produced by the
 * exact machinery under test (cluster → guard passes → ring sweep → footprint) and is always
 * non-zero, so it stays a live witness.
 */
function probe(): number {
    const inputs: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: 0.30 },
        { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 6 }, thickness: 0.30 },
        { id: 'C', start: { x: 0.02, z: 0 }, end: { x: 3, z: 3 }, thickness: 0.20 },
    ];
    const fps = buildAllFootprints(inputs, resolveJunctions(inputs));
    const m = new Map(fps.map(f => [f.id, f.polygon]));
    const poly = m.get('C')!;
    // Shoelace area, plus the doubled-solid reading folded in so a regression on EITHER axis
    // shows up as a changed number.
    const area = Math.abs(poly.reduce((s, p, i) => {
        const q = poly[(i + 1) % poly.length]!; return s + p.x * q.z - q.x * p.z;
    }, 0) / 2) * 1e6;
    return area + overlapMm2(poly, m.get('B')!);
}

let _seq = 0;
function mkWall(s: [number, number], e: [number, number], t: number, layers?: number[]): WallData {
    return {
        id: `purity${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: t, baseOffset: 0, openings: [],
        layers: layers?.map((x, i) => ({ name: `l${i}`, thickness: x })), metadata: { createdAt: _seq },
    } as unknown as WallData;
}

describe('JunctionResolverV2 — §V2-SOLVER-PURITY', () => {
    it('the same junction measures identically regardless of what solved before it', () => {
        const fresh = probe();
        expect(fresh).toBeGreaterThan(0);            // the probe must actually measure something

        WallJoinResolver.resolveLevel([mkWall([0, 0], [5, 0], 0.30), mkWall([0, 0], [0, 5], 0.30)]);
        expect(probe()).toBe(fresh);

        WallJoinResolver.resolveLevel([
            mkWall([0, 0], [6, 0], 0.30),
            mkWall([0, 0], [0, 6], 0.30),
            mkWall([0, 0], [3, 3], 0.20, [0.0125, 0.175, 0.0125]),
        ]);
        expect(probe()).toBe(fresh);

        const exactVertex: WallInput[] = [
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: 0.30 },
            { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 6 }, thickness: 0.30 },
            { id: 'C', start: { x: 0, z: 0 }, end: { x: 3, z: 3 }, thickness: 0.20 },
        ];
        buildAllFootprints(exactVertex, resolveJunctions(exactVertex));
        expect(probe()).toBe(fresh);
    }, 300000);

    it('no __pryzm* behaviour flag is left standing on globalThis', () => {
        // A leaked flag is the mechanism that MASQUERADES as solver non-determinism: it is read
        // from globalThis at solve time, so it silently changes the construction every later
        // suite measures. Any suite that sets one owes an afterEach that deletes it.
        expect(Object.keys(globalThis).filter(k => k.startsWith('__pryzm'))).toEqual([]);
    });
});
