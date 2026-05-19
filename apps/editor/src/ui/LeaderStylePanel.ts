/**
 * LeaderStylePanel — Wave 6 Phase B (wave-6-b-d3)
 *
 * BIM leader annotation style editor: line type, arrowhead style,
 * text height, shoulder length, and gap-to-element controls.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.leaderStyle` + CustomEvent for backward compat.
 *   Phase E.annotation.S → runtime.stores.annotation.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('leader-style.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const LEADER_STYLE_PANEL_ID = 'leader-style-panel' as const;

export type LeaderLineType   = 'solid' | 'dashed' | 'dotted';
export type LeaderArrowType  = 'filled' | 'open' | 'dot' | 'none';

export interface LeaderStyleState {
    lineType: LeaderLineType;
    arrowType: LeaderArrowType;
    textHeight: number;      // mm
    shoulderLength: number;  // mm
    gapToElement: number;    // mm — gap between arrowhead and annotated element
    lineWeight: number;      // mm
}

const DEFAULT_LEADER_STYLE: LeaderStyleState = {
    lineType: 'solid',
    arrowType: 'filled',
    textHeight: 2.5,
    shoulderLength: 5,
    gapToElement: 1,
    lineWeight: 0.18,
};

const LSP_STYLES = `
.lsp-panel {
    position: fixed; top: 56px; right: 8px; width: 260px;
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font,'Inter',sans-serif); font-size: 13px;
    z-index: 950; display: none; overflow: hidden;
}
.lsp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.lsp-title { font-weight: 600; font-size: 12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.lsp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.lsp-close-btn:hover { color:var(--app-text,#333); }
.lsp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.lsp-field { display:flex; flex-direction:column; gap:3px; }
.lsp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.lsp-input,.lsp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.lsp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.lsp-apply-btn:hover { opacity:.88; }
`;

export class LeaderStylePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: LeaderStyleState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_LEADER_STYLE };
        if (!runtime) {
            console.warn('[LeaderStylePanel] runtime is null — panel binding skipped. (wave-6-b-d3)');
        }
        this.element = document.createElement('div');
        this.element.className = 'lsp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Leader Style Panel', elementType: 'leader' };
            this.runtime.viewRegistry.activatePanel(LEADER_STYLE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(LEADER_STYLE_PANEL_ID);
    }

    public setStyle(style: Partial<LeaderStyleState>): void {
        this._state = { ...this._state, ...style };
        this._syncFormToState();
    }

    public getStyle(): LeaderStyleState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-lsp-styles', '1');
        s.textContent = LSP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'lsp-header';
        const title = document.createElement('span');
        title.className = 'lsp-title';
        title.textContent = 'Leader Style';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'lsp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'lsp-body';
        body.setAttribute('data-lsp-body', '1');

        body.appendChild(this._makeSelect('lineType', 'Line Type', [
            { value: 'solid',  label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
        ]));
        body.appendChild(this._makeSelect('arrowType', 'Arrowhead', [
            { value: 'filled', label: 'Filled Arrow' },
            { value: 'open',   label: 'Open Arrow' },
            { value: 'dot',    label: 'Dot' },
            { value: 'none',   label: 'None' },
        ]));
        body.appendChild(this._makeNumber('textHeight',     'Text Height (mm)',      0.5, 20, 0.5));
        body.appendChild(this._makeNumber('shoulderLength', 'Shoulder Length (mm)',  0,   50, 1));
        body.appendChild(this._makeNumber('gapToElement',   'Gap to Element (mm)',   0,   20, 0.5));
        body.appendChild(this._makeNumber('lineWeight',     'Line Weight (mm)',       0.01, 2, 0.01));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'lsp-apply-btn';
        applyBtn.textContent = 'Apply Style';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeSelect(key: keyof LeaderStyleState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'lsp-field';
        const lbl = document.createElement('label'); lbl.className = 'lsp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'lsp-select'; sel.setAttribute('data-lsp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeNumber(key: keyof LeaderStyleState, label: string, min: number, max: number, step: number): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'lsp-field';
        const lbl = document.createElement('label'); lbl.className = 'lsp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'lsp-input';
        inp.min = String(min); inp.max = String(max); inp.step = String(step);
        inp.value = String(this._state[key]); inp.setAttribute('data-lsp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-lsp-body]');
        if (!body) return;
        body.querySelectorAll('[data-lsp-field]').forEach(el => {
            const key = el.getAttribute('data-lsp-field') as keyof LeaderStyleState;
            if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(this._state[key]);
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-lsp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-lsp-field]').forEach(el => {
            const key = el.getAttribute('data-lsp-field') as keyof LeaderStyleState;
            if (el instanceof HTMLInputElement && el.type === 'number') {
                (next as Record<string,unknown>)[key] = parseFloat(el.value) || 0;
            } else if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
                (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.leaderStyle = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.annotation.S (TASK-15)
    }
}
