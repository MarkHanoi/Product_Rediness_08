/**
 * §C73-SEGSEG-CANONICAL — THE segment/segment intersection predicate
 * (C73 §3.1, family "segment-segment-intersection"; the family
 * `check-predicate-canonical.ts` declares with the SEGMENT_CROSS_SHAPE
 * signature and excludes from the point-in-polygon count).
 *
 * Before this file existed the census measured the family written at least
 * FOURTEEN times in production, in two rival spellings with FIVE different
 * degenerate-divide guards between them (`1e-8`, `1e-9`, `1e-10`, `1e-12`,
 * and an EPS-signed straddle) and at least four different boundary bands —
 * fourteen private definitions of "these two segments cross".
 *
 * ── THE ONE-FAMILY PROOF (the register's blocker for counting this family) ──
 *
 * The two spellings found in the tree:
 *
 *   CROSS-PRODUCT FORM (e.g. `polygonOffset.findSelfIntersection`,
 *   `insetPolygon.segmentsCross`, `ringValidation.segmentsIntersect`):
 *       d1 = (b−a) × (c−a)        d2 = (b−a) × (d−a)
 *       d3 = (d−c) × (a−c)        d4 = (d−c) × (b−c)
 *       verdict = (d1>0) ≠ (d2>0)  ∧  (d3>0) ≠ (d4>0)
 *
 *   PARAMETRIC FORM (e.g. `ringSimplicity.ringSegmentsProperlyCross`,
 *   `WallIntersectionResolver.segSegIntersectXZ`, tgl `segmentIntersect`,
 *   `HiddenLineRemoval.segCrossT`):
 *       D = (b−a) × (d−c)
 *       t = ((c−a) × (d−c)) / D       u = ((c−a) × (b−a)) / D
 *       verdict = t ∈ [0,1] ∧ u ∈ [0,1]   (bands vary per rival)
 *
 * These are ONE family because the four cross products ARE the parametric
 * numerators, up to exact sign flips. With r = b−a, s = d−c, D = r × s:
 *
 *       d1 = r × (c−a) = −u·D
 *       d2 = r × (d−a) = r × ((d−c)+(c−a)) = D − u·D = (1−u)·D
 *       d3 = s × (a−c) = (c−a) × s        =  t·D
 *       d4 = s × (b−c) = s × ((b−a)+(a−c)) = −D + t·D = (t−1)·D
 *
 * So for D ≠ 0 the cross-product verdict reads the SIGNS of {−u, 1−u, t, t−1}
 * scaled by D — i.e. exactly the question "are t and u inside (0,1)?" that the
 * parametric form asks after dividing. Both forms are decision procedures over
 * the same four scalars; they can only disagree ON the boundary set (a
 * parameter exactly 0 or 1, or D within a guard band) — which is a boundary-
 * SEMANTICS choice, not a different predicate. The proof is EXECUTED, not just
 * stated: `__tests__/segmentIntersection.oracle.test.ts` drives both rival
 * spellings and this body over a degenerate-rich grid and pins every
 * divergence to a named boundary case.
 *
 * ── The decided semantics (C73 §3.7 — each axis the rivals disagreed on,
 *    decided HERE, on the record) ─────────────────────────────────────────────
 *
 * 1. ONE arithmetic body. `computeCrossQuad` below computes the four cross
 *    products once; every exported view derives its verdict from those
 *    scalars. No export re-implements the arithmetic.
 *
 * 2. DEGENERATE-DIVIDE GUARD: the parametric view divides by D and guards it
 *    with `EPSILON_ZERO` from the kernel's declared tolerance module — never a
 *    per-call-site literal (C73 §2.2/§2.4). The five rival guards (1e-8 …
 *    1e-12) are retired; migrating a `1e-10`/`1e-12` site onto this TIGHTENS
 *    nothing and LOOSENS the guard to 1e-9 — for a genuine crossing that is a
 *    refusal band widening of at most one order of magnitude on segments that
 *    are parallel to within ~1e-9 of a radian·m², where no rival returned a
 *    trustworthy point either. The boolean views divide by NOTHING: their sign
 *    tests are exact, so §2.4 is satisfied vacuously there (same theorem as
 *    the point-in-polygon canonical).
 *
 * 3. PARALLEL / COLLINEAR: refusal. `intersectSegments2D` returns `null` —
 *    a collinear overlap has no unique intersection point, and inventing one
 *    (midpoint, first touch…) would be geometry fabrication
 *    (§CONTEXT-DATA-HONESTY). Callers with collinear-overlap semantics
 *    (`ringValidation.segmentsIntersect`'s touching-inclusive test) compose an
 *    explicit collinear branch at the call site; that branch is point-on-
 *    segment territory, a different §3.1 family, and must not be folded in
 *    here (§3.5).
 *
 * 4. BOUNDARY: three views, because the estate legitimately asks three
 *    different questions, all answered from the one body:
 *      • `segmentsProperlyCross2D` — STRICT interior crossing: all four cross
 *        products nonzero with opposite signs pairwise. Endpoint touches and
 *        T-touches read false. Exact, no epsilon, no divide.
 *      • `segmentsCrossHalfOpen2D` — the XOR encoding `(d>0) !== (d>0)`,
 *        which puts a zero cross product on the ≤ side: an endpoint T-touch
 *        READS AS a crossing. This is the live kernel convention
 *        (`findSelfIntersection`) and several rivals' shape; it is preserved
 *        as its own named view so collapsing them is bit-identical, not a
 *        silent behaviour change.
 *      • `intersectSegments2D` — parametric hit with CLOSED bounds
 *        (t, u ∈ [0,1] inclusive), returning t, u and the point. Callers
 *        needing an interior-only hit filter on the returned parameters with
 *        exact comparisons (`t > 0 && t < 1 …`) — the rival 1e-8/1e-9/1e-10
 *        interior bands were private epsilons and are retired by their
 *        collapse commits, each retirement stated at the site.
 *
 * 5. ZERO-LENGTH SEGMENT: r = 0 (or s = 0) makes both its cross products 0 —
 *    booleans read false, parametric refuses via the D guard. A degenerate
 *    segment crosses nothing; that is the correct answer to a well-posed
 *    question, not a failure.
 *
 * 6. PLANE / UNITS: dimensionless — any planar pair (plan x/z, screen x/y,
 *    east/north). Cross products scale with area (m² in model space); the
 *    boolean views compare only SIGNS, so they are scale-independent.
 *
 * ── Shipping consumers identified by the collapse series (C73 §3.6) ──────────
 * The kernel's own fold detector (`pure/polygonOffset.findSelfIntersection` —
 * the §W2A-FOLD-DETECT refusal every roof/slab offset runs through), the
 * wall-junction resolvers (`ai-host` / `core-app-model` / `room-topology`
 * `WallIntersectionResolver.segSegIntersectXZ`, three verbatim clones), the
 * ring-simplicity refusal gate (`core-app-model/geometry/ringSimplicity`, the
 * earcut precondition, with `room-topology/RoomPolygonUtils` delegating), the
 * ceiling boundary validator (`CeilingPolygonUtils`), the entry-sightline
 * raycaster (tgl `entrySightlineRaycast`), and the hidden-line occlusion
 * splitter (`HiddenLineRemoval.segCrossT`). Deferred consumers (site-parcel-
 * data's legally-binding erosion/validation, snapping, auto-dimension,
 * finish-host-tracker, PlanSnapEngine's ±0.001 snap band) are listed in the
 * collapse commit rather than silently skipped.
 *
 * PURE: no THREE, no DOM, no I/O — same rules as the rest of the kernel.
 *
 * @file packages/geometry-kernel/src/pure/segmentIntersection.ts
 */

import { EPSILON_ZERO } from '../tolerance.js';

/**
 * An UNBOUNDED line/line hit — see {@link intersectLines2D}. Same four fields
 * as {@link SegmentIntersection2D}; the difference is entirely in the RANGE of
 * `t`/`u`, which is why it is a separate type rather than a reused one. A
 * doc-comment promising `[0, 1]` on a value that is routinely 2.5 is the class
 * of defect this family exists to remove.
 */
export interface LineIntersection2D {
  /** Parameter along a→b. UNRESTRICTED: `< 0` is behind `a`, `> 1` is beyond `b`. */
  readonly t: number;
  /** Parameter along c→d. UNRESTRICTED: `< 0` is behind `c`, `> 1` is beyond `d`. */
  readonly u: number;
  /** Intersection point, first ordinate (evaluated along a→b at t). */
  readonly x: number;
  /** Intersection point, second ordinate (plan z / screen y). */
  readonly y: number;
}

/** A parametric segment/segment hit — see {@link intersectSegments2D}. */
export interface SegmentIntersection2D {
  /** Parameter along a→b, in [0, 1] (0 = a, 1 = b). */
  readonly t: number;
  /** Parameter along c→d, in [0, 1] (0 = c, 1 = d). */
  readonly u: number;
  /** Intersection point, first ordinate (evaluated along a→b at t). */
  readonly x: number;
  /** Intersection point, second ordinate (plan z / screen y). */
  readonly y: number;
}

/**
 * THE arithmetic body (C73 §3.1 canonical — the only place this family's
 * cross products are computed). Every exported view derives its verdict from
 * these four scalars; the header identities (d1 = −u·D, d2 = (1−u)·D,
 * d3 = t·D, d4 = (t−1)·D) are what make the cross-product and parametric
 * spellings one family.
 */
function computeCrossQuad(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { readonly d1: number; readonly d2: number; readonly d3: number; readonly d4: number } {
  const rx = bx - ax, ry = by - ay; // r = b − a
  const sx = dx - cx, sy = dy - cy; // s = d − c
  return {
    d1: rx * (cy - ay) - ry * (cx - ax), // r × (c−a) = −u·D
    d2: rx * (dy - ay) - ry * (dx - ax), // r × (d−a) = (1−u)·D
    d3: sx * (ay - cy) - sy * (ax - cx), // s × (a−c) =  t·D
    d4: sx * (by - cy) - sy * (bx - cx), // s × (b−c) = (t−1)·D
  };
}

/**
 * Do segments a→b and c→d PROPERLY cross — interiors intersecting at exactly
 * one point? Endpoint touches, T-touches, collinear overlaps and parallels
 * all read false. Exact sign tests: no epsilon, no divide (§3.7 axis 4).
 */
export function segmentsProperlyCross2D(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const { d1, d2, d3, d4 } = computeCrossQuad(ax, ay, bx, by, cx, cy, dx, dy);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/**
 * The half-open crossing verdict — the XOR encoding `(d>0) !== (d>0)`, which
 * places a zero cross product on the ≤ side, so an endpoint touching the
 * other segment's interior READS AS a crossing. This is the live convention
 * of the kernel's own fold detector and of the EPS-signed rivals; it is a
 * distinct, deliberate boundary rule, preserved under its own name (§3.7
 * axis 4) — not a bug in `segmentsProperlyCross2D` and not to be "unified"
 * with it silently.
 */
export function segmentsCrossHalfOpen2D(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const { d1, d2, d3, d4 } = computeCrossQuad(ax, ay, bx, by, cx, cy, dx, dy);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

/**
 * Parametric segment/segment intersection: the hit (t, u, point) when the
 * segments intersect within their CLOSED extents (t, u ∈ [0,1] inclusive), or
 * `null` when they are parallel/collinear (|D| < `EPSILON_ZERO` — the ONE
 * declared degenerate-divide guard, C73 §2.4) or the crossing lies outside
 * either segment.
 *
 * Boundary-INCLUSIVE by decision (§3.7 axis 4): shared chain endpoints are
 * hits at t/u ∈ {0, 1}. Interior-only callers filter the returned parameters
 * with exact comparisons; callers with a snap-band beyond the endpoints
 * (PlanSnapEngine's ±0.001) own that band as DOMAIN tolerance and are not
 * served by widening this predicate.
 */
export function intersectSegments2D(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): SegmentIntersection2D | null {
  // Derived, not re-spelled: the [0,1] filter is the ONLY thing this view adds
  // over the unbounded solve (§3.7 axis 4 — one body, several named boundary
  // questions). Behaviour is bit-identical to the previous inline arithmetic.
  const hit = intersectLines2D(ax, ay, bx, by, cx, cy, dx, dy);
  if (hit === null) return null;
  if (hit.t < 0 || hit.t > 1 || hit.u < 0 || hit.u > 1) return null;
  return hit;
}

/**
 * The UNBOUNDED parametric solve: where the INFINITE lines through a→b and
 * c→d cross, with `t` and `u` returned unclamped, or `null` when they are
 * parallel/collinear (|D| < `EPSILON_ZERO` — the one declared degenerate-divide
 * guard, C73 §2.4).
 *
 * ── WHY THIS VIEW EXISTS (added 2026-08-17) ─────────────────────────────────
 * `intersectSegments2D` answers "do these two SEGMENTS meet, and where"; when
 * the answer is no it returns `null`, which deliberately merges *parallel* with
 * *they cross somewhere neither reaches*. That merge is correct for a crossing
 * test and WRONG for the extend/fillet question, where the caller must tell the
 * two apart and quote HOW FAR out of reach the corner is
 * (§CONTEXT-DATA-HONESTY: "no crossing" and "a crossing 6 mm past the end" are
 * different facts, and a refusal that cannot quote the number cannot be acted
 * on). Its first consumer is `FilletTool`'s §FILLET-SEGMENT-BOUNDS refusal.
 *
 * Offered here rather than left to the call site precisely because a caller who
 * needs unclamped `t`/`u` has, until now, had no choice but to spell the solve
 * privately — which is how this family reached fourteen rival definitions. The
 * `null` on parallel is retained: a parallel pair has no unique crossing at any
 * distance, and inventing one would be geometry fabrication (§3.7 axis 3).
 */
export function intersectLines2D(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): LineIntersection2D | null {
  const rx = bx - ax, ry = by - ay;
  const sx = dx - cx, sy = dy - cy;
  const D = rx * sy - ry * sx;
  // §C73-EPSILON-POLICY — the declared numeric-zero epsilon guards the divide;
  // the five rival per-site guards (1e-8 … 1e-12) are retired by the collapse.
  if (Math.abs(D) < EPSILON_ZERO) return null;
  const { d1, d3 } = computeCrossQuad(ax, ay, bx, by, cx, cy, dx, dy);
  const t = d3 / D;
  // `+ 0` canonicalises IEEE −0 (from −d1/D at d1 = 0) to +0, so a touch at a
  // segment start reports u = 0, not −0; exact identity for every other value.
  const u = -d1 / D + 0;
  return { t, u, x: ax + t * rx, y: ay + t * ry };
}
