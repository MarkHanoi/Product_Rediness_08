/**
 * @file src/ui/rendering/PerformanceModePanel.ts
 *
 * Quick-access floating panel for render quality control during heavy IFC work.
 *
 * Provides:
 *  - "Performance Mode" master toggle: disables shadows, SSGI, TRAA, HDRI
 *  - Individual toggles for shadows, ambient occlusion (SSGI), anti-aliasing (TRAA)
 *  - "Restore Quality" returns to the user's last quality setting
 *
 * The panel is shown/hidden via the ⚡ button added to the viewport toolbar.
 * It reads/writes through the same coordinator and pipeline manager used by
 * VisualizationEnginePanel to stay in sync.
 */

import type { EnhancementLevel } from '@pryzm/core-app-model/rendering';

// ── Types ──────────────────────────────────────────────────────────────────

interface PerfPanelState {
    perfModeActive: boolean;
    shadowsEnabled: boolean;
    ssgiEnabled:    boolean;
    traaEnabled:    boolean;
    prevLevel:      EnhancementLevel;
}

// ── PerformanceModePanel ────────────────────────────────────────────────────

export class PerformanceModePanel {
    private _el:          HTMLElement;
    private _trigger:     HTMLElement;
    private _open         = false;
    private _autoEnabled  = false;
    private _state: PerfPanelState = {
        perfModeActive: false,
        shadowsEnabled: true,
        ssgiEnabled:    true,
        traaEnabled:    true,
        prevLevel:      'high',
    };

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._trigger = this._buildTrigger();
        this._el      = this._buildPanel();
        document.body.appendChild(this._trigger);
        document.body.appendChild(this._el);
        this._syncToggles();

        // Listen for external pipeline state changes (e.g. from VisualizationEnginePanel)
        window.addEventListener('ssgi-state-changed', (e: Event) => {
            const { active } = (e as CustomEvent<{ active: boolean }>).detail;
            this._state.ssgiEnabled = active;
            this._syncToggles();
        });
        window.addEventListener('traa-state-changed', (e: Event) => {
            const { active } = (e as CustomEvent<{ active: boolean }>).detail;
            this._state.traaEnabled = active;
            this._syncToggles();
        });
    }

    // ── Private — build DOM ──────────────────────────────────────────────────

    private _buildTrigger(): HTMLElement {
        const btn = document.createElement('button');
        btn.id = 'perf-mode-trigger';
        btn.title = 'Render Performance Settings';
        btn.innerHTML = '⚡';
        btn.style.cssText = [
            'position:fixed',
            'bottom:80px',
            'right:14px',
            'z-index:1200',
            'width:36px',
            'height:36px',
            'border-radius:8px',
            'border:1px solid rgba(255,255,255,0.12)',
            'background:rgba(18,24,38,0.92)',
            'color:#a0aec0',
            'font-size:16px',
            'cursor:pointer',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'backdrop-filter:blur(8px)',
            'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
            'transition:background 0.15s,color 0.15s,border-color 0.15s',
        ].join(';');

        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(30,40,60,0.98)';
            btn.style.color = '#fff';
        });
        btn.addEventListener('mouseleave', () => {
            if (!this._open) {
                btn.style.background = 'rgba(18,24,38,0.92)';
                btn.style.color = this._state.perfModeActive ? '#f6c90e' : '#a0aec0';
            }
        });
        btn.addEventListener('click', () => this._toggle());
        return btn;
    }

    private _buildPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'perf-mode-panel';
        panel.style.cssText = [
            'position:fixed',
            'bottom:122px',
            'right:14px',
            'z-index:1201',
            'width:240px',
            'background:rgba(14,20,34,0.97)',
            'border:1px solid rgba(255,255,255,0.1)',
            'border-radius:10px',
            'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
            'backdrop-filter:blur(12px)',
            'font-family:system-ui,-apple-system,sans-serif',
            'color:#c8d0e0',
            'font-size:12px',
            'display:none',
            'flex-direction:column',
            'overflow:hidden',
            'user-select:none',
        ].join(';');

        panel.innerHTML = `
            <div style="padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;">Render Settings</div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="font-size:12px;font-weight:600;color:#e2e8f0;">⚡ Performance Mode</span>
                    <label class="pmp-switch" style="position:relative;display:inline-block;width:34px;height:18px;flex-shrink:0;">
                        <input type="checkbox" id="pmp-perf-toggle" style="opacity:0;width:0;height:0;position:absolute;">
                        <span class="pmp-slider" style="position:absolute;cursor:pointer;inset:0;background:#2d3748;border-radius:18px;transition:background .2s;">
                            <span class="pmp-knob" style="position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#718096;border-radius:50%;transition:.2s;"></span>
                        </span>
                    </label>
                </div>
                <div id="pmp-perf-desc" style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:4px;line-height:1.4;">
                    Disables shadows, ambient occlusion, and anti-aliasing for faster navigation with heavy models.
                </div>
            </div>

            <div style="padding:8px 12px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:6px;">Individual Controls</div>

                <div class="pmp-row" style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
                    <div>
                        <div style="font-size:11px;font-weight:500;color:#c8d0e0;">Shadows</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.3);">Real-time shadow maps</div>
                    </div>
                    <label class="pmp-switch" style="position:relative;display:inline-block;width:34px;height:18px;flex-shrink:0;">
                        <input type="checkbox" id="pmp-shadows-toggle" checked style="opacity:0;width:0;height:0;position:absolute;">
                        <span class="pmp-slider" style="position:absolute;cursor:pointer;inset:0;background:#2d3748;border-radius:18px;transition:background .2s;">
                            <span class="pmp-knob" style="position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#718096;border-radius:50%;transition:.2s;"></span>
                        </span>
                    </label>
                </div>

                <div class="pmp-row" style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
                    <div>
                        <div style="font-size:11px;font-weight:500;color:#c8d0e0;">Ambient Occlusion</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.3);">SSGI / screen-space AO</div>
                    </div>
                    <label class="pmp-switch" style="position:relative;display:inline-block;width:34px;height:18px;flex-shrink:0;">
                        <input type="checkbox" id="pmp-ssgi-toggle" checked style="opacity:0;width:0;height:0;position:absolute;">
                        <span class="pmp-slider" style="position:absolute;cursor:pointer;inset:0;background:#2d3748;border-radius:18px;transition:background .2s;">
                            <span class="pmp-knob" style="position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#718096;border-radius:50%;transition:.2s;"></span>
                        </span>
                    </label>
                </div>

                <div class="pmp-row" style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
                    <div>
                        <div style="font-size:11px;font-weight:500;color:#c8d0e0;">Anti-aliasing (TRAA)</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.3);">Temporal smoothing</div>
                    </div>
                    <label class="pmp-switch" style="position:relative;display:inline-block;width:34px;height:18px;flex-shrink:0;">
                        <input type="checkbox" id="pmp-traa-toggle" checked style="opacity:0;width:0;height:0;position:absolute;">
                        <span class="pmp-slider" style="position:absolute;cursor:pointer;inset:0;background:#2d3748;border-radius:18px;transition:background .2s;">
                            <span class="pmp-knob" style="position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#718096;border-radius:50%;transition:.2s;"></span>
                        </span>
                    </label>
                </div>
            </div>

            <div style="padding:6px 12px 10px;border-top:1px solid rgba(255,255,255,0.07);">
                <button id="pmp-restore-btn" style="width:100%;padding:6px;border-radius:6px;border:1px solid rgba(102,0,255,0.4);background:rgba(102,0,255,0.12);color:#a78bfa;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s;">
                    Restore Full Quality
                </button>
            </div>

            <style>
                #pmp-perf-toggle:checked + .pmp-slider { background: #f6c90e !important; }
                #pmp-perf-toggle:checked + .pmp-slider .pmp-knob { transform: translateX(16px); background: #1a1a1a !important; }
                #pmp-shadows-toggle:checked + .pmp-slider,
                #pmp-ssgi-toggle:checked + .pmp-slider,
                #pmp-traa-toggle:checked + .pmp-slider { background: #6600FF !important; }
                #pmp-shadows-toggle:checked + .pmp-slider .pmp-knob,
                #pmp-ssgi-toggle:checked + .pmp-slider .pmp-knob,
                #pmp-traa-toggle:checked + .pmp-slider .pmp-knob { transform: translateX(16px); background: #fff !important; }
            </style>
        `;

        this._wireEvents(panel);
        return panel;
    }

    private _wireEvents(panel: HTMLElement): void {
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this._open && !panel.contains(e.target as Node) && e.target !== this._trigger) {
                this._hide();
            }
        }, { capture: true });

        // Performance Mode master toggle
        panel.querySelector('#pmp-perf-toggle')?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            if (checked) {
                this._enablePerfMode();
            } else {
                this._disablePerfMode();
            }
        });

        // Individual toggles
        panel.querySelector('#pmp-shadows-toggle')?.addEventListener('change', (e) => {
            this._setShadows((e.target as HTMLInputElement).checked);
        });
        panel.querySelector('#pmp-ssgi-toggle')?.addEventListener('change', (e) => {
            this._setSsgi((e.target as HTMLInputElement).checked);
        });
        panel.querySelector('#pmp-traa-toggle')?.addEventListener('change', (e) => {
            this._setTraa((e.target as HTMLInputElement).checked);
        });

        // Restore button
        panel.querySelector('#pmp-restore-btn')?.addEventListener('click', () => {
            this._restoreQuality();
        });

        // Hover on restore button
        const restoreBtn = panel.querySelector('#pmp-restore-btn') as HTMLElement | null;
        restoreBtn?.addEventListener('mouseenter', () => {
            restoreBtn.style.background = 'rgba(102,0,255,0.25)';
        });
        restoreBtn?.addEventListener('mouseleave', () => {
            restoreBtn.style.background = 'rgba(102,0,255,0.12)';
        });
    }

    // ── Private — actions ────────────────────────────────────────────────────

    private _enablePerfMode(): void {
        const coordinator = window.renderingPipelineCoordinator; // TODO(D.4): legacy renderingPipelineCoordinator — replace with runtime.scene.renderer.pipeline coordinator
        if (coordinator && typeof coordinator.currentLevel === 'string') {
            this._state.prevLevel = coordinator.currentLevel as EnhancementLevel;
        }
        this._state.perfModeActive = true;
        this._setShadows(false);
        this._setSsgi(false);
        this._setTraa(false);
        this._syncToggles();
        this._triggerPerfIndicator(true);
        console.log('[PerformanceModePanel] Performance mode ON — shadows/SSGI/TRAA disabled');
    }

    private _disablePerfMode(): void {
        this._state.perfModeActive = false;
        this._setShadows(true);
        this._setSsgi(true);
        this._setTraa(true);
        this._syncToggles();
        this._triggerPerfIndicator(false);
        console.log('[PerformanceModePanel] Performance mode OFF — restoring quality');
    }

    private _restoreQuality(): void {
        const coordinator = window.renderingPipelineCoordinator; // TODO(D.4): legacy renderingPipelineCoordinator — replace with runtime.scene.renderer.pipeline coordinator
        if (coordinator && typeof coordinator.activateRealtimeEnhancements === 'function') {
            const target: EnhancementLevel = this._state.prevLevel || 'high';
            coordinator.activateRealtimeEnhancements(target).catch(() => {});
            console.log(`[PerformanceModePanel] Restored quality level: ${target}`);
        }
        this._disablePerfMode();
    }

    // ── Public — programmatic auto-control (IFC loading etc.) ────────────────

    /**
     * Enable performance mode automatically (e.g. during IFC import).
     * Tracks that it was auto-activated so autoDisablePerf() can safely
     * restore quality without overriding a manual user activation.
     * If the user already had perf mode on, we still note the auto flag but
     * skip the duplicate enable call.
     */
    autoEnablePerf(): void {
        this._autoEnabled = true;
        if (!this._state.perfModeActive) {
            this._enablePerfMode();
            this._showLoadingBadge(true);
        }
        console.log('[PerformanceModePanel] Auto-performance mode ON (IFC load in progress)');
    }

    /**
     * Disable performance mode when auto-activated. Only restores quality if
     * the panel was auto-enabled — if the user had manually turned it on this
     * is a no-op so their choice is respected.
     */
    autoDisablePerf(): void {
        if (!this._autoEnabled) return;
        this._autoEnabled = false;
        this._disablePerfMode();
        this._showLoadingBadge(false);
        console.log('[PerformanceModePanel] Auto-performance mode OFF (IFC load complete)');
    }

    private _showLoadingBadge(visible: boolean): void {
        const existing = document.getElementById('perf-mode-loading-badge');
        if (visible) {
            if (existing) return;
            const badge = document.createElement('div');
            badge.id = 'perf-mode-loading-badge';
            badge.style.cssText = [
                'position:fixed',
                'bottom:122px',
                'right:56px',
                'z-index:1199',
                'background:rgba(246,201,14,0.13)',
                'border:1px solid rgba(246,201,14,0.35)',
                'border-radius:6px',
                'padding:4px 8px',
                'font-family:system-ui,-apple-system,sans-serif',
                'font-size:10px',
                'font-weight:600',
                'color:#f6c90e',
                'pointer-events:none',
                'letter-spacing:.04em',
                'white-space:nowrap',
            ].join(';');
            badge.textContent = '⚡ PERF MODE — loading model';
            document.body.appendChild(badge);
        } else {
            existing?.remove();
        }
    }

    private _setShadows(enabled: boolean): void {
        // Toggle shadow maps on the WebGPU/WebGL renderer
        const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
        const coordinator = window.renderingPipelineCoordinator; // TODO(D.4): legacy renderingPipelineCoordinator — replace with runtime.scene.renderer.pipeline coordinator

        // Access renderer via OBC world (most reliable path)
        const world = window.world ?? window.obcWorld; // TODO(D.4): legacy obcWorld — replace with runtime.scene.world (ThatOpen)
        const renderer = world?.renderer?.three ?? world?.renderer;
        if (renderer?.shadowMap) {
            renderer.shadowMap.enabled = enabled;
            if (!enabled) renderer.shadowMap.needsUpdate = false;
        }

        // Also toggle via coordinator if available
        if (!enabled && coordinator) {
            coordinator.shadowUpgrader?.restore?.();
        } else if (enabled && coordinator && coordinator._scene && coordinator._renderer) {
            coordinator.shadowUpgrader?.setLevel?.(coordinator.currentLevel === 'ultra' ? 'ultra' : 'standard');
        }

        this._state.shadowsEnabled = enabled;
        // Rebuild pipeline to reflect shadow change
        if (rpm && typeof rpm.scheduleShadowRebuild === 'function') {
            rpm.scheduleShadowRebuild();
        }
    }

    private _setSsgi(enabled: boolean): void {
        const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
        if (!rpm) {
            this._state.ssgiEnabled = enabled;
            return;
        }
        if (enabled) {
            if (typeof rpm.enableSsgi === 'function') rpm.enableSsgi();
            else if (typeof rpm.scheduleShadowRebuild === 'function') rpm.scheduleShadowRebuild();
        } else {
            if (typeof rpm.disableSsgi === 'function') rpm.disableSsgi();
            else if (typeof rpm._fullRebuild === 'function') rpm._fullRebuild?.({ ssgi: false, traa: this._state.traaEnabled, outlines: true });
        }
        this._state.ssgiEnabled = enabled;
    }

    private _setTraa(enabled: boolean): void {
        const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
        if (!rpm) {
            this._state.traaEnabled = enabled;
            return;
        }
        if (enabled) {
            if (typeof rpm.enableTraa === 'function') rpm.enableTraa();
        } else {
            if (typeof rpm.disableTraa === 'function') rpm.disableTraa();
        }
        this._state.traaEnabled = enabled;
    }

    private _triggerPerfIndicator(active: boolean): void {
        this._trigger.style.color = active ? '#f6c90e' : '#a0aec0';
        this._trigger.title = active ? 'Performance Mode Active — click to adjust' : 'Render Performance Settings';
    }

    // ── Private — UI state ───────────────────────────────────────────────────

    private _syncToggles(): void {
        const perfToggle = this._el.querySelector<HTMLInputElement>('#pmp-perf-toggle');
        const shadowToggle = this._el.querySelector<HTMLInputElement>('#pmp-shadows-toggle');
        const ssgiToggle = this._el.querySelector<HTMLInputElement>('#pmp-ssgi-toggle');
        const traaToggle = this._el.querySelector<HTMLInputElement>('#pmp-traa-toggle');

        if (perfToggle)   perfToggle.checked   = this._state.perfModeActive;
        if (shadowToggle) shadowToggle.checked  = this._state.shadowsEnabled;
        if (ssgiToggle)   ssgiToggle.checked    = this._state.ssgiEnabled;
        if (traaToggle)   traaToggle.checked    = this._state.traaEnabled;

        this._triggerPerfIndicator(this._state.perfModeActive);
    }

    private _toggle(): void {
        if (this._open) this._hide(); else this._show();
    }

    private _show(): void {
        this._open = true;
        this._el.style.display = 'flex';
        this._trigger.style.background = 'rgba(30,40,60,0.98)';
        this._trigger.style.borderColor = 'rgba(102,0,255,0.5)';
    }

    private _hide(): void {
        this._open = false;
        this._el.style.display = 'none';
        this._trigger.style.background = 'rgba(18,24,38,0.92)';
        this._trigger.style.borderColor = 'rgba(255,255,255,0.12)';
    }
}

// ── Mount helper ─────────────────────────────────────────────────────────────

let _perfPanel: PerformanceModePanel | null = null;

export function mountPerformanceModePanel(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountPerformanceModePanel */): PerformanceModePanel {
    void runtime; /* B-runtime-void mountPerformanceModePanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    if (!_perfPanel) {
        _perfPanel = new PerformanceModePanel();
    }
    // Expose globally so IFC import subsystem can call autoEnablePerf/autoDisablePerf
    // without creating a circular import between initUI.ts and this module.
    window.performanceModePanel = _perfPanel; // TODO(F.6.5): legacy performanceModePanel — replace with runtime.panelHost.get('performanceMode')
    return _perfPanel;
}
