/**
 * CeilingDrawingHUD — persistent mini bar shown while ceiling tool is active.
 *
 * Mirrors the WallDrawingHUD / FloorDrawingHUD pattern.
 *
 * Contract: docs/00_Contracts/49-FLOOR-CEILING-DRAWING-MODE-PARITY-CONTRACT.md
 *           docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §2.1, §7.1, §7.8
 *
 * Reuses .wdh-* CSS classes (visual parity with WallDrawingHUD).
 */

import type { CeilingPickerMode } from './CeilingModePicker';

export interface CeilingDrawingHUDCallbacks {
    onSwitchLinear:    () => void;
    onSwitchOrtho:     () => void;
    onSwitchCurved:    () => void;
    onSwitchRectangle: () => void;
    onSwitchAuto:      () => void;
}

const KEY_MAP: Record<string, CeilingPickerMode> = {
    l: 'linear', o: 'ortho', c: 'curved', r: 'rectangle', a: 'auto',
};

export class CeilingDrawingHUD {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el:         HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private callbacks:  CeilingDrawingHUDCallbacks | null = null;

    show(initialMode: CeilingPickerMode, callbacks: CeilingDrawingHUDCallbacks): void {
        this.dismiss();
        this.callbacks = callbacks;

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-cdh', '1');

        const modeLbl = document.createElement('span');
        modeLbl.className = 'wdh-mode-lbl';
        modeLbl.textContent = 'Ceiling:';
        bar.appendChild(modeLbl);

        const modeBtns: Array<{ key: string; label: string; mode: CeilingPickerMode; action: () => void }> = [
            { key: 'L', label: 'Linear',     mode: 'linear',    action: callbacks.onSwitchLinear    },
            { key: 'O', label: 'Orthogonal', mode: 'ortho',     action: callbacks.onSwitchOrtho     },
            { key: 'C', label: 'Curved',     mode: 'curved',    action: callbacks.onSwitchCurved    },
            { key: 'R', label: 'Rectangle',  mode: 'rectangle', action: callbacks.onSwitchRectangle },
            { key: 'A', label: 'Auto',       mode: 'auto',      action: callbacks.onSwitchAuto      },
        ];

        for (const b of modeBtns) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (b.mode === initialMode ? ' wdh-btn--active' : '');
            btn.dataset.mode = b.mode;
            btn.innerHTML = `<span class="wdh-key">${b.key}</span><span class="wdh-lbl">${b.label}</span>`;
            btn.title = `Switch to ${b.label} (${b.key})`;
            btn.addEventListener('click', () => {
                this._setActive(b.mode);
                b.action();
            });
            bar.appendChild(btn);
        }

        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to finish';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this.el = bar;

        this.keyHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
            const key = e.key.toLowerCase();
            const mode = KEY_MAP[key];
            if (!mode) return;
            e.stopImmediatePropagation();
            this._setActive(mode);
            const c = this.callbacks; if (!c) return;
            if (mode === 'linear')    c.onSwitchLinear();
            if (mode === 'ortho')     c.onSwitchOrtho();
            if (mode === 'curved')    c.onSwitchCurved();
            if (mode === 'rectangle') c.onSwitchRectangle();
            if (mode === 'auto')      c.onSwitchAuto();
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    setMode(mode: CeilingPickerMode): void {
        if (!this.el) return;
        this._setActive(mode);
    }

    dismiss(): void {
        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
        if (this.el) { this.el.remove(); this.el = null; }
        this.callbacks = null;
    }

    isVisible(): boolean { return this.el !== null; }

    private _setActive(mode: CeilingPickerMode): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === mode);
        });
    }
}
