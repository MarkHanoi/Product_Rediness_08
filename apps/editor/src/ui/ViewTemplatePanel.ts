/**
 * ViewTemplatePanel — Wave 6 Phase B (wave-6-b-d6)
 *
 * BIM view template assignment and property-include panel.
 * Allows selecting a template, choosing which properties it governs,
 * and applying/removing the template from the active view.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.viewTemplateSettings` + CustomEvent for backward compat.
 *   Phase E.view.S → runtime.stores.view.template.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.view.S): migrate → runtime.bus.executeCommand('view.template.apply', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const VIEW_TEMPLATE_PANEL_ID = 'view-template-panel' as const;

export interface ViewTemplateState {
    templateName:        string;
    applyViewScale:      boolean;
    applyDiscipline:     boolean;
    applyVisualStyle:    boolean;
    applyDetailLevel:    boolean;
    applyVisibility:     boolean;
    applyPhase:          boolean;
    applyColorFills:     boolean;
}

const DEFAULT_VT_STATE: ViewTemplateState = {
    templateName:        '',
    applyViewScale:      true,
    applyDiscipline:     true,
    applyVisualStyle:    true,
    applyDetailLevel:    true,
    applyVisibility:     true,
    applyPhase:          false,
    applyColorFills:     false,
};

const VTP_STYLES = `
.vtp-panel {
    position:fixed; top:56px; right:16px; width:256px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.vtp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.vtp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.vtp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.vtp-close-btn:hover { color:var(--app-text,#333); }
.vtp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.vtp-field { display:flex; flex-direction:column; gap:3px; }
.vtp-checkbox-row { display:flex; align-items:center; gap:8px; }
.vtp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.vtp-input {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.vtp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.vtp-apply-btn:hover { opacity:.88; }
`;

export class ViewTemplatePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: ViewTemplateState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state  = { ...DEFAULT_VT_STATE };
        if (!runtime) {
            console.warn('[ViewTemplatePanel] runtime is null — panel binding skipped. (wave-6-b-d6)');
        }
        this.element = document.createElement('div');
        this.element.className = 'vtp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'View Template', elementType: 'view-template' };
            this.runtime.viewRegistry.activatePanel(VIEW_TEMPLATE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(VIEW_TEMPLATE_PANEL_ID);
    }

    public setState(state: Partial<ViewTemplateState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): ViewTemplateState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-vtp-styles', '1');
        s.textContent = VTP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'vtp-header';
        const title = document.createElement('span');
        title.className = 'vtp-title';
        title.textContent = 'View Template';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'vtp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'vtp-body';
        body.setAttribute('data-vtp-body', '1');

        body.appendChild(this._makeInput('templateName', 'Template Name'));
        body.appendChild(this._makeCheckbox('applyViewScale',   'Include View Scale'));
        body.appendChild(this._makeCheckbox('applyDiscipline',  'Include Discipline'));
        body.appendChild(this._makeCheckbox('applyVisualStyle', 'Include Visual Style'));
        body.appendChild(this._makeCheckbox('applyDetailLevel', 'Include Detail Level'));
        body.appendChild(this._makeCheckbox('applyVisibility',  'Include Visibility/Graphics'));
        body.appendChild(this._makeCheckbox('applyPhase',       'Include Phase'));
        body.appendChild(this._makeCheckbox('applyColorFills',  'Include Color Fills'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'vtp-apply-btn';
        applyBtn.textContent = 'Apply Template';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeInput(key: keyof ViewTemplateState, label: string): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'vtp-field';
        const lbl = document.createElement('label'); lbl.className = 'vtp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'vtp-input';
        inp.value = String(this._state[key]);
        inp.setAttribute('data-vtp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeCheckbox(key: keyof ViewTemplateState, label: string): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'vtp-field vtp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]);
        inp.setAttribute('data-vtp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'vtp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-vtp-body]');
        if (!body) return;
        body.querySelectorAll('[data-vtp-field]').forEach(el => {
            const key = el.getAttribute('data-vtp-field') as keyof ViewTemplateState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-vtp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-vtp-field]').forEach(el => {
            const key = el.getAttribute('data-vtp-field') as keyof ViewTemplateState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string,unknown>)[key] = el.checked;
                else                        (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.viewTemplateSettings = { ...next };
        window.runtime?.events?.emit('pryzm:view:template-apply', next as { [key: string]: unknown }); // F.events.15
    }
}
