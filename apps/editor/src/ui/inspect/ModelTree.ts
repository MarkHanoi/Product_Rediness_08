// C27 INS-α-4 / α-9 / α-10 — Master Model Tree component.
//
// CONTRACT: C27-BIM3-INSPECT-MODEL.md §1.2 (single tree component) +
//           §2 (6-level master tree project→building→level→apartment→room→
//           elementType→elementInstance).
//
// Slice INS-α-4 shipped L0..L4 (project / building / level / apartment /
// room).  Slice INS-α-9 added L5 — Element Type group nodes under each
// room (and under each level, for elements that don't belong to a room).
// Slice INS-α-10 (this extension) adds L6 — Element Instance leaves
// under each L5 type group, replacing the α-9 placeholder.
//
// L5 nodes are grouped by `element.elementType` (e.g. 'wall', 'door',
// 'window', 'furniture').  Each L5 node is selectable + carries a count
// badge; expanding it now renders one L6 leaf per element instance in
// the group (capped at MAX_L6_PER_GROUP to avoid browser meltdown on
// projects with hundreds of walls; an informational "… (N more)" tail
// leaf is appended when the cap is hit).
//
// L6 leaves are NOT expandable (no toggle).  Their labels prefer
// `element.name` → `element.label` → `<elementType>-<short-id>`.  Click
// fires `onSelectNode({ kind: 'elementInstance', ... })` — dashboards
// (per-element property panels) are α-11.
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

/** α-10 — cap on the number of L6 element-instance leaves rendered under
 *  a single L5 group.  Above this we render the first N + a single
 *  informational "… (M more)" leaf so the tree stays responsive on
 *  projects with 500+ walls.  Tuned for happy-dom + production browsers
 *  alike; bumping it is safe but the bigger gain is virtualization
 *  (out-of-scope for α-10). */
const MAX_L6_PER_GROUP = 50;

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
 *  selection (click OR keyboard activate) AFTER the bus dispatch attempt.
 *  `onContextMenu` is fired on right-click (or Shift+F10 keyboard) over
 *  any L0..L6 node; the orchestrator decides which actions are applicable
 *  to the selection kind (e.g. "Show AI provenance" is only meaningful
 *  for `kind: 'elementInstance'`). The pixel coords are the menu anchor
 *  the orchestrator should position the popover from. Default browser
 *  context menu is suppressed when this is provided. */
export interface ModelTreeContextMenuPayload {
    readonly selection: InspectSelection;
    readonly clientX: number;
    readonly clientY: number;
}
export interface ModelTreeOptions {
    readonly onSelectNode?: (selection: InspectSelection) => void;
    readonly onContextMenu?: (payload: ModelTreeContextMenuPayload) => void;
}

/** Internal node descriptor — the materialised tree the renderer walks. */
interface TreeNode {
    readonly selection: InspectSelection;
    readonly label: string;
    readonly children: ReadonlyArray<TreeNode>;
    /** α-9 — legacy "single-leaf placeholder" body.  After α-10 this is
     *  no longer used by L5 groups (they now carry real L6 children) but
     *  the field is kept for forward-compat with other group-style nodes
     *  that may want a placeholder before their own per-instance slice
     *  lands. */
    readonly placeholder?: string;
    /** α-10 — informational "… (N more)" leaf rendered AFTER the children
     *  when the L5 group exceeds MAX_L6_PER_GROUP.  Not selectable, not
     *  interactive — purely a visual marker. */
    readonly overflowText?: string;
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
    private _onContextMenu: ((ev: MouseEvent) => void) | null = null;

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
        // Right-click handler — only attached when the caller supplied an
        // onContextMenu option. We suppress the native browser context
        // menu so the orchestrator's popover can take its place. Without
        // a handler we leave the native menu intact.
        if (this._opts.onContextMenu) {
            this._onContextMenu = (ev) => this._handleContextMenu(ev);
            ul.addEventListener('contextmenu', this._onContextMenu);
        }
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
            if (this._onContextMenu) this._root.removeEventListener('contextmenu', this._onContextMenu);
            this._root.remove();
        }
        this._root = null;
        this._onClick = null;
        this._onKey = null;
        this._onContextMenu = null;
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
            this._buildElementType(g.elementType, g.count, id, /* parentKind */ 'level', label, levelCrumb, g.instances),
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
        // emit one L5 node per non-empty group.  α-10: each group also
        // carries the per-instance list for L6 leaf materialisation.
        const groups = this._groupElementsForRoom(id);
        const typeNodes: TreeNode[] = groups.map(g =>
            this._buildElementType(g.elementType, g.count, id, /* parentKind */ 'room', label, roomCrumb, g.instances),
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
     *
     *  α-10 — populates L6 element-instance children from `instances`,
     *  capped at MAX_L6_PER_GROUP.  When the cap is hit an `overflowText`
     *  marker is set; the renderer emits it as a non-interactive gray
     *  leaf AFTER the rendered children. */
    private _buildElementType(
        elementType: string,
        count: number,
        parentId: string,
        _parentKind: 'room' | 'level',
        _parentLabel: string,
        parentCrumb: InspectSelection['breadcrumb'],
        instances: ReadonlyArray<Record<string, unknown>>,
    ): TreeNode {
        const syntheticId = `${parentId}::type::${elementType}`;
        const label = `${pluralCapitalize(elementType)} (${count})`;
        const typeCrumb: InspectSelection['breadcrumb'] = [
            ...parentCrumb,
            { kind: 'elementType', id: syntheticId },
        ];

        const capped = instances.slice(0, MAX_L6_PER_GROUP);
        const overflow = instances.length - capped.length;
        const childNodes: TreeNode[] = [];
        for (const inst of capped) {
            const node = this._buildElementInstance(inst, elementType, typeCrumb);
            if (node !== null) childNodes.push(node);
        }

        const overflowText = overflow > 0 ? `... (${overflow} more) ...` : undefined;

        return {
            selection: {
                kind: 'elementType',
                id: syntheticId,
                level: 5,
                breadcrumb: parentCrumb,
            },
            label,
            children: childNodes,
            overflowText,
        };
    }

    /** α-10 — L6 Element Instance leaf.  Label resolution:
     *    1. `element.name`            (if present and non-empty)
     *    2. `element.label`           (if present and non-empty)
     *    3. `<elementType>-<short-id>` — first 6 chars of the id
     *  An element with NO usable id is skipped (returns null) — the
     *  caller filters nulls from the children list. */
    private _buildElementInstance(
        element: Record<string, unknown>,
        elementType: string,
        parentCrumb: InspectSelection['breadcrumb'],
    ): TreeNode | null {
        const rawId = this._read(element, 'id');
        const id = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;
        const name = this._read(element, 'name');
        const label = this._read(element, 'label');
        const hasName = typeof name === 'string' && name.trim().length > 0;
        const hasLabel = typeof label === 'string' && label.trim().length > 0;
        if (id === null && !hasName && !hasLabel) {
            // No usable identity — skip.
            return null;
        }
        if (id === null) {
            // Has a name/label but no id — we still need a key to wire
            // selection.  Defensive: skip rather than mint a synthetic id
            // (would clash if two elements share the same name).
            return null;
        }
        const resolvedLabel: string = hasName
            ? (name as string)
            : hasLabel
                ? (label as string)
                : `${elementType}-${id.slice(0, 6)}`;
        return {
            selection: {
                kind: 'elementInstance',
                id,
                level: 6,
                breadcrumb: parentCrumb,
            },
            label: resolvedLabel,
            children: [],
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

    /** α-9 / α-10 — group elements whose `roomId === roomId` by their
     *  string `elementType` field.  Elements with non-string elementType
     *  are skipped.  Returns an array sorted by elementType for stable
     *  rendering; each group carries the count + the element instance
     *  list (α-10 — for L6 leaf materialisation). */
    private _groupElementsForRoom(roomId: string): ReadonlyArray<{
        elementType: string;
        count: number;
        instances: ReadonlyArray<Record<string, unknown>>;
    }> {
        const all = this._listElements();
        const groups = new Map<string, Array<Record<string, unknown>>>();
        for (const e of all) {
            const rid = this._read(e, 'roomId');
            if (typeof rid !== 'string' || rid !== roomId) continue;
            const et = this._read(e, 'elementType');
            if (typeof et !== 'string' || et.length === 0) continue;
            let bucket = groups.get(et);
            if (!bucket) { bucket = []; groups.set(et, bucket); }
            bucket.push(e);
        }
        return [...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([elementType, instances]) => ({
                elementType,
                count: instances.length,
                instances,
            }));
    }

    /** α-9 / α-10 — group elements that have NO `roomId` (or empty) but
     *  whose `levelId === levelId` by elementType.  These are the
     *  "orphan" element instances that live on a level outside any room
     *  (e.g. structural walls / shared columns).  Returns counts + the
     *  per-group instance list, matching `_groupElementsForRoom`. */
    private _groupOrphanElementsForLevel(levelId: string): ReadonlyArray<{
        elementType: string;
        count: number;
        instances: ReadonlyArray<Record<string, unknown>>;
    }> {
        const all = this._listElements();
        const groups = new Map<string, Array<Record<string, unknown>>>();
        for (const e of all) {
            const rid = this._read(e, 'roomId');
            const hasRoom = typeof rid === 'string' && rid.length > 0;
            if (hasRoom) continue;
            const lid = this._read(e, 'levelId');
            if (typeof lid !== 'string' || lid !== levelId) continue;
            const et = this._read(e, 'elementType');
            if (typeof et !== 'string' || et.length === 0) continue;
            let bucket = groups.get(et);
            if (!bucket) { bucket = []; groups.set(et, bucket); }
            bucket.push(e);
        }
        return [...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([elementType, instances]) => ({
                elementType,
                count: instances.length,
                instances,
            }));
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
            // placeholder body even if its children[] is empty.
            // α-10: L5 groups now carry real L6 children (no placeholder)
            // BUT may carry an `overflowText` marker for the trailing
            // "... (N more) ..." informational leaf — the marker alone
            // does NOT make a node expandable.
            const hasPlaceholder = typeof node.placeholder === 'string' && node.placeholder.length > 0;
            const hasChildren = node.children.length > 0 || hasPlaceholder;
            // The badge count for L5 groups already lives in the label
            // (e.g. "Walls (5)") — suppress duplicate badge for L5 too.
            const suppressBadge = hasPlaceholder || node.selection.kind === 'elementType';
            const childCount = suppressBadge ? 0 : node.children.length;
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
                // α-10 — informational overflow tail leaf (gray, no
                // click handler, NOT a treeitem so screen-readers skip it).
                if (typeof node.overflowText === 'string' && node.overflowText.length > 0) {
                    const overflowLi = document.createElement('li');
                    overflowLi.className = 'pmt-leaf pmt-leaf--overflow';
                    overflowLi.textContent = node.overflowText;
                    overflowLi.setAttribute('aria-hidden', 'true');
                    childUl.appendChild(overflowLi);
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

    /** Right-click handler. Only attached when `onContextMenu` is in
     *  options. Suppresses the native browser context menu so the
     *  orchestrator can render its own popover. Updates the selection
     *  to the right-clicked node (matches OS file-explorer behaviour
     *  where right-click selects + opens menu). */
    private _handleContextMenu(ev: MouseEvent): void {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        const li = target.closest('li.pmt-node') as HTMLLIElement | null;
        if (li === null) return;
        const selection = this._readSelectionFromLi(li);
        if (selection === null) return;
        ev.preventDefault();
        ev.stopPropagation();
        this._setSelected(selection);
        this._dispatchSelection(selection);
        try {
            this._opts.onSelectNode?.(selection);
        } catch (err) {
            console.error('[ModelTree] onSelectNode threw (contextmenu path):', err);
        }
        try {
            this._opts.onContextMenu?.({
                selection,
                clientX: ev.clientX,
                clientY: ev.clientY,
            });
        } catch (err) {
            console.error('[ModelTree] onContextMenu threw:', err);
        }
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
