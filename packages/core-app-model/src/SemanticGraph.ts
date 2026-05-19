/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Semantic Graph (NEW FILE)
 * Phase:             Phase D — D-1
 * Files Modified:    src/core/SemanticGraph.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *   PRYZM_MASTER_ROADMAP_2026.md § D-1
 *
 * Impact Assessment:
 *   Store Reads:      NO — pure data structure
 *   Store Writes:     NO — pure data structure
 *   Event Bus:        NO — does not subscribe or emit
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low (pure data structure, no side effects)
 * Rationale:
 *   The SemanticGraph is the single most important architectural addition in Phase D.
 *   It provides a typed, indexed, traversable relationship store between all BIM elements.
 *   Persisted in ProjectSnapshot.semanticGraph (schema v3).
 *   Queried by DependencyResolver, WorldModelAdapter, RelationshipExplorerPanel, and IFC export.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * All valid relationship types between BIM elements.
 * Each type has a defined semantic direction (source → target).
 *
 * Bidirectional relationships (adjacentTo, connectedTo) are stored as TWO
 * directed relationships — one in each direction — so both sides are queryable.
 *
 * Phase G adds four new families:
 *   Temporal  — tracks design history and supersession
 *   Causal    — tracks compliance consequence chains
 *   Performance — links elements to measured physics results
 *   Lifecycle — tracks as-built / maintenance / decommissioning
 *   Intent    — links an element to an architect's recorded rationale
 */
export type RelationshipType =
    // ── Spatial / Structural (Phase D — original 13 types) ─────────────────
    | 'hosts'             // wall → door/window  (wall hosts an opening)
    | 'hostedBy'          // door/window → wall  (inverse of hosts)
    | 'connectedTo'       // room ↔ room via door (both directions stored)
    | 'adjacentTo'        // room ↔ room via shared wall (both directions stored)
    | 'boundedBy'         // room → wall (room is bounded by wall)
    | 'contains'          // room → furniture/equipment
    | 'sitsOn'            // wall → slab (wall sits on slab)
    | 'supports'          // slab → wall (inverse of sitsOn)
    | 'partOf'            // room → unit (room belongs to unit)
    | 'unitOf'            // unit → level
    | 'levelOf'           // level → building
    | 'servesZone'        // HVAC zone → room (future)
    | 'connectedByStair'  // floor → floor via stair
    // ── Temporal (Phase G) ─────────────────────────────────────────────────
    | 'precededBy'        // new element ← old element it replaced
    | 'supersedes'        // new element → old element (inverse of precededBy)
    | 'branchedFrom'      // design variant → element it was derived from
    // ── Causal (Phase G) ──────────────────────────────────────────────────
    | 'causedFailureOf'   // element whose change caused another to become non-compliant
    | 'wasMitigatedBy'    // compliance failure → the change that resolved it
    // ── Performance (Phase H) ─────────────────────────────────────────────
    | 'measuredAt'        // element → performance record node (physics result)
    | 'exceededBenchmark' // element → portfolio benchmark it exceeded
    // ── Lifecycle (Phase L) ───────────────────────────────────────────────
    | 'replacedBy'        // element → its physical replacement (as-built phase)
    | 'maintainedBy'      // element → maintenance event record
    | 'decommissionedBefore' // element that must be decommissioned before another
    // ── Intent (Phase G) ─────────────────────────────────────────────────
    | 'decidedBy';        // element → DecisionRecord (architect's rationale)

export interface Relationship {
    /** UUID — stable and immutable once created. */
    id: string;
    /** Semantic direction of the relationship. */
    type: RelationshipType;
    /** Source element ID. */
    sourceId: string;
    /** Target element ID. */
    targetId: string;
    /** Optional typed metadata (e.g. sharedWallId, doorId). */
    metadata?: Record<string, string | number | boolean>;
    /** Unix timestamp (ms) when created. */
    createdAt: number;
    /** Creator identifier — 'system' for auto-detected, user ID otherwise. */
    createdBy: string;
}

/**
 * Plain-JSON serialisation of the SemanticGraph.
 * Stored in ProjectSnapshot.semanticGraph.
 */
export interface SemanticGraph {
    version: number;
    relationships: Relationship[];
}

// ── Manager ───────────────────────────────────────────────────────────────────

/**
 * SemanticGraphManager — the core relationship store.
 *
 * All lookups are O(1) or O(k) where k = result set size, via three indices:
 *   _rels        — id → Relationship
 *   _bySource    — sourceId → Set<rel id>
 *   _byTarget    — targetId → Set<rel id>
 *
 * Thread safety: single-threaded browser environment — no locking required.
 */
export class SemanticGraphManager {
    private readonly _rels      = new Map<string, Relationship>();
    private readonly _bySource  = new Map<string, Set<string>>();
    private readonly _byTarget  = new Map<string, Set<string>>();

    // ── Mutation ──────────────────────────────────────────────────────────────

    /**
     * Add a relationship to the graph.
     * If an identical relationship (same source, target, type) already exists,
     * it is returned unchanged (idempotent insert).
     *
     * @returns The ID of the relationship (existing or newly created).
     */
    addRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): string {
        // Idempotency guard — don't duplicate the same logical relationship
        const existing = this._findExact(rel.sourceId, rel.targetId, rel.type);
        if (existing) return existing.id;

        const id = crypto.randomUUID();
        const full: Relationship = { ...rel, id, createdAt: Date.now() };

        this._rels.set(id, full);
        this._addToIndex(this._bySource, rel.sourceId, id);
        this._addToIndex(this._byTarget, rel.targetId, id);

        return id;
    }

    /**
     * Remove a single relationship by its ID.
     * No-op if the ID does not exist.
     */
    removeRelationship(id: string): void {
        const rel = this._rels.get(id);
        if (!rel) return;

        this._removeFromIndex(this._bySource, rel.sourceId, id);
        this._removeFromIndex(this._byTarget, rel.targetId, id);
        this._rels.delete(id);
    }

    /**
     * Remove ALL relationships where the element is either source OR target.
     * Called by DeleteWallCommand, etc.
     */
    removeAllRelationshipsForElement(elementId: string): void {
        const toRemove = new Set<string>();

        // Collect all rel IDs where element is source
        const sourceSet = this._bySource.get(elementId);
        if (sourceSet) for (const id of sourceSet) toRemove.add(id);

        // Collect all rel IDs where element is target
        const targetSet = this._byTarget.get(elementId);
        if (targetSet) for (const id of targetSet) toRemove.add(id);

        for (const id of toRemove) this.removeRelationship(id);
    }

    /**
     * Reset the graph to empty.
     * Used for full project reload.
     */
    clear(): void {
        this._rels.clear();
        this._bySource.clear();
        this._byTarget.clear();
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /**
     * All relationships where elementId is source OR target.
     * Optionally filtered by relationship type.
     * Complexity: O(k) where k = number of relationships for this element.
     */
    getRelationships(elementId: string, type?: RelationshipType): Relationship[] {
        const ids = new Set<string>();

        const sourceSet = this._bySource.get(elementId);
        if (sourceSet) for (const id of sourceSet) ids.add(id);

        const targetSet = this._byTarget.get(elementId);
        if (targetSet) for (const id of targetSet) ids.add(id);

        const results: Relationship[] = [];
        for (const id of ids) {
            const rel = this._rels.get(id);
            if (rel && (!type || rel.type === type)) results.push(rel);
        }
        return results;
    }

    /**
     * All target IDs reachable from sourceId via the given relationship type.
     * Example: getTargets(wallId, 'hosts') → [doorId, windowId]
     */
    getTargets(sourceId: string, type: RelationshipType): string[] {
        const sourceSet = this._bySource.get(sourceId);
        if (!sourceSet) return [];
        const results: string[] = [];
        for (const id of sourceSet) {
            const rel = this._rels.get(id);
            if (rel && rel.type === type) results.push(rel.targetId);
        }
        return results;
    }

    /**
     * All source IDs pointing TO targetId via the given relationship type.
     * Example: getSources(roomId, 'boundedBy') → [] (boundedBy: room→wall, so check target)
     * Example: getSources(wallId, 'hosts') → [] (hosts: wall→opening, wall is source)
     */
    getSources(targetId: string, type: RelationshipType): string[] {
        const targetSet = this._byTarget.get(targetId);
        if (!targetSet) return [];
        const results: string[] = [];
        for (const id of targetSet) {
            const rel = this._rels.get(id);
            if (rel && rel.type === type) results.push(rel.sourceId);
        }
        return results;
    }

    /**
     * Whether a specific directional relationship exists.
     * Complexity: O(k) where k = source relationships.
     */
    hasRelationship(sourceId: string, targetId: string, type: RelationshipType): boolean {
        return this._findExact(sourceId, targetId, type) !== undefined;
    }

    /**
     * BFS traversal from startId following the given relationship types.
     * Returns all reachable element IDs (not including startId).
     * Follows BOTH source→target and target→source for bidirectional types.
     *
     * @param maxDepth - Maximum traversal depth (default: 10)
     */
    traverse(startId: string, types: RelationshipType[], maxDepth = 10): string[] {
        const visited = new Set<string>([startId]);
        const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
        const results: string[] = [];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (depth >= maxDepth) continue;

            // Follow source → target
            const sourceSet = this._bySource.get(id);
            if (sourceSet) {
                for (const relId of sourceSet) {
                    const rel = this._rels.get(relId);
                    if (rel && types.includes(rel.type) && !visited.has(rel.targetId)) {
                        visited.add(rel.targetId);
                        results.push(rel.targetId);
                        queue.push({ id: rel.targetId, depth: depth + 1 });
                    }
                }
            }

            // Follow target → source (for bidirectional traversal)
            const targetSet = this._byTarget.get(id);
            if (targetSet) {
                for (const relId of targetSet) {
                    const rel = this._rels.get(relId);
                    if (rel && types.includes(rel.type) && !visited.has(rel.sourceId)) {
                        visited.add(rel.sourceId);
                        results.push(rel.sourceId);
                        queue.push({ id: rel.sourceId, depth: depth + 1 });
                    }
                }
            }
        }

        return results;
    }

    /**
     * Total number of relationships in the graph.
     */
    get size(): number {
        return this._rels.size;
    }

    /**
     * All relationships as an array (for iteration).
     */
    getAll(): Relationship[] {
        return Array.from(this._rels.values());
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    /**
     * Serialise the graph to a plain JSON object for ProjectSnapshot.
     */
    serialize(): SemanticGraph {
        return {
            version: 1,
            relationships: Array.from(this._rels.values()),
        };
    }

    /**
     * Restore the graph from a serialised ProjectSnapshot.
     * Clears the graph before loading.
     */
    deserialize(data: SemanticGraph): void {
        this.clear();
        if (!data || !Array.isArray(data.relationships)) return;
        for (const rel of data.relationships) {
            if (rel.id && rel.type && rel.sourceId && rel.targetId) {
                this._rels.set(rel.id, rel);
                this._addToIndex(this._bySource, rel.sourceId, rel.id);
                this._addToIndex(this._byTarget, rel.targetId, rel.id);
            }
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _addToIndex(index: Map<string, Set<string>>, key: string, relId: string): void {
        let set = index.get(key);
        if (!set) { set = new Set(); index.set(key, set); }
        set.add(relId);
    }

    private _removeFromIndex(index: Map<string, Set<string>>, key: string, relId: string): void {
        const set = index.get(key);
        if (!set) return;
        set.delete(relId);
        if (set.size === 0) index.delete(key);
    }

    private _findExact(sourceId: string, targetId: string, type: RelationshipType): Relationship | undefined {
        const sourceSet = this._bySource.get(sourceId);
        if (!sourceSet) return undefined;
        for (const id of sourceSet) {
            const rel = this._rels.get(id);
            if (rel && rel.targetId === targetId && rel.type === type) return rel;
        }
        return undefined;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — imported by commands, DependencyResolver, and WorldModelAdapter. */
export const semanticGraphManager = new SemanticGraphManager();

import { projectScopeRegistry } from './persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'semanticGraphManager',
    clear: () => semanticGraphManager.clear(),
});
