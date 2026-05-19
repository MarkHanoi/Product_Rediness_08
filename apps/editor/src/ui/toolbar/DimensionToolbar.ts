/**
 * DimensionToolbar — Wave 6 Phase C (wave-6-c-d3)
 *
 * 11-button toolbar for dimension placement and editing tools.
 * Groups: Place (6) | Modify (3) | Witness (2)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/dimension/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const DIMENSION_TOOLBAR_ID = 'dimension-toolbar' as const;

export interface DimensionToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'place' | 'modify' | 'witness';
}

export const DIMENSION_TOOLBAR_BUTTONS: readonly DimensionToolbarButton[] = [
    // Place group (6)
    { commandType: 'dimension-aligned',       title: 'Aligned Dimension',        icon: '↕', group: 'place' },
    { commandType: 'dimension-linear',        title: 'Linear Dimension',         icon: '↔', group: 'place' },
    { commandType: 'dimension-angular',       title: 'Angular Dimension',        icon: '∠', group: 'place' },
    { commandType: 'dimension-radial',        title: 'Radial Dimension',         icon: '⊙', group: 'place' },
    { commandType: 'dimension-diameter',      title: 'Diameter Dimension',       icon: 'Ø', group: 'place' },
    { commandType: 'dimension-arc-length',    title: 'Arc Length Dimension',     icon: '⌒', group: 'place' },
    // Modify group (3)
    { commandType: 'dimension-lock',          title: 'Lock Dimension',           icon: '🔒', group: 'modify' },
    { commandType: 'dimension-override',      title: 'Override Dimension Value', icon: '✎', group: 'modify' },
    { commandType: 'dimension-reset',         title: 'Reset Dimension Override', icon: '↺', group: 'modify' },
    // Witness group (2)
    { commandType: 'dimension-witness-show',  title: 'Show Witness Lines',       icon: '|', group: 'witness' },
    { commandType: 'dimension-witness-gap',   title: 'Set Witness Line Gap',     icon: '‥', group: 'witness' },
] as const;

const DT_STYLES = `
.dt-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.dt-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.dt-btn:hover { background:rgba(0,0,0,0.08); }
.dt-btn:active { background:rgba(0,0,0,0.14); }
.dt-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class DimensionToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[DimensionToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = DT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'dt-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Dimension Tools');
        toolbar.setAttribute('id', DIMENSION_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of DIMENSION_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'dt-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: DimensionToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'dt-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[DimensionToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
