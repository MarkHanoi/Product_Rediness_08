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
import { pointInPolygonXY } from '@pryzm/geometry-kernel';
import {
    tessellateCurvedWallForTopology,
    resolveArcSegmentCount,
    type TessPoint,
} from '@pryzm/core-app-model/curved-wall-tessellation';
// §REGION-HOST-ATTRIBUTION — TYPE-ONLY import, so this module keeps the THREE-free,
// I/O-free purity its header promises (SketchTypes.ts is itself pure declarations).
import type { SketchEdge, HostReferenceEdge, FreeLineEdge, SlabSketch } from './SketchTypes';

/** Plain 2D point in the world XZ plane: `x` = world X, `y` = world Z. */
export interface RegionPoint2D {
    x: number;
    y: number;
}

/** Minimal wall shape the tracer needs — a subset of WallData. */
export interface RegionWallLike {
    /**
     * §REGION-HOST-ATTRIBUTION (founder, 2026-08-12) — the wall's own id.
     *
     * THE DEFECT this closes: the tracer RECEIVED the wall array, walked their
     * centrelines to close the ring, and then **threw the wall ids away**, returning
     * a ring of bare points. `SlabPickWallsController` emits `HostReferenceEdge`s
     * carrying `hostId`, so `SlabDependencyTracker` re-projects a pick-walls slab
     * whenever a host wall moves — but a REGION slab, created by clicking inside the
     * same four walls, carried no host reference at all and silently stayed put. Two
     * buttons that look identical behaved differently, with no error and no warning.
     *
     * A user clicking inside four walls has EXPRESSED A RELATIONSHIP ("the floor of
     * this room"), not drawn a coincidental quadrilateral. The wall ids were already
     * in this module's input; carrying them to the output recovers information that
     * was present all along.
     *
     * Optional so every existing caller and test that passes bare `{ baseLine }`
     * shapes keeps compiling and keeps its exact previous behaviour: with no id, a
     * chord is UNATTRIBUTABLE and yields a `FreeLineEdge` — the honest refusal.
     */
    id?: string | null;
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
 * §REGION-HOST-ATTRIBUTION — a traced chord together with the wall it came from.
 *
 * `hostId` is the id of the wall whose centreline produced this chord, or `null`
 * when the chord is not honestly attributable to a single straight wall face.
 * `null` is a FIRST-CLASS ANSWER, not a gap: it becomes a `FreeLineEdge`, which is
 * the correct edge for a segment that lies on no wall. See {@link ATTRIBUTION_RULE}.
 */
export interface AttributedSegment {
    start: RegionPoint2D;
    end: RegionPoint2D;
    hostId: string | null;
    /**
     * WHY `hostId` is null. Present only when `hostId` is null — a refusal that
     * cannot say why is indistinguishable from an absence (§CONTEXT-DATA-HONESTY).
     *   'curved'    — the chord came from a tessellated arc; WallFaceResolver
     *                 resolves only ONE straight segment per wall, so no honest id.
     *   'noWallId'  — the caller's wall record carried no `id`.
     *   'ambiguous' — two DIFFERENT walls welded onto the same ring edge.
     */
    reason?: 'curved' | 'noWallId' | 'ambiguous';
}

/**
 * §REGION-HOST-ATTRIBUTION — the rule, stated once, in the module that applies it.
 *
 * A traced chord is attributed to a wall **iff all three hold**:
 *
 *  1. the chord was produced by that wall's own plan centreline in
 *     {@link wallsToSegments} (so attribution is BY CONSTRUCTION — the tracer never
 *     re-derives "which wall is this near?", which is where a wrong `hostId` would
 *     come from, and a wrong `hostId` is strictly worse than none: it would make the
 *     slab follow the WRONG wall);
 *  2. the wall carries an `id`; and
 *  3. the wall is **STRAIGHT** — one wall contributed exactly one chord.
 *
 * (3) is the honest refusal for arcs. `WallFaceResolver.resolve()` resolves a
 * `HostReferenceEdge` to ONE straight `Segment2D` spanning `baseLine[0]→baseLine[1]`;
 * it has no notion of "the 7th chord of this arc". Attributing a tessellated arc chord
 * to its curved wall would therefore re-project every one of that arc's chords onto the
 * SAME straight chord across the arc — collapsing the curve the tracer exists to
 * preserve (§SLAB-REGION-CURVED). So curved-wall chords are emitted as `FreeLineEdge`
 * and the count is reported (`curvedFallbacks`), never guessed.
 *
 * The consequence is intentionally asymmetric and honest: a region slab follows its
 * STRAIGHT walls parametrically, and its curved boundary stays where it was traced,
 * with the reason recorded rather than a plausible-looking wrong id.
 */
export const ATTRIBUTION_RULE =
    'chord attributed to a wall only when produced by that wall\'s own centreline, '
    + 'the wall has an id, and the wall is straight (one chord); otherwise hostId = null';

/**
 * §REGION-HOST-ATTRIBUTION — {@link wallsToSegments}, but each chord carries the id
 * of the wall that produced it (or `null` per {@link ATTRIBUTION_RULE}).
 *
 * Geometrically identical to `wallsToSegments` — the chords, their order and their
 * coordinates are the same values; only the provenance travels alongside.
 */
export function wallsToAttributedSegments(
    walls: ReadonlyArray<RegionWallLike>,
): AttributedSegment[] {
    const segments: AttributedSegment[] = [];
    for (const w of walls) {
        const pts = wallPlanCenterline(w?.baseLine, w?.curve, w?._sourceBaseLine);
        // Rule (3): a wall that tessellated into MORE than one chord is curved, and
        // WallFaceResolver cannot resolve a single arc chord. Refuse, do not guess.
        const isStraight = pts.length === 2;
        const hostId = isStraight && w?.id ? w.id : null;
        const reason: AttributedSegment['reason'] | undefined =
            hostId ? undefined : (!isStraight ? 'curved' : 'noWallId');
        for (let i = 0; i + 1 < pts.length; i++) {
            const u = pts[i];
            const v = pts[i + 1];
            if (u && v) segments.push({ start: u, end: v, hostId, reason });
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
    return buildAttributedClosedLoops(
        segments.map(([a, b]) => ({ start: a, end: b, hostId: null })),
        tolerance,
    ).map(loop => loop.map(v => v.point));
}

/**
 * §REGION-HOST-ATTRIBUTION — one vertex of an attributed ring.
 *
 * `hostId` is the wall owning the chord that LEAVES this vertex toward the next
 * vertex in the ring (edge i spans vertex[i] → vertex[i+1], wrapping). Storing
 * provenance on the OUTGOING edge is what lets the ring be consumed edge-wise
 * without a second parallel array that could fall out of step with the points.
 */
export interface AttributedRingVertex {
    point: RegionPoint2D;
    /** Wall owning the edge from this vertex to the next; `null` = unattributable. */
    hostId: string | null;
    /** Why `hostId` is null — see {@link AttributedSegment.reason}. */
    reason?: AttributedSegment['reason'];
}

/**
 * §REGION-HOST-ATTRIBUTION — the attributed twin of {@link buildClosedLoops}.
 *
 * Identical graph walk; the only addition is that each welded undirected edge
 * remembers the `hostId` of the chord that created it, and the returned rings carry
 * that id on the vertex the edge leaves from.
 */
export function buildAttributedClosedLoops(
    segments: ReadonlyArray<AttributedSegment>,
    tolerance = REGION_WELD_TOLERANCE,
): AttributedRingVertex[][] {
    const points: RegionPoint2D[] = [];
    const adj = new Map<number, number[]>();
    /** welded node pair "u-v" (both directions stored) → attribution of the chord. */
    const edgeHost = new Map<string, { hostId: string | null; reason?: AttributedSegment['reason'] }>();

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

    for (const seg of segments) {
        const u = getPointIdx(seg.start);
        const v = getPointIdx(seg.end);
        if (u === v) continue;
        if (!adj.has(u)) adj.set(u, []);
        if (!adj.has(v)) adj.set(v, []);
        adj.get(u)!.push(v);
        adj.get(v)!.push(u);
        // Two DISTINCT walls welding onto the same node pair is ambiguous — and an
        // ambiguous host is exactly the "wrong hostId" case the rule refuses. Keep
        // the first attribution only when a later chord agrees; otherwise drop to null.
        const kf = `${u}-${v}`;
        const kb = `${v}-${u}`;
        const existing = edgeHost.get(kf);
        if (existing) {
            if (existing.hostId !== seg.hostId) {
                const ambiguous = { hostId: null, reason: 'ambiguous' as const };
                edgeHost.set(kf, ambiguous);
                edgeHost.set(kb, ambiguous);
            }
        } else {
            const attribution = { hostId: seg.hostId, reason: seg.reason };
            edgeHost.set(kf, attribution);
            edgeHost.set(kb, attribution);
        }
    }

    const loops: AttributedRingVertex[][] = [];
    const visitedEdges = new Set<string>();

    for (let i = 0; i < points.length; i++) {
        for (const neighbor of adj.get(i) ?? []) {
            if (visitedEdges.has(`${i}-${neighbor}`)) continue;
            const loop = traceLoop(i, neighbor, adj, points, visitedEdges);
            if (loop && loop.length >= 3) {
                loops.push(
                    loop.map((idx, k) => {
                        const nextIdx = loop[(k + 1) % loop.length]!;
                        const a = edgeHost.get(`${idx}-${nextIdx}`);
                        return {
                            point: points[idx]!,
                            hostId: a?.hostId ?? null,
                            // No entry at all = the ring's CLOSING edge, synthesised by
                            // the walk rather than by any chord. Not attributable.
                            reason: a ? a.reason : ('noWallId' as const),
                        };
                    }),
                );
            }
        }
    }
    return loops;
}

/**
 * §REGION-HOST-ATTRIBUTION — returns welded NODE INDICES rather than points.
 *
 * It used to return `RegionPoint2D[]`. Indices carry strictly more information for
 * the same walk (the caller can still map to points in one step, and now can also
 * look up the per-edge host), and the index form is what makes provenance
 * survivable: mapping to points first would erase which welded node pair each ring
 * edge came from — the very "computed then discarded in transit" shape this fix
 * exists to close.
 */
function traceLoop(
    startIdx: number,
    nextIdx: number,
    adj: Map<number, number[]>,
    points: RegionPoint2D[],
    visitedEdges: Set<string>,
): number[] | null {
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

    return loopIdxs;
}

/**
 * Standard even-odd ray-cast point-in-polygon test (XZ plane; RegionPoint2D's
 * `y` field carries Z). §C73-PIP-CANONICAL — delegates to the kernel's one
 * even-odd body; kept exported because ./region-tracer consumers call it.
 */
export function pointInPolygon(pt: RegionPoint2D, polygon: ReadonlyArray<RegionPoint2D>): boolean {
    return pointInPolygonXY(pt.x, pt.y, polygon);
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

/**
 * §REGION-HOST-ATTRIBUTION — the attributed twin of {@link findRegionAtPoint}.
 *
 * Same minimal-enclosing-loop selection, same ring geometry; each vertex additionally
 * carries the id of the wall owning the edge that LEAVES it (see
 * {@link AttributedRingVertex}), or `null` per {@link ATTRIBUTION_RULE}.
 */
export function findAttributedRegionAtPoint(
    walls: ReadonlyArray<RegionWallLike>,
    x: number,
    z: number,
): AttributedRingVertex[] | null {
    if (!walls || walls.length === 0) return null;
    const segments = wallsToAttributedSegments(walls);
    if (segments.length === 0) return null;

    const loops = buildAttributedClosedLoops(segments);
    const click: RegionPoint2D = { x, y: z };

    let best: AttributedRingVertex[] | null = null;
    let bestArea = Infinity;
    for (const loop of loops) {
        const ring = loop.map(v => v.point);
        if (!pointInPolygon(click, ring)) continue;
        const area = Math.abs(polygonArea(ring));
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

/**
 * §REGION-HOST-ATTRIBUTION — why a chord was NOT attributed, counted per reason.
 * Reported by {@link buildRegionSketch} so a fallback is a MEASUREMENT, never a
 * silent gap (§CONTEXT-DATA-HONESTY / ADR-0299: a refusal and an empty result must
 * not be the same value).
 */
export interface RegionSketchAttribution {
    /** Ring edges emitted as `HostReferenceEdge` (they follow their wall). */
    hostEdges: number;
    /** Ring edges emitted as `FreeLineEdge` (all reasons). */
    freeEdges: number;
    /**
     * Of `freeEdges`, those whose chord came from a CURVED wall's tessellation.
     * `WallFaceResolver` resolves a host edge to ONE straight segment, so an arc
     * chord cannot be honestly attributed — see {@link ATTRIBUTION_RULE}.
     */
    curvedFallbacks: number;
    /** Of `freeEdges`, those from a wall carrying no `id` (caller passed none). */
    missingIdFallbacks: number;
    /** Of `freeEdges`, those where two DIFFERENT walls claimed the same ring edge. */
    ambiguousFallbacks: number;
    /** Distinct wall ids the resulting sketch depends on. */
    hostWallIds: string[];
}

/** Result of {@link buildRegionSketch}. */
export interface RegionSketchResult {
    sketch: SlabSketch;
    /** The ring geometry, unchanged — for the polygon/preview path. */
    ring: RegionPoint2D[];
    attribution: RegionSketchAttribution;
}

/**
 * §REGION-HOST-ATTRIBUTION — turn an attributed ring into a `SlabSketch`.
 *
 * THE EDGE SHAPE IS COPIED FROM `SlabPickWallsController.complete()`, not invented:
 * `{ type: 'hostReference', hostId, hostType: 'wall', reference: 'centerLine',
 * offset: 0 }`. `'centerLine'` with `offset: 0` is the correct — and the only
 * honest — face reference here, because the ring this tracer produces is traced on
 * wall CENTRELINES (`wallPlanCenterline` samples `baseLine`, which `WallFaceResolver`
 * documents as "the wall's center line in world XZ space"). Naming
 * `interiorFace`/`exteriorFace` would shift every edge by half the wall thickness
 * away from where the user saw the region highlighted, and the interior/exterior
 * sense depends on the wall's authored start→end direction, which the ring walk does
 * not preserve — so the side would be a coin flip. Attributing the face the ring
 * actually lies on is the truthful choice and is byte-identical to what the
 * already-working pick-walls path emits.
 *
 * `fallback` is populated on EVERY `HostReferenceEdge` from the traced geometry
 * itself. `SlabDependencyTracker.onWallRemoved` degrades through
 * `WallFaceResolver.degrade` → `resolveOrFallback`, which returns `null` — and
 * therefore degrades to NOTHING — when the host is gone and no fallback was stored.
 * Pick-walls relies on the builder caching one later; a region edge already knows its
 * own geometry at authoring time, so it ships with the fallback rather than depending
 * on a rebuild having happened first.
 *
 * Ring edge `i` spans `ring[i] → ring[(i+1) % n]`, matching
 * {@link AttributedRingVertex}'s outgoing-edge convention.
 */
export function buildRegionSketch(
    ring: ReadonlyArray<AttributedRingVertex>,
): RegionSketchResult | null {
    if (!ring || ring.length < 3) return null;

    const edges: SketchEdge[] = [];
    const hostWallIds = new Set<string>();
    let hostEdges = 0;
    let curvedFallbacks = 0;
    let missingIdFallbacks = 0;
    let ambiguousFallbacks = 0;

    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const start = { x: a.point.x, y: a.point.y };
        const end = { x: b.point.x, y: b.point.y };

        if (a.hostId) {
            const edge: HostReferenceEdge = {
                type: 'hostReference',
                hostId: a.hostId,
                hostType: 'wall',
                reference: 'centerLine',
                offset: 0,
                // Non-destructive degradation (SketchTypes §03): an edge with no
                // fallback degrades to nothing when its wall is deleted.
                fallback: { start, end },
            };
            edges.push(edge);
            hostWallIds.add(a.hostId);
            hostEdges++;
        } else {
            const edge: FreeLineEdge = { type: 'freeLine', start, end };
            edges.push(edge);
            if (a.reason === 'curved') curvedFallbacks++;
            else if (a.reason === 'ambiguous') ambiguousFallbacks++;
            else missingIdFallbacks++;
        }
    }

    return {
        sketch: { outerLoop: { edges } },
        ring: ring.map(v => ({ x: v.point.x, y: v.point.y })),
        attribution: {
            hostEdges,
            freeEdges: edges.length - hostEdges,
            curvedFallbacks,
            missingIdFallbacks,
            ambiguousFallbacks,
            hostWallIds: [...hostWallIds],
        },
    };
}

/**
 * §REGION-HOST-ATTRIBUTION — the one call a region tool needs.
 *
 * Traces the minimal closed wall loop containing `(x, z)` and returns BOTH the ring
 * (unchanged, for the polygon/preview path) and the parametric `SlabSketch` whose
 * edges reference the walls that produced them. Returns `null` when no region
 * encloses the point — the same answer, and the same shape of answer, as
 * {@link findRegionAtPoint}.
 */
export function traceRegionSketchAtPoint(
    walls: ReadonlyArray<RegionWallLike>,
    x: number,
    z: number,
): RegionSketchResult | null {
    const ring = findAttributedRegionAtPoint(walls, x, z);
    if (!ring || ring.length < 3) return null;
    return buildRegionSketch(ring);
}
