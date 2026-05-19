/**
 * AnalysisToolbar — Wave 6 Phase C (wave-6-c-d10)
 *
 * Building performance analysis toolbar.  11 buttons covering energy, daylight,
 * structural, MEP analysis, carbon calculation, and result export.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches via runtime.bus.executeCommand.
 * • §10-WAVE-6-CONVERGENCE §3 — real binding validated by Vitest.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export const ANALYSIS_TOOLBAR_ID = 'analysis-toolbar' as const;

export interface AnalysisButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'run' | 'results' | 'export';
}

export const ANALYSIS_TOOLBAR_BUTTONS: readonly AnalysisButtonDef[] = [
    { commandType: 'analysis-energy-run',       label: 'Energy',     icon: '⚡', title: 'Run energy analysis',                group: 'run'     },
    { commandType: 'analysis-daylighting-run',  label: 'Daylight',   icon: '☀', title: 'Run daylighting analysis',           group: 'run'     },
    { commandType: 'analysis-structural-run',   label: 'Structural', icon: '⊠',  title: 'Run structural analysis',            group: 'run'     },
    { commandType: 'analysis-mep-run',          label: 'MEP',        icon: '⚙', title: 'Run MEP clash / flow analysis',      group: 'run'     },
    { commandType: 'analysis-carbon-calculate', label: 'Carbon',     icon: '🌿', title: 'Calculate embodied carbon',          group: 'run'     },
    { commandType: 'analysis-reset-params',     label: 'Reset',      icon: '↺',  title: 'Reset analysis parameters to defaults', group: 'run'  },
    { commandType: 'analysis-view-results',     label: 'Results',    icon: '📊', title: 'View analysis results panel',        group: 'results' },
    { commandType: 'analysis-compare',          label: 'Compare',    icon: '⇌',  title: 'Compare two analysis runs',          group: 'results' },
    { commandType: 'analysis-report-generate',  label: 'Report',     icon: '📋', title: 'Generate analysis report',           group: 'export'  },
    { commandType: 'analysis-export-idf',       label: 'IDF',        icon: '⬆',  title: 'Export IDF file for energy tool',    group: 'export'  },
    { commandType: 'analysis-gbxml-export',     label: 'gbXML',      icon: '⬆',  title: 'Export gbXML for energy analysis',   group: 'export'  },
] as const;

const ANALYSIS_TOOLBAR_STYLES = `
.atb-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--app-toolbar-bg, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.1); font-family: var(--app-font, 'Inter', sans-serif); font-size: 12px; height: 40px; box-sizing: border-box; user-select: none; }
.atb-separator { width: 1px; height: 24px; background: rgba(0,0,0,0.12); margin: 0 4px; flex-shrink: 0; }
.atb-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; background: transparent; color: var(--app-text, #333); font-size: 11px; min-width: 38px; transition: background 0.1s; }
.atb-btn:hover { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.12); }
.atb-btn:active { background: rgba(102,0,255,0.1); border-color: var(--app-accent, #6600FF); }
.atb-btn-icon { font-size: 14px; line-height: 1; }
.atb-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

export class AnalysisToolbar {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn('[AnalysisToolbar] runtime is null — button commands will not be dispatched. (wave-6-c-d10)');
        }
        this.element = document.createElement('div');
        this.element.className = 'atb-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Analysis toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-atb-styles', '1');
        style.textContent = ANALYSIS_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;
        for (const def of ANALYSIS_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'atb-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;
            const btn = document.createElement('button');
            btn.className = 'atb-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);
            const iconEl = document.createElement('span');
            iconEl.className = 'atb-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');
            const labelEl = document.createElement('span');
            labelEl.className = 'atb-btn-label';
            labelEl.textContent = def.label;
            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(`[AnalysisToolbar] runtime is null — command "${commandType}" not dispatched.`);
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(`[data-command="${commandType}"]`);
        btn?.click();
    }
}
