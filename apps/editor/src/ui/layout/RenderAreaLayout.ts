import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import { mountRenderPanel } from '../rendering/RenderPanel';
import { mountRenderGallery } from '../rendering/RenderGallery';
import { mountPanoramaPanel } from '../rendering/PanoramaPanel';
import { mountVideoExportPanel } from '../rendering/VideoExportPanel';
import { mountRenderQueuePanel } from '../rendering/RenderQueuePanel';
import { mountExportStudioPanel } from '../rendering/ExportStudioPanel';
import { mountVisualizationEnginePanel } from '../rendering/VisualizationEnginePanel';
import { mountRealSunControl } from '../rendering/RealSunControl';
import { mountPerformanceModePanel } from '../rendering/PerformanceModePanel';
import { mountWalkthroughPanel, getWalkthroughPanel } from '../rendering/WalkthroughPanel';
import { FirstPersonController } from '@pryzm/core-app-model';
import type { UIProps } from '../Layout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export function mountRenderArea(props: UIProps, runtime: PryzmRuntime | null): void {
    // ── Mount Photorealistic Render panels (Tier 1) ───────────────────────────
    const renderPanelInstance   = mountRenderPanel(document.body, runtime ?? null);
    const renderGalleryInstance = mountRenderGallery(document.body, runtime ?? null);
    renderPanelInstance.setOnRenderComplete((result) => {
        renderGalleryInstance.addRender(result).catch(err => {
            console.warn('[Layout] Gallery addRender error:', err);
        });
        renderGalleryInstance.show();
    });

    // ── Mount Tier 3 panels ───────────────────────────────────────────────────
    const panoramaPanelInstance    = mountPanoramaPanel(document.body, runtime ?? null);
    const videoExportPanelInstance = mountVideoExportPanel(document.body, runtime ?? null);
    mountRenderQueuePanel(document.body, runtime ?? null);

    // ── Mount Export Studio Panel ─────────────────────────────────────────────
    mountExportStudioPanel(document.body, runtime ?? null);

    // ── Mount Visualization Engine Panel ─────────────────────────────────────
    const vizEnginePanel = mountVisualizationEnginePanel(document.body, runtime ?? null);
    window.vizEnginePanel         = vizEnginePanel; // TODO(F.10.x): legacy vizEnginePanel global — replace with runtime.plugins.contributions('panel.rendering') registry
    window.viewportRenderModePanel = vizEnginePanel; // TODO(F.10.x): legacy viewportRenderModePanel global — replace with runtime.plugins.contributions('panel.rendering') registry
    window.renderPanel            = renderPanelInstance; // TODO(F.10.x): legacy renderPanel global — replace with runtime.plugins.contributions('panel.rendering') registry
    window.panoramaPanel          = panoramaPanelInstance; // TODO(F.10.x): legacy panoramaPanel global — replace with runtime.plugins.contributions('panel.rendering') registry
    window.videoExportPanel       = videoExportPanelInstance; // TODO(F.10.x): legacy videoExportPanel global — replace with runtime.plugins.contributions('panel.rendering') registry

    // ── Sync pipeline badges + toggles to RenderPipelineManager events ────────
    window.addEventListener('pipeline-phase-changed', (evt: Event) => {
        const { webGpuActive } = (evt as CustomEvent<{ phase: string; webGpuActive: boolean }>).detail;
        const badge = document.getElementById('ph-badge-webgpu');
        if (badge) badge.classList.toggle('ph-badge--active', webGpuActive);
    });
    window.addEventListener('ssgi-state-changed', (evt: Event) => {
        const { active } = (evt as CustomEvent<{ active: boolean }>).detail;
        const badge  = document.getElementById('ph-badge-ssgi');
        const toggle = document.getElementById('ph-toggle-ssgi') as HTMLInputElement | null;
        if (badge)  badge.classList.toggle('ph-badge--active', active);
        if (toggle) toggle.checked = active;
    });
    window.addEventListener('traa-state-changed', (evt: Event) => {
        const { active } = (evt as CustomEvent<{ active: boolean }>).detail;
        const badge  = document.getElementById('ph-badge-traa');
        const toggle = document.getElementById('ph-toggle-traa') as HTMLInputElement | null;
        if (badge)  badge.classList.toggle('ph-badge--active', active);
        if (toggle) toggle.checked = active;
    });

    // ── Mount Real Sun Control ────────────────────────────────────────────────
    mountRealSunControl(document.body, runtime ?? null);

    // ── Mount Performance Mode Panel ──────────────────────────────────────────
    mountPerformanceModePanel(runtime ?? null);

    // ── Mount First-Person Walkthrough HUD ────────────────────────────────────
    mountWalkthroughPanel(document.body, runtime ?? null);

    const _fpObcCamera = props.world.camera as OBC.OrthoPerspectiveCamera;
    const _fpCanvas    = props.world.renderer!.three.domElement as HTMLElement;
    const _fpScene     = (props.world.scene as any).three as THREE.Scene;

    const firstPersonController = new FirstPersonController(
        _fpObcCamera,
        _fpCanvas,
        _fpScene,
    );
    window.firstPersonController = firstPersonController; // TODO(D.10): legacy firstPersonController global — replace with runtime.cameraController.fpv (after D.9/D.10)

    window.addEventListener('fw-mode-changed', (e: Event) => {
        const active = (e as CustomEvent).detail?.active ?? false;
        const btn    = document.getElementById('btn-walkthrough');
        const hud    = getWalkthroughPanel();
        if (active) {
            hud.show();
            if (btn) {
                btn.textContent = '■ Exit Walk Mode';
                btn.classList.add('vpt-mode-toggle-btn--active');
            }
        } else {
            hud.hide();
            if (btn) {
                btn.textContent = '🚶 Walk Mode';
                btn.classList.remove('vpt-mode-toggle-btn--active');
            }
        }
    });
}
