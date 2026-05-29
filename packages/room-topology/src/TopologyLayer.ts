// @migration S91-WIRE: moved from src/topology/TopologyLayer.ts (intra-src L7.5; src/core/ dep blocks Wave-9 package promotion to packages/geometry-kernel/topology/ — deferred)
/**
 * @file src/topology/TopologyLayer.ts
 *
 * TopologyLayer — Contract 01 §1.2 Phase 2 Topology Layer implementation.
 *
 * ## Role in the architecture
 *
 * ```
 * Store Event Bus
 *       ↓
 * Topology Layer  ← reads TopologySpatialIndex + StoreRegistry + ElementRegistry
 *       ↓
 * DependencyResolver (unaffected — topology layer sits alongside, not above)
 *       ↓
 * ElementBuilders
 * ```
 *
 * The Topology Layer is a **read-only side system** that:
 *
 *   1. Subscribes to the `StoreEventBus`. // TODO(TASK-08)
 *   2. Uses `TopologySpatialIndex` (Task 3.1) to maintain a spatial index.
 *   3. Computes adjacency relationships: which elements share endpoints or
 *      are spatially adjacent (wall-to-wall, wall-to-slab, etc.).
 *   4. Emits `TopologyChangeEvent`s via `topologyEventBus` so future World
 *      Model and AI agents can react to topology changes.
 *
 * ## Contract compliance
 *
 *   01-BIM-ENGINE-CORE §1.2 — Topology Layer Phase 2 specification.
 *   01-BIM-ENGINE-CORE §5   — No store mutations, no builder calls.
 *   02-BIM-SPATIAL-PROJECTION §7 — Reads SpatialIndex via TopologySpatialIndex.
 *   03-BIM-SEMANTIC-MODEL §2.7 — Topology reads graph for semantic analysis.
 *   04-BIM-AI-MODIFICATION-PROTOCOL §3.10 — Topology Layer rules.
 *
 * Phase 4 — Task 4.2.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { storeEventBus, StoreChangeEvent } from '@pryzm/core-app-model';
import { topologySpatialIndex } from './TopologySpatialIndex';
import type { BoundingBox } from './TopologySpatialIndex';

// ── Topology Event Bus ────────────────────────────────────────────────────────

/**
 * A topology change event emitted after the topology layer updates its
 * adjacency graph in response to a store change.
 */
export interface TopologyChangeEvent {
    /** Elements whose adjacency changed as a result of this update. */
    affectedIds: ReadonlyArray<string>;
    /** Relationships that were added in this update. */
    added:   ReadonlyArray<AdjacencyRelationship>;
    /** Relationships that were removed in this update. */
    removed: ReadonlyArray<AdjacencyRelationship>;
    readonly timestamp: number;
}

export interface AdjacencyRelationship {
    /** ID of the first element. */
    sourceId: string;
    /** ID of the second element. */
    targetId: string;
    /**
     * Relationship type — mirrors contract RelationshipType values.
     * 'adjacentTo' means the two elements share a face or edge within tolerance.
     * 'intersects'  means their bounding boxes overlap (potential conflict).
     */
    kind: 'adjacentTo' | 'intersects';
}

type TopologyListener = (event: TopologyChangeEvent) => void;

/**
 * Lightweight event bus for topology change notifications.
 * Consumers (World Model, future AI agents) subscribe here.
 */
export class TopologyEventBus {
    private readonly _listeners = new Set<TopologyListener>();

    emit(event: TopologyChangeEvent): void {
        const frozen = Object.freeze({ ...event });
        for (const listener of this._listeners) {
            try {
                listener(frozen);
            } catch (err: any) {
                console.error('[TopologyEventBus] listener error:', err?.message ?? err);
            }
        }
    }

    subscribe(listener: TopologyListener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    get listenerCount(): number {
        return this._listeners.size;
    }
}

/** Global singleton topology event bus. */
export const topologyEventBus = new TopologyEventBus();

// ── AdjacencyGraph ────────────────────────────────────────────────────────────

/**
 * Bidirectional adjacency graph stored as a Map<elementId, Set<elementId>>.
 * Edges are always written in both directions for O(1) forward and reverse lookup.
 */
class AdjacencyGraph {
    private readonly _adj = new Map<string, Set<string>>();
    private readonly _kinds = new Map<string, AdjacencyRelationship['kind']>();

    private _edgeKey(a: string, b: string): string {
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    addEdge(rel: AdjacencyRelationship): void {
        this._getOrCreate(rel.sourceId).add(rel.targetId);
        this._getOrCreate(rel.targetId).add(rel.sourceId);
        this._kinds.set(this._edgeKey(rel.sourceId, rel.targetId), rel.kind);
    }

    removeEdge(sourceId: string, targetId: string): void {
        this._adj.get(sourceId)?.delete(targetId);
        this._adj.get(targetId)?.delete(sourceId);
        this._kinds.delete(this._edgeKey(sourceId, targetId));
    }

    removeElement(id: string): void {
        const neighbours = this._adj.get(id);
        if (neighbours) {
            for (const neighbour of neighbours) {
                this._adj.get(neighbour)?.delete(id);
                this._kinds.delete(this._edgeKey(id, neighbour));
            }
        }
        this._adj.delete(id);
    }

    getNeighbours(id: string): ReadonlySet<string> {
        return this._adj.get(id) ?? _EMPTY_SET;
    }

    getKind(a: string, b: string): AdjacencyRelationship['kind'] | undefined {
        return this._kinds.get(this._edgeKey(a, b));
    }

    getEdges(id: string): AdjacencyRelationship[] {
        const neighbours = this._adj.get(id);
        if (!neighbours) return [];
        const result: AdjacencyRelationship[] = [];
        for (const n of neighbours) {
            const kind = this._kinds.get(this._edgeKey(id, n)) ?? 'adjacentTo';
            result.push({ sourceId: id, targetId: n, kind });
        }
        return result;
    }

    clear(): void {
        this._adj.clear();
        this._kinds.clear();
    }

    private _getOrCreate(id: string): Set<string> {
        let s = this._adj.get(id);
        if (!s) { s = new Set<string>(); this._adj.set(id, s); }
        return s;
    }

    get elementCount(): number {
        return this._adj.size;
    }
}

const _EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

// ── TopologyLayer ─────────────────────────────────────────────────────────────

/**
 * Adjacency tolerance in metres.
 * Two elements are considered adjacent when their bounding boxes are within
 * this distance of each other — accommodating typical wall-thickness offsets.
 */
const ADJACENCY_TOLERANCE_M = 0.05; // 5 cm

/**
 * TopologyLayer — full Phase 2 topology implementation.
 *
 * Lifecycle:
 *   1. `new TopologyLayer()` — subscribes to StoreEventBus. // TODO(TASK-08)
 *   2. Call `setScene(scene)` once from initScene after world is ready.
 *   3. Queries are available via `getAdjacentElements()` / `findIntersecting()`.
 */
export class TopologyLayer {

    private readonly _adjacency = new AdjacencyGraph();

    /** Whether the topology needs a full rebuild. Set by bulk events. */
    private _dirty = true;

    private _scene: THREE.Scene | null = null;

    /** DOM events that force a full rebuild on next query (mirrors other indices). */
    private static readonly INVALIDATING_EVENTS = [
        'model-updated',
        'ai-model-update',
        'bim-project-cleared',
        'bim-level-added',
        'bim-level-removed',
        'clear-project',
        'project-loaded',
    ] as const;

    constructor() {
        // ── StoreEventBus subscription ───────────────────────────────────────
        storeEventBus.subscribe((event) => this._handleStoreChange(event));

        // ── DOM bulk-invalidation ────────────────────────────────────────────
        // §SCC-NODE-LOAD (2026-05-29): same guard as TopologySpatialIndex.
        // Without it, the module's singleton would throw `window is not
        // defined` at barrel import time in Node tests.
        if (typeof window === 'undefined') return;

        for (const name of TopologyLayer.INVALIDATING_EVENTS) {
            window.addEventListener(name, () => { this._dirty = true; });
        }

        // Cast to avoid augmenting Window here (already declared in src/global-window.d.ts).
        (window as unknown as Record<string, unknown>).__topologyLayer = this;
    }

    // ── Scene injection ───────────────────────────────────────────────────────

    /**
     * Provide the Three.js scene. Call once from initScene after world is ready.
     * The spatial index uses this to build element bounds.
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
        this._dirty = true;
        console.log('[TopologyLayer] Scene bound — topology ready for queries.');
    }

    // ── Public query API (Contract 01 §1.2) ──────────────────────────────────

    /**
     * Returns all element IDs spatially adjacent to the given element.
     * O(k) where k = number of neighbours (typically < 10 for BIM elements).
     */
    getAdjacentElements(elementId: string): string[] {
        this._ensureFresh();
        return Array.from(this._adjacency.getNeighbours(elementId));
    }

    /**
     * Returns all element IDs whose bounding boxes intersect the given element's
     * bounding box. Excludes the element itself.
     * O(log n + k).
     */
    findIntersecting(elementId: string): string[] {
        this._ensureFresh();
        return topologySpatialIndex.findIntersecting(elementId);
    }

    /**
     * Returns elements within `radius` metres of `elementId`.
     * O(log n + k).
     */
    findNearby(elementId: string, radius: number): string[] {
        this._ensureFresh();
        return topologySpatialIndex.findNearby(elementId, radius);
    }

    /**
     * Returns elements at the given world point.
     */
    findAtPoint(point: [number, number, number]): string[] {
        this._ensureFresh();
        return topologySpatialIndex.queryPoint(point);
    }

    /**
     * Returns the bounds of `elementId` from the spatial index.
     */
    getBounds(elementId: string): BoundingBox | undefined {
        return topologySpatialIndex.getBounds(elementId);
    }

    /**
     * Returns all adjacency relationships for `elementId`.
     */
    getAdjacencyRelationships(elementId: string): AdjacencyRelationship[] {
        this._ensureFresh();
        return this._adjacency.getEdges(elementId);
    }

    /**
     * Returns total number of elements tracked in the topology graph.
     */
    get elementCount(): number {
        return this._adjacency.elementCount;
    }

    // ── Private — store event handling ────────────────────────────────────────

    private _handleStoreChange(event: StoreChangeEvent): void {
        if (event.operation === 'delete') {
            // Immediate removal: compute the removed edges so we can emit them.
            const removed = this._adjacency.getEdges(event.elementId).slice();
            this._adjacency.removeElement(event.elementId);

            if (removed.length > 0) {
                topologyEventBus.emit({
                    affectedIds: [event.elementId, ...removed.map(r => r.targetId)],
                    added:   [],
                    removed,
                    timestamp: Date.now(),
                });
            }
        } else {
            // Create / update: defer full rebuild to next query so the Builder
            // has time to update scene geometry before we scan bounds.
            this._dirty = true;
        }
    }

    // ── Private — lazy adjacency rebuild ─────────────────────────────────────

    /**
     * Ensures the adjacency graph is up to date.
     * On dirty flag: runs an incremental pass that recomputes all adjacency
     * from the current spatial index state.
     *
     * The spatial index itself is lazily rebuilt on first query — so calling
     * _ensureFresh() triggers both a spatial-index rebuild (if needed) and
     * an adjacency rebuild.
     */
    private _ensureFresh(): void {
        if (!this._dirty) return;

        const prevEdgeCount = this._adjacency.elementCount;
        this._adjacency.clear();

        const added:   AdjacencyRelationship[] = [];
        const changed: Set<string> = new Set();

        // The spatial index holds all registered element IDs — iterate them.
        // We have no direct iterator on the index, but we can use queryBounds
        // over the full scene extent.
        if (!this._scene) {
            this._dirty = false;
            return;
        }

        // Collect all element IDs from scene children (O(N_groups))
        const elementIds: string[] = [];
        for (const child of this._scene.children) {
            const id: string | undefined = child.userData?.id;
            if (!id) continue;
            if (child.userData?.isPreview === true) continue;
            if (child.userData?.isHelper === true) continue;
            elementIds.push(id);
        }

        // For each element, find spatially nearby elements and classify
        for (const id of elementIds) {
            const nearby = topologySpatialIndex.findNearby(id, ADJACENCY_TOLERANCE_M * 20);
            for (const otherId of nearby) {
                if (otherId === id) continue;
                // Avoid double-processing (a,b) and (b,a)
                if (otherId < id) continue;

                const boundsA = topologySpatialIndex.getBounds(id);
                const boundsB = topologySpatialIndex.getBounds(otherId);
                if (!boundsA || !boundsB) continue;

                const kind = this._classifyRelationship(boundsA, boundsB);
                if (kind) {
                    const rel: AdjacencyRelationship = { sourceId: id, targetId: otherId, kind };
                    this._adjacency.addEdge(rel);
                    added.push(rel);
                    changed.add(id);
                    changed.add(otherId);
                }
            }
        }

        this._dirty = false;

        if (added.length > 0 || prevEdgeCount > 0) {
            topologyEventBus.emit({
                affectedIds: Array.from(changed),
                added,
                removed: [],
                timestamp: Date.now(),
            });
        }

        console.log(
            `[TopologyLayer] Adjacency rebuilt — ${elementIds.length} element(s), ` +
            `${added.length} adjacency edge(s).`,
        );
    }

    /**
     * Contract 45 §6 — Phase 5: project-scoped clear.
     *
     * Wipes the adjacency graph and marks the layer dirty so the next
     * _ensureFresh() rebuild starts from a clean slate. The spatial index
     * itself is registered separately (see TopologySpatialIndex.ts).
     */
    clear(): void {
        this._adjacency.clear();
        this._dirty = true;
    }

    /**
     * Classify the spatial relationship between two bounding boxes.
     * Returns null if the elements are not adjacent.
     */
    private _classifyRelationship(
        a: BoundingBox,
        b: BoundingBox,
    ): AdjacencyRelationship['kind'] | null {
        // Check for actual overlap (intersection)
        const overlaps = (
            a.max[0] >= b.min[0] && a.min[0] <= b.max[0] &&
            a.max[1] >= b.min[1] && a.min[1] <= b.max[1] &&
            a.max[2] >= b.min[2] && a.min[2] <= b.max[2]
        );
        if (overlaps) return 'intersects';

        // Check for near-adjacency within tolerance on all three axes
        const gapX = Math.max(0, Math.max(b.min[0] - a.max[0], a.min[0] - b.max[0]));
        const gapY = Math.max(0, Math.max(b.min[1] - a.max[1], a.min[1] - b.max[1]));
        const gapZ = Math.max(0, Math.max(b.min[2] - a.max[2], a.min[2] - b.max[2]));

        const maxGap = Math.max(gapX, gapZ); // XZ plane adjacency (walls, columns)
        if (maxGap <= ADJACENCY_TOLERANCE_M && gapY < 0.3) return 'adjacentTo';

        return null;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global TopologyLayer singleton.
 *
 * Usage:
 *   import { topologyLayer } from './TopologyLayer';
 *   topologyLayer.setScene(scene);                         // initScene
 *   topologyLayer.getAdjacentElements('wall_123');         // snap, constraints
 */
export const topologyLayer = new TopologyLayer();

// ── Contract 45 §6 — Phase 5: project-scope registration ──────────────────────
// The TopologyLayer holds derived adjacency data keyed by element IDs from
// the active project. Switching projects must wipe it so the next rebuild
// starts from the new project's geometry only.
import { projectScopeRegistry } from '@pryzm/core-app-model/persistence';
projectScopeRegistry.register({
    scopeName: 'topologyLayer',
    clear: () => topologyLayer.clear(),
});
