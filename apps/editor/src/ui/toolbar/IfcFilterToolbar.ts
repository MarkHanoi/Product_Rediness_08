/**
 * IfcFilterToolbar — Wave 6 Phase C (wave-6-c-d8)
 *
 * IFC Inspector filter toolbar: query/filter operations for narrowing the
 * inspector view to a specific storey, IFC type, property value, spatial
 * zone, or a saved named filter.  7 buttons dispatching typed commands.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T> on the
 *   runtime command bus (no direct store writes).
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • §10-WAVE-6-CONVERGENCE §3 — "real binding" means button click dispatches
 *   a typed Command<T>; a Vitest test asserts the round-trip.
 * • P8 — Commands carry OTel spans via the bus (runtime-composer).
 *
 * Command naming convention: <verb>-<noun> in kebab-case (per §8).
 *
 * Buttons (7)
 * ────────────
 *   ifc-filter-clear | ifc-filter-by-storey | ifc-filter-by-type |
 *   ifc-filter-by-property | ifc-filter-spatial | ifc-filter-save |
 *   ifc-filter-load
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const IFC_FILTER_TOOLBAR_ID = 'ifc-filter-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface IfcFilterButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'filter' | 'persist';
}

export const IFC_FILTER_TOOLBAR_BUTTONS: readonly IfcFilterButtonDef[] = [
    // Filter group
    { commandType: 'ifc-filter-clear',       label: 'Clear',    icon: '✕',  title: 'Clear all active IFC filters',             group: 'filter'  },
    { commandType: 'ifc-filter-by-storey',   label: 'Storey',   icon: '🏢', title: 'Filter elements by building storey',       group: 'filter'  },
    { commandType: 'ifc-filter-by-type',     label: 'Type',     icon: '⊞',  title: 'Filter by IFC entity type (IfcWall etc.)', group: 'filter'  },
    { commandType: 'ifc-filter-by-property', label: 'Property', icon: '🔑', title: 'Filter by property name / value',          group: 'filter'  },
    { commandType: 'ifc-filter-spatial',     label: 'Spatial',  icon: '📐', title: 'Filter by spatial zone or IfcSpace',       group: 'filter'  },
    // Persist group
    { commandType: 'ifc-filter-save',        label: 'Save',     icon: '💾', title: 'Save current filter as a named preset',    group: 'persist' },
    { commandType: 'ifc-filter-load',        label: 'Load',     icon: '📂', title: 'Load a saved filter preset',               group: 'persist' },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const IFC_FILTER_TOOLBAR_STYLES = `
.ift-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #f0f8f0);
    border-bottom: 1px solid rgba(0,80,0,0.08);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 12px;
    height: 40px;
    box-sizing: border-box;
    user-select: none;
}
.ift-separator {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.12);
    margin: 0 4px;
    flex-shrink: 0;
}
.ift-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 3px 6px;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    background: transparent;
    color: var(--app-text, #333);
    font-size: 11px;
    min-width: 40px;
    transition: background 0.1s, border-color 0.1s;
}
.ift-btn:hover {
    background: rgba(0,120,0,0.06);
    border-color: rgba(0,120,0,0.14);
}
.ift-btn:active {
    background: rgba(34,197,94,0.16);
    border-color: #22c55e;
}
.ift-btn-icon  { font-size: 14px; line-height: 1; }
.ift-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

// ── IfcFilterToolbar class ────────────────────────────────────────────────────

export class IfcFilterToolbar {
    /** Root DOM element — mount below IfcInspectorToolbar in the inspector layout. */
    public readonly element: HTMLDivElement;

    /** Phase C (wave-6-c-d8) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[IfcFilterToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d8)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'ift-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'IFC filter toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-ift-styles', '1');
        style.textContent = IFC_FILTER_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of IFC_FILTER_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'ift-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'ift-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'ift-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'ift-btn-label';
            labelEl.textContent = def.label;

            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    /**
     * Dispatch a command on the runtime command bus.
     * Phase C real binding: every button click routes through here.
     */
    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(
                `[IfcFilterToolbar] runtime is null — command "${commandType}" not dispatched.`,
            );
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    /**
     * Programmatically trigger a button (useful for keyboard shortcuts).
     * Noop if the command is not registered on this toolbar.
     */
    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(
            `[data-command="${commandType}"]`,
        );
        btn?.click();
    }
}
