/**
 * ClashDetectionToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Clash detection and resolution toolbar.  12 buttons covering test setup,
 * filter/group, resolution, reporting, and reset.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const CLASH_DETECTION_TOOLBAR_ID = 'clash-detection-toolbar' as const;

export interface ClashDetectionButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'setup' | 'filter' | 'resolve' | 'report';
}

export const CLASH_DETECTION_TOOLBAR_BUTTONS: readonly ClashDetectionButtonDef[] = [
    { commandType: 'clash-run',              label: 'Run',       icon: '▶',  title: 'Run clash detection',                     group: 'setup'   },
    { commandType: 'clash-select-a',         label: 'Set A',     icon: 'A',  title: 'Set selection A for clash test',          group: 'setup'   },
    { commandType: 'clash-select-b',         label: 'Set B',     icon: 'B',  title: 'Set selection B for clash test',          group: 'setup'   },
    { commandType: 'clash-tolerance-set',    label: 'Tolerance', icon: '⊡',  title: 'Set clash detection tolerance',           group: 'setup'   },
    { commandType: 'clash-filter-new',       label: 'Filter',    icon: '▼',  title: 'Create clash filter rule',                group: 'filter'  },
    { commandType: 'clash-filter-save',      label: 'Save Filter', icon: '💾', title: 'Save current clash filter',            group: 'filter'  },
    { commandType: 'clash-group-clashes',    label: 'Group',     icon: '⊞',  title: 'Group similar clashes',                  group: 'filter'  },
    { commandType: 'clash-highlight-toggle', label: 'Highlight', icon: '◉',  title: 'Toggle clash highlight in viewport',     group: 'filter'  },
    { commandType: 'clash-resolve-selected', label: 'Resolve',   icon: '✓',  title: 'Mark selected clashes resolved',         group: 'resolve' },
    { commandType: 'clash-approve-selected', label: 'Approve',   icon: '✔',  title: 'Approve selected clashes',               group: 'resolve' },
    { commandType: 'clash-report-export',    label: 'Report',    icon: '📋', title: 'Export clash report',                    group: 'report'  },
    { commandType: 'clash-reset',            label: 'Reset',     icon: '↺',  title: 'Reset all clash results',                group: 'report'  },
] as const;

const CLASH_TOOLBAR_STYLES = `
.cdttb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.cdttb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.cdttb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.cdttb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.cdttb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.cdttb-btn-icon { font-size: 14px; line-height: 1; }
.cdttb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class ClashDetectionToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[ClashDetectionToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'cdttb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Clash detection toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-cdttb-styles', '1');
        style.textContent = CLASH_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of CLASH_DETECTION_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'cdttb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'cdttb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'cdttb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'cdttb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[ClashDetectionToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
