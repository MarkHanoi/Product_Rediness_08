// familyEditorRuntime — top-level wiring for the Family Creator (S52 D2/D3 + S53 D7).
//
// Composes the long-lived stores, the command bus, the solver runner,
// and all registered commands into one disposable object that the
// AppShell mounts at startup. Keeping this out of `AppShell.ts`
// preserves the §13 LoC cap on that file (header / footer / tab bar
// already pushes it close to 250 LoC).
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

import { MockSolver, loadSolver, type SolverPorter } from '@pryzm/constraint-solver';

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
import { createConstraintStore, type ConstraintStore } from '../stores/constraintStore.js';
import { createSelectionStore, type SelectionStore } from '../stores/selectionStore.js';
import { createSketchDocStore, type SketchDocStore } from '../stores/sketchDocStore.js';
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
  const commandBus = createCommandBus();
  registerConstraintCommands(commandBus, { constraintStore });

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
    solverRunner,
    solver,
    solverReady,
    dispose() {
      solverRunner.dispose();
      commandBus.clear();
      selectionStore.clear();
    },
  };
  return runtime;
}
