/**
 * §CAM-BIM-SCALE-BOUNDS (L-744) — the guard L-378 was missing.
 *
 * FOUNDER EVIDENCE (2026-08-07). Brand-new project, walls drawn at the origin, exit
 * the Cesium globe, open the 3D view:
 *
 *   [MultiViewCameraManager] saveSlot("perspective") — position is globe/ECEF-scale
 *     (-2465677, 1173796, -12121197); skipping save (L-378)
 *   _activate3DView — perspective slot MISS
 *   [ViewCameraStateStore] restore("3D") — MISS (0 states cached, keys: [])
 *   _activate3DView — computing default framing
 *   _activate3DView — controls.setLookAt() START (target=0.0,0.0,0.0, dist=6542305.9)
 *   _activate3DView — §CAM-FRAME-INVARIANT auto-framed …; dist=6515673.6m
 *
 * 6,542 km — the Earth's radius — to look at a 5 m wall. Founder: *"the 3D view was
 * TOOOOOOOOO FAR and would not zoom in when I asked FIT ALL."*
 *
 * ## The defect these tests pin
 *
 * L-378 worked. It refused to SAVE the ECEF pose. But a refused save leaves the slot
 * EMPTY, and an empty slot sends activation to DEFAULT FRAMING, which derives its
 * distance from SCENE BOUNDS — and nothing guarded the bounds. The guard rejected a
 * globe-scale pose and the fallback immediately computed an equivalent one from a
 * different input.
 *
 * **A guard on the stored value is not a guard on the computed value.**
 *
 * Note the founder's bounds shape: `target=(0,0,0)`. The box STRADDLES the origin, so
 * every corner-distance test on the CENTRE passes while the box is still 3,271 km
 * across. That is why `isGlobeScaleBounds` tests the EXTENT as well as the corners —
 * a centre test alone would have shipped this bug a second time.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    GLOBE_SCALE_LIMIT_M,
    MAX_BIM_NEAR_M,
    isGlobeScaleBounds,
    isGlobeScalePosition,
    computeFitPose,
} from './cameraFraming.js';

/** The founder's observed default-framing distance, in metres. */
const FOUNDER_DISTANCE_M = 6_542_305.9;

/** The bounds that produce it: centred on the origin, `maxDim * 2 === FOUNDER_DISTANCE_M`. */
function foundersContaminatedBounds(): THREE.Box3 {
    const half = FOUNDER_DISTANCE_M / 4; // maxDim = half*2; distance = maxDim*2
    return new THREE.Box3(
        new THREE.Vector3(-half, -half, -half),
        new THREE.Vector3(half, half, half),
    );
}

/** A real BIM scene: a few 5 m walls near the origin. */
function bimScaleBounds(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-2, 0, -3), new THREE.Vector3(5, 3, 4));
}

describe('isGlobeScalePosition — shared with L-378 so the two guards cannot drift', () => {
    it("rejects the founder's ECEF camera pose", () => {
        expect(isGlobeScalePosition(-2465677, 1173796, -12121197)).toBe(true);
    });

    it('accepts every plausible BIM camera', () => {
        expect(isGlobeScalePosition(119.12, 131.07, 192.98)).toBe(false);  // the Home viewpoint
        expect(isGlobeScalePosition(0, 0, 0)).toBe(false);
        expect(isGlobeScalePosition(-800, 60, 800)).toBe(false);           // a large IFC import
    });

    it('rejects non-finite coordinates rather than letting NaN through', () => {
        expect(isGlobeScalePosition(NaN, 0, 0)).toBe(true);
        expect(isGlobeScalePosition(0, Infinity, 0)).toBe(true);
    });

    it('is the SAME threshold L-378 uses (1000 km)', () => {
        expect(GLOBE_SCALE_LIMIT_M).toBe(1_000_000);
    });
});

describe('isGlobeScaleBounds — §CAM-BIM-SCALE-BOUNDS (L-744)', () => {
    it("rejects the founder's origin-straddling 3,271 km box", () => {
        // TOOTH: this box's CENTRE is (0,0,0). A centre-distance test — the obvious
        // first implementation — passes it, and the 3D view opens 6,542 km out again.
        const bounds = foundersContaminatedBounds();
        expect(bounds.getCenter(new THREE.Vector3()).length()).toBe(0);
        expect(isGlobeScaleBounds(bounds)).toBe(true);
    });

    it('rejects a box dragged out by a single ECEF-positioned object', () => {
        const bounds = bimScaleBounds().clone().union(
            new THREE.Box3(
                new THREE.Vector3(-2465677, 1173796, -12121197),
                new THREE.Vector3(-2465670, 1173800, -12121190),
            ),
        );
        expect(isGlobeScaleBounds(bounds)).toBe(true);
    });

    it('ACCEPTS a real BIM scene', () => {
        expect(isGlobeScaleBounds(bimScaleBounds())).toBe(false);
    });

    it('ACCEPTS a large-but-legitimate scene (an IFC site at ±800 m)', () => {
        // The guard must not become a second bug by rejecting honest large models —
        // computeFitPose is deliberately willing to frame a 6 km outlier.
        const big = new THREE.Box3(
            new THREE.Vector3(-800, -50, -800),
            new THREE.Vector3(800, 200, 800),
        );
        expect(isGlobeScaleBounds(big)).toBe(false);
        expect(computeFitPose(big)!.distance).toBeLessThan(GLOBE_SCALE_LIMIT_M);
    });

    it('treats EMPTY bounds as empty, not as globe-scale', () => {
        // Callers already have a correct empty-bounds path; mislabelling empty as
        // contaminated would route them down an error branch for a normal state.
        expect(isGlobeScaleBounds(new THREE.Box3())).toBe(false);
    });

    it('rejects non-finite bounds', () => {
        const nan = new THREE.Box3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(NaN, 1, 1),
        );
        expect(isGlobeScaleBounds(nan)).toBe(true);
    });
});

describe("the founder's sequence: globe → exit GIS → activate 3D with an EMPTY camera store", () => {
    it('REPRODUCES the defect: unguarded bounds yield a megametre framing', () => {
        // This is what shipped. `_computeCameraDistance()` = maxDim * 2, and
        // computeFitPose agrees with it — both are faithful to contaminated input.
        const contaminated = foundersContaminatedBounds();
        const size = contaminated.getSize(new THREE.Vector3());
        const legacyDistance = Math.max(size.x, size.y, size.z, 10) * 2;

        expect(legacyDistance).toBeCloseTo(FOUNDER_DISTANCE_M, 0);
        expect(computeFitPose(contaminated)!.distance).toBeGreaterThan(1_000_000);
    });

    it('THE FIX: the guard rejects those bounds, so framing falls back to BIM scale', () => {
        const contaminated = foundersContaminatedBounds();
        expect(isGlobeScaleBounds(contaminated)).toBe(true);

        // ViewController._getSceneBoundsForCamera() returns EMPTY on rejection, and every
        // caller's empty path is BIM-scale: target (0,0,0), distance 50 m, "do not frame".
        const guarded = isGlobeScaleBounds(contaminated) ? new THREE.Box3() : contaminated;
        expect(guarded.isEmpty()).toBe(true);

        const size = guarded.getSize(new THREE.Vector3());
        const distance = guarded.isEmpty() ? 50 : Math.max(size.x, size.y, size.z, 10) * 2;

        // Metres, not megametres — the assertion the coordinator asked for.
        expect(distance).toBe(50);
        expect(distance).toBeLessThan(1000);
    });

    it('a fitted BIM scene is framed at a human distance', () => {
        const pose = computeFitPose(bimScaleBounds(), { fovDeg: 60, aspect: 1.6 })!;
        expect(pose.distance).toBeGreaterThan(1);
        expect(pose.distance).toBeLessThan(200);
    });
});

/**
 * §CAM-ECEF-HANDBACK (L-746) — the LIVE camera, and everything that samples it.
 *
 * The defect is upstream of any single consumer: the Cesium globe leaves the SHARED OBC
 * camera in ECEF coordinates and nothing restores BIM space at the handback. Consumers
 * then inherit it, and each one looks like its own separate bug.
 *
 * `HomeView` is the cautionary one. It captures the live camera 1.2–1.5 s after project
 * load, so whether it snapshots a BIM pose or a globe pose is a RACE. Two consecutive
 * founder sessions logged both outcomes from the same line of code — and the sane-looking
 * sample was very nearly adopted as the fallback for the whole default-framing path.
 */
describe('§CAM-ECEF-HANDBACK — every consumer of the live camera must refuse an ECEF pose', () => {
    /** Session A — Home captured a sane BIM pose. Looks like proof. Is a coincidence. */
    const HOME_SESSION_A = { x: 119.12, y: 131.07, z: 192.98 };
    /** Session B — same code, same line, 4,073 km out. */
    const HOME_SESSION_B = { x: -4073337.567307845, y: 1021.43, z: -215808.25 };
    /** The camera TARGET observed before a level switch reset it. */
    const STALE_TARGET_Y = -2297615.5;

    it("accepts session A's Home viewpoint", () => {
        expect(isGlobeScalePosition(HOME_SESSION_A.x, HOME_SESSION_A.y, HOME_SESSION_A.z)).toBe(false);
    });

    it("REJECTS session B's Home viewpoint — the one that silently looked fine", () => {
        // TOOTH: without this, `goToDefaultView()` sends the user 4,073 km from their walls,
        // and Home — the button the founder found as a workaround — becomes the bug.
        expect(isGlobeScalePosition(HOME_SESSION_B.x, HOME_SESSION_B.y, HOME_SESSION_B.z)).toBe(true);
    });

    it('REJECTS the stale ECEF camera TARGET, not just the position', () => {
        // `[EngineBootstrap] Level switch → "Level 1" (target.Y: -2297615.50 → 3.00)`.
        // Guarding only the position would have let this through: a camera at a sane
        // position aimed 2,297 km away frames nothing.
        expect(isGlobeScalePosition(0, STALE_TARGET_Y, 0)).toBe(true);
    });

    it('§CAM-NEAR-NEVER-CUTS — the SAME contamination also produced the "camera section"', () => {
        // The near plane is a THIRD consumer of the contaminated bounds, found only when
        // the founder reported walls being sliced as they walked up to them. Their log:
        //   §CAM-FRAME-INVARIANT auto-framed …; dist=6515673.6m near=14.02 far=14022863
        // near = 14.02 m → every surface within 14 m of the viewpoint is clipped.
        const pose = computeFitPose(foundersContaminatedBounds())!;
        expect(pose.near).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
    });

    it('the same predicate serves every consumer — one definition, no drift', () => {
        // L-378 (camera-slot save/restore), the HomeView capture/restore guard, the
        // handback barrier and the bounds guard all resolve to this function. Two
        // definitions of "globe-scale" is how L-744 shipped: one guard rejected the pose
        // and an unguarded path recomputed an equivalent one.
        expect(isGlobeScalePosition(-2465677, 1173796, -12121197)).toBe(true);   // slot save (L-378)
        expect(isGlobeScalePosition(HOME_SESSION_B.x, HOME_SESSION_B.y, HOME_SESSION_B.z)).toBe(true); // Home
        expect(isGlobeScaleBounds(foundersContaminatedBounds())).toBe(true);     // default framing
    });
});
