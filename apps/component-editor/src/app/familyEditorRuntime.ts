// familyEditorRuntime — top-level wiring for the Family Creator (S52 D2/D3 + S53 D7).
//
// Composes the long-lived stores, the command bus, the solver runner,
// and all registered commands into one disposable object that the
// AppShell mounts at startup. Keeping this out of `AppShell.ts`
// preserves the §13 LoC cap on that file (header / footer / tab bar
// already pushes it close to 250 LoC).
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.
//
// ⚠ P1 — THIS IS A SECOND COMPOSITION ROOT, AND THAT IS DELIBERATE.
// See **ADR-0316** (`docs/02-decisions/adrs/
// ADR-0316-family-creator-is-a-second-composition-root.md`). The Family
// Creator is a different product surface from the BIM editor: no project,
// no site, no collaboration, no renderer, and a hard 180 KB gzip
// first-paint budget (`__tests__/quality-gates/bundle-budget.test.ts`).
// `composeRuntime()` statically imports `@pryzm/renderer-three`, whose
// THREE core alone is ~281 KB gzip — 1.5× this app's ENTIRE budget — and
// it requires a `bootstrapFn` supplied by `@pryzm/editor`. Delegating
// would buy nothing and cost first paint.
//
// The blessing is conditional. `tools/ga-gate/check-single-compose.ts`
// holds `MAX_RIVALS = 1` citing ADR-0316, and
// `__tests__/app/secondCompositionRoot.invariants.test.ts` pins what the
// two roots MUST keep in common. If you are here to add a project store,
// a persistence client, a sync client or a renderer, ADR-0316 no longer
// applies — go delegate.

// ⚠ THE SUBPATH IS LOAD-BEARING — do NOT "tidy" this back to the barrel.
//
// ⛔ CORRECTED 2026-09-06, SAME DAY, BY THE REBUILD THAT WAS SUPPOSED TO
//    CONFIRM IT. This comment first read: *"it was the single edge that made
//    this app's shipped page 12.3 MB"*. That was WRONG, and it was wrong in
//    the most seductive way — a plausible mechanism, asserted before the
//    measurement that would have falsified it. The rebuild is the record:
//
//      BEFORE this change  component-editor.html → domain-engine 4,494,087 B
//      AFTER  this change  component-editor.html → domain-engine 4,494,087 B
//
//    Byte for byte. `vendor-three`, `vendor-web-ifc`, `vendor-thatopen` and
//    `vendor-three-bvh` all still preload. The barrel was A real edge; it was
//    not THE edge, and cutting it moved nothing.
//
// WHY IT MOVED NOTHING — the real mechanism, established from the emitted
// bytes rather than from the import graph. `dist/assets/domain-engine-*.js`
// contains BOTH `batchCoordinator` (from `@pryzm/core-app-model`) AND
// `PLANEGCS_WASM_URL` (from this very `engine.ts`). Rollup CO-LOCATED
// `engine.ts` into the 4.5 MB SCC chunk, because `apps/editor` reaches the
// solver too and the root config's `manualChunks` deliberately fuses that
// whole strongly-connected component into one chunk. So the cost is imposed
// by CHUNK ASSIGNMENT, not by this import statement. Changing the specifier
// cannot escape a chunk; only changing the chunking can.
//
// ⭐ KEEP THE SUBPATH ANYWAY, for two reasons that survive the correction:
//   1. It is independently correct — an L7 app should not pull an L2 barrel
//      that re-exports `ConstraintEngine.ts` (→ `@pryzm/core-app-model`) and
//      `LevelTraversalPolicy.ts` (→ `@pryzm/geometry-wall`) to obtain two
//      symbols from a module that imports nothing. `engine.ts` has exactly
//      ONE import statement and it is an `import type`; both symbols used
//      here live in it (`MockSolver` :93, `loadSolver` :482).
//   2. It is HALF of the two-part fix. The other half is a `manualChunks`
//      rule pinning `constraint-solver/src/engine.ts` to its own chunk, plus
//      a narrow door into `@pryzm/geometry-kernel` for the two pure helpers
//      this app uses (`sampleCubicBezierChainXZ`, `intersectLines2D`). That
//      second door needs an `exports` entry in that package's package.json,
//      which is why it is NOT in this commit — see the lane report.
//
// ⚠ AND DO NOT "JUST SPLIT THE CHUNK": `@pryzm/schemas` imports domain-engine
//   packages in 5 files and `geometry-kernel` imports `schemas`, so naively
//   giving `geometry-kernel` its own chunk creates a CIRCULAR chunk — the
//   exact "broken execution order" failure class vite.config.ts's own
//   manualChunks comment documents. The weight is bound to a real cycle in
//   the workspace graph, and that is an architecture decision, not a config
//   tweak.
//
// This was invisible while the app had no bundle entry (L-12976): its own
// `vite build` tree-shook the unused re-exports, so the 180 KB budget gate
// stayed green and nothing else ever built this graph. A second consumer is
// what turned a latent barrel into a measured cost.
//
// The five OTHER `@pryzm/constraint-solver` imports in this app are all
// `import type` and are erased before Rollup sees them, so they may keep
// naming the barrel. This one is the only value import, and therefore the
// only one that can drag a module graph behind it.
import { MockSolver, loadSolver, type SolverPorter } from '@pryzm/constraint-solver/engine';

// NOTE: planegcs (real WASM solver) loads asynchronously; the runtime
// starts with a deterministic `MockSolver` so the editor renders
// instantly, then upgrades when the WASM payload arrives. The swap
// is published through the `solverRef` accessor so `solverRunner`
// always sees the most-recent solver without re-mounting the runtime.
//
// Documented decision per S52 audit: this preserves first-paint < 180
// KB gzip even when planegcs eventually ships, because the WASM blob
// is fetched lazily on first solve attempt — not at boot.
import { createCommandBus, type CommandBus } from './commandBus.js';
import { registerConstraintCommands } from '../commands/constraint/index.js';
import { registerDimensionCommands } from '../commands/dimension/index.js';
import { registerReferencePlaneCommands } from '../commands/referencePlane/index.js';
import { registerSolidCommands } from '../commands/solid/index.js';
import { createConstraintStore, type ConstraintStore } from '../stores/constraintStore.js';
import { createDimensionStore, type DimensionStore } from '../stores/dimensionStore.js';
import {
  createSketchViewStore,
  type SketchViewStore,
} from '../views/sketchViewStore.js';
import { createViewSketchSet, type ViewSketchSet } from '../views/viewSketchSet.js';
import {
  createReferencePlaneStore,
  type ReferencePlaneStore,
} from '../stores/referencePlaneStore.js';
import { createSelectionStore, type SelectionStore } from '../stores/selectionStore.js';
import { createSketchDocStore, type SketchDocStore } from '../stores/sketchDocStore.js';
import { createSolidStore, type SolidStore } from '../stores/solidStore.js';
import {
  createSolverRunner,
  type SolverRunner,
} from '../sketch/solverRunner.js';

export interface FamilyEditorRuntime {
  readonly commandBus: CommandBus;
  /** Canonical sketch document store (alias: `sketchStore`). */
  readonly sketchDocStore: SketchDocStore;
  readonly sketchStore: SketchDocStore;
  readonly constraintStore: ConstraintStore;
  readonly selectionStore: SelectionStore;
  /** S53 D5 — reference planes the sketch/solid commands are anchored to. */
  readonly referencePlaneStore: ReferencePlaneStore;
  /** S53 D6 — extrude/sweep/loft/revolve results + their §12.2 LOD bitmasks. */
  readonly solidStore: SolidStore;
  /** Lane CE-VIEWS-AND-MEASURE — placed dimensions, keyed by work plane.
   *  Mutated ONLY through the `dimension.*` command family (P6). */
  readonly dimensionStore: DimensionStore;
  /** Lane CE-VIEWS-AND-MEASURE — which work plane the author is drawing on
   *  (plan / front elevation / side elevation) and each view's camera. */
  readonly sketchViewStore: SketchViewStore;
  /**
   * Lane CE-VIEWS-AND-MEASURE — one sketch document per work plane, so a view
   * switch preserves what was drawn. `sketchDocStore` above IS this set's
   * PLAN document: the set adopts it rather than minting a rival, so every
   * existing consumer of `sketchDocStore` keeps working unchanged.
   */
  readonly sketchViews: ViewSketchSet;
  /** Solver runner for the PLAN document. Elevations have their own, reachable
   *  via `sketchViews.solverFor(kind)` — see `viewSketchSet.ts` on isolation. */
  readonly solverRunner: SolverRunner;
  /** The currently-active solver (may upgrade from MockSolver to planegcs). */
  solver: SolverPorter;
  /** Promise resolving when the lazy planegcs upgrade completes (or stays MockSolver). */
  readonly solverReady: Promise<SolverPorter>;
  dispose(): void;
}

export interface CreateRuntimeOptions {
  /** Override the solver — tests pass a deterministic stub. */
  readonly solver?: SolverPorter;
  /** Override the debounce window for the solver runner. */
  readonly solverDebounceMs?: number;
  /** Skip the lazy planegcs upgrade (tests). Defaults to `false`. */
  readonly skipSolverUpgrade?: boolean;
}

export function createFamilyEditorRuntime(
  opts: CreateRuntimeOptions = {},
): FamilyEditorRuntime {
  const sketchDocStore = createSketchDocStore();
  const constraintStore = createConstraintStore();
  const selectionStore = createSelectionStore();
  const referencePlaneStore = createReferencePlaneStore();
  const solidStore = createSolidStore();
  const dimensionStore = createDimensionStore();
  const sketchViewStore = createSketchViewStore('plan');
  const commandBus = createCommandBus();
  // ⚠ EVERY authored command family must be registered here.
  //
  // Until 2026-08-11 only `registerConstraintCommands` was called: the
  // `referencePlane.*` and `solid.*` families were authored, unit-tested,
  // and constructed ONLY inside their own tests — no user could reach
  // them, because the app's composition root never wired them. That is
  // precisely the class of defect a SECOND composition root hides best,
  // and it is why ADR-0316 requires `secondCompositionRoot.invariants`
  // to assert reachability of every `*_VERB` in `src/commands/**` rather
  // than merely asserting the files exist.
  registerReferencePlaneCommands(commandBus, { store: referencePlaneStore });
  registerSolidCommands(commandBus, { store: solidStore });

  // Start with MockSolver so first paint is instant and deterministic.
  // Hot-swap via `runtime.solver = …` once the planegcs upgrade lands.
  let solver: SolverPorter = opts.solver ?? new MockSolver();

  const solverRunner = createSolverRunner({
    docStore: sketchDocStore,
    constraintStore,
    solver,
    applyValues: (updates) => sketchDocStore.movePoints(updates),
    ...(opts.solverDebounceMs !== undefined ? { debounceMs: opts.solverDebounceMs } : {}),
  });

  // ⚠ ORDER IS LOAD-BEARING. `viewSketchSet` ADOPTS `sketchDocStore` as the
  // PLAN document and `solverRunner` as its runner, so it can only be built
  // once both exist. It mints stores only for the two elevations — creating a
  // fourth document here and calling one of them "plan" would be the rival
  // subsystem ADR-0316's blessing does not extend to.
  const sketchViews = createViewSketchSet({
    planDoc: sketchDocStore,
    planSolver: solverRunner,
    constraintStore,
    solver,
    ...(opts.solverDebounceMs !== undefined ? { solverDebounceMs: opts.solverDebounceMs } : {}),
  });

  // ⚠ MOVED HERE FROM BESIDE THE OTHER THREE FAMILIES (§CONSTRAINT-IS-VIEW-SCOPED).
  // It read `registerConstraintCommands(commandBus, { constraintStore })` above,
  // which is what made the constraint toolbar plan-only: one ambient store, and
  // every document's first point is `pt-0`, so an elevation constraint was
  // "valid against" the plan and deformed it. It now resolves the store of the
  // dispatch's own work plane, which means it can only be registered once
  // `sketchViews` exists — the same ordering `registerDimensionCommands` below
  // already has, and for the same reason.
  //
  // ⭐ `secondCompositionRoot.invariants.test.ts` asserts every `*_VERB` under
  //    `src/commands/**` is reachable from THIS function; moving the call
  //    inside it keeps that true, and the test is what would catch it if a
  //    later edit dropped the line instead of moving it.
  registerConstraintCommands(commandBus, {
    constraintStoreFor: (view) => sketchViews.constraintStoreFor(view),
    activeView: () => sketchViewStore.get().active,
  });

  // Registered HERE rather than beside the other three families because it is
  // the only one that needs a document-per-view lookup. `docSnapshotFor`
  // routes each dimension at the document of ITS OWN work plane, which is
  // what stops a plan dimension from measuring elevation points.
  registerDimensionCommands(commandBus, {
    dimensionStore,
    constraintStoreFor: (view) => sketchViews.constraintStoreFor(view),
    docSnapshotFor: (view) => sketchViews.docFor(view).get(),
  });

  const solverReady: Promise<SolverPorter> = opts.solver || opts.skipSolverUpgrade
    ? Promise.resolve(solver)
    : loadSolver().then(
        (real) => { solver = real; runtime.solver = real; return real; },
        () => solver,
      );

  const runtime: FamilyEditorRuntime = {
    commandBus,
    sketchDocStore,
    sketchStore: sketchDocStore,
    constraintStore,
    selectionStore,
    referencePlaneStore,
    solidStore,
    dimensionStore,
    sketchViewStore,
    sketchViews,
    solverRunner,
    solver,
    solverReady,
    dispose() {
      // `sketchViews` first: it owns the two ELEVATION runners and the
      // per-document subscriptions. `solverRunner` is the PLAN runner, which
      // the set adopted and deliberately does not dispose, so this root still
      // has to drop it itself.
      sketchViews.dispose();
      solverRunner.dispose();
      commandBus.clear();
      selectionStore.clear();
    },
  };
  return runtime;
}
