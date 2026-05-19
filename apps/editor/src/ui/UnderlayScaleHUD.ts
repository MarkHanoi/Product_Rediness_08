/**
 * UnderlayScaleHUD — persistent mini bar shown while the underlay reference
 * scale tool is active. Lets the user toggle Linear vs Orthogonal pick mode
 * (default Orthogonal) — mirrors the WallDrawingHUD pattern so users get
 * the same affordance they already know from wall drawing.
 *
 * In Orthogonal mode the tool snaps the second pick to the horizontal/vertical
 * axis through Point 1 when the cursor is close to it. In Linear mode no
 * ortho snapping is applied, so the user can scale along any free direction.
 *
 * Reuses the existing wdh- CSS so the look matches the wall HUD exactly.
 */

export type UnderlayScaleMode = 'linear' | 'orthogonal';

export interface UnderlayScaleHUDCallbacks {
    onSwitchLinear: () => void;
    onSwitchOrtho:  () => void;
}

export class UnderlayScaleHUD {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private callbacks: UnderlayScaleHUDCallbacks | null = null;

    show(initialMode: UnderlayScaleMode, callbacks: UnderlayScaleHUDCallbacks): void {
        this.dismiss();
        this.callbacks = callbacks;

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-wdh', '1');
        bar.setAttribute('data-scale-hud', '1');

        const modeLbl = document.createElement('span');
        modeLbl.className = 'wdh-mode-lbl';
        modeLbl.textContent = 'Mode:';
        bar.appendChild(modeLbl);

        const modeBtns: Array<{ key: string; label: string; mode: UnderlayScaleMode; action: () => void }> = [
            { key: 'L', label: 'Linear',     mode: 'linear',     action: callbacks.onSwitchLinear },
            { key: 'O', label: 'Orthogonal', mode: 'orthogonal', action: callbacks.onSwitchOrtho  },
        ];

        for (const b of modeBtns) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (b.mode === initialMode ? ' wdh-btn--active' : '');
            btn.dataset.mode = b.mode;
            btn.innerHTML = `<span class="wdh-key">${b.key}</span><span class="wdh-lbl">${b.label}</span>`;
            btn.title = `Switch to ${b.label} pick mode (${b.key})`;
            btn.addEventListener('click', () => {
                this._setActive(b.mode);
                b.action();
            });
            bar.appendChild(btn);
        }

        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to cancel';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this.el = bar;

        this.keyHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

            const key = e.key.toLowerCase();
            if (key === 'l') {
                e.stopImmediatePropagation();
                this._setActive('linear');
                this.callbacks?.onSwitchLinear();
            } else if (key === 'o') {
                e.stopImmediatePropagation();
                this._setActive('orthogonal');
                this.callbacks?.onSwitchOrtho();
            }
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    setMode(mode: UnderlayScaleMode): void {
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

    /**
     * Sprint AH — Install a global singleton that bridges DOM CustomEvents
     * from @pryzm/input-host tools (which cannot import from src/ui/).
     * Call once at app init (initTools.ts).
     *
     * Events: 'pryzm:underlay-hud:show' → { mode, callbacks }
     *         'pryzm:underlay-hud:dismiss'
     */
    static installGlobal(): void {
        const hud = new UnderlayScaleHUD();
        window.addEventListener('pryzm:underlay-hud:show', (e: Event) => {
            const { mode, callbacks } = (e as CustomEvent).detail as {
                mode: UnderlayScaleMode;
                callbacks: UnderlayScaleHUDCallbacks;
            };
            hud.show(mode, callbacks);
        });
        window.addEventListener('pryzm:underlay-hud:dismiss', () => {
            hud.dismiss();
        });
    }

    private _setActive(mode: UnderlayScaleMode): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === mode);
        });
    }
}
