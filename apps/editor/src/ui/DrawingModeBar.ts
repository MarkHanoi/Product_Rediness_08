/**
 * DrawingModeBar — §FEAT-PERSISTENT-MODE-BAR (founder, 2026-08-07)
 *
 * THE FOUNDER, verbatim:
 *   "The slab creation works great — but the UI/UX is not as expected. I would
 *    like EXACTLY THE SAME PANEL as the wall. I want the user, DURING CREATION,
 *    to be able to change from linear to curved to ortho etc. Same for ceiling
 *    and floor."
 *
 * THE ONE persistent in-viewport mode bar for every drawing tool. It replaces four
 * near-identical hand-maintained copies — `WallDrawingHUD`, `FloorDrawingHUD`,
 * `CeilingDrawingHUD`, `CurtainWallDrawingHUD` — which already shared the same
 * `.wdh-*` stylesheet and had already drifted apart in behaviour. The slab, which
 * had NO bar at all, is the capability this unlocks.
 *
 * TWO INTERACTION MODELS, and why only one is acceptable
 * ─────────────────────────────────────────────────────────────────────────────
 * The wall has always used a PERSISTENT BAR: it is on screen for the whole
 * session, and clicking a pill switches the mode of the NEXT segment without
 * disturbing the points already placed.
 *
 * The slab used a PRE-FLIGHT LAUNCHER MENU: a modal list you chose from BEFORE
 * drawing. Its buttons called `activateSlabTool(...)`, which routes through
 * `ToolManager.activateTool` → `deactivateAllInternal()` → the in-progress
 * polyline is DESTROYED. Switching mode therefore meant starting over. That is the
 * whole of the founder's complaint, and it is why this bar must never call an
 * `activate*` function: it writes the shared mode store and nothing else.
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION. Every tool handler re-reads its mode on
 * each interaction (`resolveActiveSlabDrawMode()` for slab; `getActiveMode()` on
 * the picker for floor/ceiling/wall), so a switch applies to the very next click
 * with no re-activation and no loss of the current stroke.
 *
 * THE MODE LIST IS NOT HARD-CODED HERE. It comes from `elementCreationMatrix`, the
 * same declaration the creation-matrix spec asserts against, so a tool's launcher
 * and its in-draw bar cannot offer different sets again. Slab keeps all seven of
 * its modes and floor/ceiling keep AUTO — the bar renders whatever the tool
 * declares and never truncates to the wall's four.
 *
 * THE DESCRIPTIONS SURVIVE. The launcher menu's one-liners ("Auto-detect enclosed
 * walls", "Associative from walls", "Rectangle with an opening") are genuinely
 * useful and the compact bar has no room for them, so each is the pill's `title`
 * tooltip rather than being dropped.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1 — reuses the existing `.wdh-*` CSS; adds none.
 *   §05-BIM-UI-ARCHITECTURE §7.1 — no store writes here; the owner supplies
 *                                  `onSelect`, which writes the shared mode store.
 *   §05-BIM-UI-ARCHITECTURE §7.8 — plain native HTML, no @thatopen/ui elements.
 *   C08 §3.1 (§XSS-SINK-SCAN)    — NO HTML sink: built with `textContent` only, so
 *                                  this file starts and stays at zero unguarded
 *                                  interpolations. The four bars it replaces each
 *                                  carried baselined `innerHTML` sites.
 */

import type { CreationMode } from '@app/engine/views/plantools/elementCreationMatrix';

export interface DrawingModeBarOptions {
    /** Bar prefix label, e.g. 'Mode:', 'Floor:', 'Slab:'. */
    label: string;
    /** The modes to render, in order — from `creationModes(tool)`. */
    modes: readonly CreationMode[];
    /** The mode id highlighted on open. */
    initialMode: string;
    /**
     * Called when the user picks a mode, by click or accelerator.
     *
     * MUST be non-destructive: write the shared mode store, never call an
     * `activate*` function. Re-activating a tool tears down the in-progress stroke,
     * which is the defect this component exists to remove.
     */
    onSelect: (modeId: string) => void;
    /** Footer hint. Defaults to the wall bar's wording. */
    escHint?: string;
}

export class DrawingModeBar {
    private el: HTMLElement | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private opts: DrawingModeBarOptions | null = null;

    show(opts: DrawingModeBarOptions): void {
        this.dismiss();
        this.opts = opts;

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-dmb', '1');

        const label = document.createElement('span');
        label.className = 'wdh-mode-lbl';
        label.textContent = opts.label;
        bar.appendChild(label);

        let separatorPlaced = false;
        for (const mode of opts.modes) {
            // An ACTION (wall's "By Slab") is not a mode: it goes after a separator
            // and never takes the active highlight — the wall bar's existing rule.
            if (mode.isAction && !separatorPlaced) {
                const sep = document.createElement('span');
                sep.className = 'wdh-sep';
                bar.appendChild(sep);
                separatorPlaced = true;
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wdh-btn'
                + (!mode.isAction && mode.id === opts.initialMode ? ' wdh-btn--active' : '')
                + (mode.isAction ? ' wdh-btn--slab' : '');
            btn.dataset.mode = mode.id;
            if (mode.isAction) btn.dataset.action = '1';
            // The launcher menu's description, preserved as the tooltip.
            btn.title = `${mode.label} — ${mode.description} (${mode.key})`;

            const key = document.createElement('span');
            key.className = 'wdh-key';
            key.textContent = mode.key;
            btn.appendChild(key);

            const lbl = document.createElement('span');
            lbl.className = 'wdh-lbl';
            lbl.textContent = mode.label;
            btn.appendChild(lbl);

            btn.addEventListener('click', () => this._pick(mode));
            bar.appendChild(btn);
        }

        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = opts.escHint ?? 'ESC to finish';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this.el = bar;

        this.keyHandler = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            const hit = this.opts?.modes.find(m => m.key.toUpperCase() === e.key.toUpperCase());
            if (!hit) return;
            // Bubbling phase + stopImmediatePropagation, matching WallDrawingHUD: the
            // tool's own capture-phase handlers run first, then this claims the key so
            // it cannot also reach a focused toolbar button (§FIX-COMMIT-STEALS-VIEW).
            e.stopImmediatePropagation();
            e.preventDefault();
            this._pick(hit);
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    /** Update the highlight without rebuilding (a mode switched from elsewhere). */
    setMode(modeId: string): void {
        if (!this.el) return;
        this.el.querySelectorAll<HTMLButtonElement>('.wdh-btn').forEach(btn => {
            if (btn.dataset.action === '1') return;   // actions never highlight
            btn.classList.toggle('wdh-btn--active', btn.dataset.mode === modeId);
        });
    }

    dismiss(): void {
        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }
        if (this.el) { this.el.remove(); this.el = null; }
        this.opts = null;
    }

    isVisible(): boolean { return this.el !== null; }

    private _pick(mode: CreationMode): void {
        // An action does not become the active mode.
        if (!mode.isAction) this.setMode(mode.id);
        this.opts?.onSelect(mode.id);
    }
}
