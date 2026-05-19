/**
 * TextToolbar — Wave 6 Phase C (wave-6-c-d3)
 *
 * 8-button toolbar for BIM text annotation placement and formatting.
 * Groups: Place (2) | Format (4) | Edit (2)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/text/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const TEXT_TOOLBAR_ID = 'text-toolbar' as const;

export interface TextToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'place' | 'format' | 'edit';
}

export const TEXT_TOOLBAR_BUTTONS: readonly TextToolbarButton[] = [
    // Place group (2)
    { commandType: 'text-place',           title: 'Place Text',           icon: 'T',  group: 'place'  },
    { commandType: 'text-place-model',     title: 'Place Model Text',     icon: '3T', group: 'place'  },
    // Format group (4)
    { commandType: 'text-bold',            title: 'Bold',                 icon: 'B',  group: 'format' },
    { commandType: 'text-italic',          title: 'Italic',               icon: 'I',  group: 'format' },
    { commandType: 'text-underline',       title: 'Underline',            icon: 'U',  group: 'format' },
    { commandType: 'text-style',           title: 'Text Style Settings',  icon: 'Aa', group: 'format' },
    // Edit group (2)
    { commandType: 'text-find-replace',    title: 'Find / Replace',       icon: '⌕',  group: 'edit'   },
    { commandType: 'text-spellcheck',      title: 'Check Spelling',       icon: 'Sp', group: 'edit'   },
] as const;

const TT_STYLES = `
.tt-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.tt-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:14px; font-weight:600;
    color:var(--app-text,#333); transition:background 0.12s;
}
.tt-btn:hover { background:rgba(0,0,0,0.08); }
.tt-btn:active { background:rgba(0,0,0,0.14); }
.tt-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class TextToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[TextToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = TT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'tt-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Text Tools');
        toolbar.setAttribute('id', TEXT_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of TEXT_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'tt-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: TextToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'tt-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[TextToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
