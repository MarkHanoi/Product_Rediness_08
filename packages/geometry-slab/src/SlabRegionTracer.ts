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
    /**
     * §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — which STORE owns this host.
     *
     * Travels beside `hostId` because an id alone cannot say which store to ask,
     * and asking the wrong one is a MISS that degrades to the authoring-time
     * fallback while reporting `preserved` (C79 §5.2.1). Absent = `'wall'`, so
     * every existing caller and test passing bare `{ baseLine }` shapes keeps its
     * exact previous behaviour.
     */
    hostType?: 'wall' | 'curtain-wall' | null;
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
 *
 * §C73 §2.1/§2.3 — a DOMAIN BAND (wall-thickness-scale room-closure weld, 150×
 * the kernel's COINCIDENT_M point-identity), so it stays here under its domain
 * owner rather than folding onto the kernel role. Renamed from
 * `REGION_WELD_TOLERANCE` to state its unit; value unchanged.
 */
export const REGION_WELD_TOLERANCE_M = 0.15;

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
const ARC_MIN_CHORD_FOR_WELD = REGION_WELD_TOLERANCE_M * 1.5;

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
 *                     each longer than {@link REGION_WELD_TOLERANCE_M} so the
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
    /** §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — the host's KIND; absent = 'wall'. */
    hostType?: 'wall' | 'curtain-wall' | null;
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
            // §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — the KIND travels with
            // the id, so a curtain-wall chord resolves against the curtain-wall store.
            // Only sent when the chord is actually attributed; an unattributed chord
            // becomes a FreeLineEdge and has no host of any kind to name.
            if (u && v) segments.push({ start: u, end: v, hostId, hostType: hostId ? (w?.hostType ?? 'wall') : null, reason });
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
    tolerance = REGION_WELD_TOLERANCE_M,
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
    /** §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — the host's KIND; absent = 'wall'. */
    hostType?: 'wall' | 'curtain-wall' | null;
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
    tolerance = REGION_WELD_TOLERANCE_M,
): AttributedRingVertex[][] {
    const points: RegionPoint2D[] = [];
    const adj = new Map<number, number[]>();
    /** welded node pair "u-v" (both directions stored) → attribution of the chord. */
    const edgeHost = new Map<string, { hostId: string | null; hostType?: 'wall' | 'curtain-wall' | null; reason?: AttributedSegment['reason'] }>();

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
            const attribution = { hostId: seg.hostId, hostType: seg.hostType, reason: seg.reason };
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
                            hostType: a?.hostType ?? null,
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
 * §REGION-ANNULUS (ADR-0329 D2) — a CANONICAL FORM for "is this the same boundary?".
 *
 * The graph walk emits every boundary TWICE, once per traversal direction. On the
 * reference fixture (a 40x40 parcel around a 20x20 building) it returns four loops:
 * the parcel at ±1600 m² and the building at ±400 m². The two members of each pair
 * are the SAME boundary and must collapse to one hole.
 *
 * They are collapsed by a canonical KEY, not by a proximity match — C79 §2.2 forbids
 * the latter, and it forbids it for a reason that applies here: two DIFFERENT holes
 * that happen to sit close together must stay two holes. The key is exact:
 *
 *   1. winding normalised (reverse when the signed area is negative), so direction
 *      cannot distinguish two spellings of one boundary;
 *   2. rotated to start at the lexicographically smallest vertex, so the start index
 *      cannot either — the same rotation-insensitivity `ringsEqualCyclic` already
 *      applies on the re-projection path, and for the same reason;
 *   3. ordinates quantised at {@link REGION_WELD_TOLERANCE_M} — the SAME band the
 *      walk already welded its nodes at, so a key can never split two vertices the
 *      graph itself treated as one node (C73 §2.1: the band is the caller's declared
 *      domain tolerance, and reusing it is what keeps the two decisions consistent).
 *
 * A WINDING FLIP IS NOT A DIFFERENT BOUNDARY HERE. That is the opposite of the rule
 * `reprojectStoredPolygon` applies to the outer ring, and deliberately so: there,
 * winding carries the authored inside/outside sense of one ring; here, the two
 * windings are two outputs of one undirected walk over one undirected edge set.
 */
function canonicalRingKey(ring: ReadonlyArray<RegionPoint2D>): string {
    const q = (n: number): number => Math.round(n / REGION_WELD_TOLERANCE_M);
    const oriented = polygonArea(ring) < 0 ? [...ring].reverse() : [...ring];

    let startIdx = 0;
    for (let i = 1; i < oriented.length; i++) {
        const a = oriented[i]!, b = oriented[startIdx]!;
        const [ax, ay, bx, by] = [q(a.x), q(a.y), q(b.x), q(b.y)];
        if (ax < bx || (ax === bx && ay < by)) startIdx = i;
    }

    const parts: string[] = [];
    for (let k = 0; k < oriented.length; k++) {
        const p = oriented[(startIdx + k) % oriented.length]!;
        parts.push(`${q(p.x)},${q(p.y)}`);
    }
    return parts.join(';');
}

/**
 * §REGION-ANNULUS (ADR-0329 D2) — outer ring plus the holes inside it.
 *
 * Every field is a ring the SAME walk produced; nothing here is re-derived and no
 * polygon boolean is involved (see the ADR's §5 alternative 1, and the standing
 * refusal at `polygonBoolean.ts:45-49`).
 */
export interface AttributedRegionWithHoles {
    /** The smallest loop enclosing the click — byte-identical to the old return. */
    outer: AttributedRingVertex[];
    /** Loops strictly inside `outer` that do NOT enclose the click. Often empty. */
    holes: AttributedRingVertex[][];
}

/**
 * §REGION-ANNULUS (ADR-0329 D2) — the annulus-aware twin of
 * {@link findAttributedRegionAtPoint}.
 *
 * THE FOUNDER'S APPROACH, and the reason no polygon DIFFERENCE is needed: *"create a
 * slab within the perimeter of the boundary, then create a dynamic hole from within
 * the space defined by the walls of the building."* The outer ring is the parcel
 * boundary; the hole is the building footprint. Both are loops
 * {@link buildAttributedClosedLoops} already returns — MEASURED on the reference
 * fixture, which yields the building ring at ±400 m² attributed to `bldg-*` walls.
 * `findAttributedRegionAtPoint` keeps the smallest ENCLOSING loop and drops the rest,
 * which is C79 §0's "computed, correct, discarded on the way out" one function
 * further out than the wall ids that defect was about.
 *
 * THE SELECTION RULE, stated so it is checkable rather than implied:
 *
 *   outer  = the smallest-area loop CONTAINING the click.  Unchanged. A click inside
 *            a room still yields that room, with no holes, exactly as before.
 *   holes  = every other loop that is STRICTLY INSIDE `outer` and does NOT contain
 *            the click, after (a) collapsing winding twins by {@link canonicalRingKey}
 *            and (b) keeping only the OUTERMOST such loops.
 *
 * (b) is load-bearing and is not an optimisation. A loop nested inside a hole
 * candidate is a ROOM INSIDE THE BUILDING — the building's own interior partitions
 * are in the same wall set — and punching it would turn one honest hole into a sieve
 * of overlapping contours. Keeping only the outermost is what makes the hole "the
 * building", which is what the user pointed at.
 *
 * "Strictly inside" is decided by a vertex probe against `outer` using the kernel's
 * canonical even-odd body (via {@link pointInPolygon}) — no new predicate is minted
 * here, and `check-predicate-canonical` does not move.
 */
export function findAttributedRegionWithHolesAtPoint(
    walls: ReadonlyArray<RegionWallLike>,
    x: number,
    z: number,
): AttributedRegionWithHoles | null {
    if (!walls || walls.length === 0) return null;
    const segments = wallsToAttributedSegments(walls);
    if (segments.length === 0) return null;

    const loops = buildAttributedClosedLoops(segments);
    const click: RegionPoint2D = { x, y: z };

    let outer: AttributedRingVertex[] | null = null;
    let outerArea = Infinity;
    for (const loop of loops) {
        const ring = loop.map(v => v.point);
        if (!pointInPolygon(click, ring)) continue;
        const area = Math.abs(polygonArea(ring));
        if (area < outerArea) {
            outerArea = area;
            outer = loop;
        }
    }
    if (!outer || outer.length < 3) return null;

    const outerRing = outer.map(v => v.point);
    const outerKey = canonicalRingKey(outerRing);

    // Pass 1 — candidates: strictly inside `outer`, not enclosing the click, winding
    // twins collapsed. `contained` requires EVERY vertex inside so a ring that merely
    // brushes the outer boundary is not silently adopted as a hole.
    const seen = new Set<string>([outerKey]);
    const candidates: { loop: AttributedRingVertex[]; ring: RegionPoint2D[]; area: number }[] = [];
    for (const loop of loops) {
        if (loop.length < 3) continue;
        const ring = loop.map(v => v.point);
        const key = canonicalRingKey(ring);
        if (seen.has(key)) continue;
        if (pointInPolygon(click, ring)) continue;
        if (!ring.every(p => pointInPolygon(p, outerRing))) continue;
        seen.add(key);
        candidates.push({ loop, ring, area: Math.abs(polygonArea(ring)) });
    }

    // Pass 2 — keep only the OUTERMOST candidates. A candidate contained by a strictly
    // larger candidate is a room inside the building, not a second hole of the garden.
    const holes: AttributedRingVertex[][] = [];
    for (const c of candidates) {
        const nestedInAnother = candidates.some(
            other => other !== c
                && other.area > c.area
                && c.ring.every(p => pointInPolygon(p, other.ring)),
        );
        if (!nestedInAnother) holes.push(c.loop);
    }

    return { outer, holes };
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
    /** The OUTER ring geometry, unchanged — for the polygon/preview path. */
    ring: RegionPoint2D[];
    /**
     * §REGION-ANNULUS (ADR-0329 D3) — the hole rings, in the same frame as `ring`.
     *
     * ALWAYS PRESENT, `[]` when the region has no holes — never `undefined`. An empty
     * array means "measured, and there are none"; the field's absence would be the
     * failure-as-emptiness shape §CONTEXT-DATA-HONESTY forbids. `ring` keeps its exact
     * previous meaning so every existing caller is unaffected.
     */
    innerRings: RegionPoint2D[][];
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
    innerRings: ReadonlyArray<ReadonlyArray<AttributedRingVertex>> = [],
): RegionSketchResult | null {
    if (!ring || ring.length < 3) return null;

    const hostWallIds = new Set<string>();
    let hostEdges = 0;
    let curvedFallbacks = 0;
    let missingIdFallbacks = 0;
    let ambiguousFallbacks = 0;
    let totalEdges = 0;

    /**
     * §REGION-ANNULUS (ADR-0329 D3) — ONE loop→edges body, applied to the outer ring
     * and to every inner ring.
     *
     * This is C79 §3.4 taken literally: *"A region path's edge shape MUST be
     * byte-identical to the already-working non-region path"* — and the cheapest way
     * to guarantee an inner edge is byte-identical to an outer one is for there to be
     * exactly one place that mints either. A second construction site for hole edges
     * is how two shapes for one relationship come into existence (C79 §0).
     * Attribution counts accumulate across ALL loops, so a fallback in a hole edge is
     * REPORTED, never absorbed (C79 §2.5/§2.6).
     */
    const loopToEdges = (loop: ReadonlyArray<AttributedRingVertex>): SketchEdge[] => {
        const edges: SketchEdge[] = [];
        for (let i = 0; i < loop.length; i++) {
            const a = loop[i]!;
            const b = loop[(i + 1) % loop.length]!;
            const start = { x: a.point.x, y: a.point.y };
            const end = { x: b.point.x, y: b.point.y };

            if (a.hostId) {
                const edge: HostReferenceEdge = {
                    type: 'hostReference',
                    hostId: a.hostId,
                    // §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — was the hard-coded
                    // literal `'wall'`, which is what forced L-1125 to contribute curtain
                    // walls ANONYMOUSLY: an id stamped `'wall'` sends WallFaceResolver to
                    // the wall store, where a curtain wall does not exist.
                    hostType: a.hostType ?? 'wall',
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
            totalEdges++;
        }
        return edges;
    };

    const outerEdges = loopToEdges(ring);
    const usableInner = innerRings.filter(l => l && l.length >= 3);
    const innerLoops = usableInner.map(l => ({ edges: loopToEdges(l) }));

    return {
        // `innerLoops` is OMITTED rather than written `[]` when there are no holes, so
        // a plain region's sketch stays byte-identical to what it was before ADR-0329
        // — the field is optional in `SlabSketch` and an empty array is a different
        // value from an absent one to every equality check downstream.
        sketch: innerLoops.length > 0
            ? { outerLoop: { edges: outerEdges }, innerLoops }
            : { outerLoop: { edges: outerEdges } },
        ring: ring.map(v => ({ x: v.point.x, y: v.point.y })),
        innerRings: usableInner.map(l => l.map(v => ({ x: v.point.x, y: v.point.y }))),
        attribution: {
            hostEdges,
            freeEdges: totalEdges - hostEdges,
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
 *
 * §REGION-ANNULUS (ADR-0329) — it now routes through
 * {@link findAttributedRegionWithHolesAtPoint}, so the returned sketch carries
 * `innerLoops` when the traced region has holes. **The outer ring is selected by the
 * identical rule as before** (smallest loop enclosing the click), so a click inside a
 * room returns exactly what it returned yesterday, with `innerRings: []` and no
 * `innerLoops` on the sketch.
 */
export function traceRegionSketchAtPoint(
    walls: ReadonlyArray<RegionWallLike>,
    x: number,
    z: number,
): RegionSketchResult | null {
    const region = findAttributedRegionWithHolesAtPoint(walls, x, z);
    if (!region || region.outer.length < 3) return null;
    return buildRegionSketch(region.outer, region.holes);
}
