/**
 * @file src/core/rendering/UnifiedFrameLoop.ts
 *
 * UnifiedFrameLoop — single `requestAnimationFrame` coordinator for both the
 * OBC base render and the PASCAL post-processing pipeline.
 *
 * ## Problem
 *
 * PRYZM ran two independent `requestAnimationFrame` loops:
 *
 *   1. **OBC loop** — `PostproductionRenderer` calls its own `rAF` internally.
 *   2. **PASCAL loop** — `RenderPipelineManager.render()` drives a separate `rAF`.
 *
 * Both loops read the same scene graph. When ViewController mutates the scene
 * for a view switch, the PASCAL loop can fire a secondary OutlineNode pass in
 * the middle of that mutation, causing GPU-side stalls or visual corruption.
 *
 * `FrameCoordinator` (Phase 2) mitigated this with a `shouldRenderPascalPass()`
 * flag. `UnifiedFrameLoop` **solves** it by owning the single `rAF` tick that
 * drives both passes in a deterministic order:
 *
 *   rAF tick  → (1) tick OBC manually if in MANUAL mode
 *             → (2) run PASCAL post-processing if !switching
 *             → (3) run registered tick listeners in priority order:
 *                    pre-render → render → post-render → overlay
 *
 * ## Phase 3 — Tick Listener Registry
 *
 * All subsystems that previously owned private `requestAnimationFrame` loops
 * (AnnotationRenderLayer, PreviewManager, EnhancedBloomService, SSGIService,
 * FirstPersonController, SplitViewManager) must register here via
 * `addTickListener()`.  This eliminates 7 rogue rAF loops and ensures every
 * render callback runs inside one deterministic rAF tick.
 *
 * Priority execution order:
 *   pre-render  — camera updates, visibility changes (before OBC render)
 *   render      — reserved for future explicit render passes
 *   post-render — post-processing passes (bloom, SSGI, secondary renderer)
 *   overlay     — 2D canvas overlays drawn last (annotations, preview pulse)
 *
 * ## Integration
 *
 *   1. `initScene` creates one `UnifiedFrameLoop`.
 *   2. OBC renderer is placed in `MANUAL` mode (Phase 5 already does this).
 *   3. `loop.setObcRenderCallback(fn)` — fn calls the OBC renderer's render.
 *   4. `loop.setPascalRenderCallback(fn)` — fn calls RenderPipelineManager.render().
 *   5. `loop.start()` — begins the unified `rAF` loop.
 *   6. ViewController calls `loop.beginViewSwitch()` / `loop.endViewSwitch()`.
 *
 * ## Fallback
 *
 * `FrameCoordinator` is kept as a lightweight fallback for subsystems that
 * have not yet migrated to `UnifiedFrameLoop`. Both `beginViewSwitch()` and
 * `endViewSwitch()` forward the call to the injected `FrameCoordinator`.
 *
 * ## Contract compliance
 *
 *   01-BIM-ENGINE-CORE §5  — Pure frame coordination; no scene mutations.
 *   01-BIM-ENGINE-CORE §4  — No window globals; instance injected explicitly.
 *
 * Phase 4 Performance — Task 4.3.
 * Phase 3 Performance — Tick Listener Registry (rogue loop elimination).
 *
 * ## MODIFICATION DECLARATION (Phase 3)
 *
 * Layer Affected:     Rendering Layer (frame coordination)
 * File:               src/core/rendering/UnifiedFrameLoop.ts
 * Contract:           01-BIM-ENGINE-CORE §5 (intent — single rAF coordinator)
 *
 * Change: Added TickPriority, TickListener types and addTickListener() API.
 * All registered listeners are invoked inside _tick() in priority order after
 * the OBC and PASCAL callbacks.  addTickListener() is idempotent per id —
 * registering the same id twice replaces the prior entry without leaking.
 *
 * Impact:
 *   Rendering Impact: Yes — callbacks now execute in deterministic order
 *   Event Bus Impact: No
 *   Store Impact:     No
 *   Undo/Redo:        No
 */

import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import type { FrameCoordinator } from './FrameCoordinator';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A render callback. Receives the delta time in seconds. */
export type RenderCallback = (deltaMs: number) => void;

/** Frame-rate limiter target. `null` = unlimited (browser native rAF rate). */
export type TargetFPS = number | null;

/**
 * Execution priority for tick listeners.
 * Listeners fire in this order within each rAF tick, after the OBC and PASCAL
 * callbacks have been called:
 *
 *   pre-render  — camera updates, visibility flags (before main render)
 *   render      — reserved for future explicit render passes
 *   post-render — post-processing (bloom, SSGI, secondary renderer)
 *   overlay     — 2D canvas overlays drawn last (annotations, ghost pulse)
 */
export type TickPriority = 'pre-render' | 'render' | 'post-render' | 'overlay';

/**
 * A subsystem tick callback registered with `addTickListener()`.
 * `id` uniquely identifies the listener; registering the same id twice
 * replaces the prior entry (idempotent).
 */
export interface TickListener {
    id:       string;
    priority: TickPriority;
    /** Receives `deltaMs` (ms since last tick) and `timestamp` (rAF high-res time). */
    callback: (deltaMs: number, timestamp: number) => void;
}

/** Canonical execution order for priority-bucketed dispatch. */
const PRIORITY_ORDER: TickPriority[] = ['pre-render', 'render', 'post-render', 'overlay'];

// ── UnifiedFrameLoop ──────────────────────────────────────────────────────────

export class UnifiedFrameLoop {

    // ── Config ────────────────────────────────────────────────────────────────
    private _targetFrameMs = 0;

    // ── Render callbacks ─────────────────────────────────────────────────────
    private _obcCallback:   RenderCallback | null = null;
    private _pascalCallback: RenderCallback | null = null;

    // ── FrameCoordinator bridge ───────────────────────────────────────────────
    private _frameCoordinator: FrameCoordinator | null = null;

    // ── Frame-scheduler subscription state (S85.D-finish.2 — 2026-04-30) ─────
    // The legacy private `requestAnimationFrame` pump (`_rafHandle` +
    // `_scheduleNext()`) was removed.  This loop now subscribes to the
    // canonical L5 `@pryzm/frame-scheduler` singleton via `addTickListener`,
    // making `packages/frame-scheduler/src/RafAdapter.ts` the single rAF
    // owner for the OBC + PASCAL pipeline.  Public API and tick-priority
    // semantics are unchanged for the 13 PRYZM 1 importers (D.7.x batch
    // migrates them off this façade and onto the scheduler directly; this
    // slice removes the rogue rAF without touching importers).
    private _disposeScheduler: TickListenerDisposer | null = null;
    private _lastTime  = 0;
    private _switching = false;
    private _running   = false;

    // ── Batch render suppression (§FIX-BATCH-RENDER-SUPPRESS 2026-05-04) ─────
    //
    // ROOT CAUSE (diagnosed from console-log session 2026-05-04):
    //   When a curtain-wall batch runs while the 3D view is active, the
    //   CurtainWallBuilder drain fires FrameScheduler.schedule('pre-render', fn)
    //   per slice. Between slices, the UnifiedFrameLoop calls _obcCallback() →
    //   renderer.render() → WebGL compiles shader programs for each new material
    //   variant synchronously.  For 176 walls × ~700ms/compile-burst = ~30,000ms
    //   of LONGTASKs.  In plan view (drawCalls:0) the same drain takes 1,688ms
    //   for 21 levels because renderer.render() draws nothing (camera.layers mask).
    //
    // FIX:
    //   beginBatchRenderSuppress() skips _obcCallback + _pascalCallback during
    //   the batch drain (same effect as plan-view's drawCalls:0 state).
    //   endBatchRenderSuppress() resumes rendering; the first post-batch render
    //   compiles all new shaders at once — covered by the full-viewport overlay.
    //
    // Contract compliance:
    //   C01 §2 (Layer Isolation): no scene mutations.
    //   C04 (FrameScheduler): tick listeners (overlay animation) still fire.
    //   setBatchLifecycleCallbacks injection site owns begin/end calls (L7 only).
    private _batchRenderSuppressed = false;
    /** §PERF-TRACE: wall-clock time when batch render suppression started. */
    private _batchSuppressStartTime = 0;
    /** §PERF-TRACE: one-shot flag — logs the first actual render tick after suppression lifts. */
    private _firstRenderPostSuppress = false;

    // ── Diagnostics ──────────────────────────────────────────────────────────
    private _frameCount        = 0;
    private _switchStartTime: number | null = null;
    private _lastSwitchDurationMs: number | null = null;

    // ── Tick listener registry (Phase 3) ──────────────────────────────────────
    /**
     * Registered subsystem tick listeners, keyed by `TickListener.id`.
     * Dispatched in PRIORITY_ORDER after OBC and PASCAL callbacks each tick.
     */
    private _tickListeners: Map<string, TickListener> = new Map();

    private _lowPriorityQueue: Array<() => void | Promise<void>> = [];

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Inject the legacy FrameCoordinator so `beginViewSwitch()` and
     * `endViewSwitch()` keep it in sync with the unified loop's state.
     * Optional — the loop works without it.
     */
    setFrameCoordinator(fc: FrameCoordinator): void {
        this._frameCoordinator = fc;
    }

    /**
     * Register the OBC render callback. Called each tick BEFORE the PASCAL pass.
     * When OBC is in `MANUAL` mode and the renderer needs-update, this
     * callback should call `renderer.render(scene, camera)`.
     */
    setObcRenderCallback(fn: RenderCallback): void {
        this._obcCallback = fn;
    }

    /**
     * Register the PASCAL render callback. Called each tick AFTER the OBC pass,
     * ONLY when `!isSwitching`. This callback should call
     * `renderPipelineManager.render(scene, camera)`.
     */
    setPascalRenderCallback(fn: RenderCallback): void {
        this._pascalCallback = fn;
    }

    /**
     * Optional frame-rate cap. Set to `null` for unlimited (native rAF rate).
     * Typical values: 60 (standard), 30 (battery-save), null (gaming/HFR displays).
     */
    setTargetFPS(fps: TargetFPS): void {
        this._targetFrameMs = fps !== null ? 1000 / fps : 0;
    }

    /**
     * Phase 3 — Register a priority tick listener.
     *
     * The listener's `callback` is invoked on every rAF tick, after the OBC
     * and PASCAL render callbacks, in order of `priority`.
     *
     * Idempotent by `id`: registering the same id twice replaces the earlier
     * entry — no duplicate callbacks, no leaked handlers.
     *
     * @returns An unsubscribe function. Call it to remove the listener cleanly.
     *
     * @example
     * const unregister = unifiedFrameLoop.addTickListener({
     *   id: 'annotation-render-layer',
     *   priority: 'overlay',
     *   callback: (deltaMs, timestamp) => { ... },
     * });
     * // Later, to clean up:
     * unregister();
     */
    addTickListener(listener: TickListener): () => void {
        this._tickListeners.set(listener.id, listener);
        return () => { this._tickListeners.delete(listener.id); };
    }

    /**
     * Remove a tick listener by id.
     * No-op if the id is not registered.
     */
    removeTickListener(id: string): void {
        this._tickListeners.delete(id);
    }

    queueLowPriority(task: () => void | Promise<void>): void {
        this._lowPriorityQueue.push(task);
    }

    /**
     * Start the unified render loop. Idempotent — safe to call multiple times.
     *
     * S85.D-finish.2: registers a single `pre-render` tick listener on the
     * process-wide `@pryzm/frame-scheduler` singleton (canonical L5 rAF
     * owner per ADR-003) and ensures the scheduler's pump is running.
     * Stopping the loop disposes the listener but leaves the scheduler
     * running for other consumers — the scheduler's `IdleContinuation`
     * decides when to park the rAF pump.
     */
    start(): void {
        if (this._running) return;
        this._running = true;
        this._lastTime = performance.now();
        const scheduler = getFrameScheduler();
        // Subscribe at `pre-render` priority so OBC + PASCAL run before any
        // other subsystem listener registered with the scheduler.  The
        // internal `_tickListeners` registry inside this loop preserves
        // sub-priority ordering for the 6 PRYZM 1 subsystems that already
        // moved off rogue rAFs.
        this._disposeScheduler = scheduler.addTickListener(
            'unified-frame-loop',
            (now, _deltaMs) => this._tick(now),
            'pre-render',
        );
        if (!scheduler.isRunning) scheduler.start();
        console.log('[UnifiedFrameLoop] Started (subscribed to @pryzm/frame-scheduler).');
    }

    /**
     * Stop the unified render loop. The OBC PostproductionRenderer will
     * continue functioning in MANUAL mode (needsUpdate = true triggers renders).
     *
     * S85.D-finish.2: disposes the scheduler subscription but does NOT
     * stop the scheduler's rAF pump (other consumers may still be
     * subscribed; the scheduler self-parks via IdleContinuation when no
     * work remains).
     */
    stop(): void {
        if (!this._running) return;
        this._running = false;
        if (this._disposeScheduler !== null) {
            this._disposeScheduler();
            this._disposeScheduler = null;
        }
        console.log('[UnifiedFrameLoop] Stopped (scheduler subscription disposed).');
    }

    /** True while the loop is running. */
    get isRunning(): boolean {
        return this._running;
    }

    // ── View-switch protocol ──────────────────────────────────────────────────

    /**
     * Signal that a view switch has started.
     * The PASCAL post-processing callback will be skipped until `endViewSwitch()`
     * is called, preventing GPU races during scene mutation.
     */
    beginViewSwitch(): void {
        this._switching = true;
        this._switchStartTime = performance.now();
        this._frameCoordinator?.beginViewSwitch();
    }

    /**
     * Signal that the view switch has completed.
     * The PASCAL callback resumes on the next tick.
     */
    endViewSwitch(): void {
        if (this._switchStartTime !== null) {
            this._lastSwitchDurationMs = performance.now() - this._switchStartTime;
            this._switchStartTime = null;

            if (this._lastSwitchDurationMs > 100) {
                console.warn(
                    `[UnifiedFrameLoop] View switch took ${this._lastSwitchDurationMs.toFixed(1)} ms ` +
                    `(target: <100 ms)`,
                );
            } else {
                console.log(
                    `[UnifiedFrameLoop] View switch complete in ` +
                    `${this._lastSwitchDurationMs.toFixed(1)} ms.`,
                );
            }
        }
        this._switching = false;
        this._frameCoordinator?.endViewSwitch();
    }

    /**
     * True while a view switch is in progress.
     * The PASCAL callback is skipped for these frames.
     * Tick listeners at `overlay` priority should also check this flag and
     * return early to avoid drawing on an in-flight scene mutation.
     */
    get isSwitching(): boolean {
        return this._switching;
    }

    /**
     * Duration of the most recent view switch in milliseconds.
     * `null` if no view switch has completed yet.
     */
    get lastSwitchDurationMs(): number | null {
        return this._lastSwitchDurationMs;
    }

    /** Total number of frames rendered since `start()`. */
    get frameCount(): number {
        return this._frameCount;
    }

    // ── Batch render suppression API (§FIX-BATCH-RENDER-SUPPRESS 2026-05-04) ──

    /**
     * Suppress the OBC base render and PASCAL post-processing callbacks for
     * the duration of a geometry batch (e.g. "Create Curtain Walls on All Slabs").
     *
     * While suppressed, the scheduler tick continues to fire and tick listeners
     * (overlay animation, Canvas2D plan-view, etc.) still execute normally —
     * only the WebGL render passes are gated.  The full-viewport BatchLoadingIndicator
     * overlay covers the frozen canvas while the drain runs.
     *
     * Idempotent: calling when already suppressed is a no-op.
     */
    beginBatchRenderSuppress(): void {
        if (this._batchRenderSuppressed) return;
        this._batchRenderSuppressed = true;
        this._batchSuppressStartTime = performance.now();
        this._firstRenderPostSuppress = true;
        console.log(
            '[UnifiedFrameLoop] §TRACE §PERF-VIEW-BATCH-SUPPRESS: OBC+PASCAL render suppressed ' +
            '— WebGL shader compilation deferred until batch drain completes. ' +
            `suppressStartT=${this._batchSuppressStartTime.toFixed(1)}ms`,
        );
    }

    /**
     * Lift the batch render suppression installed by `beginBatchRenderSuppress()`.
     * The OBC and PASCAL callbacks resume on the very next scheduler tick.
     *
     * Idempotent: calling when not suppressed is a no-op.
     */
    endBatchRenderSuppress(): void {
        if (!this._batchRenderSuppressed) return;

        // §PERF-RENDER-BEFORE-UNSUPPRESS-REMOVAL (2026-05-05):
        //
        // The previous implementation called renderPipelineManager.render(0) here
        // SYNCHRONOUSLY before lifting suppression, with the rationale that it would
        // pre-warm WebGPU PSOs while the loading overlay was still visible.
        //
        // Empirical measurement showed the actual cost was 3,296–8,443 ms (not the
        // originally estimated 200–500 ms), because the full production pipeline
        // (ScenePass MRT → SSGI → TRAA → outline compositing) runs on all new geometry.
        // This meant:
        //   • The loading overlay was displayed for 3–8 extra seconds of frozen UI
        //     with NO user-visible benefit (the overlay hides the frozen canvas).
        //   • The first-frame post-overlay LONGTASK was STILL 7,046 ms — dominated
        //     by EdgeProjectorService.project() for the plan view, NOT by PSO compile.
        //     The PSO prewarm did not reduce that LONGTASK at all.
        //
        // Fix: remove the synchronous rpm.render(0) call entirely.
        //   • Overlay dismisses 3–8 seconds sooner → dramatically better UX.
        //   • For curtain-wall batches: _prewarmCurtainWallShaders() already runs
        //     on first execute, so production PSOs are warm before the batch starts.
        //   • For wall batches: first render compiles PSOs — the compile cost is
        //     absorbed into the EdgeProjectorService LONGTASK which is now chunked
        //     (see §PERF-EDGEPROJECTOR-CHUNK in EdgeProjectorService.ts).
        //   • Net effect: same or slightly higher first-render cost, but the user
        //     sees a responsive overlay dismiss 3–8 seconds earlier.

        this._batchRenderSuppressed = false;
        const suppressedMs = this._batchSuppressStartTime > 0
            ? (performance.now() - this._batchSuppressStartTime).toFixed(1)
            : '?';
        console.log(
            `[UnifiedFrameLoop] §TRACE §PERF-VIEW-BATCH-SUPPRESS suppression lifted ` +
            `after ${suppressedMs}ms ` +
            '— OBC+PASCAL resuming on next tick.',
        );
    }

    /** True while batch render suppression is active. */
    get isBatchRenderSuppressed(): boolean {
        return this._batchRenderSuppressed;
    }

    // ── Private — scheduler-driven tick ───────────────────────────────────────
    //
    // S85.D-finish.2: this is invoked by `@pryzm/frame-scheduler` once per
    // rAF (subscribed at `pre-render` priority).  The legacy private
    // `_scheduleNext()` rAF pump and `_rafHandle` field have been removed —
    // the scheduler owns the single rAF for the entire app per ADR-003.

    private _tick(now: number): void {
        if (!this._running) return;

        const deltaMs = now - this._lastTime;

        // Frame-rate cap: skip if not enough time has elapsed.
        // The scheduler still ticks at native rAF rate; the cap is honored
        // here by returning early without advancing `_lastTime`.
        if (this._targetFrameMs > 0 && deltaMs < this._targetFrameMs) {
            return;
        }

        this._lastTime = now;
        this._frameCount++;

        // ── Batch render suppression gate (§FIX-BATCH-RENDER-SUPPRESS) ────────
        // When a geometry batch is draining (curtain walls, AI generation, etc.),
        // skip the OBC+PASCAL WebGL render passes entirely.  Tick listeners still
        // run so the BatchLoadingIndicator overlay animation and the Canvas2D plan
        // view continue to update. This matches the plan-view drawCalls:0 state
        // that makes the same batch complete in ~1.7s instead of ~30s.
        if (this._batchRenderSuppressed) {
            for (const priority of PRIORITY_ORDER) {
                for (const listener of this._tickListeners.values()) {
                    if (listener.priority !== priority) continue;
                    try {
                        listener.callback(deltaMs, now);
                    } catch (err: any) {
                        console.error(
                            `[UnifiedFrameLoop] Tick listener "${listener.id}" error (suppressed):`,
                            err?.message ?? err,
                        );
                    }
                }
            }
            return;
        }

        // §PERF-TRACE: One-shot log for the first render tick after batch suppression lifts.
        // This tick is where OBC+PASCAL will compile all deferred CW shaders — the LONGTASK.
        if (this._firstRenderPostSuppress) {
            this._firstRenderPostSuppress = false;
            const postSuppressMs = this._batchSuppressStartTime > 0
                ? (performance.now() - this._batchSuppressStartTime).toFixed(1)
                : '?';
            console.log(
                `[UnifiedFrameLoop] §TRACE FIRST-RENDER-POST-SUPPRESS ` +
                `totalSuppressedMs=${postSuppressMs}ms ` +
                `frameCount=${this._frameCount} ` +
                `— OBC+PASCAL about to execute (WebGPU PSO compile LONGTASK begins here)`
            );
        }

        // ── (1) OBC base render ───────────────────────────────────────────────
        // Runs every tick, even during view switches, so the display never blacks out.
        if (this._obcCallback) {
            try {
                this._obcCallback(deltaMs);
            } catch (err: any) {
                console.error('[UnifiedFrameLoop] OBC callback error:', err?.message ?? err);
            }
        }

        // ── (2) PASCAL post-processing ────────────────────────────────────────
        // Skipped while a view switch is in progress (scene mutation may be
        // mid-flight). Resumes automatically on the next tick after endViewSwitch().
        if (!this._switching && this._pascalCallback) {
            try {
                this._pascalCallback(deltaMs);
            } catch (err: any) {
                console.error('[UnifiedFrameLoop] PASCAL callback error:', err?.message ?? err);
            }
        }

        // ── (3) Priority-ordered tick listeners (Phase 3) ─────────────────────
        // Executes registered listeners in PRIORITY_ORDER:
        //   pre-render → render → post-render → overlay
        // Each listener handles its own view-switch guard where appropriate.
        for (const priority of PRIORITY_ORDER) {
            for (const listener of this._tickListeners.values()) {
                if (listener.priority !== priority) continue;
                try {
                    listener.callback(deltaMs, now);
                } catch (err: any) {
                    console.error(
                        `[UnifiedFrameLoop] Tick listener "${listener.id}" error:`,
                        err?.message ?? err,
                    );
                }
            }
        }

        const lowPriorityTask = this._lowPriorityQueue.shift();
        if (lowPriorityTask) {
            try {
                void Promise.resolve(lowPriorityTask()).catch((err: any) => {
                    console.error('[UnifiedFrameLoop] Low-priority task error:', err?.message ?? err);
                });
            } catch (err: any) {
                console.error('[UnifiedFrameLoop] Low-priority task error:', err?.message ?? err);
            }
        }
        // S85.D-finish.2: no `_scheduleNext()` — the scheduler owns the pump.
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global UnifiedFrameLoop singleton.
 *
 * initScene wires OBC and PASCAL callbacks and calls `start()`.
 * ViewController calls `beginViewSwitch()` / `endViewSwitch()`.
 * Subsystems register via `addTickListener()` (Phase 3).
 *
 * @deprecated TODO(D.7-leftover) — this file (402 LOC) is the **PRYZM 1
 *   leftover** explicitly cited at `packages/frame-scheduler/src/types.ts:11/38`
 *   as the file to retire.  Replacement: `packages/frame-scheduler/`
 *   (`FrameScheduler` + `RafAdapter`) — the canonical D.7 home is landed.
 *   Deletion blocked on 13 `src/` importers:
 *     `src/core/views/ViewDependencyTracker.ts:34`,
 *     `src/core/views/SplitViewManager.ts:27`,
 *     `src/core/views/PlanViewManager.ts:3` (type-only),
 *     `src/core/rendering/SSGIService.ts:44`,
 *     `src/core/rendering/EnhancedBloomService.ts:33`,
 *     `src/core/navigation/ViewController.ts:17` (type-only),
 *     `src/core/navigation/FirstPersonController.ts:36`,
 *     `src/elements/preview/PreviewManager.ts:29`,
 *     `src/elements/annotations/AnnotationRenderLayer.ts:28`,
 *     `src/engine/subsystems/initScene.ts:76`,
 *     plus 3 more (run `rg "core/rendering/UnifiedFrameLoop" src` for the full list).
 *   Each importer must switch to `import { frameScheduler } from '@pryzm/frame-scheduler'`.
 *   Note: the spec D.7 sub-phase IS landed (the file is gone from `src/engine/`
 *   and `packages/frame-scheduler/` exists).  This singleton is a separate
 *   migration tracked as D-finish.2.
 *   See `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/04-phase-D-audit-and-plan.md` §D-finish.2.
 */
export const unifiedFrameLoop = new UnifiedFrameLoop();
