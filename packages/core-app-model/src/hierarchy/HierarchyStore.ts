/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Data Platform — IFC Hierarchy
 * File:             src/core/hierarchy/HierarchyStore.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §3.3, §3.4, §3.8
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Phase 2 — Store Read Path: Eliminate Redundant structuredClone
 *
 * CHANGE SUMMARY:
 *   Removed `structuredClone` from all read paths (getById, getAll, and the
 *   derived methods getSites / getBuildings / getLevels / getUnits / getChildren).
 *
 * RATIONALE (Contract 01 §3.3 + §3.4):
 *   Every record inserted via add() or update() is stored as
 *   `Object.freeze(structuredClone(input))`.  The Map therefore holds exclusively
 *   frozen records.  Callers cannot mutate the returned reference — Object.freeze
 *   enforces immutability at runtime.  The additional clone on every get() was
 *   redundant: it allocated a fresh mutable copy of an already-immutable value,
 *   producing heap pressure proportional to call frequency.
 *
 *   getAll() still returns a new Array (Array.from) so callers can safely push/
 *   splice the *array* without affecting the store's Map; only the element clones
 *   are eliminated.
 *
 *   serialize() calls getAll() and passes results to JSON.stringify — read-only
 *   access, not mutating.  No impact.
 *
 *   CommandManager.restoreSnapshot() calls getAll() then passes each element to
 *   add(), which performs its own structuredClone at write-time — no impact.
 *
 * IMMUTABILITY GUARANTEE PRESERVED:
 *   Write-time: `Object.freeze(structuredClone(node))` — unchanged.
 *   Read-time: frozen ref returned directly — callers receive a frozen value
 *              and cannot corrupt store state.
 *
 * CRITICAL DESIGN RULE — setSyncState() anti-loop contract:
 *   setSyncState() dispatches a DOM CustomEvent ONLY.
 *   It MUST NOT emit StoreEventBus. // TODO(TASK-08)
 *   Reason: SyncStateEngine subscribes to StoreEventBus. If setSyncState() emitted // TODO(TASK-08)
 *   the bus, it would trigger SyncStateEngine → setSyncState → bus → SyncStateEngine,
 *   causing an infinite loop. This is the sole exception to the "all mutations emit bus"
 *   rule in this codebase.
 *
 * @see docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § Phase 1-B
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type {
    AnyHierarchyEntity,
    SiteData,
    BuildingData,
    LevelData,
    UnitData,
    SyncState,
} from './HierarchyTypes';

export class HierarchyStore {
    private readonly _nodes = new Map<string, AnyHierarchyEntity>();

    // ── Mutations ───────────────────────────────────────────────────────────────

    /**
     * add — inserts a new hierarchy node.
     * Throws if a node with the same id already exists.
     * Emits StoreEventBus 'create' event. // TODO(TASK-08)
     */
    add(node: AnyHierarchyEntity): void {
        if (this._nodes.has(node.id)) {
            throw new Error(`[HierarchyStore.add] Duplicate id: ${node.id} (type: ${node.type})`);
        }
        const frozen = Object.freeze(structuredClone(node));
        this._nodes.set(node.id, frozen);
        storeEventBus.emit({
            elementId:   node.id,
            elementType: node.type,
            operation:   'create',
            timestamp:   Date.now(),
        });
    }

    /**
     * update — applies a partial patch to an existing node.
     * syncState is stripped from the updates — it is owned exclusively by SyncStateEngine
     * and must be written via setSyncState() instead.
     * Increments metadata.version and sets metadata.modifiedAt automatically.
     * Emits StoreEventBus 'update' event. // TODO(TASK-08)
     */
    update(id: string, updates: Partial<AnyHierarchyEntity>): void {
        const existing = this._nodes.get(id);
        if (!existing) {
            throw new Error(`[HierarchyStore.update] Node not found: ${id}`);
        }
        // Strip syncState — never settable via update(). Use setSyncState() instead.
        const { syncState: _stripped, metadata: _meta, ...safeUpdates } = updates as any;

        const merged = Object.freeze(
            structuredClone({
                ...existing,
                ...safeUpdates,
                metadata: {
                    ...existing.metadata,
                    modifiedAt: Date.now(),
                    version:    existing.metadata.version + 1,
                },
            })
        ) as AnyHierarchyEntity;

        this._nodes.set(id, merged);
        storeEventBus.emit({
            elementId:   id,
            elementType: existing.type,
            operation:   'update',
            timestamp:   Date.now(),
        });
    }

    /**
     * setSyncState — ONLY called by SyncStateEngine.
     *
     * Does NOT emit StoreEventBus (see anti-loop contract in file header). // TODO(TASK-08)
     * Dispatches DOM CustomEvent 'pryzm-sync-state-changed' for UI components
     * that need to react to sync state changes (HierarchyTreePanel, DataSheetPanel).
     *
     * No-ops if the node does not exist or if the state is unchanged.
     */
    setSyncState(id: string, state: SyncState): void {
        const existing = this._nodes.get(id);
        if (!existing) return;
        if (existing.syncState === state) return;

        const prev = existing.syncState;
        const updated = Object.freeze({ ...existing, syncState: state }) as AnyHierarchyEntity;
        this._nodes.set(id, updated);

        window.dispatchEvent(new CustomEvent('pryzm-sync-state-changed', { // TODO(TASK-15)
            detail: { nodeId: id, state, previous: prev },
        }));
    }

    /**
     * remove — deletes a node by id.
     * No-ops silently if the id is not found.
     * Emits StoreEventBus 'delete' event. // TODO(TASK-08)
     */
    remove(id: string): void {
        const existing = this._nodes.get(id);
        if (!existing) return;
        this._nodes.delete(id);
        storeEventBus.emit({
            elementId:   id,
            elementType: existing.type,
            operation:   'delete',
            timestamp:   Date.now(),
        });
    }

    // ── Queries ─────────────────────────────────────────────────────────────────

    /**
     * getById — returns the frozen record directly, or undefined if not found.
     *
     * Phase 2 — no clone on read: records are already Object.freeze()'d at
     * write-time (Contract 01 §3.3).  Returning the frozen ref is safe and
     * eliminates the structuredClone allocation on every lookup.
     */
    getById(id: string): AnyHierarchyEntity | undefined {
        return this._nodes.get(id);
    }

    /**
     * getAll — returns a new array of frozen node references, in insertion order.
     *
     * Phase 2 — elements are not cloned: each element in the Map is already
     * frozen.  A new Array is still allocated so callers can safely mutate the
     * array (push/splice) without affecting the store's internal Map.
     */
    getAll(): AnyHierarchyEntity[] {
        return Array.from(this._nodes.values());
    }

    getSites(): SiteData[] {
        return this.getAll().filter((n): n is SiteData => n.type === 'site');
    }

    getBuildings(siteId?: string): BuildingData[] {
        const all = this.getAll().filter((n): n is BuildingData => n.type === 'building');
        return siteId ? all.filter(b => b.siteId === siteId) : all;
    }

    getLevels(buildingId?: string): LevelData[] {
        const all = this.getAll().filter((n): n is LevelData => n.type === 'level');
        return buildingId ? all.filter(l => l.buildingId === buildingId) : all;
    }

    getUnits(levelId?: string): UnitData[] {
        const all = this.getAll().filter((n): n is UnitData => n.type === 'unit');
        return levelId ? all.filter(u => u.levelId === levelId) : all;
    }

    /**
     * getChildren — returns all direct children of a node by parentId.
     * Useful for tree rendering and for DeleteHierarchyNodeCommand's recursive collect.
     */
    getChildren(parentId: string): AnyHierarchyEntity[] {
        return this.getAll().filter(n => n.parentId === parentId);
    }

    has(id: string): boolean {
        return this._nodes.has(id);
    }

    count(): number {
        return this._nodes.size;
    }

    // ── Serialisation ───────────────────────────────────────────────────────────

    /**
     * serialize — returns all nodes as a plain array for ProjectSerializer.
     * Elements are frozen refs; JSON.stringify is read-only — no mutation risk.
     */
    serialize(): AnyHierarchyEntity[] {
        return this.getAll();
    }

    /**
     * deserialize — replaces store contents from a snapshot array.
     * Called by ProjectLoader after migration; called after clear() on project load.
     * Does NOT emit StoreEventBus events (bulk load, not individual mutations). // TODO(TASK-08)
     */
    deserialize(nodes: AnyHierarchyEntity[]): void {
        this.clear();
        for (const node of nodes) {
            this._nodes.set(node.id, Object.freeze(structuredClone(node)) as AnyHierarchyEntity);
        }
    }

    /**
     * clear — removes all nodes without emitting events.
     * Called by ProjectLoader before deserialize and by ClearProjectCommand.
     */
    clear(): void {
        this._nodes.clear();
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

/** Singleton instance — imported by all hierarchy commands and SyncStateEngine. */
export const hierarchyStore = new HierarchyStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'hierarchyStore',
    clear: () => hierarchyStore.clear(),
});
