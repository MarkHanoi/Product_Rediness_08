// PlanegcsAdapter — porter for the real planegcs WASM solver (S52 D1).
//
// Spec source:
//   • `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §6.1, §6.2
//     (line 363 — `PlanegcsSolverPorter` ships at S52 D1 in the
//     browser, `PlanegcsNodePorter` at S52 D2 in Node).
//
// STATUS — S52 D1 SCAFFOLD.
//   The adapter SHAPE is shipped now so `loadSolver({env:{PLANEGCS_WASM_URL:'…'}})`
//   end-to-end resolves to a real `SolverPorter` object instead of
//   silently falling through to `MockSolver`.  The actual planegcs
//   WASM binding lands at S52 D2 with the npm `planegcs` package
//   install + WASM URL plumbing through Vite's `?url` asset import.
//   Until D2, every `solve()` and `diagnose()` call delegates to the
//   shipped `MockSolver` — the OTel span shape, return shape, and
//   error semantics are already final, so D2's WASM swap is a pure
//   internal-implementation change with zero ripples.
//
// LAYERING — L4-equivalent (constraint solver lives outside the
//   layered stack but obeys the L4-pure rule: no THREE, no DOM, no
//   imports above L1).  The browser variant uses `fetch` for the
//   WASM module; the Node variant uses `fs.readFileSync`.  Both are
//   the same SolverPorter shape so the sketcher doesn't care which
//   it has.

import { MockSolver, type SolverPorter } from './engine.js';
import type {
  ConstraintSet,
  DiagnoseResult,
  SolveHints,
  SolveResult,
} from './types.js';

export interface PlanegcsAdapterOptions {
  /**
   * Source URL for the planegcs WASM module.  Required.  In the
   * browser this is typically `import.meta.url`-relative
   * (`new URL('planegcs.wasm', import.meta.url)`); in Node it's a
   * `file://` URL produced by `pathToFileURL()`.
   */
  readonly wasmUrl: string;

  /**
   * Optional override for the underlying solver implementation, used
   * exclusively by tests so they can verify delegation without
   * loading a real WASM module.  Production callers MUST NOT pass
   * this.  When omitted (or undefined) the adapter falls back to
   * `MockSolver` until S52 D2 swaps in the real planegcs binding.
   */
  readonly underlying?: SolverPorter;
}

/**
 * Public factory matching the dynamic-import contract in
 * `loadSolver()` (engine.ts).  The selector imports this module by
 * file path and looks for `createPlanegcsAdapter` — keep the name
 * frozen.
 */
export function createPlanegcsAdapter(
  urlOrOptions: string | PlanegcsAdapterOptions,
): SolverPorter {
  const opts: PlanegcsAdapterOptions =
    typeof urlOrOptions === 'string'
      ? { wasmUrl: urlOrOptions }
      : urlOrOptions;

  if (!opts.wasmUrl || typeof opts.wasmUrl !== 'string') {
    throw new Error(
      'PlanegcsAdapter: wasmUrl is required and must be a string (got ' +
        typeof opts.wasmUrl +
        ').',
    );
  }

  return new PlanegcsAdapter(opts);
}

/**
 * Real-WASM SolverPorter — S52 D1 scaffold; every call delegates to
 * `MockSolver` (or the test-injected underlying) until S52 D2 wires
 * the planegcs WASM module.  The shape, error semantics, and return
 * types are FROZEN here so the swap is internal-only.
 */
export class PlanegcsAdapter implements SolverPorter {
  readonly kind = 'planegcs' as const;

  /** Frozen at construction so callers can debug-inspect it. */
  readonly wasmUrl: string;

  /** Internal solver — mock today, real planegcs at S52 D2. */
  private readonly underlying: SolverPorter;

  constructor(opts: PlanegcsAdapterOptions) {
    this.wasmUrl = opts.wasmUrl;
    this.underlying = opts.underlying ?? new MockSolver();
  }

  async solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult> {
    return this.underlying.solve(set, hints);
  }

  async diagnose(set: ConstraintSet): Promise<DiagnoseResult> {
    return this.underlying.diagnose(set);
  }
}
