/**
 * AmbientIndicator — Phase K-3
 *
 * Phase:   K-3 (World Model Plan V3 — Ambient Intelligence System)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §K-3
 *
 * A single dismissable observation line at the bottom of the canvas.
 *
 * Rules (non-negotiable):
 *   - NEVER stacks multiple observations — replaces the current one
 *   - Auto-dismisses after 8 seconds if no user action
 *   - "Suggest fix" button navigates to / highlights the elementId if provided
 *   - Dismissal is reported back to AmbientIntelligence to prevent repetition
 *
 * Visual:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ [ⓘ]  Observation text…        [Suggest fix]  [×]     │
 *   └────────────────────────────────────────────────────────┘
 */

import { ambientIntelligence, type AmbientObservation } from '@pryzm/ai-host';

const PANEL_ID    = 'ambient-indicator';
const AUTO_DISMISS_MS = 8_000;

// ── Colours per severity ───────────────────────────────────────────────────────
const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string; iconColor: string }> = {
    info:    { bg: 'rgba(15,23,42,0.92)',   border: '#3B82F6', icon: 'ⓘ',  iconColor: '#60A5FA' },
    warning: { bg: 'rgba(28,16,4,0.92)',    border: '#D97706', icon: '⚠',  iconColor: '#FCD34D' },
    error:   { bg: 'rgba(28,4,4,0.92)',     border: '#DC2626', icon: '⊗',  iconColor: '#F87171' },
};

function getStyle(severity: string) {
    return SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;
}

// ── Build DOM panel ───────────────────────────────────────────────────────────
function buildOrGetPanel(): HTMLElement {
    let el = document.getElementById(PANEL_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = PANEL_ID;
    el.style.cssText = [
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);',
        'z-index:8500;display:flex;align-items:center;gap:12px;',
        'padding:11px 16px;border-radius:10px;',
        'font-family:var(--app-font,-apple-system,sans-serif);',
        'font-size:13px;line-height:1.4;',
        'box-shadow:0 8px 24px rgba(0,0,0,0.45);',
        'max-width:min(680px, 90vw);',
        'transition:opacity 0.2s,transform 0.2s;',
        'pointer-events:auto;',
        'display:none;',
    ].join('');
    document.body.appendChild(el);
    return el;
}

// ── AmbientIndicator ──────────────────────────────────────────────────────────

export class AmbientIndicator {
    private _el: HTMLElement;
    private _dismissTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentObs: AmbientObservation | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = buildOrGetPanel();
        this._subscribe();
        console.log('[AmbientIndicator] Initialised');
    }

    show(obs: AmbientObservation): void {
        this._cancelTimer();
        this._currentObs = obs;
        this._render(obs);
        this._el.style.display = 'flex';
        this._el.style.opacity = '1';

        // Auto-dismiss after 8 seconds
        this._dismissTimer = setTimeout(() => this._dismiss(false), AUTO_DISMISS_MS);
    }

    private _render(obs: AmbientObservation): void {
        const sty = getStyle(obs.severity);
        this._el.style.background   = sty.bg;
        this._el.style.border       = `1.5px solid ${sty.border}`;

        this._el.innerHTML = '';

        // Icon
        const icon = document.createElement('span');
        icon.textContent = sty.icon;
        icon.style.cssText = `font-size:16px;color:${sty.iconColor};flex-shrink:0;`;
        this._el.appendChild(icon);

        // Text
        const text = document.createElement('span');
        text.textContent = obs.text;
        text.style.cssText = 'color:#e2e8f0;flex:1;';
        this._el.appendChild(text);

        // "Suggest fix" — only when elementId is present
        if (obs.elementId) {
            const fixBtn = document.createElement('button');
            fixBtn.textContent = 'Suggest fix';
            fixBtn.style.cssText = [
                'padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);',
                'background:rgba(255,255,255,0.08);color:#93c5fd;font-size:12px;',
                'cursor:pointer;white-space:nowrap;flex-shrink:0;',
                'font-family:var(--app-font,-apple-system,sans-serif);',
            ].join('');
            fixBtn.addEventListener('click', () => {
                if (obs.elementId) {
                    // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
                    window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: obs.elementId, nodeType: 'room' });
                    window.runtime?.events?.emit('pryzm-navigate-to', { elementId: obs.elementId }); // F.events.16
                }
                this._dismiss(true);
            });
            this._el.appendChild(fixBtn);
        }

        // Dismiss ×
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.title = 'Dismiss';
        closeBtn.style.cssText = [
            'padding:2px 7px;border-radius:5px;border:1px solid rgba(255,255,255,0.1);',
            'background:transparent;color:#94a3b8;font-size:16px;line-height:1;',
            'cursor:pointer;flex-shrink:0;',
        ].join('');
        closeBtn.addEventListener('click', () => this._dismiss(true));
        this._el.appendChild(closeBtn);
    }

    private _dismiss(userInitiated: boolean): void {
        this._cancelTimer();
        this._el.style.opacity = '0';
        setTimeout(() => {
            this._el.style.display = 'none';
        }, 200);

        // Tell AmbientIntelligence so it won't repeat this observation for 60s
        if (userInitiated && this._currentObs) {
            ambientIntelligence.recordDismissal(this._currentObs.text);
        }
        this._currentObs = null;
    }

    private _cancelTimer(): void {
        if (this._dismissTimer) {
            clearTimeout(this._dismissTimer);
            this._dismissTimer = null;
        }
    }

    private _subscribe(): void {
        ambientIntelligence.subscribe(obs => this.show(obs));
    }
}
