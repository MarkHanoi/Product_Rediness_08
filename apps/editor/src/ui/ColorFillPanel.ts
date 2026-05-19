/**
 * ColorFillPanel — Wave 6 Phase B (wave-6-b-d4)
 *
 * BIM color fill override editor: element-category color scheme, fill solid/pattern
 * overrides per category, transparency, fill scheme active toggle.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P4   — No window. Runtime is the sole dependency bridge.
 * • §01-VISION P6   — State mutation via Commands; CustomEvent kept for legacy compat.
 * • §01-VISION P8   — OTel span fired via activatePanel / deactivatePanel.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime → console.warn.
 * • L7.5 monotonically shrinking: Phase E.colorfill.S → runtime.stores.colorFill
 *
 * TODO(E.colorfill.S): migrate → runtime.bus.executeCommand('color-fill.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

export const COLOR_FILL_PANEL_ID = 'color-fill-panel' as const;

export interface ColorFillEntry {
    category:     string;   // e.g. "Walls", "Floors", "Ceilings"
    fillColor:    string;   // hex
    lineColor:    string;   // hex
    transparency: number;   // 0–100 %
    visible:      boolean;
}

export interface ColorFillPanelState {
    schemeName:    string;
    isActive:      boolean;
    entries:       ColorFillEntry[];
    background:    string;   // hex — colour of areas not covered by any category
}

const DEFAULT_CF_ENTRIES: ColorFillEntry[] = [
    { category: 'Walls',     fillColor: '#c0c0c0', lineColor: '#000000', transparency: 0,  visible: true },
    { category: 'Floors',    fillColor: '#e8d5a3', lineColor: '#000000', transparency: 0,  visible: true },
    { category: 'Ceilings',  fillColor: '#f0f0f0', lineColor: '#666666', transparency: 20, visible: true },
    { category: 'Columns',   fillColor: '#8c8c8c', lineColor: '#000000', transparency: 0,  visible: true },
    { category: 'Furniture', fillColor: '#ffd700', lineColor: '#333333', transparency: 10, visible: false },
];

const DEFAULT_CF_STATE: ColorFillPanelState = {
    schemeName: 'Default Color Fill',
    isActive:   false,
    entries:    DEFAULT_CF_ENTRIES,
    background: '#ffffff',
};

const CFP_STYLES = `
.cfp-panel {
    position:fixed; top:56px; right:8px; width:310px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.cfp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.cfp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.cfp-close-btn { background:none; border:none; cursor:pointer; font-size:16px; color:var(--app-text-secondary,#888); padding:2px 4px; border-radius:4px; }
.cfp-close-btn:hover { background:rgba(0,0,0,0.06); }
.cfp-body { padding:12px; display:flex; flex-direction:column; gap:10px; }
.cfp-field { display:flex; flex-direction:column; gap:3px; }
.cfp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.cfp-input {
    width:100%; padding:5px 8px; border:1px solid rgba(0,0,0,0.15); border-radius:6px;
    font-size:12px; background:var(--app-input-bg,#fff); color:var(--app-text,#333); box-sizing:border-box;
}
.cfp-input:focus { outline:none; border-color:var(--app-accent,#0066cc); }
.cfp-active-row { display:flex; align-items:center; gap:8px; }
.cfp-checkbox { width:14px; height:14px; cursor:pointer; }
.cfp-section-title { font-size:11px; font-weight:600; color:var(--app-text,#555); margin:4px 0 2px; }
.cfp-table { width:100%; border-collapse:collapse; font-size:11px; }
.cfp-table th { text-align:left; font-size:10px; color:var(--app-text-secondary,#888); font-weight:500; padding:3px 4px 2px; }
.cfp-table td { padding:3px 4px; vertical-align:middle; }
.cfp-swatch {
    display:inline-block; width:16px; height:16px; border-radius:3px;
    border:1px solid rgba(0,0,0,0.2); cursor:pointer; vertical-align:middle;
}
`;

export class ColorFillPanel {
    readonly element: HTMLElement;
    private _state: ColorFillPanelState;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this._state   = { ...DEFAULT_CF_STATE, entries: DEFAULT_CF_ENTRIES.map(e => ({ ...e })) };
        this.element  = this._build();
    }

    show(): void {
        if (this._runtime) {
            const spec: PanelViewSpec = { label: 'Color Fill Panel', elementType: 'color-fill' };
            this._runtime.viewRegistry.activatePanel(COLOR_FILL_PANEL_ID, spec);
        } else {
            console.warn('[ColorFillPanel] show() called without runtime — not registered in ViewRegistry');
        }
        this.element.style.display = 'block'; // F.events.16 — no active listeners; removed.
    }

    hide(): void {
        if (this._runtime) {
            this._runtime.viewRegistry.deactivatePanel(COLOR_FILL_PANEL_ID);
        } else {
            console.warn('[ColorFillPanel] hide() called without runtime — ViewRegistry not notified');
        }
        this.element.style.display = 'none'; // F.events.16 — no active listeners; removed.
    }

    getState(): Readonly<ColorFillPanelState> {
        return { ...this._state, entries: this._state.entries.map(e => ({ ...e })) };
    }

    setState(patch: Partial<ColorFillPanelState>): void {
        this._state = { ...this._state, ...patch };
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = CFP_STYLES;

        const panel = document.createElement('div');
        panel.className = 'cfp-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Color Fill Panel');

        const header = document.createElement('div');
        header.className = 'cfp-header';
        const title = document.createElement('span');
        title.className   = 'cfp-title';
        title.textContent = 'Color Fill';
        const closeBtn = document.createElement('button');
        closeBtn.className        = 'cfp-close-btn';
        closeBtn.textContent      = '×';
        closeBtn.setAttribute('aria-label', 'Close Color Fill Panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.append(title, closeBtn);

        const body = document.createElement('div');
        body.className = 'cfp-body';

        // Scheme name
        const nameWrap = document.createElement('div');
        nameWrap.className = 'cfp-field';
        const nameLbl = document.createElement('label');
        nameLbl.className   = 'cfp-label';
        nameLbl.textContent = 'Scheme Name';
        const nameInp = document.createElement('input');
        nameInp.className = 'cfp-input';
        nameInp.type      = 'text';
        nameInp.setAttribute('data-cfp-field', 'schemeName');
        nameInp.value = this._state.schemeName;
        nameInp.addEventListener('change', () => this.setState({ schemeName: nameInp.value }));
        nameWrap.append(nameLbl, nameInp);
        body.append(nameWrap);

        // Active toggle
        const activeRow = document.createElement('div');
        activeRow.className = 'cfp-active-row';
        const activeCb = document.createElement('input');
        activeCb.type      = 'checkbox';
        activeCb.className = 'cfp-checkbox';
        activeCb.setAttribute('data-cfp-field', 'isActive');
        activeCb.checked = this._state.isActive;
        activeCb.addEventListener('change', () => this.setState({ isActive: activeCb.checked }));
        const activeLbl = document.createElement('span');
        activeLbl.style.fontSize   = '12px';
        activeLbl.textContent      = 'Apply color fill in this view';
        activeRow.append(activeCb, activeLbl);
        body.append(activeRow);

        // Background colour
        const bgWrap = document.createElement('div');
        bgWrap.className = 'cfp-field';
        const bgLbl = document.createElement('label');
        bgLbl.className   = 'cfp-label';
        bgLbl.textContent = 'Background Color';
        const bgInp = document.createElement('input');
        bgInp.className = 'cfp-input';
        bgInp.type      = 'color';
        bgInp.setAttribute('data-cfp-field', 'background');
        bgInp.value = this._state.background;
        bgInp.addEventListener('change', () => this.setState({ background: bgInp.value }));
        bgWrap.append(bgLbl, bgInp);
        body.append(bgWrap);

        // Category table
        const secTitle = document.createElement('div');
        secTitle.className   = 'cfp-section-title';
        secTitle.textContent = 'Category Overrides';
        body.append(secTitle, this._buildTable());

        panel.append(styleTag, header, body);
        return panel;
    }

    private _buildTable(): HTMLElement {
        const table = document.createElement('table');
        table.className = 'cfp-table';

        const thead = document.createElement('thead');
        const hrow  = document.createElement('tr');
        ['Category', 'Fill', 'Line', 'Trans%', 'Vis'].forEach(h => {
            const th = document.createElement('th'); th.textContent = h; hrow.append(th);
        });
        thead.append(hrow);
        table.append(thead);

        const tbody = document.createElement('tbody');
        this._state.entries.forEach(entry => {
            const row = document.createElement('tr');

            const tdN = document.createElement('td'); tdN.textContent = entry.category; row.append(tdN);

            const tdF  = document.createElement('td');
            const swF  = document.createElement('span');
            swF.className = 'cfp-swatch';
            swF.style.background = entry.fillColor;
            swF.setAttribute('data-cfp-fill-cat', entry.category);
            swF.title = entry.fillColor;
            tdF.append(swF);
            row.append(tdF);

            const tdL  = document.createElement('td');
            const swL  = document.createElement('span');
            swL.className = 'cfp-swatch';
            swL.style.background = entry.lineColor;
            swL.setAttribute('data-cfp-line-cat', entry.category);
            swL.title = entry.lineColor;
            tdL.append(swL);
            row.append(tdL);

            const tdT = document.createElement('td'); tdT.textContent = String(entry.transparency); row.append(tdT);
            const tdV = document.createElement('td');
            const cb  = document.createElement('input');
            cb.type    = 'checkbox';
            cb.className = 'cfp-checkbox';
            cb.setAttribute('data-cfp-vis-cat', entry.category);
            cb.checked = entry.visible;
            tdV.append(cb);
            row.append(tdV);
            tbody.append(row);
        });
        table.append(tbody);
        return table;
    }
}
