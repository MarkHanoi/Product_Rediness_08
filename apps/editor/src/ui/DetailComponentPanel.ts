/**
 * DetailComponentPanel — Wave 6 Phase B (wave-6-b-d3)
 *
 * BIM detail component panel: repeating detail patterns, filled regions,
 * insulation, and component placement for construction-document details.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.detailComponent` + CustomEvent for backward compat.
 *   Phase E.annotation.S → runtime.stores.annotation.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('detail-component.place', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const DETAIL_COMPONENT_PANEL_ID = 'detail-component-panel' as const;

export type DetailComponentType = 'repeating-detail' | 'filled-region' | 'insulation' | 'masking-region';
export type FillPattern = 'solid' | 'diagonal' | 'cross-hatch' | 'stone' | 'sand' | 'concrete';

export interface DetailComponentState {
    componentType: DetailComponentType;
    fillPattern: FillPattern;
    fillColor: string;         // CSS hex
    lineWeight: number;        // mm
    scale: number;             // pattern scale multiplier
    rotateDegrees: number;     // 0–360
}

const DEFAULT_DETAIL_COMPONENT: DetailComponentState = {
    componentType: 'filled-region',
    fillPattern: 'solid',
    fillColor: '#cccccc',
    lineWeight: 0.18,
    scale: 1,
    rotateDegrees: 0,
};

const DCP_STYLES = `
.dcp-panel {
    position: fixed; top: 56px; right: 8px; width: 260px;
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font,'Inter',sans-serif); font-size: 13px;
    z-index: 950; display: none; overflow: hidden;
}
.dcp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.dcp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.dcp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.dcp-close-btn:hover { color:var(--app-text,#333); }
.dcp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.dcp-field { display:flex; flex-direction:column; gap:3px; }
.dcp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.dcp-input,.dcp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.dcp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.dcp-apply-btn:hover { opacity:.88; }
`;

export class DetailComponentPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: DetailComponentState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_DETAIL_COMPONENT };
        if (!runtime) {
            console.warn('[DetailComponentPanel] runtime is null — panel binding skipped. (wave-6-b-d3)');
        }
        this.element = document.createElement('div');
        this.element.className = 'dcp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Detail Component Panel', elementType: 'detail' };
            this.runtime.viewRegistry.activatePanel(DETAIL_COMPONENT_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(DETAIL_COMPONENT_PANEL_ID);
    }

    public setState(state: Partial<DetailComponentState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): DetailComponentState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-dcp-styles', '1');
        s.textContent = DCP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'dcp-header';
        const title = document.createElement('span');
        title.className = 'dcp-title';
        title.textContent = 'Detail Component';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'dcp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'dcp-body';
        body.setAttribute('data-dcp-body', '1');

        body.appendChild(this._makeSelect('componentType', 'Component Type', [
            { value: 'repeating-detail', label: 'Repeating Detail' },
            { value: 'filled-region',    label: 'Filled Region' },
            { value: 'insulation',       label: 'Insulation' },
            { value: 'masking-region',   label: 'Masking Region' },
        ]));
        body.appendChild(this._makeSelect('fillPattern', 'Fill Pattern', [
            { value: 'solid',       label: 'Solid' },
            { value: 'diagonal',    label: 'Diagonal Lines' },
            { value: 'cross-hatch', label: 'Cross Hatch' },
            { value: 'stone',       label: 'Stone' },
            { value: 'sand',        label: 'Sand' },
            { value: 'concrete',    label: 'Concrete' },
        ]));
        body.appendChild(this._makeColor('fillColor', 'Fill Color'));
        body.appendChild(this._makeNumber('lineWeight',     'Line Weight (mm)', 0.01, 2, 0.01));
        body.appendChild(this._makeNumber('scale',          'Pattern Scale',    0.1, 20, 0.1));
        body.appendChild(this._makeNumber('rotateDegrees',  'Rotation (°)',     0,  360, 1));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'dcp-apply-btn';
        applyBtn.textContent = 'Place Component';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeSelect(key: keyof DetailComponentState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'dcp-field';
        const lbl = document.createElement('label'); lbl.className = 'dcp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'dcp-select'; sel.setAttribute('data-dcp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeNumber(key: keyof DetailComponentState, label: string, min: number, max: number, step: number): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'dcp-field';
        const lbl = document.createElement('label'); lbl.className = 'dcp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'dcp-input';
        inp.min = String(min); inp.max = String(max); inp.step = String(step);
        inp.value = String(this._state[key]); inp.setAttribute('data-dcp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeColor(key: keyof DetailComponentState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'dcp-field';
        const lbl = document.createElement('label'); lbl.className = 'dcp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'dcp-input';
        inp.value = String(this._state[key]); inp.setAttribute('data-dcp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-dcp-body]');
        if (!body) return;
        body.querySelectorAll('[data-dcp-field]').forEach(el => {
            const key = el.getAttribute('data-dcp-field') as keyof DetailComponentState;
            if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(this._state[key]);
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-dcp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-dcp-field]').forEach(el => {
            const key = el.getAttribute('data-dcp-field') as keyof DetailComponentState;
            if (el instanceof HTMLInputElement && el.type === 'number') {
                (next as Record<string,unknown>)[key] = parseFloat(el.value) || 0;
            } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
                (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.detailComponent = { ...next };
        window.runtime?.events?.emit('pryzm:detail-component:place', next as { [key: string]: unknown }); // F.events.15
    }
}
