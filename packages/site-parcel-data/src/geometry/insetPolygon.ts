// C58 §3.2 — per-edge setback INSET (the `parcel ⊖ setbacks` geometry).
//
// L2-pure, deterministic (C58 §1.1 / §1.9): scene-XZ metres in, scene-XZ metres
// out. No THREE / DOM / I-O / RNG / clock. Reuses the pure geometry helpers from
// @pryzm/site-validators (polygon signed area + point-in-polygon).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A METRIC EDGE-OFFSET, NOT TURF (deliberate, documented):
//   C58 §3.2 suggests "Turf negative buffer". Turf's `buffer` is GEODESIC — it
//   assumes WGS84 lng/lat degrees and projects to a local metric plane. The C19
//   parcel spine is already in scene-XZ METRES (an LTP-ENU planar frame), not
//   degrees, so feeding it to Turf would be metrically wrong; and SPEC §4
//   forbids re-projecting to WGS84 and back (the envelope must stay in the exact
//   frame the parcel renders in). A pure metric erosion is the correct tool here:
//   it is deterministic, per-edge (front/side/rear each get their own inward
//   offset — Turf cannot do that with a single uniform buffer), metric-exact in
//   scene-XZ, and adds no dependency. NOTE FOR ANY FUTURE "just add a polygon
//   boolean library" proposal: the repo has none (no polygon-clipping, martinez,
//   turf, polybooljs, @flatten-js), and the construction below does not need one —
//   the only boolean operation an erosion requires is resolving the offset ring's
//   own self-intersections, which §INSET-LOOP-DECOMPOSE already does exactly.
// ─────────────────────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ALGORITHM (§INSET-ROUND-JOIN, L-586) — the boundary of the CAPSULE UNION.
//
//   A per-edge setback is an EROSION, and the erosion has a definition:
//       inset = { q ∈ parcel : dist(q, edge_i) ≥ s_i for every edge i }
//             = parcel \ ⋃_i (edge_i ⊕ disk(s_i))
//   Step 4 builds that boundary directly — each edge's offset SEGMENT, joined at
//   each vertex either by a sharp corner (where the erosion genuinely has one) or
//   by the arc where the two neighbouring capsules hand over. Step 4b then keeps
//   only the points the definition above actually admits, which is an independent
//   test rather than another repair. Step 5 splits residual folds into simple
//   loops; step 6 gates genuine over-inset. Winding-INDEPENDENT (canonicalised to
//   CCW). Full rationale, and the four earlier approaches this replaces, are
//   documented inline at steps 3 and 4b — READ THEM BEFORE CHANGING THIS FILE:
//   three of the four were measured, plausible and wrong.
//
//   MEASURED, 65 real Eixample blocks, Art. 242 call {front: 11, side: 0}, against
//   an INDEPENDENT grid-rasterisation oracle (`scratchpad/probe-l586-oracle-65.mts`):
//       geometrically sound at the 11 m ordinance floor   36.9% → 55.4% → 100%
//       blocks OVER-stating the true erosion (C58 §1.4)   31/65 → 0/65
//       code/oracle area ratio                            median 0.990, min 0.887
//   ⚠ The over-statement column is the one that matters and the one nothing before
//   this measured: the old soundness gates compared the inset to the PARCEL, never
//   to the true erosion, so a fold could inflate buildable area by 65% (2,577 m²
//   on block 0224301DF3802C) and still be reported as sound.
// ─────────────────────────────────────────────────────────────────────────────

import type { Pt } from '@pryzm/schemas';
import type { ParcelEdgeClassification } from '@pryzm/schemas';
import { EPSILON_ZERO } from '@pryzm/geometry-kernel';
import {
    polygonSignedArea,
    pointInPolygon,
    pointPolygonEdgeDistance,
} from '@pryzm/site-validators';

export interface PerEdgeSetbacks {
    readonly front: number;
    readonly side: number;
    readonly rear: number;
    /** Applied to edges classified `unclassified` (C58 §10.3 uniform fallback). */
    readonly unclassified: number;
}

export interface InsetResult {
    /** The inset ring (scene-XZ metres). Empty when `degenerate`. */
    readonly polygon: Pt[];
    /** True when the setbacks consumed the whole parcel (no buildable area). */
    readonly degenerate: boolean;
}

/**
 * Vertices closer than this (METRES) are treated as coincident (1 µm). Deliberately 1000×
 * TIGHTER than the kernel's `COINCIDENT_M` (1 mm): adopting the shared role would WIDEN this
 * dedupe band by three orders of magnitude (forbidden, C73 §2.5/E4).
 */
const COINCIDENT_EPS_M = 1e-6;
/**
 * §INSET-BOUNDARY-TOLERANT (L-462) — how far outside the parcel an inset vertex may test before
 * the soundness gate rejects it. 1 mm: far below any planning dimension, so it cannot mask a
 * genuine escape (a real fold lands metres out), but comfortably above the float error of a
 * miter intersection landing on an edge it was constructed to lie on.
 */
const BOUNDARY_TOLERANCE_M = 1e-3;
/**
 * §INSET-ROUND-JOIN (L-586) — target chord/radius ratio for one arc segment of a vertex arc.
 * 0.261 = 2·sin(7.5°), i.e. a 15° arc step. The arc is generated by CHORD-MIDPOINT BISECTION
 * (only `sqrt`, never a transcendental), so the subdivision level is a fixed integer derived from
 * the chord ratio rather than a convergence loop — C58 §1.1 byte-determinism.
 */
const ARC_CHORD_RATIO = 0.261;
/**
 * §INSET-ROUND-JOIN (L-586) — hard cap on arc bisection levels (2³ = 8 segments per arc). Bounds
 * the output vertex count (and therefore the O(n²) self-intersection cleanup) on a 60-vertex
 * cadastral ring. At the worst case — a 180° reflex arc — 8 segments leave a sagitta of 0.019·r,
 * i.e. 23 cm at an 12 m setback, and the chord always lies INSIDE the true arc, so the error is in
 * the conservative direction C58 §1.4 requires.
 */
const ARC_MAX_LEVELS = 3;
/**
 * §INSET-EROSION-PREDICATE (L-586) — slack on the "no closer than s_j to segment j" test in step 4b.
 * Every point step 4 emits is CONSTRUCTED to sit at exactly its setback from the segment that made
 * it, so the test is comparing a number against itself and only float error separates them. 1 µm is
 * a thousand times above that error and a million times below any planning dimension, so it cannot
 * admit a point that genuinely violates a setback.
 */
const PREDICATE_TOLERANCE_M = 1e-6;

function sub(a: Pt, b: Pt): Pt {
    return { x: a.x - b.x, z: a.z - b.z };
}
/** 2D cross product of (x,z) vectors. */
function cross(a: Pt, b: Pt): number {
    return a.x * b.z - a.z * b.x;
}
function length(v: Pt): number {
    return Math.hypot(v.x, v.z);
}

/**
 * Intersect two lines, each given by a point + a direction. Returns null when
 * the lines are (near-)parallel.
 */
function lineIntersect(p0: Pt, d0: Pt, p1: Pt, d1: Pt): Pt | null {
    const denom = cross(d0, d1);
    if (Math.abs(denom) < EPSILON_ZERO) return null;
    const t = cross(sub(p1, p0), d1) / denom;
    return { x: p0.x + t * d0.x, z: p0.z + t * d0.z };
}

function setbackForClass(
    cls: ParcelEdgeClassification | undefined,
    setbacks: PerEdgeSetbacks,
): number {
    switch (cls) {
        case 'front':
            return setbacks.front;
        case 'side':
            return setbacks.side;
        case 'rear':
            return setbacks.rear;
        default:
            return setbacks.unclassified;
    }
}

/**
 * Drop consecutive coincident vertices (a Cesium close-loop duplicate, a
 * double-tap while drawing, or two points within a micron) so no zero-length
 * edge reaches the offset math. Keeps `edgeClassifications` aligned to the edge
 * that SURVIVES (the edge leaving each kept vertex). Winding-preserving.
 */
function cleanRing(
    polygon: ReadonlyArray<Pt>,
    edgeClassifications: ReadonlyArray<ParcelEdgeClassification>,
): { pts: Pt[]; cls: Array<ParcelEdgeClassification | undefined> } {
    const pts: Pt[] = [];
    const cls: Array<ParcelEdgeClassification | undefined> = [];
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i]!;
        const prev = pts[pts.length - 1];
        if (prev && length(sub(p, prev)) < COINCIDENT_EPS_M) continue;
        pts.push({ x: p.x, z: p.z });
        cls.push(edgeClassifications[i]);
    }
    // Also fold a coincident wrap (last ≈ first).
    while (pts.length >= 2 && length(sub(pts[pts.length - 1]!, pts[0]!)) < COINCIDENT_EPS_M) {
        pts.pop();
        cls.pop();
    }
    return { pts, cls };
}

/**
 * §INSET-ROUND-JOIN (L-586) — emit the interior points of the circular arc of radius `r` centred on
 * `c` running from `e` to `q` (both already at distance `r` from `c`), taking the SHORT way round.
 *
 * Method: chord-midpoint bisection. The midpoint of a chord, re-normalised to radius `r`, is the
 * arc's midpoint — and it is always the SHORT arc's midpoint, so no angle, no branch and no
 * `atan2` is needed to choose a direction. The subdivision depth is a fixed integer derived from
 * the chord ratio, so the whole construction uses nothing but `+ - * / sqrt`, all IEEE-exact
 * operations. That is deliberate: `Math.sin`/`Math.cos` are implementation-defined in ECMA-262,
 * and this polygon's area is published as a legally-binding *profunditat edificable* (C58 §1.1).
 *
 * Every emitted point lies INSIDE the true arc's chord-hull, i.e. the polyline under-states the
 * arc, so the resulting inset is never larger than the exact erosion (C58 §1.4).
 */
/** Distance from `p` to the SEGMENT a→b (not to its infinite line). */
function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    const t = l2 < EPSILON_ZERO ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
    return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

function arcInteriorPoints(c: Pt, r: number, e: Pt, q: Pt, out: Pt[]): void {
    if (r < EPSILON_ZERO) return;
    const chord = length(sub(q, e));
    if (chord < EPSILON_ZERO) return;
    let levels = 0;
    let ratio = chord / r;
    while (ratio > ARC_CHORD_RATIO && levels < ARC_MAX_LEVELS) {
        ratio /= 2;
        levels++;
    }
    if (levels === 0) return;
    bisectArc(c, r, e, q, levels, out);
}

function bisectArc(c: Pt, r: number, e: Pt, q: Pt, levels: number, out: Pt[]): void {
    if (levels === 0) return;
    const mx = (e.x + q.x) / 2 - c.x;
    const mz = (e.z + q.z) / 2 - c.z;
    const m = Math.hypot(mx, mz);
    if (m < EPSILON_ZERO) return; // antipodal chord — no defined short-way midpoint
    const mid: Pt = { x: c.x + (mx / m) * r, z: c.z + (mz / m) * r };
    bisectArc(c, r, e, mid, levels - 1, out);
    out.push(mid);
    bisectArc(c, r, mid, q, levels - 1, out);
}

/** True iff segments a-b and c-d properly cross (interiors intersect). */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const d1 = cross(sub(b, a), sub(c, a));
    const d2 = cross(sub(b, a), sub(d, a));
    const d3 = cross(sub(d, c), sub(a, c));
    const d4 = cross(sub(d, c), sub(b, c));
    return (d1 > EPSILON_ZERO) !== (d2 > EPSILON_ZERO) && (d3 > EPSILON_ZERO) !== (d4 > EPSILON_ZERO);
}

/** Does the closed ring self-intersect (any non-adjacent edge pair crossing)? */
function selfIntersects(ring: ReadonlyArray<Pt>): boolean {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
            const c = ring[j]!;
            const d = ring[(j + 1) % n]!;
            if (segmentsCross(a, b, c, d)) return true;
        }
    }
    return false;
}

/**
 * §INSET-LOOP-DECOMPOSE (L-525b) — split a self-intersecting offset ring into SIMPLE loops.
 *
 * ⚠ THIS REPLACES A GREEDY WELDER THAT DESTROYED THE POLYGON. The previous implementation walked
 * the ring and spliced out a loop the moment the newest edge crossed an earlier kept edge. That
 * is correct only when the fold is ONE small spike near the end of the walk. When an inward
 * offset folds in SEVERAL places at once — the normal case for a real cadastral block, which is
 * non-convex with many short edges — each greedy splice truncates `out` back to the crossing
 * index, so later splices cut into material earlier ones had already kept. It does not degrade,
 * it collapses: on the real Barcelona block 02309 (58 vertices, 9 reflex) a 12 m inset came out
 * of it with TWO vertices, which the caller's `< 3` gate then reported as `degenerate` — i.e. as
 * "the setbacks consumed the whole block", for a block that in truth retains 48% free space.
 *
 * THE CONSEQUENCE THAT MAKES THIS A COMPLIANCE BUG, NOT A RENDERING ONE: `solveBlockDerivedDepth`
 * reads a degenerate inset as ZERO interior free area, so the Art. 242.2 courtyard rule can never
 * be satisfied at any depth, and the solver falls to the ordinance FLOOR and flags `degenerate`.
 * Barcelona shipped a 12 m *profunditat edificable* where the construction yields ~17 m. A too-
 * shallow depth is exactly as wrong as a too-deep one, and it failed SILENTLY (L-525).
 *
 * WHAT THIS DOES INSTEAD — the standard offset-cleanup, stated in full because it is load-bearing:
 * a self-intersecting offset ring is not garbage, it is a ring that traverses several closed
 * loops. Split it at its crossings and each loop comes out simple and consistently wound. Loops
 * wound OPPOSITE to the (CCW-canonicalised) input are the "invalid loops" of offsetting — the
 * reversed folds an inward offset produces where opposing walls pass through each other — and are
 * discarded. Loops wound WITH the input are real surviving material.
 *
 * The split is exact: every emitted vertex is either an input vertex or a true crossing point,
 * and the two traversals of a crossing are matched by the CROSSING'S OWN IDENTITY (the edge pair
 * that produced it) rather than by coordinate comparison — so no tolerance governs the topology,
 * which is what makes the decomposition deterministic (C58 §1.1).
 */
interface WalkNode {
    readonly p: Pt;
    /** Identity for matching the two traversals of one crossing. NEVER a coordinate. */
    readonly key: string;
}

/** Proper crossing of a-b and c-d, with each segment's own parameter. Null if they do not cross. */
function segmentCrossPoint(
    a: Pt,
    b: Pt,
    c: Pt,
    d: Pt,
): { t: number; u: number; p: Pt } | null {
    if (!segmentsCross(a, b, c, d)) return null;
    const r = sub(b, a);
    const s = sub(d, c);
    const denom = cross(r, s);
    if (Math.abs(denom) < EPSILON_ZERO) return null;
    const t = cross(sub(c, a), s) / denom;
    const u = cross(sub(c, a), r) / denom;
    return { t, u, p: { x: a.x + t * r.x, z: a.z + t * r.z } };
}

/**
 * Decompose a (possibly self-intersecting) ring into simple closed loops.
 *
 * Method: build the traversal with every crossing spliced into both of the edges that produced
 * it, then walk it with a stack — revisiting a node means the walk just closed a loop, so pop it
 * off and carry on. Every loop is emitted exactly once and the vertices partition cleanly.
 */
function decomposeToSimpleLoops(ring: ReadonlyArray<Pt>): Pt[][] {
    const n = ring.length;
    const perEdge: Array<Array<{ t: number; p: Pt; key: string }>> = [];
    for (let i = 0; i < n; i++) perEdge.push([]);

    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            // Adjacent edges share an endpoint by construction — that is not a crossing.
            if (j === (i + 1) % n || (j + 1) % n === i) continue;
            const x = segmentCrossPoint(a, b, ring[j]!, ring[(j + 1) % n]!);
            if (!x) continue;
            const key = `X${i}:${j}`;
            perEdge[i]!.push({ t: x.t, p: x.p, key });
            perEdge[j]!.push({ t: x.u, p: x.p, key });
        }
    }

    // The traversal: each original vertex, then that edge's crossings in the order met along it.
    const walk: WalkNode[] = [];
    for (let i = 0; i < n; i++) {
        walk.push({ p: ring[i]!, key: `V${i}` });
        perEdge[i]!.sort((p, q) => p.t - q.t);
        for (const c of perEdge[i]!) walk.push({ p: c.p, key: c.key });
    }

    const loops: Pt[][] = [];
    const path: WalkNode[] = [];
    const seenAt = new Map<string, number>();
    for (const node of walk) {
        const at = seenAt.get(node.key);
        if (at === undefined) {
            seenAt.set(node.key, path.length);
            path.push(node);
            continue;
        }
        // Closed a loop: everything after the first visit of this node IS the loop.
        const loop = path.slice(at).map((w) => ({ x: w.p.x, z: w.p.z }));
        if (loop.length >= 3) loops.push(loop);
        for (let k = at + 1; k < path.length; k++) seenAt.delete(path[k]!.key);
        path.length = at + 1;
    }
    if (path.length >= 3) loops.push(path.map((w) => ({ x: w.p.x, z: w.p.z })));
    return loops;
}

/**
 * Inset a simple polygon by a PER-EDGE setback, keyed by each edge's
 * classification. Deterministic + metric-exact in scene-XZ metres, and
 * WINDING-INDEPENDENT (CW and CCW inputs give the same inset area).
 *
 * Method (§INSET-ROUND-JOIN, L-586): trace the boundary of `parcel \ ⋃ (edge_i ⊕
 * disk(s_i))` — each edge's offset SEGMENT, joined at each vertex by the sharp
 * corner or the hand-over arc the erosion actually has there; drop any traced
 * point the erosion's own definition does not admit; split residual folds into
 * simple loops and keep the surviving material. Robust for rectangular, convex
 * and irregular non-convex parcels, and specifically for DISSOLVED cadastral
 * blocks (40–60 edges, sub-metre notches, sub-degree turns, mixed
 * setback-vs-party-wall calls). Genuine over-inset (setbacks consume the parcel)
 * → `degenerate: true` with an empty polygon (no crash, no garbage).
 *
 * The result is never LARGER than the exact erosion — verified block by block
 * against an independent grid oracle, because the direction of the error is the
 * whole compliance question (C58 §1.4).
 *
 * @param polygon              closed ring, ≥ 3 vertices, scene-XZ metres.
 * @param edgeClassifications  one per edge (`edge i` = `polygon[i]→polygon[i+1]`).
 * @param setbacks             per-classification inward distances (metres).
 */
export function insetPolygonPerEdge(
    polygon: ReadonlyArray<Pt>,
    edgeClassifications: ReadonlyArray<ParcelEdgeClassification>,
    setbacks: PerEdgeSetbacks,
): InsetResult {
    if (polygon.length < 3) return { polygon: [], degenerate: true };

    // ── 1. Clean coincident/zero-length edges (winding preserved). ───────────
    const { pts, cls } = cleanRing(polygon, edgeClassifications);
    if (pts.length < 3) return { polygon: [], degenerate: true };

    const signed = polygonSignedArea(pts);
    if (Math.abs(signed) < EPSILON_ZERO) return { polygon: [], degenerate: true };

    // ── Zero setback on every edge → the inset IS the parcel (eroding by 0 is
    //    the identity). Short-circuit the offset/miter/soundness pipeline, whose
    //    strict vertex-in-parcel gate treats an inset vertex sitting EXACTLY on a
    //    parcel vertex (the 0-erosion case) as an escape → a false `degenerate`.
    //    This is the common structured path where a plan publishes height/FAR but
    //    NO setbacks (e.g. DK Plandata) — the buildable footprint is the whole
    //    parcel, not "no buildable area". ─────────────────────────────────────
    const maxSetback = Math.max(
        0,
        setbacks.front,
        setbacks.side,
        setbacks.rear,
        setbacks.unclassified,
    );
    if (maxSetback <= EPSILON_ZERO) {
        return { polygon: pts.map((p) => ({ x: p.x, z: p.z })), degenerate: false };
    }

    // ── 2. Canonicalise to CCW so the inward normal + all downstream math are
    //       orientation-independent (the L-403 winding fix). Reversing the ring
    //       also reverses the per-edge setbacks so each stays with its edge. ──
    let ring: Pt[] = pts;
    let ringCls: Array<ParcelEdgeClassification | undefined> = cls;
    if (signed < 0) {
        // Reverse vertices; edge i of the reversed ring is original edge
        // (n-1-i) traversed backwards, so shift the classification accordingly.
        const n = pts.length;
        ring = pts.slice().reverse();
        ringCls = new Array(n);
        for (let i = 0; i < n; i++) ringCls[i] = cls[(n - 1 - i + n) % n];
    }

    // ── 3. §INSET-ROUND-JOIN (L-586) — build the offset ring as the boundary of the CAPSULE UNION.
    //
    // WHAT THIS REPLACES, AND WHY THE OLD CONSTRUCTION COULD NOT BE PATCHED FURTHER. Slices L-403 →
    // L-525b → L-581 all built the inset by MITRING: offset every edge's supporting LINE inward,
    // intersect consecutive lines, then repair the wreckage (drop reversed edges, decompose folds,
    // clamp escapees back into the half-planes the drop abandoned). Measured on the 65-block
    // Eixample fixture at the 11 m ordinance floor with the Art. 242 party-wall call
    // {front: 11, side: 0}, that pipeline topped out at 55.4% geometrically sound, with `inset area
    // > parcel` at 27.7% and `vertex escaped the parcel` at 16.9% — escapes reaching 1,736 m on an
    // 80 m block.
    //
    // THE ROOT CAUSE IS NOT REPAIRABLE BY REPAIR. A mitre vertex sits at |M − V| = |a − b| / sin θ
    // for adjacent setbacks a, b and turn angle θ. A dissolved cadastral ring is not a tidy polygon:
    // 49% of its vertices turn by less than 1° and 20% of its edges are under 1 m (measured —
    // `scratchpad/probe-l581-collinear.mts`). Art. 242's party-wall call puts a = 11 next to b = 0
    // across exactly such vertices, so sin θ ≈ 0.017 throws the mitre 630 m away — from a legal
    // input, on correct data, with no bug anywhere upstream. Every previous slice was fighting that
    // identity. ⚠ Simplifying the ring first does NOT help and was measured: a Douglas-Peucker
    // pre-pass scores 53.8% at 5 cm, 49.2% at 15 cm, 52.3% at 30 cm, 50.8% at 1 m. Only a 2 m
    // distortion improves it, and 2 m is itself a planning dimension.
    //
    // THE CORRECT OBJECT. A per-edge setback is an EROSION, and the erosion has a closed-form
    // definition that owes nothing to mitring:
    //
    //     inset = { q ∈ parcel : dist(q, edge_i) ≥ s_i for every edge i }
    //           = parcel \ ⋃_i (edge_i ⊕ disk(s_i))          — a union of CAPSULES.
    //
    // So the inset boundary is the outer boundary of that capsule union, and it is built from
    // exactly two kinds of piece: each edge's offset SEGMENT (never its infinite line), and at each
    // vertex the arc of the circle around that vertex where the two neighbouring capsules hand
    // over. Both pieces lie within max(s) of the parcel boundary, so nothing can fly 630 m — the
    // pathology is not mitigated, it is absent from the construction.
    //
    // THE HAND-OVER AT A VERTEX, stated exactly (this is the whole algorithm):
    //   Let V be the vertex, `a` the setback of the incoming edge (direction dp, inward normal np)
    //   and `b` that of the outgoing edge (dc, nc). The two offset lines meet at M.
    //     • M is a genuine boundary point IFF its perpendicular feet land on the SEGMENTS that
    //       generated it — i.e. (M−V)·dp ≤ 0 and (M−V)·dc ≥ 0. For equal setbacks that test reduces
    //       exactly to "the vertex is convex", which is the classical result that an erosion keeps
    //       convex corners SHARP and rounds reflex ones. For unequal setbacks it additionally
    //       rejects the near-collinear blow-up above — the case Art. 242 actually generates.
    //     • Otherwise the capsules hand over on the circle of radius r = max(a, b) around V. The
    //       incoming capsule leaves that circle at E = V + a·np − √(r²−a²)·dp and the outgoing one
    //       joins it at Q = V + b·nc + √(r²−b²)·dc; between them runs the arc. When a = b this is
    //       the textbook round join; when b = 0 (a *mitgera* / party wall) it is the quarter-turn
    //       that lands the inset back ON the parcel edge at distance a from the corner — which is
    //       what the ordinance means, and what a mitre could never express.
    //
    // ⚠ DIRECTION OF ERROR (C58 §1.4). Every departure from the exact erosion here is INWARD: the
    // arc is drawn as an INSCRIBED chord polyline, and where the setbacks differ the hand-over runs
    // on the LARGER radius. The inset can therefore only ever be under-stated, never over-stated —
    // the one direction a buildable-depth number is allowed to be wrong in. Verified against an
    // independent grid-rasterisation oracle rather than against itself.
    //
    // ⚠ WHAT IS DELETED HERE AND MUST NOT COME BACK. Step 4's "drop the reversed edge's offset
    // line" (L-403) and step 4b's half-plane clamp (L-581) were both repairs for mitre blow-up. An
    // offset SEGMENT cannot reverse — it is a rigid translate of its parent edge — so there is
    // nothing to drop; and no constraint is ever abandoned, so there is nothing to clamp back.
    // Re-introducing either would be repairing a failure this construction does not have. Do NOT
    // read the archived "deleting step 4 collapses to 1.5% sound" result as an argument against
    // this: that was measured on the MITRE construction, where the drop was load-bearing.
    const n = ring.length;
    const dirs: Pt[] = new Array(n);
    const nrms: Pt[] = new Array(n);
    const sbs: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const v = sub(b, a);
        const len = length(v);
        if (len < EPSILON_ZERO) return { polygon: [], degenerate: true }; // cleanRing should have removed it
        dirs[i] = { x: v.x / len, z: v.z / len };
        nrms[i] = { x: -v.z / len, z: v.x / len }; // CCW ⇒ the interior is LEFT of the directed edge
        sbs[i] = Math.max(0, setbackForClass(ringCls[i], setbacks));
    }

    // ── 4. Walk the vertices, emitting each hand-over. The offset SEGMENT of edge i is implicit:
    //       it runs from the last point emitted at vertex i to the first point emitted at vertex
    //       i+1. That is why no edge can reverse in isolation — an over-eroded edge shows up as a
    //       CROSSING, which is a global property step 5 is built to resolve. ─────────────────────
    let out: Pt[] = [];
    const push = (p: Pt): void => {
        const last = out[out.length - 1];
        if (last && length(sub(p, last)) < COINCIDENT_EPS_M) return;
        out.push(p);
    };
    for (let i = 0; i < n; i++) {
        const V = ring[i]!;
        const ip = (i - 1 + n) % n;
        const dp = dirs[ip]!;
        const np = nrms[ip]!;
        const a = sbs[ip]!;
        const dc = dirs[i]!;
        const nc = nrms[i]!;
        const b = sbs[i]!;

        const pPrev: Pt = { x: V.x + a * np.x, z: V.z + a * np.z };
        const pCurr: Pt = { x: V.x + b * nc.x, z: V.z + b * nc.z };

        const m = lineIntersect(pPrev, dp, pCurr, dc);
        if (m) {
            const tPrev = (m.x - V.x) * dp.x + (m.z - V.z) * dp.z;
            const tCurr = (m.x - V.x) * dc.x + (m.z - V.z) * dc.z;
            // Feet on the GENERATING SEGMENTS ⇒ the mitre is the exact capsule-union corner.
            if (tPrev <= EPSILON_ZERO && tCurr >= -EPSILON_ZERO) {
                push(m);
                continue;
            }
        }

        const r = Math.max(a, b);
        if (r < EPSILON_ZERO) {
            push({ x: V.x, z: V.z }); // both neighbours are party walls — the corner is the corner
            continue;
        }
        const back = Math.sqrt(Math.max(0, r * r - a * a));
        const fwd = Math.sqrt(Math.max(0, r * r - b * b));
        const e: Pt = { x: pPrev.x - back * dp.x, z: pPrev.z - back * dp.z };
        const q: Pt = { x: pCurr.x + fwd * dc.x, z: pCurr.z + fwd * dc.z };
        push(e);
        const arc: Pt[] = [];
        arcInteriorPoints(V, r, e, q, arc);
        for (const p of arc) push(p);
        push(q);
    }
    // The wrap can close on a duplicate of the first point.
    while (out.length >= 2 && length(sub(out[out.length - 1]!, out[0]!)) < COINCIDENT_EPS_M) out.pop();
    if (out.length < 3) return { polygon: [], degenerate: true };

    // ── 4b. §INSET-EROSION-PREDICATE (L-586) — keep only points that are GENUINELY in the erosion.
    //
    // Step 4 builds the boundary of the capsule union PAIRWISE — each vertex hand-over knows about
    // its own two capsules and nothing else. That is right almost everywhere and wrong exactly where
    // a THIRD capsule already covers the ground: a dissolved cadastral ring carries 0.3–0.6 m notch
    // spikes (chamfer joins between the parcels that were merged), and the round join at such a
    // spike sweeps a 138° arc of radius `s` about a feature two orders of magnitude smaller than
    // `s`. Measured on block 02309 at a uniform 12 m: two arc points swept 3.0 m clean OUTSIDE the
    // block, and the raw ring measured 3,400 m² against an independent grid oracle's 3,227 m² — an
    // OVER-statement, the direction C58 §1.4 forbids.
    //
    // The fix is not another repair heuristic: it is the DEFINITION. A point belongs to the inset
    // iff it is in the parcel and no closer than s_j to segment j, for EVERY j — not just its own
    // two. Points failing that were never on the erosion boundary, so dropping them removes area
    // that was never buildable. This is an independent test of the construction rather than a part
    // of it, which is what lets it catch a pairwise blind spot the construction cannot see.
    //
    // Edges with s_j = 0 (a *mitgera* / party wall) impose NOTHING — `dist ≥ 0` is vacuous — so the
    // Barcelona ensanche case is untouched by this stage except through parcel containment, where
    // §INSET-BOUNDARY-TOLERANT (L-462) already governs: those vertices sit exactly ON the parcel
    // edge, which is legal for an erosion by zero.
    const admissible: Pt[] = [];
    for (const p of out) {
        if (!pointInPolygon(p, ring) && pointPolygonEdgeDistance(p, ring) > BOUNDARY_TOLERANCE_M) {
            continue; // outside the parcel — an erosion never leaves it
        }
        let ok = true;
        for (let j = 0; j < n; j++) {
            const s = sbs[j]!;
            if (s <= EPSILON_ZERO) continue;
            if (pointSegmentDistance(p, ring[j]!, ring[(j + 1) % n]!) < s - PREDICATE_TOLERANCE_M) {
                ok = false;
                break;
            }
        }
        if (ok) admissible.push(p);
    }
    out = admissible;
    while (out.length >= 2 && length(sub(out[out.length - 1]!, out[0]!)) < COINCIDENT_EPS_M) out.pop();
    if (out.length < 3) return { polygon: [], degenerate: true };

    // ── 5. Clean up any residual self-intersection (narrow concavities). ─────
    // §INSET-LOOP-DECOMPOSE (L-525b) — split into simple loops and keep the material that
    // survives the offset. A loop wound OPPOSITE the CCW-canonicalised input is an offset
    // artefact (a reversed fold), never real buildable area, so it is discarded on ORIENTATION
    // rather than on any size threshold — a threshold would be a tunable standing between a
    // cadastral block and a compliance number, which is what L-525b was.
    if (selfIntersects(out)) {
        const loops = decomposeToSimpleLoops(out);
        const kept = loops.filter((l) => l.length >= 3 && polygonSignedArea(l) > EPSILON_ZERO);
        if (kept.length === 0) return { polygon: [], degenerate: true };
        // An offset can genuinely sever a polygon into several disjoint pieces (a block pinched
        // at a narrow waist). `InsetResult` carries ONE ring, so the largest surviving piece is
        // returned — the principal buildable region. That UNDER-reports total area when a real
        // split occurs, which is the conservative direction for a setback (it can only shrink a
        // buildable envelope, never inflate one). A multi-region result needs an API change and
        // is tracked separately rather than faked here with a merged ring that encloses the gap.
        kept.sort((a, b) => polygonSignedArea(b) - polygonSignedArea(a));
        out = kept[0]!;
    }
    if (out.length < 3) return { polygon: [], degenerate: true };

    // ── 6. Final validity gates (soundness — genuine over-inset detection). ──
    const insetSigned = polygonSignedArea(out);
    // Collapsed area, or a flipped winding (offset lines crossed the far side).
    if (insetSigned <= EPSILON_ZERO) return { polygon: [], degenerate: true };
    // The inset is an EROSION — it can never be larger than the parcel. A bigger
    // area means the offset/cleanup produced garbage (a folded or escaped ring).
    if (insetSigned > Math.abs(signed) + EPSILON_ZERO) return { polygon: [], degenerate: true };

    // Every inset vertex must lie inside the original parcel. This is the strict soundness gate:
    // an inward offset stays within the parcel, so a vertex that escaped (a pathological fold on
    // a spiky non-convex ring) is rejected rather than emitted as a wrong envelope.
    //
    // §INSET-BOUNDARY-TOLERANT (L-462) — ⚠ THE PREVIOUS COMMENT HERE WAS WRONG. It claimed
    // "`pointInPolygon` treats on-boundary as inside, so a vertex seated exactly on a parcel edge
    // still passes." That is TRUE FOR ONLY HALF THE BOUNDARY: `pointInPolygon` uses the standard
    // half-open ray-casting convention, so on a 113×113 ring the point (0, 11) tests INSIDE while
    // (113, 11) — the mirror-image situation on the opposite edge — tests OUTSIDE. Verified
    // directly.
    //
    // CONSEQUENCE: any inset with a ZERO setback on some edges puts its vertices exactly ON those
    // edges, and roughly half of them then fail this gate — so the whole inset was reported
    // `degenerate` and the caller saw "no buildable area" for a perfectly valid plot. **That is
    // precisely the PARTY-WALL (*mitgera*) case — a front setback with `side: 0`, i.e. the
    // Barcelona *ensanche* configuration ADR-0270 exists to serve.** The all-zero short-circuit
    // above was an earlier, narrower patch for the same underlying asymmetry.
    //
    // WHY THE FIX IS LOCAL AND NOT IN `pointInPolygon`: that validator is shared, and its
    // half-open convention is load-bearing elsewhere — it is what stops a point on a boundary
    // SHARED by two parcels being counted in both (C19 §1.6 containment). Changing it would ripple
    // into compliance checks to fix a rendering-side soundness gate. So the tolerance is applied
    // HERE, where "on the parcel edge" is unambiguously legal for an erosion.
    for (const p of out) {
        if (pointInPolygon(p, ring)) continue;
        // Outside by the half-open test — accept only if it is ON the boundary within tolerance.
        if (pointPolygonEdgeDistance(p, ring) <= BOUNDARY_TOLERANCE_M) continue;
        return { polygon: [], degenerate: true };
    }

    return { polygon: out, degenerate: false };
}
