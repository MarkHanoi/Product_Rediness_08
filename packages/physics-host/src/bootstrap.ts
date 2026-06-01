// PhysicsBootstrap — D.4.3 single composition root for physics-host wiring.
//
// Anchored to:
//   * `docs/archive/pryzm3-internal/02-ARCHITECTURE.md §3` (composition-root contract:
//     every bootstrap surface emits one OTel span, accepts an audit, returns
//     a typed slot + tearDown).
//   * `docs/archive/pryzm3-internal/01-VISION.md §2` P3 (single rAF owner — this package
//     MUST NOT call the browser RAF API; the physics step is driven by
//     subscription to `runtime.frame.subscribe` via `PhysicsStepper`) and
//     P8 (every architectural boundary surfaces an OTel span —
//     `pryzm.bootstrap.physics` is the one for this boundary).
//   * `docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §4` D.4.3.
//   * `docs/archive/pryzm3-internal/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §2`
//     Day-1 STATUS row 2026-04-30 night — Option A precedent applies (same
//     pattern as D.4.1 Day-2 SceneBootstrap.ts and D.4.2 Day-7
//     PersistenceBootstrap.ts):
//       "Skeleton-only L3 surface + typed contract + OTel span; the RAF-
//        batched body remains in `src/physics/PhysicsEngine.ts` (owned by
//        `src/engine/subsystems/initDataPlatform.ts`) with a pointer header.
//        Full body relocation gated on L7 dep factoring (ConstraintEngine,
//        SemanticGraph, PhysicsPanel references cannot move into L3 wholesale
//        without inverting the layer rule)."
//
// Why this file is a wrapper today (not the relocated RAF body):
//   * The PRYZM physics system (`src/physics/PhysicsEngine.ts`, 356 LOC)
//     is a RAF-batched room-physics queue started in
//     `src/engine/subsystems/initDataPlatform.ts`.  It pulls in
//     `ConstraintEngine`, `SemanticGraph`, `DecisionRecordStore` — all L4+
//     concerns that cannot land in L3 wholesale without inverting the layer
//     rule.
//   * D.4.3 establishes the PHYSICS-HOST ENTRY POINT in @pryzm/physics-host:
//     it owns the typed input/output contract, the OTel span, and the
//     soft-fail semantics.  The RAF body moves in when L7 dep factoring
//     completes (Wave 4+).
//   * The CALLER (composeRuntime.ts) injects `loadEnginePhysics` via lazy
//     `import()` so this L3 file never takes a static dependency on
//     @pryzm/editor or any L4+ surface (which would invert the layer rule).
//   * `PhysicsStepper` (./Stepper.ts) defines the frame-subscription
//     contract: it calls `runtime.frame.subscribe`, NOT the browser RAF
//     API directly (P3 — single rAF owner = the compositor).
//
// Span shape:
//   `pryzm.bootstrap.physics` records:
//     * `pryzm.bootstrap.physics.phase` — 'engine-init' (the only phase
//       today; future phases may include 'bvh-rebuild' / 'worker-handshake'
//       as Phase 1D lands the WASM BVH backend)
//     * `pryzm.bootstrap.physics.has_engine_loader` — true on the async
//       path (the idle path skips the span)
//     * `pryzm.bootstrap.physics.outcome` — 'ok' | 'soft-fail'
//   On soft-fail the span still ends with status OK (the slot exposes the
//   captured error via `physicsError`); only an unrecoverable throw inside
//   the loader / wrapper records an exception.
//
// FORBIDDEN: no THREE / react / @thatopen/components imports in this file
// or any transitive dep within this package (`pryzm.forbiddenDependencies`
// in package.json enforces this at CI).  No RAF calls (P3 — use
// PhysicsStepper which subscribes to `runtime.frame.subscribe` instead).

import { withSpan } from './otel.js';
import { type PhysicsHost, NullPhysicsHost } from './index.js';

/** The audit triple every composition-root surface accepts.  Mirrors
 *  `RuntimeAudit` from `@pryzm/runtime-composer` without taking a static
 *  dependency on it (L3 must not depend on L2). */
export interface PhysicsBootstrapAudit {
  readonly actorId: string;
  readonly projectId: string;
  readonly clientId: string;
}

/** Input the caller hands to `bootstrapPhysics()`. */
export interface PhysicsBootstrapInput {
  readonly audit: PhysicsBootstrapAudit;
  /** Lazy loader for the engine-layer physics bootstrap.  Injected so
   *  this file does not take a static dependency on @pryzm/editor,
   *  ConstraintEngine, SemanticGraph, or any L4+ surface; the caller
   *  uses dynamic `import()` to supply the function on first use. */
  readonly loadEnginePhysics: () => Promise<EnginePhysicsBootstrapFn>;
  /** The opaque parameter object the engine-layer fn expects (in HEAD:
   *  `{ stores, physicsEngine, constraintEngine }`).  Typed `unknown`
   *  so this file does not bind to a specific engine-layer surface
   *  (L3-pure). */
  readonly engineParams: unknown;
}

/** Shape of the function the caller is expected to load.  Today this is
 *  `initDataPlatform`'s physics setup in
 *  `src/engine/subsystems/initDataPlatform.ts`; once D.4.3+ decomposes
 *  the engine-layer init into per-subsystem workers, the caller may
 *  compose multiple lazy loaders into a single shape-equivalent fn.
 *  Either way, the L3 surface here is unchanged. */
export type EnginePhysicsBootstrapFn = (params: unknown) => {
  /** The initialised host instance (may be the NullPhysicsHost until
   *  Phase 1D swaps in the BVH backend). */
  physicsHost: PhysicsHost;
  tearDown?: () => void;
};

/** The slot fields `bootstrapPhysics()` produces.  Structurally isomorphic
 *  to `PhysicsHostSlot` in `@pryzm/runtime-composer/types` so the caller
 *  can assign the result's `physicsHost` field directly into the runtime
 *  slot with no runtime adapter. */
export type PhysicsSlotShape = PhysicsHost;

export interface PhysicsBootstrapResult {
  /** The physics-host instance.  On the idle / soft-fail path this is
   *  a `NullPhysicsHost`; on the happy path it is whatever the engine
   *  loader returned. */
  readonly physicsHost: PhysicsSlotShape;
  /** Captured throw from the engine-layer init.  `null` on the happy
   *  path; non-null when the loader / inner fn threw and the wrapper
   *  soft-failed (panels read this to detect "physics offline"). */
  readonly physicsError: Error | null;
  /** Disposes whatever the engine-layer init returned a tearDown for.
   *  Always callable, even on soft-fail (in which case it is a no-op). */
  readonly tearDown: () => void;
}

/** The async path: an engine loader is available, the physics half
 *  should boot.  Soft-fails on any error — the returned result has
 *  `physicsHost === NullPhysicsHost` and `physicsError !== null` so
 *  callers can detect "physics offline" without the whole runtime
 *  crashing.  Emits one `pryzm.bootstrap.physics` span. */
export async function bootstrapPhysics(
  input: PhysicsBootstrapInput,
): Promise<PhysicsBootstrapResult> {
  return withSpan(
    'pryzm.bootstrap.physics',
    {
      'pryzm.bootstrap.physics.phase': 'engine-init',
      'pryzm.bootstrap.physics.has_engine_loader': true,
    },
    async (span) => {
      try {
        const bootstrapEnginePhysics = await input.loadEnginePhysics();
        const result = bootstrapEnginePhysics(input.engineParams);
        span.setAttribute('pryzm.bootstrap.physics.outcome', 'ok');
        return {
          physicsHost: result.physicsHost,
          physicsError: null,
          tearDown:
            typeof result.tearDown === 'function'
              ? result.tearDown
              : NOOP_TEARDOWN,
        };
      } catch (err) {
        // Soft-fail: capture the error in the result, end the span as OK
        // (the failure mode is data, not an exception the caller must
        // handle).  Callers read `physicsError` to detect "no physics".
        const error = err instanceof Error ? err : new Error(String(err));
        span.setAttribute('pryzm.bootstrap.physics.outcome', 'soft-fail');
        span.setAttribute('pryzm.bootstrap.physics.error', error.message);
        return {
          physicsHost: new NullPhysicsHost(),
          physicsError: error,
          tearDown: NOOP_TEARDOWN,
        };
      }
    },
  );
}

/** The synchronous "idle" path: no engine loader was supplied (tests, the
 *  white landing/hub before a project opens, headless runtime-composer
 *  callers).  Returns a `NullPhysicsHost` shell without emitting a span
 *  (there is no boundary crossing to trace). */
export function bootstrapPhysicsIdle(): PhysicsBootstrapResult {
  return {
    physicsHost: new NullPhysicsHost(),
    physicsError: null,
    tearDown: NOOP_TEARDOWN,
  };
}

const NOOP_TEARDOWN = (): void => {
  /* idle / soft-fail tearDown is a no-op */
};
