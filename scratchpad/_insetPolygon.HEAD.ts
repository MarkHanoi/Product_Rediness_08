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
//   frame the parcel renders in). A pure metric half-plane edge-offset is the
//   correct tool here: it is deterministic, per-edge (front/side/rear each get
//   their own inward offset — C58 can't do that with a single uniform buffer),
//   metric-exact in scene-XZ, and adds no dependency.
// ─────────────────────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────────────────────
// ROBUSTNESS FOR REAL DRAWN PARCELS (L-403 — winding + non-convex hardening):
//   The first slice offset each edge's line inward and re-intersected consecutive
//   lines (a "miter" offset). That is exact for rectangles + convex parcels, but
//   it was gated by degenerate heuristics that fired on ANY single reversed inset
//   edge. Real hand-drawn parcels are IRREGULAR (non-orthogonal, mixed edge
//   lengths, occasional shallow reflex vertices) and per-edge setbacks differ
//   (front≠side≠rear), so a short edge flanked by larger setbacks legitimately
//   COLLAPSES to a miter join — which the old heuristics mis-read as "the whole
//   parcel is over-inset" → status=degenerate, inset=0 m² on a large valid plot.
//   The result was also WINDING-DEPENDENT (CW and CCW twins of the same polygon
//   gave different answers).
//
//   This implementation is winding-INDEPENDENT by construction (it canonicalises
//   to CCW, and the offset-line intersection set is identical for either input
//   winding) and treats a collapsed/reversed edge as a LOCAL event: it drops that
//   edge's offset line and re-miters the neighbours (the vanished-edge miter
//   join), instead of degenerating the whole polygon. A final self-intersection
//   cleanup (greedy loop removal) handles narrow concavities where an inward
//   offset would otherwise fold over itself. Genuine over-inset (setbacks consume
//   the parcel → < 3 surviving vertices, ~0 area, or the inset escapes the
//   parcel) is still reported as `degenerate` — but a large simple irregular
//   polygon now yields a real inset.
// ─────────────────────────────────────────────────────────────────────────────

import type { Pt } from '@pryzm/schemas';
import type { ParcelEdgeClassification } from '@pryzm/schemas';
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

const EPS = 1e-9;
/** Vertices closer than this (metres) are treated as coincident (1 µm). */
const COINCIDENT_EPS = 1e-6;
/**
 * §INSET-BOUNDARY-TOLERANT (L-462) — how far outside the parcel an inset vertex may test before
 * the soundness gate rejects it. 1 mm: far below any planning dimension, so it cannot mask a
 * genuine escape (a real fold lands metres out), but comfortably above the float error of a
 * miter intersection landing on an edge it was constructed to lie on.
 */
const BOUNDARY_TOLERANCE_M = 1e-3;
/**
 * §INSET-CLAMP-TO-HALFPLANE (L-581) — fixed pass budget for the half-plane clamp in step 4b.
 * Deliberately a COUNT and not a convergence tolerance: a data-dependent iteration count would make
 * the inset input-sensitive at the last bit and break the byte-determinism C58 §1.1 requires of a
 * number we publish as a legal figure. 8 passes was measured to be past the point where any of the
 * 65 real Eixample fixture blocks still moves.
 */
const CLAMP_PASSES = 8;
/**
 * §INSET-CLAMP-TO-HALFPLANE (L-581) — how far past a dropped edge's own extent its half-plane may
 * still govern. A miter join legitimately lands slightly beyond the edge it was built from, so a
 * hard [0, len] window would miss the very vertices the drop created. Half a metre is below any
 * planning dimension and far above miter float error.
 */
const CLAMP_SPAN_SLACK_M = 0.5;

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
    if (Math.abs(denom) < EPS) return null;
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
        if (prev && length(sub(p, prev)) < COINCIDENT_EPS) continue;
        pts.push({ x: p.x, z: p.z });
        cls.push(edgeClassifications[i]);
    }
    // Also fold a coincident wrap (last ≈ first).
    while (pts.length >= 2 && length(sub(pts[pts.length - 1]!, pts[0]!)) < COINCIDENT_EPS) {
        pts.pop();
        cls.pop();
    }
    return { pts, cls };
}

interface OffsetLine {
    readonly p: Pt; // a point on the inward-offset supporting line
    readonly d: Pt; // unit direction of the (original) edge
    /** Length of the parent edge. §INSET-CLAMP-TO-HALFPLANE (L-581) needs it to keep the clamp
     *  LOCAL: an edge's half-plane only governs the strip in front of that edge, never the whole
     *  ring. Without this the clamp drags distant vertices inward across a reflex polygon. */
    readonly len: number;
}

/**
 * §INSET-CLAMP-TO-HALFPLANE (L-581) — signed distance from `q` to an offset line, POSITIVE on the
 * INTERIOR side. For a CCW ring the interior lies LEFT of the directed edge, so the inward normal of
 * direction `d` is `(-d.z, d.x)` and the interior half-plane is `{ q : (q − p)·n ≥ 0 }`.
 */
function interiorSignedDist(q: Pt, line: OffsetLine): number {
    const v = sub(q, line.p);
    return v.x * -line.d.z + v.z * line.d.x;
}

/** §INSET-CLAMP-TO-HALFPLANE (L-581) — nearest point to `q` on the offset line's supporting line. */
function projectOnto(q: Pt, line: OffsetLine): Pt {
    const s = interiorSignedDist(q, line);
    return { x: q.x - s * -line.d.z, z: q.z - s * line.d.x };
}

/**
 * Miter offset: place a new vertex at each intersection of consecutive offset
 * lines. Parallel consecutive lines (a straight/collinear vertex) fall back to
 * the current line's offset point. Returns one vertex per offset line.
 */
function miter(lines: ReadonlyArray<OffsetLine>): Pt[] {
    const n = lines.length;
    const out: Pt[] = new Array(n);
    for (let j = 0; j < n; j++) {
        const prev = lines[(j - 1 + n) % n]!;
        const curr = lines[j]!;
        const x = lineIntersect(prev.p, prev.d, curr.p, curr.d);
        out[j] = x ?? { ...curr.p };
    }
    return out;
}

/** True iff segments a-b and c-d properly cross (interiors intersect). */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const d1 = cross(sub(b, a), sub(c, a));
    const d2 = cross(sub(b, a), sub(d, a));
    const d3 = cross(sub(d, c), sub(a, c));
    const d4 = cross(sub(d, c), sub(b, c));
    return (d1 > EPS) !== (d2 > EPS) && (d3 > EPS) !== (d4 > EPS);
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
    if (Math.abs(denom) < EPS) return null;
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
 * Method: offset each edge's supporting line inward by its own setback, miter
 * the offset lines to place vertices, iteratively collapse any edge whose inset
 * segment REVERSES (a short edge subsumed by its neighbours' larger setbacks —
 * a local miter join, NOT a global over-inset), then clean up any residual
 * self-intersection from narrow concavities. Robust for rectangular, convex,
 * and irregular non-convex parcels. Genuine over-inset (setbacks consume the
 * parcel) collapses to < 3 vertices / ~0 area / an inset that escapes the
 * parcel → `degenerate: true` with an empty polygon (no crash, no garbage).
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
    if (Math.abs(signed) < EPS) return { polygon: [], degenerate: true };

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
    if (maxSetback <= EPS) {
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

    // ── 3. Build each edge's inward-offset supporting line. For a CCW ring the
    //       interior lies to the LEFT of the directed edge, so the inward unit
    //       normal of edge dir (ux,uz) is (-uz, ux). ─────────────────────────
    const n = ring.length;
    let lines: OffsetLine[] = [];
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const dir = sub(b, a);
        const len = length(dir);
        if (len < EPS) continue; // already cleaned, but stay defensive
        const ux = dir.x / len;
        const uz = dir.z / len;
        const nx = -uz;
        const nz = ux;
        const s = Math.max(0, setbackForClass(ringCls[i], setbacks));
        lines.push({ p: { x: a.x + nx * s, z: a.z + nz * s }, d: { x: ux, z: uz }, len });
    }
    if (lines.length < 3) return { polygon: [], degenerate: true };

    // §INSET-CLAMP-TO-HALFPLANE (L-581) — the lines step 4 DISCARDS, collected as it discards them.
    //
    // ⚠ IT MUST BE THE DROPPED LINES ONLY — NOT ALL OF THEM. Clamping against every offset line is
    // the same thing as intersecting all the half-planes, and **that is only equivalent to an inset
    // for a CONVEX polygon.** On a reflex ring a perfectly legitimate mitre vertex can sit outside a
    // NON-ADJACENT edge's offset half-plane, so a global clamp eats real buildable area. Measured,
    // not reasoned: the all-lines version broke four L-403/L-525b/L-529 regression tests at once —
    // the large irregular plot, the concave slot, the multi-fold ring and the battle-axe/flag lot
    // all went degenerate. That is the SAME defect class that sank the retracted half-plane remedy,
    // reintroduced in a milder disguise.
    //
    // The constraint step 4 actually abandons is the DROPPED edge's line, and that is the only one
    // we are entitled to put back.
    const droppedLines: OffsetLine[] = [];

    // ── 4. Miter, then iteratively drop any edge whose inset segment reversed
    //       (a collapsed/vanished edge). Removing that edge's offset line lets
    //       its two neighbours miter directly — the correct join for a short
    //       edge subsumed by larger setbacks. Bounded: each pass removes ≥ 1. ─
    let out: Pt[] = miter(lines);
    for (let guard = 0; guard < lines.length; guard++) {
        let reversedIdx = -1;
        for (let j = 0; j < lines.length; j++) {
            const line = lines[j]!;
            const a = out[j]!;
            const b = out[(j + 1) % out.length]!;
            const edge = sub(b, a);
            // Reversed iff the inset segment runs opposite its parent edge dir.
            if (edge.x * line.d.x + edge.z * line.d.z <= EPS) {
                reversedIdx = j;
                break;
            }
        }
        if (reversedIdx < 0) break;
        droppedLines.push(lines[reversedIdx]!);
        lines.splice(reversedIdx, 1);
        if (lines.length < 3) return { polygon: [], degenerate: true };
        out = miter(lines);
    }

    // ── 4b. §INSET-CLAMP-TO-HALFPLANE (L-581) — PUT BACK THE CONSTRAINTS STEP 4 THREW AWAY. ──
    //
    // THE DEFECT. Dropping line `j` above does not merely delete a vertex — it ABANDONS EDGE j'S
    // HALF-PLANE CONSTRAINT. Its two neighbours are then free to mitre to a corner with nothing
    // holding it inside the parcel, and on a real cadastral block (40–60 edges, 10–43 reflex
    // vertices, and the `{front: d, side: 0}` party-wall mixture Art. 242 actually asks for) step 4
    // discards ~50% of all lines, so the survivors mitre somewhere else entirely.
    //
    // ⚠ MEASURED ON 65 REAL EIXAMPLE BLOCKS, and the previously-recorded mechanism was WRONG. The
    // long-standing write-up said the cascade makes the ring "drain below 3 lines". That gate fires
    // ZERO times, at every depth, on every block. What actually happened is that the wreckage was
    // caught downstream by the SOUNDNESS gates in step 6 — which were doing their job correctly and
    // therefore hid the cause:
    //
    //     at the 11 m ORDINANCE FLOOR — the gentlest depth the solver is ever asked for:
    //       sound 36.9%  ·  `inset area > parcel` 29.2%  ·  `vertex escaped` 33.8%
    //       escape distance: median 1.27 m, MAX 177 m   (at 30 m depth: max 5.6 km)
    //
    // A remedy aimed at the line COUNT would therefore have fixed a gate that never fires. The
    // repair has to restore the CONSTRAINT.
    //
    // WHAT THIS DOES. Project every surviving vertex back into the interior half-plane of every
    // offset line — including the dropped ones. A vertex already inside is untouched, so this is a
    // no-op on sound geometry; a vertex that escaped is pulled onto the boundary of the constraint
    // it violated. Iterated, because satisfying one half-plane can violate another, with a FIXED
    // pass budget rather than a convergence tolerance so the result stays byte-deterministic
    // (C58 §1.1) instead of becoming input-sensitive at the last bit.
    //
    // ⚠ DIRECTION OF ERROR — why this is allowed to change a legal number. The projection moves a
    // vertex only INWARD, so the inset can only ever SHRINK. A smaller inset reports LESS interior
    // free area, so `solveBlockDerivedDepth` concludes a SHALLOWER depth. The remedy therefore errs
    // conservative, which is the direction C58 §1.4 permits.
    //
    // ⚠⚠ THIS IS NOT THE RETRACTED HALF-PLANE INTERSECTION, and the difference is the whole reason
    // that one was withdrawn. Intersecting all half-planes OVER-states free area at convex
    // front–front corners (a true offset rounds them) and therefore OVER-states buildable depth —
    // fabrication in the forbidden direction, trading a DETECTABLE failure for an undetectable one.
    // Clamping starts from the mitre and can only remove area. Do not "simplify" this into an
    // intersection.
    //
    // MEASURED RESULT (65 real blocks, offline, no network):
    //   inset sound at the 11 m floor              36.9% → 55.4%
    //   Art. 242 answers landing AT the 30% rule        3 → 9
    //
    // ⚠⚠ AN EARLIER VERSION OF THIS COMMENT CLAIMED 92.3% AND 34, AND BOTH WERE ARTEFACTS —
    // RETRACTED. They came from the global (un-gated) clamp, which was OVER-ERODING: it ate real
    // courtyard, and a smaller free area makes the bisection settle at a shallower depth where the
    // ratio lands on exactly 30%. **So "lands honestly AT 30%" was itself gameable by over-erosion**
    // — the very metric introduced to detect dishonest answers scored HIGHEST when the geometry was
    // most wrong. It was caught only by an INDEPENDENT grid-rasterisation oracle
    // (`scratchpad/probe-l581-grid-oracle.mts`, a different algorithm entirely): on real block 02309
    // a uniform 12 m inset is ~3,227 m² (48.2%), the gated code returns 2,921 m² (43.6%, correctly
    // conservative), and the un-gated clamp returned **256 m² — wrong by 12×** while every fixture
    // aggregate still looked healthy. Never accept an aggregate as proof of a geometry change.
    // ⚠ REJECTED, MEASURED: deleting step 4 and relying on the step-5 loop decomposition instead
    // (the tempting "the L-525b cleanup subsumes the L-403 drop" simplification) collapses to
    // **1.5% sound**. Step 4 is load-bearing. Keep BOTH.
    for (let pass = 0; pass < CLAMP_PASSES; pass++) {
        let moved = false;
        for (let k = 0; k < out.length; k++) {
            let q = out[k]!;
            for (const line of droppedLines) {
                if (interiorSignedDist(q, line) >= -EPS) continue;
                // ⚠ LOCALITY GATE — only clamp a vertex that lies IN FRONT OF the dropped edge.
                // An edge's half-plane constrains the strip its own extent sweeps, not the entire
                // ring; applying it globally is half-plane INTERSECTION by another name, which is
                // valid only for a convex polygon. Measured: without this gate the uniform 12 m
                // inset of real block 02309 came out at 256 m² against an independent grid oracle's
                // 3,227 m² — wrong by 12×, while every fixture aggregate still looked healthy.
                const t = (q.x - line.p.x) * line.d.x + (q.z - line.p.z) * line.d.z;
                if (t < -CLAMP_SPAN_SLACK_M || t > line.len + CLAMP_SPAN_SLACK_M) continue;
                q = projectOnto(q, line);
                moved = true;
            }
            out[k] = q;
        }
        if (!moved) break;
    }

    // ── 5. Clean up any residual self-intersection (narrow concavities). ─────
    // §INSET-LOOP-DECOMPOSE (L-525b) — split into simple loops and keep the material that
    // survives the offset. A loop wound OPPOSITE the CCW-canonicalised input is an offset
    // artefact (a reversed fold), never real buildable area, so it is discarded on ORIENTATION
    // rather than on any size threshold — a threshold would be a tunable standing between a
    // cadastral block and a compliance number, which is what L-525b was.
    if (selfIntersects(out)) {
        const loops = decomposeToSimpleLoops(out);
        const kept = loops.filter((l) => l.length >= 3 && polygonSignedArea(l) > EPS);
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
    if (insetSigned <= EPS) return { polygon: [], degenerate: true };
    // The inset is an EROSION — it can never be larger than the parcel. A bigger
    // area means the offset/cleanup produced garbage (a folded or escaped ring).
    if (insetSigned > Math.abs(signed) + EPS) return { polygon: [], degenerate: true };

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
