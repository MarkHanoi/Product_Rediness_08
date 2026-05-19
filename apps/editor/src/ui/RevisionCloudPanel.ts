/**
 * RevisionCloudPanel — Wave 6 Phase B (wave-6-b-d3)
 *
 * BIM revision cloud annotation panel: arc radius, line weight,
 * cloud shape, revision mark, and remarks entry.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.revisionCloud` + CustomEvent for backward compat.
 *   Phase E.annotation.S → runtime.stores.annotation.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('revision-cloud.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const REVISION_CLOUD_PANEL_ID = 'revision-cloud-panel' as const;

export type CloudShape = 'rectangular' | 'freeform';

export interface RevisionCloudState {
    arcRadius: number;      // mm
    lineWeight: number;     // mm
    cloudShape: CloudShape;
    revisionMark: string;   // e.g. 'A', '1', 'Rev-01'
    remarks: string;
    showMark: boolean;
}

const DEFAULT_REVISION_CLOUD: RevisionCloudState = {
    arcRadius: 4,
    lineWeight: 0.25,
    cloudShape: 'rectangular',
    revisionMark: 'A',
    remarks: '',
    showMark: true,
};

const RCP_STYLES = `
.rcp-panel {
    position: fixed; top: 56px; right: 8px; width: 260px;
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font,'Inter',sans-serif); font-size: 13px;
    z-index: 950; display: none; overflow: hidden;
}
.rcp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.rcp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.rcp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.rcp-close-btn:hover { color:var(--app-text,#333); }
.rcp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.rcp-field { display:flex; flex-direction:column; gap:3px; }
.rcp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.rcp-input,.rcp-select,.rcp-textarea {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.rcp-textarea { resize:vertical; min-height:52px; font-family:inherit; }
.rcp-checkbox-row { display:flex; align-items:center; gap:8px; }
.rcp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.rcp-apply-btn:hover { opacity:.88; }
`;

export class RevisionCloudPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: RevisionCloudState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_REVISION_CLOUD };
        if (!runtime) {
            console.warn('[RevisionCloudPanel] runtime is null — panel binding skipped. (wave-6-b-d3)');
        }
        this.element = document.createElement('div');
        this.element.className = 'rcp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Revision Cloud Panel', elementType: 'revision-cloud' };
            this.runtime.viewRegistry.activatePanel(REVISION_CLOUD_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(REVISION_CLOUD_PANEL_ID);
    }

    public setState(state: Partial<RevisionCloudState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): RevisionCloudState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-rcp-styles', '1');
        s.textContent = RCP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'rcp-header';
        const title = document.createElement('span');
        title.className = 'rcp-title';
        title.textContent = 'Revision Cloud';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'rcp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'rcp-body';
        body.setAttribute('data-rcp-body', '1');

        body.appendChild(this._makeNumber('arcRadius',   'Arc Radius (mm)',   0.5, 50, 0.5));
        body.appendChild(this._makeNumber('lineWeight',  'Line Weight (mm)',  0.01, 2, 0.01));
        body.appendChild(this._makeSelect('cloudShape', 'Cloud Shape', [
            { value: 'rectangular', label: 'Rectangular' },
            { value: 'freeform',    label: 'Freeform' },
        ]));
        body.appendChild(this._makeText('revisionMark', 'Revision Mark'));
        body.appendChild(this._makeTextarea('remarks', 'Remarks'));
        body.appendChild(this._makeCheckbox('showMark', 'Show Revision Mark'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'rcp-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeNumber(key: keyof RevisionCloudState, label: string, min: number, max: number, step: number): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rcp-field';
        const lbl = document.createElement('label'); lbl.className = 'rcp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'rcp-input';
        inp.min = String(min); inp.max = String(max); inp.step = String(step);
        inp.value = String(this._state[key]); inp.setAttribute('data-rcp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeSelect(key: keyof RevisionCloudState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rcp-field';
        const lbl = document.createElement('label'); lbl.className = 'rcp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'rcp-select'; sel.setAttribute('data-rcp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeText(key: keyof RevisionCloudState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rcp-field';
        const lbl = document.createElement('label'); lbl.className = 'rcp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'rcp-input';
        inp.value = String(this._state[key]); inp.setAttribute('data-rcp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeTextarea(key: keyof RevisionCloudState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rcp-field';
        const lbl = document.createElement('label'); lbl.className = 'rcp-label'; lbl.textContent = label;
        const ta = document.createElement('textarea'); ta.className = 'rcp-textarea';
        ta.value = String(this._state[key]); ta.setAttribute('data-rcp-field', key);
        f.appendChild(lbl); f.appendChild(ta); return f;
    }

    private _makeCheckbox(key: keyof RevisionCloudState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rcp-field rcp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]); inp.setAttribute('data-rcp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'rcp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-rcp-body]');
        if (!body) return;
        body.querySelectorAll('[data-rcp-field]').forEach(el => {
            const key = el.getAttribute('data-rcp-field') as keyof RevisionCloudState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-rcp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-rcp-field]').forEach(el => {
            const key = el.getAttribute('data-rcp-field') as keyof RevisionCloudState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string,unknown>)[key] = el.checked;
                else if (el.type === 'number') (next as Record<string,unknown>)[key] = parseFloat(el.value) || 0;
                else (next as Record<string,unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
                (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.revisionCloud = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.annotation.S (TASK-15)
    }
}
