/**
 * AreaPanel — Wave 6 Phase B (wave-6-b-d4)
 *
 * BIM area boundary editor: area type, measurement unit, computation method,
 * offset from wall face, upper/lower limit controls for vertical zoning.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P4   — No window. Runtime is the only bridge.
 * • §01-VISION P6   — State mutation via Commands only.
 *   CustomEvent kept for backward compat while src/engine/subsystems/legacy/window-shim.ts exists.
 * • §01-VISION P8   — OTel span fired via activatePanel / deactivatePanel (runtime-composer).
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned loudly.
 * • L7.5 monotonically shrinking: Phase E.area.S → runtime.stores.area
 *
 * TODO(E.area.S): migrate CustomEvent → runtime.bus.executeCommand('area.update', ...)
 * TODO(E.area.S): migrate state reads → runtime.stores.area.getSnapshot()
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

export const AREA_PANEL_ID = 'area-panel' as const;

export type AreaType             = 'gross-building-area' | 'rentable-area' | 'usable-area' | 'net-area';
export type AreaUnit             = 'm²' | 'ft²' | 'sf';
export type AreaComputationMethod = 'finish-face' | 'center-of-walls' | 'exterior-face';

export interface AreaPanelState {
    areaType:          AreaType;
    unit:              AreaUnit;
    computationMethod: AreaComputationMethod;
    wallFaceOffset:    number;  // mm — offset from dominant face
    upperLimit:        string;  // e.g. "Level 2" or "Unconnected"
    upperOffset:       number;  // mm above upper limit
    lowerOffset:       number;  // mm below lower limit (base)
    isComputed:        boolean;
}

const DEFAULT_AREA_STATE: AreaPanelState = {
    areaType:          'gross-building-area',
    unit:              'm²',
    computationMethod: 'finish-face',
    wallFaceOffset:    0,
    upperLimit:        'Unconnected',
    upperOffset:       0,
    lowerOffset:       0,
    isComputed:        true,
};

const AP_STYLES = `
.ap-panel {
    position:fixed; top:56px; right:8px; width:268px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.ap-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.ap-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.ap-close-btn { background:none; border:none; cursor:pointer; font-size:16px; color:var(--app-text-secondary,#888); padding:2px 4px; border-radius:4px; }
.ap-close-btn:hover { background:rgba(0,0,0,0.06); }
.ap-body { padding:12px; display:flex; flex-direction:column; gap:10px; }
.ap-field { display:flex; flex-direction:column; gap:3px; }
.ap-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.ap-select, .ap-input {
    width:100%; padding:5px 8px; border:1px solid rgba(0,0,0,0.15); border-radius:6px;
    font-size:12px; background:var(--app-input-bg,#fff); color:var(--app-text,#333);
    box-sizing:border-box;
}
.ap-select:focus, .ap-input:focus { outline:none; border-color:var(--app-accent,#0066cc); }
.ap-computed-row { display:flex; align-items:center; gap:8px; padding:6px 0; }
.ap-checkbox { width:14px; height:14px; cursor:pointer; }
.ap-computed-label { font-size:12px; color:var(--app-text,#333); }
.ap-section-divider { height:1px; background:rgba(0,0,0,0.07); margin:2px 0; }
`;

export class AreaPanel {
    readonly element: HTMLElement;
    private _state: AreaPanelState;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this._state   = { ...DEFAULT_AREA_STATE };
        this.element  = this._build();
    }

    show(): void {
        if (this._runtime) {
            const spec: PanelViewSpec = { label: 'Area Panel', elementType: 'area' };
            this._runtime.viewRegistry.activatePanel(AREA_PANEL_ID, spec);
        } else {
            console.warn('[AreaPanel] show() called without runtime — panel not registered in ViewRegistry');
        }
        this.element.style.display = 'block'; // F.events.16 — pryzm:panel:shown had no listeners; removed.
    }

    hide(): void {
        if (this._runtime) {
            this._runtime.viewRegistry.deactivatePanel(AREA_PANEL_ID);
        } else {
            console.warn('[AreaPanel] hide() called without runtime — ViewRegistry not notified');
        }
        this.element.style.display = 'none'; // F.events.16 — pryzm:panel:hidden had no listeners; removed.
    }

    getState(): Readonly<AreaPanelState> { return { ...this._state }; }

    setState(patch: Partial<AreaPanelState>): void {
        this._state = { ...this._state, ...patch };
        this._sync();
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = AP_STYLES;

        const panel = document.createElement('div');
        panel.className    = 'ap-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Area Panel');

        const header = document.createElement('div');
        header.className = 'ap-header';
        const title = document.createElement('span');
        title.className   = 'ap-title';
        title.textContent = 'Area';
        const closeBtn = document.createElement('button');
        closeBtn.className        = 'ap-close-btn';
        closeBtn.textContent      = '×';
        closeBtn.setAttribute('aria-label', 'Close Area Panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.append(title, closeBtn);

        const body = document.createElement('div');
        body.className = 'ap-body';

        body.append(
            this._makeSelect('areaType',          'Area Type',            ['gross-building-area','rentable-area','usable-area','net-area']),
            this._makeSelect('unit',               'Measurement Unit',     ['m²','ft²','sf']),
            this._makeSelect('computationMethod',  'Computation Method',   ['finish-face','center-of-walls','exterior-face']),
            this._makeNumberInput('wallFaceOffset','Wall Face Offset (mm)', 0, 200),
            this._makeDivider(),
            this._makeTextInput('upperLimit',      'Upper Limit'),
            this._makeNumberInput('upperOffset',   'Upper Offset (mm)',   -5000, 5000),
            this._makeNumberInput('lowerOffset',   'Lower Offset (mm)',   -5000, 5000),
            this._makeDivider(),
            this._makeComputedCheckbox(),
        );

        panel.append(styleTag, header, body);
        return panel;
    }

    private _makeSelect(field: keyof AreaPanelState, label: string, options: string[]): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'ap-field';
        const lbl = document.createElement('label');
        lbl.className   = 'ap-label';
        lbl.textContent = label;
        const sel = document.createElement('select');
        sel.className = 'ap-select';
        sel.setAttribute('data-ap-field', field);
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = o;
            sel.append(opt);
        });
        sel.value = String(this._state[field]);
        sel.addEventListener('change', () => {
            this.setState({ [field]: sel.value } as Partial<AreaPanelState>);
        });
        wrap.append(lbl, sel);
        return wrap;
    }

    private _makeTextInput(field: keyof AreaPanelState, label: string): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'ap-field';
        const lbl = document.createElement('label');
        lbl.className   = 'ap-label';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.className = 'ap-input';
        inp.type      = 'text';
        inp.setAttribute('data-ap-field', field);
        inp.value = String(this._state[field]);
        inp.addEventListener('change', () => {
            this.setState({ [field]: inp.value } as Partial<AreaPanelState>);
        });
        wrap.append(lbl, inp);
        return wrap;
    }

    private _makeNumberInput(field: keyof AreaPanelState, label: string, min: number, max: number): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'ap-field';
        const lbl = document.createElement('label');
        lbl.className   = 'ap-label';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.className = 'ap-input';
        inp.type  = 'number';
        inp.min   = String(min);
        inp.max   = String(max);
        inp.step  = '1';
        inp.setAttribute('data-ap-field', field);
        inp.value = String(this._state[field]);
        inp.addEventListener('change', () => {
            this.setState({ [field]: Number(inp.value) } as Partial<AreaPanelState>);
        });
        wrap.append(lbl, inp);
        return wrap;
    }

    private _makeComputedCheckbox(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'ap-computed-row';
        const cb = document.createElement('input');
        cb.type      = 'checkbox';
        cb.className = 'ap-checkbox';
        cb.setAttribute('data-ap-field', 'isComputed');
        cb.checked = this._state.isComputed;
        cb.addEventListener('change', () => this.setState({ isComputed: cb.checked }));
        const lbl = document.createElement('span');
        lbl.className   = 'ap-computed-label';
        lbl.textContent = 'Computed (auto-recalculate)';
        row.append(cb, lbl);
        return row;
    }

    private _makeDivider(): HTMLElement {
        const d = document.createElement('div');
        d.className = 'ap-section-divider';
        return d;
    }

    private _sync(): void {
        this.element.querySelectorAll('[data-ap-field]').forEach(el => {
            const key = el.getAttribute('data-ap-field') as keyof AreaPanelState;
            const val = this._state[key];
            if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') {
                    (el as HTMLInputElement).checked = Boolean(val);
                } else {
                    el.value = String(val);
                }
            }
        });
    }
}
