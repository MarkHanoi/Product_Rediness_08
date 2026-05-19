/**
 * @file src/ui/rendering/PanoramaPanel.ts
 * @description 360° panorama capture panel + embedded equirectangular viewer.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1, §3):
 *  - Prefix: `pn-`  (registered here; all class names in this file use pn- only)
 *  - NO bim-* web components.
 *  - This panel is UI-only. Never writes to any ElementStore.
 *  - Communicates with PanoramaCapture (core) via import, not window globals.
 *  - The embedded 360° viewer uses THREE.js sphere projection — no external libs.
 *
 * Layout: floating panel anchored top-right (next to the existing render panels).
 *
 * Sections:
 *   1. Header     — title + close
 *   2. Controls   — output resolution, HDRI preset selector
 *   3. Capture    — "Capture 360°" button + progress bar
 *   4. Gallery    — thumbnails of captured panoramas with download + view buttons
 *   5. Viewer     — inline interactive sphere viewer (shown on "View" click)
 */

import { apiFetch } from '@pryzm/core-app-model';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import * as THREE from '@pryzm/renderer-three/three';
// Contract 47 §5 — lazy-load PanoramaCapture (~10 KB) so it fetches
// only when the user clicks Capture in the panorama panel. Type-only
// import is erased by tsc and does NOT pull the module into the
// static graph (§6.C).
import type { PanoramaCapture as _PanoramaCaptureType }
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
import { HDRI_PRESETS } from '@pryzm/core-app-model/rendering';
import { HDRIEnvironmentManager } from '@pryzm/core-app-model/rendering';
import { sharedRenderingState } from '@pryzm/core-app-model/rendering';
import { panelManager } from '../PanelManager';

interface PanoramaEntry {
    id:         string;
    name:       string;
    blobUrl:    string;
    thumbnail:  string;
    width:      number;
    height:     number;
    createdAt:  Date;
    durationMs: number;
}

const RESOLUTION_OPTIONS = [
    { id: 'draft',  label: 'Draft  (2K · 2048px)',  faceRes: 512,  outWidth: 2048  },
    { id: 'medium', label: 'Medium (4K · 4096px)',  faceRes: 1024, outWidth: 4096  },
    { id: 'high',   label: 'High   (8K · 8192px)',  faceRes: 2048, outWidth: 8192  },
];

export class PanoramaPanel {
    private _el:         HTMLElement;
    private _entries:    PanoramaEntry[] = [];
    private _capturing = false;

    private _selectedRes    = 'medium';
    private _hdriManager:   HDRIEnvironmentManager | null = null;

    // ── Viewer state ──────────────────────────────────────────────────────────
    private _viewer:        HTMLElement | null = null;
    private _viewerCleanup: (() => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = this._build();
        panelManager.register('panel:panorama', () => this.hide());
        // Phase 1 — update HDRI label when shared state changes.
        window.addEventListener('pryzm-rendering-state-changed', (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            if (!detail.hdriPresetId) return;
            const nameEl = this._el.querySelector<HTMLElement>('.pn-hdri-name');
            if (nameEl) {
                const preset = HDRI_PRESETS.find(p => p.id === detail.hdriPresetId);
                nameEl.textContent = preset?.label ?? detail.hdriPresetId;
            }
        });
    }

    getElement(): HTMLElement { return this._el; }
    show():   void { panelManager.notifyOpened('panel:panorama'); this._el.style.display = 'flex'; }
    hide():   void { panelManager.notifyClosed('panel:panorama'); this._el.style.display = 'none'; }
    toggle(): void {
        this._el.style.display === 'none' ? this.show() : this.hide();
    }

    // ── Build ──────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'pryzm-panorama-panel';
        panel.className = 'pn-panel';

        panel.innerHTML = `
            <!-- Header -->
            <div class="pn-header">
                <div class="pn-header-title">
                    <span>🌐</span> 360° Panorama
                </div>
                <button class="pn-close-btn">×</button>
            </div>

            <!-- Controls -->
            <div class="pn-body">

                <!-- Resolution -->
                <div>
                    <label class="pn-label">Output Resolution</label>
                    <select class="pn-select pn-res-select">
                        ${RESOLUTION_OPTIONS.map(r => `
                            <option value="${r.id}" ${r.id === this._selectedRes ? 'selected' : ''}>${r.label}</option>
                        `).join('')}
                    </select>
                </div>

                <!-- HDRI (Phase 1 — inherited from Visualization Engine) -->
                <div>
                    <label class="pn-label">Environment Lighting</label>
                    <div style="display:flex; align-items:center; gap:6px; padding:6px 8px;
                        background:#2a2a2a; border:1px solid #444; border-radius:4px;">
                        <span style="font-size:10px; color:#888;">Active:</span>
                        <span class="pn-hdri-name" style="font-size:11px; color:#c4b5fd; font-style:italic; flex:1;">
                            ${HDRI_PRESETS.find(p => p.id === sharedRenderingState.hdriPresetId)?.label ?? sharedRenderingState.hdriPresetId}
                        </span>
                    </div>
                    <div style="font-size:10px; color:#555; margin-top:3px;">
                        Set via Visualization Engine → Lighting tab
                    </div>
                </div>

                <!-- Capture button -->
                <button class="pn-capture-btn">🌐 Capture 360° Panorama</button>

                <!-- Progress -->
                <div class="pn-progress-section" style="display:none;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span class="pn-status-label" style="color:#aaa; font-size:11px;">Preparing…</span>
                        <span class="pn-progress-pct" style="color:#0891b2; font-size:11px; font-weight:600;">0%</span>
                    </div>
                    <div style="background:#2a2a2a; border-radius:4px; height:6px; overflow:hidden;">
                        <div class="pn-progress-fill" style="
                            height:100%; background:linear-gradient(90deg, #0891b2, #06b6d4);
                            width:0%; transition:width .3s ease; border-radius:4px;
                        "></div>
                    </div>
                </div>

                <!-- Gallery divider -->
                <div class="pn-gallery-section" style="display:none; flex-direction:column; gap:6px;">
                    <div style="color:#aaa; font-size:10px; font-weight:600;
                        text-transform:uppercase; letter-spacing:.06em; margin-top:4px;">
                        Captured Panoramas
                    </div>
                    <div class="pn-gallery-list" style="display:flex; flex-direction:column; gap:6px;"></div>
                </div>

                <!-- Info -->
                <div style="
                    background:#2a2a2a; border-radius:6px; padding:8px 10px;
                    font-size:10px; color:#888; line-height:1.5;
                ">
                    <strong style="color:#aaa;">360° Panoramas</strong><br>
                    Captures all directions from the camera position. Use Draft for
                    quick previews, High for final exports. The viewer lets you look
                    around inside the panorama without any extra software.
                </div>
            </div>
        `;

        this._wire(panel);
        return panel;
    }

    // ── Event wiring ──────────────────────────────────────────────────────────

    private _wire(panel: HTMLElement): void {
        panel.querySelector('.pn-close-btn')?.addEventListener('click', () => this.hide());

        panel.querySelector('.pn-res-select')?.addEventListener('change', (e) => {
            this._selectedRes = (e.target as HTMLSelectElement).value;
        });

        panel.querySelector('.pn-capture-btn')?.addEventListener('click', () => {
            this._startCapture();
        });
    }

    // ── Capture ────────────────────────────────────────────────────────────────

    private async _startCapture(): Promise<void> {
        if (this._capturing) return;

        const world = window.world; // TODO(D.4): legacy world — replace with runtime.scene.world
        if (!world?.scene?.three || !world?.camera?.three) {
            this._toast('No active scene. Open a project first.', 'error');
            return;
        }

        const resOpt = RESOLUTION_OPTIONS.find(r => r.id === this._selectedRes) ?? RESOLUTION_OPTIONS[1];

        this._capturing = true;
        this._setCapturing(true);

        // ── Announce job to Render Queue ──────────────────────────────────────
        const jobId   = `pano-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const jobName = `Panorama ${this._entries.length + 1} (${resOpt.label.split('(')[0].trim()})`;
        window.runtime?.events?.emit('rq-job-start', { id: jobId, name: jobName, type: 'panorama' });

        const scene    = world.scene.three  as THREE.Scene;
        const camera   = world.camera.three as THREE.Camera;
        const renderer = world.renderer?.three as THREE.WebGLRenderer | undefined;

        // Apply HDRI before capture — Phase 1: read from shared state, not local dropdown.
        const activeHdri = sharedRenderingState.hdriPresetId;
        if (renderer && activeHdri !== 'none') {
            this._hdriManager = new HDRIEnvironmentManager(renderer);
            await this._hdriManager.applyPresetAsLightOnly(scene, activeHdri).catch(() => null);
        }

        try {
            // Contract 47 §5 — defer PanoramaCapture module fetch to first capture click.
            const PanoramaCapture = await _getPanoramaCapture();
            const result = await PanoramaCapture.capture(
                renderer as THREE.WebGLRenderer,
                scene,
                camera,
                {
                    faceResolution: resOpt.faceRes,
                    outputWidth:    resOpt.outWidth,
                    onProgress: (pct, status) => {
                        this._updateProgress(pct, status);
                        window.runtime?.events?.emit('rq-job-progress', { id: jobId, pct, status });
                    },
                }
            );

            window.runtime?.events?.emit('rq-job-complete', { id: jobId });

            const thumbnail = await this._makeThumbnail(result.blobUrl);
            const entry: PanoramaEntry = {
                id:         `pano-${Date.now()}`,
                name:       `Panorama ${this._entries.length + 1}`,
                blobUrl:    result.blobUrl,
                thumbnail,
                width:      result.width,
                height:     result.height,
                createdAt:  new Date(),
                durationMs: result.durationMs,
            };

            this._entries.unshift(entry);
            this._renderGallery();
            this._toast(`360° panorama ready — ${result.width}×${result.height}`, 'success');

            // Try to sync to server (fire-and-forget)
            this._syncToServer(entry).catch(() => {});
        } catch (err: any) {
            console.error('[PanoramaPanel] Capture failed:', err);
            window.runtime?.events?.emit('rq-job-error', { id: jobId, error: err?.message ?? String(err) });
            this._toast(`Capture failed: ${err?.message ?? err}`, 'error');
        } finally {
            this._hdriManager?.dispose();
            this._hdriManager = null;
            this._capturing = false;
            this._setCapturing(false);
        }
    }

    private _setCapturing(active: boolean): void {
        const btn  = this._el.querySelector<HTMLButtonElement>('.pn-capture-btn');
        const prog = this._el.querySelector<HTMLElement>('.pn-progress-section');
        if (btn) {
            btn.disabled = active;
            btn.style.opacity = active ? '0.5' : '1';
            btn.textContent   = active ? '⏳ Capturing…' : '🌐 Capture 360° Panorama';
        }
        if (prog) prog.style.display = active ? 'block' : 'none';
        if (!active) this._updateProgress(0, '');
    }

    private _updateProgress(pct: number, status: string): void {
        const fill   = this._el.querySelector<HTMLElement>('.pn-progress-fill');
        const label  = this._el.querySelector<HTMLElement>('.pn-status-label');
        const pctEl  = this._el.querySelector<HTMLElement>('.pn-progress-pct');
        if (fill)  fill.style.width = `${Math.round(pct * 100)}%`;
        if (label) label.textContent = status;
        if (pctEl) pctEl.textContent = `${Math.round(pct * 100)}%`;
    }

    // ── Gallery ────────────────────────────────────────────────────────────────

    private _renderGallery(): void {
        const section = this._el.querySelector<HTMLElement>('.pn-gallery-section');
        const list    = this._el.querySelector<HTMLElement>('.pn-gallery-list');
        if (!section || !list) return;

        if (this._entries.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'flex';

        list.innerHTML = this._entries.map(entry => `
            <div class="pn-entry" data-id="${entry.id}" style="
                background:#2a2a2a; border-radius:6px; overflow:hidden;
                border:1px solid #333;
            ">
                ${entry.thumbnail
                    ? `<img src="${entry.thumbnail}" style="width:100%; aspect-ratio:2/1; object-fit:cover; display:block;">`
                    : `<div style="width:100%; aspect-ratio:2/1; background:#1a1a1a; display:flex;
                                   align-items:center; justify-content:center; color:#555; font-size:10px;">
                           No preview
                       </div>`
                }
                <div style="padding:6px 8px;">
                    <div style="font-size:11px; font-weight:600; color:#e0e0e0;">${entry.name}</div>
                    <div style="font-size:10px; color:#666; margin-top:1px;">
                        ${entry.width}×${entry.height} · ${(entry.durationMs / 1000).toFixed(1)}s
                    </div>
                    <div style="display:flex; gap:4px; margin-top:6px;">
                        <button class="pn-view-btn" data-id="${entry.id}" style="
                            flex:1; padding:4px 0; background:#0891b2; border:none;
                            color:#fff; border-radius:4px; font-size:10px; cursor:pointer;
                        ">👁 View</button>
                        <button class="pn-dl-btn" data-id="${entry.id}" style="
                            flex:1; padding:4px 0; background:#2a2a2a; border:1px solid #444;
                            color:#ccc; border-radius:4px; font-size:10px; cursor:pointer;
                        ">⬇ Save</button>
                        <button class="pn-del-btn" data-id="${entry.id}" style="
                            padding:4px 8px; background:#2a2a2a; border:1px solid #444;
                            color:#888; border-radius:4px; font-size:10px; cursor:pointer;
                        ">✕</button>
                    </div>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.pn-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const entry = this._entries.find(e => e.id === (btn as HTMLElement).dataset.id);
                if (entry) this._openViewer(entry);
            });
        });

        list.querySelectorAll('.pn-dl-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const entry = this._entries.find(e => e.id === (btn as HTMLElement).dataset.id);
                if (entry) this._download(entry);
            });
        });

        list.querySelectorAll('.pn-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id ?? '';
                this._deleteEntry(id);
            });
        });
    }

    private _download(entry: PanoramaEntry): void {
        const a  = document.createElement('a');
        a.href   = entry.blobUrl;
        a.download = `${entry.name.replace(/\s+/g, '_')}_equirectangular.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    private _deleteEntry(id: string): void {
        const idx = this._entries.findIndex(e => e.id === id);
        if (idx === -1) return;
        URL.revokeObjectURL(this._entries[idx].blobUrl);
        this._entries.splice(idx, 1);
        this._renderGallery();
    }

    // ── 360° Viewer ───────────────────────────────────────────────────────────

    private _openViewer(entry: PanoramaEntry): void {
        // Close any existing viewer
        this._closeViewer();

        const overlay = document.createElement('div');
        overlay.id = 'pn-viewer-overlay';
        overlay.className = 'pn-viewer-overlay';

        // Header
        const header = document.createElement('div');
        header.className = 'pn-viewer-header';
        header.innerHTML = `
            <div class="pn-viewer-title">🌐 360° Viewer — ${entry.name}</div>
            <div class="pn-viewer-meta">
                <span class="pn-viewer-hint">Click &amp; drag to look around</span>
                <button id="pn-viewer-close" class="pn-viewer-close">✕ Close</button>
            </div>
        `;
        overlay.appendChild(header);

        // Canvas container
        const viewerContainer = document.createElement('div');
        viewerContainer.className = 'pn-viewer-canvas';
        overlay.appendChild(viewerContainer);

        document.body.appendChild(overlay);
        this._viewer = overlay;

        // Wire close
        header.querySelector('#pn-viewer-close')?.addEventListener('click', () => this._closeViewer());
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeViewer(); });

        // Build Three.js 360 viewer
        this._viewerCleanup = this._buildThreeSixtyViewer(viewerContainer, entry.blobUrl);
    }

    private _buildThreeSixtyViewer(container: HTMLElement, imageUrl: string): () => void {
        const w = container.clientWidth  || window.innerWidth;
        const h = container.clientHeight || window.innerHeight - 50;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 10);
        // Camera stays at origin — we only change its orientation.
        camera.position.set(0, 0, 0);

        // Use Three.js EquirectangularReflectionMapping as scene.background.
        // This avoids all sphere-geometry seam / pole / orientation issues:
        // Three.js internally projects the equirectangular texture onto a virtual
        // sphere and renders only what the camera is currently looking at.
        // As lon/lat change, the camera's look-at direction changes → the user
        // sees a different part of the panorama — a true 360° interactive view.
        const loader = new THREE.TextureLoader();
        loader.load(imageUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.mapping    = THREE.EquirectangularReflectionMapping;
            scene.background = tex;
        });

        // Mouse-driven orbit (no external controls)
        let isPointerDown = false;
        let lastX = 0, lastY = 0;
        // Start at lon=180 so the initial view faces the centre of the
        // equirectangular image, which corresponds to the direction the main
        // camera was looking during the panorama capture (U=0.5 → -Z face).
        let lon = 180, lat = 0;

        const onPointerDown = (e: PointerEvent) => { isPointerDown = true; lastX = e.clientX; lastY = e.clientY; };
        const onPointerUp   = ()                  => { isPointerDown = false; };
        const onPointerMove = (e: PointerEvent)   => {
            if (!isPointerDown) return;
            lon -= (e.clientX - lastX) * 0.3;
            lat += (e.clientY - lastY) * 0.3;
            lat = Math.max(-85, Math.min(85, lat));
            lastX = e.clientX; lastY = e.clientY;
        };
        const onWheel = (e: WheelEvent) => {
            camera.fov = Math.max(30, Math.min(110, camera.fov + e.deltaY * 0.05));
            camera.updateProjectionMatrix();
        };

        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('wheel', onWheel);

        const onResize = () => {
            const nw = container.clientWidth, nh = container.clientHeight;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', onResize);

        // D.7.5 batch #5: continuous render driven by FrameScheduler.
        // The scheduler re-invokes the callback every frame; cleanup invokes
        // the disposer (replaces the cancelAnimationFrame in the teardown).
        let rafDisposer: TickListenerDisposer | null = null;
        const animate = () => {
            const phi   = THREE.MathUtils.degToRad(90 - lat);
            const theta = THREE.MathUtils.degToRad(lon);

            camera.lookAt(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta),
            );

            renderer.render(scene, camera);
        };
        rafDisposer = getFrameScheduler().addTickListener(
            'panorama-panel-render',
            animate,
            'render',
        );

        // Touch support
        let lastTouchDist = 0;
        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                isPointerDown = true;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            }
        };
        const onTouchEnd   = () => { isPointerDown = false; };
        const onTouchMove  = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 1 && isPointerDown) {
                lon -= (e.touches[0].clientX - lastX) * 0.3;
                lat += (e.touches[0].clientY - lastY) * 0.3;
                lat = Math.max(-85, Math.min(85, lat));
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const dx   = e.touches[0].clientX - e.touches[1].clientX;
                const dy   = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (lastTouchDist > 0) {
                    camera.fov = Math.max(30, Math.min(110, camera.fov - (dist - lastTouchDist) * 0.1));
                    camera.updateProjectionMatrix();
                }
                lastTouchDist = dist;
            }
        };
        renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
        renderer.domElement.addEventListener('touchend',   onTouchEnd);
        renderer.domElement.addEventListener('touchmove',  onTouchMove, { passive: false });

        return () => {
            // D.7.5 batch #5: dispose the FrameScheduler tick listener.
            if (rafDisposer) { rafDisposer(); rafDisposer = null; }
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointerup', onPointerUp);
            renderer.domElement.removeEventListener('pointermove', onPointerMove);
            renderer.domElement.removeEventListener('wheel', onWheel);
            window.removeEventListener('resize', onResize);
            renderer.domElement.removeEventListener('touchstart', onTouchStart);
            renderer.domElement.removeEventListener('touchend', onTouchEnd);
            renderer.domElement.removeEventListener('touchmove', onTouchMove);
            // Dispose background texture if loaded
            if (scene.background instanceof THREE.Texture) {
                scene.background.dispose();
            }
            scene.background = null;
            renderer.dispose();
        };
    }

    private _closeViewer(): void {
        this._viewerCleanup?.();
        this._viewerCleanup = null;
        this._viewer?.remove();
        this._viewer = null;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private async _makeThumbnail(blobUrl: string): Promise<string> {
        return new Promise(resolve => {
            const img  = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width  = 260;
                c.height = 130;
                c.getContext('2d')?.drawImage(img, 0, 0, 260, 130);
                resolve(c.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = () => resolve('');
            img.src = blobUrl;
        });
    }

    private async _syncToServer(entry: PanoramaEntry): Promise<void> {
        const blob = await fetch(entry.blobUrl).then(r => r.blob()).catch(() => null);
        if (!blob) return;

        const form = new FormData();
        form.append('image', blob, `${entry.id}.jpg`);
        form.append('meta', JSON.stringify({
            width:      entry.width,
            height:     entry.height,
            name:       entry.name,
            type:       'panorama',
            durationMs: entry.durationMs,
        }));

        await apiFetch('/api/panorama/save', { method: 'POST', body: form }).catch(() => null);
    }

    private _toast(message: string, type: 'success' | 'warn' | 'error'): void {
        const toast = document.createElement('div');
        toast.className = `pn-toast pn-toast--${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }
}

// ── Singleton helpers ─────────────────────────────────────────────────────────

let _panoramaPanel: PanoramaPanel | null = null;

export function getPanoramaPanel(): PanoramaPanel {
    if (!_panoramaPanel) _panoramaPanel = new PanoramaPanel();
    return _panoramaPanel;
}

export function mountPanoramaPanel(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountPanoramaPanel */): PanoramaPanel {
    void runtime; /* B-runtime-void mountPanoramaPanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    const panel = getPanoramaPanel();
    container.appendChild(panel.getElement());
    return panel;
}
