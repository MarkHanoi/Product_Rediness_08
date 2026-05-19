import { apiFetch } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { cloneDefaultElementGraphicsRules } from '@pryzm/core-app-model';
import type { ElementState, ElementStateAppearance, PurposeModifier, VisibilityIntent, ViewTypeModifier } from '@pryzm/core-app-model';
import { CreateVisibilityIntentCommand } from '@pryzm/command-registry';
import { UpdateVisibilityIntentCommand } from '@pryzm/command-registry';
// Wave 7 / Stage A2 — mass-edit commands and clipboard helpers.
import {
    BulkApplyAppearanceCommand,
    CopyAppearancePatchToClipboardCommand,
    PasteAppearancePatchFromClipboardCommand,
    appearancePatchClipboardIsPopulated,
    type BulkAppearanceTarget,
} from '@pryzm/command-registry';
import type { AppearancePatch } from '@pryzm/core-app-model';
import { makeDraggable } from './makeDraggable';
import { panelManager } from './PanelManager';

const PANEL_ID = 'panel:visibility-intent';
const STATES: ElementState[] = ['cut', 'beyond', 'hidden', 'projection'];
const VIEW_TYPES = ['plan', 'ceiling-plan', 'section', 'elevation', '3d', 'detail', 'drafting', 'legend'];
const PURPOSES = ['construction-docs', 'design-review', 'coordination', 'presentation'] as const;

// Wave 7 / Stage A1 — AEC line-weight bounds.
// Slider drag range: 0.05 mm – 5.00 mm (covers AEC pen-width palette
// 0.13 / 0.18 / 0.25 / 0.35 / 0.50 / 0.70 mm with headroom).
// Numeric input clamp:  0.001 mm – 10.00 mm (allows typed-in legacy values
// outside the slider range without producing zero/negative pens).
const LINE_WEIGHT_MIN = 0.001;
const LINE_WEIGHT_MAX = 10.0;
const LINE_WEIGHT_SLIDER_MIN = 0.05;
const LINE_WEIGHT_SLIDER_MAX = 5.0;

function validateLineWeight(value: number): number {
    if (!Number.isFinite(value)) return LINE_WEIGHT_MIN;
    return Math.min(LINE_WEIGHT_MAX, Math.max(LINE_WEIGHT_MIN, value));
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export class VisibilityIntentPanel {
    private panel: HTMLElement;
    private selectedIntentId: string | null = null;
    private selectedElementType = 'wall';
    private selectedState: ElementState = 'cut';
    private activeTab: 'rules' | 'modifiers' | 'purpose' | 'view-range' = 'rules';
    /** Stage S3 — per-view-type filter applied to the modifiers tab. */
    private activeViewType: string = 'plan';
    /**
     * Wave 7 / Stage A3 — multi-select set for batch appearance editing.
     * Each entry is `${elementType}::${state}`. When non-empty, the
     * appearance form switches to "batch mode": values that disagree across
     * the set render as `(varies)` placeholders, and field changes dispatch
     * `BulkApplyAppearanceCommand` against the entire set instead of the
     * single (selectedElementType, selectedState) cell.
     */
    private selectedCells = new Set<string>();
    private disposeDrag: (() => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.panel = document.createElement('div');
        this.panel.className = 'vg-panel vi-panel';
        this.panel.style.display = 'none';
        document.body.appendChild(this.panel);
        this.disposeDrag = makeDraggable(this.panel, '.vi-header', ['.vg-close-btn']);
        panelManager.register(PANEL_ID, () => this.close());
        window.addEventListener('vi:intent-created', () => this.render());
        window.addEventListener('vi:intent-updated', () => this.render());
        window.addEventListener('vi:intent-deleted', () => this.render());
    }

    open(intentId?: string): void {
        // Wave 19 (Phase 3A) — runtime.visibility evaluator wired via PryzmRuntime.
        // TODO(Phase 3A completion): call runtime.visibility.evaluate(elements, view)
        // to filter intent applicability against the current view's visibility state.
        const _viSlot = this.runtime?.visibility;
        if (_viSlot) {
            console.debug('[VisibilityIntentPanel] runtime.visibility.evaluate ready:', typeof _viSlot.evaluate);
        }

        const intents = visibilityIntentStore.getAll();
        this.selectedIntentId = intentId && visibilityIntentStore.has(intentId) ? intentId : (this.selectedIntentId ?? intents[0]?.id ?? null);
        panelManager.notifyOpened(PANEL_ID);
        this.panel.style.display = 'flex';
        this.render();
    }

    close(): void {
        this.panel.style.display = 'none';
        panelManager.notifyClosed(PANEL_ID);
    }

    dispose(): void {
        this.disposeDrag?.();
        this.panel.remove();
    }

    private render(): void {
        if (this.panel.style.display === 'none') return;
        const intents = visibilityIntentStore.getAll();
        const selected = this.selectedIntentId ? visibilityIntentStore.get(this.selectedIntentId) : intents[0];
        if (selected && !selected.elementRules[this.selectedElementType]) {
            this.selectedElementType = Object.keys(selected.elementRules)[0] ?? '__default__';
        }

        this.panel.innerHTML = `
            <div class="vg-header vi-header">
                <div class="vg-header-title"><span class="vg-header-icon">◫</span>Visibility Intents</div>
                <button class="vg-close-btn" data-action="close">✕</button>
            </div>
            <div class="vi-shell">
                <div class="vi-sidebar">
                    <button class="vi-btn vi-btn--primary" data-action="new-intent">New Intent</button>
                    <div class="vi-intent-list">
                        ${intents.map(intent => `
                            <button class="vi-intent-row ${intent.id === selected?.id ? 'vi-intent-row--active' : ''}" data-intent-id="${this.escape(intent.id)}">
                                ${this.escape(intent.name)}${intent.isSystem ? ' · system' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="vi-main">
                    ${selected ? this.renderSelected(selected) : '<div class="vg-empty">No visibility intents available.</div>'}
                </div>
            </div>
        `;
        this.bind(selected ?? null);
    }

    private renderSelected(intent: VisibilityIntent): string {
        const rule = intent.elementRules[this.selectedElementType] ?? intent.elementRules.__default__;
        return `
            <div class="vi-toolbar">
                <input class="vi-input" data-field="name" value="${this.escape(intent.name)}" ${intent.isSystem ? 'disabled' : ''}>
                <textarea class="vi-textarea" data-field="description" ${intent.isSystem ? 'disabled' : ''}>${this.escape(intent.description ?? '')}</textarea>
                ${intent.isSystem
                    ? `<button class="vi-btn" data-action="duplicate-intent" title="Create an editable copy of this system intent">Duplicate</button>`
                    : `<button class="vi-btn" data-action="save-meta">Save</button>`}
            </div>
            <div class="vi-tabbar">
                <button class="vi-tab ${this.activeTab === 'rules' ? 'vi-tab--active' : ''}" data-tab="rules">Element Rules</button>
                <button class="vi-tab ${this.activeTab === 'modifiers' ? 'vi-tab--active' : ''}" data-tab="modifiers">View Modifiers</button>
                <button class="vi-tab ${this.activeTab === 'purpose' ? 'vi-tab--active' : ''}" data-tab="purpose">Purpose Modifiers</button>
                <button class="vi-tab ${this.activeTab === 'view-range' ? 'vi-tab--active' : ''}" data-tab="view-range">View Range</button>
            </div>
            <div class="vi-editor">
                ${this.activeTab === 'rules' ? this.renderRules(intent, rule) :
                  this.activeTab === 'modifiers' ? this.renderModifiers(intent) :
                  this.activeTab === 'view-range' ? this.renderViewRange(intent) :
                  this.renderPurposeModifiers(intent)}
            </div>
        `;
    }

    private renderRules(intent: VisibilityIntent, rule: any): string {
        const elementTypes = Object.keys(intent.elementRules);
        const appearance = rule?.[this.selectedState] as ElementStateAppearance | undefined;
        // Wave 7 / Stage A3 — multi-select state (cell key = `${elementType}::${state}`).
        // The form below switches to "batch mode" when this set is non-empty.
        const batchActive = this.selectedCells.size > 0;
        const selectedTypesForState = this.getSelectedElementTypesForState(this.selectedState);
        return `
            <div class="vi-tabbar">
                ${STATES.map(state => `<button class="vi-tab ${state === this.selectedState ? 'vi-tab--active' : ''}" data-state="${state}">${state}</button>`).join('')}
            </div>
            ${this.renderMultiSelectBar(intent, batchActive)}
            <div class="vi-grid">
                <div class="vi-element-list">
                    ${elementTypes.map(type => {
                        const inSel = selectedTypesForState.has(type);
                        const cls = [
                            'vi-element-row',
                            type === this.selectedElementType ? 'vi-element-row--active' : '',
                            inSel ? 'vi-element-row--multi' : '',
                        ].filter(Boolean).join(' ');
                        return `<button class="${cls}" data-element-type="${this.escape(type)}" title="Click to select. Shift+Click to multi-select for batch edit.">${inSel ? '☑ ' : ''}${this.escape(type)}</button>`;
                    }).join('')}
                </div>
                ${appearance
                    ? this.renderAppearanceForm(appearance, intent.isSystem, batchActive, intent)
                    : '<div class="vg-empty">No rule selected.</div>'}
            </div>
        `;
    }

    /** Wave 7 / Stage A3 — header strip showing the active multi-select set. */
    private renderMultiSelectBar(intent: VisibilityIntent, batchActive: boolean): string {
        if (!batchActive) {
            return `<div class="vi-multi-bar vi-multi-bar--hint">
                Tip: Shift+Click element-type rows below to select multiple cells for batch edit.
            </div>`;
        }
        const cells = Array.from(this.selectedCells).sort();
        const summary = cells.length <= 6
            ? cells.map(k => this.escape(k.replace('::', ' · '))).join(', ')
            : `${cells.length} cells across ${new Set(cells.map(k => k.split('::')[0])).size} element type(s)`;
        return `
            <div class="vi-multi-bar vi-multi-bar--active">
                <span class="vi-multi-bar__count">Batch mode · ${cells.length} cell${cells.length === 1 ? '' : 's'}</span>
                <span class="vi-multi-bar__summary" title="${this.escape(cells.join(', '))}">${summary}</span>
                <button class="vi-btn" data-action="multi-clear" title="Exit batch mode">Clear</button>
                <button class="vi-btn" data-action="multi-select-all-states"
                    ${intent.isSystem ? 'disabled' : ''}
                    title="Add all four states for the currently selected element types">All states</button>
            </div>
        `;
    }

    private renderAppearanceForm(
        appearance: ElementStateAppearance,
        disabled: boolean,
        batchActive: boolean,
        intent: VisibilityIntent,
    ): string {
        // Wave 7 / Stage A3 — when in batch mode, scan all selected cells and
        // show "(varies)" placeholders for fields that don't agree across the set.
        const varies = batchActive ? this.computeBatchVariesMap(intent) : null;
        const v = (path: string): boolean => !!varies?.has(path);
        const fmt = (path: string, value: number | string): string => v(path) ? '' : String(value);
        const placeholder = (path: string, fallback = ''): string => v(path) ? 'placeholder="(varies)"' : (fallback ? `placeholder="${this.escape(fallback)}"` : '');
        const checkboxAttr = (path: string, checked: boolean): string => {
            if (v(path)) return 'data-mixed="1"';
            return checked ? 'checked' : '';
        };
        const selectedAttr = (path: string, currentValue: string, optionValue: string): string =>
            !v(path) && currentValue === optionValue ? 'selected' : '';
        const lineWeightVal = v('line.weight') ? '' : String(appearance.line.weight);
        const sliderVal = v('line.weight') ? String(appearance.line.weight) : String(appearance.line.weight);
        // Wave 11 / UI-fix — wrap the entire appearance pane in a single
        // container so it occupies ONE cell of the parent `.vi-grid`
        // (grid-template-columns: 170px 1fr). Previously the toolbar,
        // form, and 3D-Surface section were five siblings flowing into
        // separate grid cells, which placed the form fields underneath
        // the element list in column 1 and stretched the toolbar across
        // the full element-list height (360px) via `align-content:stretch`
        // on the wrapped flex rows — leaving "Copy as patch / Paste patch"
        // floating at the bottom of an apparently empty pane.
        return `
            <div class="vi-appearance-pane">
            ${this.renderMassEditToolbar(disabled)}
            <div class="vi-form">
                <div class="vi-label">Visible</div>
                <input type="checkbox" data-appearance="visible" ${checkboxAttr('visible', appearance.visible)} ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Line weight (mm)</div>
                <div class="vi-line-weight-row" style="display:flex;gap:6px;align-items:center;">
                    <input type="range" class="vi-slider" data-appearance-slider="line.weight"
                        min="${LINE_WEIGHT_SLIDER_MIN}" max="${LINE_WEIGHT_SLIDER_MAX}" step="0.01"
                        value="${sliderVal}" ${disabled ? 'disabled' : ''}
                        style="flex:1;min-width:80px;"
                        title="Drag 0.05–5.00 mm. Type for full 0.001–10.00 mm range.">
                    <input class="vi-input" type="number"
                        min="${LINE_WEIGHT_MIN}" max="${LINE_WEIGHT_MAX}" step="0.01"
                        data-appearance="line.weight"
                        value="${lineWeightVal}" ${placeholder('line.weight')}
                        ${disabled ? 'disabled' : ''}
                        style="width:72px;">
                </div>
                <div class="vi-label">Line colour</div>
                <input class="vi-input" type="color" data-appearance="line.colour" value="${this.escape(appearance.line.colour ?? '#000000')}" data-mixed="${v('line.colour') ? '1' : '0'}" ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Line opacity</div>
                <input class="vi-input" type="number" min="0" max="1" step="0.05" data-appearance="line.opacity" value="${fmt('line.opacity', appearance.line.opacity)}" ${placeholder('line.opacity')} ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Line style</div>
                <select class="vi-select" data-appearance="line.style" ${disabled ? 'disabled' : ''}>
                    ${v('line.style') ? `<option value="" selected>(varies)</option>` : ''}
                    ${['solid', 'dashed', 'dotted', 'chain'].map(value => `<option value="${value}" ${selectedAttr('line.style', appearance.line.style, value)}>${value}</option>`).join('')}
                </select>
                <div class="vi-label">Fill style</div>
                <select class="vi-select" data-appearance="fill.style" ${disabled ? 'disabled' : ''}>
                    ${v('fill.style') ? `<option value="" selected>(varies)</option>` : ''}
                    ${['none', 'solid', 'poche', 'hatch'].map(value => `<option value="${value}" ${selectedAttr('fill.style', appearance.fill.style, value)}>${value}</option>`).join('')}
                </select>
                <div class="vi-label">Fill colour</div>
                <div style="display:flex;gap:4px;align-items:center;">
                  <input class="vi-input" type="color" data-appearance="fill.colour" value="${this.escape(appearance.fill.colour ?? '#ffffff')}" data-mixed="${v('fill.colour') ? '1' : '0'}" ${disabled ? 'disabled' : ''}>
                  <button class="vi-btn" data-appearance-reset="fill.colour" title="Reset to inherit" ${disabled ? 'disabled' : ''}>×</button>
                </div>
                <div class="vi-label">Fill opacity</div>
                <input class="vi-input" type="number" min="0" max="1" step="0.05" data-appearance="fill.opacity" value="${fmt('fill.opacity', appearance.fill.opacity)}" ${placeholder('fill.opacity')} ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Symbolic rule</div>
                <input class="vi-input" data-appearance="symbolicRule" value="${v('symbolicRule') ? '' : this.escape(appearance.symbolicRule ?? '')}" ${placeholder('symbolicRule')} ${disabled ? 'disabled' : ''}>
            </div>
            ${this.render3DSurfaceSection(appearance, disabled, v, fmt, placeholder, selectedAttr, checkboxAttr)}
            </div>
        `;
    }

    /**
     * Wave 8 / Stage S5 — "3D Surface" subsection of the appearance form.
     *
     * Edits flow through the same `data-appearance="surface3D.<field>"` paths
     * as the 2D rows, so single-cell, batch (multi-select), and copy/paste all
     * cover the 3D look without any new wiring. Empty values are treated by
     * `updateAppearance` as "leave inherited" via the existing `(varies)`
     * sentinel; an explicit edit dispatches a single `BulkApplyAppearanceCommand`.
     */
    private render3DSurfaceSection(
        appearance: ElementStateAppearance,
        disabled: boolean,
        v: (path: string) => boolean,
        fmt: (path: string, value: number | string) => string,
        placeholder: (path: string, fallback?: string) => string,
        selectedAttr: (path: string, currentValue: string, optionValue: string) => string,
        checkboxAttr: (path: string, checked: boolean) => string,
    ): string {
        const s = appearance.surface3D ?? {};
        const colourVal = s.colour ?? '#cccccc';
        const opacityVal = s.opacity ?? 1;
        const materialVal = s.material ?? 'flat';
        const edgesVal = s.edges ?? true;
        const metalnessVal = s.metalness ?? 0;
        const roughnessVal = s.roughness ?? 0.6;
        return `
            <div class="vg-section-label" style="margin-top:14px;">3D Surface</div>
            <div style="font-size:0.71rem;color:#888;margin-bottom:6px;font-style:italic;">
                Consumed by 3D / render views only. Leave fields empty to fall back to
                the line/fill colour and the renderer's default material.
            </div>
            <div class="vi-form">
                <div class="vi-label">Surface colour</div>
                <input class="vi-input" type="color"
                    data-appearance="surface3D.colour"
                    value="${this.escape(colourVal)}"
                    data-mixed="${v('surface3D.colour') ? '1' : '0'}"
                    ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Surface opacity</div>
                <input class="vi-input" type="number" min="0" max="1" step="0.05"
                    data-appearance="surface3D.opacity"
                    value="${fmt('surface3D.opacity', opacityVal)}"
                    ${placeholder('surface3D.opacity')}
                    ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Show edges</div>
                <input type="checkbox"
                    data-appearance="surface3D.edges"
                    ${checkboxAttr('surface3D.edges', edgesVal)}
                    ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Material model</div>
                <select class="vi-select" data-appearance="surface3D.material" ${disabled ? 'disabled' : ''}>
                    ${v('surface3D.material') ? `<option value="" selected>(varies)</option>` : ''}
                    ${(['flat', 'pbr', 'unlit'] as const).map(value =>
                        `<option value="${value}" ${selectedAttr('surface3D.material', materialVal, value)}>${value}</option>`,
                    ).join('')}
                </select>
                <div class="vi-label">Metalness (PBR)</div>
                <input class="vi-input" type="number" min="0" max="1" step="0.05"
                    data-appearance="surface3D.metalness"
                    value="${fmt('surface3D.metalness', metalnessVal)}"
                    ${placeholder('surface3D.metalness')}
                    ${disabled ? 'disabled' : ''}>
                <div class="vi-label">Roughness (PBR)</div>
                <input class="vi-input" type="number" min="0" max="1" step="0.05"
                    data-appearance="surface3D.roughness"
                    value="${fmt('surface3D.roughness', roughnessVal)}"
                    ${placeholder('surface3D.roughness')}
                    ${disabled ? 'disabled' : ''}>
            </div>
        `;
    }

    /** Wave 7 / Stage A2 — mass-edit menu. Renders four batch operations
     *  inside the appearance form. The handlers dispatch through the new
     *  Bulk / Copy / Paste appearance commands wired in `bind()`. */
    private renderMassEditToolbar(disabled: boolean): string {
        const hasClipboard = appearancePatchClipboardIsPopulated();
        const dis = disabled ? 'disabled' : '';
        return `
            <div class="vi-mass-edit">
                <span class="vi-mass-edit__label">Apply current appearance to:</span>
                <button class="vi-btn" data-action="mass-apply-states" ${dis}
                    title="Apply this appearance as a patch to all four states (cut · beyond · hidden · projection) of the current element type.">All states</button>
                <button class="vi-btn" data-action="mass-apply-types" ${dis}
                    title="Apply this appearance as a patch to every element type for the current state.">All element types</button>
                <span class="vi-mass-edit__sep">·</span>
                <button class="vi-btn" data-action="mass-copy-patch" ${dis}
                    title="Copy this cell's appearance to the patch clipboard.">Copy as patch</button>
                <button class="vi-btn" data-action="mass-paste-patch" ${dis} ${hasClipboard ? '' : 'disabled'}
                    title="${hasClipboard ? 'Paste the clipboard patch onto the current cell or current multi-selection.' : 'Clipboard empty — copy a patch first.'}">Paste patch</button>
            </div>
        `;
    }

    private renderModifiers(intent: VisibilityIntent): string {
        // Stage S3 — per-view-type filter strip.
        const filter = this.activeViewType;
        const all = intent.viewTypeModifiers ?? [];
        const filtered = filter === '__all__' ? all : all.filter(m => m.viewType === filter);
        const tabs = ['__all__', ...VIEW_TYPES].map(vt =>
            `<button class="vi-tab ${vt === filter ? 'vi-tab--active' : ''}" data-view-type-tab="${vt}">${vt === '__all__' ? 'All' : vt}</button>`,
        ).join('');
        return `
            <div class="vi-tabbar" style="margin-bottom:8px;">${tabs}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="vg-section-label">View type modifiers${filter !== '__all__' ? ` · ${filter}` : ''}</div>
                <button class="vi-btn vi-btn--primary" data-action="add-modifier" ${intent.isSystem ? 'disabled' : ''}>Add Modifier</button>
            </div>
            <div style="font-size:0.71rem;color:#888;margin-bottom:10px;font-style:italic;">Each modifier patches element appearance for a specific view type. Leave fields blank to inherit from the base rule.</div>
            ${filtered.map((modifier) => this.renderModifierRow(modifier, all.indexOf(modifier), intent.isSystem)).join('') || '<div class="vg-empty">No modifiers defined for this view type.</div>'}
        `;
    }

    private renderModifierRow(modifier: ViewTypeModifier, index: number, disabled: boolean): string {
        const sp = modifier.statePatch ?? {};
        const stateFields = (state: ElementState) => {
            const patch = (sp as any)[state] ?? {};
            const line = patch.line ?? {};
            const fill = patch.fill ?? {};
            return `
                <div class="vi-mod-state-col">
                    <div class="vi-mod-state-label">${state}</div>
                    <label class="vi-mod-prop-lbl">Line wt</label>
                    <input class="vi-input vi-mod-state-input" type="number" step="0.01"
                        min="${LINE_WEIGHT_MIN}" max="${LINE_WEIGHT_MAX}"
                        data-modifier-field="statePatch.${state}.line.weight"
                        value="${line.weight !== undefined ? line.weight : ''}"
                        placeholder="inherit" ${disabled ? 'disabled' : ''}
                        title="Line weight in mm (0.001–10.00). Empty = inherit from base.">
                    <label class="vi-mod-prop-lbl">Line colour</label>
                    <input class="vi-input vi-mod-state-input" type="color"
                        data-modifier-field="statePatch.${state}.line.colour"
                        value="${this.escape(line.colour ?? '#000000')}"
                        data-has-value="${line.colour !== undefined ? '1' : '0'}"
                        ${disabled ? 'disabled' : ''}>
                    <label class="vi-mod-prop-lbl">Fill colour</label>
                    <input class="vi-input vi-mod-state-input" type="color"
                        data-modifier-field="statePatch.${state}.fill.colour"
                        value="${this.escape(fill.colour ?? '#ffffff')}"
                        data-has-value="${fill.colour !== undefined ? '1' : '0'}"
                        ${disabled ? 'disabled' : ''}>
                    <label class="vi-mod-prop-lbl">Fill style</label>
                    <select class="vi-select vi-mod-state-input"
                        data-modifier-field="statePatch.${state}.fill.style"
                        ${disabled ? 'disabled' : ''}>
                        <option value="">(inherit)</option>
                        ${['none', 'solid', 'poche', 'hatch'].map(v =>
                            `<option value="${v}" ${fill.style === v ? 'selected' : ''}>${v}</option>`
                        ).join('')}
                    </select>
                    <label class="vi-mod-prop-lbl">Fill opacity</label>
                    <input class="vi-input vi-mod-state-input" type="number" min="0" max="1" step="0.05"
                        data-modifier-field="statePatch.${state}.fill.opacity"
                        value="${fill.opacity !== undefined ? fill.opacity : ''}"
                        placeholder="inherit" ${disabled ? 'disabled' : ''}>
                    <label class="vi-mod-prop-lbl">Visible</label>
                    <select class="vi-select vi-mod-state-input"
                        data-modifier-field="statePatch.${state}.visible"
                        ${disabled ? 'disabled' : ''}>
                        <option value="">(inherit)</option>
                        <option value="true" ${patch.visible === true ? 'selected' : ''}>Yes</option>
                        <option value="false" ${patch.visible === false ? 'selected' : ''}>No</option>
                    </select>
                </div>
            `;
        };
        return `
            <div class="vi-modifier-row" data-modifier-index="${index}">
                <div class="vi-modifier-header">
                    <select class="vi-select vi-mod-header-select" data-modifier-field="viewType" ${disabled ? 'disabled' : ''}>
                        ${VIEW_TYPES.map(v => `<option value="${v}" ${modifier.viewType === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                    <input class="vi-input vi-mod-header-input" data-modifier-field="elementType"
                        value="${this.escape(modifier.elementType ?? '')}"
                        placeholder="all element types" ${disabled ? 'disabled' : ''}>
                    <button class="vi-btn" data-action="delete-modifier" data-modifier-index="${index}" ${disabled ? 'disabled' : ''}>✕</button>
                </div>
                <div class="vi-mod-states-grid">
                    ${STATES.map(state => stateFields(state)).join('')}
                </div>
            </div>
        `;
    }

    private renderPurposeModifiers(intent: VisibilityIntent): string {
        return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="vg-section-label">Purpose modifiers</div>
                <button class="vi-btn vi-btn--primary" data-action="add-purpose-modifier" ${intent.isSystem ? 'disabled' : ''}>Add Modifier</button>
            </div>
            <div style="font-size:0.71rem;color:#888;margin-bottom:10px;font-style:italic;">Purpose modifiers activate when the active view carries a matching purpose field. Applied after view-type modifiers.</div>
            ${(intent.purposeModifiers ?? []).map((mod, i) => this.renderPurposeModifierRow(mod, i, intent.isSystem)).join('') || '<div class="vg-empty">No purpose modifiers defined.</div>'}
        `;
    }

    private renderViewRange(intent: VisibilityIntent): string {
        const disabled = intent.isSystem;
        const pvr = intent.planViewRange;
        const belowDepth = pvr?.belowLevelDepth ?? 1.20;
        const structuralBelowDepth = pvr?.structuralPlanBelowLevelDepth ?? 1.20;
        return `
            <div class="vg-section-label" style="margin-bottom:8px;">Plan View Range</div>
            <div style="font-size:0.71rem;color:#888;margin-bottom:12px;font-style:italic;">
                Controls how far below the active level geometry is shown as hidden-line (:beyond) reference linework in plan views.
                ${disabled ? '<br><strong>Duplicate this intent to edit these settings.</strong>' : ''}
            </div>
            <div class="vi-form">
                <div class="vi-label">Below level depth (m)</div>
                <input class="vi-input" type="number" step="0.01" min="0" max="10"
                    data-vr-field="belowLevelDepth"
                    value="${belowDepth.toFixed(2)}"
                    ${disabled ? 'disabled' : ''}
                    title="Depth below the level floor shown as beyond-reference linework in architectural plan views (default 1.20 m)">
                <div class="vi-label">Structural below depth (m)</div>
                <input class="vi-input" type="number" step="0.01" min="0" max="10"
                    data-vr-field="structuralPlanBelowLevelDepth"
                    value="${structuralBelowDepth.toFixed(2)}"
                    ${disabled ? 'disabled' : ''}
                    title="Depth below the level floor shown as beyond-reference linework in structural plan views (default 1.20 m)">
                ${!disabled ? `<div></div><button class="vi-btn" data-action="save-view-range">Apply</button>` : ''}
            </div>
        `;
    }

    private renderPurposeModifierRow(modifier: PurposeModifier, index: number, disabled: boolean): string {
        const sp = modifier.statePatch ?? {};
        const stateFields = (state: ElementState) => {
            const patch = (sp as any)[state] ?? {};
            const line = patch.line ?? {};
            const fill = patch.fill ?? {};
            return `
                <div class="vi-mod-state-col">
                    <div class="vi-mod-state-label">${state}</div>
                    <label class="vi-mod-prop-lbl">Fill colour</label>
                    <input class="vi-input vi-mod-state-input" type="color"
                        data-purpose-modifier-field="statePatch.${state}.fill.colour"
                        value="${this.escape(fill.colour ?? '#ffffff')}"
                        data-has-value="${fill.colour !== undefined ? '1' : '0'}"
                        ${disabled ? 'disabled' : ''}>
                    <label class="vi-mod-prop-lbl">Fill style</label>
                    <select class="vi-select vi-mod-state-input"
                        data-purpose-modifier-field="statePatch.${state}.fill.style"
                        ${disabled ? 'disabled' : ''}>
                        <option value="">(inherit)</option>
                        ${['none', 'solid', 'poche', 'hatch'].map(v =>
                            `<option value="${v}" ${fill.style === v ? 'selected' : ''}>${v}</option>`
                        ).join('')}
                    </select>
                    <label class="vi-mod-prop-lbl">Line colour</label>
                    <input class="vi-input vi-mod-state-input" type="color"
                        data-purpose-modifier-field="statePatch.${state}.line.colour"
                        value="${this.escape(line.colour ?? '#000000')}"
                        data-has-value="${line.colour !== undefined ? '1' : '0'}"
                        ${disabled ? 'disabled' : ''}>
                    <label class="vi-mod-prop-lbl">Line wt</label>
                    <input class="vi-input vi-mod-state-input" type="number" step="0.01"
                        min="${LINE_WEIGHT_MIN}" max="${LINE_WEIGHT_MAX}"
                        data-purpose-modifier-field="statePatch.${state}.line.weight"
                        value="${line.weight !== undefined ? line.weight : ''}"
                        placeholder="inherit" ${disabled ? 'disabled' : ''}
                        title="Line weight in mm (0.001–10.00). Empty = inherit from base.">
                    <label class="vi-mod-prop-lbl">Fill opacity</label>
                    <input class="vi-input vi-mod-state-input" type="number" min="0" max="1" step="0.05"
                        data-purpose-modifier-field="statePatch.${state}.fill.opacity"
                        value="${fill.opacity !== undefined ? fill.opacity : ''}"
                        placeholder="inherit" ${disabled ? 'disabled' : ''}>
                </div>
            `;
        };
        return `
            <div class="vi-modifier-row" data-purpose-modifier-index="${index}">
                <div class="vi-modifier-header">
                    <select class="vi-select vi-mod-header-select" data-purpose-modifier-field="purpose" ${disabled ? 'disabled' : ''}>
                        ${PURPOSES.map(p => `<option value="${p}" ${modifier.purpose === p ? 'selected' : ''}>${p}</option>`).join('')}
                        ${!PURPOSES.includes(modifier.purpose as any) && modifier.purpose
                            ? `<option value="${this.escape(modifier.purpose)}" selected>${this.escape(modifier.purpose)}</option>` : ''}
                    </select>
                    <input class="vi-input vi-mod-header-input" data-purpose-modifier-field="elementType"
                        value="${this.escape(modifier.elementType ?? '')}"
                        placeholder="all element types" ${disabled ? 'disabled' : ''}>
                    <button class="vi-btn" data-action="delete-purpose-modifier" data-purpose-modifier-index="${index}" ${disabled ? 'disabled' : ''}>✕</button>
                </div>
                <div class="vi-mod-states-grid">
                    ${STATES.map(state => stateFields(state)).join('')}
                </div>
            </div>
        `;
    }

    private bind(intent: VisibilityIntent | null): void {
        this.panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
        this.panel.querySelector('[data-action="new-intent"]')?.addEventListener('click', () => this.createIntent());
        this.panel.querySelectorAll<HTMLElement>('[data-intent-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = btn.dataset.intentId ?? null;
                if (next !== this.selectedIntentId) {
                    // Wave 7 / Stage A3 — multi-select set is per-intent.
                    // Clearing it on intent switch prevents accidental cross-intent batch edits.
                    this.selectedCells.clear();
                }
                this.selectedIntentId = next;
                this.render();
            });
        });
        this.panel.querySelectorAll<HTMLElement>('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeTab = btn.dataset.tab as any;
                this.render();
            });
        });
        // Stage S3 — view-type filter inside the modifiers tab.
        this.panel.querySelectorAll<HTMLElement>('[data-view-type-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeViewType = btn.dataset.viewTypeTab ?? 'plan';
                this.render();
            });
        });
        if (!intent) return;
        this.panel.querySelector('[data-action="duplicate-intent"]')?.addEventListener('click', () => this.duplicateIntent(intent));
        this.panel.querySelectorAll<HTMLElement>('[data-state]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const target = btn.dataset.state as ElementState;
                // Wave 7 / Stage A3 — Shift+Click on a state tab adds the
                // currently selected element type at that state into the set.
                if ((ev as MouseEvent).shiftKey && !intent.isSystem) {
                    const currentType = this.selectedElementType;
                    this.toggleCellInSelection(currentType, target);
                }
                this.selectedState = target;
                this.render();
            });
        });
        this.panel.querySelectorAll<HTMLElement>('[data-element-type]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const type = btn.dataset.elementType ?? this.selectedElementType;
                // Wave 7 / Stage A3 — Shift+Click toggles the cell into the
                // multi-select set without changing the focus type. Plain click
                // sets focus and (if not part of multi-select) clears the set.
                if ((ev as MouseEvent).shiftKey && !intent.isSystem) {
                    this.toggleCellInSelection(type, this.selectedState);
                    this.render();
                    return;
                }
                this.selectedElementType = type;
                this.render();
            });
        });
        if (intent.isSystem) return;
        this.panel.querySelector('[data-action="save-meta"]')?.addEventListener('click', () => {
            const name = (this.panel.querySelector('[data-field="name"]') as HTMLInputElement)?.value.trim();
            const description = (this.panel.querySelector('[data-field="description"]') as HTMLTextAreaElement)?.value.trim();
            this.updateIntent(intent, { name, description });
        });
        this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-appearance]').forEach(input => {
            input.addEventListener('change', () => this.updateAppearance(intent, input));
            input.addEventListener('blur', () => this.updateAppearance(intent, input));
        });
        // Wave 7 / Stage A1 — line-weight slider mirrors the numeric input.
        // Slider drives the same `data-appearance="line.weight"` change pipeline.
        this.panel.querySelectorAll<HTMLInputElement>('[data-appearance-slider]').forEach(slider => {
            const sync = () => {
                const path = slider.dataset.appearanceSlider ?? '';
                const numInput = this.panel.querySelector<HTMLInputElement>(`[data-appearance="${path}"]`);
                if (numInput) {
                    numInput.value = slider.value;
                    this.updateAppearance(intent, numInput);
                }
            };
            // `input` for live drag feedback (auto-saves continuously).
            slider.addEventListener('input', sync);
            slider.addEventListener('change', sync);
        });
        // Wave 7 / Stage A2 — mass-edit toolbar.
        this.panel.querySelector('[data-action="mass-apply-states"]')
            ?.addEventListener('click', () => this.massApplyToAllStates(intent));
        this.panel.querySelector('[data-action="mass-apply-types"]')
            ?.addEventListener('click', () => this.massApplyToAllElementTypes(intent));
        this.panel.querySelector('[data-action="mass-copy-patch"]')
            ?.addEventListener('click', () => this.massCopyPatch(intent));
        this.panel.querySelector('[data-action="mass-paste-patch"]')
            ?.addEventListener('click', () => this.massPastePatch(intent));
        // Wave 7 / Stage A3 — multi-select bar.
        this.panel.querySelector('[data-action="multi-clear"]')?.addEventListener('click', () => {
            this.selectedCells.clear();
            this.render();
        });
        this.panel.querySelector('[data-action="multi-select-all-states"]')?.addEventListener('click', () => {
            // Expand the selection so every selected element type covers all four states.
            const types = new Set<string>();
            for (const key of this.selectedCells) types.add(key.split('::')[0]);
            for (const t of types) for (const s of STATES) this.selectedCells.add(this.cellKey(t, s));
            this.render();
        });
        // Stage S2 — appearance reset (currently wired for fill.colour).
        this.panel.querySelectorAll<HTMLElement>('[data-appearance-reset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const path = btn.dataset.appearanceReset ?? '';
                if (path === 'fill.colour') {
                    const elementRules = { ...(intent.elementRules ?? {}) } as Record<string, any>;
                    const rule = elementRules[this.selectedElementType];
                    const a = rule?.[this.selectedState];
                    if (a?.fill) {
                        const { colour: _drop, ...restFill } = a.fill;
                        elementRules[this.selectedElementType] = {
                            ...rule,
                            [this.selectedState]: { ...a, fill: { ...restFill } },
                        };
                        this.updateIntent(intent, { elementRules });
                    }
                }
            });
        });
        this.panel.querySelector('[data-action="add-modifier"]')?.addEventListener('click', () => {
            const next = [...(intent.viewTypeModifiers ?? []), { viewType: 'plan', statePatch: {} }];
            this.updateIntent(intent, { viewTypeModifiers: next as ViewTypeModifier[] });
        });
        this.panel.querySelectorAll<HTMLElement>('[data-action="delete-modifier"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.dataset.modifierIndex);
                const next = (intent.viewTypeModifiers ?? []).filter((_, i) => i !== index);
                this.updateIntent(intent, { viewTypeModifiers: next });
            });
        });
        this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-modifier-field]').forEach(input => {
            input.addEventListener('change', () => this.updateModifier(intent, input));
            input.addEventListener('blur', () => this.updateModifier(intent, input));
        });
        this.panel.querySelector('[data-action="add-purpose-modifier"]')?.addEventListener('click', () => {
            const next = [...(intent.purposeModifiers ?? []), { purpose: 'construction-docs', statePatch: {} } as PurposeModifier];
            this.updateIntent(intent, { purposeModifiers: next });
        });
        this.panel.querySelectorAll<HTMLElement>('[data-action="delete-purpose-modifier"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.dataset.purposeModifierIndex);
                const next = (intent.purposeModifiers ?? []).filter((_, i) => i !== index);
                this.updateIntent(intent, { purposeModifiers: next });
            });
        });
        this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-purpose-modifier-field]').forEach(input => {
            input.addEventListener('change', () => this.updatePurposeModifier(intent, input));
            input.addEventListener('blur', () => this.updatePurposeModifier(intent, input));
        });
        this.panel.querySelector('[data-action="save-view-range"]')?.addEventListener('click', () => {
            const belowDepthInput = this.panel.querySelector<HTMLInputElement>('[data-vr-field="belowLevelDepth"]');
            const structuralInput = this.panel.querySelector<HTMLInputElement>('[data-vr-field="structuralPlanBelowLevelDepth"]');
            const belowLevelDepth = belowDepthInput ? parseFloat(belowDepthInput.value) : 1.20;
            const structuralPlanBelowLevelDepth = structuralInput ? parseFloat(structuralInput.value) : 1.20;
            if (Number.isFinite(belowLevelDepth) && Number.isFinite(structuralPlanBelowLevelDepth)) {
                this.updateIntent(intent, {
                    planViewRange: { belowLevelDepth, structuralPlanBelowLevelDepth },
                });
            }
        });
    }

    private createIntent(): void {
        const name = window.prompt('Name for the new visibility intent:', 'Custom Documentation Intent');
        if (!name?.trim()) return;
        const now = new Date().toISOString();
        const intent: VisibilityIntent = {
            id: `vi-${crypto.randomUUID()}`,
            name: name.trim(),
            description: '',
            version: 1,
            isSystem: false,
            createdAt: now,
            updatedAt: now,
            elementRules: cloneDefaultElementGraphicsRules(),
            viewTypeModifiers: [],
            purposeModifiers: [],
        };
        const cm = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        cm?.execute?.(new CreateVisibilityIntentCommand(intent), { source: 'HUMAN_DIRECT' });
        this.persistIntent('POST', intent).catch(err => console.warn('[VisibilityIntentPanel] Failed to persist new intent', err));
        this.selectedIntentId = intent.id;
        this.render();
    }

    private duplicateIntent(source: VisibilityIntent): void {
        const defaultName = `${source.name} (Copy)`;
        const name = window.prompt('Name for the duplicated intent:', defaultName);
        if (!name?.trim()) return;
        const now = new Date().toISOString();
        const intent: VisibilityIntent = {
            ...clone(source),
            id: `vi-${crypto.randomUUID()}`,
            name: name.trim(),
            isSystem: false,
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        const cm = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        cm?.execute?.(new CreateVisibilityIntentCommand(intent), { source: 'HUMAN_DIRECT' });
        this.persistIntent('POST', intent).catch(err => console.warn('[VisibilityIntentPanel] Failed to persist duplicated intent', err));
        this.selectedIntentId = intent.id;
        this.render();
    }

    private updateAppearance(intent: VisibilityIntent, input: HTMLInputElement | HTMLSelectElement): void {
        const path = input.dataset.appearance;
        if (!path) return;
        // Wave 7 / Stage A3 — when batch mode is active, ignore "(varies)"
        // sentinel inputs (empty value on a select with `(varies)` option
        // selected, or empty string left in numeric inputs the user did not
        // touch). Only fields the user actually edited get applied.
        const rawValue: any = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
        const isCheckbox = input instanceof HTMLInputElement && input.type === 'checkbox';
        const isNumber = input instanceof HTMLInputElement && input.type === 'number';
        if (this.selectedCells.size > 0 && !isCheckbox && rawValue === '') {
            // Empty placeholder ("(varies)") — user has not chosen a value yet.
            return;
        }
        let value: any = rawValue;
        if (isNumber) value = Number(value);
        if (path === 'symbolicRule' && !value) value = undefined;
        // Wave 7 / Stage A1 — clamp line.weight to the AEC bounds so typed-in
        // out-of-range values can't slip a zero/negative pen into the resolver.
        if (path === 'line.weight' && Number.isFinite(value)) {
            value = validateLineWeight(value);
            // Reflect the clamp back into the form so the user sees the corrected value.
            if (input instanceof HTMLInputElement) input.value = String(value);
            const sliderInput = this.panel.querySelector<HTMLInputElement>('[data-appearance-slider="line.weight"]');
            if (sliderInput) {
                // Clamp to the slider sub-range for the thumb position.
                sliderInput.value = String(Math.min(LINE_WEIGHT_SLIDER_MAX, Math.max(LINE_WEIGHT_SLIDER_MIN, value)));
            }
        }
        // Wave 7 / Stage A3 — batch path: dispatch one BulkApplyAppearanceCommand
        // across the entire multi-select set; single command, single undo step.
        if (this.selectedCells.size > 0) {
            const patch = this.buildSingleFieldPatch(path, value);
            if (!patch) return;
            this.dispatchBulkApply(intent, patch);
            return;
        }
        // Single-cell path (legacy behaviour, preserved).
        const nextRules = clone(intent.elementRules);
        const rule = nextRules[this.selectedElementType];
        if (!rule) return;
        const appearance = rule[this.selectedState] as any;
        const [first, second] = path.split('.');
        if (second) {
            // Wave 8 / Stage S5 — surface3D is the only nested slot that is
            // optional on ElementStateAppearance, so initialise an empty
            // record before writing into it.
            if (first === 'surface3D' && !appearance.surface3D) appearance.surface3D = {};
            appearance[first][second] = value;
        } else {
            appearance[first] = value;
        }
        this.updateIntent(intent, { elementRules: nextRules });
    }

    /** Wave 7 / Stage A2 + A3 — turn one (path, value) edit into an AppearancePatch. */
    private buildSingleFieldPatch(path: string, value: unknown): AppearancePatch | null {
        const [first, second] = path.split('.');
        const patch: AppearancePatch = {};
        if (!second) {
            if (first === 'visible' && typeof value === 'boolean') patch.visible = value;
            else if (first === 'symbolicRule') patch.symbolicRule = value === undefined ? undefined : String(value);
            else if (first === 'ghostStyle') patch.ghostStyle = value as any;
            else if (first === 'ghostOpacity' && typeof value === 'number') patch.ghostOpacity = value;
            else return null;
        } else if (first === 'line') {
            patch.line = { [second]: value } as any;
        } else if (first === 'fill') {
            patch.fill = { [second]: value } as any;
        } else if (first === 'surface3D') {
            // Wave 8 / Stage S5 — 3D-only surface fields routed through the
            // same patch pipeline so bulk-apply and copy/paste cover the 3D
            // appearance alongside the 2D fields.
            patch.surface3D = { [second]: value } as any;
        } else {
            return null;
        }
        return patch;
    }

    /**
     * Wave 7 / Stage A2 + A3 — dispatch a single transactional BulkApply
     * across either an explicit target list or the current multi-select set.
     */
    private dispatchBulkApply(
        intent: VisibilityIntent,
        patch: AppearancePatch,
        explicitTargets?: BulkAppearanceTarget[],
    ): void {
        const targets = explicitTargets ?? this.getBulkTargetsFromMultiSelect(intent.id);
        if (targets.length === 0) return;
        const cm = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        cm?.execute?.(new BulkApplyAppearanceCommand(targets, patch), { source: 'HUMAN_DIRECT' });
        const updated = visibilityIntentStore.get(intent.id);
        if (updated) this.persistIntent('PUT', updated).catch(err => console.warn('[VisibilityIntentPanel] Failed to persist intent', err));
        this.render();
    }

    // ─── Wave 7 / Stage A2 — mass-edit menu handlers ──────────────────────────

    private massApplyToAllStates(intent: VisibilityIntent): void {
        const a = intent.elementRules[this.selectedElementType]?.[this.selectedState];
        if (!a) return;
        const patch = this.captureAppearanceAsPatch(a);
        const targets: BulkAppearanceTarget[] = STATES.map(state => ({
            intentId: intent.id, elementType: this.selectedElementType, state,
        }));
        this.dispatchBulkApply(intent, patch, targets);
    }

    private massApplyToAllElementTypes(intent: VisibilityIntent): void {
        const a = intent.elementRules[this.selectedElementType]?.[this.selectedState];
        if (!a) return;
        const patch = this.captureAppearanceAsPatch(a);
        const targets: BulkAppearanceTarget[] = Object.keys(intent.elementRules).map(elementType => ({
            intentId: intent.id, elementType, state: this.selectedState,
        }));
        this.dispatchBulkApply(intent, patch, targets);
    }

    private massCopyPatch(intent: VisibilityIntent): void {
        const cm = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        cm?.execute?.(
            new CopyAppearancePatchToClipboardCommand(intent.id, this.selectedElementType, this.selectedState),
            { source: 'HUMAN_DIRECT' },
        );
        // Re-render so the Paste button enables.
        this.render();
    }

    private massPastePatch(intent: VisibilityIntent): void {
        const targets: BulkAppearanceTarget[] = this.selectedCells.size > 0
            ? this.getBulkTargetsFromMultiSelect(intent.id)
            : [{ intentId: intent.id, elementType: this.selectedElementType, state: this.selectedState }];
        const cm = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        cm?.execute?.(new PasteAppearancePatchFromClipboardCommand(targets), { source: 'HUMAN_DIRECT' });
        const updated = visibilityIntentStore.get(intent.id);
        if (updated) this.persistIntent('PUT', updated).catch(err => console.warn('[VisibilityIntentPanel] Failed to persist intent', err));
        this.render();
    }

    /** Wave 7 / Stage A2 — capture an `ElementStateAppearance` as a deep AppearancePatch. */
    private captureAppearanceAsPatch(a: ElementStateAppearance): AppearancePatch {
        const patch: AppearancePatch = {
            visible: a.visible,
            line: { ...a.line },
            fill: { ...a.fill },
        };
        if (a.ghostStyle !== undefined) patch.ghostStyle = a.ghostStyle;
        if (a.ghostOpacity !== undefined) patch.ghostOpacity = a.ghostOpacity;
        if (a.symbolicRule !== undefined) patch.symbolicRule = a.symbolicRule;
        // Wave 8 / Stage S5 — capture 3D surface descriptor so "Apply current
        // appearance to all states / element types" carries the 3D look too.
        if (a.surface3D) patch.surface3D = { ...a.surface3D };
        return patch;
    }

    private updateModifier(intent: VisibilityIntent, input: HTMLInputElement | HTMLSelectElement): void {
        const row = input.closest<HTMLElement>('[data-modifier-index]');
        const index = Number(row?.dataset.modifierIndex);
        const field = input.dataset.modifierField;
        if (!Number.isFinite(index) || !field) return;
        const next = clone(intent.viewTypeModifiers ?? []);
        const modifier = next[index];
        if (!modifier) return;

        if (field.startsWith('statePatch.')) {
            const parts = field.split('.');
            const state = parts[1] as ElementState;
            if (!modifier.statePatch) modifier.statePatch = {};
            if (!(modifier.statePatch as any)[state]) (modifier.statePatch as any)[state] = {};
            const stateEntry = (modifier.statePatch as any)[state];

            if (parts.length === 4) {
                const group = parts[2];
                const prop = parts[3];
                if (!stateEntry[group]) stateEntry[group] = {};
                const val = input.value;
                if (val === '') {
                    delete stateEntry[group][prop];
                    if (Object.keys(stateEntry[group]).length === 0) delete stateEntry[group];
                } else {
                    stateEntry[group][prop] = input.type === 'number' ? Number(val) : val;
                }
            } else if (parts.length === 3) {
                const prop = parts[2];
                const val = input.value;
                if (val === '') delete stateEntry[prop];
                else if (val === 'true') stateEntry[prop] = true;
                else if (val === 'false') stateEntry[prop] = false;
                else stateEntry[prop] = val;
            }
            if (Object.keys(stateEntry).length === 0) delete (modifier.statePatch as any)[state];
        } else if (field === 'elementType') {
            modifier.elementType = input.value.trim() || undefined;
        } else {
            (modifier as any)[field] = input.value;
        }
        this.updateIntent(intent, { viewTypeModifiers: next });
    }

    private updatePurposeModifier(intent: VisibilityIntent, input: HTMLInputElement | HTMLSelectElement): void {
        const row = input.closest<HTMLElement>('[data-purpose-modifier-index]');
        const index = Number(row?.dataset.purposeModifierIndex);
        const field = input.dataset.purposeModifierField;
        if (!Number.isFinite(index) || !field) return;
        const next = clone(intent.purposeModifiers ?? []);
        const modifier = next[index];
        if (!modifier) return;

        if (field.startsWith('statePatch.')) {
            const parts = field.split('.');
            const state = parts[1] as ElementState;
            if (!modifier.statePatch) modifier.statePatch = {};
            if (!(modifier.statePatch as any)[state]) (modifier.statePatch as any)[state] = {};
            const stateEntry = (modifier.statePatch as any)[state];

            if (parts.length === 4) {
                const group = parts[2];
                const prop = parts[3];
                if (!stateEntry[group]) stateEntry[group] = {};
                const val = input.value;
                if (val === '') {
                    delete stateEntry[group][prop];
                    if (Object.keys(stateEntry[group]).length === 0) delete stateEntry[group];
                } else {
                    stateEntry[group][prop] = input.type === 'number' ? Number(val) : val;
                }
            } else if (parts.length === 3) {
                const prop = parts[2];
                const val = input.value;
                if (val === '') delete stateEntry[prop];
                else if (val === 'true') stateEntry[prop] = true;
                else if (val === 'false') stateEntry[prop] = false;
                else stateEntry[prop] = val;
            }
            if (Object.keys(stateEntry).length === 0) delete (modifier.statePatch as any)[state];
        } else if (field === 'elementType') {
            modifier.elementType = input.value.trim() || undefined;
        } else {
            (modifier as any)[field] = input.value;
        }
        this.updateIntent(intent, { purposeModifiers: next });
    }

    private updateIntent(intent: VisibilityIntent, patch: Partial<VisibilityIntent>): void {
        const cm = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
        cm?.execute?.(new UpdateVisibilityIntentCommand(intent.id, patch as any), { source: 'HUMAN_DIRECT' });
        const updated = visibilityIntentStore.get(intent.id);
        if (updated) this.persistIntent('PUT', updated).catch(err => console.warn('[VisibilityIntentPanel] Failed to persist intent', err));
    }

    private async persistIntent(method: 'POST' | 'PUT', intent: VisibilityIntent): Promise<void> {
        const projectId = window.currentProjectId; // TODO(C.3.x): legacy currentProjectId — replace with runtime.projectContext.id
        if (!projectId || intent.isSystem) return;
        const url = method === 'POST'
            ? `/api/projects/${projectId}/visibility-intents`
            : `/api/projects/${projectId}/visibility-intents/${intent.id}`;
        const res = await apiFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intent: {
                    id: intent.id,
                    name: intent.name,
                    description: intent.description,
                    version: intent.version,
                    rules: intent.elementRules,
                    modifiers: intent.viewTypeModifiers,
                    purposeModifiers: intent.purposeModifiers ?? [],
                    planViewRange: intent.planViewRange ?? null,
                },
            }),
        });
        if (!res.ok) throw new Error(await res.text());
    }

    // ─── Wave 7 / Stage A3 — multi-select batch helpers ────────────────────────

    private cellKey(elementType: string, state: ElementState): string {
        return `${elementType}::${state}`;
    }

    private getSelectedElementTypesForState(state: ElementState): Set<string> {
        const out = new Set<string>();
        for (const key of this.selectedCells) {
            const [type, st] = key.split('::');
            if (st === state) out.add(type);
        }
        return out;
    }

    /**
     * Wave 7 / Stage A3 — scan the current multi-select set against the
     * selected intent and return a Set of `data-appearance` paths that have
     * differing values across cells. Those paths render as `(varies)` in the
     * batch-mode form.
     */
    private computeBatchVariesMap(intent: VisibilityIntent): Set<string> {
        const varies = new Set<string>();
        const cells = Array.from(this.selectedCells);
        if (cells.length < 2) return varies;
        const paths: Array<readonly [string, (a: ElementStateAppearance) => unknown]> = [
            ['visible',             a => a.visible],
            ['line.weight',         a => a.line.weight],
            ['line.colour',         a => a.line.colour],
            ['line.opacity',        a => a.line.opacity],
            ['line.style',          a => a.line.style],
            ['fill.style',          a => a.fill.style],
            ['fill.colour',         a => a.fill.colour],
            ['fill.opacity',        a => a.fill.opacity],
            ['symbolicRule',        a => a.symbolicRule],
            // Wave 8 / Stage S5 — 3D surface paths surface "(varies)" in the
            // multi-select form when the picked cells disagree on the 3D look.
            ['surface3D.colour',    a => a.surface3D?.colour],
            ['surface3D.opacity',   a => a.surface3D?.opacity],
            ['surface3D.edges',     a => a.surface3D?.edges],
            ['surface3D.material',  a => a.surface3D?.material],
            ['surface3D.metalness', a => a.surface3D?.metalness],
            ['surface3D.roughness', a => a.surface3D?.roughness],
        ];
        const appearances: ElementStateAppearance[] = [];
        for (const key of cells) {
            const [elementType, state] = key.split('::');
            const a = intent.elementRules[elementType]?.[state as ElementState];
            if (a) appearances.push(a);
        }
        if (appearances.length < 2) return varies;
        for (const [path, getter] of paths) {
            const first = JSON.stringify(getter(appearances[0]));
            for (let i = 1; i < appearances.length; i++) {
                if (JSON.stringify(getter(appearances[i])) !== first) {
                    varies.add(path);
                    break;
                }
            }
        }
        return varies;
    }

    /**
     * Wave 7 / Stage A3 — convert the current multi-select set into the
     * `BulkAppearanceTarget[]` shape the BulkApply / Paste commands consume.
     */
    private getBulkTargetsFromMultiSelect(intentId: string): BulkAppearanceTarget[] {
        const out: BulkAppearanceTarget[] = [];
        for (const key of this.selectedCells) {
            const [elementType, state] = key.split('::');
            out.push({ intentId, elementType, state: state as ElementState });
        }
        return out;
    }

    /** Wave 7 / Stage A3 — toggle a (elementType, state) cell into / out of the set. */
    private toggleCellInSelection(elementType: string, state: ElementState): void {
        const key = this.cellKey(elementType, state);
        if (this.selectedCells.has(key)) this.selectedCells.delete(key);
        else this.selectedCells.add(key);
    }

    private escape(value: string): string {
        return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
    }
}
