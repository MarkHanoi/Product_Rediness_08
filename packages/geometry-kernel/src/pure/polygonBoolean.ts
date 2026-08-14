/**
 * §C73-POLY-BOOLEAN — THE 2-D polygon boolean (GE-05).
 *
 * Before this file existed the register's reading was exact and damning:
 * *"There is no 2-D boolean union anywhere in the tree, and three files
 * independently defer one."* The tree carried **≥5 independent
 * Sutherland–Hodgman half-plane clippers** — each of which cuts a subject
 * polygon against ONE half-plane or against a CONVEX clip — and **no general
 * clipper and no union primitive at all**. "Merge two footprints" was not
 * expressible; `parcel ∩ published-footprint` was expressible only when one of
 * the two rings happened to be convex, and REFUSED otherwise.
 *
 * ── THE THREE DEFERRING SITES (the census this file was built against) ──────
 *
 *   1. `site-parcel-data/src/geometry/polygonClip.ts:23` —
 *      *"A future general clipper can lift that restriction without changing
 *      this contract."* Needs: **intersection**, subject concave, clip concave.
 *   2. `site-parcel-data/src/geometry/explicitArea.ts:310/375` — the typed
 *      refusal `'non-convex-both'`: *"a future general (concave-vs-concave)
 *      clipper lifts it."* Needs: **intersection**, plus the ability to say
 *      how many DISJOINT regions the answer has (it already refuses with
 *      `'multi-region-on-parcel'` when the answer is not one ring).
 *   3. `site-parcel-data/src/ZoningRulesEngine.ts:838` — the user-visible
 *      refusal string *"neither the parcel nor the published footprint is
 *      convex, so their intersection cannot be computed exactly on this plot…
 *      A general concave clipper is the follow-up."* Needs: **intersection**.
 *
 *   A fourth file, `site-parcel-data/src/geometry/insetPolygon.ts:17-21`,
 *   MENTIONS the absence ("the repo has none… no polygon-clipping, martinez,
 *   turf, polybooljs, @flatten-js") but explicitly states it does **not** need
 *   one: a per-edge erosion's only boolean need is resolving the offset ring's
 *   own self-intersections, which §INSET-LOOP-DECOMPOSE already does. It is
 *   NOT a deferring site and must not be "migrated" onto this module.
 *
 *   So all three real deferrals want the SAME operation — **intersection of two
 *   simple, possibly-concave rings** — and every one of them is on a
 *   legally-binding buildable-area path where a wrong answer over-states what a
 *   user may build. **Union** is delivered alongside it because it is the same
 *   body with one predicate flipped and because it is the operation the
 *   register names in its headline ("merge two footprints"); it is oracle-
 *   pinned to the same standard, not shipped on the intersection's coat-tails.
 *
 * ── WHAT THIS IS NOT (read before you reach for it) ─────────────────────────
 *
 *   • **DIFFERENCE (A \ B) IS NOT DELIVERED.** It falls out of this body with a
 *     third keep-rule and a reversal of B's kept sub-edges, but it is not here,
 *     because it is not oracle-pinned and an unproven boolean silently corrupts
 *     every consumer downstream of it. Do not add it without the same oracle
 *     table the two delivered ops carry.
 *   • **INPUTS MUST BE SIMPLE RINGS WITHOUT HOLES.** Self-intersection is a
 *     refusal (`'self-intersecting-input'`), checked with the kernel's own
 *     §W2A-FOLD-DETECT. Polygons-with-holes are not an input shape here.
 *   • **AN OVERLAP THINNER THAN `COINCIDENT_M` READS AS NO OVERLAP.** That is
 *     not a bug to be tuned away: `COINCIDENT_M` (1 mm) is the declared
 *     model-space point-identity tolerance, and a 0.1 mm-wide sliver is two
 *     boundaries that the model says are THE SAME PLACE. Reporting it as a
 *     region would be reporting a difference the model cannot represent. This
 *     is oracle-pinned (case J) so it is a decided behaviour, not an accident.
 *   • **NO GENERAL FLOATING-POINT ROBUSTNESS CLAIM.** There is no exact
 *     predicate arithmetic here (no adaptive/expansion arithmetic à la
 *     Shewchuk). The design AVOIDS the classic fragility instead of surviving
 *     it — see the next section — but two rings whose crossings are separated
 *     by less than `COINCIDENT_M` are outside what this can resolve.
 *   • **THE RESOLUTION LIMIT IS AN AREA BOUND, AND HERE IT IS.** When a ring
 *     vertex of A lands within `COINCIDENT_M` of B's boundary, the crossing
 *     point and that vertex are THE SAME PLACE by declaration, and the two
 *     operations may pick different members of that pair as the loop's
 *     representative. The resulting area disagreement is bounded by
 *
 *           |A| + |B| − (|A ∪ B| + |A ∩ B|)  ≤  COINCIDENT_M × (P_A + P_B) / 2
 *
 *     (each merged vertex perturbs the boundary laterally by at most
 *     `COINCIDENT_M` over its two adjacent edges — a triangle of base ≤ edge
 *     length and height ≤ `COINCIDENT_M`). For a 30 m parcel perimeter that is
 *     **≤ 0.015 m²**, i.e. 150 mm², which is orders below any reportable
 *     buildable-area precision. It is MEASURED, not assumed: the differential
 *     arm (`__tests__/polygonBoolean.differential.test.ts`) evaluates the
 *     inclusion–exclusion identity on 240 generated concave pairs against
 *     exactly this bound, and reports how many exceed plain float noise. On
 *     inputs with no near-coincidence — every hand-computed oracle case — the
 *     identity holds to 1e-9. **Do not "fix" this by widening a tolerance:**
 *     the bound shrinks only if `COINCIDENT_M` shrinks, which is the ratchet
 *     direction C73 §2.5 permits.
 *
 * ── WHY THIS ALGORITHM, AND NOT GREINER–HORMANN / WEILER–ATHERTON ───────────
 *
 * `polygonClip.ts`'s header already recorded WHY the estate never adopted one:
 * a published buildable footprint follows the *alineación* and therefore SHARES
 * the parcel's street-frontage edge **by construction**, so the two rings are
 * collinear and coincident along a whole edge on essentially every real plot.
 * Greiner–Hormann's entry/exit classification is exactly what breaks on shared
 * edges. Adopting it would have replaced an honest refusal with a plausible
 * wrong region on the commonest input in the data.
 *
 * So this is the **arrangement + midpoint-classification** boolean:
 *
 *   1. SPLIT. Every edge of A is split at (a) its crossings with B's edges and
 *      (b) every B vertex lying on its interior — and symmetrically for B.
 *      After this step the two boundaries meet only at shared sub-edge
 *      ENDPOINTS: no sub-edge interior ever touches the other boundary.
 *   2. CLASSIFY. Each sub-edge is classified by its **midpoint**, which by
 *      step 1 is either strictly inside, strictly outside, or (when the
 *      sub-edge lies wholly on the other boundary) coincident with it. The
 *      inside/outside verdict therefore never has to be taken AT a crossing —
 *      which is the entire source of Greiner–Hormann's degeneracy failures.
 *   3. SHARED EDGES BY IDENTITY, NOT BY DISTANCE. A sub-edge lies on the other
 *      boundary iff a sub-edge of the other ring has the SAME endpoint PAIR
 *      (`arePointsCoincident2D`, the canonical 1 mm identity test). Step 1's
 *      symmetry is what guarantees the match exists — both boundaries were cut
 *      at the same points. The match's ORIENTATION (same vs opposite) is then
 *      free, and it is the whole shared-edge rule:
 *        · SAME direction  ⇒ the two interiors are on the SAME side ⇒ the edge
 *          is on the boundary of BOTH intersection and union; keep it ONCE
 *          (from A, never from B — that is the deduplication).
 *        · OPPOSITE        ⇒ the interiors are on OPPOSITE sides ⇒ the edge is
 *          interior to the union and has zero-area contact in the
 *          intersection; keep it in NEITHER.
 *      No distance band, no entry/exit flag, no perturbation.
 *   4. CHAIN. The kept directed sub-edges are walked into closed loops. At the
 *      rare vertex with more than one unused outgoing edge (a pinch, where two
 *      output regions meet at a point) the walk takes the **sharpest right
 *      turn**, which hugs the current lobe and separates the two — the standard
 *      interior-on-the-left face-traversal rule. Failure to close a loop is a
 *      REFUSAL (`'unresolved-topology'`), never a silent repair.
 *
 * ── PREDICATE PROVENANCE (C73 §3.1 — this file mints NO new family body) ────
 *
 *   • crossings          → `pure/segmentIntersection.intersectSegments2D`
 *                          (§C73-SEGSEG-CANONICAL, closed [0,1] parametric view)
 *   • inside/outside     → `pure/pointInPolygon.pointInRingEvenOdd`
 *                          (§C73-PIP-CANONICAL)
 *   • area / winding     → `pure/polygonOffset.signedArea`
 *                          (§C73-AREA-CANONICAL)
 *   • simplicity         → `pure/polygonOffset.findSelfIntersection`
 *                          (§W2A-FOLD-DETECT)
 *   • point identity     → `tolerance.arePointsCoincident2D` (`COINCIDENT_M`)
 *   • numeric zero       → `tolerance.isNumericallyZero` (`EPSILON_ZERO`)
 *
 *   The ONE arithmetic body this file does write is `pointOnSegmentParam` — a
 *   clamped-projection point-to-segment test. That IS C73 §3.1's
 *   `point-to-segment-distance` family, which the gate currently carries as
 *   **NOT-YET-COUNTED** (no canonical body exists; the family is entangled with
 *   the tolerance migration). It is written here in the canonical ROLES
 *   (`isNumericallyZero` for the degenerate divide, `arePointsCoincident2D` for
 *   the distance verdict) so that when that family's canonical body IS minted,
 *   this composes onto it instead of being a rival to retire. Recorded, not
 *   smuggled.
 *
 * ── EPSILON POLICY (C73 §2.2/§2.5 — no literal is minted here) ──────────────
 *   Two declared roles, both consumed, neither widened:
 *     · `COINCIDENT_M`  — "is this the same point / the same sub-edge" (metres).
 *     · `EPSILON_ZERO`  — "is this quantity numerically zero" (dimensionless):
 *                         the degenerate edge-length divide and the zero-area
 *                         ring/loop test.
 *   No third role was needed, so none was declared.
 *
 * PURE: no THREE, no DOM, no I/O, no RNG, no clock. Deterministic: the output
 * loops and their vertex order are a function of the inputs alone.
 *
 * @file packages/geometry-kernel/src/pure/polygonBoolean.ts
 */

import { COINCIDENT_M, arePointsCoincident2D, isNumericallyZero } from '../tolerance.js';
import { pointInRingEvenOdd } from './pointInPolygon.js';
import { intersectSegments2D } from './segmentIntersection.js';
import { findSelfIntersection, signedArea, dedupeRing, type Pt2 } from './polygonOffset.js';

/** The two operations this module delivers. Difference is deliberately absent — see the header. */
export type PolygonBooleanOp = 'intersection' | 'union';

/** Why a boolean refused. A refusal is never an empty result — C73 §4.3. */
export type PolygonBooleanRefusal =
    /** A ring has fewer than 3 distinct vertices, is all-collinear, or carries a non-finite ordinate. */
    | 'degenerate-input'
    /** A ring crosses itself. Simplicity is a precondition, not something this repairs. */
    | 'self-intersecting-input'
    /**
     * The kept sub-edges could not be walked into closed loops. This is a
     * bug-catcher, and it exists so that a topology this body cannot resolve
     * surfaces as a REFUSAL rather than as a plausible half-ring. If you see
     * it, the input found a gap in the algorithm — do not "repair" the output.
     */
    | 'unresolved-topology';

export type PolygonBooleanResult =
    | {
          readonly ok: true;
          /**
           * The result's boundary loops, each an open ring (no repeated closing
           * vertex) in the same coordinate plane as the inputs.
           *
           * ORIENTATION CARRIES MEANING: a loop with POSITIVE signed area is an
           * outer boundary; a loop with NEGATIVE signed area is a HOLE in the
           * loop that contains it. An INTERSECTION of two hole-free simple
           * rings can never produce a hole (it is a subset of both), so its
           * loops are all positive; a UNION can (two C-shapes closing a ring),
           * and the negative loop is how that is reported rather than dropped.
           *
           * An empty array means the operation's result is genuinely empty
           * (disjoint inputs under `intersection`). It never means "failed" —
           * failure is `ok: false`.
           */
          readonly loops: readonly Pt2[][];
      }
    | {
          readonly ok: false;
          readonly reason: PolygonBooleanRefusal;
          /** Human detail. Never a justification for guessing an answer. */
          readonly detail?: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// Internal shapes
// ─────────────────────────────────────────────────────────────────────────────

interface SubEdge {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}

/**
 * Is `p` on the INTERIOR of segment a→b, and if so at what parameter?
 *
 * Returns `null` for an endpoint hit (t ≤ 0 or t ≥ 1 — already a vertex, so it
 * is not a split), for a zero-length segment, and for a point further from the
 * segment than `COINCIDENT_M`.
 *
 * ⚠ C73 §3.1 `point-to-segment-distance` — see the header. Written in the
 * canonical ROLES so it composes onto that family's body when one is minted.
 */
function pointOnSegmentParam(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
): number | null {
    const rx = bx - ax;
    const ry = by - ay;
    const len2 = rx * rx + ry * ry;
    // §C73-EPSILON-POLICY — the declared numeric-zero role guards the divide.
    if (isNumericallyZero(len2)) return null;
    const t = ((px - ax) * rx + (py - ay) * ry) / len2;
    if (t <= 0 || t >= 1) return null;
    return arePointsCoincident2D(px, py, ax + t * rx, ay + t * ry) ? t : null;
}

/**
 * Normalise an input ring: drop coincident duplicates, refuse the degenerate,
 * refuse the self-intersecting, and canonicalise winding to CCW so every
 * downstream rule ("interior is on the left") holds without a per-call winding
 * argument. Winding-independence of the OUTPUT is therefore a theorem, not a
 * hope: a CW input and its CW-reversed twin become the same array here.
 */
function prepareRing(ring: ReadonlyArray<Pt2>): Pt2[] | PolygonBooleanResult {
    for (const p of ring) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
            return { ok: false, reason: 'degenerate-input', detail: 'ring has a non-finite ordinate' };
        }
    }
    const clean = dedupeRing(ring, COINCIDENT_M);
    if (clean.length < 3) {
        return { ok: false, reason: 'degenerate-input', detail: `ring has ${clean.length} distinct vertices` };
    }
    // SIMPLICITY IS CHECKED BEFORE AREA, and the order is load-bearing: a
    // symmetric bowtie has signed area EXACTLY 0, so an area-first check would
    // report the far less useful `degenerate-input` for the commonest
    // non-simple input there is. An all-collinear ring survives this check (its
    // overlapping edges are collinear, and the half-open crossing view reads
    // collinearity as no crossing) and is caught by the area test below.
    if (findSelfIntersection(clean) !== null) {
        return { ok: false, reason: 'self-intersecting-input', detail: 'ring crosses itself' };
    }
    const area = signedArea(clean);
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
            // The collinear/parallel case: `intersectSegments2D` REFUSES it by
            // design (no unique point exists), so the overlap's endpoints are
            // recovered from `other`'s VERTICES below. That branch is what makes
            // a shared *alineación* edge split symmetrically on both rings —
            // the exact degeneracy Greiner–Hormann fails on.
            const onEdge = pointOnSegmentParam(c[0], c[1], a[0], a[1], b[0], b[1]);
            if (onEdge !== null) cuts.push(onEdge);
        }
        // Materialise, drop parameters that land on an existing endpoint, sort,
        // and dedupe by POINT identity (not by parameter distance — a parameter
        // band would be an undeclared, length-dependent epsilon).
        // §C73-DETERMINISTIC-ORDER (C73 §1.2) — the cut parameters are ordered by
        // the SPEC-DEFINED numeric sort of a typed array, not by a user
        // comparator. `%TypedArray%.prototype.sort` with no comparator is a
        // TOTAL order over float64: ascending, −0 before +0, NaN last — fixed by
        // ECMA-262, so the sequence is a function of the multiset of values and
        // of nothing else. `Array.prototype.sort((p, q) => p - q)` is weaker on
        // both counts: it returns 0 on a tie (so the result depends on the order
        // the pushes happened to occur in — the clause §1.2 is about), and it
        // returns NaN for a NaN input, which makes it an INCONSISTENT comparator
        // whose output is implementation-defined. Neither hazard can bite here
        // today — `cuts` holds primitives, so tied entries are indistinguishable
        // values rather than records, and NaN cannot enter (`prepareRing`
        // refuses non-finite ordinates, both producers guard their divide with
        // `isNumericallyZero`, and both range-check `t`) — but "deterministic
        // because of three facts proved elsewhere in the file" is exactly the
        // kind of invariant that rots silently when one of the three moves. The
        // typed-array sort is deterministic because the spec says so, which is
        // an argument that cannot rot. Not a rewrite of the algorithm: for
        // NaN-free input the resulting sequence is identical.
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

/**
 * Find the sub-edge of `others` sharing this sub-edge's endpoint PAIR.
 * `1` = same direction, `-1` = opposite, `0` = no shared sub-edge.
 */
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
 * Walk the kept directed sub-edges into closed loops.
 *
 * Vertices are identified with `arePointsCoincident2D` (the declared 1 mm
 * identity), NOT by hashing a quantised grid — a grid key splits two points
 * 0.1 mm apart whenever they straddle a cell boundary, which is precisely the
 * silent corruption this module exists to avoid. O(n²) identity matching is the
 * correct trade at parcel/footprint sizes.
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
            if (guard-- < 0) return null; // cannot happen (each edge is used once) — refuse, never spin
            used[current] = true;
            const e = edges[current]!;
            // EMIT THE VERTEX REPRESENTATIVE, NOT THE SUB-EDGE'S OWN ENDPOINT.
            // Two sub-edges that meet here agree only to within COINCIDENT_M —
            // A's ring vertex and B's computed crossing can be 0.3 mm apart and
            // still be THE SAME PLACE by the declared identity. Emitting each
            // edge's own coordinate would stitch that sub-millimetre disagreement
            // into the output ring as a hairline notch, which a downstream
            // simplicity or offset check can legitimately choke on. Emitting the
            // representative makes every loop self-consistent. It does NOT make
            // the answer exact: see the module header's resolution-limit note.
            const rep = verts[from[current]!]!;
            loop.push([rep[0], rep[1]]);
            const at = to[current]!;
            if (at === startVertex) break;
            const candidates = outgoing[at]!.filter((i) => !used[i]);
            if (candidates.length === 0) return null; // open chain ⇒ unresolved topology
            let next = candidates[0]!;
            if (candidates.length > 1) {
                // PINCH. Interior-on-the-left traversal takes the SHARPEST RIGHT
                // TURN, which hugs the lobe being traced instead of jumping to
                // the other one. Turn angle is measured from the incoming
                // heading; the most negative turn is the hardest right.
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
        // A loop of fewer than 3 distinct vertices, or one of numerically zero
        // area, encloses nothing. Dropping it is not a repair — it is declining
        // to report a region that has no interior.
        if (clean.length >= 3 && !isNumericallyZero(signedArea(clean))) loops.push(clean);
    }
    return loops;
}

/**
 * THE 2-D polygon boolean. `a` and `b` are simple, hole-free rings in open form
 * (no repeated closing vertex; a closed form is accepted — the duplicate is
 * dropped) in any winding, in any consistent planar coordinate pair.
 *
 * See the module header for the algorithm, the shared-edge rule, the delivered
 * operations, and what this deliberately does NOT claim.
 */
export function polygonBoolean2D(
    a: ReadonlyArray<Pt2>,
    b: ReadonlyArray<Pt2>,
    op: PolygonBooleanOp,
): PolygonBooleanResult {
    const ringA = prepareRing(a);
    if (!Array.isArray(ringA)) return ringA;
    const ringB = prepareRing(b);
    if (!Array.isArray(ringB)) return ringB;

    const subA = splitRing(ringA, ringB);
    const subB = splitRing(ringB, ringA);

    const want = op === 'intersection';
    const kept: SubEdge[] = [];
    for (const e of subA) {
        const shared = sharedOrientation(e, subB);
        // Shared same-direction edges bound BOTH results and are kept exactly
        // once, from A. Shared opposite-direction edges bound neither.
        if (shared !== 0) {
            if (shared === 1) kept.push(e);
            continue;
        }
        if (midpointInside(e, ringB) === want) kept.push(e);
    }
    for (const e of subB) {
        // B contributes no shared edge at all — A already contributed the single
        // copy. This is the deduplication, and it is why an intersection of two
        // IDENTICAL rings returns that ring once rather than a doubled boundary.
        if (sharedOrientation(e, subA) !== 0) continue;
        if (midpointInside(e, ringA) === want) kept.push(e);
    }

    if (kept.length === 0) {
        // Genuinely empty — disjoint rings under `intersection`. `union` always
        // keeps at least one boundary, so an empty keep set there would be a
        // topology failure, not an empty answer.
        if (op === 'union') {
            return { ok: false, reason: 'unresolved-topology', detail: 'union kept no boundary edges' };
        }
        return { ok: true, loops: [] };
    }

    const loops = chainLoops(kept);
    if (loops === null) {
        return {
            ok: false,
            reason: 'unresolved-topology',
            detail: `${op}: kept sub-edges do not form closed loops`,
        };
    }
    return { ok: true, loops };
}

/**
 * `a ∩ b` — the operation all three GE-05 deferring sites need. Convenience
 * wrapper; identical semantics to {@link polygonBoolean2D} with
 * `'intersection'`.
 *
 * The result may legitimately be MORE THAN ONE loop when two concave rings
 * overlap in disjoint regions. Callers that can only publish one ring (the
 * `explicitArea` solver's `'multi-region-on-parcel'` refusal is exactly this)
 * must check `loops.length` and refuse — picking the largest would under-state
 * the answer while the reported area described something else.
 */
export function intersectPolygons2D(
    a: ReadonlyArray<Pt2>,
    b: ReadonlyArray<Pt2>,
): PolygonBooleanResult {
    return polygonBoolean2D(a, b, 'intersection');
}

/**
 * `a ∪ b` — "merge two footprints", the operation the register's headline names.
 *
 * Two DISJOINT rings have no single-ring union; their union is the two rings,
 * and that is what comes back (two positive loops). A union with an enclosed
 * void comes back as the outer loop plus a NEGATIVE-area hole loop.
 */
export function unionPolygons2D(
    a: ReadonlyArray<Pt2>,
    b: ReadonlyArray<Pt2>,
): PolygonBooleanResult {
    return polygonBoolean2D(a, b, 'union');
}
