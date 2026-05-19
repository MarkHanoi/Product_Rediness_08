/**
 * DocumentsBrowserPanel — Dedicated panel for Views, Sheets, and Schedules.
 *
 * UI MODIFICATION DECLARATION
 *   Panel Affected:   Views & Sheets (left rail DOCUMENTS section)
 *   Files Modified:   DocumentsBrowserPanel.ts, unifiedBrowser.ts, projectBrowser.ts
 *   Change:           Compacted header/search/tab spacing and denser Views rows for large view sets.
 *   CSS Prefix:       pb-ubp-, pb-view- (registered)
 *   Prohibited Patterns: None — zero bim-*, zero inline <style>
 *
 * Contract compliance:
 *   §01  — Read-only; opens sheet/view editors via existing commands.
 *   §04  — UI modification declared above.
 *   §05  — CSS in AppTheme.ts via panel style modules (pb-ubp-, pb-view- prefixes).
 *   §05  — No bim-* elements; pure native HTML.
 *   §05 §7.6 — No independent <style> injection.
 */

import type { RailPanelController } from '../RailPanelController';
import { SheetsRailPanel    }       from './SheetsRailPanel';
import { ViewsRailPanel     }       from './ViewsRailPanel';
import { SchedulesRailPanel }       from './SchedulesRailPanel';
import { sheetStore }               from '@pryzm/core-app-model';
import { viewDefinitionStore }      from '@pryzm/core-app-model';
import { scheduleStore }            from '@pryzm/core-app-model';
import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';

type TabId = 'VIEWS' | 'SHEETS' | 'SCHEDULES';

// ── Internal proxy so sub-panels' refreshIfActive calls hit 'DOCUMENTS' ──────

class DocumentsRailProxy {
    private readonly _sectionId = 'DOCUMENTS';
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _real: RailPanelController, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    get activeId(): string | null {
        return this._real.activeId === this._sectionId ? this._sectionId : null;
    }

    refreshIfActive(_id: string): void {
        this._real.refreshIfActive(this._sectionId);
    }
}

// ── DocumentsBrowserPanel ─────────────────────────────────────────────────────

export class DocumentsBrowserPanel {
    private readonly _sectionId = 'DOCUMENTS';
    private readonly _proxy:          DocumentsRailProxy;
    private readonly _sheetsPanel:    SheetsRailPanel;
    private readonly _viewsPanel:     ViewsRailPanel;
    private readonly _schedulesPanel: SchedulesRailPanel;

    /** Phase B.17 (S73-WIRE) — runtime threaded by parent (ProjectBrowserPanel). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    private _activeTab:   TabId  = 'VIEWS';
    private _searchQuery: string = '';

    constructor(
        props: ProjectBrowserPanelProps,
        rail:  RailPanelController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this._proxy          = new DocumentsRailProxy(rail, this.runtime);
        // Phase B.17 (S73-WIRE) — forward composed runtime so sheets / views /
        // schedules sub-panels can read typed selection + project state.
        this._sheetsPanel    = new SheetsRailPanel   (this._proxy as unknown as RailPanelController, this.runtime);
        this._viewsPanel     = new ViewsRailPanel    (props, this._proxy as unknown as RailPanelController, this.runtime);
        this._schedulesPanel = new SchedulesRailPanel(this._proxy as unknown as RailPanelController, this.runtime);

        const refresh = () => this._proxy.refreshIfActive(this._sectionId);

        window.addEventListener('sd:sheet-created',       refresh);
        window.addEventListener('sd:sheet-deleted',       refresh);
        window.addEventListener('sd:store-loaded',        refresh);
        window.addEventListener('vd:view-created',        refresh);
        window.addEventListener('vd:view-deleted',        refresh);
        window.addEventListener('vd:store-loaded',        refresh);
        window.addEventListener('sched:schedule-created', refresh);
        window.addEventListener('sched:store-loaded',     refresh);
        window.addEventListener('bim-room-added',         refresh);
        window.addEventListener('bim-room-updated',       refresh);
        window.addEventListener('bim-room-removed',       refresh);
    }

    // ── build ─────────────────────────────────────────────────────────────────

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'pb-ubp-shell';

        root.appendChild(this._buildHeader());
        root.appendChild(this._buildTabBar());

        const body = document.createElement('div');
        body.className = 'pb-ubp-body';
        body.appendChild(this._buildActiveContent());
        root.appendChild(body);

        return root;
    }

    // ── Gradient header (title + search) ─────────────────────────────────────

    private _buildHeader(): HTMLElement {
        const hdr = document.createElement('div');
        hdr.className = 'pb-ubp-header';

        const topRow = document.createElement('div');
        topRow.className = 'pb-ubp-header-top';

        const title = document.createElement('span');
        title.className   = 'pb-ubp-header-title';
        title.textContent = 'Views & Sheets';

        topRow.appendChild(title);
        hdr.appendChild(topRow);

        const spacer = document.createElement('div');
        spacer.className = 'pb-ubp-header-spacer';
        hdr.appendChild(spacer);

        const searchRow = document.createElement('div');
        searchRow.className = 'pb-ubp-search';

        const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        searchIcon.setAttribute('width', '11');
        searchIcon.setAttribute('height', '11');
        searchIcon.setAttribute('viewBox', '0 0 11 11');
        searchIcon.setAttribute('fill', 'none');
        searchIcon.setAttribute('class', 'pb-ubp-search-icon');
        searchIcon.innerHTML = `
            <circle cx="4.5" cy="4.5" r="3.2" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>
            <line x1="6.8" y1="6.8" x2="10" y2="10" stroke="rgba(255,255,255,0.5)" stroke-width="1.2" stroke-linecap="round"/>
        `;

        const input = document.createElement('input');
        input.className   = 'pb-ubp-search-input';
        input.type        = 'text';
        input.placeholder = 'Search views, sheets…';
        input.value       = this._searchQuery;
        input.setAttribute('aria-label', 'Search views and sheets');
        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', () => {
            this._searchQuery = input.value;
            this._proxy.refreshIfActive(this._sectionId);
        });

        searchRow.appendChild(searchIcon);
        searchRow.appendChild(input);
        hdr.appendChild(searchRow);

        return hdr;
    }

    // ── Tab pill bar — Views | Sheets | Schedules ────────────────────────────

    private _buildTabBar(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'pb-ubp-tab-bar';

        const tabs: Array<{ id: TabId; label: string; count: number }> = [
            { id: 'VIEWS',     label: 'Views',     count: viewDefinitionStore.getAll().length },
            { id: 'SHEETS',    label: 'Sheets',    count: sheetStore.getAll().length          },
            { id: 'SCHEDULES', label: 'Schedules', count: scheduleStore.getAll().length       },
        ];

        for (const tab of tabs) {
            const pill = document.createElement('button');
            pill.type      = 'button';
            pill.className = 'pb-ubp-tab-pill' +
                (this._activeTab === tab.id ? ' pb-ubp-tab-pill--active' : '');
            pill.setAttribute('aria-selected', String(this._activeTab === tab.id));
            pill.setAttribute('role', 'tab');

            const labelEl = document.createElement('span');
            labelEl.textContent = tab.label;

            pill.appendChild(labelEl);

            if (tab.count > 0) {
                const badge = document.createElement('span');
                badge.className   = 'pb-ubp-tab-badge';
                badge.textContent = String(tab.count);
                pill.appendChild(badge);
            }

            pill.addEventListener('click', () => {
                this._activeTab = tab.id;
                this._proxy.refreshIfActive(this._sectionId);
            });

            bar.appendChild(pill);
        }

        return bar;
    }

    // ── Active tab content ────────────────────────────────────────────────────

    private _buildActiveContent(): HTMLElement {
        switch (this._activeTab) {
            case 'VIEWS':     return this._viewsPanel.build();
            case 'SHEETS':    return this._sheetsPanel.build();
            case 'SCHEDULES': return this._schedulesPanel.build();
        }
    }
}
