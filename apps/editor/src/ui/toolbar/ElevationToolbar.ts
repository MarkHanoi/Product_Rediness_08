/**
 * ElevationToolbar — Wave 6 Phase C (wave-6-c-d6)
 *
 * 7-button toolbar for BIM elevation view creation and management.
 * Groups: Create (3) | Edit (2) | Output (2)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/elevations/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const ELEVATION_TOOLBAR_ID = 'elevation-toolbar' as const;

export interface ElevationToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'create' | 'edit' | 'output';
}

export const ELEVATION_TOOLBAR_BUTTONS: readonly ElevationToolbarButton[] = [
    // Create group (3)
    { commandType: 'elevation-interior',   title: 'Interior Elevation',      icon: '⬛', group: 'create' },
    { commandType: 'elevation-exterior',   title: 'Exterior Elevation',      icon: '⬜', group: 'create' },
    { commandType: 'elevation-framing',    title: 'Framing Elevation',       icon: '🔲', group: 'create' },
    // Edit group (2)
    { commandType: 'elevation-callout',    title: 'Elevation Callout',       icon: '⊞', group: 'edit' },
    { commandType: 'elevation-flip',       title: 'Flip Elevation Direction', icon: '↔', group: 'edit' },
    // Output group (2)
    { commandType: 'elevation-open-view',  title: 'Open Elevation View',     icon: '🗗', group: 'output' },
    { commandType: 'elevation-properties', title: 'Elevation Properties',    icon: '⚙', group: 'output' },
] as const;

const ELTB_STYLES = `
.eltb-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.eltb-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.eltb-btn:hover { background:rgba(0,0,0,0.08); }
.eltb-btn:active { background:rgba(0,0,0,0.14); }
.eltb-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class ElevationToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[ElevationToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = ELTB_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'eltb-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Elevation Tools');
        toolbar.setAttribute('id', ELEVATION_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of ELEVATION_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'eltb-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: ElevationToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className   = 'eltb-btn';
        btn.textContent = def.icon;
        btn.title       = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[ElevationToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
