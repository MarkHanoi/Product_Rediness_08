// CameraController — vanilla orbit camera (S06-T2).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S06-T2 (line 579):
//   "CameraController — vanilla orbit camera; pointer + wheel; calls
//    scheduler.markDirty('camera') on input."
//
// Design summary:
//   * Spherical-coordinate orbit (yaw, pitch, distance) around a target.
//   * Left-button drag = orbit; right-button drag = pan; wheel = zoom.
//   * Pitch clamped to (−π/2 + ε, π/2 − ε) so the camera never inverts.
//   * Every input event marks the scheduler dirty under the 'camera'
//     key — the scheduler then pumps a frame via the renderer's tick
//     listener (S06-T1).  Idle (no input) → 0 dirty → 0 fps.
//   * `dispose()` removes every event listener.  Idempotent.
//
// We intentionally do NOT depend on three/examples/jsm/controls/OrbitControls
// — that module pulls in a tree of helpers (Raycaster bindings, key-code
// maps, touch-pinch state) that we don't need for the Hello Cube demo.
// A 200-LOC hand-rolled controller stays under the 1.8 MB bundle ceiling.

import * as THREE from '@pryzm/renderer-three/three';
import type { FrameScheduler } from '@pryzm/frame-scheduler';

const PITCH_LIMIT = Math.PI / 2 - 0.05;

/** A read-only snapshot of camera pose.  Returned by
 *  `CameraController.snapshot()` and consumed by `applyPose()`.  Used
 *  by `@pryzm/view-state`'s `ViewController` to drive camera
 *  animation. */
export interface CameraPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly up: THREE.Vector3;
}

/** Plain XYZ tuple — the lingua-franca for cross-package pose data
 *  (W-02).  `@pryzm/view-state` deals exclusively in `Vec3Like` so it
 *  can compute camera transitions without importing THREE itself.
 *  Anything that already holds a `THREE.Vector3` satisfies this shape
 *  by structural typing. */
export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Plain camera-pose value-object — the cross-package equivalent of
 *  `CameraPose` (above) without the THREE dependency.  Returned by
 *  `snapshotPlain()`, consumed by `interpolateTo()`. */
export interface PlainPose {
  readonly position: Vec3Like;
  readonly target: Vec3Like;
  readonly up: Vec3Like;
}

export interface CameraControllerOptions {
  /** Initial target (the point the camera orbits around).  Default = origin. */
  readonly target?: THREE.Vector3;
  /** Initial distance from target.  Default = camera's current distance from target. */
  readonly distance?: number;
  /** Min / max zoom distance.  Default 0.5 / 100. */
  readonly minDistance?: number;
  readonly maxDistance?: number;
  /** Pixels-to-radians sensitivity for orbit.  Default 0.005. */
  readonly orbitSensitivity?: number;
  /** Pan sensitivity (world-units per pixel at distance=1).  Default 0.002. */
  readonly panSensitivity?: number;
  /** Wheel zoom factor per notch.  Default 0.1. */
  readonly zoomSensitivity?: number;
  /** Optional dirty-key override; bench/test fixtures may pass a unique
   *  key to keep their dirty signal isolated.  Default 'camera'. */
  readonly dirtyKey?: string;
}

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  readonly target: THREE.Vector3;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly orbitSensitivity: number;
  readonly panSensitivity: number;
  readonly zoomSensitivity: number;
  readonly dirtyKey: string;
  private readonly element: HTMLElement;
  private readonly scheduler: FrameScheduler;
  /** Spherical state, rebuilt from the camera on construction.
   *  yaw (around Y), pitch (above XZ), distance from target. */
  private yaw = 0;
  private pitch = 0;
  private distance = 1;
  private dragging: 'orbit' | 'pan' | null = null;
  private lastX = 0;
  private lastY = 0;
  private disposed = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    element: HTMLElement,
    scheduler: FrameScheduler,
    opts: CameraControllerOptions = {},
  ) {
    this.camera = camera;
    this.element = element;
    this.scheduler = scheduler;
    this.target = opts.target?.clone() ?? new THREE.Vector3(0, 0, 0);
    this.minDistance = opts.minDistance ?? 0.5;
    this.maxDistance = opts.maxDistance ?? 100;
    this.orbitSensitivity = opts.orbitSensitivity ?? 0.005;
    this.panSensitivity = opts.panSensitivity ?? 0.002;
    this.zoomSensitivity = opts.zoomSensitivity ?? 0.1;
    this.dirtyKey = opts.dirtyKey ?? 'camera';
    // Derive yaw/pitch/distance from the camera's current position
    // (relative to target) so the controller doesn't snap on attach.
    const offset = new THREE.Vector3().subVectors(camera.position, this.target);
    this.distance = opts.distance ?? Math.max(offset.length(), this.minDistance);
    this.yaw = Math.atan2(offset.x, offset.z);
    this.pitch = Math.asin(
      this.distance > 0 ? THREE.MathUtils.clamp(offset.y / this.distance, -1, 1) : 0,
    );
    this.applyTransform();
    // Wire input.  We use pointer events (modern unified mouse + touch).
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  // ── S17 view-state interop (additive) ─────────────────────────────
  //
  // `snapshot()` / `applyPose()` give the ViewController a way to read
  // the current camera pose and animate to a target pose without
  // touching the controller's internal yaw/pitch/distance state
  // directly.  Both are pure-data operations — they do NOT install
  // event listeners, take ownership of the camera object, or alter
  // the controller's input bindings.  See ADR-0016
  // §"Implementation notes" for the contract.

  /** Snapshot the current camera pose (position + target + up).  The
   *  returned vectors are CLONES — mutating them after the call is
   *  safe.  Used by `ViewController.switchTo()` to capture the
   *  starting pose for the camera animation. */
  snapshot(): CameraPose {
    return {
      position: this.camera.position.clone(),
      target: this.target.clone(),
      up: this.camera.up.clone(),
    };
  }

  /** Snapshot the current camera pose as plain `{x, y, z}` objects
   *  (W-02).  Identical semantics to `snapshot()` but the result has
   *  no THREE dependency — `@pryzm/view-state` consumes this so it
   *  can interpolate camera transitions without importing THREE. */
  snapshotPlain(): PlainPose {
    return {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.target.x, y: this.target.y, z: this.target.z },
      up: { x: this.camera.up.x, y: this.camera.up.y, z: this.camera.up.z },
    };
  }

  // Cached scratch vectors used by `interpolateTo()` so the renderer
  // — not the caller — owns the THREE allocations.  Re-used across
  // ticks to keep the per-frame allocation cost at zero.
  private readonly _interpScratch = {
    pos: new THREE.Vector3(),
    tgt: new THREE.Vector3(),
    up:  new THREE.Vector3(),
  };

  /** Interpolate from `start` toward `end` at parameter `t ∈ [0, 1]`
   *  and apply the resulting pose to the camera (W-02).  This is the
   *  THREE-free interpolation primitive `ViewController.switchTo()`
   *  drives once per `pre-render` tick.
   *
   *  Inputs are plain `{x, y, z}` tuples; the THREE math (component
   *  lerp, matrix recompose via `applyPose()`) lives entirely inside
   *  the renderer.  Marks the scheduler dirty under `dirtyKey` exactly
   *  once per call, courtesy of `applyPose()`. */
  interpolateTo(start: PlainPose, end: PlainPose, t: number): void {
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    const s = this._interpScratch;
    s.pos.set(
      start.position.x + (end.position.x - start.position.x) * tt,
      start.position.y + (end.position.y - start.position.y) * tt,
      start.position.z + (end.position.z - start.position.z) * tt,
    );
    s.tgt.set(
      start.target.x + (end.target.x - start.target.x) * tt,
      start.target.y + (end.target.y - start.target.y) * tt,
      start.target.z + (end.target.z - start.target.z) * tt,
    );
    s.up.set(
      start.up.x + (end.up.x - start.up.x) * tt,
      start.up.y + (end.up.y - start.up.y) * tt,
      start.up.z + (end.up.z - start.up.z) * tt,
    );
    this.applyPose({ position: s.pos, target: s.tgt, up: s.up });
  }

  /** Apply a pose to the camera.  Updates internal yaw/pitch/distance
   *  via `syncFromCamera()` so subsequent orbit / pan input from the
   *  user picks up from the new pose without snapping.  Marks the
   *  scheduler dirty under `dirtyKey` so the next frame renders. */
  applyPose(pose: CameraPose): void {
    this.target.copy(pose.target);
    this.camera.up.copy(pose.up);
    this.camera.position.copy(pose.position);
    this.camera.lookAt(this.target);
    // Re-derive spherical state so a subsequent orbit() call doesn't
    // snap back to the pre-applyPose yaw/pitch/distance.
    this.syncFromCamera();
    this.scheduler.markDirty(this.dirtyKey);
  }

  /** Force a re-derivation of yaw/pitch/distance from the camera's
   *  current world position.  Useful after a programmatic
   *  `camera.position.set(...)` outside the controller. */
  syncFromCamera(): void {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.target);
    this.distance = Math.max(offset.length(), this.minDistance);
    this.yaw = Math.atan2(offset.x, offset.z);
    this.pitch = Math.asin(
      this.distance > 0 ? THREE.MathUtils.clamp(offset.y / this.distance, -1, 1) : 0,
    );
    this.applyTransform();
  }

  /** Programmatic orbit — used by tests + the demo's "wiggle" intro. */
  orbit(yawDelta: number, pitchDelta: number): void {
    this.yaw += yawDelta;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitchDelta, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyTransform();
    this.scheduler.markDirty(this.dirtyKey);
  }

  /** Programmatic zoom — wheel deltas route through here. */
  zoom(factor: number): void {
    this.distance = THREE.MathUtils.clamp(
      this.distance * factor,
      this.minDistance,
      this.maxDistance,
    );
    this.applyTransform();
    this.scheduler.markDirty(this.dirtyKey);
  }

  /** Programmatic pan — translates the target in the camera's right/up
   *  plane.  Used by tests and right-button drag. */
  pan(dxPx: number, dyPx: number): void {
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const scale = this.panSensitivity * this.distance;
    this.target.addScaledVector(right, -dxPx * scale);
    this.target.addScaledVector(up, dyPx * scale);
    this.applyTransform();
    this.scheduler.markDirty(this.dirtyKey);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    // The move/up listeners are added on pointerdown; remove them here
    // in case we're disposed mid-drag.
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
    }
  }

  private applyTransform(): void {
    // Spherical → cartesian.  Standard right-handed Y-up convention.
    const cosPitch = Math.cos(this.pitch);
    const x = this.distance * cosPitch * Math.sin(this.yaw);
    const y = this.distance * Math.sin(this.pitch);
    const z = this.distance * cosPitch * Math.cos(this.yaw);
    this.camera.position.set(
      this.target.x + x,
      this.target.y + y,
      this.target.z + z,
    );
    this.camera.lookAt(this.target);
  }

  private onPointerDown(ev: PointerEvent): void {
    if (this.disposed) return;
    // Left = orbit; right = pan.  Middle = orbit too (matches PRYZM 1).
    if (ev.button === 2) this.dragging = 'pan';
    else this.dragging = 'orbit';
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
    }
  }

  private onPointerMove(ev: PointerEvent): void {
    if (this.disposed || this.dragging === null) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    if (this.dragging === 'orbit') {
      this.orbit(-dx * this.orbitSensitivity, -dy * this.orbitSensitivity);
    } else {
      this.pan(dx, dy);
    }
  }

  private onPointerUp(_ev: PointerEvent): void {
    this.dragging = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
    }
  }

  private onWheel(ev: WheelEvent): void {
    if (this.disposed) return;
    ev.preventDefault();
    const factor = 1 + Math.sign(ev.deltaY) * this.zoomSensitivity;
    this.zoom(factor);
  }

  private onContextMenu(ev: Event): void {
    // Right-click is our pan trigger — block the browser menu.
    ev.preventDefault();
  }
}
