// Process-singleton accessor for the FrameScheduler.
//
// Extracted from `index.ts` so that sibling modules (`progressScheduler.ts`)
// can reach the shared scheduler WITHOUT importing the package barrel.  A
// barrel import from inside the package is a module-load cycle: the barrel is
// still initialising when the sibling reads from it, so the binding resolves to
// `undefined`.  See the repo's "SCC: no barrel access at module load" note.
//
// `index.ts` re-exports both symbols, so the public API is unchanged.

import { FrameScheduler } from './FrameScheduler.js';

let _instance: FrameScheduler | null = null;

/** Returns the process-wide shared `FrameScheduler`.  Lazy-constructed on
 *  first call.  Canonical entry point for D.7.2–D.7.10 consumer migrations. */
export function getFrameScheduler(): FrameScheduler {
  if (_instance === null) {
    _instance = new FrameScheduler();
  }
  return _instance;
}

/** Test-only — drops the cached singleton so the next `getFrameScheduler()`
 *  call rebuilds with a fresh `FrameScheduler`.  Vitest suites that touch
 *  the scheduler MUST call this in `afterEach` to keep tests independent.
 *  Production code never calls this. */
export function _resetFrameSchedulerForTest(): void {
  _instance = null;
}
