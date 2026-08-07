/**
 * §CAM-NEAR-NEVER-CUTS (L-747) — the near plane must never clip the model.
 *
 * FOUNDER REPORT (2026-08-07, build 48306351):
 *
 *   "SOMETHING HAS CHANGED ON THE 3D VIEW — I DID NOT REQUEST IT. BEFORE I COULD GET
 *    CLOSE TO ELEMENTS AND THEY WOULD NEVER SECTIONATE. NOW IT CREATES A CAMERA SECTION
 *    WHICH I MIGHT NOT WANT, BECAUSE AS I GET CLOSER TO THE ELEMENT IT GETS SECTIONED
 *    AND MIGHT NOT BE VISIBLE."
 *
 * Screenshots show walls sliced by a clean flat cut that tracks the viewpoint.
 *
 * ## This is not a section feature
 *
 * `CutFill` logged `enabled=false` throughout, and when disabled it sets
 * `renderer.clippingPlanes = []` (ViewPropertiesPanel.updateCutFillStyle). Nothing was
 * clipping by intent. The cut is the CAMERA NEAR PLANE, and the founder's own activation
 * log printed the number:
 *
 *   §CAM-FRAME-INVARIANT auto-framed …; dist=6515673.6m near=14.02 far=14022863
 *
 * `near = 14.02` m — every surface within 14 m of the viewpoint is clipped, and walking
 * closer removes more of it. That is precisely "a camera section that follows me".
 *
 * ## The rule that produced it
 *
 * `near = max(0.1, far / 1e6)` — a depth-PRECISION heuristic, keeping the near/far ratio
 * bounded. It only bites when `far` is enormous, which it was: the globe-scale bounds
 * contamination (§CAM-BIM-SCALE-BOUNDS, L-744) inflated `far` to 14,000 km. The near
 * plane is therefore the THIRD consumer of the same contamination, after default framing
 * and the Home viewpoint.
 *
 * ## What these tests pin
 *
 * A precision heuristic may never clip the model. In a BIM editor the user can walk up to
 * any surface; geometry vanishing at arm's length is not an acceptable outcome of a
 * depth-buffer trade. `near` is capped, and the cap holds even for inputs we now reject
 * upstream — defence in depth, because L-744 guards the bounds but this guards the
 * OUTPUT, and the founder found the gap between them.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeFitPose, MAX_BIM_NEAR_M } from './cameraFraming.js';

/** The far plane observed in the founder's log, in metres. */
const FOUNDER_FAR_M = 14_022_863;
/** The near plane it produced under the old `far / 1e6` rule. */
const FOUNDER_NEAR_M = 14.02;

function boundsOfExtent(halfExtentM: number): THREE.Box3 {
    return new THREE.Box3(
        new THREE.Vector3(-halfExtentM, -halfExtentM, -halfExtentM),
        new THREE.Vector3(halfExtentM, halfExtentM, halfExtentM),
    );
}

describe('§CAM-NEAR-NEVER-CUTS — near is capped at a BIM-safe value', () => {
    it('the cap matches the historical BimWorld default (the founder\'s "before")', () => {
        expect(MAX_BIM_NEAR_M).toBe(0.1);
    });

    it('REPRODUCES the old rule to show what it produced', () => {
        // Documenting the arithmetic so the next reader does not have to rediscover it:
        // far / 1e6 is exactly the founder's 14.02 m near plane.
        expect(FOUNDER_FAR_M / 1e6).toBeCloseTo(FOUNDER_NEAR_M, 2);
    });

    it('a normal BIM scene is never clipped', () => {
        const pose = computeFitPose(new THREE.Box3(
            new THREE.Vector3(-2, 0, -3),
            new THREE.Vector3(5, 3, 4),
        ))!;
        expect(pose.near).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
    });

    it('a large-but-legitimate scene (IFC site at ±800 m) is never clipped', () => {
        const pose = computeFitPose(boundsOfExtent(800))!;
        expect(pose.near).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
        // far still widens to keep the model inside the frustum — the fix caps NEAR only.
        expect(pose.far).toBeGreaterThan(800);
    });

    it('the deliberately-supported 6 km IFC outlier is never clipped', () => {
        // computeFitPose's contract is to frame a 6 km outlier honestly rather than trim
        // it. That must not cost the user the ability to walk up to a wall.
        const pose = computeFitPose(boundsOfExtent(6_000))!;
        expect(pose.near).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
    });

    it("NEVER clips even for the founder's globe-scale bounds (defence in depth)", () => {
        // L-744 stops these bounds reaching computeFitPose. This asserts the OUTPUT is
        // safe anyway: the founder found the gap between an input guard and its consumer
        // once already, and a cap that only holds for inputs we remembered to guard is
        // not a cap.
        const pose = computeFitPose(boundsOfExtent(1_635_576))!;
        expect(pose.near).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
        expect(pose.near).toBeLessThan(FOUNDER_NEAR_M);
    });

    it('near stays positive and finite for every bounds size', () => {
        for (const half of [0.5, 5, 50, 500, 5_000, 50_000, 5_000_000]) {
            const pose = computeFitPose(boundsOfExtent(half))!;
            expect(Number.isFinite(pose.near)).toBe(true);
            expect(pose.near).toBeGreaterThan(0);
            expect(pose.near).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
            // The frustum must still be a valid range.
            expect(pose.far).toBeGreaterThan(pose.near);
        }
    });
});
