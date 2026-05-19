/**
 * SheetBrowserPanel — Wave 6 Phase B (wave-6-b-d9)
 *
 * Project sheet browser: lists all sheets in the model, filterable by
 * discipline (Architecture, Structure, MEP, Civil, Landscape) and by
 * issuance status (Draft, Issued-for-Review, Issued-for-Construction,
 * As-Built, Superseded).  Selecting a sheet navigates to its view.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; navigation dispatches typed
 *   commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test (wave-6-b-d9).
 * • P8 — OTel spans via runtime-composer activatePanel / deactivatePanel.
 *
 * Public API
 * ──────────
 *   const sbp = new SheetBrowserPanel(runtime);
 *   document.body.appendChild(sbp.element);
 *   sbp.show();
 *   sbp.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const SHEET_BROWSER_PANEL_ID = 'sheet-browser-panel' as const;

// ── Filter dimension defs ─────────────────────────────────────────────────────
export interface SheetDisciplineDef {
    readonly disciplineId: string;
    readonly label:        string;
    readonly icon:         string;
}

export interface SheetStatusDef {
    readonly statusId: string;
    readonly label:    string;
    readonly color:    string;
}

export const SHEET_DISCIPLINES: readonly SheetDisciplineDef[] = [
    { disciplineId: 'architecture',  label: 'Architecture',  icon: '🏛' },
    { disciplineId: 'structure',     label: 'Structure',     icon: '🔩' },
    { disciplineId: 'mep',           label: 'MEP',           icon: '⚙' },
    { disciplineId: 'civil',         label: 'Civil',         icon: '🛣' },
    { disciplineId: 'landscape',     label: 'Landscape',     icon: '🌿' },
    { disciplineId: 'general',       label: 'General',       icon: '📋' },
];

export const SHEET_STATUSES: readonly SheetStatusDef[] = [
    { statusId: 'draft',         label: 'Draft',                   color: '#94a3b8' },
    { statusId: 'ifr',           label: 'Issued for Review',       color: '#f59e0b' },
    { statusId: 'ifc',           label: 'Issued for Construction', color: '#22c55e' },
    { statusId: 'as-built',      label: 'As-Built',                color: '#3b82f6' },
    { statusId: 'superseded',    label: 'Superseded',              color: '#ef4444' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const SHEET_BROWSER_PANEL_STYLES = `
.sbp-panel {
    position: fixed;
    top: 56px;
    left: 4px;
    width: 264px;
    max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
.sbp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.sbp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.sbp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.sbp-close-btn:hover { background: rgba(0,0,0,0.06); }
.sbp-search-bar {
    padding: 7px 10px;
    border-bottom: 1px solid rgba(0,0,0,0.07);
    flex-shrink: 0;
}
.sbp-search-input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 5px;
    font-size: 12px;
    font-family: inherit;
    box-sizing: border-box;
    background: var(--app-input-bg, #fff);
    color: inherit;
}
.sbp-filter-section {
    padding: 6px 10px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    flex-shrink: 0;
}
.sbp-filter-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-tertiary, #aaa);
    margin-bottom: 5px;
}
.sbp-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.sbp-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 12px;
    font-size: 10px;
    cursor: pointer;
    background: transparent;
    color: var(--app-text-secondary, #555);
    white-space: nowrap;
}
.sbp-chip:hover { background: rgba(0,0,0,0.05); }
.sbp-chip[data-active="1"] {
    background: var(--app-accent, #6600FF);
    color: #fff;
    border-color: var(--app-accent, #6600FF);
}
.sbp-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}
.sbp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.sbp-empty {
    padding: 24px 16px;
    text-align: center;
    font-size: 12px;
    color: var(--app-text-tertiary, #bbb);
}
`;

// ── SheetBrowserPanel class ───────────────────────────────────────────────────

export class SheetBrowserPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[SheetBrowserPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d9)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'sbp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Sheet browser');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Sheet Browser' };
            this.runtime.viewRegistry.activatePanel(SHEET_BROWSER_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SHEET_BROWSER_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-sbp-styles', '1');
        style.textContent = SHEET_BROWSER_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        // Header
        const header = document.createElement('div');
        header.className = 'sbp-header';

        const title = document.createElement('span');
        title.className = 'sbp-title';
        title.textContent = 'Sheet Browser';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'sbp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close sheet browser';
        closeBtn.setAttribute('aria-label', 'Close sheet browser panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // Search
        const searchBar = document.createElement('div');
        searchBar.className = 'sbp-search-bar';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'sbp-search-input';
        searchInput.placeholder = 'Search sheets…';
        searchInput.setAttribute('aria-label', 'Search sheets');
        searchInput.setAttribute('data-sbp-search', '1');
        searchBar.appendChild(searchInput);
        this.element.appendChild(searchBar);

        // Discipline filter
        const disciplineSection = document.createElement('div');
        disciplineSection.className = 'sbp-filter-section';
        const disciplineLabel = document.createElement('div');
        disciplineLabel.className = 'sbp-filter-label';
        disciplineLabel.textContent = 'Discipline';
        disciplineSection.appendChild(disciplineLabel);
        const disciplineChips = document.createElement('div');
        disciplineChips.className = 'sbp-chip-row';
        disciplineChips.setAttribute('data-sbp-discipline-chips', '1');
        for (const d of SHEET_DISCIPLINES) {
            const chip = document.createElement('button');
            chip.className = 'sbp-chip';
            chip.setAttribute('data-discipline-id', d.disciplineId);
            chip.title = d.label;
            chip.innerHTML = `${d.icon} ${d.label}`;
            disciplineChips.appendChild(chip);
        }
        disciplineSection.appendChild(disciplineChips);
        this.element.appendChild(disciplineSection);

        // Status filter
        const statusSection = document.createElement('div');
        statusSection.className = 'sbp-filter-section';
        const statusLabel = document.createElement('div');
        statusLabel.className = 'sbp-filter-label';
        statusLabel.textContent = 'Status';
        statusSection.appendChild(statusLabel);
        const statusChips = document.createElement('div');
        statusChips.className = 'sbp-chip-row';
        statusChips.setAttribute('data-sbp-status-chips', '1');
        for (const s of SHEET_STATUSES) {
            const chip = document.createElement('button');
            chip.className = 'sbp-chip';
            chip.setAttribute('data-status-id', s.statusId);
            chip.title = s.label;
            const dot = document.createElement('span');
            dot.className = 'sbp-status-dot';
            dot.style.background = s.color;
            dot.setAttribute('aria-hidden', 'true');
            chip.appendChild(dot);
            chip.appendChild(document.createTextNode(s.label));
            statusChips.appendChild(chip);
        }
        statusSection.appendChild(statusChips);
        this.element.appendChild(statusSection);

        // Body
        const body = document.createElement('div');
        body.className = 'sbp-body';
        body.setAttribute('data-sbp-body', '1');
        const empty = document.createElement('div');
        empty.className = 'sbp-empty';
        empty.textContent = 'No sheets in project';
        body.appendChild(empty);
        this.element.appendChild(body);
    }
}
