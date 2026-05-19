/**
 * SketchLoopIntersector
 *
 * Pure 2D geometry utility that converts an ordered list of wall-face line
 * segments into a clean closed polygon by computing the intersection at each
 * corner where adjacent segment lines meet.
 *
 * WHY THIS EXISTS
 * ---------------
 * When a slab is created "By Pick Walls", each picked wall contributes one
 * HostReferenceEdge. At projection time WallFaceResolver resolves each edge to
 * a 2D segment [start, end] representing that wall's reference face in XZ space.
 *
 * The naive approach (push both endpoints of every segment, then deduplicate)
 * breaks when a wall moves: its new segment endpoints no longer align with the
 * adjacent walls' segments, producing a jagged / self-intersecting polygon.
 *
 * The correct approach mirrors Revit's "slab by walls" behaviour:
 *   For N ordered walls, find the N corner points by intersecting the infinite
 *   line of wall[i] with the infinite line of wall[(i+1) % N].
 *   This always gives exactly one clean vertex per corner, no matter where
 *   individual walls move to.
 *
 * CONTRACT COMPLIANCE
 * -------------------
 * §01 §2.1 – No store mutations.  Pure read-only projection helper.
 * §02 Projection-Only – Stateless; no side effects; no store access.
 * §03 Single Source of Truth – Consumes pre-resolved Segment2D values;
 *     does not access stores or builders.
 *
 * USAGE
 * -----
 * ```ts
 * const segments = edges.map(edge => WallFaceResolver.resolveOrFallback(edge));
 * const polygon  = SketchLoopIntersector.computePolygon(segments);
 * ```
 */

export interface Point2D {
    x: number;
    y: number;
}

export interface Segment2D {
    start: Point2D;
    end: Point2D;
}

export class SketchLoopIntersector {
    /**
     * Given an ordered list of 2D line segments forming a closed loop, return
     * the polygon vertices computed as line-line intersections at each corner.
     *
     * For N segments, N vertices are returned — one per corner between segment[i]
     * and segment[(i+1) % N].
     *
     * When two adjacent wall lines are parallel (rare, e.g. collinear walls),
     * the fallback is to use the raw endpoint of segment[i] so the polygon
     * degrades gracefully rather than failing silently.
     *
     * Returns null if fewer than 3 segments are provided.
     */
    static computePolygon(segments: (Segment2D | null)[]): Point2D[] | null {
        const valid = segments.filter((s): s is Segment2D => s !== null);
        if (valid.length < 3) return null;

        const vertices: Point2D[] = [];
        const n = valid.length;

        for (let i = 0; i < n; i++) {
            const segA = valid[i];
            const segB = valid[(i + 1) % n];

            const corner = SketchLoopIntersector.intersectLines(
                segA.start, segA.end,
                segB.start, segB.end
            );

            // If lines are parallel / degenerate, fall back to the raw end of segA
            vertices.push(corner ?? segA.end);
        }

        return vertices.length >= 3 ? vertices : null;
    }

    /**
     * Compute the intersection point of two infinite 2D lines.
     *
     * Line 1 passes through p1 and p2.
     * Line 2 passes through p3 and p4.
     *
     * Returns null when lines are parallel (cross product magnitude < EPSILON).
     *
     * Math:
     *   Let D1 = p2 - p1,  D2 = p4 - p3,  D3 = p3 - p1
     *   cross  = D1 × D2   (2-D cross product = D1.x·D2.y − D1.y·D2.x)
     *   t      = (D3 × D2) / cross
     *   result = p1 + t · D1
     */
    static intersectLines(
        p1: Point2D, p2: Point2D,
        p3: Point2D, p4: Point2D
    ): Point2D | null {
        const dx1 = p2.x - p1.x;
        const dy1 = p2.y - p1.y;
        const dx2 = p4.x - p3.x;
        const dy2 = p4.y - p3.y;

        const cross = dx1 * dy2 - dy1 * dx2;

        const EPSILON = 1e-9;
        if (Math.abs(cross) < EPSILON) return null;

        const dx3 = p3.x - p1.x;
        const dy3 = p3.y - p1.y;

        const t = (dx3 * dy2 - dy3 * dx2) / cross;

        return {
            x: p1.x + t * dx1,
            y: p1.y + t * dy1
        };
    }
}
