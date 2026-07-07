/**
 * batchAutoFrame — coalesced 3D auto-frame on batch-generation-complete.
 *
 * §FIX-BATCH-GEN-AUTOFRAME-3D (L-174, 2026-07-06) — REGRESSION FIX
 * ────────────────────────────────────────────────────────────────
 * The founder reported that a batch RESIDENTIAL building (and, by the same
 * mechanism, any generated typology — house / apartment / office) no longer
 * auto-frames into the 3D view when generation completes: "it was coming
 * before, but now I need to click Fit All so the building appears."
 *
 * ROOT CAUSE — three existing auto-frame paths, none of which re-frames after a
 * PROGRESSIVE batch generation drains:
 *   1. §3D-FRAME-ON-VIEW-SWITCH (initTools.ts) fires ONCE per project session on
 *      the first `view-activated` perspective event, gated by
 *      `_3dViewFirstFrameDone`.
 *   2. §VIEW-AUTOFRAME (SplitViewManager.ts) fires a deferred `zoom-fit` on
 *      split-view ENTRY; `zoomToAll()` self-guards an EMPTY scene and no-ops.
 *   3. §SVP3D-FRAME-ON-SWITCH (SplitViewManager.ts) frames on secondary-view
 *      switch.
 * On a NEW project the 3D / split view is entered at PROJECT-OPEN while the scene
 * is EMPTY: the once-per-session §3D-FRAME flag is consumed and §VIEW-AUTOFRAME's
 * zoomToAll no-ops on the empty scene. When the building then generates seconds
 * later — geometry draining across many frames via the L-131 P5 progressive
 * WallFragmentBuilder / SlabFragmentBuilder RAF_DRAIN — NO path re-frames.
 *
 * FIX — hook the auto-frame to the GENERATION-COMPLETE signal, not a fixed timer
 * or the once-per-session flag. The batch lifecycle already emits window events
 * `pryzm-batch-started` / `pryzm-batch-ended` (initBatchLifecycle.ts, fired from
 * BatchCoordinator's `_onBatchEnd` AFTER the build queue drains, registrations
 * settle, and the GPU-compile wait completes — i.e. all geometry is stable and in
 * the scene). This coordinator ref-counts those events exactly as SaveOrchestrator
 * does, and frames the 3D view ONCE, a single frame after the LAST batch drains —
 * not per-chunk (respecting the L-131 / L-139 / L-150 perf budget).
 *
 * The §AUTOFRAME-NO-HIJACK-WHILE-DRAWING guard is preserved: if a draw tool is
 * active when the deferred frame lands (the user is mid-draw), the frame is
 * suppressed so drawing never moves the camera.
 *
 * Typology-generic by construction: it keys off the batch lifecycle, which every
 * typology executor (resi-building / house / apartment / office) drives through
 * `batchCoordinator.runBatch()` — not a per-typology hook.
 *
 * Extracted as a pure, injectable unit (mirroring autoframeGuard.ts) so the
 * coalescing + suppression decision is unit-testable without booting the engine.
 */

import { shouldSuppressAutoFrameWhileDrawing } from './autoframeGuard';

/** Injected dependencies — all seams the unit test overrides. */
export interface BatchAutoFrameDeps {
    /**
     * Frames the 3D / perspective camera to the whole scene. In production this is
     * the same `zoomToAll()` the §3D-FRAME paths use (which self-guards an empty
     * scene, so this is safe even if the batch produced no visible geometry).
     */
    frame: () => void;
    /**
     * Returns true while a draw tool is active — the frame must be suppressed
     * (§AUTOFRAME-NO-HIJACK-WHILE-DRAWING). Defaults to the shared
     * `shouldSuppressAutoFrameWhileDrawing` guard.
     */
    isSuppressed?: () => boolean;
    /** Settle delay after the last batch drains before framing, ms. Default 350. */
    settleMs?: number;
    /**
     * Timer seam (test-injectable). Defaults to the global setTimeout/clearTimeout.
     */
    scheduler?: {
        set: (cb: () => void, ms: number) => number;
        clear: (handle: number) => void;
    };
    /**
     * Called after a successful frame — used in production to satisfy the
     * once-per-session §3D-FRAME flag so the view-switch handler does not redundantly
     * re-frame the already-framed scene.
     */
    onFramed?: () => void;
}

/** Event-driven coordinator surface. */
export interface BatchAutoFrameCoordinator {
    /** Handle a `pryzm-batch-started` event. */
    onBatchStarted(): void;
    /** Handle a `pryzm-batch-ended` event. */
    onBatchEnded(): void;
    /** Open-batch ref-count (for assertions). */
    readonly depth: number;
    /** True while a deferred frame is scheduled but not yet fired. */
    readonly pending: boolean;
}

const DEFAULT_SETTLE_MS = 350;

/**
 * Build a coordinator that frames the 3D view once, a single frame after the LAST
 * open batch drains. Back-to-back per-level batches (e.g. furnish-all-floors, which
 * runs one `runBatch` per level) collapse to a SINGLE frame: a new
 * `pryzm-batch-started` cancels any pending frame, and the frame is only scheduled
 * when the ref-count returns to zero.
 */
export function createBatchAutoFrameCoordinator(
    deps: BatchAutoFrameDeps,
): BatchAutoFrameCoordinator {
    const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS;
    const isSuppressed = deps.isSuppressed ?? shouldSuppressAutoFrameWhileDrawing;
    const scheduler = deps.scheduler ?? {
        set: (cb: () => void, ms: number): number =>
            (globalThis.setTimeout as unknown as (h: () => void, t: number) => number)(cb, ms),
        clear: (handle: number): void =>
            (globalThis.clearTimeout as unknown as (h: number) => void)(handle),
    };

    let depth = 0;
    let timer: number | null = null;

    const cancel = (): void => {
        if (timer !== null) {
            scheduler.clear(timer);
            timer = null;
        }
    };

    const schedule = (): void => {
        cancel();
        timer = scheduler.set(() => {
            timer = null;
            // §AUTOFRAME-NO-HIJACK-WHILE-DRAWING — never move the camera while the
            // user is drawing (a single manual element may commit through a batch too).
            if (isSuppressed()) {
                console.log(
                    '[batchAutoFrame] §FIX-BATCH-GEN-AUTOFRAME-3D: suppressed — a draw tool is active (no camera hijack while drawing).',
                );
                return;
            }
            try {
                deps.frame();
                deps.onFramed?.();
                console.log(
                    '[batchAutoFrame] §FIX-BATCH-GEN-AUTOFRAME-3D: framed 3D view on generation-complete.',
                );
            } catch (err) {
                console.warn(
                    '[batchAutoFrame] §FIX-BATCH-GEN-AUTOFRAME-3D: frame() failed (non-fatal):',
                    err,
                );
            }
        }, settleMs);
    };

    return {
        onBatchStarted(): void {
            depth++;
            // A new batch opened before the deferred frame landed — cancel it; we
            // frame only once ALL batches (per-level generate / furnish) have drained.
            cancel();
        },
        onBatchEnded(): void {
            if (depth > 0) depth--;
            if (depth > 0) return; // wait for the LAST batch to drain
            schedule();
        },
        get depth(): number {
            return depth;
        },
        get pending(): boolean {
            return timer !== null;
        },
    };
}
