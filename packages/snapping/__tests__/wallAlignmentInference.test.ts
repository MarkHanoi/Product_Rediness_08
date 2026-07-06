// §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — pure alignment-inference maths tests.
//
// Covers the founder's candidate set for the plan-view wall tool:
//   • perpendicular hit (single cross-axis lock, with perpendicular preference)
//   • collinear / extension of an existing wall
//   • endpoint / midpoint direct snap
//   • intersection double-lock
//   • no-candidate passthrough (null)
//   • tolerance boundary (inside vs just outside axisThresholdM)
//
// Pure maths — no THREE, no DOM. Metres throughout; default axisThresholdM = 0.15.

import { describe, it, expect } from 'vitest';
import {
    computeWallAlignmentInference,
    type AlignReference,
    type AlignSegment,
} from '../src/WallAlignmentInference';

const ep = (x: number, z: number): AlignReference => ({ x, z, kind: 'endpoint' });

describe('computeWallAlignmentInference — perpendicular alignment', () => {
    it('locks the placed point onto the perpendicular (vertical) guide from an endpoint', () => {
        // Existing endpoint at (3, -2). Drawing from (0,0) roughly along +X so the
        // horizontal (colinear) guide is suppressed and the perpendicular vertical
        // guide (constant x = 3) is preferred. Cursor is 0.02 m off x = 3.
        const start = { x: 0, z: 0 };
        const cursor = { x: 2.98, z: 0.5 };
        const res = computeWallAlignmentInference(start, cursor, [ep(3, -2)], []);
        expect(res).not.toBeNull();
        expect(res!.primaryKind).toBe('perpendicular');
        expect(res!.label).toBe('Perpendicular');
        expect(res!.snapped.x).toBeCloseTo(3, 6);   // x snapped to the reference
        expect(res!.snapped.z).toBeCloseTo(0.5, 6);  // z (draw axis) untouched
        expect(res!.guides).toHaveLength(1);
        expect(res!.guides[0].kind).toBe('perpendicular');
        expect(res!.isIntersection).toBe(false);
    });

    it('perpendicular preference suppresses the colinear guide when drawing along +X', () => {
        // Two endpoints: one aligns on z (horizontal/colinear with the +X draw),
        // one aligns on x (vertical/perpendicular). Only the perpendicular survives.
        const start = { x: 0, z: 0 };
        const cursor = { x: 4, z: 0.03 };
        const refs = [ep(2, 0.03), ep(4.02, 5)]; // z-aligned (colinear) + x-aligned (perp)
        const res = computeWallAlignmentInference(start, cursor, refs, []);
        expect(res).not.toBeNull();
        expect(res!.isIntersection).toBe(false);          // colinear axis dropped
        expect(res!.snapped.x).toBeCloseTo(4.02, 6);      // perpendicular lock on x
        expect(res!.guides).toHaveLength(1);
    });
});

describe('computeWallAlignmentInference — intersection double-lock', () => {
    it('snaps to the intersection when a diagonal draw matches both axes', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 3, z: 3 }; // diagonal → neither axis suppressed
        const refs = [ep(3, 8), ep(9, 3)]; // x-aligned + z-aligned
        const res = computeWallAlignmentInference(start, cursor, refs, []);
        expect(res).not.toBeNull();
        expect(res!.isIntersection).toBe(true);
        expect(res!.primaryKind).toBe('intersection');
        expect(res!.snapped.x).toBeCloseTo(3, 6);
        expect(res!.snapped.z).toBeCloseTo(3, 6);
        expect(res!.guides).toHaveLength(2);
    });
});

describe('computeWallAlignmentInference — endpoint / midpoint snap', () => {
    it('snaps exactly to a nearby endpoint (highest priority)', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 5.05, z: 5.04 };
        const res = computeWallAlignmentInference(start, cursor, [ep(5, 5)], []);
        expect(res).not.toBeNull();
        expect(res!.primaryKind).toBe('endpoint');
        expect(res!.label).toBe('Endpoint');
        expect(res!.snapped.x).toBeCloseTo(5, 6);
        expect(res!.snapped.z).toBeCloseTo(5, 6);
    });

    it('labels a midpoint reference as Midpoint', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 2.03, z: 1.98 };
        const refs: AlignReference[] = [{ x: 2, z: 2, kind: 'midpoint' }];
        const res = computeWallAlignmentInference(start, cursor, refs, []);
        expect(res).not.toBeNull();
        expect(res!.primaryKind).toBe('midpoint');
        expect(res!.label).toBe('Midpoint');
    });

    it('excludes references coincident with the start anchor (no self-snap)', () => {
        const start = { x: 5, z: 5 };
        const cursor = { x: 5.02, z: 5.01 }; // right on the start
        const res = computeWallAlignmentInference(start, cursor, [ep(5, 5)], []);
        expect(res).toBeNull();
    });
});

describe('computeWallAlignmentInference — collinear / extension', () => {
    it('snaps onto the extension of a diagonal wall beyond its end', () => {
        // Diagonal wall (0,0)→(2,2). Cursor near the colinear extension at (3,3).
        const start = { x: 5, z: -5 };
        const cursor = { x: 3.05, z: 2.95 };
        const segs: AlignSegment[] = [{ a: { x: 0, z: 0 }, b: { x: 2, z: 2 } }];
        const refs = [ep(0, 0), ep(2, 2), { x: 1, z: 1, kind: 'midpoint' } as AlignReference];
        const res = computeWallAlignmentInference(start, cursor, refs, segs);
        expect(res).not.toBeNull();
        expect(res!.primaryKind).toBe('extension');
        expect(res!.label).toBe('Extension');
        expect(res!.snapped.x).toBeCloseTo(3, 6);
        expect(res!.snapped.z).toBeCloseTo(3, 6);
        expect(res!.guides[0].kind).toBe('extension');
    });

    it('does NOT treat the on-segment body as an extension (mid-segment ignored)', () => {
        const start = { x: 5, z: -5 };
        const cursor = { x: 1, z: 0.05 }; // over the middle of a (0,0)→(2,0) wall
        const segs: AlignSegment[] = [{ a: { x: 0, z: 0 }, b: { x: 2, z: 0 } }];
        // No reference points → axis inference cannot fire; only extension is eligible,
        // and t∈(0,1) is skipped → null.
        const res = computeWallAlignmentInference(start, cursor, [], segs);
        expect(res).toBeNull();
    });
});

describe('computeWallAlignmentInference — passthrough + tolerance boundary', () => {
    it('returns null when nothing is within tolerance', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 10, z: 10 };
        const res = computeWallAlignmentInference(start, cursor, [ep(3, -2)], []);
        expect(res).toBeNull();
    });

    it('snaps just INSIDE the axis tolerance (0.14 m off, threshold 0.15 m)', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 5 - 0.14, z: 0.5 }; // +X draw → perpendicular vertical guide
        const res = computeWallAlignmentInference(start, cursor, [ep(5, 0)], []);
        expect(res).not.toBeNull();
        expect(res!.snapped.x).toBeCloseTo(5, 6);
    });

    it('passes through just OUTSIDE the axis tolerance (0.2 m off, threshold 0.15 m)', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 5 - 0.2, z: 0.5 };
        const res = computeWallAlignmentInference(start, cursor, [ep(5, 0)], []);
        expect(res).toBeNull();
    });

    it('respects a custom (tighter) axisThresholdM', () => {
        const start = { x: 0, z: 0 };
        const cursor = { x: 5 - 0.09, z: 0.5 };
        const inTol = computeWallAlignmentInference(start, cursor, [ep(5, 0)], [], { axisThresholdM: 0.1 });
        const outTol = computeWallAlignmentInference(start, cursor, [ep(5, 0)], [], { axisThresholdM: 0.05 });
        expect(inTol).not.toBeNull();
        expect(outTol).toBeNull();
    });
});
