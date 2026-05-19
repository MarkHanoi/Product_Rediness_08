/**
 * TextStylePanel — Wave 6 Phase B (wave-6-b-d2)
 *
 * BIM text annotation style editor panel: font family, font size, colour,
 * bold/italic, alignment, and line-spacing controls.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation via Commands.  Writes to
 *   `window.textStyle` + CustomEvent for backward compat.
 *   Phase E.annotation.S → runtime.stores.annotation.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span via activatePanel / deactivatePanel (runtime-composer).
 *
 * Public API
 * ──────────
 *   const tsp = new TextStylePanel(runtime);
 *   document.body.appendChild(tsp.element);
 *   tsp.show();   // activates panel binding
 *   tsp.hide();   // deactivates panel binding
 *
 * TODO(E.annotation.S): migrate → runtime.stores.annotation
 * TODO(E.annotation.S): replace CustomEvent → runtime.bus.executeCommand('text-style.update', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const TEXT_STYLE_PANEL_ID = 'text-style-panel' as const;

// ── Style schema ──────────────────────────────────────────────────────────────
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface TextStyleState {
    fontFamily: string;
    fontSize: number;        // in pts
    color: string;           // CSS hex
    bold: boolean;
    italic: boolean;
    underline: boolean;
    alignment: TextAlignment;
    lineSpacing: number;     // multiplier, e.g. 1.15
}

const DEFAULT_TEXT_STYLE: TextStyleState = {
    fontFamily: 'Arial',
    fontSize: 10,
    color: '#000000',
    bold: false,
    italic: false,
    underline: false,
    alignment: 'left',
    lineSpacing: 1.15,
};

// ── Inline styles ─────────────────────────────────────────────────────────────
const TSP_STYLES = `
.tsp-panel {
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
.tsp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.tsp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.tsp-close-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; color: var(--app-text-secondary, #888);
    padding: 0 2px; line-height: 1;
}
.tsp-close-btn:hover { color: var(--app-text, #333); }
.tsp-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.tsp-field { display: flex; flex-direction: column; gap: 3px; }
.tsp-label { font-size: 11px; color: var(--app-text-secondary, #888); font-weight: 500; }
.tsp-input, .tsp-select {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; border: 1px solid rgba(0,0,0,0.15);
    border-radius: 5px; font-size: 12px;
    background: var(--app-input-bg, #fafafa);
    color: var(--app-text, #333);
}
.tsp-toggle-row { display: flex; gap: 6px; }
.tsp-toggle-btn {
    flex: 1; padding: 5px; border: 1px solid rgba(0,0,0,0.15);
    border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: 600;
    background: var(--app-input-bg, #fafafa); color: var(--app-text, #333);
}
.tsp-toggle-btn.tsp-active {
    background: var(--app-accent, #2563eb); color: #fff;
    border-color: var(--app-accent, #2563eb);
}
.tsp-apply-btn {
    margin-top: 4px; padding: 7px 14px;
    background: var(--app-accent, #2563eb);
    color: #fff; border: none; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer;
}
.tsp-apply-btn:hover { opacity: 0.88; }
`;

// ── TextStylePanel class ──────────────────────────────────────────────────────

export class TextStylePanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;
    private _state: TextStyleState;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._state = { ...DEFAULT_TEXT_STYLE };

        if (!runtime) {
            console.warn(
                '[TextStylePanel] runtime is null — activatePanel/deactivatePanel ' +
                'binding will be skipped.  Wire PryzmRuntime in composition root. (wave-6-b-d2)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'tsp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public lifecycle API ──────────────────────────────────────────────────

    public show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Text Style Panel',
                elementType: 'text',
            };
            this.runtime.viewRegistry.activatePanel(TEXT_STYLE_PANEL_ID, spec);
        }
    }

    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(TEXT_STYLE_PANEL_ID);
    }

    public setStyle(style: Partial<TextStyleState>): void {
        this._state = { ...this._state, ...style };
        this._syncFormToState();
    }

    public getStyle(): TextStyleState {
        return { ...this._state };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-tsp-styles', '1');
        style.textContent = TSP_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'tsp-header';

        const title = document.createElement('span');
        title.className = 'tsp-title';
        title.textContent = 'Text Style';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tsp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close text style panel';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'tsp-body';
        body.setAttribute('data-tsp-body', '1');

        // Font family
        body.appendChild(this._makeSelectField('fontFamily', 'Font Family', [
            { value: 'Arial',          label: 'Arial' },
            { value: 'Times New Roman', label: 'Times New Roman' },
            { value: 'Courier New',    label: 'Courier New' },
            { value: 'Georgia',        label: 'Georgia' },
            { value: 'Verdana',        label: 'Verdana' },
        ]));

        // Font size
        body.appendChild(this._makeNumberField('fontSize', 'Font Size (pt)', 4, 144, 0.5));

        // Color
        body.appendChild(this._makeColorField('color', 'Text Color'));

        // Bold / Italic / Underline toggles
        const toggleRow = document.createElement('div');
        toggleRow.className = 'tsp-toggle-row';
        toggleRow.setAttribute('data-tsp-toggle-row', '1');

        const boldBtn = document.createElement('button');
        boldBtn.className = 'tsp-toggle-btn' + (this._state.bold ? ' tsp-active' : '');
        boldBtn.textContent = 'B';
        boldBtn.title = 'Bold';
        boldBtn.setAttribute('data-tsp-toggle', 'bold');
        boldBtn.addEventListener('click', () => {
            this._state = { ...this._state, bold: !this._state.bold };
            boldBtn.classList.toggle('tsp-active', this._state.bold);
        });

        const italicBtn = document.createElement('button');
        italicBtn.className = 'tsp-toggle-btn' + (this._state.italic ? ' tsp-active' : '');
        italicBtn.style.fontStyle = 'italic';
        italicBtn.textContent = 'I';
        italicBtn.title = 'Italic';
        italicBtn.setAttribute('data-tsp-toggle', 'italic');
        italicBtn.addEventListener('click', () => {
            this._state = { ...this._state, italic: !this._state.italic };
            italicBtn.classList.toggle('tsp-active', this._state.italic);
        });

        const underlineBtn = document.createElement('button');
        underlineBtn.className = 'tsp-toggle-btn' + (this._state.underline ? ' tsp-active' : '');
        underlineBtn.style.textDecoration = 'underline';
        underlineBtn.textContent = 'U';
        underlineBtn.title = 'Underline';
        underlineBtn.setAttribute('data-tsp-toggle', 'underline');
        underlineBtn.addEventListener('click', () => {
            this._state = { ...this._state, underline: !this._state.underline };
            underlineBtn.classList.toggle('tsp-active', this._state.underline);
        });

        toggleRow.appendChild(boldBtn);
        toggleRow.appendChild(italicBtn);
        toggleRow.appendChild(underlineBtn);
        body.appendChild(toggleRow);

        // Alignment
        body.appendChild(this._makeSelectField('alignment', 'Alignment', [
            { value: 'left',    label: '← Left' },
            { value: 'center',  label: '↔ Center' },
            { value: 'right',   label: '→ Right' },
            { value: 'justify', label: '⇔ Justify' },
        ]));

        // Line spacing
        body.appendChild(this._makeNumberField('lineSpacing', 'Line Spacing', 0.8, 4, 0.05));

        // Apply button
        const applyBtn = document.createElement('button');
        applyBtn.className = 'tsp-apply-btn';
        applyBtn.textContent = 'Apply Style';
        applyBtn.addEventListener('click', () => this._applyStyle());
        body.appendChild(applyBtn);

        this.element.appendChild(body);
    }

    private _makeNumberField(
        key: keyof TextStyleState,
        label: string,
        min: number,
        max: number,
        step: number,
    ): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tsp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tsp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'tsp-input';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(this._state[key]);
        input.setAttribute('data-tsp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _makeSelectField(
        key: keyof TextStyleState,
        label: string,
        options: { value: string; label: string }[],
    ): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tsp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tsp-label';
        lbl.textContent = label;
        const select = document.createElement('select');
        select.className = 'tsp-select';
        select.setAttribute('data-tsp-field', key);
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

    private _makeColorField(key: keyof TextStyleState, label: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = 'tsp-field';
        const lbl = document.createElement('label');
        lbl.className = 'tsp-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'tsp-input';
        input.value = String(this._state[key]);
        input.setAttribute('data-tsp-field', key);
        field.appendChild(lbl);
        field.appendChild(input);
        return field;
    }

    private _syncFormToState(): void {
        const body = this.element.querySelector('[data-tsp-body]');
        if (!body) return;
        const fields = body.querySelectorAll('[data-tsp-field]');
        for (const el of fields) {
            const key = el.getAttribute('data-tsp-field') as keyof TextStyleState;
            if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
                el.value = String(this._state[key]);
            }
        }
    }

    /**
     * Collect form values, update state, and dispatch a style-change event.
     *
     * TODO(E.annotation.S): replace CustomEvent with
     *   runtime.bus.executeCommand('text-style.update', newState)
     */
    private _applyStyle(): void {
        const body = this.element.querySelector('[data-tsp-body]');
        if (!body) return;
        const newState = { ...this._state };
        const fields = body.querySelectorAll('[data-tsp-field]');
        for (const el of fields) {
            const key = el.getAttribute('data-tsp-field') as keyof TextStyleState;
            if (el instanceof HTMLInputElement) {
                if (el.type === 'number') {
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
        window.textStyle = { ...newState };
        // F.events.3: no active DOM listeners — dispatch removed; migrate to commandBus in E.annotation.S (TASK-15)
    }
}
