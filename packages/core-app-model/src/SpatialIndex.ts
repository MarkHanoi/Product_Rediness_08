/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Spatial Index (NEW FILE)
 * Phase:             Phase D — D-5
 * Files Modified:    src/core/SpatialIndex.ts (new)
 * Classification:    A
 *
 * Contract:
 *   PRYZM_MASTER_ROADMAP_2026.md § D-5
 *
 * Impact Assessment:
 *   Store Reads:      NO — pure data structure
 *   Store Writes:     NO — pure data structure
 *   Event Bus:        NO
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low (pure data structure, no side effects)
 * Rationale:
 *   Replaces O(n) full scans in point-in-room queries with a grid-based spatial
 *   index. Uses 5m cells (tuned for typical BIM room sizes of 10–50 m²).
 *   Target: <5ms for 500-room models (vs ~80ms for linear scan).
 *
 *   Coordinate system: XZ plane (Y is vertical in PRYZM's THREE.js world).
 *   All coordinates are in metres.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Axis-aligned bounding box in the XZ plane.
 * All values are world-space metres.
 */
export interface AABB {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
}

// ── SpatialIndex ──────────────────────────────────────────────────────────────

/**
 * Grid-based spatial index for fast point-in-region and rect-overlap queries.
 *
 * The grid divides XZ space into cells of `cellSize` × `cellSize` metres.
 * Each element is inserted into every cell its AABB overlaps.
 *
 * insert/remove: O(cells covered by AABB) — typically 1–4 cells for BIM rooms
 * query(point):  O(1) — single cell lookup
 * queryRect:     O(c) where c = cells covered by query rect
 */
export class SpatialIndex {
    /** XZ cell size in metres. 5m is optimal for typical BIM rooms (10–50 m²). */
    private readonly cellSize: number;

    /** cell key → set of element IDs registered in that cell. */
    private readonly grid = new Map<string, Set<string>>();

    /** element ID → its AABB (for remove() and re-index on update). */
    private readonly elementBounds = new Map<string, AABB>();

    constructor(cellSize = 5) {
        this.cellSize = cellSize;
    }

    // ── Mutation ──────────────────────────────────────────────────────────────

    /**
     * Register an element and its bounding box in the index.
     * If the element already exists, it is re-indexed (update semantics).
     */
    insert(id: string, bounds: AABB): void {
        // Remove stale entry first (handles update case)
        if (this.elementBounds.has(id)) this.remove(id);

        this.elementBounds.set(id, bounds);

        for (const key of this._cellKeys(bounds)) {
            let cell = this.grid.get(key);
            if (!cell) { cell = new Set(); this.grid.set(key, cell); }
            cell.add(id);
        }
    }

    /**
     * Remove an element from the index.
     * No-op if the element is not registered.
     */
    remove(id: string): void {
        const bounds = this.elementBounds.get(id);
        if (!bounds) return;

        for (const key of this._cellKeys(bounds)) {
            const cell = this.grid.get(key);
            if (cell) {
                cell.delete(id);
                if (cell.size === 0) this.grid.delete(key);
            }
        }

        this.elementBounds.delete(id);
    }

    /**
     * Reset the index to empty.
     */
    clear(): void {
        this.grid.clear();
        this.elementBounds.clear();
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /**
     * All element IDs whose AABB covers the given XZ point.
     * Returns candidate IDs — callers must perform precise containment test.
     * Complexity: O(1) — single cell lookup.
     *
     * @param point - [x, z] world-space coordinates
     */
    query(point: [number, number]): string[] {
        const [x, z] = point;
        const key = this._cellKey(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
        const cell = this.grid.get(key);
        if (!cell) return [];
        // Return candidates whose stored AABB actually overlaps the point
        return Array.from(cell).filter(id => {
            const b = this.elementBounds.get(id);
            if (!b) return false;
            return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
        });
    }

    /**
     * All element IDs whose AABB overlaps the given query rectangle.
     * Returns candidate IDs — callers should perform precise intersection test.
     * Complexity: O(c) where c = cells covered by query rect.
     */
    queryRect(rect: AABB): string[] {
        const candidates = new Set<string>();

        const minCellX = Math.floor(rect.minX / this.cellSize);
        const maxCellX = Math.floor(rect.maxX / this.cellSize);
        const minCellZ = Math.floor(rect.minZ / this.cellSize);
        const maxCellZ = Math.floor(rect.maxZ / this.cellSize);

        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cz = minCellZ; cz <= maxCellZ; cz++) {
                const cell = this.grid.get(this._cellKey(cx, cz));
                if (cell) for (const id of cell) candidates.add(id);
            }
        }

        // Filter to only those whose stored AABB actually overlaps the query rect
        return Array.from(candidates).filter(id => {
            const b = this.elementBounds.get(id);
            if (!b) return false;
            return b.maxX >= rect.minX && b.minX <= rect.maxX &&
                   b.maxZ >= rect.minZ && b.minZ <= rect.maxZ;
        });
    }

    /**
     * Number of elements registered in the index.
     */
    get size(): number {
        return this.elementBounds.size;
    }

    /**
     * True if an element is registered.
     */
    has(id: string): boolean {
        return this.elementBounds.has(id);
    }

    /**
     * Returns the AABB for a registered element, or undefined if not found.
     */
    getBounds(id: string): AABB | undefined {
        return this.elementBounds.get(id);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _cellKey(cx: number, cz: number): string {
        return `${cx},${cz}`;
    }

    private _cellKeys(bounds: AABB): string[] {
        const keys: string[] = [];
        const minCX = Math.floor(bounds.minX / this.cellSize);
        const maxCX = Math.floor(bounds.maxX / this.cellSize);
        const minCZ = Math.floor(bounds.minZ / this.cellSize);
        const maxCZ = Math.floor(bounds.maxZ / this.cellSize);
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                keys.push(this._cellKey(cx, cz));
            }
        }
        return keys;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global room spatial index — populated by RoomStore on insert/update/delete.
 * Shared singleton so DependencyResolver and WorldModelAdapter can query it.
 */
export const roomSpatialIndex = new SpatialIndex(5);

// ── Contract 45 §6 — Phase 5: project-scope registration ──────────────────────
// The room spatial index is keyed by room IDs from the active project.
// Switching projects must clear it so room-detection / proximity queries
// performed in the new project never see ghost geometry from the old one.
import { projectScopeRegistry } from './persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'roomSpatialIndex',
    clear: () => roomSpatialIndex.clear(),
});
