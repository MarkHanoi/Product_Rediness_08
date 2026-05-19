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
            },
            () => {
                unifiedFrameLoop.endBatchRenderSuppress();
                _batchIndicator.hide();
                window.performanceModePanel?.autoDisablePerf();
                console.log('[initBatchLifecycle] §L1-BATCH-PERF-MODE restored after batch drain');
                try { _instancedMeshCoalescer.onBatchEnd(); } catch { /* non-fatal */ }
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
