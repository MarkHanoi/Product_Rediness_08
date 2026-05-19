/**
 * ScheduleSortPanel — Wave 6 Phase B (wave-6-b-d5)
 *
 * BIM schedule sort/group editor: sort field, sort order, group header/footer
 * display, grand total row, and blank line between groups.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.scheduleSort` + CustomEvent for backward compat.
 *   Phase E.schedule.S → runtime.stores.schedule.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.schedule.S): migrate → runtime.bus.executeCommand('schedule.sort.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const SCHEDULE_SORT_PANEL_ID = 'schedule-sort-panel' as const;

export type SortOrder = 'ascending' | 'descending';

export interface ScheduleSortState {
    sortField: string;
    sortOrder: SortOrder;
    groupBy: boolean;
    showGroupHeader: boolean;
    showGroupFooter: boolean;
    showGrandTotal: boolean;
    blankLineBetweenGroups: boolean;
}

const DEFAULT_SORT_STATE: ScheduleSortState = {
    sortField: '',
    sortOrder: 'ascending',
    groupBy: false,
    showGroupHeader: true,
    showGroupFooter: false,
    showGrandTotal: true,
    blankLineBetweenGroups: false,
};

const SSP_STYLES = `
.ssp-panel {
    position:fixed; top:56px; right:296px; width:260px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.ssp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.ssp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.ssp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.ssp-close-btn:hover { color:var(--app-text,#333); }
.ssp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.ssp-field { display:flex; flex-direction:column; gap:3px; }
.ssp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.ssp-input,.ssp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.ssp-checkbox-row { display:flex; align-items:center; gap:8px; }
.ssp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.ssp-apply-btn:hover { opacity:.88; }
`;

export class ScheduleSortPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: ScheduleSortState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_SORT_STATE };
        if (!runtime) {
            console.warn('[ScheduleSortPanel] runtime is null — panel binding skipped. (wave-6-b-d5)');
        }
        this.element = document.createElement('div');
        this.element.className = 'ssp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Schedule Sort', elementType: 'schedule-sort' };
            this.runtime.viewRegistry.activatePanel(SCHEDULE_SORT_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SCHEDULE_SORT_PANEL_ID);
    }

    public setState(state: Partial<ScheduleSortState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): ScheduleSortState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-ssp-styles', '1');
        s.textContent = SSP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'ssp-header';
        const title = document.createElement('span');
        title.className = 'ssp-title';
        title.textContent = 'Schedule Sort / Group';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ssp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'ssp-body';
        body.setAttribute('data-ssp-body', '1');

        body.appendChild(this._makeInput('sortField', 'Sort Field'));
        body.appendChild(this._makeSelect('sortOrder', 'Sort Order', [
            { value: 'ascending',  label: 'Ascending (A → Z)' },
            { value: 'descending', label: 'Descending (Z → A)' },
        ]));
        body.appendChild(this._makeCheckbox('groupBy',               'Group By This Field'));
        body.appendChild(this._makeCheckbox('showGroupHeader',        'Show Group Header'));
        body.appendChild(this._makeCheckbox('showGroupFooter',        'Show Group Footer'));
        body.appendChild(this._makeCheckbox('showGrandTotal',         'Show Grand Total Row'));
        body.appendChild(this._makeCheckbox('blankLineBetweenGroups', 'Blank Line Between Groups'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'ssp-apply-btn';
        applyBtn.textContent = 'Apply Sort';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeInput(key: keyof ScheduleSortState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'ssp-field';
        const lbl = document.createElement('label'); lbl.className = 'ssp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'ssp-input';
        inp.value = String(this._state[key]); inp.setAttribute('data-ssp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeSelect(key: keyof ScheduleSortState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'ssp-field';
        const lbl = document.createElement('label'); lbl.className = 'ssp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'ssp-select'; sel.setAttribute('data-ssp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeCheckbox(key: keyof ScheduleSortState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'ssp-field ssp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]); inp.setAttribute('data-ssp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'ssp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-ssp-body]');
        if (!body) return;
        body.querySelectorAll('[data-ssp-field]').forEach(el => {
            const key = el.getAttribute('data-ssp-field') as keyof ScheduleSortState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-ssp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-ssp-field]').forEach(el => {
            const key = el.getAttribute('data-ssp-field') as keyof ScheduleSortState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string, unknown>)[key] = el.checked;
                else (next as Record<string, unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string, unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.scheduleSort = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.schedule.S (TASK-15)
    }
}
