// buildCameraControllerSlot — the typed adapter behind
// `runtime.cameraController`.  Wave 4 Track A (PR 4.A.2) per
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2`.
//
// Lives next to `buildViewRegistrySlot.ts` / `buildPersistence.ts` /
// `ImportExportSlots.ts` / `ToastController.ts` so the slot adapters
// follow one convention and the unit test in
// `__tests__/cameraController.slot.test.ts` can drive it directly
// without standing up a full `composeRuntime()`.
//
// The `getCamera` parameter is a thunk that returns the live
// `CameraController` from `runtime.scene.camera` (or `null` until
// `runtime.scene.mount(canvas)` resolves).  This indirection is what
// lets the slot light up after the async mount without re-binding —
// all the slot's callers see the same `runtime.cameraController` ref
// they grabbed at compose time, but the methods route through to the
// live instance once it attaches.
//
// `set(pose)` accepts the THREE-free `PlainPose` shape (W-02-friendly)
// and emits the typed `'cameraController.poseChanged'` event so
// cross-package listeners (`@pryzm/view-state`'s `ViewController`,
// telemetry, panels) can react without a THREE dependency.

import * as THREE from '@pryzm/renderer-three/three';
import type { CameraController, CameraPose, PlainPose } from '@pryzm/renderer';

import type { EventBus } from './EventBus.js';
import type { CameraControllerSlot } from './types.js';

/** Convert a `PlainPose` (`{x,y,z}` tuples) to a `CameraPose`
 *  (`THREE.Vector3` triple).  The renderer's
 *  `CameraController.applyPose()` requires real `THREE.Vector3`
 *  instances — `Vector3.copy()` is typed against `Vector3`, not the
 *  structural `{x,y,z}` shape — so the slot owns the wrap here.  This
 *  keeps consumers of `runtime.cameraController.set(pose)` THREE-free. */
function toCameraPose(pose: PlainPose): CameraPose {
  return {
    position: new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
    target: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
    up: new THREE.Vector3(pose.up.x, pose.up.y, pose.up.z),
  };
}

/** Build the typed `cameraController` slot.
 *
 *  `getCamera` is invoked on every method call so the slot picks up
 *  the live `CameraController` produced by an async
 *  `runtime.scene.mount(canvas)` without needing a re-bind.  Returns
 *  `null` until mount resolves; permanently `null` on soft-fail. */
export function buildCameraControllerSlot(
  getCamera: () => CameraController | null,
  events: EventBus,
): CameraControllerSlot {
  let setWarned = false;
  let snapshotWarned = false;
  let frameWarned = false;

  const warnSetOnce = (): void => {
    if (setWarned) return;
    setWarned = true;
    console.warn(
      '[runtime-composer/cameraController] set() called before runtime.scene.mount(canvas) ' +
      'resolved (or after a soft-fail) — no live CameraController to drive. No-op until then.',
    );
  };

  const warnSnapshotOnce = (): void => {
    if (snapshotWarned) return;
    snapshotWarned = true;
    console.warn(
      '[runtime-composer/cameraController] snapshot() called before runtime.scene.mount(canvas) ' +
      'resolved (or after a soft-fail) — no live CameraController to read. Returning null.',
    );
  };

  const warnFrameOnce = (op: string): void => {
    if (frameWarned) return;
    frameWarned = true;
    console.warn(
      `[runtime-composer/cameraController] D.10-prep stub: ${op} called before ` +
      'D.10 wires the per-element framing logic from viewport/CameraController. No-op until then.',
    );
  };

  return {
    get current(): CameraController | null {
      return getCamera();
    },

    set(pose: PlainPose): void {
      const cam = getCamera();
      if (cam === null) {
        warnSetOnce();
        return;
      }
      try {
        cam.applyPose(toCameraPose(pose));
      } catch (err) {
        console.error('[runtime-composer/cameraController] applyPose threw:', err);
        return;
      }
      // Typed emit — `'cameraController.poseChanged'` is a member of
      // `RuntimeEvents` per PR 4.A.2.  No `as` cast.  Re-snapshot
      // after applyPose so listeners see the *actually-applied* pose
      // (CameraController may clamp pitch / clamp distance / etc).
      try {
        events.emit('cameraController.poseChanged', { pose: cam.snapshotPlain() });
      } catch (err) {
        console.error('[runtime-composer/cameraController] events emit threw:', err);
      }
    },

    snapshot(): PlainPose | null {
      const cam = getCamera();
      if (cam === null) {
        warnSnapshotOnce();
        return null;
      }
      return cam.snapshotPlain();
    },

    frameElement(_id: string): void {
      warnFrameOnce('frameElement');
    },

    frameAll(): void {
      warnFrameOnce('frameAll');
    },
  };
}
