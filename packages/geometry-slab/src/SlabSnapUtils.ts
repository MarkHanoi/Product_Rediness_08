/**
 * SlabSnapUtils
 *
 * Pure snap utility functions for the slab drawing tool.
 * No store access, no command access, no window.* access, no Three.js dependency.
 *
 * Ported and adapted from Pascal
 * packages/editor/src/components/tools/slab/slab-tool.tsx `calculateSnapPoint`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// snapToGrid
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snaps a scalar `value` to the nearest multiple of `gridSize`.
 *
 * Used by SlabProfileEditor._applySegmentDrag() to snap the perpendicular
 * offset of a dragged segment to a 50 mm grid (§12 §2.5).
 *
 * With Shift held the caller skips this function and uses the raw offset directly.
 *
 * @param value    The raw scalar to snap (e.g. a drag offset in metres).
 * @param gridSize The grid spacing (e.g. 0.05 for a 50 mm grid).
 * @returns        The nearest grid-aligned value.
 */
export function snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Snaps `current` to the nearest axis-aligned or 45-degree diagonal from `last`.
 *
 * Snap candidates (in priority order of angular closeness):
 *   horizontal — y = last.y  (snap to horizontal from last point)
 *   vertical   — x = last.x  (snap to vertical from last point)
 *   diagonal   — 45° or 135° from last point
 *
 * All coordinates are in the XZ plane represented as { x, y } where y = world Z.
 * This matches the PRYZM polyline point convention used throughout SlabTool.
 *
 * @param last    Last committed polygon point { x, y } (where y = world Z).
 * @param current Raw cursor position { x, y } to be snapped.
 * @returns       Snapped position. The returned value is always on one of the
 *                three snap candidates — never the raw cursor position.
 */
export function snapToAxisOrDiagonal(
    last: { x: number; y: number },
    current: { x: number; y: number }
): { x: number; y: number } {
    const dx = current.x - last.x;
    const dy = current.y - last.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Distance from each candidate axis:
    //   horizontal: how far current.y is from last.y
    //   vertical:   how far current.x is from last.x
    //   diagonal:   how far the point is from the nearest 45° line
    const horizontalDist = absDy;
    const verticalDist   = absDx;
    const diagonalDist   = Math.abs(absDx - absDy);

    const minDist = Math.min(horizontalDist, verticalDist, diagonalDist);

    if (minDist === diagonalDist) {
        // Snap to nearest 45° diagonal
        const len = Math.min(absDx, absDy);
        return {
            x: last.x + Math.sign(dx) * len,
            y: last.y + Math.sign(dy) * len,
        };
    }

    if (minDist === horizontalDist) {
        // Snap to horizontal (lock y = last.y)
        return { x: current.x, y: last.y };
    }

    // Snap to vertical (lock x = last.x)
    return { x: last.x, y: current.y };
}
