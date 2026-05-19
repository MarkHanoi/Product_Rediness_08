/**
 * CDEBrowserPanel — Wave 6 Phase B (wave-6-b-d10)
 *
 * Common Data Environment document browser.  Lists documents in the project
 * CDE, filterable by document type (Model/Drawing/Specification/Report/Other)
 * and workflow status (WIP/Shared/Published/Archived/Superseded).
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; navigation via typed commands.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test (wave-6-b-d10).
 *
 * Public API
 * ──────────
 *   const p = new CDEBrowserPanel(runtime);
 *   document.body.appendChild(p.element);
 *   p.show();
 *   p.hide();
 */

import type { PryzmRuntime }  from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const CDE_BROWSER_PANEL_ID = 'cde-browser-panel' as const;

export interface CdeDocTypeDef {
    readonly typeId: string;
    readonly label:  string;
    readonly icon:   string;
}

export interface CdeStatusDef {
    readonly statusId: string;
    readonly label:    string;
    readonly color:    string;
}

export const CDE_DOC_TYPES: readonly CdeDocTypeDef[] = [
    { typeId: 'model',         label: 'Model',         icon: '🏗' },
    { typeId: 'drawing',       label: 'Drawing',       icon: '📐' },
    { typeId: 'specification', label: 'Specification',  icon: '📄' },
    { typeId: 'report',        label: 'Report',        icon: '📊' },
    { typeId: 'other',         label: 'Other',         icon: '📎' },
];

export const CDE_STATUSES: readonly CdeStatusDef[] = [
    { statusId: 'wip',        label: 'WIP',        color: '#94a3b8' },
    { statusId: 'shared',     label: 'Shared',     color: '#f59e0b' },
    { statusId: 'published',  label: 'Published',  color: '#22c55e' },
    { statusId: 'archived',   label: 'Archived',   color: '#3b82f6' },
    { statusId: 'superseded', label: 'Superseded', color: '#ef4444' },
];

const CDE_BROWSER_PANEL_STYLES = `
.cdebp-panel {
    position: fixed; top: 56px; left: 4px;
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
.cdebp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.cdebp-title { font-weight: 600; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--app-text-secondary, #666); }
.cdebp-close-btn { background: none; border: none; cursor: pointer; color: var(--app-text-secondary, #888); font-size: 14px; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.cdebp-close-btn:hover { background: rgba(0,0,0,0.06); }
.cdebp-search-bar { padding: 7px 10px; border-bottom: 1px solid rgba(0,0,0,0.07); flex-shrink: 0; }
.cdebp-search-input { width: 100%; padding: 5px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 5px; font-size: 12px; font-family: inherit; box-sizing: border-box; background: var(--app-input-bg, #fff); color: inherit; }
.cdebp-filter-section { padding: 6px 10px; border-bottom: 1px solid rgba(0,0,0,0.06); flex-shrink: 0; }
.cdebp-filter-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--app-text-tertiary, #aaa); margin-bottom: 5px; }
.cdebp-chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
.cdebp-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border: 1px solid rgba(0,0,0,0.14); border-radius: 12px; font-size: 10px; cursor: pointer; background: transparent; color: var(--app-text-secondary, #555); white-space: nowrap; }
.cdebp-chip:hover { background: rgba(0,0,0,0.05); }
.cdebp-chip[data-active="1"] { background: var(--app-accent, #6600FF); color: #fff; border-color: var(--app-accent, #6600FF); }
.cdebp-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.cdebp-body { overflow-y: auto; flex: 1 1 auto; padding: 4px 0; }
.cdebp-empty { padding: 24px 16px; text-align: center; font-size: 12px; color: var(--app-text-tertiary, #bbb); }
`;

export class CDEBrowserPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn(
                '[CDEBrowserPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d10)',
            );
        }
        this.element = document.createElement('div');
        this.element.className = 'cdebp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'CDE document browser');
        this._injectStyles();
        this._buildDOM();
    }

    show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'CDE Browser' };
            this.runtime.viewRegistry.activatePanel(CDE_BROWSER_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(CDE_BROWSER_PANEL_ID);
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-cdebp-styles', '1');
        style.textContent = CDE_BROWSER_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'cdebp-header';
        const title = document.createElement('span');
        title.className = 'cdebp-title';
        title.textContent = 'CDE Browser';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'cdebp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close CDE browser';
        closeBtn.setAttribute('aria-label', 'Close CDE browser panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const searchBar = document.createElement('div');
        searchBar.className = 'cdebp-search-bar';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'cdebp-search-input';
        searchInput.placeholder = 'Search documents…';
        searchInput.setAttribute('aria-label', 'Search CDE documents');
        searchInput.setAttribute('data-cdebp-search', '1');
        searchBar.appendChild(searchInput);
        this.element.appendChild(searchBar);

        const typeSection = document.createElement('div');
        typeSection.className = 'cdebp-filter-section';
        const typeLabel = document.createElement('div');
        typeLabel.className = 'cdebp-filter-label';
        typeLabel.textContent = 'Type';
        typeSection.appendChild(typeLabel);
        const typeChips = document.createElement('div');
        typeChips.className = 'cdebp-chip-row';
        typeChips.setAttribute('data-cdebp-type-chips', '1');
        for (const t of CDE_DOC_TYPES) {
            const chip = document.createElement('button');
            chip.className = 'cdebp-chip';
            chip.setAttribute('data-type-id', t.typeId);
            chip.title = t.label;
            chip.textContent = `${t.icon} ${t.label}`;
            typeChips.appendChild(chip);
        }
        typeSection.appendChild(typeChips);
        this.element.appendChild(typeSection);

        const statusSection = document.createElement('div');
        statusSection.className = 'cdebp-filter-section';
        const statusLabel = document.createElement('div');
        statusLabel.className = 'cdebp-filter-label';
        statusLabel.textContent = 'Status';
        statusSection.appendChild(statusLabel);
        const statusChips = document.createElement('div');
        statusChips.className = 'cdebp-chip-row';
        statusChips.setAttribute('data-cdebp-status-chips', '1');
        for (const s of CDE_STATUSES) {
            const chip = document.createElement('button');
            chip.className = 'cdebp-chip';
            chip.setAttribute('data-status-id', s.statusId);
            chip.title = s.label;
            const dot = document.createElement('span');
            dot.className = 'cdebp-status-dot';
            dot.style.background = s.color;
            dot.setAttribute('aria-hidden', 'true');
            chip.appendChild(dot);
            chip.appendChild(document.createTextNode(s.label));
            statusChips.appendChild(chip);
        }
        statusSection.appendChild(statusChips);
        this.element.appendChild(statusSection);

        const body = document.createElement('div');
        body.className = 'cdebp-body';
        body.setAttribute('data-cdebp-body', '1');
        const empty = document.createElement('div');
        empty.className = 'cdebp-empty';
        empty.textContent = 'No documents in CDE';
        body.appendChild(empty);
        this.element.appendChild(body);
    }
}
