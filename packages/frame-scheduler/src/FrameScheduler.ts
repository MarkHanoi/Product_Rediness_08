// FrameScheduler — S03 spec: real rAF wiring + idle-continuation 30-frame
// budget (ADR-006).
//
// Source of truth: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
//   • S02-T7 (line 299) — priority queue (`requestFrame` / `drainSync`).
//   • S02-T8 (line 300) — dirty-flag set + `pryzm.frame.tick` OTel span.
//   • S03-T1 (line 351) — actual rAF pump (`start`/`stop`/`cancelFrame`),
//                         `addTickListener` registry in `TickPriority` order.
//   • S03-T2 (line 350) — `IdleContinuation` 30-frame budget; OTel
//                         `pryzm.frame.idle-continuation` event on transitions.
//
// The implementation pattern follows PRYZM 1's
// `src/core/rendering/UnifiedFrameLoop._tick` (lines 320-390) but for a
// single render path (no OBC/PASCAL split) and with the idle gate the
// legacy loop never had — that is the central S03 win ("0 fps idle").
//
// All rAF calls go through `RafAdapter`.  The single allowed call site for
// `globalThis.requestAnimationFrame` lives in `RafAdapter.ts`; the lint
// rule `pryzm/no-raf` and `tools/scripts/check-no-raf-in-pryzm2.mjs`
// enforce this invariant repo-wide.

import { ulid } from 'ulid';
import {
  PRIORITIES,
  TICK_PRIORITIES,
  type BudgetToken,
  type FrameRequest,
  type Priority,
  type DrainResult,
  type TickListener,
  type TickListenerCallback,
  type TickListenerDisposer,
  type TickPriority,
} from './types.js';
import { withSpan, emitIdleContinuationEvent } from './otel.js';
import {
  GlobalRafAdapter,
  type RafAdapter,
} from './RafAdapter.js';
import { IdleContinuation, IDLE_CONTINUATION_FRAMES } from './IdleContinuation.js';
import {
  getBackgroundHeartbeat,
  type BackgroundHeartbeat,
} from './BackgroundHeartbeat.js';
import { FrameProfiler } from './FrameProfiler.js';

/**
 * High-resolution monotonic clock for the frame profiler's sub-measurements.
 * Falls back to Date.now() in hosts without `performance` (headless tests).
 */
const _perfNow = (): number => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
};

const PRIORITY_RANK: Record<Priority, number> = {
  interaction: 0,
  idle: 1,
  background: 2,
};

/** §F.3 — Internal mutable state for a shared per-rAF budget token. */
interface _BudgetEntry {
  budgetMs: number;
  consumedMs: number;
}

export class FrameScheduler {
  private readonly dirtyFlags = new Set<string>();
  private readonly pending: FrameRequest[] = [];
  /** Monotonic counter — used as tie-break when two requests share a ULID-ms. */
  private seq = 0;
  /** Allows tests to inject deterministic time without monkey-patching `Date`. */
  private readonly clock: () => number;

  // ── S03 rAF pump state ────────────────────────────────────────────────────
  private adapter: RafAdapter | null = null;
  private rafHandle: number | null = null;
  private running = false;
  private lastTickTime = 0;

  // ── §BACKGROUND-TAB-KEEPALIVE — background work-pump state ────────────────
  // When `document.hidden`, browsers PAUSE rAF (the adapter never fires) so the
  // WORK drain would stall.  In that window we pump `tick()` off the
  // BackgroundHeartbeat (an unthrottled MessageChannel pulse) instead.  The
  // heartbeat NEVER drives a render — rendering stays paused in the background;
  // it only keeps the WORK queue (batch drain, deferred passes) advancing.
  // Foreground is byte-identical: when visible we always take the rAF path.
  //
  // Gate: default-ON; set `globalThis.__pryzmDisableBackgroundKeepalive = true`
  // to fall back to pure-rAF (reversible kill-switch, no behavioural change
  // when the tab is visible either way).
  private heartbeat: BackgroundHeartbeat | null = null;
  /** Disposer for the active heartbeat subscription (null when not subscribed). */
  private heartbeatUnsub: (() => void) | null = null;
  private readonly tickListeners = new Map<string, TickListener>();

  /**
   * §PERF-TICK-ORDER-IS-CACHED — the tick-listener list, ALREADY flattened into
   * `TICK_PRIORITIES` order, or `null` when it must be rebuilt.
   *
   * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
   * `_tick()` used to do, on EVERY frame:
   *     const listenersThisTick = [...this.tickListeners.values()];   // 1 alloc
   *     for (const priority of TICK_PRIORITIES)                        // P = 4
   *       for (const listener of listenersThisTick)                    // × N
   *         if (listener.priority !== priority) continue;              // 3N skips
   * i.e. one N-element array allocated per frame, plus P×N iterations to perform
   * N calls. At 60 Hz with N listeners that is 60 allocations/s and 4N loop steps
   * per frame, three quarters of which exist only to be skipped.
   *
   * ⭐ THE ORDER IS A PURE FUNCTION OF THE LISTENER SET, and the listener set
   * changes on register/unregister — a few times per session — not per frame. So
   * it is computed on mutation and reused, which is the whole fix.
   *
   * ── ⛔ SNAPSHOT SEMANTICS ARE PRESERVED EXACTLY, AND THEY ARE LOAD-BEARING ──
   * The old code snapshotted into a local before iterating, so a listener that
   * mutates the set DURING a tick could not perturb that tick:
   *   • a listener ADDED mid-tick does NOT run until the next frame;
   *   • a listener REMOVED mid-tick STILL runs on this frame.
   * Both survive because invalidation only ever NULLS this field and a rebuild
   * only ever assigns a BRAND-NEW array. `_tick()` holds its own reference to the
   * array it started with, so an in-flight iteration is never observed to change.
   * ⛔ NEVER mutate a cached array in place (push/splice/sort) — that is the one
   * change that would silently break the contract above.
   */
  private _orderedTickListeners: readonly TickListener[] | null = null;

  /**
   * Invalidate {@link _orderedTickListeners}. Call after EVERY mutation of
   * `tickListeners` — add, delete, clear. Cheap: one field write.
   */
  private _invalidateTickOrder(): void {
    this._orderedTickListeners = null;
  }

  /**
   * The listener list in `TICK_PRIORITIES` order, built at most once per
   * mutation. Within a priority, MAP INSERTION ORDER is preserved — identical to
   * the old nested-loop traversal, which iterated `tickListeners.values()` (an
   * insertion-ordered Map) inside the priority loop.
   *
   * A listener whose `priority` is not a member of `TICK_PRIORITIES` is omitted
   * and therefore never runs — also identical to the old behaviour, where no
   * iteration of the outer loop could match it.
   */
  private _orderedTickListenersOrBuild(): readonly TickListener[] {
    const cached = this._orderedTickListeners;
    if (cached !== null) return cached;
    const built: TickListener[] = [];
    for (const priority of TICK_PRIORITIES) {
      for (const listener of this.tickListeners.values()) {
        if (listener.priority === priority) built.push(listener);
      }
    }
    this._orderedTickListeners = built;
    return built;
  }
  private readonly idle = new IdleContinuation();
  /** True after we've fired the `pryzm.frame.idle-continuation` "enter" event
   *  for the current idle window; reset on motion or `start()`. */
  private idleEntryEmitted = false;
  /** Cached count for OTel attribute `pryzm.frame.tick.tick_count`. */
  private tickCount = 0;

  /**
   * §FRAME-PROFILER — per-subsystem frame-cost accumulator. Zero cost unless
   * `globalThis.__pryzmFrameProfile === true`. Console filter: `[FrameProfiler]`.
   */
  private readonly profiler = new FrameProfiler();

  /**
   * Monotonic counter used by `scheduleOnce()` to mint unique listener IDs
   * (`once:<reason>:<seq>`).  Distinct from `seq` (which numbers
   * `requestFrame()` records) so the two namespaces never collide.
   */
  private onceSeq = 0;

  // ── S17 motion gate state (see beginMotion / endMotion below). ──
  private motionActive = false;
  private readonly motionListeners = new Map<string, () => void>();

  // ── §F.3 — Shared per-rAF budget tokens for drain loops. ──────────────────
  private readonly _batchBudgets = new Map<string, _BudgetEntry>();

  /**
   * Optional positional `clock` keeps the S02 test signature
   * (`new FrameScheduler(() => now)`) ergonomic.
   */
  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  // ---------------------------------------------------------------- dirty set
  markDirty(flag: string): void {
    this.dirtyFlags.add(flag);
    // Motion resumed — reset the idle continuation budget and wake the loop
    // if the previous idle window had stopped it.
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.wakeIfStopped();
  }

  clearDirty(flag: string): void {
    this.dirtyFlags.delete(flag);
  }

  isDirty(flag?: string): boolean {
    return flag === undefined ? this.dirtyFlags.size > 0 : this.dirtyFlags.has(flag);
  }

  /** Snapshot of the dirty set — sorted for stable test output. */
  dirtyFlagsSnapshot(): readonly string[] {
    return [...this.dirtyFlags].sort();
  }

  // ---------------------------------------------------------------- requests
  requestFrame(reason: string, priority: Priority): string {
    const req: FrameRequest = {
      id: ulid() + ':' + (++this.seq).toString(36),
      reason,
      priority,
      enqueuedAt: this.clock(),
    };
    // Binary-search insertion would be nicer, but in practice the queue is
    // tiny per frame (< ~50 entries).  Linear insertion is fine and keeps
    // the code obvious.
    const rank = PRIORITY_RANK[priority];
    let i = this.pending.length;
    while (i > 0 && PRIORITY_RANK[this.pending[i - 1]!.priority] > rank) {
      i--;
    }
    this.pending.splice(i, 0, req);
    // Frame requested — reset idle budget and wake the loop if needed.
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.wakeIfStopped();
    return req.id;
  }

  /**
   * Cancel a pending frame request by token (returned from `requestFrame`).
   * Returns `true` if the request was found and removed, `false` otherwise.
   * Per spec §S03-T1 line 351 — the rAF-pump replacement for
   * `cancelAnimationFrame`.
   */
  cancelFrame(token: string): boolean {
    const idx = this.pending.findIndex((r) => r.id === token);
    if (idx === -1) return false;
    this.pending.splice(idx, 1);
    return true;
  }

  /** Read-only snapshot — for the renderer / tests. */
  getPending(): readonly FrameRequest[] {
    return this.pending;
  }

  /** Counts per priority — handy for the idle-CPU bench. */
  pendingByPriority(): Readonly<Record<Priority, number>> {
    const counts: Record<Priority, number> = {
      interaction: 0,
      idle: 0,
      background: 0,
    };
    for (const req of this.pending) counts[req.priority]++;
    return counts;
  }

  // ---------------------------------------------------------------- drain
  /**
   * Drain the queue synchronously.  At S02 this was the ONLY way frames
   * came out of the scheduler; at S03 the rAF pump (`_tick`) calls it once
   * per frame, but tests and benches still call it directly.
   *
   * Returns the drained requests and the remaining count (always 0
   * unless `maxLanes` excluded a lane).
   *
   * Wraps the work in a `pryzm.frame.tick` OTel span (R1A-04 mitigation
   * locked at S02 — see ADR-006).  Per ADR-006 the span carries the
   * `pryzm.frame.idle_budget_remaining` and `pryzm.frame.idle_throttled`
   * attributes added in S03.
   */
  drainSync(maxLanes: readonly Priority[] = PRIORITIES): DrainResult {
    const dirtyReasons = [...this.dirtyFlags].sort();
    return withSpan(
      'pryzm.frame.tick',
      {
        'pryzm.frame.queue_depth': this.pending.length,
        'pryzm.frame.dirty_reasons': dirtyReasons.join(','),
        'pryzm.frame.dirty_count': dirtyReasons.length,
        'pryzm.frame.idle_budget_remaining': this.idle.budget,
        'pryzm.frame.idle_throttled': this.idle.exhausted,
      },
      () => {
        const allowed = new Set(maxLanes);
        const drained: FrameRequest[] = [];
        const remaining: FrameRequest[] = [];
        for (const req of this.pending) {
          if (allowed.has(req.priority)) drained.push(req);
          else remaining.push(req);
        }
        this.pending.length = 0;
        this.pending.push(...remaining);
        return { drained, remaining: this.pending.length };
      },
    );
  }

  /** Reset everything — used by `clear-on-load` semantics in S04. */
  reset(): void {
    this.dirtyFlags.clear();
    this.pending.length = 0;
    this.seq = 0;
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.tickListeners.clear();
    this._invalidateTickOrder();
    this.tickCount = 0;
    this.motionActive = false;
    this.motionListeners.clear();
    this._batchBudgets.clear();
    // §BACKGROUND-TAB-KEEPALIVE: drop any active background pump subscription.
    this._unsubscribeHeartbeat();
  }

  // ── §F.3 — Shared per-rAF budget tokens ───────────────────────────────────

  /**
   * §F.3 — Register (or update) a named shared budget token.
   *
   * `setBatchBudget('batch-drain', { budgetMs: 20 })` creates a token that
   * caps all geometry drain callbacks sharing the key `'batch-drain'` to a
   * combined 20 ms per rAF frame.  At the top of each `_tick()` every token's
   * `consumedMs` is reset to 0 so the budget renews each frame.
   *
   * Calling `setBatchBudget` with the same key replaces the existing token.
   *
   * @param key      Unique string key identifying this budget (e.g. `'batch-drain'`).
   * @param opts     `budgetMs` — frame budget in milliseconds.
   */
  setBatchBudget(key: string, opts: { budgetMs: number }): void {
    this._batchBudgets.set(key, { budgetMs: opts.budgetMs, consumedMs: 0 });
  }

  /**
   * §F.3 — Retrieve the live `BudgetToken` for a named budget, or `null` if
   * none has been registered via `setBatchBudget`.  The returned token is a
   * view over the internal mutable `_BudgetEntry`; its `consume()` calls
   * accumulate into that entry for the current frame.
   *
   * @param key   The same key passed to `setBatchBudget`.
   * @returns     A `BudgetToken` if registered, otherwise `null`.
   */
  getBatchBudget(key: string): BudgetToken | null {
    const entry = this._batchBudgets.get(key);
    if (!entry) return null;
    return {
      get budgetMs() { return entry.budgetMs; },
      hasRemaining(startMs: number): boolean {
        return (performance.now() - startMs) + entry.consumedMs < entry.budgetMs;
      },
      consume(elapsedMs: number): void {
        entry.consumedMs += elapsedMs;
      },
    };
  }

  // ── S03-T1: rAF pump ──────────────────────────────────────────────────────

  /**
   * Begin pumping rAF.  Pass a `RafAdapter` to inject test/headless time
   * (the `FakeRafAdapter` in `RafAdapter.ts` is the standard test double);
   * production callers omit the argument and get the platform `globalThis`
   * pump via `GlobalRafAdapter`.
   *
   * Idempotent — calling `start()` while already running is a no-op (the
   * existing adapter is preserved).
   */
  start(adapter: RafAdapter = new GlobalRafAdapter()): void {
    if (this.running) return;
    this.adapter = adapter;
    this.running = true;
    this.idle.reset();
    this.idleEntryEmitted = false;
    // §BACKGROUND-TAB-KEEPALIVE: ensure the visibility bridge is installed once
    // so a hidden→visible transition immediately re-arms the rAF path (the
    // heartbeat pump self-suspends when visible, so without this nudge a loop
    // that went background could sit until the next markDirty()).
    this._installVisibilityBridge();
    // Anchor `lastTickTime` to the adapter's clock — NOT `this.clock()`
    // (which defaults to `Date.now()` in the Unix-epoch time-base).
    // The first tick's `now` argument is in the adapter's time-base; if
    // we anchored on `Date.now()` the first observed `deltaMs` would be
    // a nonsense ~1.7e12 ms negative number.
    this.lastTickTime = adapter.now();
    this.scheduleNext();
  }

  /**
   * Stop pumping rAF.  Cancels any in-flight handle.  Idempotent.
   * The adapter reference is retained so `markDirty()` / `requestFrame()`
   * can wake the loop again without the caller re-passing the adapter.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.adapter !== null && this.rafHandle !== null) {
      this.adapter.cancel(this.rafHandle);
    }
    this.rafHandle = null;
    // §BACKGROUND-TAB-KEEPALIVE: release any background pump so an idle/stopped
    // scheduler does not keep the heartbeat alive (it has no other purpose).
    this._unsubscribeHeartbeat();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Register a per-tick listener.  Listeners run inside `_tick(now)` in
   * `TickPriority` order: pre-render → render → post-render → overlay.
   * Returns a disposer; call it to unregister.
   *
   * Mirrors PRYZM 1's `UnifiedFrameLoop.addTickListener` shape
   * (`src/core/rendering/UnifiedFrameLoop.ts:130-230`).  Registering a
   * listener wakes the loop if a previous idle window had stopped it.
   */
  addTickListener(
    id: string,
    callback: TickListenerCallback,
    priority: TickPriority,
  ): TickListenerDisposer {
    if (this.tickListeners.has(id)) {
      throw new Error(
        `[FrameScheduler] addTickListener: duplicate id "${id}" (each listener must register a unique id).`,
      );
    }
    this.tickListeners.set(id, { id, callback, priority });
    this._invalidateTickOrder();
    this.wakeIfStopped();
    return () => {
      // §PERF-TICK-ORDER-IS-CACHED — invalidate ONLY on an actual removal, so a
      // disposer called twice (a common idempotent-cleanup pattern) does not
      // discard a freshly-built order for nothing.
      if (this.tickListeners.delete(id)) this._invalidateTickOrder();
    };
  }

  /**
   * Schedule a callback to fire **exactly once** on the next scheduler tick
   * at the given priority, then auto-dispose.  This is the canonical
   * architectural replacement for the one-shot `rAF(cb)`
   * pattern (defer-to-next-frame batch-flush, render-after-layout, leak-
   * audit-after-mount, drag-coalesce, etc.) — the §8 row #3 boolean
   * (`raf_owners_outside_frame_scheduler == 0`) cannot close while
   * consumers are still calling `rAF()` directly, even
   * for one-shot deferrals.
   *
   * Allocates a unique internal id (`once:<reason>:<seq>`) so callers
   * don't collide with `addTickListener`'s id namespace nor with each
   * other when the same reason is scheduled multiple times in flight.
   *
   * Returns a `TickListenerDisposer` that can be called to cancel the
   * pending callback before it fires (no-op if already fired).  Mirrors
   * the `cancelAnimationFrame(handle)` cleanup that all PRYZM 1
   * one-shot-rAF call sites already do.
   *
   * Default priority is `'post-render'` because the most common
   * one-shot-rAF use case in PRYZM 1 is "flush a batch / render-once /
   * audit-after-frame" which all want to run AFTER the render pass for
   * the frame they were scheduled into.  Callers who need pre-render or
   * overlay timing should pass the priority explicitly.
   *
   * @example
   *   // BEFORE (PRYZM 1 — direct rAF):
   *   //   rAF(() => this._renderToCanvas(viewDef, canvas));
   *   //
   *   // AFTER (PRYZM 3 — single-scheduler architecture):
   *   //   getFrameScheduler().scheduleOnce(
   *   //     'viewport-preview-render',
   *   //     () => this._renderToCanvas(viewDef, canvas),
   *   //   );
   */
  scheduleOnce(
    reason: string,
    callback: TickListenerCallback,
    priority: TickPriority = 'post-render',
  ): TickListenerDisposer {
    const id = `once:${reason}:${(++this.onceSeq).toString(36)}`;
    let fired = false;
    const dispose = this.addTickListener(
      id,
      (now, deltaMs) => {
        if (fired) return;
        fired = true;
        // Auto-dispose BEFORE invoking so the callback can re-schedule
        // itself (recursive `scheduleOnce` from inside the callback) and
        // get a fresh id rather than collide with the dying listener.
        dispose();
        callback(now, deltaMs);
      },
      priority,
    );
    return dispose;
  }

  /**
   * Schedule a callback to run **once** on the next scheduler tick at the
   * given render-phase priority.  This is the **canonical C11 §5.2 / §6.1
   * API** for geometry builders and other pre/post-render work:
   *
   *   ```ts
   *   // Sprint A32 — canonical path for geometry drain:
   *   const FrameScheduler = getFrameScheduler();
   *   this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drain());
   *   ```
   *
   * Thin wrapper around `scheduleOnce(phase, callback, phase)` — the reason
   * string is set equal to the phase name so OTel `once:<phase>:<seq>` trace
   * spans are self-descriptive.  Callers who need a custom reason string
   * should call `scheduleOnce()` directly.
   *
   * **Phase guidance** (per C11 §6.1):
   * - `'pre-render'`  — geometry build / scene-graph mutations (before render)
   * - `'render'`      — renderer pass itself
   * - `'post-render'` — shadow reactivation, post-effect work, audit
   * - `'overlay'`     — HUD, debug overlays, accessibility announcements
   */
  schedule(phase: TickPriority, callback: TickListenerCallback): TickListenerDisposer {
    return this.scheduleOnce(phase, callback, phase);
  }

  /** Read-only — used by tests + the bouncing-cube demo. */
  tickListenerCount(): number {
    return this.tickListeners.size;
  }

  /** Read-only — used by the idle-CPU bench. */
  totalTicks(): number {
    return this.tickCount;
  }

  /**
   * Force the idle-continuation budget to zero — the next tick will
   * see `remaining === 0` and stop the rAF loop.  Wired by
   * `IdleAccumulator` (renderer): once every registered post-FX pass
   * reports converged, there is no more idle work to do, so the
   * scheduler can sleep until the next motion event without waiting
   * out the remaining tail of the 30-frame ADR-0006 budget.
   *
   * Spec source: ADR-0014 §"Composition with FrameScheduler.IdleContinuation".
   */
  stopIdleContinuation(): void {
    // Drain the budget; the next tick that finds no live work will
    // observe `remaining === 0` and call `stop()`.  If the loop is
    // already stopped this is a no-op.
    while (this.idle.budget > 0) this.idle.consume();
    if (this.running) {
      // Eager stop — don't wait for one more tick to discover the
      // exhaustion.  Mirrors the in-tick path that calls `stop()`.
      emitIdleContinuationEvent('exhausted', 0);
      this.stop();
    }
  }

  idleBudgetRemaining(): number {
    return this.idle.budget;
  }

  // ── S17 motion gate (additive — does NOT alter S03 idle behaviour for
  //     callers that don't use it).  Used by `ViewController.switchTo()`
  //     to suppress idle-continuation accumulation while a camera
  //     animation is in flight.  See ADR-0016 §"Camera animation under
  //     the FrameScheduler motion gate".
  //
  //     Semantics:
  //       * `beginMotion()` flips an internal `motionActive` flag, calls
  //         every registered `onMotionStart` callback, AND seeds the
  //         dirty set with `'motion'` so the loop never enters the
  //         idle-consume branch while motion is active.
  //       * `endMotion()` clears the flag and `'motion'` dirty key.  The
  //         next idle frame consumes budget normally.
  //
  //     Callers in flight during a single tick are well-defined: the
  //     dirty-flag check happens at the TOP of each tick, so flipping
  //     the flag in a callback will be observed on the very next tick.
  //
  // -----------------------------------------------------------------------
  /** Mark the scheduler as in-motion.  Suppresses idle-continuation
   *  exhaustion until `endMotion()` is called.  Idempotent — repeated
   *  calls do NOT stack; the first `endMotion()` wins.
   * @param _tag Optional debug label identifying the motion source (ignored at runtime). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  beginMotion(_tag?: string): void {
    if (this.motionActive) {
      // Still notify subscribers so a re-entrant motion (eg. user input
      // mid-view-switch) gets a fresh accumulator reset.
      for (const cb of this.motionListeners.values()) {
        try {
          cb();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[FrameScheduler] onMotionStart listener error:', err);
        }
      }
      return;
    }
    this.motionActive = true;
    this.dirtyFlags.add('motion');
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.wakeIfStopped();
    for (const cb of this.motionListeners.values()) {
      try {
        cb();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[FrameScheduler] onMotionStart listener error:', err);
      }
    }
  }

  /** Clear the in-motion flag.  After this call the scheduler resumes
   *  normal idle-continuation accounting on the next tick.  Idempotent.
   * @param _tag Optional debug label identifying the motion source (ignored at runtime). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  endMotion(_tag?: string): void {
    if (!this.motionActive) return;
    this.motionActive = false;
    this.dirtyFlags.delete('motion');
  }

  /** True iff the scheduler is currently inside a `beginMotion()` /
   *  `endMotion()` window. */
  isInMotion(): boolean {
    return this.motionActive;
  }

  /** Subscribe to motion-start events (every `beginMotion()` call,
   *  including re-entrant ones).  Used by `IdleAccumulator` to reset
   *  per-pass convergence so TRAA / SSGI restart their budgets when a
   *  view-switch begins.  Returns a disposer; idempotent. */
  onMotionStart(cb: () => void): () => void {
    const id = ulid() + ':' + (++this.seq).toString(36);
    this.motionListeners.set(id, cb);
    return () => {
      this.motionListeners.delete(id);
    };
  }

  // ── S03-T2: idle continuation gate ────────────────────────────────────────

  /**
   * §BACKGROUND-TAB-KEEPALIVE — is the background keep-alive enabled and the
   * tab currently hidden?  When true, `scheduleNext()` pumps off the
   * BackgroundHeartbeat instead of rAF (which the browser has paused).
   *
   * Returns false whenever the tab is visible — guaranteeing the foreground
   * path is the exact rAF path it was before this feature (no behavioural
   * change when visible).  Also false if the kill-switch global is set, or if
   * the host has no document (headless / test adapters drive rAF directly).
   */
  private _shouldUseBackgroundPump(): boolean {
    if ((globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
          .__pryzmDisableBackgroundKeepalive === true) {
      return false;
    }
    // Only divert to the heartbeat when a REAL document reports hidden.  The
    // FakeRafAdapter tests have no document, so they always stay on rAF.
    const heartbeat = this._getHeartbeat();
    return heartbeat !== null && heartbeat.isHidden;
  }

  /** Lazily obtain the shared heartbeat; null if construction fails (no
   *  MessageChannel in this host) so we degrade to the rAF-only path. */
  private _getHeartbeat(): BackgroundHeartbeat | null {
    if (this.heartbeat === null) {
      try {
        this.heartbeat = getBackgroundHeartbeat();
      } catch {
        this.heartbeat = null;
      }
    }
    return this.heartbeat;
  }

  private scheduleNext(): void {
    if (!this.running || this.adapter === null) return;
    // §BACKGROUND-TAB-KEEPALIVE: while hidden, rAF is paused — pump the WORK
    // drain off the unthrottled heartbeat.  Subscribe ONCE; the heartbeat
    // re-pulses itself until we unsubscribe (on becoming visible or stopping).
    if (this._shouldUseBackgroundPump()) {
      const heartbeat = this._getHeartbeat();
      if (heartbeat !== null) {
        if (this.heartbeatUnsub === null) {
          this.heartbeatUnsub = heartbeat.subscribe((now) => {
            // Defensive: if we became visible since the last pulse, drop back
            // to rAF on the next scheduleNext() (which `tick()` calls).
            this.tick(now);
          });
        }
        return;
      }
      // Heartbeat unavailable — fall through to rAF (best effort).
    }
    // Foreground (or keep-alive disabled): the ORIGINAL rAF path, unchanged.
    this._unsubscribeHeartbeat();
    this.rafHandle = this.adapter.request((now) => this.tick(now));
  }

  /** Drop the background heartbeat subscription if one is active. */
  private _unsubscribeHeartbeat(): void {
    if (this.heartbeatUnsub !== null) {
      const unsub = this.heartbeatUnsub;
      this.heartbeatUnsub = null;
      try { unsub(); } catch { /* non-fatal */ }
    }
  }

  /** True once `_installVisibilityBridge()` has wired the listener. */
  private _visibilityBridgeInstalled = false;

  /**
   * §BACKGROUND-TAB-KEEPALIVE / §PROGRESS-SCHEDULER — install (once) a
   * `visibilitychange` listener that switches the pump between rAF and the
   * heartbeat **in both directions**.
   *
   * **VISIBLE → HIDDEN (the founder's stall, fixed here).** `scheduleNext()` is
   * the only place that consults `_shouldUseBackgroundPump()`, and it is only
   * reachable from `tick()`, which is driven by rAF.  When the tab hides, the
   * browser stops firing rAF — so the already-armed callback never runs, the
   * hand-off is never evaluated, and every non-visual subscriber on the frame
   * bus (chunked project load, room redetect, geometry drains, batch
   * coordination) parks at 0 Hz until the tab is looked at again.  Meanwhile
   * raw-`setTimeout` watchdogs (e.g. `BatchCoordinator`'s 8 s drain watchdog)
   * DO keep firing on approximately real time, so they force-complete work that
   * has merely been parked — that divergence is the corruption, not the stall.
   * The bridge therefore abandons the dead rAF handle and arms the heartbeat.
   *
   * **HIDDEN → VISIBLE.** Release the heartbeat and restore the exact rAF path,
   * so the foreground remains byte-identical to the pre-keepalive behaviour.
   *
   * No-op in headless/test hosts that have no `document` (those drive rAF via
   * an injected adapter and never enter the heartbeat path).
   */
  private _installVisibilityBridge(): void {
    if (this._visibilityBridgeInstalled) return;
    const doc = (globalThis as {
      document?: {
        addEventListener?(type: 'visibilitychange', listener: () => void): void;
      };
    }).document;
    if (!doc?.addEventListener) return;
    this._visibilityBridgeInstalled = true;
    doc.addEventListener('visibilitychange', () => this._onVisibilityChange());
  }

  /**
   * Re-evaluate which pump should be driving, given the current visibility.
   * Extracted from the bridge listener so `_shouldUseBackgroundPump()` is
   * consulted on a visibility EDGE as well as from inside `tick()`.
   */
  private _onVisibilityChange(): void {
    if (!this.running || this.adapter === null) return;

    if (this._shouldUseBackgroundPump()) {
      // Became HIDDEN.  The armed rAF callback will never fire again, so drop
      // it and hand the pump to the heartbeat.  `scheduleNext()` performs the
      // subscription (and is a no-op if we are already on the heartbeat).
      if (this.heartbeatUnsub === null) {
        if (this.rafHandle !== null) {
          this.adapter.cancel(this.rafHandle);
          this.rafHandle = null;
        }
        this.scheduleNext();
      }
      return;
    }

    // Became VISIBLE — leave the heartbeat and resume rAF immediately.
    if (this.heartbeatUnsub !== null) {
      this._unsubscribeHeartbeat();
      if (this.rafHandle === null) this.scheduleNext();
    }
  }

  private tick(now: number): void {
    if (!this.running) return;
    this.rafHandle = null;
    this.tickCount++;

    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    // §FRAME-PROFILER — single typed-global read; everything below is gated on it.
    const _prof = this.profiler.isOn();
    const _profStart = _prof ? _perfNow() : 0;
    if (_prof) this.profiler.beginFrame(_profStart);

    // §F.3 — Reset per-rAF budget tokens at the top of each tick so all
    // drain callbacks sharing a budget key start each frame with a fresh
    // consumedMs = 0.  This is O(k) where k is the number of live budget
    // keys (typically 1 during a batch, 0 at idle).
    for (const entry of this._batchBudgets.values()) {
      entry.consumedMs = 0;
    }

    // Snapshot "had work" BEFORE drain — `drainSync` empties `pending`,
    // so checking afterwards would always see an empty queue and treat
    // an interaction-driven frame as idle.  The dirty-flag set persists
    // across drain (per S02 spec — "drain reads, never clears"), but we
    // mirror the snapshot for symmetry and one-line clarity.
    const hadWorkBeforeDrain =
      this.dirtyFlags.size > 0 || this.pending.length > 0;

    // 1. Drain the priority queue (wraps in `pryzm.frame.tick` OTel span).
    const _drainT0 = _prof ? _perfNow() : 0;
    this.drainSync();
    if (_prof) this.profiler.recordDrain(_perfNow() - _drainT0);

    // 2. Run tick listeners in TickPriority order.  Listener errors are
    //    isolated — one broken subsystem must not kill the frame loop.
    //
    // §FIX-FS-SNAPSHOT (Sprint A41): Snapshot tickListeners into an Array
    // BEFORE the priority loop.  JavaScript's Map.values() iterator is live —
    // entries added during iteration (e.g. a scheduleOnce callback that
    // re-schedules itself, or a CurtainWallBuilder drain that re-arms its own
    // pre-render slot) are immediately visible to the running for-of loop and
    // execute in the SAME rAF tick.  This collapsed all 11 post-batch
    // tickNextLevel (room.redetect) calls into a single 16,700ms LONGTASK,
    // and all 18 L0 curtain-wall builds into a 30,618ms LONGTASK.
    //
    // With the snapshot, any listener registered from inside a callback is
    // queued for the NEXT scheduler tick — the intended "one callback per
    // frame" contract that scheduleOnce and schedule() both document.
    if (this.tickListeners.size > 0) {
      // §PERF-TICK-ORDER-IS-CACHED — ONE pass over a list that is already in
      // priority order, instead of P=4 passes over an array rebuilt every frame.
      // `listenersThisTick` is a stable reference for the whole tick, which is
      // what preserves the mid-tick mutation semantics documented on
      // `_orderedTickListeners` — do not re-read the field inside this loop.
      const listenersThisTick = this._orderedTickListenersOrBuild();
      for (const listener of listenersThisTick) {
        const _lT0 = _prof ? _perfNow() : 0;
        try {
          listener.callback(now, deltaMs);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            `[FrameScheduler] tick listener "${listener.id}" error:`,
            err,
          );
        }
        if (_prof) this.profiler.recordListener(listener.id, _perfNow() - _lT0);
      }
    }

    // §FRAME-PROFILER — record total frame wall-time + emit the 1 s summary.
    // Placed before the idle-gate's early returns so it runs on every tick.
    //
    // ⭐ §NAV-FRAME-IS-NOT-CPU (L-5900, lane NAV24, 2026-08-22) — TWO durations, and
    // `deltaMs` is the one the user feels.
    //
    // `_frameEnd - _profStart` is the wall-clock time spent INSIDE this method: the
    // drain plus every tick listener. That is MAIN-THREAD work and only main-thread
    // work. `deltaMs` (computed at the top of this tick, `now - lastTickTime`) is the
    // rAF-to-rAF INTERVAL — the actual cadence the viewport updates at.
    //
    // This call used to pass ONLY the first, and `FrameProfiler` labelled it `frame=`
    // and computed `worst`/`p95`/`hitches` from it. `deltaMs` was already in scope,
    // already correct, and was dropped on the floor. On BOTH backends the expensive
    // half of a heavy frame is off this thread — WebGPU encodes and submits, WebGL2
    // hands work to the driver — so a GPU-bound scene produced short ticks, long
    // frames, and a profiler that printed "✅ smooth" over a visible stutter.
    //
    // ⛔ `deltaMs` is safe to report across the idle stop/start cycle: `start()`
    // re-anchors `lastTickTime = adapter.now()` (see start(), §S03-T1), so the first
    // tick after a wake measures one frame and not the whole idle gap. Without that
    // anchor this line would mint a fake multi-second hitch on every wake.
    if (_prof) {
      const _frameEnd = _perfNow();
      this.profiler.endFrame(_frameEnd - _profStart, _frameEnd, deltaMs);
    }

    // 3. Idle-continuation gate (ADR-006).  If the tick had work to do —
    //    pending frame-requests or set dirty flags — we are NOT idle and
    //    the budget stays full.  Otherwise consume one unit of budget;
    //    when it hits zero, stop the loop ("0 fps idle" exit criterion
    //    S03 line 397).  Dirty-flag persistence is the producer's
    //    responsibility — `clearDirty(flag)` once the producer has acted.
    const stillLive =
      hadWorkBeforeDrain || this.dirtyFlags.size > 0 || this.pending.length > 0;
    if (stillLive) {
      // Live frame — keep the budget full and reset the entry latch.
      if (this.idle.budget < IDLE_CONTINUATION_FRAMES) {
        this.idle.reset();
      }
      this.idleEntryEmitted = false;
      this.scheduleNext();
      return;
    }

    // Scene is idle — first frame in the idle window emits the "enter" event.
    if (!this.idleEntryEmitted) {
      emitIdleContinuationEvent('enter', this.idle.budget);
      this.idleEntryEmitted = true;
    }

    const remaining = this.idle.consume();
    if (remaining === 0) {
      emitIdleContinuationEvent('exhausted', 0);
      this.stop();
      return;
    }
    this.scheduleNext();
  }

  private wakeIfStopped(): void {
    // We only wake if `start()` has been called at least once (so the
    // adapter is known).  The S02 data-structure tests construct the
    // scheduler without calling `start()`, so they never enter the rAF
    // loop and the wake call is inert.
    if (this.adapter !== null && !this.running) {
      this.start(this.adapter);
    }
  }
}
