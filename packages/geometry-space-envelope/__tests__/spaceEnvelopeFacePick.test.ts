// spaceEnvelopeFacePick.test.ts — the PURE half of face-drag on the site views.
// §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS (lane FACE-DRAG, 2026-09-07) · L-13045 · C114 §10.
//
// ⭐ WHAT THESE ARMS ARE FOR. `pickFace` is one of the four ports the renderer-free drag core
// needs, and it was the port L-13045 priced as "per-face pickable geometry on every renderer".
// It is arithmetic instead — so it is provable HERE, in `node`, against exact numbers, on every
// surface at once. ⛔ What is NOT proven here, and is stated in the lane report rather than
// implied by a green suite: the RAY. Building a screen ray needs a real camera and a real depth
// buffer, and no fake viewer was built for it ([[fake-more-capable-than-real]]).

import { describe, expect, it } from 'vitest';
import {
    FACE_BOUNDS_EPSILON_M,
    pickNearestSpaceEnvelopeFace,
    pickNearestSpaceEnvelopeSideFaceInPlan,
    pickSpaceEnvelopeFace,
    pickSpaceEnvelopeSideFaceInPlan,
    type SpaceEnvelopePrism,
} from '../src/index.js';

/**
 * A 10 × 10 m box on the XZ plane, from (0,0) to (10,10), 3 m tall, seated at y = 0.
 *
 * Edge indexing follows the package's ONE convention (edge `i` runs `footprint[i]` →
 * `footprint[i+1]`), so with this ring:
 *   edge 0 = z = 0   (outward normal −Z)
 *   edge 1 = x = 10  (outward normal +X)
 *   edge 2 = z = 10  (outward normal +Z)
 *   edge 3 = x = 0   (outward normal −X)
 */
const box = (over: Partial<SpaceEnvelopePrism> = {}): SpaceEnvelopePrism => ({
    id: 'SE-BOX',
    footprint: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 0, z: 10 },
        { x: 0, y: 0, z: 10 },
    ],
    baseOffset: 0,
    height: 3,
    ...over,
});

describe('pickSpaceEnvelopeFace — the ray/prism intersection', () => {
    it('names the side face the ray meets FIRST, with the hit point and the distance in metres', () => {
        // Standing at x = −5, looking straight along +X at mid-height. It must meet edge 3
        // (x = 0) at 5 m, NOT edge 1 (x = 10) at 15 m — the far wall is behind the near one.
        const hit = pickSpaceEnvelopeFace(box(), { x: -5, y: 1.5, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit).not.toBeNull();
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 3 });
        expect(hit!.point.x).toBeCloseTo(0, 9);
        expect(hit!.point.y).toBeCloseTo(1.5, 9);
        expect(hit!.point.z).toBeCloseTo(5, 9);
        expect(hit!.distanceM).toBeCloseTo(5, 9);
    });

    it('reports distance in METRES even when the caller hands an un-normalised direction', () => {
        // ⛔ The whole point of normalising: `pickNearest…` ranks prisms by `distanceM`, so a
        // unit that tracked the caller's direction length would rank a FAR envelope ahead of a
        // NEAR one purely because two adapters built their rays with different scales.
        const unit = pickSpaceEnvelopeFace(box(), { x: -5, y: 1.5, z: 5 }, { x: 1, y: 0, z: 0 });
        const long = pickSpaceEnvelopeFace(box(), { x: -5, y: 1.5, z: 5 }, { x: 1000, y: 0, z: 0 });
        expect(long!.distanceM).toBeCloseTo(unit!.distanceM, 9);
        expect(long!.distanceM).toBeCloseTo(5, 9);
    });

    it('picks the TOP cap for a ray coming down from above the ring', () => {
        const hit = pickSpaceEnvelopeFace(box(), { x: 5, y: 20, z: 5 }, { x: 0, y: -1, z: 0 });
        expect(hit!.face).toEqual({ kind: 'top' });
        expect(hit!.point.y).toBeCloseTo(3, 9);
        expect(hit!.distanceM).toBeCloseTo(17, 9);
    });

    it('picks the BOTTOM cap for a ray coming up from below', () => {
        const hit = pickSpaceEnvelopeFace(
            box({ baseOffset: 6, height: 3 }),
            { x: 5, y: 0, z: 5 },
            { x: 0, y: 1, z: 0 },
        );
        expect(hit!.face).toEqual({ kind: 'bottom' });
        expect(hit!.point.y).toBeCloseTo(6, 9);
    });

    it('⛔ REFUSES a hit BEHIND the origin — the prism is behind the camera', () => {
        // Same geometry as arm 1, ray reversed. Every intersection now has t < 0.
        expect(pickSpaceEnvelopeFace(box(), { x: -5, y: 1.5, z: 5 }, { x: -1, y: 0, z: 0 })).toBeNull();
    });

    it('⛔ a ray PARALLEL to a face plane contributes nothing from that face', () => {
        // Travelling along +Z at x = 20: parallel to edges 1 and 3 (both x = const), and it
        // never reaches edges 0 or 2 because it is 10 m outside the ring. No hit at all.
        expect(pickSpaceEnvelopeFace(box(), { x: 20, y: 1.5, z: -50 }, { x: 0, y: 0, z: 1 })).toBeNull();
        // The same direction INSIDE the ring's x-extent still answers, from the faces it is
        // NOT parallel to — the parallel test must skip one face, never abandon the pick.
        const inside = pickSpaceEnvelopeFace(box(), { x: 5, y: 1.5, z: -50 }, { x: 0, y: 0, z: 1 });
        expect(inside!.face).toEqual({ kind: 'side', edgeIndex: 0 });
    });

    it('⛔ a ray in the plane of the top cap does not report the top cap', () => {
        // dy = 0 exactly: the cap branch is skipped wholesale. It meets edge 3 instead.
        const hit = pickSpaceEnvelopeFace(box(), { x: -5, y: 3, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 3 });
    });

    it('a GRAZING ray that passes just OUTSIDE the ring hits nothing', () => {
        // Aimed down at z = 10 + 1 mm — a millimetre beyond the far wall, on a 10 m box.
        expect(
            pickSpaceEnvelopeFace(box(), { x: 5, y: 20, z: 10.001 }, { x: 0, y: -1, z: 0 }),
        ).toBeNull();
    });

    it('a GRAZING ray that passes just INSIDE the ring hits the cap', () => {
        const hit = pickSpaceEnvelopeFace(box(), { x: 5, y: 20, z: 9.999 }, { x: 0, y: -1, z: 0 });
        expect(hit!.face).toEqual({ kind: 'top' });
    });

    it('⭐ the SEAM between a side face and the top cap is grabbable, not a dead strip', () => {
        // Straight along +X at exactly y = topY. Without `FACE_BOUNDS_EPSILON_M` the hit lands
        // a few ulps outside BOTH faces and the top edge of every envelope would be a strip the
        // user can see and cannot grab.
        const hit = pickSpaceEnvelopeFace(box(), { x: -5, y: 3, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit).not.toBeNull();
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 3 });
        expect(FACE_BOUNDS_EPSILON_M).toBeGreaterThan(0);
    });

    it('⚠ a ray starting INSIDE the prism returns the face it EXITS through', () => {
        // Documented behaviour, pinned so nobody "fixes" it into reporting the wall behind the
        // eye — which is what a nearest-|t| rule would do.
        const hit = pickSpaceEnvelopeFace(box(), { x: 5, y: 1.5, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 1 });
        expect(hit!.distanceM).toBeCloseTo(5, 9);
    });

    it('⛔ refuses every degenerate subject rather than guessing', () => {
        const o = { x: -5, y: 1.5, z: 5 };
        const d = { x: 1, y: 0, z: 0 };
        // Two vertices bound no area.
        expect(pickSpaceEnvelopeFace(
            { id: 'A', footprint: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], baseOffset: 0, height: 3 },
            o, d,
        )).toBeNull();
        // No vertical extent.
        expect(pickSpaceEnvelopeFace(box({ height: 0 }), o, d)).toBeNull();
        // A zero-length direction is not a ray.
        expect(pickSpaceEnvelopeFace(box(), o, { x: 0, y: 0, z: 0 })).toBeNull();
        // Non-finite inputs, on either side.
        expect(pickSpaceEnvelopeFace(box(), { x: NaN, y: 1.5, z: 5 }, d)).toBeNull();
        expect(pickSpaceEnvelopeFace(box(), o, { x: Infinity, y: 0, z: 0 })).toBeNull();
        expect(pickSpaceEnvelopeFace(box({ height: NaN }), o, d)).toBeNull();
        // A ring vertex PRYZM cannot place.
        expect(pickSpaceEnvelopeFace(
            box({ footprint: [{ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }] }),
            o, d,
        )).toBeNull();
    });

    it('works on a NON-ORTHOGONAL ring — the face normal is the ring edge’s own', () => {
        // A triangle. The ray along +X at z = 1 meets the hypotenuse-free vertical edge 2
        // (from (0,10) back to (0,0)) — i.e. x = 0 — first.
        const tri: SpaceEnvelopePrism = {
            id: 'T',
            footprint: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 }],
            baseOffset: 0,
            height: 3,
        };
        const hit = pickSpaceEnvelopeFace(tri, { x: -5, y: 1.5, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 2 });
        expect(hit!.point.x).toBeCloseTo(0, 9);
    });
});

describe('pickNearestSpaceEnvelopeFace — one sweep across many prisms', () => {
    it('returns the NEAR prism, not the first in the list', () => {
        const near = box({ id: 'NEAR' });
        const far = box({
            id: 'FAR',
            footprint: [
                { x: 100, y: 0, z: 0 }, { x: 110, y: 0, z: 0 },
                { x: 110, y: 0, z: 10 }, { x: 100, y: 0, z: 10 },
            ],
        });
        // FAR listed first on purpose.
        const hit = pickNearestSpaceEnvelopeFace([far, near], { x: -5, y: 1.5, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit!.id).toBe('NEAR');
        expect(hit!.distanceM).toBeCloseTo(5, 9);
    });

    it('⭐ a ROOM nested inside its LEVEL stays reachable — the enclosing envelope does not swallow it', () => {
        // This is the case that rules out "pick the nearest envelope, then its nearest face":
        // a room lives inside its level by construction (STR §12). Standing INSIDE the level and
        // looking at the room, the room's near wall is the nearest face in front of the eye.
        const level = box({ id: 'LEVEL' });
        const room = box({
            id: 'ROOM',
            footprint: [
                { x: 4, y: 0, z: 4 }, { x: 6, y: 0, z: 4 },
                { x: 6, y: 0, z: 6 }, { x: 4, y: 0, z: 6 },
            ],
            height: 2.5,
        });
        const hit = pickNearestSpaceEnvelopeFace([level, room], { x: 1, y: 1.2, z: 5 }, { x: 1, y: 0, z: 0 });
        expect(hit!.id).toBe('ROOM');
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 3 });
        expect(hit!.distanceM).toBeCloseTo(3, 9);
    });

    it('answers null for an empty world, a world of unusable rows, and a miss', () => {
        expect(pickNearestSpaceEnvelopeFace([], { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
        expect(pickNearestSpaceEnvelopeFace(
            [box({ id: '' })], { x: -5, y: 1.5, z: 5 }, { x: 1, y: 0, z: 0 },
        )).toBeNull();
        expect(pickNearestSpaceEnvelopeFace(
            [box()], { x: -5, y: 100, z: 5 }, { x: 1, y: 0, z: 0 },
        )).toBeNull();
    });
});

describe('the PLAN pick — side faces only, because a plan map has no vertical axis', () => {
    it('names the nearest ring edge within tolerance and seats the point at MID-HEIGHT', () => {
        // 0.2 m outside the x = 0 wall (edge 3), well within a 1 m grab radius.
        const hit = pickSpaceEnvelopeSideFaceInPlan(box(), -0.2, 5, 1);
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 3 });
        expect(hit!.point.x).toBeCloseTo(0, 9);
        expect(hit!.point.z).toBeCloseTo(5, 9);
        expect(hit!.point.y).toBeCloseTo(1.5, 9);      // baseOffset + height/2
        expect(hit!.distanceM).toBeCloseTo(0.2, 9);
    });

    it('⛔ never returns TOP or BOTTOM — height on a plan map is a numeric field, not a drag', () => {
        // Dead centre of the ring: a RAY pick from a plan camera would answer `top`. This must
        // not, at any tolerance, because `top`'s axis is ±Y and a plan pointer cannot express it.
        for (const tol of [0.1, 5, 50, 5000]) {
            const hit = pickSpaceEnvelopeSideFaceInPlan(box(), 5, 5, tol);
            if (hit !== null) expect(hit.face.kind).toBe('side');
        }
    });

    it('⛔ CLAMPS to the segment — a click past the end of a wall is not on that wall', () => {
        // 50 m beyond the end of edge 0 (z = 0, x ∈ [0,10]), exactly on its infinite line.
        // An unclamped projection would report edge 0 at distance 0.
        expect(pickSpaceEnvelopeSideFaceInPlan(box(), 60, 0, 1)).toBeNull();
    });

    it('respects the caller’s tolerance in both directions', () => {
        expect(pickSpaceEnvelopeSideFaceInPlan(box(), -2, 5, 1)).toBeNull();       // 2 m out, 1 m radius
        expect(pickSpaceEnvelopeSideFaceInPlan(box(), -2, 5, 3)).not.toBeNull();   // same click, 3 m radius
    });

    it('takes the NEAREST of two adjacent edges near a corner', () => {
        // Just outside the (0,0) corner but nearer to the z = 0 wall (edge 0) than the x = 0
        // wall (edge 3): 0.1 m below vs 0.3 m to the left.
        const hit = pickSpaceEnvelopeSideFaceInPlan(box(), 0.3, -0.1, 1);
        expect(hit!.face).toEqual({ kind: 'side', edgeIndex: 0 });
    });

    it('sweeps many prisms and refuses degenerate subjects', () => {
        const level = box({ id: 'LEVEL' });
        const room = box({
            id: 'ROOM',
            footprint: [
                { x: 4, y: 0, z: 4 }, { x: 6, y: 0, z: 4 },
                { x: 6, y: 0, z: 6 }, { x: 4, y: 0, z: 6 },
            ],
        });
        // A click 0.1 m outside the room's x = 4 wall is 3.9 m from the level's x = 0 wall.
        const hit = pickNearestSpaceEnvelopeSideFaceInPlan([level, room], 3.9, 5, 1);
        expect(hit!.id).toBe('ROOM');
        expect(pickNearestSpaceEnvelopeSideFaceInPlan([], 0, 0, 1)).toBeNull();
        expect(pickSpaceEnvelopeSideFaceInPlan(box({ height: 0 }), -0.2, 5, 1)).toBeNull();
        expect(pickSpaceEnvelopeSideFaceInPlan(box(), NaN, 5, 1)).toBeNull();
        expect(pickSpaceEnvelopeSideFaceInPlan(box(), -0.2, 5, -1)).toBeNull();
    });
});
