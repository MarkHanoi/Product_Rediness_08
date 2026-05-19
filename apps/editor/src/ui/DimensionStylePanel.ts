/**
 * DimensionStylePanel — Wave 6 Phase B (wave-6-b-d2)
 *
 * BIM dimension style editor panel: text height, arrow type, unit format,
 * prefix/suffix, and tolerance display for dimension annotations.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  This panel writes to
 *   `window.dimensionStyle` and fires CustomEvents for backward compatibility.
 *   Phase E.annotation.S will migrate to `runtime.stores.annotation`.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * Public API
 * ──────────
 *   const dsp = new DimensionStylePanel(runtime);
 *   document.body.appendChild(dsp.element);
 *   dsp.show();   // activates panel binding
 *   dsp.hide();   // deactivates panel binding
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('dimension-style.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const DIMENSION_STYLE_PANEL_ID = 'dimension-style-panel' as const;

// ── Style schema ──────────────────────────────────────────────────────────────
export type DimensionArrowType = 'filled' | 'open' | 'dot' | 'tick';
export type DimensionUnitFormat = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface DimensionStyleState {
    textHeight: number;          // in mm, e.g. 2.5
    arrowType: DimensionArrowType;
    unitFormat: DimensionUnitFormat;
    prefix: string;
    suffix: string;
    showTolerance: boolean;
    tolerancePlus: number;
    toleranceMinus: number;
}

const DEFAULT_DIMENSION_STYLE: DimensionStyleState = {
    textHeight: 2.5,
    arrowType: 'filled',
    unitFormat: 'mm',
    prefix: '',
    suffix: '',
    showTolerance: false,
    tolerancePlus: 0.1,
    toleranceMinus: 0.1,
};

// ── Inline styles ─────────────────────────────────────────────────────────────
const DSP_STYLES = `
.dsp-panel {
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
.dsp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.dsp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.dsp-close-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--app-text-secondary, #888);
    padding: 0 2px; line-height: 1;
}
.dsp-close-btn:hover { color: var(--app-text, #333); }
.dsp-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.dsp-field { display: flex; flex-direction: column; gap: 3px; }
.dsp-label { font-size: 11px; color: var(--app-text-secondary, #888); font-weight: 500; }
.dsp-input, .dsp-select {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; border: 1px solid rgba(0,0,0,0.15);
    border-radius: 5px; font-size: 12px;
    background: var(--app-input-bg, #fafafa);
    color: var(--app-text, #333);
}
.dsp-checkbox-row { display: flex; align-items: center; gap: 8px; }
.dsp-tolerance { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dsp-apply-btn {
    margin-top: 4px; padding: 7px 14px;
    background: var(--app-accent, #2563eb);
    color: #fff; border: none; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer;
}
.dsp-apply-btn:hover { opacity: 0.88; }
`;

// ── DimensionStylePanel class ─────────────────────────────────────────────────

export class DimensionStylePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;
    private _state: DimensionStyleState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_DIMENSION_STYLE };

        if (!runtime) {
            console.warn(
                '[DimensionStylePanel] runtime is null — activatePanel/deactivatePanel ' +
                'binding will be skipped.  Wire PryzmRuntime in composition root. (wave-6-b-d2)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'dsp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public lifecycle API ──────────────────────────────────────────────────

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Dimension Style Panel',
                elementType: 'dimension',
            };
            this.runtime.viewRegistry.activatePanel(DIMENSION_STYLE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(DIMENSION_STYLE_PANEL_ID);
    }

    /** Populate the panel with current style state (call before show()). */
    public setStyle(style: Partial<DimensionStyleState>): void {
        this._state = { ...this._state, ...style };
        this._syncFormToState();
    }

    public getStyle(): DimensionStyleState {
        return { ...this._state };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-dsp-styles', '1');
        style.textContent = DSP_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'dsp-header';

        const title = document.createElement('span');
        title.className = 'dsp-title';
        title.textContent = 'Dimension Style';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'dsp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close dimension style panel';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'dsp-body';
        body.setAttribute('data-dsp-body', '1');

        // Text height field
        body.appendChild(this._makeNumberField('textHeight', 'Text Height (mm)', 0.5, 20, 0.5));
        // Arrow type select
        body.appendChild(this._makeSelectField('arrowType', 'Arrow Type', [
            { value: 'filled', label: 'Filled Arrow' },
            { value: 'open',   label: 'Open Arrow' },
            { value: 'dot',    label: 'Dot' },
            { value: 'tick',   label: 'Tick' },
        ]));
        // Unit format select
        body.appendChild(this._makeSelectField('unitFormat', 'Unit Format', [
            { value: 'mm', label: 'Millimetres (mm)' },
            { value: 'cm', label: 'Centimetres (cm)' },
            { value: 'm',  label: 'Metres (m)' },
            { value: 'in', label: 'Inches (in)' },
            { value: 'ft', label: 'Feet (ft)' },
        ]));
        // Prefix field
        body.appendChild(this._makeTextField('prefix', 'Prefix'));
        // Suffix field
        body.appendChild(this._makeTextField('suffix', 'Suffix'));
        // Show tolerance checkbox
        body.appendChild(this._makeCheckboxField('showTolerance', 'Show Tolerance'));
        // Tolerance ± fields
        const tolSection = document.createElement('div');
        tolSection.className = 'dsp-tolerance';
        tolSection.setAttribute('data-dsp-tolerance', '1');
        tolSection.appendChild(this._makeNumberField('tolerancePlus', '+', 0, 10, 0.01));
        tolSection.appendChild(this._makeNumberField('toleranceMinus', '−', 0, 10, 0.01));
        body.appendChild(tolSection);

        // Apply button
        const applyBtn = document.createElement('button');
        applyBtn.className = 'dsp-apply-btn';
        applyBtn.textContent = 'Apply Style';
        applyBtn.addEventListener('click', () => this._applyStyle());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeNumberField(
        key: keyof DimensionStyleState,
        label: string,
        min: number,
        max: number,
        step: number,
    ): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'dsp-field';
        const lbl = document.createElement('label');
        lbl.className = 'dsp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'dsp-input';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(this._state[key]);
        input.setAttribute('data-dsp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _makeSelectField(
        key: keyof DimensionStyleState,
        label: string,
        options: { value: string; label: string }[],
    ): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'dsp-field';
        const lbl = document.createElement('label');
        lbl.className = 'dsp-label';
        lbl.textContent = label;
        const select = document.createElement('select');
        select.className = 'dsp-select';
        select.setAttribute('data-dsp-field', key);
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

    private _makeTextField(key: keyof DimensionStyleState, label: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'dsp-field';
        const lbl = document.createElement('label');
        lbl.className = 'dsp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'dsp-input';
        input.value = String(this._state[key]);
        input.setAttribute('data-dsp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _makeCheckboxField(key: keyof DimensionStyleState, label: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'dsp-field dsp-checkbox-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(this._state[key]);
        input.setAttribute('data-dsp-field', key);
        const lbl = document.createElement('label');
        lbl.className = 'dsp-label';
        lbl.textContent = label;
        field.appendChild(input);
        field.appendChild(lbl);
        return field;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-dsp-body]');
        if (!body) return;
        const fields = body.querySelectorAll('[data-dsp-field]');
        for (const el of fields) {
            const key = el.getAttribute('data-dsp-field') as keyof DimensionStyleState;
            const val = this._state[key];
            if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') el.checked = Boolean(val);
                else el.value = String(val);
            } else if (el instanceof HTMLSelectElement) {
                el.value = String(val);
            }
        }
    }

    /**
     * Collect form values, update state, and dispatch a style-change event.
     *
     * TODO(E.annotation.S): replace CustomEvent with
     *   runtime.bus.executeCommand('dimension-style.update', newState)
     */
    private _applyStyle(): void {
        const body = this.element.querySelector('[data-dsp-body]');
        if (!body) return;
        const newState = { ...this._state };
        const fields = body.querySelectorAll('[data-dsp-field]');
        for (const el of fields) {
            const key = el.getAttribute('data-dsp-field') as keyof DimensionStyleState;
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

        // Write to legacy window slot for backward compatibility.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.dimensionStyle = { ...newState };

        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.annotation.S (TASK-15)
    }
}
