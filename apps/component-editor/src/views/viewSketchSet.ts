// viewSketchSet — ONE SKETCH DOCUMENT PER WORK PLANE, so switching views
// preserves what the author drew (lane CE-VIEWS-AND-MEASURE).
//
// ─── THE SEMANTIC DECISION, STATED PLAINLY ───────────────────────────────────
// There were two ways to make the sketcher view-aware and only one of them is
// honest:
//
//   (A) REINTERPRET one document through the active basis. Cheap, and WRONG:
//       switching Plan → Front would take the floor outline the author drew
//       and stand it up as a façade. The numbers would all still "work"; the
//       drawing would be a lie.
//   (B) One document PER work plane. Switching changes which document the
//       canvas paints; each one keeps its own entities. This is what Revit's
//       family editor does, and it is what "switching preserves the sketch"
//       actually means.
//
// (B) is implemented here.
//
// ─── WHY THE PLAN DOCUMENT IS ADOPTED, NOT CREATED ───────────────────────────
// `familyEditorRuntime` already owns a `sketchDocStore` — and the constraint
// toolbar, the status bar and the solver runner are all bound to it. Creating
// a fourth store here and calling one of them "plan" would be exactly the
// rival subsystem the fleet rules forbid. So the set ADOPTS the runtime's
// store as the plan document, and mints new ones only for the two elevations.
// `runtime.sketchDocStore` therefore keeps meaning what it always meant.
//
// ─── CONSTRAINTS IN A VERTICAL PLANE ─────────────────────────────────────────
// Each view gets its OWN `SolverRunner` **and its own `ConstraintStore`**.
//
// ⛔ THIS FILE PREVIOUSLY SHARED ONE `constraintStore` ACROSS ALL THREE VIEWS
//    AND ARGUED IT WAS SAFE. THE ARGUMENT WAS WRONG, AND
//    `__tests__/views/viewSketchSet.test.ts` IS WHAT CAUGHT IT.
//
//    The claim was: `constraintIsValidAgainst()` skips any constraint whose
//    entities are absent from the document, so a front-elevation constraint is
//    ignored by the other two runners. That holds only if entity ids are
//    UNIQUE ACROSS DOCUMENTS. They are not. `createSketchDocStore()` mints ids
//    from a per-store counter, so EVERY document's first point is `pt-0`. A
//    `distance-pp(pt-0, pt-1)` authored on the front elevation is therefore
//    fully "valid against" the plan document as well — and the plan's runner,
//    sharing the store, would enforce a storey height on the author's floor
//    outline. Dimension a 2400 mm head height, watch your plan deform.
//
//    The fix is not to make ids unique — `sketchDocStore.ts` mints them and a
//    concurrent lane owns that file. It is to stop the stores from ever being
//    consulted against a foreign document at all: ONE CONSTRAINT STORE PER
//    WORK PLANE. A constraint relates entities of ONE sketch; there is no such
//    thing here as a constraint between a plan point and an elevation point,
//    so the shared store was the design error and the id collision merely
//    exposed it. Isolation is now structural rather than argued, and it does
//    not depend on id uniqueness at all.
//
//    The PLAN store is ADOPTED from the runtime for the same reason the plan
//    document is — the constraint toolbar, status bar and constraint command
//    family are already bound to it.
//
// LAYER — L2-equivalent. No THREE, no DOM, no rAF, no `(window as any)`.

import type { SolverPorter } from '@pryzm/constraint-solver';
import { createConstraintStore, type ConstraintStore } from '../stores/constraintStore.js';
import {
  createSketchDocStore,
  type SketchDocStore,
} from '../stores/sketchDocStore.js';
import { createSolverRunner, type SolverRunner } from '../sketch/solverRunner.js';
import type { EntityId } from '../sketch/entities.js';
import {
  SKETCH_VIEW_KINDS,
  isSketchViewKind,
  unprojectFromView,
  type SketchViewKind,
  type WorldVec3,
} from './viewProjection.js';

export interface WorldSketchPoint {
  readonly id: EntityId;
  /** The point lifted off its work plane into world millimetres. */
  readonly world: WorldVec3;
}

export interface ViewSketchSet {
  /** The document the author draws into for a given work plane. */
  docFor(kind: SketchViewKind): SketchDocStore;
  /** The solver runner bound to that document. */
  solverFor(kind: SketchViewKind): SolverRunner;
  /**
   * The constraint store scoped to that work plane. See the header: one store
   * per view is what makes cross-view contamination impossible, so anything
   * authoring a constraint MUST route through this rather than through a
   * single ambient store.
   */
  constraintStoreFor(kind: SketchViewKind): ConstraintStore;
  /**
   * Every point of one view's document, lifted into WORLD millimetres.
   * This is the seam the 3D view and any exporter consume: it is the only
   * place that knows a front-elevation point at plane-z −2400 is 2400 mm
   * ABOVE the origin in world Y.
   */
  worldPointsOf(kind: SketchViewKind): readonly WorldSketchPoint[];
  /** Fires when ANY view's document mutates, with the view that changed. */
  subscribeAny(fn: (kind: SketchViewKind) => void): () => void;
  /** Total entity count across all three documents — the cheap "is anything
   *  drawn?" probe the view bar badges with. */
  entityCounts(): Readonly<Record<SketchViewKind, number>>;
  /** Dispose only what this set OWNS: the elevation runners. The adopted
   *  plan document and plan runner belong to the runtime and are left alone. */
  dispose(): void;
}

export interface ViewSketchSetOptions {
  /** The runtime's existing sketch document — adopted as the PLAN document. */
  readonly planDoc: SketchDocStore;
  /** The runtime's existing solver runner for `planDoc` — adopted, not rebuilt. */
  readonly planSolver: SolverRunner;
  /** The runtime's existing constraint store — ADOPTED as the PLAN view's.
   *  The two elevations get their own; see the header note on isolation. */
  readonly constraintStore: ConstraintStore;
  readonly solver: SolverPorter;
  readonly solverDebounceMs?: number;
}

export function createViewSketchSet(opts: ViewSketchSetOptions): ViewSketchSet {
  const docs = {
    plan: opts.planDoc,
    'elevation-front': createSketchDocStore(),
    'elevation-side': createSketchDocStore(),
  } as Record<SketchViewKind, SketchDocStore>;

  const constraints = { plan: opts.constraintStore } as Record<SketchViewKind, ConstraintStore>;
  const ownedRunners: SolverRunner[] = [];
  const runners = { plan: opts.planSolver } as Record<SketchViewKind, SolverRunner>;
  for (const kind of SKETCH_VIEW_KINDS) {
    if (kind === 'plan') continue;
    const docStore = docs[kind];
    const constraintStore = createConstraintStore();
    constraints[kind] = constraintStore;
    const runner = createSolverRunner({
      docStore,
      constraintStore,
      solver: opts.solver,
      applyValues: (updates) => docStore.movePoints(updates),
      ...(opts.solverDebounceMs !== undefined ? { debounceMs: opts.solverDebounceMs } : {}),
    });
    runners[kind] = runner;
    ownedRunners.push(runner);
  }

  const anySubs = new Set<(kind: SketchViewKind) => void>();
  const unsubscribes: Array<() => void> = [];
  for (const kind of SKETCH_VIEW_KINDS) {
    unsubscribes.push(
      docs[kind].subscribe(() => {
        for (const fn of anySubs) fn(kind);
      }),
    );
  }

  function assertKind(kind: SketchViewKind, where: string): void {
    if (!isSketchViewKind(kind)) {
      throw new Error(`viewSketchSet.${where}: invalid view "${String(kind)}".`);
    }
  }

  return {
    docFor(kind) {
      assertKind(kind, 'docFor');
      return docs[kind];
    },
    solverFor(kind) {
      assertKind(kind, 'solverFor');
      return runners[kind];
    },
    constraintStoreFor(kind) {
      assertKind(kind, 'constraintStoreFor');
      return constraints[kind];
    },
    worldPointsOf(kind) {
      assertKind(kind, 'worldPointsOf');
      const snap = docs[kind].get();
      const out: WorldSketchPoint[] = [];
      for (const p of Object.values(snap.pointById)) {
        out.push({ id: p.id, world: unprojectFromView({ x: p.x, z: p.z }, kind) });
      }
      return Object.freeze(out);
    },
    subscribeAny(fn) {
      anySubs.add(fn);
      return () => {
        anySubs.delete(fn);
      };
    },
    entityCounts() {
      const out = {} as Record<SketchViewKind, number>;
      for (const kind of SKETCH_VIEW_KINDS) out[kind] = docs[kind].get().entities.length;
      return Object.freeze(out);
    },
    dispose() {
      for (const un of unsubscribes) un();
      unsubscribes.length = 0;
      anySubs.clear();
      for (const r of ownedRunners) r.dispose();
      ownedRunners.length = 0;
    },
  };
}
