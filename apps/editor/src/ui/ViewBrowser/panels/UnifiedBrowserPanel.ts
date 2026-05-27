/**
 * UnifiedBrowserPanel — Project Browser panel shell.
 *
 * Combines PROJECT (full spatial tree) and ELEMENTS (summary by type) cards.
 * SHEETS / VIEWS / SCHEDULES appear only in the original header comment as
 * design intent — they are NOT implemented here (see §2a as-found audit).
 *
 * The parent RailPanelController must open this with { noHeader: true }.
 *
 * UI MODIFICATION DECLARATION
 *   Panel Affected:   Project Browser (left rail) — BROWSER unified section
 *   Files Modified:   UnifiedBrowserPanel.ts + unified-browser/ (4 zone files)
 *   CSS Prefix:       pb-ubp- / pb-ubp-st- (registered in AppTheme.ts)
 *   Prohibited Patterns: None — zero bim-*, zero inline <style>
 *
 * Contract compliance:
 *   §01 — Read-only UI; visibility toggle only affects scene projection.
 *          All selection goes through selectionBus.select() — Contract 27 §4.
 *   §04 — UI modification declared above.
 *   §05 §2.1 — CSS in AppTheme.ts UNIFIED_BROWSER_STYLES (pb-ubp- / pb-ubp-st-).
 *   §05 §6   — Zero bim-* elements; pure native HTML.
 *   §05 §7.6 — No independent <style> injection.
 *
 * Window globals (shell-level — 1 typed global; all Phase C/D/E scope):
 *   (none used directly in this shell — all delegated to zone files)
 *
 * Wave 14 FILE 6 split:
 *   Shell:                     UnifiedBrowserPanel.ts      (this file, ≤550 LOC)
 *   PROJECT tree renderer:     unified-browser/ProjectTreeSection.ts
 *   Visibility + isolate:      unified-browser/ProjectVisibilitySection.ts
 *   ELEMENTS card renderer:    unified-browser/ElementsSummarySection.ts
 *   Data helpers + UBPBag:     unified-browser/BrowserDataHelpers.ts
 *
 * P6b fix (Wave 14) + §OI-055 fix (2026-05-27):
 *   BEFORE: `window.commandManager.execute(cmd)` (P6 violation).
 *   INTERIM (Wave 14): `bag.runtime.bus.executeCommand(cmd.type, cmd)` —
 *     migrated to the bus API but the dispatch type AND payload shape were
 *     both wrong, producing the OI-055 "Add level" silent no-op.
 *   FIXED: `bag.runtime.bus.executeCommand('level.add', { levelId, name,
 *     elevation, height })`. See ProjectTreeSection.ts header for full
 *     fix details.
 */

import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';
import type { RailPanelController }      from '../RailPanelController';
import type { UBPBag }                   from './unified-browser/BrowserDataHelpers';
import { buildProjectCard }              from './unified-browser/ProjectTreeSection';
import { buildElementsCard }             from './unified-browser/ElementsSummarySection';
import {
    hasAnyOverride,
    resetAllVisibility,
    handleVisibilityCommand,
    applyIsolate,
} from './unified-browser/ProjectVisibilitySection';
import {
    getProjectName,
    getActiveLevelName,
} from './unified-browser/BrowserDataHelpers';

// ── Internal proxy ────────────────────────────────────────────────────────────

class UnifiedRailProxy {
    private readonly _sectionId = 'BROWSER';
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _real: RailPanelController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
    }

    get activeId(): string | null {
        return this._real.activeId === this._sectionId ? this._sectionId : null;
    }

    refreshIfActive(_id: string): void {
        this._real.refreshIfActive(this._sectionId);
    }
}

// ── UnifiedBrowserPanel ───────────────────────────────────────────────────────

export class UnifiedBrowserPanel {
    private readonly _sectionId = 'BROWSER';
    private readonly _proxy:     UnifiedRailProxy;
    private readonly _rail:      RailPanelController;
    private readonly _bag:       UBPBag;

    private _expandedCards:   Set<string> = new Set(['PROJECT']);
    private _searchQuery      = '';
    private _roofStore: { getAll(): any[] } | null = null;

    // Spatial tree state
    private _expandedLevels:  Set<string> = new Set();
    private _expandedTypes:   Map<string, Set<string>> = new Map();
    private _levelVisible:    Map<string, boolean> = new Map();
    private _typeVisible:     Map<string, boolean> = new Map();
    private _elemVisible:     Map<string, boolean> = new Map();
    private _buildingVisible: boolean = true;
    private _selectedElemId:  string | null = null;
    private _isolateMode:     string | null = null;

    // Elements card state
    private _catExpanded:     Set<string> = new Set();
    private _catTypeExpanded: Map<string, Set<string>> = new Map();
    private _catVisible:      Map<string, boolean> = new Map();
    private _catTypeVisible:  Map<string, boolean> = new Map();

    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        _props:  ProjectBrowserPanelProps,
        rail:    RailPanelController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this._rail   = rail;
        this._proxy  = new UnifiedRailProxy(rail, this.runtime);

        const refresh = () => this._proxy.refreshIfActive(this._sectionId);

        window.addEventListener('wall:walls-changed',      refresh);
        window.addEventListener('level-changed',           refresh);
        window.addEventListener('activeLevelChanged',      refresh);
        window.runtime?.events?.on('model-updated', () => refresh()); // F.events.8
        window.addEventListener('bim-level-added',         refresh);
        window.addEventListener('bim-level-removed',       refresh);
        window.addEventListener('bim-room-added',          refresh);
        window.addEventListener('bim-room-updated',        refresh);
        window.addEventListener('bim-room-removed',        refresh);
        window.addEventListener('bim-lighting-added',      refresh);
        window.addEventListener('bim-lighting-updated',    refresh);
        window.addEventListener('bim-lighting-removed',    refresh);
        window.addEventListener('bim-ceiling-added',       refresh);
        window.addEventListener('bim-ceiling-updated',     refresh);
        window.addEventListener('bim-ceiling-removed',     refresh);
        window.addEventListener('bim-floor-added',         refresh);
        window.addEventListener('bim-floor-updated',       refresh);
        window.addEventListener('bim-floor-removed',       refresh);
        window.addEventListener('bim-handrail-added',      refresh);
        window.addEventListener('bim-handrail-updated',    refresh);
        window.addEventListener('bim-handrail-removed',    refresh);
        window.addEventListener('bim-opening-added',       refresh);
        window.addEventListener('bim-opening-updated',     refresh);
        window.addEventListener('bim-opening-removed',     refresh);
        window.addEventListener('bim-plumbing-added',      refresh);
        window.addEventListener('bim-curtainwall-added',   refresh);
        window.addEventListener('bim-curtainwall-updated', refresh);
        window.addEventListener('bim-curtainwall-removed', refresh);
        window.runtime?.events?.on('pryzm-ifc-imported', () => refresh()); // F.events.13
        window.addEventListener('pryzm-ifc-tree-updated',  refresh);

        window.addEventListener('pryzm-visibility-command', (e: Event) => {
            handleVisibilityCommand(this._bag, (e as CustomEvent).detail);
        });

        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
            const detail = payload as { object?: { userData?: { id?: unknown } } | null };
            const obj = detail?.object;
            const id  = (obj?.userData?.id ?? null) as string | null;
            if (this._selectedElemId !== id) {
                this._selectedElemId = id;
                if (id) this._expandToElement(id);
                this._proxy.refreshIfActive(this._sectionId);
            }
        });

        // Build the shared state bag with live getters/setters for primitive fields.
        // Maps and Sets are passed by reference; mutations from zone functions propagate
        // back to shell state automatically.
        const self = this;
        this._bag = {
            get sectionId()        { return self._sectionId; },
            get runtime()          { return self.runtime; },
            set runtime(_v)        { /* read-only */ },
            get roofStore()        { return self._roofStore; },
            set roofStore(v)       { self._roofStore = v; },

            get buildingVisible()  { return self._buildingVisible; },
            set buildingVisible(v) { self._buildingVisible = v; },
            get isolateMode()      { return self._isolateMode; },
            set isolateMode(v)     { self._isolateMode = v; },
            get selectedElemId()   { return self._selectedElemId; },
            set selectedElemId(v)  { self._selectedElemId = v; },

            expandedLevels:  this._expandedLevels,
            expandedTypes:   this._expandedTypes,
            levelVisible:    this._levelVisible,
            typeVisible:     this._typeVisible,
            elemVisible:     this._elemVisible,
            catExpanded:     this._catExpanded,
            catTypeExpanded: this._catTypeExpanded,
            catVisible:      this._catVisible,
            catTypeVisible:  this._catTypeVisible,

            refresh: () => self._proxy.refreshIfActive(self._sectionId),
            makeVisBtn: (visible, onChange) => self._makeVisBtn(visible, onChange),
            makeIsoBtn: (key, getElemIds)   => self._makeIsoBtn(key, getElemIds),
        } as UBPBag;
    }

    setRoofStore(store: { getAll(): any[] }): void {
        this._roofStore      = store;
        this._bag.roofStore  = store;
    }

    // ── Auto-expand to a selected element ─────────────────────────────────────

    private _expandToElement(elemId: string): void {
        const bag = this._bag;
        const stores = [bag.roofStore];
        for (const store of stores) {
            if (!store?.getAll) continue;
            for (const el of store.getAll()) {
                if (el.id === elemId) {
                    const levelId  = String(el.levelId ?? '');
                    bag.expandedLevels.add(levelId);
                    if (!bag.expandedTypes.has(levelId)) {
                        bag.expandedTypes.set(levelId, new Set());
                    }
                    const typeName = (el.type ?? el.elementType ?? 'Unknown') as string;
                    bag.expandedTypes.get(levelId)!.add(typeName);
                    return;
                }
            }
        }
    }

    // ── build ─────────────────────────────────────────────────────────────────

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'pb-ubp-shell';

        root.appendChild(this._buildHeader());

        const body = document.createElement('div');
        body.className = 'pb-ubp-body';

        const q     = this._searchQuery.toLowerCase().trim();
        const cards = [
            this._buildCard('PROJECT',  'Project',  'pb-ubp-dot--purple', '', buildProjectCard(this._bag)),
            this._buildCard('ELEMENTS', 'Elements', 'pb-ubp-dot--purple', '', buildElementsCard(this._bag)),
        ];

        for (const card of cards) {
            if (q) {
                const text = card.textContent?.toLowerCase() ?? '';
                card.style.display = text.includes(q) ? '' : 'none';
            }
            body.appendChild(card);
        }

        root.appendChild(body);
        return root;
    }

    // ── Gradient header ───────────────────────────────────────────────────────

    private _buildHeader(): HTMLElement {
        const hdr = document.createElement('div');
        hdr.className = 'pb-ubp-header';

        const topRow = document.createElement('div');
        topRow.className = 'pb-ubp-header-top';

        const title       = document.createElement('span');
        title.className   = 'pb-ubp-header-title';
        title.textContent = 'Project Browser';

        const colBtn      = document.createElement('button');
        colBtn.className  = 'pb-ubp-header-btn';
        colBtn.type       = 'button';
        colBtn.title      = 'Collapse / expand all';
        colBtn.innerHTML  = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="2" y1="3" x2="5" y2="7" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
            <line x1="5" y1="7" x2="8" y2="3" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
        </svg>`;
        colBtn.addEventListener('click', () => {
            const all     = ['PROJECT', 'ELEMENTS'];
            const allOpen = all.every(id => this._expandedCards.has(id));
            this._expandedCards = allOpen ? new Set(['PROJECT']) : new Set(all);
            this._proxy.refreshIfActive(this._sectionId);
        });

        const actions   = document.createElement('div');
        actions.className = 'pb-ubp-header-actions';

        const pinBtn      = document.createElement('button');
        pinBtn.className  = 'pb-ubp-header-btn pb-ubp-header-btn--pin' + (this._rail.isPinned ? ' pb-ubp-header-btn--active' : '');
        pinBtn.type       = 'button';
        pinBtn.title      = this._rail.isPinned ? 'Unpin panel' : 'Pin panel';
        pinBtn.setAttribute('aria-label', pinBtn.title);
        pinBtn.innerHTML  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>`;
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._rail.togglePinned();
            this._proxy.refreshIfActive(this._sectionId);
        });

        const closeBtn    = document.createElement('button');
        closeBtn.className = 'pb-ubp-header-btn pb-ubp-header-btn--close';
        closeBtn.type      = 'button';
        closeBtn.title     = 'Close panel';
        closeBtn.setAttribute('aria-label', 'Close panel');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._rail.close();
        });

        actions.appendChild(colBtn);
        actions.appendChild(pinBtn);
        actions.appendChild(closeBtn);
        topRow.appendChild(title);
        topRow.appendChild(actions);
        hdr.appendChild(topRow);

        const bc        = document.createElement('div');
        bc.className    = 'pb-ubp-breadcrumb';
        const projectName = getProjectName();
        const levelName   = getActiveLevelName();
        bc.innerHTML = `<b>${this._escHtml(projectName)}</b>
            <span class="pb-ubp-bc-sep">›</span>
            <span>Building</span>
            <span class="pb-ubp-bc-sep">›</span>
            <b>${this._escHtml(levelName)}</b>`;
        hdr.appendChild(bc);

        const spacer = document.createElement('div');
        spacer.style.height = '8px';
        hdr.appendChild(spacer);

        const searchRow    = document.createElement('div');
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

        const input       = document.createElement('input');
        input.className   = 'pb-ubp-search-input';
        input.type        = 'text';
        input.placeholder = 'Search everything…';
        input.value       = this._searchQuery;
        input.setAttribute('aria-label', 'Search project browser');
        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', () => {
            this._searchQuery = input.value;
            this._proxy.refreshIfActive(this._sectionId);
        });

        searchRow.appendChild(searchIcon);
        searchRow.appendChild(input);
        hdr.appendChild(searchRow);

        const hasOverride  = hasAnyOverride(this._bag);
        const resetRow     = document.createElement('div');
        resetRow.className = 'pb-ubp-reset-row';

        const resetBtn     = document.createElement('button');
        resetBtn.className = 'pb-ubp-reset-btn' + (hasOverride ? ' pb-ubp-reset-btn--active' : '');
        resetBtn.type      = 'button';
        resetBtn.title     = 'Reset all visibility and isolation';
        resetBtn.disabled  = !hasOverride;
        resetBtn.setAttribute('aria-label', 'Reset all visibility and isolation');
        resetBtn.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path d="M9.5 5.5a4 4 0 1 1-1.17-2.83" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <polyline points="7,1 9.5,2.7 8.2,5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Reset visibility`;
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAllVisibility(this._bag);
        });

        resetRow.appendChild(resetBtn);
        hdr.appendChild(resetRow);

        return hdr;
    }

    // ── Visibility button factory ─────────────────────────────────────────────

    private _makeVisBtn(visible: boolean, onChange: (v: boolean) => void): HTMLElement {
        const btn     = document.createElement('button');
        btn.className = 'pb-ubp-st-vis' + (!visible ? ' pb-ubp-st-vis--off' : '');
        btn.type      = 'button';
        btn.title     = visible ? 'Hide' : 'Show';
        btn.innerHTML = visible
            ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <ellipse cx="6.5" cy="6.5" rx="5" ry="3.5" stroke="currentColor" stroke-width="1.1"/>
                <circle cx="6.5" cy="6.5" r="1.6" stroke="currentColor" stroke-width="1.1"/>
               </svg>`
            : `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <line x1="2" y1="2" x2="11" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                <path d="M4 4.5C3 5 2 5.7 1.5 6.5c1.2 2 3 3.5 5 3.5a5 5 0 002.5-.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                <path d="M9.5 8.5C10.8 7.8 11.7 7.2 12 6.5c-1.2-2-3-3.5-5-3.5a5 5 0 00-2 .4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
               </svg>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onChange(!visible);
        });
        return btn;
    }

    // ── Isolate button factory ────────────────────────────────────────────────

    private _makeIsoBtn(targetKey: string, getElemIds: () => string[]): HTMLElement {
        const isActive = this._isolateMode === targetKey;
        const btn      = document.createElement('button');
        btn.className  = 'pb-ubp-st-iso' + (isActive ? ' pb-ubp-st-iso--active' : '');
        btn.type       = 'button';
        btn.title      = isActive ? 'Restore all' : 'Isolate';
        btn.innerHTML  = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.1"/>
            <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor"/>
            <line x1="6.5" y1="1" x2="6.5" y2="2.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <line x1="6.5" y1="10.5" x2="6.5" y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <line x1="1" y1="6.5" x2="2.5" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <line x1="10.5" y1="6.5" x2="12" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyIsolate(this._bag, targetKey, getElemIds);
        });
        return btn;
    }

    // ── Generic card builder ──────────────────────────────────────────────────

    private _buildCard(
        id:        string,
        label:     string,
        dotClass:  string,
        _countText: string,
        body:      HTMLElement,
    ): HTMLElement {
        const isExpanded = this._expandedCards.has(id);

        const card = document.createElement('div');
        card.className = 'pb-ubp-card';

        const hdr = document.createElement('div');
        hdr.className = 'pb-ubp-card-hdr';
        hdr.setAttribute('role',          'button');
        hdr.setAttribute('tabindex',      '0');
        hdr.setAttribute('aria-expanded', String(isExpanded));

        const titleGroup  = document.createElement('span');
        titleGroup.className = 'pb-ubp-card-title';

        const dot = document.createElement('span');
        dot.className = `pb-ubp-dot ${dotClass}`;

        const labelEl       = document.createElement('span');
        labelEl.textContent = label.toUpperCase();

        titleGroup.appendChild(dot);
        titleGroup.appendChild(labelEl);

        const rightGroup    = document.createElement('div');
        rightGroup.className = 'pb-ubp-card-right';

        const chevron       = document.createElement('span');
        chevron.className   = 'pb-ubp-chevron' + (isExpanded ? ' pb-ubp-chevron--open' : '');
        chevron.textContent = '›';

        rightGroup.appendChild(chevron);
        hdr.appendChild(titleGroup);
        hdr.appendChild(rightGroup);

        const bodyWrap         = document.createElement('div');
        bodyWrap.className     = 'pb-ubp-card-body';
        bodyWrap.style.display = isExpanded ? '' : 'none';
        if (isExpanded) bodyWrap.appendChild(body);

        const toggle = () => {
            const wasOpen = this._expandedCards.has(id);
            if (wasOpen) {
                this._expandedCards.delete(id);
                bodyWrap.style.display = 'none';
                chevron.classList.remove('pb-ubp-chevron--open');
                hdr.setAttribute('aria-expanded', 'false');
            } else {
                this._expandedCards.add(id);
                bodyWrap.style.display = '';
                if (!bodyWrap.hasChildNodes()) bodyWrap.appendChild(body);
                chevron.classList.add('pb-ubp-chevron--open');
                hdr.setAttribute('aria-expanded', 'true');
            }
        };

        hdr.addEventListener('click', toggle);
        hdr.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });

        card.appendChild(hdr);
        card.appendChild(bodyWrap);
        return card;
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private _escHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
