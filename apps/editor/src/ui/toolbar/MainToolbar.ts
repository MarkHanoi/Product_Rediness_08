/**
 * MainToolbar — Wave 6 Phase C (wave-6-c-d1)
 *
 * Primary application toolbar: file operations, clipboard, undo/redo,
 * panel toggles, and view controls.  12 buttons, all dispatching typed
 * commands via `runtime.bus.executeCommand`.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T> on the
 *   runtime command bus (no direct store writes).  Registered handlers
 *   in packages/command-bus/ own the actual state changes.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • §10-WAVE-6-CONVERGENCE §3 — "real binding" means button click dispatches
 *   a typed Command<T>; a Vitest test asserts the round-trip.
 * • P8 — Commands carry OTel spans via the bus (runtime-composer).
 *
 * Command naming convention: <verb>-<noun> in kebab-case (per §8).
 *
 * Buttons (12)
 * ────────────
 *   open-project | save-project | undo | redo |
 *   cut-selection | copy-selection | paste-clipboard | delete-selection |
 *   toggle-layer-panel | toggle-property-panel | zoom-fit | zoom-selected
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const MAIN_TOOLBAR_ID = 'main-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface MainToolbarButtonDef {
    readonly commandType: string;
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: 'file' | 'edit' | 'panel' | 'view';
}

export const MAIN_TOOLBAR_BUTTONS: readonly MainToolbarButtonDef[] = [
    // File group
    { commandType: 'open-project',         label: 'Open',     icon: '📂', title: 'Open project',             group: 'file' },
    { commandType: 'save-project',         label: 'Save',     icon: '💾', title: 'Save project',             group: 'file' },
    // Edit group
    { commandType: 'undo',                 label: 'Undo',     icon: '↩', title: 'Undo last action',          group: 'edit' },
    { commandType: 'redo',                 label: 'Redo',     icon: '↪', title: 'Redo last action',          group: 'edit' },
    { commandType: 'cut-selection',        label: 'Cut',      icon: '✂', title: 'Cut selection',             group: 'edit' },
    { commandType: 'copy-selection',       label: 'Copy',     icon: '⎘', title: 'Copy selection',            group: 'edit' },
    { commandType: 'paste-clipboard',      label: 'Paste',    icon: '⎗', title: 'Paste from clipboard',      group: 'edit' },
    { commandType: 'delete-selection',     label: 'Delete',   icon: '🗑', title: 'Delete selection',          group: 'edit' },
    // Panel group
    { commandType: 'toggle-layer-panel',   label: 'Layers',   icon: '⊞', title: 'Toggle layer panel',        group: 'panel' },
    { commandType: 'toggle-property-panel', label: 'Props',   icon: '☰', title: 'Toggle property panel',     group: 'panel' },
    // View group
    { commandType: 'zoom-fit',             label: 'Fit',      icon: '⊡', title: 'Fit view to model',         group: 'view' },
    { commandType: 'zoom-selected',        label: 'Zoom Sel', icon: '⊕', title: 'Zoom to selection',         group: 'view' },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const MAIN_TOOLBAR_STYLES = `
.mt-toolbar {
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
.mt-separator {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.12);
    margin: 0 4px;
    flex-shrink: 0;
}
.mt-btn {
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
.mt-btn:hover {
    background: rgba(0,0,0,0.06);
    border-color: rgba(0,0,0,0.12);
}
.mt-btn:active {
    background: rgba(37,99,235,0.12);
    border-color: var(--app-accent, #2563eb);
}
.mt-btn-icon { font-size: 14px; line-height: 1; }
.mt-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

// ── MainToolbar class ─────────────────────────────────────────────────────────

export class MainToolbar {
    /** Root DOM element — mount at the top of the layout root. */
    public readonly element: HTMLDivElement;

    /** Phase C (S83-WIRE wave-6-c-d1) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[MainToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d1)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'mt-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Main toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-mt-styles', '1');
        style.textContent = MAIN_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of MAIN_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'mt-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'mt-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'mt-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'mt-btn-label';
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
     * The payload is intentionally sparse (no selection ID required for
     * file/view commands); handlers that need richer context subscribe to
     * runtime.selection separately.
     *
     * Command naming: <verb>-<noun> kebab-case per §8 of WAVE-6-CONVERGENCE.
     */
    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(
                `[MainToolbar] runtime is null — command "${commandType}" not dispatched.`,
            );
            return;
        }
        // runtime.bus.executeCommand is the real Phase C binding.
        this.runtime.bus.executeCommand(commandType, {});
    }

    /**
     * Programmatically trigger a toolbar button (useful for keyboard shortcuts
     * wired at a higher level).
     */
    public triggerCommand(commandType: string): void {
        this._dispatch(commandType);
    }
}
