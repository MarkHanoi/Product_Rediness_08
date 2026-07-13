/**
 * @vitest-environment happy-dom
 *
 * §G8-VIEW-LIFECYCLE — I5: A PLAN VIEW CANNOT BE TUMBLED.
 *
 * A floor plan is an orthographic top-down projection; if the orbit controls can
 * rotate it, every downstream 2D assumption (snapping, annotation placement, the
 * projected drawing) silently breaks. OrthoPlanCameraLockController is the guard:
 * it disables rotation, forces the top-down basis, and re-asserts it on EVERY
 * controls `update` — so even a programmatic tumble is snapped back within the frame.
 *
 * It must also SURVIVE A PROJECTION SWITCH: OBC replaces `world.camera.three` with a
 * brand-new camera object when the projection flips (Ortho ⇄ Perspective), so the
 * controller must always read the LIVE camera, never a stale reference captured at
 * construction.
 *
 * Contract: C06 (view shell), C04 §camera.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The controller only uses OBC for its `World` TYPE — mock the module so the test
// does not pull the whole @thatopen/components runtime.
vi.mock('@thatopen/components', () => ({}));

import * as THREE from '@pryzm/renderer-three/three';
import { OrthoPlanCameraLockController } from '../OrthoPlanCameraLockController';

const TOP_DOWN_X = -Math.PI / 2;

function makeWorld() {
    const listeners = new Map<string, Array<() => void>>();
    const controls = {
        enableRotate: true,
        enableDamping: false,
        addEventListener: (ev: string, fn: () => void) => {
            const list = listeners.get(ev) ?? [];
            list.push(fn);
            listeners.set(ev, list);
        },
        removeEventListener: (ev: string, fn: () => void) => {
            listeners.set(ev, (listeners.get(ev) ?? []).filter(f => f !== fn));
        },
        getTarget: (v: THREE.Vector3) => v.set(0, 0, 0),
    };
    const world = {
        camera: { controls, three: new THREE.PerspectiveCamera() as THREE.Camera },
    };
    /** Drive one controls `update` tick — what camera-controls emits every frame. */
    const tick = () => (listeners.get('update') ?? []).forEach(fn => fn());
    const updateListenerCount = () => (listeners.get('update') ?? []).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { world: world as any, controls, tick, updateListenerCount };
}

describe('§G8-VIEW-LIFECYCLE — I5: OrthoPlanCameraLockController', () => {
    let harness: ReturnType<typeof makeWorld>;
    let controller: OrthoPlanCameraLockController;

    beforeEach(() => {
        harness = makeWorld();
        controller = new OrthoPlanCameraLockController(harness.world);
    });

    it('activate() disables orbit and forces the top-down basis', () => {
        controller.activate();
        expect(harness.controls.enableRotate).toBe(false);
        const cam = harness.world.camera.three as THREE.Camera;
        expect(cam.up.toArray()).toEqual([0, 0, -1]);
        expect(cam.rotation.x).toBeCloseTo(TOP_DOWN_X, 6);
        expect(cam.rotation.y).toBeCloseTo(0, 6);
        expect(cam.rotation.z).toBeCloseTo(0, 6);
    });

    it('a tumble is REVERTED on the next controls update (the plan cannot be rotated)', () => {
        controller.activate();
        const cam = harness.world.camera.three as THREE.Camera;

        // Someone (a stray orbit, a rogue script) tumbles the camera off-axis.
        cam.rotation.set(0.4, 1.1, 0.7);
        harness.tick();

        expect(cam.rotation.x).toBeCloseTo(TOP_DOWN_X, 6);
        expect(cam.rotation.y).toBeCloseTo(0, 6);
        expect(cam.rotation.z).toBeCloseTo(0, 6);
    });

    it('vertical drift during pan/zoom is clamped back to the locked height', () => {
        controller.activate();
        const cam = harness.world.camera.three as THREE.Camera;
        cam.position.set(3, 12, -4);   // drifted down toward the plate
        harness.tick();
        expect(cam.position.y).toBeCloseTo(50, 6);   // target.y (0) + 50
        // …and the drift clamp does not disturb the pan (x/z untouched).
        expect(cam.position.x).toBeCloseTo(3, 6);
        expect(cam.position.z).toBeCloseTo(-4, 6);
    });

    it('SURVIVES a projection switch — the lock follows the NEW camera object', () => {
        controller.activate();

        // OBC swaps in a brand-new camera when the projection flips (Perspective → Ortho).
        const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
        ortho.rotation.set(0.9, 0.9, 0.9);     // the new camera arrives un-locked
        harness.world.camera.three = ortho;

        harness.tick();

        expect(ortho.rotation.x).toBeCloseTo(TOP_DOWN_X, 6);
        expect(ortho.rotation.y).toBeCloseTo(0, 6);
        expect(ortho.rotation.z).toBeCloseTo(0, 6);
    });

    it('deactivate() restores orbit and detaches the lock (3D can tumble again)', () => {
        controller.activate();
        expect(harness.updateListenerCount()).toBe(1);

        controller.deactivate();

        expect(harness.controls.enableRotate).toBe(true);
        expect(harness.updateListenerCount()).toBe(0);

        // With the lock detached, a tumble STICKS (this is the 3D view's freedom).
        const cam = harness.world.camera.three as THREE.Camera;
        cam.rotation.set(0.4, 1.1, 0.7);
        harness.tick();
        expect(cam.rotation.x).toBeCloseTo(0.4, 6);
    });
});
