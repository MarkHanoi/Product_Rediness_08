// PlanegcsAdapter — SCAFFOLD for a future planegcs WASM binding (C74 §3.4 header).
//
// owner: @pryzm/constraint-solver (Phase 7 adapter-truthfulness pass)
// date: 2026-08-12
// retiring assertion: `__tests__/PlanegcsAdapter.test.ts` — the test named
//   "scaffold retirement guard" asserts `new PlanegcsAdapter(...).kind === 'mock'`.
//   It FAILS the moment a real engine executes behind this adapter, which forces
//   this header (and the scaffold posture) to be retired in the same change.
// milestone: this header used to say the binding "lands at S52 D2" while
//   engine.ts said S53 D1 in four places — two milestones, both of which passed
//   without the binding. That disagreement is resolved here to ONE stated
//   milestone: **C74 §4.2(c) authorisation** — the binding may be built only
//   when some constraint family is shown, in writing, to need SOLVING (a
//   simultaneous system with no closed form). Until that record exists, the
//   binding is UNAUTHORISED (C74 §4.5) and this adapter remains an honest,
//   mock-delegating scaffold.
//
// TRUTHFULNESS (C74 §3.1/§3.2, 2026-08-12) — this class previously declared
//   `readonly kind = 'planegcs'` while delegating 100% of its work to
//   `MockSolver`. That was the defect C74 was written for. Now:
//   • `kind` reports what ACTUALLY executes — derived from the underlying
//     solver, `'mock'` for every construction until a real binding lands;
//   • `intendedEngine = 'planegcs'` is a SEPARATE field carrying what the
//     scaffold is FOR, so intent can never be read as capability;
//   • the first call on a mock-backed instance emits a one-time console
//     warning — the §3.2 non-suppressible boundary signal.
//
// SEAM DELETED (C74 §3.5, 2026-08-14, CO-03) — the options interface used to
//   carry `underlying?: SolverPorter`, a test-only injection field whose own
//   docstring said "Production callers MUST NOT pass this". Production could
//   never pass it, and the only tests that did were exercising a
//   configuration production never runs — the "31 of 33 passing tests test
//   the mock" shape from C74 §0, flagged as M-C ×2 on check-no-hidden-mock's
//   ledger. A field that neither production nor tests may honestly use has
//   no honest user, so the SEAM IS GONE: the constructor builds its
//   `MockSolver` unconditionally, and the suite proves delegation by spying
//   on that real construction (`vi.spyOn(MockSolver.prototype, …)`) instead
//   of substituting a double. When a real binding is authorised (C74
//   §4.2(c)) it replaces the construction in the constructor — it does not
//   get an injection seam back.
//
// LAYERING — L4-equivalent (constraint solver lives outside the
//   layered stack but obeys the L4-pure rule: no THREE, no DOM, no
//   imports above L1).

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
   * `file://` URL produced by `pathToFileURL()`.  Held for the
   * unauthorised future binding; NOTHING is fetched from it today.
   */
  readonly wasmUrl: string;

  // There is deliberately NO `underlying?:` injection field here — see the
  // SEAM DELETED note in the file header (C74 §3.5, 2026-08-14).
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
 * Scaffold SolverPorter for the (unauthorised, see header) planegcs
 * binding.  Every call delegates to the `MockSolver` the constructor
 * builds — there is no injection seam (SEAM DELETED, header) — and,
 * unlike the pre-2026-08-12 version, its externally visible identity
 * SAYS SO: `kind` is the underlying's actual identity ('mock' in
 * every construction), and the engine this scaffold is FOR lives in
 * the separate `intendedEngine` field.  No consumer branching on
 * `kind` can read mock output as planegcs output.
 */
export class PlanegcsAdapter implements SolverPorter {
  /**
   * The identity of what ACTUALLY executes (C74 §3.1) — read off the
   * underlying solver, never asserted independently of it.  `'mock'`
   * for every construction today; never `'planegcs'` until a real
   * planegcs engine performs the work.
   */
  readonly kind: string;

  /**
   * What this scaffold is FOR — a statement of intent, deliberately
   * separated from `kind` so intent can never be mistaken for
   * capability (C74 §3.2).
   */
  readonly intendedEngine = 'planegcs' as const;

  /** Frozen at construction so callers can debug-inspect it. */
  readonly wasmUrl: string;

  /** Internal solver — a mock stand-in until a binding is authorised. */
  private readonly underlying: SolverPorter;

  /** One-time §3.2 boundary signal — first call on a mock-backed instance. */
  private warnedStandIn = false;

  constructor(opts: PlanegcsAdapterOptions) {
    this.wasmUrl = opts.wasmUrl;
    // Unconditional — the `opts.underlying ??` injection seam was deleted
    // (C74 §3.5, header). An authorised real binding replaces THIS line.
    this.underlying = new MockSolver();
    this.kind = this.underlying.kind ?? 'mock';
  }

  /**
   * C74 §3.2 — a stand-in announces itself at its own boundary with a
   * non-suppressible signal on the first call.  A file-header comment
   * was accurate and ignored for months; this is not that.
   */
  private announceStandIn(): void {
    if (this.warnedStandIn || this.kind !== 'mock') return;
    this.warnedStandIn = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[constraint-solver] PlanegcsAdapter is a SCAFFOLD: kind='mock' — every call ` +
        `is served by MockSolver, not by '${this.intendedEngine}'. The WASM binding is ` +
        `unauthorised until C74 §4.2(c) is answered for a named constraint family.`,
    );
  }

  async solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult> {
    this.announceStandIn();
    return this.underlying.solve(set, hints);
  }

  async diagnose(set: ConstraintSet): Promise<DiagnoseResult> {
    this.announceStandIn();
    return this.underlying.diagnose(set);
  }
}
