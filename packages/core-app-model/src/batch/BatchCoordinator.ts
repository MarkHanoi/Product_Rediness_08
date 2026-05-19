/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Coordination Service (cross-cutting)
 * Phase:             Phase 6 — Global Batch Coordination
 *                    Step 2 — Buffered Registration Architecture
 *                    P1.2 — Wire BatchCoordinator to bus.batch()
 *                    P1.4 — §BATCH-EVENT-YIELD: yielded event drain
 *                    Performance — Curtain Wall Batch Optimisation
 * Files Modified:    src/core/batch/BatchCoordinator.ts
 * Classification:    A
 *
 * Original Purpose (Phase 6):
 *   Singleton gating authority that eliminates the "avalanche" failure mode where
 *   bulk-creation commands (CreateCurtainWallsOnAllSlabsCommand) trigger cascading
 *   secondary events: REDETECT_ROOMS flooding, ConstraintEngine re-validation on
 *   every incomplete intermediate state, and geometry leaks from overlapping room
 *   rebuild cycles.
 *
 * Step 2 — Buffered Registration Architecture:
 *   beginBatch() calls storeEventBus.beginBatch() to buffer all global bus events.
 *   _executeFinalSweep() closes the bracket to flush all events once geometry is stable.
 *
 * P1.2 — Wire to bus.batch():
 *   Problem: The old `beginBatch()` API required callers to manually call it and rely
 *   on the async _executeFinalSweep() to close the bus bracket. If the command threw
 *   before _executeFinalSweep() ran, the bus remained permanently stuck in batch mode
 *   (depth never returned to 0), silently dropping all future events.
 *
 *   Fix — `runBatch<T>(fn, opts)`:
 *     A new safe entry point that exploits P1.1's depth-counting StoreEventBus: // TODO(TASK-08)
 *
 *     Depth flow (normal execution):
 *       runBatch() calls storeEventBus.beginBatch()    → depth: 0 → 1  (outer async bracket)
 *       runBatch() calls storeEventBus.batch(fn)       → depth: 1 → 2  (sync mutation bracket)
 *       fn() runs — all store.add() calls buffered     → depth stays 2
 *       storeEventBus.batch(fn) returns                → depth: 2 → 1  (no flush — outer bracket open)
 *       ... async rAF registration drain ...
 *       _executeFinalSweep() → endBatchYielded()       → depth: 1 → 0 → yielded drain begins
 *       ... ~30 'pre-render' frames of 200 events each ...
 *       onComplete fires: _isBatching=false → restore() → P1.3 → REDETECT_ROOMS
 *
 *     Depth flow (fn() throws):
 *       storeEventBus.batch(fn) catch: buffer discarded, depth: 2 → 1 (not 0, no flush)
 *       runBatch() catch: storeEventBus.endBatch()    → depth: 1 → 0 → _flush() on empty buffer
 *       _isBatching reset to false; exception re-thrown
 *       → Bus is clean; no events dropped or leaked; no stuck batch mode.
 *
 *   `beginBatch()` is kept as a public method for backward compatibility but is
 *   now deprecated — call `runBatch(fn, opts)` in all new code.
 *
 * P1.4 — §BATCH-EVENT-YIELD: Yielded event drain (2026-05-04):
 *   Problem: For 117 curtain walls, storeEventBus.endBatch() dispatched 5,859 events ×
 *   20 registered listeners = 116,980 synchronous listener calls in one JS task
 *   (~500–900 ms LONGTASK), producing a visible "frozen UI" on every curtain-wall batch.
 *
 *   Fix — `storeEventBus.endBatchYielded(scheduler, onComplete, chunkSize=200)`:
 *     _executeFinalSweep() now calls endBatchYielded() instead of endBatch().
 *     The drain is distributed across ~30 FrameScheduler 'pre-render' frames (200
 *     events/frame, ≤ 16 ms each). The FrameScheduler is injected as a callback
 *     — StoreEventBus has no @pryzm/frame-scheduler import (C01 §2 layer boundary). // TODO(TASK-08)
 *     All post-flush logic (_isBatching=false, restore(), P1.3, PERF-FIX-3, REDETECT_ROOMS)
 *     runs inside onComplete, preserving §BATCH-BUS-DISCARD ordering exactly.
 *
 * PERF-DEFER-RESUME-FLUSH (Curtain Wall Batch Optimisation):
 *   Problem: The three resumeAndFlush() calls (wall, curtain-wall, slab) ran synchronously
 *   on the main thread immediately after storeEventBus.batch(fn) returned (~50–200 ms
 *   LONGTASK each for a 400-wall project).  This blocked the first render frame and made
 *   the total elapsed time additive with the batch itself.
 *
 *   Fix — defer all three calls plus the watchdog start into a single 'pre-render'
 *   FrameScheduler slot that executes just before the next GPU draw:
 *     - runBatch() stores the scheduleOnce disposer in `_resumeFlushDispose`.
 *     - The watchdog timer starts INSIDE the deferred callback, not before — so it
 *       counts only from when the drain actually begins, not from when runBatch() returns.
 *     - If forceReset() fires before the deferred callback runs (project switch), the
 *       disposer is invoked to cancel it and all three resumeAndFlush() are called
 *       immediately as cleanup so builder pauses are never left dangling.
 *   Estimated saving: 50–200 ms removed from the critical path (moved to next rAF slot).
 *
 * Contract Compliance:
 *   - §01 §2.7 (Builder Isolation): Unchanged.
 *   - §01 §2.1 (Single Source of Mutation): Unchanged — coordinator never mutates stores.
 *   - §01 §5 (No Side Effects): All new side effects are explicit, logged, deterministic.
 *   - §9 Master Architecture — "No Event Drops": Preserved — endBatchYielded() delivers
 *     all events in emission order with no coalescing; onComplete fires after final chunk.
 *
 * Impact Assessment:
 *   StoreEventBus Impact:   Yes — endBatchYielded() added; endBatch() untouched (error path). // TODO(TASK-08)
 *   Shadow Map Impact:      No change — shadow reactivation callback fires in onComplete.
 *   Semantic Impact:        No — no store reads or writes.
 *   Undo/Redo Impact:       No — undo() path does not call runBatch() or beginBatch().
 *
 * Change: Added `_resumeFlushDispose` field; deferred three resumeAndFlush() calls +
 *         watchdog into a single FrameScheduler 'pre-render' slot; updated forceReset()
 *         to cancel and flush on project switch; updated error path for consistency.
 *
 * Risk Level: Low — purely additive to StoreEventBus; _executeFinalSweep() behaviour // TODO(TASK-08)
 *   is identical to the synchronous path but distributed across frames.
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { viewDependencyTracker } from '../views/ViewDependencyTracker';
import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop';

export interface BatchOptions {
    /** Level IDs affected by the batch — used for the final REDETECT_ROOMS sweep. */
    levelIds: string[];
    /**
     * Total number of elements that will be added to the store during this batch.
     * Used by CurtainWallBuilder to know when the rAF queue is fully drained.
     */
    totalElementCount: number;
    /**
     * §FIX-SKIP-REDETECT-ROOMS (2026-05-05): When true, `_executeFinalSweep()`
     * skips the `rooms.redetect` command for all affected levels.
     *
     * Set this for element types that cannot define room boundaries (e.g. curtain
     * walls, furniture, beams) so the O(n²) room-boundary detection algorithm does
     * not run unnecessarily.  For an 11-slab / 121-curtain-wall project the sweep
     * produced 0 new rooms yet cost 12,738 ms + 1,271 ms + 9 × ~1,000 ms ≈ 23 s
     * of main-thread LONGTASKs.
     *
     * `markLevelsDirty(levelIds)` is still called so plan-view reprojection
     * (EdgeProjectorService) updates the 2D floor plan with the new geometry.
     */
    skipRedetectRooms?: boolean;
    /**
     * §FIX-SKIP-PBR-UPGRADE (2026-05-05): When true, the post-batch PBR upgrade
     * pass (scene.traverse + needsUpdate=true per chunk across post-render frames)
     * is skipped entirely.
     *
     * Set this when the batch creates elements whose materials are already
     * PBR-ready (e.g. curtain walls use MeshStandardMaterial directly). The
     * upgrade pass measured ~482 ms for 626 meshes even after the chunk fix —
     * skipping it for curtain-wall batches eliminates this cost with no visual
     * regression.
     */
    skipPbrUpgrade?: boolean;
}

/**
 * §II-2 (Sprint 3): Typed control surfaces for the three builder pipelines.
 * BatchCoordinator used to read `window.__*RebuildControl` at 14 call sites —
 * silently inert when builder init order changed or pre-initScene calls arrived.
 * These minimal interfaces cover only the methods BatchCoordinator actually calls.
 * Instances are injected via `registerBuilderControls()` (called from engineLauncher
 * after all three builders are initialised). `window.__*RebuildControl` remains on
 * `window` as a DEV-only debug surface but is no longer read inside this file.
 */
interface WallBuilderControl {
    pause(): void;
    /** §F.2 — async-schedule the wall flush instead of running synchronously. */
    resume(): void;
    /** @deprecated Use `resume()` (§F.2).  Kept for ProjectLoader direct calls. */
    resumeAndFlush(): void;
    discardAndSuppress(): void;
    restore(): void;
}

interface CurtainWallBuilderControl {
    pause(): void;
    /** §F.2 — schedule the CW drain via FrameScheduler (async). */
    resume(): void;
    /** @deprecated Use `resume()` (§F.2).  Kept for backward compat. */
    resumeAndFlush(): void;
}

interface SlabBuilderControl {
    pause(): void;
    /** §F.2 — schedule the slab drain via FrameScheduler (async). */
    resume(): void;
    /** @deprecated Use `resume()` (§F.2).  Kept for backward compat. */
    resumeAndFlush(): void;
}

class BatchCoordinatorImpl {
    // ── Public State ──────────────────────────────────────────────────────────
    // TODO(C13.G2) — resolved by Wave 35 I-1: forceReset() now resets all batch state for project isolation.
    private _isBatching = false;
    get isBatching(): boolean { return this._isBatching; }

    /**
     * C13 §3.1 — Number of deferred BimManager registrations still queued.
     * Read by the `project.session.teardown` OTel span in engineLauncher
     * (I-5) so the span can report how many registrations were discarded
     * by a mid-batch project switch.
     */
    get pendingRegistrationCount(): number { return this._registrationQueue.length; }

    // ── Internal State ────────────────────────────────────────────────────────
    /** Level IDs that need a REDETECT_ROOMS call after batch completes. */
    private _pendingLevelIds = new Set<string>();
    /** Deferred BimManager.registerElement() + elementRegistry.registerSemantic() calls. */
    private _registrationQueue: Array<() => void> = [];
    /**
     * C13 §3.1 (Wave 35 I-1) — Set to `true` by `forceReset()` so that any
     * in-flight `_executeFinalSweep` frame-scheduled callbacks (`tickNextLevel`)
     * detect the cancellation on their next rAF tick and bail out without
     * dispatching `rooms.redetect` for the stale Project A level IDs.
     *
     * Reset to `false` via `Promise.resolve().then()` inside `forceReset()`
     * so the flag is cleared AFTER the current synchronous call stack
     * (including any in-flight microtask from `_executeFinalSweep`) has
     * seen it — allowing future batches in Project B to run normally.
     */
    private _sweepCancelled = false;
    /**
     * §FIX-SKIP-REDETECT-ROOMS (2026-05-05): When true, _executeFinalSweep() skips the
     * rooms.redetect command for all affected levels.  Set via BatchOptions.skipRedetectRooms.
     * Reset to false in forceReset() so project switches always start with a clean flag.
     */
    private _skipRedetectRooms = false;
    /**
     * §FIX-SKIP-PBR-UPGRADE (2026-05-05): When true, the post-batch PBR upgrade pass
     * is skipped. Set via BatchOptions.skipPbrUpgrade. Read by initScene.ts
     * setPostBatchCallback guard. Reset to false in forceReset() for clean project switches.
     */
    private _skipPbrUpgrade = false;

    /** Read by initScene.ts setPostBatchCallback to skip the PBR scene-traverse pass. */
    get skipPbrUpgrade(): boolean { return this._skipPbrUpgrade; }
    /** Number of elements added to store during batch (used to pace rAF registration drain). */
    private _totalElementCount = 0;
    /**
     * Disposer for the registration-drain frame-scheduler subscription.
     *
     * Wave 7 S85.D-finish.4 (2026-04-30 evening): replaces the prior
     * `_regRafHandle: number | null` field that stored a raw `rAF()` id.
     * The drain pump now uses `getFrameScheduler().scheduleOnce(
     *   'batch-coordinator-drain', cb, 'pre-render')` and re-arms itself
     * by calling `scheduleOnce` again from inside `_drainRegistrations()`
     * for as long as `_registrationQueue.length > 0`. `_setupBatch()`
     * cancels any in-flight drain by invoking the disposer.
     *
     * `'pre-render'` priority: registrations must complete BEFORE the
     * frame's render pass so the scene graph is stable when geometry
     * draws. This matches the pre-D.7.4 behaviour (rAF callback ran
     * before the next frame's paint).
     */
    private _regDrainDispose: import('@pryzm/frame-scheduler').TickListenerDisposer | null = null;
    /** Max registrations processed per rAF frame (keeps UI responsive). */
    static readonly REG_PER_FRAME = 8;
    /**
     * §REG-MANY-P2: If the registration queue has ≤ this many entries when
     * `signalBuildQueueDrained()` fires, drain all registrations synchronously
     * in a single call instead of spreading across REG_PER_FRAME rAF frames.
     *
     * Context: After the §REG-MANY-P1 fix in `CreateCurtainWallsOnAllSlabsCommand`,
     * the queue shrinks from N (one per wall) to L (one per unique level group).
     * For a 21-slab / 231-wall reference project: L ≤ 21 entries.
     *   Before P1 fix: 231 entries → ⌈231/8⌉ = 29 rAF frames ≈ 462 ms.
     *   After  P1 fix: ≤21 entries → sync drain ≈ 2 ms (0 rAF overhead).
     *
     * Threshold = 50 is generous: even a 400-wall project across 50 distinct
     * levels produces at most 50 level-group entries after the P1 fix.
     * The rAF drain path remains fully functional for queue sizes above the threshold.
     */
    static readonly SYNC_DRAIN_THRESHOLD = 50;
    /**
     * PERF-FIX-3: Window events deferred during batch.
     * Commands call `trackPostBatchWindowEvent(name)` instead of dispatching directly.
     * _executeFinalSweep() fires each unique event exactly once after all geometry
     * and registrations are complete — replacing N per-wall dispatches with 1.
     * Set<string> deduplicates: 44 calls tracking 'bim-curtainwall-added' → 1 dispatch.
     */
    private _postBatchWindowEvents = new Set<string>();
    /**
     * Watchdog: if signalBuildQueueDrained() is never called (e.g. FrameScheduler adapter
     * is null so wakeIfStopped() is inert → rAF drain never fires), force-complete the
     * batch after 30 s to prevent storeEventBus from being permanently stuck at depth 1.
     * Set INSIDE the deferred _resumeFlushDispose callback (not synchronously in runBatch)
     * so the countdown starts when the drain actually begins, not when fn() returned.
     * Cancelled by signalBuildQueueDrained() on the happy path and by forceReset() on
     * project switch.
     */
    private _watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * PERF-DEFER-RESUME-FLUSH: Disposer for the 'pre-render' FrameScheduler slot that
     * calls the three resumeAndFlush() methods (wall, curtain-wall, slab) and starts the
     * watchdog timer after runBatch(fn) returns.
     *
     * Stored so forceReset() can cancel the deferred callback if a project switch fires
     * before it runs. On cancellation forceReset() calls all three resumeAndFlush()
     * immediately so builder pauses are never left dangling indefinitely.
     *
     * Set to non-null by runBatch() on the normal exit path; cleared to null by:
     *   - the deferred callback itself (after it executes),
     *   - the fn()-threw error path (scheduleOnce was never called in that path),
     *   - forceReset() (project switch — explicit cancel + immediate flush).
     */
    private _resumeFlushDispose: import('@pryzm/frame-scheduler').TickListenerDisposer | null = null;

    /**
     * §II-2 (Sprint 3): Typed builder control surfaces — injected once by
     * `registerBuilderControls()` after engineLauncher finishes wiring all three
     * builders. Using private fields instead of `window.__*RebuildControl` reads:
     *   • TypeScript catches missing methods at compile time.
     *   • Silent no-ops on window-global reads are replaced by a visible undefined check.
     *   • The dependency is explicit and testable without a window mock.
     */
    private _wallControl:  WallBuilderControl        | undefined = undefined;
    private _cwControl:    CurtainWallBuilderControl | undefined = undefined;
    private _slabControl:  SlabBuilderControl        | undefined = undefined;

    /**
     * P9-W4 — Factory for the legacy REDETECT_ROOMS command path.
     *
     * Injected via `setLegacyRedetectRoomsFactory()` from engineLauncher after
     * ReDetectRoomsCommand is available.  Replaces the old `import('../../commands')`
     * dynamic import which cannot resolve from the packages/ layer.
     *
     * When `_runtime` is available the bus path runs instead; this factory fires
     * only on the fallback path (runtime not yet injected or 'rooms.redetect'
     * not registered in the bus).
     *
     * Structural interface: BatchCoordinator holds only the factory call shape,
     * keeping it decoupled from the concrete command class (C01 §2 layer boundary).
     */
    private _legacyRedetectFactory: ((levelId: string, elevation: number, height: number) => any) | null = null;

    /**
     * §E.1 — Optional YjsDocAdapter reference for CRDT blackout window instrumentation.
     * Injected via `registerYjsDocAdapter()` (called from engineLauncher after sync
     * client init).  When present, BatchCoordinator fires `onBatchWindowOpen` at batch
     * start and `onBatchWindowClose` at onComplete so the adapter can record how long
     * the CRDT pipeline was inactive during a bulk-creation batch.
     * Uses a structural interface to avoid importing from @pryzm/sync-client directly —
     * keeping BatchCoordinator decoupled from the sync layer (Invariant I-2).
     */
    private _yjsDocAdapter: {
        onBatchWindowOpen?:  (info: { batchId: string; startMs: number }) => void;
        onBatchWindowClose?: (info: { batchId: string; blackoutMs: number; elementCount: number }) => void;
    } | null = null;

    /**
     * §PERF-TRACE: Wall-clock time (performance.now()) when the current batch started
     * via _setupBatch(). Used to compute "elapsed since batch start" in every subsequent
     * log line so console recordings can be read without mental subtraction.
     * Reset to 0 in forceReset().
     */
    private _batchStartTime = 0;

    /**
     * §A.6 / §D.1 — 8-character UUID prefix for the current batch.
     * Set by _setupBatch(), exposed on window.__activeBatchId for cross-module
     * diagnostic log threading (all log lines for one batch share this prefix).
     * Cleared to '' by forceReset() and on batch completion.
     */
    private _currentBatchId = '';
    /** Injected by EngineBootstrap — needed to fire ReDetectRoomsCommand. */
    private _commandManager: { execute(cmd: any): any } | null = null;
    private _bimManager: { getLevelById(id: string): any } | null = null;
    /**
     * E.5.x (P1) — When the composed PryzmRuntime is available and the
     * 'rooms.redetect' handler is registered in the bus, _executeFinalSweep()
     * uses runtime.bus.executeCommand('rooms.redetect', ...) with frame yields
     * instead of the legacy imperative dispatch path (commandManager — see F1 batch).
     * Falls back to the PRYZM 1 path when null.
     */
    private _runtime: {
        bus: {
            executeCommand(type: string, payload: unknown): unknown;
            registry: Pick<ReadonlyMap<string, unknown>, 'has'>;
        };
    } | null = null;

    /**
     * Optional callback fired AFTER the final REDETECT_ROOMS sweep completes.
     * Receives the set of level IDs that were processed.
     */
    private _onFinalSweepComplete: ((levelIds: string[]) => void) | null = null;

    /**
     * Optional callback fired AFTER registrations drain and BEFORE REDETECT_ROOMS.
     * Used by CurtainWallBuilder to re-enable castShadow/receiveShadow on walls
     * that were built in "shadow-deferred" mode during the batch.
     *
     * Running shadow reactivation here (not at endBatch) ensures:
     *   1. All geometry is in the scene — shadow rays have geometry to hit.
     *   2. All registrations are complete — no concurrent BimManager writes.
     *   3. Shadow map recalculation is one pass over all new walls (not 126 passes).
     */
    /**
     * §II-3 (Sprint 2): Set pattern replaces single-slot callback. Multiple
     * CurtainWallBuilder instances (e.g. during project-switch overlap) can
     * each register without the later constructor overwriting the earlier one.
     * Builders call removeShadowReactivationCallback(cb) in dispose().
     */
    private _shadowReactivationCallbacks: Set<() => void> = new Set();

    /**
     * P1.3: Optional callback fired in _executeFinalSweep() immediately after
     * storeEventBus.endBatch() flushes all buffered events — before REDETECT_ROOMS.
     *
     * Used by initScene to run geometry-added handlers (shadow flag pass, PBR upgrade)
     * exactly ONCE per batch instead of once per element. The per-element window event
     * handlers (`bim-*-added`) are gated with `batchCoordinator.isBatching` and skipped
     * during the batch; this callback fires the equivalent single pass at batch-end.
     *
     * Timing guarantees:
     *   1. All geometry is in the scene (signalBuildQueueDrained + registrations done).
     *   2. All registrations are complete.
     *   3. storeEventBus is fully flushed — DependencyResolver rebuilds are queued.
     *
     * Only one callback is supported; subsequent calls replace the previous one.
     */
    private _onPostBatch: (() => void) | null = null;

    /**
     * UX — Batch Loading Indicator lifecycle callbacks.
     *
     * `_onBatchStart(elementCount)` fires at the end of `_setupBatch()` so the
     * indicator appears as soon as the batch is live.
     *
     * `_onBatchEnd()` fires in three places:
     *   1. `_executeFinalSweep()` onComplete — normal happy path.
     *   2. `forceReset()` — project switch while a batch is in progress.
     *   3. `runBatch()` error path — fn() threw, batch aborted.
     *
     * Errors in callbacks are caught; indicator failures must never disrupt batching.
     */
    private _onBatchStart: ((elementCount: number) => void) | null = null;
    private _onBatchEnd: (() => void) | null = null;
    /** §FIX-GPU-COMPILE-LABEL: fires just before the first post-suppress render frame. */
    private _onGpuCompileStart: (() => void) | null = null;

    // ── Injection (called once from EngineBootstrap after initScene) ──────────
    inject(
        commandManager: { execute(cmd: any): any },
        bimManager: { getLevelById(id: string): any },
        runtime?: {
            bus: {
                executeCommand(type: string, payload: unknown): unknown;
                registry: ReadonlyMap<string, unknown>;
            };
        } | null,
    ): void {
        this._commandManager = commandManager;
        this._bimManager = bimManager;
        this._runtime = runtime ?? null;
    }

    /**
     * P9-W4 — Register the factory for the legacy REDETECT_ROOMS command path.
     *
     * Call once from engineLauncher after ReDetectRoomsCommand is available.
     * The factory receives (levelId, elevation, height) and returns a command
     * object that `commandManager.execute()` can run.
     *
     * This replaces the old `import('../../commands')` dynamic import so that
     * BatchCoordinator remains decoupled from the src/ command layer (C01 §2).
     *
     * @param factory  `(levelId, elevation, height) => ReDetectRoomsCommand`
     */
    setLegacyRedetectRoomsFactory(factory: (levelId: string, elevation: number, height: number) => any): void {
        this._legacyRedetectFactory = factory;
    }

    /**
     * §II-2 (Sprint 3): Register the three builder control surfaces so
     * BatchCoordinator can call pause / resumeAndFlush / discardAndSuppress / restore
     * through typed private fields rather than reading `window.__*RebuildControl`
     * at each of its 14 call sites.
     *
     * Call once from `engineLauncher.ts` after all three builders are initialised
     * (i.e. after `window.__wallRebuildControl`, `window.__curtainWallRebuildControl`,
     * and `window.__slabRebuildControl` have all been assigned).
     *
     * Idempotent — safe to call again on hot-reload or test re-initialisation.
     */
    registerBuilderControls(
        wall: WallBuilderControl        | undefined,
        cw:   CurtainWallBuilderControl | undefined,
        slab: SlabBuilderControl        | undefined,
    ): void {
        this._wallControl  = wall;
        this._cwControl    = cw;
        this._slabControl  = slab;
        console.log(
            '[BatchCoordinator] §II-2 registerBuilderControls() — ' +
            `wall=${!!wall} cw=${!!cw} slab=${!!slab}`
        );
    }

    /**
     * §E.1 — Register a YjsDocAdapter (structural interface) for CRDT blackout
     * window instrumentation.  Called from engineLauncher after the sync client
     * is initialised.  No-op if the adapter is null (offline / no sync session).
     *
     * Structural interface keeps BatchCoordinator decoupled from @pryzm/sync-client.
     */
    registerYjsDocAdapter(adapter: {
        onBatchWindowOpen?:  (info: { batchId: string; startMs: number }) => void;
        onBatchWindowClose?: (info: { batchId: string; blackoutMs: number; elementCount: number }) => void;
    } | null): void {
        this._yjsDocAdapter = adapter;
    }

    /**
     * Register a callback that fires once after every batch's final REDETECT_ROOMS
     * sweep completes.  Receives the set of level IDs affected by the batch.
     *
     * Only one callback is supported; subsequent calls replace the previous one.
     */
    setFinalSweepCallback(cb: (levelIds: string[]) => void): void {
        this._onFinalSweepComplete = cb;
    }

    /**
     * Register a callback that fires after the registration drain and before
     * REDETECT_ROOMS — used by CurtainWallBuilder to re-enable shadows on all
     * walls that were built in shadow-deferred mode during the batch.
     *
     * §II-3 (Sprint 2): multiple callbacks supported via Set.
     * Builders register on construction and deregister on dispose().
     */
    addShadowReactivationCallback(cb: () => void): void {
        this._shadowReactivationCallbacks.add(cb);
    }

    /**
     * §II-3 (Sprint 2): Remove a previously registered shadow-reactivation
     * callback. Called by CurtainWallBuilder.dispose() to ensure a torn-down
     * builder's callback is never invoked on a subsequent batch.
     */
    removeShadowReactivationCallback(cb: () => void): void {
        this._shadowReactivationCallbacks.delete(cb);
    }

    /**
     * P1.3: Register a callback that fires immediately after storeEventBus.endBatch()
     * flushes all events in _executeFinalSweep() — before REDETECT_ROOMS commands.
     *
     * Used by initScene to run the geometry-added pass (shadow flags + PBR upgrade)
     * exactly once per batch instead of once per element. The per-element window event
     * handlers (`bim-*-added`) are gated with `batchCoordinator.isBatching`; this
     * callback fires the equivalent single pass when the bus bracket closes.
     *
     * Only one callback is supported; subsequent calls replace the previous one.
     */
    setPostBatchCallback(cb: () => void): void {
        this._onPostBatch = cb;
    }

    /**
     * Wire a batch loading indicator to show progress during heavy batch operations
     * (e.g. curtain walls by slab profiles, AI floor plan generation).
     *
     * `onStart(elementCount)` fires when the batch begins — show the indicator.
     * `onEnd()` fires when the batch completes or is force-reset — hide it.
     *
     * Errors in callbacks are caught and logged; indicator failures must never
     * disrupt batch coordination or store mutations.
     *
     * Only one pair of callbacks is supported; subsequent calls replace the previous.
     */
    setBatchLifecycleCallbacks(
        onStart: (elementCount: number) => void,
        onEnd: () => void,
    ): void {
        this._onBatchStart = onStart;
        this._onBatchEnd = onEnd;
    }

    /**
     * §FIX-GPU-COMPILE-LABEL: Wire a callback that fires immediately before
     * the first render frame (when the WebGPU PSO LONGTASK is about to begin).
     * Used to update the BatchLoadingIndicator label from "Building elements…"
     * to "Compiling GPU shaders…" so the user has context during the freeze.
     *
     * Only one callback is supported; subsequent calls replace the previous.
     */
    setGpuCompileStartCallback(cb: () => void): void {
        this._onGpuCompileStart = cb;
    }

    /**
     * PERF-FIX-3: Defer a window CustomEvent to fire once after batch completes.
     *
     * Call this from commands instead of `window.dispatchEvent()` when `isBatching`
     * is true. _executeFinalSweep() will dispatch each unique event name exactly once
     * after all geometry, registrations, storeEventBus flush, and _onPostBatch are
     * complete — replacing N per-element dispatches with a single consolidated pass.
     *
     * If called outside a batch, the event is dispatched immediately as a fallback
     * (same behaviour as direct window.dispatchEvent).
     *
     * @param eventName  The CustomEvent name (e.g. 'bim-curtainwall-added').
     * @param detail     Optional detail payload for the single post-batch dispatch.
     */
    trackPostBatchWindowEvent(eventName: string, detail?: Record<string, unknown>): void {
        if (!this._isBatching) {
            window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined)); // TODO(TASK-15)
            return;
        }
        this._postBatchWindowEvents.add(eventName);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Safe entry point for bulk-creation commands (P1.2).
     *
     * Wraps the synchronous store-mutation phase in `storeEventBus.batch(fn)` while
     * keeping the outer async bracket open via `storeEventBus.beginBatch()`. The bus
     * only flushes when the async registration drain completes in `_executeFinalSweep()`.
     *
     * Depth-counting flow:
     *   beginBatch()          → storeEventBus depth: 0 → 1  (outer bracket — async)
     *   storeEventBus.batch() → storeEventBus depth: 1 → 2  (inner bracket — synchronous)
     *   fn() runs             → store mutations buffered at depth 2
     *   batch(fn) returns     → storeEventBus depth: 2 → 1  (no flush — outer still open)
     *   … rAF registration drain …
     *   _executeFinalSweep()  → storeEventBus depth: 1 → 0  → FLUSH all events
     *
     * Exception safety:
     *   If fn() throws, storeEventBus.batch() discards the buffer (depth 2→1).
     *   runBatch() catch block then calls storeEventBus.endBatch() (depth 1→0, empty flush).
     *   _isBatching is reset. The exception is re-thrown. Bus is clean.
     *
     * @param fn    The synchronous store-mutation work to run inside the batch.
     * @param opts  Level IDs and element count for the final REDETECT_ROOMS sweep.
     * @returns     The return value of fn().
     */
    runBatch<T>(fn: () => T, opts: BatchOptions): T {
        if (this._isBatching) {
            console.warn('[BatchCoordinator] runBatch called while already batching — nesting not supported. Running fn() without batch guards.');
            return fn();
        }

        // Set up coordinator state (same as old beginBatch, factored out).
        this._setupBatch(opts);

        // Open the outer async bracket: depth 0 → 1.
        // This bracket stays open until _executeFinalSweep() closes it.
        storeEventBus.beginBatch();

        try {
            // Inner synchronous bracket: depth 1 → 2 during fn(), 2 → 1 after.
            // Does NOT flush on return (depth returns to 1, not 0).
            // Does NOT flush on throw (buffer discarded, depth returns to 1).
            const result = storeEventBus.batch(fn);

            // PERF-DEFER-RESUME-FLUSH: Defer the three resumeAndFlush() calls plus the
            // watchdog start into the next 'pre-render' FrameScheduler slot so they do
            // not run synchronously on the main thread immediately after storeEventBus.batch()
            // returns.  runBatch() returns to its caller right away (before the builders
            // process their paused queues), freeing the main thread for React reconciliation
            // and browser housekeeping.  The actual flush fires just before the next GPU
            // draw, which is the earliest moment the rebuilt geometry is needed.
            //
            // Rationale for 'pre-render' (not 'post-render'):
            //   resumeAndFlush() queues geometry builds via _pendingBuildsMap → rAF drain.
            //   The builds themselves are asynchronous (spread across post-render frames by
            //   the builder's own loop).  Scheduling here in 'pre-render' ensures the drain
            //   kick-off happens BEFORE the first frame that would show the new walls, so
            //   there is no "invisible frame" where the store has walls but the scene does not.
            //
            // Watchdog starts INSIDE the callback — it counts time from when the drain
            // begins (not from when runBatch returns) so it does not fire prematurely if
            // the FrameScheduler is momentarily idle (e.g. tab in background).
            // BN-07: capture queue time so the callback can warn if firing was delayed
            // beyond 2s by a concurrent requestIdleCallback storm (e.g. 126-chunk PBR
            // traversal from a prior slab batch). Delay > 2s indicates cross-batch
            // interference that should be investigated; it does not indicate a bug in this
            // path but surfaces regressions if BN-06's skipPbrUpgrade is accidentally removed.
            const _resumeQueuedAt = performance.now();
            this._resumeFlushDispose = getFrameScheduler().scheduleOnce(
                'batch-coordinator-resume-flush',
                () => {
                    this._resumeFlushDispose = null;
                    const __t_resume = performance.now();
                    // BN-07: Starvation warning — if DEFERRED-RESUME-FLUSH fired more than
                    // 2000ms after being registered, the main thread was blocked by a
                    // concurrent task storm (PBR chunks, PSO compile, etc.).
                    const _resumeDelay = __t_resume - _resumeQueuedAt;
                    if (_resumeDelay > 2000) {
                        console.warn(
                            `[BatchCoordinator] §BN-07 §WARN DEFERRED-RESUME-FLUSH delayed ` +
                            `${_resumeDelay.toFixed(0)}ms after being registered — ` +
                            `main thread was blocked (PBR chunks? PSO compile? requestIdleCallback storm?). ` +
                            `Check for a concurrent batch whose skipPbrUpgrade=false is causing ` +
                            `a scene-wide traverse to fire during this batch's critical window.`
                        );
                    } else if (_resumeDelay > 500) {
                        // §D.3 — Sub-critical warning: main thread under pressure but
                        // not stalled. Normal during large PBR upgrades or PSO compiles.
                        console.warn(
                            `[BatchCoordinator] §BN-07-WARN DEFERRED-RESUME-FLUSH delayed ` +
                            `${_resumeDelay.toFixed(0)}ms — main thread may be under pressure ` +
                            `(normal if large PBR upgrade running).`,
                        );
                    }
                    console.log(
                        `[BatchCoordinator] §TRACE DEFERRED-RESUME-FLUSH fired ` +
                        `(first rAF after runBatch returned) delay=${_resumeDelay.toFixed(1)}ms ` +
                        `T=+${(__t_resume - this._batchStartTime).toFixed(1)}ms`
                    );

                    // §BATCH-WALL-PAUSE resume (§F.2): fn() completed — all wall.add() events
                    // are accumulated in _pendingWallEvents. resume() schedules ONE async
                    // FrameScheduler 'pre-render' slot for _flushWallRebuild, preventing a
                    // synchronous O(n²) WallJoinResolver LONGTASK in this pre-render slot.
                    try {
                        this._wallControl?.resume();
                    } catch (e) {
                        console.warn('[BatchCoordinator] §BATCH-WALL-PAUSE: resume failed:', e);
                    }

                    // §BATCH-CW-PAUSE resume (§F.2): transfer all curtain walls buffered
                    // during pause into _pendingBuildsMap and schedule ONE rAF drain.
                    try {
                        this._cwControl?.resume();
                    } catch (e) {
                        console.warn('[BatchCoordinator] §BATCH-CW-PAUSE: curtainWall resume failed:', e);
                    }
                    console.log(
                        `[BatchCoordinator] §TRACE RESUME-FLUSH-DISPATCHED ` +
                        `wallResume+cwResume+slabResume called. CW rAF drain now in-flight. ` +
                        `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                    );

                    // §BATCH-SLAB-PAUSE resume (§F.2): transfer all slabs buffered during
                    // pause into _pendingBuilds and schedule ONE async rAF drain.
                    try {
                        this._slabControl?.resume();
                    } catch (e) {
                        console.warn('[BatchCoordinator] §BATCH-SLAB-PAUSE: slab resume failed:', e);
                    }

                    // Watchdog starts here — after the drain kick-off — so the 30 s budget
                    // begins from when signalBuildQueueDrained() is expected, not from when
                    // runBatch() returned.  Cancelled by signalBuildQueueDrained() on the
                    // happy path; also cancelled by forceReset() on project switch.
                    this._watchdogTimer = setTimeout(() => {
                        if (!this._isBatching) return;
                        console.error(
                            '[BatchCoordinator] WATCHDOG: signalBuildQueueDrained() not called within 30 s ' +
                            '— force-completing batch to unblock StoreEventBus from depth-1 limbo.', // TODO(TASK-08)
                        );
                        this.signalBuildQueueDrained();
                    }, 30_000);
                },
                'pre-render',
            );
            return result;
        } catch (err) {
            // fn() threw — the inner batch() already discarded the buffer.
            // On the normal code path _resumeFlushDispose is null here because scheduleOnce()
            // is only called AFTER storeEventBus.batch(fn) returns successfully.  However,
            // the spec (Step 3.4) requires a defensive cancel guard in case of unexpected
            // re-entrance (e.g. a nested runBatch call or future refactor that moves the
            // scheduleOnce earlier).  Cancel it and flush immediately if it was set.
            if (this._resumeFlushDispose !== null) {
                try { this._resumeFlushDispose(); } catch { /* ignore */ }
                this._resumeFlushDispose = null;
            }
            if (this._watchdogTimer !== null) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
            // §F.2 — Resume wall, curtain wall, and slab rebuild (async) before cleaning
            // up so pauses don't leak on the error path.
            try { this._wallControl?.resume(); } catch { /* best effort */ }
            try { this._cwControl?.resume(); }  catch { /* best effort */ }
            try { this._slabControl?.resume(); } catch { /* best effort */ }
            // Close the outer bracket cleanly: depth 1 → 0, _flush() on empty buffer.
            storeEventBus.endBatch();
            // §FIX-BATCH-RAF-ALIVE: Release the dirty flag so idle-continuation resumes.
            try { getFrameScheduler().clearDirty('batch-coordinator-in-progress'); } catch { /* non-fatal */ }
            // UX: dismiss the indicator on error path so it does not stay stuck.
            if (this._onBatchEnd) {
                try { this._onBatchEnd(); } catch { /* non-fatal */ }
            }
            // Reset coordinator state — the async sweep will never fire.
            this._isBatching = false;
            this._pendingLevelIds.clear();
            this._registrationQueue = [];
            console.error('[BatchCoordinator] runBatch fn() threw — batch aborted, bus cleaned up:', err);
            throw err;
        }
        // Normal path: fn() returned, depth is 1, bus is still buffering.
        // _executeFinalSweep() will close the outer bracket (depth 1→0) when ready.
    }

    /**
     * Queue a deferred BimManager.registerElement() + elementRegistry.registerSemantic() call.
     * MUST be called instead of direct bimManager.registerElement() during a batch.
     *
     * The queue is drained via rAF at REG_PER_FRAME registrations per frame
     * AFTER signalBuildQueueDrained() fires (i.e., after all geometry is built).
     * This spaces out the main-thread work so the UI remains responsive.
     *
     * If called outside a batch, the fn is executed immediately (fallback).
     */
    trackRegistration(fn: () => void): void {
        if (!this._isBatching) {
            // Fallback: execute immediately if not in batch mode.
            try { fn(); } catch (e) { console.error('[BatchCoordinator] trackRegistration fallback error:', e); }
            return;
        }
        this._registrationQueue.push(fn);
    }

    /**
     * Called by CurtainWallBuilder._drainBuildQueue() when the pending build queue
     * reaches zero. This signals that all geometry has been uploaded to the GPU
     * and it is safe to begin the registration drain + final REDETECT_ROOMS sweep.
     *
     * This is the ONLY correct moment to begin the final sweep because:
     *   1. All geometry is now in the scene — room detection has accurate geometry to read.
     *   2. The GPU is no longer under pressure — rAF yielding is complete.
     *   3. RoomBoundaryBuilder will not race with a concurrent build() call.
     */
    signalBuildQueueDrained(): void {
        if (this._watchdogTimer !== null) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
        if (!this._isBatching) return;
        const queueLen = this._registrationQueue.length;
        const __t_drained = performance.now();
        console.log(
            `[BatchCoordinator] §TRACE BUILD-QUEUE-DRAINED ` +
            `regQueue=${queueLen} / totalExpected=${this._totalElementCount} ` +
            `T=+${(__t_drained - this._batchStartTime).toFixed(1)}ms ` +
            `(all geometry in scene; registration drain starting)`
        );

        // §REG-MANY-P2: Sync-drain path for small queues.
        //
        // After the §REG-MANY-P1 fix in CreateCurtainWallsOnAllSlabsCommand the queue
        // contains ONE entry per unique level (≤ 21 for a 21-slab project) rather than
        // one entry per wall (231).  Draining synchronously here eliminates ALL rAF
        // overhead (~29 frames × 16 ms ≈ 462 ms before the fix).
        //
        // The rAF path (_drainRegistrations) is preserved for oversized queues so the UI
        // remains responsive if the queue is unexpectedly large (e.g. a direct caller of
        // the deprecated beginBatch() API that still pushes per-wall entries).
        if (queueLen <= BatchCoordinatorImpl.SYNC_DRAIN_THRESHOLD) {
            console.log(
                `[BatchCoordinator] §TRACE §REG-MANY-P2 queue ≤ ${BatchCoordinatorImpl.SYNC_DRAIN_THRESHOLD} ` +
                `(${queueLen}) — draining synchronously (0 rAF frames) ` +
                `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
            );
            const queue = this._registrationQueue.splice(0);
            for (const fn of queue) {
                try { fn(); } catch (e) { console.error('[BatchCoordinator] registration error:', e); }
            }
            console.log(
                `[BatchCoordinator] §TRACE REGISTRATION-DRAIN-DONE ` +
                `${queue.length} registration(s) complete ` +
                `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
            );
            if (this._shadowReactivationCallbacks.size > 0) {
                const __t_shadow = performance.now();
                console.log(
                    `[BatchCoordinator] §TRACE SHADOW-REACTIVATION-START ` +
                    `callbacks=${this._shadowReactivationCallbacks.size} ` +
                    `T=+${(__t_shadow - this._batchStartTime).toFixed(1)}ms`
                );
                for (const cb of this._shadowReactivationCallbacks) {
                    try { cb(); }
                    catch (e) { console.warn('[BatchCoordinator] shadowReactivation error:', e); }
                }
                console.log(
                    `[BatchCoordinator] §TRACE SHADOW-REACTIVATION-DISPATCHED ` +
                    `(sliced across post-render frames) ` +
                    `callMs=${(performance.now() - __t_shadow).toFixed(1)}ms ` +
                    `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                );
            }
            this._executeFinalSweep();
            return;
        }

        this._drainRegistrations();
    }

    /**
     * @deprecated Use `runBatch(fn, opts)` instead. Kept for backward compatibility.
     *
     * Manually open the StoreEventBus outer bracket and set up coordinator state. // TODO(TASK-08)
     * Callers must ensure _executeFinalSweep() is reached so the bracket closes.
     * If an exception occurs before _executeFinalSweep(), the bus will be stuck
     * in batch mode — use `runBatch()` which handles this automatically.
     */
    beginBatch(opts: BatchOptions): void {
        if (this._isBatching) {
            console.warn('[BatchCoordinator] beginBatch called while already batching — nesting not supported. Ignoring.');
            return;
        }
        this._setupBatch(opts);
        storeEventBus.beginBatch();
        console.log(
            `[BatchCoordinator] beginBatch (deprecated — prefer runBatch) — ` +
            `${opts.levelIds.length} level(s), ${opts.totalElementCount} elements expected. ` +
            `Observers silenced. StoreEventBus depth now ${storeEventBus.batchDepth}.` // TODO(TASK-08)
        );
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Shared state initialisation for both `runBatch()` and `beginBatch()`.
     * Cancels any in-flight rAF registration drain from a previous batch.
     */
    private _setupBatch(opts: BatchOptions): void {
        // §FIX-BATCH-RAF-ALIVE: Hold a dirty flag for the full batch lifetime so the
        // FrameScheduler idle-continuation budget never exhausts mid-batch.  Without this,
        // 30 consecutive ticks without requestFrame/markDirty (common on mobile while the
        // scene is render-suppressed) cause the rAF pump to stop, leaving all scheduled
        // drain callbacks (drainNextChunk, tickNextLevel, _waitThenDismiss) unable to fire
        // until something externally calls addTickListener → wakeIfStopped().
        // Cleared in onComplete, forceReset(), and the runBatch() error path.
        try { getFrameScheduler().markDirty('batch-coordinator-in-progress'); } catch { /* non-fatal */ }
        // §F.3 — Register the shared per-rAF drain budget (20 ms) so CurtainWallBuilder
        // and SlabFragmentBuilder's _drainBuildQueue() loops can cooperatively yield
        // within a single frame. The budget resets to 0 consumed at the top of each
        // FrameScheduler tick.
        try { getFrameScheduler().setBatchBudget('batch-drain', { budgetMs: 20 }); } catch { /* non-fatal */ }
        this._batchStartTime = performance.now();
        // §A.6 / §D.1 — Generate a short batch ID and expose on window for cross-module
        // log threading. All diagnostic logs in BatchCoordinator, CurtainWallStore,
        // CurtainWallBuilder, and EdgeProjectorService include this ID so a single
        // grep/Ctrl+F isolates one complete batch from a busy DevTools console.
        this._currentBatchId = crypto.randomUUID().slice(0, 8);
        window.__activeBatchId = this._currentBatchId;
        // §E.1 — Signal CRDT blackout window open. The YjsDocAdapter pauses CRDT
        // ops during the batch (StoreEventBus buffered at depth=2); this hook lets it
        // record when the blackout started for the §E1-CRDT-BLACKOUT metric.
        try {
            this._yjsDocAdapter?.onBatchWindowOpen?.({
                batchId: this._currentBatchId,
                startMs: this._batchStartTime,
            });
        } catch { /* non-fatal — sync client may not be connected */ }
        this._isBatching = true;
        this._pendingLevelIds = new Set(opts.levelIds);
        this._totalElementCount = opts.totalElementCount;
        this._skipRedetectRooms = opts.skipRedetectRooms ?? false;
        this._skipPbrUpgrade    = opts.skipPbrUpgrade    ?? false;
        this._registrationQueue = [];
        this._postBatchWindowEvents.clear();
        if (this._regDrainDispose !== null) {
            this._regDrainDispose();
            this._regDrainDispose = null;
        }
        // §BATCH-WALL-PAUSE: mirror the §LOAD-RAF-PAUSE pattern from ProjectLoader.
        // Prevents per-wall rAF flushes of _flushWallRebuild (WallJoinResolver O(n²))
        // from firing during the synchronous store-mutation phase. Without this, each
        // wall.add() schedules its own rAF which runs WallJoinResolver over the partial
        // level — N×O(n²) passes for a batch of N walls.
        // runBatch() calls _wallControl?.resumeAndFlush() after fn() returns, triggering
        // ONE coalesced resolver pass over all accumulated walls (§II-2: typed injection).
        // beginBatch() does NOT call resumeAndFlush — callers using the deprecated API
        // must call it manually or accept N×O(n²) behaviour.
        try {
            this._wallControl?.pause();
        } catch {
            // Guard: control may not be wired yet (pre-initScene, before registerBuilderControls).
        }
        // §BATCH-CW-PAUSE: mirror §BATCH-WALL-PAUSE for CurtainWallBuilder.
        // Buffers all updateCurtainWall() calls into _pausedBuildsMap (O(1) dedup)
        // during the synchronous store-mutation phase, preventing N individual
        // rAF-drain schedules. runBatch() calls resumeAndFlush() after fn() returns,
        // transferring all walls to _pendingBuildsMap and scheduling ONE drain.
        try {
            this._cwControl?.pause();
        } catch {
            // Guard: control may not be wired yet (pre-initScene).
        }
        // §BATCH-SLAB-PAUSE: mirror §BATCH-WALL-PAUSE for SlabFragmentBuilder.
        // Buffers all updateSlab() calls into _pausedBuilds during the synchronous
        // store-mutation phase, preventing N individual rAF-drain schedules.
        // runBatch() calls resumeAndFlush() after fn() returns.
        try {
            this._slabControl?.pause();
        } catch {
            // Guard: control may not be wired yet (pre-initScene).
        }
        // §PERF-VIEW-BATCH-SUPPRESS: silence ViewDependencyTracker for the duration
        // of this batch.  Without suppression, every store event delivered during the
        // endBatchYielded() drain (up to 6,072 curtain-wall events in 31 chunks)
        // resets the 300ms debounce and culminates in a full-building
        // EdgeProjectorService reprojection — observed as a 12,635ms LONGTASK
        // (9,461 edge geometries for the 3D system view).  onComplete() calls
        // setSuppressed(false) then markLevelsDirty(levelIds) to schedule ONE
        // targeted reprojection of only the affected plan views.
        try {
            viewDependencyTracker.setSuppressed(true);
        } catch (e) {
            console.warn('[BatchCoordinator] viewDependencyTracker.setSuppressed(true) failed (non-fatal):', e);
        }

        // §BATCH-SHADOW-MAP-SUPPRESS: disable the WebGPU renderer's shadow map for the
        // entire batch duration so zero GPU shadow-depth-pass work runs while geometry is
        // being built.
        //
        // Problem: CurtainWallBuilder correctly sets castShadow=false on every NEW wall
        // built during the batch (§Step 2B). But pre-existing scene geometry (floors,
        // slabs, other walls, structural columns) still has castShadow=true. Because the
        // shadow depth pass runs unconditionally every frame, ALL that pre-existing geometry
        // is re-rendered into the shadow map on each of the ~120 frames in a typical 2-second
        // batch — adding measurable GPU cost and competing with the CPU-side build drain.
        //
        // Fix: set pryzmRenderer.shadowMap.enabled=false at batch start so the renderer
        // skips the shadow depth pass entirely. CurtainWallBuilder._reactivateShadows()
        // restores the correct state at T+30s (after the PSO-compile storm clears) by
        // reading window.__pryzmBatchShadowWasEnabled.
        //
        // Edge cases handled:
        //   • User toggles shadows OFF during the batch → toggleShadows() updates
        //     __pryzmBatchShadowWasEnabled to false → restore honours their choice.
        //   • No CW shadow callbacks registered (slab-only batch) → _executeFinalSweep()
        //     onComplete restores the shadow map as a safety fallback.
        //   • pryzmRenderer not yet initialised (early batches) → guarded by try/catch.
        try {
            const webgpuRenderer = window.pryzmRenderer;
            if (webgpuRenderer?.shadowMap) {
                window.__pryzmBatchShadowWasEnabled = webgpuRenderer.shadowMap.enabled;
                webgpuRenderer.shadowMap.enabled = false;
                console.log(
                    `[BatchCoordinator] §BATCH-SHADOW-MAP-SUPPRESS shadowMap.enabled=false ` +
                    `(was=${window.__pryzmBatchShadowWasEnabled}) — shadow depth pass ` +
                    `suppressed for batch duration batchId=${this._currentBatchId}`
                );
            }
        } catch { /* non-fatal — pryzmRenderer may not be initialised at batch start */ }

        console.log(
            `[BatchCoordinator] §TRACE _setupBatch — ${opts.levelIds.length} level(s), ` +
            `${opts.totalElementCount} elements expected. ViewDependencyTracker suppressed. ` +
            `T=+0ms (batch clock started)`
        );
        // UX: show batch loading indicator immediately so the user knows work is in progress.
        if (this._onBatchStart) {
            try { this._onBatchStart(opts.totalElementCount); }
            catch (e) { console.warn('[BatchCoordinator] onBatchStart callback error (non-fatal):', e); }
        }
    }

    /** Drain deferred BimManager registrations at REG_PER_FRAME per rAF frame. */
    private _drainRegistrations(): void {
        const batch = this._registrationQueue.splice(0, BatchCoordinatorImpl.REG_PER_FRAME);
        for (const fn of batch) {
            try { fn(); } catch (e) { console.error('[BatchCoordinator] registration error:', e); }
        }
        if (this._registrationQueue.length > 0) {
            // Re-arm: schedule the next drain on the next frame via the L5 scheduler.
            this._regDrainDispose = getFrameScheduler().scheduleOnce(
                'batch-coordinator-drain',
                () => this._drainRegistrations(),
                'pre-render',
            );
        } else {
            // All registrations complete.
            this._regDrainDispose = null;

            // Shadow reactivation — re-enable castShadow on walls built in shadow-deferred
            // mode. Runs here (after geometry + registrations are both stable) so the shadow
            // map pass fires exactly ONCE over all new walls.
            for (const cb of this._shadowReactivationCallbacks) {
                try { cb(); }
                catch (e) { console.warn('[BatchCoordinator] shadowReactivation error:', e); }
            }

            this._executeFinalSweep();
        }
    }

    /**
     * Fires exactly ONE ReDetectRoomsCommand per affected level, then clears isBatching.
     *
     * §BATCH-EVENT-YIELD (2026-05-04): Closes the StoreEventBus outer bracket via // TODO(TASK-08)
     * endBatchYielded() rather than the synchronous endBatch(). For a 117-wall curtain
     * batch: 5,859 events × 20 listeners = 116,980 listener calls → previously a
     * ~500–900 ms synchronous LONGTASK. endBatchYielded() distributes the work across
     * ~30 pre-render frames of 200 events each, keeping each chunk ≤ 16 ms.
     *
     * §BATCH-BUS-DISCARD ordering preserved (2026-05-04 fix — now yielded):
     *   1. discardAndSuppress()           — wall events during the full drain are dropped.
     *   2. storeEventBus.endBatchYielded() — begins yielded drain: 200 events/frame via
     *                                        FrameScheduler 'pre-render'. Wall subscriber
     *                                        fires per chunk but events are discarded.
     *   3. onComplete → _isBatching=false  — only after ALL events delivered; keeps
     *                                        RoomTopologyObserver suppressed throughout.
     *   4. onComplete → restore()          — normal wall scheduling resumes.
     *   5. onComplete → REDETECT_ROOMS     — fired after isBatching cleared.
     */
    private _executeFinalSweep(): void {
        console.log(
            `[BatchCoordinator] §TRACE FINAL-SWEEP-START ` +
            `levels=${this._pendingLevelIds.size} skipRedetect=${this._skipRedetectRooms} ` +
            `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms ` +
            `(opening yielded event drain)`
        );
        const cm = this._commandManager;
        const bm = this._bimManager;
        if (!cm || !bm) {
            console.error(
                '[BatchCoordinator] Cannot execute final sweep — commandManager or bimManager not injected. ' +
                'Call batchCoordinator.inject() from EngineBootstrap.'
            );
            // Still close the bus bracket so consumers are not stuck in buffered mode.
            storeEventBus.endBatch();
            this._isBatching = false;
            return;
        }

        const levelIds = Array.from(this._pendingLevelIds);
        this._pendingLevelIds.clear();

        // §BATCH-BUS-DISCARD: Enable wall-event discard mode BEFORE starting the flush.
        // discardAndSuppress() must fire BEFORE any events reach subscribers so the wall
        // fragment builder's guard drops each wall event silently during the drain, preventing
        // a second WallJoinResolver pass (the 2409ms LONGTASK / Bug 2 + Bug 3 root cause).
        // This guard stays active through the entire yielded drain period — restore() is
        // called in onComplete, after _isBatching=false, once all events are delivered.
        try {
            this._wallControl?.discardAndSuppress();
        } catch (e) {
            console.warn('[BatchCoordinator] §BATCH-BUS-DISCARD: discardAndSuppress failed:', e);
        }

        // §BATCH-EVENT-YIELD: Close the outer StoreEventBus bracket via a yielded flush.
        // Each 'pre-render' frame dispatches up to 200 events to all subscribers, keeping
        // each frame within the 16ms budget and leaving the frame pipeline free to render.
        // onComplete fires after the final chunk — it restores observers and triggers
        // REDETECT_ROOMS exactly as the old synchronous path did, just deferred by
        // ceil(N/200) frames rather than happening synchronously.
        const fsScheduler = getFrameScheduler();
        storeEventBus.endBatchYielded(
            // Scheduler injected here — StoreEventBus has no FrameScheduler knowledge (C01 §2).
            (fn) => fsScheduler.scheduleOnce('batch-event-drain', fn, 'pre-render'),
            () => {
                // ── onComplete: all buffered events have been delivered ────────────────
                const __t_oncomplete = performance.now();
                console.log(
                    `[BatchCoordinator] §TRACE ON-COMPLETE-START ` +
                    `(all yielded events delivered) ` +
                    `T=+${(__t_oncomplete - this._batchStartTime).toFixed(1)}ms`
                );

                // §FIX-BATCH-RAF-ALIVE: Release the dirty flag held since _setupBatch()
                // so the FrameScheduler can resume normal idle-continuation accounting.
                // Must happen here (after all drain work is done) not in forceReset(),
                // which has its own clearDirty call.
                try { getFrameScheduler().clearDirty('batch-coordinator-in-progress'); } catch { /* non-fatal */ }

                // §BATCH-SHADOW-MAP-RESTORE-FALLBACK: safety net for batches that have no
                // CurtainWall shadow-reactivation callbacks (e.g. slab-only batches, or
                // batches where CurtainWallBuilder._reactivateShadows() returned early via
                // the pending.length===0 path without clearing __pryzmBatchShadowWasEnabled).
                // CurtainWallBuilder clears __pryzmBatchShadowWasEnabled in its restore paths;
                // if the key still exists here it means no CW reactivation ran — we restore now.
                try {
                    const webgpuRenderer = window.pryzmRenderer;
                    if (webgpuRenderer?.shadowMap && '__pryzmBatchShadowWasEnabled' in window) {
                        const wasEnabled = Boolean(window.__pryzmBatchShadowWasEnabled ?? true);
                        webgpuRenderer.shadowMap.enabled = wasEnabled;
                        delete window.__pryzmBatchShadowWasEnabled;
                        console.log(
                            `[BatchCoordinator] §BATCH-SHADOW-MAP-RESTORE-FALLBACK ` +
                            `shadowMap.enabled=${wasEnabled} (no CW shadow callbacks ran)`
                        );
                    }
                } catch { /* non-fatal */ }

                // §E.1 — CRDT blackout window close.
                // The batch is complete: measure blackout duration, log §E1-CRDT-BLACKOUT,
                // and fire the YjsDocAdapter close hook for the OTel histogram record.
                const _blackoutMs = __t_oncomplete - this._batchStartTime;
                try {
                    console.log(
                        `[Collaboration] §E1-CRDT-BLACKOUT batchId=${this._currentBatchId} ` +
                        `duration=${_blackoutMs.toFixed(0)}ms ` +
                        `elements=${this._totalElementCount}`
                    );
                    this._yjsDocAdapter?.onBatchWindowClose?.({
                        batchId:      this._currentBatchId,
                        blackoutMs:   _blackoutMs,
                        elementCount: this._totalElementCount,
                    });
                } catch { /* non-fatal — sync client may not be connected */ }

                // §BATCH-BUS-DISCARD step 3: Re-enable observers NOW — after the entire
                // yielded drain is complete. Keeping _isBatching=true throughout the drain
                // period suppresses spurious REDETECT_ROOMS from RoomTopologyObserver's
                // _commitBarrierListener and _scheduleRedetect (Bug 3 fix — preserved).
                this._isBatching = false;

                // §PERF-VIEW-BATCH-SUPPRESS: Lift the suppression NOW that _isBatching
                // is false, then schedule ONE targeted reprojection for only the plan
                // views on the affected levels.  This replaces the N×200-event avalanche
                // that previously caused the 12,635ms LONGTASK (9,461 edge geometries in
                // the 3D system view).  The 300ms debounce in markLevelsDirty() ensures
                // the REDETECT_ROOMS sweep (which runs over ~11 post-render frames) has
                // time to complete before the projection reads room geometry.
                //
                // §FIX-EDGE-PROJECT-DEFER (Fix #4, 2026-05-05): markLevelsDirty() is now
                // deferred to the 'post-render' slot of the current tick — AFTER the PSO
                // compile LONGTASK that runs in the render phase.  This moves the EdgeProjector's
                // 300ms debounce start to after the compile frame, preventing the EdgeProjector
                // from running concurrently with peak GPU load and compounding the LONGTASK.
                // §G.2 — Cancel any pending RoomTopologyObserver redetect timers for the
                // levels processed by this batch, then arm a 1s cooldown so no new timer
                // fires for those levels in the post-batch navigation window.
                // Uses optional-chaining so BatchCoordinator stays decoupled from
                // RoomTopologyObserver (window.roomTopologyObserver set by initTools).
                try {
                    (window.roomTopologyObserver as any)?.cancelPendingForLevels?.(levelIds);
                    (window.roomTopologyObserver as any)?.setPostBatchCooldown?.(performance.now() + 1000);
                    console.log(
                        `[BatchCoordinator] §G2-CANCELLED ${levelIds.length} pending redetect timer(s) for ${levelIds.length} level(s); ` +
                        `1s cooldown armed — REDETECT_ROOMS suppressed until T=${(performance.now() + 1000).toFixed(0)}ms`
                    );
                } catch (_g2e) { /* non-fatal — observer may not be initialised yet */ }

                // §G.1 — Defer VDT suppression lift through DependencyResolver CASCADE.
                //
                // Problem: setSuppressed(false) was called synchronously here. The
                // DependencyResolver CASCADE (9 wall events → VDT._onStoreEvent × 9) fired
                // AFTER this call, resetting the 300ms debounce timer N times →
                // EPS Flush #2 → 81ms LONGTASK during post-batch user navigation.
                //
                // Fix: Two microtask ticks let DependencyResolver's synchronous propagation
                // complete before VDT sees any CASCADE events. VDT then sees all events as
                // a coalesced dirty signal — ONE debounce reset → ONE EPS flush → zero
                // Flush #2 LONGTASKs. (doc 47 §3.3, §4.1 G1 analysis.)
                //
                // Hard timeout: if the CASCADE never settles (pathological dependency cycle)
                // suppression is lifted unconditionally at T+2s to prevent VDT lockout.
                try {
                    const _capturedLevelIds = levelIds;
                    const _capturedBatchStart = this._batchStartTime;
                    const _g1IsBatchingFalseAt = performance.now();
                    const _g1TimeoutHandle = setTimeout(() => {
                        viewDependencyTracker.setSuppressed(false);
                        console.error(
                            '[BatchCoordinator] §G1-TIMEOUT suppression lift forced at 2s — ' +
                            'pathological dependency cycle suspected; VDT unlocked unconditionally.'
                        );
                    }, 2000);
                    queueMicrotask(() => queueMicrotask(() => {
                        clearTimeout(_g1TimeoutHandle);
                        viewDependencyTracker.setSuppressed(false);
                        const _g1DelayMs = performance.now() - _g1IsBatchingFalseAt;
                        getFrameScheduler().scheduleOnce(
                            'batch-coordinator-edge-project-defer',
                            () => {
                                try {
                                    // §III-2 (Sprint 3): markLevelsDirtyImmediate() bypasses the 300ms
                                    // debounce. This callback runs in the 'post-render' slot
                                    // (§FIX-EDGE-PROJECT-DEFER), after the GPU PSO compile LONGTASK —
                                    // so no additional waiting period is needed.
                                    // EdgeProjector flush is queued to the next low-priority frame (≤1 rAF).
                                    viewDependencyTracker.markLevelsDirtyImmediate(_capturedLevelIds);
                                    console.log(
                                        `[BatchCoordinator] §TRACE §FIX-EDGE-PROJECT-DEFER §III-2 ` +
                                        `markLevelsDirtyImmediate(${_capturedLevelIds.length} level(s)) fired post-render ` +
                                        `(debounce bypassed — flush queued to next low-priority frame). ` +
                                        `T=+${(performance.now() - _capturedBatchStart).toFixed(1)}ms`
                                    );
                                } catch (e) {
                                    console.warn('[BatchCoordinator] deferred markLevelsDirtyImmediate failed (non-fatal):', e);
                                }
                            },
                            'post-render',
                        );
                        console.log(
                            `[BatchCoordinator] §G1-SUPPRESS-LIFTED post-CASCADE ` +
                            `T=${performance.now().toFixed(1)}ms delay=${_g1DelayMs.toFixed(1)}ms ` +
                            `(DependencyResolver CASCADE settled; EPS Flush #2 eliminated).`
                        );
                    }));
                    console.log(
                        `[BatchCoordinator] §TRACE §G1 VDT suppression deferred through CASCADE; ` +
                        `markLevelsDirtyImmediate(${levelIds.length} level(s)) will follow post-CASCADE. ` +
                        `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                    );
                } catch (e) {
                    console.warn('[BatchCoordinator] §G1 viewDependencyTracker post-batch wiring failed (non-fatal):', e);
                }

                // §FIX-OVERLAY-TIMING (Fix #1, 2026-05-05): Lift render suppression IMMEDIATELY
                // so OBC+PASCAL fire in this tick's render phase (where the PSO compile LONGTASK
                // runs).  The overlay dismiss is deferred to the 'post-render' slot of this SAME
                // tick — AFTER the PSO compile completes — so the loading overlay stays visible
                // throughout the compile and only dismisses once the scene is fully rendered.
                //
                // Previously: dismiss fired in pre-render → overlay gone at T=+2908ms → then
                //             12040ms PSO compile LONGTASK hit the user with no visual feedback.
                // Now:        suppress lifted in pre-render → PSO compile runs under the overlay
                //             → overlay dismisses in post-render (T=+~15000ms) → user sees the
                //             fully rendered scene as soon as the overlay fades.
                //
                // forceReset() (project switch): _onBatchEnd is NOT nulled (§FIX-OVERLAY-TIMING-V2).
                // The dismiss closure calls endBatchRenderSuppress() (idempotent) and
                // _batchIndicator.hide() (idempotent) — safe if called a second time by forceReset.
                if (this._onBatchEnd) {
                    const dismiss = this._onBatchEnd;
                    // §FIX-OVERLAY-TIMING-V2 (2026-05-05): DO NOT null _onBatchEnd.
                    // _onBatchEnd is a permanent singleton callback injected once by
                    // setBatchLifecycleCallbacks() at engine startup. Nulling it after the
                    // first batch means every subsequent batch (WALLS, CW, SLABS, …) has
                    // _onBatchEnd=null → the entire if-block is skipped → endBatchRenderSuppress()
                    // is never called → render suppression leaks → overlay stuck indefinitely.
                    //
                    // Double-fire safety: forceReset() only fires _onBatchEnd when _isBatching=true
                    // (line 1214). By the time scheduleOnce fires in post-render, _isBatching is
                    // already false (set to false in onComplete before this block). So forceReset()
                    // on project switch will NOT double-fire dismiss(). If forceReset() fires BEFORE
                    // onComplete (mid-batch crash), it fires dismiss() directly; the scheduleOnce
                    // closure then fires dismiss() a second time — both side effects are idempotent
                    // (endBatchRenderSuppress = no-op if already clear; hide() = no-op if already
                    // hidden) so this is safe.
                    const _capturedBatchStartForDismiss = this._batchStartTime;

                    // §FIX-GPU-COMPILE-LABEL: notify the indicator that PSO compilation
                    // is about to begin so it can update its label before the LONGTASK hits.
                    try { this._onGpuCompileStart?.(); } catch { /* non-fatal */ }

                    // §FIX-POST-GEOMETRY-COMPILE-V2 (2026-05-07 — replaces §FIX-POST-GEOMETRY-COMPILE):
                    //
                    // PROBLEM WITH ORIGINAL (§BN-10): The original block ran 3 synchronous
                    // rpm.render() calls after ALL batch geometry was in the scene. For 144+
                    // walls, this caused an 8,000ms LONGTASK → WebGPU device loss (observed in
                    // live session: "A valid external Instance reference no longer exists").
                    //
                    // ROOT CAUSE: rpm.render() with 144 CW walls = 2,592 InstancedMesh instances.
                    // WebGPU PSO compilation is O(unique {shader,vertex-layout,render-state}
                    // tuples). At ~3ms/PSO × ~2,600 variants = 7,800ms LONGTASK.
                    //
                    // REVISED APPROACH:
                    //   (a) When skipPbrUpgrade=true (CW/slab batches): SKIP entirely.
                    //       These batches call _prewarmCurtainWallShaders() before runBatch().
                    //       If prewarm succeeded, PSOs are already warm. If prewarm failed
                    //       (BN-05b timing guard), the first post-suppress render will compile
                    //       PSOs frame-by-frame via the normal rAF loop — no single LONGTASK.
                    //   (b) When elementCount > 32 (any large batch): SKIP entirely.
                    //       Post-geometry compile is only safe for tiny batches (≤32 elements)
                    //       where the full scene render costs <100ms.
                    //   (c) Small batches (≤32, no skipPbrUpgrade): run ONE pass only,
                    //       with a 100ms cost guard that warns if the scene is too large.
                    {
                        const _pgRpm = window.renderPipelineManager;
                        const _pgSkip = this._skipPbrUpgrade || this._totalElementCount > 32;
                        if (_pgSkip) {
                            console.log(
                                `[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 ` +
                                `SKIPPED (skipPbrUpgrade=${this._skipPbrUpgrade}, ` +
                                `elementCount=${this._totalElementCount}) — ` +
                                `prewarm covers PSOs for large CW/slab batches. ` +
                                `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                            );
                        } else if (_pgRpm?.render) {
                            try {
                                const _pgT0 = performance.now();
                                console.log(
                                    `[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 ` +
                                    `1 rpm.render() pass (small batch ≤32 elements). ` +
                                    `T=+${(_pgT0 - this._batchStartTime).toFixed(1)}ms`
                                );
                                const _pgSavedSelected: object[] = _pgRpm.selectedObjects?.splice(0) ?? [];
                                const _pgSavedHovered:  object[] = _pgRpm.hoveredObjects?.splice(0) ?? [];
                                try {
                                    _pgRpm.render(0); // Single pass only — cost bounded to <100ms for small scenes
                                } finally {
                                    if (_pgSavedSelected.length > 0) _pgRpm.selectedObjects?.push(..._pgSavedSelected);
                                    if (_pgSavedHovered.length > 0)  _pgRpm.hoveredObjects?.push(..._pgSavedHovered);
                                }
                                const _pgMs = performance.now() - _pgT0;
                                if (_pgMs > 100) {
                                    console.warn(
                                        `[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 ` +
                                        `WARN: single pass took ${_pgMs.toFixed(1)}ms > 100ms — ` +
                                        `scene larger than expected for post-geometry compile. ` +
                                        `Consider setting skipPbrUpgrade=true on this batch type.`
                                    );
                                } else {
                                    console.log(
                                        `[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 ` +
                                        `Completed in ${_pgMs.toFixed(1)}ms. ` +
                                        `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                                    );
                                }
                            } catch (e) {
                                console.warn('[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2: failed (non-fatal):', e);
                            }
                        }
                    }

                                        console.log(
                        `[BatchCoordinator] §TRACE ON-BATCH-END-DEFERRED ` +
                        `(suppress lifted NOW; overlay dismiss scheduled for post-render) ` +
                        `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                    );
                    try { unifiedFrameLoop.endBatchRenderSuppress(); }
                    catch (e) { console.warn('[BatchCoordinator] endBatchRenderSuppress (immediate) failed (non-fatal):', e); }

                    // §FIX-DUAL-LONGTASK-V2 (2026-05-07):
                    //
                    // Original fix waited 2 extra post-render frames (3 total) to cover
                    // a dual-LONGTASK (~9,359ms + ~8,814ms) from cold PSO compilation.
                    // With §FIX-POST-GEOMETRY-COMPILE-V2 now gating the synchronous render
                    // to small batches only, large CW/slab batches (skipPbrUpgrade=true)
                    // bypass the post-geometry compile entirely. The prewarm handles PSOs
                    // before runBatch() — the first post-suppress render is a cache-hit.
                    //
                    // Wait strategy:
                    //   • Large batches (skipPbrUpgrade=true or >32 elements): 1 frame.
                    //     Prewarm-warm PSOs compile in ~50-200ms — one settle frame suffices.
                    //   • Small batches (post-geometry compile ran): 1 frame.
                    //     Single-pass compile ≤100ms — one frame to settle.
                    //   Reduced from 2 → 1 frame saves one full rAF period (~16ms) of
                    //   overlay visibility with no user-visible regression.
                    let _gpuWaitFrames = 1;
                    const _waitThenDismiss = () => {
                        if (_gpuWaitFrames > 0) {
                            _gpuWaitFrames--;
                            console.log(
                                `[BatchCoordinator] §TRACE GPU-COMPILE-WAIT ` +
                                `framesRemaining=${_gpuWaitFrames} ` +
                                `T=+${(performance.now() - _capturedBatchStartForDismiss).toFixed(1)}ms`
                            );
                            getFrameScheduler().scheduleOnce(
                                'batch-coordinator-overlay-gpu-wait',
                                _waitThenDismiss,
                                'post-render',
                            );
                        } else {
                            console.log(
                                `[BatchCoordinator] §TRACE ON-BATCH-END-DONE ` +
                                `(overlay dismissed post-dual-PSO-compile; §FIX-DUAL-LONGTASK) ` +
                                `T=+${(performance.now() - _capturedBatchStartForDismiss).toFixed(1)}ms`
                            );
                            try { dismiss(); }
                            catch (e) { console.warn('[BatchCoordinator] onBatchEnd callback error (non-fatal):', e); }
                        }
                    };
                    getFrameScheduler().scheduleOnce(
                        'batch-coordinator-overlay-dismiss',
                        _waitThenDismiss,
                        'post-render',
                    );
                }

                // §BATCH-BUS-DISCARD step 4: Restore normal wall-event scheduling.
                try {
                    this._wallControl?.restore();
                } catch (e) {
                    console.warn('[BatchCoordinator] §BATCH-BUS-DISCARD: restore failed:', e);
                }

                // P1.3: Fire the post-batch geometry callback (shadow flags + PBR upgrade)
                // exactly once now that all events are delivered and all geometry is stable.
                // The per-element `bim-*-added` window event handlers were gated by
                // `isBatching` during the batch; this consolidated pass replaces them.
                if (this._onPostBatch) {
                    console.log(
                        `[BatchCoordinator] §TRACE ON-POST-BATCH-START ` +
                        `(PBR upgrade + requestIdleCallback pending) ` +
                        `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                    );
                    try { this._onPostBatch(); }
                    catch (e) { console.warn('[BatchCoordinator] postBatchCallback error:', e); }
                    console.log(
                        `[BatchCoordinator] §TRACE ON-POST-BATCH-DISPATCHED ` +
                        `(PBR upgrade queued to requestIdleCallback) ` +
                        `T=+${(performance.now() - this._batchStartTime).toFixed(1)}ms`
                    );
                }

                // PERF-FIX-3: Dispatch deferred window events exactly once per batch.
                if (this._postBatchWindowEvents.size > 0) {
                    const eventNames = Array.from(this._postBatchWindowEvents);
                    this._postBatchWindowEvents.clear();
                    console.log(
                        `[BatchCoordinator] PERF-FIX-3: Dispatching ${eventNames.length} deferred window ` +
                        `event(s) post-batch (was ${this._totalElementCount}× per element): ${eventNames.join(', ')}`
                    );
                    for (const name of eventNames) {
                        try {
                            window.dispatchEvent(new CustomEvent(name)); // TODO(TASK-15)
                        } catch (e) {
                            console.warn(
                                `[BatchCoordinator] Error dispatching deferred window event '${name}':`, e
                            );
                        }
                    }
                }

                // §FIX-SKIP-REDETECT-ROOMS: Log whether we are firing or skipping the sweep.
                if (this._skipRedetectRooms) {
                    console.log(
                        `[BatchCoordinator] Final sweep: SKIPPING REDETECT_ROOMS for ${levelIds.length} level(s) ` +
                        `(§FIX-SKIP-REDETECT-ROOMS — element type cannot define room boundaries). ` +
                        `StoreEventBus flushed (depth now ${storeEventBus.batchDepth}). ` + // TODO(TASK-08)
                        `markLevelsDirty already called above for plan-view reprojection.`
                    );
                    // Fire _onFinalSweepComplete immediately since there are no async sweeps to wait for.
                    if (this._onFinalSweepComplete && levelIds.length > 0) {
                        setTimeout(() => {
                            try { this._onFinalSweepComplete!(levelIds); }
                            catch (e) {
                                console.warn('[BatchCoordinator] finalSweepCallback error (skipRedetect path):', e);
                            }
                        }, 0);
                    }
                } else {

                console.log(
                    `[BatchCoordinator] Final sweep: firing ${levelIds.length} REDETECT_ROOMS command(s) ` +
                    `(one per affected level). Observers re-enabled. StoreEventBus flushed ` + // TODO(TASK-08)
                    `(depth now ${storeEventBus.batchDepth}).`
                );

                const rt = this._runtime;
                if (rt && rt.bus.registry.has('rooms.redetect')) {
                    // P1 (E.5.x): Use runtime.bus.executeCommand('rooms.redetect', ...) with
                    // frame yields between each level — same frame-yielded pattern as before.
                    let levelIndex = 0;
                    const tickNextLevel = () => {
                        // C13 §3.1 (Wave 35 I-1): bail out if a project switch cancelled this
                        // sweep. forceReset() sets _sweepCancelled=true; the deferred reset via
                        // Promise.resolve().then() ensures this tick still sees the true flag.
                        if (this._sweepCancelled) {
                            console.warn('[BatchCoordinator] sweep cancelled — project switched mid-sweep (bus path)');
                            return;
                        }
                        if (levelIndex >= levelIds.length) {
                            if (this._onFinalSweepComplete && levelIds.length > 0) {
                                setTimeout(() => {
                                    try { this._onFinalSweepComplete!(levelIds); }
                                    catch (e) {
                                        console.warn('[BatchCoordinator] finalSweepCallback error:', e);
                                    }
                                }, 0);
                            }
                            return;
                        }
                        const levelId = levelIds[levelIndex++]!;
                        const level = bm.getLevelById(levelId);
                        if (!level) {
                            console.debug(
                                `[BatchCoordinator] Level '${levelId}' not found — skipping final sweep.`
                            );
                            fsScheduler.scheduleOnce(
                                'batch-coordinator-rooms-sweep', tickNextLevel, 'post-render'
                            );
                            return;
                        }
                        try {
                            rt.bus.executeCommand('rooms.redetect', {
                                levelId,
                                elevation: level.elevation,
                                height: level.height ?? 3.0,
                            });
                        } catch (e) {
                            console.error(
                                `[BatchCoordinator] Final REDETECT_ROOMS (bus) failed for level '${levelId}':`, e
                            );
                        }
                        fsScheduler.scheduleOnce(
                            'batch-coordinator-rooms-sweep', tickNextLevel, 'post-render'
                        );
                    };
                    // §FIX-ROOMS-DISMISS-FIRST: Delay the first tickNextLevel by one
                    // extra post-render tick.  The overlay dismiss (_waitThenDismiss) is
                    // also scheduled for 'post-render' in this same onComplete invocation;
                    // with the two-step schedule the dismiss fires at Tick N+2 BEFORE
                    // tickNextLevel(level 0), ensuring the CSS fade-out starts on the
                    // compositor thread before any blocking PlanarTopologyEngine microtask
                    // hits the main thread.  Timeline:
                    //   Tick N   : onComplete → dismiss + rooms-sweep-init registered
                    //   Tick N+1 : dismiss(reschedules) + rooms-sweep-init fires (registers tickNextLevel)
                    //   Tick N+2 : dismiss(FIRES — overlay fades) then tickNextLevel(level 0)
                    //              level-0 microtask → room detection (main-thread block)
                    //   Tick N+3+: tickNextLevel(level 1…N), subsequent levels
                    fsScheduler.scheduleOnce(
                        'batch-coordinator-rooms-sweep-init',
                        () => fsScheduler.scheduleOnce('batch-coordinator-rooms-sweep', tickNextLevel, 'post-render'),
                        'post-render',
                    );
                } else {
                    // Fallback: legacy commandManager.execute(ReDetectRoomsCommand) path.
                    // Used when runtime is not yet injected or the rooms.redetect handler
                    // is not registered in the bus.
                    //
                    // P9-W4: Dynamic import('../../commands') replaced by injected factory
                    // (_legacyRedetectFactory) so BatchCoordinator has no src/ imports.
                    // Wire via batchCoordinator.setLegacyRedetectRoomsFactory() in engineLauncher.
                    if (!this._legacyRedetectFactory) {
                        console.warn(
                            '[BatchCoordinator] No legacy redetect factory registered — final REDETECT_ROOMS sweep skipped. ' +
                            'Call batchCoordinator.setLegacyRedetectRoomsFactory() from engineLauncher.',
                        );
                    } else {
                        // C13 §3.1 (Wave 35 I-1): bail out if a project switch cancelled this sweep.
                        if (this._sweepCancelled) {
                            console.warn('[BatchCoordinator] sweep cancelled — project switched mid-sweep (legacy path)');
                        } else {
                            for (const levelId of levelIds) {
                                const level = bm.getLevelById(levelId);
                                if (!level) {
                                    console.debug(
                                        `[BatchCoordinator] Level '${levelId}' not found — skipping final sweep.`
                                    );
                                    continue;
                                }
                                const cmd = this._legacyRedetectFactory(levelId, level.elevation, level.height ?? 3.0);
                                try { cm.execute(cmd); } catch (e) {
                                    console.error(
                                        `[BatchCoordinator] Final REDETECT_ROOMS failed for level '${levelId}':`, e
                                    );
                                }
                            }
                            if (this._onFinalSweepComplete && levelIds.length > 0) {
                                setTimeout(() => {
                                    try { this._onFinalSweepComplete!(levelIds); }
                                    catch (e) {
                                        console.warn('[BatchCoordinator] finalSweepCallback error:', e);
                                    }
                                }, 0);
                            }
                        }
                    }
                }
                } // end else (!this._skipRedetectRooms)
            },
            200, // chunk size — 200 events per pre-render frame (~16ms budget at 20 listeners)
        );
    }

    /**
     * C13 §3.1 (Wave 35 I-1) — Force-reset all batch state for project isolation.
     *
     * Called exclusively by the `pryzm-project-switch` teardown handler in
     * `engineLauncher.ts` before Project B's stores are populated.  Safe to
     * call whether or not a batch is in progress — all mutations are idempotent.
     *
     * Sequence (C13 §4 normative order):
     *   1. `_sweepCancelled = true`   — any in-flight `tickNextLevel` rAF callback
     *      bails immediately on its next tick (sees the flag before dispatching).
     *   2. Cancel `_regDrainDispose`  — stops the registration drain pump.
     *   3. `storeEventBus.discardBatch()` — if `_isBatching=true`, the outer bracket
     *      is open at depth 1. Without this step, `_batchDepth` stays at 1 after
     *      `forceReset()`. Every subsequent Project B store event would be buffered
     *      forever (never flushed) → builders receive no creates → empty scene.
     *      `discardBatch()` resets depth to 0 and drops stale Project A events
     *      WITHOUT flushing them to listeners (avoids spurious DependencyResolver
     *      rebuilds and the §BATCH-BUS-DISCARD LONGTASK for stale data).
     *   4. Clear all queued state     — `_pendingLevelIds`, `_registrationQueue`,
     *      `_postBatchWindowEvents`, `_totalElementCount`.
     *   5. `_isBatching = false`      — unblocks all `isBatching` gates.
     *   6. `Promise.resolve().then(() => _sweepCancelled = false)` — deferred
     *      reset so any already-dispatched microtask from step 1 can still see
     *      the `true` flag; Project B's first batch runs with a clean flag.
     */
    forceReset(): void {
        // Step 1 — cancel any in-flight sweep callbacks.
        this._sweepCancelled = true;

        // Step 2 — cancel registration drain subscription.
        if (this._regDrainDispose !== null) {
            try { this._regDrainDispose(); } catch { /* ignore */ }
            this._regDrainDispose = null;
        }

        // Step 2.5 — cancel the deferred resumeAndFlush callback (PERF-DEFER-RESUME-FLUSH).
        // If runBatch() scheduled a 'pre-render' slot but forceReset() fires before it runs
        // (project switch mid-batch), cancel the slot and call all three resumeAndFlush()
        // immediately so builder pauses (§BATCH-{WALL,CW,SLAB}-PAUSE) are not left dangling.
        // Also cancel the watchdog timer: it may have been set by the deferred callback if it
        // fired just before forceReset() — or it may still be null if the slot was cancelled.
        if (this._watchdogTimer !== null) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
        }
        if (this._resumeFlushDispose !== null) {
            try { this._resumeFlushDispose(); } catch { /* ignore */ }
            this._resumeFlushDispose = null;
            // §F.2 — Builders were paused by _setupBatch(); release them (async)
            // immediately so they do not stay permanently paused after project switch.
            try { this._wallControl?.resume(); }  catch { /* best effort */ }
            try { this._cwControl?.resume(); }    catch { /* best effort */ }
            try { this._slabControl?.resume(); }  catch { /* best effort */ }
        }

        // Step 3 — close the StoreEventBus outer bracket WITHOUT flushing.
        // If _isBatching=true the bracket is open at depth 1 (opened by runBatch()
        // or beginBatch()). Calling nothing here would leave _batchDepth at 1,
        // causing all Project B store events to be buffered indefinitely.
        // discardBatch() resets depth→0 and drops the stale Project A event buffer
        // without dispatching to listeners (Wave 35 D1 fix).
        if (this._isBatching) {
            try { storeEventBus.discardBatch(); } catch { /* ignore — bus already clean */ }
        }

        // §A.6 / §D.1 — Clear the batch ID so cross-module logs after forceReset()
        // do not accidentally carry a stale batch prefix from Project A into Project B.
        this._currentBatchId = '';
        window.__activeBatchId = undefined;

        // §FIX-BATCH-RAF-ALIVE: Release the dirty flag on project switch so
        // idle-continuation budget resumes for the incoming project.
        try { getFrameScheduler().clearDirty('batch-coordinator-in-progress'); } catch { /* non-fatal */ }

        // Step 4 — clear all queued state.
        this._pendingLevelIds.clear();
        this._registrationQueue  = [];
        this._postBatchWindowEvents.clear();
        this._totalElementCount  = 0;
        this._skipRedetectRooms  = false;
        this._skipPbrUpgrade     = false;
        this._batchStartTime     = 0; // §PERF-TRACE: reset so stale elapsed computations read 0

        // Step 5 — re-enable isBatching gates.
        // Fire onBatchEnd BEFORE clearing _isBatching so the indicator hides correctly
        // even when a project switch interrupts a running batch.
        if (this._isBatching && this._onBatchEnd) {
            try { this._onBatchEnd(); } catch { /* indicator errors must not block reset */ }
        }
        this._isBatching = false;
        // §PERF-VIEW-BATCH-SUPPRESS: Always clear suppression on project switch,
        // regardless of whether a batch was in progress.  Leaves ViewDependencyTracker
        // and UnifiedFrameLoop in a clean state for the next project.
        // §FIX-OVERLAY-TIMING-V2: Also call endBatchRenderSuppress() defensively — if a
        // batch ended without _onBatchEnd set (or the scheduleOnce hasn't fired yet), this
        // ensures OBC+PASCAL render is never left suppressed after a project switch.
        try { viewDependencyTracker.setSuppressed(false); } catch { /* non-fatal */ }
        try { unifiedFrameLoop.endBatchRenderSuppress(); } catch { /* non-fatal */ }

        // Step 6 — deferred flag reset (see CONTRACT above).
        Promise.resolve().then(() => { this._sweepCancelled = false; });

        console.log('[BatchCoordinator] C13 forceReset() — all batch state cleared for project switch');
    }
}

export const batchCoordinator = new BatchCoordinatorImpl();