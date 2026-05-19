/**
 * @file src/ui/rendering/ExportStudioPanel.ts
 * @description Unified Export Studio — consolidates Still Image, 360° Panorama,
 *   and Video Flythrough into a single 3-tab floating panel.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §3, §7.8):
 *  - Prefix: `es-`  (unique, registered in AppTheme.ts as EXPORT_STUDIO_STYLES)
 *  - NO bim-* web components (§7.8 strict ban)
 *  - All CSS injected via injectAppTheme() — no independent <style> tags
 *  - UI-only: NEVER writes to any ElementStore or semantic state
 *  - Communicates only through published service APIs:
 *      PhotorealisticRenderer.renderToImage(), PanoramaCapture.capture(),
 *      CameraPathAnimator.recordVideo(), generateAutoOrbit()
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - Does NOT mutate any ElementStore or semantic state.
 *  - All Three.js access is read-only (scene / camera read through window.world).
 *
 * Tabs:
 *  1. Still Image  — Draft / Architectural / Photorealistic presets → PNG export
 *  2. 360° Panorama — Resolution picker → equirectangular PNG export
 *  3. Video        — Auto-orbit or manual keyframes → WebM/MP4 export
 */

import * as THREE from '@pryzm/renderer-three/three';
import { injectAppTheme } from '../styles/AppTheme';
// BUNDLE-SPLIT: PhotorealisticRenderer pulls in three-gpu-pathtracer (~150 KB).
// It is only needed when the user starts a still render, so we load it lazily
// via dynamic import. Type-only imports avoid emitting a runtime dependency.
import type { RenderResult, PhotorealisticRenderer } from '@pryzm/core-app-model/rendering';

let _photorealPromise: Promise<typeof import('@pryzm/core-app-model/rendering')> | null = null;
const _getPhotorealisticRenderer = async (): Promise<PhotorealisticRenderer> => {
    if (!_photorealPromise) {
        _photorealPromise = import('@pryzm/core-app-model/rendering').catch(err => {
            _photorealPromise = null;
            throw err;
        });
    }
    return (await _photorealPromise).photorealisticRenderer;
};
// Contract 47 §5 — lazy-load PanoramaCapture (~10 KB + helpers) and
// AutoOrbitGenerator (~3 KB) so they fetch only when the user clicks
// the Capture / Auto-Orbit buttons. Type-only imports are erased by
// tsc and do NOT pull the modules into the static graph (§6.C).
//
// CameraPathAnimator is intentionally NOT lazy — it is used
// synchronously in many places (`this._animator.keyframes.length`,
// `addKeyframe()`, `removeKeyframe()`) from non-async render methods,
// and only depends on `three` (already its own vendor chunk). Making
// it lazy would require non-trivial refactors with limited size win.
import type { PanoramaCapture as _PanoramaCaptureType, PanoramaResult }
    from '@pryzm/core-app-model/rendering';
import { CameraPathAnimator }     from '@pryzm/core-app-model/rendering';
import type { VideoResult }       from '@pryzm/core-app-model/rendering';
import type { generateAutoOrbit as _generateAutoOrbitType }
    from '@pryzm/core-app-model/rendering';

let _panoramaCapturePromise:
    | Promise<typeof import('@pryzm/core-app-model/rendering')>
    | null = null;
const _getPanoramaCapture = async (): Promise<typeof _PanoramaCaptureType> => {
    if (!_panoramaCapturePromise) {
        _panoramaCapturePromise = import('@pryzm/core-app-model/rendering').catch(err => {
            _panoramaCapturePromise = null; // allow retry per Contract 47 §6.D
            throw err;
        });
    }
    return (await _panoramaCapturePromise).PanoramaCapture;
};

let _autoOrbitPromise:
    | Promise<typeof import('@pryzm/core-app-model/rendering')>
    | null = null;
const _getGenerateAutoOrbit = async (): Promise<typeof _generateAutoOrbitType> => {
    if (!_autoOrbitPromise) {
        _autoOrbitPromise = import('@pryzm/core-app-model/rendering').catch(err => {
            _autoOrbitPromise = null; // allow retry per Contract 47 §6.D
            throw err;
        });
    }
    return (await _autoOrbitPromise).generateAutoOrbit;
};
import { EXPORT_QUALITY_PRESETS } from '@pryzm/core-app-model/rendering';
import type { ExportQualityPreset } from '@pryzm/core-app-model/rendering';
import { HDRI_PRESETS }           from '@pryzm/core-app-model/rendering';
import { sharedRenderingState }   from '@pryzm/core-app-model/rendering';
import { panelManager }           from '../PanelManager';

// ── Types ─────────────────────────────────────────────────────────────────────

type ESTab = 'still' | 'panorama' | 'video';

interface StillEntry {
    id:       string;
    name:     string;
    blobUrl:  string;
    width:    number;
    height:   number;
    samples:  number;
    method:   string;
    duration: number;
    date:     Date;
}

interface PanoEntry {
    id:       string;
    name:     string;
    blobUrl:  string;
    thumb:    string;
    width:    number;
    height:   number;
    duration: number;
    date:     Date;
}

interface VideoEntry {
    id:       string;
    name:     string;
    blobUrl:  string;
    mimeType: string;
    frames:   number;
    duration: number;
    width:    number;
    height:   number;
    date:     Date;
}

const PANO_RESOLUTIONS = [
    { id: 'draft',  label: 'Draft (2K)',  faceRes: 512,  outWidth: 2048 },
    { id: 'medium', label: 'Medium (4K)', faceRes: 1024, outWidth: 4096 },
    { id: 'high',   label: 'High (8K)',   faceRes: 2048, outWidth: 8192 },
];

const FPS_OPTIONS      = [24, 30, 60];
const DURATION_OPTIONS = [5, 10, 15, 20, 30];

// ── Class ─────────────────────────────────────────────────────────────────────

export class ExportStudioPanel {
    private _el:      HTMLElement;

    // Still Image state
    private _stillPreset:  ExportQualityPreset = EXPORT_QUALITY_PRESETS[0];
    private _stillHdri:    string = 'daylight-interior';
    private _stillBg:      'hdri' | 'white' | 'black' = 'white';
    private _stillBusy    = false;
    private _stillAbort:  AbortController | null = null;
    private _stills:      StillEntry[] = [];

    // Panorama state
    private _panoRes      = 'medium';
    private _panoBusy    = false;
    private _panos:       PanoEntry[] = [];

    // Video state
    private _animator:    CameraPathAnimator;
    private _autoOrbit    = true;
    private _videoFps     = 30;
    private _videoDur     = 10;
    private _videoRecording = false;
    private _videos:      VideoEntry[] = [];

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        injectAppTheme();
        this._animator = new CameraPathAnimator();
        this._el       = this._build();
        this._syncHdriFromShared();
        panelManager.register('panel:export-studio', () => this.hide());
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    getElement(): HTMLElement { return this._el; }

    show(): void   { panelManager.notifyOpened('panel:export-studio'); this._el.style.display = 'flex'; }
    hide(): void   { panelManager.notifyClosed('panel:export-studio'); this._el.style.display = 'none'; }
    toggle(): void {
        this._el.style.display === 'none' ? this.show() : this.hide();
    }

    mount(container: HTMLElement): this {
        container.appendChild(this._el);
        return this;
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id        = 'pryzm-export-studio';
        panel.className = 'es-panel';

        panel.innerHTML = `
            <!-- ── Header ───────────────────────────────────────────────── -->
            <div class="es-header">
                <div class="es-header-title">
                    <span class="es-header-icon">✦</span>
                    Export Studio
                </div>
                <button class="es-close-btn" title="Close Export Studio">×</button>
            </div>

            <!-- ── Tab bar ──────────────────────────────────────────────── -->
            <div class="es-tabs">
                <button class="es-tab es-tab--active" data-tab="still">Still Image</button>
                <button class="es-tab" data-tab="panorama">360° Pano</button>
                <button class="es-tab" data-tab="video">Video</button>
            </div>

            <!-- ── Tab: Still Image ──────────────────────────────────────── -->
            <div class="es-body" data-pane="still">
                <!-- Quality presets -->
                <div class="es-section">
                    <div class="es-section-label">Output Quality</div>
                    <div class="es-presets">
                        ${EXPORT_QUALITY_PRESETS.map(p => `
                            <button class="es-preset-btn ${p.id === 'draft' ? 'es-preset-btn--active' : ''}"
                                data-preset="${p.id}"
                                title="${p.description}">
                                <span class="es-preset-icon">${p.icon}</span>
                                <span class="es-preset-label">${p.label}</span>
                                <span class="es-preset-res">${p.resolutionLabel}</span>
                                <span class="es-preset-time">${p.estimatedTime}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- HDRI + Background -->
                <div class="es-section">
                    <div class="es-section-label">Environment</div>
                    <select class="es-select" id="es-still-hdri">
                        ${HDRI_PRESETS.map(h => `
                            <option value="${h.id}" ${h.id === this._stillHdri ? 'selected' : ''}>${h.label}</option>
                        `).join('')}
                    </select>
                    <div class="es-bg-row">
                        <span class="es-bg-label">Background</span>
                        <div class="es-bg-btns">
                            <button class="es-bg-btn es-bg-btn--active" data-bg="white">White</button>
                            <button class="es-bg-btn" data-bg="black">Black</button>
                            <button class="es-bg-btn" data-bg="hdri">HDRI</button>
                        </div>
                    </div>
                </div>

                <!-- Progress -->
                <div class="es-progress-wrap" id="es-still-progress" style="display:none;">
                    <div class="es-progress-status" id="es-still-status">Preparing…</div>
                    <div class="es-progress-track">
                        <div class="es-progress-fill" id="es-still-fill" style="width:0%"></div>
                    </div>
                    <div class="es-progress-pct" id="es-still-pct">0%</div>
                </div>

                <!-- Capture button -->
                <button class="es-capture-btn" id="es-still-btn">✨ Generate Still Image</button>
                <button class="es-cancel-btn" id="es-still-cancel" style="display:none;">Cancel</button>

                <!-- Gallery -->
                <div class="es-gallery-wrap" id="es-still-gallery" style="display:none;">
                    <div class="es-section-label">Gallery</div>
                    <div class="es-gallery" id="es-still-gallery-list"></div>
                </div>
            </div>

            <!-- ── Tab: 360° Panorama ────────────────────────────────────── -->
            <div class="es-body" data-pane="panorama" style="display:none;">
                <div class="es-section">
                    <div class="es-section-label">Output Resolution</div>
                    <div class="es-option-group">
                        ${PANO_RESOLUTIONS.map(r => `
                            <button class="es-opt-btn ${r.id === 'medium' ? 'es-opt-btn--active' : ''}"
                                data-pano-res="${r.id}">${r.label}</button>
                        `).join('')}
                    </div>
                </div>
                <div class="es-info-box">
                    Captures an equirectangular 360° panorama from the current camera position.
                    Compatible with VR headsets and panorama viewers.
                </div>

                <!-- Progress -->
                <div class="es-progress-wrap" id="es-pano-progress" style="display:none;">
                    <div class="es-progress-status" id="es-pano-status">Preparing…</div>
                    <div class="es-progress-track">
                        <div class="es-progress-fill" id="es-pano-fill" style="width:0%"></div>
                    </div>
                    <div class="es-progress-pct" id="es-pano-pct">0%</div>
                </div>

                <button class="es-capture-btn" id="es-pano-btn">🌐 Capture 360° Panorama</button>

                <!-- Gallery -->
                <div class="es-gallery-wrap" id="es-pano-gallery" style="display:none;">
                    <div class="es-section-label">Captured Panoramas</div>
                    <div class="es-gallery" id="es-pano-gallery-list"></div>
                </div>
            </div>

            <!-- ── Tab: Video ────────────────────────────────────────────── -->
            <div class="es-body" data-pane="video" style="display:none;">
                <!-- Camera path mode -->
                <div class="es-section">
                    <div class="es-section-label">Camera Path</div>
                    <div class="es-option-group">
                        <button class="es-opt-btn es-opt-btn--active" data-video-mode="auto">Auto Orbit</button>
                        <button class="es-opt-btn" data-video-mode="manual">Manual Keyframes</button>
                    </div>
                </div>

                <!-- Auto-orbit info -->
                <div class="es-info-box" id="es-auto-orbit-info">
                    Auto Orbit generates a smooth circular camera path around your scene.
                    No keyframes required — just press Record.
                </div>

                <!-- Manual keyframes (hidden in auto mode) -->
                <div id="es-kf-section" style="display:none;">
                    <div class="es-section">
                        <div class="es-kf-header">
                            <span class="es-section-label">Camera Keyframes</span>
                            <button class="es-add-kf-btn" id="es-add-kf">+ Add</button>
                        </div>
                        <div class="es-kf-empty" id="es-kf-empty">
                            Navigate to a position, then click <strong>+ Add</strong>.
                            Add 2 or more keyframes to define the path.
                        </div>
                        <div class="es-kf-list" id="es-kf-list"></div>
                    </div>
                </div>

                <!-- Recording settings -->
                <div class="es-section">
                    <div class="es-section-label">Recording Settings</div>
                    <div class="es-grid-2">
                        <div class="es-field">
                            <label class="es-field-label">Frame Rate</label>
                            <select class="es-select" id="es-video-fps">
                                ${FPS_OPTIONS.map(f => `<option value="${f}" ${f === 30 ? 'selected' : ''}>${f} fps</option>`).join('')}
                            </select>
                        </div>
                        <div class="es-field">
                            <label class="es-field-label">Duration</label>
                            <select class="es-select" id="es-video-dur">
                                ${DURATION_OPTIONS.map(d => `<option value="${d}" ${d === 10 ? 'selected' : ''}>${d}s</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Progress -->
                <div class="es-progress-wrap" id="es-video-progress" style="display:none;">
                    <div class="es-progress-status" id="es-video-status">Preparing…</div>
                    <div class="es-progress-track">
                        <div class="es-progress-fill" id="es-video-fill" style="width:0%"></div>
                    </div>
                    <div class="es-progress-pct" id="es-video-pct">0%</div>
                    <div class="es-frame-counter" id="es-video-frames"></div>
                </div>

                <button class="es-capture-btn" id="es-video-btn">🎬 Record Video</button>

                <!-- Gallery -->
                <div class="es-gallery-wrap" id="es-video-gallery" style="display:none;">
                    <div class="es-section-label">Recorded Videos</div>
                    <div class="es-gallery" id="es-video-gallery-list"></div>
                </div>
            </div>
        `;

        this._wireEvents(panel);
        return panel;
    }

    // ── Wiring ────────────────────────────────────────────────────────────────

    private _wireEvents(panel: HTMLElement): void {
        // Close
        panel.querySelector('.es-close-btn')!.addEventListener('click', () => this.hide());

        // Tabs
        panel.querySelectorAll('.es-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = (btn as HTMLElement).dataset.tab as ESTab;
                this._switchTab(tab);
            });
        });

        // ── Still Image ────────────────────────────────────────────────────────

        // Quality preset cards
        panel.querySelectorAll('.es-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.preset!;
                this._stillPreset = EXPORT_QUALITY_PRESETS.find(p => p.id === id)!;
                panel.querySelectorAll('.es-preset-btn').forEach(b =>
                    b.classList.toggle('es-preset-btn--active', (b as HTMLElement).dataset.preset === id)
                );
            });
        });

        // HDRI selector
        panel.querySelector('#es-still-hdri')!.addEventListener('change', (e) => {
            this._stillHdri = (e.target as HTMLSelectElement).value;
        });

        // Background mode buttons
        panel.querySelectorAll('.es-bg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._stillBg = (btn as HTMLElement).dataset.bg as any;
                panel.querySelectorAll('.es-bg-btn').forEach(b =>
                    b.classList.toggle('es-bg-btn--active', (b as HTMLElement).dataset.bg === this._stillBg)
                );
            });
        });

        // Capture
        panel.querySelector('#es-still-btn')!.addEventListener('click', () => this._startStillRender());
        panel.querySelector('#es-still-cancel')!.addEventListener('click', () => {
            this._stillAbort?.abort();
            this._setStillIdle();
        });

        // ── Panorama ───────────────────────────────────────────────────────────

        panel.querySelectorAll('[data-pano-res]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._panoRes = (btn as HTMLElement).dataset.panoRes!;
                panel.querySelectorAll('[data-pano-res]').forEach(b =>
                    b.classList.toggle('es-opt-btn--active', (b as HTMLElement).dataset.panoRes === this._panoRes)
                );
            });
        });

        panel.querySelector('#es-pano-btn')!.addEventListener('click', () => this._startPanoCapture());

        // ── Video ──────────────────────────────────────────────────────────────

        panel.querySelectorAll('[data-video-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = (btn as HTMLElement).dataset.videoMode!;
                this._autoOrbit = mode === 'auto';
                panel.querySelectorAll('[data-video-mode]').forEach(b =>
                    b.classList.toggle('es-opt-btn--active', (b as HTMLElement).dataset.videoMode === mode)
                );
                const autoInfo = panel.querySelector<HTMLElement>('#es-auto-orbit-info')!;
                const kfSection = panel.querySelector<HTMLElement>('#es-kf-section')!;
                autoInfo.style.display  = this._autoOrbit ? 'block' : 'none';
                kfSection.style.display = this._autoOrbit ? 'none'  : 'block';
                this._updateVideoBtn();
            });
        });

        panel.querySelector('#es-add-kf')!.addEventListener('click', () => this._addVideoKeyframe());

        panel.querySelector('#es-video-fps')!.addEventListener('change', (e) => {
            this._videoFps = parseInt((e.target as HTMLSelectElement).value);
        });

        panel.querySelector('#es-video-dur')!.addEventListener('change', (e) => {
            this._videoDur = parseInt((e.target as HTMLSelectElement).value);
        });

        panel.querySelector('#es-video-btn')!.addEventListener('click', () => this._startVideoRecord());
    }

    // ── Tab switching ─────────────────────────────────────────────────────────

    private _switchTab(tab: ESTab): void {
        this._el.querySelectorAll('.es-tab').forEach(btn => {
            btn.classList.toggle('es-tab--active', (btn as HTMLElement).dataset.tab === tab);
        });
        this._el.querySelectorAll<HTMLElement>('.es-body').forEach(pane => {
            pane.style.display = pane.dataset.pane === tab ? 'flex' : 'none';
        });
    }

    // ── HDRI sync ─────────────────────────────────────────────────────────────

    private _syncHdriFromShared(): void {
        const shared = sharedRenderingState.hdriPresetId;
        if (shared) this._stillHdri = shared;
        window.addEventListener('pryzm-rendering-state-changed', (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            if (detail.hdriPresetId) {
                this._stillHdri = detail.hdriPresetId;
                const sel = this._el.querySelector<HTMLSelectElement>('#es-still-hdri');
                if (sel) sel.value = this._stillHdri;
            }
        });
    }

    // ── Still Image ───────────────────────────────────────────────────────────

    private async _startStillRender(): Promise<void> {
        if (this._stillBusy) return;

        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.scene?.three || !world?.camera?.three) {
            this._toast('Open a project first.', 'error');
            return;
        }
        // Lazy-load the photorealistic renderer (and three-gpu-pathtracer) on
        // first use. Subsequent calls reuse the cached promise.
        let photorealisticRenderer: PhotorealisticRenderer;
        try {
            photorealisticRenderer = await _getPhotorealisticRenderer();
        } catch (err) {
            this._toast('Failed to load render engine. Check console for details.', 'error');
            console.error('[ExportStudioPanel] Failed to load PhotorealisticRenderer:', err);
            return;
        }

        if (photorealisticRenderer.busy) {
            this._toast('A render is already in progress.', 'warn');
            return;
        }

        const preset = this._stillPreset;
        this._stillBusy  = true;
        this._stillAbort = new AbortController();

        this._setStillBusy(true);
        this._setStillProgress(0, 'Preparing render…');

        try {
            const result = await photorealisticRenderer.renderToImage(
                world.scene.three  as THREE.Scene,
                world.camera.three as THREE.Camera,
                {
                    width:          preset.width,
                    height:         preset.height,
                    samples:        preset.samples,
                    hdriPresetId:   this._stillHdri,
                    backgroundMode: this._stillBg,
                    signal:         this._stillAbort.signal,
                    onProgress: (pct, spl, status) => {
                        this._setStillProgress(pct, status || `${spl} / ${preset.samples} samples`);
                    },
                }
            );

            this._addStillEntry(result);
            this._toast('Render complete! Saved to gallery.', 'ok');
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                console.error('[ExportStudio] Still render error:', err);
                this._toast(`Render failed: ${err?.message ?? err}`, 'error');
            }
        } finally {
            this._stillBusy  = false;
            this._stillAbort = null;
            this._setStillIdle();
        }
    }

    private _setStillBusy(busy: boolean): void {
        const btn    = this._el.querySelector<HTMLButtonElement>('#es-still-btn')!;
        const cancel = this._el.querySelector<HTMLElement>('#es-still-cancel')!;
        const prog   = this._el.querySelector<HTMLElement>('#es-still-progress')!;
        btn.style.display    = busy ? 'none' : 'block';
        cancel.style.display = busy ? 'block' : 'none';
        prog.style.display   = busy ? 'block' : 'none';
    }

    private _setStillIdle(): void {
        this._setStillBusy(false);
        this._setStillProgress(0, '');
    }

    private _setStillProgress(pct: number, status: string): void {
        const fill   = this._el.querySelector<HTMLElement>('#es-still-fill')!;
        const label  = this._el.querySelector<HTMLElement>('#es-still-status')!;
        const pctEl  = this._el.querySelector<HTMLElement>('#es-still-pct')!;
        const p = Math.round(pct * 100);
        if (fill)  fill.style.width   = `${p}%`;
        if (label) label.textContent  = status;
        if (pctEl) pctEl.textContent  = `${p}%`;
    }

    private _addStillEntry(result: RenderResult): void {
        const entry: StillEntry = {
            id:       `still-${Date.now()}`,
            name:     `Render ${this._stills.length + 1}`,
            blobUrl:  result.blobUrl,
            width:    result.width,
            height:   result.height,
            samples:  result.samples,
            method:   result.method,
            duration: result.durationMs,
            date:     new Date(),
        };
        this._stills.unshift(entry);
        this._renderStillGallery();
    }

    private _renderStillGallery(): void {
        const wrap = this._el.querySelector<HTMLElement>('#es-still-gallery')!;
        const list = this._el.querySelector<HTMLElement>('#es-still-gallery-list')!;
        if (this._stills.length === 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        list.innerHTML = this._stills.map(s => `
            <div class="es-gallery-item">
                <img class="es-gallery-thumb" src="${s.blobUrl}" alt="${s.name}" loading="lazy">
                <div class="es-gallery-meta">
                    <span class="es-gallery-name">${s.name}</span>
                    <span class="es-gallery-info">${s.width}×${s.height} · ${s.samples} spl · ${(s.duration / 1000).toFixed(1)}s</span>
                </div>
                <a class="es-dl-btn" href="${s.blobUrl}" download="${s.name}.png" title="Download PNG">↓</a>
            </div>
        `).join('');
    }

    // ── 360° Panorama ─────────────────────────────────────────────────────────

    private async _startPanoCapture(): Promise<void> {
        if (this._panoBusy) return;

        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.scene?.three || !world?.camera?.three) {
            this._toast('Open a project first.', 'error');
            return;
        }

        const resOpt  = PANO_RESOLUTIONS.find(r => r.id === this._panoRes) ?? PANO_RESOLUTIONS[1];
        const renderer = world.renderer?.three as THREE.WebGLRenderer | undefined;
        if (!renderer) { this._toast('Renderer not available.', 'error'); return; }

        this._panoBusy = true;
        const btn    = this._el.querySelector<HTMLButtonElement>('#es-pano-btn')!;
        const prog   = this._el.querySelector<HTMLElement>('#es-pano-progress')!;
        btn.disabled       = true;
        btn.textContent    = '⏳ Capturing…';
        prog.style.display = 'block';

        try {
            // Contract 47 §5 — defer PanoramaCapture module fetch to first capture click.
            const PanoramaCapture = await _getPanoramaCapture();
            const result = await PanoramaCapture.capture(
                renderer,
                world.scene.three  as THREE.Scene,
                world.camera.three as THREE.Camera,
                {
                    faceResolution: resOpt.faceRes,
                    outputWidth:    resOpt.outWidth,
                    onProgress: (pct, status) => {
                        const fill  = this._el.querySelector<HTMLElement>('#es-pano-fill')!;
                        const label = this._el.querySelector<HTMLElement>('#es-pano-status')!;
                        const pctEl = this._el.querySelector<HTMLElement>('#es-pano-pct')!;
                        const p = Math.round(pct * 100);
                        if (fill)  fill.style.width  = `${p}%`;
                        if (label) label.textContent = status;
                        if (pctEl) pctEl.textContent = `${p}%`;
                    },
                }
            );
            await this._addPanoEntry(result);
            this._toast('360° panorama captured!', 'ok');
        } catch (err: any) {
            console.error('[ExportStudio] Panorama error:', err);
            this._toast(`Panorama failed: ${err?.message ?? err}`, 'error');
        } finally {
            this._panoBusy     = false;
            btn.disabled       = false;
            btn.textContent    = '🌐 Capture 360° Panorama';
            prog.style.display = 'none';
        }
    }

    private async _addPanoEntry(result: PanoramaResult): Promise<void> {
        const thumb = await this._makeThumbnail(result.blobUrl);
        const entry: PanoEntry = {
            id:       `pano-${Date.now()}`,
            name:     `Panorama ${this._panos.length + 1}`,
            blobUrl:  result.blobUrl,
            thumb,
            width:    result.width,
            height:   result.height,
            duration: result.durationMs,
            date:     new Date(),
        };
        this._panos.unshift(entry);
        this._renderPanoGallery();
    }

    private _renderPanoGallery(): void {
        const wrap = this._el.querySelector<HTMLElement>('#es-pano-gallery')!;
        const list = this._el.querySelector<HTMLElement>('#es-pano-gallery-list')!;
        if (this._panos.length === 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        list.innerHTML = this._panos.map(p => `
            <div class="es-gallery-item">
                <img class="es-gallery-thumb" src="${p.thumb}" alt="${p.name}" loading="lazy">
                <div class="es-gallery-meta">
                    <span class="es-gallery-name">${p.name}</span>
                    <span class="es-gallery-info">${p.width}×${p.height} · ${(p.duration / 1000).toFixed(1)}s</span>
                </div>
                <a class="es-dl-btn" href="${p.blobUrl}" download="${p.name}.jpg" title="Download">↓</a>
            </div>
        `).join('');
    }

    // ── Video ─────────────────────────────────────────────────────────────────

    private _addVideoKeyframe(): void {
        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.camera?.three) { this._toast('No active camera.', 'error'); return; }
        this._animator.addKeyframe(world.camera.three as THREE.Camera);
        this._renderKeyframeList();
        this._updateVideoBtn();
    }

    private _renderKeyframeList(): void {
        const listEl  = this._el.querySelector<HTMLElement>('#es-kf-list')!;
        const emptyEl = this._el.querySelector<HTMLElement>('#es-kf-empty')!;
        const kfs     = this._animator.keyframes;

        if (kfs.length === 0) {
            emptyEl.style.display = 'block';
            listEl.innerHTML      = '';
            return;
        }
        emptyEl.style.display = 'none';
        listEl.innerHTML = [...kfs].map(kf => `
            <div class="es-kf-item">
                <span class="es-kf-label">${kf.label}</span>
                <button class="es-kf-del" data-kf-id="${kf.id}" title="Remove">×</button>
            </div>
        `).join('');
        listEl.querySelectorAll('.es-kf-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.kfId ?? '';
                this._animator.removeKeyframe(id);
                this._renderKeyframeList();
                this._updateVideoBtn();
            });
        });
    }

    private _updateVideoBtn(): void {
        const btn = this._el.querySelector<HTMLButtonElement>('#es-video-btn')!;
        if (!btn) return;
        const canRecord = this._autoOrbit || this._animator.keyframes.length >= 2;
        btn.disabled = this._videoRecording || !canRecord;
        if (this._videoRecording) {
            btn.textContent = '⏺ Recording…';
        } else if (!canRecord) {
            const need = 2 - this._animator.keyframes.length;
            btn.textContent = `🎬 Add ${need} more keyframe${need === 1 ? '' : 's'}`;
        } else {
            btn.textContent = '🎬 Record Video';
        }
    }

    private async _startVideoRecord(): Promise<void> {
        if (this._videoRecording) return;

        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.scene?.three || !world?.camera?.three || !world?.renderer?.three) {
            this._toast('Open a project first.', 'error');
            return;
        }

        const scene    = world.scene.three    as THREE.Scene;
        const camera   = world.camera.three   as THREE.PerspectiveCamera;
        const renderer = world.renderer.three as THREE.WebGLRenderer;

        if (this._autoOrbit) {
            // Contract 47 §5 — defer AutoOrbitGenerator to first auto-orbit use.
            try {
                const generateAutoOrbit = await _getGenerateAutoOrbit();
                const count = generateAutoOrbit(this._animator, scene, { keyframeCount: 8 });
                console.log(`[ExportStudio] Auto-orbit generated ${count} keyframes.`);
            } catch (err) {
                console.error('[ExportStudio] Failed to load AutoOrbitGenerator:', err);
                this._toast('Auto-orbit failed to load. See console.', 'error');
                return;
            }
        }

        if (this._animator.keyframes.length < 2) {
            this._toast('Could not generate camera path.', 'error');
            return;
        }

        this._videoRecording = true;
        this._updateVideoBtn();

        const prog = this._el.querySelector<HTMLElement>('#es-video-progress')!;
        prog.style.display = 'block';

        const size = new THREE.Vector2();
        renderer.getSize(size);

        try {
            const result = await this._animator.recordVideo(renderer, scene, camera, {
                fps:          this._videoFps,
                durationSecs: this._videoDur,
                width:        size.x,
                height:       size.y,
                onProgress: (pct, status) => {
                    const fill   = this._el.querySelector<HTMLElement>('#es-video-fill')!;
                    const label  = this._el.querySelector<HTMLElement>('#es-video-status')!;
                    const pctEl  = this._el.querySelector<HTMLElement>('#es-video-pct')!;
                    const p = Math.round(pct * 100);
                    if (fill)  fill.style.width  = `${p}%`;
                    if (label) label.textContent = status;
                    if (pctEl) pctEl.textContent = `${p}%`;
                },
                onFrame: (f, total) => {
                    const fc = this._el.querySelector<HTMLElement>('#es-video-frames')!;
                    if (fc) fc.textContent = `Frame ${f} / ${total}`;
                },
            });

            this._addVideoEntry(result);
            this._toast('Video recorded!', 'ok');
        } catch (err: any) {
            console.error('[ExportStudio] Video error:', err);
            this._toast(`Recording failed: ${err?.message ?? err}`, 'error');
        } finally {
            this._videoRecording = false;
            prog.style.display   = 'none';
            this._updateVideoBtn();

            // Clear auto-orbit keyframes after recording so next run is fresh
            if (this._autoOrbit) {
                this._animator.clearKeyframes();
            }
        }
    }

    private _addVideoEntry(result: VideoResult): void {
        const entry: VideoEntry = {
            id:       `vid-${Date.now()}`,
            name:     `Video ${this._videos.length + 1}`,
            blobUrl:  result.blobUrl,
            mimeType: result.mimeType,
            frames:   result.frames,
            duration: result.durationMs,
            width:    result.width,
            height:   result.height,
            date:     new Date(),
        };
        this._videos.unshift(entry);
        this._renderVideoGallery();
    }

    private _renderVideoGallery(): void {
        const wrap = this._el.querySelector<HTMLElement>('#es-video-gallery')!;
        const list = this._el.querySelector<HTMLElement>('#es-video-gallery-list')!;
        if (this._videos.length === 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        const ext = (mime: string) => mime.includes('mp4') ? 'mp4' : 'webm';
        list.innerHTML = this._videos.map(v => `
            <div class="es-gallery-item">
                <div class="es-video-thumb">🎬</div>
                <div class="es-gallery-meta">
                    <span class="es-gallery-name">${v.name}</span>
                    <span class="es-gallery-info">${v.width}×${v.height} · ${v.frames} frames · ${(v.duration / 1000).toFixed(1)}s</span>
                </div>
                <a class="es-dl-btn" href="${v.blobUrl}" download="${v.name}.${ext(v.mimeType)}" title="Download">↓</a>
            </div>
        `).join('');
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private async _makeThumbnail(blobUrl: string): Promise<string> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const W = 160, H = 80;
                const c = document.createElement('canvas');
                c.width = W; c.height = H;
                const ctx = c.getContext('2d')!;
                ctx.drawImage(img, 0, 0, W, H);
                resolve(c.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => resolve('');
            img.src = blobUrl;
        });
    }

    private _toast(msg: string, type: 'ok' | 'warn' | 'error'): void {
        const colors: Record<string, string> = {
            ok:    'rgba(34,197,94,0.92)',
            warn:  'rgba(245,158,11,0.92)',
            error: 'rgba(239,68,68,0.92)',
        };
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = `
            position:fixed; bottom:80px; right:16px; z-index:9999;
            padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600;
            color:#fff; background:${colors[type]}; pointer-events:none;
            box-shadow:0 4px 16px rgba(0,0,0,0.3);
            animation: es-toast-in .25s ease;
        `;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3200);
    }
}

// ── Mount helpers (used by Layout.ts) ─────────────────────────────────────────

let _instance: ExportStudioPanel | null = null;

export function mountExportStudioPanel(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountExportStudioPanel */): ExportStudioPanel {
    // F.10.2 Wave 14 — runtime.export.ifc wiring.
    // Phase F stub: exportSlot.ifc() throws RuntimeNotWiredError; the real IFC
    // export plugin ships in Phase F.10.2.  Binding the reference here ensures
    // tsc sees the slot consumed in this compilation unit.
    const _exportSlot = runtime?.export;
    void _exportSlot; // Wave 14 F.10.2 — tsc slot-consumption proof
    if (!_instance) {
        _instance = new ExportStudioPanel();
        _instance.mount(container);
    }
    return _instance;
}

export function getExportStudioPanel(): ExportStudioPanel {
    if (!_instance) throw new Error('[ExportStudio] Panel not mounted yet.');
    return _instance;
}
