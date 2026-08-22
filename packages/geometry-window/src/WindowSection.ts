/**
 * D2 — WindowSection
 *
 * Builds a Property Panel section that exposes parametric window controls.
 * Each field dispatches UpdateWindowParameterCommand immediately on change —
 * no draft / Apply button pattern — so the 3D scene updates in real time.
 *
 * Contract compliance:
 *  - §03: All mutations flow through commands; never writes to store directly.
 *  - §05 UI: Pure DOM builder; no Three.js imports; no store writes.
 *  - dw- CSS prefix as specified in §D2 (§11-DOORS-WINDOWS-IMPLEMENTATION-PLAN.md).
 */

import { windowStore } from './WindowStore';
import { OPENING_PROFILE_KINDS, OPENING_PROFILE_LABELS, SEGMENTAL_RISE_RATIO, wallStore } from '@pryzm/geometry-wall';
// ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — the panel READS the model, it does not restate
// it. The derived glass size shown below is `resolveWindowReveal`'s answer, not a second
// piece of trigonometry that would drift from the geometry the user is looking at.
import {
    resolveWindowReveal, windowRevealRefusal, REVEAL_SIDES, REVEAL_SIDE_LABEL,
    REVEAL_SPLAY_FIELD, MAX_REVEAL_SPLAY_DEG,
    REVEAL_DIRECTIONS, REVEAL_DIRECTION_LABEL, resolveRevealDirection,
} from './WindowReveal';
import { WindowOpening } from './WindowTypes';
import { UpdateWindowParameterCommand } from '@pryzm/command-registry';
import { injectDwStyles } from '@pryzm/geometry-door';

/**
 * §WINDOW-AUDIT-2026 (DI cleanup) — WindowSection accepts the CommandManager via
 * setWindowSectionCommandManager() instead of reading from window-global.
 */
let _commandManager: { execute: (cmd: any) => any } | null = null;
export function setWindowSectionCommandManager(cm: { execute: (cmd: any) => any } | null): void {
    _commandManager = cm;
}

function dispatch(windowId: string, patch: Partial<WindowOpening>): void {
    const cmdMgr = _commandManager ?? window.commandManager; // TODO(TASK-06)
    if (!cmdMgr) {
        console.error('[WindowSection] commandManager not configured — call setWindowSectionCommandManager() at bootstrap');
        return;
    }
    const current = windowStore.getById(windowId);
    if (!current) {
        console.warn('[WindowSection] Window not found in store:', windowId);
        return;
    }
    const prevFields: Partial<WindowOpening> = {};
    for (const key of Object.keys(patch) as (keyof WindowOpening)[]) {
        (prevFields as any)[key] = current[key];
    }
    const cmd = new UpdateWindowParameterCommand(windowId, patch, prevFields);
    const result = cmdMgr.execute(cmd); // TODO(TASK-06)
    if (!result.success) {
        console.warn('[WindowSection] UpdateWindowParameterCommand failed:', result.info);
    }
}

function makeField(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dw-field';
    const lbl = document.createElement('div');
    lbl.className = 'dw-label';
    lbl.textContent = label;
    const wrap = document.createElement('div');
    wrap.className = 'dw-control';
    wrap.appendChild(control);
    row.appendChild(lbl);
    row.appendChild(wrap);
    return row;
}

function makeSelect(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.className = 'dw-select';
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === current) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
}

function makeColorPicker(current: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.className = 'dw-color';
    inp.value = current;
    inp.addEventListener('input', () => onChange(inp.value));
    inp.addEventListener('change', () => onChange(inp.value));
    return inp;
}

function makeTextInput(current: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'dw-text';
    inp.value = current;
    inp.addEventListener('change', () => onChange(inp.value.trim()));
    return inp;
}

function makeSlider(current: number, min: number, max: number, step: number, format: (v: number) => string, onChange: (v: number) => void): HTMLElement {
    // §FIX-PROPERTIES-PANEL-POLISH — class-driven layout so the range fills the
    // shared value column and the readout pins to the right (see DOOR_SECTION_STYLES).
    const wrap = document.createElement('div');
    wrap.className = 'dw-slider';

    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(current);

    const label = document.createElement('span');
    label.className = 'dw-slider-value';
    label.textContent = format(current);

    inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        label.textContent = format(v);
        onChange(v);
    });

    wrap.appendChild(inp);
    wrap.appendChild(label);
    return wrap;
}

function makeToggle(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dw-toggle-row';
    const buttons: HTMLButtonElement[] = [];
    for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'dw-toggle-btn' + (opt.value === current ? ' active' : '');
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(opt.value);
        });
        buttons.push(btn);
        row.appendChild(btn);
    }
    return row;
}

function makeIntSlider(current: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    return makeSlider(current, min, max, 1, v => String(Math.round(v)), onChange);
}

function makeNumberInput(current: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'dw-number';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(current);
    inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
    });
    return inp;
}

/**
 * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — the reveal rows.
 *
 * Kept as one function so the projection and the splay stay visually adjacent in the panel:
 * they are one model with two parameters, and separating them in the UI would invite the
 * user to think of them as unrelated, which is precisely the mistake the model exists to
 * prevent.
 *
 * ⚠ THE HOST WALL'S THICKNESS IS REQUIRED to say anything about the glass, because the
 * reveal run is half of it. When the wall cannot be resolved the readout says so instead of
 * printing a number derived from a guessed thickness — §NO-EMPTY-MEANS-UNKNOWN, and L-127's
 * rule that a symbol never invents a dimension applies just as hard to a panel.
 */
function appendRevealFields(body: HTMLElement, windowId: string, win: WindowOpening): HTMLElement {
    const wall = wallStore.getById?.(win.wallId) as { thickness?: number } | undefined;
    const thickness = typeof wall?.thickness === 'number' && wall.thickness > 0 ? wall.thickness : null;

    // A read-only line that re-derives itself from the STORE after every dispatch, so what it
    // reports is the record that actually landed — never the value the input was set to.
    const readout = document.createElement('div');
    readout.className = 'dw-label';
    readout.style.cssText = 'grid-column:1/-1;opacity:0.75;font-size:11px;line-height:1.45;';
    const refreshReadout = (): void => {
        const now = windowStore.getById(windowId);
        if (!now) { readout.textContent = ''; return; }
        if (thickness === null) {
            readout.textContent =
                'Glass size is not shown: this window’s host wall could not be read, and the '
                + 'reveal depth is half the wall thickness. No thickness, no derivable answer.';
            return;
        }
        const r = resolveWindowReveal(now as never, thickness);
        const refusal = windowRevealRefusal(now as never, thickness);
        readout.textContent = refusal
            ? `⛔ ${refusal}`
            : `Reveal depth ${r.run.toFixed(3)} m · glass `
              + `${r.glazingWidth.toFixed(3)} × ${r.glazingHeight.toFixed(3)} m`
              + (r.hasProjection
                  ? ` · outer face ${Math.abs(r.projection).toFixed(3)} m `
                    + `${r.projection > 0 ? 'proud of' : 'behind'} the `
                    + `${r.direction} wall face`
                  : '');
    };

    const push = (patch: Partial<WindowOpening>): void => {
        dispatch(windowId, patch);
        refreshReadout();
    };

    // ── ⭐ 0. THE DIRECTION — WHICH FACE THE WHOLE REVEAL RUNS FROM (L-3412) ───────
    //
    // *"the reveal projection and splay are applied to the WRONG SIDE — both currently
    //  modify the INDOOR face … I want an explicit direction option (Indoor / Outdoor),
    //  modelled on the door's Swing: Inward | Outward."*
    //
    // ⭐ IT IS FIRST IN THE BLOCK, ABOVE BOTH THE PROJECTION AND THE ANGLES, BECAUSE IT
    // GOVERNS BOTH. Placing it beside the projection would read as "which way the box
    // goes" and leave the architect to discover that it also moved the splay — which is
    // exactly the two-features-one-model confusion ADR-0342 exists to prevent.
    //
    // ⛔ THE HELP LINE SAYS THE SIDE IS AUTHORED, NOT RESOLVED, AND THAT IS A MEASUREMENT.
    // PRYZM cannot presently tell which face of a wall looks outdoors: the slot exists
    // (`WallData.frontSide`/`backSide`) and has ZERO writers repo-wide, so it is UNREACHABLE
    // rather than missing (C01 §6 rule 6), and `WallSideFinishResolver` already refuses to
    // guess it. A default that LOOKED resolved and was actually a guess is worse than an
    // explicit one the architect can see and change — the founder's own constraint.
    const dirRow = makeField('Reveal Direction',
        makeSelect(
            REVEAL_DIRECTIONS.map(d => ({ value: d, label: REVEAL_DIRECTION_LABEL[d] })),
            resolveRevealDirection(win.revealDirection),
            v => push({ revealDirection: v as never }),
        ));
    const dirHelp = document.createElement('div');
    dirHelp.className = 'dw-label';
    dirHelp.style.cssText = 'grid-column:1/-1;opacity:0.65;font-size:11px;line-height:1.4;';
    dirHelp.textContent =
        'Applies to the projection AND the splay — they are one reveal. PRYZM does not yet '
        + 'detect which wall face is outdoors, so this is your choice, not a detected value.';
    body.appendChild(dirRow);
    body.appendChild(dirHelp);

    // ── 1. THE PROJECTION — his *"like frame width but offset wide"* ──────────────
    //
    // SIGNED, and the range says so on screen: negative recesses the window into a deep-set
    // reveal, which is the same detail read from the other direction and costs nothing extra
    // once the model is signed. The lower bound is the schema's; the GEOMETRIC bound (a
    // recess deeper than the wall's outer half) is the command's refusal, because it depends
    // on the host wall and an input's `min` attribute cannot know it.
    body.appendChild(makeField('Projection (m)',
        makeNumberInput(win.revealProjection ?? 0, -1, 2, 0.01, v => push({ revealProjection: v }))
    ));

    // ── 2. THE SPLAY — one input per side, plus "all sides" ───────────────────────
    for (const side of REVEAL_SIDES) {
        const field = REVEAL_SPLAY_FIELD[side];
        body.appendChild(makeField(`Splay ${REVEAL_SIDE_LABEL[side]} (°)`,
            makeNumberInput(
                (win[field] as number | undefined) ?? 0,
                0, MAX_REVEAL_SPLAY_DEG, 1,
                v => push({ [field]: v } as Partial<WindowOpening>),
            )
        ));
    }
    // ONE dispatch ⇒ ONE undo step. See the block comment at the call site.
    body.appendChild(makeField('Splay all sides (°)',
        makeNumberInput(0, 0, MAX_REVEAL_SPLAY_DEG, 1, v => push({
            revealSplayHead: v, revealSplaySill: v,
            revealSplayJambLeft: v, revealSplayJambRight: v,
        }))
    ));

    refreshReadout();
    body.appendChild(readout);
    return readout;
}

/**
 * Builds the window parameters section element.
 * Returns null if the window is not found in WindowStore.
 *
 * @param windowId  The Opening.elementId (== WindowOpening.id)
 */
export function buildWindowSection(windowId: string): HTMLElement | null {
    const win = windowStore.getById(windowId);
    if (!win) return null;

    // PLAN-14: Inject shared dw- styles (guards against double-injection internally).
    injectDwStyles();

    const section = document.createElement('div');
    section.className = 'dw-section';

    const header = document.createElement('div');
    header.className = 'dw-section-header';

    const title = document.createElement('div');
    title.className = 'dw-section-title';
    title.textContent = 'Window Parameters';

    const toggle = document.createElement('div');
    toggle.className = 'dw-section-toggle';
    toggle.textContent = '▲';

    header.appendChild(title);
    header.appendChild(toggle);
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'dw-section-body';

    header.addEventListener('click', () => {
        // §FIX-PROPERTIES-PANEL-POLISH — body is a CSS grid; restore to 'grid'.
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? 'grid' : 'none';
        toggle.textContent = collapsed ? '▲' : '▼';
    });

    body.appendChild(makeField('Width (m)',
        makeNumberInput(win.width, 0.3, 6.0, 0.05, v => dispatch(windowId, { width: v }))
    ));

    body.appendChild(makeField('Height (m)',
        makeNumberInput(win.height, 0.3, 4.0, 0.05, v => dispatch(windowId, { height: v }))
    ));

    body.appendChild(makeField('Sill Height (m)',
        makeNumberInput(win.sillHeight, 0, 2.0, 0.05, v => dispatch(windowId, { sillHeight: v }))
    ));

    body.appendChild(makeField('Window Type',
        makeSelect(
            [{ value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }],
            win.windowType,
            v => dispatch(windowId, { windowType: v as 'single' | 'double' })
        )
    ));

    // §OPENING-PROFILE (L-1252) — THE SHAPE OF AN OPENING THE USER HAS ALREADY PLACED.
    //
    // ⭐ The mode bar authors NEW windows; this reaches the 85 already in the model. An
    // authoring-only capability reads as broken, which is the "authored-but-unwired" bottleneck
    // this repo has recorded more than once.
    //
    // ⚠ THE SEGMENTAL RISE IS PRINTED IN THE OPTION ITSELF, not only in a tooltip: C86 §10.1
    // PR-8 forbids a dimension field beside width/height, so the rise takes a DECLARED default of
    // 1/6 of the span, and whether that matches an architect's expectation is NOT MEASURED. The
    // number is on screen so it can be corrected in one sentence.
    //
    // ⛔ A change the host cannot carry (a curved wall) is REFUSED by
    // `UpdateWindowParameterCommand` with the reason and the live alternative — never a silent
    // no-op, and never a rectangle substituted quietly.
    body.appendChild(makeField('Shape',
        makeSelect(
            OPENING_PROFILE_KINDS.map(k => ({
                value: k,
                label: k === 'segmental-arch'
                    ? `${OPENING_PROFILE_LABELS[k]} (rise 1/${Math.round(1 / SEGMENTAL_RISE_RATIO)} of width)`
                    : OPENING_PROFILE_LABELS[k],
            })),
            win.openingProfile ?? 'rectangular',
            v => dispatch(windowId, { openingProfile: v as never })
        )
    ));

    // ── ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — THE FOUNDER'S TWO ASKS, ONE BLOCK ──
    //
    // *"I want for all window types to have the possibility to extrude outside the façade —
    //   a new attribute in the Properties panel, like frame width but offset wide"*
    // *"…another window type where the frame basically has angles inwards — the angle, which
    //   will define the size of the glass; and the side of the windows (top / bottom / left /
    //   right / all / multiple)"*
    //
    // ⭐ **THE ANGLE IS AUTHORED; THE GLASS SIZE IS SHOWN, READ-ONLY.** He said the angle
    // *"will define the size of the glass"*, so glass size is the CONSEQUENCE and must never
    // become a second input — two fields that each claim to set the same quantity drift apart
    // by their first rounding. The readout below is `resolveWindowReveal`'s own output.
    //
    // ⭐ **FOUR INDEPENDENT SIDES PLUS AN "ALL SIDES" ROW.** That is literally *"all /
    // multiple"*: "multiple" is two of the four fields set, and needs no mode. "All" is a
    // convenience that writes all four in ONE dispatch, i.e. one command and one undo step —
    // four dispatches would give him four presses of Ctrl+Z for one gesture.
    //
    // ⛔ Labels are TOP/BOTTOM/LEFT/RIGHT because that is what he asked for; the STORED names
    // are head/sill/jamb because that is the construction vocabulary and what the drawings,
    // schedules and RAC use. `REVEAL_SIDE_LABEL` owns the mapping, once.
    appendRevealFields(body, windowId, win);

    body.appendChild(makeField('Frame Color',
        makeColorPicker(win.frameColor, v => dispatch(windowId, { frameColor: v }))
    ));

    body.appendChild(makeField('Glass Opacity',
        makeSlider(win.glassOpacity, 0, 1, 0.05, v => v.toFixed(2),
            v => dispatch(windowId, { glassOpacity: v }))
    ));

    body.appendChild(makeField('Sill',
        makeToggle(
            [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }],
            String(win.sill),
            v => dispatch(windowId, { sill: v === 'true' })
        )
    ));

    const currentCols = win.columnRatios.length;
    body.appendChild(makeField('Columns (1–4)',
        makeIntSlider(currentCols, 1, 4, v => {
            const n = Math.round(v);
            dispatch(windowId, { columnRatios: Array(n).fill(1 / n) });
        })
    ));

    const currentRows = win.rowRatios.length;
    body.appendChild(makeField('Rows (1–3)',
        makeIntSlider(currentRows, 1, 3, v => {
            const n = Math.round(v);
            dispatch(windowId, { rowRatios: Array(n).fill(1 / n) });
        })
    ));

    body.appendChild(makeField('Fire Rating',
        makeTextInput(win.fireRating ?? '', v => dispatch(windowId, { fireRating: v || undefined }))
    ));

    body.appendChild(makeField('Finish Material',
        makeTextInput(win.finishMaterial ?? '', v => dispatch(windowId, { finishMaterial: v || undefined }))
    ));

    section.appendChild(body);
    return section;
}
