/**
 * EditToolbar — Wave 6 Phase C (wave-6-c-d2)
 *
 * Element editing toolbar: transform operations, alignment, pin/lock,
 * group/ungroup controls.  14 buttons, all dispatching typed commands
 * via `runtime.bus.executeCommand`.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T> on the
 *   runtime command bus (no direct store writes).
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding: button → executeCommand → test.
 * • P8 — OTel span via bus (runtime-composer).
 *
 * Command naming: <verb>-<noun> kebab-case (§8).
 *
 * Buttons (14)
 * ────────────
 *   move-selection | rotate-selection | mirror-selection | scale-selection |
 *   align-left | align-right | align-top | align-bottom |
 *   pin-element | unpin-element |
 *   group-elements | ungroup-elements |
 *   lock-element | unlock-element
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const EDIT_TOOLBAR_ID = 'edit-toolbar' as const;

export interface EditToolbarButtonDef {
    readonly commandType: string;
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: 'transform' | 'align' | 'pin' | 'group' | 'lock';
}

export const EDIT_TOOLBAR_BUTTONS: readonly EditToolbarButtonDef[] = [
    // Transform
    { commandType: 'move-selection',   label: 'Move',    icon: '✥', title: 'Move selection',           group: 'transform' },
    { commandType: 'rotate-selection', label: 'Rotate',  icon: '↻', title: 'Rotate selection',         group: 'transform' },
    { commandType: 'mirror-selection', label: 'Mirror',  icon: '⇔', title: 'Mirror selection',         group: 'transform' },
    { commandType: 'scale-selection',  label: 'Scale',   icon: '⤡', title: 'Scale selection',          group: 'transform' },
    // Align
    { commandType: 'align-left',       label: 'Align L', icon: '⫛', title: 'Align left edges',         group: 'align' },
    { commandType: 'align-right',      label: 'Align R', icon: '⫝', title: 'Align right edges',        group: 'align' },
    { commandType: 'align-top',        label: 'Align T', icon: '⊤', title: 'Align top edges',          group: 'align' },
    { commandType: 'align-bottom',     label: 'Align B', icon: '⊥', title: 'Align bottom edges',       group: 'align' },
    // Pin
    { commandType: 'pin-element',      label: 'Pin',     icon: '📌', title: 'Pin element in place',     group: 'pin' },
    { commandType: 'unpin-element',    label: 'Unpin',   icon: '📍', title: 'Unpin element',            group: 'pin' },
    // Group
    { commandType: 'group-elements',   label: 'Group',   icon: '⊞', title: 'Group selected elements',  group: 'group' },
    { commandType: 'ungroup-elements', label: 'Ungroup', icon: '⊟', title: 'Ungroup selection',        group: 'group' },
    // Lock
    { commandType: 'lock-element',     label: 'Lock',    icon: '🔒', title: 'Lock element',             group: 'lock' },
    { commandType: 'unlock-element',   label: 'Unlock',  icon: '🔓', title: 'Unlock element',           group: 'lock' },
] as const;

const EDIT_TOOLBAR_STYLES = `
.et-toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #f7f7f7);
    border-bottom: 1px solid rgba(0,0,0,0.1);
    font-family: var(--app-font,'Inter',sans-serif);
    font-size: 12px; height: 40px; box-sizing: border-box; user-select: none;
}
.et-separator { width:1px; height:24px; background:rgba(0,0,0,0.12); margin:0 4px; flex-shrink:0; }
.et-btn {
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
    padding:3px 6px; border:1px solid transparent; border-radius:5px;
    cursor:pointer; background:transparent; color:var(--app-text,#333);
    font-size:11px; min-width:36px; transition:background 0.1s,border-color 0.1s;
}
.et-btn:hover { background:rgba(0,0,0,0.06); border-color:rgba(0,0,0,0.12); }
.et-btn:active { background:rgba(37,99,235,0.12); border-color:var(--app-accent,#2563eb); }
.et-btn-icon { font-size:14px; line-height:1; }
.et-btn-label { font-size:9px; color:var(--app-text-secondary,#777); line-height:1; }
`;

export class EditToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[EditToolbar] runtime is null — commands will not be dispatched. (wave-6-c-d2)');
        }
        this.element = document.createElement('div');
        this.element.className = 'et-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Edit toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-et-styles', '1');
        s.textContent = EDIT_TOOLBAR_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of EDIT_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'et-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'et-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const icon = document.createElement('span');
            icon.className = 'et-btn-icon';
            icon.textContent = def.icon;
            icon.setAttribute('aria-hidden', 'true');

            const lbl = document.createElement('span');
            lbl.className = 'et-btn-label';
            lbl.textContent = def.label;

            btn.appendChild(icon);
            btn.appendChild(lbl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[EditToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    public triggerCommand(commandType: string): void {
        this._dispatch(commandType);
    }
}
