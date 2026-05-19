/**
 * IfcInspectorToolbar — Wave 6 Phase C (wave-6-c-d8)
 *
 * IFC Inspector main toolbar: file-open, element inspection, export,
 * validation, property display, spatial-tree toggle, GUID copy, and
 * category filter operations.  8 buttons, each dispatching a typed command
 * via `runtime.bus.executeCommand`.
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
 * Buttons (8)
 * ────────────
 *   ifc-open-file | ifc-inspect-element | ifc-export-subset | ifc-validate |
 *   ifc-show-properties | ifc-toggle-spatial-tree | ifc-copy-guid |
 *   ifc-filter-by-category
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const IFC_INSPECTOR_TOOLBAR_ID = 'ifc-inspector-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface IfcInspectorButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'file' | 'inspect' | 'data' | 'filter';
}

export const IFC_INSPECTOR_TOOLBAR_BUTTONS: readonly IfcInspectorButtonDef[] = [
    // File group
    { commandType: 'ifc-open-file',           label: 'Open',       icon: '📂', title: 'Open IFC file for inspection',          group: 'file'    },
    // Inspect group
    { commandType: 'ifc-inspect-element',     label: 'Inspect',    icon: '🔍', title: 'Inspect selected element IFC data',      group: 'inspect' },
    { commandType: 'ifc-show-properties',     label: 'Properties', icon: '📋', title: 'Show IFC property sets and attributes',  group: 'inspect' },
    { commandType: 'ifc-toggle-spatial-tree', label: 'Tree',       icon: '🌲', title: 'Toggle IFC spatial structure tree',      group: 'inspect' },
    { commandType: 'ifc-copy-guid',           label: 'GUID',       icon: '🪪', title: 'Copy element GlobalId to clipboard',     group: 'inspect' },
    // Data group
    { commandType: 'ifc-validate',            label: 'Validate',   icon: '✔',  title: 'Run IFC schema validation',              group: 'data'    },
    { commandType: 'ifc-export-subset',       label: 'Export',     icon: '⬆',  title: 'Export selected element subset to IFC', group: 'data'    },
    // Filter group
    { commandType: 'ifc-filter-by-category',  label: 'Category',   icon: '🏷',  title: 'Filter by IFC entity category',         group: 'filter'  },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const IFC_INSPECTOR_TOOLBAR_STYLES = `
.iit-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #f0f4ff);
    border-bottom: 1px solid rgba(0,0,100,0.1);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 12px;
    height: 40px;
    box-sizing: border-box;
    user-select: none;
}
.iit-separator {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.12);
    margin: 0 4px;
    flex-shrink: 0;
}
.iit-btn {
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
.iit-btn:hover {
    background: rgba(0,0,200,0.06);
    border-color: rgba(0,0,200,0.14);
}
.iit-btn:active {
    background: rgba(59,130,246,0.16);
    border-color: #3b82f6;
}
.iit-btn-icon  { font-size: 14px; line-height: 1; }
.iit-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

// ── IfcInspectorToolbar class ─────────────────────────────────────────────────

export class IfcInspectorToolbar {
    /** Root DOM element — mount above the IFC inspector panel. */
    public readonly element: HTMLDivElement;

    /** Phase C (wave-6-c-d8) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[IfcInspectorToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d8)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'iit-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'IFC inspector toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-iit-styles', '1');
        style.textContent = IFC_INSPECTOR_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of IFC_INSPECTOR_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'iit-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'iit-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'iit-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'iit-btn-label';
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
                `[IfcInspectorToolbar] runtime is null — command "${commandType}" not dispatched.`,
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
