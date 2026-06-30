/**
 * SlabRegionTracer — pure, THREE-free wall-region flood/loop tracer for the
 * Slab "By Region" tool.
 *
 * §SLAB-REGION-CURVED (DAILY-USE 2026-06-29):
 *   The "By Region" tool builds a slab footprint from the minimal closed loop of
 *   walls enclosing the clicked point. Previously the tracer ran in two places —
 *   the 3D tool (`SlabTool`) and the plan-view overlay (`SlabPlanToolHandler`) —
 *   with DUPLICATED, DIVERGENT logic. The plan-view copy read each wall as a
 *   single straight `baseLine` chord and dropped the curve descriptor entirely,
 *   so a region bounded by a curved / filleted wall could never close (the loop
 *   broke at the arc) → no region → no slab. This module is the single shared
 *   tracer: it tessellates a curved wall (quadratic-Bézier `curve.control`) into
 *   polyline chords so the arc participates in loop closure and the resulting
 *   slab footprint follows the curve.
 *
 * Layering: this module is PURE 2D geometry (no THREE, no DOM, no I/O). Both the
 * THREE-based 3D tool and the canvas-based plan overlay convert their inputs to
 * the plain `{ x, y }` shape (where y carries world-Z) and consume these helpers.
 * Mirrors the existing THREE-free utility convention of SlabGeomUtils / SlabValidator.
 */

/** Plain 2D point in the world XZ plane: `x` = world X, `y` = world Z. */
export interface RegionPoint2D {
    x: number;
    y: number;
}

/** Minimal wall shape the tracer needs — a subset of WallData. */
export interface RegionWallLike {
    /** Wall centreline endpoints in world space. Only x/z are read. */
    baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
    /**
     * Optional quadratic-Bézier curve descriptor (Contract §03-1.2). When
     * present the wall is an arc from baseLine[0]→baseLine[1] via `control`.
     */
    curve?: { control?: { x: number; z: number } | null; segments?: number } | null;
}

/**
 * Vertex-weld tolerance (metres). Two wall endpoints closer than this are treated
 * as the same graph node so a closed room actually closes. Tessellated arc nodes
 * are sampled coarser than this so intermediate arc vertices are NOT welded away.
 */
export const REGION_WELD_TOLERANCE = 0.15;

/** Max chords used to tessellate a single curved wall (bounds graph size). */
const MAX_ARC_SEGMENTS = 48;
/** Target chord length (m) when sampling an arc — must exceed the weld tolerance. */
const ARC_CHORD_TARGET = 0.5;

/**
 * Sample a wall's plan centreline into XZ points.
 *   • Straight wall → `[start, end]`.
 *   • Curved wall   → the quadratic-Bézier arc (baseLine[0] → control → baseLine[1])
 *                     tessellated into chords each longer than {@link REGION_WELD_TOLERANCE}
 *                     so the intermediate nodes survive the loop-builder's weld step.
 *
 * Returns `[]` when the wall has no usable baseLine.
 */
export function wallPlanCenterline(
    baseLine: ReadonlyArray<{ x: number; z: number }> | null | undefined,
    curve?: { control?: { x: number; z: number } | null; segments?: number } | null,
): RegionPoint2D[] {
    const p0 = baseLine?.[0];
    const p1 = baseLine?.[1];
    if (!p0 || !p1) return [];

    const a: RegionPoint2D = { x: p0.x, y: p0.z };
    const b: RegionPoint2D = { x: p1.x, y: p1.z };

    const ctrl = curve?.control;
    if (!ctrl) return [a, b];

    const cx = ctrl.x;
    const cy = ctrl.z;

    // Segment count: honour the wall's own `segments` when supplied, else derive
    // one from the chord length. Always ≥2 (so a tiny arc still bows) and capped.
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const fromChord = Math.ceil(chord / ARC_CHORD_TARGET);
    const requested = Number.isFinite(curve?.segments) ? (curve!.segments as number) : fromChord;
    const n = Math.max(2, Math.min(MAX_ARC_SEGMENTS, requested || fromChord || 2));

    const out: RegionPoint2D[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const mt = 1 - t;
        out.push({
            x: mt * mt * a.x + 2 * mt * t * cx + t * t * b.x,
            y: mt * mt * a.y + 2 * mt * t * cy + t * t * b.y,
        });
    }
    return out;
}

/**
 * Build wall segments (chords) from a set of walls, tessellating any curved walls.
 * The output is a flat list of `[start, end]` chord pairs ready for {@link buildClosedLoops}.
 */
export function wallsToSegments(
    walls: ReadonlyArray<RegionWallLike>,
): Array<[RegionPoint2D, RegionPoint2D]> {
    const segments: Array<[RegionPoint2D, RegionPoint2D]> = [];
    for (const w of walls) {
        const pts = wallPlanCenterline(w?.baseLine, w?.curve);
        for (let i = 0; i + 1 < pts.length; i++) {
            const u = pts[i];
            const v = pts[i + 1];
            if (u && v) segments.push([u, v]);
        }
    }
    return segments;
}

/**
 * Build every minimal closed loop from a set of chord segments.
 *
 * The algorithm welds near-coincident endpoints into shared graph nodes, then
 * walks each undirected edge once, always turning by the smallest interior angle
 * to enclose minimal faces. Returns each loop as an ordered ring of points.
 */
export function buildClosedLoops(
    segments: ReadonlyArray<[RegionPoint2D, RegionPoint2D]>,
    tolerance = REGION_WELD_TOLERANCE,
): RegionPoint2D[][] {
    const points: RegionPoint2D[] = [];
    const adj = new Map<number, number[]>();

    const getPointIdx = (p: RegionPoint2D): number => {
        for (let i = 0; i < points.length; i++) {
            const q = points[i]!;
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            if (Math.hypot(dx, dy) < tolerance) return i;
        }
        points.push({ x: p.x, y: p.y });
        return points.length - 1;
    };

    for (const [a, b] of segments) {
        const u = getPointIdx(a);
        const v = getPointIdx(b);
        if (u === v) continue;
        if (!adj.has(u)) adj.set(u, []);
        if (!adj.has(v)) adj.set(v, []);
        adj.get(u)!.push(v);
        adj.get(v)!.push(u);
    }

    const loops: RegionPoint2D[][] = [];
    const visitedEdges = new Set<string>();

    for (let i = 0; i < points.length; i++) {
        for (const neighbor of adj.get(i) ?? []) {
            if (visitedEdges.has(`${i}-${neighbor}`)) continue;
            const loop = traceLoop(i, neighbor, adj, points, visitedEdges);
            if (loop && loop.length >= 3) loops.push(loop);
        }
    }
    return loops;
}

function traceLoop(
    startIdx: number,
    nextIdx: number,
    adj: Map<number, number[]>,
    points: RegionPoint2D[],
    visitedEdges: Set<string>,
): RegionPoint2D[] | null {
    const loopIdxs = [startIdx, nextIdx];
    visitedEdges.add(`${startIdx}-${nextIdx}`);
    visitedEdges.add(`${nextIdx}-${startIdx}`);

    let currIdx = nextIdx;
    let prevIdx = startIdx;

    while (true) {
        const neighbors = adj.get(currIdx) ?? [];
        if (neighbors.length < 2) return null;

        const pCurr = points[currIdx]!;
        const pPrev = points[prevIdx]!;
        const vPrevX = pPrev.x - pCurr.x;
        const vPrevY = pPrev.y - pCurr.y;
        const prevAng = Math.atan2(vPrevY, vPrevX);

        let bestNeighbor = -1;
        let bestAngle = Infinity;

        for (const n of neighbors) {
            if (n === prevIdx) continue;
            const pN = points[n]!;
            const vNextX = pN.x - pCurr.x;
            const vNextY = pN.y - pCurr.y;

            let angle = Math.atan2(vNextY, vNextX) - prevAng;
            if (angle <= 0) angle += Math.PI * 2;

            if (angle < bestAngle) {
                bestAngle = angle;
                bestNeighbor = n;
            }
        }

        if (bestNeighbor === -1) return null;
        if (bestNeighbor === startIdx) break;
        if (loopIdxs.includes(bestNeighbor)) return null; // self-intersection guard

        visitedEdges.add(`${currIdx}-${bestNeighbor}`);
        visitedEdges.add(`${bestNeighbor}-${currIdx}`);

        loopIdxs.push(bestNeighbor);
        prevIdx = currIdx;
        currIdx = bestNeighbor;

        // Safety bound: scaled for tessellated curves (each curved wall adds up to
        // MAX_ARC_SEGMENTS nodes), so a curved room must not trip the cap.
        if (loopIdxs.length > 400) return null;
    }

    return loopIdxs.map((idx) => points[idx]!);
}

/** Standard even-odd ray-cast point-in-polygon test (XZ plane). */
export function pointInPolygon(pt: RegionPoint2D, polygon: ReadonlyArray<RegionPoint2D>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i]!, pj = polygon[j]!;
        const xi = pi.x, yi = pi.y;
        const xj = pj.x, yj = pj.y;
        const intersect =
            ((yi > pt.y) !== (yj > pt.y)) &&
            (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Find the minimal closed wall loop enclosing the point `(x, z)`.
 * Curved walls are tessellated so an arc/filleted boundary closes and the
 * returned ring follows the curve. Returns the ring (ordered XZ points) or `null`.
 */
export function findRegionAtPoint(
    walls: ReadonlyArray<RegionWallLike>,
    x: number,
    z: number,
): RegionPoint2D[] | null {
    if (!walls || walls.length === 0) return null;
    const segments = wallsToSegments(walls);
    if (segments.length === 0) return null;

    const loops = buildClosedLoops(segments);
    const click: RegionPoint2D = { x, y: z };

    // Prefer the SMALLEST enclosing loop so an inner room wins over the building
    // shell when both contain the click.
    let best: RegionPoint2D[] | null = null;
    let bestArea = Infinity;
    for (const loop of loops) {
        if (!pointInPolygon(click, loop)) continue;
        const area = Math.abs(polygonArea(loop));
        if (area < bestArea) {
            bestArea = area;
            best = loop;
        }
    }
    return best;
}

/** Signed shoelace area of a ring (XZ plane). */
export function polygonArea(poly: ReadonlyArray<RegionPoint2D>): number {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const pi = poly[i]!, pj = poly[j]!;
        a += (pj.x + pi.x) * (pj.y - pi.y);
    }
    return a / 2;
}
