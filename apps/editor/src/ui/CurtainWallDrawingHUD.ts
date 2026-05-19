/**
 * CurtainWallDrawingHUD — persistent mini bar shown while curtain wall tool is active.
 *
 * Displays the current drawing mode (L / O / C / S) as highlighted buttons and
 * listens for keyboard shortcuts so the user can switch modes mid-polyline.
 * Dismissed automatically when the curtain wall tool deactivates (ESC or finish).
 *
 * Mirrors WallDrawingHUD exactly — same visual pattern, same keyboard behaviour.
 *
 * CONTRACT:
 *   §05 §7.8 — native HTML only, no bim-* elements
 *   §05 §2.1 — CSS via AppTheme.ts, cwdh- prefix (reuses wdh- base styles)
 *   §05 §7.1 — no direct store mutations; mode switch delegated via callback
 *   §26       — plan-view parity: CurtainWallPlanToolHandler reads curtainWallModePicker
 *               which is synced by Layout.ts via setActiveMode() on every HUD switch
 */

import type { CurtainWallPickerMode } from './CurtainWallModePicker';

export interface CurtainWallDrawingHUDCallbacks {
    onSwitchLinear:   () => void;
    onSwitchOrtho:    () => void;
    onSwitchCurved:   () => void;
    onSelectBySlab?:  () => void;
}

const CW_MODE_KEY_MAP: Record<string, CurtainWallPickerMode> = {
    'l': 'linear',
    'o': 'ortho',
    'c': 'curved',
    's': 'byslab',
};

export class CurtainWallDrawingHUD {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el:         HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private callbacks:  CurtainWallDrawingHUDCallbacks | null = null;

    show(initialMode: CurtainWallPickerMode, callbacks: CurtainWallDrawingHUDCallbacks): void {
        this.dismiss();
        this.callbacks = callbacks;

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-cwdh', '1');

        // ── Mode indicator label ──
        const modeLbl = document.createElement('span');
        modeLbl.className = 'wdh-mode-lbl';
        modeLbl.textContent = 'Mode:';
        bar.appendChild(modeLbl);

        // ── L / O / C mode buttons ──
        const modeBtns: Array<{ key: string; label: string; modeId: CurtainWallPickerMode; action: () => void }> = [
            { key: 'L', label: 'Linear',     modeId: 'linear',  action: callbacks.onSwitchLinear },
            { key: 'O', label: 'Orthogonal', modeId: 'ortho',   action: callbacks.onSwitchOrtho  },
            { key: 'C', label: 'Curved',     modeId: 'curved',  action: callbacks.onSwitchCurved },
        ];

        for (const b of modeBtns) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (b.modeId === initialMode ? ' wdh-btn--active' : '');
            btn.dataset.mode = b.modeId;
            btn.innerHTML = `<span class="wdh-key">${b.key}</span><span class="wdh-lbl">${b.label}</span>`;
            btn.title = `Switch to ${b.label} mode (${b.key})`;
            btn.addEventListener('click', () => {
                this._setActive(b.modeId);
                b.action();
            });
            bar.appendChild(btn);
        }

        // ── By Slab (S) — separator then action button ──
        if (callbacks.onSelectBySlab) {
            const sep = document.createElement('span');
            sep.className = 'wdh-sep';
            bar.appendChild(sep);

            const slabBtn = document.createElement('button');
            slabBtn.className = 'wdh-btn wdh-btn--slab';
            slabBtn.dataset.mode = 'byslab';
            slabBtn.innerHTML = `<span class="wdh-key">S</span><span class="wdh-lbl">By Slab</span>`;
            slabBtn.title = 'Create curtain walls from selected slab (S)';
            slabBtn.addEventListener('click', () => {
                callbacks.onSelectBySlab!();
            });
            bar.appendChild(slabBtn);
        }

        // ── ESC hint ──
        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to finish';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this.el = bar;

        // ── Keyboard shortcut handler ──
        this.keyHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

            const key = e.key.toLowerCase();

            if (key === 's' && this.callbacks?.onSelectBySlab) {
                e.stopImmediatePropagation();
                this._setActive('byslab');
                this.callbacks.onSelectBySlab();
                return;
            }

            const modeId = CW_MODE_KEY_MAP[key];
            if (!modeId || modeId === 'byslab') return;

            e.stopImmediatePropagation();
            this._setActive(modeId);

            if (modeId === 'linear') {
                this.callbacks?.onSwitchLinear();
            } else if (modeId === 'ortho') {
                this.callbacks?.onSwitchOrtho();
            } else if (modeId === 'curved') {
                this.callbacks?.onSwitchCurved();
            }
        };
        // Use bubbling so it fires AFTER CurtainWallTool's capture-phase handlers
        window.addEventListener('keydown', this.keyHandler);
    }

    /** Update the highlighted active mode button without rebuilding the HUD. */
    setMode(mode: CurtainWallPickerMode): void {
        if (!this.el) return;
        this._setActive(mode);
    }

    dismiss(): void {
        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
        this.callbacks = null;
    }

    isVisible(): boolean { return this.el !== null; }

    private _setActive(mode: CurtainWallPickerMode): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            if (btn.dataset.mode === 'byslab') return;
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === mode);
        });
    }
}
