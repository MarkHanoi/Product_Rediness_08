// S03-T3 — Bouncing-cube demo (headless physics).
//
// Spec source: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 367 and
// the S03 exit criteria at line 411 ("Bouncing-cube demo: 60 fps
// interaction, 0 fps idle").  The cube is the smallest possible scene
// that exercises the FrameScheduler's interaction → idle transition:
//
//   • A `flick()` (interaction) injects a velocity → physics integrates
//     each tick → `markDirty('cube')` keeps the loop "live" → 60 fps
//     while the cube is in motion.
//   • Once the cube comes to rest (|v| < REST_EPSILON, |dy| < REST_EPSILON
//     for two consecutive ticks), the simulator calls `clearDirty('cube')`.
//     With nothing else dirty, the FrameScheduler walks down its
//     IdleContinuation budget (30 frames per ADR-006) and stops itself —
//     the "0 fps idle" win.
//
// The simulator is intentionally rendererless so it runs in headless Node
// CI (`apps/bench/idle-cpu.bench.ts`).  The real renderer wiring lands in
// S05 (committer + scene graph); for S03 the scheduler is the unit
// under test, not WebGL.  We use `THREE.Vector3` to keep the math
// identical to what the renderer will eventually consume.

import * as THREE from '@pryzm/renderer-three/three';
import {
  FrameScheduler,
  type TickListenerDisposer,
} from '@pryzm/frame-scheduler';

/** ID used in `markDirty` / `clearDirty` and the tick-listener registry. */
export const CUBE_DIRTY_FLAG = 'cube';
export const CUBE_TICK_LISTENER_ID = 'demo:bouncing-cube';

/** Below this speed AND with the cube on the floor, we consider it at rest. */
export const REST_EPSILON = 0.05;
/** Standard 9.81 m/s² scaled to the demo's unit system (1 unit = 1 m). */
export const GRAVITY_MS2 = 9.81;
/** Energy preserved across a floor bounce (1 = perfectly elastic). */
export const RESTITUTION = 0.62;
/** Floor height (cube centre rests at FLOOR_Y + halfSize). */
export const FLOOR_Y = 0;

export interface BouncingCubeOptions {
  /** Edge length of the cube (centre-to-face = halfSize). */
  size?: number;
  /** Initial position. */
  startPosition?: THREE.Vector3;
}

export interface CubeSnapshot {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** True iff the cube has settled — the producer cleared its dirty flag. */
  atRest: boolean;
  /** Number of bounces since the last reset/flick. */
  bounceCount: number;
}

/**
 * Headless bouncing-cube simulator.  Bind to a `FrameScheduler` via
 * `attach(scheduler)`; call `flick(velocity)` to start motion.  The
 * simulator drives the scheduler's `markDirty` / `clearDirty` API
 * exactly as the eventual renderer-driven scene will, so the
 * idle-CPU bench measures realistic scheduler behaviour.
 */
export class BouncingCube {
  readonly position: THREE.Vector3;
  readonly velocity = new THREE.Vector3(0, 0, 0);
  readonly halfSize: number;

  private bounceCount = 0;
  private lastTickMs: number | null = null;
  private restFramesObserved = 0;
  private restingFlagWritten = false;
  private scheduler: FrameScheduler | null = null;
  private dispose: TickListenerDisposer | null = null;

  constructor(opts: BouncingCubeOptions = {}) {
    const size = opts.size ?? 1;
    this.halfSize = size / 2;
    this.position = opts.startPosition?.clone() ?? new THREE.Vector3(0, 5, 0);
  }

  /**
   * Register the physics tick with the scheduler.  Returns the disposer
   * so callers can detach in `afterEach` etc.  Idempotent — re-attaching
   * is a no-op (the same listener stays registered).
   */
  attach(scheduler: FrameScheduler): TickListenerDisposer {
    if (this.scheduler === scheduler && this.dispose !== null) {
      return this.dispose;
    }
    this.detach();
    this.scheduler = scheduler;
    this.dispose = scheduler.addTickListener(
      CUBE_TICK_LISTENER_ID,
      (now, deltaMs) => this.onTick(now, deltaMs),
      'pre-render',
    );
    return this.dispose;
  }

  detach(): void {
    if (this.dispose !== null) {
      this.dispose();
      this.dispose = null;
    }
    this.scheduler = null;
  }

  /**
   * "Interaction" — inject velocity.  Marks the cube dirty so the
   * scheduler loop wakes (if previously stopped) and keeps pumping at
   * 60 fps while the cube is in motion.
   */
  flick(velocity: THREE.Vector3): void {
    this.velocity.copy(velocity);
    this.bounceCount = 0;
    this.restFramesObserved = 0;
    this.restingFlagWritten = false;
    this.markActive();
  }

  snapshot(): CubeSnapshot {
    return {
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      atRest: this.restingFlagWritten,
      bounceCount: this.bounceCount,
    };
  }

  bounces(): number {
    return this.bounceCount;
  }

  isAtRest(): boolean {
    return this.restingFlagWritten;
  }

  private markActive(): void {
    if (!this.scheduler) return;
    this.scheduler.markDirty(CUBE_DIRTY_FLAG);
    this.restingFlagWritten = false;
  }

  private markRest(): void {
    if (!this.scheduler) return;
    if (!this.restingFlagWritten) {
      this.scheduler.clearDirty(CUBE_DIRTY_FLAG);
      this.restingFlagWritten = true;
    }
  }

  private onTick(now: number, deltaMs: number): void {
    // First-tick guard — if the scheduler reports a 0 ms delta (e.g. the
    // listener was registered in the same tick) skip integration; the
    // next tick gets a real dt.  This avoids any divide-by-zero in
    // future damping models without affecting bench timing.
    const dt = deltaMs > 0 ? deltaMs / 1000 : 0;
    this.lastTickMs = now;
    if (this.restingFlagWritten || dt === 0) return;

    // Semi-implicit Euler — stable for our small dt.
    this.velocity.y -= GRAVITY_MS2 * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Floor collision (centre-to-floor = halfSize).
    const floor = FLOOR_Y + this.halfSize;
    if (this.position.y <= floor) {
      this.position.y = floor;
      if (this.velocity.y < 0) {
        const reflectedVy = -this.velocity.y * RESTITUTION;
        // Asymptotic-bounce escape: if the reflected energy is below the
        // floor that one tick of gravity (≈ 0.16 m/s at 60 Hz) would
        // immediately re-impose, the cube can never leave the floor in
        // a meaningful way.  Snap to zero — this is the physically
        // realistic "settled" state and it frees the rest detector to
        // see two on-floor ticks in a row.  The threshold is gravity
        // per frame plus a small margin so we don't get caught in the
        // mini-bounce cycle (vy_post = (g·dt)·RESTITUTION ≈ 0.10 m/s).
        const miniBounceFloor = GRAVITY_MS2 * dt * RESTITUTION + 0.02;
        if (reflectedVy < Math.max(REST_EPSILON, miniBounceFloor)) {
          this.velocity.y = 0;
        } else {
          this.velocity.y = reflectedVy;
          this.bounceCount++;
        }
      }
      // Lateral friction on contact — keeps the cube from drifting forever.
      this.velocity.x *= 0.94;
      this.velocity.z *= 0.94;
    }

    // Rest detection — the cube is on the floor AND its total speed is
    // below the threshold for two consecutive ticks (one tick can be a
    // fluke at the apex of a tiny final bounce).
    const onFloor = Math.abs(this.position.y - floor) < 1e-4;
    const slow = this.velocity.lengthSq() < REST_EPSILON * REST_EPSILON;
    if (onFloor && slow) {
      this.restFramesObserved++;
      if (this.restFramesObserved >= 2) {
        this.velocity.set(0, 0, 0);
        this.markRest();
      }
    } else {
      this.restFramesObserved = 0;
    }
  }
}
