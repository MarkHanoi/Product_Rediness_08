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
 *   1. Subscribes to the `StoreEventBus`.
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
import { realElementIdOf, isRenderAggregateId, RENDER_AGGREGATE_ID_PREFIX } from '@pryzm/core-app-model/render-aggregate-identity';
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

    /**
     * §WALL30-ADJ-DELTA (L-10521) — every edge exactly once, canonicalised.
     *
     * The rebuild in `TopologyLayer._ensureFresh()` had no way to say WHICH
     * relationships it had just stopped believing in, because nothing could
     * enumerate the graph. `getEdges(id)` answers per element and double-counts
     * across the pair; this returns the `a|b` canonical key set, which is what a
     * before/after diff needs.
     */
    allEdgeKeys(): Set<string> {
        const keys = new Set<string>();
        for (const [id, neighbours] of this._adj) {
            for (const n of neighbours) keys.add(this._edgeKey(id, n));
        }
        return keys;
    }

    /** Canonical `a|b` key for one pair — public so the rebuild diff can build
     *  the same keys `allEdgeKeys()` returns without duplicating the rule. */
    edgeKeyFor(a: string, b: string): string {
        return this._edgeKey(a, b);
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

        // ⭐ §WALL30-ADJ-DELTA (L-10521) — WHAT THIS REBUILD STOPPED BELIEVING.
        //
        // Founder, 2026-08-24, two consecutive lines from one wall move:
        //     [TopologyLayer] Adjacency rebuilt — 9 element(s), 6 adjacency edge(s)
        //     [TopologyLayer] Adjacency rebuilt — 9 element(s), 5 adjacency edge(s)
        // Same nine elements, one fewer relationship. A join disappeared and the
        // ONLY trace was a smaller integer — nobody could say which pair, and the
        // event this method emits declared `removed: []` while it was happening.
        //
        // Two facts were missing and both are recoverable here, because the graph
        // is fully rebuilt from scratch every time:
        //   1. WHICH pair(s) went, by name — printed below.
        //   2. That any went at all, ON THE BUS — `removed` was hard-coded `[]`,
        //      so a rebuild could delete every edge in the model and every
        //      subscriber would be told only about additions.
        //
        // ⚠ MEASURED, and stated as such: this diff SAYS a pair is no longer
        // adjacent. It does not say the join was lost WRONGLY — a wall genuinely
        // dragged away from its neighbour SHOULD lose the edge. Distinguishing
        // those is the reweld's job (see `WallMoveReweldService`
        // §MOVE-REWELD-DISPATCH); this line exists so the question can be asked
        // about a named pair instead of an integer.
        const prevEdgeKeys = this._adjacency.allEdgeKeys();
        // ⚠ `prevEdgeCount` used to be assigned `elementCount` — the number of
        // NODES with at least one neighbour, under a name that says EDGES. It is
        // only read as a `> 0` emit guard so nothing broke, but the guard now
        // uses the quantity it names.
        const prevEdgeCount = prevEdgeKeys.size;
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
        //
        // ⭐ §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT (L-10530) — THE FOUNDER'S `bc3aa61b`
        // CONSOLE LINE. This loop read `child.userData?.id` and filtered only
        // `isPreview` / `isHelper`, so `InstancedElementRenderer` batches entered
        // the graph as NODES under their synthetic `instanced-group-<key>` handle:
        //
        //   ⚠ 2 LOST since the last rebuild
        //   [instanced-group-wall_L0_36_24_0.500_0.500_0.500_60d1ae8d-… ↔ wall_01M0TREP…,
        //    instanced-group-wall_L0_36_24_0.500_0.500_0.500_60d1ae8d-… ↔ wall_01M0TRE4…]
        //
        // That is a GPU InstancedMesh batch — a geometry+material+level CACHE KEY —
        // sitting beside real wall ids as an adjacency participant. It also inflated
        // the `N element(s)` this method prints, and `getAdjacentElements('wall_X')`
        // returned it to every caller: the building graph (`extractTopologySnapshot`),
        // room adjacency, the AI world model. C71 §1.1 — an edge is a record of a
        // relationship that came into being; a render batch is in no relationship
        // with anything, it IS the thing.
        //
        // `realElementIdOf` is the ONE predicate (`@pryzm/core-app-model/
        // render-aggregate-identity`); `ProjectIsolationAudit` hit this same seam at
        // §C13-INSTANCED-GROUP-ARM. Do not re-roll the test here.
        const elementIds: string[] = [];
        /** §WJFIX92 F-4 — id → the node's own `elementType`/`type`, for the lost-edge hint. */
        const typeById = new Map<string, string>();
        let syntheticUnmarked = 0;
        const syntheticSample: string[] = [];
        for (const child of this._scene.children) {
            if (child.userData?.isPreview === true) continue;
            if (child.userData?.isHelper === true) continue;

            // ── TRIPWIRE (§TOPO-AGGREGATE-IS-NOT-AN-ELEMENT) ──────────────────
            // Two INDEPENDENT axes answer "is this a render aggregate?": the
            // authoritative `userData.isInstancedGroup` flag, and the id prefix.
            // They agree for every object `InstancedElementRenderer` mints. An
            // object bearing a synthetic id WITHOUT the flag is a NEW producer
            // that forgot the marker — the next recurrence of this defect — and it
            // is named here, at the moment it is rejected, rather than discovered
            // in a console six months later.
            const rawId: unknown = child.userData?.id;
            if (isRenderAggregateId(rawId) && child.userData?.isInstancedGroup !== true) {
                syntheticUnmarked++;
                if (syntheticSample.length < 4) syntheticSample.push(String(rawId));
            }

            const id = realElementIdOf(child);
            if (!id) continue;
            elementIds.push(id);
            // §WJFIX92 F-4 (L-11313) — remember WHAT each node is, in the loop that
            // already visits it. The §WALL30-ADJ-DELTA hint below used to send every lost
            // edge to the re-weld engine; the re-weld engine only handles WALL↔WALL, so
            // for any other pair that hint pointed the reader at a subsystem that cannot,
            // by design, have anything to do with the loss. `WallFragmentBuilder` stamps
            // a wall group `elementType: 'wall'` (non-writable, :1096-1108), so this is a
            // read of the identity the producer already locked, not a new inference.
            const _t = child.userData?.elementType ?? child.userData?.type;
            if (typeof _t === 'string') typeById.set(id, _t);
        }

        if (syntheticUnmarked > 0) {
            console.error(
                `[TopologyLayer] ⛔ §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT — ${syntheticUnmarked} scene ` +
                `object(s) carry a synthetic render id but NOT userData.isInstancedGroup ` +
                `[${syntheticSample.join(', ')}]. A producer is minting an ` +
                `\`${RENDER_AGGREGATE_ID_PREFIX}…\` id without the opt-in marker. They were kept ` +
                `OUT of the topology graph by the id arm, but every other consumer that ` +
                `filters on the FLAG alone is currently treating them as BIM elements. ` +
                `Fix the producer — stamp isInstancedGroup — do not widen this check.`,
            );
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

        // §WALL30-ADJ-DELTA (L-10521) — the pairs this rebuild no longer holds.
        // `added` is every edge the fresh scan produced, so anything in the
        // previous key set that is absent from it is a relationship that has
        // GONE. Reconstructed as real `AdjacencyRelationship`s (kind unknowable
        // after the fact — the pair is what matters, and 'adjacentTo' is the
        // conservative label) so subscribers get the same shape the delete path
        // at `_handleStoreChange` already gives them.
        const nextEdgeKeys = new Set<string>(
            added.map(r => this._adjacency.edgeKeyFor(r.sourceId, r.targetId)),
        );
        const removed: AdjacencyRelationship[] = [];
        for (const key of prevEdgeKeys) {
            if (nextEdgeKeys.has(key)) continue;
            const sep = key.indexOf('|');
            const a = key.slice(0, sep);
            const b = key.slice(sep + 1);
            removed.push({ sourceId: a, targetId: b, kind: 'adjacentTo' });
            changed.add(a);
            changed.add(b);
        }

        if (added.length > 0 || prevEdgeCount > 0) {
            topologyEventBus.emit({
                affectedIds: Array.from(changed),
                added,
                // ⛔ Was hard-coded `[]`. A rebuild that drops a join is the one
                // event a topology subscriber most needs, and it was the one
                // this bus structurally could not carry.
                removed,
                timestamp: Date.now(),
            });
        }

        console.log(
            `[TopologyLayer] Adjacency rebuilt — ${elementIds.length} element(s), ` +
            `${added.length} adjacency edge(s)` +
            (removed.length > 0
                // ⭐ THE LINE THE FOUNDER'S 6→5 NEEDED. Named pairs, capped so a
                // project-load rebuild (where every edge is legitimately "new")
                // cannot turn one console line into a wall of text.
                ? `, ⚠ ${removed.length} LOST since the last rebuild ` +
                  `[${removed.slice(0, 8).map(r => `${r.sourceId}↔${r.targetId}`).join(', ')}` +
                  `${removed.length > 8 ? `, +${removed.length - 8} more` : ''}]` +
                  ` — §WALL30-ADJ-DELTA: ` + this._lostEdgeHint(removed, typeById)
                : '.'),
        );
    }

    /**
     * §WJFIX92 F-4 (L-11313) — TELL THE TRUTH ABOUT WHAT A LOST EDGE MEANS.
     *
     * This hint used to read, unconditionally: *"a lost edge is EITHER a wall genuinely
     * moved apart OR a join the re-weld failed to close; check §MOVE-REWELD-DISPATCH for
     * these ids."* For a WALL↔WALL pair that is exactly right and is kept verbatim.
     *
     * For every OTHER pair it is false, and expensively so. These edges come from a
     * bbox-proximity scan (`_classifyRelationship`, above) that is entirely element-type
     * agnostic, so window↔wall, stair↔wall, railing↔wall and curtainwall↔floor all land
     * here — and `WallMoveReweldService` handles NONE of them: it is wall-only by design
     * and its displacement gate (`MIN_MOVE_M`) rejects an opening-value edit outright.
     * The WINJOINT91 investigation lost time following this exact hint from a window↔wall
     * loss into the weld engine, which is where it says to look and where nothing was; the
     * founder's own console said the same thing to him. (L-10830's shape: a diagnostic that
     * names a subsystem it has not checked is worse than one that names none.)
     *
     * A hosted-element loss is a SYMPTOM of the host being rebuilt — the group's bounds
     * changed under the scan — so the honest instruction is to look at the host's rebuild.
     */
    private _lostEdgeHint(
        removed: ReadonlyArray<AdjacencyRelationship>,
        typeById: ReadonlyMap<string, string>,
    ): string {
        const isWall = (id: string): boolean => typeById.get(id) === 'wall';
        const wallWall = removed.filter(r => isWall(r.sourceId) && isWall(r.targetId));
        const other    = removed.filter(r => !(isWall(r.sourceId) && isWall(r.targetId)));
        const parts: string[] = [];
        if (wallWall.length > 0) {
            parts.push(
                `${wallWall.length} wall↔wall — EITHER a wall genuinely moved apart OR a join ` +
                `the re-weld failed to close; check §MOVE-REWELD-DISPATCH for those ids`,
            );
        }
        if (other.length > 0) {
            const kinds = new Set(
                other.map(r => `${typeById.get(r.sourceId) ?? '?'}↔${typeById.get(r.targetId) ?? '?'}`),
            );
            parts.push(
                `${other.length} NON-wall↔wall [${[...kinds].slice(0, 4).join(', ')}] — these are ` +
                `bbox adjacencies of hosted/other-family elements, which the re-weld engine does ` +
                `NOT handle by design (wall-only arms + a MIN_MOVE_M displacement gate). ` +
                `⛔ Do NOT look at §MOVE-REWELD-DISPATCH for them: the loss is a SYMPTOM of the ` +
                `HOST/neighbour being rebuilt (its group bounds moved under this scan) — look at ` +
                `that element's rebuild path instead`,
            );
        }
        return `${parts.join('; ')}.`;
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
