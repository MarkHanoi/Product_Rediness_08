/**
 * BCFToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * BIM Collaboration Format (BCF) issue management toolbar.  11 buttons
 * covering issue creation, assignment, snapshot, status, import/export.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const BCF_TOOLBAR_ID = 'bcf-toolbar' as const;

export interface BcfButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'issue' | 'manage' | 'transfer';
}

export const BCF_TOOLBAR_BUTTONS: readonly BcfButtonDef[] = [
    { commandType: 'bcf-issue-new',       label: 'New',       icon: '✦',  title: 'Create new BCF issue',                  group: 'issue'    },
    { commandType: 'bcf-issue-open',      label: 'Open',      icon: '📂', title: 'Open existing BCF issue',              group: 'issue'    },
    { commandType: 'bcf-issue-close',     label: 'Close',     icon: '✓',  title: 'Close BCF issue',                      group: 'issue'    },
    { commandType: 'bcf-issue-assign',    label: 'Assign',    icon: '👤', title: 'Assign BCF issue to user',             group: 'issue'    },
    { commandType: 'bcf-issue-comment',   label: 'Comment',   icon: '💬', title: 'Add comment to BCF issue',             group: 'manage'   },
    { commandType: 'bcf-issue-snapshot',  label: 'Snapshot',  icon: '📷', title: 'Take viewpoint snapshot for issue',    group: 'manage'   },
    { commandType: 'bcf-issue-status',    label: 'Status',    icon: '●',  title: 'Update issue status',                  group: 'manage'   },
    { commandType: 'bcf-viewpoint-save',  label: 'Viewpoint', icon: '◉',  title: 'Save current viewpoint to issue',      group: 'manage'   },
    { commandType: 'bcf-filter',          label: 'Filter',    icon: '▼',  title: 'Filter BCF issues',                    group: 'manage'   },
    { commandType: 'bcf-import',          label: 'Import',    icon: '⬇',  title: 'Import BCF file',                      group: 'transfer' },
    { commandType: 'bcf-export',          label: 'Export',    icon: '⬆',  title: 'Export issues to BCF file',            group: 'transfer' },
] as const;

const BCF_TOOLBAR_STYLES = `
.bcftb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.bcftb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.bcftb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.bcftb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.bcftb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.bcftb-btn-icon { font-size: 14px; line-height: 1; }
.bcftb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class BCFToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[BCFToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'bcftb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'BCF toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-bcftb-styles', '1');
        style.textContent = BCF_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of BCF_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'bcftb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'bcftb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'bcftb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'bcftb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[BCFToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
