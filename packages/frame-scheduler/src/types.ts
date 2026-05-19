// L5 contract types — frozen at S02 (ADR-003), extended at S03 with the
// rAF pump's tick-listener registration shape (`TickListenerOptions`).
//
// Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T7` (line 299) and
// §S03-T1 (line 351) the scheduler exposes TWO orthogonal enums:
//
//   1. `Priority`     — queue-class.  WHEN the frame happens (this rAF,
//                       idle rAF, background).
//   2. `TickPriority` — render-phase ordering.  WHERE inside one rAF a
//                       callback runs.  Copied verbatim from PRYZM-1's
//                       `src/core/rendering/UnifiedFrameLoop.ts:95-98`.
//
// Both enums are documented in ADR-003 §"priority vs TickPriority".

/**
 * Queue-class priority — strictly ordered, lowest index drains first.
 *
 * Three values per `§S02-T7` line 299:
 *
 * - `interaction` — pointer/keyboard input that must paint within 16 ms.
 * - `idle`        — post-effects, BVH refit; eligible only inside the
 *                   30-frame idle budget (ADR-006).
 * - `background`  — bake worker progress, telemetry flush; lowest priority,
 *                   yields to all of the above.
 */
export type Priority = 'interaction' | 'idle' | 'background';

export const PRIORITIES = ['interaction', 'idle', 'background'] as const;

const PRIORITY_SET: ReadonlySet<string> = new Set(PRIORITIES);

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && PRIORITY_SET.has(value);
}

/**
 * Render-phase ordering INSIDE a single rAF tick.  Copied verbatim from
 * `src/core/rendering/UnifiedFrameLoop.ts:95-98` (PRYZM 1).
 *
 * Consumed by `FrameScheduler.addTickListener` (S03-T1) — listeners run in
 * this exact order on every tick.  Orthogonal to the queue-class `Priority`
 * above.
 */
export type TickPriority = 'pre-render' | 'render' | 'post-render' | 'overlay';

export const TICK_PRIORITIES = ['pre-render', 'render', 'post-render', 'overlay'] as const;

const TICK_PRIORITY_SET: ReadonlySet<string> = new Set(TICK_PRIORITIES);

export function isTickPriority(value: unknown): value is TickPriority {
  return typeof value === 'string' && TICK_PRIORITY_SET.has(value);
}

export interface FrameRequest {
  /** ULID — sortable insertion id, used as tie-break inside a priority lane. */
  readonly id: string;
  /** Human-readable reason, e.g. `'wall.create:committed'`. */
  readonly reason: string;
  readonly priority: Priority;
  /** Wall-clock ms at insertion (for idle-budget bookkeeping). */
  readonly enqueuedAt: number;
}

export interface DrainResult {
  readonly drained: readonly FrameRequest[];
  readonly remaining: number;
}

/**
 * Per-tick listener — invoked inside `FrameScheduler._tick(now)` in
 * `TickPriority` order on every rAF that the scheduler pumps.
 *
 * The signature mirrors PRYZM 1's `UnifiedFrameLoop.addTickListener`
 * (`src/core/rendering/UnifiedFrameLoop.ts:130-230`) so subsystems can be
 * ported across with minimal change.
 */
export type TickListenerCallback = (now: number, deltaMs: number) => void;

export interface TickListener {
  readonly id: string;
  readonly priority: TickPriority;
  readonly callback: TickListenerCallback;
}

/** Returned by `addTickListener` — call it to unregister. */
export type TickListenerDisposer = () => void;

/**
 * §F.3 — Shared per-rAF budget token for geometry drain loops.
 *
 * A `BudgetToken` tracks how many milliseconds of a single rAF frame's
 * time-slice have already been spent by builders that share the same budget
 * key (e.g. `'batch-drain'`).  At the top of each `FrameScheduler._tick()`,
 * every live token's `consumedMs` is reset to 0 so the budget renews for
 * each frame.
 *
 * Usage (in a drain loop):
 * ```typescript
 * const budget = getFrameScheduler().getBatchBudget('batch-drain');
 * const t0 = performance.now();
 * // Check upfront — another builder may have already exhausted the budget
 * // this frame.
 * if (budget && !budget.hasRemaining(t0)) {
 *     this._reschedule();
 *     return;
 * }
 * // … do work …
 * const elapsed = performance.now() - t0;
 * budget?.consume(elapsed);
 * ```
 */
export interface BudgetToken {
    /** Maximum ms allocated to all drain callbacks sharing this token per rAF frame. */
    readonly budgetMs: number;
    /**
     * Returns `true` when the cumulative `consumedMs` from all drain callbacks
     * this frame PLUS the ms elapsed since `startMs` is still under `budgetMs`.
     *
     * @param startMs `performance.now()` captured at the top of the drain call.
     */
    hasRemaining(startMs: number): boolean;
    /**
     * Record that `elapsedMs` milliseconds were spent by this drain callback.
     * Called once per drain invocation, after the work loop completes.
     */
    consume(elapsedMs: number): void;
}
