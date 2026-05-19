/**
 * D1 — DoorSection
 *
 * Builds a Property Panel section that exposes parametric door controls.
 * Each field dispatches UpdateDoorParameterCommand immediately on change —
 * no draft / Apply button pattern — so the 3D scene updates in real time.
 *
 * Contract compliance:
 *  - §03: All mutations flow through commands; never writes to store directly.
 *  - §05 UI: Pure DOM builder; no Three.js imports; no store writes.
 *  - dw- CSS prefix as specified in §D1 (§11-DOORS-WINDOWS-IMPLEMENTATION-PLAN.md).
 */

import { doorStore } from './DoorStore';
import { DoorOpening } from './DoorTypes';
import { UpdateDoorParameterCommand } from '@pryzm/command-registry';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

/**
 * CSS is now managed by AppTheme.ts (DOOR_SECTION_STYLES in propertyInspector.ts).
 * No-op kept for API compatibility with WindowSection.ts.
 */
export function injectDwStyles(): void {}

/**
 * §DOOR-AUDIT-2026 (DI cleanup) — DoorSection accepts the CommandManager via
 * setDoorSectionCommandManager() instead of reading from window-global.
 * The bootstrap module wires this up; if not set we log loudly and abort the
 * mutation so the user sees the configuration error immediately.
 */
let _commandManager: { execute: (cmd: any) => any } | null = null;
export function setDoorSectionCommandManager(cm: { execute: (cmd: any) => any } | null): void {
    _commandManager = cm;
}

function dispatch(doorId: string, patch: Partial<DoorOpening>): void {
    // §DOOR-AUDIT-2026: prefer injected reference; fall back to window during the
    // migration window so existing call sites keep working.
    const cmdMgr = _commandManager ?? window.commandManager; // TODO(TASK-06)
    if (!cmdMgr) {
        console.error('[DoorSection] commandManager not configured — call setDoorSectionCommandManager() at bootstrap');
        return;
    }
    const current = doorStore.getById(doorId);
    if (!current) {
        console.warn('[DoorSection] Door not found in store:', doorId);
        return;
    }
    // NOTE: the previous-fields snapshot is now also captured by
    // UpdateDoorParameterCommand.execute() at execute-time (§DOOR-AUDIT-2026
    // P-EXEC-PREV) which makes the command robust to deferred/queued execution.
    // We still pass a snapshot here so the legacy single-tick path works without
    // an extra store read on the command side.
    const prevFields: Partial<DoorOpening> = {};
    for (const key of Object.keys(patch) as (keyof DoorOpening)[]) {
        (prevFields as any)[key] = current[key];
    }
    const cmd = new UpdateDoorParameterCommand(doorId, patch, prevFields);
    const result = cmdMgr.execute(cmd); // TODO(TASK-06)
    if (!result.success) {
        console.warn('[DoorSection] UpdateDoorParameterCommand failed:', result.info);
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

function makeTextInput(current: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'dw-text';
    inp.value = current;
    inp.addEventListener('change', () => onChange(inp.value.trim()));
    return inp;
}

function makeMaterialSelect(
    currentId: string | undefined,
    onChange: (materialId: string, materialColor: string, materialLabel: string) => void
): HTMLElement {
    const grouped = new Map<string, typeof STANDARD_MATERIAL_LIBRARY>();
    for (const m of STANDARD_MATERIAL_LIBRARY) {
        const list = grouped.get(m.category) ?? [];
        list.push(m);
        grouped.set(m.category, list);
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const swatch = document.createElement('div');
    const findColor = (id?: string): string => {
        if (!id) return '#e0d8d0';
        const m = STANDARD_MATERIAL_LIBRARY.find(x => x.id === id);
        if (!m) return '#e0d8d0';
        const c = m.params.color;
        if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
        if (typeof c === 'string') return c;
        return '#e0d8d0';
    };
    swatch.style.cssText = `width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);background:${findColor(currentId)};`;

    const sel = document.createElement('select');
    sel.className = 'dw-select';
    sel.style.cssText = 'font-size:11px;flex:1;min-width:0;';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— select material —';
    if (!currentId) blank.selected = true;
    sel.appendChild(blank);

    Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([cat, mats]) => {
            const grp = document.createElement('optgroup');
            grp.label = cat;
            for (const m of mats) {
                const o = document.createElement('option');
                o.value = m.id;
                o.textContent = m.label;
                if (m.id === currentId) o.selected = true;
                grp.appendChild(o);
            }
            sel.appendChild(grp);
        });

    sel.addEventListener('change', () => {
        const id = sel.value;
        const color = findColor(id);
        swatch.style.background = color;
        const label = STANDARD_MATERIAL_LIBRARY.find(m => m.id === id)?.label ?? id;
        onChange(id, color, label);
    });

    wrap.appendChild(swatch);
    wrap.appendChild(sel);
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

/**
 * Builds the door parameters section element.
 * Returns null if the door is not found in DoorStore.
 *
 * @param doorId  The Opening.elementId (== DoorOpening.id)
 */
export function buildDoorSection(doorId: string): HTMLElement | null {
    const door = doorStore.getById(doorId);
    if (!door) return null;

    injectDwStyles();

    const section = document.createElement('div');
    section.className = 'dw-section';

    const header = document.createElement('div');
    header.className = 'dw-section-header';

    const title = document.createElement('div');
    title.className = 'dw-section-title';
    title.textContent = 'Door Parameters';

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
        makeNumberInput(door.width, 0.4, 4.0, 0.05, v => dispatch(doorId, { width: v }))
    ));

    body.appendChild(makeField('Height (m)',
        makeNumberInput(door.height, 1.6, 4.0, 0.05, v => dispatch(doorId, { height: v }))
    ));

    body.appendChild(makeField('Sill Height (m)',
        makeNumberInput(door.sillHeight, 0, 0.5, 0.01, v => dispatch(doorId, { sillHeight: v }))
    ));

    body.appendChild(makeField('Door Type',
        makeSelect(
            [{ value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }],
            door.doorType,
            v => dispatch(doorId, { doorType: v as 'single' | 'double' })
        )
    ));

    body.appendChild(makeField('Hinges Side',
        makeToggle(
            [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
            door.hingesSide,
            v => dispatch(doorId, { hingesSide: v as 'left' | 'right' })
        )
    ));

    body.appendChild(makeField('Swing',
        makeToggle(
            [{ value: 'inward', label: 'Inward' }, { value: 'outward', label: 'Outward' }],
            door.swingDirection,
            v => dispatch(doorId, { swingDirection: v as 'inward' | 'outward' })
        )
    ));

    body.appendChild(makeField('Leaf Visible in Plan',
        makeToggle(
            [{ value: 'false', label: 'Hidden (symbol only)' }, { value: 'true', label: 'Visible' }],
            String(door.leafVisibleInPlan ?? false),
            v => dispatch(doorId, { leafVisibleInPlan: v === 'true' })
        )
    ));

    body.appendChild(makeField('Leaf Thickness (m)',
        makeNumberInput(door.leafThickness ?? 0.04, 0.02, 0.12, 0.005, v => dispatch(doorId, { leafThickness: v }))
    ));

    body.appendChild(makeField('Frame Thickness (m)',
        makeNumberInput(door.frameThickness ?? 0.05, 0.01, 0.15, 0.005, v => dispatch(doorId, { frameThickness: v }))
    ));

    body.appendChild(makeField('Frame Depth (m)',
        makeNumberInput(door.frameDepth ?? 0.07, 0.03, 0.30, 0.005, v => dispatch(doorId, { frameDepth: v }))
    ));

    body.appendChild(makeField('Frame Color',
        makeColorPicker(door.frameColor, v => dispatch(doorId, { frameColor: v }))
    ));

    body.appendChild(makeField('Leaf Color',
        makeColorPicker(door.leafColor, v => dispatch(doorId, { leafColor: v }))
    ));

    body.appendChild(makeField('Handle Height (m)',
        makeNumberInput(door.handleHeight, 0.8, 1.2, 0.01, v => dispatch(doorId, { handleHeight: v }))
    ));

    body.appendChild(makeField('Fire Rating',
        makeTextInput(door.fireRating ?? '', v => dispatch(doorId, { fireRating: v || undefined }))
    ));

    body.appendChild(makeField('Frame Finish',
        makeMaterialSelect(
            door.frameFinish?.materialId,
            (id, color, label) => dispatch(doorId, {
                frameFinish: { name: label, materialId: id || undefined, materialColor: color },
                ...(id ? {} : {}),
            })
        )
    ));

    body.appendChild(makeField('Leaf Finish',
        makeMaterialSelect(
            door.leafFinish?.materialId,
            (id, color, label) => dispatch(doorId, {
                leafFinish: { name: label, materialId: id || undefined, materialColor: color },
                finishMaterial: label || undefined,
            })
        )
    ));

    section.appendChild(body);
    return section;
}
