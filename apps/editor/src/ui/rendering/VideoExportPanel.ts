/**
 * @file src/ui/rendering/VideoExportPanel.ts
 * @description Camera path keyframe editor + video export panel.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1, §3):
 *  - Prefix: `ve-`  (video export panel — all CSS classes in this file use ve- only)
 *  - NO bim-* web components.
 *  - This panel is UI-only. Never writes to any ElementStore.
 *  - Communicates with CameraPathAnimator (core) via import.
 *  - Dispatches 've-recording-started' and 've-recording-complete' CustomEvents
 *    on window so RenderQueuePanel can track job status.
 *
 * Sections:
 *   1. Header       — title + close
 *   2. Keyframe list — add/remove keyframes from the active camera position
 *   3. Recording settings — FPS, duration
 *   4. Record / Export button + progress
 *   5. Video gallery — list of recorded videos with download + preview
 */

import * as THREE from '@pryzm/renderer-three/three';
import { CameraPathAnimator } from '@pryzm/core-app-model/rendering';
import { panelManager } from '../PanelManager';

interface VideoEntry {
    id:         string;
    name:       string;
    blobUrl:    string;
    mimeType:   string;
    frames:     number;
    durationMs: number;
    width:      number;
    height:     number;
    createdAt:  Date;
}

const FPS_OPTIONS    = [24, 30, 60];
const DURATION_OPTS  = [5, 10, 15, 20, 30];

export class VideoExportPanel {
    private _el:        HTMLElement;
    private _animator:  CameraPathAnimator;
    private _videos:    VideoEntry[] = [];
    private _recording = false;

    private _selectedFps      = 30;
    private _selectedDuration = 10;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._animator = new CameraPathAnimator();
        this._el       = this._build();
        panelManager.register('panel:video-export', () => this.hide());
    }

    getElement(): HTMLElement { return this._el; }
    show():   void { panelManager.notifyOpened('panel:video-export'); this._el.style.display = 'flex'; }
    hide():   void { panelManager.notifyClosed('panel:video-export'); this._el.style.display = 'none'; }
    toggle(): void {
        this._el.style.display === 'none' ? this.show() : this.hide();
    }

    // ── Build ──────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'pryzm-video-export-panel';
        panel.className = 've-panel';

        panel.innerHTML = `
            <!-- Header -->
            <div class="ve-header" style="
                display:flex; align-items:center; justify-content:space-between;
                padding:10px 12px; background:#111; border-bottom:1px solid #333; flex-shrink:0;
            ">
                <div style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px;">
                    <span style="font-size:16px;">🎬</span> Video Export
                </div>
                <button class="ve-close-btn" style="
                    background:none; border:none; color:#888; cursor:pointer;
                    font-size:16px; line-height:1; padding:0;
                ">×</button>
            </div>

            <div style="padding:12px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; flex:1; min-height:0;">

                <!-- Keyframe Section -->
                <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                        <label style="color:#aaa; font-size:10px; font-weight:600;
                            text-transform:uppercase; letter-spacing:.06em;">
                            Camera Keyframes
                        </label>
                        <button class="ve-add-kf-btn" style="
                            padding:3px 8px; background:#7c3aed; border:none; color:#fff;
                            border-radius:4px; font-size:10px; cursor:pointer;
                        ">+ Add Keyframe</button>
                    </div>

                    <div class="ve-kf-empty" style="
                        padding:12px; background:#2a2a2a; border-radius:6px;
                        text-align:center; color:#999; font-size:11px;
                        border: 1px solid #3a3a3a;
                    ">
                        Navigate to your start position, then click <strong style="color:#e0e0e0">+ Add Keyframe</strong>.
                        Add 2 or more keyframes to define the camera path.
                    </div>

                    <div class="ve-kf-list" style="display:none; flex-direction:column; gap:4px;"></div>
                </div>

                <!-- FPS + Duration -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <div>
                        <label style="display:block; color:#aaa; font-size:10px; font-weight:600;
                            text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px;">
                            Frame Rate
                        </label>
                        <select class="ve-fps-select" style="
                            width:100%; padding:6px 8px; background:#2a2a2a; border:1px solid #444;
                            color:#f0f0f0; border-radius:4px; font-size:11px; cursor:pointer;
                        ">
                            ${FPS_OPTIONS.map(f => `
                                <option value="${f}" ${f === this._selectedFps ? 'selected' : ''}>${f} fps</option>
                            `).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block; color:#aaa; font-size:10px; font-weight:600;
                            text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px;">
                            Duration
                        </label>
                        <select class="ve-dur-select" style="
                            width:100%; padding:6px 8px; background:#2a2a2a; border:1px solid #444;
                            color:#f0f0f0; border-radius:4px; font-size:11px; cursor:pointer;
                        ">
                            ${DURATION_OPTS.map(d => `
                                <option value="${d}" ${d === this._selectedDuration ? 'selected' : ''}>${d}s</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Record Button -->
                <button class="ve-record-btn" style="
                    width:100%; padding:10px; background:#dc2626; border:none;
                    color:#fff; border-radius:6px; font-size:13px; font-weight:600;
                    cursor:pointer; transition:background .15s;
                " disabled
                title="You need at least 2 keyframes to record. Currently have 0."
                >🎬 Record Video — add 2 more keyframes</button>

                <!-- Progress -->
                <div class="ve-progress-section" style="display:none;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span class="ve-status-label" style="color:#aaa; font-size:11px;">Preparing…</span>
                        <span class="ve-progress-pct" style="color:#dc2626; font-size:11px; font-weight:600;">0%</span>
                    </div>
                    <div style="background:#2a2a2a; border-radius:4px; height:6px; overflow:hidden;">
                        <div class="ve-progress-fill" style="
                            height:100%; background:linear-gradient(90deg, #dc2626, #f87171);
                            width:0%; transition:width .2s ease; border-radius:4px;
                        "></div>
                    </div>
                    <div class="ve-frame-counter" style="
                        font-size:10px; color:#666; margin-top:4px; text-align:center;
                    "></div>
                </div>

                <!-- Video Gallery -->
                <div class="ve-gallery-section" style="display:none; flex-direction:column; gap:6px;">
                    <label style="color:#aaa; font-size:10px; font-weight:600;
                        text-transform:uppercase; letter-spacing:.06em;">
                        Recorded Videos
                    </label>
                    <div class="ve-video-list" style="display:flex; flex-direction:column; gap:6px;"></div>
                </div>

                <!-- Info box -->
                <div style="
                    background:#2a2a2a; border-radius:6px; padding:8px 10px;
                    font-size:10px; color:#888; line-height:1.5;
                ">
                    <strong style="color:#aaa;">How video recording works</strong><br>
                    The camera animates through your keyframes while the viewport records
                    the output as a WebM/MP4 video in real time. Position the camera at
                    each interesting angle before adding a keyframe.
                </div>
            </div>
        `;

        this._wire(panel);
        return panel;
    }

    // ── Event wiring ──────────────────────────────────────────────────────────

    private _wire(panel: HTMLElement): void {
        panel.querySelector('.ve-close-btn')?.addEventListener('click', () => this.hide());

        panel.querySelector('.ve-add-kf-btn')?.addEventListener('click', () => {
            this._addKeyframe();
        });

        panel.querySelector('.ve-fps-select')?.addEventListener('change', (e) => {
            this._selectedFps = parseInt((e.target as HTMLSelectElement).value, 10);
        });

        panel.querySelector('.ve-dur-select')?.addEventListener('change', (e) => {
            this._selectedDuration = parseInt((e.target as HTMLSelectElement).value, 10);
        });

        panel.querySelector('.ve-record-btn')?.addEventListener('click', () => {
            this._startRecording();
        });
    }

    // ── Keyframe management ───────────────────────────────────────────────────

    private _addKeyframe(): void {
        const camera = window.world?.camera?.three as THREE.Camera | undefined; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!camera) {
            this._toast('No active camera found.', 'error');
            return;
        }

        this._animator.addKeyframe(camera);
        this._renderKeyframeList();
        this._updateRecordBtn();
        this._toast(`Keyframe ${this._animator.keyframes.length} added`, 'success');
    }

    private _renderKeyframeList(): void {
        const empty = this._el.querySelector<HTMLElement>('.ve-kf-empty');
        const list  = this._el.querySelector<HTMLElement>('.ve-kf-list');
        if (!empty || !list) return;

        const kfs = this._animator.keyframes;

        if (kfs.length === 0) {
            empty.style.display = 'block';
            list.style.display  = 'none';
            return;
        }

        empty.style.display = 'none';
        list.style.display  = 'flex';

        list.innerHTML = kfs.map((kf, i) => `
            <div class="ve-kf-row" data-kf-id="${kf.id}" style="
                display:flex; align-items:center; gap:6px;
                background:#2a2a2a; border-radius:4px; padding:6px 8px;
                border:1px solid #333;
            ">
                <span style="
                    background:#7c3aed; color:#fff; border-radius:3px;
                    padding:2px 6px; font-size:10px; font-weight:700;
                    min-width:22px; text-align:center;
                ">${i + 1}</span>
                <span style="flex:1; font-size:11px; color:#ccc;">${kf.label}</span>
                <button class="ve-preview-kf" data-kf-id="${kf.id}" style="
                    padding:3px 6px; background:none; border:1px solid #444;
                    color:#888; border-radius:3px; font-size:9px; cursor:pointer;
                " title="Jump camera to this keyframe">👁</button>
                <button class="ve-del-kf" data-kf-id="${kf.id}" style="
                    padding:3px 6px; background:none; border:1px solid #444;
                    color:#888; border-radius:3px; font-size:9px; cursor:pointer;
                ">✕</button>
            </div>
        `).join('');

        list.querySelectorAll('.ve-preview-kf').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.kfId;
                const kf = this._animator.keyframes.find(k => k.id === id);
                if (!kf) return;
                const cam = window.world?.camera?.three as THREE.PerspectiveCamera | undefined; // TODO(D.4): legacy world — replace with runtime.scene.world
                if (!cam) return;
                cam.position.copy(kf.position);
                cam.lookAt(kf.target);
                cam.fov = kf.fov;
                cam.updateProjectionMatrix();
            });
        });

        list.querySelectorAll('.ve-del-kf').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.kfId ?? '';
                this._animator.removeKeyframe(id);
                this._renderKeyframeList();
                this._updateRecordBtn();
            });
        });
    }

    private _updateRecordBtn(): void {
        const btn = this._el.querySelector<HTMLButtonElement>('.ve-record-btn');
        if (!btn) return;
        const kfCount  = this._animator.keyframes.length;
        const canRecord = kfCount >= 2 && !this._recording;
        btn.disabled = !canRecord;
        btn.style.opacity = canRecord ? '1' : '0.5';
        if (canRecord) {
            btn.textContent = '🎬 Record Video';
            btn.title = 'Record a camera flythrough video';
        } else if (this._recording) {
            btn.textContent = '⏺ Recording…';
            btn.title = '';
        } else {
            const needed = 2 - kfCount;
            btn.textContent = `🎬 Record Video — add ${needed} more keyframe${needed === 1 ? '' : 's'}`;
            btn.title = `You need at least 2 keyframes to record. Currently have ${kfCount}.`;
        }
    }

    // ── Recording ─────────────────────────────────────────────────────────────

    private async _startRecording(): Promise<void> {
        if (this._recording) return;
        if (this._animator.keyframes.length < 2) {
            this._toast('Add at least 2 keyframes first.', 'error');
            return;
        }

        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.scene?.three || !world?.camera?.three || !world?.renderer?.three) {
            this._toast('No active scene found.', 'error');
            return;
        }

        this._recording = true;
        this._setRecording(true);

        window.runtime?.events?.emit('ve-recording-started', { fps: this._selectedFps, duration: this._selectedDuration }); // F.events.14

        const scene    = world.scene.three    as THREE.Scene;
        const camera   = world.camera.three   as THREE.PerspectiveCamera;
        // Use `as any` then cast to WebGLRenderer for compatibility with both
        // WebGL and WebGPU renderers — both expose domElement and render().
        const renderer = (world.renderer.three as any) as THREE.WebGLRenderer;
        const size     = new THREE.Vector2();
        renderer.getSize(size);

        // If SSGIService (GTAO ambient occlusion) is active, route per-frame
        // rendering through its EffectComposer so AO is included in the video.
        // Otherwise fall back to raw renderer.render() (handled inside animator).
        const ssgiService = window.ssgiService as { active: boolean; renderOnce: () => void } | undefined; // TODO(D.4): legacy ssgiService — replace with runtime.scene.renderer SSGI service
        const renderFn = (ssgiService?.active)
            ? () => ssgiService.renderOnce()
            : undefined;

        try {
            const result = await this._animator.recordVideo(renderer, scene, camera, {
                fps:          this._selectedFps,
                durationSecs: this._selectedDuration,
                width:        size.x,
                height:       size.y,
                renderFn,
                onProgress: (pct, status) => {
                    this._updateProgress(pct, status);
                    const queueId = window.__rq_video_job_id__; // TODO(C.3.x): legacy __rq_video_job_id__ — replace with runtime.exports.video job-id (debug)
                    if (queueId) {
                        window.runtime?.events?.emit('rq-job-progress', { id: queueId, pct, status });
                    }
                },
                onFrame: (f, total) => {
                    const counter = this._el.querySelector<HTMLElement>('.ve-frame-counter');
                    if (counter) counter.textContent = `Frame ${f} / ${total}`;
                },
            });

            const entry: VideoEntry = {
                id:         `vid-${Date.now()}`,
                name:       `Video ${this._videos.length + 1}`,
                blobUrl:    result.blobUrl,
                mimeType:   result.mimeType,
                frames:     result.frames,
                durationMs: result.durationMs,
                width:      result.width,
                height:     result.height,
                createdAt:  new Date(),
            };

            this._videos.unshift(entry);
            this._renderVideoGallery();

            window.runtime?.events?.emit('ve-recording-complete', { id: entry.id, name: entry.name, frames: entry.frames }); // F.events.14

            this._toast(`Video recorded — ${result.frames} frames`, 'success');

            // Auto-download
            this._downloadVideo(entry);
        } catch (err: any) {
            console.error('[VideoExportPanel] Recording failed:', err);
            // Notify queue of failure
            const queueId = window.__rq_video_job_id__; // TODO(C.3.x): legacy __rq_video_job_id__ — replace with runtime.exports.video job-id (debug)
            if (queueId) {
                window.runtime?.events?.emit('rq-job-error', { id: queueId, error: err?.message ?? String(err) });
                delete window.__rq_video_job_id__; // TODO(C.3.x): legacy __rq_video_job_id__ — replace with runtime.exports.video job-id (debug)
            }
            this._toast(`Recording failed: ${err?.message ?? err}`, 'error');
        } finally {
            this._recording = false;
            this._setRecording(false);
        }
    }

    private _setRecording(active: boolean): void {
        const btn  = this._el.querySelector<HTMLButtonElement>('.ve-record-btn');
        const prog = this._el.querySelector<HTMLElement>('.ve-progress-section');
        if (btn) {
            btn.disabled = active;
            btn.style.opacity = active ? '0.4' : (this._animator.keyframes.length >= 2 ? '1' : '0.4');
            btn.textContent   = active ? '⏳ Recording…' : '🎬 Record Video';
        }
        if (prog) prog.style.display = active ? 'block' : 'none';
        if (!active) this._updateProgress(0, '');
    }

    private _updateProgress(pct: number, status: string): void {
        const fill  = this._el.querySelector<HTMLElement>('.ve-progress-fill');
        const label = this._el.querySelector<HTMLElement>('.ve-status-label');
        const pctEl = this._el.querySelector<HTMLElement>('.ve-progress-pct');
        if (fill)  fill.style.width = `${Math.round(pct * 100)}%`;
        if (label) label.textContent = status;
        if (pctEl) pctEl.textContent = `${Math.round(pct * 100)}%`;
    }

    // ── Video gallery ─────────────────────────────────────────────────────────

    private _renderVideoGallery(): void {
        const section = this._el.querySelector<HTMLElement>('.ve-gallery-section');
        const list    = this._el.querySelector<HTMLElement>('.ve-video-list');
        if (!section || !list) return;

        if (this._videos.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'flex';

        list.innerHTML = this._videos.map(v => {
            const ext = v.mimeType.includes('mp4') ? 'mp4' : 'webm';
            return `
                <div class="ve-video-row" data-vid-id="${v.id}" style="
                    background:#2a2a2a; border-radius:6px; padding:8px;
                    border:1px solid #333; display:flex; align-items:center; gap:8px;
                ">
                    <div style="
                        font-size:20px; width:36px; height:36px; background:#333;
                        border-radius:4px; display:flex; align-items:center;
                        justify-content:center; flex-shrink:0;
                    ">🎬</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:11px; font-weight:600; color:#e0e0e0;
                            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${v.name}
                        </div>
                        <div style="font-size:10px; color:#666; margin-top:1px;">
                            ${v.width}×${v.height} · ${v.frames} frames · ${ext.toUpperCase()}
                        </div>
                    </div>
                    <button class="ve-dl-video" data-vid-id="${v.id}" style="
                        padding:4px 8px; background:#dc2626; border:none;
                        color:#fff; border-radius:4px; font-size:10px; cursor:pointer;
                        flex-shrink:0;
                    ">⬇</button>
                    <button class="ve-del-video" data-vid-id="${v.id}" style="
                        padding:4px 8px; background:none; border:1px solid #444;
                        color:#888; border-radius:4px; font-size:10px; cursor:pointer;
                        flex-shrink:0;
                    ">✕</button>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.ve-dl-video').forEach(btn => {
            btn.addEventListener('click', () => {
                const v = this._videos.find(e => e.id === (btn as HTMLElement).dataset.vidId);
                if (v) this._downloadVideo(v);
            });
        });

        list.querySelectorAll('.ve-del-video').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.vidId ?? '';
                const idx = this._videos.findIndex(v => v.id === id);
                if (idx === -1) return;
                URL.revokeObjectURL(this._videos[idx].blobUrl);
                this._videos.splice(idx, 1);
                this._renderVideoGallery();
            });
        });
    }

    private _downloadVideo(entry: VideoEntry): void {
        const ext = entry.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const a   = document.createElement('a');
        a.href    = entry.blobUrl;
        a.download = `${entry.name.replace(/\s+/g, '_')}_${entry.width}x${entry.height}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private _toast(message: string, type: 'success' | 'warn' | 'error'): void {
        const toast = document.createElement('div');
        toast.className = `vex-toast vex-toast--${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
}

// ── Singleton helpers ─────────────────────────────────────────────────────────

let _videoPanel: VideoExportPanel | null = null;

export function getVideoExportPanel(): VideoExportPanel {
    if (!_videoPanel) _videoPanel = new VideoExportPanel();
    return _videoPanel;
}

export function mountVideoExportPanel(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountVideoExportPanel */): VideoExportPanel {
    void runtime; /* B-runtime-void mountVideoExportPanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    const panel = getVideoExportPanel();
    container.appendChild(panel.getElement());
    return panel;
}
