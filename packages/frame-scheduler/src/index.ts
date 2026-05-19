// @pryzm/frame-scheduler — public surface.
//
// L5 of the architecture stack.  Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`:
//
//   • S02-T7 (line 299) — Priority enum + FrameRequest + dirty-flag set
//                         + drainSync priority queue.
//   • S02-T8 (line 300) — `pryzm.frame.tick` OTel span on every drain.
//   • S03-T1 (line 351) — real rAF pump (`start`/`stop`/`cancelFrame`),
//                         `addTickListener` registry in TickPriority order.
//   • S03-T2 (line 350) — `IdleContinuation` 30-frame budget (ADR-006);
//                         `pryzm.frame.idle-continuation` OTel event on
//                         transitions.

export type {
  Priority,
  TickPriority,
  BudgetToken,
  FrameRequest,
  DrainResult,
  TickListener,
  TickListenerCallback,
  TickListenerDisposer,
} from './types.js';
export { PRIORITIES, TICK_PRIORITIES, isPriority, isTickPriority } from './types.js';

export { FrameScheduler } from './FrameScheduler.js';
import { FrameScheduler } from './FrameScheduler.js';

export type { RafAdapter, RafCallback } from './RafAdapter.js';
export { GlobalRafAdapter, FakeRafAdapter } from './RafAdapter.js';

export { IdleContinuation, IDLE_CONTINUATION_FRAMES } from './IdleContinuation.js';

export {
  WorkerPool,
  WorkerPoolExhaustedError,
  WORKER_POOL_CAP,
} from './WorkerPool.js';

// ─────────────────────────────────────────────────────────────────────────────
// D.7.1 — Process-singleton accessor.
//
// `getFrameScheduler()` returns the **single shared** `FrameScheduler`
// instance for the host process.  This factory is the canonical entry
// point for code outside `packages/frame-scheduler/` to obtain the
// scheduler — it replaces the legacy
// `import { unifiedFrameLoop } from '.../UnifiedFrameLoop'` pattern that
// 9 PRYZM 1 importers still use today.
//
// **Consumer migrations gated on this export landing** (per
// `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.D.7):
//
//   • D.7.2  — `src/core/views/ViewDependencyTracker.ts`
//   • D.7.3  — `src/core/views/SplitViewManager.ts`
//   • D.7.4  — `src/core/views/PlanViewManager.ts`
//   • D.7.5  — `src/core/views/PlanViewInteraction.ts`
//   • D.7.6  — `src/core/rendering/SSGIService.ts`
//   • D.7.7  — `src/core/rendering/FrameCoordinator.ts`
//   • D.7.8  — `src/core/rendering/EnhancedBloomService.ts`
//   • D.7.9  — `src/engine/subsystems/initScene.ts` + `initPersistence.ts`
//   • D.7.10 — DELETE `src/core/rendering/UnifiedFrameLoop.ts` (424 LOC)
//
// Migration recipe per consumer:
//
//   // BEFORE
//   import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop';
//   unifiedFrameLoop.subscribe(callback);
//
//   // AFTER
//   import { getFrameScheduler } from '@pryzm/frame-scheduler';
//   getFrameScheduler().addTickListener(callback);
//
// Lazy initialisation keeps the module side-effect-free at import time —
// the singleton is created on first access so test code can call
// `_resetFrameSchedulerForTest()` between runs without leaking the rAF
// pump across vitest test boundaries.
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
