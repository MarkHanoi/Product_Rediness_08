/**
 * FamilyToolbar — Wave 6 Phase C (wave-6-c-d7)
 *
 * Family editor toolbar: browse, load, create, edit, reload, place, type-edit,
 * and export operations for BIM families.  8 buttons, each dispatching a
 * typed command via `runtime.bus.executeCommand`.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T> on the
 *   runtime command bus (no direct store writes).  Registered handlers in
 *   packages/command-bus/ own the actual state changes.
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
 *   browse-family-types | load-family | edit-family | create-family |
 *   reload-family | place-family-instance | edit-family-type | export-family
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const FAMILY_TOOLBAR_ID = 'family-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface FamilyToolbarButtonDef {
    readonly commandType: string;
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: 'browse' | 'file' | 'edit' | 'place';
}

export const FAMILY_TOOLBAR_BUTTONS: readonly FamilyToolbarButtonDef[] = [
    // Browse group
    { commandType: 'browse-family-types',   label: 'Browse',    icon: '🗂', title: 'Browse family library',          group: 'browse' },
    // File group
    { commandType: 'load-family',           label: 'Load',      icon: '📂', title: 'Load family from file',          group: 'file' },
    { commandType: 'create-family',         label: 'New',       icon: '✦',  title: 'Create new family',              group: 'file' },
    { commandType: 'reload-family',         label: 'Reload',    icon: '↺',  title: 'Reload family from source',      group: 'file' },
    { commandType: 'export-family',         label: 'Export',    icon: '⬆',  title: 'Export family to .pryzm-family', group: 'file' },
    // Edit group
    { commandType: 'edit-family',           label: 'Edit',      icon: '✏', title: 'Open family in editor',          group: 'edit' },
    { commandType: 'edit-family-type',      label: 'Type',      icon: '⊞',  title: 'Edit type parameters',           group: 'edit' },
    // Place group
    { commandType: 'place-family-instance', label: 'Place',     icon: '⊕',  title: 'Place family instance',          group: 'place' },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const FAMILY_TOOLBAR_STYLES = `
.ft-toolbar {
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
.ft-separator {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.12);
    margin: 0 4px;
    flex-shrink: 0;
}
.ft-btn {
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
    min-width: 36px;
    transition: background 0.1s, border-color 0.1s;
}
.ft-btn:hover {
    background: rgba(0,0,0,0.06);
    border-color: rgba(0,0,0,0.12);
}
.ft-btn:active {
    background: rgba(102,0,255,0.12);
    border-color: var(--app-accent, #6600FF);
}
.ft-btn-icon { font-size: 14px; line-height: 1; }
.ft-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

// ── FamilyToolbar class ───────────────────────────────────────────────────────

export class FamilyToolbar {
    /** Root DOM element — mount below MainToolbar in the family editor layout. */
    public readonly element: HTMLDivElement;

    /** Phase C (S83-WIRE wave-6-c-d7) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[FamilyToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d7)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'ft-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Family toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-ft-styles', '1');
        style.textContent = FAMILY_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of FAMILY_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'ft-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'ft-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'ft-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'ft-btn-label';
            labelEl.textContent = def.label;

            btn.appendChild(iconEl);
            btn.appendChild(labelEl);

            btn.addEventListener('click', () => this._dispatch(def.commandType));

            this.element.appendChild(btn);
        }
    }

    /**
     * Dispatch a command on the runtime command bus.
     *
     * Phase C real binding: every button click routes through here.
     * Command naming: <verb>-<noun> kebab-case per §8 of WAVE-6-CONVERGENCE.
     */
    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(
                `[FamilyToolbar] runtime is null — command "${commandType}" not dispatched.`,
            );
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    /**
     * Programmatically trigger a toolbar button (useful for keyboard shortcuts
     * wired at a higher level or for testing).
     */
    public triggerCommand(commandType: string): void {
        this._dispatch(commandType);
    }
}
