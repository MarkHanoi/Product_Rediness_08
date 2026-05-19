/**
 * CoordinationToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Multi-discipline coordination workflow toolbar.  12 buttons covering review
 * management, model comparison, clash detection, and BCF export.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T> on the
 *   runtime command bus (no direct store writes).
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const COORDINATION_TOOLBAR_ID = 'coordination-toolbar' as const;

export interface CoordinationButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'review' | 'compare' | 'clash' | 'export';
}

export const COORDINATION_TOOLBAR_BUTTONS: readonly CoordinationButtonDef[] = [
    { commandType: 'coordination-review-new',     label: 'New',       icon: '✦',  title: 'Create new coordination review',          group: 'review'  },
    { commandType: 'coordination-review-open',    label: 'Open',      icon: '📂', title: 'Open existing coordination review',       group: 'review'  },
    { commandType: 'coordination-review-assign',  label: 'Assign',    icon: '👤', title: 'Assign review to team member',            group: 'review'  },
    { commandType: 'coordination-review-resolve', label: 'Resolve',   icon: '✓',  title: 'Mark coordination issue resolved',        group: 'review'  },
    { commandType: 'coordination-review-comment', label: 'Comment',   icon: '💬', title: 'Add comment to coordination issue',       group: 'review'  },
    { commandType: 'coordination-model-compare',  label: 'Compare',   icon: '⇌',  title: 'Compare two model revisions',             group: 'compare' },
    { commandType: 'coordination-model-overlay',  label: 'Overlay',   icon: '⊛',  title: 'Overlay models for visual coordination',  group: 'compare' },
    { commandType: 'coordination-clash-detect',   label: 'Detect',    icon: '⚡', title: 'Run clash detection',                    group: 'clash'   },
    { commandType: 'coordination-clash-filter',   label: 'Filter',    icon: '▼',  title: 'Filter clash results',                   group: 'clash'   },
    { commandType: 'coordination-clash-group',    label: 'Group',     icon: '⊞',  title: 'Group similar clashes',                  group: 'clash'   },
    { commandType: 'coordination-bcf-export',     label: 'BCF',       icon: '⬆',  title: 'Export issues as BCF file',              group: 'export'  },
    { commandType: 'coordination-review-export',  label: 'Export',    icon: '📋', title: 'Export coordination report',             group: 'export'  },
] as const;

const COORD_TOOLBAR_STYLES = `
.ctb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.ctb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.ctb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s, border-color 0.1s; }
.ctb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.ctb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.ctb-btn-icon { font-size: 14px; line-height: 1; }
.ctb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class CoordinationToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[CoordinationToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'ctb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Coordination toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-ctb-styles', '1');
        style.textContent = COORD_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of COORDINATION_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'ctb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'ctb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'ctb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'ctb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[CoordinationToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
