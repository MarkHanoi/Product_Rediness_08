/**
 * §CAM-NEAR-SCALES-WITH-STANDOFF (L-2070) — the near plane must not delete the wall the
 * user just leaned in on.
 *
 * FOUNDER REPORT (2026-08-21, production `071a7b2c`, WebGL):
 *
 *   *"Lately when I zoom in — sometimes too much (not even to a wall) — the window
 *    disappears."*
 *
 * Screenshot: the wall surface is a flat white/grey field, two window-shaped rectangles
 * float in it, the green ground plane shows through them.
 *
 * ## What these tests assert, and why they are not config checks
 *
 * `[[committed-is-not-reachable]]`. `expect(NEAR_INSPECT_M).toBe(0.01)` proves nothing
 * about whether a wall draws. So every visibility assertion here goes through the SAME
 * arithmetic the GPU does:
 *
 *   1. build a REAL `THREE.Mesh` wall (a 0.3 m-thick box — PRYZM walls are solids with
 *      `DoubleSide` materials, which is why the clipped result reads as a flat field
 *      rather than a hole);
 *   2. put a REAL `THREE.PerspectiveCamera` at a distance a user can actually reach;
 *   3. transform the wall's front-face vertices through `matrixWorldInverse` and
 *      `projectionMatrix` into CLIP SPACE, and apply the hardware clip condition
 *      `-w ≤ z ≤ w`.
 *
 * A vertex failing `z ≥ -w` is a vertex the rasteriser discards. That is the founder's
 * missing wall, computed rather than described.
 *
 * The RED baseline is pinned first: with the production-before value `near = 0.1` the
 * front face fails the test at 5 cm. The fix is only meaningful against that.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { MAX_BIM_NEAR_M } from './cameraFraming.js';
import {
    MAX_DEPTH_RATIO,
    NEAR_INSPECT_M,
    NEAR_RAMP_STANDOFF_M,
    applyAdaptiveNearPlane,
    installAdaptiveNearPlane,
    nearForStandoff,
    standoffFromBounds,
    type AdaptiveNearControlsLike,
} from './adaptiveNearPlane.js';

// ── Fixture: a real wall, at the founder's dimensions ─────────────────────────

/** Wall thickness in metres — a normal PRYZM exterior wall. */
const WALL_THICKNESS_M = 0.3;
/** The far plane a normal BIM scene carries (`BASELINE_FAR_M` in cameraFraming). */
const BASELINE_FAR_M = 2000;

/**
 * A 4 m × 3 m × 0.3 m wall panel centred on the origin, so its OUTER face is the plane
 * `z = +0.15` and its INNER face is `z = -0.15`.
 */
function buildWall(): THREE.Mesh {
    const geo = new THREE.BoxGeometry(4, 3, WALL_THICKNESS_M);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 1.5, 0);
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** World-space AABB of the wall — what `SceneBoundsCache` would hand the policy. */
function wallBounds(wall: THREE.Mesh): THREE.Box3 {
    return new THREE.Box3().setFromObject(wall);
}

/**
 * A camera looking straight at the wall's outer face from `standoffM` metres away.
 * `near` starts at the production-before value so the RED case is the default.
 */
function cameraAtStandoff(standoffM: number, near = MAX_BIM_NEAR_M): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(60, 1.6, near, BASELINE_FAR_M);
    cam.position.set(0, 1.5, WALL_THICKNESS_M / 2 + standoffM);
    cam.lookAt(0, 1.5, -10);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

/**
 * The hardware clip test, run on the CPU: how many of the sampled points on the wall's
 * OUTER face survive `-w ≤ z ≤ w`?
 *
 * Sampling a grid rather than the 4 corners because the founder's symptom is a
 * PARTIALLY-to-fully vanished surface — a count is the honest measurement, a boolean is
 * not.
 */
function outerFacePointsInsideFrustum(cam: THREE.PerspectiveCamera): { inside: number; total: number } {
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    let inside = 0;
    let total = 0;
    for (let ix = 0; ix <= 4; ix++) {
        for (let iy = 0; iy <= 4; iy++) {
            // Points across the outer face (z = +0.15), well inside the 60° FOV.
            const x = -0.5 + (ix / 4);
            const y = 1.0 + (iy / 4);
            const clip = new THREE.Vector4(x, y, WALL_THICKNESS_M / 2, 1).applyMatrix4(viewProj);
            total++;
            if (clip.z >= -clip.w && clip.z <= clip.w) inside++;
        }
    }
    return { inside, total };
}

// ── 1. The RED baseline — reproduce the founder's missing wall ────────────────

describe('§CAM-NEAR-SCALES-WITH-STANDOFF — the mechanism, reproduced', () => {
    it('RED: at near=0.1 the wall front face is entirely CLIPPED from 5 cm away', () => {
        const cam = cameraAtStandoff(0.05, MAX_BIM_NEAR_M);
        const { inside, total } = outerFacePointsInsideFrustum(cam);
        expect(total).toBe(25);
        // Not "some of it" — every sampled point on the surface is discarded. That is the
        // founder's flat field: the near face is gone and the DoubleSide far face is what
        // he is looking at.
        expect(inside).toBe(0);
    });

    it('RED: even at 9 cm — nearer than `controls.minDistance` can prevent — it is clipped', () => {
        const cam = cameraAtStandoff(0.09, MAX_BIM_NEAR_M);
        expect(outerFacePointsInsideFrustum(cam).inside).toBe(0);
    });

    it('the eye can reach 5 cm from a wall while `minDistance = 0.2` is fully satisfied', () => {
        // BimWorld arms `controls.minDistance = 0.2`, measured to the ORBIT TARGET.
        // Target inside the room, 3 m behind the wall; eye 5 cm in front of the inner
        // face. Eye→target is 3.05 m — 15× the constraint — and the wall is still inside
        // the near plane. This is why "minDistance stops it" is false.
        const eye = new THREE.Vector3(0, 1.5, -WALL_THICKNESS_M / 2 - 0.05);
        const target = new THREE.Vector3(0, 1.5, -WALL_THICKNESS_M / 2 - 3.05);
        expect(eye.distanceTo(target)).toBeGreaterThan(0.2);

        const wall = buildWall();
        expect(standoffFromBounds(wallBounds(wall), eye)).toBeCloseTo(0.05, 6);
    });
});

// ── 2. GREEN — the same camera, after the policy ──────────────────────────────

describe('§CAM-NEAR-SCALES-WITH-STANDOFF — the wall survives close inspection', () => {
    it('GREEN: the front face is fully drawn from 5 cm once the policy is applied', () => {
        const wall = buildWall();
        const cam = cameraAtStandoff(0.05, MAX_BIM_NEAR_M);

        expect(outerFacePointsInsideFrustum(cam).inside).toBe(0); // still red before

        const applied = applyAdaptiveNearPlane(cam, wallBounds(wall));
        expect(applied).not.toBeNull();

        const { inside, total } = outerFacePointsInsideFrustum(cam);
        expect(inside).toBe(total);
    });

    it('GREEN: the founder\'s interior case — eye 5 cm from the INNER face', () => {
        // His screenshot is the inside-out version: the near face vanishes, the DoubleSide
        // outer face reads as a flat field, and the window opening shows the ground.
        const wall = buildWall();
        const cam = new THREE.PerspectiveCamera(60, 1.6, MAX_BIM_NEAR_M, BASELINE_FAR_M);
        cam.position.set(0, 1.5, -WALL_THICKNESS_M / 2 - 0.05);
        cam.lookAt(0, 1.5, 10);
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();

        const viewProjBefore = new THREE.Matrix4()
            .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const innerFace = new THREE.Vector4(0, 1.5, -WALL_THICKNESS_M / 2, 1).applyMatrix4(viewProjBefore);
        expect(innerFace.z >= -innerFace.w).toBe(false); // clipped

        applyAdaptiveNearPlane(cam, wallBounds(wall));

        cam.updateProjectionMatrix();
        const viewProjAfter = new THREE.Matrix4()
            .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const after = new THREE.Vector4(0, 1.5, -WALL_THICKNESS_M / 2, 1).applyMatrix4(viewProjAfter);
        expect(after.z >= -after.w).toBe(true); // drawn
    });

    it('GREEN: a window recessed to mid-thickness stays drawn in BOTH cases — which is why the founder saw floating rectangles, not an empty hole', () => {
        // The evidence that the mechanism is the near plane and not "the window element
        // disappeared": the glass at mid-thickness was ALWAYS outside `near`. The element
        // he had selected (WN033) was never the thing that vanished.
        const cam = cameraAtStandoff(0.05, MAX_BIM_NEAR_M);
        const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const glass = new THREE.Vector4(0, 1.5, 0, 1).applyMatrix4(viewProj); // z = 0 → 0.2 m away
        expect(glass.z >= -glass.w).toBe(true);
    });
});

// ── 3. No regression to the far field, plan views, or the L-747 invariant ─────

describe('§CAM-NEAR-SCALES-WITH-STANDOFF — what must NOT change', () => {
    it('at aerial standoff the near plane is EXACTLY today\'s value', () => {
        const wall = buildWall();
        const cam = cameraAtStandoff(120, MAX_BIM_NEAR_M);
        applyAdaptiveNearPlane(cam, wallBounds(wall));
        expect(cam.near).toBe(MAX_BIM_NEAR_M);
    });

    it('the ramp reaches the ceiling exactly at NEAR_RAMP_STANDOFF_M', () => {
        expect(nearForStandoff(NEAR_RAMP_STANDOFF_M, BASELINE_FAR_M)).toBeCloseTo(MAX_BIM_NEAR_M, 9);
        expect(nearForStandoff(NEAR_RAMP_STANDOFF_M * 5, BASELINE_FAR_M)).toBe(MAX_BIM_NEAR_M);
    });

    it('L-747 SURVIVES — near never exceeds MAX_BIM_NEAR_M for any input', () => {
        const inputs = [-1, 0, 0.001, 1, 19.99, 20, 1e3, 1e7, Number.NaN, Number.POSITIVE_INFINITY];
        const fars = [1, BASELINE_FAR_M, 30_000, 14_022_863, Number.NaN];
        for (const s of inputs) {
            for (const f of fars) {
                const n = nearForStandoff(s, f);
                expect(n).toBeLessThanOrEqual(MAX_BIM_NEAR_M);
                expect(n).toBeGreaterThanOrEqual(NEAR_INSPECT_M);
            }
        }
    });

    it('the depth ratio is bounded — a widened far plane cannot compound the precision loss', () => {
        // Eye inside the model (standoff 0), so the ramp alone would give 1 cm.
        // far = 2 km (a normal BIM scene): the bound raises near to 1 cm exactly — no loss
        // beyond the ramp's own.
        expect(BASELINE_FAR_M / nearForStandoff(0, BASELINE_FAR_M)).toBeLessThanOrEqual(MAX_DEPTH_RATIO);
        // far = 8 km: the bound bites and raises near above the 1 cm floor.
        expect(nearForStandoff(0, 8_000)).toBeGreaterThan(NEAR_INSPECT_M);
        expect(8_000 / nearForStandoff(0, 8_000)).toBeLessThanOrEqual(MAX_DEPTH_RATIO);
    });

    it('⚠ the ratio bound is SUBORDINATE and DOES break above far ≈ 20 km — stated, not hidden', () => {
        // far = 30 km (the deliberately-supported 6 km IFC outlier, framed). Honouring
        // MAX_DEPTH_RATIO would need near = 0.15 m, which is a LARGER clip plane than
        // production has today — i.e. it would re-open L-747 in order to protect depth
        // precision. C04's doctrine decides it the other way round: precision loses to
        // clipping. So near pins at the ceiling and the ratio is knowingly exceeded.
        const n = nearForStandoff(0, 30_000);
        expect(n).toBe(MAX_BIM_NEAR_M);
        expect(30_000 / n).toBeGreaterThan(MAX_DEPTH_RATIO);
        // This is the pre-existing behaviour, unchanged: production already runs
        // near = 0.1 with whatever far the fit produced.
    });

    it('an ORTHOGRAPHIC camera is never touched — plan / elevation / section keep near = -1000', () => {
        const wall = buildWall();
        const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -1000, 1000);
        ortho.position.set(0, 50, 0);
        ortho.lookAt(0, 0, 0);
        ortho.updateMatrixWorld(true);

        expect(applyAdaptiveNearPlane(ortho, wallBounds(wall))).toBeNull();
        expect(ortho.near).toBe(-1000);
        expect(ortho.far).toBe(1000);
    });

    it('empty bounds leave the camera ALONE rather than guessing', () => {
        const cam = cameraAtStandoff(0.05, MAX_BIM_NEAR_M);
        expect(applyAdaptiveNearPlane(cam, new THREE.Box3())).toBeNull();
        expect(cam.near).toBe(MAX_BIM_NEAR_M);
        expect(applyAdaptiveNearPlane(cam, null)).toBeNull();
    });
});

// ── 4. The binding — it must follow the camera OBC swaps out from under it ────

describe('§CAM-NEAR-SCALES-WITH-STANDOFF — installAdaptiveNearPlane', () => {
    function fakeControls(): AdaptiveNearControlsLike & { fire(type: string): void; count(): number } {
        const listeners = new Map<string, Set<() => void>>();
        return {
            addEventListener(type, listener) {
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type)!.add(listener);
            },
            removeEventListener(type, listener) {
                listeners.get(type)?.delete(listener);
            },
            fire(type) { listeners.get(type)?.forEach((l) => l()); },
            count() { let n = 0; listeners.forEach((s) => { n += s.size; }); return n; },
        };
    }

    it('adapts on a controls `update`, and stops after dispose()', () => {
        const wall = buildWall();
        const controls = fakeControls();
        const cam = cameraAtStandoff(120, MAX_BIM_NEAR_M);

        const binding = installAdaptiveNearPlane({
            getCamera: () => cam,
            getModelBounds: () => wallBounds(wall),
            controls,
        });
        expect(cam.near).toBe(MAX_BIM_NEAR_M); // install ran at aerial standoff — unchanged

        cam.position.set(0, 1.5, WALL_THICKNESS_M / 2 + 0.05);
        cam.updateMatrixWorld(true);
        controls.fire('update');
        expect(cam.near).toBeLessThan(MAX_BIM_NEAR_M);
        expect(outerFacePointsInsideFrustum(cam).inside).toBe(25);

        binding.dispose();
        expect(controls.count()).toBe(0);
        cam.near = MAX_BIM_NEAR_M;
        cam.updateProjectionMatrix();
        controls.fire('update');
        expect(cam.near).toBe(MAX_BIM_NEAR_M); // detached — no further adaptation
    });

    it('follows the camera OBC REPLACES on a projection change (the thunk, not a captured ref)', () => {
        // initScene:3745 — OrthoPerspectiveCamera swaps `world.camera.three` for a new
        // object. A captured reference would keep adapting a camera nobody renders.
        const wall = buildWall();
        const controls = fakeControls();
        let live: THREE.Camera = cameraAtStandoff(120, MAX_BIM_NEAR_M);

        installAdaptiveNearPlane({
            getCamera: () => live,
            getModelBounds: () => wallBounds(wall),
            controls,
        });

        const replacement = cameraAtStandoff(0.05, MAX_BIM_NEAR_M);
        live = replacement;
        controls.fire('update');

        expect(replacement.near).toBeLessThan(MAX_BIM_NEAR_M);
        expect(outerFacePointsInsideFrustum(replacement).inside).toBe(25);
    });

    it('a throwing bounds provider never breaks navigation', () => {
        const controls = fakeControls();
        const cam = cameraAtStandoff(0.05, MAX_BIM_NEAR_M);
        const binding = installAdaptiveNearPlane({
            getCamera: () => cam,
            getModelBounds: () => { throw new Error('bounds cache torn down mid-project-switch'); },
            controls,
        });
        expect(() => controls.fire('update')).not.toThrow();
        expect(binding.refresh()).toBeNull();
    });
});
