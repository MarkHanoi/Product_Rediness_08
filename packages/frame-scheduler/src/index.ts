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

// §FRAME-PROFILER — per-subsystem frame-cost accumulator (founder perf request).
// Zero cost unless `globalThis.__pryzmFrameProfile === true`; then logs one
// summary line per second. Console filter string: `[FrameProfiler]`.
export { FrameProfiler } from './FrameProfiler.js';

// §PRYZM-PERF — gesture-scoped counter/timer registry (founder perf request,
// 2026-08-19). The SIBLING of §FRAME-PROFILER, deliberately in the same package
// and with the same flag shape rather than as a rival convention (C84 EI-8/EI-9):
// FrameProfiler answers "where does a FRAME go", PerfCounters answers "what did
// that GESTURE cost, and how many times did we do the expensive thing".
// Zero cost unless `globalThis.__pryzmPerf === true`. Read via
// `window.pryzmPerf.report()`.
export {
  isPerfOn,
  armPerf,
  disarmPerf,
  perfArmedAtMs,
  bumpPerf,
  addPerfTime,
  notePerf,
  timePerf,
  timePerfAsync,
  perfSnapshot,
  resetPerfCounters,
  PERF_KEYS,
  _resetPerfForTest,
} from './PerfCounters.js';
export type { PerfTimer, PerfNote, PerfSnapshot } from './PerfCounters.js';

export type { RafAdapter, RafCallback } from './RafAdapter.js';
export { GlobalRafAdapter, FakeRafAdapter } from './RafAdapter.js';

export { IdleContinuation, IDLE_CONTINUATION_FRAMES } from './IdleContinuation.js';

export {
  WorkerPool,
  WorkerPoolExhaustedError,
  WORKER_POOL_CAP,
} from './WorkerPool.js';

// ─────────────────────────────────────────────────────────────────────────────
// §BACKGROUND-TAB-KEEPALIVE — background-resilient work pump.
//
// `BackgroundHeartbeat` is the SINGLE additional work-pump (owned by this
// module, per P3) that keeps the WORK queue advancing when `document.hidden`
// pauses rAF.  `deferWork()` is the drop-in `setTimeout` replacement for
// generation/AI-batch deferred passes so they don't crawl under the 1 s
// background-tab clamp.  Rendering is NOT pumped in the background.
export {
  BackgroundHeartbeat,
  getBackgroundHeartbeat,
  _resetBackgroundHeartbeatForTest,
  _setBackgroundHeartbeatForTest,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
} from './BackgroundHeartbeat.js';
export type {
  HeartbeatTick,
  HeartbeatPort,
  ChannelFactory,
  HeartbeatTimers,
  VisibilitySource,
  BackgroundHeartbeatOptions,
} from './BackgroundHeartbeat.js';

export { deferWork } from './deferWork.js';
export type { DeferWorkCanceller } from './deferWork.js';

// ─────────────────────────────────────────────────────────────────────────────
// §PROGRESS-SCHEDULER — the visibility-INDEPENDENT work driver.
//
// The frame bus is for work whose output is a frame.  Work that must complete
// regardless of whether anyone is watching — loading, hydration, persistence,
// sync, solving — yields through here instead.  P3 is intact: this is not a
// second rAF (the single rAF call site remains `RafAdapter.ts`); when the tab is
// visible these helpers delegate to the frame bus, and when it is hidden they
// yield on an unclamped `MessageChannel` macrotask.  See `progressScheduler.ts`
// for the full driver-choice rationale.
export {
  yieldForProgress,
  scheduleProgress,
  postProgressMacrotask,
  isHiddenForProgress,
  _setProgressChannelFactoryForTest,
} from './progressScheduler.js';
export type {
  ProgressCanceller,
  ProgressPort,
  ProgressChannelFactory,
} from './progressScheduler.js';

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
//
// The implementation lives in `./singleton.js` (not inline here) so sibling
// modules such as `progressScheduler.ts` can reach the shared scheduler without
// importing this barrel — an intra-package barrel import is a module-load cycle
// that resolves to `undefined`.  The public API is unchanged.
export { getFrameScheduler, _resetFrameSchedulerForTest } from './singleton.js';
