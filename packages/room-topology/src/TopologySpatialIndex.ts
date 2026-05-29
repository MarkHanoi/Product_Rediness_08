// @migration S91-WIRE: moved from src/topology/TopologySpatialIndex.ts (intra-src L7.5)
import * as THREE from '@pryzm/renderer-three/three';
import { storeEventBus } from '@pryzm/core-app-model';

/**
 * @file src/topology/TopologySpatialIndex.ts
 *
 * TopologySpatialIndex — 3D spatial index for the Topology Layer.
 *
 * Adapts Pascal's SpatialGrid (Pascal/packages/core/src/hooks/spatial-grid/)
 * to the Contract 02 §7.2 SpatialIndex interface, with the following additions:
 *
 *   • Builds from the Three.js scene (O(N_groups), direct children only — no
 *     recursive traverse) so it tracks what the GPU actually sees.
 *   • Lazy invalidation: StoreEventBus `delete` events immediately remove the // TODO(TASK-08)
 *     element; `create`/`update` events mark the index dirty so it rebuilds from
 *     scene on the next query — by which time the Builder will have updated the
 *     scene graph.
 *   • DOM events from the INVALIDATING_EVENTS list also mark dirty (same events
 *     used by SceneBoundsCache), ensuring project-load and AI-update cycles
 *     trigger a rebuild.
 *   • Self-registers on window.__topologySpatialIndex for build-system access.
 *
 * ## Performance characteristics (Pascal SpatialGrid algorithm)
 *   insert / update / remove : O(cells covered by AABB) — typically 1–4 cells
 *   queryBounds              : O(log n + k) — cell lookup + filter
 *   queryPoint               : O(1) — single cell lookup
 *   findNearby / Nearest     : O(log n + k) — expanding radius
 *
 * Contract:
 *   01-BIM-ENGINE-CORE §5 — No store mutations; no Builder calls.
 *   02-BIM-SPATIAL-PROJECTION §7.2 — Implements the required SpatialIndex interface.
 *   03-BIM-SEMANTIC-MODEL §3 — No direct store reads; scene traversal only.
 *
 * Phase 3 Performance — Task 3.1.
 */

// ── BoundingBox type (Contract 02 §2.2) ──────────────────────────────────────

/**
 * World-space 3D axis-aligned bounding box.
 * All values are in metres (PRYZM world units).
 */
export interface BoundingBox {
    min: [number, number, number];
    max: [number, number, number];
}

// ── Internal types ────────────────────────────────────────────────────────────

type CellKey = `${number},${number}`;

// ── TopologySpatialIndex ──────────────────────────────────────────────────────

export class TopologySpatialIndex {

    /**
     * XZ cell size in world units (metres).
     * 1.0 m is optimal for BIM elements: most walls/doors/windows have a
     * footprint smaller than 1 m in one axis.  Rooms and slabs span many cells
     * but the index handles this correctly via multi-cell registration.
     */
    private readonly _cellSize: number;

    /** cell key → set of element IDs occupying that cell. */
    private readonly _cells = new Map<CellKey, Set<string>>();

    /** element ID → the cells it occupies (reverse lookup for fast remove). */
    private readonly _elementCells = new Map<string, Set<CellKey>>();

    /** element ID → its current BoundingBox (authoritative after last rebuild). */
    private readonly _elementBounds = new Map<string, BoundingBox>();

    /** The Three.js scene used for lazy rebuilds. */
    private _scene: THREE.Scene | null = null;

    /** True when the index must be rebuilt before the next query. */
    private _dirty = true;

    /** DOM events that force a full rebuild on next query. */
    private static readonly INVALIDATING_EVENTS = [
        'model-updated',
        'ai-model-update',
        'bim-project-cleared',
        'bim-level-added',
        'bim-level-removed',
        'clear-project',
        'project-loaded',
    ] as const;

    constructor(cellSize = 1.0) {
        this._cellSize = cellSize;

        // ── StoreEventBus subscription ───────────────────────────────────────
        // delete  → remove immediately (element is gone from the scene now)
        // create/update → mark dirty; geometry may not be ready yet (Builder
        //                 runs after the store event, so we defer to next query)
        storeEventBus.subscribe((event) => {
            if (event.operation === 'delete') {
                this.remove(event.elementId);
            } else {
                this._dirty = true;
            }
        });

        // ── DOM invalidation (matches SceneBoundsCache INVALIDATING_EVENTS) ──
        // §SCC-NODE-LOAD (2026-05-29): the module's singleton may instantiate
        // at barrel import time. In a Node test env (no `window`), the
        // window.addEventListener + window-mutation below threw at module
        // load (well-known SCC-barrel issue, memory note
        // `scc-no-barrel-access-at-module-load`). Skip the DOM bindings when
        // there's no window — the spatial index then just works as an in-
        // memory data structure, which is exactly what tests need.
        if (typeof window === 'undefined') return;

        const invalidate = () => { this._dirty = true; };
        for (const name of TopologySpatialIndex.INVALIDATING_EVENTS) {
            window.addEventListener(name, invalidate);
        }

        // Cast to avoid augmenting Window here (already declared in src/global-window.d.ts).
        (window as unknown as Record<string, unknown>).__topologySpatialIndex = this;
    }

    // ── Scene injection ───────────────────────────────────────────────────────

    /**
     * Provide the Three.js scene from which element bounds are extracted on
     * lazy rebuild. Call this once from initScene after the world is ready.
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
        this._dirty = true;
    }

    // ── Contract 02 §7.2 — Mutation operations ────────────────────────────────

    /**
     * Register an element and its BoundingBox in the index.
     * Re-indexes the element if it already exists (update semantics).
     * O(cells covered by AABB) — typically 1–4 cells for BIM elements.
     */
    insert(elementId: string, bounds: BoundingBox): void {
        this._removeById(elementId);

        this._elementBounds.set(elementId, bounds);
        const keys = this._getCellKeys(bounds);
        this._elementCells.set(elementId, new Set(keys));

        for (const key of keys) {
            let cell = this._cells.get(key);
            if (!cell) {
                cell = new Set<string>();
                this._cells.set(key, cell);
            }
            cell.add(elementId);
        }
    }

    /**
     * Update an element's bounding box. Equivalent to remove + insert.
     */
    update(elementId: string, bounds: BoundingBox): void {
        this.insert(elementId, bounds);
    }

    /**
     * Remove an element from the index.
     * No-op if the element is not registered.
     */
    remove(elementId: string): void {
        this._removeById(elementId);
    }

    /**
     * Rebuild the entire index from a caller-supplied bounds map.
     * Used by batch processes (e.g., project load, AI rebuild).
     */
    rebuild(elements: Map<string, BoundingBox>): void {
        this.clear();
        for (const [id, bounds] of elements) {
            this.insert(id, bounds);
        }
        this._dirty = false;
    }

    /**
     * Reset the index to empty.
     */
    clear(): void {
        this._cells.clear();
        this._elementCells.clear();
        this._elementBounds.clear();
    }

    // ── Contract 02 §7.2 — Query operations ──────────────────────────────────

    /**
     * Returns IDs of all elements whose AABB intersects the given bounds.
     * O(log n + k) where k = number of results.
     */
    queryBounds(bounds: BoundingBox): string[] {
        this._ensureFresh();
        const candidates = new Set<string>();
        for (const key of this._getCellKeys(bounds)) {
            const cell = this._cells.get(key);
            if (cell) {
                for (const id of cell) candidates.add(id);
            }
        }
        return Array.from(candidates).filter((id) => {
            const b = this._elementBounds.get(id);
            return b !== undefined && this._intersects(bounds, b);
        });
    }

    /**
     * Returns IDs of all elements whose AABB contains the given 3D point.
     * O(1) — single cell lookup + linear scan of that cell (usually ≤ 4 items).
     */
    queryPoint(point: [number, number, number]): string[] {
        this._ensureFresh();
        const [x, y, z] = point;
        const key = this._cellKey(
            Math.floor(x / this._cellSize),
            Math.floor(z / this._cellSize),
        );
        const cell = this._cells.get(key);
        if (!cell) return [];
        return Array.from(cell).filter((id) => {
            const b = this._elementBounds.get(id);
            if (!b) return false;
            return (
                x >= b.min[0] && x <= b.max[0] &&
                y >= b.min[1] && y <= b.max[1] &&
                z >= b.min[2] && z <= b.max[2]
            );
        });
    }

    /**
     * Returns IDs of all elements that intersect the given element's AABB,
     * excluding the element itself.
     * O(log n + k).
     */
    findIntersecting(elementId: string): string[] {
        this._ensureFresh();
        const bounds = this._elementBounds.get(elementId);
        if (!bounds) return [];
        return this.queryBounds(bounds).filter((id) => id !== elementId);
    }

    /**
     * Returns IDs of all elements whose centroid is within `radius` metres of
     * the given element's centroid, excluding the element itself.
     * O(log n + k).
     */
    findNearby(elementId: string, radius: number): string[] {
        this._ensureFresh();
        const bounds = this._elementBounds.get(elementId);
        if (!bounds) return [];
        const cx = (bounds.min[0] + bounds.max[0]) / 2;
        const cz = (bounds.min[2] + bounds.max[2]) / 2;
        return this._queryRadius(cx, cz, radius).filter((id) => id !== elementId);
    }

    /**
     * Returns up to `limit` element IDs nearest to the given 3D point,
     * sorted by XZ centroid distance (ascending).
     * O(log n + k).
     */
    findNearest(point: [number, number, number], limit = 10): string[] {
        this._ensureFresh();
        const [x, , z] = point;

        let radius = this._cellSize * 2;
        let candidates: string[] = [];

        // Expand the search radius until we have enough candidates or hit 1 km.
        while (candidates.length < limit && radius < 1000) {
            candidates = this._queryRadius(x, z, radius);
            radius *= 2;
        }

        // Sort by XZ centroid distance and return up to `limit` results.
        return candidates
            .sort((a, b) => this._centroidDist(a, x, z) - this._centroidDist(b, x, z))
            .slice(0, limit);
    }

    // ── Public helpers ────────────────────────────────────────────────────────

    /**
     * Number of elements currently indexed.
     */
    get size(): number {
        return this._elementBounds.size;
    }

    /**
     * Returns the stored BoundingBox for `elementId`, or undefined.
     */
    getBounds(elementId: string): BoundingBox | undefined {
        return this._elementBounds.get(elementId);
    }

    /**
     * Force the index to mark itself dirty. The next query will trigger a
     * full rebuild from scene. Useful after batch geometry mutations.
     */
    invalidate(): void {
        this._dirty = true;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Lazy rebuild: if the index is dirty, scan direct scene children and
     * extract their world-space bounding boxes. Only visits top-level groups —
     * no recursive traverse — so it is O(N_groups), not O(N_nodes).
     */
    private _ensureFresh(): void {
        if (!this._dirty) return;
        if (!this._scene) {
            this._dirty = false;
            return;
        }

        const newBounds = new Map<string, BoundingBox>();
        const box = new THREE.Box3();

        for (const child of this._scene.children) {
            const id: string | undefined = child.userData?.id;
            if (!id) continue;
            if (child.userData?.isPreview === true) continue;
            if (child.userData?.isHelper === true) continue;

            box.setFromObject(child);
            if (box.isEmpty()) continue;

            newBounds.set(id, {
                min: [box.min.x, box.min.y, box.min.z],
                max: [box.max.x, box.max.y, box.max.z],
            });
        }

        this.rebuild(newBounds);
        this._dirty = false;

        console.log(
            `[TopologySpatialIndex] Rebuilt — ${newBounds.size} element(s) indexed.`,
        );
    }

    /** Remove an element by ID from all internal maps. */
    private _removeById(elementId: string): void {
        const prevCells = this._elementCells.get(elementId);
        if (!prevCells) return;

        for (const key of prevCells) {
            const cell = this._cells.get(key);
            if (cell) {
                cell.delete(elementId);
                if (cell.size === 0) this._cells.delete(key);
            }
        }

        this._elementCells.delete(elementId);
        this._elementBounds.delete(elementId);
    }

    /**
     * Returns all cell keys that the given bounding box overlaps.
     * Uses the XZ plane (Y is vertical in PRYZM; cells are 2D XZ slices).
     */
    private _getCellKeys(bounds: BoundingBox): CellKey[] {
        const minCX = Math.floor(bounds.min[0] / this._cellSize);
        const maxCX = Math.floor(bounds.max[0] / this._cellSize);
        const minCZ = Math.floor(bounds.min[2] / this._cellSize);
        const maxCZ = Math.floor(bounds.max[2] / this._cellSize);

        const keys: CellKey[] = [];
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                keys.push(this._cellKey(cx, cz));
            }
        }
        return keys;
    }

    private _cellKey(cx: number, cz: number): CellKey {
        return `${cx},${cz}` as CellKey;
    }

    /** Returns true if two BoundingBoxes intersect (all three axes). */
    private _intersects(a: BoundingBox, b: BoundingBox): boolean {
        return (
            a.max[0] >= b.min[0] && a.min[0] <= b.max[0] &&
            a.max[1] >= b.min[1] && a.min[1] <= b.max[1] &&
            a.max[2] >= b.min[2] && a.min[2] <= b.max[2]
        );
    }

    /**
     * Returns all element IDs whose XZ centroid is within `radius` metres of
     * the XZ point (x, z). Pure cell-expansion algorithm from Pascal SpatialGrid.
     */
    private _queryRadius(x: number, z: number, radius: number): string[] {
        const cellRadius = Math.ceil(radius / this._cellSize);
        const baseCX = Math.floor(x / this._cellSize);
        const baseCZ = Math.floor(z / this._cellSize);
        const found = new Set<string>();

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const cell = this._cells.get(
                    this._cellKey(baseCX + dx, baseCZ + dz),
                );
                if (cell) {
                    for (const id of cell) found.add(id);
                }
            }
        }

        return Array.from(found);
    }

    /** XZ centroid distance from element `id` to the point (x, z). */
    private _centroidDist(id: string, x: number, z: number): number {
        const b = this._elementBounds.get(id);
        if (!b) return Infinity;
        const cx = (b.min[0] + b.max[0]) / 2;
        const cz = (b.min[2] + b.max[2]) / 2;
        return Math.sqrt((cx - x) ** 2 + (cz - z) ** 2);
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global topology spatial index singleton.
 *
 * - initScene wires the Three.js scene via topologySpatialIndex.setScene()
 * - storeEventBus subscription is set up in the constructor above
 * - Consumers (topology queries, snap, adjacency) import this singleton
 *
 * DO NOT modify this directly — use the public API only.
 */
export const topologySpatialIndex = new TopologySpatialIndex(1.0);

// ── Contract 45 §6 — Phase 5: project-scope registration ──────────────────────
// Spatial index cells are keyed by element AABBs from the current project.
// On project switch the cells must be wiped and the dirty flag set so the next
// query rebuilds from the new project's scene.
import { projectScopeRegistry } from '@pryzm/core-app-model/persistence';
projectScopeRegistry.register({
    scopeName: 'topologySpatialIndex',
    clear: () => topologySpatialIndex.clear(),
});
