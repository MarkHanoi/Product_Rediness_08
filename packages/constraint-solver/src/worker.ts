// @pryzm/constraint-solver — Web Worker entry (S52 §4.1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.1
//     (lines 1211-1232) — solver runs in a dedicated Web Worker so
//     the UI thread stays free.
//
// SHAPE — `createWorkerHandler({solver})` returns a function that
// the actual Web Worker entry binds to `self.addEventListener('message', ...)`.
// Splitting the handler out from the `self.*` attachment lets the
// engine tests invoke the message contract synchronously.
//
// The actual Web Worker shim at S53 D1 will look like:
//
//   import { createWorkerHandler, MockSolver } from './engine.js';
//   const handler = createWorkerHandler({ solver: new MockSolver() });
//   self.addEventListener('message', e => handler(e.data, m => self.postMessage(m)));
//
// PURE — zero `self.*` references at module load so the bundle
// stays bake-worker safe AND environments without a `self` global
// (Node ESM tests) can still import this module.

import type { ConstraintSet, SolveHints } from './types.js';
import type { SolverPorter } from './engine.js';

/** Inbound message shape — the sketcher posts `{id, kind, payload}`
 *  per spec lines 1218-1230. */
export type WorkerInMessage =
  | {
      readonly id: string;
      readonly kind: 'solve';
      readonly payload: { readonly set: ConstraintSet; readonly hints?: SolveHints };
    }
  | {
      readonly id: string;
      readonly kind: 'diagnose';
      readonly payload: { readonly set: ConstraintSet };
    };

/** Outbound message shape — the worker posts `{id, result}` or
 *  `{id, error}`. */
export type WorkerOutMessage =
  | {
      readonly id: string;
      readonly result: unknown;
    }
  | {
      readonly id: string;
      readonly error: string;
    };

/** Function signature of the per-message handler. */
export type WorkerHandlerFn = (
  msg: WorkerInMessage,
  post: (out: WorkerOutMessage) => void,
) => Promise<void>;

/** Build a per-message handler. Tests inject a mock solver + a
 *  collecting `post` callback; the live worker entry uses
 *  `MockSolver` (until the planegcs adapter ships) + `self.postMessage`. */
export function createWorkerHandler(deps: { readonly solver: SolverPorter }): WorkerHandlerFn {
  return async function handle(msg, post) {
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string') {
      // Loud about malformed envelopes — but always reply so the
      // sketcher's pending-promise map doesn't leak.
      post({ id: (msg as { id?: string })?.id ?? 'unknown', error: 'Invalid worker message envelope.' });
      return;
    }
    try {
      if (msg.kind === 'solve') {
        const result = await deps.solver.solve(msg.payload.set, msg.payload.hints);
        post({ id: msg.id, result });
      } else if (msg.kind === 'diagnose') {
        const result = await deps.solver.diagnose(msg.payload.set);
        post({ id: msg.id, result });
      } else {
        post({ id: (msg as unknown as { id: string }).id, error: `Unknown worker message kind: ${(msg as unknown as { kind: string }).kind}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ id: msg.id, error: message });
    }
  };
}
