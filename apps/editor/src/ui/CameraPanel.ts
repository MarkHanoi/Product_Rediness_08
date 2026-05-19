/**
 * CameraPanel — Wave 6 Phase B (wave-6-b-d6)
 *
 * BIM camera / view frustum settings panel: projection type, focal length,
 * eye elevation, target elevation, far-clip plane, and crop-region toggle.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.cameraPanelSettings` + CustomEvent for backward compat.
 *   Phase E.view.S → runtime.stores.view.camera.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.view.S): migrate → runtime.bus.executeCommand('view.camera.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const CAMERA_PANEL_ID = 'camera-panel' as const;

export type CameraProjection = 'perspective' | 'parallel';

export interface CameraState {
    projection:      CameraProjection;
    focalLength:     number;
    eyeElevation:    number;
    targetElevation: number;
    farClipActive:   boolean;
    farClipOffset:   number;
    cropRegion:      boolean;
}

const DEFAULT_CAMERA_STATE: CameraState = {
    projection:      'parallel',
    focalLength:     50,
    eyeElevation:    1800,
    targetElevation: 0,
    farClipActive:   false,
    farClipOffset:   304800,
    cropRegion:      false,
};

const CAMP_STYLES = `
.camp-panel {
    position:fixed; top:56px; right:16px; width:256px;
    background:var(--app-panel-bg,#ffffff); color:var(--app-text,#333);
    border:1px solid rgba(0,0,0,0.12); border-radius:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    font-family:var(--app-font,'Inter',sans-serif); font-size:13px;
    z-index:950; display:none; overflow:hidden;
}
.camp-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.08);
    background:var(--app-panel-header-bg,#f7f7f7);
}
.camp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.camp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.camp-close-btn:hover { color:var(--app-text,#333); }
.camp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.camp-field { display:flex; flex-direction:column; gap:3px; }
.camp-checkbox-row { display:flex; align-items:center; gap:8px; }
.camp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.camp-input,.camp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.camp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.camp-apply-btn:hover { opacity:.88; }
`;

export class CameraPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: CameraState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state  = { ...DEFAULT_CAMERA_STATE };
        if (!runtime) {
            console.warn('[CameraPanel] runtime is null — panel binding skipped. (wave-6-b-d6)');
        }
        this.element = document.createElement('div');
        this.element.className = 'camp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Camera Settings', elementType: 'camera' };
            this.runtime.viewRegistry.activatePanel(CAMERA_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(CAMERA_PANEL_ID);
    }

    public setState(state: Partial<CameraState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): CameraState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-camp-styles', '1');
        s.textContent = CAMP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'camp-header';
        const title = document.createElement('span');
        title.className = 'camp-title';
        title.textContent = 'Camera Settings';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'camp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'camp-body';
        body.setAttribute('data-camp-body', '1');

        body.appendChild(this._makeSelect('projection', 'Projection', [
            { value: 'parallel',     label: 'Orthographic (Parallel)' },
            { value: 'perspective',  label: 'Perspective' },
        ]));
        body.appendChild(this._makeNumber('focalLength',     'Focal Length (mm)',     1,  1000));
        body.appendChild(this._makeNumber('eyeElevation',    'Eye Elevation (mm)',    -999999, 999999));
        body.appendChild(this._makeNumber('targetElevation', 'Target Elevation (mm)', -999999, 999999));
        body.appendChild(this._makeCheckbox('farClipActive',  'Enable Far Clip Plane'));
        body.appendChild(this._makeNumber('farClipOffset',    'Far Clip Offset (mm)', 0, 9999999));
        body.appendChild(this._makeCheckbox('cropRegion',     'Crop Region Active'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'camp-apply-btn';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeSelect(key: keyof CameraState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'camp-field';
        const lbl = document.createElement('label'); lbl.className = 'camp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'camp-select';
        sel.setAttribute('data-camp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeNumber(key: keyof CameraState, label: string, min: number, max: number): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'camp-field';
        const lbl = document.createElement('label'); lbl.className = 'camp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'camp-input';
        inp.min = String(min); inp.max = String(max);
        inp.value = String(this._state[key]);
        inp.setAttribute('data-camp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeCheckbox(key: keyof CameraState, label: string): HTMLDivElement {
        const f   = document.createElement('div'); f.className = 'camp-field camp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]);
        inp.setAttribute('data-camp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'camp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-camp-body]');
        if (!body) return;
        body.querySelectorAll('[data-camp-field]').forEach(el => {
            const key = el.getAttribute('data-camp-field') as keyof CameraState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-camp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-camp-field]').forEach(el => {
            const key = el.getAttribute('data-camp-field') as keyof CameraState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox')      (next as Record<string,unknown>)[key] = el.checked;
                else if (el.type === 'number')   (next as Record<string,unknown>)[key] = Number(el.value);
                else                             (next as Record<string,unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.cameraPanelSettings = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.view.S (TASK-15)
    }
}
