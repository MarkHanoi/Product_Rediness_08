// C27 INS-α-4 / α-9 — Master Model Tree component.
//
// CONTRACT: C27-BIM3-INSPECT-MODEL.md §1.2 (single tree component) +
//           §2 (6-level master tree project→building→level→apartment→room→
//           elementType→elementInstance).
//
// Slice INS-α-4 shipped L0..L4 (project / building / level / apartment /
// room).  Slice INS-α-9 (this extension) adds L5 — Element Type group
// nodes under each room (and under each level, for elements that don't
// belong to a room).  L6 (Element Instance) is α-10.
//
// L5 nodes are grouped by `element.elementType` (e.g. 'wall', 'door',
// 'window', 'furniture').  Each L5 node is selectable + carries a count
// badge; expanding it currently shows a single placeholder leaf with the
// count — the real per-instance list is α-10.
//
// The tree is LAZY — child subtrees are constructed only on first expand.
// Selection click invokes the caller-supplied `onSelectNode` AND dispatches
// `inspect.selectNode` through the command bus per C27 §1.5 / P6 IF the
// handler is registered (defensive — registry wiring is α-5).
//
// L7 component file.  Imports L6 (`@pryzm/schemas` — schema-only, no
// THREE), reads runtime stores defensively (each lookup falls back to an
// empty array when the store is not wired yet — α-4 ships before the
// BuildingStore / LevelStore-on-runtime / RoomStore-on-runtime exist as
// first-class slots).  No `import * as THREE`, no `requestAnimationFrame`,
// no `(window as any)`.

import type { InspectSelection, InspectNodeKind } from '@pryzm/schemas';
import { renderModelTreeNode } from './ModelTreeNode';

/** Loose runtime shape — narrow at the boundary so we can mock the runtime
 *  in tests without importing `@pryzm/runtime-composer` (a heavy L3 dep
 *  that would balloon the test surface).  Every field is OPTIONAL; the
 *  builder probes-and-falls-back. */
export interface ModelTreeRuntime {
    readonly projectContext?: {
        readonly projectName?: string | null;
        readonly projectId?: string | null;
    } | null;
    readonly bus?: {
        readonly registry?: ReadonlyMap<string, unknown>;
        dispatch?: (type: string, payload: unknown) => unknown;
    } | null;
    /** Building / level / apartment / room store probes — each is an
     *  optional unknown so we can duck-type the iteration API at runtime. */
    readonly buildingStore?: unknown;
    readonly levelStore?: unknown;
    readonly roomStore?: unknown;
    readonly apartmentParametersStore?: unknown;
    /** Element instance store probe (α-9).  Probed for L5 elementType
     *  groupings under each room / level.  When absent L5 nodes do not
     *  render — room nodes degrade to leaf rows as in α-4. */
    readonly elementStore?: unknown;
}

/** Constructor options.  `onSelectNode` is fired on every successful
 *  selection (click OR keyboard activate) AFTER the bus dispatch attempt. */
export interface ModelTreeOptions {
    readonly onSelectNode?: (selection: InspectSelection) => void;
}

/** Internal node descriptor — the materialised tree the renderer walks. */
interface TreeNode {
    readonly selection: InspectSelection;
    readonly label: string;
    readonly children: ReadonlyArray<TreeNode>;
    /** α-9 — when set, the node is "expandable" but its expanded body
     *  is a single `<li class="pmt-leaf">` carrying this text rather
     *  than a recursive child list.  Used by L5 elementType groups until
     *  α-10 lands the per-instance list. */
    readonly placeholder?: string;
}

const COMMAND_TYPE = 'inspect.selectNode';

/** The C27 §1.2 single model-tree component.  One instance per mount
 *  point — duplicate mounts in the same DOM are a CI violation (gate
 *  lands in α-5; for now the constraint is enforced by usage). */
export class ModelTreeComponent {
    private readonly _runtime: ModelTreeRuntime;
    private readonly _container: HTMLElement;
    private readonly _opts: ModelTreeOptions;
    private readonly _expanded = new Set<string>(); // node-key → expanded
    private _selectedKey: string | null = null;
    private _root: HTMLUListElement | null = null;
    private _onClick: ((ev: Event) => void) | null = null;
    private _onKey: ((ev: KeyboardEvent) => void) | null = null;

    constructor(runtime: ModelTreeRuntime, container: HTMLElement, opts: ModelTreeOptions = {}) {
        this._runtime = runtime;
        this._container = container;
        this._opts = opts;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Build the tree DOM under the container.  Idempotent — calling
     *  twice replaces the previous render. */
    mount(): void {
        this.unmount();
        const ul = document.createElement('ul');
        ul.className = 'pmt-tree';
        ul.setAttribute('role', 'tree');
        this._root = ul;
        this._container.appendChild(ul);

        // The project root is always expanded on first mount so the user
        // sees the immediate children without an extra click.
        const project = this._buildTree();
        this._expanded.add(this._key(project.selection));

        this._renderInto(ul, [project]);

        // Delegated event wiring — survives lazy child additions.
        this._onClick = (ev) => this._handleClick(ev);
        this._onKey = (ev) => this._handleKey(ev);
        ul.addEventListener('click', this._onClick);
        ul.addEventListener('keydown', this._onKey);
    }

    /** Re-render the tree from the latest store state.  Cheap — preserves
     *  the expanded set + selected key. */
    refresh(): void {
        if (this._root === null) return;
        this._root.replaceChildren();
        const project = this._buildTree();
        this._renderInto(this._root, [project]);
    }

    /** Tear down the tree DOM + listeners.  Idempotent. */
    unmount(): void {
        if (this._root !== null) {
            if (this._onClick) this._root.removeEventListener('click', this._onClick);
            if (this._onKey) this._root.removeEventListener('keydown', this._onKey);
            this._root.remove();
        }
        this._root = null;
        this._onClick = null;
        this._onKey = null;
        // We intentionally keep `_expanded` + `_selectedKey` across
        // unmount → mount cycles so a parent panel can hide/show the tree
        // without losing user state.
    }

    // ── Tree construction ─────────────────────────────────────────────────────

    /** Build the synthetic project root + materialise its children from
     *  the runtime stores.  Every store probe is a try/catch — we treat
     *  every error as "store not wired" and degrade to an empty array. */
    private _buildTree(): TreeNode {
        const projectName = this._readProjectName();
        const projectId = this._readProjectId();

        const buildings = this._listBuildings();
        const levels = this._listLevels();
        const apartments = this._listApartments();

        // L1 — buildings.  When the building store is missing emit a single
        // synthetic building so the tree is browseable from day one.
        const buildingNodes: TreeNode[] = buildings.length > 0
            ? buildings.map(b => this._buildBuilding(b.id, b.label, levels, apartments))
            : [this._buildBuilding('building-1', 'Building 1', levels, apartments)];

        return {
            selection: {
                kind: 'project',
                id: projectId,
                level: 0,
                breadcrumb: [],
            },
            label: projectName,
            children: buildingNodes,
        };
    }

    private _buildBuilding(
        id: string,
        label: string,
        levels: ReadonlyArray<{ id: string; label: string }>,
        apartments: ReadonlyArray<{ id: string; label: string }>,
    ): TreeNode {
        const projectId = this._readProjectId();
        const buildingCrumb: InspectSelection['breadcrumb'] = [
            { kind: 'project', id: projectId },
            { kind: 'building', id },
        ];
        const levelNodes: TreeNode[] = levels.map(lv => this._buildLevel(lv.id, lv.label, buildingCrumb, apartments));
        return {
            selection: {
                kind: 'building',
                id,
                level: 1,
                breadcrumb: [{ kind: 'project', id: projectId }],
            },
            label,
            children: levelNodes,
        };
    }

    private _buildLevel(
        id: string,
        label: string,
        buildingCrumb: InspectSelection['breadcrumb'],
        apartments: ReadonlyArray<{ id: string; label: string }>,
    ): TreeNode {
        const levelCrumb: InspectSelection['breadcrumb'] = [
            ...buildingCrumb,
            { kind: 'level', id },
        ];
        const rooms = this._listRoomsOnLevel(id);
        // Apartments are listed flat under the level for INS-α-4 — the
        // apartment ↔ room grouping is α-5.  When apartments are present
        // we render them between the level and its rooms.
        const apartmentNodes: TreeNode[] = apartments.map(a => this._buildApartment(a.id, a.label, levelCrumb));
        const roomNodes: TreeNode[] = rooms.map(r => this._buildRoom(r.id, r.label, levelCrumb, label));
        // α-9: elements with no roomId but with levelId === id are grouped
        // here under the level as L5 elementType nodes (e.g. structural
        // walls outside any room).
        const orphanGroups = this._groupOrphanElementsForLevel(id);
        const orphanNodes: TreeNode[] = orphanGroups.map(g =>
            this._buildElementType(g.elementType, g.count, id, /* parentKind */ 'level', label, levelCrumb),
        );
        return {
            selection: {
                kind: 'level',
                id,
                level: 2,
                breadcrumb: buildingCrumb,
            },
            label,
            children: [...apartmentNodes, ...roomNodes, ...orphanNodes],
        };
    }

    private _buildApartment(id: string, label: string, parentCrumb: InspectSelection['breadcrumb']): TreeNode {
        return {
            selection: {
                kind: 'apartment',
                id,
                level: 3,
                breadcrumb: parentCrumb,
            },
            label,
            children: [],
        };
    }

    private _buildRoom(
        id: string,
        label: string,
        parentCrumb: InspectSelection['breadcrumb'],
        _parentLabel?: string,
    ): TreeNode {
        const roomCrumb: InspectSelection['breadcrumb'] = [
            ...parentCrumb,
            { kind: 'room', id },
        ];
        // α-9: gather elements whose roomId === id, group by elementType,
        // emit one L5 node per non-empty group.
        const groups = this._groupElementsForRoom(id);
        const typeNodes: TreeNode[] = groups.map(g =>
            this._buildElementType(g.elementType, g.count, id, /* parentKind */ 'room', label, roomCrumb),
        );
        return {
            selection: {
                kind: 'room',
                id,
                level: 4,
                breadcrumb: parentCrumb,
            },
            label,
            children: typeNodes,
        };
    }

    /** α-9 — L5 Element Type group node.  Synthetic id encodes the parent
     *  scope (room or level) + the elementType so two rooms with walls
     *  produce distinct keys.  Selection emits `kind: 'elementType'`.
     *  The expanded body is a single placeholder leaf carrying the
     *  instance count — α-10 replaces it with a real per-instance list. */
    private _buildElementType(
        elementType: string,
        count: number,
        parentId: string,
        _parentKind: 'room' | 'level',
        _parentLabel: string,
        parentCrumb: InspectSelection['breadcrumb'],
    ): TreeNode {
        const syntheticId = `${parentId}::type::${elementType}`;
        const label = `${pluralCapitalize(elementType)} (${count})`;
        return {
            selection: {
                kind: 'elementType',
                id: syntheticId,
                level: 5,
                breadcrumb: parentCrumb,
            },
            label,
            children: [],
            placeholder: `... ${count} ${count === 1 ? 'item' : 'items'} ...`,
        };
    }

    // ── Defensive store probes ────────────────────────────────────────────────

    private _readProjectName(): string {
        const raw = this._runtime?.projectContext?.projectName;
        return typeof raw === 'string' && raw.trim().length > 0 ? raw : 'Project';
    }

    private _readProjectId(): string {
        const raw = this._runtime?.projectContext?.projectId;
        return typeof raw === 'string' && raw.length > 0 ? raw : 'project-root';
    }

    private _listBuildings(): ReadonlyArray<{ id: string; label: string }> {
        const store = this._runtime?.buildingStore;
        return this._listFromStore(store).map((b, i) => ({
            id: this._coerceId(b, `building-${i + 1}`),
            label: this._coerceLabel(b, `Building ${i + 1}`),
        }));
    }

    private _listLevels(): ReadonlyArray<{ id: string; label: string }> {
        const store = this._runtime?.levelStore;
        return this._listFromStore(store).map((lv, i) => ({
            id: this._coerceId(lv, `level-${i + 1}`),
            label: this._coerceLabel(lv, `Level ${i + 1}`),
        }));
    }

    private _listApartments(): ReadonlyArray<{ id: string; label: string }> {
        const store = this._runtime?.apartmentParametersStore;
        return this._listFromStore(store).map((apt, i) => ({
            id: this._coerceId(apt, `apartment-${i + 1}`),
            label: this._coerceLabel(apt, `Apartment ${i + 1}`),
        }));
    }

    private _listRoomsOnLevel(levelId: string): ReadonlyArray<{ id: string; label: string }> {
        const store = this._runtime?.roomStore;
        const all = this._listFromStore(store);
        const filtered = all.filter(r => {
            const lid = this._read(r, 'levelId');
            return typeof lid === 'string' ? lid === levelId : true;
        });
        return filtered.map((r, i) => ({
            id: this._coerceId(r, `room-${levelId}-${i + 1}`),
            label: this._coerceLabel(r, `Room ${i + 1}`),
        }));
    }

    /** α-9 — list every element-like record the runtime exposes via the
     *  elementStore probe.  Each entry is treated as opaque; only
     *  `id`, `elementType`, `roomId`, `levelId` are read by the caller. */
    private _listElements(): ReadonlyArray<Record<string, unknown>> {
        return this._listFromStore(this._runtime?.elementStore);
    }

    /** α-9 — group elements whose `roomId === roomId` by their string
     *  `elementType` field.  Elements with non-string elementType are
     *  skipped.  Returns an array sorted by elementType for stable
     *  rendering. */
    private _groupElementsForRoom(roomId: string): ReadonlyArray<{ elementType: string; count: number }> {
        const all = this._listElements();
        const counts = new Map<string, number>();
        for (const e of all) {
            const rid = this._read(e, 'roomId');
            if (typeof rid !== 'string' || rid !== roomId) continue;
            const et = this._read(e, 'elementType');
            if (typeof et !== 'string' || et.length === 0) continue;
            counts.set(et, (counts.get(et) ?? 0) + 1);
        }
        return [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([elementType, count]) => ({ elementType, count }));
    }

    /** α-9 — group elements that have NO `roomId` (or empty) but whose
     *  `levelId === levelId` by elementType.  These are the "orphan"
     *  element instances that live on a level outside any room (e.g.
     *  structural walls / shared columns). */
    private _groupOrphanElementsForLevel(levelId: string): ReadonlyArray<{ elementType: string; count: number }> {
        const all = this._listElements();
        const counts = new Map<string, number>();
        for (const e of all) {
            const rid = this._read(e, 'roomId');
            const hasRoom = typeof rid === 'string' && rid.length > 0;
            if (hasRoom) continue;
            const lid = this._read(e, 'levelId');
            if (typeof lid !== 'string' || lid !== levelId) continue;
            const et = this._read(e, 'elementType');
            if (typeof et !== 'string' || et.length === 0) continue;
            counts.set(et, (counts.get(et) ?? 0) + 1);
        }
        return [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([elementType, count]) => ({ elementType, count }));
    }

    /** Read an arbitrary store-like value.  Probes (in order):
     *    1. `store.list()`            — ApartmentParametersStore / LevelStore shape
     *    2. `store.getAll()`          — common store shape
     *    3. `store.getState().values()` — base Store<T> shape (returns ReadonlyMap)
     *    4. `Array.isArray(store)`    — already an array
     *  Falls back to `[]` on anything else / errors. */
    private _listFromStore(store: unknown): ReadonlyArray<Record<string, unknown>> {
        if (store === null || store === undefined) return [];
        try {
            const list = this._callIfMethod(store, 'list');
            if (Array.isArray(list)) return list as ReadonlyArray<Record<string, unknown>>;
            const getAll = this._callIfMethod(store, 'getAll');
            if (Array.isArray(getAll)) return getAll as ReadonlyArray<Record<string, unknown>>;
            const getState = this._callIfMethod(store, 'getState');
            if (getState && typeof (getState as { values?: unknown }).values === 'function') {
                return [...(getState as Iterable<Record<string, unknown>> & { values(): Iterable<Record<string, unknown>> }).values()];
            }
            if (Array.isArray(store)) return store as ReadonlyArray<Record<string, unknown>>;
        } catch {
            // Defensive — any store-probe error degrades to empty.
        }
        return [];
    }

    private _callIfMethod(host: unknown, key: string): unknown {
        if (host === null || host === undefined) return undefined;
        const fn = (host as Record<string, unknown>)[key];
        if (typeof fn === 'function') return (fn as () => unknown).call(host);
        return undefined;
    }

    private _read(host: unknown, key: string): unknown {
        if (host === null || host === undefined) return undefined;
        return (host as Record<string, unknown>)[key];
    }

    private _coerceId(node: unknown, fallback: string): string {
        const raw = this._read(node, 'id');
        return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
    }

    private _coerceLabel(node: unknown, fallback: string): string {
        const name = this._read(node, 'name');
        if (typeof name === 'string' && name.trim().length > 0) return name;
        const label = this._read(node, 'label');
        if (typeof label === 'string' && label.trim().length > 0) return label;
        const id = this._read(node, 'id');
        if (typeof id === 'string' && id.length > 0) return id;
        return fallback;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private _renderInto(parent: HTMLUListElement, nodes: ReadonlyArray<TreeNode>): void {
        for (const node of nodes) {
            const key = this._key(node.selection);
            const isExpanded = this._expanded.has(key);
            // α-9: an L5 elementType node is expandable when it has a
            // placeholder body even if its children[] is empty (the real
            // per-instance list is α-10).
            const hasPlaceholder = typeof node.placeholder === 'string' && node.placeholder.length > 0;
            const hasChildren = node.children.length > 0 || hasPlaceholder;
            // The badge count for L5 groups already lives in the label
            // (e.g. "Walls (5)") — keep childCount=0 so the renderer
            // doesn't paint a duplicate badge.
            const childCount = hasPlaceholder ? 0 : node.children.length;
            const li = renderModelTreeNode({
                selection: node.selection,
                label: node.label,
                isExpanded,
                hasChildren,
                childCount,
                isSelected: this._selectedKey === key,
            });
            parent.appendChild(li);
            if (isExpanded && hasChildren) {
                const childUl = document.createElement('ul');
                childUl.className = 'pmt-children';
                childUl.setAttribute('role', 'group');
                if (hasPlaceholder && node.children.length === 0) {
                    const leaf = document.createElement('li');
                    leaf.className = 'pmt-leaf';
                    leaf.textContent = node.placeholder!;
                    childUl.appendChild(leaf);
                } else {
                    this._renderInto(childUl, node.children);
                }
                li.appendChild(childUl);
            }
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    private _handleClick(ev: Event): void {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        const li = target.closest('li.pmt-node') as HTMLLIElement | null;
        if (li === null) return;

        // Toggle click → expand/collapse only, NO selection change.  Lets
        // the user explore the hierarchy without losing the selected node.
        const toggle = target.closest('[data-role="toggle"]');
        if (toggle !== null && li.contains(toggle)) {
            this._toggleExpand(li);
            ev.stopPropagation();
            return;
        }

        this._selectFromLi(li);
    }

    private _handleKey(ev: KeyboardEvent): void {
        if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const li = target.closest('li.pmt-node') as HTMLLIElement | null;
        if (li === null) return;
        ev.preventDefault();
        this._selectFromLi(li);
    }

    private _selectFromLi(li: HTMLLIElement): void {
        const selection = this._readSelectionFromLi(li);
        if (selection === null) return;
        this._setSelected(selection);
        this._dispatchSelection(selection);
        try { this._opts.onSelectNode?.(selection); }
        catch (err) { console.error('[ModelTree] onSelectNode threw:', err); }
    }

    private _toggleExpand(li: HTMLLIElement): void {
        const selection = this._readSelectionFromLi(li);
        if (selection === null) return;
        const key = this._key(selection);
        if (this._expanded.has(key)) this._expanded.delete(key);
        else this._expanded.add(key);
        this.refresh();
    }

    private _setSelected(selection: InspectSelection): void {
        this._selectedKey = this._key(selection);
        // Toggle the class WITHOUT a full refresh — saves a tree rebuild
        // on every click.  refresh() will rebuild correctly when called
        // (e.g. on store change) because it reads `_selectedKey`.
        if (this._root !== null) {
            const all = this._root.querySelectorAll<HTMLLIElement>('li.pmt-node');
            for (const li of all) {
                const sel = this._readSelectionFromLi(li);
                if (sel === null) continue;
                const isMe = this._key(sel) === this._selectedKey;
                li.classList.toggle('pmt-node--selected', isMe);
                if (isMe) li.setAttribute('aria-selected', 'true');
                else li.removeAttribute('aria-selected');
            }
        }
    }

    private _dispatchSelection(selection: InspectSelection): void {
        const bus = this._runtime?.bus;
        if (!bus || typeof bus.dispatch !== 'function') return;
        const registry = bus.registry;
        // Only dispatch when the command is registered — α-5 wires the
        // handler; until then this is a no-op so dev consoles stay clean.
        if (registry instanceof Map && !registry.has(COMMAND_TYPE)) return;
        try {
            bus.dispatch(COMMAND_TYPE, { selection });
        } catch (err) {
            console.warn('[ModelTree] inspect.selectNode dispatch failed:', err);
        }
    }

    private _readSelectionFromLi(li: HTMLLIElement): InspectSelection | null {
        const kind = li.dataset.kind as InspectNodeKind | undefined;
        const id = li.dataset.id;
        const levelRaw = li.dataset.level;
        if (!kind || !id || levelRaw === undefined) return null;
        const level = Number.parseInt(levelRaw, 10);
        if (!Number.isFinite(level) || level < 0 || level > 6) return null;
        // We can't fully reconstruct the breadcrumb from data attributes —
        // for selection-event purposes the (kind, id, level) triple is the
        // authoritative key.  The bridge in α-5 resolves the breadcrumb
        // independently from the tree projection.
        return { kind, id, level, breadcrumb: [] };
    }

    private _key(sel: InspectSelection): string {
        return `${sel.kind}:${sel.id}`;
    }
}

// ── Module helpers ────────────────────────────────────────────────────────────

/**
 * α-9 — produce a UI label from an elementType id.
 *
 *   'wall'      → 'Walls'
 *   'door'      → 'Doors'
 *   'window'    → 'Windows'
 *   'furniture' → 'Furniture'        (irregular plural — no extra 's')
 *   'curtain-wall' → 'Curtain Walls'
 *   'class'     → 'Classes'
 *
 * Pure, ASCII-only.  Handles a small set of irregular plurals; everything
 * else gets the regular `+s` (or `+es` after sibilant endings).
 */
function pluralCapitalize(elementType: string): string {
    const cleaned = elementType.trim();
    if (cleaned.length === 0) return 'Items';
    // Split on `-` / `_` / space for multi-word types, then capitalize
    // each word.  Only the LAST word is pluralised.
    const words = cleaned.split(/[-_\s]+/).filter(w => w.length > 0);
    if (words.length === 0) return 'Items';
    const capWords = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const last = capWords[capWords.length - 1]!;
    capWords[capWords.length - 1] = pluralize(last);
    return capWords.join(' ');
}

function pluralize(word: string): string {
    const lower = word.toLowerCase();
    // Hard-coded irregular plurals + uncountables that PRYZM ships with.
    const irregular: Record<string, string> = {
        furniture: 'Furniture',
        equipment: 'Equipment',
        glazing:   'Glazing',
        ceiling:   'Ceilings',
        lighting:  'Lighting',
    };
    if (Object.prototype.hasOwnProperty.call(irregular, lower)) {
        return irregular[lower]!;
    }
    // Regular: sibilant endings → +es ; otherwise +s.
    if (/(s|x|z|ch|sh)$/.test(lower)) return word + 'es';
    if (/[^aeiou]y$/.test(lower)) return word.slice(0, -1) + 'ies';
    return word + 's';
}
