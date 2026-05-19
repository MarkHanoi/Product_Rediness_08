/**
 * RoomToolbar — Wave 6 Phase C (wave-6-c-d4)
 *
 * 6-button toolbar for BIM room placement and boundary tools.
 * Groups: Place (3) | Boundary (2) | Properties (1)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/room/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const ROOM_TOOLBAR_ID = 'room-toolbar' as const;

export interface RoomToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'place' | 'boundary' | 'properties';
}

export const ROOM_TOOLBAR_BUTTONS: readonly RoomToolbarButton[] = [
    // Place group (3)
    { commandType: 'room-place',              title: 'Place Room',             icon: '🏠', group: 'place' },
    { commandType: 'room-tag',                title: 'Tag Room',               icon: '🏷', group: 'place' },
    { commandType: 'room-from-enclosed-area', title: 'Room from Enclosed Area', icon: '⬡', group: 'place' },
    // Boundary group (2)
    { commandType: 'room-separator',          title: 'Room Separator',         icon: '─', group: 'boundary' },
    { commandType: 'room-area-boundary',      title: 'Room Area Boundary',     icon: '⬢', group: 'boundary' },
    // Properties group (1)
    { commandType: 'room-properties',         title: 'Room Properties',        icon: '⚙', group: 'properties' },
] as const;

const RT_STYLES = `
.rt-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.rt-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.rt-btn:hover { background:rgba(0,0,0,0.08); }
.rt-btn:active { background:rgba(0,0,0,0.14); }
.rt-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class RoomToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[RoomToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = RT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'rt-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Room Tools');
        toolbar.setAttribute('id', ROOM_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of ROOM_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'rt-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: RoomToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'rt-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[RoomToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
