// @pryzm/physics-host — PHASE-1A skeleton + D.4.3 bootstrap surface.
//
// Spec: `docs/03_PRYZM3/reference/phases/PHASE-1/1A-SKELETON-RAILS.md` —
// the renderer-track row "physics-host package + composeRuntime slot".
//
// D.4.3 adds:
//   * `src/bootstrap.ts` — typed contract + OTel span `pryzm.bootstrap.physics`
//   * `src/Stepper.ts`   — frame-subscription adapter (NO RAF calls — P3 enforced)
//   * `src/debug.ts`     — dev-only helpers (gated on import.meta.env.DEV)
//
// PURPOSE
// ─────────────────────────────────────────────────────────────────────────────
// The physics-host owns the broad-phase spatial query backend used by:
//   • the renderer's picking pipeline (raycast(canvasX, canvasY)),
//   • the tool layer's snap/intersection queries (queryAabb,
//     pointInVolume), and
//   • the spatial-index plugin's incremental rebuild on store
//     mutations (`onStoreCommit` hook — Phase 1D).
//
// PRYZM is NOT a game engine — there is no impulse solver, no rigid-body
// dynamics, no gravity integrator.  All physics is purely **kinematic
// query** against the static element set.  The "host" terminology
// matches Revit's `PhysicalDevice` / IFC's `IfcSpatialZone` — a query
// surface, not a simulator.
//
// PHASE-1A SCOPE (this package, today)
// ─────────────────────────────────────────────────────────────────────────────
// * `PhysicsHost` — the runtime contract (interface).  Same structural
//   shape as `PhysicsHostSlot` in `@pryzm/runtime-composer`; the
//   composer picks up the impl through structural typing so the two
//   packages remain decoupled at the import-graph level.
// * `NullPhysicsHost` — a no-op backend that returns empty results
//   for every query and reports `isReady() === false`.  Used by
//   `composeRuntime` when no canvas is supplied (headless / test
//   harness mode) and as the default backend before Phase 1D's WASM
//   BVH lands.
// * `createNullPhysicsHost()` — factory the composer calls (kept for
//   backward compatibility; new callers should use `bootstrapPhysicsIdle`).
//
// D.4.3 SCOPE (this wave)
// ─────────────────────────────────────────────────────────────────────────────
// * `bootstrapPhysics()` — async path: OTel span + dep-injected engine loader.
// * `bootstrapPhysicsIdle()` — sync idle path: null-shell, no span.
// * `PhysicsStepper` — drives physics ticks from `runtime.frame.subscribe`
//   (NOT the browser RAF API — P3 enforced).
// * `debugLog*` helpers — gated on `import.meta.env.DEV`.
//
// PHASE-1D SCOPE (next, NOT in this package yet)
// ─────────────────────────────────────────────────────────────────────────────
// * `BvhPhysicsHost` — backed by `three-mesh-bvh` over the renderer's
//   committed geometry.  Wired in Phase 1D (S81 row "BVH-backed
//   physics-host").  The slot contract is final today; Phase 1D swaps
//   the Null backend for the BVH backend without a signature change.
//
// PURE: no DOM, no THREE, no Node-only globals.  Safe to import from
// the worker thread (Phase 1D's BVH backend will live in a Worker).
//
// POINTER: the engine-layer RAF-batched room-physics queue lives at
//   `src/physics/PhysicsEngine.ts` (356 LOC) — started by
//   `src/engine/subsystems/initDataPlatform.ts`.  That code is the
//   BODY that D.4.3's typed contract wraps; its relocation is gated on
//   L7 dep factoring (Wave 4).  See the pointer comment at the top of
//   `src/physics/PhysicsEngine.ts`.

/** A 3D vector, in world units (millimetres per IFC convention; the
 *  renderer scales for display).  Tuple type avoids THREE.Vector3
 *  imports and keeps this package free of geometry dependencies. */
export type Vec3 = readonly [number, number, number];

/** Result of a raycast — the first element ID hit, plus the world-space
 *  hit point and surface normal.  `null` when the ray missed every
 *  registered element. */
export interface RaycastHit {
  /** Element ID (the same ID used by `runtime.selection`). */
  readonly elementId: string;
  /** World-space hit point. */
  readonly point: Vec3;
  /** World-space surface normal at the hit point. */
  readonly normal: Vec3;
  /** Distance from `origin` to `point` along `direction`. */
  readonly distance: number;
}

/** AABB query input — half-open box `[min, max]` in world space. */
export interface AabbBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** The host contract.  Structurally compatible with
 *  `PhysicsHostSlot` in `@pryzm/runtime-composer/types`. */
export interface PhysicsHost {
  /** True once the underlying spatial index has loaded enough
   *  geometry to answer queries.  Phase 1A `NullPhysicsHost`
   *  always returns `false`; Phase 1D's BVH backend flips to
   *  `true` after the first `commitElements()` batch. */
  isReady(): boolean;

  /** Cast a ray from `origin` in `direction` (need not be
   *  normalized; the impl normalizes).  Returns the closest hit
   *  or `null`.  Phase 1A returns `null` for every call.
   *
   *  `maxDistance` defaults to `Infinity`. */
  raycast(origin: Vec3, direction: Vec3, maxDistance?: number): RaycastHit | null;

  /** Return the IDs of every element whose world-space AABB
   *  intersects `box`.  Phase 1A returns the empty array. */
  queryAabb(box: AabbBox): readonly string[];

  /** Return the IDs of every element whose volume contains
   *  `point` (point-in-polyhedron test).  Phase 1A returns the
   *  empty array. */
  pointInVolume(point: Vec3): readonly string[];

  /** Idempotent.  Releases any owned resources (Phase 1A: no-op;
   *  Phase 1D: terminates the worker + frees the BVH ArrayBuffers). */
  dispose(): void;
}

/** Phase 1A no-op backend.  Every query returns the empty result;
 *  `isReady()` always returns `false` so callers can branch on
 *  `runtime.physicsHost.isReady()` to gate optional fast-paths
 *  without inspecting the concrete class. */
export class NullPhysicsHost implements PhysicsHost {
  private _disposed = false;

  isReady(): boolean {
    return false;
  }

  raycast(_origin: Vec3, _direction: Vec3, _maxDistance?: number): RaycastHit | null {
    if (this._disposed) {
      throw new Error('[physics-host] raycast() called on a disposed NullPhysicsHost');
    }
    return null;
  }

  queryAabb(_box: AabbBox): readonly string[] {
    if (this._disposed) {
      throw new Error('[physics-host] queryAabb() called on a disposed NullPhysicsHost');
    }
    return EMPTY_ID_LIST;
  }

  pointInVolume(_point: Vec3): readonly string[] {
    if (this._disposed) {
      throw new Error('[physics-host] pointInVolume() called on a disposed NullPhysicsHost');
    }
    return EMPTY_ID_LIST;
  }

  dispose(): void {
    this._disposed = true;
  }
}

/** Frozen empty array reused by every query — keeps the GC quiet on
 *  the hot path before Phase 1D's BVH backend lands. */
const EMPTY_ID_LIST: readonly string[] = Object.freeze([]);

/** Factory the composer calls.  Returns a fresh `NullPhysicsHost` —
 *  cheap to allocate, no shared state with siblings.
 *  @deprecated  New callers should use `bootstrapPhysicsIdle()` which
 *  returns a typed `PhysicsBootstrapResult` with the same host. */
export function createNullPhysicsHost(): PhysicsHost {
  return new NullPhysicsHost();
}

// ── D.4.3 bootstrap surface ──────────────────────────────────────────────────

export {
  bootstrapPhysics,
  bootstrapPhysicsIdle,
  type PhysicsBootstrapAudit,
  type PhysicsBootstrapInput,
  type PhysicsBootstrapResult,
  type PhysicsSlotShape,
  type EnginePhysicsBootstrapFn,
} from './bootstrap.js';

export {
  PhysicsStepper,
  type PhysicsFrameSource,
  type StepperRuntime,
} from './Stepper.js';

export {
  debugLogPhysicsReady,
  debugLogPhysicsError,
  debugLogStepperEvent,
} from './debug.js';

// ── Sprint R (2026-05-11) — PhysicsEngine + PhysicsTypes from src/engine/subsystems/physics/ ──

export {
  PhysicsEngine,
  physicsEngine,
  HABITABLE_TYPES,
} from './PhysicsEngine.js';

export type {
  ThermalClass,
  ThermalResult,
  AcousticClass,
  AcousticResult,
  DaylightClass,
  DaylightResult,
  RoomPhysicsResult,
  PhysicsResultCache,
  PhysicsOverlayMode,
} from './PhysicsTypes.js';

// ── Sprint S (2026-05-11) — PhysicsOverlayRenderer from src/engine/subsystems/physicsOverlay/ ──

export {
  initPhysicsOverlayRenderer,
  setPhysicsOverlayMode,
} from './PhysicsOverlayRenderer.js';
