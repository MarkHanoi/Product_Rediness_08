// §K1-POLY-DIFFERENCE — POLYGON DIFFERENCE `A ∖ B`, with holes first-class in the RESULT, plus the
// inward-biased carve that converts a holed result into simple rings a single-ring envelope can
// publish.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, AND WHY IT IS HERE AND NOT IN `geometry-kernel`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `@pryzm/geometry-kernel` `pure/polygonBoolean.ts` (§C73-POLY-BOOLEAN) delivers INTERSECTION and
// UNION of simple concave rings, and its header states, verbatim: *"DIFFERENCE (A \ B) IS NOT
// DELIVERED. It falls out of this body with a third keep-rule and a reversal of B's kept
// sub-edges, but it is not here, because it is not oracle-pinned and an unproven boolean silently
// corrupts every consumer downstream of it. Do not add it without the same oracle table the two
// delivered ops carry."*
//
// This module IS that third keep-rule, delivered WITH its own oracle table
// (`__tests__/polygonDifference.test.ts`: a hand-computed case table, an independent half-plane
// oracle for convex subtrahends, a grid-rasterisation point oracle, and an `|A| = |A∩B| + |A∖B|`
// differential arm against the kernel's proven intersection over a generated adversarial corpus).
// It lives in the ENVELOPE kernel (site-parcel-data/src/geometry — the corpus that owns the
// legally-binding buildable-area constructions and their direction-of-error discipline) because
// its first consumer is legal: the `explicit-area` courtyard carve (L-12896 / §NL-BOUWVLAK-HOLES),
// where a published hole ("do not build here") bites a parcel and the interim honest answer was a
// refusal. The audit trail is `audit/europe-site-intel` lane B §2.5: *"(1) difference (A ∖ B)
// with its own oracle table + an under-coverage direction sentence"*.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE ALGORITHM — the kernel's arrangement + midpoint classification, third keep-rule
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Steps 1 (SPLIT), 2 (CLASSIFY by midpoint), 3 (SHARED EDGES BY ENDPOINT IDENTITY) and 4 (CHAIN,
// sharpest-right-turn at pinches) are the kernel boolean's, reproduced here against the SAME
// canonical predicates (every predicate body is imported from the kernel — this module mints NO
// new epsilon and NO new predicate family; see the import list). The one thing that is new is the
// DIFFERENCE keep-rule, with both rings canonicalised CCW:
//
//   · sub-edge of A, shared with B, SAME direction (interiors on the same side — B occupies the
//     strip up to this edge from inside A):        boundary of NEITHER ⇒ dropped.
//   · sub-edge of A, shared with B, OPPOSITE direction (B abuts A externally along this edge):
//     the edge still bounds A∖B (= A locally)      ⇒ kept, from A.
//   · sub-edge of A, not shared: kept iff its midpoint is OUTSIDE B.
//   · sub-edge of B, not shared: kept REVERSED iff its midpoint is INSIDE A (a kept B-edge is the
//     carve boundary, traversed with the result's interior on its left — hence the reversal; a
//     subtrahend strictly inside A therefore comes back as a NEGATIVE loop, i.e. a HOLE).
//   · sub-edge of B, shared: never contributes (A already contributed the single copy, or none).
//
// An EMPTY kept set is a legitimate answer for difference (A ⊆ B ⇒ A∖B = ∅), unlike union.
//
// HOLES ARE FIRST-CLASS IN THE RESULT: loops with negative signed area are holes, assigned to the
// positive loop that contains them, and returned as `{ outer, holes }` PARTS — the same shape
// `explicitArea.ts` §MULTI-PART-EXPLICIT-AREA already speaks.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// DIRECTION OF ERROR (the sentence lane B demanded — read before consuming a number)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// On the legal path A∖B is "parcel-side region minus a published exclusion", and C58 §1.4 forbids
// exactly one direction: the result must never GAIN area it does not have (L-616). Three regimes:
//
//   1. EXACT REGIME (`differenceRings2D`): away from any COINCIDENT_M-scale near-coincidence the
//      answer is exact to float noise, and the differential arm pins `|A| = |A∩B| + |A∖B|` to the
//      kernel's stated resolution bound COINCIDENT_M × (P_A + P_B) / 2 — ~0.02 m² on a 30 m
//      perimeter, orders below any reportable buildable-area precision. WITHIN that band the
//      bound is symmetric (two boundaries closer than 1 mm are THE SAME PLACE by the declared
//      model identity, so neither direction is a statement the model can make) — the lane-B
//      verdict §2.2 accepts exactly this posture for the difference op, with the bound named.
//   2. AMBIGUITY ABOVE THE BAND: anything the arrangement cannot resolve into closed loops is a
//      TYPED REFUSAL (`unresolved-topology`), never a repaired ring — and a refusal draws
//      nothing, which cannot overstate. Same for self-intersecting or degenerate inputs.
//   3. REPRESENTATION-FORCED ERROR (`carveHolesToSimpleRings`): a hole strictly inside the region
//      yields an annulus, which a single simple ring CANNOT represent. The carve bridges the hole
//      to the outer boundary through a slit of positive width `CARVE_SLIT_WIDTH_M` and SUBTRACTS
//      the slit corridor too — so every departure from the exact difference REMOVES area, never
//      adds it (the L-581 inward-bias doctrine, applied to booleans). The loss is reported in
//      `slitAreaLostM2` and bounded by slit width × corridor length; the oracle table asserts the
//      sign explicitly, so flipping the bias direction goes red naming the gained area.
//
// SUBTRAHEND HOLES: a hole IN B means B bites LESS. This module takes B as a simple ring; a
// caller holding a holed subtrahend may safely pass its outer ring — that removes MORE than the
// true B, i.e. UNDER-covers, the permitted direction. (The inverse convenience is deliberately
// not shipped unconsumed — C58's authored-but-unwired lesson.)
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG, no clock. Deterministic (C58 §1.1).
// Jurisdiction-agnostic (C58 §1.5): plain rings in scene-XZ metres, zero knowledge of any city.

import type { Pt } from '@pryzm/schemas';
import {
    COINCIDENT_M,
    arePointsCoincident2D,
    isNumericallyZero,
    intersectSegments2D,
    pointInRingEvenOdd,
    dedupeRing,
    findSelfIntersection,
    polygonSignedArea2D,
    unionPolygons2D,
    type Pt2,
} from '@pryzm/geometry-kernel';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Result shapes
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** One connected piece of `A ∖ B`: an outer ring plus the holes cut out of it. */
export interface PolygonDifferencePart {
    readonly outer: Pt[];
    /** Holes (subtrahend regions strictly inside this part). Open CCW rings, like `outer`. */
    readonly holes: Pt[][];
}

/** Why a difference refused. Mirrors §C73-POLY-BOOLEAN's vocabulary — same states, same meanings. */
export type PolygonDifferenceRefusal =
    | 'degenerate-input'
    | 'self-intersecting-input'
    /**
     * The kept sub-edges could not be walked into closed loops (or a hole loop matched no outer).
     * A topology this body cannot resolve surfaces as a REFUSAL, never as a plausible half-ring —
     * this includes the kernel's stated resolution limit (crossings closer than COINCIDENT_M).
     */
    | 'unresolved-topology';

export type PolygonDifferenceResult =
    | {
          readonly ok: true;
          /**
           * The connected pieces of `A ∖ B`. Empty when the difference is genuinely empty
           * (A ⊆ B). Outer rings are CCW; hole rings are returned CCW as well (their negative
           * orientation in the raw loop walk is a wire detail, not something callers should
           * have to know).
           */
          readonly parts: PolygonDifferencePart[];
      }
    | {
          readonly ok: false;
          readonly reason: PolygonDifferenceRefusal;
          /** Human detail. Never a justification for guessing an answer. */
          readonly detail?: string;
      };

/** Σ (|outer| − Σ|holes|) over the parts — the area the difference actually grants. */
export function differencePartsAreaM2(parts: ReadonlyArray<PolygonDifferencePart>): number {
    let a = 0;
    for (const p of parts) {
        a += Math.abs(signedAreaPt(p.outer));
        for (const h of p.holes) a -= Math.abs(signedAreaPt(h));
    }
    return a;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Internal: Pt ⇄ Pt2 plumbing + the canonical-predicate wrappers
// ──────────────────────────────────────────────────────────────────────────────────────────────

const toPt2 = (ring: ReadonlyArray<Pt>): Pt2[] => ring.map((p) => [p.x, p.z] as Pt2);
const toPt = (ring: ReadonlyArray<Pt2>): Pt[] => ring.map((p) => ({ x: p[0], z: p[1] }));

function signedAreaPt(ring: ReadonlyArray<Pt>): number {
    return polygonSignedArea2D(toPt2(ring));
}

interface SubEdge {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}

/**
 * Is `p` on the INTERIOR of segment a→b, at what parameter? Written in the canonical ROLES
 * (`isNumericallyZero` guards the divide, `arePointsCoincident2D` is the distance verdict) —
 * the same composition note as the kernel boolean's `pointOnSegmentParam` (C73 §3.1).
 */
function pointOnSegmentParam(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
): number | null {
    const rx = bx - ax;
    const ry = by - ay;
    const len2 = rx * rx + ry * ry;
    if (isNumericallyZero(len2)) return null;
    const t = ((px - ax) * rx + (py - ay) * ry) / len2;
    if (t <= 0 || t >= 1) return null;
    return arePointsCoincident2D(px, py, ax + t * rx, ay + t * ry) ? t : null;
}

/** Normalise an input ring: dedupe, refuse degenerate/self-intersecting, canonicalise CCW. */
function prepareRing(ring: ReadonlyArray<Pt2>): Pt2[] | PolygonDifferenceResult {
    for (const p of ring) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
            return { ok: false, reason: 'degenerate-input', detail: 'ring has a non-finite ordinate' };
        }
    }
    const clean = dedupeRing(ring, COINCIDENT_M);
    if (clean.length < 3) {
        return { ok: false, reason: 'degenerate-input', detail: `ring has ${clean.length} distinct vertices` };
    }
    // Simplicity BEFORE area — a symmetric bowtie has signed area exactly 0 (kernel ordering note).
    if (findSelfIntersection(clean) !== null) {
        return { ok: false, reason: 'self-intersecting-input', detail: 'ring crosses itself' };
    }
    const area = polygonSignedArea2D(clean);
    if (isNumericallyZero(area)) {
        return { ok: false, reason: 'degenerate-input', detail: 'ring is all-collinear (zero area)' };
    }
    return area > 0 ? clean : clean.slice().reverse();
}

/** Split every edge of `ring` at its crossings with `other` and at `other`'s vertices lying on it. */
function splitRing(ring: ReadonlyArray<Pt2>, other: ReadonlyArray<Pt2>): SubEdge[] {
    const out: SubEdge[] = [];
    const n = ring.length;
    const m = other.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const cuts: number[] = [];
        for (let j = 0; j < m; j++) {
            const c = other[j]!;
            const d = other[(j + 1) % m]!;
            const hit = intersectSegments2D(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
            if (hit !== null) cuts.push(hit.t);
            // Collinear/parallel overlap is refused by `intersectSegments2D` by design; the
            // overlap's endpoints are recovered from `other`'s VERTICES — the branch that makes a
            // shared alineación edge split symmetrically on both rings (§C73-POLY-BOOLEAN).
            const onEdge = pointOnSegmentParam(c[0], c[1], a[0], a[1], b[0], b[1]);
            if (onEdge !== null) cuts.push(onEdge);
        }
        // §C73-DETERMINISTIC-ORDER — spec-total typed-array sort (see the kernel boolean's note).
        const orderedCuts = Float64Array.from(cuts).sort();
        const pts: Pt2[] = [[a[0], a[1]]];
        for (const t of orderedCuts) {
            const px = a[0] + t * (b[0] - a[0]);
            const py = a[1] + t * (b[1] - a[1]);
            const last = pts[pts.length - 1]!;
            if (arePointsCoincident2D(px, py, last[0], last[1])) continue;
            if (arePointsCoincident2D(px, py, b[0], b[1])) continue;
            pts.push([px, py]);
        }
        pts.push([b[0], b[1]]);
        for (let k = 0; k + 1 < pts.length; k++) {
            const p = pts[k]!;
            const q = pts[k + 1]!;
            if (arePointsCoincident2D(p[0], p[1], q[0], q[1])) continue;
            out.push({ x0: p[0], y0: p[1], x1: q[0], y1: q[1] });
        }
    }
    return out;
}

/** `1` = same direction, `-1` = opposite, `0` = no shared sub-edge (endpoint-pair identity). */
function sharedOrientation(e: SubEdge, others: ReadonlyArray<SubEdge>): -1 | 0 | 1 {
    for (const o of others) {
        if (
            arePointsCoincident2D(e.x0, e.y0, o.x0, o.y0) &&
            arePointsCoincident2D(e.x1, e.y1, o.x1, o.y1)
        ) return 1;
        if (
            arePointsCoincident2D(e.x0, e.y0, o.x1, o.y1) &&
            arePointsCoincident2D(e.x1, e.y1, o.x0, o.y0)
        ) return -1;
    }
    return 0;
}

function midpointInside(e: SubEdge, ring: ReadonlyArray<Pt2>): boolean {
    return pointInRingEvenOdd(
        (e.x0 + e.x1) / 2,
        (e.y0 + e.y1) / 2,
        ring.length,
        (i) => ring[i]![0],
        (i) => ring[i]![1],
    );
}

/**
 * Walk the kept directed sub-edges into closed loops — the kernel boolean's chaining, verbatim in
 * structure: vertex identity by `arePointsCoincident2D` (never a quantised grid), representative
 * emission at merged vertices, sharpest-right-turn at pinches, refusal (null) on an open chain.
 */
function chainLoops(edges: ReadonlyArray<SubEdge>): Pt2[][] | null {
    const verts: Pt2[] = [];
    const vertexId = (x: number, y: number): number => {
        for (let i = 0; i < verts.length; i++) {
            const v = verts[i]!;
            if (arePointsCoincident2D(x, y, v[0], v[1])) return i;
        }
        verts.push([x, y]);
        return verts.length - 1;
    };
    const from: number[] = [];
    const to: number[] = [];
    for (const e of edges) {
        from.push(vertexId(e.x0, e.y0));
        to.push(vertexId(e.x1, e.y1));
    }
    const outgoing: number[][] = verts.map(() => []);
    for (let i = 0; i < edges.length; i++) outgoing[from[i]!]!.push(i);

    const used = new Array<boolean>(edges.length).fill(false);
    const loops: Pt2[][] = [];

    for (let seed = 0; seed < edges.length; seed++) {
        if (used[seed]) continue;
        const startVertex = from[seed]!;
        const loop: Pt2[] = [];
        let current = seed;
        let guard = edges.length + 1;
        for (;;) {
            if (guard-- < 0) return null;
            used[current] = true;
            const e = edges[current]!;
            const rep = verts[from[current]!]!;
            loop.push([rep[0], rep[1]]);
            const at = to[current]!;
            if (at === startVertex) break;
            const candidates = outgoing[at]!.filter((i) => !used[i]);
            if (candidates.length === 0) return null; // open chain ⇒ unresolved topology
            let next = candidates[0]!;
            if (candidates.length > 1) {
                const dx = e.x1 - e.x0;
                const dy = e.y1 - e.y0;
                let best = Number.POSITIVE_INFINITY;
                for (const c of candidates) {
                    const f = edges[c]!;
                    const cx = f.x1 - f.x0;
                    const cy = f.y1 - f.y0;
                    const angle = Math.atan2(dx * cy - dy * cx, dx * cx + dy * cy);
                    if (angle < best) {
                        best = angle;
                        next = c;
                    }
                }
            }
            current = next;
        }
        const clean = dedupeRing(loop, COINCIDENT_M);
        if (clean.length >= 3 && !isNumericallyZero(polygonSignedArea2D(clean))) loops.push(clean);
    }
    return loops;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1 — THE DIFFERENCE `A ∖ B` (exact regime; holes first-class in the result)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `a ∖ b` for two simple, hole-free rings (open form; a closed form is accepted, the duplicate is
 * dropped), any winding, scene-XZ metres. See the module header for the keep-rule, the shared-edge
 * cases, and the direction-of-error statement.
 *
 * The result may be EMPTY (`parts: []` — a ⊆ b), MULTI-PART (b splits a into pieces), and any
 * part may carry HOLES (b strictly inside a). All are answers, not errors; failure is `ok: false`.
 */
export function differenceRings2D(
    a: ReadonlyArray<Pt>,
    b: ReadonlyArray<Pt>,
): PolygonDifferenceResult {
    const ringA = prepareRing(toPt2(a));
    if (!Array.isArray(ringA)) return ringA;
    const ringB = prepareRing(toPt2(b));
    if (!Array.isArray(ringB)) return ringB;

    const subA = splitRing(ringA, ringB);
    const subB = splitRing(ringB, ringA);

    const kept: SubEdge[] = [];
    for (const e of subA) {
        const shared = sharedOrientation(e, subB);
        if (shared !== 0) {
            // SAME direction ⇒ interiors on the same side ⇒ B occupies the strip up to this edge
            // from inside A ⇒ the edge bounds neither A∖B nor its holes: drop. OPPOSITE ⇒ B abuts
            // A externally here ⇒ the edge still bounds A∖B: keep, from A (the single copy).
            if (shared === -1) kept.push(e);
            continue;
        }
        if (!midpointInside(e, ringB)) kept.push(e);
    }
    for (const e of subB) {
        if (sharedOrientation(e, subA) !== 0) continue; // A contributed the copy (or none)
        // A kept B-edge is the carve boundary. REVERSED, so the result's interior stays on the
        // left — a subtrahend strictly inside A therefore chains into a NEGATIVE (hole) loop.
        if (midpointInside(e, ringA)) kept.push({ x0: e.x1, y0: e.y1, x1: e.x0, y1: e.y0 });
    }

    // Genuinely empty — a ⊆ b (every A-edge inside B, every B-edge outside A). Unlike union,
    // difference has a legitimate empty answer.
    if (kept.length === 0) return { ok: true, parts: [] };

    const loops = chainLoops(kept);
    if (loops === null) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail: 'difference: kept sub-edges do not form closed loops',
        };
    }

    // Orientation carries meaning: positive loops are outers, negative loops are holes. Assign
    // each hole to the positive loop containing it (by a hole vertex — loops from the walk are
    // disjoint except at pinch points, so any vertex decides).
    const outers: Pt2[][] = [];
    const holeLoops: Pt2[][] = [];
    for (const loop of loops) {
        if (polygonSignedArea2D(loop) > 0) outers.push(loop);
        else holeLoops.push(loop);
    }
    if (outers.length === 0) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail: 'difference: only negative loops were produced',
        };
    }
    const parts: PolygonDifferencePart[] = outers.map((o) => ({ outer: toPt(o), holes: [] }));
    for (const h of holeLoops) {
        const probe = h[0]!;
        let assigned = false;
        for (let i = 0; i < outers.length; i++) {
            const o = outers[i]!;
            if (pointInRingEvenOdd(probe[0], probe[1], o.length, (k) => o[k]![0], (k) => o[k]![1])) {
                // Return holes CCW — orientation was the wire detail, containment is the fact.
                (parts[i]!.holes as Pt[][]).push(toPt(h.slice().reverse()));
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            return {
                ok: false,
                reason: 'unresolved-topology',
                detail: 'difference: a hole loop is contained in no outer loop',
            };
        }
    }
    return { ok: true, parts };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2 — THE CARVE (representation-forced regime; strictly inward-biased)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * §K1-CARVE-SLIT — the slit width used to bridge a hole to the outer boundary, METRES.
 *
 * The slit must be REPRESENTABLE under the declared 1 mm point identity: its two sides are
 * distinct places only if they are further apart than `COINCIDENT_M`, and the arrangement's
 * midpoint classification wants margin beyond that. 4 × COINCIDENT_M (4 mm) gives both, and its
 * whole area is SUBTRACTED from the result — the inward-bias direction (module header, regime 3).
 * Shrinks if `COINCIDENT_M` shrinks (the C73 §2.5 ratchet direction); never widened ad hoc.
 */
export const CARVE_SLIT_WIDTH_M = 4 * COINCIDENT_M;

export interface CarveResult {
    readonly ok: true;
    /**
     * The carved region as SIMPLE rings (one per connected piece). A hole that reached the
     * region's boundary is carved exactly; a hole strictly inside is bridged to the boundary by a
     * `CARVE_SLIT_WIDTH_M`-wide slit whose corridor is SUBTRACTED — see `slitAreaLostM2`.
     */
    readonly rings: Pt[][];
    /**
     * Area LOST to bridge slits, m² — `exact |region ∖ holes|` minus the area of `rings`. Always
     * ≥ 0 (the inward-bias invariant, asserted by the oracle table): the carve may under-grant by
     * this much; it never over-grants.
     */
    readonly slitAreaLostM2: number;
    /** How many of the supplied holes actually bit the region (changed its area). */
    readonly holesCarved: number;
}

export type CarveRefusal = {
    readonly ok: false;
    readonly reason: PolygonDifferenceRefusal;
    readonly detail?: string;
};

/** Axis-aligned bounds of a ring (assumes ≥1 vertex, finite — inputs pass prepareRing upstream). */
function ringBounds2(ring: ReadonlyArray<Pt>): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

/**
 * A point strictly INSIDE `ring`, found by an even-odd horizontal-chord scan at (or near) the ring's
 * vertical midline. Deterministic; returns null only when every probe line degenerates (a sliver
 * thinner than the identity scale) — the caller refuses then.
 */
function interiorPoint(ring: ReadonlyArray<Pt>): Pt | null {
    const b = ringBounds2(ring);
    const span = b.maxZ - b.minZ;
    if (span <= 2 * COINCIDENT_M) return null;
    // Probe a deterministic ladder of chord heights; vertex-grazing chords fail cleanly and the
    // next rung is tried.
    const fractions = [0.5, 0.37, 0.61, 0.29, 0.71, 0.43, 0.57];
    for (const f of fractions) {
        const z = b.minZ + span * f;
        const xs: number[] = [];
        const n = ring.length;
        let grazed = false;
        for (let i = 0; i < n; i++) {
            const p = ring[i]!;
            const q = ring[(i + 1) % n]!;
            if (Math.abs(p.z - z) <= COINCIDENT_M || Math.abs(q.z - z) <= COINCIDENT_M) {
                grazed = true; // too close to a vertex for a clean crossing parity — next rung
                break;
            }
            if ((p.z < z) !== (q.z < z)) {
                xs.push(p.x + ((z - p.z) / (q.z - p.z)) * (q.x - p.x));
            }
        }
        if (grazed || xs.length < 2 || xs.length % 2 !== 0) continue;
        xs.sort((u, v) => u - v);
        // The first chord [xs[0], xs[1]] is interior by even-odd parity.
        if (xs[1]! - xs[0]! <= 2 * COINCIDENT_M) continue; // sliver chord — next rung
        return { x: (xs[0]! + xs[1]!) / 2, z };
    }
    return null;
}

/**
 * Subtract ONE simple subtrahend ring from ONE simple region ring, returning SIMPLE rings.
 *
 * Exact whenever the exact difference is already simple (hole misses, clips the edge, or splits
 * the region). When the subtrahend is strictly interior (an annulus — a shape a single ring
 * cannot carry), the hole is bridged to the boundary: the subtracted set is enlarged from `hole`
 * to `hole ∪ corridor`, where the corridor is a `CARVE_SLIT_WIDTH_M`-wide strip cast in +x from a
 * point inside the hole to beyond the region — so the bridged answer differs from the exact one
 * only by REMOVED area (inward bias, regime 3 of the module header).
 */
function subtractOneRing(
    region: ReadonlyArray<Pt>,
    hole: ReadonlyArray<Pt>,
): { ok: true; rings: Pt[][]; slitAreaLostM2: number; bit: boolean } | CarveRefusal {
    const d = differenceRings2D(region, hole);
    if (!d.ok) return d;

    const regionArea = Math.abs(signedAreaPt(region));
    const exactArea = differencePartsAreaM2(d.parts);
    const bit = Math.abs(exactArea - regionArea) > 1e-9;

    if (d.parts.every((p) => p.holes.length === 0)) {
        // The exact difference is already simple — no bridge, no bias, nothing lost.
        return { ok: true, rings: d.parts.map((p) => p.outer), slitAreaLostM2: 0, bit };
    }

    // A connected subtrahend strictly inside a connected region yields exactly one part with one
    // hole; anything else here is a topology this construction does not claim to resolve.
    if (d.parts.length !== 1 || d.parts[0]!.holes.length !== 1) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail:
                `carve: expected one part with one hole, got ${d.parts.length} part(s) with ` +
                `${d.parts.map((p) => p.holes.length).join('/')} hole(s)`,
        };
    }
    const holeLoop = d.parts[0]!.holes[0]!;
    const anchor = interiorPoint(holeLoop);
    if (anchor === null) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail: 'carve: no interior chord found for the hole (sliver below the identity scale)',
        };
    }
    const rb = ringBounds2(region);
    const w2 = CARVE_SLIT_WIDTH_M / 2;
    // The corridor: from inside the hole, out beyond the region's east bound. 1 m of margin past
    // the bbox so the corridor's far edge cannot interact with the region boundary.
    const corridor: Pt[] = [
        { x: anchor.x, z: anchor.z - w2 },
        { x: rb.maxX + 1, z: anchor.z - w2 },
        { x: rb.maxX + 1, z: anchor.z + w2 },
        { x: anchor.x, z: anchor.z + w2 },
    ];
    // hole ∪ corridor — one connected subtrahend that reaches the outside, so the difference is
    // simply connected. The kernel's proven union computes it; its loops must be a single outer.
    const u = unionPolygons2D(toPt2(hole), toPt2(corridor));
    if (!u.ok) {
        return { ok: false, reason: 'unresolved-topology', detail: `carve: hole ∪ corridor refused (${u.reason})` };
    }
    const uOuters = u.loops.filter((l) => polygonSignedArea2D(l) > 0);
    if (uOuters.length !== 1 || u.loops.length !== uOuters.length) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail: 'carve: hole ∪ corridor is not a single simple ring',
        };
    }
    const d2 = differenceRings2D(region, toPt(uOuters[0]!));
    if (!d2.ok) return d2;
    if (!d2.parts.every((p) => p.holes.length === 0)) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail: 'carve: the bridged difference still carries a hole',
        };
    }
    const bridgedArea = differencePartsAreaM2(d2.parts);
    // The inward-bias invariant, enforced at the source rather than hoped for downstream: a
    // bridged answer larger than the exact one would be a GAIN, the one forbidden direction.
    if (bridgedArea > exactArea + 1e-6) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail:
                `carve: bridged area ${bridgedArea.toFixed(6)} m² exceeds the exact difference ` +
                `${exactArea.toFixed(6)} m² — refusing rather than over-grant`,
        };
    }
    return {
        ok: true,
        rings: d2.parts.map((p) => p.outer),
        slitAreaLostM2: Math.max(0, exactArea - bridgedArea),
        bit: true,
    };
}

/**
 * Carve a list of holes out of a simple region ring, yielding SIMPLE rings — the consumer-facing
 * composition (`explicitArea.ts` §GE-05-HOLE-EXACT is the first consumer). Holes are subtracted
 * sequentially; every intermediate state is a set of simple rings, so N holes need no
 * polygon-with-holes bookkeeping. Direction of error: exact, except that each strictly-interior
 * hole costs one bridge slit, whose area is REMOVED and reported (`slitAreaLostM2` ≥ 0 — the
 * carve under-grants by at most that; it never over-grants).
 */
export function carveHolesToSimpleRings(
    region: ReadonlyArray<Pt>,
    holes: ReadonlyArray<ReadonlyArray<Pt>>,
): CarveResult | CarveRefusal {
    let current: Pt[][] = [region.map((p) => ({ x: p.x, z: p.z }))];
    let slitLost = 0;
    let carved = 0;
    for (const hole of holes) {
        const next: Pt[][] = [];
        let bitAny = false;
        for (const ring of current) {
            const r = subtractOneRing(ring, hole);
            if (!r.ok) return r;
            next.push(...r.rings);
            slitLost += r.slitAreaLostM2;
            bitAny = bitAny || r.bit;
        }
        if (bitAny) carved += 1;
        current = next;
    }
    return { ok: true, rings: current, slitAreaLostM2: slitLost, holesCarved: carved };
}
