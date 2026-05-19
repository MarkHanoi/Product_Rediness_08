/**
 * TagStylePanel — Wave 6 Phase B (wave-6-b-d2)
 *
 * BIM tag annotation style editor panel: tag format, leader line type,
 * text size, shoulder length, and tag shape controls.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.tagStyle` + CustomEvent for backward compat.
 *   Phase E.annotation.S → runtime.stores.annotation.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * Public API
 * ──────────
 *   const tgp = new TagStylePanel(runtime);
 *   document.body.appendChild(tgp.element);
 *   tgp.show();   // activates panel binding
 *   tgp.hide();   // deactivates panel binding
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('tag-style.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const TAG_STYLE_PANEL_ID = 'tag-style-panel' as const;

// ── Style schema ──────────────────────────────────────────────────────────────
export type TagLeaderType = 'straight' | 'arc' | 'spline' | 'none';
export type TagShape      = 'rectangle' | 'rounded' | 'circle' | 'none';

export interface TagStyleState {
    leaderType: TagLeaderType;
    tagShape: TagShape;
    textSize: number;         // in mm
    shoulderLength: number;   // in mm — horizontal segment before leader
    showLeaderArrow: boolean;
    borderVisible: boolean;
    borderColor: string;      // CSS hex
    fillColor: string;        // CSS hex, '' = transparent
    format: string;           // e.g. '{Type Mark} - {Mark}'
}

const DEFAULT_TAG_STYLE: TagStyleState = {
    leaderType: 'straight',
    tagShape: 'rectangle',
    textSize: 2.5,
    shoulderLength: 5,
    showLeaderArrow: true,
    borderVisible: true,
    borderColor: '#000000',
    fillColor: '#ffffff',
    format: '{Mark}',
};

// ── Inline styles ─────────────────────────────────────────────────────────────
const TGP_STYLES = `
.tgp-panel {
    position: fixed;
    top: 56px;
    right: 8px;
    width: 260px;
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    overflow: hidden;
}
.tgp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.tgp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.tgp-close-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--app-text-secondary, #888);
    padding: 0 2px; line-height: 1;
}
.tgp-close-btn:hover { color: var(--app-text, #333); }
.tgp-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.tgp-field { display: flex; flex-direction: column; gap: 3px; }
.tgp-label { font-size: 11px; color: var(--app-text-secondary, #888); font-weight: 500; }
.tgp-input, .tgp-select {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; border: 1px solid rgba(0,0,0,0.15);
    border-radius: 5px; font-size: 12px;
    background: var(--app-input-bg, #fafafa);
    color: var(--app-text, #333);
}
.tgp-checkbox-row { display: flex; align-items: center; gap: 8px; }
.tgp-color-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tgp-apply-btn {
    margin-top: 4px; padding: 7px 14px;
    background: var(--app-accent, #2563eb);
    color: #fff; border: none; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer;
}
.tgp-apply-btn:hover { opacity: 0.88; }
`;

// ── TagStylePanel class ───────────────────────────────────────────────────────

export class TagStylePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;
    private _state: TagStyleState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_TAG_STYLE };

        if (!runtime) {
            console.warn(
                '[TagStylePanel] runtime is null — activatePanel/deactivatePanel ' +
                'binding will be skipped.  Wire PryzmRuntime in composition root. (wave-6-b-d2)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'tgp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public lifecycle API ──────────────────────────────────────────────────

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Tag Style Panel',
                elementType: 'tag',
            };
            this.runtime.viewRegistry.activatePanel(TAG_STYLE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(TAG_STYLE_PANEL_ID);
    }

    public setStyle(style: Partial<TagStyleState>): void {
        this._state = { ...this._state, ...style };
        this._syncFormToState();
    }

    public getStyle(): TagStyleState {
        return { ...this._state };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-tgp-styles', '1');
        style.textContent = TGP_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'tgp-header';

        const title = document.createElement('span');
        title.className = 'tgp-title';
        title.textContent = 'Tag Style';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tgp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close tag style panel';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'tgp-body';
        body.setAttribute('data-tgp-body', '1');

        // Tag format
        body.appendChild(this._makeTextField('format', 'Tag Format (e.g. {Mark})'));

        // Leader type
        body.appendChild(this._makeSelectField('leaderType', 'Leader Type', [
            { value: 'straight', label: 'Straight' },
            { value: 'arc',      label: 'Arc' },
            { value: 'spline',   label: 'Spline' },
            { value: 'none',     label: 'No Leader' },
        ]));

        // Tag shape
        body.appendChild(this._makeSelectField('tagShape', 'Tag Shape', [
            { value: 'rectangle', label: 'Rectangle' },
            { value: 'rounded',   label: 'Rounded Rect' },
            { value: 'circle',    label: 'Circle' },
            { value: 'none',      label: 'No Shape' },
        ]));

        // Text size
        body.appendChild(this._makeNumberField('textSize', 'Text Size (mm)', 0.5, 20, 0.5));

        // Shoulder length
        body.appendChild(this._makeNumberField('shoulderLength', 'Shoulder Length (mm)', 0, 50, 1));

        // Checkboxes
        body.appendChild(this._makeCheckboxField('showLeaderArrow', 'Show Leader Arrow'));
        body.appendChild(this._makeCheckboxField('borderVisible', 'Show Border'));

        // Colours
        const colorRow = document.createElement('div');
        colorRow.className = 'tgp-color-row';
        colorRow.appendChild(this._makeColorField('borderColor', 'Border Color'));
        colorRow.appendChild(this._makeColorField('fillColor', 'Fill Color'));
        body.appendChild(colorRow);

        // Apply button
        const applyBtn = document.createElement('button');
        applyBtn.className = 'tgp-apply-btn';
        applyBtn.textContent = 'Apply Style';
        applyBtn.addEventListener('click', () => this._applyStyle());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeTextField(key: keyof TagStyleState, label: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tgp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tgp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tgp-input';
        input.value = String(this._state[key]);
        input.setAttribute('data-tgp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _makeNumberField(
        key: keyof TagStyleState,
        label: string,
        min: number,
        max: number,
        step: number,
    ): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tgp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tgp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'tgp-input';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(this._state[key]);
        input.setAttribute('data-tgp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _makeSelectField(
        key: keyof TagStyleState,
        label: string,
        options: { value: string; label: string }[],
    ): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tgp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tgp-label';
        lbl.textContent = label;
        const select = document.createElement('select');
        select.className = 'tgp-select';
        select.setAttribute('data-tgp-field', key);
        for (const opt of options) {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.label;
            if (opt.value === String(this._state[key])) el.selected = true;
            select.appendChild(el);
        }
        field.appendChild(lbl);
        field.appendChild(select);
        return field;
    }

    private _makeCheckboxField(key: keyof TagStyleState, label: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tgp-field tgp-checkbox-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(this._state[key]);
        input.setAttribute('data-tgp-field', key);
        const lbl = document.createElement('label');
        lbl.className = 'tgp-label';
        lbl.textContent = label;
        field.appendChild(input);
        field.appendChild(lbl);
        return field;
    }

    private _makeColorField(key: keyof TagStyleState, label: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tgp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tgp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'tgp-input';
        input.value = String(this._state[key]);
        input.setAttribute('data-tgp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-tgp-body]');
        if (!body) return;
        const fields = body.querySelectorAll('[data-tgp-field]');
        for (const el of fields) {
            const key = el.getAttribute('data-tgp-field') as keyof TagStyleState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(this._state[key]);
                else el.value = String(this._state[key]);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        }
    }

    /**
     * Collect form values, update state, and dispatch a style-change event.
     *
     * TODO(E.annotation.S): replace CustomEvent with
     *   runtime.bus.executeCommand('tag-style.update', newState)
     */
    private _applyStyle(): void {
        const body = this.element.querySelector('[data-tgp-body]');
        if (!body) return;
        const newState = { ...this._state };
        const fields = body.querySelectorAll('[data-tgp-field]');
        for (const el of fields) {
            const key = el.getAttribute('data-tgp-field') as keyof TagStyleState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') {
                    (newState as Record<string, unknown>)[key] = el.checked;
                } else if (el.type === 'number') {
                    (newState as Record<string, unknown>)[key] = parseFloat(el.value) || 0;
                } else {
                    (newState as Record<string, unknown>)[key] = el.value;
                }
            } else if (el instanceof HTMLSelectElement) {
                (newState as Record<string, unknown>)[key] = el.value;
            }
        }
        this._state = newState;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.tagStyle = { ...newState };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.annotation.S (TASK-15)
    }
}
