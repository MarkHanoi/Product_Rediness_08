/**
 * DrawModePicker — §FEAT-SLAB-DRAW-MODES (2026-08-06)
 *
 * THE ONE in-viewport drawing-mode panel for the slab-family creation tools
 * (slab, floor finish, ceiling). `SlabModePicker`, `FloorModePicker` and
 * `CeilingModePicker` are now thin CONFIGURATIONS of this class, not three
 * hand-maintained copies of the same 230 lines.
 *
 * WHY (founder, 2026-08-06):
 *   "During SLAB creation, FLOOR FINISH creation and CEILING creation I want the
 *    SAME OPTIONS as during WALL creation — ORTHO, LINEAR, CURVE etc. — WITH THE
 *    SAME PANEL, and the same possibilities and capabilities."
 *
 * The panel is data-driven: a caller supplies a CSS prefix (so the existing
 * per-element styles in `styles/panels/mode-pickers/*` are reused verbatim — no
 * new CSS, §05-BIM-UI-ARCHITECTURE §2.1), a header, an optional system-type
 * dropdown, and the mode buttons. The MODE SEMANTICS themselves are not defined
 * here: `linear` / `ortho` / `curved` come from `@pryzm/geometry-slab`'s
 * `BoundaryDrawMode`, the same model the tool handlers consume.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1 — CSS lives in AppTheme; this file adds none.
 *   §05-BIM-UI-ARCHITECTURE §7.1 — no store mutation; callbacks delegate outward.
 *   §05-BIM-UI-ARCHITECTURE §7.8 — plain native HTML, no @thatopen/ui elements.
 *   C08 §3.1 (§XSS-SINK-SCAN) — NO HTML sink. Text goes through `textContent`
 *     and the author-written SVG icons are parsed into real nodes via DOMParser,
 *     so this file starts and stays at ZERO unguarded interpolations. (The files
 *     it replaces each carried 3–4 baselined `innerHTML` sites.)
 *
 * NOT MIGRATED (deliberate, see the agent report): `WallModePicker` and
 * `CurtainWallModePicker`. Their DOM is the template this class was extracted
 * from, but the wall tool is under concurrent edit; migrating them is a
 * mechanical follow-up that must not race another agent.
 */

export interface DrawModeOption<TMode extends string> {
    /** Keyboard accelerator, also shown in the button chip (e.g. 'L', 'O', 'C', 'PW'). */
    key: string;
    label: string;
    /** One-line explanation; shown in the tooltip, and in the button when `showSub`. */
    sub: string;
    /** Author-written SVG markup (from `icons/PryzmIcons` or a local builder). */
    svg: string;
    modeId: TMode;
    action: () => void;
}

export interface DrawModeTypeRow {
    /** Row label, e.g. 'Floor Type'. */
    label: string;
    /** The "no system type" option text, e.g. '— Default Floor —'. */
    noneLabel: string;
    options: Array<{ id: string; name: string; totalThickness: number }>;
    currentId?: string;
    onChange: (id: string | undefined) => void;
}

export interface DrawModePickerConfig<TMode extends string> {
    header: { title: string; sub: string };
    /** Omit for tools with no system-type catalogue (slab). */
    typeRow?: DrawModeTypeRow;
    modes: Array<DrawModeOption<TMode>>;
    /** Footer hint, e.g. 'Continuous creation · ESC to finish'. */
    hint: string;
}

/**
 * Generic drawing-mode HUD.
 *
 * `_lastMode` persists the most recent selection so plan-view tool handlers can
 * read `getActiveMode()` on every mousemove without a tool re-activation — the
 * pattern established by `WallModePicker` and required by the handlers.
 */
export class DrawModePicker<TMode extends string> {
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;
    private _lastMode: TMode;

    constructor(
        /** CSS class prefix — 'smp' | 'fmp' | 'cmp'. Selects the existing stylesheet. */
        private readonly prefix: string,
        /** Console tag, e.g. 'SlabModePicker', so existing log greps keep working. */
        private readonly logName: string,
        defaultMode: TMode,
        /** Render the `sub` line inside the button (slab does; floor/ceiling do not). */
        private readonly showSub: boolean = false,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this._lastMode = defaultMode;
        this.runtime = runtime;
    }

    /** The most recently selected drawing mode. Read on every mousemove — never cached. */
    getActiveMode(): TMode {
        return this._lastMode;
    }

    /** Set the mode without showing the panel (drawing-HUD switches, tool activation). */
    setActiveMode(mode: TMode): void {
        this._lastMode = mode;
        console.log(`[${this.logName}] setActiveMode →`, mode);
    }

    show(config: DrawModePickerConfig<TMode>): void {
        this.dismiss();
        const p = this.prefix;

        const panel = document.createElement('div');
        panel.className = `${p}-panel`;

        // ── Gradient header ───────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = `${p}-header`;
        header.appendChild(this._span(`${p}-header-title`, config.header.title));
        header.appendChild(this._span(`${p}-header-sep`));
        header.appendChild(this._span(`${p}-header-sub`, config.header.sub));
        panel.appendChild(header);

        // ── System-type row (optional) ────────────────────────────────────────
        if (config.typeRow) {
            const tr = config.typeRow;
            const typeRow = document.createElement('div');
            typeRow.className = `${p}-type-row`;
            typeRow.appendChild(this._span(`${p}-type-label`, tr.label));

            const select = document.createElement('select');
            select.className = `${p}-type-select`;

            const none = document.createElement('option');
            none.value = '';
            none.textContent = tr.noneLabel;
            select.appendChild(none);

            for (const t of tr.options) {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.name}  (${Math.round(t.totalThickness * 1000)} mm)`;
                select.appendChild(opt);
            }
            select.value = tr.currentId ?? '';
            select.addEventListener('change', () => tr.onChange(select.value || undefined));

            typeRow.appendChild(select);
            panel.appendChild(typeRow);

            const divider = document.createElement('div');
            divider.className = `${p}-divider`;
            panel.appendChild(divider);
        }

        // ── Mode buttons ──────────────────────────────────────────────────────
        const modeRow = document.createElement('div');
        modeRow.className = `${p}-mode-row`;

        for (const mode of config.modes) {
            const btn = document.createElement('button');
            btn.className = `${p}-btn`;
            btn.type = 'button';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.dataset.modeId = mode.modeId;

            const icon = document.createElement('span');
            icon.className = `${p}-icon`;
            const svgNode = parseSvgIcon(mode.svg);
            if (svgNode) icon.appendChild(svgNode);
            btn.appendChild(icon);

            const text = document.createElement('span');
            text.className = `${p}-btn-text`;
            text.appendChild(this._span(`${p}-key`, mode.key));
            text.appendChild(this._span(`${p}-label`, mode.label));
            if (this.showSub) text.appendChild(this._span(`${p}-sub`, mode.sub));
            btn.appendChild(text);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._lastMode = mode.modeId;
                console.log(`[${this.logName}] Mode selected:`, mode.modeId);
                this.dismiss();
                try {
                    mode.action();
                } catch (err) {
                    console.error(`[${this.logName}] action threw for`, mode.modeId, err);
                }
            });
            modeRow.appendChild(btn);
        }
        panel.appendChild(modeRow);

        // ── ESC hint ──────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = `${p}-hint`;
        hint.textContent = config.hint;
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        // ── Keyboard accelerators (same contract as WallModePicker) ───────────
        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.dismiss(); return; }
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const k = e.key.toUpperCase();
            const hit = config.modes.find(m => m.key.toUpperCase() === k);
            if (!hit) return;
            e.preventDefault();
            this._lastMode = hit.modeId;
            this.dismiss();
            hit.action();
        };
        window.addEventListener('keydown', this.escHandler, { capture: true });
    }

    dismiss(): void {
        if (this.escHandler) {
            window.removeEventListener('keydown', this.escHandler, { capture: true } as EventListenerOptions);
            this.escHandler = null;
        }
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }

    isVisible(): boolean {
        return this.el !== null;
    }

    private _span(className: string, text?: string): HTMLSpanElement {
        const s = document.createElement('span');
        s.className = className;
        if (text !== undefined) s.textContent = text;
        return s;
    }
}

/**
 * Parse author-written SVG markup into a real node.
 *
 * C08 §3.1 — this is deliberately NOT `innerHTML`. The mode icons are static
 * module constants today, but a picker is exactly the place a caller would one
 * day pass a catalogue-supplied glyph, and an HTML sink here would make that
 * a stored-XSS vector. DOMParser in `image/svg+xml` mode never executes script
 * during parsing, and the result is adopted, not evaluated.
 *
 * Returns null when the markup does not parse to an <svg> root, so a bad icon
 * degrades to a blank button rather than throwing mid-render.
 */
export function parseSvgIcon(markup: string): SVGElement | null {
    try {
        const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
        const root = doc.documentElement;
        if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
        return document.importNode(root, true) as unknown as SVGElement;
    } catch {
        return null;
    }
}
