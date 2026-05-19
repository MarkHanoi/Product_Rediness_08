/**
 * ColorToolbar — Wave 6 Phase C (wave-6-c-d4)
 *
 * 6-button toolbar for element color fill and override tools.
 * Groups: Fill (3) | Override (2) | Legend (1)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/graphics/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const COLOR_TOOLBAR_ID = 'color-toolbar' as const;

export interface ColorToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'fill' | 'override' | 'legend';
}

export const COLOR_TOOLBAR_BUTTONS: readonly ColorToolbarButton[] = [
    // Fill group (3)
    { commandType: 'color-fill-by-category',  title: 'Color Fill by Category',  icon: '◧', group: 'fill' },
    { commandType: 'color-fill-by-parameter', title: 'Color Fill by Parameter', icon: '◨', group: 'fill' },
    { commandType: 'color-fill-scheme',       title: 'Edit Color Fill Scheme',  icon: '🎨', group: 'fill' },
    // Override group (2)
    { commandType: 'color-override-element',  title: 'Override Element Color',  icon: '✎', group: 'override' },
    { commandType: 'color-reset-element',     title: 'Reset Element Color',     icon: '↺', group: 'override' },
    // Legend group (1)
    { commandType: 'color-fill-legend',       title: 'Color Fill Legend',       icon: '▤', group: 'legend' },
] as const;

const CT_STYLES = `
.ct-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.ct-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.ct-btn:hover { background:rgba(0,0,0,0.08); }
.ct-btn:active { background:rgba(0,0,0,0.14); }
.ct-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class ColorToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[ColorToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = CT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'ct-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Color Tools');
        toolbar.setAttribute('id', COLOR_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of COLOR_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'ct-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: ColorToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'ct-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[ColorToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
