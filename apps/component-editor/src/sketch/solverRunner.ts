// solverRunner — wires the sketch + constraint stores to a SolverPorter (S52 D2).
//
// Owns the run-debounce-apply loop:
//   • subscribes to both stores
//   • debounces re-solves so a burst of edits collapses into one call
//   • emits `pryzm.family.solver.solve` and (downstream) preview
//     update spans via `app/otel.ts`
//   • applies the new variable values back to the sketch by calling
//     a caller-supplied `applyValues` callback (the SketchCanvas
//     wires this to `sketchDocStore.movePoint` once that lands; for
//     S52 we accept any sink so the runner is unit-testable)
//
// LAYER — L2 chrome-side. Pure logic — no THREE, no DOM. The only
// timer it uses is `setTimeout` (microtask + tiny delay) so it works
// in jsdom and Node without rAF.

import type { SolveResult, SolverPorter } from '@pryzm/constraint-solver';
import { withSpanAsync } from '../app/otel.js';
import {
  buildConstraintSet,
  constraintIsValidAgainst,
} from './buildConstraintSet.js';
import type { ConstraintStore } from '../stores/constraintStore.js';
import type { SketchDocStore } from '../stores/sketchDocStore.js';

export interface SolverStats {
  /** Most recent SolveResult. `null` until the first solve completes. */
  readonly lastResult: SolveResult | null;
  /** Total number of solves dispatched since runner construction. */
  readonly totalSolves: number;
  /** Number of solves currently scheduled (0 or 1; debounce keeps it bounded). */
  readonly pendingSolves: number;
}

export type StatsSubscriber = (stats: SolverStats) => void;

export interface SolverRunner {
  /** Trigger an immediate solve (bypasses the debounce). */
  flush(): Promise<void>;
  /** Stop subscriptions and reject any pending flushes. */
  dispose(): void;
  /** Read the current snapshot of stats. */
  stats(): SolverStats;
  /** Subscribe to stats updates (called after each solve completes). */
  subscribe(fn: StatsSubscriber): () => void;
}

export interface SolverRunnerOptions {
  readonly docStore: SketchDocStore;
  readonly constraintStore: ConstraintStore;
  readonly solver: SolverPorter;
  /** Sink that receives `(pointId, x, z)` triples to apply to the document.
   *  No-op safe — the SketchCanvas wires this to a real mover later. */
  readonly applyValues: (updates: ReadonlyArray<{ pointId: string; x: number; z: number }>) => void;
  /** Debounce window in ms. Defaults to 8ms (≈ half a 16ms frame). */
  readonly debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 8;

export function createSolverRunner(opts: SolverRunnerOptions): SolverRunner {
  const debounce = Math.max(0, opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  let stats: SolverStats = Object.freeze({ lastResult: null, totalSolves: 0, pendingSolves: 0 });
  const statsSubs = new Set<StatsSubscriber>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let inFlight = false;

  function publish(next: SolverStats): void {
    stats = Object.freeze(next);
    for (const fn of statsSubs) fn(stats);
  }

  async function runSolve(): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      schedule();
      return;
    }
    inFlight = true;
    publish({ ...stats, pendingSolves: 0 });
    const docSnap = opts.docStore.get();
    const constraintSnap = opts.constraintStore.get();
    const filtered = constraintSnap.constraints.filter((c) =>
      constraintIsValidAgainst(c, docSnap),
    );
    if (filtered.length === 0) {
      publish({ ...stats, lastResult: null, totalSolves: stats.totalSolves + 1 });
      inFlight = false;
      return;
    }
    const set = buildConstraintSet(
      docSnap,
      Object.freeze({
        ...constraintSnap,
        constraints: Object.freeze(filtered),
      }),
    );
    try {
      const result = await withSpanAsync(
        'pryzm.family.solver.solve',
        {
          'pryzm.family.solver.constraints': filtered.length,
          'pryzm.family.solver.points': Object.keys(docSnap.pointById).length,
        },
        () => opts.solver.solve(set),
      );
      if (result.ok) {
        const updates = applyResultToSketch(result, docSnap);
        if (updates.length > 0) opts.applyValues(updates);
      }
      publish({
        lastResult: result,
        totalSolves: stats.totalSolves + 1,
        pendingSolves: stats.pendingSolves,
      });
    } finally {
      inFlight = false;
    }
  }

  function schedule(): void {
    if (disposed) return;
    if (timer !== null) return;
    publish({ ...stats, pendingSolves: 1 });
    timer = setTimeout(() => {
      timer = null;
      void runSolve();
    }, debounce);
  }

  const unsubDoc = opts.docStore.subscribe(() => schedule());
  const unsubConstraints = opts.constraintStore.subscribe(() => schedule());

  return {
    async flush(): Promise<void> {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await runSolve();
    },
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      unsubDoc();
      unsubConstraints();
      statsSubs.clear();
    },
    stats() {
      return stats;
    },
    subscribe(fn) {
      statsSubs.add(fn);
      return () => {
        statsSubs.delete(fn);
      };
    },
  };
}

function applyResultToSketch(
  result: Extract<SolveResult, { ok: true }>,
  doc: ReturnType<SketchDocStore['get']>,
): Array<{ pointId: string; x: number; z: number }> {
  const out: Array<{ pointId: string; x: number; z: number }> = [];
  for (const point of Object.values(doc.pointById)) {
    const xVar = `${point.id}-x`;
    const yVar = `${point.id}-y`;
    const nx = result.values[xVar];
    const nz = result.values[yVar];
    if (
      typeof nx === 'number' &&
      typeof nz === 'number' &&
      Number.isFinite(nx) &&
      Number.isFinite(nz) &&
      (Math.abs(nx - point.x) > 1e-6 || Math.abs(nz - point.z) > 1e-6)
    ) {
      out.push({ pointId: point.id, x: nx, z: nz });
    }
  }
  return out;
}
