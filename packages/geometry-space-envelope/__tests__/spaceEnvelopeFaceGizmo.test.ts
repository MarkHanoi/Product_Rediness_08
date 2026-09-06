// THE LITTLE ARROW — §25.6 gesture 1, the affordance that did not exist.
// C114 §10 / §11 item 6 · ADR-0380 D4 · P2 (no THREE in this package or this test).
//
// ✅ ESTABLISHES: that a handle is placed on EVERY face, along THE SAME axis the drag
//    projects onto, standing off the face rather than in it, sized from the face's own
//    smallest extent and clamped at both ends.
// ⛔ DOES NOT ESTABLISH: that anything is visible. No cone is built here — that is
//    `SpaceEnvelopeFaceGizmoBuilder` (L7) — and nothing in this lane is browser-verified
//    (C114 §14d, unchanged).

import { describe, expect, it } from 'vitest';
import {
    GIZMO_HALF_LENGTH_FRACTION,
    GIZMO_MAX_HALF_LENGTH_M,
    GIZMO_MIN_HALF_LENGTH_M,
    GIZMO_STANDOFF_FACTOR,
    spaceEnvelopeFaceAxis,
    spaceEnvelopeFaceCentre,
    spaceEnvelopeFaceExtentM,
    spaceEnvelopeFaceHandle,
    spaceEnvelopeFaceHandles,
    spaceEnvelopeFaces,
    type SpaceEnvelopePrism,
} from '../src/index.js';

/** An axis-aligned box, CCW in XZ, on the level plane. */
function box(id: string, x0: number, z0: number, w: number, d: number, h = 3, base = 0): SpaceEnvelopePrism {
    return {
        id,
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 + d },
            { x: x0, y: 0, z: z0 + d },
        ],
        baseOffset: base,
        height: h,
    };
}

describe('one handle per face — the founder\'s "for each face a little arrow"', () => {
    const P = box('R', 0, 0, 6, 4, 3);

    it('every face of the prism gets a handle, and none is invented', () => {
        const handles = spaceEnvelopeFaceHandles(P);
        expect(handles).toHaveLength(spaceEnvelopeFaces(P).length);
        expect(handles).toHaveLength(6); // 4 sides + top + bottom
        expect(handles.map((h) => h.key)).toEqual([
            'side face #0', 'side face #1', 'side face #2', 'side face #3', 'top face', 'bottom face',
        ]);
    });

    it('⛔ the face ref carried is the SOLVER\'s own — the `moveFace` payload, not a copy', () => {
        // If this drifts, an arrow drawn over face #2 moves face #3 and the defect looks
        // like a physics bug while being an arithmetic one.
        const handles = spaceEnvelopeFaceHandles(P);
        expect(handles.map((h) => h.face)).toEqual(spaceEnvelopeFaces(P));
    });
});

describe('⭐ THE AXIS IS THE DRAG\'S OWN — not re-derived, and this is the assertion that matters', () => {
    // A non-orthogonal footprint: the whole reason the gizmo may not use world X/Y/Z.
    const SKEW: SpaceEnvelopePrism = {
        id: 'skew',
        footprint: [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 0, z: 0 },
            { x: 6, y: 0, z: 3 },
            { x: 0, y: 0, z: 4 },
        ],
        baseOffset: 0,
        height: 2.8,
    };

    it('each handle\'s axis equals `spaceEnvelopeFaceAxis` for that face, exactly', () => {
        for (const h of spaceEnvelopeFaceHandles(SKEW)) {
            expect(h.axis).toEqual(spaceEnvelopeFaceAxis(SKEW, h.face));
        }
    });

    it('the skewed face\'s axis is NOT a world axis — the case a shared-axis gizmo gets wrong', () => {
        const h = spaceEnvelopeFaceHandle(SKEW, { kind: 'side', edgeIndex: 1 })!;
        expect(Math.abs(h.axis.x)).toBeGreaterThan(0.05);
        expect(Math.abs(h.axis.z)).toBeGreaterThan(0.05);
        expect(Math.hypot(h.axis.x, h.axis.z)).toBeCloseTo(1, 9);
    });

    it('each handle\'s face centre equals `spaceEnvelopeFaceCentre` — the arrow points AT its face', () => {
        for (const h of spaceEnvelopeFaceHandles(SKEW)) {
            expect(h.faceCentre).toEqual(spaceEnvelopeFaceCentre(SKEW, h.face));
        }
    });
});

describe('the arrow stands OFF the face, on the outward side', () => {
    const P = box('R', 0, 0, 6, 4, 3);

    it('the anchor is the face centre pushed along +axis by halfLength × standoff', () => {
        const h = spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 1 })!; // x = 6, outward +x
        // ⚠ `toBeCloseTo`, not `toEqual`: the normal of a CCW edge along −z yields a
        // NEGATIVE ZERO for the z component, and `-0` !== `0` under a deep-equality
        // assertion. Pinning the sign of a zero would be a test asserting an IEEE-754
        // artefact rather than a direction.
        expect(h.axis.x).toBeCloseTo(1, 12);
        expect(h.axis.y).toBeCloseTo(0, 12);
        expect(h.axis.z).toBeCloseTo(0, 12);
        expect(h.faceCentre.x).toBeCloseTo(6, 9);
        expect(h.anchor.x).toBeCloseTo(6 + h.halfLengthM * GIZMO_STANDOFF_FACTOR, 9);
        expect(h.anchor.z).toBeCloseTo(h.faceCentre.z, 9);
        expect(h.anchor.y).toBeCloseTo(h.faceCentre.y, 9);
    });

    it('⛔ the standoff clears the face plane, so the INWARD head does not z-fight it', () => {
        // The arrow spans anchor ± halfLength·axis. The inward tip therefore sits at
        // halfLength·(standoff − 1) OUTSIDE the face, which must be strictly positive.
        expect(GIZMO_STANDOFF_FACTOR).toBeGreaterThan(1);
        const h = spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 1 })!;
        const inwardTipX = h.anchor.x - h.halfLengthM;
        expect(inwardTipX).toBeGreaterThan(h.faceCentre.x);
    });

    it('the TOP handle stands above the top face and the BOTTOM handle below the base', () => {
        const top = spaceEnvelopeFaceHandle(P, { kind: 'top' })!;
        const bottom = spaceEnvelopeFaceHandle(P, { kind: 'bottom' })!;
        expect(top.axis).toEqual({ x: 0, y: 1, z: 0 });
        expect(bottom.axis).toEqual({ x: 0, y: -1, z: 0 });
        expect(top.anchor.y).toBeGreaterThan(3);
        expect(bottom.anchor.y).toBeLessThan(0);
    });
});

describe('the size rule — smallest extent, clamped at BOTH ends', () => {
    it('a side face is sized from min(edge length, height), never the length', () => {
        // 12 m long, 2.6 m tall: sized off the LENGTH the arrow would be 2.16 m and would
        // overlap the arrows on the faces beside it.
        const P = box('L', 0, 0, 12, 8, 2.6);
        expect(spaceEnvelopeFaceExtentM(P, { kind: 'side', edgeIndex: 0 })).toBeCloseTo(2.6, 9);
        const h = spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 0 })!;
        expect(h.halfLengthM).toBeCloseTo(2.6 * GIZMO_HALF_LENGTH_FRACTION, 9);
    });

    it('⛔ FLOOR — a 0.9 m WC wall still gets an aimable handle, not a speck', () => {
        const P = box('WC', 0, 0, 0.9, 1.2, 2.4);
        const h = spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 0 })!;
        // 0.9 × 0.18 = 0.162 — below the floor, so the floor wins.
        expect(0.9 * GIZMO_HALF_LENGTH_FRACTION).toBeLessThan(GIZMO_MIN_HALF_LENGTH_M);
        expect(h.halfLengthM).toBeCloseTo(GIZMO_MIN_HALF_LENGTH_M, 9);
    });

    it('⛔ CEILING — a 40 m storey frontage does not grow a 7 m arrow over its own rooms', () => {
        const P = box('Ground', 0, 0, 40, 30, 12);
        const h = spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 0 })!;
        expect(12 * GIZMO_HALF_LENGTH_FRACTION).toBeGreaterThan(GIZMO_MAX_HALF_LENGTH_M);
        expect(h.halfLengthM).toBeCloseTo(GIZMO_MAX_HALF_LENGTH_M, 9);
    });

    it('a cap is sized from the SHORTER bounding-box side', () => {
        const P = box('R', 0, 0, 10, 3, 3);
        expect(spaceEnvelopeFaceExtentM(P, { kind: 'top' })).toBeCloseTo(3, 9);
    });

    it('the head and shaft are proportions of the half-length, so the arrow scales as one shape', () => {
        const small = spaceEnvelopeFaceHandle(box('a', 0, 0, 2, 2, 2), { kind: 'side', edgeIndex: 0 })!;
        const big = spaceEnvelopeFaceHandle(box('b', 0, 0, 9, 9, 9), { kind: 'side', edgeIndex: 0 })!;
        for (const h of [small, big]) {
            expect(h.headLengthM / h.halfLengthM).toBeCloseTo(small.headLengthM / small.halfLengthM, 9);
            expect(h.headRadiusM / h.headLengthM).toBeCloseTo(small.headRadiusM / small.headLengthM, 9);
            expect(h.shaftRadiusM / h.headRadiusM).toBeCloseTo(small.shaftRadiusM / small.headRadiusM, 9);
        }
        expect(big.halfLengthM).toBeGreaterThan(small.halfLengthM);
    });
});

describe('⛔ a face that cannot carry a handle is ABSENT, never degenerate', () => {
    it('a zero-length ring edge yields no handle for that face and does not throw', () => {
        const P: SpaceEnvelopePrism = {
            id: 'dup',
            footprint: [
                { x: 0, y: 0, z: 0 },
                { x: 4, y: 0, z: 0 },
                { x: 4, y: 0, z: 0 },   // duplicate — edge #1 has zero length
                { x: 4, y: 0, z: 4 },
                { x: 0, y: 0, z: 4 },
            ],
            baseOffset: 0,
            height: 3,
        };
        expect(spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 1 })).toBeNull();
        const handles = spaceEnvelopeFaceHandles(P);
        expect(handles.some((h) => h.key === 'side face #1')).toBe(false);
        // ⭐ AND THE REST STILL DRAW. A degenerate edge costs its own arrow, not the set.
        expect(handles.length).toBe(spaceEnvelopeFaces(P).length - 1);
    });

    it('a footprint with fewer than three vertices yields nothing at all', () => {
        const P: SpaceEnvelopePrism = {
            id: 'line', footprint: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], baseOffset: 0, height: 3,
        };
        expect(spaceEnvelopeFaceExtentM(P, { kind: 'side', edgeIndex: 0 })).toBeNull();
        expect(spaceEnvelopeFaceHandle(P, { kind: 'top' })).toBeNull();
    });

    it('a face index off the end of the ring yields null, not a wrapped face', () => {
        const P = box('R', 0, 0, 4, 4);
        expect(spaceEnvelopeFaceHandle(P, { kind: 'side', edgeIndex: 9 })).toBeNull();
        expect(spaceEnvelopeFaceExtentM(P, { kind: 'side', edgeIndex: -1 })).toBeNull();
    });
});

describe('the handle follows the prism — a dragged face carries its own arrow', () => {
    it('the same face on a grown prism gives an anchor further out, on the same axis', () => {
        const before = spaceEnvelopeFaceHandle(box('R', 0, 0, 6, 4), { kind: 'side', edgeIndex: 1 })!;
        const after = spaceEnvelopeFaceHandle(box('R', 0, 0, 8, 4), { kind: 'side', edgeIndex: 1 })!;
        expect(after.axis).toEqual(before.axis);
        expect(after.anchor.x).toBeGreaterThan(before.anchor.x);
        expect(after.faceCentre.x - before.faceCentre.x).toBeCloseTo(2, 9);
    });
});
