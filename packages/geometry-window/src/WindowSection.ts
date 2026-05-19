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
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:5px;';

    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(current);
    inp.style.cssText = 'width:70px;accent-color:#8B5CF6;';

    const label = document.createElement('span');
    label.style.cssText = 'font-size:10px;color:#64748b;min-width:28px;text-align:right;';
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
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? 'flex' : 'none';
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
