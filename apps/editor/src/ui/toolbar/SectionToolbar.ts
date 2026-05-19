/**
 * SectionToolbar — Wave 6 Phase C (wave-6-c-d6)
 *
 * 7-button toolbar for BIM section view creation and management.
 * Groups: Create (2) | Edit (3) | Output (2)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/sections/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const SECTION_TOOLBAR_ID = 'section-toolbar' as const;

export interface SectionToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'create' | 'edit' | 'output';
}

export const SECTION_TOOLBAR_BUTTONS: readonly SectionToolbarButton[] = [
    // Create group (2)
    { commandType: 'section-new',        title: 'New Section',           icon: '✂', group: 'create' },
    { commandType: 'section-callout',    title: 'Section Callout',       icon: '⊞', group: 'create' },
    // Edit group (3)
    { commandType: 'section-flip',       title: 'Flip Section Direction', icon: '↔', group: 'edit' },
    { commandType: 'section-crop',       title: 'Toggle Crop Region',    icon: '⊡', group: 'edit' },
    { commandType: 'section-reference',  title: 'Reference Other View',  icon: '↗', group: 'edit' },
    // Output group (2)
    { commandType: 'section-open-view',  title: 'Open Section View',     icon: '🗗', group: 'output' },
    { commandType: 'section-properties', title: 'Section Properties',    icon: '⚙', group: 'output' },
] as const;

const STB_STYLES = `
.stb-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.stb-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.stb-btn:hover { background:rgba(0,0,0,0.08); }
.stb-btn:active { background:rgba(0,0,0,0.14); }
.stb-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class SectionToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[SectionToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = STB_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'stb-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Section Tools');
        toolbar.setAttribute('id', SECTION_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of SECTION_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'stb-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: SectionToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className   = 'stb-btn';
        btn.textContent = def.icon;
        btn.title       = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[SectionToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
