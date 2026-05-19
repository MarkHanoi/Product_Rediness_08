/**
 * SlabGeomUtils
 *
 * Pure 2D geometry utilities shared by the slab subsystem.
 * No store access, no command access, no window.* access, no Three.js dependency.
 *
 * All coordinates are in the XZ plane represented as { x, y } (y = world Z),
 * matching the PRYZM polygon convention used throughout the slab subsystem.
 *
 * §12 Phase 1 — Shared Geometry Utilities
 * See §12-SLAB-SEGMENT-DRAG-CONTRACT.md §2.3 and §13 Phase 1 work items.
 *
 * Contract compliance:
 *
 * §07 Security
 *   Pure functions only. No window.* access. No side effects.
 *
 * §P1 Pascal Boundary
 *   No file in src/ may import from ./Pascal/.
 *   All math is implemented directly in PRYZM-idiomatic TypeScript.
 *   `signedArea` was previously inline in UpdateSlabPolygonCommand.ts;
 *   `lineIntersect2D` is new (Ported and adapted from Pascal packages/core —
 *    comment only, no import dependency).
 */

// ─────────────────────────────────────────────────────────────────────────────
// signedArea
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the signed area of a 2D polygon via the Shoelace formula.
 *
 * Returns a positive value for CCW winding, negative for CW.
 * Used to:
 *   - Reject zero-area (degenerate) polygons in UpdateSlabPolygonCommand.canExecute()
 *   - Guard against polygon collapse in SlabProfileEditor._applySegmentDrag()
 *
 * Previously defined inline in UpdateSlabPolygonCommand.ts; extracted here so
 * both UpdateSlabPolygonCommand and SlabProfileEditor can share it without a
 * circular import.
 */
export function signedArea(pts: { x: number; y: number }[]): number {
    let area = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return area / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// lineIntersect2D
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the intersection of two 2D lines given as (point, direction) pairs.
 *
 * Uses Cramer's rule. Returns null for parallel or coincident lines
 * (when the cross-product magnitude is below `epsilon`).
 *
 * All coordinates are in the XZ plane represented as { x, y } (y = world Z).
 *
 * @param p1      A point on the first line.
 * @param d1      Direction vector of the first line (need not be unit-length).
 * @param p2      A point on the second line.
 * @param d2      Direction vector of the second line (need not be unit-length).
 * @param epsilon Parallel-lines tolerance. Default 1e-9.
 * @returns       The intersection point, or null if lines are parallel/coincident.
 *
 * Used by SlabProfileEditor._applySegmentDrag() to compute the new positions of
 * the two vertices at the ends of the dragged segment (§12 §2.2 steps 4–5).
 *
 * Ported and adapted from Pascal packages/core/src/geometry/line-intersect.ts
 * (comment only — no import dependency; re-implemented for PRYZM idioms).
 */
export function lineIntersect2D(
    p1: { x: number; y: number },
    d1: { x: number; y: number },
    p2: { x: number; y: number },
    d2: { x: number; y: number },
    epsilon = 1e-9,
): { x: number; y: number } | null {
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < epsilon) return null;   // parallel / coincident lines

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const t  = (dx * d2.y - dy * d2.x) / cross;

    return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}
