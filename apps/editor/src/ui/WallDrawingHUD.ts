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

import { setKeyLabelPills } from './hudPills.js';

export interface WallDrawingHUDCallbacks {
    onSwitchLinear:   () => void;
    onSwitchOrtho:    () => void;
    onSwitchCurved:   () => void;
    onSelectBySlab?:  () => void;
    /**
     * §FEAT-WALL-SHAPE-MODES — closed-loop RUN modes (a rectangular, circular or
     * elliptical room made of N walls). Optional so a host that has not wired them
     * shows no pills at all — C65 §3.9, no affordance without an implementation.
     */
    onSelectRectangular?: () => void;
    onSelectCircular?:    () => void;
    onSelectElliptical?:  () => void;
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
            setKeyLabelPills(btn, b.key, b.label);
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
            // Third copy of the same pill markup — the gate never flagged this one (its two
            // values are static literals), which is exactly why it is worth folding in: left
            // alone it is the template a future edit copies, and the copy WILL take a variable.
            setKeyLabelPills(slabBtn, 'S', 'By Slab');
            slabBtn.title = 'Create walls from selected slab (S)';
            slabBtn.addEventListener('click', () => {
                callbacks.onSelectBySlab!();
            });
            bar.appendChild(slabBtn);
        }

        // ── §FEAT-WALL-SHAPE-MODES — closed-loop RUN modes ──
        //
        // ⭐ MODES, NOT ACTIONS. Each is a two-click gesture on the canvas, so the user
        // must be able to SEE which one is armed while aiming. Rendering them as actions
        // (the way By Slab is rendered, since By Slab consumes a selection instantly)
        // would strip the active highlight and leave the bar reading 'Linear' while the
        // next click starts a circle — the UI naming an axis that did not change, which
        // is L-956's exact shape.
        const loopBtns: Array<{ key: string; label: string; id: string; cb?: () => void }> = [
            { key: 'Q', label: 'Rectangular', id: 'rectangular', cb: callbacks.onSelectRectangular },
            { key: 'I', label: 'Circular',    id: 'circular',    cb: callbacks.onSelectCircular    },
            { key: 'E', label: 'Elliptical',  id: 'elliptical',  cb: callbacks.onSelectElliptical  },
        ];
        if (loopBtns.some((b) => b.cb)) {
            const sep2 = document.createElement('span');
            sep2.className = 'wdh-sep';
            bar.appendChild(sep2);

            for (const b of loopBtns) {
                if (!b.cb) continue;
                const btn = document.createElement('button');
                btn.className = 'wdh-btn';
                btn.dataset.mode = b.id;
                setKeyLabelPills(btn, b.key, b.label);
                btn.title = `${b.label} closed wall run (${b.key})`;
                btn.addEventListener('click', () => {
                    this._setActiveLoop(b.id);
                    b.cb!();
                });
                bar.appendChild(btn);
            }
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

            // §FEAT-WALL-SHAPE-MODES — Q / I / E arm a closed-loop run.
            const loopKey: Record<string, 'rectangular' | 'circular' | 'elliptical'> = {
                q: 'rectangular', i: 'circular', e: 'elliptical',
            };
            const armed = loopKey[key];
            if (armed) {
                const cb = armed === 'rectangular' ? this.callbacks?.onSelectRectangular
                         : armed === 'circular'    ? this.callbacks?.onSelectCircular
                         :                           this.callbacks?.onSelectElliptical;
                if (cb) {
                    e.stopImmediatePropagation();
                    this._setActiveLoop(armed);
                    cb();
                    return;
                }
            }

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

    /**
     * §FEAT-WALL-SHAPE-MODES — highlight a loop pill. Separate from `_setActive`
     * because that one keys on the `WallDrawingMode` enum and these three modes have
     * no member in it: they live on the picker's string vocabulary, not the 3-D
     * tool's enum. Conflating them would need a fake enum member, and a fake member
     * is how a bar ends up claiming a mode the pipeline has no arm for.
     */
    private _setActiveLoop(id: string): void {
        if (!this.el) return;
        this.el.querySelectorAll('.wdh-btn').forEach((b) => {
            b.classList.toggle('wdh-btn--active', (b as HTMLElement).dataset.mode === id);
        });
    }

    private _setActive(mode: WallDrawingMode): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            // By-Slab button never gets the active state — it's an action, not a mode
            if (btn.dataset.mode === 'bySlab') return;
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === mode);
        });
    }
}
