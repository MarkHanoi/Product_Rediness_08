import { InstancedMeshCoalescer } from '@pryzm/scene-committer';
import { batchCoordinator } from '@pryzm/core-app-model';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
import { getLoadingOverlay, type LoadingSession } from '@app/ui/overlays/LoadingOverlayController';
import {
    accumulateBatchProgress,
    batchPhaseLabel,
    batchProgressNote,
    createBatchProgressState,
    type BatchProgressState,
} from '@app/ui/overlays/loadingProgress';

/**
 * Wires BatchCoordinator lifecycle callbacks: loading indicator, render-suppress,
 * perf-mode engagement, and InstancedMesh coalescing.
 * Extracted from engineLauncher.ts Task 5.2.
 *
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270, 2026-07-13) — the batch is now ONE PRODUCER of
 * the shared loading overlay, not its owner. It opens a session on `LoadingOverlayController`
 * (which the 3D-globe / 3D-Site activation also produces into) instead of instantiating its own
 * indicator. Behaviour is UNCHANGED: the session opens on batch start, accumulates the REAL
 * fragment-builder drain frames (§LOADING-REAL-PROGRESS — the accumulation moved to the pure
 * `accumulateBatchProgress`, because "elements built this frame" is BATCH semantics, not overlay
 * semantics), and ends on the genuine post-PSO-compile batch-end signal (never a timer).
 * Back-to-back sub-batches keep the SAME session, so the cumulative count still spans the whole
 * generation.
 */
export function initBatchLifecycle(params: { world: any }): void {
    const { world } = params;
    try {
        const overlay = getLoadingOverlay();
        let session: LoadingSession | null = null;
        let progress: BatchProgressState = createBatchProgressState();

        const paint = (phaseHint?: string): void => {
            if (!session) return;
            if (phaseHint) session.setLabel(batchPhaseLabel(phaseHint));
            session.setProgress(progress.cumBuilt, progress.total, batchProgressNote(progress));
        };

        const _instancedMeshCoalescer = new InstancedMeshCoalescer(
            () => (world.scene as { three?: import('@pryzm/renderer-three/three').Scene }).three ?? null,
        );

        batchCoordinator.setBatchLifecycleCallbacks(
            (count) => {
                unifiedFrameLoop.beginBatchRenderSuppress();
                // §LOADING-REAL-PROGRESS — only RESET the accumulator when no session is open.
                // Back-to-back sub-batches (office/house per-level runs) keep the overlay up, so
                // the cumulative count spans the whole generation and the user sees the TRUE
                // total, not one sub-batch's declared "1".
                if (!session) {
                    progress = createBatchProgressState(count);
                    session = overlay.begin('batch', {
                        title: 'Generating your model',
                        label: 'Preparing…',
                    });
                }
                try { _instancedMeshCoalescer.onBatchStart(); } catch { /* non-fatal */ }
                window.performanceModePanel?.autoEnablePerf();
                const _badge = document.getElementById('perf-mode-loading-badge');
                if (_badge) _badge.textContent = '⚡ PERF MODE — building geometry';
                console.log(`[initBatchLifecycle] §L1-BATCH-PERF-MODE engaged (${count} elements)`);
                // §AUTOSAVE-BATCH-SUPPRESS (2026-06-26) — announce batch open so
                // SaveOrchestrator can coalesce a multi-batch generation (e.g.
                // furnish-all-floors, which runs ONE runBatch per level — each
                // previously tripped a full-project serialize+compress+IndexedDB
                // write mid-operation, the repeated "[ProjectSerializer] Snapshot
                // created: 763 elements" the founder saw). SaveOrchestrator
                // ref-counts these and emits a SINGLE save once every batch drains.
                // Purely additive event — the indicator wiring above is unchanged.
                try {
                    window.dispatchEvent(new CustomEvent('pryzm-batch-started'));
                } catch { /* non-fatal */ }
            },
            () => {
                unifiedFrameLoop.endBatchRenderSuppress();
                // The GENUINE batch-end signal (post-dual-PSO-compile, §FIX-DUAL-LONGTASK) —
                // never a timer. Ending the session hides the overlay ONLY if no other producer
                // (e.g. a 3D-globe activation) still holds it open.
                session?.end();
                session = null;
                progress = createBatchProgressState();
                window.performanceModePanel?.autoDisablePerf();
                console.log('[initBatchLifecycle] §L1-BATCH-PERF-MODE restored after batch drain');
                try { _instancedMeshCoalescer.onBatchEnd(); } catch { /* non-fatal */ }
                // §AUTOSAVE-BATCH-SUPPRESS — announce batch drain; SaveOrchestrator
                // decrements its ref-count and, when it reaches zero, schedules the
                // single coalesced autosave (after a short settle so consecutive
                // per-level batches don't each re-arm a save).
                try {
                    window.dispatchEvent(new CustomEvent('pryzm-batch-ended'));
                } catch { /* non-fatal */ }
            },
        );

        // §LOADING-REAL-PROGRESS (2026-07-01) — pipe the REAL live fragment-builder
        // drain progress (built this frame / still-queued / phase hint) into the
        // overlay so the bar advances by the true build ratio and the sub-label shows
        // the actual cumulative element count (e.g. "1,240 / 2,355 elements") instead
        // of the bogus per-sub-batch "Building 1 element…". Best-effort — a throwing
        // overlay must never disrupt geometry building.
        batchCoordinator.setBatchProgressCallback((built, remaining, phaseHint) => {
            try {
                progress = accumulateBatchProgress(progress, built, remaining);
                paint(phaseHint);
            } catch { /* non-fatal — overlay progress must never disrupt the build */ }
        });

        batchCoordinator.setGpuCompileStartCallback(() => {
            // §FIX-GPU-COMPILE-LABEL — say what is happening on the LAST painted frame before
            // the WebGPU PSO LONGTASK blocks the main thread.
            try {
                session?.setTitle('Finishing up');
                session?.setLabel('Compiling GPU shaders…');
                // Nudge the bar toward completion — the compile is the last visible phase.
                session?.setProgress(96, 100, batchProgressNote(progress));
            } catch { /* non-fatal */ }
            try {
                if (world.camera?.controls) {
                    world.camera.controls.enabled = true;
                    if (typeof (world.camera.controls as any).mouseButtons === 'object' &&
                        (world.camera.controls as any).mouseButtons !== null) {
                        (world.camera.controls as any).mouseButtons.left = 1;
                    }
                }
            } catch { /* non-fatal */ }
        });

        console.log(
            '[initBatchLifecycle] batch registered as a producer of the SHARED loading overlay ' +
            '(§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY + §FIX-BATCH-RENDER-SUPPRESS + §L1-BATCH-PERF-MODE).',
        );
    } catch (_bcErr: any) {
        console.error('[initBatchLifecycle] BatchCoordinator lifecycle setup failed:', _bcErr?.message ?? _bcErr);
    }
}
