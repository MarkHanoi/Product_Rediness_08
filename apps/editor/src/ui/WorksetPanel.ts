/**
 * WorksetPanel — Wave 6 Phase B (wave-6-b-d6)
 *
 * BIM workset visibility and ownership panel.
 * Shows the active workset, allows toggling workset visibility per view,
 * and sets the active workset for new element placement.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.worksetPanelSettings` + CustomEvent for backward compat.
 *   Phase E.workset.S → runtime.stores.workset.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.workset.S): migrate → runtime.bus.executeCommand('workset.visibility.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const WORKSET_PANEL_ID = 'workset-panel' as const;

export type WorksetVisibilityMode = 'visible' | 'hidden' | 'greyed';

export interface WorksetPanelState {
    activeWorkset:         string;
    worksetName:           string;
    visibilityInView:      WorksetVisibilityMode;
    showInAllViews:        boolean;
    editableByOwnerOnly:   boolean;
    editableByEveryone:    boolean;
}

const DEFAULT_WS_STATE: WorksetPanelState = {
    activeWorkset:         'Shared Levels and Grids',
    worksetName:           '',
    visibilityInView:      'visible',
    showInAllViews:        true,
    editableByOwnerOnly:   false,
    editableByEveryone:    true,
};

const WSP_STYLES = `
.wsp-panel {
    position:fixed; top:56px; right:16px; width:256px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.wsp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.wsp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.wsp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.wsp-close-btn:hover { color:var(--app-text,#333); }
.wsp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.wsp-field { display:flex; flex-direction:column; gap:3px; }
.wsp-checkbox-row { display:flex; align-items:center; gap:8px; }
.wsp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.wsp-input,.wsp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.wsp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.wsp-apply-btn:hover { opacity:.88; }
`;

export class WorksetPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: WorksetPanelState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state  = { ...DEFAULT_WS_STATE };
        if (!runtime) {
            console.warn('[WorksetPanel] runtime is null — panel binding skipped. (wave-6-b-d6)');
        }
        this.element = document.createElement('div');
        this.element.className = 'wsp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Worksets', elementType: 'workset' };
            this.runtime.viewRegistry.activatePanel(WORKSET_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(WORKSET_PANEL_ID);
    }

    public setState(state: Partial<WorksetPanelState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): WorksetPanelState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-wsp-styles', '1');
        s.textContent = WSP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'wsp-header';
        const title = document.createElement('span');
        title.className = 'wsp-title';
        title.textContent = 'Worksets';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'wsp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'wsp-body';
        body.setAttribute('data-wsp-body', '1');

        body.appendChild(this._makeInput ('activeWorkset',       'Active Workset'));
        body.appendChild(this._makeInput ('worksetName',         'Workset Name'));
        body.appendChild(this._makeSelect('visibilityInView',    'Visibility in View', [
            { value: 'visible', label: 'Visible' },
            { value: 'hidden',  label: 'Hidden' },
            { value: 'greyed',  label: 'Greyed' },
        ]));
        body.appendChild(this._makeCheckbox('showInAllViews',      'Show in All Views by Default'));
        body.appendChild(this._makeCheckbox('editableByOwnerOnly',  'Editable by Owner Only'));
        body.appendChild(this._makeCheckbox('editableByEveryone',   'Editable by Everyone'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'wsp-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeInput(key: keyof WorksetPanelState, label: string): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'wsp-field';
        const lbl = document.createElement('label'); lbl.className = 'wsp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'wsp-input';
        inp.value = String(this._state[key]);
        inp.setAttribute('data-wsp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeSelect(key: keyof WorksetPanelState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'wsp-field';
        const lbl = document.createElement('label'); lbl.className = 'wsp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'wsp-select';
        sel.setAttribute('data-wsp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeCheckbox(key: keyof WorksetPanelState, label: string): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'wsp-field wsp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]);
        inp.setAttribute('data-wsp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'wsp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-wsp-body]');
        if (!body) return;
        body.querySelectorAll('[data-wsp-field]').forEach(el => {
            const key = el.getAttribute('data-wsp-field') as keyof WorksetPanelState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-wsp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-wsp-field]').forEach(el => {
            const key = el.getAttribute('data-wsp-field') as keyof WorksetPanelState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string,unknown>)[key] = el.checked;
                else                        (next as Record<string,unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.worksetPanelSettings = { ...next };
        window.runtime?.events?.emit('pryzm:workset:settings-update', next as { [key: string]: unknown }); // F.events.15
    }
}
