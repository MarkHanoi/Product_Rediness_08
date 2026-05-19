/**
 * SchedulePanel — Wave 6 Phase B (wave-6-b-d5)
 *
 * BIM schedule properties panel: schedule type, category, phase, fields
 * visibility, grand-total display, and itemisation toggles.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.scheduleConfig` + CustomEvent for backward compat.
 *   Phase E.schedule.S → runtime.stores.schedule.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.schedule.S): migrate → runtime.stores.schedule
 * TODO(E.schedule.S): replace CustomEvent → runtime.bus.executeCommand('schedule.config.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const SCHEDULE_PANEL_ID = 'schedule-panel' as const;

export type ScheduleType = 'element' | 'key' | 'material' | 'sheet-list' | 'note-block' | 'view-list';
export type SchedulePhase = 'existing' | 'new-construction' | 'demolition';

export interface ScheduleConfig {
    scheduleType: ScheduleType;
    category: string;
    phase: SchedulePhase;
    showGrandTotal: boolean;
    itemiseByLevel: boolean;
    itemiseByPhase: boolean;
    blankRowsBetweenItems: boolean;
}

const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
    scheduleType: 'element',
    category: 'Walls',
    phase: 'new-construction',
    showGrandTotal: true,
    itemiseByLevel: false,
    itemiseByPhase: false,
    blankRowsBetweenItems: false,
};

const SP_STYLES = `
.sp-panel {
    position:fixed; top:56px; right:8px; width:280px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.sp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.sp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.sp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.sp-close-btn:hover { color:var(--app-text,#333); }
.sp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.sp-field { display:flex; flex-direction:column; gap:3px; }
.sp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.sp-input,.sp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.sp-checkbox-row { display:flex; align-items:center; gap:8px; }
.sp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.sp-apply-btn:hover { opacity:.88; }
`;

export class SchedulePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _config: ScheduleConfig;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._config = { ...DEFAULT_SCHEDULE_CONFIG };
        if (!runtime) {
            console.warn('[SchedulePanel] runtime is null — panel binding skipped. (wave-6-b-d5)');
        }
        this.element = document.createElement('div');
        this.element.className = 'sp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Schedule Panel', elementType: 'schedule' };
            this.runtime.viewRegistry.activatePanel(SCHEDULE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SCHEDULE_PANEL_ID);
    }

    public setState(config: Partial<ScheduleConfig>): void {
        this._config = { ...this._config, ...config };
        this._syncFormToState();
    }

    public getState(): ScheduleConfig { return { ...this._config }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-sp-styles', '1');
        s.textContent = SP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'sp-header';
        const title = document.createElement('span');
        title.className = 'sp-title';
        title.textContent = 'Schedule Properties';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'sp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'sp-body';
        body.setAttribute('data-sp-body', '1');

        body.appendChild(this._makeSelect('scheduleType', 'Schedule Type', [
            { value: 'element',     label: 'Schedule / Quantities' },
            { value: 'key',         label: 'Schedule Key' },
            { value: 'material',    label: 'Material Takeoff' },
            { value: 'sheet-list',  label: 'Sheet List' },
            { value: 'note-block',  label: 'Note Block' },
            { value: 'view-list',   label: 'View List' },
        ]));

        body.appendChild(this._makeInput('category', 'Category'));
        body.appendChild(this._makeSelect('phase', 'Phase', [
            { value: 'existing',          label: 'Existing' },
            { value: 'new-construction',  label: 'New Construction' },
            { value: 'demolition',        label: 'Demolition' },
        ]));

        body.appendChild(this._makeCheckbox('showGrandTotal',         'Show Grand Total'));
        body.appendChild(this._makeCheckbox('itemiseByLevel',          'Itemise by Level'));
        body.appendChild(this._makeCheckbox('itemiseByPhase',          'Itemise by Phase'));
        body.appendChild(this._makeCheckbox('blankRowsBetweenItems',   'Blank Rows Between Items'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'sp-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeSelect(key: keyof ScheduleConfig, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sp-field';
        const lbl = document.createElement('label'); lbl.className = 'sp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'sp-select'; sel.setAttribute('data-sp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._config[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeInput(key: keyof ScheduleConfig, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sp-field';
        const lbl = document.createElement('label'); lbl.className = 'sp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sp-input';
        inp.value = String(this._config[key]); inp.setAttribute('data-sp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeCheckbox(key: keyof ScheduleConfig, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'sp-field sp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._config[key]); inp.setAttribute('data-sp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'sp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-sp-body]');
        if (!body) return;
        body.querySelectorAll('[data-sp-field]').forEach(el => {
            const key = el.getAttribute('data-sp-field') as keyof ScheduleConfig;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._config[key]);
                else el.value = String(this._config[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._config[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-sp-body]');
        if (!body) return;
        const next = { ...this._config };
        body.querySelectorAll('[data-sp-field]').forEach(el => {
            const key = el.getAttribute('data-sp-field') as keyof ScheduleConfig;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string, unknown>)[key] = el.checked;
                else (next as Record<string, unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string, unknown>)[key] = el.value;
            }
        });
        this._config = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.scheduleConfig = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.schedule.S (TASK-15)
    }
}
