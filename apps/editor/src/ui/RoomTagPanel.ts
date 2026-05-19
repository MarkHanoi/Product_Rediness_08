/**
 * RoomTagPanel — Wave 6 Phase B (wave-6-b-d3)
 *
 * BIM room tag annotation panel: tag format string, placement position,
 * text height, area display, and room name/number style controls.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.roomTag` + CustomEvent for backward compat.
 *   Phase E.annotation.S → runtime.stores.annotation.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('room-tag.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const ROOM_TAG_PANEL_ID = 'room-tag-panel' as const;

export type RoomTagPlacement = 'center' | 'near-door' | 'top-left' | 'custom';
export type AreaUnit = 'm²' | 'ft²' | 'sf';

export interface RoomTagState {
    formatString: string;     // e.g. '{Name}\n{Number}\n{Area}'
    placement: RoomTagPlacement;
    textHeight: number;       // mm
    showArea: boolean;
    areaUnit: AreaUnit;
    showRoomNumber: boolean;
    showRoomName: boolean;
    leaderVisible: boolean;
}

const DEFAULT_ROOM_TAG: RoomTagState = {
    formatString: '{Name}\n{Number}',
    placement: 'center',
    textHeight: 2.5,
    showArea: true,
    areaUnit: 'm²',
    showRoomNumber: true,
    showRoomName: true,
    leaderVisible: false,
};

const RTP_STYLES = `
.rtp-panel {
    position: fixed; top: 56px; right: 8px; width: 260px;
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font,'Inter',sans-serif); font-size: 13px;
    z-index: 950; display: none; overflow: hidden;
}
.rtp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.rtp-title { font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--app-text-secondary,#666); }
.rtp-close-btn { background:none; border:none; cursor:pointer; font-size:14px; color:var(--app-text-secondary,#888); padding:0 2px; }
.rtp-close-btn:hover { color:var(--app-text,#333); }
.rtp-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
.rtp-field { display:flex; flex-direction:column; gap:3px; }
.rtp-label { font-size:11px; color:var(--app-text-secondary,#888); font-weight:500; }
.rtp-input,.rtp-select {
    width:100%; box-sizing:border-box; padding:5px 8px;
    border:1px solid rgba(0,0,0,0.15); border-radius:5px; font-size:12px;
    background:var(--app-input-bg,#fafafa); color:var(--app-text,#333);
}
.rtp-checkbox-row { display:flex; align-items:center; gap:8px; }
.rtp-hint { font-size:10px; color:var(--app-text-secondary,#999); margin-top:2px; }
.rtp-apply-btn {
    margin-top:4px; padding:7px 14px; background:var(--app-accent,#2563eb);
    color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
}
.rtp-apply-btn:hover { opacity:.88; }
`;

export class RoomTagPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;
    private _state: RoomTagState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_ROOM_TAG };
        if (!runtime) {
            console.warn('[RoomTagPanel] runtime is null — panel binding skipped. (wave-6-b-d3)');
        }
        this.element = document.createElement('div');
        this.element.className = 'rtp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Room Tag Panel', elementType: 'room-tag' };
            this.runtime.viewRegistry.activatePanel(ROOM_TAG_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(ROOM_TAG_PANEL_ID);
    }

    public setState(state: Partial<RoomTagState>): void {
        this._state = { ...this._state, ...state };
        this._syncFormToState();
    }

    public getState(): RoomTagState { return { ...this._state }; }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-rtp-styles', '1');
        s.textContent = RTP_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'rtp-header';
        const title = document.createElement('span');
        title.className = 'rtp-title';
        title.textContent = 'Room Tag';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'rtp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'rtp-body';
        body.setAttribute('data-rtp-body', '1');

        // Format string field with hint
        const fmtField = document.createElement('div');
        fmtField.className = 'rtp-field';
        const fmtLbl = document.createElement('label');
        fmtLbl.className = 'rtp-label';
        fmtLbl.textContent = 'Format String';
        const fmtInp = document.createElement('input');
        fmtInp.type = 'text'; fmtInp.className = 'rtp-input';
        fmtInp.value = this._state.formatString;
        fmtInp.setAttribute('data-rtp-field', 'formatString');
        const fmtHint = document.createElement('div');
        fmtHint.className = 'rtp-hint';
        fmtHint.textContent = 'Variables: {Name} {Number} {Area}';
        fmtField.appendChild(fmtLbl);
        fmtField.appendChild(fmtInp);
        fmtField.appendChild(fmtHint);
        body.appendChild(fmtField);

        body.appendChild(this._makeSelect('placement', 'Tag Placement', [
            { value: 'center',    label: 'Room Center' },
            { value: 'near-door', label: 'Near Door' },
            { value: 'top-left',  label: 'Top Left' },
            { value: 'custom',    label: 'Custom' },
        ]));
        body.appendChild(this._makeNumber('textHeight', 'Text Height (mm)', 0.5, 20, 0.5));
        body.appendChild(this._makeSelect('areaUnit', 'Area Unit', [
            { value: 'm²', label: 'Square Metres (m²)' },
            { value: 'ft²', label: 'Square Feet (ft²)' },
            { value: 'sf',  label: 'SF (US)' },
        ]));
        body.appendChild(this._makeCheckbox('showRoomName',   'Show Room Name'));
        body.appendChild(this._makeCheckbox('showRoomNumber', 'Show Room Number'));
        body.appendChild(this._makeCheckbox('showArea',       'Show Area'));
        body.appendChild(this._makeCheckbox('leaderVisible',  'Show Leader Line'));

        const applyBtn = document.createElement('button');
        applyBtn.className = 'rtp-apply-btn';
        applyBtn.textContent = 'Apply Tag Style';
        applyBtn.addEventListener('click', () => this._apply());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeSelect(key: keyof RoomTagState, label: string, opts: {value:string;label:string}[]): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rtp-field';
        const lbl = document.createElement('label'); lbl.className = 'rtp-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'rtp-select'; sel.setAttribute('data-rtp-field', key);
        for (const o of opts) {
            const el = document.createElement('option'); el.value = o.value; el.textContent = o.label;
            if (o.value === String(this._state[key])) el.selected = true;
            sel.appendChild(el);
        }
        f.appendChild(lbl); f.appendChild(sel); return f;
    }

    private _makeNumber(key: keyof RoomTagState, label: string, min: number, max: number, step: number): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rtp-field';
        const lbl = document.createElement('label'); lbl.className = 'rtp-label'; lbl.textContent = label;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'rtp-input';
        inp.min = String(min); inp.max = String(max); inp.step = String(step);
        inp.value = String(this._state[key]); inp.setAttribute('data-rtp-field', key);
        f.appendChild(lbl); f.appendChild(inp); return f;
    }

    private _makeCheckbox(key: keyof RoomTagState, label: string): HTMLDivElement {
        const f = document.createElement('div'); f.className = 'rtp-field rtp-checkbox-row';
        const inp = document.createElement('input'); inp.type = 'checkbox';
        inp.checked = Boolean(this._state[key]); inp.setAttribute('data-rtp-field', key);
        const lbl = document.createElement('label'); lbl.className = 'rtp-label'; lbl.textContent = label;
        f.appendChild(inp); f.appendChild(lbl); return f;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-rtp-body]');
        if (!body) return;
        body.querySelectorAll('[data-rtp-field]').forEach(el => {
            const key = el.getAttribute('data-rtp-field') as keyof RoomTagState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        });
    }

    private _apply(): void {
        const body = this.element.querySelector('[data-rtp-body]');
        if (!body) return;
        const next = { ...this._state };
        body.querySelectorAll('[data-rtp-field]').forEach(el => {
            const key = el.getAttribute('data-rtp-field') as keyof RoomTagState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') (next as Record<string,unknown>)[key] = el.checked;
                else if (el.type === 'number') (next as Record<string,unknown>)[key] = parseFloat(el.value) || 0;
                else (next as Record<string,unknown>)[key] = el.value;
            } else if (el instanceof HTMLSelectElement) {
                (next as Record<string,unknown>)[key] = el.value;
            }
        });
        this._state = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.roomTag = { ...next };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.annotation.S (TASK-15)
    }
}
