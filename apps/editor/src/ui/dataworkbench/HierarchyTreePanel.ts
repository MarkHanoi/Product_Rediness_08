/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Hierarchy Tree Panel (Phase 7-B + Element Rows)
 * File:             src/ui/dataworkbench/HierarchyTreePanel.ts
 * Contract:         docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § PHASE 7
 *                   docs/00_PRZYM/HIERARCHY_TREE_ELEMENT_ROWS_IMPLEMENTATION_PLAN.md
 *                   docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §3
 *
 * Renders the full Site → Building → Level → Unit → Room → [Elements] hierarchy tree.
 * Data is read from window.hierarchyStore and window.roomStore. // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
 * Element stores accessed via window globals: wallStore, slabStore, columnStore,
 * doorStore, windowStore, furnitureStore, semanticGraphManager.
 *
 * Bidirectional selection:
 *   → Tree node click: dispatches 'pryzm-workbench-select' CustomEvent
 *   ← 'pryzm-element-selected': scrolls tree to that element
 *
 * Auto-refresh on: 'pryzm-sync-state-changed' + 'pryzm-room-sync-state-changed'
 * Auto-setup banner: shown when hierarchyStore.count() === 0
 *
 * Element rows (Level 6):
 *   - Rooms expand to reveal Walls, Doors, Windows, Slabs, Columns, Furniture groups
 *   - Lazily populated: element lookups run only for expanded rooms
 *   - Cache-backed: groups rebuilt only on relevant store mutation events
 *   - Furniture resolved async via SemanticGraph contains edges (fire-and-forget)
 */

import type { SiteData, BuildingData, LevelData, UnitData } from '@pryzm/core-app-model';
// §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4/§5 · C71 §4.4 · C79 §5.2.0) — this
// panel is the file whose header already documents ONE instance of this family
// (`getEdgesFromNode?.(room.id) ?? []`, the furniture group that never rendered).
// The bounding-wall reads at `_countRoomElements` and `_getElementGroups` were
// the SAME defect, still live. They now go through the typed discriminator, and
// an undetermined relationship gets a VISIBLE refusal row instead of an empty
// tree — C78 §5, discovery must be able to refuse.
import {
    determineBoundingWalls,
    boundingWallIdsOrUnknown,
    boundingWallsUndeterminedLabel,
    isBoundingWallsUndetermined,
} from '@pryzm/core-app-model';
// §FIX-ROOM-FACETS-UNDETERMINED (GR-10, the []-means-unknown drain) — the
// slab/column facets and the hosted door/window lookups were the SAME family
// as the bounding-wall fix above, still live in this file. The decisions moved
// to the PURE `roomContentsFacets` module (stores as parameters) so they are
// assertable; an unrecorded facet now renders a ⚠ refusal row and the count
// badge says "≥ N" instead of forging an exact number.
import {
    buildRoomElementGroups,
    countRoomElements,
    facetRefusalText,
    type RoomElement,
    type RoomElementCount,
    type RoomElementGroup,
    type RoomElementGroupsResult,
    type RoomFacetRefusal,
} from './roomContentsFacets';
import { syncStateDetailDrawer } from './SyncStateDetailDrawer';
import { syncStateColour } from './syncStateColours';
import {
    addSite, addBuilding, addLevel, addUnit,
    getRoomsForUnit, getUnassignedRooms,
    type HierarchyTreeActionHost,
} from './HierarchyTreeAddActions';

// ── Element row types — moved to `roomContentsFacets.ts` (pure, testable);
//    re-imported above. `RoomElement` stays used here by the furniture group,
//    which is built in this file (async, SemanticGraph). ──

const SYNC_LABELS: Record<string, string> = {
    'no-template':  'no template',
    'planned-only': 'planned only',
    'partial':      'partial',
    'synced':       'synced',
    'conflict':     'conflict',
    'derived':      'derived',
};

// ── Node type icons ────────────────────────────────────────────────────────
const NODE_ICONS: Record<string, string> = {
    site:     '🏗',
    building: '🏢',
    level:    '🔲',
    unit:     '🏠',
    room:     '🚪',
};

// ── Filter preset definitions ──────────────────────────────────────────────
const FILTER_PRESETS: Array<{ id: string; label: string; match: (node: any) => boolean }> = [
    {
        id: 'conflict',
        label: 'Area conflict',
        match: (n) => n.syncState === 'conflict',
    },
    {
        id: 'no-template',
        label: 'No template',
        match: (n) => n.syncState === 'no-template' || !n.syncState,
    },
    {
        id: 'compliance',
        label: 'Has compliance issue',
        match: (n) => n.syncState === 'conflict' || n.syncState === 'partial',
    },
    {
        id: 'unassigned',
        label: 'Unassigned rooms',
        match: (n) => n._isRoom && !n.unitId,
    },
];

/** L-2006 -- a rejection is rendered to the user, so it must be a readable string. */
function describeError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    try { return JSON.stringify(e); } catch { return String(e); }
}

/** L-2006 -- level names and bus error text reach innerHTML; both can carry markup. */
function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export class HierarchyTreePanel implements HierarchyTreeActionHost {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _expanded = new Set<string>();
    private _selectedId: string | null = null;
    dialogEl: HTMLElement | null = null;

    /* §HIERARCHY-AUTOSETUP-SILENT-PARTIAL (L-2006) — the outcome of the last
       "Generate hierarchy" run, rendered at the top of the panel. Before this
       existed, every failure in the 2 + N command chain was swallowed into a
       `console.warn` the user never sees, and the banner had ALREADY been
       dismissed, so a half-created hierarchy (a site with no building) was
       indistinguishable from a user who dismissed the prompt. */
    private _autoSetupOutcome:
        | { kind: 'running' }
        | { kind: 'ok';     created: number; levels: number }
        | { kind: 'failed'; step: string; detail: string; created: number }
        | null = null;

    // ── Filter state ──────────────────────────────────────────────────────
    private _filterTerm = '';
    private _activePreset: string | null = null;

    // ── Element rows state (Level 6) ──────────────────────────────────────
    // Tracks which rooms have their element list expanded (separate from hierarchy _expanded)
    private _roomExpanded = new Set<string>();
    // Per-room element cache — populated on first expand, invalidated on store events
    // §FIX-ROOM-FACETS-UNDETERMINED — caches the RESULT (refusals included),
    // so a cached room re-renders its ⚠ facet rows too, not just its groups.
    private _elementCache = new Map<string, RoomElementGroupsResult>();
    // Filter integration — opt-in flag (defaults false for performance)
    private _showElementsInFilter = false;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._container = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        this._container.appendChild(this._root);

        this._bindRefreshEvents();
        this._render();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    refresh(): void {
        this._render();
    }

    // ── Rendering ──────────────────────────────────────────────────────────

    private _render(): void {
        this._root.innerHTML = '';

        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        if (!hs) {
            this._root.innerHTML = '<div class="dw-placeholder"><div class="dw-placeholder-icon">⏳</div><div>Loading hierarchy…</div></div>';
            return;
        }

        // §L-2006 — the outcome of the last auto-setup, if there was one. Rendered
        // FIRST so a failure is the top thing in the panel, not a console line.
        if (this._autoSetupOutcome) this._root.appendChild(this._buildAutoSetupOutcome());

        // Auto-setup banner — Phase 11: show only when no hierarchy AND at least 1 BimManager level exists
        const _bannerLevels = window.bimManager?.getLevels?.() ?? []; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const _bannerShown = hs.count() === 0
            && _bannerLevels.length > 0
            && !sessionStorage.getItem('pryzm-hierarchy-setup-dismissed');
        if (_bannerShown) {
            this._root.appendChild(this._buildBanner());
        }

        // Toolbar
        this._root.appendChild(this._buildToolbar());

        // Filter bar
        this._root.appendChild(this._buildFilterBar());

        // Filtered view — flat list when any filter is active
        const isFiltered = this._filterTerm.trim() !== '' || this._activePreset !== null;
        if (isFiltered) {
            const allNodes = this._collectAllNodes();
            const matching = allNodes.filter(n => this._nodeMatchesFilter(n));
            this._root.appendChild(this._buildFilterCounter(matching.length, allNodes.length));
            const scroll = document.createElement('div');
            scroll.className = 'dw-tree-scroll';
            scroll.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
            this._renderFilteredList(matching, scroll);
            this._root.appendChild(scroll);
            // Highlight matching rooms in 3D
            const roomIds = matching.filter(n => n._isRoom).map(n => n.id);
            if (roomIds.length > 0) {
                window.runtime?.events?.emit('pryzm-select-multiple', { ids: roomIds }); // F.events.15
            }
            return;
        }

        // Normal tree view
        const scroll = document.createElement('div');
        scroll.className = 'dw-tree-scroll';
        scroll.style.cssText = 'flex:1;overflow-y:auto;padding:6px 0;';

        const sites: SiteData[] = hs.getSites();

        if (sites.length === 0 && hs.count() === 0) {
            /* §HIERARCHY-EMPTY-STATE-CONTRADICTS-BANNER (L-2005) — this read
               "No hierarchy yet. Click [+ Site] to start." UNCONDITIONALLY,
               including while the auto-setup banner was on screen four rows
               above offering to build the whole thing from the project's own
               levels. The founder's screenshot is exactly that: two different
               calls to action, and the one in larger type points at the SLOWER
               path. The empty state now defers to the banner when the banner is
               showing, and only names [+ Site] when it is the real next step. */
            const empty = document.createElement('div');
            empty.className = 'dw-placeholder';
            empty.style.paddingTop = '32px';
            empty.innerHTML = _bannerShown
                ? '<div class="dw-placeholder-icon">🏗</div><div style="font-size:12px;text-align:center;max-width:230px;line-height:1.6;color:var(--app-text-muted)">No hierarchy yet.<br>Use <strong>Generate hierarchy</strong> above to build one from this project’s levels, or <strong>[+ Site]</strong> to start by hand.</div>'
                : '<div class="dw-placeholder-icon">🏗</div><div style="font-size:12px;text-align:center;max-width:200px;line-height:1.5;color:var(--app-text-muted)">No hierarchy yet.<br>Click <strong>[+ Site]</strong> to start.</div>';
            scroll.appendChild(empty);
        } else {
            for (const site of sites) {
                scroll.appendChild(this._renderSite(site));
            }
        }

        this._root.appendChild(scroll);
    }

    private _renderSite(site: SiteData): HTMLElement {
        const buildings: BuildingData[] = window.hierarchyStore?.getBuildings(site.id) ?? []; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const expanded = this._expanded.has(site.id);
        const wrapper = document.createElement('div');

        const row = this._buildRow({
            id: site.id,
            type: 'site',
            icon: NODE_ICONS.site,
            label: site.name,
            code: site.code,
            syncState: site.syncState,
            depth: 0,
            hasChildren: buildings.length > 0,
            expanded,
        });
        wrapper.appendChild(row);

        if (expanded) {
            for (const building of buildings) {
                wrapper.appendChild(this._renderBuilding(building));
            }
        }

        return wrapper;
    }

    private _renderBuilding(building: BuildingData): HTMLElement {
        const levels: LevelData[] = window.hierarchyStore?.getLevels(building.id) ?? []; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const expanded = this._expanded.has(building.id);
        const wrapper = document.createElement('div');

        const row = this._buildRow({
            id: building.id,
            type: 'building',
            icon: NODE_ICONS.building,
            label: building.name,
            code: building.code,
            syncState: building.syncState,
            depth: 1,
            hasChildren: levels.length > 0,
            expanded,
        });
        wrapper.appendChild(row);

        if (expanded) {
            for (const level of levels) {
                wrapper.appendChild(this._renderLevel(level));
            }
        }

        return wrapper;
    }

    private _renderLevel(level: LevelData): HTMLElement {
        const units: UnitData[] = window.hierarchyStore?.getUnits(level.id) ?? []; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const unassignedRooms = this._getUnassignedRooms(level.id);
        const hasChildren = units.length > 0 || unassignedRooms.length > 0;
        const expanded = this._expanded.has(level.id);
        const wrapper = document.createElement('div');

        const meta: string[] = [];
        if (level.grossFloorArea != null) meta.push(`GFA: ${level.grossFloorArea}m²`);

        const row = this._buildRow({
            id: level.id,
            type: 'level',
            icon: NODE_ICONS.level,
            label: level.name,
            code: level.levelNumber ?? level.code,
            syncState: level.syncState,
            depth: 2,
            hasChildren,
            expanded,
            meta: meta.join('  '),
        });
        wrapper.appendChild(row);

        if (expanded) {
            for (const unit of units) {
                wrapper.appendChild(this._renderUnit(unit));
            }

            if (unassignedRooms.length > 0) {
                const divider = document.createElement('div');
                divider.className = 'dw-tree-divider';
                divider.textContent = `── Unassigned rooms on ${level.name} ──────────`;
                wrapper.appendChild(divider);

                for (const room of unassignedRooms) {
                    wrapper.appendChild(this._renderRoom(room, 3));
                }
            }
        }

        return wrapper;
    }

    private _renderUnit(unit: UnitData): HTMLElement {
        const rooms = this._getRoomsForUnit(unit.id);
        const expanded = this._expanded.has(unit.id);
        const wrapper = document.createElement('div');

        const meta: string[] = [];
        if (unit.grossUnitArea != null) meta.push(`${unit.grossUnitArea}m²`);
        if (rooms.length > 0) meta.push(`RM: ${rooms.length}`);

        const row = this._buildRow({
            id: unit.id,
            type: 'unit',
            icon: NODE_ICONS.unit,
            label: unit.name,
            code: unit.unitNumber ?? unit.code,
            syncState: unit.syncState,
            depth: 3,
            hasChildren: rooms.length > 0,
            expanded,
            meta: meta.join('  '),
        });
        wrapper.appendChild(row);

        if (expanded) {
            for (const room of rooms) {
                wrapper.appendChild(this._renderRoom(room, 4));
            }
        }

        return wrapper;
    }

    // ── Step 1: Lazy room rendering with element count ─────────────────────

    private _renderRoom(room: any, depth: number): HTMLElement {
        const area = room.computed?.area != null ? `${room.computed.area.toFixed(1)}m²` : '';
        const wrapper = document.createElement('div');

        // §FIX-BOUNDING-WALLS-UNDETERMINED — decide FIRST whether this room's
        // bounding-wall relationship is even readable. Everything below (the
        // count badge, the expander, the element groups) is derived through it,
        // so a room whose relationship was never recorded must not present as
        // a room with nothing in it (C78 §1.4).
        const boundingWalls = determineBoundingWalls(room, `hierarchy tree contents of room ${room.id}`);
        const wallsUndetermined = isBoundingWallsUndetermined(boundingWalls);

        // PERFORMANCE GUARD: only count elements (reads array .length only, no store fetch)
        const elementCount = wallsUndetermined ? null : this._countRoomElements(room);
        // An undetermined room is EXPANDABLE — its child is the refusal row.
        // Making it a leaf would hide the refusal behind a disclosure the user
        // has no reason to try. A room with an UNRECORDED slab/column facet is
        // expandable for the same reason: its children include the ⚠ rows.
        const hasElements =
            wallsUndetermined || elementCount!.total > 0 || !elementCount!.exact;
        const expanded = this._roomExpanded.has(room.id);

        // Step 9: element count badge on collapsed room row.
        // §FIX-BOUNDING-WALLS-UNDETERMINED — `· 0 el` on a room nobody measured
        // is a claim the panel is not entitled to make. It says so instead.
        // §FIX-ROOM-FACETS-UNDETERMINED — when a slab/column facet was never
        // recorded the count is a FLOOR, not a total: `≥ N el ⚠`, never a bare
        // number (the ScreenReaderListView "at least N" precedent).
        const elBadge = wallsUndetermined
            ? ' · ⚠ contents undetermined'
            : (hasElements && !expanded
                ? (elementCount!.exact
                    ? ` · ${elementCount!.total} el`
                    : ` · ≥ ${elementCount!.total} el ⚠`)
                : '');

        const row = this._buildRow({
            id: room.id,
            type: 'room',
            icon: NODE_ICONS.room,
            label: room.name ?? room.occupancyType ?? 'Room',
            code: room.code,
            syncState: room.syncState ?? 'no-template',
            depth,
            hasChildren: hasElements,
            expanded,
            meta: area + elBadge,
            isRoom: true,
        });
        wrapper.appendChild(row);

        // LAZY LOAD: only render child elements when this room is expanded
        if (expanded && wallsUndetermined && isBoundingWallsUndetermined(boundingWalls)) {
            // §FIX-BOUNDING-WALLS-UNDETERMINED — the VISIBLE refusal. Not an
            // empty group list: a row that names the C78 §8.1 reason.
            wrapper.appendChild(this._renderUndeterminedBoundingWalls(boundingWalls, depth + 1));
        } else if (expanded && hasElements) {
            const result = this._getElementGroups(room);
            for (const group of result.groups) {
                wrapper.appendChild(this._renderElementGroup(group, depth + 1));
            }
            // §FIX-ROOM-FACETS-UNDETERMINED — the VISIBLE refusals for the
            // slab/column facets, BESIDE the determined groups. An unrecorded
            // facet must not present as an absent group (C78 §5).
            for (const refusal of result.undetermined) {
                wrapper.appendChild(this._renderUndeterminedFacet(refusal, depth + 1));
            }
            // Step 4: furniture via SemanticGraph (async, fire-and-forget)
            this._appendFurnitureGroup(room, wrapper, depth);
        }

        return wrapper;
    }

    /**
     * §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §5 — discovery must be able to
     * refuse) — the row a room shows when its bounding-wall relationship could
     * not be read. It names the typed reason so the user is told WHICH unknown
     * this is, and a screenshot of the panel is enough to diagnose it.
     */
    private _renderUndeterminedBoundingWalls(
        d: Extract<ReturnType<typeof determineBoundingWalls>, { kind: 'undetermined' }>,
        depth: number,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'pryzm-tree-row pryzm-tree-undetermined';
        row.dataset.undeterminedReason = d.reason;
        row.style.cssText =
            `display:flex;align-items:center;gap:6px;padding:4px 8px 4px ${8 + depth * 14}px;` +
            `font-size:11px;color:#b45309;background:rgba(245,158,11,0.08);` +
            `border-left:2px solid #f59e0b;cursor:default;`;
        row.title =
            `${d.scope}\n\nreason: ${d.reason}` + (d.detail ? `\n${d.detail}` : '') +
            `\n\nThis is NOT "the room is empty" — the relationship was never recorded.`;
        row.textContent = `⚠ ${boundingWallsUndeterminedLabel(d)}`;
        return row;
    }

    // ── Step 2: Element count — cheap path (no store object fetch) ──────────

    /** @returns the element count with its EXACTNESS carried, or **null** when
     *  the bounding-wall relationship could not be read (C78 §1.4 — never `0`,
     *  which is a real count this method has no right to assert). */
    private _countRoomElements(room: any): RoomElementCount | null {
        // §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4/§5 · C71 §4.4 · C79 §5.2.0).
        // `room.boundingWallIds ?? []` made "this room contains nothing" and
        // "nobody ever recorded what bounds this room" the same value — the
        // EXACT shape of the defect this panel's own changelog documents at
        // `_appendFurnitureGroup`. The caller branches on the determination
        // and renders a REFUSAL row rather than a silently empty tree.
        // `?? []` is deliberately NOT written here — that would re-collapse the
        // two cases one line after distinguishing them.
        // §FIX-ROOM-FACETS-UNDETERMINED — the slab/column facets and the
        // hosted lookups had the SAME defect one line below the wall fix; the
        // decisions now live in `roomContentsFacets.countRoomElements` (pure,
        // tested), and an unrecorded facet makes the count INEXACT rather than
        // silently smaller.
        const determined = boundingWallIdsOrUnknown(room);
        if (determined === null) return null;

        // Furniture excluded from count — SemanticGraph query is async
        return countRoomElements(
            room,
            determined,
            window.doorStore, // TODO(E.door.S): legacy doorStore — replace with runtime.stores.door
            window.windowStore, // TODO(E.window.S): legacy windowStore — replace with runtime.stores.window
        );
    }

    // ── Step 3: Element group builder — full fetch, cache-backed ───────────

    private _getElementGroups(room: any): RoomElementGroupsResult {
        if (this._elementCache.has(room.id)) {
            return this._elementCache.get(room.id)!;
        }

        // ── Walls ────────────────────────────────────────────────────────
        // §FIX-BOUNDING-WALLS-UNDETERMINED — see `_countRoomElements`. When the
        // relationship is UNDETERMINED this method is not reached: `_renderRoom`
        // renders `_renderUndeterminedBoundingWalls()` instead, so an unknown
        // never masquerades as an empty group list. If one somehow does, this
        // REFUSES (returns no groups) rather than presenting an empty tree as
        // a finding (C78 §1.4).
        // §FIX-ROOM-FACETS-UNDETERMINED — the group building itself moved to
        // the PURE `roomContentsFacets.buildRoomElementGroups`: slab/column
        // facets classify absent-vs-empty and come back as `undetermined`
        // refusals beside the groups; the door/window `getByWallId` dead
        // defaults are gone (the store contract is enforced, not defaulted).
        const determinedWallIds = boundingWallIdsOrUnknown(room);
        if (determinedWallIds === null) return { groups: [], undetermined: [] };

        const result = buildRoomElementGroups(room, determinedWallIds, {
            wallStore: window.wallStore, // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
            slabStore: window.slabStore, // TODO(E.slab.S): legacy slabStore — replace with runtime.stores.slab
            columnStore: window.columnStore, // TODO(E.column.S): legacy columnStore — replace with runtime.stores.column
            doorStore: window.doorStore, // TODO(E.door.S): legacy doorStore — replace with runtime.stores.door
            windowStore: window.windowStore, // TODO(E.window.S): legacy windowStore — replace with runtime.stores.window
            wallLength: (w) => this._wallLength(w),
        });

        this._elementCache.set(room.id, result);
        return result;
    }

    /**
     * §FIX-ROOM-FACETS-UNDETERMINED — the ⚠ row for a slab/column facet whose
     * relationship was never recorded. Same visual language as
     * `_renderUndeterminedBoundingWalls`, so every unknown in this panel reads
     * the same way.
     */
    private _renderUndeterminedFacet(d: RoomFacetRefusal, depth: number): HTMLElement {
        const row = document.createElement('div');
        row.className = 'pryzm-tree-row pryzm-tree-undetermined';
        row.dataset.undeterminedReason = d.reason;
        row.dataset.undeterminedField = d.field;
        row.style.cssText =
            `display:flex;align-items:center;gap:6px;padding:4px 8px 4px ${8 + depth * 14}px;` +
            `font-size:11px;color:#b45309;background:rgba(245,158,11,0.08);` +
            `border-left:2px solid #f59e0b;cursor:default;`;
        row.title =
            `${d.scope}\n\nreason: ${d.reason}\n${d.detail}` +
            `\n\nThis is NOT "the room has none" — the relationship was never recorded.`;
        // §REFUSAL-IDENTITY — rendered through the shared facetRefusalText()
        // so the visible text carries the closed reason token (the refusal's
        // identity) and cannot silently drop it in an inline template.
        row.textContent = facetRefusalText(d);
        return row;
    }

    private _wallLength(wall: any): number {
        if (!wall.baseLine) return 0;
        const [a, b] = wall.baseLine;
        const dx = b.x - a.x;
        const dz = (b.z ?? 0) - (a.z ?? 0);
        return Math.sqrt(dx * dx + dz * dz);
    }

    // ── Step 4: Furniture via SemanticGraph (async, fire-and-forget) ────────

    private async _appendFurnitureGroup(room: any, wrapper: HTMLElement, depth: number): Promise<void> {
        const sg = window.semanticGraphManager; // TODO(D.4): legacy semanticGraphManager — replace with runtime.scene.semantic-graph manager
        const furnitureStore = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!sg || !furnitureStore) return;

        // §FIX-SGM-GLOBAL-TYPE (W2-4) — this line read `sg.getEdgesFromNode?.(room.id) ?? []`.
        // `SemanticGraphManager` has never had a `getEdgesFromNode`; the optional call
        // therefore evaluated to `undefined` on every invocation and the furniture group
        // NEVER rendered — a second instance of the `SpeculativeEngine.getEdges` defect,
        // found by typing `window.semanticGraphManager`. `getTargets(room.id, 'contains')`
        // is the real API for "what does this room contain".
        //
        // Honest caveat: `contains` currently has NO first-party writer (EV-04 §1) — only
        // the IFC importer emits it. So on a natively-authored project this group stays
        // empty for want of DATA, which is a different and now-visible problem from
        // calling a method that does not exist.
        //
        // §GR13-CONTAINS-READER (C71 §4.4 · C78 §1.4) — and that caveat is exactly
        // why the bare read was wrong here: `getTargets(room.id, 'contains')` returned
        // `[]` for "this room is empty" AND for "no writer has ever covered this room",
        // and the early return below rendered NOTHING in both cases. A user reading the
        // hierarchy tree could not tell an empty room from an unanswered one. The typed
        // reader splits them; the refusal gets a VISIBLE row, per the
        // `window.semanticGraphManager` contract in `src/global-window.d.ts`
        // ("REFUSE with a named reason … never return []").
        if (typeof sg.getContainedElements !== 'function') return;
        const contained = sg.getContainedElements(room.id);
        if (!contained.ok) {
            wrapper.appendChild(this._renderElementGroup({
                groupLabel: 'Furniture: cannot determine',
                icon: '❔',
                elements: [{
                    id: `${room.id}:contains-undetermined`,
                    elementType: 'furniture' as const,
                    label: contained.reason,
                    code: '—',
                    meta: undefined,
                }],
            }, depth + 1));
            return;
        }
        const containedIds: readonly string[] = contained.containedIds;
        if (containedIds.length === 0) return;

        const furnitureElements: RoomElement[] = containedIds
            .map((targetId: string) => furnitureStore.get?.(targetId) ?? furnitureStore.getById?.(targetId))
            .filter(Boolean)
            .map((f: any) => ({
                id: f.id,
                elementType: 'furniture' as const,
                label: f.furnitureType ?? f.name ?? 'Furniture',
                code: f.id.slice(0, 8),
                meta: undefined,
            }));

        if (furnitureElements.length > 0) {
            const group: RoomElementGroup = {
                groupLabel: `Furniture (${furnitureElements.length})`,
                icon: '🪑',
                elements: furnitureElements,
            };
            wrapper.appendChild(this._renderElementGroup(group, depth + 1));
        }
    }

    // ── Step 5: Element group renderer ─────────────────────────────────────

    private _renderElementGroup(group: RoomElementGroup, depth: number): HTMLElement {
        const wrapper = document.createElement('div');

        const header = document.createElement('div');
        header.style.cssText = `
            display:flex;align-items:center;gap:5px;
            padding:2px 0 2px ${10 + depth * 16}px;
            font-size:10px;font-weight:700;letter-spacing:.4px;
            color:var(--app-text-muted);
            text-transform:uppercase;
            user-select:none;
        `;
        header.innerHTML = `<span>${group.icon}</span><span>${group.groupLabel}</span>`;
        wrapper.appendChild(header);

        for (const el of group.elements) {
            wrapper.appendChild(this._renderElementRow(el, depth));
        }

        return wrapper;
    }

    // ── Step 6: Element row renderer ───────────────────────────────────────

    private _renderElementRow(el: RoomElement, depth: number): HTMLElement {
        const row = document.createElement('div');
        row.className = 'dw-tree-row' + (this._selectedId === el.id ? ' dw-tree-row--selected' : '');
        row.dataset.nodeId = el.id;
        row.style.cssText = `
            display:flex;align-items:center;
            padding-left:${10 + depth * 16}px;
            cursor:pointer;
        `;

        const spacer = document.createElement('span');
        spacer.style.cssText = 'width:14px;display:inline-block;flex-shrink:0;opacity:0.25;';
        spacer.textContent = '·';

        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;';
        label.textContent = el.label;

        if (el.code) {
            const codeSpan = document.createElement('span');
            codeSpan.style.cssText = 'color:var(--app-text-muted);font-size:10px;margin-left:4px;';
            codeSpan.textContent = `(${el.code})`;
            label.appendChild(codeSpan);
        }

        row.appendChild(spacer);
        row.appendChild(label);

        if (el.meta) {
            const meta = document.createElement('span');
            meta.style.cssText = 'font-size:11px;color:var(--app-text-muted);margin-left:6px;flex-shrink:0;white-space:nowrap;';
            meta.textContent = el.meta;
            row.appendChild(meta);
        }

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            this._selectedId = el.id;
            this._render();

            this.runtime?.events?.emit('pryzm-element-selected', { elementId: el.id, elementType: el.elementType, source: 'tree' });
            // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
            window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: el.id, nodeType: el.elementType });
        });

        return row;
    }

    // ── Row builder ────────────────────────────────────────────────────────

    private _buildRow(opts: {
        id: string;
        type: string;
        icon: string;
        label: string;
        code?: string;
        syncState: string;
        depth: number;
        hasChildren: boolean;
        expanded: boolean;
        meta?: string;
        isRoom?: boolean;
    }): HTMLElement {
        const row = document.createElement('div');
        row.className = 'dw-tree-row' + (this._selectedId === opts.id ? ' dw-tree-row--selected' : '');
        row.dataset.nodeId = opts.id;
        row.style.paddingLeft = `${10 + opts.depth * 16}px`;

        // Toggle arrow
        const arrow = document.createElement('span');
        arrow.className = 'dw-tree-arrow';
        arrow.textContent = opts.hasChildren ? (opts.expanded ? '▼' : '▶') : '  ';
        arrow.style.cssText = 'width:14px;display:inline-block;cursor:pointer;font-size:9px;opacity:0.6;flex-shrink:0;';

        if (opts.hasChildren) {
            // Step 7: Room nodes toggle _roomExpanded; all others toggle _expanded
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                if (opts.type === 'room') {
                    if (this._roomExpanded.has(opts.id)) {
                        this._roomExpanded.delete(opts.id);
                    } else {
                        this._roomExpanded.add(opts.id);
                    }
                } else {
                    if (this._expanded.has(opts.id)) {
                        this._expanded.delete(opts.id);
                    } else {
                        this._expanded.add(opts.id);
                    }
                }
                this._render();
            });
        }

        // Icon + label
        const icon = document.createElement('span');
        icon.textContent = opts.icon;
        icon.style.cssText = 'margin-right:5px;font-size:12px;flex-shrink:0;';

        const labelEl = document.createElement('span');
        labelEl.className = 'dw-tree-label';
        labelEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = opts.label;
        labelEl.appendChild(nameSpan);

        if (opts.code) {
            const codeSpan = document.createElement('span');
            codeSpan.textContent = ` (${opts.code})`;
            codeSpan.style.cssText = 'color:var(--app-text-muted);font-size:11px;';
            labelEl.appendChild(codeSpan);
        }

        // Meta text
        if (opts.meta) {
            const metaEl = document.createElement('span');
            metaEl.textContent = opts.meta;
            metaEl.style.cssText = 'font-size:11px;color:var(--app-text-muted);margin-left:6px;flex-shrink:0;white-space:nowrap;';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.appendChild(arrow);
            row.appendChild(icon);
            row.appendChild(labelEl);
            row.appendChild(metaEl);
        } else {
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.appendChild(arrow);
            row.appendChild(icon);
            row.appendChild(labelEl);
        }

        // Sync state dot — click opens SyncStateDetailDrawer
        const dot = document.createElement('span');
        dot.className = 'dw-sync-dot';
        const colour = syncStateColour(opts.syncState);
        dot.title = `${SYNC_LABELS[opts.syncState] ?? opts.syncState} — click to inspect`;
        dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${colour};flex-shrink:0;margin-left:6px;cursor:pointer;transition:transform 0.12s,box-shadow 0.12s;`;
        dot.addEventListener('mouseenter', () => {
            dot.style.transform = 'scale(1.35)';
            dot.style.boxShadow = `0 0 0 3px ${colour}44`;
        });
        dot.addEventListener('mouseleave', () => {
            dot.style.transform = '';
            dot.style.boxShadow = '';
        });
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            syncStateDetailDrawer.open(opts.id, opts.type, dot.getBoundingClientRect());
        });
        row.appendChild(dot);

        // Row click → select + dispatch
        row.addEventListener('click', () => {
            this._selectedId = opts.id;
            this._render();

            // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
            window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: opts.id, nodeType: opts.type });

            // Notify DataSheetPanel
            window.runtime?.events?.emit('pryzm-hierarchy-node-selected', { nodeId: opts.id, nodeType: opts.type }); // F.events.15
        });

        return row;
    }

    // ── Toolbar ────────────────────────────────────────────────────────────

    private _buildToolbar(): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'dw-toolbar';

        const buttons: Array<{ label: string; title: string; action: () => void }> = [
            { label: '+ Site', title: 'Add a new site', action: () => this._addSite() },
            { label: '+ Building', title: 'Add a new building', action: () => this._addBuilding() },
            { label: '+ Level', title: 'Add a new level', action: () => this._addLevel() },
            { label: '+ Unit', title: 'Add a new unit', action: () => this._addUnit() },
        ];

        for (const b of buttons) {
            const btn = document.createElement('button');
            btn.className = 'dw-toolbar-btn';
            btn.textContent = b.label;
            btn.title = b.title;
            btn.addEventListener('click', b.action);
            toolbar.appendChild(btn);
        }

        // Refresh button
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'dw-toolbar-btn';
        refreshBtn.title = 'Refresh tree';
        refreshBtn.textContent = '↻';
        refreshBtn.style.marginLeft = 'auto';
        refreshBtn.addEventListener('click', () => this._render());
        toolbar.appendChild(refreshBtn);

        return toolbar;
    }

    // ── Filter bar ─────────────────────────────────────────────────────────

    private _buildFilterBar(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'dw-filter-bar';

        // Input row
        const row = document.createElement('div');
        row.className = 'dw-filter-row';

        const input = document.createElement('input');
        input.className = 'dw-filter-input';
        input.type = 'text';
        input.placeholder = 'Filter by name, code, type…';
        input.value = this._filterTerm;
        input.addEventListener('input', () => {
            this._filterTerm = input.value;
            this._activePreset = null;
            this._render();
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'dw-filter-clear';
        clearBtn.textContent = 'Clear';
        clearBtn.title = 'Clear all filters';
        clearBtn.addEventListener('click', () => {
            this._filterTerm = '';
            this._activePreset = null;
            this._render();
        });

        row.appendChild(input);
        row.appendChild(clearBtn);
        bar.appendChild(row);

        // Preset pills
        const pills = document.createElement('div');
        pills.className = 'dw-filter-pills';

        for (const preset of FILTER_PRESETS) {
            const pill = document.createElement('button');
            pill.className = 'dw-filter-pill' + (this._activePreset === preset.id ? ' dw-filter-pill--active' : '');
            pill.textContent = preset.label;
            pill.title = `Filter: ${preset.label}`;
            pill.addEventListener('click', () => {
                if (this._activePreset === preset.id) {
                    this._activePreset = null;
                } else {
                    this._activePreset = preset.id;
                    this._filterTerm = '';
                }
                this._render();
            });
            pills.appendChild(pill);
        }

        bar.appendChild(pills);

        // Step 10: "Include elements" toggle for filter (opt-in, defaults off)
        const elToggleRow = document.createElement('div');
        elToggleRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 4px 2px 4px;';

        const elCheckbox = document.createElement('input');
        elCheckbox.type = 'checkbox';
        elCheckbox.id = 'dw-filter-include-elements';
        elCheckbox.checked = this._showElementsInFilter;
        elCheckbox.style.cursor = 'pointer';
        elCheckbox.addEventListener('change', () => {
            this._showElementsInFilter = elCheckbox.checked;
            this._render();
        });

        const elLabel = document.createElement('label');
        elLabel.htmlFor = 'dw-filter-include-elements';
        elLabel.textContent = 'Include elements in filter';
        elLabel.style.cssText = 'font-size:10px;color:var(--app-text-muted);cursor:pointer;user-select:none;';

        elToggleRow.appendChild(elCheckbox);
        elToggleRow.appendChild(elLabel);
        bar.appendChild(elToggleRow);

        return bar;
    }

    private _buildFilterCounter(matching: number, total: number): HTMLElement {
        const el = document.createElement('div');
        el.className = 'dw-filter-counter';
        el.textContent = `Showing ${matching} of ${total} nodes`;
        return el;
    }

    /** Collect every node (hierarchy + rooms + optionally elements) into a flat array for filtering. */
    private _collectAllNodes(): any[] {
        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const nodes: any[] = [];

        if (hs) {
            const sites: SiteData[] = hs.getSites();
            for (const s of sites) {
                nodes.push({ ...s, _type: 'site', _isRoom: false });
                const buildings: BuildingData[] = hs.getBuildings(s.id) ?? [];
                for (const b of buildings) {
                    nodes.push({ ...b, _type: 'building', _isRoom: false });
                    const levels: LevelData[] = hs.getLevels(b.id) ?? [];
                    for (const l of levels) {
                        nodes.push({ ...l, _type: 'level', _isRoom: false });
                        const units: UnitData[] = hs.getUnits(l.id) ?? [];
                        for (const u of units) {
                            nodes.push({ ...u, _type: 'unit', _isRoom: false });
                        }
                    }
                }
            }
        }

        const rooms: any[] = rs ? (rs.getAll() ?? []) : [];
        for (const r of rooms) {
            nodes.push({ ...r, _type: 'room', _isRoom: true,
                syncState: r.syncState ?? 'no-template' });
        }

        // Step 10: optionally include element-level nodes in filter
        // §FIX-ROOM-FACETS-UNDETERMINED — `.groups` only: an undetermined
        // facet has no element nodes to filter, and it is not silently zero —
        // the tree renders its ⚠ row wherever the room is shown.
        if (this._showElementsInFilter) {
            for (const r of rooms) {
                const groups = this._getElementGroups(r).groups;
                for (const group of groups) {
                    for (const el of group.elements) {
                        nodes.push({
                            ...el,
                            _type: el.elementType,
                            _isRoom: false,
                            name: el.label,
                            syncState: 'no-template',
                        });
                    }
                }
            }
        }

        return nodes;
    }

    /** Returns true when a node passes the current text + preset filter. */
    private _nodeMatchesFilter(node: any): boolean {
        if (this._activePreset !== null) {
            const preset = FILTER_PRESETS.find(p => p.id === this._activePreset);
            return preset ? preset.match(node) : false;
        }

        const term = this._filterTerm.trim().toLowerCase();
        if (!term) return true;
        const haystack = [
            node.name ?? '',
            node.code ?? '',
            node.occupancyType ?? '',
            node._type ?? '',
        ].join(' ').toLowerCase();
        return haystack.includes(term);
    }

    /** Renders a flat filtered list into the given scroll container. */
    private _renderFilteredList(nodes: any[], container: HTMLElement): void {
        if (nodes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dw-filter-empty';
            empty.textContent = 'No nodes match the current filter.';
            container.appendChild(empty);
            return;
        }

        for (const node of nodes) {
            const item = document.createElement('div');
            const isSelected = this._selectedId === node.id;
            item.className = 'dw-filter-item' + (isSelected ? ' dw-filter-item--selected' : '');

            const typeIcon = NODE_ICONS[node._type as keyof typeof NODE_ICONS] ?? '▪';
            const icon = document.createElement('span');
            icon.className = 'dw-filter-item-icon';
            icon.textContent = typeIcon;

            const label = document.createElement('span');
            label.className = 'dw-filter-item-label';
            label.textContent = node.name ?? node.occupancyType ?? node.id;
            if (node.code) {
                const codeSpan = document.createElement('span');
                codeSpan.style.cssText = 'color:var(--app-text-muted);font-size:10px;margin-left:4px;';
                codeSpan.textContent = `(${node.code})`;
                label.appendChild(codeSpan);
            }

            const meta = document.createElement('span');
            meta.className = 'dw-filter-item-meta';
            if (node._type === 'room' && node.computed?.area != null) {
                meta.textContent = `${node.computed.area.toFixed(1)} m²`;
            } else if (node._type === 'level' && node.grossFloorArea != null) {
                meta.textContent = `GFA ${node.grossFloorArea} m²`;
            }

            const dot = document.createElement('span');
            dot.className = 'dw-filter-item-dot';
            const state = node.syncState ?? 'no-template';
            dot.style.background = syncStateColour(state);
            dot.title = SYNC_LABELS[state] ?? state;

            item.appendChild(icon);
            item.appendChild(label);
            item.appendChild(meta);
            item.appendChild(dot);

            item.addEventListener('click', () => {
                this._selectedId = node.id;
                this._render();
                // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
                window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: node.id, nodeType: node._type });
                window.runtime?.events?.emit('pryzm-hierarchy-node-selected', { nodeId: node.id, nodeType: node._type }); // F.events.15
            });

            container.appendChild(item);
        }
    }

    // ── Auto-setup banner ──────────────────────────────────────────────────

    private _buildBanner(): HTMLElement {
        const bm = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const levels = bm?.getLevels() ?? [];
        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const roomCount = roomStore ? (Array.isArray(roomStore.getAll?.()) ? roomStore.getAll().length : 0) : 0;

        const banner = document.createElement('div');
        banner.className = 'dw-setup-banner';
        banner.innerHTML = `
            <div style="font-weight:700;font-size:12px;margin-bottom:4px;">🏗 Auto-setup hierarchy</div>
            <div style="font-size:11px;line-height:1.5;margin-bottom:8px;">
                Your project has <strong>${levels.length}</strong> floor level${levels.length !== 1 ? 's' : ''}
                and <strong>${roomCount}</strong> room${roomCount !== 1 ? 's' : ''}.
                Create a default site and building structure automatically?
            </div>
            <div style="display:flex;gap:6px;">
                <button class="dw-toolbar-btn" id="dw-auto-setup-btn" style="flex:1;">Generate hierarchy</button>
                <button class="dw-toolbar-btn" id="dw-dismiss-btn">✕</button>
            </div>
        `;

        const setupBtn = banner.querySelector('#dw-auto-setup-btn') as HTMLButtonElement;
        const dismissBtn = banner.querySelector('#dw-dismiss-btn') as HTMLButtonElement;

        setupBtn.addEventListener('click', () => {
            /* §HIERARCHY-AUTOSETUP-SILENT-PARTIAL (L-2006) — the dismissal used to
               be written HERE, synchronously, before a single command had
               resolved. So the banner vanished, the panel re-rendered empty, and
               if any step then failed the user was left with the empty state, no
               banner, no error and a console.warn they never saw. The dismissal
               now happens on SUCCESS, inside _runAutoSetup. */
            setupBtn.disabled = true;
            setupBtn.textContent = 'Generating…';
            void this._runAutoSetup(levels);
        });

        dismissBtn.addEventListener('click', () => {
            sessionStorage.setItem('pryzm-hierarchy-setup-dismissed', '1');
            this._render();
        });

        return banner;
    }

    // Auto-setup --------------------------------------------------------------

    /**
     * Build a default site -> building -> level hierarchy from the project's own
     * BIM levels.
     *
     * SECTION HIERARCHY-AUTOSETUP-SILENT-PARTIAL (L-2006). This was previously a
     * chain of `.then()`s in which EVERY step caught its own rejection into a
     * `console.warn` and continued. The consequences, all reachable:
     *   - site created, building failed -> a site with no building, no message;
     *   - building created, 3 of 7 levels failed -> a partial hierarchy that
     *     looks deliberate;
     *   - `runtime.bus` absent -> one console.warn and a silent no-op button.
     * It is now awaited end-to-end, stops at the first failure, and reports the
     * outcome INTO THE PANEL either way.
     *
     * UNDO GRANULARITY, stated rather than implied: each node is a separate undo
     * entry, so undoing a 7-level generation is 9 steps. Collapsing it into one
     * CompositeCommand needs `commandManager.beginGenerationBatch()`, whose only
     * precedent reaches it through a window cast; that is deliberately NOT done
     * here and is logged as L-2007 instead of being smuggled in.
     */
    private async _runAutoSetup(levels: any[]): Promise<void> {
        const bus = (this.runtime?.bus as any);
        if (!bus || typeof bus.executeCommand !== 'function') {
            this._autoSetupOutcome = {
                kind: 'failed',
                step: 'command bus',
                detail: 'The command bus is not available, so nothing could be created. Reload the project and try again.',
                created: 0,
            };
            this._render();
            return;
        }

        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore
        if (!hs) {
            this._autoSetupOutcome = {
                kind: 'failed',
                step: 'hierarchy store',
                detail: 'The hierarchy store is not available, so nothing could be created.',
                created: 0,
            };
            this._render();
            return;
        }

        this._autoSetupOutcome = { kind: 'running' };
        let created = 0;

        const siteId = crypto.randomUUID();
        // Phase B (S78-WIRE) -- projectName via runtime.projectContext when available.
        const siteName = this.runtime?.projectContext.projectName
            ?? (globalThis as { platformShell?: { currentProjectName?: string } }).platformShell?.currentProjectName
            ?? 'Site A';

        try {
            await bus.executeCommand('hierarchy.createSite', { id: siteId, name: siteName });
            created++;
        } catch (e) {
            this._autoSetupOutcome = { kind: 'failed', step: `site "${siteName}"`, detail: describeError(e), created };
            this._render();
            return;
        }

        const buildingId = crypto.randomUUID();
        try {
            await bus.executeCommand('hierarchy.createBuilding', { id: buildingId, siteId, name: 'Building 1' });
            created++;
        } catch (e) {
            this._autoSetupOutcome = { kind: 'failed', step: 'building', detail: describeError(e), created };
            this._render();
            return;
        }

        // Levels are created SEQUENTIALLY rather than with Promise.all: the
        // previous parallel map made "which level failed" unanswerable, and the
        // answer is the only useful part of the failure.
        let levelsCreated = 0;
        for (const level of levels) {
            const levelId = crypto.randomUUID();
            const levelName = level.name ?? `Level ${level.id}`;
            try {
                await bus.executeCommand('hierarchy.createLevel', {
                    id: levelId,
                    buildingId,
                    bimLevelId: level.id,
                    name: levelName,
                    levelNumber: level.elevation != null ? String(Math.round(level.elevation)) : undefined,
                });
                created++;
                levelsCreated++;
            } catch (e) {
                this._autoSetupOutcome = { kind: 'failed', step: `level "${levelName}"`, detail: describeError(e), created };
                this._render();
                return;
            }
        }

        // Only NOW is the prompt answered -- dismissing it before this point is
        // what made a partial failure look like a dismissal.
        sessionStorage.setItem('pryzm-hierarchy-setup-dismissed', '1');
        this._autoSetupOutcome = { kind: 'ok', created, levels: levelsCreated };
        this._render();
    }

    /** The result strip for the last auto-setup run -- success or failure, in the panel. */
    private _buildAutoSetupOutcome(): HTMLElement {
        const o = this._autoSetupOutcome!;
        const el = document.createElement('div');
        el.className = 'dw-setup-banner';

        if (o.kind === 'running') {
            el.innerHTML = '<div style="font-size:11px;line-height:1.5;">Generating hierarchy&hellip;</div>';
            return el;
        }

        if (o.kind === 'ok') {
            el.innerHTML = `
                <div style="font-weight:700;font-size:12px;margin-bottom:4px;">&check; Hierarchy created</div>
                <div style="font-size:11px;line-height:1.5;margin-bottom:8px;">
                    ${o.created} node${o.created === 1 ? '' : 's'}: 1 site, 1 building and
                    ${o.levels} level${o.levels === 1 ? '' : 's'} mapped to this project's BIM levels.
                    Each node is its own undo step, so undoing this is ${o.created} presses.
                </div>
                <div style="display:flex;gap:6px;"><button class="dw-toolbar-btn" id="dw-outcome-dismiss">Dismiss</button></div>`;
        } else {
            el.innerHTML = `
                <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:#B3261E;">Hierarchy generation stopped</div>
                <div style="font-size:11px;line-height:1.55;margin-bottom:6px;">
                    It failed while creating the <strong>${escapeHtml(o.step)}</strong>.
                    ${o.created} node${o.created === 1 ? ' was' : 's were'} created before that and ${o.created === 1 ? 'is' : 'are'} still here &mdash;
                    the hierarchy is <strong>incomplete</strong>, not empty. Undo them, or finish by hand with [+ Site] / [+ Building] / [+ Level].
                </div>
                <div style="font-size:10px;line-height:1.5;color:var(--app-text-muted);margin-bottom:8px;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(o.detail)}</div>
                <div style="display:flex;gap:6px;"><button class="dw-toolbar-btn" id="dw-outcome-dismiss">Dismiss</button></div>`;
        }

        el.querySelector('#dw-outcome-dismiss')?.addEventListener('click', () => {
            this._autoSetupOutcome = null;
            this._render();
        });
        return el;
    }

    // ── Add / dialog actions (delegated to HierarchyTreeAddActions) ─────────

    expandAndRefresh(nodeId: string): void { this._expanded.add(nodeId); this._render(); }

    private _addSite(): void { addSite(this); }
    private _addBuilding(): void { addBuilding(this); }
    private _addLevel(): void { addLevel(this); }
    private _addUnit(): void { addUnit(this); }
    private _getRoomsForUnit(unitId: string): any[] { return getRoomsForUnit(unitId); }
    private _getUnassignedRooms(bimLevelId: string): any[] { return getUnassignedRooms(bimLevelId); }

    // ── Event binding ──────────────────────────────────────────────────────

    private _bindRefreshEvents(): void {
        window.addEventListener('pryzm-sync-state-changed', () => this._render());
        window.addEventListener('pryzm-room-sync-state-changed', () => this._render());
        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            setTimeout(() => {
                this._expanded.clear();
                this._selectedId = null;
                // Step 8: full reset of element state on project load
                this._elementCache.clear();
                this._roomExpanded.clear();
                this._render();
            }, 100);
        });

        // Step 8: invalidate element cache on any element store mutation
        const elementMutationEvents = [
            'bim-wall-updated', 'bim-wall-added', 'bim-wall-removed',
            'bim-door-added', 'bim-door-removed', 'bim-door-updated',
            'bim-window-added', 'bim-window-removed', 'bim-window-updated',
            'bim-slab-updated', 'bim-slab-added', 'bim-slab-removed',
            'bim-column-added', 'bim-column-removed', 'bim-column-updated',
            'bim-furniture-added', 'bim-furniture-updated', 'bim-furniture-removed',
        ];
        for (const evt of elementMutationEvents) {
            window.addEventListener(evt, () => {
                this._elementCache.clear();
                this._render();
            });
        }

        // Bidirectional: element selected in 3D canvas or other panel → scroll tree to node.
        // Guard: skip if source is 'tree' (this panel originated the event) to avoid a
        // self-loop (click → dispatch → handler → _render → click …).
        this.runtime?.events?.on('pryzm-element-selected', (detail) => {
            if (detail.source === 'tree') return;
            const nodeId = detail.elementId;
            if (nodeId) {
                this._selectedId = nodeId;
                const row = this._root.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null;
                if (row) {
                    // Update selection highlight without a full re-render.
                    this._root.querySelectorAll('.dw-tree-row--selected')
                        .forEach(el => el.classList.remove('dw-tree-row--selected'));
                    row.classList.add('dw-tree-row--selected');
                    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    // Node not visible — expand tree and re-render so it becomes visible.
                    this._render();
                    setTimeout(() => {
                        const rendered = this._root.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null;
                        if (rendered) rendered.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 50);
                }
            }
        });
    }
}
