/**
 * @file src/ui/rendering/RealSunControl.ts
 * @description Lightweight floating mini-panel for the Real Sun system.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §3, §7.8):
 *  - Prefix: `rsc-`  (Real Sun Control — unique, registered per §3 convention)
 *  - NO bim-* web components (§7.8 strict ban)
 *  - Styles are added to AppTheme.ts as REAL_SUN_STYLES (exported constant)
 *  - UI-only: NEVER writes to any store directly.
 *  - Communicates with RealSunService exclusively through
 *    window.renderingPipelineCoordinator (set by EngineBootstrap).
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - Does NOT mutate any ElementStore or semantic state.
 *
 * Appearance: small floating card pinned to the top-right of the viewport.
 *   z-index 2600 — below main panels (~3000) but above the 3-D canvas.
 *
 * Features:
 *   • Time-of-day slider (0–24 h)
 *   • Latitude / longitude inputs
 *   • Live sun-status readout (altitude, K, intensity)
 */

import { injectAppTheme } from '../styles/AppTheme';
import type { RealSunService } from '@pryzm/core-app-model/rendering';

// ── Singleton factory ──────────────────────────────────────────────────────

let _instance: RealSunControl | null = null;

export function mountRealSunControl(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountRealSunControl */): RealSunControl {
    void runtime; /* B-runtime-void mountRealSunControl — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    if (!_instance) {
        _instance = new RealSunControl();
        container.appendChild(_instance.getElement());
    }
    return _instance;
}

export function getRealSunControl(): RealSunControl {
    if (!_instance) throw new Error('[RealSunControl] Not yet mounted.');
    return _instance;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getCoordinator(): any {
    return window.renderingPipelineCoordinator ?? null; // TODO(D.4): legacy renderingPipelineCoordinator — replace with runtime.scene.renderer.pipeline coordinator
}

function getSunService(): RealSunService | null {
    return getCoordinator()?.realSunService ?? null;
}

// ── Class ──────────────────────────────────────────────────────────────────

export class RealSunControl {
    private _el:        HTMLElement;
    private _visible  = false;

    // Slider / input element refs
    private _timeSlider: HTMLInputElement | null     = null;
    private _latInput:   HTMLInputElement | null     = null;
    private _lngInput:   HTMLInputElement | null     = null;
    private _statusRow:  HTMLElement | null          = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        injectAppTheme();
        this._el = this._build();
    }

    // ── Mount / visibility ─────────────────────────────────────────────────

    getElement(): HTMLElement { return this._el; }

    show(): void {
        this._el.style.display = 'flex';
        this._visible = true;
        this._syncFromService();
    }

    hide(): void {
        this._el.style.display = 'none';
        this._visible = false;
    }

    toggle(): void {
        this._visible ? this.hide() : this.show();
    }

    isVisible(): boolean { return this._visible; }

    // ── Sync from service ──────────────────────────────────────────────────

    private _syncFromService(): void {
        const svc = getSunService();
        if (!svc) return;

        const cfg = svc.config;
        if (this._latInput) this._latInput.value = cfg.lat.toFixed(4);
        if (this._lngInput) this._lngInput.value = cfg.lng.toFixed(4);

        if (this._timeSlider) {
            const h = cfg.date.getUTCHours() + cfg.date.getUTCMinutes() / 60;
            this._timeSlider.value = h.toFixed(2);
            this._updateTimeLabel(h);
        }

        const pos = svc.lastPosition;
        if (pos && this._statusRow) {
            this._updateStatus(pos);
        }
    }

    private _updateTimeLabel(hours: number): void {
        const display = this._el.querySelector('.rsc-time-display') as HTMLElement | null;
        if (!display) return;
        const h  = Math.floor(hours);
        const m  = Math.round((hours - h) * 60);
        display.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    private _updateStatus(pos: { altitude: number; isAboveHorizon: boolean; intensity: number }): void {
        if (!this._statusRow) return;
        const altDeg = (pos.altitude * 180 / Math.PI).toFixed(1);
        const icon   = pos.isAboveHorizon ? '☀' : '🌙';
        this._statusRow.textContent = `${icon}  Altitude: ${altDeg}°   Intensity: ${pos.intensity.toFixed(2)}`;
    }

    // ── Build DOM ──────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'rsc-panel';
        el.style.display = 'none'; // hidden until show()

        el.innerHTML = `
            <div class="rsc-header">
                <span class="rsc-title">☀ Real Sun</span>
                <button class="rsc-close" title="Close">✕</button>
            </div>

            <div class="rsc-body">

                <!-- Time of day -->
                <div class="rsc-row">
                    <label class="rsc-label">Time</label>
                    <span class="rsc-time-display">12:00</span>
                </div>
                <input
                    type="range"
                    class="rsc-slider"
                    id="rsc-time-slider"
                    min="0" max="24" step="0.25"
                    value="12"
                    title="Time of day (0–24 h)"
                />

                <!-- Location -->
                <div class="rsc-row rsc-row--gap">
                    <label class="rsc-label">Latitude</label>
                    <input
                        type="number"
                        class="rsc-num"
                        id="rsc-lat"
                        step="0.001"
                        min="-90" max="90"
                        placeholder="40.4168"
                        title="Latitude in decimal degrees"
                    />
                </div>
                <div class="rsc-row">
                    <label class="rsc-label">Longitude</label>
                    <input
                        type="number"
                        class="rsc-num"
                        id="rsc-lng"
                        step="0.001"
                        min="-180" max="180"
                        placeholder="-3.7038"
                        title="Longitude in decimal degrees"
                    />
                </div>

                <!-- Status -->
                <div class="rsc-status" id="rsc-status">☀  —</div>
            </div>
        `;

        // Store refs
        this._timeSlider = el.querySelector('#rsc-time-slider');
        this._latInput   = el.querySelector('#rsc-lat');
        this._lngInput   = el.querySelector('#rsc-lng');
        this._statusRow  = el.querySelector('#rsc-status');

        // ── Event wiring ───────────────────────────────────────────────────

        // Close button
        el.querySelector('.rsc-close')?.addEventListener('click', () => this.hide());

        // Time slider
        this._timeSlider?.addEventListener('input', () => {
            const hours = parseFloat(this._timeSlider!.value);
            this._updateTimeLabel(hours);

            const svc = getSunService();
            if (svc?.enabled) {
                svc.setTime(hours);
                const pos = svc.lastPosition;
                if (pos) this._updateStatus(pos);
            }
        });

        // Lat / Lng inputs — apply on blur or Enter
        const applyLocation = () => {
            const lat = parseFloat(this._latInput?.value ?? '40.4168');
            const lng = parseFloat(this._lngInput?.value ?? '-3.7038');
            if (isNaN(lat) || isNaN(lng)) return;

            const svc = getSunService();
            if (svc?.enabled) {
                svc.setLocation(lat, lng);
                const pos = svc.lastPosition;
                if (pos) this._updateStatus(pos);
            }
        };

        this._latInput?.addEventListener('blur',    applyLocation);
        this._lngInput?.addEventListener('blur',    applyLocation);
        this._latInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLocation(); });
        this._lngInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLocation(); });

        // Listen for sun position updates from the service (e.g. programmatic changes)
        window.addEventListener('rsc-sun-updated', (e: Event) => {
            const pos = (e as CustomEvent).detail;
            if (pos && this._visible) this._updateStatus(pos);
        });

        return el;
    }
}
