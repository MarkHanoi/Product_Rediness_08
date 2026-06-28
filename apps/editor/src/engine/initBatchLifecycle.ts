import { InstancedMeshCoalescer } from '@pryzm/scene-committer';
import { batchCoordinator } from '@pryzm/core-app-model';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
import { BatchLoadingIndicator } from '@app/ui/overlays/BatchLoadingIndicator';

/**
 * Wires BatchCoordinator lifecycle callbacks: loading indicator, render-suppress,
 * perf-mode engagement, and InstancedMesh coalescing.
 * Extracted from engineLauncher.ts Task 5.2.
 */
export function initBatchLifecycle(params: { world: any }): void {
    const { world } = params;
    try {
        const _batchIndicator = new BatchLoadingIndicator();

        const _instancedMeshCoalescer = new InstancedMeshCoalescer(
            () => (world.scene as { three?: import('@pryzm/renderer-three/three').Scene }).three ?? null,
        );

        batchCoordinator.setBatchLifecycleCallbacks(
            (count) => {
                unifiedFrameLoop.beginBatchRenderSuppress();
                _batchIndicator.show(count);
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
                _batchIndicator.hide();
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

        batchCoordinator.setGpuCompileStartCallback(() => {
            _batchIndicator.transitionToGpuCompile();
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

        console.log('[initBatchLifecycle] BatchLoadingIndicator wired (§FIX-BATCH-RENDER-SUPPRESS + §L1-BATCH-PERF-MODE).');
    } catch (_bcErr: any) {
        console.error('[initBatchLifecycle] BatchCoordinator lifecycle setup failed:', _bcErr?.message ?? _bcErr);
    }
}
