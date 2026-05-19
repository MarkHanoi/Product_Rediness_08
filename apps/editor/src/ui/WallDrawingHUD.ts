/**
 * WallDrawingHUD — persistent mini bar shown while wall tool is active.
 *
 * Displays the current drawing mode (L / O / C / S) as highlighted buttons and
 * listens for keyboard shortcuts so the user can switch modes mid-polyline.
 * Dismissed automatically when the wall tool deactivates (ESC or finish).
 *
 * CONTRACT:
 *   §05 §7.8 — native HTML only, no bim-* elements
 *   §05 §2.1 — CSS via AppTheme.ts, wdh- prefix
 *   §05 §7.1 — no direct store mutations; mode switch delegated via callback
 */

import { WallDrawingMode } from '@pryzm/geometry-wall';

export interface WallDrawingHUDCallbacks {
    onSwitchLinear:   () => void;
    onSwitchOrtho:    () => void;
    onSwitchCurved:   () => void;
    onSelectBySlab?:  () => void;
}

const MODE_KEY_MAP: Record<string, WallDrawingMode> = {
    'l': WallDrawingMode.POLYLINE,
    'o': WallDrawingMode.POLYLINE_ORTHO,
    'c': WallDrawingMode.POLYLINE_ARC,
};

export class WallDrawingHUD {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el:         HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private callbacks:  WallDrawingHUDCallbacks | null = null;

    show(initialMode: WallDrawingMode, callbacks: WallDrawingHUDCallbacks): void {
        this.dismiss();
        this.callbacks = callbacks;

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-wdh', '1');

        // ── Mode indicator label ──
        const modeLbl = document.createElement('span');
        modeLbl.className = 'wdh-mode-lbl';
        modeLbl.textContent = 'Mode:';
        bar.appendChild(modeLbl);

        // ── L / O / C mode buttons ──
        const modeBtns: Array<{ key: string; label: string; mode: WallDrawingMode; action: () => void }> = [
            { key: 'L', label: 'Linear',     mode: WallDrawingMode.POLYLINE,       action: callbacks.onSwitchLinear },
            { key: 'O', label: 'Orthogonal', mode: WallDrawingMode.POLYLINE_ORTHO, action: callbacks.onSwitchOrtho  },
            { key: 'C', label: 'Curved',     mode: WallDrawingMode.POLYLINE_ARC,   action: callbacks.onSwitchCurved },
        ];

        for (const b of modeBtns) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (b.mode === initialMode ? ' wdh-btn--active' : '');
            btn.dataset.mode = b.mode;
            btn.innerHTML = `<span class="wdh-key">${b.key}</span><span class="wdh-lbl">${b.label}</span>`;
            btn.title = `Switch to ${b.label} mode (${b.key})`;
            btn.addEventListener('click', () => {
                this._setActive(b.mode);
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
            slabBtn.dataset.mode = 'bySlab';
            slabBtn.innerHTML = `<span class="wdh-key">S</span><span class="wdh-lbl">By Slab</span>`;
            slabBtn.title = 'Create walls from selected slab (S)';
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

            // S → By Slab
            if (key === 's' && this.callbacks?.onSelectBySlab) {
                e.stopImmediatePropagation();
                this.callbacks.onSelectBySlab();
                return;
            }

            const action = MODE_KEY_MAP[key];
            if (!action) return;

            e.stopImmediatePropagation();

            if (action === WallDrawingMode.POLYLINE) {
                this._setActive(WallDrawingMode.POLYLINE);
                this.callbacks?.onSwitchLinear();
            } else if (action === WallDrawingMode.POLYLINE_ORTHO) {
                this._setActive(WallDrawingMode.POLYLINE_ORTHO);
                this.callbacks?.onSwitchOrtho();
            } else if (action === WallDrawingMode.POLYLINE_ARC) {
                this._setActive(WallDrawingMode.POLYLINE_ARC);
                this.callbacks?.onSwitchCurved();
            }
        };
        // Use bubbling so it fires AFTER WallTool's capture-phase handlers
        window.addEventListener('keydown', this.keyHandler);
    }

    /** Update the highlighted active mode button without rebuilding the HUD. */
    setMode(mode: WallDrawingMode): void {
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

    private _setActive(mode: WallDrawingMode): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            // By-Slab button never gets the active state — it's an action, not a mode
            if (btn.dataset.mode === 'bySlab') return;
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === mode);
        });
    }
}
