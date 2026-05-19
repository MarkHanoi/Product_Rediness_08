/**
 * ViewToolbar — Wave 6 Phase C (wave-6-c-d2)
 *
 * View control toolbar: camera/view mode switching, rendering toggles,
 * and output actions.  9 buttons, all dispatching typed commands via
 * `runtime.bus.executeCommand`.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T>.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding: button → executeCommand → test.
 * • P8 — OTel span via bus (runtime-composer).
 *
 * Command naming: <verb>-<noun> kebab-case (§8).
 *
 * Buttons (9)
 * ──────────
 *   view-3d | view-plan | view-elevation | view-section | view-walkthrough |
 *   toggle-shadows | toggle-ambient-occlusion | screenshot-view | print-view
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const VIEW_TOOLBAR_ID = 'view-toolbar' as const;

export interface ViewToolbarButtonDef {
    readonly commandType: string;
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: 'camera' | 'render' | 'output';
}

export const VIEW_TOOLBAR_BUTTONS: readonly ViewToolbarButtonDef[] = [
    // Camera / view modes
    { commandType: 'view-3d',                 label: '3D',         icon: '⬡', title: 'Switch to 3D view',            group: 'camera' },
    { commandType: 'view-plan',               label: 'Plan',       icon: '⬜', title: 'Switch to plan view',          group: 'camera' },
    { commandType: 'view-elevation',          label: 'Elevation',  icon: '▭', title: 'Switch to elevation view',     group: 'camera' },
    { commandType: 'view-section',            label: 'Section',    icon: '⊡', title: 'Switch to section view',       group: 'camera' },
    { commandType: 'view-walkthrough',        label: 'Walk',       icon: '🚶', title: 'Start walkthrough mode',      group: 'camera' },
    // Render toggles
    { commandType: 'toggle-shadows',          label: 'Shadows',    icon: '🌑', title: 'Toggle shadow rendering',     group: 'render' },
    { commandType: 'toggle-ambient-occlusion', label: 'AO',        icon: '◉', title: 'Toggle ambient occlusion',    group: 'render' },
    // Output
    { commandType: 'screenshot-view',         label: 'Screenshot', icon: '📷', title: 'Capture view screenshot',     group: 'output' },
    { commandType: 'print-view',              label: 'Print',      icon: '🖨', title: 'Print current view',          group: 'output' },
] as const;

const VIEW_TOOLBAR_STYLES = `
.vt-toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #f7f7f7);
    border-bottom: 1px solid rgba(0,0,0,0.1);
    font-family: var(--app-font,'Inter',sans-serif);
    font-size: 12px; height: 40px; box-sizing: border-box; user-select: none;
}
.vt-separator { width:1px; height:24px; background:rgba(0,0,0,0.12); margin:0 4px; flex-shrink:0; }
.vt-btn {
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
    padding:3px 6px; border:1px solid transparent; border-radius:5px;
    cursor:pointer; background:transparent; color:var(--app-text,#333);
    font-size:11px; min-width:36px; transition:background 0.1s,border-color 0.1s;
}
.vt-btn:hover { background:rgba(0,0,0,0.06); border-color:rgba(0,0,0,0.12); }
.vt-btn:active { background:rgba(37,99,235,0.12); border-color:var(--app-accent,#2563eb); }
.vt-btn-icon { font-size:14px; line-height:1; }
.vt-btn-label { font-size:9px; color:var(--app-text-secondary,#777); line-height:1; }
`;

export class ViewToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[ViewToolbar] runtime is null — commands will not be dispatched. (wave-6-c-d2)');
        }
        this.element = document.createElement('div');
        this.element.className = 'vt-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'View toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-vt-styles', '1');
        s.textContent = VIEW_TOOLBAR_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of VIEW_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'vt-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'vt-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const icon = document.createElement('span');
            icon.className = 'vt-btn-icon';
            icon.textContent = def.icon;
            icon.setAttribute('aria-hidden', 'true');

            const lbl = document.createElement('span');
            lbl.className = 'vt-btn-label';
            lbl.textContent = def.label;

            btn.appendChild(icon);
            btn.appendChild(lbl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[ViewToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    public triggerCommand(commandType: string): void {
        this._dispatch(commandType);
    }
}
