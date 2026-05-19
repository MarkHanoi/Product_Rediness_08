/**
 * @file src/ui/rendering/VisualizationEnginePanel.ts
 * @description Unified Visualization Engine control panel — covers Sections 1–6
 *   of the PRYZM Visualization Engine UX & Rendering System specification.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §3, §7.8):
 *  - Prefix: `viz-`  (unique, registered in AppTheme.ts as VIZ_ENGINE_PANEL_STYLES)
 *  - NO bim-* web components (§7.8 strict ban)
 *  - All CSS injected via injectAppTheme() — no independent <style> tags
 *  - UI-only: NEVER writes to any ElementStore or semantic state
 *  - Communicates via window.renderingPipelineCoordinator (coordinator)
 *    and window.enableViewportRenderMode / window.disableViewportRenderMode
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - This panel does NOT mutate any ElementStore or semantic state.
 *  - All Three.js interactions are through the coordinator's published API.
 *
 * Tabs:
 *  1. Quality      — Real-time enhancement level (via RenderingPipelineCoordinator)
 *  2. Lighting     — HDRI presets, procedural sky, Real Sun time-of-day
 *  3. Camera       — Camera presets (Eye Level / Top-Down / Interior Wide / Corner)
 *  4. Post FX      — Tone Mapping / Bloom / Vignette / SSAO / Output shortcuts
 *  5. Path Trace   — In-viewport progressive path tracer (DOF, samples, start/stop)
 *
 * Design spec reference:
 *  - docs/Photorealistic/realtime-authoring-viewport-pipeline.md §6
 *  - attached: PRYZM Visualization Engine UX & Rendering System (Advanced Prompt)
 */

import { injectAppTheme } from '../styles/AppTheme';
import { panelManager }   from '../PanelManager';
import type { EnhancementLevel } from '@pryzm/core-app-model/rendering';
import type { SSGIService } from '@pryzm/core-app-model/rendering';
import { setSharedHdri, setSharedEnhancementLevel, setSharedRealSun, sharedRenderingState } from '@pryzm/core-app-model/rendering';
import type { VPTStatus } from '@pryzm/core-app-model/rendering';
import { buildVisualizationPanel } from './VisualizationEnginePanelBuilder';
import { HDRI_PRESETS, LIGHTING_PRESETS, type CameraPreset } from './VisualizationEnginePanelData';

// ── Types ────────────────────────────────────────────────────────────────────

type RenderingModeId = 'realtime' | 'preview' | 'final';



type ActiveTab = 'quality' | 'lighting' | 'camera' | 'postfx' | 'rendermode';

// ── VPT Status labels / colours (mirrors ViewportRenderModePanel — Phase 3) ──

const VPT_STATUS_LABELS: Record<VPTStatus, string> = {
    idle:         '○  Idle',
    building:     '⏳  Building BVH…',
    accumulating: '●  Accumulating',
    converged:    '✓  Converged',
    paused:       '⏸  Paused',
};

const VPT_STATUS_COLORS: Record<VPTStatus, string> = {
    idle:         'var(--app-status-idle)',
    building:     'var(--app-status-warning)',
    accumulating: 'var(--app-status-violet)',
    converged:    'var(--app-status-success)',
    paused:       'var(--app-status-warning)',
};



// ── Class ─────────────────────────────────────────────────────────────────────

export class VisualizationEnginePanel {
    private _el: HTMLElement;
    private _activeTab: ActiveTab = 'lighting';
    private _activeLightingPreset: string | null = null;
    private _currentRenderMode: RenderingModeId = 'realtime';
    private _isVisible = false;

    // ── Phase 3: Render Mode tab state (mirrors ViewportRenderModePanel) ──────
    private _vptDofEnabled     = false;
    private _vptFStop          = 2.8;
    private _vptFocalDistance  = 10;
    private _vptApertureBlades = 6;
    private _vptMaxSamples     = 1000;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        injectAppTheme();
        this._el = this._build();
        panelManager.register('panel:viz-engine', () => this.hide());

        // Phase 3 — react to path-tracer activating/deactivating from external code.
        // F.events.10 — vpt-mode-changed via runtime.events
        window.runtime?.events?.on('vpt-mode-changed', (payload: unknown) => {
            const active = (payload as { active?: boolean })?.active ?? false;
            const toggleBtn = this._el.querySelector<HTMLButtonElement>('.viz-rm-toggle-btn');
            if (toggleBtn) {
                toggleBtn.textContent = active ? '■  Exit Path Tracing' : '▶  Start Path Tracing';
                toggleBtn.style.background = active ? '#4b1c7d' : '';
            }
            if (!active) this._disableRmActions();
        });

        // Phase 3 — keep HDRI label in Render Mode tab in sync.
        window.addEventListener('pryzm-rendering-state-changed', (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            if (detail.hdriPresetId) this._updateRmHdriLabel(detail.hdriPresetId);
        });
    }

    // ── Phase 3: Public VPT-compat API (called by EngineBootstrap) ───────────

    /** Update sample progress — mirrors ViewportRenderModePanel.updateSamples */
    updateSamples(samples: number, max: number, status: VPTStatus): void {
        const pct = max > 0 ? Math.min(1, samples / max) : 0;
        const fill    = this._el.querySelector<HTMLElement>('.viz-rm-progress-fill');
        const counter = this._el.querySelector<HTMLElement>('.viz-rm-sample-counter');
        const dot     = this._el.querySelector<HTMLElement>('.viz-rm-status');
        if (fill)    fill.style.width    = `${Math.round(pct * 100)}%`;
        if (counter) counter.textContent = `${samples} / ${max} samples`;
        if (dot) {
            dot.textContent = VPT_STATUS_LABELS[status] ?? status;
            dot.style.color = VPT_STATUS_COLORS[status] ?? '#888';
        }
    }

    /** Update status indicator — mirrors ViewportRenderModePanel.updateStatus */
    updateStatus(status: VPTStatus | string): void {
        const dot      = this._el.querySelector<HTMLElement>('.viz-rm-status');
        const pauseBtn = this._el.querySelector<HTMLButtonElement>('.viz-rm-pause-btn');
        if (dot) {
            dot.textContent = VPT_STATUS_LABELS[status as VPTStatus] ?? status;
            dot.style.color = VPT_STATUS_COLORS[status as VPTStatus] ?? '#f59e0b';
        }
        if (pauseBtn) {
            const st = status as VPTStatus;
            if (st === 'paused') {
                pauseBtn.textContent = '▶  Resume';
                pauseBtn.style.background = '#166534';
            } else {
                pauseBtn.textContent = '⏸  Pause';
                pauseBtn.style.background = '';
            }
            pauseBtn.disabled = st === 'idle' || st === 'building';
        }
    }

    /** Enable action buttons when path tracer goes live — mirrors ViewportRenderModePanel.enableActions */
    enableActions(): void {
        const pauseBtn = this._el.querySelector<HTMLButtonElement>('.viz-rm-pause-btn');
        const shotBtn  = this._el.querySelector<HTMLButtonElement>('.viz-rm-screenshot-btn');
        if (pauseBtn) pauseBtn.disabled = false;
        if (shotBtn)  shotBtn.disabled  = false;
        // Sync HDRI label when path tracer goes live
        const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
        if (vpt?.active) {
            vpt.updateOptions({ hdriPresetId: sharedRenderingState.hdriPresetId });
            this._updateRmHdriLabel(sharedRenderingState.hdriPresetId);
        }
    }

    private _disableRmActions(): void {
        const pauseBtn = this._el.querySelector<HTMLButtonElement>('.viz-rm-pause-btn');
        const shotBtn  = this._el.querySelector<HTMLButtonElement>('.viz-rm-screenshot-btn');
        if (pauseBtn) { pauseBtn.disabled = true; pauseBtn.textContent = '⏸  Pause'; }
        if (shotBtn)  { shotBtn.disabled  = true; }
    }

    private _updateRmHdriLabel(hdriPresetId: string): void {
        const label = this._el.querySelector<HTMLElement>('.viz-rm-hdri-name');
        if (!label) return;
        const preset = HDRI_PRESETS.find(p => p.id === hdriPresetId);
        label.textContent = preset?.label ?? hdriPresetId;
    }

    // ── Mount / visibility ────────────────────────────────────────────────────

    getElement(): HTMLElement { return this._el; }

    show(): void {
        panelManager.notifyOpened('panel:viz-engine');
        this._el.style.display = 'flex';
        this._isVisible = true;
        // Restore last-active tab on re-open
        this._switchTab(this._activeTab);
        // Auto-activate 'high' enhancement when panel opens if coordinator is ready
        // and no enhancement is currently active.
        this._autoActivateIfNeeded();
    }

    /** Returns the currently active rendering mode. */
    getCurrentRenderMode(): RenderingModeId { return this._currentRenderMode; }

    hide(): void {
        panelManager.notifyClosed('panel:viz-engine');
        this._el.style.display = 'none';
        this._isVisible = false;
    }

    toggle(): void {
        if (this._isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    mount(container: HTMLElement = document.body): void {
        container.appendChild(this._el);
    }

    // ── Auto-activation ───────────────────────────────────────────────────────
    // Activates 'high' quality when the panel is first opened, matching
    // the EngineBootstrap integration spec from realtime-authoring-viewport-pipeline.md §5.
    //
    // Guard: When the WebGPU path-tracer pipeline is active (phase ≥ 5 or
    // renderPipelineManager.status.webGpuActive = true), coordinator.activateRealtimeEnhancements
    // must NOT be called — the TSL post-processing pipeline owns all rendering.
    // In that case we skip activation silently and show an informational notice.

    private async _autoActivateIfNeeded(): Promise<void> {
        // Phase 5+ guard — do not call activateRealtimeEnhancements while the
        // WebGPU path-tracing pipeline is in full control of the render loop.
        const phase       = window.currentPipelinePhase as number | undefined; // TODO(D.4): legacy currentPipelinePhase — replace with runtime.scene.renderer.pipeline phase flag
        const rpmActive   = window.renderPipelineManager?.status?.webGpuActive as boolean | undefined; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
        if ((phase !== undefined && phase >= 5) || rpmActive === true) {
            console.log('[VisualizationEnginePanel] Phase 5 pipeline active — skipping auto-activate.');
            // Fix 2: Surface an informational notice so the user knows the TSL
            // pipeline is active and HDRI/SSGI are managed directly by the renderer —
            // not suppressed due to an error.
            const notice = this._el.querySelector<HTMLElement>('.ph-phase5-notice');
            if (notice) notice.classList.add('ph-phase5-notice--visible');
            return;
        }
        // Hide the notice if we are back in a non-WebGPU mode.
        const notice = this._el.querySelector<HTMLElement>('.ph-phase5-notice');
        if (notice) notice.classList.remove('ph-phase5-notice--visible');

        const coordinator = this._getCoordinator();
        if (!coordinator) return;

        const state = coordinator.state;
        if (!state || state.enhancementLevel === 'off') {
            try {
                await coordinator.activateRealtimeEnhancements('high', {
                    hdriPresetId: 'daylight-interior',
                });
                // Phase 1 — write auto-activated HDRI and level to shared state.
                setSharedHdri('daylight-interior');
                setSharedEnhancementLevel('high');
                this._syncQualityButtons('high');
                this._syncStatusBar('high');
                this._activeLightingPreset = 'daylight';
                this._syncLightingCards();
            } catch (err: any) {
                console.warn('[VisualizationEnginePanel] Auto-activate error:', err?.message ?? err);
            }
        }
    }

    /**
     * Opens the panel and switches immediately to the Path Trace tab.
     * Called from the sidebar "Path Trace Viewport" shortcut button.
     */
    openAtRenderModeTab(): void {
        this.show();
        this._switchTab('rendermode');
    }

    // ── Build ──────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = buildVisualizationPanel();
        this._wire(panel);
        return panel;
    }


    private _wire(panel: HTMLElement): void {
        // Close button
        panel.querySelector('.viz-close-btn')?.addEventListener('click', () => this.hide());

        // Tab nav
        panel.querySelectorAll<HTMLButtonElement>('.viz-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset['tab'] as ActiveTab;
                this._switchTab(tab);
            });
        });

        // Quality level buttons
        panel.querySelectorAll<HTMLButtonElement>('.viz-quality-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const level = btn.dataset['level'] as EnhancementLevel;
                await this._applyQualityLevel(level);
            });
        });

        // Quality HDRI select
        const hdriSelect = panel.querySelector<HTMLSelectElement>('#viz-hdri-select');
        hdriSelect?.addEventListener('change', async () => {
            await this._applyHdriPreset(hdriSelect.value);
        });

        // Lighting preset cards
        panel.querySelectorAll<HTMLButtonElement>('.viz-preset-btn[data-preset]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const presetId = btn.dataset['preset']!;
                await this._applyLightingPreset(presetId);
            });
        });

        // Lighting HDRI select
        const lightingHdriSelect = panel.querySelector<HTMLSelectElement>('#viz-lighting-hdri-select');
        lightingHdriSelect?.addEventListener('change', async () => {
            await this._applyHdriPreset(lightingHdriSelect.value);
            const syncMain = panel.querySelector<HTMLSelectElement>('#viz-hdri-select');
            if (syncMain) syncMain.value = lightingHdriSelect.value;
        });

        // HDRI intensity slider
        const intensitySlider = panel.querySelector<HTMLInputElement>('#viz-hdri-intensity');
        const intensityVal    = panel.querySelector<HTMLElement>('#viz-hdri-intensity-val');
        intensitySlider?.addEventListener('input', async () => {
            const val = parseFloat(intensitySlider.value);
            if (intensityVal) intensityVal.textContent = `${val.toFixed(2)}×`;
            const coordinator = this._getCoordinator();
            if (coordinator) {
                try {
                    await coordinator.setHdriPreset(
                        panel.querySelector<HTMLSelectElement>('#viz-lighting-hdri-select')?.value ?? 'daylight-interior',
                        val,
                    );
                } catch { /* non-fatal */ }
            }
        });

        // Camera preset cards
        panel.querySelectorAll<HTMLButtonElement>('.viz-preset-btn[data-camera]').forEach(btn => {
            btn.addEventListener('click', () => {
                const presetId = btn.dataset['camera']!;
                this._applyCameraPreset(presetId);
            });
        });

        // FOV slider
        const fovSlider = panel.querySelector<HTMLInputElement>('#viz-fov-slider');
        const fovVal    = panel.querySelector<HTMLElement>('#viz-fov-val');
        fovSlider?.addEventListener('input', () => {
            const fov = parseInt(fovSlider.value, 10);
            if (fovVal) fovVal.textContent = `${fov}°`;
            this._applyCameraFov(fov);
        });

        // Eye height slider
        const eyeSlider = panel.querySelector<HTMLInputElement>('#viz-eye-height-slider');
        const eyeVal    = panel.querySelector<HTMLElement>('#viz-eye-height-val');
        eyeSlider?.addEventListener('input', () => {
            const h = parseFloat(eyeSlider.value);
            if (eyeVal) eyeVal.textContent = `${h.toFixed(1)}m`;
            this._applyCameraEyeHeight(h);
        });

        // Camera exposure slider (Section 2.3)
        const expSlider = panel.querySelector<HTMLInputElement>('#viz-exposure-slider');
        const expVal    = panel.querySelector<HTMLElement>('#viz-exposure-val');
        expSlider?.addEventListener('input', () => {
            const val = parseFloat(expSlider.value);
            if (expVal) expVal.textContent = `${val.toFixed(2)}×`;
            this._applyExposure(val);
        });

        // Tone mapping select (Section 5)
        const tonemapSel = panel.querySelector<HTMLSelectElement>('#viz-tonemap-select');
        tonemapSel?.addEventListener('change', () => {
            const val = parseInt(tonemapSel.value, 10);
            this._applyToneMapping(val);
        });

        // Post FX exposure
        const postExpSlider = panel.querySelector<HTMLInputElement>('#viz-postfx-exposure');
        const postExpVal    = panel.querySelector<HTMLElement>('#viz-postfx-exposure-val');
        postExpSlider?.addEventListener('input', () => {
            const val = parseFloat(postExpSlider.value);
            if (postExpVal) postExpVal.textContent = `${val.toFixed(2)}×`;
            this._applyExposure(val);
        });

        // Postproduction toggle
        panel.querySelector<HTMLInputElement>('#viz-postpro-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const renderer = window.world?.renderer; // TODO(D.4): legacy world — replace with runtime.scene.world
            if (renderer?.postproduction) {
                renderer.postproduction.enabled = enabled;
            }
        });

        // Outlines toggle
        panel.querySelector<HTMLInputElement>('#viz-outlines-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const renderer = window.world?.renderer; // TODO(D.4): legacy world — replace with runtime.scene.world
            if (renderer?.postproduction) {
                renderer.postproduction.outlinesEnabled = enabled;
            }
        });

        // SMAA toggle
        panel.querySelector<HTMLInputElement>('#viz-smaa-toggle')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const renderer = window.world?.renderer; // TODO(D.4): legacy world — replace with runtime.scene.world
            if (renderer?.postproduction) {
                renderer.postproduction.smaaEnabled = enabled;
            }
        });

        // Output shortcut buttons
        panel.querySelector('#viz-btn-generate-render')?.addEventListener('click', () => {
            const rp = window.renderPanel; // TODO(F.6.5): legacy renderPanel — replace with runtime.panelHost.get('render')
            if (rp) rp.toggle();
        });

        panel.querySelector('#viz-btn-panorama')?.addEventListener('click', () => {
            const pp = window.panoramaPanel; // TODO(F.6.5): legacy panoramaPanel — replace with runtime.panelHost.get('panorama')
            if (pp) pp.toggle();
        });

        panel.querySelector('#viz-btn-video')?.addEventListener('click', () => {
            const vp = window.videoExportPanel; // TODO(F.6.5): legacy videoExportPanel — replace with runtime.panelHost.get('videoExport')
            if (vp) vp.toggle();
        });

        // ── Procedural Sky (Phase 1) ───────────────────────────────────────

        const skyToggle   = panel.querySelector<HTMLInputElement>('#viz-sky-toggle');
        const skyControls = panel.querySelector<HTMLElement>('#viz-sky-controls');

        skyToggle?.addEventListener('change', () => {
            const enabled = skyToggle.checked;
            const coordinator = this._getCoordinator();
            if (!coordinator) return;
            if (enabled) {
                coordinator.activateProceduralSky();
                if (skyControls) skyControls.style.display = 'flex';
            } else {
                coordinator.deactivateProceduralSky(true);
                if (skyControls) skyControls.style.display = 'none';
            }
        });

        // Sky preset buttons
        panel.querySelectorAll<HTMLButtonElement>('.viz-sky-preset-btn[data-sky-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const presetId = btn.dataset['skyPreset'] as any;
                const coordinator = this._getCoordinator();
                if (coordinator) {
                    if (!coordinator.proceduralSky.active) {
                        coordinator.activateProceduralSky({ });
                        if (skyToggle) skyToggle.checked = true;
                        if (skyControls) skyControls.style.display = 'flex';
                    }
                    coordinator.setSkyPreset(presetId);
                    this._syncSkyPresetBtns(panel, presetId);
                    this._syncSkySliders(panel, coordinator.proceduralSky.params);
                }
            });
        });

        // Sky elevation slider
        const skyElevSlider = panel.querySelector<HTMLInputElement>('#viz-sky-elevation');
        const skyElevVal    = panel.querySelector<HTMLElement>('#viz-sky-elevation-val');
        skyElevSlider?.addEventListener('input', () => {
            const val = parseInt(skyElevSlider.value, 10);
            if (skyElevVal) skyElevVal.textContent = `${val}°`;
            this._getCoordinator()?.setSkyElevation(val);
        });

        // Sky azimuth slider
        const skyAzSlider = panel.querySelector<HTMLInputElement>('#viz-sky-azimuth');
        const skyAzVal    = panel.querySelector<HTMLElement>('#viz-sky-azimuth-val');
        skyAzSlider?.addEventListener('input', () => {
            const val = parseInt(skyAzSlider.value, 10);
            if (skyAzVal) skyAzVal.textContent = `${val}°`;
            this._getCoordinator()?.setSkyAzimuth(val);
        });

        // Sky turbidity slider
        const skyTurbSlider = panel.querySelector<HTMLInputElement>('#viz-sky-turbidity');
        const skyTurbVal    = panel.querySelector<HTMLElement>('#viz-sky-turbidity-val');
        skyTurbSlider?.addEventListener('input', () => {
            const val = parseFloat(skyTurbSlider.value);
            if (skyTurbVal) skyTurbVal.textContent = String(val);
            this._getCoordinator()?.setSkyTurbidity(val);
        });

        // ── Enhanced Bloom (Phase 2) ───────────────────────────────────────

        const bloomToggle   = panel.querySelector<HTMLInputElement>('#viz-bloom-toggle');
        const bloomControls = panel.querySelector<HTMLElement>('#viz-bloom-controls');

        bloomToggle?.addEventListener('change', () => {
            const enabled = bloomToggle.checked;
            const enable  = window.enableEnhancedBloom; // TODO(D.4): legacy enableEnhancedBloom — replace with runtime.scene.renderer.setBloom(true)
            const disable = window.disableEnhancedBloom; // TODO(D.4): legacy disableEnhancedBloom — replace with runtime.scene.renderer.setBloom(false)
            if (enabled) {
                // Mutual exclusivity: deactivate SSGI first if active
                const ssgiActive = (window.ssgiService)?.active; // TODO(D.4): legacy ssgiService — replace with runtime.scene.renderer SSGI service
                if (ssgiActive) {
                    window.disableSSGI?.(); // TODO(D.4): legacy disableSSGI — replace with runtime.scene.renderer.setSSGI(false)
                    const ssgiToggle = panel.querySelector<HTMLInputElement>('#viz-ssgi-toggle');
                    const ssgiControls = panel.querySelector<HTMLElement>('#viz-ssgi-controls');
                    if (ssgiToggle) ssgiToggle.checked = false;
                    if (ssgiControls) ssgiControls.style.display = 'none';
                }
                if (enable) enable();
                if (bloomControls) bloomControls.style.display = 'flex';
            } else {
                if (disable) disable();
                if (bloomControls) bloomControls.style.display = 'none';
            }
        });

        const bloomStrengthSlider = panel.querySelector<HTMLInputElement>('#viz-bloom-strength');
        const bloomStrengthVal    = panel.querySelector<HTMLElement>('#viz-bloom-strength-val');
        bloomStrengthSlider?.addEventListener('input', () => {
            const val = parseFloat(bloomStrengthSlider.value);
            if (bloomStrengthVal) bloomStrengthVal.textContent = val.toFixed(2);
            window.enhancedBloomService?.setStrength(val); // TODO(D.4): legacy enhancedBloomService — replace with runtime.scene.renderer bloom service
        });

        const bloomThresholdSlider = panel.querySelector<HTMLInputElement>('#viz-bloom-threshold');
        const bloomThresholdVal    = panel.querySelector<HTMLElement>('#viz-bloom-threshold-val');
        bloomThresholdSlider?.addEventListener('input', () => {
            const val = parseFloat(bloomThresholdSlider.value);
            if (bloomThresholdVal) bloomThresholdVal.textContent = val.toFixed(2);
            window.enhancedBloomService?.setThreshold(val); // TODO(D.4): legacy enhancedBloomService — replace with runtime.scene.renderer bloom service
        });

        const bloomRadiusSlider = panel.querySelector<HTMLInputElement>('#viz-bloom-radius');
        const bloomRadiusVal    = panel.querySelector<HTMLElement>('#viz-bloom-radius-val');
        bloomRadiusSlider?.addEventListener('input', () => {
            const val = parseFloat(bloomRadiusSlider.value);
            if (bloomRadiusVal) bloomRadiusVal.textContent = val.toFixed(2);
            window.enhancedBloomService?.setRadius(val); // TODO(D.4): legacy enhancedBloomService — replace with runtime.scene.renderer bloom service
        });

        // ── Screen-Space GI / SSGI (Phase 2) ─────────────────────────────

        const ssgiToggle   = panel.querySelector<HTMLInputElement>('#viz-ssgi-toggle');
        const ssgiControls = panel.querySelector<HTMLElement>('#viz-ssgi-controls');

        ssgiToggle?.addEventListener('change', () => {
            const enabled = ssgiToggle.checked;
            const enable  = window.enableSSGI; // TODO(D.4): legacy enableSSGI — replace with runtime.scene.renderer.setSSGI(true)
            const disable = window.disableSSGI; // TODO(D.4): legacy disableSSGI — replace with runtime.scene.renderer.setSSGI(false)
            if (enabled) {
                // Mutual exclusivity: deactivate Bloom first if active
                const bloomActive = (window.enhancedBloomService)?.active; // TODO(D.4): legacy enhancedBloomService — replace with runtime.scene.renderer bloom service
                if (bloomActive) {
                    window.disableEnhancedBloom?.(); // TODO(D.4): legacy disableEnhancedBloom — replace with runtime.scene.renderer.setBloom(false)
                    if (bloomToggle) bloomToggle.checked = false;
                    if (bloomControls) bloomControls.style.display = 'none';
                }
                if (enable) enable();
                if (ssgiControls) ssgiControls.style.display = 'flex';
            } else {
                if (disable) disable();
                if (ssgiControls) ssgiControls.style.display = 'none';
            }
        });

        const ssgiIntensitySlider = panel.querySelector<HTMLInputElement>('#viz-ssgi-intensity');
        const ssgiIntensityVal    = panel.querySelector<HTMLElement>('#viz-ssgi-intensity-val');
        ssgiIntensitySlider?.addEventListener('input', () => {
            const val = parseFloat(ssgiIntensitySlider.value);
            if (ssgiIntensityVal) ssgiIntensityVal.textContent = val.toFixed(2);
            (window.ssgiService as SSGIService | undefined)?.setIntensity(val); // TODO(D.4): legacy ssgiService — replace with runtime.scene.renderer SSGI service
        });

        const ssgiSamplesSel = panel.querySelector<HTMLSelectElement>('#viz-ssgi-samples');
        ssgiSamplesSel?.addEventListener('change', () => {
            const val = parseInt(ssgiSamplesSel.value, 10) as 8 | 16 | 32;
            (window.ssgiService as SSGIService | undefined)?.setPdSamples(val); // TODO(D.4): legacy ssgiService — replace with runtime.scene.renderer SSGI service
        });

        // ── Clearcoat Material Upgrade (Phase 1) ──────────────────────────

        const clearcoatToggle = panel.querySelector<HTMLInputElement>('#viz-clearcoat-toggle');
        const clearcoatInfo   = panel.querySelector<HTMLElement>('#viz-clearcoat-info');

        clearcoatToggle?.addEventListener('change', () => {
            const enabled = clearcoatToggle.checked;
            const coordinator = this._getCoordinator();
            if (coordinator) {
                coordinator.setClearcoatUpgrade(enabled);
                if (clearcoatInfo) clearcoatInfo.style.display = enabled ? 'block' : 'none';
            }
        });

        // ── Real Sun (Phase 2) ─────────────────────────────────────────────

        const sunToggle   = panel.querySelector<HTMLInputElement>('#viz-real-sun-toggle');
        const sunControls = panel.querySelector<HTMLElement>('#viz-real-sun-controls');
        const sunTimeSlider  = panel.querySelector<HTMLInputElement>('#viz-sun-time-slider');
        const sunTimeDisplay = panel.querySelector<HTMLElement>('#viz-sun-time-display');
        const sunLatInput  = panel.querySelector<HTMLInputElement>('#viz-sun-lat');
        const sunLngInput  = panel.querySelector<HTMLInputElement>('#viz-sun-lng');
        const sunStatus    = panel.querySelector<HTMLElement>('#viz-sun-status');

        const _sunFormatTime = (hours: number): string => {
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        const _sunUpdateStatus = (pos: { altitude: number; isAboveHorizon: boolean; intensity: number }): void => {
            if (!sunStatus) return;
            const altDeg = (pos.altitude * 180 / Math.PI).toFixed(1);
            const icon   = pos.isAboveHorizon ? '☀' : '🌙';
            sunStatus.textContent = `${icon}  Altitude: ${altDeg}°   Intensity: ${pos.intensity.toFixed(2)}`;
        };

        const _sunGetService = (): any =>
            this._getCoordinator()?.realSunService ?? null;

        // Toggle: enable / disable real sun
        sunToggle?.addEventListener('change', () => {
            const enabled = sunToggle.checked;
            const coordinator = this._getCoordinator();
            if (!coordinator) {
                console.warn('[VisualizationEnginePanel] Coordinator not ready for Real Sun.');
                return;
            }
            if (enabled) {
                coordinator.enableRealSun();
                if (sunControls) sunControls.style.display = 'flex';
                // Sync initial time display from service config
                const svc = _sunGetService();
                if (svc) {
                    const cfg = svc.config;
                    if (sunLatInput && !sunLatInput.value) sunLatInput.value = cfg.lat.toFixed(4);
                    if (sunLngInput && !sunLngInput.value) sunLngInput.value = cfg.lng.toFixed(4);
                    const h = cfg.date.getUTCHours() + cfg.date.getUTCMinutes() / 60;
                    if (sunTimeSlider) sunTimeSlider.value = h.toFixed(2);
                    if (sunTimeDisplay) sunTimeDisplay.textContent = _sunFormatTime(h);
                    const pos = svc.lastPosition;
                    if (pos) _sunUpdateStatus(pos);
                }
            } else {
                coordinator.disableRealSun();
                if (sunControls) sunControls.style.display = 'none';
            }
            // Phase 2 — write real sun state to shared state.
            setSharedRealSun(enabled, parseFloat(sunTimeSlider?.value ?? '12'));
        });

        // Time slider
        sunTimeSlider?.addEventListener('input', () => {
            const hours = parseFloat(sunTimeSlider.value);
            if (sunTimeDisplay) sunTimeDisplay.textContent = _sunFormatTime(hours);
            const svc = _sunGetService();
            if (svc?.enabled) {
                svc.setTime(hours);
                const pos = svc.lastPosition;
                if (pos) _sunUpdateStatus(pos);
            }
            setSharedRealSun(true, hours);
        });

        // Lat / Lng inputs — apply on blur or Enter
        const _sunApplyLocation = (): void => {
            const lat = parseFloat(sunLatInput?.value ?? '40.4168');
            const lng = parseFloat(sunLngInput?.value ?? '-3.7038');
            if (isNaN(lat) || isNaN(lng)) return;
            const svc = _sunGetService();
            if (svc?.enabled) {
                svc.setLocation(lat, lng);
                const pos = svc.lastPosition;
                if (pos) _sunUpdateStatus(pos);
            }
        };

        sunLatInput?.addEventListener('blur',    _sunApplyLocation);
        sunLngInput?.addEventListener('blur',    _sunApplyLocation);
        sunLatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _sunApplyLocation(); });
        sunLngInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _sunApplyLocation(); });

        // Listen for sun position updates from the service
        window.addEventListener('rsc-sun-updated', (e: Event) => {
            const pos = (e as CustomEvent).detail;
            if (pos && sunToggle?.checked) _sunUpdateStatus(pos);
        });

        // ── Phase 3: Render Mode tab wiring ────────────────────────────────

        // Max samples selector
        panel.querySelector('#viz-rm-samples-select')?.addEventListener('change', (e) => {
            this._vptMaxSamples = parseInt((e.target as HTMLSelectElement).value, 10);
            const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
            if (vpt?.active) vpt.updateOptions({ maxSamples: this._vptMaxSamples });
            const counter = panel.querySelector<HTMLElement>('.viz-rm-sample-counter');
            if (counter) counter.textContent = `0 / ${this._vptMaxSamples} samples`;
        });

        // DOF toggle
        panel.querySelector('#viz-rm-dof-toggle')?.addEventListener('change', (e) => {
            this._vptDofEnabled = (e.target as HTMLInputElement).checked;
            const dofControls = panel.querySelector<HTMLElement>('#viz-rm-dof-controls');
            if (dofControls) dofControls.style.display = this._vptDofEnabled ? 'flex' : 'none';
            const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
            if (vpt?.active) {
                vpt.updateOptions({
                    fStop:          this._vptDofEnabled ? this._vptFStop : Infinity,
                    focalDistance:  this._vptFocalDistance,
                    apertureBlades: this._vptApertureBlades,
                });
            }
        });

        // f/stop slider
        panel.querySelector('#viz-rm-fstop')?.addEventListener('input', (e) => {
            this._vptFStop = parseFloat((e.target as HTMLInputElement).value);
            const val = panel.querySelector<HTMLElement>('#viz-rm-fstop-val');
            if (val) val.textContent = `f/${this._vptFStop.toFixed(1)}`;
            if (this._vptDofEnabled) {
                const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
                if (vpt?.active) vpt.updateOptions({ fStop: this._vptFStop });
            }
        });

        // Focal distance slider
        panel.querySelector('#viz-rm-focal')?.addEventListener('input', (e) => {
            this._vptFocalDistance = parseFloat((e.target as HTMLInputElement).value);
            const val = panel.querySelector<HTMLElement>('#viz-rm-focal-val');
            if (val) val.textContent = `${this._vptFocalDistance.toFixed(1)}m`;
            if (this._vptDofEnabled) {
                const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
                if (vpt?.active) vpt.updateOptions({ focalDistance: this._vptFocalDistance });
            }
        });

        // Aperture blades slider
        panel.querySelector('#viz-rm-blades')?.addEventListener('input', (e) => {
            this._vptApertureBlades = parseInt((e.target as HTMLInputElement).value, 10);
            const val = panel.querySelector<HTMLElement>('#viz-rm-blades-val');
            if (val) val.textContent = `${this._vptApertureBlades}`;
            if (this._vptDofEnabled) {
                const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
                if (vpt?.active) vpt.updateOptions({ apertureBlades: this._vptApertureBlades });
            }
        });

        // Pause / Resume button
        panel.querySelector('.viz-rm-pause-btn')?.addEventListener('click', () => {
            const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
            if (!vpt?.active) return;
            if (vpt.paused) { vpt.resume(); } else { vpt.pause(); }
        });

        // Screenshot button
        panel.querySelector('.viz-rm-screenshot-btn')?.addEventListener('click', () => {
            const vpt = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
            if (!vpt?.active) return;
            const dataUrl = vpt.captureCurrentFrame();
            if (!dataUrl) return;
            const a = document.createElement('a');
            a.href     = dataUrl;
            a.download = `pryzm-pathtrace-${Date.now()}.png`;
            a.click();
        });

        // Start / Exit toggle button
        panel.querySelector('.viz-rm-toggle-btn')?.addEventListener('click', async () => {
            const enable  = window.enableViewportRenderMode; // TODO(D.4): legacy enableViewportRenderMode — replace with runtime.scene.renderer.setViewportRenderMode(true)
            const disable = window.disableViewportRenderMode; // TODO(D.4): legacy disableViewportRenderMode — replace with runtime.scene.renderer.setViewportRenderMode(false)
            const vpt     = window.viewportPathTracer; // TODO(D.4): legacy viewportPathTracer — replace with runtime.scene.renderer path-tracer
            if (!enable || !disable) return;
            if (vpt?.active) {
                disable();
                this._currentRenderMode = 'realtime';
                window.runtime?.events?.emit('vpt-mode-changed', { active: false }); // F.events.10
            } else {
                await enable();
                this._currentRenderMode = 'preview';
            }
        });
    }

    // ── Quality level ────────────────────────────────────────────────────────

    private async _applyQualityLevel(level: EnhancementLevel): Promise<void> {
        const coordinator = this._getCoordinator();
        if (!coordinator) {
            console.warn('[VisualizationEnginePanel] Coordinator not ready.');
            return;
        }

        this._setLoading(true, 'viz-loader');
        try {
            if (level === 'off') {
                await coordinator.deactivateRealtimeEnhancements();
            } else {
                const hdriSel = this._el.querySelector<HTMLSelectElement>('#viz-hdri-select');
                await coordinator.activateRealtimeEnhancements(level, {
                    hdriPresetId: hdriSel?.value ?? 'daylight-interior',
                });
            }

            // Sync DPR via RenderPerformanceService
            window.setRenderQualityLevel?.(level); // TODO(D.4): legacy setRenderQualityLevel — replace with runtime.scene.renderer.setQualityLevel

            // Phase 1 — write enhancement level to shared state.
            setSharedEnhancementLevel(level);

            this._syncQualityButtons(level);
            this._syncStatusBar(level);
            this._syncPipelineInfo(level);
        } catch (err: any) {
            console.error('[VisualizationEnginePanel] Quality level error:', err?.message ?? err);
        } finally {
            this._setLoading(false, 'viz-loader');
        }
    }

    private async _applyHdriPreset(presetId: string): Promise<void> {
        const coordinator = this._getCoordinator();
        if (!coordinator) return;
        this._setLoading(true, 'viz-loader');
        try {
            await coordinator.setHdriPreset(presetId);
            // Phase 1 — write to shared state so all export panels inherit this HDRI.
            setSharedHdri(presetId);
        } catch (err: any) {
            console.error('[VisualizationEnginePanel] HDRI error:', err?.message ?? err);
        } finally {
            this._setLoading(false, 'viz-loader');
        }
    }

    // ── Lighting Presets (Section 3.4) ────────────────────────────────────────

    private async _applyLightingPreset(presetId: string): Promise<void> {
        const preset = LIGHTING_PRESETS.find(p => p.id === presetId);
        if (!preset) return;

        const coordinator = this._getCoordinator();
        if (!coordinator) return;

        this._setLoading(true, 'viz-lighting-loader');
        try {
            await coordinator.activateRealtimeEnhancements(preset.level, {
                hdriPresetId: preset.hdriId,
            });

            // Apply tone mapping if preset specifies it
            if (preset.tonemap !== undefined) {
                this._applyToneMapping(preset.tonemap);
                const tonemapSel = this._el.querySelector<HTMLSelectElement>('#viz-tonemap-select');
                if (tonemapSel) tonemapSel.value = String(preset.tonemap);
            }

            // Phase 1 — write HDRI from lighting preset to shared state.
            setSharedHdri(preset.hdriId);

            // Sync lighting HDRI select
            const lightingHdriSelect = this._el.querySelector<HTMLSelectElement>('#viz-lighting-hdri-select');
            if (lightingHdriSelect) lightingHdriSelect.value = preset.hdriId;

            // Sync main quality HDRI select
            const mainHdriSelect = this._el.querySelector<HTMLSelectElement>('#viz-hdri-select');
            if (mainHdriSelect) mainHdriSelect.value = preset.hdriId;

            this._activeLightingPreset = presetId;
            this._syncLightingCards();
            this._syncQualityButtons(preset.level);
            this._syncStatusBar(preset.level);
            this._syncPipelineInfo(preset.level);
        } catch (err: any) {
            console.error('[VisualizationEnginePanel] Lighting preset error:', err?.message ?? err);
        } finally {
            this._setLoading(false, 'viz-lighting-loader');
        }
    }

    // ── Camera Presets (Section 2.2) ──────────────────────────────────────────

    private _applyCameraPreset(presetId: CameraPreset['id']): void {
        const world     = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        const navManager = window.navManager; // TODO(D.4): legacy navManager — replace with runtime.scene.navigation manager
        const viewController = window.viewController; // TODO(D.4): legacy viewController — replace with runtime.viewRegistry controller

        if (presetId === 'top-down') {
            // Use existing viewController top-down plan view
            if (viewController?.activatePlanView) {
                viewController.activatePlanView();
            } else if (navManager?.setTopDown) {
                navManager.setTopDown();
            }
        } else if (presetId === 'eye-level') {
            if (navManager?.setPerspective) navManager.setPerspective();
            this._applyCameraEyeHeight(1.6);
        } else if (presetId === 'interior-wide') {
            if (navManager?.setPerspective) navManager.setPerspective();
            this._applyCameraFov(75);
            this._applyCameraEyeHeight(1.6);
        } else if (presetId === 'corner-shot') {
            // Standard corner shot: eye level, 50° FOV, angled
            if (navManager?.setPerspective) navManager.setPerspective();
            this._applyCameraFov(50);
            this._applyCameraEyeHeight(1.2);
            // Apply a 45° orbit offset if camera controls support it
            if (world?.camera?.controls?.setLookAt) {
                // Non-destructive: just reset FOV and height — the user positions
                // the camera themselves for the composition they want.
            }
        }

        // Visual feedback: briefly highlight the pressed button
        this._el.querySelectorAll<HTMLButtonElement>('.viz-preset-btn[data-camera]').forEach(btn => {
            btn.classList.toggle('viz-preset-btn--active', btn.dataset['camera'] === presetId);
        });
        setTimeout(() => {
            this._el.querySelectorAll<HTMLButtonElement>('.viz-preset-btn[data-camera]').forEach(btn => {
                btn.classList.remove('viz-preset-btn--active');
            });
        }, 800);
    }

    private _applyCameraFov(fov: number): void {
        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.camera?.three) return;
        const camera = world.camera.three;
        if ('fov' in camera) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
    }

    private _applyCameraEyeHeight(heightM: number): void {
        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.camera?.controls) return;
        try {
            const controls = world.camera.controls;
            if (controls.getPosition) {
                const pos = controls.getPosition();
                controls.moveTo(pos.x, heightM, pos.z, true);
            }
        } catch { /* non-fatal if controls API differs */ }
    }

    // ── Post-Processing (Section 5) ───────────────────────────────────────────

    private _applyToneMapping(value: number): void {
        const renderer = window.world?.renderer?.three; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (renderer) {
            renderer.toneMapping = value;
        }
    }

    private _applyExposure(value: number): void {
        const renderer = window.world?.renderer?.three; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (renderer) {
            renderer.toneMappingExposure = value;
        }
    }

    // ── UI sync helpers ───────────────────────────────────────────────────────

    private _switchTab(tab: ActiveTab): void {
        this._activeTab = tab;

        this._el.querySelectorAll<HTMLButtonElement>('.viz-tab-btn').forEach(btn => {
            btn.classList.toggle('viz-tab-btn--active', btn.dataset['tab'] === tab);
        });

        const tabIds: Record<ActiveTab, string> = {
            quality:    'viz-tab-quality',
            lighting:   'viz-tab-lighting',
            camera:     'viz-tab-camera',
            postfx:     'viz-tab-postfx',
            rendermode: 'viz-tab-rendermode',
        };

        Object.entries(tabIds).forEach(([id, elId]) => {
            const el = this._el.querySelector<HTMLElement>(`#${elId}`);
            if (el) el.style.display = id === tab ? 'flex' : 'none';
        });
    }

    private _syncQualityButtons(level: EnhancementLevel): void {
        this._el.querySelectorAll<HTMLButtonElement>('.viz-quality-btn').forEach(btn => {
            btn.classList.toggle('viz-quality-btn--active', btn.dataset['level'] === level);
        });
    }

    private _syncStatusBar(level: EnhancementLevel): void {
        const bar = this._el.querySelector<HTMLElement>('#viz-status-bar');
        if (!bar) return;

        const STATUS: Record<EnhancementLevel, string> = {
            off:      '○ Off — Raw Three.js renderer',
            standard: '◑ Standard — PBR + enhanced shadows',
            high:     '● High — PBR · HDRI IBL · shadows',
            ultra:    '✦ Ultra — PBR · HDRI · shadows · reflection probes',
        };
        bar.textContent = STATUS[level] ?? '';
        bar.style.color =
            level === 'ultra'    ? '#a855f7' :
            level === 'high'     ? '#22c55e' :
            level === 'standard' ? '#f59e0b' : '#666';
    }

    private _syncPipelineInfo(level: EnhancementLevel): void {
        const dotHdri  = this._el.querySelector<HTMLElement>('#viz-dot-hdri');
        const dotProbe = this._el.querySelector<HTMLElement>('#viz-dot-probe');

        const hdriActive  = level === 'high' || level === 'ultra';
        const probeActive = level === 'ultra';

        if (dotHdri) {
            dotHdri.style.background = hdriActive ? '#22c55e' : '#444';
        }
        if (dotProbe) {
            dotProbe.style.background = probeActive ? '#a855f7' : '#444';
        }
    }

    private _syncLightingCards(): void {
        this._el.querySelectorAll<HTMLButtonElement>('.viz-preset-btn[data-preset]').forEach(btn => {
            btn.classList.toggle('viz-preset-btn--active', btn.dataset['preset'] === this._activeLightingPreset);
        });
    }

    private _setLoading(loading: boolean, loaderId: string): void {
        const loader = this._el.querySelector<HTMLElement>(`#${loaderId}`);
        if (loader) loader.style.display = loading ? 'flex' : 'none';
    }

    private _getCoordinator() {
        return window.renderingPipelineCoordinator ?? null; // TODO(D.4): legacy renderingPipelineCoordinator — replace with runtime.scene.renderer.pipeline coordinator
    }

    // ── Sky UI helpers ────────────────────────────────────────────────────

    private _syncSkyPresetBtns(panel: HTMLElement, activePresetId: string): void {
        panel.querySelectorAll<HTMLButtonElement>('.viz-sky-preset-btn[data-sky-preset]').forEach(btn => {
            btn.classList.toggle('viz-sky-preset-btn--active', btn.dataset['skyPreset'] === activePresetId);
        });
    }

    private _syncSkySliders(panel: HTMLElement, params: { elevation: number; azimuth: number; turbidity: number }): void {
        const elevSlider = panel.querySelector<HTMLInputElement>('#viz-sky-elevation');
        const elevVal    = panel.querySelector<HTMLElement>('#viz-sky-elevation-val');
        const azSlider   = panel.querySelector<HTMLInputElement>('#viz-sky-azimuth');
        const azVal      = panel.querySelector<HTMLElement>('#viz-sky-azimuth-val');
        const turbSlider = panel.querySelector<HTMLInputElement>('#viz-sky-turbidity');
        const turbVal    = panel.querySelector<HTMLElement>('#viz-sky-turbidity-val');

        if (elevSlider)  elevSlider.value = String(params.elevation);
        if (elevVal)     elevVal.textContent = `${params.elevation}°`;
        if (azSlider)    azSlider.value = String(params.azimuth);
        if (azVal)       azVal.textContent = `${params.azimuth}°`;
        if (turbSlider)  turbSlider.value = String(params.turbidity);
        if (turbVal)     turbVal.textContent = String(params.turbidity);
    }
}

// ── Singleton factory ──────────────────────────────────────────────────────────

let _vizPanel: VisualizationEnginePanel | null = null;

export function getVisualizationEnginePanel(): VisualizationEnginePanel {
    if (!_vizPanel) _vizPanel = new VisualizationEnginePanel();
    return _vizPanel;
}

export function mountVisualizationEnginePanel(container: HTMLElement = document.body, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountVisualizationEnginePanel */): VisualizationEnginePanel {
    void runtime; /* B-runtime-void mountVisualizationEnginePanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    const panel = getVisualizationEnginePanel();
    panel.mount(container);
    return panel;
}
