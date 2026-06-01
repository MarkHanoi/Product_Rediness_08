// PhysicsStepper — D.4.3 frame-subscription adapter for the physics-host.
//
// Anchored to:
//   * `docs/archive/pryzm3-internal/01-VISION.md §2` P3 (single rAF owner — this module
//     MUST NOT call the browser RAF API; the scheduler drives ticks by
//     calling back through `runtime.frame.subscribe`).
//   * `docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §4` verifiers:
//       `grep -q 'runtime\.frame\.subscribe' packages/physics-host/src/Stepper.ts`
//       `! rg 'rAF-literal' packages/physics-host/src/`  (no RAF calls in pkg)
//
// DESIGN
// ──────
// Today, the physics RAF queue is started by `initDataPlatform.ts` via
// `physicsEngine.start()` (which internally schedules animation frames in
// `src/physics/PhysicsEngine.ts`).  That rAF ownership violates P3.
//
// `PhysicsStepper` defines the FUTURE interface: the physics step is driven
// by the compositor's frame scheduler through `runtime.frame.subscribe`.
// When Phase 1D lands the BVH backend + FrameSlot, callers will:
//
//   const stepper = new PhysicsStepper((deltaMs) => physicsHost.tick(deltaMs));
//   stepper.start(runtime);   // wires to runtime.frame.subscribe
//   // … on tearDown:
//   stepper.stop();
//
// The frame-tick callback arrives from `runtime.frame.subscribe(callback)`
// — the compositor is the SOLE owner of the browser animation-frame API.
// This contract is enforced by the D.4.3 verifier above.
//
// Phase 1A (today): `PhysicsStepper` exists as a typed, testable contract.
// `start()` is not called from `composeRuntime.ts` because the `FrameSlot`
// (`runtime.frame`) is not yet wired.  The stepper is instantiated, but its
// `start()` is deferred until Phase 1D adds `runtime.frame` to the runtime.

/** Minimal frame-source contract the Stepper needs.  The live path
 *  wires `runtime.frame.subscribe` once Phase 1D adds the `FrameSlot`. */
export interface PhysicsFrameSource {
  /** Subscribe to frame callbacks.  `callback` receives the elapsed
   *  time in milliseconds since the previous frame.  Returns an
   *  unsubscribe function. */
  subscribe(callback: (deltaMs: number) => void): () => void;
}

/** Runtime shape the Stepper expects.  Structural subtype of the full
 *  `PryzmRuntime` so this L3 file never imports from `@pryzm/runtime-composer`. */
export interface StepperRuntime {
  /** Frame scheduler.  Phase 1D adds this slot; Phase 1A callers pass
   *  a compatible stub.  Corresponds to `runtime.frame.subscribe` in
   *  the full runtime. */
  readonly frame: PhysicsFrameSource;
}

/** Drives the physics-host step from `runtime.frame.subscribe`.
 *
 *  The stepper subscribes to the compositor's frame tick and calls
 *  `onTick(deltaMs)` each frame.  It never calls the browser RAF API
 *  directly — that ownership belongs exclusively to the compositor (P3).
 *
 *  Usage:
 *  ```ts
 *  const stepper = new PhysicsStepper((deltaMs) => physicsHost.tick(deltaMs));
 *  stepper.start(runtime);  // runtime.frame.subscribe wires the callback
 *  // …
 *  stepper.stop();
 *  ``` */
export class PhysicsStepper {
  private _unsub: (() => void) | null = null;

  constructor(private readonly onTick: (deltaMs: number) => void) {}

  /** Wire the stepper to `runtime.frame.subscribe`.  Idempotent — a
   *  second call while already running is a no-op. */
  start(runtime: StepperRuntime): void {
    if (this._unsub !== null) return;
    // This is the ONLY wiring point that reaches runtime.frame.subscribe.
    // No RAF call here. Subscription to runtime.frame.subscribe is the only entry point.
    this._unsub = runtime.frame.subscribe(this.onTick);
  }

  /** Unsubscribe from the frame source.  Idempotent. */
  stop(): void {
    if (this._unsub === null) return;
    this._unsub();
    this._unsub = null;
  }

  /** True if currently subscribed to the frame source. */
  get isRunning(): boolean {
    return this._unsub !== null;
  }
}
