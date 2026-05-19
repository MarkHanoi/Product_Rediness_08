// @vitest-environment happy-dom
//
// PR 4.A.2 (Wave 4 Track A) — cameraController slot adapter unit test.
//
// Covers the typed `buildCameraControllerSlot()` adapter end-to-end
// against a real `CameraController` from `@pryzm/renderer`:
//
//   * `current`        — getter pass-through to the thunk; lights up
//                        when the thunk starts returning a controller,
//                        goes back to `null` if the thunk later does.
//   * `set(pose)`      — wraps `PlainPose` → `THREE.Vector3` triple,
//                        calls `CameraController.applyPose(...)`,
//                        emits the typed `'cameraController.poseChanged'`
//                        event with the *post-apply* `snapshotPlain()`
//                        (so listeners see CameraController's clamping).
//                        No-op + warn-once when no controller is
//                        attached (pre-mount / soft-fail).
//   * `snapshot()`     — returns `null` when no controller; returns
//                        the controller's `snapshotPlain()` when one
//                        is attached.  No `as` casts, THREE-free shape.
//   * `frameElement` / `frameAll` — D.10-prep stubs warn-once.
//   * Type wiring      — the slot's `current`, parameters, return
//                        types are all real `CameraController` /
//                        `PlainPose` (no `unknown`); compile-time
//                        coverage is the test file's mere existence.
//
// Track A exit-gate metric: contributes 1 of 14 slot adapters that
// must be exhaustively unit-tested before the wave closes.  See
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3.A`.
//
// Why happy-dom: `CameraController` attaches DOM listeners
// (`pointerdown`, `wheel`, …) to its element on construction, so the
// test needs an `HTMLElement`.  Real DOM via happy-dom keeps the test
// architecturally honest — no fake-element shim, no `as unknown as`.

import * as THREE from '@pryzm/renderer-three/three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CameraController,
  type PlainPose,
} from '@pryzm/renderer';
import { FrameScheduler } from '@pryzm/frame-scheduler';

import { EventBus } from '../src/EventBus.js';
import { buildCameraControllerSlot } from '../src/buildCameraControllerSlot.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a real `CameraController` against a real DOM element + a
 *  real `FrameScheduler`.  Returns the controller plus its element so
 *  tests can dispose cleanly. */
function makeController(): {
  controller: CameraController;
  element: HTMLDivElement;
  scheduler: FrameScheduler;
} {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const scheduler = new FrameScheduler();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 5);
  const controller = new CameraController(camera, element, scheduler);
  return { controller, element, scheduler };
}

const SAMPLE_POSE: PlainPose = {
  position: { x: 3, y: 4, z: 5 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
};

describe('PR 4.A.2 — buildCameraControllerSlot', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const controllers: { controller: CameraController; element: HTMLElement }[] = [];

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const c of controllers) {
      try { c.controller.dispose(); } catch { /* */ }
      try { c.element.remove(); } catch { /* */ }
    }
    controllers.length = 0;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── current ─────────────────────────────────────────────────────────────
  describe('current', () => {
    it('is null when the thunk returns null (pre-mount / soft-fail)', () => {
      const slot = buildCameraControllerSlot(() => null, new EventBus());
      expect(slot.current).toBeNull();
    });

    it('lights up when the thunk starts returning a real CameraController', () => {
      const c = makeController();
      controllers.push(c);
      let live: CameraController | null = null;
      const slot = buildCameraControllerSlot(() => live, new EventBus());
      expect(slot.current).toBeNull();   // still pre-mount
      live = c.controller;
      expect(slot.current).toBe(c.controller);  // post-mount
    });

    it('goes back to null if the thunk later returns null (tearDown)', () => {
      const c = makeController();
      controllers.push(c);
      let live: CameraController | null = c.controller;
      const slot = buildCameraControllerSlot(() => live, new EventBus());
      expect(slot.current).toBe(c.controller);
      live = null;
      expect(slot.current).toBeNull();
    });
  });

  // ── set(pose) ───────────────────────────────────────────────────────────
  describe('set(pose)', () => {
    it('no-ops + warns once when no controller is attached', () => {
      const events = new EventBus();
      const seen: { pose: PlainPose }[] = [];
      events.on('cameraController.poseChanged', (p) => seen.push(p));
      const slot = buildCameraControllerSlot(() => null, events);

      slot.set(SAMPLE_POSE);
      slot.set(SAMPLE_POSE);
      slot.set(SAMPLE_POSE);

      expect(seen).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0]))
        .toContain('set() called before runtime.scene.mount');
    });

    it('applies the pose to the live CameraController', () => {
      const c = makeController();
      controllers.push(c);
      const slot = buildCameraControllerSlot(() => c.controller, new EventBus());

      slot.set(SAMPLE_POSE);

      // After applyPose, the camera is on the line from target → position
      // at the (clamped) distance.  Easiest invariant: the snapshot's
      // target matches what we set and the position has the right length.
      const snap = c.controller.snapshotPlain();
      expect(snap.target).toEqual({ x: 0, y: 0, z: 0 });
      const r = Math.sqrt(
        snap.position.x ** 2 + snap.position.y ** 2 + snap.position.z ** 2,
      );
      const want = Math.sqrt(3 * 3 + 4 * 4 + 5 * 5);
      expect(r).toBeCloseTo(want, 5);
    });

    it('emits cameraController.poseChanged with the post-apply snapshot', () => {
      const c = makeController();
      controllers.push(c);
      const events = new EventBus();
      const seen: { pose: PlainPose }[] = [];
      events.on('cameraController.poseChanged', (p) => seen.push(p));
      const slot = buildCameraControllerSlot(() => c.controller, events);

      slot.set(SAMPLE_POSE);

      expect(seen).toHaveLength(1);
      const got = seen[0]!.pose;
      // Same invariant as above — emitted snapshot is what the
      // CameraController actually stored, not what we passed in.
      expect(got.target).toEqual({ x: 0, y: 0, z: 0 });
      expect(got).toEqual(c.controller.snapshotPlain());
    });

    it('does not throw when applyPose throws — logs and returns', () => {
      const events = new EventBus();
      const seen: { pose: PlainPose }[] = [];
      events.on('cameraController.poseChanged', (p) => seen.push(p));
      const fakeController = {
        applyPose: () => { throw new Error('applyPose boom'); },
        snapshotPlain: (): PlainPose => SAMPLE_POSE,
      } as unknown as CameraController;
      const slot = buildCameraControllerSlot(() => fakeController, events);

      expect(() => slot.set(SAMPLE_POSE)).not.toThrow();
      expect(seen).toEqual([]);  // no event on failure
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('applyPose threw');
    });
  });

  // ── snapshot() ──────────────────────────────────────────────────────────
  describe('snapshot()', () => {
    it('returns null + warns once when no controller is attached', () => {
      const slot = buildCameraControllerSlot(() => null, new EventBus());
      expect(slot.snapshot()).toBeNull();
      expect(slot.snapshot()).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0]))
        .toContain('snapshot() called before runtime.scene.mount');
    });

    it('returns the controller snapshotPlain() when one is attached', () => {
      const c = makeController();
      controllers.push(c);
      const slot = buildCameraControllerSlot(() => c.controller, new EventBus());

      const snap = slot.snapshot();
      expect(snap).not.toBeNull();
      expect(snap).toEqual(c.controller.snapshotPlain());
      // Shape is THREE-free PlainPose
      expect(typeof snap!.position.x).toBe('number');
      expect(typeof snap!.target.x).toBe('number');
      expect(typeof snap!.up.x).toBe('number');
    });

    it('reflects pose changes after set()', () => {
      const c = makeController();
      controllers.push(c);
      const slot = buildCameraControllerSlot(() => c.controller, new EventBus());

      const before = slot.snapshot()!;
      slot.set(SAMPLE_POSE);
      const after = slot.snapshot()!;

      // Target moved from default (still 0,0,0 since default is 0,0,0)
      // — assert the position component changed instead.
      expect(after.position).not.toEqual(before.position);
    });
  });

  // ── frameElement / frameAll D.10-prep stubs ─────────────────────────────
  describe('frameElement / frameAll', () => {
    it('frameElement warns once and is a no-op', () => {
      const slot = buildCameraControllerSlot(() => null, new EventBus());
      slot.frameElement('a');
      slot.frameElement('b');
      slot.frameAll();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('D.10-prep stub');
    });
  });
});
