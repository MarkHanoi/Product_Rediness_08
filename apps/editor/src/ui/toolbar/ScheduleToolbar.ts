/**
 * ScheduleToolbar — Wave 6 Phase C (wave-6-c-d5)
 *
 * 8-button toolbar for BIM schedule creation and management tools.
 * Groups: Create (2) | Fields (1) | Filters (1) | Sort (1) | Export (2) | Edit (1)
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION P6   — Every button dispatches via runtime.bus.executeCommand.
 *   No direct store writes. No window-global casts (P4).
 * • §01-VISION P8   — commandBus maintains OTel span per command.
 * • §02-ARCHITECTURE §3 — toolbar lives in L7.5; migrates to L5/L7 at Phase E.
 * • Command names follow §8 kebab-case contract (<verb>-<noun>).
 *
 * TODO(Phase-E): register as toolbar.discipline contribution in plugins/schedule/contributions.ts
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const SCHEDULE_TOOLBAR_ID = 'schedule-toolbar' as const;

export interface ScheduleToolbarButton {
    readonly commandType: string;
    readonly title:       string;
    readonly icon:        string;
    readonly group:       'create' | 'fields' | 'filters' | 'sort' | 'export' | 'edit';
}

export const SCHEDULE_TOOLBAR_BUTTONS: readonly ScheduleToolbarButton[] = [
    // Create group (2)
    { commandType: 'schedule-new',           title: 'New Schedule',          icon: '📋', group: 'create' },
    { commandType: 'schedule-from-template', title: 'Schedule from Template', icon: '📄', group: 'create' },
    // Fields group (1)
    { commandType: 'schedule-field-add',     title: 'Add Field',             icon: '➕', group: 'fields' },
    // Filters group (1)
    { commandType: 'schedule-filter-add',    title: 'Add Filter',            icon: '⊘', group: 'filters' },
    // Sort group (1)
    { commandType: 'schedule-sort-add',      title: 'Add Sort Group',        icon: '↕', group: 'sort' },
    // Export group (2)
    { commandType: 'schedule-export-csv',    title: 'Export to CSV',         icon: '⬇', group: 'export' },
    { commandType: 'schedule-export-ifc',    title: 'Export to IFC',         icon: '⬆', group: 'export' },
    // Edit group (1)
    { commandType: 'schedule-edit-cells',    title: 'Edit Schedule Cells',   icon: '✎', group: 'edit' },
] as const;

const SCT_STYLES = `
.sct-toolbar {
    display:inline-flex; align-items:center; gap:2px;
    padding:4px 6px; background:var(--app-toolbar-bg,#f5f5f5);
    border:1px solid rgba(0,0,0,0.12); border-radius:8px;
    font-family:var(--app-font,'Inter',sans-serif);
}
.sct-btn {
    display:inline-flex; align-items:center; justify-content:center;
    width:32px; height:32px; border:none; border-radius:6px;
    background:transparent; cursor:pointer; font-size:15px;
    color:var(--app-text,#333); transition:background 0.12s;
}
.sct-btn:hover { background:rgba(0,0,0,0.08); }
.sct-btn:active { background:rgba(0,0,0,0.14); }
.sct-separator { width:1px; height:22px; background:rgba(0,0,0,0.15); margin:0 3px; flex-shrink:0; }
`;

export class ScheduleToolbar {
    readonly element: HTMLElement;
    private readonly _runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null) {
        this._runtime = runtime;
        this.element  = this._build();
    }

    /** Programmatic command trigger — used by tests and keyboard shortcuts. */
    triggerCommand(commandType: string, payload: Record<string, unknown> = {}): void {
        if (!this._runtime) {
            console.warn(`[ScheduleToolbar] triggerCommand(${commandType}) — no runtime`);
            return;
        }
        this._runtime.bus.executeCommand(commandType, payload);
    }

    private _build(): HTMLElement {
        const styleTag = document.createElement('style');
        styleTag.textContent = SCT_STYLES;

        const toolbar = document.createElement('div');
        toolbar.className = 'sct-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Schedule Tools');
        toolbar.setAttribute('id', SCHEDULE_TOOLBAR_ID);

        let lastGroup: string | null = null;
        for (const btn of SCHEDULE_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && lastGroup !== btn.group) {
                const sep = document.createElement('div');
                sep.className = 'sct-separator';
                toolbar.append(sep);
            }
            lastGroup = btn.group;
            toolbar.append(this._makeButton(btn));
        }

        toolbar.prepend(styleTag);
        return toolbar;
    }

    private _makeButton(def: ScheduleToolbarButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className       = 'sct-btn';
        btn.textContent     = def.icon;
        btn.title           = def.title;
        btn.setAttribute('aria-label', def.title);
        btn.setAttribute('data-command', def.commandType);
        btn.addEventListener('click', () => {
            if (!this._runtime) {
                console.warn(`[ScheduleToolbar] ${def.commandType} clicked — no runtime attached`);
                return;
            }
            this._runtime.bus.executeCommand(def.commandType, {});
        });
        return btn;
    }
}
