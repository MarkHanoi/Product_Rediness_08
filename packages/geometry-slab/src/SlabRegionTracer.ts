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

// §FIX-REGION-RING-PRETRIM-FRAME (founder, 2026-08-07) — THE ONE curved-wall
// tessellation for topology. Leaf subpath export: THREE-free, so this module keeps
// the purity its header promises. See the note on `wallPlanCenterline`.
import {
    tessellateCurvedWallForTopology,
    resolveArcSegmentCount,
    type TessPoint,
} from '@pryzm/core-app-model/curved-wall-tessellation';

/** Plain 2D point in the world XZ plane: `x` = world X, `y` = world Z. */
export interface RegionPoint2D {
    x: number;
    y: number;
}

/** Minimal wall shape the tracer needs — a subset of WallData. */
export interface RegionWallLike {
    /** Wall centreline endpoints in world space. Only x/z are read. POST-trim. */
    baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
    /**
     * The PRE-trim baseline `WallJoinResolver` archives before it shortens a wall
     * at a junction (`WallData._sourceBaseLine`).
     *
     * §FIX-REGION-RING-PRETRIM-FRAME (founder, 2026-08-07) — this field was the
     * whole defect. `curve.control` is authored in the PRE-trim frame, so fitting
     * a Bézier through POST-trim endpoints via a PRE-trim control point yields a
     * DIFFERENT CURVE that overshoots the authored arc. Callers were already
     * passing real wall records carrying `_sourceBaseLine`; only this type omitted
     * it, so the tracer could never see it. Absent (a wall never trimmed) ⇒
     * pre-trim ≡ post-trim and the output is bit-identical to the old maths.
     */
    _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> | null;
    /**
     * Optional quadratic-Bézier curve descriptor (Contract §03-1.2). When
     * present the wall is an arc from baseLine[0]→baseLine[1] via `control`.
     */
    curve?: { control?: { x: number; z: number } | null; segments?: number } | null;
}

/**
 * Vertex-weld tolerance (metres). Two wall endpoints closer than this are treated
 * as the same graph node so a closed room actually closes. Tessellated arc nodes
 * MUST be sampled coarser than this so intermediate arc vertices are NOT welded
 * away — enforced by passing `minChordLength` (below) into the shared density
 * resolver, not by a local chord constant.
 */
export const REGION_WELD_TOLERANCE = 0.15;

/**
 * §ARC-DENSITY (founder "not organic", 2026-08-07) — chord-survival bound handed
 * to the ONE density authority (`resolveArcSegmentCount`). Chords shorter than
 * the weld radius have their interior vertices dissolved by `buildClosedLoops`'s
 * vertex weld, so density beyond this bound CORRUPTS the ring rather than
 * refining it. 1.5× keeps a comfortable margin over the weld radius.
 *
 * Deliberately NOT a chord-density constant: the former local `MAX_ARC_SEGMENTS`
 * (48) / `ARC_CHORD_TARGET` (0.5 m) pair was the second copy of a density
 * decision that belongs in exactly one place
 * (`@pryzm/core-app-model/curved-wall-tessellation` §ARC-DENSITY) — the same
 * copy-disease §FIX-REGION-RING-PRETRIM-FRAME documents for the sampling maths.
 */
const ARC_MIN_CHORD_FOR_WELD = REGION_WELD_TOLERANCE * 1.5;

/** Quadratic-Bézier sampler in the tracer's `{x, z}` world-plan frame. */
function sampleQuadraticBezier(
    start: TessPoint, end: TessPoint, control: TessPoint, segments: number,
): TessPoint[] {
    const out: TessPoint[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const mt = 1 - t;
        out.push({
            x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
            z: mt * mt * start.z + 2 * mt * t * control.z + t * t * end.z,
        });
    }
    return out;
}

/**
 * Sample a wall's plan centreline into XZ points.
 *   • Straight wall → `[start, end]`.
 *   • Curved wall   → the authored quadratic-Bézier arc, tessellated into chords
 *                     each longer than {@link REGION_WELD_TOLERANCE} so the
 *                     intermediate nodes survive the loop-builder's weld step.
 *
 * §FIX-REGION-RING-PRETRIM-FRAME (founder, 2026-08-07) — THE FRAME MATTERS.
 * This function used to fit a Bézier through `baseLine[0] → curve.control →
 * baseLine[1]`. `baseLine` is POST-trim (the join resolver shortened it at each
 * junction); `curve.control` is PRE-trim, as the user authored it. A Bézier
 * through TRIMMED endpoints with an UNTRIMMED control point is not the authored
 * arc restricted to the trimmed span — it is a DIFFERENT CURVE, pinned at the
 * ends and diverging most mid-span, and the divergence is an OVERSHOOT: the arc
 * bulges PAST where its neighbours expect it. Push that bulge over a neighbouring
 * edge and the traced region ring CROSSES ITSELF; feed a self-crossing ring to
 * `THREE.ShapeUtils.triangulateShape` (earcut, whose contract requires a simple
 * ring) and it emits triangles OUTSIDE the polygon — the dark wedges punched
 * through the founder's roof-by-region surface.
 *
 * This is the identical defect `RoomDetectionEngine` was fixed for at ba7ee582
 * (§FIX-CURVED-WALL-PRETRIM-FRAME), and `WallFragmentBuilder` before it
 * (§V2-PRETRIM-FIX). Each fix was a COPY, so this third consumer kept the old
 * maths. It now calls the SAME shared helper: sample in the pre-trim frame, then
 * CLIP to the post-trim span, so the trim is still honoured exactly — the ring
 * starts and ends on the resolver's endpoints and only the SHAPE between them is
 * restored.
 *
 * A wall with no `_sourceBaseLine` (never trimmed) has pre-trim ≡ post-trim by
 * construction and is bit-identical to the previous behaviour.
 *
 * §ARC-DENSITY (2026-08-07, the second half of the same founder report): chord
 * density is now ADAPTIVE — resolved from the arc's curvature against a sagitta
 * target by the ONE shared authority (`resolveArcSegmentCount`), replacing the
 * local `MAX_ARC_SEGMENTS`/`ARC_CHORD_TARGET` pair. Density only became safe to
 * raise once the frame fix above landed — densifying a self-intersecting ring
 * only draws the corruption more finely.
 *
 * Returns `[]` when the wall has no usable baseLine.
 */
export function wallPlanCenterline(
    baseLine: ReadonlyArray<{ x: number; z: number }> | null | undefined,
    curve?: { control?: { x: number; z: number } | null; segments?: number } | null,
    sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> | null,
): RegionPoint2D[] {
    const p0 = baseLine?.[0];
    const p1 = baseLine?.[1];
    if (!p0 || !p1) return [];

    const a: RegionPoint2D = { x: p0.x, y: p0.z };
    const b: RegionPoint2D = { x: p1.x, y: p1.z };

    const ctrl = curve?.control;
    if (!ctrl) return [a, b];

    // The frame the arc was AUTHORED in — pre-trim when the resolver archived one.
    const src0 = sourceBaseLine?.[0];
    const src1 = sourceBaseLine?.[1];
    const hasSource = !!src0 && !!src1;
    const preStart: TessPoint = hasSource ? { x: src0.x, z: src0.z } : { x: p0.x, z: p0.z };
    const preEnd: TessPoint = hasSource ? { x: src1.x, z: src1.z } : { x: p1.x, z: p1.z };

    // §ARC-DENSITY — chord count from CURVATURE, resolved by the ONE shared
    // density authority. The wall's own `curve.segments` is honoured as a FLOOR
    // (a user-authored density is never coarsened), the sagitta target raises a
    // coarse default (schema 16 ⇒ ~15 mm departure on the founder's 10 m-scale
    // arc — the "not organic" facets) up to the curvature the arc actually has,
    // and both bounds (triangle-budget ceiling, weld-survival chord length) log
    // when they bite. Density is derived in the PRE-TRIM frame because that is
    // the frame actually sampled (see the shared module's FRAME RULE).
    const n = resolveArcSegmentCount({
        start: preStart,
        end: preEnd,
        control: { x: ctrl.x, z: ctrl.z },
        requested: curve?.segments,
        minChordLength: ARC_MIN_CHORD_FOR_WELD,
        tag: 'SlabRegionTracer',
    });

    const tessellated = tessellateCurvedWallForTopology(
        {
            baseLine: [{ x: p0.x, z: p0.z }, { x: p1.x, z: p1.z }],
            sourceBaseLine: hasSource ? [preStart, preEnd] : null,
            control: { x: ctrl.x, z: ctrl.z },
            segments: n,
        },
        sampleQuadraticBezier,
    );

    // Back to the tracer's OTHER convention: RegionPoint2D is {x, y} with y = world Z.
    return tessellated.map(p => ({ x: p.x, y: p.z }));
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
        // §FIX-REGION-RING-PRETRIM-FRAME — pass the archived PRE-trim baseline so the
        // arc is sampled in the frame `curve.control` belongs to.
        const pts = wallPlanCenterline(w?.baseLine, w?.curve, w?._sourceBaseLine);
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

        // Safety bound: scaled for tessellated curves (each curved wall adds up
        // to ARC_MAX_SEGMENTS = 64 nodes under §ARC-DENSITY), so a room bounded
        // by many curved walls must not trip the cap. When it DOES bite it says
        // so — a null produced by a limit must not read as "no region here"
        // (§CONTEXT-DATA-HONESTY / ADR-0299; same rule as WallRegionDetector
        // L-699).
        if (loopIdxs.length > 4096) {
            console.warn(
                '[SlabRegionTracer] §ARC-DENSITY loop trace aborted at 4096 vertices — '
                + 'treating as NO region. If this fires on a real room the cap, not the '
                + 'model, is the limit.',
            );
            return null;
        }
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
