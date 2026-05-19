/**
 * AreaSchemePanel — Wave 6 Phase B (wave-6-b-d4)
 *
 * BIM area color-scheme editor: scheme name, area-type-to-color mapping,
 * fill pattern, legend visibility.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P4   — No window. Runtime is the sole dependency bridge.
 * • §01-VISION P6   — State mutation via Commands; CustomEvent kept for legacy compat.
 * • §01-VISION P8   — OTel span fired via activatePanel / deactivatePanel.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime → console.warn.
 * • L7.5 monotonically shrinking: Phase E.area.S → runtime.stores.area
 *
 * TODO(E.area.S): migrate → runtime.bus.executeCommand('area-scheme.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

export const AREA_SCHEME_PANEL_ID = 'area-scheme-panel' as const;

export type FillPattern = 'solid' | 'diagonal' | 'cross-hatch' | 'dots';

export interface AreaTypeColorEntry {
    areaType: string;   // e.g. "Office", "Corridor", "Mechanical"
    color:    string;   // hex
    pattern:  FillPattern;
}

export interface AreaSchemePanelState {
    schemeName:    string;
    entries:       AreaTypeColorEntry[];
    showLegend:    boolean;
    legendPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

const DEFAULT_ENTRIES: AreaTypeColorEntry[] = [
    { areaType: 'Office',      color: '#4a90d9', pattern: 'solid' },
    { areaType: 'Corridor',    color: '#f5a623', pattern: 'solid' },
    { areaType: 'Mechanical',  color: '#7ed321', pattern: 'diagonal' },
    { areaType: 'Circulation', color: '#d0021b', pattern: 'solid' },
];

const DEFAULT_ASP_STATE: AreaSchemePanelState = {
    schemeName:     'Default Area Scheme',
    entries:        DEFAULT_ENTRIES,
    showLegend:     true,
    legendPosition: 'bottom-right',
};

const ASP_STYLES = `
.asp-panel {
    position:fixed; top:56px; right:280px; width:300px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.asp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.asp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.asp-close-btn { background:none; border:none; cursor:pointer; font-size:16px; color:var(--app-text-secondary,#888); padding:2px 4px; border-radius:4px; }
.asp-close-btn:hover { background:rgba(0,0,0,0.06); }
.asp-body { padding:12px; display:flex; flex-direction:column; gap:10px; }
.asp-field { display:flex; flex-direction:column; gap:3px; }
.asp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.asp-input, .asp-select {
    width:100%; padding:5px 8px; border:1px solid rgba(0,0,0,0.15); border-radius:6px;
    font-size:12px; background:var(--app-input-bg,#fff); color:var(--app-text,#333);
    box-sizing:border-box;
}
.asp-input:focus, .asp-select:focus { outline:none; border-color:var(--app-accent,#0066cc); }
.asp-entries-table { width:100%; border-collapse:collapse; font-size:12px; }
.asp-entries-table th { text-align:left; font-size:10px; color:var(--app-text-secondary,#888); font-weight:500; padding:4px 4px 2px; }
.asp-entries-table td { padding:3px 4px; }
.asp-color-swatch {
    width:20px; height:20px; border-radius:4px; border:1px solid rgba(0,0,0,0.2);
    cursor:pointer; display:inline-block;
}
.asp-legend-row { display:flex; align-items:center; gap:8px; }
.asp-checkbox { width:14px; height:14px; cursor:pointer; }
.asp-section-title { font-size:11px; font-weight:600; color:var(--app-text,#555); margin:4px 0 2px; }
`;

export class AreaSchemePanel {
    readonly element: HTMLElement;
    private _state: AreaSchemePanelState;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this._state   = { ...DEFAULT_ASP_STATE, entries: DEFAULT_ENTRIES.map(e => ({ ...e })) };
        this.element  = this._build();
    }

    show(): void {
        if (this._runtime) {
            const spec: PanelViewSpec = { label: 'Area Scheme Panel', elementType: 'area-scheme' };
            this._runtime.viewRegistry.activatePanel(AREA_SCHEME_PANEL_ID, spec);
        } else {
            console.warn('[AreaSchemePanel] show() called without runtime — not registered in ViewRegistry');
        }
        this.element.style.display = 'block'; // F.events.16 — no active listeners; removed.
    }

    hide(): void {
        if (this._runtime) {
            this._runtime.viewRegistry.deactivatePanel(AREA_SCHEME_PANEL_ID);
        } else {
            console.warn('[AreaSchemePanel] hide() called without runtime — ViewRegistry not notified');
        }
        this.element.style.display = 'none'; // F.events.16 — no active listeners; removed.
    }

    getState(): Readonly<AreaSchemePanelState> {
        return { ...this._state, entries: this._state.entries.map(e => ({ ...e })) };
    }

    setState(patch: Partial<AreaSchemePanelState>): void {
        this._state = { ...this._state, ...patch };
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = ASP_STYLES;

        const panel = document.createElement('div');
        panel.className = 'asp-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Area Scheme Panel');

        const header = document.createElement('div');
        header.className = 'asp-header';
        const title = document.createElement('span');
        title.className   = 'asp-title';
        title.textContent = 'Area Color Scheme';
        const closeBtn = document.createElement('button');
        closeBtn.className        = 'asp-close-btn';
        closeBtn.textContent      = '×';
        closeBtn.setAttribute('aria-label', 'Close Area Scheme Panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.append(title, closeBtn);

        const body = document.createElement('div');
        body.className = 'asp-body';

        // Scheme name
        const nameField = this._makeInput('schemeName', 'Scheme Name', 'text');
        body.append(nameField);

        // Entries table
        const entriesTitle = document.createElement('div');
        entriesTitle.className   = 'asp-section-title';
        entriesTitle.textContent = 'Area Type → Color Mapping';
        body.append(entriesTitle);
        body.append(this._buildEntriesTable());

        // Legend
        const legendRow = document.createElement('div');
        legendRow.className = 'asp-legend-row';
        const legCb = document.createElement('input');
        legCb.type      = 'checkbox';
        legCb.className = 'asp-checkbox';
        legCb.setAttribute('data-asp-field', 'showLegend');
        legCb.checked = this._state.showLegend;
        legCb.addEventListener('change', () => this.setState({ showLegend: legCb.checked }));
        const legLbl = document.createElement('span');
        legLbl.style.fontSize   = '12px';
        legLbl.textContent      = 'Show Legend';
        legendRow.append(legCb, legLbl);
        body.append(legendRow);

        const posField = this._makeSelect('legendPosition', 'Legend Position',
            ['bottom-right', 'bottom-left', 'top-right', 'top-left']);
        body.append(posField);

        panel.append(styleTag, header, body);
        return panel;
    }

    private _buildEntriesTable(): HTMLElement {
        const table = document.createElement('table');
        table.className = 'asp-entries-table';

        const thead = document.createElement('thead');
        const hrow  = document.createElement('tr');
        ['Type', 'Color', 'Pattern'].forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            hrow.append(th);
        });
        thead.append(hrow);
        table.append(thead);

        const tbody = document.createElement('tbody');
        this._state.entries.forEach(entry => {
            const row = document.createElement('tr');
            const tdN = document.createElement('td'); tdN.textContent = entry.areaType; row.append(tdN);
            const tdC = document.createElement('td');
            const swatch = document.createElement('span');
            swatch.className    = 'asp-color-swatch';
            swatch.style.background = entry.color;
            swatch.setAttribute('data-asp-entry-color', entry.areaType);
            swatch.title = entry.color;
            tdC.append(swatch);
            row.append(tdC);
            const tdP = document.createElement('td'); tdP.textContent = entry.pattern; row.append(tdP);
            tbody.append(row);
        });
        table.append(tbody);
        return table;
    }

    private _makeInput(field: keyof AreaSchemePanelState, label: string, type: string): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'asp-field';
        const lbl = document.createElement('label');
        lbl.className   = 'asp-label';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.className = 'asp-input';
        inp.type      = type;
        inp.setAttribute('data-asp-field', field);
        inp.value = String(this._state[field]);
        inp.addEventListener('change', () => this.setState({ [field]: inp.value } as Partial<AreaSchemePanelState>));
        wrap.append(lbl, inp);
        return wrap;
    }

    private _makeSelect(field: keyof AreaSchemePanelState, label: string, options: string[]): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'asp-field';
        const lbl = document.createElement('label');
        lbl.className   = 'asp-label';
        lbl.textContent = label;
        const sel = document.createElement('select');
        sel.className = 'asp-select';
        sel.setAttribute('data-asp-field', field);
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = o;
            sel.append(opt);
        });
        sel.value = String(this._state[field]);
        sel.addEventListener('change', () => this.setState({ [field]: sel.value } as Partial<AreaSchemePanelState>));
        wrap.append(lbl, sel);
        return wrap;
    }
}
