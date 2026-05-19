/**
 * @file src/ui/rendering/RenderPanel.ts
 * @description "Generate Render" panel UI for Photorealistic Render Mode.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1):
 *  - This panel is UI-only. It NEVER writes to ElementStores directly.
 *  - It reads scene data (read-only) from window.world (set in BimWorld.ts).
 *  - It dispatches renders via PhotorealisticRenderer (isolated off-screen pipeline).
 *  - The panel is self-contained in src/ui/rendering/ and does NOT modify any
 *    existing Layout.ts sections — it is mounted as a floating panel.
 *
 * Quality presets (samples):
 *  - Draft  : 50   samples — ~5–15 seconds   (quick preview)
 *  - Medium : 200  samples — ~30–90 seconds
 *  - High   : 500  samples — ~2–5 minutes
 *  - Ultra  : 1000 samples — ~5–15 minutes   (final quality)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { HDRI_PRESETS } from '@pryzm/core-app-model/rendering';
// BUNDLE-SPLIT: PhotorealisticRenderer pulls in three-gpu-pathtracer (~150 KB).
// It is only needed when the user clicks "Render", so we load it lazily via
// dynamic import inside startRender(). Type-only imports keep type-checking
// without emitting a runtime dependency.
import type { RenderResult, PhotorealisticRenderer } from '@pryzm/core-app-model/rendering';

let _photorealPromise: Promise<typeof import('@pryzm/core-app-model/rendering')> | null = null;
const _getPhotorealisticRenderer = async (): Promise<PhotorealisticRenderer> => {
    if (!_photorealPromise) {
        _photorealPromise = import('@pryzm/core-app-model/rendering').catch(err => {
            _photorealPromise = null; // allow retry on failure
            throw err;
        });
    }
    return (await _photorealPromise).photorealisticRenderer;
};
import { sharedRenderingState } from '@pryzm/core-app-model/rendering';
import { panelManager } from '../PanelManager';

interface RenderPreset {
    id: string;
    label: string;
    width: number;
    height: number;
    samples: number;
}

const RESOLUTION_PRESETS: RenderPreset[] = [
    { id: 'draft',  label: 'Draft (1080p · 50 samples)',   width: 1920, height: 1080, samples: 50  },
    { id: 'medium', label: 'Medium (1080p · 200 samples)', width: 1920, height: 1080, samples: 200 },
    { id: 'high',   label: 'High (4K · 500 samples)',      width: 3840, height: 2160, samples: 500 },
    { id: 'ultra',  label: 'Ultra (4K · 1000 samples)',    width: 3840, height: 2160, samples: 1000},
    { id: '8k',     label: '8K (7680×4320 · 1500 samples)',width: 7680, height: 4320, samples: 1500},
];

export class RenderPanel {
    private el: HTMLElement;
    private abortController: AbortController | null = null;
    private selectedPresetId = 'draft';
    private backgroundMode: 'hdri' | 'white' | 'black' = 'white';

    private onRenderComplete: ((result: RenderResult) => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.el = this.build();
        panelManager.register('panel:render', () => this.hide());
        // Phase 1 — update HDRI label when shared state changes.
        window.addEventListener('pryzm-rendering-state-changed', (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            if (!detail.hdriPresetId) return;
            const nameEl = this.el.querySelector<HTMLElement>('#render-hdri-name');
            if (nameEl) {
                const preset = HDRI_PRESETS.find(p => p.id === detail.hdriPresetId);
                nameEl.textContent = preset?.label ?? detail.hdriPresetId;
            }
        });
        // Fix 4 — surface path-tracer fallback notice in the render panel.
        // ViewportPathTracer dispatches 'render-status-notice' when it cannot
        // activate and falls back to HQ rasterisation.
        window.addEventListener('render-status-notice', (e: Event) => {
            const { message } = (e as CustomEvent<{ level: string; message: string }>).detail ?? {};
            if (!message) return;
            const noticeEl = this.el.querySelector<HTMLElement>('#render-status-notice');
            if (noticeEl) {
                noticeEl.textContent = message;
                noticeEl.style.display = 'block';
                // Auto-hide after 10 s so it does not persist forever
                setTimeout(() => { noticeEl.style.display = 'none'; }, 10_000);
            }
        });
    }

    setOnRenderComplete(cb: (result: RenderResult) => void): void {
        this.onRenderComplete = cb;
    }

    getElement(): HTMLElement {
        return this.el;
    }

    show(): void { panelManager.notifyOpened('panel:render'); this.el.style.display = 'flex'; }
    hide(): void { panelManager.notifyClosed('panel:render'); this.el.style.display = 'none'; }
    toggle(): void {
        this.el.style.display === 'none' ? this.show() : this.hide();
    }

    private build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'pryzm-render-panel';
        panel.className = 'ren-panel';

        panel.innerHTML = `
            <div class="ren-header">
                <div class="ren-header-title">
                    <span>✨</span> Generate Render
                </div>
                <button id="render-panel-close" class="ren-close-btn">×</button>
            </div>

            <!-- Fix 4: Path-tracer fallback notice. Hidden by default; shown
                 when ViewportPathTracer dispatches 'render-status-notice'. -->
            <div id="render-status-notice" style="
                display:none; padding:8px 12px;
                background:rgba(234,179,8,0.12); border-bottom:1px solid rgba(234,179,8,0.25);
                color:#fde047; font-size:10px; line-height:1.5;
            "></div>

            <div style="padding:12px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:520px;">

                <!-- Quality Preset -->
                <div>
                    <label style="display:block; color:#aaa; font-size:10px; font-weight:600;
                        text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px;">
                        Quality Preset
                    </label>
                    <select id="render-quality-select" style="
                        width:100%; padding:6px 8px; background:#2a2a2a; border:1px solid #444;
                        color:#f0f0f0; border-radius:4px; font-size:11px; cursor:pointer;
                    ">
                        ${RESOLUTION_PRESETS.map(p => `
                            <option value="${p.id}" ${p.id === this.selectedPresetId ? 'selected' : ''}>
                                ${p.label}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <!-- HDRI Environment (Phase 1 — inherited from Visualization Engine) -->
                <div>
                    <label style="display:block; color:#aaa; font-size:10px; font-weight:600;
                        text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px;">
                        Environment Lighting
                    </label>
                    <div style="display:flex; align-items:center; gap:6px; padding:6px 8px;
                        background:#2a2a2a; border:1px solid #444; border-radius:4px;">
                        <span style="font-size:10px; color:#888;">Active:</span>
                        <span id="render-hdri-name" style="font-size:11px; color:#c4b5fd; font-style:italic; flex:1;">
                            ${HDRI_PRESETS.find(p => p.id === sharedRenderingState.hdriPresetId)?.label ?? sharedRenderingState.hdriPresetId}
                        </span>
                    </div>
                    <div style="font-size:10px; color:#555; margin-top:3px;">
                        Set via Visualization Engine → Lighting tab
                    </div>
                </div>

                <!-- Background Mode -->
                <div>
                    <label style="display:block; color:#aaa; font-size:10px; font-weight:600;
                        text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px;">
                        Background
                    </label>
                    <div style="display:flex; gap:4px;">
                        ${(['white','hdri','black'] as const).map(mode => `
                            <button class="bg-mode-btn" data-mode="${mode}" style="
                                flex:1; padding:5px 0; background:${mode === this.backgroundMode ? '#7c3aed' : '#2a2a2a'};
                                border:1px solid ${mode === this.backgroundMode ? '#7c3aed' : '#444'};
                                color:${mode === this.backgroundMode ? '#fff' : '#aaa'};
                                border-radius:4px; font-size:10px; cursor:pointer;
                                text-transform:capitalize;
                            ">${mode}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- Generate Button -->
                <button id="render-generate-btn" style="
                    width:100%; padding:10px; background:#7c3aed; border:none;
                    color:#fff; border-radius:6px; font-size:13px; font-weight:600;
                    cursor:pointer; transition:background .15s; margin-top:4px;
                ">
                    ✨ Generate Render
                </button>

                <!-- Progress -->
                <div id="render-progress-section" style="display:none;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span id="render-status-label" style="color:#aaa; font-size:11px;">Preparing…</span>
                        <span id="render-progress-pct" style="color:#7c3aed; font-size:11px; font-weight:600;">0%</span>
                    </div>
                    <div style="background:#2a2a2a; border-radius:4px; height:6px; overflow:hidden;">
                        <div id="render-progress-bar" style="
                            height:100%; background:linear-gradient(90deg, #7c3aed, #a855f7);
                            width:0%; transition:width .3s ease; border-radius:4px;
                        "></div>
                    </div>
                    <button id="render-cancel-btn" style="
                        margin-top:8px; width:100%; padding:6px; background:#2a2a2a;
                        border:1px solid #444; color:#aaa; border-radius:4px;
                        font-size:11px; cursor:pointer;
                    ">Cancel</button>
                </div>

                <!-- Info box -->
                <div style="
                    background:#2a2a2a; border-radius:6px; padding:8px 10px;
                    font-size:10px; color:#888; line-height:1.5;
                ">
                    <strong style="color:#aaa;">How it works:</strong><br>
                    Pryzm path-traces your scene directly in the browser GPU —
                    no cloud upload required. Higher sample counts reduce noise
                    and improve quality.
                </div>
            </div>
        `;

        this.wireEvents(panel);
        return panel;
    }

    private wireEvents(panel: HTMLElement): void {
        // Close button
        panel.querySelector('#render-panel-close')?.addEventListener('click', () => this.hide());

        // Quality preset selector
        panel.querySelector('#render-quality-select')?.addEventListener('change', (e) => {
            this.selectedPresetId = (e.target as HTMLSelectElement).value;
        });

        // Background mode buttons
        panel.querySelectorAll('.bg-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.backgroundMode = (btn as HTMLElement).dataset.mode as any;
                panel.querySelectorAll('.bg-mode-btn').forEach(b => {
                    const active = (b as HTMLElement).dataset.mode === this.backgroundMode;
                    (b as HTMLElement).style.background = active ? '#7c3aed' : '#2a2a2a';
                    (b as HTMLElement).style.borderColor = active ? '#7c3aed' : '#444';
                    (b as HTMLElement).style.color = active ? '#fff' : '#aaa';
                });
            });
        });

        // Generate button
        panel.querySelector('#render-generate-btn')?.addEventListener('click', () => {
            this.startRender(panel);
        });

        // Cancel button
        panel.querySelector('#render-cancel-btn')?.addEventListener('click', () => {
            this.abortController?.abort();
            this.setIdle(panel);
        });
    }

    private async startRender(panel: HTMLElement): Promise<void> {
        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.scene?.three || !world?.camera?.three) {
            this.showToast('No active scene found. Open a project first.', 'error');
            return;
        }

        // Lazy-load the photorealistic renderer (and its three-gpu-pathtracer
        // dependency) on first use. Subsequent calls reuse the cached promise.
        let photorealisticRenderer: PhotorealisticRenderer;
        try {
            photorealisticRenderer = await _getPhotorealisticRenderer();
        } catch (err) {
            this.showToast('Failed to load render engine. Check console for details.', 'error');
            console.error('[RenderPanel] Failed to load PhotorealisticRenderer:', err);
            return;
        }

        if (photorealisticRenderer.busy) {
            this.showToast('A render is already in progress.', 'warn');
            return;
        }

        const preset = RESOLUTION_PRESETS.find(p => p.id === this.selectedPresetId)
            ?? RESOLUTION_PRESETS[0];

        this.setRendering(panel);
        this.abortController = new AbortController();

        // ── Announce job to Render Queue ──────────────────────────────────────
        const jobId   = `render-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const jobName = `Render (${preset.label})`;
        window.runtime?.events?.emit('rq-job-start', { id: jobId, name: jobName, type: 'render' });

        try {
            const result = await photorealisticRenderer.renderToImage(
                world.scene.three as THREE.Scene,
                world.camera.three as THREE.Camera,
                {
                    width: preset.width,
                    height: preset.height,
                    samples: preset.samples,
                    // Phase 1 — use HDRI from shared state, not a local dropdown.
                    hdriPresetId: sharedRenderingState.hdriPresetId,
                    backgroundMode: this.backgroundMode,
                    signal: this.abortController.signal,
                    onProgress: (pct, samples, status) => {
                        this.updateProgress(panel, pct, samples, status);
                        window.runtime?.events?.emit('rq-job-progress', { id: jobId, pct, status: `${status} (${samples} spl)` });
                    },
                },
            );

            window.runtime?.events?.emit('rq-job-complete', { id: jobId });
            this.setIdle(panel);
            this.onRenderComplete?.(result);
            this.showToast(`Render complete! ${preset.width}×${preset.height} · ${result.method}`, 'success');

            // Auto-hide panel after render
            setTimeout(() => this.hide(), 1500);
        } catch (err: any) {
            this.setIdle(panel);
            if (err?.name !== 'AbortError') {
                console.error('[RenderPanel] Render failed:', err);
                window.runtime?.events?.emit('rq-job-error', { id: jobId, error: err?.message ?? String(err) });
                this.showToast(`Render failed: ${err?.message ?? err}`, 'error');
            } else {
                window.runtime?.events?.emit('rq-job-error', { id: jobId, error: 'Cancelled by user' });
            }
        }
    }

    private setRendering(panel: HTMLElement): void {
        const btn = panel.querySelector('#render-generate-btn') as HTMLButtonElement;
        const prog = panel.querySelector('#render-progress-section') as HTMLElement;
        if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
        if (prog) prog.style.display = 'block';
        this.updateProgress(panel, 0, 0, 'Initialising…');
    }

    private setIdle(panel: HTMLElement): void {
        const btn = panel.querySelector('#render-generate-btn') as HTMLButtonElement;
        const prog = panel.querySelector('#render-progress-section') as HTMLElement;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        if (prog) prog.style.display = 'none';
        this.abortController = null;
    }

    private updateProgress(panel: HTMLElement, pct: number, _samples: number, status: string): void {
        const bar = panel.querySelector('#render-progress-bar') as HTMLElement;
        const label = panel.querySelector('#render-status-label') as HTMLElement;
        const pctEl = panel.querySelector('#render-progress-pct') as HTMLElement;
        if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
        if (label) label.textContent = status;
        if (pctEl) pctEl.textContent = `${Math.round(pct * 100)}%`;
    }

    private showToast(message: string, type: 'success' | 'warn' | 'error'): void {
        const toast = document.createElement('div');
        toast.className = `ren-toast ren-toast--${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
}

let _renderPanel: RenderPanel | null = null;

export function getRenderPanel(): RenderPanel {
    if (!_renderPanel) _renderPanel = new RenderPanel();
    return _renderPanel;
}

export function mountRenderPanel(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountRenderPanel */): RenderPanel {
    void runtime; /* B-runtime-void mountRenderPanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    const panel = getRenderPanel();
    container.appendChild(panel.getElement());
    return panel;
}
