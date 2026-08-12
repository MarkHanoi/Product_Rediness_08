/**
 * §3.5 CONTRACT — CENTRALIZED STORE EVENT BUS
 *
 * All ElementStores must publish change events through this bus.
 * Consumers: DependencyResolver, Topology Layer (Phase 2), World Model (Phase 3).
 *
 * Shape defined by §3.5.1 / §3.5.2 of the Master Architecture Contract.
 *
 * ## MODIFICATION DECLARATION — P1.1: Depth-Counted Batch Bus
 *
 * Layer Affected:    Event Bus (cross-cutting)
 * Phase:             Phase 1 — StoreEventBus Batching (P1.1) // TODO(TASK-08)
 * Classification:    A
 *
 * Problem (prior implementation):
 *   The previous batch mechanism used a boolean flag (`_batchMode`) which:
 *   1. Did not support nesting — called `beginBatch()` twice → second call ignored.
 *   2. Coalesced events to 1 per (elementType, operation) pair — violating the
 *      "No Event Drops" guarantee from the Master Architecture Contract §9.
 *   3. Used manual `beginBatch()` / `endBatch()` API — callers could forget
 *      `endBatch()` (no try/finally enforcement), leaking batch mode permanently.
 *
 * Fix (this implementation — P1.1):
 *   1. Depth counter `_batchDepth: number` — replaces boolean flag.
 *      Nesting is now supported: inner `batch()` increments/decrements correctly.
 *      Only the outermost call flushes.
 *   2. `batch<T>(fn: () => T): T` safe wrapper — try/finally built in.
 *      Caller cannot forget to flush. Exception inside fn → buffer discarded
 *      (state will be rolled back by CommandManager) and exception re-thrown.
 *   3. Flush dispatches ALL buffered events in emission order — no coalescing.
 *      Contract guarantee: "No Event Drops" is now satisfied.
 *   4. `beginBatch()` / `endBatch()` kept for backward compatibility with
 *      `BatchCoordinator` until P1.2 migrates it to `bus.batch()`.
 *      These now use the depth counter so they are nesting-safe too.
 *   5. Immediate mode (batch depth 0) is identical to the previous behaviour —
 *      single commands dispatch synchronously with no buffering overhead.
 *
 * Non-negotiables preserved (§9 Master Architecture):
 *   - No Event Drops:     Every emit() eventually reaches all subscribers.
 *   - Ordered Delivery:   Events reach subscribers in emission order.
 *   - Layer Isolation:    Bus has no knowledge of stores, builders or commands.
 *
 * P1.2 (next step): BatchCoordinator migrated to use `bus.batch(fn)` directly,
 *   `beginBatch()` / `endBatch()` deprecated and removed.
 */

import { registerProjectScopeProbe } from './persistence/ProjectIsolationAudit.js';

/** ADR-0298 / L-713 — the C13 scope name for the store event CHANNEL. */
const STORE_EVENT_BUS_SCOPE = 'events.storeBus';

/**
 * The answer this probe gives when the bus is still holding events at audit time.
 *
 * It is deliberately NOT a real project id, and deliberately not the id of the
 * project that just loaded. `StoreChangeEvent` carries no projectId, so the bus
 * genuinely cannot attribute a queued event — and the one thing this defect family
 * keeps proving is that an unknown must never be filed as a clean. Because this
 * marker can never equal the loaded project id, the audit always reports it.
 */
const BUS_IN_FLIGHT_UNATTRIBUTED = '<in-flight-events-unattributed>';

export interface StoreChangeEvent {
    elementId: string;
    elementType: string;
    operation: 'create' | 'update' | 'delete';
    timestamp: number;
    /**
     * C72 §3.2 (CONNECT-0, 2026-08-12) — the pre-mutation snapshot, OPTIONAL.
     *
     * Until this field existed, a diff consumer subscribed to this bus was
     * subscribed to a type that STRUCTURALLY could not carry what it needs —
     * the §STEP7 third argument that ten stores emit on their own channels
     * died at this seam, and every bus-side classifier could only invalidate
     * wholesale (the ADR-057 defect). Optional by design: `add` has no prior
     * state, most emitters do not forward one yet, and the 23 existing
     * subscribers that never read it see no behaviour change. Emitters that
     * hold the pre-mutation record (WallStore.emit's bus bridge is the first)
     * forward it here so a bus subscriber CAN make a diff-based decision.
     *
     * C72 §3.5 still applies: a consumer may NEVER reconstruct this by
     * re-reading the store — that diffs the new value against itself.
     */
    prevState?: unknown;
    /**
     * Reserved for future use — kept for type compatibility.
     * In P1.1 the bus no longer coalesces, so this is never set to true.
     * @deprecated Will be removed in P1.2 cleanup.
     */
    _coalesced?: boolean;
    /**
     * Reserved for future use — kept for type compatibility.
     * In P1.1 the bus no longer emits a BATCH_COMPLETE sentinel.
     * @deprecated Will be removed in P1.2 cleanup.
     */
    _batchComplete?: boolean;
}

/**
 * Kept for backward compatibility — no longer emitted by the bus in P1.1.
 * Will be removed in P1.2 cleanup once BatchCoordinator is migrated.
 * @deprecated
 */
export const BATCH_COMPLETE_ELEMENT_TYPE = '_batch';

export class StoreEventBus { // TODO(TASK-08)
    private _listeners = new Set<(event: StoreChangeEvent) => void>();

    // ── Depth-Counted Batch State (P1.1) ──────────────────────────────────────
    /**
     * Depth counter for nested batch() calls.
     * 0 = immediate mode (events dispatched synchronously).
     * > 0 = batch mode (events buffered, flushed when depth returns to 0).
     */
    private _batchDepth = 0;
    /** Events buffered while _batchDepth > 0. */
    private _buffer: StoreChangeEvent[] = [];

    // ── §C13-CLEAR-EVENTS-DO-NOT-CROSS (L-713) — suppression region ───────────
    /** Depth counter for nested `suppressDuring()` regions. */
    private _suppressDepth = 0;
    /** Events dropped by the current (or most recent) suppression region. */
    private _suppressedCount = 0;
    private _suppressedByType: Record<string, number> = {};
    /** The most recent completed suppression, for the isolation audit and tests. */
    private _lastSuppression: { reason: string; count: number; byType: Record<string, number> } | null = null;

    // ── Core Public API ───────────────────────────────────────────────────────

    /**
     * Safe batch wrapper — try/finally is built in, caller cannot forget to flush.
     *
     * Behaviour:
     * - Increments depth counter on entry → emit() calls buffer events.
     * - Decrements depth counter in finally.
     * - Only the outermost batch() (depth returning to 0) flushes the buffer.
     * - Nested batch() calls are fully supported via depth counter.
     * - If fn() throws → buffer is discarded (CommandManager will roll back state)
     *   and the exception is re-thrown.
     *
     * @example
     *   storeEventBus.batch(() => {
     *     store.set(id1, elem1); // buffered
     *     store.set(id2, elem2); // buffered
     *   });
     *   // → all listeners receive event1 then event2 after fn() returns
     */
    batch<T>(fn: () => T): T {
        this._batchDepth++;
        let success = false;
        try {
            const result = fn();
            success = true;
            return result;
        } finally {
            this._batchDepth--;
            if (this._batchDepth === 0) {
                if (success) {
                    this._flush();
                } else {
                    // fn() threw — discard buffer; state is being rolled back by CommandManager.
                    const discarded = this._buffer.length;
                    this._buffer = [];
                    if (discarded > 0) {
                        console.warn(
                            `[StoreEventBus] batch() threw — discarded ${discarded} buffered event(s). ` + // TODO(TASK-08)
                            'CommandManager should roll back store state.'
                        );
                    }
                }
            }
        }
    }

    /**
     * Emit a store change event.
     *
     * Immediate mode (batchDepth === 0): dispatches to all listeners synchronously.
     * Batch mode (batchDepth > 0): event is frozen and buffered until flush.
     *
     * All events are Object.freeze'd before dispatch or buffering to prevent
     * accidental mutation by listeners.
     *
     * PERF-FIX-3 DIAGNOSTIC: Set `StoreEventBus._debugEmitCallers = true` in the // TODO(TASK-08)
     * browser console to log the call stack of every emit() during a batch. This
     * identifies secondary emitters that inflate the buffered event count beyond
     * the expected N (one per created element). Disabled by default — zero runtime
     * cost in production.
     */
    static _debugEmitCallers = false;

    emit(event: StoreChangeEvent): void {
        // §C13-CLEAR-EVENTS-DO-NOT-CROSS (L-713) — see `suppressDuring()`. Checked
        // BEFORE batching so a suppressed region is inert in both immediate and batch
        // mode; a region that only stopped buffering would still dispatch at depth 0.
        if (this._suppressDepth > 0) {
            this._suppressedCount++;
            this._suppressedByType[event.elementType] = (this._suppressedByType[event.elementType] ?? 0) + 1;
            return;
        }
        const frozen = Object.freeze({ ...event });
        if (this._batchDepth > 0) {
            if (StoreEventBus._debugEmitCallers && (import.meta as any).env?.DEV) { // TODO(TASK-08)
                const stack = new Error().stack?.split('\n').slice(2, 5).join(' | ') ?? '(no stack)';
                console.debug(
                    `[StoreEventBus] emit #${this._buffer.length + 1} ` + // TODO(TASK-08)
                    `${event.elementType}/${event.operation}/${event.elementId.slice(0, 8)} ` +
                    `| caller: ${stack}`
                );
            }
            this._buffer.push(frozen);
        } else {
            this._dispatch(frozen);
        }
    }

    /**
     * §C13-CLEAR-EVENTS-DO-NOT-CROSS (L-713) — run `fn` with every emitted event
     * DROPPED instead of delivered, and report how many were dropped.
     *
     * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
     *
     * The founder created a NEW project and saw the previous project's work. The
     * new project loaded ZERO elements, and immediately afterwards the bus logged
     * `endBatch() — flushed 74 buffered event(s)`, of which several named windows
     * belonging to the PREVIOUS project. Both isolation audits then reported clean.
     *
     * The chain, measured (L-713):
     *   1. `ProjectLoader.ts:590` opens the bus batch for the INCOMING project.
     *   2. `ImportProjectCommand` runs `ClearProjectCommand` INSIDE that bracket —
     *      deliberately, so clear-then-create ordering is preserved for builders.
     *   3. `ClearProjectCommand` calls `projectScopeRegistry.clearAll()`, and
     *      `WindowStore.clear()` / `DoorStore.clear()` emit one `delete` per element
     *      OF THE OUTGOING PROJECT. They are buffered.
     *   4. `ProjectLoader.ts:2012` flushes them — into the INCOMING project's
     *      subscribers, after the incoming project's views have replaced the old.
     *
     * ⚠ NOTE WHAT IS *NOT* WRONG HERE: `beginBatch()` is NOT unbalanced, and no
     * batch survives a project switch. The bracket belongs entirely to the incoming
     * project. The leak is that the OUTGOING project's teardown runs inside it.
     *
     * ── WHY DROPPING IS CORRECT, NOT A SHORTCUT ──────────────────────────────
     *
     * `ClearProjectCommand` calls `elementRegistry.clear()` as its FIRST step, before
     * any store is touched. Every delete event it subsequently emits therefore names
     * an element that the registry no longer knows — which is exactly why
     * `ViewDependencyTracker` logs `§G3-STALE-EVENT … unregistered element` for each
     * one. These events are structurally un-actionable: no subscriber can resolve
     * them, and the tracker's "fallback" was to full-invalidate every non-3D view of
     * the NEW project, 74 times over.
     *
     * Nor do the subscribers need them. Every `storeEventBus` consumer is a DERIVED
     * INDEX (SemanticIndex, DependencyResolver, ViewDependencyTracker,
     * ViewTechnicalDrawingCache, ViewVisibilityMap, ElementSpatialIndex,
     * TemporalGraph, …) and `ClearProjectCommand` resets each of them WHOLESALE by
     * its own steps. Per-element deletes are redundant with a reset that has already
     * happened. The per-store `subscribe()` channel that BUILDERS use is a different
     * channel and is deliberately NOT suppressed — mesh teardown still fires.
     *
     * ── THE §9 "NO EVENT DROPS" EXCEPTION, DECLARED ──────────────────────────
     *
     * The Master Architecture §9 guarantee is that every `emit()` eventually reaches
     * all subscribers. This is the SECOND declared exception to it, alongside the
     * existing C13 `discardBatch()`. Both have the same justification and the same
     * fence: events belonging to a project that is being destroyed must not be
     * delivered to a different project's subscribers. The exception is:
     *   - NAMED (this method, one §-tag),
     *   - BOUNDED (a lexical region, not a mode),
     *   - COUNTED (`lastSuppression`, surfaced to the isolation audit),
     *   - and LOUD (a warn naming the reason and the per-type breakdown).
     * A drop you cannot count is indistinguishable from a bus that stopped working.
     *
     * Nesting-safe. Independent of batch depth — it composes with an open batch.
     */
    suppressDuring<T>(reason: string, fn: () => T): T {
        this._suppressDepth++;
        if (this._suppressDepth === 1) {
            this._suppressedCount = 0;
            this._suppressedByType = {};
        }
        try {
            return fn();
        } finally {
            this._suppressDepth--;
            if (this._suppressDepth === 0) {
                const count = this._suppressedCount;
                const byType = { ...this._suppressedByType };
                this._lastSuppression = { reason, count, byType };
                if (count > 0) {
                    console.warn(
                        `[StoreEventBus] §C13-CLEAR-EVENTS-DO-NOT-CROSS — dropped ${count} event(s) ` +
                        `emitted during "${reason}". These name elements of the OUTGOING project and ` +
                        `must not reach the incoming project's subscribers (C13 §3.10):`,
                        byType,
                    );
                }
            }
        }
    }

    /** True while a `suppressDuring()` region is active. */
    get isSuppressing(): boolean { return this._suppressDepth > 0; }

    /**
     * The most recent completed suppression region — what was dropped, and why.
     * Read by the C13 isolation audit so a drop is evidence, never a silence.
     */
    get lastSuppression(): { reason: string; count: number; byType: Record<string, number> } | null {
        return this._lastSuppression;
    }

    /**
     * Subscribe to store change events.
     * @returns Unsubscribe function — call to remove the listener.
     */
    subscribe(listener: (event: StoreChangeEvent) => void): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * Remove all listeners and reset batch state.
     * Called on engine teardown / test cleanup.
     */
    clear(): void {
        this._listeners.clear();
        this._buffer = [];
        this._batchDepth = 0;
        this._suppressDepth = 0;
        this._suppressedCount = 0;
        this._suppressedByType = {};
        this._lastSuppression = null;
    }

    // ── Backward-Compatible API (for BatchCoordinator — deprecated post-P1.2) ─

    /**
     * Enter batch mode by incrementing the depth counter.
     *
     * @deprecated Prefer `bus.batch(fn)` — it enforces try/finally automatically.
     *   This method is kept for `BatchCoordinator` backward compatibility until P1.2.
     *   Nesting is now safe (depth counter), but exceptions will NOT discard the buffer.
     */
    beginBatch(): void {
        this._batchDepth++;
        console.log(
            `[StoreEventBus] beginBatch() — depth now ${this._batchDepth}. ` + // TODO(TASK-08)
            'Prefer bus.batch(fn) for automatic flush guarantee.'
        );
    }

    /**
     * Decrement depth counter and flush buffer if depth reaches 0.
     *
     * @deprecated Pair with `beginBatch()`. Prefer `bus.batch(fn)` in new code.
     *   Safe to call when depth is already 0 — logs a warning and no-ops.
     */
    endBatch(): void {
        if (this._batchDepth === 0) {
            console.warn('[StoreEventBus] endBatch() called with depth already 0 — no-op.'); // TODO(TASK-08)
            return;
        }
        this._batchDepth--;
        if (this._batchDepth === 0) {
            const count = this._buffer.length;
            this._flush();
            console.log(
                `[StoreEventBus] endBatch() — flushed ${count} buffered event(s) ` + // TODO(TASK-08)
                'in emission order (no coalescing — all events delivered).'
            );
        } else {
            console.log(`[StoreEventBus] endBatch() — depth now ${this._batchDepth}, not flushing yet.`); // TODO(TASK-08)
        }
    }

    /**
     * C13 §3.1 (Wave 35 D1 fix) — Discard all buffered events and reset the
     * batch depth counter to 0 WITHOUT flushing to listeners.
     *
     * Use ONLY in project-isolation teardown (`forceReset()` in BatchCoordinator)
     * where the buffered events belong to a previous project (Project A) and must
     * NOT be delivered to Project B's subscribers.
     *
     * Contrast with `clear()` — `clear()` also removes all listeners; this method
     * only discards the buffer and resets depth, leaving all subscribers intact.
     *
     * Safety:
     *   - Idempotent when depth is already 0 (no-op, no warning).
     *   - Listeners are not touched — all existing subscriptions survive.
     *   - Any pending events are silently dropped (by design for project isolation).
     *
     * Sequence guaranteed by the caller (C13 §4 normative teardown):
     *   1. BatchCoordinator.forceReset() calls this method (when _isBatching=true).
     *   2. resetWallRebuildState() clears the wall pipeline.
     *   3. CW/Slab resumeAndFlush() clears geometry builder pauses.
     *   → Project B's first store event arrives at depth 0 → immediate dispatch. ✅
     */
    discardBatch(): void {
        // §C13-BUS-QUEUE-OWNER (L-713) — a stray buffer at depth 0 is still a queue of
        // undelivered events, and "depth is 0" is not the same fact as "nothing is
        // pending". `endBatchYielded()` splices the buffer out at depth 0, so the two
        // can legitimately disagree. Discard on either.
        if (this._batchDepth === 0 && this._buffer.length === 0) return;
        const count = this._buffer.length;
        this._buffer = [];
        this._batchDepth = 0;
        console.warn(
            `[StoreEventBus] discardBatch() — depth reset 0, ${count} buffered event(s) ` + // TODO(TASK-08)
            'discarded (C13 project-switch — stale Project A events).'
        );
    }

    /**
     * Decrement depth counter and flush the buffered events in chunks across multiple
     * animation frames via the provided scheduler, then call onComplete when done.
     *
     * Motivation: For large batches (e.g. 117 curtain walls → 5,859 buffered events
     * and 20 registered listeners), the synchronous endBatch() loop invokes listeners
     * 116,980 times in one JS task (~500–900 ms visible freeze). endBatchYielded()
     * distributes the work across ~30 pre-render frames (at chunkSize=200), keeping
     * each frame ≤ 16 ms and eliminating the LONGTASK entirely.
     *
     * Ordering invariants (same as endBatch()):
     *  - Events reach listeners in emission order — no coalescing, no drops (§9 guarantee).
     *  - Depth decrements to 0 immediately so new emit() calls after this point
     *    dispatch directly (not buffered into the yielded drain).
     *  - Each chunk is flushed as a single synchronous block (no yield within a chunk).
     *  - onComplete is called exactly once, only after ALL events have been delivered.
     *
     * Layer constraint: StoreEventBus has no knowledge of FrameScheduler (C01 §2 // TODO(TASK-08)
     * layer boundary). The caller (BatchCoordinator) injects the scheduler:
     *   (fn) => getFrameScheduler().scheduleOnce('batch-event-drain', fn, 'pre-render')
     *
     * §BATCH-BUS-DISCARD compatibility: discardAndSuppress() is called by the caller
     * BEFORE endBatchYielded(). The caller's onComplete callback contains both
     * _isBatching=false and restore() — fired AFTER all events are delivered. This
     * preserves the exact three-step ordering required by §BATCH-BUS-DISCARD.
     *
     * @param scheduler   Schedules the next chunk in the next animation frame.
     * @param onComplete  Fired after all events have been delivered to all listeners.
     * @param chunkSize   Events dispatched per frame. Default: 200 (~16ms at 20 listeners).
     *
     * @deprecated Pair with beginBatch(). Prefer bus.batch(fn) in new code.
     */
    endBatchYielded(
        scheduler: (fn: () => void) => void,
        onComplete: () => void,
        chunkSize = 200,
    ): void {
        if (this._batchDepth === 0) {
            console.warn(
                '[StoreEventBus] endBatchYielded() called with depth already 0 — ' + // TODO(TASK-08)
                'calling onComplete() immediately.'
            );
            onComplete();
            return;
        }
        this._batchDepth--;
        if (this._batchDepth > 0) {
            // Nested bracket — not yet the outermost flush.
            console.log(
                `[StoreEventBus] endBatchYielded() — depth now ${this._batchDepth}, ` + // TODO(TASK-08)
                'not flushing yet.'
            );
            onComplete();
            return;
        }

        const total = this._buffer.length;
        if (total === 0) {
            console.log(
                '[StoreEventBus] endBatchYielded() — buffer empty, calling onComplete() immediately.' // TODO(TASK-08)
            );
            onComplete();
            return;
        }

        // Take ownership of the buffer. After splice, _buffer is empty so any new
        // emit() calls (depth is now 0) dispatch immediately — they are NOT interleaved
        // with the yielded drain. This is correct: the batch is logically over; new
        // events are post-batch interactive edits that should be visible immediately.
        const pending = this._buffer.splice(0);
        const totalChunks = Math.ceil(total / chunkSize);
        let offset = 0;
        let chunkIndex = 0;

        const drainNextChunk = () => {
            chunkIndex++;
            const end = Math.min(offset + chunkSize, total);
            const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
            for (let i = offset; i < end; i++) {
                this._dispatch(pending[i]!);
            }
            const frameMs = (
                (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
            ).toFixed(1);
            offset = end;

            if (offset < total) {
                console.log(
                    `[StoreEventBus] endBatchYielded chunk ${chunkIndex}/${totalChunks}: ` + // TODO(TASK-08)
                    `${offset}/${total} events (${frameMs}ms this chunk).`
                );
                scheduler(drainNextChunk);
            } else {
                console.log(
                    `[StoreEventBus] endBatchYielded() — all ${total} event(s) delivered ` + // TODO(TASK-08)
                    `across ${totalChunks} chunk(s) (last: ${frameMs}ms). Calling onComplete().`
                );
                onComplete();
            }
        };

        // Defer even the first chunk so the current frame (which just ran the expensive
        // command loop and registration drain) can render BEFORE any subscriber work fires.
        console.log(
            `[StoreEventBus] endBatchYielded() — ${total} event(s) will be delivered ` + // TODO(TASK-08)
            `in ${totalChunks} chunk(s) of ${chunkSize} via frame scheduler.`
        );
        scheduler(drainNextChunk);
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    /** True while any batch is active (depth > 0). */
    get isBatchMode(): boolean { return this._batchDepth > 0; }

    /** Current batch nesting depth (0 = immediate mode). */
    get batchDepth(): number { return this._batchDepth; }

    /** Number of events buffered since the current batch began. */
    get bufferedCount(): number { return this._buffer.length; }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Flush all buffered events in emission order.
     * Dispatches each event synchronously to all listeners.
     * Listeners that accumulate work via rAF (e.g. DependencyResolver) will
     * naturally deduplicate — all tasks queue before the next rAF fires.
     */
    private _flush(): void {
        const pending = this._buffer.splice(0);
        for (const event of pending) {
            this._dispatch(event);
        }
    }

    /**
     * Dispatch a single event to all registered listeners.
     * Listener errors are caught and logged — one bad listener cannot block others.
     */
    private _dispatch(event: StoreChangeEvent): void {
        this._listeners.forEach(listener => {
            try {
                listener(event);
            } catch (err) {
                console.error('[StoreEventBus] Listener error:', err); // TODO(TASK-08)
            }
        });
    }
}

/** Singleton instance — imported by all ElementStores and BatchCoordinator. */
export const storeEventBus = new StoreEventBus(); // TODO(TASK-08)

// ── ADR-0298 / L-713 — THE EVENT CHANNEL IS A DECLARED ISOLATION SURFACE ─────
//
// Every probe in the declared set until now modelled STATE: a store's contents, a
// viewport's camera seat, a layout's closure variables. The audit asked each of
// them "which project does the state you hold belong to?" and they answered
// honestly — while 74 events naming the previous project's windows sat in a queue
// nobody modelled, and were delivered milliseconds later. The stores really were
// clean at the moment they were asked.
//
// ⚠ A LEAK CAN LIVE IN AN UNDELIVERED MESSAGE, NOT ONLY IN A HELD VALUE. That is
// the fourth variant of this family (L-676 no owner → L-694 wrong property →
// L-711 incomplete expected set → L-713 unmodelled CHANNEL), and it is why the
// declaration now covers the bus.
//
// WHAT THIS PROBE CAN AND CANNOT SEE — stated, because the whole point of ADR-0298
// is that a probe's honesty is about its own model. A `StoreChangeEvent` carries
// no projectId (`StoreChangeEvent` above: elementId / elementType / operation /
// timestamp), so this probe CANNOT attribute queued events to a project. What it
// CAN do is refuse to certify a bus that is still mid-flight when a project claims
// to have finished loading: at `pryzm-project-loaded` the batch bracket opened by
// `ProjectLoader` has already been closed in its `finally`, so a non-zero depth or
// a non-empty buffer at audit time means a bracket outlived the load that owns it.
// It answers with the project that just loaded — "I am holding events, and I
// cannot tell you whose" — which the audit reports rather than passes.
//
// TEARDOWN OWNERSHIP IS DELIBERATELY NOT HERE (`ownsTeardown: false` in the
// declaration). A `projectScopeRegistry` entry would be invoked by
// `ClearProjectCommand.clearAll()`, which runs INSIDE `ProjectLoader`'s open
// bracket — discarding there would reset the depth mid-load and strand every
// subsequent create event. The queue's switch-time owner is
// `BatchCoordinator.forceReset()`, which runs before any bracket is opened.
registerProjectScopeProbe({
    scope: STORE_EVENT_BUS_SCOPE,
    owningProjectId: () => (
        (storeEventBus.batchDepth > 0 || storeEventBus.bufferedCount > 0)
            ? BUS_IN_FLIGHT_UNATTRIBUTED
            : null
    ),
    describe: () => ({
        batchDepth: storeEventBus.batchDepth,
        bufferedCount: storeEventBus.bufferedCount,
        // The teardown drop is REPORTED even when the bus is clean: a suppression
        // that happened is part of what the audit inspected, and an exclusion you
        // cannot count is a check you deleted.
        lastSuppression: storeEventBus.lastSuppression,
    }),
});
