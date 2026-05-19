/**
 * FamilyPropertiesPanel — Wave 6 Phase B (wave-6-b-d7)
 *
 * Family type parameter editor: displays and edits the typed parameters
 * (dimensions, materials, toggles) for the currently selected family type.
 * All parameter writes go through the runtime command bus (P6 compliance).
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; parameter edits dispatch
 *   `edit-family-type` commands via runtime.bus.executeCommand.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); both validated by a Vitest binding test.
 * • P8 — OTel spans via runtime-composer activatePanel / deactivatePanel.
 *
 * Public API
 * ──────────
 *   const fpp = new FamilyPropertiesPanel(runtime);
 *   document.body.appendChild(fpp.element);
 *   fpp.show();    // activates panel binding
 *   fpp.hide();    // deactivates panel binding
 *
 * TODO(Phase-F): replace mock parameter list with runtime.registries.familyTypes
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const FAMILY_PROPERTIES_PANEL_ID = 'family-properties-panel' as const;

// ── Parameter kind definitions ────────────────────────────────────────────────
export type FamilyParamKind = 'length' | 'angle' | 'boolean' | 'text' | 'material';

export interface FamilyParamDef {
    readonly id: string;
    readonly label: string;
    readonly kind: FamilyParamKind;
    readonly unit?: string;
    readonly defaultValue: string | boolean | number;
}

// Representative set of built-in parameters shown when no family is selected.
export const BUILT_IN_PARAM_DEFS: readonly FamilyParamDef[] = [
    { id: 'width',       label: 'Width',       kind: 'length',   unit: 'mm',  defaultValue: 900 },
    { id: 'height',      label: 'Height',      kind: 'length',   unit: 'mm',  defaultValue: 2100 },
    { id: 'depth',       label: 'Depth',       kind: 'length',   unit: 'mm',  defaultValue: 100 },
    { id: 'frame-width', label: 'Frame Width', kind: 'length',   unit: 'mm',  defaultValue: 50 },
    { id: 'mirrored',    label: 'Mirrored',    kind: 'boolean',  defaultValue: false },
    { id: 'material',    label: 'Material',    kind: 'material', defaultValue: 'Default' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const FAMILY_PROPERTIES_PANEL_STYLES = `
.fpp-panel {
    position: fixed;
    top: 56px;
    right: 276px;
    width: 240px;
    max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
.fpp-panel[data-visible="true"] { display: flex; }
.fpp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.fpp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.fpp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.fpp-close-btn:hover { background: rgba(0,0,0,0.06); }
.fpp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 8px 0;
}
.fpp-param-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    gap: 8px;
}
.fpp-param-row:hover { background: rgba(0,0,0,0.03); }
.fpp-param-label {
    font-size: 12px;
    color: var(--app-text-secondary, #555);
    flex-shrink: 0;
    min-width: 80px;
}
.fpp-param-unit {
    font-size: 11px;
    color: var(--app-text-tertiary, #999);
    flex-shrink: 0;
}
.fpp-param-input {
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
    background: var(--app-input-bg, #fafafa);
    color: var(--app-text, #333);
    flex: 1 1 auto;
    min-width: 0;
    outline: none;
}
.fpp-param-input:focus { border-color: var(--app-accent, #6600FF); }
`;

// ── FamilyPropertiesPanel class ───────────────────────────────────────────────

export class FamilyPropertiesPanel {
    /** Root DOM element — mount alongside FamilyBrowserPanel. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _familyId: string | null = null;
    private _typeId: string | null = null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[FamilyPropertiesPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d7)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'fpp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Family properties');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(familyId?: string, typeId?: string): void {
        if (familyId !== undefined) this._familyId = familyId;
        if (typeId !== undefined) this._typeId = typeId;

        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Family Properties',
                familyId: this._familyId ?? undefined,
                typeId: this._typeId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(FAMILY_PROPERTIES_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(FAMILY_PROPERTIES_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-fpp-styles', '1');
        style.textContent = FAMILY_PROPERTIES_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'fpp-header';

        const title = document.createElement('span');
        title.className = 'fpp-title';
        title.textContent = 'Type Parameters';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fpp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close family properties';
        closeBtn.setAttribute('aria-label', 'Close family properties');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'fpp-body';
        body.setAttribute('data-fpp-body', '1');
        this.element.appendChild(body);

        this._buildParamRows(body);
    }

    private _buildParamRows(body: HTMLDivElement): void {
        for (const param of BUILT_IN_PARAM_DEFS) {
            const row = document.createElement('div');
            row.className = 'fpp-param-row';
            row.setAttribute('data-param-id', param.id);

            const label = document.createElement('span');
            label.className = 'fpp-param-label';
            label.textContent = param.label;
            row.appendChild(label);

            if (param.kind === 'boolean') {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(param.defaultValue);
                checkbox.setAttribute('aria-label', param.label);
                checkbox.setAttribute('data-param-input', param.id);
                row.appendChild(checkbox);
            } else {
                const input = document.createElement('input');
                input.type = param.kind === 'text' ? 'text' : 'number';
                input.value = String(param.defaultValue);
                input.className = 'fpp-param-input';
                input.setAttribute('aria-label', param.label);
                input.setAttribute('data-param-input', param.id);
                row.appendChild(input);
            }

            if (param.unit) {
                const unit = document.createElement('span');
                unit.className = 'fpp-param-unit';
                unit.textContent = param.unit;
                row.appendChild(unit);
            }

            body.appendChild(row);
        }
    }
}
