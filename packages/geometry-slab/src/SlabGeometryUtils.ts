/**
 * SlabGeometryUtils
 *
 * Pure geometry utility functions for the slab subsystem.
 * No store access, no command access, no window.* access.
 * All functions are projection-only: they read input data and return new data.
 *
 * Ported and adapted from Pascal packages/core/src/systems/slab/slab-system.tsx.
 * Original algorithm © Pascal contributors.
 */

/**
 * Half of the default wall thickness used to extend slab geometry outward.
 * Slabs are expanded by this amount so that the slab seats under adjacent
 * walls rather than butting against the wall face, eliminating visible gaps.
 */
export const SLAB_WALL_OUTSET = 0.05; // metres

/**
 * Expand a polygon outward by a uniform offset distance.
 *
 * Algorithm:
 *   1. Determine winding direction via shoelace signed area.
 *   2. Offset each edge outward by `amount` (perpendicular to edge direction).
 *   3. Intersect consecutive offset edges to find the new vertex positions.
 *
 * Input coords are in the XZ plane represented as { x, y } where y = world Z.
 * This matches the PRYZM polygon convention used throughout SlabFragmentBuilder.
 *
 * @param polygon  Array of {x, y} points in XZ plane (any winding — normalised internally).
 * @param amount   Offset distance in metres. Positive value = expand outward.
 * @returns        New polygon array with the same number of vertices, offset outward.
 *                 Returns the original array unchanged if it has fewer than 3 points.
 */
export function outsetPolygon(
    polygon: { x: number; y: number }[],
    amount: number
): { x: number; y: number }[] {
    const n = polygon.length;
    if (n < 3) return polygon;

    // ── Step 1: Signed area via shoelace formula ───────────────────────────
    // Positive area → CCW winding (in XZ/Y-up convention).
    // Negative area → CW winding.
    let area2 = 0;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area2 += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
    }
    const s = area2 >= 0 ? 1 : -1; // +1 = CCW, -1 = CW

    // ── Step 2: Offset each edge outward by `amount` ──────────────────────
    // offEdges[i] = [offset_start_x, offset_start_y, edge_dx, edge_dy]
    const offEdges: [number, number, number, number][] = [];

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = polygon[j].x - polygon[i].x;
        const dy = polygon[j].y - polygon[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len < 1e-9) {
            // Degenerate edge (zero length) — keep the point as-is
            offEdges.push([polygon[i].x, polygon[i].y, dx, dy]);
            continue;
        }

        // Outward perpendicular: for a CCW polygon the outward normal of edge
        // (dx, dy) is (dy/len, -dx/len) * s.
        const nx = ((s * dy) / len) * amount;
        const ny = ((s * -dx) / len) * amount;

        offEdges.push([polygon[i].x + nx, polygon[i].y + ny, dx, dy]);
    }

    // ── Step 3: Intersect consecutive offset edges ─────────────────────────
    // The new vertex is the intersection of the offset lines of edges i and i+1.
    const result: { x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [ax, ay, adx, ady] = offEdges[i]!;
        const [bx, by, bdx, bdy] = offEdges[j]!;

        const denom = adx * bdy - ady * bdx;

        if (Math.abs(denom) < 1e-9) {
            // Parallel (or anti-parallel) edges — use the endpoint of the first offset edge.
            result.push({ x: ax + adx, y: ay + ady });
        } else {
            const t = ((bx - ax) * bdy - (by - ay) * bdx) / denom;
            result.push({ x: ax + t * adx, y: ay + t * ady });
        }
    }

    return result;
}
