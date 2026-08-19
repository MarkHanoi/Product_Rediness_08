/**
 * handrailRunGenerators.spec — §FEAT-HANDRAIL-CREATION-PARITY (C95 D4).
 *
 * THE INVARIANT UNDER TEST, and why it is one invariant and not seven cases:
 *
 *   A handrail RUN carries exactly ONE post per distinct vertex — no gap, no
 *   double.
 *
 * `HandrailFragmentBuilder` emits an end post at BOTH ends of every segment, so a
 * naive decomposition of an N-vertex run into N segments puts TWO coincident
 * posts on every shared vertex and, in a closed loop, on the closure point too.
 * The founder's brief names that outcome explicitly ("correct join at the closure
 * point: no gap, no doubled post"), so it is asserted as a property over EVERY
 * mode rather than as one hand-picked example per mode.
 *
 * POST COUNT IS DERIVED THE WAY THE BUILDER DERIVES IT — `suppressStartPost`
 * suppresses the start post, the end post is unconditional — so this counts what
 * the builder will actually emit and not a restatement of the generator.
 */

import { describe, it, expect } from 'vitest';
import {
    rectangleLoopVertices,
    circleLoopVertices,
    ellipseLoopVertices,
    loopSegmentsForMode,
    segmentsFromVertices,
    slabOutlineSegments,
    applyOrthoConstraint,
    curvedRunVertices,
    loopSegmentCount,
    MIN_HANDRAIL_SEGMENT_M,
    isHandrailLoopMode,
    type HandrailRunSegment,
    type HandrailRunPoint,
} from '../handrailRunGenerators';

/** The builder's own rule: one post per segment END, plus a START post unless suppressed. */
function postPositions(segments: readonly HandrailRunSegment[]): HandrailRunPoint[] {
    const out: HandrailRunPoint[] = [];
    for (const s of segments) {
        if (!s.suppressStartPost) out.push(s.start);
        out.push(s.end);
    }
    return out;
}

function distinctCount(pts: readonly HandrailRunPoint[], tol = 1e-6): number {
    const keep: HandrailRunPoint[] = [];
    for (const p of pts) {
        if (!keep.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < tol)) keep.push(p);
    }
    return keep.length;
}

function isContiguous(segments: readonly HandrailRunSegment[]): boolean {
    for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1]!;
        const cur = segments[i]!;
        if (Math.hypot(cur.start.x - prev.end.x, cur.start.z - prev.end.z) > 1e-9) return false;
    }
    return true;
}

describe('handrail run generators — the join invariant', () => {
    const cases: Array<{ name: string; segs: readonly HandrailRunSegment[]; closed: boolean }> = [];

    const rect = loopSegmentsForMode('square', { x: 0, z: 0 }, { x: 4, z: 3 });
    cases.push({ name: 'square (rectangular loop)', segs: rect.segments, closed: true });

    const circ = loopSegmentsForMode('circular', { x: 10, z: 10 }, { x: 13, z: 10 });
    cases.push({ name: 'circular loop', segs: circ.segments, closed: true });

    const ell = loopSegmentsForMode('ellipse', { x: 0, z: 0 }, { x: 5, z: 2.5 });
    cases.push({ name: 'elliptical loop', segs: ell.segments, closed: true });

    const openL = segmentsFromVertices(
        [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }],
        false,
    );
    cases.push({ name: 'open L-shaped polyline', segs: openL.segments, closed: false });

    const slab = slabOutlineSegments([
        { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 },
    ]);
    cases.push({ name: 'by-slab perimeter', segs: slab.segments, closed: true });

    for (const c of cases) {
        it(`${c.name}: exactly one post per distinct vertex — no gap, no doubled post`, () => {
            expect(c.segs.length).toBeGreaterThanOrEqual(c.closed ? 3 : 2);

            const posts = postPositions(c.segs);
            const distinctVertices = distinctCount(
                c.segs.flatMap((s) => [s.start, s.end]),
            );

            // NO DOUBLED POST: the total post count equals the distinct vertex
            // count, so no vertex received two.
            expect(posts.length).toBe(distinctVertices);
            // NO GAP: every distinct vertex is posted (same count AND all distinct).
            expect(distinctCount(posts)).toBe(distinctVertices);
        });

        it(`${c.name}: segments are contiguous and every one clears the command's 0.1 m minimum`, () => {
            expect(isContiguous(c.segs)).toBe(true);
            for (const s of c.segs) {
                expect(Math.hypot(s.end.x - s.start.x, s.end.z - s.start.z))
                    .toBeGreaterThanOrEqual(MIN_HANDRAIL_SEGMENT_M);
            }
        });

        if (c.closed) {
            it(`${c.name}: the loop closes exactly — the last segment ends on the first segment's start`, () => {
                const first = c.segs[0]!;
                const last = c.segs[c.segs.length - 1]!;
                expect(Math.hypot(last.end.x - first.start.x, last.end.z - first.start.z))
                    .toBeLessThan(1e-9);
            });
        }
    }
});

describe('handrail run generators — degenerate gestures produce NOTHING, not a broken loop', () => {
    it('a sub-200 mm square drag yields no vertices', () => {
        expect(rectangleLoopVertices({ x: 0, z: 0 }, { x: 0.1, z: 0.1 })).toEqual([]);
    });

    it('a sub-200 mm circle radius yields no vertices', () => {
        expect(circleLoopVertices({ x: 0, z: 0 }, { x: 0.1, z: 0 })).toEqual([]);
    });

    it('an ellipse with one collapsed semi-axis yields no vertices', () => {
        expect(ellipseLoopVertices({ x: 0, z: 0 }, { x: 5, z: 0.05 })).toEqual([]);
    });

    it('a two-vertex "closed" loop is refused — a loop needs three', () => {
        const r = segmentsFromVertices([{ x: 0, z: 0 }, { x: 3, z: 0 }], true);
        expect(r.segments).toEqual([]);
    });

    it('a repeated closing vertex in a slab outline does NOT mint a zero-length edge', () => {
        const r = slabOutlineSegments([
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }, { x: 0, z: 5 }, { x: 0, z: 0 },
        ]);
        expect(r.segments).toHaveLength(4);
        expect(r.droppedDegenerate).toBe(0);
    });

    it('a degenerate edge inside a polyline is DROPPED and COUNTED, never silently kept', () => {
        const r = segmentsFromVertices(
            [{ x: 0, z: 0 }, { x: 0.01, z: 0 }, { x: 4, z: 0 }],
            false,
        );
        expect(r.droppedDegenerate).toBe(1);
        expect(r.segments).toHaveLength(1);
    });
});

describe('handrail run generators — segment counts the command will accept', () => {
    it('never returns a count whose chords would fall below the command minimum', () => {
        for (const circumference of [0.5, 1, 2, 5, 12, 40, 200]) {
            const n = loopSegmentCount(circumference);
            if (n === 0) continue;
            expect(circumference / n).toBeGreaterThanOrEqual(MIN_HANDRAIL_SEGMENT_M - 1e-12);
        }
    });

    it('a 3 m-radius circle is tessellated into a bounded, sane number of real rails', () => {
        const v = circleLoopVertices({ x: 0, z: 0 }, { x: 3, z: 0 });
        expect(v.length).toBeGreaterThanOrEqual(8);
        expect(v.length).toBeLessThanOrEqual(48);
    });
});

describe('handrail run generators — the shared wall constraints', () => {
    it('ortho snaps to whichever axis the cursor is already closer to', () => {
        expect(applyOrthoConstraint({ x: 0, z: 0 }, { x: 5, z: 1 })).toEqual({ x: 5, z: 0 });
        expect(applyOrthoConstraint({ x: 0, z: 0 }, { x: 1, z: 5 })).toEqual({ x: 0, z: 5 });
    });

    it('the curved run PASSES THROUGH the clicked mid-point, not merely toward it', () => {
        const start = { x: 0, z: 0 };
        const mid = { x: 5, z: 3 };
        const end = { x: 10, z: 0 };
        const v = curvedRunVertices(start, mid, end);
        expect(v.length).toBeGreaterThan(2);
        expect(v[0]).toEqual(start);
        expect(v[v.length - 1]).toEqual(end);
        // t = 0.5 on a quadratic Bézier with C = 2M − (A+B)/2 lands exactly on M.
        const half = v[Math.floor(v.length / 2)]!;
        if (v.length % 2 === 1) {
            expect(half.x).toBeCloseTo(mid.x, 9);
            expect(half.z).toBeCloseTo(mid.z, 9);
        }
    });

    it('a curved run whose chord is below the minimum is refused outright', () => {
        expect(curvedRunVertices({ x: 0, z: 0 }, { x: 0.02, z: 0.02 }, { x: 0.05, z: 0 })).toEqual([]);
    });

    it('isHandrailLoopMode names exactly the three closed-loop generators', () => {
        expect(['square', 'circular', 'ellipse'].every(isHandrailLoopMode)).toBe(true);
        expect(['linear', 'ortho', 'curved', 'byslab'].some(isHandrailLoopMode)).toBe(false);
    });
});
