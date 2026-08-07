/**
 * cameraFraming — §CAM-FRAME-INVARIANT (L-742) / §CAM-SLOT-CANVAS2D — C04.
 *
 * These pin the FRAMING invariant, not pixels:
 *
 *   Activating a 3D view must leave the model on screen. A remembered camera is kept
 *   ONLY if the scene bounds still intersect its frustum (near/far included); otherwise
 *   the view is fitted.
 *
 * The founder's white 3D view was a camera that framed nothing (either pushed past the
 * 2000 m far plane by a fit that ignored the depth range, or a plan-view pose replayed on
 * the perspective camera). The regressions to keep out are therefore:
 *   - a fit that leaves the model outside its own far plane;
 *   - a fit that YANKS a user who is deliberately zoomed into a detail;
 *   - a Canvas2D view persisting an OBC camera it never drove.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    computeFitPose,
    boundsVisibleToCamera,
    boundsFramedByCamera,
    shouldPersistDepartingCamera,
} from './cameraFraming.js';

/** Build a perspective camera placed by a FitPose, with that pose's depth range applied. */
function cameraAtPose(
    pose: { position: THREE.Vector3; target: THREE.Vector3; near: number; far: number },
    aspect = 1,
): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(60, aspect, pose.near, pose.far);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

function boxAround(cx: number, cy: number, cz: number, half: number): THREE.Box3 {
    return new THREE.Box3(
        new THREE.Vector3(cx - half, cy - half, cz - half),
        new THREE.Vector3(cx + half, cy + half, cz + half),
    );
}

describe('computeFitPose — the fitted pose always frames the bounds', () => {
    it('a house-scale model is inside the fitted camera frustum', () => {
        const bounds = boxAround(0, 4, 0, 8);
        const pose = computeFitPose(bounds, { fovDeg: 60, aspect: 1.6 })!;
        expect(pose).not.toBeNull();
        expect(boundsVisibleToCamera(cameraAtPose(pose, 1.6), bounds)).toBe(true);
    });

    it('§FIX: an extreme-outlier scene (IFC storeys ±800 m) is still inside the frustum — the far plane travels with the pose', () => {
        // This is the founder's white screen, reproduced: bounds far larger than the
        // historical hard-wired far plane of 2000 m.
        const bounds = new THREE.Box3(
            new THREE.Vector3(-20, -800, -20),
            new THREE.Vector3(20, 6000, 20),
        );
        const pose = computeFitPose(bounds, { fovDeg: 60, aspect: 1.6 })!;

        // The honest fit really is beyond the old far plane…
        expect(pose.distance).toBeGreaterThan(2000);
        // …so the pose MUST widen it, or every fragment is depth-clipped (white viewport).
        expect(pose.far).toBeGreaterThan(pose.distance);
        expect(boundsVisibleToCamera(cameraAtPose(pose, 1.6), bounds)).toBe(true);
    });

    it('REGRESSION GUARD: applying the fit position WITHOUT the pose far plane renders nothing', () => {
        const bounds = new THREE.Box3(
            new THREE.Vector3(-20, -800, -20),
            new THREE.Vector3(20, 6000, 20),
        );
        const pose = computeFitPose(bounds)!;
        const stale = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000); // the old hard-wired range
        stale.position.copy(pose.position);
        stale.lookAt(pose.target);
        stale.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(stale, bounds)).toBe(false);
    });

    it('fits honestly — no outlier clamping, trimming or silent re-centring', () => {
        const bounds = new THREE.Box3(
            new THREE.Vector3(-5, 0, -5),
            new THREE.Vector3(5, 6000, 5),
        );
        const pose = computeFitPose(bounds)!;
        const center = bounds.getCenter(new THREE.Vector3());
        expect(pose.target.y).toBeCloseTo(center.y, 6);   // the outlier moved the centre — honestly
        expect(boundsVisibleToCamera(cameraAtPose(pose), bounds)).toBe(true);
    });

    it('a narrow (tall) pane still frames the model — the horizontal FOV constrains the pull-back', () => {
        const bounds = boxAround(0, 0, 0, 12);
        const aspect = 0.35;                                // split right-hand pane shape
        const pose = computeFitPose(bounds, { fovDeg: 60, aspect })!;
        expect(boundsVisibleToCamera(cameraAtPose(pose, aspect), bounds)).toBe(true);
    });

    it('returns null for empty bounds — callers must leave the camera alone', () => {
        expect(computeFitPose(new THREE.Box3())).toBeNull();
    });
});

describe('boundsVisibleToCamera — the activation decision', () => {
    it('a stale camera framing empty space 5 km away does NOT see the model → activation fits', () => {
        const bounds = boxAround(0, 4, 0, 8);
        const stale = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        stale.position.set(5000, 5000, 5000);
        stale.lookAt(new THREE.Vector3(6000, 5000, 6000));
        stale.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(stale, bounds)).toBe(false);
    });

    it('a plan-view pose (top-down, aimed at a level 900 m away) technically CONTAINS the model — frustum alone is not enough', () => {
        // The §CAM-SLOT-CANVAS2D pollution shape: an orthographic plan pose written into
        // the perspective slot. This is exactly why the activation predicate is
        // boundsFramedByCamera and not boundsVisibleToCamera: the raw frustum test passes
        // while the founder sees a speck ("It is NOT FOCUSED or ZOOMED on the elements").
        const bounds = boxAround(0, 4, 0, 8);
        const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        cam.position.set(0, 940, 0);
        cam.lookAt(new THREE.Vector3(0, 900, 0));
        cam.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(cam, bounds)).toBe(true);    // in the frustum…
        expect(boundsFramedByCamera(cam, bounds)).toBe(false);    // …but not FRAMED → fit
    });

    it('PRESERVES DELIBERATE FRAMING: a user zoomed into a detail still sees the model → no yank', () => {
        const bounds = boxAround(0, 4, 0, 8);
        const zoomed = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        zoomed.position.set(2, 4.2, 6);                 // nose-in on one corner, inside the bounds region
        zoomed.lookAt(new THREE.Vector3(2, 4.2, 0));
        zoomed.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(zoomed, bounds)).toBe(true);
    });

    it('a camera pushed past its own far plane sees nothing (the white-viewport signature)', () => {
        const bounds = boxAround(0, 0, 0, 10);
        const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        cam.position.set(0, 0, 9000);
        cam.lookAt(new THREE.Vector3(0, 0, 0));         // aimed straight AT the model…
        cam.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(cam, bounds)).toBe(false); // …and still shows nothing
    });

    it('empty bounds are reported not-visible', () => {
        const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        cam.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(cam, new THREE.Box3())).toBe(false);
    });
});

describe('shouldPersistDepartingCamera — §CAM-SLOT-CANVAS2D', () => {
    it('a Canvas2D plan / elevation view never persists the OBC camera it did not drive', () => {
        expect(shouldPersistDepartingCamera({ departingViewIsCanvas2D: true })).toBe(false);
    });

    it('a real OBC-camera view still persists its pose (camera memory is not destroyed)', () => {
        expect(shouldPersistDepartingCamera({ departingViewIsCanvas2D: false })).toBe(true);
    });
});

describe('boundsFramedByCamera — the activation predicate (frustum ∩ apparent size)', () => {
    it('the fitted pose is framed', () => {
        const bounds = boxAround(0, 4, 0, 8);
        const pose = computeFitPose(bounds, { fovDeg: 60, aspect: 1.6 })!;
        expect(boundsFramedByCamera(cameraAtPose(pose, 1.6), bounds)).toBe(true);
    });

    it('PRESERVES DELIBERATE FRAMING: nose-in on a detail stays put (no yank on view switch)', () => {
        const bounds = boxAround(0, 4, 0, 8);
        const zoomed = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        zoomed.position.set(2, 4.2, 14);
        zoomed.lookAt(new THREE.Vector3(2, 4.2, 0));
        zoomed.updateMatrixWorld(true);
        expect(boundsFramedByCamera(zoomed, bounds)).toBe(true);
    });

    it('a camera INSIDE the model counts as framed', () => {
        const bounds = boxAround(0, 0, 0, 20);
        const inside = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        inside.position.set(0, 0, 0);
        inside.lookAt(new THREE.Vector3(0, 0, -1));
        inside.updateMatrixWorld(true);
        expect(boundsFramedByCamera(inside, bounds)).toBe(true);
    });

    it('a model reduced to a speck is NOT framed, even though it is in the frustum', () => {
        const bounds = boxAround(0, 0, 0, 3);
        const farOff = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
        farOff.position.set(0, 0, 900);
        farOff.lookAt(new THREE.Vector3(0, 0, 0));
        farOff.updateMatrixWorld(true);
        expect(boundsVisibleToCamera(farOff, bounds)).toBe(true);
        expect(boundsFramedByCamera(farOff, bounds)).toBe(false);
    });

    it('the extreme-outlier scene, fitted, is framed (behaviour under enormous bounds is: fit honestly)', () => {
        const bounds = new THREE.Box3(
            new THREE.Vector3(-20, -800, -20),
            new THREE.Vector3(20, 6000, 20),
        );
        const pose = computeFitPose(bounds, { fovDeg: 60, aspect: 1.6 })!;
        expect(boundsFramedByCamera(cameraAtPose(pose, 1.6), bounds)).toBe(true);
    });
});
