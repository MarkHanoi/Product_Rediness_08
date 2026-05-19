/**
 * SheetToolbar — Wave 6 Phase C (wave-6-c-d5)
 *
 * 7-button toolbar for BIM sheet composition and output tools.
 * Groups: Create (2) | Content (2) | Revision (1) | Output (2)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/sheets/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const SHEET_TOOLBAR_ID = 'sheet-toolbar' as const;

export interface SheetToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'create' | 'content' | 'revision' | 'output';
}

export const SHEET_TOOLBAR_BUTTONS: readonly SheetToolbarButton[] = [
    // Create group (2)
    { commandType: 'sheet-new',           title: 'New Sheet',              icon: '📄', group: 'create' },
    { commandType: 'sheet-from-template', title: 'Sheet from Template',    icon: '📋', group: 'create' },
    // Content group (2)
    { commandType: 'sheet-view-add',      title: 'Add View to Sheet',      icon: '🖼', group: 'content' },
    { commandType: 'sheet-title-block',   title: 'Edit Title Block',       icon: '✎', group: 'content' },
    // Revision group (1)
    { commandType: 'sheet-revision-add',  title: 'Add Revision',           icon: '↺', group: 'revision' },
    // Output group (2)
    { commandType: 'sheet-print',         title: 'Print Sheet',            icon: '🖨', group: 'output' },
    { commandType: 'sheet-export-pdf',    title: 'Export to PDF',          icon: '⬇', group: 'output' },
] as const;

const SHT_STYLES = `
.sht-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.sht-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.sht-btn:hover { background:rgba(0,0,0,0.08); }
.sht-btn:active { background:rgba(0,0,0,0.14); }
.sht-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class SheetToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[SheetToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = SHT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'sht-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Sheet Tools');
        toolbar.setAttribute('id', SHEET_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of SHEET_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'sht-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: SheetToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'sht-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[SheetToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
