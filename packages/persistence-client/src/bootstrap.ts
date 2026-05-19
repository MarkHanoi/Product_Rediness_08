// PersistenceBootstrap — D.4.2 single composition root for persistence-half wiring.
//
// Anchored to:
//   * `docs/03_PRYZM3/02-ARCHITECTURE.md §3` (composition-root contract:
//     every bootstrap surface emits one OTel span, accepts an audit, returns
//     a typed slot + tearDown).
//   * `docs/03_PRYZM3/01-VISION.md §2` P5 (single persistence wire — the
//     lazy loader injected here is the only path through which engine-layer
//     persistence wiring reaches the runtime) and P8 (every architectural
//     boundary surfaces an OTel span — `pryzm.bootstrap.persistence` is the
//     one for this boundary).
//   * `docs/03_PRYZM3/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §1`
//     Day-7 STATUS row 2026-04-30 night — Option A precedent applies (same
//     pattern as D.4.1 Day-2 SceneBootstrap.ts):
//       "Skeleton-only L0 surface + typed contract + OTel span; the 261 LOC
//        body remains in `src/engine/subsystems/initPersistence.ts` with a
//        pointer header.  Full body relocation gated on L7 dep factoring
//        (BimManager, PlatformShell, ProjectSerializer, ProjectLoader,
//        SyncStateEngine cannot move into L0 wholesale without inverting
//        the layer rule)."
//
// Why this file is a wrapper today (not the relocated 261 LOC of initPersistence):
//   * The initPersistence F-1 extraction lives in app-level land
//     (`src/engine/subsystems/initPersistence.ts`) and pulls in BimManager,
//     ProjectSerializer, ProjectLoader, PlatformShell, SyncStateEngine —
//     all L4-L7 concerns that cannot move into L0 wholesale without
//     dragging app dependencies into the persistence package and inverting
//     the layer rule.
//   * D.4.2 establishes the PERSISTENCE-HALF ENTRY POINT in
//     @pryzm/persistence-client: it owns the typed input/output contract,
//     the OTel span, and the soft-fail semantics.  Concrete code from
//     initPersistence.ts moves in at the L4 surface (per-store committers)
//     over D.4.3-5 and Wave 4.
//   * The CALLER (composeRuntime.ts → buildPersistence.ts in Day 8) injects
//     `loadEnginePersistence` via lazy `import()` so this L0 file never
//     takes a static dependency on @pryzm/editor (which would be a layer
//     inversion).
//
// Span shape:
//   `pryzm.bootstrap.persistence` records:
//     * `pryzm.bootstrap.persistence.phase` — 'engine-init' (the only phase
//       today; future phases may include 'autosave' / 'undo-log' as the
//       wiring decomposes further over Wave 4)
//     * `pryzm.bootstrap.persistence.has_engine_loader` — true on the async
//       path (the idle path skips the span — see `bootstrapPersistenceIdle`)
//     * `pryzm.bootstrap.persistence.outcome` — 'ok' | 'soft-fail'
//   On soft-fail the span still ends with status OK (the slot exposes the
//   captured error via `persistenceError`); only an unrecoverable throw
//   inside the loader / wrapper records an exception.

import { withSpan } from './otel.js';

/** The audit triple every composition-root surface accepts.  Mirrors
 *  `RuntimeAudit` from `@pryzm/runtime-composer` without taking a static
 *  dependency on it (L0 must not depend on L2). */
export interface PersistenceBootstrapAudit {
  readonly actorId: string;
  readonly projectId: string;
  readonly clientId: string;
}

/** Input the caller hands to `bootstrapPersistence()`. */
export interface PersistenceBootstrapInput {
  readonly audit: PersistenceBootstrapAudit;
  /** Lazy loader for the engine-layer persistence bootstrap.  Injected so
   *  this file does not take a static dependency on @pryzm/editor or
   *  BimManager / PlatformShell / ProjectSerializer (all L4-L7 surfaces);
   *  the caller uses dynamic `import()` to supply the function on first
   *  use. */
  readonly loadEnginePersistence: () => Promise<EnginePersistenceBootstrapFn>;
  /** The opaque parameter object the engine-layer fn expects (in HEAD:
   *  `{ world, bimManager, toolManager, unselectAll, stores }`).  Typed
   *  `unknown` so this file does not bind to a specific engine-layer
   *  surface (L0-pure). */
  readonly engineParams: unknown;
}

/** Shape of the function the caller is expected to load.  Today this is
 *  `initPersistence` from `src/engine/subsystems/initPersistence.ts`; once
 *  D.4.3+ decomposes the engine-layer init into per-store committers, the
 *  caller may compose multiple lazy loaders into a single shape-equivalent
 *  function.  Either way, the L0 surface here is unchanged. */
export type EnginePersistenceBootstrapFn = (params: unknown) => {
  platformShell: unknown;
  tearDown?: () => void;
};

/** The slot fields `bootstrapPersistence()` produces.  Field-isomorphic to
 *  the engine-layer `PersistenceResult` plus the soft-fail field, so the
 *  caller can assign the result directly into its slot field with no
 *  runtime adapter. */
export interface PersistenceSlotShape {
  /** The PlatformShell instance the engine-layer init produced (or
   *  re-injected delegates into).  `null` only on soft-fail. */
  readonly platformShell: unknown | null;
  /** Captured throw from the engine-layer init.  `null` on the happy
   *  path; non-null when the loader / inner fn threw and the wrapper
   *  soft-failed (panels read this to detect "persistence offline"). */
  readonly persistenceError: Error | null;
}

export interface PersistenceBootstrapResult {
  readonly persistence: PersistenceSlotShape;
  /** Disposes whatever the engine-layer init returned a tearDown for
   *  (today: nothing — `initPersistence` returns just `{ platformShell }`;
   *  future Wave-4 work will add per-store dispose hooks).  Always
   *  callable, even on soft-fail (in which case it is a no-op). */
  readonly tearDown: () => void;
}

/** The async path: an engine loader is available, the persistence half
 *  should boot.  Soft-fails on any error — the returned slot has
 *  `platformShell === null` and `persistenceError !== null` so panels can
 *  detect "persistence offline" without the whole runtime crashing.
 *  Emits one `pryzm.bootstrap.persistence` span. */
export async function bootstrapPersistence(
  input: PersistenceBootstrapInput,
): Promise<PersistenceBootstrapResult> {
  return withSpan(
    'pryzm.bootstrap.persistence',
    {
      'pryzm.bootstrap.persistence.phase': 'engine-init',
      'pryzm.bootstrap.persistence.has_engine_loader': true,
    },
    async (span) => {
      try {
        const bootstrapEnginePersistence = await input.loadEnginePersistence();
        const result = bootstrapEnginePersistence(input.engineParams);
        span.setAttribute('pryzm.bootstrap.persistence.outcome', 'ok');
        return {
          persistence: {
            platformShell: result.platformShell,
            persistenceError: null,
          },
          tearDown:
            typeof result.tearDown === 'function'
              ? result.tearDown
              : NOOP_TEARDOWN,
        };
      } catch (err) {
        // Soft-fail: capture the error in the slot, end the span as OK
        // (the failure mode is data, not an exception the caller must
        // handle).  Panels read `persistenceError` to detect "no
        // persistence".
        const error = err instanceof Error ? err : new Error(String(err));
        span.setAttribute(
          'pryzm.bootstrap.persistence.outcome',
          'soft-fail',
        );
        span.setAttribute(
          'pryzm.bootstrap.persistence.error',
          error.message,
        );
        return {
          persistence: {
            platformShell: null,
            persistenceError: error,
          },
          tearDown: NOOP_TEARDOWN,
        };
      }
    },
  );
}

/** The synchronous "idle" path: no engine loader was supplied (tests, the
 *  white landing/hub before a project opens, headless runtime-composer
 *  callers).  Produces the same null-shell slot the async path produces
 *  on soft-fail, but without a span (there is no boundary crossing to
 *  trace). */
export function bootstrapPersistenceIdle(): PersistenceBootstrapResult {
  return {
    persistence: {
      platformShell: null,
      persistenceError: null,
    },
    tearDown: NOOP_TEARDOWN,
  };
}

const NOOP_TEARDOWN = (): void => {
  /* idle / soft-fail tearDown is a no-op */
};
