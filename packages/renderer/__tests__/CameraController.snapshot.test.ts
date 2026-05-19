// CameraController snapshot/applyPose tests (S17-T7).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FrameScheduler } from '@pryzm/frame-scheduler';
import { CameraController } from '../src/CameraController.js';

class StubElement {
  addEventListener(): void {}
  removeEventListener(): void {}
}

function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  cam.position.set(10, 10, 10);
  cam.lookAt(0, 0, 0);
  return cam;
}

describe('CameraController snapshot / applyPose (S17-T7)', () => {
  it('snapshot() round-trips through applyPose() — pose is pixel-equal after restore', () => {
    const cam = makeCamera();
    const sched = new FrameScheduler();
    const el = new StubElement() as unknown as HTMLElement;
    const ctrl = new CameraController(cam, el, sched);

    const before = ctrl.snapshot();
    // Mutate the camera AND the controller state.
    cam.position.set(50, 1, -3);
    ctrl.target.set(2, 0, 1);
    cam.lookAt(ctrl.target);
    ctrl.syncFromCamera();

    // Restore via applyPose — exact recovery.
    ctrl.applyPose(before);

    expect(cam.position.x).toBeCloseTo(before.position.x, 5);
    expect(cam.position.y).toBeCloseTo(before.position.y, 5);
    expect(cam.position.z).toBeCloseTo(before.position.z, 5);
    expect(ctrl.target.x).toBeCloseTo(before.target.x, 5);
    expect(ctrl.target.y).toBeCloseTo(before.target.y, 5);
    expect(ctrl.target.z).toBeCloseTo(before.target.z, 5);

    ctrl.dispose();
  });

  it('applyPose() marks the scheduler dirty under dirtyKey', () => {
    const cam = makeCamera();
    const sched = new FrameScheduler();
    const el = new StubElement() as unknown as HTMLElement;
    const ctrl = new CameraController(cam, el, sched, { dirtyKey: 'view-switch' });

    sched.clearDirty('view-switch');
    expect(sched.isDirty('view-switch')).toBe(false);

    ctrl.applyPose({
      position: new THREE.Vector3(5, 5, 5),
      target: new THREE.Vector3(0, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    });

    expect(sched.isDirty('view-switch')).toBe(true);
    ctrl.dispose();
  });
});
