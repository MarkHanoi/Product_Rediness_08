/**
 * CurtainCellComputer
 *
 * Pure function module — computes the set of rectangular façade cells
 * from a CurtainGridSystem (U-lines × V-lines).
 *
 * ## Grid → Cell Topology
 *
 * Given N uLines and M vLines (both including boundaries at t=0 and t=1):
 *   - Number of cells = (N-1) × (M-1)
 *   - Cell (i, j):  i=column index (U direction), j=row index (V direction)
 *   - Cell (0, 0):  bottom-left corner
 *   - Cell (N-2, M-2): top-right corner
 *
 * ## Coordinate System (Local to the Curtain Wall Group)
 *
 * The curtain wall group is centered on the wall's midpoint.
 * In local space:
 *   X: -length/2 (start) → +length/2 (end)
 *   Y:  0 (base)         → height    (top)
 *   Z:  0 (wall plane)
 *
 * Cell corners are in this local coordinate system.
 * The builder applies the group's world transform (rotation + position) at render time.
 *
 * ## Pure Function Contract
 *
 * This function has no side effects. It takes grid data and dimensions,
 * returns a cell array. It is unit-testable in isolation.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { CurtainGridSystem } from './CurtainGridSystem';

export interface CurtainCell {
    /** Column index (U direction, 0 = leftmost column). */
    i: number;
    /** Row index (V direction, 0 = bottom row). */
    j: number;
    /**
     * Four corners in curtain wall local space, ordered:
     *   [0] bottom-left, [1] bottom-right, [2] top-right, [3] top-left
     */
    corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    /** Normalized U start of this cell (0..1) */
    u0: number;
    /** Normalized U end of this cell (0..1) */
    u1: number;
    /** Normalized V start of this cell (0..1) */
    v0: number;
    /** Normalized V end of this cell (0..1) */
    v1: number;
    /** World-space width of this cell (metres) */
    width: number;
    /** World-space height of this cell (metres) */
    height: number;
}

/**
 * Compute façade cells from the grid system.
 *
 * @param grid   — the CurtainGridSystem (U/V lines with t-values)
 * @param length — wall length in metres (maps t=0..1 to 0..length)
 * @param height — wall height in metres (maps t=0..1 to 0..height)
 * @returns      — ordered cell array, row-major (i varies faster)
 */
export function computeCurtainCells(
    grid: CurtainGridSystem,
    length: number,
    height: number
): CurtainCell[] {
    // Sort ascending — t-values may be stored in insertion order
    const uSorted = [...grid.uLines].sort((a, b) => a.t - b.t);
    const vSorted = [...grid.vLines].sort((a, b) => a.t - b.t);

    if (uSorted.length < 2 || vSorted.length < 2) {
        console.warn('[CurtainCellComputer] Grid has fewer than 2 lines on an axis — no cells produced.');
        return [];
    }

    const cells: CurtainCell[] = [];
    const halfLength = length / 2;

    for (let i = 0; i < uSorted.length - 1; i++) {
        for (let j = 0; j < vSorted.length - 1; j++) {
            const u0 = uSorted[i].t;
            const u1 = uSorted[i + 1].t;
            const v0 = vSorted[j].t;
            const v1 = vSorted[j + 1].t;

            // Convert t-values to local-space coordinates
            // X is centred on 0 (group origin is wall midpoint)
            const x0 = u0 * length - halfLength;
            const x1 = u1 * length - halfLength;
            const y0 = v0 * height;
            const y1 = v1 * height;

            const corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
                new THREE.Vector3(x0, y0, 0), // bottom-left
                new THREE.Vector3(x1, y0, 0), // bottom-right
                new THREE.Vector3(x1, y1, 0), // top-right
                new THREE.Vector3(x0, y1, 0), // top-left
            ];

            cells.push({
                i,
                j,
                corners,
                u0,
                u1,
                v0,
                v1,
                width: Math.abs(x1 - x0),
                height: Math.abs(y1 - y0)
            });
        }
    }

    return cells;
}

/**
 * Find a cell by its (i, j) grid index.
 * Returns undefined if the cell does not exist (e.g., after a grid line was removed).
 */
export function findCell(cells: CurtainCell[], i: number, j: number): CurtainCell | undefined {
    return cells.find(c => c.i === i && c.j === j);
}

/**
 * Compute the area of a cell in square metres.
 */
export function cellArea(cell: CurtainCell): number {
    return cell.width * cell.height;
}
