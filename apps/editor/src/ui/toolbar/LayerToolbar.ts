/**
 * LayerToolbar — Wave 6 Phase C (wave-6-c-d2)
 *
 * Layer management toolbar: create, delete, rename, move elements to layer,
 * lock/unlock layer, and isolate layer.  7 buttons, all dispatching typed
 * commands via `runtime.bus.executeCommand`.
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
 * Buttons (7)
 * ──────────
 *   new-layer | delete-layer | rename-layer | move-to-layer |
 *   lock-layer | unlock-layer | isolate-layer
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const LAYER_TOOLBAR_ID = 'layer-toolbar' as const;

export interface LayerToolbarButtonDef {
    readonly commandType: string;
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: 'manage' | 'move' | 'lock' | 'isolate';
}

export const LAYER_TOOLBAR_BUTTONS: readonly LayerToolbarButtonDef[] = [
    // Manage
    { commandType: 'new-layer',      label: 'New',     icon: '+', title: 'Create new layer',                  group: 'manage' },
    { commandType: 'delete-layer',   label: 'Delete',  icon: '🗑', title: 'Delete active layer',              group: 'manage' },
    { commandType: 'rename-layer',   label: 'Rename',  icon: '✏', title: 'Rename active layer',              group: 'manage' },
    // Move
    { commandType: 'move-to-layer',  label: 'Move',    icon: '→', title: 'Move selection to active layer',    group: 'move' },
    // Lock
    { commandType: 'lock-layer',     label: 'Lock',    icon: '🔒', title: 'Lock active layer',                group: 'lock' },
    { commandType: 'unlock-layer',   label: 'Unlock',  icon: '🔓', title: 'Unlock active layer',              group: 'lock' },
    // Isolate
    { commandType: 'isolate-layer',  label: 'Isolate', icon: '◎', title: 'Isolate active layer (hide rest)', group: 'isolate' },
] as const;

const LAYER_TOOLBAR_STYLES = `
.lt-toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #f7f7f7);
    border-bottom: 1px solid rgba(0,0,0,0.1);
    font-family: var(--app-font,'Inter',sans-serif);
    font-size: 12px; height: 40px; box-sizing: border-box; user-select: none;
}
.lt-separator { width:1px; height:24px; background:rgba(0,0,0,0.12); margin:0 4px; flex-shrink:0; }
.lt-btn {
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
    padding:3px 6px; border:1px solid transparent; border-radius:5px;
    cursor:pointer; background:transparent; color:var(--app-text,#333);
    font-size:11px; min-width:36px; transition:background 0.1s,border-color 0.1s;
}
.lt-btn:hover { background:rgba(0,0,0,0.06); border-color:rgba(0,0,0,0.12); }
.lt-btn:active { background:rgba(37,99,235,0.12); border-color:var(--app-accent,#2563eb); }
.lt-btn-icon { font-size:14px; line-height:1; }
.lt-btn-label { font-size:9px; color:var(--app-text-secondary,#777); line-height:1; }
`;

export class LayerToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[LayerToolbar] runtime is null — commands will not be dispatched. (wave-6-c-d2)');
        }
        this.element = document.createElement('div');
        this.element.className = 'lt-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Layer toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected || typeof document === 'undefined') return;
        const s = document.createElement('style');
        s.setAttribute('data-lt-styles', '1');
        s.textContent = LAYER_TOOLBAR_STYLES;
        document.head.appendChild(s);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of LAYER_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'lt-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'lt-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const icon = document.createElement('span');
            icon.className = 'lt-btn-icon';
            icon.textContent = def.icon;
            icon.setAttribute('aria-hidden', 'true');

            const lbl = document.createElement('span');
            lbl.className = 'lt-btn-label';
            lbl.textContent = def.label;

            btn.appendChild(icon);
            btn.appendChild(lbl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[LayerToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    public triggerCommand(commandType: string): void {
        this._dispatch(commandType);
    }
}
