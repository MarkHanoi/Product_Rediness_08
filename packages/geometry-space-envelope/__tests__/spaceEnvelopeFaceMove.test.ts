// The face-move planner — the founder's "connected faces adapt", proven.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10c / §12 · ADR-0380 D4 / D6.
//
// ⭐ WHAT THESE TESTS ESTABLISH, STATED HONESTLY: that the PLANNER computes the right
// geometry and refuses the right requests. They do NOT establish that a user can drag
// a face — that needs a command, a store and a gizmo, and C114 §14a forbids reporting
// the one as the other.

import { describe, expect, it } from 'vitest';
import {
    computeSpaceEnvelopeFaceMoveCensus,
    planSpaceEnvelopeFaceMove,
    footprintAreaM2,
    recomputeSpaceEnvelopeMetrics,
    ringSelfIntersects,
    signedFootprintAreaM2,
    spaceEnvelopeFaces,
    type SpaceEnvelopePrism,
} from '../src/index.js';

/** A 4 m × 4 m square prism, 3 m tall, on the level plane. */
function square(id = 'spaceEnvelope_TEST'): SpaceEnvelopePrism {
    return {
        id,
        footprint: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
            { x: 4, y: 0, z: 4 },
            { x: 0, y: 0, z: 4 },
        ],
        baseOffset: 0,
        height: 3,
    };
}

describe('prism basics', () => {
    it('a 4x4x3 prism measures 16 m2 and 48 m3', () => {
        const m = recomputeSpaceEnvelopeMetrics(square());
        expect(m.footprintAreaM2).toBeCloseTo(16, 10);
        expect(m.volumeM3).toBeCloseTo(48, 10);
    });

    it('has n + 2 faces', () => {
        expect(spaceEnvelopeFaces(square())).toHaveLength(6);
    });
});

describe('side-face move — the connected faces adapt', () => {
    it('moving one face outward grows the footprint by exactly edge x delta', () => {
        const result = planSpaceEnvelopeFaceMove({
            prism: square(),
            face: { kind: 'side', edgeIndex: 0 },
            deltaM: 1,
        });
        expect('entry' in result).toBe(true);
        if (!('entry' in result)) return;
        // 4 m edge pushed out 1 m ⇒ +4 m².
        expect(footprintAreaM2(result.entry.footprint)).toBeCloseTo(20, 9);
    });

    it('⭐ EXACTLY TWO VERTICES MOVE — the two the moved face defines', () => {
        const before = square();
        const result = planSpaceEnvelopeFaceMove({
            prism: before,
            face: { kind: 'side', edgeIndex: 0 },
            deltaM: 1,
        });
        if (!('entry' in result)) throw new Error('expected an entry');
        const moved = before.footprint
            .map((p, i) => {
                const q = result.entry.footprint[i]!;
                return Math.hypot(p.x - q.x, p.z - q.z) > 1e-9 ? i : -1;
            })
            .filter((i) => i >= 0);
        // Edge 0 runs vertex 0 -> vertex 1, so those two and only those two move.
        expect(moved).toEqual([0, 1]);
    });

    it('⭐ reports the neighbours that adapted, so adaptation is PROVEN not assumed', () => {
        const result = planSpaceEnvelopeFaceMove({
            prism: square(),
            face: { kind: 'side', edgeIndex: 1 },
            deltaM: 0.5,
        });
        if (!('entry' in result)) throw new Error('expected an entry');
        const sides = result.entry.adaptedFaces
            .filter((f) => f.kind === 'side')
            .map((f) => (f.kind === 'side' ? f.edgeIndex : -1));
        // Faces 0 and 2 share a vertex with face 1.
        expect(sides.sort()).toEqual([0, 2]);
    });

    it('is reversible — out then back returns the original ring', () => {
        const start = square();
        const out = planSpaceEnvelopeFaceMove({
            prism: start, face: { kind: 'side', edgeIndex: 2 }, deltaM: 1.25,
        });
        if (!('entry' in out)) throw new Error('expected an entry');
        const back = planSpaceEnvelopeFaceMove({
            prism: { ...start, footprint: out.entry.footprint },
            face: { kind: 'side', edgeIndex: 2 },
            deltaM: -1.25,
        });
        if (!('entry' in back)) throw new Error('expected an entry');
        back.entry.footprint.forEach((p, i) => {
            expect(p.x).toBeCloseTo(start.footprint[i]!.x, 9);
            expect(p.z).toBeCloseTo(start.footprint[i]!.z, 9);
        });
    });

    it('moving a face inward shrinks the footprint', () => {
        const result = planSpaceEnvelopeFaceMove({
            prism: square(), face: { kind: 'side', edgeIndex: 0 }, deltaM: -1,
        });
        if (!('entry' in result)) throw new Error('expected an entry');
        expect(footprintAreaM2(result.entry.footprint)).toBeCloseTo(12, 9);
    });
});

describe('top / bottom face move', () => {
    it('the top face grows the height and leaves the base alone', () => {
        const r = planSpaceEnvelopeFaceMove({ prism: square(), face: { kind: 'top' }, deltaM: 2 });
        if (!('entry' in r)) throw new Error('expected an entry');
        expect(r.entry.height).toBeCloseTo(5, 10);
        expect(r.entry.baseOffset).toBeCloseTo(0, 10);
    });

    it('the bottom face grows DOWNWARD — base drops, height grows', () => {
        const r = planSpaceEnvelopeFaceMove({ prism: square(), face: { kind: 'bottom' }, deltaM: 1 });
        if (!('entry' in r)) throw new Error('expected an entry');
        expect(r.entry.baseOffset).toBeCloseTo(-1, 10);
        expect(r.entry.height).toBeCloseTo(4, 10);
    });
});

describe('⛔ THE ONE ENFORCEMENT REFUSAL — a move that inverts or collapses the solid', () => {
    it('refuses a height collapse, with BOTH numbers', () => {
        const r = planSpaceEnvelopeFaceMove({
            prism: square(), face: { kind: 'top' }, deltaM: -3,
        });
        expect('refusal' in r).toBe(true);
        if (!('refusal' in r)) return;
        expect(r.refusal.code).toBe('face-move-collapses-solid');
        expect(r.refusal.ground).toBe('IMPOSSIBLE');
        // C114 §12a — the refusal carries BOTH numbers, read from the geometry.
        expect(r.refusal.requestedValue).toBeCloseTo(0, 9);
        expect(r.refusal.permittedValue).toBeGreaterThan(0);
        expect(r.refusal.message).toContain('3.00 m');
    });

    it('refuses pushing a face through the opposite side', () => {
        const r = planSpaceEnvelopeFaceMove({
            prism: square(), face: { kind: 'side', edgeIndex: 0 }, deltaM: -6,
        });
        expect('refusal' in r).toBe(true);
        if (!('refusal' in r)) return;
        expect(['face-move-inverts-ring', 'face-move-collapses-solid'])
            .toContain(r.refusal.code);
        expect(r.refusal.ground).toBe('IMPOSSIBLE');
        expect(r.refusal.unit).toBe('m2');
    });

    it('⭐ the refusal boundary is where the AREA goes, not where a threshold was typed', () => {
        // Inward 4 m on a 4 m square lands exactly on collapse.
        const justInside = planSpaceEnvelopeFaceMove({
            prism: square(), face: { kind: 'side', edgeIndex: 0 }, deltaM: -3.9,
        });
        const past = planSpaceEnvelopeFaceMove({
            prism: square(), face: { kind: 'side', edgeIndex: 0 }, deltaM: -4.1,
        });
        expect('entry' in justInside).toBe(true);
        expect('refusal' in past).toBe(true);
    });

    it('refuses an out-of-range face index rather than silently doing nothing', () => {
        const r = planSpaceEnvelopeFaceMove({
            prism: square(), face: { kind: 'side', edgeIndex: 9 }, deltaM: 1,
        });
        if (!('refusal' in r)) throw new Error('expected a refusal');
        expect(r.refusal.code).toBe('face-index-out-of-range');
    });

    it('refuses a footprint off the level plane', () => {
        const bad: SpaceEnvelopePrism = {
            ...square(),
            footprint: [
                { x: 0, y: 0, z: 0 }, { x: 4, y: 0.5, z: 0 },
                { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
            ],
        };
        const r = planSpaceEnvelopeFaceMove({
            prism: bad, face: { kind: 'side', edgeIndex: 0 }, deltaM: 1,
        });
        if (!('refusal' in r)) throw new Error('expected a refusal');
        expect(r.refusal.code).toBe('footprint-not-on-level-plane');
    });

    it('never produces a self-intersecting ring on a successful move', () => {
        for (let d = -3.5; d <= 5; d += 0.25) {
            const r = planSpaceEnvelopeFaceMove({
                prism: square(), face: { kind: 'side', edgeIndex: 0 }, deltaM: d,
            });
            if ('entry' in r) {
                expect(ringSelfIntersects(r.entry.footprint)).toBe(false);
                expect(Math.sign(signedFootprintAreaM2(r.entry.footprint)))
                    .toBe(Math.sign(signedFootprintAreaM2(square().footprint)));
            }
        }
    });
});

describe('the census triple — refusals are NOT folded into notApplicable', () => {
    it('separates entries, refusals and notApplicable', () => {
        const degenerate: SpaceEnvelopePrism = {
            id: 'spaceEnvelope_DEGEN',
            footprint: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
            baseOffset: 0,
            height: 3,
        };
        const census = computeSpaceEnvelopeFaceMoveCensus([
            { prism: square('a'), face: { kind: 'side', edgeIndex: 0 }, deltaM: 1 },
            { prism: square('b'), face: { kind: 'top' }, deltaM: -10 },
            { prism: degenerate, face: { kind: 'side', edgeIndex: 0 }, deltaM: 1 },
        ]);
        expect(census.entries).toHaveLength(1);
        expect(census.refusals).toHaveLength(1);
        expect(census.notApplicable).toHaveLength(1);
        // ⭐ The distinction that matters: a refusal has a reason; notApplicable has a subject.
        expect(census.refusals[0]!.message.length).toBeGreaterThan(20);
        expect(census.notApplicable[0]).toContain('spaceEnvelope_DEGEN');
    });
});
