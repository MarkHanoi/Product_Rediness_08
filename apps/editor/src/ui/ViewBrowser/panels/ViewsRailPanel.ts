/**
 * ViewsRailPanel — Views section content for the left-rail DOCUMENTS panel.
 *
 * UI MODIFICATION DECLARATION
 *   Panel Affected:   Views & Sheets › Views tab
 *   Files Modified:   ViewsRailPanel.ts, projectBrowser.ts (pb-view-* styles)
 *   Change:           Complete visual overhaul — now matches Project Browser
 *                     (violet accent bar, thumbnail, ACTIVE pill, level badge,
 *                      sheet badge, element count, delete + duplicate actions).
 *   CSS Prefix:       pb-view- (registered)
 *   Prohibited:       Zero bim-*, zero inline <style>
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01 §2   — All mutations via the legacy command manager; no direct store writes
 *   §02      — levelId required for floor plan views (validated in create form)
 *
 * Performance note — element counts:
 *   Plan views: O(n) filter over the model read model by levelId.
 *   For 200 elements + 10 plan views ≈ 2 ms total — negligible.
 *   3D and other views: uses a pre-aggregated total from the read model.
 *   No per-frame recomputation; counts are computed once at panel build.
 */

import { getFrameScheduler }              from '@pryzm/frame-scheduler';
import { viewDefinitionStore }           from '@pryzm/core-app-model';
import type { ViewDefinition }            from '@pryzm/core-app-model';
import { VIEW_RANGE_PRESETS }             from '@pryzm/core-app-model';
import { sheetStore }                    from '@pryzm/core-app-model';
import { viewIntentInstanceStore }       from '@pryzm/core-app-model/presentation';
import type { ProjectBrowserPanelProps } from '../ProjectBrowserTypes';
import type { RailPanelController }      from '../RailPanelController';

// ── View sub-group definitions ────────────────────────────────────────────────

const VIEW_SUB_GROUPS: Array<{
    label:    string;
    viewType: ViewDefinition['viewType'];
    svgIcon:  string;
}> = [
    {
        label: '3D Views', viewType: '3d',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z"/>
            <line x1="8" y1="8" x2="8" y2="15"/><line x1="8" y1="8" x2="14" y2="4.5"/>
            <line x1="8" y1="8" x2="2" y2="4.5"/>
        </svg>`,
    },
    {
        label: 'Floor Plans', viewType: 'plan',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="1"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
            <line x1="8" y1="2" x2="8" y2="14"/>
        </svg>`,
    },
    {
        label: 'Sections', viewType: 'section',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="14" height="10" rx="1"/>
            <line x1="1" y1="8" x2="15" y2="8" stroke-dasharray="2,2"/>
            <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
        </svg>`,
    },
    {
        label: 'Elevations', viewType: 'elevation',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="2" y1="13" x2="14" y2="13"/>
            <rect x="4" y="5" width="8" height="8"/>
            <polyline points="6,5 8,2 10,5"/>
        </svg>`,
    },
    {
        label: 'Analysis Views', viewType: 'analysis',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 4v4l3 2"/>
        </svg>`,
    },
    {
        label: 'Ceiling Plans', viewType: 'ceiling-plan',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1"/>
            <circle cx="5" cy="5" r="1"/><circle cx="11" cy="5" r="1"/>
            <circle cx="5" cy="11" r="1"/><circle cx="11" cy="11" r="1"/>
        </svg>`,
    },
    {
        label: 'Structural', viewType: 'structural-plan',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1"/>
            <line x1="2" y1="6" x2="14" y2="6"/><line x1="2" y1="10" x2="14" y2="10"/>
            <line x1="6" y1="2" x2="6" y2="14"/><line x1="10" y1="2" x2="10" y2="14"/>
        </svg>`,
    },
    {
        label: 'Details', viewType: 'detail',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="8" cy="8" r="4"/>
            <circle cx="8" cy="8" r="6.5" stroke-dasharray="2,2"/>
        </svg>`,
    },
    {
        label: 'Drafting', viewType: 'drafting',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M10 2L14 6L6 14H2V10L10 2Z"/>
            <line x1="8" y1="4" x2="12" y2="8"/>
        </svg>`,
    },
    {
        label: 'Legends', viewType: 'legend',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="2" y1="5" x2="14" y2="5"/><line x1="2" y1="9" x2="14" y2="9"/>
            <line x1="2" y1="13" x2="10" y2="13"/>
            <rect x="2" y="2" width="3" height="3" fill="currentColor" stroke="none" rx="0.5"/>
        </svg>`,
    },
    {
        label: 'Renders', viewType: 'render',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="2" y="4" width="12" height="9" rx="1"/>
            <circle cx="8" cy="8.5" r="2.5"/>
            <circle cx="5" cy="5.8" r="0.8" fill="currentColor" stroke="none"/>
        </svg>`,
    },
    {
        label: 'Walkthroughs', viewType: 'walkthrough',
        svgIcon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M2 8C2 8 5 4 8 8S14 8 14 8"/>
            <circle cx="8" cy="8" r="2"/>
            <polyline points="12,6 14,8 12,10"/>
        </svg>`,
    },
];

// ── Thumb colour per view type ─────────────────────────────────────────────

const VIEW_THUMB_BG: Record<ViewDefinition['viewType'], string> = {
    '3d':             '#d4c8ff',
    'plan':           '#c8deff',
    'section':        '#ffe4c8',
    'elevation':      '#c8ffd4',
    'analysis':       '#ffc8d4',
    'ceiling-plan':   '#e4c8ff',
    'structural-plan':'#c8e4ff',
    'detail':         '#fff4c8',
    'drafting':       '#c8fff4',
    'legend':         '#f4c8ff',
    'render':         '#ffc8c8',
    'walkthrough':    '#c8ffc8',
};

const VIEW_THUMB_COLOR: Record<ViewDefinition['viewType'], string> = {
    '3d':             '#6600FF',
    'plan':           '#2563eb',
    'section':        '#ea7c00',
    'elevation':      '#15803d',
    'analysis':       '#dc2626',
    'ceiling-plan':   '#7c3aed',
    'structural-plan':'#1d4ed8',
    'detail':         '#a16207',
    'drafting':       '#0d9488',
    'legend':         '#9333ea',
    'render':         '#dc2626',
    'walkthrough':    '#16a34a',
};

const VIEW_TYPE_TO_OBC: Record<ViewDefinition['viewType'], string> = {
    '3d':             '3D',
    'plan':           'Top',
    'section':        'Section',
    'elevation':      'Front',
    'analysis':       '3D',
    'ceiling-plan':   'Top',
    'structural-plan':'Top',
    'detail':         'Front',
    'drafting':       'Top',
    'legend':         'Top',
    'render':         '3D',
    'walkthrough':    '3D',
};

// ── Panel class ────────────────────────────────────────────────────────────

export class ViewsRailPanel {
    private readonly _sectionId = 'VIEWS';
    private _activeViewId:       string | null  = null;
    private _createFormOpen:     Map<string, boolean> = new Map();
    private _ctxMenu:            HTMLElement | null = null;
    private _ctxDismissHandler:  ((e: MouseEvent) => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _props: ProjectBrowserPanelProps,
        private readonly _rail:  RailPanelController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;

        // F.3.3 Wave 14 — runtime.persistence.client wiring (view CRUD).
        // Phase F: reads runtime.persistence.client to confirm the client slot
        // is available; full view-CRUD migration lands in Phase C.3.x.
        if (runtime?.persistence?.client) {
            console.debug('[ViewsRailPanel] Wave 14 runtime.persistence.client wired');
        }

        const refresh = () => this._rail.refreshIfActive(this._sectionId);

        window.addEventListener('vd:view-created', refresh);
        window.addEventListener('vd:view-updated', refresh);
        window.addEventListener('vd:view-deleted', refresh);
        window.addEventListener('vd:store-loaded', refresh);
        window.addEventListener('vd:store-reset',  refresh);
        window.addEventListener('sd:sheet-updated', refresh);
        window.addEventListener('sd:sheet-deleted', refresh);
        window.addEventListener('sd:store-reset',   refresh);
        // vi:instance-updated migrated to runtime.events (F.events.2b); DOM listener kept for vi:overrides-cleared only.
        this.runtime?.events?.on('vi:instance-updated', () => refresh()); // F.events.2b
        window.addEventListener('vi:overrides-cleared', refresh);

        window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
            const p = payload as { mode?: string; viewId?: string | null } | undefined;
            this._activeViewId = p?.mode ?? p?.viewId ?? null;
            refresh();
        });
    }

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'pb-views-container';
        for (const group of VIEW_SUB_GROUPS) {
            container.appendChild(
                this._buildViewSubGroup(group.label, group.viewType, group.svgIcon)
            );
        }
        return container;
    }

    // ── Group header ───────────────────────────────────────────────────────

    private _buildViewSubGroup(
        label:    string,
        viewType: ViewDefinition['viewType'],
        svgIcon:  string,
    ): HTMLElement {
        const views      = viewDefinitionStore.getByType(viewType);
        const isFormOpen = this._createFormOpen.get(viewType) ?? false;

        const wrapper = document.createElement('div');
        wrapper.className = 'pb-view-group';

        // ── Group header ───────────────────────────────────────────
        const hdr = document.createElement('div');
        hdr.className = 'pb-view-group-header';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'pb-view-group-icon';
        iconSpan.innerHTML = svgIcon;
        iconSpan.style.color = VIEW_THUMB_COLOR[viewType];

        const labelEl = document.createElement('span');
        labelEl.className   = 'pb-view-group-label';
        labelEl.textContent = label;

        const spacer = document.createElement('span');
        spacer.style.flex = '1';

        hdr.appendChild(iconSpan);
        hdr.appendChild(labelEl);
        hdr.appendChild(spacer);

        if (views.length > 0) {
            const countBadge = document.createElement('span');
            countBadge.className   = 'pb-view-group-count';
            countBadge.textContent = String(views.length);
            hdr.appendChild(countBadge);
        }

        const addBtn = document.createElement('button');
        addBtn.className   = 'pb-view-add-btn';
        addBtn.type        = 'button';
        addBtn.title       = `Add ${label}`;
        addBtn.textContent = '+';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._createFormOpen.set(viewType, !isFormOpen);
            this._rail.refreshIfActive(this._sectionId);
        });
        hdr.appendChild(addBtn);

        wrapper.appendChild(hdr);

        // ── Create form (if open) ──────────────────────────────────
        if (isFormOpen) {
            wrapper.appendChild(this._buildCreateViewForm(viewType));
        }

        // ── View entries ───────────────────────────────────────────
        for (const view of views) {
            wrapper.appendChild(this._buildViewEntry(view, viewType, svgIcon));
        }

        if (views.length === 0 && !isFormOpen) {
            const empty = document.createElement('div');
            empty.className   = 'pb-view-empty';
            empty.textContent = 'No views yet';
            wrapper.appendChild(empty);
        }

        return wrapper;
    }

    // ── View entry row ─────────────────────────────────────────────────────

    private _buildViewEntry(
        view:     ViewDefinition,
        viewType: ViewDefinition['viewType'],
        svgIcon:  string,
    ): HTMLElement {
        const isActive = this._activeViewId === view.id ||
                         this._activeViewId === VIEW_TYPE_TO_OBC[view.viewType];

        const entry = document.createElement('div');
        entry.className = 'pb-view-entry' + (isActive ? ' pb-view-entry--active' : '');
        entry.setAttribute('role', 'button');
        entry.setAttribute('tabindex', '0');
        entry.title = [
            `Type: ${view.viewType}`,
            view.discipline ? `Discipline: ${view.discipline}` : '',
            'Click: activate view  ·  Right-click: more actions',
            'Right-click: add to sheet…',
        ].filter(Boolean).join('\n');

        // Left accent bar (visible on active, or hover-revealed by CSS)
        const accentBar = document.createElement('div');
        accentBar.className = 'pb-view-accent-bar';

        // Thumbnail
        const thumb = document.createElement('div');
        thumb.className = 'pb-view-thumb';
        thumb.style.background = VIEW_THUMB_BG[viewType] ?? '#e8edf6';

        const thumbIcon = document.createElement('span');
        thumbIcon.className = 'pb-view-thumb-icon';
        thumbIcon.innerHTML = svgIcon;
        thumbIcon.style.color = VIEW_THUMB_COLOR[viewType] ?? '#6600FF';
        thumb.appendChild(thumbIcon);

        // Name
        const nameEl = document.createElement('span');
        nameEl.className   = 'pb-view-name';
        nameEl.textContent = view.name;

        entry.appendChild(accentBar);
        entry.appendChild(thumb);
        entry.appendChild(nameEl);

        if (this._hasViewOverrides(view.id)) {
            const overrideDot = document.createElement('span');
            overrideDot.className = 'pb-view-override-dot';
            overrideDot.title = 'This view has local visibility or graphics overrides';
            entry.appendChild(overrideDot);
        }

        const intentBadge = this._buildIntentBadge(view.id);
        entry.appendChild(intentBadge);

        // Level badge (Floor Plans only)
        if (view.viewType === 'plan' && view.spatial?.levelId) {
            const levelBadge = document.createElement('span');
            levelBadge.className   = 'pb-view-level-badge';
            levelBadge.textContent = this._getLevelName(view.spatial.levelId);
            levelBadge.title       = `Level: ${this._getLevelName(view.spatial.levelId)}`;
            entry.appendChild(levelBadge);
        }

        // Sheet badge (if placed on a sheet)
        const sheetsWithView = sheetStore.getByViewId(view.id);
        if (sheetsWithView.length > 0) {
            const sheetBadge = document.createElement('span');
            sheetBadge.className   = 'pb-view-sheet-badge';
            sheetBadge.textContent = sheetsWithView[0].sheetNumber;
            sheetBadge.title       = `On sheet ${sheetsWithView[0].sheetNumber} — ${sheetsWithView[0].name}`;
            entry.appendChild(sheetBadge);
        }

        // Element count badge
        const count = this._getElementCount(view);
        if (count !== null) {
            const countEl = document.createElement('span');
            countEl.className   = 'pb-view-count';
            countEl.textContent = String(count);
            countEl.title       = `${count} elements associated with this view`;
            entry.appendChild(countEl);
        }

        // ACTIVE pill
        if (isActive) {
            const activePill = document.createElement('span');
            activePill.className   = 'pb-view-active-pill';
            activePill.textContent = 'ACTIVE';
            entry.appendChild(activePill);
        }

        // Hover actions (duplicate + delete) — right side
        const actions = document.createElement('div');
        actions.className = 'pb-view-actions';

        const dupBtn = document.createElement('button');
        dupBtn.type      = 'button';
        dupBtn.className = 'pb-view-action-btn pb-view-action-btn--dup';
        dupBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="9" height="9" rx="1.5"/>
            <path d="M2 11V3a2 2 0 012-2h8"/>
        </svg>`;
        dupBtn.title = `Duplicate "${view.name}"`;
        dupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._duplicateView(view);
        });

        const delBtn = document.createElement('button');
        delBtn.type      = 'button';
        delBtn.className = 'pb-view-action-btn pb-view-action-btn--del';
        delBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/>
        </svg>`;
        delBtn.title = `Delete "${view.name}"`;
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._deleteView(view);
        });

        actions.appendChild(dupBtn);
        actions.appendChild(delBtn);
        entry.appendChild(actions);

        // Interaction — §05-UI §4.3 / §27-SELECTION-ORCH §3.2
        // Single-click both selects the entry (highlights row, opens
        // ViewProperties panel) AND activates the view in the main viewport.
        // The previous double-click-only activation gesture was non-discoverable;
        // users reported "highlights but doesn't work".  The two-state plan-view
        // artifact that motivated the original split is now handled inside
        // ViewController.activate() via the re-entry guard below
        // (alreadyAtView && alreadyAtMode → return), so a single click is safe.
        // Double-click is preserved as a no-op shortcut for muscle memory.
        entry.addEventListener('click', () => {
            this._onEntitySelect(view.id);
            this._onActivateView(view.id, view.viewType);
        });
        entry.addEventListener('dblclick', () => this._onActivateView(view.id, view.viewType));
        entry.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._onEntitySelect(view.id);
                this._onActivateView(view.id, view.viewType);
            }
        });
        entry.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault();
            this._showContextMenu(e.clientX, e.clientY, view);
        });

        return entry;
    }

    // ── Element count (lightweight — computed at panel build, not per-frame) ──

    private _getElementCount(view: ViewDefinition): number | null {
        try {
            const rm = window.readModel; // TODO(D.4): legacy readModel — replace with runtime.scene.readModel
            if (!rm) return null;
            const all: any[] = rm.getAll?.() ?? [];
            if (all.length === 0) return null;

            if (view.viewType === 'plan' && view.spatial?.levelId) {
                const levelId = view.spatial.levelId;
                return all.filter(e => e.levelId === levelId).length;
            }
            if (view.viewType === '3d') {
                return all.length;
            }
            return null;
        } catch {
            return null;
        }
    }

    private _hasViewOverrides(viewId: string): boolean {
        const layer = viewIntentInstanceStore.get(viewId)?.localOverrides;
        return Boolean(layer && (layer.isolateActive || layer.visibilityOverrides.length > 0 || layer.graphicOverrides.length > 0));
    }

    private _buildIntentBadge(viewId: string): HTMLElement {
        const instance = viewIntentInstanceStore.get(viewId);
        const badge = document.createElement('span');
        if (!instance) {
            badge.className = 'pb-view-intent-badge pb-view-intent-badge--none';
            badge.textContent = 'NO INTENT';
            badge.title = 'No visibility intent assigned';
            return badge;
        }
        if (this._hasViewOverrides(viewId)) {
            badge.className = 'pb-view-intent-badge pb-view-intent-badge--custom';
            badge.textContent = 'CUSTOM';
            badge.title = 'Visibility intent with local overrides';
            return badge;
        }
        badge.className = 'pb-view-intent-badge pb-view-intent-badge--pure';
        badge.textContent = 'INTENT';
        badge.title = 'Pure visibility intent';
        return badge;
    }

    // ── Delete view ────────────────────────────────────────────────────────

    private _deleteView(view: ViewDefinition): void {
        if (!confirm(`Delete view "${view.name}"? This cannot be undone.`)) return;
        this.runtime?.bus?.executeCommand('view.deleteDefinition', { viewId: view.id });
        if (this._activeViewId === view.id) this._activeViewId = null;
        this._rail.refreshIfActive(this._sectionId);
        console.log(`[ViewsRailPanel] Deleted view: ${view.name} (${view.id})`);
    }

    // ── Duplicate view ─────────────────────────────────────────────────────

    private _duplicateView(view: ViewDefinition): void {
        const newId   = `vd-${view.viewType}-${crypto.randomUUID()}`;
        const newName = `${view.name} (Copy)`;
        this.runtime?.bus?.executeCommand('view.createDefinition', {
            id:           newId,
            name:         newName,
            viewType:     view.viewType,
            discipline:   view.discipline,
            intent:       view.intent,
            vgTemplateId: view.vgTemplateId,
            ...(view.spatial ? { spatial: { ...view.spatial } } : {}),
        });
        this._rail.refreshIfActive(this._sectionId);
        console.log(`[ViewsRailPanel] Duplicated view: ${view.name} → ${newName} (${newId})`);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private _getLevels(): Array<{ id: string; name: string; elevation: number }> {
        try {
            const ws = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
            if (!ws || typeof ws.getLevels !== 'function') return [];
            return (ws.getLevels() as Array<{ id: string; name: string; elevation: number }>)
                .map(l => ({ id: l.id, name: l.name, elevation: l.elevation ?? 0 }));
        } catch { return []; }
    }

    private _getLevelName(levelId: string): string {
        const found = this._getLevels().find(l => l.id === levelId);
        return found ? found.name : levelId;
    }

    // ── Create form ───────────────────────────────────────────────────────

    private _buildCreateViewForm(viewType: ViewDefinition['viewType']): HTMLElement {
        const form = document.createElement('div');
        form.className = 'pb-create-form';

        const nameInput = document.createElement('input');
        nameInput.className   = 'pb-create-form-input';
        nameInput.type        = 'text';
        nameInput.placeholder = 'View name…';
        nameInput.setAttribute('aria-label', 'New view name');
        nameInput.setAttribute('autocomplete', 'off');

        let levelSelect: HTMLSelectElement | null = null;
        let levelValidationMsg: HTMLElement | null = null;

        if (viewType === 'plan' || viewType === 'structural-plan') {
            const levels   = this._getLevels();
            const levelRow = document.createElement('div');
            levelRow.className = 'pb-create-form-level-row';

            const levelLabel = document.createElement('label');
            levelLabel.className   = 'pb-create-form-level-label';
            levelLabel.textContent = 'Level';

            levelSelect = document.createElement('select');
            levelSelect.className = 'pb-create-form-select';
            levelSelect.setAttribute('aria-label', 'Associate with level');

            const placeholder = document.createElement('option');
            placeholder.value = ''; placeholder.textContent = 'Select a level…';
            placeholder.disabled = true; placeholder.selected = true;
            levelSelect.appendChild(placeholder);

            if (levels.length === 0) {
                const none = document.createElement('option');
                none.value = ''; none.textContent = '(no levels defined)'; none.disabled = true;
                levelSelect.appendChild(none);
            } else {
                for (const lvl of levels) {
                    const opt = document.createElement('option');
                    opt.value       = lvl.id;
                    opt.textContent = `${lvl.name}  (elev. ${lvl.elevation.toFixed(1)} m)`;
                    levelSelect.appendChild(opt);
                }
            }

            levelValidationMsg = document.createElement('span');
            levelValidationMsg.className   = 'pb-create-form-validation';
            levelValidationMsg.textContent = viewType === 'structural-plan'
                ? 'A level is required for Structural Plans.'
                : 'A level is required for Floor Plans.';
            levelValidationMsg.style.display = 'none';

            levelRow.appendChild(levelLabel);
            levelRow.appendChild(levelSelect);
            form.appendChild(nameInput);
            form.appendChild(levelRow);
            form.appendChild(levelValidationMsg);
        } else {
            form.appendChild(nameInput);
        }

        const actions   = document.createElement('div');
        actions.className = 'pb-create-form-actions';

        const createBtn = document.createElement('button');
        createBtn.className   = 'pb-create-form-btn pb-create-form-btn--primary';
        createBtn.type        = 'button';
        createBtn.textContent = 'Create';

        const cancelBtn = document.createElement('button');
        cancelBtn.className   = 'pb-create-form-btn';
        cancelBtn.type        = 'button';
        cancelBtn.textContent = 'Cancel';

        const doCreate = () => {
            const name = nameInput.value.trim();
            if (!name) { nameInput.focus(); return; }
            if ((viewType === 'plan' || viewType === 'structural-plan') && levelSelect) {
                const selectedLevel = levelSelect.value;
                if (!selectedLevel) {
                    if (levelValidationMsg) levelValidationMsg.style.display = '';
                    levelSelect.focus();
                    return;
                }
                if (levelValidationMsg) levelValidationMsg.style.display = 'none';
                this._executeCreateView(name, viewType, { levelId: selectedLevel });
            } else {
                this._executeCreateView(name, viewType);
            }
            this._createFormOpen.set(viewType, false);
            this._rail.refreshIfActive(this._sectionId);
        };

        const doCancel = () => {
            this._createFormOpen.set(viewType, false);
            this._rail.refreshIfActive(this._sectionId);
        };

        createBtn.addEventListener('click', doCreate);
        cancelBtn.addEventListener('click', doCancel);
        nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter')  { e.preventDefault(); doCreate(); }
            if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
        });

        actions.appendChild(createBtn);
        actions.appendChild(cancelBtn);
        form.appendChild(actions);

        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('views-rail-create-focus', () => nameInput.focus());
        return form;
    }

    private _executeCreateView(
        name:     string,
        viewType: ViewDefinition['viewType'],
        options?: { levelId?: string },
    ): void {
        const id  = `vd-${viewType}-${crypto.randomUUID()}`;

        // DOC-2.5h: structural-plan views use the structural viewRange preset so that
        // ceiling-level beams (farOffset: 4.0 m) are captured by EdgeProjectorService.
        // §02 §1.2 — all world-Y resolution deferred to EdgeProjectorService.resolveClipRange().
        const spatialBase = options?.levelId ? { levelId: options.levelId } : {};
        const spatial = viewType === 'structural-plan'
            ? { ...spatialBase, viewRange: { ...VIEW_RANGE_PRESETS.structural } }
            : (options?.levelId ? spatialBase : undefined);

        this.runtime?.bus?.executeCommand('view.createDefinition', {
            id,
            name,
            viewType,
            ...(spatial ? { spatial } : {}),
        });
        console.log(`[ViewsRailPanel] Created ViewDefinition: ${name} (${viewType}) id=${id}`);
    }

    // ── Selection / activation ─────────────────────────────────────────────

    private _onEntitySelect(viewId: string): void {
        const view = viewDefinitionStore.get(viewId);
        if (!view) return;
        // §05-UI §4.3 — Selection populates the ViewProperties panel.
        // Activation of the view in the main viewport is performed by
        // _onActivateView(), which the click handler now invokes immediately
        // after this select call.  The re-entry guard inside _onActivateView
        // protects against the previous "two-state plan view" artifact (the
        // root cause was double activate() calls, not single-click activation
        // itself), so it is safe to chain select + activate on a single click.
        const vpp = window.viewPropertiesPanel; // TODO(F.6.5): legacy viewPropertiesPanel — replace with runtime.panelHost.get('viewProperties')
        if (vpp?.showFromDefinition) vpp.showFromDefinition(view);
        else if (vpp?.show)          vpp.show({ id: VIEW_TYPE_TO_OBC[view.viewType], label: view.name });
        this._activeViewId = viewId;
        this._rail.refreshIfActive(this._sectionId);
        console.log(`[ViewsRailPanel] Selected view: ${view.name} (${view.viewType})`);
    }

    private _onActivateView(viewId: string, viewType: ViewDefinition['viewType']): void {
        const _t0 = performance.now();

        // RC-A FIX: Re-entry guard — skip if the ViewController is already in this
        // exact view. Without this guard, a second activation cycle runs deactivate()
        // immediately after the first cycle's EdgeProjectorService.project() completes,
        // disposing the just-created edge geometry while its container objects remain in
        // the scene — producing ghost objects that crash the WebGPU AttributeNode
        // compiler on the next 3D return (RC-B escalation).
        // FIX-2 (double-click 3D stuck — re-entry guard never fired, two root causes):
        //   a) vc.viewMode was always undefined. ViewController exposes .currentMode.
        //   b) vc.activeDefinitionId is cleared to null in ViewController.activate()
        //      finally block, so for 3D views it was always null !== 'vd-sys-3d-1'.
        //      Use vc.currentViewDefinitionId which persists across activate() calls.
        const vc = window.viewController; // TODO(D.4): legacy viewController — replace with runtime.viewRegistry controller
        if (vc) {
            const planTypes: ReadonlyArray<ViewDefinition['viewType']> = ['plan', 'ceiling-plan', 'structural-plan'];
            const targetMode = planTypes.includes(viewType) ? 'Top'
                : viewType === '3d' ? '3D'
                : null;
            const alreadyAtView = vc.activeDefinitionId === viewId
                                || vc.currentViewDefinitionId === viewId;
            const alreadyAtMode = targetMode === null || vc.currentMode === targetMode;
            if (alreadyAtView && alreadyAtMode) {
                console.log(`[ViewsRailPanel] _onActivateView: already in view "${viewId}" (${viewType}) — re-entry skipped`);
                return;
            }
        }

        console.log(`[ViewsRailPanel][+0ms] _onActivateView(viewId="${viewId}", viewType="${viewType}")`);

        let obcId: string;
        if (viewType === 'elevation') {
            const view = viewDefinitionStore.get(viewId);
            obcId = this._resolveElevationDirection(view);
        } else {
            obcId = VIEW_TYPE_TO_OBC[viewType];
        }

        window.viewController?.setActiveViewDefinitionId(viewId); // TODO(D.4): legacy viewController — replace with runtime.viewRegistry controller
        this._props.onViewSelect(obcId);
        this._activeViewId = viewId;
        this._rail.refreshIfActive(this._sectionId);
        console.log(`[ViewsRailPanel][+${(performance.now() - _t0).toFixed(1)}ms] _onActivateView COMPLETE`);
    }

    private _resolveElevationDirection(view: ViewDefinition | undefined): string {
        // DOC-22 §6.1: elevation marks store direction in spatial.projectionDirection
        // (set by ElevationPlanToolHandler._commit()).  sectionPlane.normal is used by
        // section views only — never set for elevation-mark-created views.
        const dir = (view?.spatial as any)?.projectionDirection as { x?: number; y?: number; z?: number } | undefined;
        if (dir) {
            const absX = Math.abs(dir.x ?? 0);
            const absZ = Math.abs(dir.z ?? 0);
            if (absZ >= absX) return (dir.z ?? 0) <= 0 ? 'Front' : 'Back';
            return (dir.x ?? 0) <= 0 ? 'Left' : 'Right';
        }
        // Fallback: legacy views that used sectionPlane.normal.
        const n = view?.spatial?.sectionPlane?.normal;
        if (!n) return 'Front';
        const [nx, , nz] = n;
        if (Math.abs(nz) >= Math.abs(nx)) return nz <= 0 ? 'Front' : 'Back';
        return nx <= 0 ? 'Left' : 'Right';
    }

    // ── Context menu ───────────────────────────────────────────────────────

    private _showContextMenu(x: number, y: number, view: ViewDefinition): void {
        this._dismissContextMenu();
        const menu  = this._buildContextMenu(view);
        const vw    = window.innerWidth;
        const vh    = window.innerHeight;
        const menuW = 220;
        const menuH = 320;
        let left = x + 4;
        let top  = y + 4;
        if (left + menuW > vw) left = vw - menuW - 8;
        if (top  + menuH > vh) top  = vh - menuH - 8;
        menu.style.left = `${Math.max(4, left)}px`;
        menu.style.top  = `${Math.max(4, top)}px`;
        document.body.appendChild(menu);
        this._ctxMenu = menu;
        const dismiss = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) this._dismissContextMenu();
        };
        this._ctxDismissHandler = dismiss;
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
    }

    private _dismissContextMenu(): void {
        this._ctxMenu?.remove();
        this._ctxMenu = null;
        if (this._ctxDismissHandler) {
            document.removeEventListener('mousedown', this._ctxDismissHandler);
            this._ctxDismissHandler = null;
        }
    }

    private _buildContextMenu(view: ViewDefinition): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'pb-ctx-menu';

        const sheetsWithView    = sheetStore.getByViewId(view.id);
        const placedSheetId     = sheetsWithView.length > 0 ? sheetsWithView[0].id : null;
        const isLegend          = view.viewType === 'legend';

        const header = document.createElement('div');
        header.className   = 'pb-ctx-menu-item pb-ctx-menu-item--disabled';
        header.textContent = `📋 ${view.name}`;
        header.style.cssText = 'font-weight:600;font-size:11px;opacity:0.6;';
        menu.appendChild(header);

        const sep = document.createElement('div');
        sep.className = 'pb-ctx-separator';
        menu.appendChild(sep);

        // Quick actions
        const dupItem = document.createElement('div');
        dupItem.className = 'pb-ctx-menu-item';
        dupItem.textContent = '⧉ Duplicate View';
        dupItem.addEventListener('click', () => { this._dismissContextMenu(); this._duplicateView(view); });
        menu.appendChild(dupItem);

        const delItem = document.createElement('div');
        delItem.className = 'pb-ctx-menu-item pb-ctx-menu-item--danger';
        delItem.textContent = '✕ Delete View';
        delItem.addEventListener('click', () => { this._dismissContextMenu(); this._deleteView(view); });
        menu.appendChild(delItem);

        const sep2 = document.createElement('div');
        sep2.className = 'pb-ctx-separator';
        menu.appendChild(sep2);

        const addLabel = document.createElement('div');
        addLabel.className   = 'pb-ctx-menu-item pb-ctx-menu-item--disabled';
        addLabel.textContent = '➕ Add to Sheet…';
        addLabel.style.cssText = 'font-weight:500;font-size:11px;opacity:0.7;';
        menu.appendChild(addLabel);

        const allSheets = sheetStore.getAll();
        if (allSheets.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'pb-ctx-sheet-entry pb-ctx-sheet-entry--blocked';
            empty.textContent = '(No sheets — create a sheet first)';
            menu.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'pb-ctx-sheet-list';
            for (const sheet of allSheets) {
                const isPlacedOnThisSheet      = sheet.id === placedSheetId;
                const isAlreadyPlacedElsewhere = !isLegend && placedSheetId !== null && sheet.id !== placedSheetId;
                const entry = document.createElement('div');
                entry.className = 'pb-ctx-sheet-entry';
                if (isPlacedOnThisSheet || isAlreadyPlacedElsewhere) {
                    entry.classList.add('pb-ctx-sheet-entry--blocked');
                }
                const icon = isPlacedOnThisSheet ? '✓' : '📋';
                entry.textContent = `${icon} ${sheet.sheetNumber} — ${sheet.name}`;
                entry.title = isPlacedOnThisSheet
                    ? 'Already placed on this sheet'
                    : isAlreadyPlacedElsewhere
                        ? `Already placed on sheet ${sheetsWithView[0]?.sheetNumber}`
                        : `Add to sheet ${sheet.sheetNumber}`;
                if (!isPlacedOnThisSheet && !isAlreadyPlacedElsewhere) {
                    entry.addEventListener('click', () => {
                        this._dismissContextMenu();
                        this.runtime?.bus?.executeCommand('sheet.addViewport', {
                            sheetId:    sheet.id,
                            viewportId: crypto.randomUUID(),
                            viewId:     view.id,
                            position:   { x: 100, y: 100 },
                            scale:      100,
                            viewType:   view.viewType,
                        });
                    });
                }
                list.appendChild(entry);
            }
            menu.appendChild(list);
        }

        return menu;
    }
}