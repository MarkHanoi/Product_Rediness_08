/**
 * AreaToolbar — Wave 6 Phase C (wave-6-c-d4)
 *
 * 5-button toolbar for BIM area scheme placement and management.
 * Groups: Place (2) | Boundary (1) | Scheme (2)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/area/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const AREA_TOOLBAR_ID = 'area-toolbar' as const;

export interface AreaToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'place' | 'boundary' | 'scheme';
}

export const AREA_TOOLBAR_BUTTONS: readonly AreaToolbarButton[] = [
    // Place group (2)
    { commandType: 'area-place',       title: 'Place Area',             icon: '▦', group: 'place' },
    { commandType: 'area-tag',         title: 'Tag Area',               icon: '🏷', group: 'place' },
    // Boundary group (1)
    { commandType: 'area-boundary',    title: 'Area Boundary Line',     icon: '⬡', group: 'boundary' },
    // Scheme group (2)
    { commandType: 'area-scheme',      title: 'Area Scheme',            icon: '≡', group: 'scheme' },
    { commandType: 'area-color-fill',  title: 'Area Color Fill Scheme', icon: '🎨', group: 'scheme' },
] as const;

const AT_STYLES = `
.at-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.at-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.at-btn:hover { background:rgba(0,0,0,0.08); }
.at-btn:active { background:rgba(0,0,0,0.14); }
.at-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class AreaToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[AreaToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = AT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'at-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Area Tools');
        toolbar.setAttribute('id', AREA_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of AREA_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'at-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: AreaToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'at-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[AreaToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
