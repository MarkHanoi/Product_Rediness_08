/**
 * @file src/core/rendering/FrameCoordinator.ts
 *
 * FrameCoordinator — dual rAF loop synchronization for view switches PLUS
 * (Phase 10 foundation) per-pass dirty-flag tracking for the demand-driven
 * render loop.
 *
 * ── Original responsibility (view-switch sync) ──────────────────────────
 *
 * PRYZM runs two concurrent requestAnimationFrame loops:
 *   1. OBC loop  — drives the base scene render (PostproductionRenderer).
 *   2. PASCAL loop — runs post-processing passes (MRT, SSGI, TRAA, Outlines).
 *
 * Both loops read from the same scene graph. Without coordination, the PASCAL
 * loop can fire a secondary OutlineNode scene render while ViewController is
 * mutating the scene for a view switch, producing GPU-side stalls or
 * visual corruption.
 *
 * The view-switch protocol (`beginViewSwitch` / `endViewSwitch` /
 * `shouldRenderPascalPass`) addresses that race and is unchanged in Phase 10.
 *
 * ── Phase 10 foundation (PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md §11) ──
 *
 * The original §11 promised a demand-driven render loop: idle scenes consume
 * 0 frames/s, post-processing passes (SSGI/TRAA/Outline/Bloom) only run when
 * something actually changed, with a 6-frame grace period after the last
 * dirty flag so a single click still completes temporal convergence.
 *
 * §18.2 critique points called out two structural requirements:
 *   #1  Phase 10 EXTENDS this FrameCoordinator (it already exists), not
 *       invents a new one.
 *   #2  Each pass (SSGI / TRAA / Outline / Bloom) must be gated INDEPENDENTLY
 *       — the PASCAL callback today runs them all together which is too
 *       coarse a granularity.
 *
 * What the foundation adds (this file):
 *   - `markDirty(pass | 'all', reason)` API — per-pass invalidation.
 *   - `shouldRenderPass(pass)` — per-pass query the eventual gated PASCAL
 *     dispatcher will call.
 *   - Per-pass grace-frame counter (default 6, configurable).
 *   - `tickFrame()` — once-per-rAF tick that decrements every grace counter.
 *   - `getDebugStats()` — frames-rendered/s vs frames-skipped/s, fed to
 *     the eventual `?perf=1` debug overlay.
 *
 * What this file does NOT do (deferred to Phase 10-extension):
 *   - Wire `UnifiedFrameLoop._pascalCallback` to call `tickFrame()` and
 *     `shouldRenderPass()`. That is a hot-path edit gated on a new
 *     `__PRYZM_FLAGS__.DEMAND_DRIVEN_RENDER` flag (default off).
 *   - Audit every subsystem that implicitly assumes a per-frame tick
 *     (animated materials, billboards, in-flight raycast hover) and add
 *     `markDirty()` calls — the §11 spec explicitly flags this as the
 *     dominant integration cost.
 *   - The `?perf=1` debug overlay UI surface.
 *   - Contract 51 (NEW) codifying the dirty-flag protocol so future
 *     subsystems know to call `markDirty()` instead of assuming
 *     continuous rendering.
 *
 * Default behavior is unchanged: every `shouldRenderPass()` query returns
 * `true` (every pass is dirty after init, every pass is dirty after
 * `markDirty('all', ...)`), so the legacy continuous-render path is
 * preserved bit-for-bit until Phase 10-extension wires the dispatcher.
 *
 * Phase 2 Performance — Task 2.4 (view-switch sync, original).
 * Phase 10 Performance — foundation only (this file).
 *
 * Contract:
 *   01-BIM-ENGINE-CORE §5 — No side effects beyond flag mutation.
 *   01-BIM-ENGINE-CORE §4 — No window globals; coordinator is injected
 *     explicitly into both ViewController and RenderPipelineManager.
 */

/**
 * Identifies a single post-processing pass that the PASCAL pipeline owns.
 *
 * Per §18.2 critique #2 each pass must be gated independently — the PASCAL
 * callback today runs SSGI → TRAA → Outline together which is too coarse.
 * Phase 10-extension wires each pass dispatch site to query the matching
 * `shouldRenderPass(...)`.
 */
export type RenderPassKind = 'ssgi' | 'traa' | 'outline' | 'bloom';

/** All pass kinds in dispatch order. Single source of truth for iteration. */
export const RENDER_PASS_KINDS: readonly RenderPassKind[] = [
    'ssgi', 'traa', 'outline', 'bloom',
];

/** Default grace-frame budget after the last `markDirty()` for any pass. */
export const DEFAULT_GRACE_FRAMES = 6;

/**
 * Snapshot of the coordinator's dirty-flag state. Returned by
 * `getDebugStats()` for the eventual `?perf=1` HUD.
 */
export interface FrameCoordinatorStats {
    /** Number of times `tickFrame()` has been called since init. */
    totalTicks: number;
    /** Sum of every per-pass dispatch the gated dispatcher would have made. */
    passesRendered: number;
    /** Sum of every per-pass dispatch the gated dispatcher would have skipped. */
    passesSkipped: number;
    /** Per-pass remaining grace frames (0 = pass is currently clean). */
    graceRemaining: Readonly<Record<RenderPassKind, number>>;
    /** Most recent reason string passed to `markDirty()`, per pass. */
    lastDirtyReason: Readonly<Record<RenderPassKind, string | null>>;
}

export class FrameCoordinator {
    private _switching = false;

    // ── Phase 10 foundation: per-pass dirty-flag state ────────────────────
    //
    // `_grace[pass]` counts down once per `tickFrame()` call. While > 0 the
    // pass is "dirty" and `shouldRenderPass(pass)` returns true. Initialized
    // to a large value (effectively infinite) so every pass renders forever
    // until Phase 10-extension actually starts calling `tickFrame()` AND
    // also calls `markDirty()` from every relevant subsystem. This is the
    // "default-on, opt-in dirty" stance — legacy behavior preserved.

    private readonly _graceFramesPerPass: Record<RenderPassKind, number> = {
        ssgi: Number.POSITIVE_INFINITY,
        traa: Number.POSITIVE_INFINITY,
        outline: Number.POSITIVE_INFINITY,
        bloom: Number.POSITIVE_INFINITY,
    };
    private _graceBudget: number = DEFAULT_GRACE_FRAMES;
    private readonly _lastDirtyReason: Record<RenderPassKind, string | null> = {
        ssgi: null, traa: null, outline: null, bloom: null,
    };

    // ── Phase 10 foundation: stats ────────────────────────────────────────
    private _totalTicks = 0;
    private _passesRendered = 0;
    private _passesSkipped = 0;

    /**
     * Mark a view switch as in progress. Called at the very start of
     * ViewController.activate(), before any scene mutation.
     */
    beginViewSwitch(): void {
        this._switching = true;
    }

    /**
     * Mark a view switch as complete. Called in the finally block of
     * ViewController.activate(), after the view is fully stable.
     */
    endViewSwitch(): void {
        this._switching = false;
    }

    /**
     * Query whether RenderPipelineManager should execute PASCAL post-processing
     * passes this frame.
     *
     * Returns false while a view switch is in progress so the concurrent
     * PASCAL rAF loop cannot race the scene mutation. Returns true once
     * the switch is complete.
     */
    shouldRenderPascalPass(): boolean {
        return !this._switching;
    }

    /** True while a view switch is in progress. */
    get isSwitching(): boolean {
        return this._switching;
    }

    // ── Phase 10 foundation API (unconsumed in production) ────────────────

    /**
     * Marks one pass — or all passes via the literal `'all'` — as dirty.
     * Resets that pass's grace counter to the configured budget so the
     * next `_graceBudget` calls to `tickFrame()` will keep
     * `shouldRenderPass(pass)` returning true.
     *
     * `reason` is captured for diagnostics; pass a short, stable string like
     * `'camera-move'`, `'wall-edit'`, `'hover-highlight'`, `'selection'`.
     */
    markDirty(pass: RenderPassKind | 'all', reason: string): void {
        if (pass === 'all') {
            for (const k of RENDER_PASS_KINDS) {
                this._graceFramesPerPass[k] = this._graceBudget;
                this._lastDirtyReason[k] = reason;
            }
            return;
        }
        this._graceFramesPerPass[pass] = this._graceBudget;
        this._lastDirtyReason[pass] = reason;
    }

    /**
     * Returns true when the gated dispatcher should run `pass` this frame.
     *
     * Always returns true while a view switch is in progress — the existing
     * view-switch protocol owns frame skipping in that window and the dirty
     * flag must not double-skip. (The PASCAL gate already short-circuits via
     * `shouldRenderPascalPass()`; this method is the per-pass refinement
     * Phase 10-extension wires inside the PASCAL callback.)
     *
     * Increments the per-pass `passesRendered` / `passesSkipped` counters
     * so `getDebugStats()` reflects what the gated dispatcher would have
     * done — even before the dispatcher is wired.
     */
    shouldRenderPass(pass: RenderPassKind): boolean {
        if (this._switching) {
            // View-switch protocol takes precedence — do not count.
            return true;
        }
        const remaining = this._graceFramesPerPass[pass];
        const dirty = remaining > 0;
        if (dirty) {
            this._passesRendered++;
        } else {
            this._passesSkipped++;
        }
        return dirty;
    }

    /**
     * Decrements every pass's grace counter by one. The eventual gated
     * dispatcher in Phase 10-extension calls this exactly once per rAF tick
     * (after running `shouldRenderPass()` for every pass that frame).
     *
     * `Number.POSITIVE_INFINITY - 1 === Number.POSITIVE_INFINITY` in JS, so
     * the legacy "always render" default state is preserved automatically
     * for any pass that has never received a `markDirty()` call.
     */
    tickFrame(): void {
        this._totalTicks++;
        for (const k of RENDER_PASS_KINDS) {
            const remaining = this._graceFramesPerPass[k];
            if (remaining > 0 && Number.isFinite(remaining)) {
                this._graceFramesPerPass[k] = remaining - 1;
            }
        }
    }

    /**
     * Reconfigure the grace budget. Default 6 (matches §11 spec: "additional
     * grace period of 6 frames after the last dirty flag so a single click
     * still completes the temporal converge"). Per-pass budgets are not
     * supported in the foundation — Phase 10-extension can specialize if a
     * specific pass needs a different convergence window.
     */
    setGraceBudget(frames: number): void {
        if (!Number.isFinite(frames) || frames < 0) {
            // eslint-disable-next-line no-console
            console.warn(`[FrameCoordinator] setGraceBudget(${frames}) ignored — must be non-negative finite.`);
            return;
        }
        this._graceBudget = Math.floor(frames);
    }

    /** Snapshot of the dirty-flag bookkeeping for the future `?perf=1` HUD. */
    getDebugStats(): FrameCoordinatorStats {
        return {
            totalTicks: this._totalTicks,
            passesRendered: this._passesRendered,
            passesSkipped: this._passesSkipped,
            graceRemaining: { ...this._graceFramesPerPass },
            lastDirtyReason: { ...this._lastDirtyReason },
        };
    }

    /**
     * Test / dev helper. Resets every counter and forces every pass into the
     * "dirty forever" state — i.e. the same state as a freshly-constructed
     * coordinator. Production code MUST NOT call this.
     */
    resetDirtyState(): void {
        for (const k of RENDER_PASS_KINDS) {
            this._graceFramesPerPass[k] = Number.POSITIVE_INFINITY;
            this._lastDirtyReason[k] = null;
        }
        this._totalTicks = 0;
        this._passesRendered = 0;
        this._passesSkipped = 0;
    }
}
