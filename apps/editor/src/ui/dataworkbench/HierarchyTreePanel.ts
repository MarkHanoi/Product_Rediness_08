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
import { syncStateDetailDrawer } from './SyncStateDetailDrawer';
import {
    addSite, addBuilding, addLevel, addUnit,
    getRoomsForUnit, getUnassignedRooms,
    type HierarchyTreeActionHost,
} from './HierarchyTreeAddActions';

// ── Element row types ──────────────────────────────────────────────────────

interface RoomElement {
    id: string;
    elementType: 'wall' | 'door' | 'window' | 'slab' | 'column' | 'furniture';
    label: string;
    code?: string;
    meta?: string;       // e.g. "4.2 m", "12.1 m²"
}

interface RoomElementGroup {
    groupLabel: string;  // e.g. "Walls (4)"
    icon: string;
    elements: RoomElement[];
}

// ── Sync state → colour mapping (from Phase 7 spec) ───────────────────────
const SYNC_COLOURS: Record<string, string> = {
    'no-template':  '#9ca3af',
    'planned-only': '#d1d5db',
    'partial':      '#3B8BD4',
    'synced':       '#1D9E75',
    'conflict':     '#E24B4A',
    'derived':      '#EF9F27',
};

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

export class HierarchyTreePanel implements HierarchyTreeActionHost {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _expanded = new Set<string>();
    private _selectedId: string | null = null;
    dialogEl: HTMLElement | null = null;

    // ── Filter state ──────────────────────────────────────────────────────
    private _filterTerm = '';
    private _activePreset: string | null = null;

    // ── Element rows state (Level 6) ──────────────────────────────────────
    // Tracks which rooms have their element list expanded (separate from hierarchy _expanded)
    private _roomExpanded = new Set<string>();
    // Per-room element cache — populated on first expand, invalidated on store events
    private _elementCache = new Map<string, RoomElementGroup[]>();
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

        // Auto-setup banner — Phase 11: show only when no hierarchy AND at least 1 BimManager level exists
        const _bannerLevels = window.bimManager?.getLevels?.() ?? []; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        if (hs.count() === 0 && _bannerLevels.length > 0 && !sessionStorage.getItem('pryzm-hierarchy-setup-dismissed')) {
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
            const empty = document.createElement('div');
            empty.className = 'dw-placeholder';
            empty.style.paddingTop = '32px';
            empty.innerHTML = '<div class="dw-placeholder-icon">🏗</div><div style="font-size:12px;text-align:center;max-width:200px;line-height:1.5;color:var(--app-text-muted,#7a8aaa)">No hierarchy yet.<br>Click <strong>[+ Site]</strong> to start.</div>';
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

        // PERFORMANCE GUARD: only count elements (reads array .length only, no store fetch)
        const elementCount = this._countRoomElements(room);
        const hasElements = elementCount > 0;
        const expanded = this._roomExpanded.has(room.id);

        // Step 9: element count badge on collapsed room row
        const elBadge = hasElements && !expanded ? ` · ${elementCount} el` : '';

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
        if (expanded && hasElements) {
            const groups = this._getElementGroups(room);
            for (const group of groups) {
                wrapper.appendChild(this._renderElementGroup(group, depth + 1));
            }
            // Step 4: furniture via SemanticGraph (async, fire-and-forget)
            this._appendFurnitureGroup(room, wrapper, depth);
        }

        return wrapper;
    }

    // ── Step 2: Element count — cheap path (no store object fetch) ──────────

    private _countRoomElements(room: any): number {
        const wallIds: string[] = room.boundingWallIds ?? [];
        const slabIds: string[] = room.boundingSlabIds ?? [];
        const colIds: string[]  = room.boundingColumnIds ?? [];

        const doorStore   = window.doorStore; // TODO(E.door.S): legacy doorStore — replace with runtime.stores.door
        const windowStore = window.windowStore; // TODO(E.window.S): legacy windowStore — replace with runtime.stores.window

        let doorCount   = 0;
        let windowCount = 0;

        if (doorStore && wallIds.length > 0) {
            for (const wid of wallIds) {
                doorCount += (doorStore.getByWallId(wid)?.length ?? 0);
            }
        }
        if (windowStore && wallIds.length > 0) {
            for (const wid of wallIds) {
                windowCount += (windowStore.getByWallId(wid)?.length ?? 0);
            }
        }

        // Furniture excluded from count — SemanticGraph query is async
        return wallIds.length + slabIds.length + colIds.length + doorCount + windowCount;
    }

    // ── Step 3: Element group builder — full fetch, cache-backed ───────────

    private _getElementGroups(room: any): RoomElementGroup[] {
        if (this._elementCache.has(room.id)) {
            return this._elementCache.get(room.id)!;
        }

        const wallStore   = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
        const slabStore   = window.slabStore; // TODO(E.slab.S): legacy slabStore — replace with runtime.stores.slab
        const columnStore = window.columnStore; // TODO(E.column.S): legacy columnStore — replace with runtime.stores.column
        const doorStore   = window.doorStore; // TODO(E.door.S): legacy doorStore — replace with runtime.stores.door
        const windowStore = window.windowStore; // TODO(E.window.S): legacy windowStore — replace with runtime.stores.window

        const groups: RoomElementGroup[] = [];

        // ── Walls ────────────────────────────────────────────────────────
        const wallIds: string[] = room.boundingWallIds ?? [];
        if (wallStore && wallIds.length > 0) {
            const walls: RoomElement[] = wallIds
                .map((id: string) => wallStore.getById(id))
                .filter(Boolean)
                .map((w: any) => ({
                    id: w.id,
                    elementType: 'wall' as const,
                    label: w.name ?? w.metadata?.name ?? 'Wall',
                    code: w.ifcData?.globalId?.slice(0, 8),
                    meta: w.baseLine
                        ? `${this._wallLength(w).toFixed(1)} m`
                        : undefined,
                }));
            if (walls.length > 0) {
                groups.push({ groupLabel: `Walls (${walls.length})`, icon: '🧱', elements: walls });
            }
        }

        // ── Doors (via bounding walls) ────────────────────────────────────
        if (doorStore && wallIds.length > 0) {
            const doors: RoomElement[] = wallIds
                .flatMap((wid: string) => doorStore.getByWallId(wid) ?? [])
                .map((d: any) => ({
                    id: d.id,
                    elementType: 'door' as const,
                    label: d.doorType ?? 'Door',
                    code: d.systemTypeId?.slice(0, 8),
                    meta: d.width != null ? `${d.width.toFixed(2)} m` : undefined,
                }));
            if (doors.length > 0) {
                groups.push({ groupLabel: `Doors (${doors.length})`, icon: '🚪', elements: doors });
            }
        }

        // ── Windows (via bounding walls) ──────────────────────────────────
        if (windowStore && wallIds.length > 0) {
            const windows: RoomElement[] = wallIds
                .flatMap((wid: string) => windowStore.getByWallId(wid) ?? [])
                .map((win: any) => ({
                    id: win.id,
                    elementType: 'window' as const,
                    label: win.windowType ?? 'Window',
                    code: win.systemTypeId?.slice(0, 8),
                    meta: win.width != null ? `${win.width.toFixed(2)} m` : undefined,
                }));
            if (windows.length > 0) {
                groups.push({ groupLabel: `Windows (${windows.length})`, icon: '🪟', elements: windows });
            }
        }

        // ── Slabs ─────────────────────────────────────────────────────────
        const slabIds: string[] = room.boundingSlabIds ?? [];
        if (slabStore && slabIds.length > 0) {
            const slabs: RoomElement[] = slabIds
                .map((id: string) => slabStore.getById(id))
                .filter(Boolean)
                .map((s: any) => ({
                    id: s.id,
                    elementType: 'slab' as const,
                    label: s.name ?? s.slabType ?? 'Slab',
                    code: s.ifcData?.globalId?.slice(0, 8),
                    meta: s.area != null ? `${s.area.toFixed(1)} m²` : undefined,
                }));
            if (slabs.length > 0) {
                groups.push({ groupLabel: `Slabs (${slabs.length})`, icon: '⬜', elements: slabs });
            }
        }

        // ── Columns ───────────────────────────────────────────────────────
        const colIds: string[] = room.boundingColumnIds ?? [];
        if (columnStore && colIds.length > 0) {
            const columns: RoomElement[] = colIds
                .map((id: string) => columnStore.getById(id))
                .filter(Boolean)
                .map((c: any) => ({
                    id: c.id,
                    elementType: 'column' as const,
                    label: c.name ?? c.profileType ?? 'Column',
                    code: c.ifcData?.globalId?.slice(0, 8),
                    meta: c.height != null ? `h: ${c.height.toFixed(2)} m` : undefined,
                }));
            if (columns.length > 0) {
                groups.push({ groupLabel: `Columns (${columns.length})`, icon: '▐', elements: columns });
            }
        }

        this._elementCache.set(room.id, groups);
        return groups;
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

        const edges: any[] = sg.getEdgesFromNode?.(room.id) ?? [];
        const furnitureEdges = edges.filter((e: any) => e.type === 'contains');
        if (furnitureEdges.length === 0) return;

        const furnitureElements: RoomElement[] = furnitureEdges
            .map((e: any) => furnitureStore.get?.(e.targetId) ?? furnitureStore.getById?.(e.targetId))
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
            color:var(--app-text-muted,#7a8aaa);
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
            codeSpan.style.cssText = 'color:var(--app-text-muted,#7a8aaa);font-size:10px;margin-left:4px;';
            codeSpan.textContent = `(${el.code})`;
            label.appendChild(codeSpan);
        }

        row.appendChild(spacer);
        row.appendChild(label);

        if (el.meta) {
            const meta = document.createElement('span');
            meta.style.cssText = 'font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-left:6px;flex-shrink:0;white-space:nowrap;';
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
            codeSpan.style.cssText = 'color:var(--app-text-muted,#7a8aaa);font-size:11px;';
            labelEl.appendChild(codeSpan);
        }

        // Meta text
        if (opts.meta) {
            const metaEl = document.createElement('span');
            metaEl.textContent = opts.meta;
            metaEl.style.cssText = 'font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-left:6px;flex-shrink:0;white-space:nowrap;';
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
        const colour = SYNC_COLOURS[opts.syncState] ?? '#9ca3af';
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
        elLabel.style.cssText = 'font-size:10px;color:var(--app-text-muted,#7a8aaa);cursor:pointer;user-select:none;';

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
        if (this._showElementsInFilter) {
            for (const r of rooms) {
                const groups = this._getElementGroups(r);
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
                codeSpan.style.cssText = 'color:var(--app-text-muted,#7a8aaa);font-size:10px;margin-left:4px;';
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
            dot.style.background = SYNC_COLOURS[state] ?? '#9ca3af';
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
            this._runAutoSetup(levels);
            sessionStorage.setItem('pryzm-hierarchy-setup-dismissed', '1');
            this._render();
        });

        dismissBtn.addEventListener('click', () => {
            sessionStorage.setItem('pryzm-hierarchy-setup-dismissed', '1');
            this._render();
        });

        return banner;
    }

    // ── Auto-setup ─────────────────────────────────────────────────────────

    private _runAutoSetup(levels: any[]): void {
        const bus = (this.runtime?.bus as any);
        if (!bus) { console.warn('[HierarchyTreePanel] runtime.bus not available'); return; }

        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        if (!hs) return;

        const siteId = crypto.randomUUID();
        // Phase B (S78-WIRE) — projectName via runtime.projectContext when available.
        const siteName = this.runtime?.projectContext.projectName
            ?? (globalThis as { platformShell?: { currentProjectName?: string } }).platformShell?.currentProjectName
            ?? 'Site A';

        bus.executeCommand('hierarchy.createSite', { id: siteId, name: siteName })
            .then(() => this._runAutoSetupBuilding(siteId, levels, bus))
            .catch((e: any) => console.warn('[HierarchyTreePanel] auto-setup site failed', e));
    }

    private _runAutoSetupBuilding(siteId: string, levels: any[], bus?: any): void {
        const _bus = bus ?? (this.runtime?.bus as any);
        if (!_bus) return;

        const buildingId = crypto.randomUUID();
        _bus.executeCommand('hierarchy.createBuilding', { id: buildingId, siteId, name: 'Building 1' })
            .then(() => {
                const levelPromises = levels.map((level) => {
                    const levelId = crypto.randomUUID();
                    return _bus.executeCommand('hierarchy.createLevel', {
                        id: levelId,
                        buildingId,
                        bimLevelId: level.id,
                        name: level.name ?? `Level ${level.id}`,
                        levelNumber: level.elevation != null ? String(Math.round(level.elevation)) : undefined,
                    }).catch((e: any) => console.warn('[HierarchyTreePanel] auto-setup level failed', e));
                });
                return Promise.all(levelPromises);
            })
            .then(() => this._render())
            .catch((e: any) => console.warn('[HierarchyTreePanel] auto-setup building failed', e));
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
