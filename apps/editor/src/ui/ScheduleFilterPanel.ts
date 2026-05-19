/**
 * ScheduleFilterPanel — Wave 6 Phase B (wave-6-b-d5)
 *
 * BIM schedule filter rule editor: field, operator, value, case sensitivity,
 * and filter set management (AND/OR logic).
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.scheduleFilter` + CustomEvent for backward compat.
 *   Phase E.schedule.S → runtime.stores.schedule.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.schedule.S): migrate → runtime.bus.executeCommand('schedule.filter.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const SCHEDULE_FILTER_PANEL_ID = 'schedule-filter-panel' as const;

export type FilterOperator =
    | 'equals' | 'not-equals'
    | 'greater-than' | 'less-than'
    | 'greater-or-equal' | 'less-or-equal'
    | 'contains' | 'not-contains'
    | 'begins-with' | 'ends-with';

export type FilterSetLogic = 'and' | 'or';

export interface ScheduleFilterState {
    filterField: string;
    operator: FilterOperator;
    filterValue: string;
    caseSensitive: boolean;
    filterSetLogic: FilterSetLogic;
    enabled: boolean;
}

const DEFAULT_FILTER_STATE: ScheduleFilterState = {
    filterField: '',
    operator: 'equals',
    filterValue: '',
    caseSensitive: false,
    filterSetLogic: 'and',
    enabled: true,
};

const SFLP_STYLES = `
.sflp-panel {
    position:fixed; top:56px; right:296px; width:260px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.sflp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.sflp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.sflp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.sflp-close-btn:hover { color:var(--app-text,#333); }
.sflp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.sflp-field { display:flex; flex-direction:column; gap:3px; }
.sflp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.sflp-input,.sflp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.sflp-checkbox-row { display:flex; align-items:center; gap:8px; }
.sflp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.sflp-apply-btn:hover { opacity:.88; }
`;

export class ScheduleFilterPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: ScheduleFilterState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_FILTER_STATE };
        if (!runtime) {
            console.warn('[ScheduleFilterPanel] runtime is null — panel binding skipped. (wave-6-b-d5)');
        }
        this.element = document.createElement('div');
        this.element.className = 'sflp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Schedule Filter', elementType: 'schedule-filter' };
            this.runtime.viewRegistry.activatePanel(SCHEDULE_FILTER_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SCHEDULE_FILTER_PANEL_ID);
    }

    public setState(state: Partial<ScheduleFilterState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): ScheduleFilterState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-sflp-styles', '1');
        s.textContent = SFLP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'sflp-header';
        const title = document.createElement('span');
        title.className = 'sflp-title';
        title.textContent = 'Schedule Filter';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sflp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'sflp-body';
        body.setAttribute('data-sflp-body', '1');

        body.appendChild(this._makeInput('filterField', 'Filter Field'));
        body.appendChild(this._makeSelect('operator', 'Operator', [
            { value: 'equals',           label: 'Equals' },
            { value: 'not-equals',       label: 'Not Equals' },
            { value: 'greater-than',     label: 'Greater Than' },
            { value: 'less-than',        label: 'Less Than' },
            { value: 'greater-or-equal', label: 'Greater or Equal' },
            { value: 'less-or-equal',    label: 'Less or Equal' },
            { value: 'contains',         label: 'Contains' },
            { value: 'not-contains',     label: 'Does Not Contain' },
            { value: 'begins-with',      label: 'Begins With' },
            { value: 'ends-with',        label: 'Ends With' },
        ]));
        body.appendChild(this._makeInput('filterValue', 'Filter Value'));
        body.appendChild(this._makeSelect('filterSetLogic', 'Filter Set Logic', [
            { value: 'and', label: 'AND (All rules must match)' },
            { value: 'or',  label: 'OR (Any rule must match)' },
        ]));
        body.appendChild(this._makeCheckbox('caseSensitive', 'Case Sensitive'));
        body.appendChild(this._makeCheckbox('enabled', 'Filter Enabled'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'sflp-apply-btn';
        applyBtn.textContent = 'Apply Filter';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeInput(key: keyof ScheduleFilterState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sflp-field';
        const lbl = document.createElement('label'); lbl.className = 'sflp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sflp-input';
        inp.value = String(this._state[key]); inp.setAttribute('data-sflp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeSelect(key: keyof ScheduleFilterState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sflp-field';
        const lbl = document.createElement('label'); lbl.className = 'sflp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'sflp-select'; sel.setAttribute('data-sflp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeCheckbox(key: keyof ScheduleFilterState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sflp-field sflp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]); inp.setAttribute('data-sflp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'sflp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-sflp-body]');
        if (!body) return;
        body.querySelectorAll('[data-sflp-field]').forEach(el => {
            const key = el.getAttribute('data-sflp-field') as keyof ScheduleFilterState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-sflp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-sflp-field]').forEach(el => {
            const key = el.getAttribute('data-sflp-field') as keyof ScheduleFilterState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string, unknown>)[key] = el.checked;
                else (next as Record<string, unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string, unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.scheduleFilter = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.schedule.S (TASK-15)
    }
}
