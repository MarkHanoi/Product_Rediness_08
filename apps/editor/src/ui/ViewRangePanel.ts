/**
 * ViewRangePanel — Wave 6 Phase B (wave-6-b-d6)
 *
 * BIM view-range (cut plane / top / bottom / view depth) editor.
 * Controls the four horizontal planes that define what is visible in a plan view.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.viewRangeSettings` + CustomEvent for backward compat.
 *   Phase E.view.S → runtime.stores.view.range.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.view.S): migrate → runtime.bus.executeCommand('view.range.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const VIEW_RANGE_PANEL_ID = 'view-range-panel' as const;

export type RangeLevelRef = 'level-above' | 'associated-level' | 'level-below' | 'unlimited';

export interface ViewRangeState {
    topLevel:        RangeLevelRef;
    topOffset:       number;
    cutLevel:        RangeLevelRef;
    cutOffset:       number;
    bottomLevel:     RangeLevelRef;
    bottomOffset:    number;
    viewDepthLevel:  RangeLevelRef;
    viewDepthOffset: number;
}

const DEFAULT_VR_STATE: ViewRangeState = {
    topLevel:        'level-above',
    topOffset:       0,
    cutLevel:        'associated-level',
    cutOffset:       1200,
    bottomLevel:     'associated-level',
    bottomOffset:    0,
    viewDepthLevel:  'associated-level',
    viewDepthOffset: -150,
};

const VRP_STYLES = `
.vrp-panel {
    position:fixed; top:56px; right:16px; width:264px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.vrp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.vrp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.vrp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.vrp-close-btn:hover { color:var(--app-text,#333); }
.vrp-body { padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
.vrp-section-title { font-size:11px; font-weight:700; color:var(--app-text,#333); margin-top:4px; }
.vrp-field { display:flex; flex-direction:column; gap:3px; }
.vrp-row { display:grid; grid-template-columns:1fr 88px; gap:6px; }
.vrp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.vrp-input,.vrp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.vrp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.vrp-apply-btn:hover { opacity:.88; }
`;

const LEVEL_OPTS = [
    { value: 'level-above',      label: 'Level Above' },
    { value: 'associated-level', label: 'Associated Level' },
    { value: 'level-below',      label: 'Level Below' },
    { value: 'unlimited',        label: 'Unlimited' },
];

export class ViewRangePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: ViewRangeState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state  = { ...DEFAULT_VR_STATE };
        if (!runtime) {
            console.warn('[ViewRangePanel] runtime is null — panel binding skipped. (wave-6-b-d6)');
        }
        this.element = document.createElement('div');
        this.element.className = 'vrp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'View Range', elementType: 'view-range' };
            this.runtime.viewRegistry.activatePanel(VIEW_RANGE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(VIEW_RANGE_PANEL_ID);
    }

    public setState(state: Partial<ViewRangeState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): ViewRangeState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-vrp-styles', '1');
        s.textContent = VRP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'vrp-header';
        const title = document.createElement('span');
        title.className = 'vrp-title';
        title.textContent = 'View Range';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'vrp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'vrp-body';
        body.setAttribute('data-vrp-body', '1');

        this._appendRangeRow(body, 'Top',        'topLevel',        'topOffset');
        this._appendRangeRow(body, 'Cut Plane',  'cutLevel',        'cutOffset');
        this._appendRangeRow(body, 'Bottom',     'bottomLevel',     'bottomOffset');
        this._appendRangeRow(body, 'View Depth', 'viewDepthLevel',  'viewDepthOffset');

        const applyBtn = document.createElement('button');
        applyBtn.className = 'vrp-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _appendRangeRow(
        body:       HTMLElement,
        sectionLabel: string,
        levelKey:   keyof ViewRangeState,
        offsetKey:  keyof ViewRangeState,
    ): void {
        const sec = document.createElement('div');
        sec.className = 'vrp-section-title';
        sec.textContent = sectionLabel;
        body.appendChild(sec);

        const row = document.createElement('div');
        row.className = 'vrp-row';

        const sel = document.createElement('select');
        sel.className = 'vrp-select';
        sel.setAttribute('data-vrp-field', levelKey);
        for (const o of LEVEL_OPTS) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[levelKey])) el.selected = true;
            sel.appendChild(el);
        }

        const inp = document.createElement('input');
        inp.type = 'number'; inp.className = 'vrp-input';
        inp.value = String(this._state[offsetKey]);
        inp.setAttribute('data-vrp-field', offsetKey);

        row.appendChild(sel);
        row.appendChild(inp);
        body.appendChild(row);
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-vrp-body]');
        if (!body) return;
        body.querySelectorAll('[data-vrp-field]').forEach(el => {
            const key = el.getAttribute('data-vrp-field') as keyof ViewRangeState;
            if (el instanceof HTMLInputElement)       el.value = String(this._state[key]);
            else if (el instanceof HTMLSelectElement) el.value = String(this._state[key]);
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-vrp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-vrp-field]').forEach(el => {
            const key = el.getAttribute('data-vrp-field') as keyof ViewRangeState;
            if (el instanceof HTMLInputElement)       (next as Record<string,unknown>)[key] = Number(el.value);
            else if (el instanceof HTMLSelectElement) (next as Record<string,unknown>)[key] = el.value;
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.viewRangeSettings = { ...next };
        window.runtime?.events?.emit('pryzm:view:range-update', next as { [key: string]: unknown }); // F.events.15
    }
}
