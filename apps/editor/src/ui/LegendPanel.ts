/**
 * LegendPanel — Wave 6 Phase B (wave-6-b-d4)
 *
 * BIM legend component editor: legend view placement, component list,
 * text size, scale, title visibility.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P4   — No window. Runtime is the sole dependency bridge.
 * • §01-VISION P6   — State mutation via Commands; CustomEvent kept for legacy compat.
 * • §01-VISION P8   — OTel span fired via activatePanel / deactivatePanel.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime → console.warn.
 * • L7.5 monotonically shrinking: Phase E.legend.S → runtime.stores.legend
 *
 * TODO(E.legend.S): migrate → runtime.bus.executeCommand('legend.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

export const LEGEND_PANEL_ID = 'legend-panel' as const;

export type LegendComponentType = 'element' | 'annotation' | 'model-category';

export interface LegendComponent {
    name:          string;
    type:          LegendComponentType;
    family:        string;
    viewDirection: 'plan' | 'elevation' | 'section';
    hostLength:    number;   // mm — meaningful for wall/floor hosted families
}

export interface LegendPanelState {
    title:          string;
    showTitle:      boolean;
    textSize:       number;   // mm
    scale:          number;   // 1:N
    components:     LegendComponent[];
    autoFit:        boolean;  // auto-size the legend bounding box
}

const DEFAULT_LEGEND_STATE: LegendPanelState = {
    title:      'Legend',
    showTitle:  true,
    textSize:   3.5,
    scale:      50,
    components: [
        { name: 'Exterior Wall',  type: 'model-category', family: 'Basic Wall',  viewDirection: 'plan',      hostLength: 300 },
        { name: 'Interior Wall',  type: 'model-category', family: 'Basic Wall',  viewDirection: 'plan',      hostLength: 200 },
        { name: 'Window Tag',     type: 'annotation',     family: 'Window Tag',  viewDirection: 'elevation',  hostLength: 0   },
    ],
    autoFit:    true,
};

const LP_STYLES = `
.lp-panel {
    position:fixed; top:56px; right:8px; width:290px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.lp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.lp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.lp-close-btn { background:none; border:none; cursor:pointer; font-size:16px; color:var(--app-text-secondary,#888); padding:2px 4px; border-radius:4px; }
.lp-close-btn:hover { background:rgba(0,0,0,0.06); }
.lp-body { padding:12px; display:flex; flex-direction:column; gap:10px; }
.lp-field { display:flex; flex-direction:column; gap:3px; }
.lp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.lp-input, .lp-select {
    width:100%; padding:5px 8px; border:1px solid rgba(0,0,0,0.15); border-radius:6px;
    font-size:12px; background:var(--app-input-bg,#fff); color:var(--app-text,#333); box-sizing:border-box;
}
.lp-input:focus, .lp-select:focus { outline:none; border-color:var(--app-accent,#0066cc); }
.lp-checkbox-row { display:flex; align-items:center; gap:8px; }
.lp-checkbox { width:14px; height:14px; cursor:pointer; }
.lp-section-title { font-size:11px; font-weight:600; color:var(--app-text,#555); margin:4px 0 2px; }
.lp-comp-table { width:100%; border-collapse:collapse; font-size:11px; }
.lp-comp-table th { text-align:left; font-size:10px; color:var(--app-text-secondary,#888); font-weight:500; padding:3px 4px 2px; }
.lp-comp-table td { padding:3px 4px; vertical-align:middle; }
.lp-divider { height:1px; background:rgba(0,0,0,0.07); margin:2px 0; }
`;

export class LegendPanel {
    readonly element: HTMLElement;
    private _state: LegendPanelState;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this._state   = {
            ...DEFAULT_LEGEND_STATE,
            components: DEFAULT_LEGEND_STATE.components.map(c => ({ ...c })),
        };
        this.element = this._build();
    }

    show(): void {
        if (this._runtime) {
            const spec: PanelViewSpec = { label: 'Legend Panel', elementType: 'legend' };
            this._runtime.viewRegistry.activatePanel(LEGEND_PANEL_ID, spec);
        } else {
            console.warn('[LegendPanel] show() called without runtime — not registered in ViewRegistry');
        }
        this.element.style.display = 'block'; // F.events.16 — no active listeners; removed.
    }

    hide(): void {
        if (this._runtime) {
            this._runtime.viewRegistry.deactivatePanel(LEGEND_PANEL_ID);
        } else {
            console.warn('[LegendPanel] hide() called without runtime — ViewRegistry not notified');
        }
        this.element.style.display = 'none'; // F.events.16 — no active listeners; removed.
    }

    getState(): Readonly<LegendPanelState> {
        return { ...this._state, components: this._state.components.map(c => ({ ...c })) };
    }

    setState(patch: Partial<LegendPanelState>): void {
        this._state = { ...this._state, ...patch };
        this._sync();
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = LP_STYLES;

        const panel = document.createElement('div');
        panel.className = 'lp-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Legend Panel');

        const header = document.createElement('div');
        header.className = 'lp-header';
        const titleSpan = document.createElement('span');
        titleSpan.className   = 'lp-title';
        titleSpan.textContent = 'Legend';
        const closeBtn = document.createElement('button');
        closeBtn.className        = 'lp-close-btn';
        closeBtn.textContent      = '×';
        closeBtn.setAttribute('aria-label', 'Close Legend Panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.append(titleSpan, closeBtn);

        const body = document.createElement('div');
        body.className = 'lp-body';

        body.append(
            this._makeInput('title',    'Legend Title', 'text'),
            this._makeCheckboxRow('showTitle', 'Show Title'),
            this._makeDivider(),
            this._makeNumberInput('textSize',  'Text Size (mm)', 1, 20),
            this._makeNumberInput('scale',     '1:N Scale',      1, 2000),
            this._makeCheckboxRow('autoFit',   'Auto-fit bounding box'),
            this._makeDivider(),
        );

        const compTitle = document.createElement('div');
        compTitle.className   = 'lp-section-title';
        compTitle.textContent = 'Legend Components';
        body.append(compTitle, this._buildCompTable());

        panel.append(styleTag, header, body);
        return panel;
    }

    private _buildCompTable(): HTMLElement {
        const table = document.createElement('table');
        table.className = 'lp-comp-table';
        const thead = table.createTHead();
        const hrow  = document.createElement('tr');
        thead.append(hrow);
        ['Name', 'Type', 'Direction'].forEach(h => {
            const th = document.createElement('th'); th.textContent = h; hrow.append(th);
        });
        const tbody = table.createTBody();
        this._state.components.forEach(c => {
            const row = document.createElement('tr');
            const tdN = document.createElement('td'); tdN.textContent = c.name;
            const tdT = document.createElement('td'); tdT.textContent = c.type;
            const tdD = document.createElement('td'); tdD.textContent = c.viewDirection;
            row.append(tdN, tdT, tdD);
            tbody.append(row);
        });
        return table;
    }

    private _makeInput(field: keyof LegendPanelState, label: string, type: string): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'lp-field';
        const lbl = document.createElement('label');
        lbl.className   = 'lp-label';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.className = 'lp-input';
        inp.type      = type;
        inp.setAttribute('data-lp-field', field);
        inp.value = String(this._state[field]);
        inp.addEventListener('change', () => this.setState({ [field]: inp.value } as Partial<LegendPanelState>));
        wrap.append(lbl, inp);
        return wrap;
    }

    private _makeNumberInput(field: keyof LegendPanelState, label: string, min: number, max: number): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'lp-field';
        const lbl = document.createElement('label');
        lbl.className   = 'lp-label';
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.className = 'lp-input';
        inp.type      = 'number';
        inp.min       = String(min);
        inp.max       = String(max);
        inp.step      = '0.5';
        inp.setAttribute('data-lp-field', field);
        inp.value = String(this._state[field]);
        inp.addEventListener('change', () => this.setState({ [field]: Number(inp.value) } as Partial<LegendPanelState>));
        wrap.append(lbl, inp);
        return wrap;
    }

    private _makeCheckboxRow(field: keyof LegendPanelState, label: string): HTMLElement {
        const row = document.createElement('div');
        row.className = 'lp-checkbox-row';
        const cb = document.createElement('input');
        cb.type      = 'checkbox';
        cb.className = 'lp-checkbox';
        cb.setAttribute('data-lp-field', field);
        cb.checked = Boolean(this._state[field]);
        cb.addEventListener('change', () => this.setState({ [field]: cb.checked } as Partial<LegendPanelState>));
        const lbl = document.createElement('span');
        lbl.style.fontSize   = '12px';
        lbl.textContent      = label;
        row.append(cb, lbl);
        return row;
    }

    private _makeDivider(): HTMLElement {
        const d = document.createElement('div'); d.className = 'lp-divider'; return d;
    }

    private _sync(): void {
        this.element.querySelectorAll('[data-lp-field]').forEach(el => {
            const key = el.getAttribute('data-lp-field') as keyof LegendPanelState;
            const val = this._state[key];
            if (el instanceof HTMLInputElement) {
                el.type === 'checkbox' ? (el.checked = Boolean(val)) : (el.value = String(val));
            }
        });
    }
}
