/**
 * GridDrawingHUD — persistent mini bar shown while the grid tool is active.
 *
 * §40 §2 — Mode toggle: ORTHOGONAL (default) / LINEAR. Mirrors WallDrawingHUD
 * so users get the same visual language across drawing tools (see attached
 * mock screenshot).
 *
 * §40 §3.4 — Also exposes a "Pin next grid" toggle so freshly-placed grids
 * can be created already pinned in one motion.
 *
 * CONTRACT:
 *   §05 §7.8 — native HTML only, no bim-* elements
 *   §05 §2.1 — CSS via existing `wdh-*` classes (shared with WallDrawingHUD)
 *   §05 §7.1 — no direct store mutations; all state held in GridModePicker
 */

import { GridDrawingMode, gridModePicker } from './GridModePicker';

export interface GridDrawingHUDCallbacks {
    onSwitchOrthogonal: () => void;
    onSwitchLinear:     () => void;
    onTogglePinNext?:   (pinNext: boolean) => void;
}

const MODE_KEY_MAP: Record<string, GridDrawingMode> = {
    'l': 'linear',
    'o': 'orthogonal',
};

export class GridDrawingHUD {
    /**
     * Phase B.15-GD (S73-WIRE) — runtime threaded by the boot path.
     *
     * GridDrawingHUD is exported as a module-load singleton (`gridDrawingHUD`
     * at the bottom of this file) consumed by `GridPlanToolHandler`, so the
     * composed `PryzmRuntime` cannot be passed through the constructor (the
     * singleton is built at module-load time, before `composeRuntime()` runs).
     * Mirroring the B.13-UP `UiPreferences` pattern, the runtime is therefore
     * injected lazily via {@link wireRuntime} from `src/main.ts` immediately
     * after the runtime is composed. The constructor still accepts an optional
     * `runtime` arg so the type is symmetric with the rest of the §II.B.0
     * Variant B family and so non-singleton consumers can DI it directly.
     */
    private _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
    public get runtime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null { return this._runtime; }
    public wireRuntime(rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void { this._runtime = rt; }
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this._runtime = runtime; }

    private el:         HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private callbacks:  GridDrawingHUDCallbacks | null = null;
    private pinNext:    boolean = false;

    show(callbacks: GridDrawingHUDCallbacks): void {
        this.dismiss();
        this.callbacks = callbacks;

        const initialMode = gridModePicker.getMode();

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-wdh', '1');
        bar.setAttribute('data-tool', 'grid');

        // ── Mode label ──
        const modeLbl = document.createElement('span');
        modeLbl.className = 'wdh-mode-lbl';
        modeLbl.textContent = 'MODE:';
        bar.appendChild(modeLbl);

        // ── L / O mode buttons ──
        const modeBtns: Array<{ key: string; label: string; mode: GridDrawingMode; action: () => void }> = [
            { key: 'L', label: 'Linear',     mode: 'linear',     action: callbacks.onSwitchLinear     },
            { key: 'O', label: 'Orthogonal', mode: 'orthogonal', action: callbacks.onSwitchOrthogonal },
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

        // ── Separator + Pin-next toggle ──
        if (callbacks.onTogglePinNext) {
            const sep = document.createElement('span');
            sep.className = 'wdh-sep';
            bar.appendChild(sep);

            const pinBtn = document.createElement('button');
            pinBtn.className = 'wdh-btn';
            pinBtn.dataset.mode = 'pinNext';
            pinBtn.innerHTML = `<span class="wdh-key">P</span><span class="wdh-lbl">Pin next</span>`;
            pinBtn.title = 'Create next grid already pinned (P)';
            pinBtn.addEventListener('click', () => {
                this._togglePinNext();
            });
            bar.appendChild(pinBtn);
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

            if (key === 'p' && this.callbacks?.onTogglePinNext) {
                e.stopImmediatePropagation();
                this._togglePinNext();
                return;
            }

            const mode = MODE_KEY_MAP[key];
            if (!mode) return;

            e.stopImmediatePropagation();
            this._setActive(mode);
            if (mode === 'orthogonal') this.callbacks?.onSwitchOrthogonal();
            else                       this.callbacks?.onSwitchLinear();
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    setMode(mode: GridDrawingMode): void {
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
        this.pinNext = false;
    }

    isVisible(): boolean { return this.el !== null; }

    isPinNextEnabled(): boolean { return this.pinNext; }

    private _setActive(mode: GridDrawingMode): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            if (btn.dataset.mode === 'pinNext') return;
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === mode);
        });
    }

    private _togglePinNext(): void {
        if (!this.el || !this.callbacks?.onTogglePinNext) return;
        this.pinNext = !this.pinNext;
        const btn = this.el.querySelector<HTMLButtonElement>('.wdh-btn[data-mode="pinNext"]');
        if (btn) btn.classList.toggle('wdh-btn--active', this.pinNext);
        this.callbacks.onTogglePinNext(this.pinNext);
    }
}

/** Singleton — one HUD instance shared across grid tool activations. */
export const gridDrawingHUD = new GridDrawingHUD();
