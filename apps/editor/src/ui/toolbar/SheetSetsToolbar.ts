/**
 * SheetSetsToolbar — Wave 6 Phase C (wave-6-c-d9)
 *
 * Sheet sets / transmittal set management toolbar: create, open, populate,
 * reorder, export and close multi-sheet transmittal packages.  7 buttons,
 * each dispatching a typed command via `runtime.bus.executeCommand`.
 *
 * Distinction from SheetToolbar (wave-6-c-d5)
 * ────────────────────────────────────────────
 * `SheetToolbar` (d5) targets a single open sheet: new sheet, add view to
 * sheet, add revision, print one sheet.
 * `SheetSetsToolbar` (d9) targets collections of sheets across a project:
 * creating named sets, adding/removing members, exporting a combined PDF or
 * DWF, archiving the set for audit.
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
 * Buttons (7)
 * ────────────
 *   sheet-set-new | sheet-set-open | sheet-set-add-sheet |
 *   sheet-set-remove-sheet | sheet-set-reorder | sheet-set-export |
 *   sheet-set-close
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const SHEET_SETS_TOOLBAR_ID = 'sheet-sets-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface SheetSetsButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'set' | 'members' | 'output';
}

export const SHEET_SETS_TOOLBAR_BUTTONS: readonly SheetSetsButtonDef[] = [
    // Set group
    { commandType: 'sheet-set-new',    label: 'New Set',  icon: '✦',  title: 'Create a new sheet set',               group: 'set'     },
    { commandType: 'sheet-set-open',   label: 'Open Set', icon: '📂', title: 'Open an existing sheet set',            group: 'set'     },
    { commandType: 'sheet-set-close',  label: 'Close',    icon: '✕',  title: 'Close the current sheet set',           group: 'set'     },
    // Members group
    { commandType: 'sheet-set-add-sheet',    label: 'Add',     icon: '⊕',  title: 'Add sheet to current set',      group: 'members' },
    { commandType: 'sheet-set-remove-sheet', label: 'Remove',  icon: '⊖',  title: 'Remove sheet from current set', group: 'members' },
    { commandType: 'sheet-set-reorder',      label: 'Reorder', icon: '⇅',  title: 'Reorder sheets in set',         group: 'members' },
    // Output group
    { commandType: 'sheet-set-export', label: 'Export',   icon: '⬆',  title: 'Export set to combined PDF / DWF',     group: 'output'  },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const SHEET_SETS_TOOLBAR_STYLES = `
.sst-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #f7f7f7);
    border-bottom: 1px solid rgba(0,0,0,0.1);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 12px;
    height: 40px;
    box-sizing: border-box;
    user-select: none;
}
.sst-separator {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.12);
    margin: 0 4px;
    flex-shrink: 0;
}
.sst-btn {
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
    min-width: 38px;
    transition: background 0.1s, border-color 0.1s;
}
.sst-btn:hover {
    background: rgba(0,0,0,0.06);
    border-color: rgba(0,0,0,0.12);
}
.sst-btn:active {
    background: rgba(102,0,255,0.1);
    border-color: var(--app-accent, #6600FF);
}
.sst-btn-icon  { font-size: 14px; line-height: 1; }
.sst-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

// ── SheetSetsToolbar class ────────────────────────────────────────────────────

export class SheetSetsToolbar {
    /** Root DOM element — mount above the SheetBrowserPanel. */
    public readonly element: HTMLDivElement;

    /** Phase C (wave-6-c-d9) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[SheetSetsToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d9)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'sst-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Sheet sets toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-sst-styles', '1');
        style.textContent = SHEET_SETS_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of SHEET_SETS_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'sst-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'sst-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'sst-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'sst-btn-label';
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
                `[SheetSetsToolbar] runtime is null — command "${commandType}" not dispatched.`,
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
