/**
 * ModelManagementToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Model linking, phases, design options, and workset management toolbar.
 * 10 buttons covering Revit-style model lifecycle management.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const MODEL_MANAGEMENT_TOOLBAR_ID = 'model-management-toolbar' as const;

export interface ModelMgmtButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'links' | 'phase' | 'options' | 'workset';
}

export const MODEL_MANAGEMENT_TOOLBAR_BUTTONS: readonly ModelMgmtButtonDef[] = [
    { commandType: 'model-link-add',              label: 'Link',       icon: '🔗', title: 'Link an external model',              group: 'links'   },
    { commandType: 'model-link-reload',           label: 'Reload',     icon: '↺',  title: 'Reload linked models',                group: 'links'   },
    { commandType: 'model-link-unload',           label: 'Unload',     icon: '⊖',  title: 'Unload linked model',                 group: 'links'   },
    { commandType: 'model-link-remove',           label: 'Remove',     icon: '✕',  title: 'Remove linked model',                 group: 'links'   },
    { commandType: 'model-phase-set',             label: 'Phase',      icon: '⊡',  title: 'Set project phase',                   group: 'phase'   },
    { commandType: 'model-design-option-new',     label: 'Option',     icon: '✦',  title: 'Create new design option',            group: 'options' },
    { commandType: 'model-design-option-primary', label: 'Primary',    icon: '★',  title: 'Accept design option as primary',     group: 'options' },
    { commandType: 'model-workset-new',           label: 'Workset',    icon: '⊕',  title: 'Create new workset',                  group: 'workset' },
    { commandType: 'model-workset-settings',      label: 'WS Settings', icon: '⚙', title: 'Open workset settings',              group: 'workset' },
    { commandType: 'model-link-bind',             label: 'Bind',       icon: '⊠',  title: 'Bind linked model into project',      group: 'links'   },
] as const;

const MODEL_MGMT_TOOLBAR_STYLES = `
.mmtb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.mmtb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.mmtb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.mmtb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.mmtb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.mmtb-btn-icon { font-size: 14px; line-height: 1; }
.mmtb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class ModelManagementToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[ModelManagementToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'mmtb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Model management toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-mmtb-styles', '1');
        style.textContent = MODEL_MGMT_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of MODEL_MANAGEMENT_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'mmtb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'mmtb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'mmtb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'mmtb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[ModelManagementToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
