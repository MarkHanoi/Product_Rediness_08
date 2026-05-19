/**
 * QuantityToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Quantity takeoff and material estimation toolbar.  10 buttons covering
 * material/element takeoffs, area/volume calculation, and export.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const QUANTITY_TOOLBAR_ID = 'quantity-toolbar' as const;

export interface QuantityButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'calculate' | 'export';
}

export const QUANTITY_TOOLBAR_BUTTONS: readonly QuantityButtonDef[] = [
    { commandType: 'quantity-material-takeoff', label: 'Materials', icon: '🧱', title: 'Run material quantity takeoff',          group: 'calculate' },
    { commandType: 'quantity-element-count',    label: 'Count',     icon: '⊞',  title: 'Count elements by category',            group: 'calculate' },
    { commandType: 'quantity-area-calculate',   label: 'Area',      icon: '⊡',  title: 'Calculate areas from selected elements', group: 'calculate' },
    { commandType: 'quantity-volume-calculate', label: 'Volume',    icon: '⊟',  title: 'Calculate volumes',                     group: 'calculate' },
    { commandType: 'quantity-filter-apply',     label: 'Filter',    icon: '▼',  title: 'Apply quantity filter',                 group: 'calculate' },
    { commandType: 'quantity-schedule-create',  label: 'Schedule',  icon: '📋', title: 'Create quantity schedule',              group: 'calculate' },
    { commandType: 'quantity-export-csv',       label: 'CSV',       icon: '⬆',  title: 'Export quantities to CSV',              group: 'export'    },
    { commandType: 'quantity-export-excel',     label: 'Excel',     icon: '⬆',  title: 'Export quantities to Excel',            group: 'export'    },
    { commandType: 'quantity-export-ifc',       label: 'IFC',       icon: '⬆',  title: 'Export quantities to IFC',              group: 'export'    },
    { commandType: 'quantity-report-print',     label: 'Print',     icon: '🖨', title: 'Print quantity report',                 group: 'export'    },
] as const;

const QUANTITY_TOOLBAR_STYLES = `
.qtb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.qtb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.qtb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.qtb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.qtb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.qtb-btn-icon { font-size: 14px; line-height: 1; }
.qtb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class QuantityToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[QuantityToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'qtb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Quantity toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-qtb-styles', '1');
        style.textContent = QUANTITY_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of QUANTITY_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'qtb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'qtb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'qtb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'qtb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[QuantityToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
