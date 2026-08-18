// §L965-RECOVER-BOUNDARY-ARCS — reading the arc back OUT of a tessellated boundary.
//
// `boundaryArc.ts` states the design decision this suite lives with: a slab-family
// boundary is a POLYGON by schema, and an arc enters it by TESSELLATION — there is no
// second arc representation, anywhere. That is still true. What L-965 showed is that
// it leaves every CONSUMER of a boundary unable to tell a drawn arc from nineteen
// hand-placed chords, and "walls by slab" paid for it: the founder's curved slab
// became thirty-three short straight walls that the junction solver then refused to
// resolve.
//
// `resolveBoundarySegments` recovers the arc instead of storing it. The recovery is
// exact rather than heuristic because the forward sampler is uniform in t, which
// makes a Bézier run precisely a run of CONSTANT SECOND DIFFERENCE. These tests pin
// both halves of that claim — what it recovers, and what it REFUSES to.
//
// ⚠ EVERY FIXTURE IS SAMPLED BY THE LONGHAND BÉZIER IN THIS FILE, never by
// `tessellateArcSegment`, which the subject calls. Building the input with the
// subject's own sampler would move oracle and subject together and prove nothing.

import { describe, it, expect } from 'vitest';
import { resolveBoundarySegments, type ArcVertex2D, type BoundarySegment } from '../src/boundaryArc';

/** Longhand quadratic Bézier — deliberately independent of the module under test. */
function bez(S: ArcVertex2D, C: ArcVertex2D, E: ArcVertex2D, t: number): ArcVertex2D {
    const u = 1 - t;
    return {
        x: u * u * S.x + 2 * u * t * C.x + t * t * E.x,
        z: u * u * S.z + 2 * u * t * C.z + t * t * E.z,
    };
}

/** The n sampled vertices of an arc, EXCLUDING the start — what a curved click appends. */
function arcRun(S: ArcVertex2D, C: ArcVertex2D, E: ArcVertex2D, n: number): ArcVertex2D[] {
    return Array.from({ length: n }, (_, i) => bez(S, C, E, (i + 1) / n));
}

/** The control that puts the Bézier through the clicked midpoint at t = 0.5. */
function controlThrough(S: ArcVertex2D, M: ArcVertex2D, E: ArcVertex2D): ArcVertex2D {
    return { x: 2 * M.x - 0.5 * (S.x + E.x), z: 2 * M.z - 0.5 * (S.z + E.z) };
}

/** Every segment, in order, must tile the ring exactly once — no gap, no overlap. */
function expectExactCover(segments: BoundarySegment[], n: number): void {
    expect(segments.reduce((a, s) => a + s.chords, 0)).toBe(n);
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i]!;
        expect((s.startIndex + s.chords) % n).toBe(s.endIndex);
        const next = segments[(i + 1) % segments.length]!;
        expect(next.startIndex).toBe(s.endIndex);
    }
}

describe('resolveBoundarySegments — what it recovers', () => {
    it('a 16-chord arc gesture comes back as ONE segment with the control point that drew it', () => {
        const S = { x: 0, z: 0 };
        const M = { x: 2, z: -2 };
        const E = { x: 4, z: 0 };
        const C = controlThrough(S, M, E);

        // The founder's shape: arc along the south side, two square corners back.
        const ring: ArcVertex2D[] = [S, ...arcRun(S, C, E, 16), { x: 4, z: 4 }, { x: 0, z: 4 }];
        expect(ring).toHaveLength(19);

        const segments = resolveBoundarySegments(ring);
        expectExactCover(segments, ring.length);

        expect(segments).toHaveLength(4);                     // 1 arc + 3 straight sides
        const arcs = segments.filter(s => s.control);
        expect(arcs).toHaveLength(1);
        expect(arcs[0]!.chords).toBe(16);
        expect(arcs[0]!.startIndex).toBe(0);
        expect(arcs[0]!.endIndex).toBe(16);
        expect(arcs[0]!.control!.x).toBeCloseTo(C.x, 9);
        expect(arcs[0]!.control!.z).toBeCloseTo(C.z, 9);
    });

    it("TWO arc gestures — the founder's drum — come back as TWO arcs plus the closing chord", () => {
        // 33 boundary vertices, which is exactly what his log reported walls=33 for.
        const A = { x: 0, z: 0 };
        const B = { x: 6, z: 0 };
        const C1 = controlThrough(A, { x: 3, z: -2.5 }, B);
        const C2 = controlThrough(B, { x: 3, z: 3 }, { x: 0.5, z: 1 });
        const back = { x: 0.5, z: 1 };

        const ring: ArcVertex2D[] = [A, ...arcRun(A, C1, B, 16), ...arcRun(B, C2, back, 16)];
        expect(ring).toHaveLength(33);

        const segments = resolveBoundarySegments(ring);
        expectExactCover(segments, ring.length);

        expect(segments).toHaveLength(3);
        const arcs = segments.filter(s => s.control);
        expect(arcs).toHaveLength(2);
        expect(arcs.map(a => a.chords)).toEqual([16, 16]);
        expect(arcs[0]!.control!.x).toBeCloseTo(C1.x, 9);
        expect(arcs[0]!.control!.z).toBeCloseTo(C1.z, 9);
        expect(arcs[1]!.control!.x).toBeCloseTo(C2.x, 9);
        expect(arcs[1]!.control!.z).toBeCloseTo(C2.z, 9);
    });

    it('the density does not have to be 16 — an adaptively-tessellated arc recovers too', () => {
        // `resolveArcSegmentCount` (§ARC-DENSITY) picks the chord count from curvature,
        // so pinning the recovery to the tool's 16 would have missed every By-Region ring.
        for (const n of [4, 5, 9, 24, 48]) {
            const S = { x: -3, z: 1 };
            const E = { x: 3, z: 1 };
            const C = controlThrough(S, { x: 0, z: -2 }, E);
            const ring: ArcVertex2D[] = [S, ...arcRun(S, C, E, n), { x: 3, z: 7 }, { x: -3, z: 7 }];

            const segments = resolveBoundarySegments(ring);
            expectExactCover(segments, ring.length);
            const arcs = segments.filter(s => s.control);
            expect(arcs, `n=${n}`).toHaveLength(1);
            expect(arcs[0]!.chords, `n=${n}`).toBe(n);
            expect(arcs[0]!.control!.x, `n=${n}`).toBeCloseTo(C.x, 8);
            expect(arcs[0]!.control!.z, `n=${n}`).toBeCloseTo(C.z, 8);
        }
    });

    it('scale-independent — the same arc at 100× recovers identically', () => {
        const mk = (k: number) => {
            const S = { x: 0, z: 0 };
            const E = { x: 4 * k, z: 0 };
            const C = controlThrough(S, { x: 2 * k, z: -1.5 * k }, E);
            return {
                C,
                ring: [S, ...arcRun(S, C, E, 16), { x: 4 * k, z: 4 * k }, { x: 0, z: 4 * k }] as ArcVertex2D[],
            };
        };
        for (const k of [0.25, 1, 100]) {
            const { C, ring } = mk(k);
            const arcs = resolveBoundarySegments(ring).filter(s => s.control);
            expect(arcs, `k=${k}`).toHaveLength(1);
            expect(arcs[0]!.control!.x / k, `k=${k}`).toBeCloseTo(C.x / k, 6);
            expect(arcs[0]!.control!.z / k, `k=${k}`).toBeCloseTo(C.z / k, 6);
        }
    });
});

describe('resolveBoundarySegments — what it REFUSES to call an arc', () => {
    it('a rectangle stays four straight chords', () => {
        const ring: ArcVertex2D[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];
        const segments = resolveBoundarySegments(ring);
        expect(segments).toHaveLength(4);
        expect(segments.every(s => s.chords === 1 && !s.control)).toBe(true);
        expectExactCover(segments, 4);
    });

    it('an L-shape with a chamfered corner is not an arc — six chords stay six chords', () => {
        // The shape a length-4 minimum has to survive: several short edges turning the
        // same way, but with second differences that do not agree.
        const ring: ArcVertex2D[] = [
            { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4.7, z: 0.2 }, { x: 5, z: 0.9 },
            { x: 5, z: 4 }, { x: 0, z: 4 },
        ];
        const segments = resolveBoundarySegments(ring);
        expect(segments.filter(s => s.control)).toHaveLength(0);
        expectExactCover(segments, ring.length);
    });

    it('COLLINEAR intermediate vertices stay separate straight walls — they are not a curve', () => {
        const ring: ArcVertex2D[] = [
            { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 0 },
            { x: 4, z: 3 }, { x: 0, z: 3 },
        ];
        const segments = resolveBoundarySegments(ring);
        expect(segments.filter(s => s.control)).toHaveLength(0);
        expect(segments).toHaveLength(ring.length);
    });

    it('a CIRCULAR arc sampled by ANGLE is refused — and that refusal is the honest answer', () => {
        // A circle sampled at uniform angle is NOT a uniformly-parameterised quadratic
        // Bézier: its second difference has constant magnitude but a rotating direction.
        // No producer in this repo emits one, and inventing a control point for it would
        // move the boundary. It falls back to per-chord straight walls — today's
        // behaviour — rather than to a curve that is not the one that was drawn.
        const ring: ArcVertex2D[] = [];
        for (let i = 0; i <= 16; i++) {
            const a = Math.PI * (i / 16);
            ring.push({ x: 5 * Math.cos(a), z: 5 * Math.sin(a) });
        }
        ring.push({ x: 0, z: -3 });

        const segments = resolveBoundarySegments(ring);
        expect(segments.filter(s => s.control)).toHaveLength(0);
        expectExactCover(segments, ring.length);
    });

    it('a run PERTURBED off the Bézier is refused — the rebuild check is not decorative', () => {
        // Move one interior vertex by 2 cm: visibly still "a curve", and no longer the
        // curve it claims to be. The verification step must catch this, so a decimated
        // or hand-edited ring cannot be silently replaced by a smooth arc through it.
        const S = { x: 0, z: 0 };
        const E = { x: 4, z: 0 };
        const C = controlThrough(S, { x: 2, z: -2 }, E);
        const run = arcRun(S, C, E, 16);
        run[7] = { x: run[7]!.x, z: run[7]!.z - 0.02 };

        const ring: ArcVertex2D[] = [S, ...run, { x: 4, z: 4 }, { x: 0, z: 4 }];
        const segments = resolveBoundarySegments(ring);
        // Either nothing is claimed, or only sub-runs that genuinely verify — never a
        // single arc spanning the perturbed vertex.
        for (const s of segments.filter(x => x.control)) {
            const covers = Array.from({ length: s.chords + 1 }, (_, k) => (s.startIndex + k) % ring.length);
            expect(covers).not.toContain(8); // index of the moved vertex in `ring`
        }
        expectExactCover(segments, ring.length);
    });

    it('an arc is never allowed to swallow the whole ring', () => {
        // A closed ring that is ALL one smooth run has no start and no end; claiming it
        // would produce a wall from a point to itself.
        const ring: ArcVertex2D[] = [];
        for (let i = 0; i < 24; i++) {
            const a = (2 * Math.PI * i) / 24;
            ring.push({ x: 4 * Math.cos(a), z: 4 * Math.sin(a) });
        }
        const segments = resolveBoundarySegments(ring);
        expectExactCover(segments, ring.length);
        for (const s of segments) expect(s.chords).toBeLessThan(ring.length);
    });

    it('degenerate input is handled without inventing geometry', () => {
        expect(resolveBoundarySegments([])).toEqual([]);
        expect(resolveBoundarySegments([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }])).toHaveLength(3);
        const withNaN: ArcVertex2D[] = [
            { x: 0, z: 0 }, { x: 1, z: 0 }, { x: Number.NaN, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 1 },
        ];
        const segments = resolveBoundarySegments(withNaN);
        expect(segments).toHaveLength(withNaN.length);
        expect(segments.every(s => !s.control)).toBe(true);
    });
});
