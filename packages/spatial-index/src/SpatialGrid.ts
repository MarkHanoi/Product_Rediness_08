/**
 * SpatialGrid — uniform 3-D cell-grid implementation of ISpatialIndex<T>.
 *
 * Wave 11 migration: promoted from packages/picking/src/snapping/SpatialGrid.ts.
 * This is the canonical location per 15-PACKAGE-POPULATION-GAP.md §0.0.5
 * row `src/spatial | packages/spatial-index/`.
 *
 * Layer: L2 — no DOM, no React, no stores. THREE.js geometry only.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { ISpatialIndex } from './types.js';

interface GridCell<T> {
    items: Set<T>;
}

interface IndexedItem<T> {
    item: T;
    cells: string[];
}

/**
 * §WALL-AUDIT-2026-C2 — typed error thrown when a query is requested with
 * degenerate or pathological bounds (NaN, Infinity, or a span that would allocate
 * >MAX_TOTAL_CELLS grid cells). Callers should catch this and degrade gracefully
 * (return empty candidate list + log) instead of letting V8 throw RangeError on
 * the implicit array-grow path inside the cell-key loop.
 */
export class SnapBoundsError extends Error {
    constructor(message: string, public readonly bounds: THREE.Box3) {
        super(message);
        this.name = 'SnapBoundsError';
    }
}

/**
 * §WALL-AUDIT-2026-C2 — hard caps that protect getCellKeysForBounds() from
 * unbounded allocation. A normal level query on a 1m grid touches <100 cells;
 * a 100m radius query touches ~8M cells with cellSize=1 — well over the safe
 * limit. We cap each axis at MAX_CELLS_PER_AXIS and the product at MAX_TOTAL_CELLS.
 * Any query exceeding either cap is a programming error or a degenerate bounds
 * Box3 produced upstream (e.g. Infinity-extent zoomed-out clip volume).
 */
const MAX_CELLS_PER_AXIS = 1000;
const MAX_TOTAL_CELLS    = 1_000_000;

export class SpatialGrid<T> implements ISpatialIndex<T> {
    private cellSize: number;
    private cells: Map<string, GridCell<T>> = new Map();
    private itemToCells: Map<T, IndexedItem<T>> = new Map();
    private _size = 0;

    constructor(cellSize: number = 1.0) {
        this.cellSize = cellSize;
    }

    get size(): number {
        return this._size;
    }

    private getCellKey(x: number, y: number, z: number): string {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cy},${cz}`;
    }

    private getCellKeysForBounds(bounds: THREE.Box3): string[] {
        const coords = [
            bounds.min.x, bounds.min.y, bounds.min.z,
            bounds.max.x, bounds.max.y, bounds.max.z,
        ];
        for (const c of coords) {
            if (!Number.isFinite(c)) {
                throw new SnapBoundsError(
                    `SpatialGrid.getCellKeysForBounds: non-finite bound coordinate (${c}). ` +
                    `bounds.min=(${bounds.min.x}, ${bounds.min.y}, ${bounds.min.z}) ` +
                    `bounds.max=(${bounds.max.x}, ${bounds.max.y}, ${bounds.max.z})`,
                    bounds,
                );
            }
        }

        const minX = Math.floor(bounds.min.x / this.cellSize);
        const maxX = Math.floor(bounds.max.x / this.cellSize);
        const minY = Math.floor(bounds.min.y / this.cellSize);
        const maxY = Math.floor(bounds.max.y / this.cellSize);
        const minZ = Math.floor(bounds.min.z / this.cellSize);
        const maxZ = Math.floor(bounds.max.z / this.cellSize);

        const spanX = maxX - minX + 1;
        const spanY = maxY - minY + 1;
        const spanZ = maxZ - minZ + 1;
        if (spanX > MAX_CELLS_PER_AXIS || spanY > MAX_CELLS_PER_AXIS || spanZ > MAX_CELLS_PER_AXIS) {
            throw new SnapBoundsError(
                `SpatialGrid.getCellKeysForBounds: per-axis cell span exceeds cap ` +
                `(${MAX_CELLS_PER_AXIS}). spans=(${spanX}, ${spanY}, ${spanZ}) cellSize=${this.cellSize}`,
                bounds,
            );
        }
        const totalCells = spanX * spanY * spanZ;
        if (totalCells > MAX_TOTAL_CELLS) {
            throw new SnapBoundsError(
                `SpatialGrid.getCellKeysForBounds: total cell count ${totalCells} exceeds cap ${MAX_TOTAL_CELLS}.`,
                bounds,
            );
        }

        const keys: string[] = new Array(totalCells);
        let idx = 0;
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    keys[idx++] = `${x},${y},${z}`;
                }
            }
        }
        return keys;
    }

    insert(item: T, bounds: THREE.Box3 | THREE.Vector3): void {
        if (this.itemToCells.has(item)) {
            this.remove(item);
        }

        let cellKeys: string[];
        if (bounds instanceof THREE.Vector3) {
            cellKeys = [this.getCellKey(bounds.x, bounds.y, bounds.z)];
        } else {
            cellKeys = this.getCellKeysForBounds(bounds);
        }

        for (const key of cellKeys) {
            let cell = this.cells.get(key);
            if (!cell) {
                cell = { items: new Set() };
                this.cells.set(key, cell);
            }
            cell.items.add(item);
        }

        this.itemToCells.set(item, { item, cells: cellKeys });
        this._size++;
    }

    remove(item: T): boolean {
        const indexed = this.itemToCells.get(item);
        if (!indexed) return false;

        for (const key of indexed.cells) {
            const cell = this.cells.get(key);
            if (cell) {
                cell.items.delete(item);
                if (cell.items.size === 0) {
                    this.cells.delete(key);
                }
            }
        }

        this.itemToCells.delete(item);
        this._size--;
        return true;
    }

    private static _warnedDegenerateBounds = false;

    query(bounds: THREE.Box3): T[] {
        let cellKeys: string[];
        try {
            cellKeys = this.getCellKeysForBounds(bounds);
        } catch (err) {
            if (err instanceof SnapBoundsError && !SpatialGrid._warnedDegenerateBounds) {
                SpatialGrid._warnedDegenerateBounds = true;
                console.warn('[SpatialGrid] §WALL-AUDIT-2026-C2: degraded query for invalid bounds — see SnapBoundsError below', err);
            } else if (!(err instanceof SnapBoundsError)) {
                throw err;
            }
            return [];
        }

        const result = new Set<T>();
        for (const key of cellKeys) {
            const cell = this.cells.get(key);
            if (cell) {
                for (const item of cell.items) {
                    result.add(item);
                }
            }
        }
        return Array.from(result);
    }

    queryRadius(center: THREE.Vector3, radius: number): T[] {
        if (
            !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z) ||
            !Number.isFinite(radius)
        ) {
            return [];
        }
        const r = Math.max(0, radius);
        const bounds = new THREE.Box3(
            new THREE.Vector3(center.x - r, center.y - r, center.z - r),
            new THREE.Vector3(center.x + r, center.y + r, center.z + r)
        );
        return this.query(bounds);
    }

    clear(): void {
        this.cells.clear();
        this.itemToCells.clear();
        this._size = 0;
    }
}
