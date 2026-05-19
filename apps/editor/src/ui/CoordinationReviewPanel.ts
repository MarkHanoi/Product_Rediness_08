/**
 * CoordinationReviewPanel — Wave 6 Phase B (wave-6-b-d10)
 *
 * Multi-discipline coordination review panel.  Displays clash groups, issue
 * assignments, coordination statuses, and discipline filter controls for
 * managing model coordination workflows.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel/deactivatePanel.
 */

import type { PryzmRuntime }  from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const COORDINATION_REVIEW_PANEL_ID = 'coordination-review-panel' as const;

export interface CoordDisciplineDef {
    readonly disciplineId: string;
    readonly label:        string;
    readonly color:        string;
}

export const COORD_DISCIPLINES: readonly CoordDisciplineDef[] = [
    { disciplineId: 'arch',       label: 'Architecture', color: '#6600FF' },
    { disciplineId: 'structure',  label: 'Structure',    color: '#3b82f6' },
    { disciplineId: 'mechanical', label: 'Mechanical',   color: '#f59e0b' },
    { disciplineId: 'electrical', label: 'Electrical',   color: '#ef4444' },
    { disciplineId: 'plumbing',   label: 'Plumbing',     color: '#22c55e' },
    { disciplineId: 'civil',      label: 'Civil',        color: '#8b5cf6' },
];

export type CoordIssueStatus = 'open' | 'in-progress' | 'resolved' | 'wont-fix';

export const COORD_ISSUE_STATUSES: readonly { statusId: CoordIssueStatus; label: string; color: string }[] = [
    { statusId: 'open',        label: 'Open',        color: '#ef4444' },
    { statusId: 'in-progress', label: 'In Progress', color: '#f59e0b' },
    { statusId: 'resolved',    label: 'Resolved',    color: '#22c55e' },
    { statusId: 'wont-fix',    label: "Won't Fix",   color: '#6b7280' },
];

const COORD_REVIEW_PANEL_STYLES = `
.crp-panel {
    position: fixed; top: 56px; left: 4px;
    width: 280px; max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif); font-size: 13px;
    z-index: 950; display: none; flex-direction: column; overflow: hidden;
}
.crp-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08); background: var(--app-panel-header-bg, #f7f7f7); flex-shrink: 0; }
.crp-title { font-weight: 600; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--app-text-secondary, #666); }
.crp-close-btn { background: none; border: none; cursor: pointer; color: var(--app-text-secondary, #888); font-size: 14px; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.crp-close-btn:hover { background: rgba(0,0,0,0.06); }
.crp-filter-section { padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.07); flex-shrink: 0; }
.crp-filter-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--app-text-tertiary, #aaa); margin-bottom: 6px; }
.crp-chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
.crp-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 12px; font-size: 10px; cursor: pointer; background: transparent; color: var(--app-text-secondary, #555); white-space: nowrap; }
.crp-chip:hover { background: rgba(0,0,0,0.05); }
.crp-chip[data-active="1"] { background: var(--app-accent, #6600FF); color: #fff; border-color: var(--app-accent, #6600FF); }
.crp-disc-swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.crp-stats { display: flex; gap: 0; border-bottom: 1px solid rgba(0,0,0,0.07); flex-shrink: 0; }
.crp-stat { flex: 1; padding: 8px 10px; text-align: center; }
.crp-stat-value { font-size: 18px; font-weight: 700; color: var(--app-accent, #6600FF); }
.crp-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-text-tertiary, #aaa); }
.crp-body { overflow-y: auto; flex: 1 1 auto; padding: 4px 0; }
.crp-empty { padding: 24px 16px; text-align: center; font-size: 12px; color: var(--app-text-tertiary, #bbb); }
`;

export class CoordinationReviewPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn(
                '[CoordinationReviewPanel] runtime is null — panel binding disabled. (wave-6-b-d10)',
            );
        }
        this.element = document.createElement('div');
        this.element.className = 'crp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Coordination review panel');
        this._injectStyles();
        this._buildDOM();
    }

    show(): void {
        this.element.style.display = 'flex';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Coordination Review' };
            this.runtime.viewRegistry.activatePanel(COORDINATION_REVIEW_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(COORDINATION_REVIEW_PANEL_ID);
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-crp-styles', '1');
        style.textContent = COORD_REVIEW_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'crp-header';
        const title = document.createElement('span');
        title.className = 'crp-title';
        title.textContent = 'Coordination Review';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'crp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close coordination review panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const discSection = document.createElement('div');
        discSection.className = 'crp-filter-section';
        const discLabel = document.createElement('div');
        discLabel.className = 'crp-filter-label';
        discLabel.textContent = 'Disciplines';
        discSection.appendChild(discLabel);
        const discChips = document.createElement('div');
        discChips.className = 'crp-chip-row';
        discChips.setAttribute('data-crp-disc-chips', '1');
        for (const d of COORD_DISCIPLINES) {
            const chip = document.createElement('button');
            chip.className = 'crp-chip';
            chip.setAttribute('data-discipline-id', d.disciplineId);
            chip.title = d.label;
            const swatch = document.createElement('span');
            swatch.className = 'crp-disc-swatch';
            swatch.style.background = d.color;
            swatch.setAttribute('aria-hidden', 'true');
            chip.appendChild(swatch);
            chip.appendChild(document.createTextNode(d.label));
            discChips.appendChild(chip);
        }
        discSection.appendChild(discChips);
        this.element.appendChild(discSection);

        const statusSection = document.createElement('div');
        statusSection.className = 'crp-filter-section';
        const statusLabel = document.createElement('div');
        statusLabel.className = 'crp-filter-label';
        statusLabel.textContent = 'Issue Status';
        statusSection.appendChild(statusLabel);
        const statusChips = document.createElement('div');
        statusChips.className = 'crp-chip-row';
        statusChips.setAttribute('data-crp-status-chips', '1');
        for (const s of COORD_ISSUE_STATUSES) {
            const chip = document.createElement('button');
            chip.className = 'crp-chip';
            chip.setAttribute('data-status-id', s.statusId);
            chip.title = s.label;
            chip.textContent = s.label;
            statusChips.appendChild(chip);
        }
        statusSection.appendChild(statusChips);
        this.element.appendChild(statusSection);

        const stats = document.createElement('div');
        stats.className = 'crp-stats';
        stats.setAttribute('data-crp-stats', '1');
        for (const [val, label] of [['0', 'Total'], ['0', 'Open'], ['0', 'Resolved']] as const) {
            const stat = document.createElement('div');
            stat.className = 'crp-stat';
            const v = document.createElement('div');
            v.className = 'crp-stat-value';
            v.textContent = val;
            const l = document.createElement('div');
            l.className = 'crp-stat-label';
            l.textContent = label;
            stat.appendChild(v);
            stat.appendChild(l);
            stats.appendChild(stat);
        }
        this.element.appendChild(stats);

        const body = document.createElement('div');
        body.className = 'crp-body';
        body.setAttribute('data-crp-body', '1');
        const empty = document.createElement('div');
        empty.className = 'crp-empty';
        empty.textContent = 'No coordination issues';
        body.appendChild(empty);
        this.element.appendChild(body);
    }
}
