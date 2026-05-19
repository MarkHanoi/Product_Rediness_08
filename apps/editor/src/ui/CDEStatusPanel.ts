/**
 * CDEStatusPanel — Wave 6 Phase B (wave-6-b-d10)
 *
 * CDE workflow status and approval panel.  Shows the current document workflow
 * state, pending approvals, user assignments, and action history.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; actions via typed commands.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel/deactivatePanel pattern.
 *
 * Public API
 * ──────────
 *   const p = new CDEStatusPanel(runtime);
 *   document.body.appendChild(p.element);
 *   p.show(docId?);
 *   p.hide();
 */

import type { PryzmRuntime }  from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const CDE_STATUS_PANEL_ID = 'cde-status-panel' as const;

export type CdeWorkflowState =
    | 'wip'
    | 'in-review'
    | 'approved'
    | 'rejected'
    | 'published'
    | 'archived';

export interface CdeWorkflowStateDef {
    readonly stateId: CdeWorkflowState;
    readonly label:   string;
    readonly color:   string;
}

export const CDE_WORKFLOW_STATES: readonly CdeWorkflowStateDef[] = [
    { stateId: 'wip',        label: 'Work In Progress', color: '#94a3b8' },
    { stateId: 'in-review',  label: 'In Review',        color: '#f59e0b' },
    { stateId: 'approved',   label: 'Approved',         color: '#22c55e' },
    { stateId: 'rejected',   label: 'Rejected',         color: '#ef4444' },
    { stateId: 'published',  label: 'Published',        color: '#3b82f6' },
    { stateId: 'archived',   label: 'Archived',         color: '#6b7280' },
];

const CDE_STATUS_PANEL_STYLES = `
.csp-panel {
    position: fixed; top: 56px; right: 4px;
    width: 268px; max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px; z-index: 950;
    display: none; flex-direction: column; overflow: hidden;
}
.csp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7); flex-shrink: 0;
}
.csp-title { font-weight: 600; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--app-text-secondary, #666); }
.csp-close-btn { background: none; border: none; cursor: pointer; color: var(--app-text-secondary, #888); font-size: 14px; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.csp-close-btn:hover { background: rgba(0,0,0,0.06); }
.csp-section { padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.07); flex-shrink: 0; }
.csp-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--app-text-tertiary, #aaa); margin-bottom: 8px; }
.csp-state-row { display: flex; flex-wrap: wrap; gap: 4px; }
.csp-state-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 12px; font-size: 11px; cursor: pointer; background: transparent; color: var(--app-text-secondary, #555); }
.csp-state-btn:hover { background: rgba(0,0,0,0.05); }
.csp-state-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.csp-field-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.csp-field-label { font-size: 10px; color: var(--app-text-tertiary, #999); }
.csp-field-value { font-size: 12px; color: var(--app-text, #333); }
.csp-input { width: 100%; padding: 5px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 5px; font-size: 12px; font-family: inherit; box-sizing: border-box; background: var(--app-input-bg, #fff); color: inherit; }
.csp-body { overflow-y: auto; flex: 1 1 auto; padding: 4px 0; }
`;

export class CDEStatusPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn(
                '[CDEStatusPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d10)',
            );
        }
        this.element = document.createElement('div');
        this.element.className = 'csp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'CDE status panel');
        this._injectStyles();
        this._buildDOM();
    }

    show(docId?: string): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'CDE Status', docId };
            this.runtime.viewRegistry.activatePanel(CDE_STATUS_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(CDE_STATUS_PANEL_ID);
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-csp-styles', '1');
        style.textContent = CDE_STATUS_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'csp-header';
        const title = document.createElement('span');
        title.className = 'csp-title';
        title.textContent = 'CDE Status';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'csp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close CDE status';
        closeBtn.setAttribute('aria-label', 'Close CDE status panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const stateSection = document.createElement('div');
        stateSection.className = 'csp-section';
        const stateLabel = document.createElement('div');
        stateLabel.className = 'csp-section-label';
        stateLabel.textContent = 'Workflow State';
        stateSection.appendChild(stateLabel);
        const stateRow = document.createElement('div');
        stateRow.className = 'csp-state-row';
        stateRow.setAttribute('data-csp-state-row', '1');
        for (const s of CDE_WORKFLOW_STATES) {
            const btn = document.createElement('button');
            btn.className = 'csp-state-btn';
            btn.setAttribute('data-state-id', s.stateId);
            btn.title = s.label;
            const dot = document.createElement('span');
            dot.className = 'csp-state-dot';
            dot.style.background = s.color;
            dot.setAttribute('aria-hidden', 'true');
            btn.appendChild(dot);
            btn.appendChild(document.createTextNode(s.label));
            stateRow.appendChild(btn);
        }
        stateSection.appendChild(stateRow);
        this.element.appendChild(stateSection);

        const infoSection = document.createElement('div');
        infoSection.className = 'csp-section';
        for (const [lbl, attr] of [['Assigned To', 'data-csp-assigned-to'], ['Due Date', 'data-csp-due-date'], ['Revision', 'data-csp-revision']] as const) {
            const row = document.createElement('div');
            row.className = 'csp-field-row';
            const l = document.createElement('div');
            l.className = 'csp-field-label';
            l.textContent = lbl;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'csp-input';
            inp.setAttribute(attr, '1');
            inp.placeholder = lbl;
            row.appendChild(l);
            row.appendChild(inp);
            infoSection.appendChild(row);
        }
        this.element.appendChild(infoSection);

        const body = document.createElement('div');
        body.className = 'csp-body';
        body.setAttribute('data-csp-body', '1');
        this.element.appendChild(body);
    }
}
