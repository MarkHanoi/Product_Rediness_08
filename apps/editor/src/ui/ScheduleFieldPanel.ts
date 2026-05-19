/**
 * ScheduleFieldPanel — Wave 6 Phase B (wave-6-b-d5)
 *
 * BIM schedule field editor: add/remove/reorder schedule fields,
 * set heading text, column width, alignment, and computed field formula.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.scheduleField` + CustomEvent for backward compat.
 *   Phase E.schedule.S → runtime.stores.schedule.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.schedule.S): migrate → runtime.bus.executeCommand('schedule.field.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const SCHEDULE_FIELD_PANEL_ID = 'schedule-field-panel' as const;

export type FieldAlignment = 'left' | 'center' | 'right';

export interface ScheduleFieldState {
    fieldName: string;
    heading: string;
    columnWidth: number;     // mm
    alignment: FieldAlignment;
    isComputed: boolean;
    formula: string;
    showTotals: boolean;
    calculateTotals: boolean;
}

const DEFAULT_FIELD_STATE: ScheduleFieldState = {
    fieldName: '',
    heading: '',
    columnWidth: 50,
    alignment: 'left',
    isComputed: false,
    formula: '',
    showTotals: false,
    calculateTotals: false,
};

const SFP_STYLES = `
.sfp-panel {
    position:fixed; top:56px; right:296px; width:260px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.sfp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.sfp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.sfp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.sfp-close-btn:hover { color:var(--app-text,#333); }
.sfp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.sfp-field { display:flex; flex-direction:column; gap:3px; }
.sfp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.sfp-input,.sfp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.sfp-checkbox-row { display:flex; align-items:center; gap:8px; }
.sfp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.sfp-apply-btn:hover { opacity:.88; }
`;

export class ScheduleFieldPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: ScheduleFieldState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_FIELD_STATE };
        if (!runtime) {
            console.warn('[ScheduleFieldPanel] runtime is null — panel binding skipped. (wave-6-b-d5)');
        }
        this.element = document.createElement('div');
        this.element.className = 'sfp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Schedule Field', elementType: 'schedule-field' };
            this.runtime.viewRegistry.activatePanel(SCHEDULE_FIELD_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SCHEDULE_FIELD_PANEL_ID);
    }

    public setState(state: Partial<ScheduleFieldState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): ScheduleFieldState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-sfp-styles', '1');
        s.textContent = SFP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'sfp-header';
        const title = document.createElement('span');
        title.className = 'sfp-title';
        title.textContent = 'Schedule Field';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sfp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'sfp-body';
        body.setAttribute('data-sfp-body', '1');

        body.appendChild(this._makeInput('fieldName', 'Field Name'));
        body.appendChild(this._makeInput('heading', 'Column Heading'));
        body.appendChild(this._makeNumber('columnWidth', 'Column Width (mm)', 10, 300, 5));
        body.appendChild(this._makeSelect('alignment', 'Alignment', [
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
        ]));
        body.appendChild(this._makeCheckbox('isComputed',      'Computed Field'));
        body.appendChild(this._makeInput('formula', 'Formula'));
        body.appendChild(this._makeCheckbox('showTotals',      'Show Totals'));
        body.appendChild(this._makeCheckbox('calculateTotals', 'Calculate Totals'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'sfp-apply-btn';
        applyBtn.textContent = 'Apply Field';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeInput(key: keyof ScheduleFieldState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sfp-field';
        const lbl = document.createElement('label'); lbl.className = 'sfp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sfp-input';
        inp.value = String(this._state[key]); inp.setAttribute('data-sfp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeNumber(key: keyof ScheduleFieldState, label: string, min: number, max: number, step: number): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sfp-field';
        const lbl = document.createElement('label'); lbl.className = 'sfp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'sfp-input';
        inp.min = String(min); inp.max = String(max); inp.step = String(step);
        inp.value = String(this._state[key]); inp.setAttribute('data-sfp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeSelect(key: keyof ScheduleFieldState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sfp-field';
        const lbl = document.createElement('label'); lbl.className = 'sfp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'sfp-select'; sel.setAttribute('data-sfp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeCheckbox(key: keyof ScheduleFieldState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sfp-field sfp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]); inp.setAttribute('data-sfp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'sfp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-sfp-body]');
        if (!body) return;
        body.querySelectorAll('[data-sfp-field]').forEach(el => {
            const key = el.getAttribute('data-sfp-field') as keyof ScheduleFieldState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-sfp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-sfp-field]').forEach(el => {
            const key = el.getAttribute('data-sfp-field') as keyof ScheduleFieldState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string, unknown>)[key] = el.checked;
                else if (el.type === 'number') (next as Record<string, unknown>)[key] = parseFloat(el.value) || 0;
                else (next as Record<string, unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string, unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.scheduleField = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.schedule.S (TASK-15)
    }
}
