/**
 * §CURVE-RATIONAL-NURBS — THE rational B-spline (NURBS) for this repository.
 *
 * ─── What this closes, stated as the refusal it replaces ─────────────────────
 * `packages/family-instance/src/profileToPolygon.ts` refused every `spline`
 * whose `degree` was not 3, BY NAME:
 *
 *     "only degree 3 (cubic Bézier chain) is evaluable. Rational/weighted
 *      curves are a declared gap — see C111 §9.6-d."
 *
 * and `math/cubicBezier.ts` carried the matching declaration: *"RATIONAL curves
 * are NOT expressible here … If rational curves are ever needed, they are a NEW
 * degree of freedom on this module (weights), not a new module."*
 *
 * ⭐ **That last sentence is the one thing this file deliberately does NOT
 *    follow, and here is why.** A weight is not a degree of freedom you can
 *    bolt onto a Bézier CHAIN: the chain's whole persisted identity is
 *    `3k+1` control points with an IMPLIED uniform knot vector, and a rational
 *    curve of arbitrary degree has neither of those. Adding weights to
 *    `cubicBezier.ts` would have meant adding a knot vector to it too, at which
 *    point it is no longer "the cubic Bézier" — it is this. So the cubic module
 *    keeps its exact meaning and its callers, and the general curve lands
 *    beside it with the SPECIALISATION stated in both directions:
 *
 *      • a cubic Bézier chain IS a NURBS — degree 3, all weights 1, knots
 *        `[0,0,0,0, 1,1,1, 2,2,2, …]` — and `bezierChainAsNurbs()` below
 *        performs that conversion, so the two are provably one family and not
 *        two rival curve types. `nurbsCurve.test.ts` asserts the two evaluators
 *        agree to 1e-12 on the same control points.
 *      • the cubic path is NOT re-routed through this module. It is the
 *        persisted form of every existing document, `sampleCubicBezierChainXZ`
 *        is what produced their bytes, and swapping the evaluator under them to
 *        "share code" would change vertex counts for curves nobody edited.
 *
 * ─── What a user can now draw that they could not ────────────────────────────
 *  • an EXACT circle / ellipse / conic — the rational quadratic. Measured in
 *    `__tests__/nurbsCurve.test.ts`: the 9-point weighted quadratic circle
 *    evaluates with max |r − R| ≈ 2.2e-16 m at R = 1 m. The cubic module's own
 *    header records that a quadratic POLYNOMIAL Bézier cannot do this at ANY
 *    segment count (max |r − R| = 0.060660 m, invariant in n) — the weights are
 *    what changes the answer, which is the whole point of "rational".
 *  • degree 1…{@link MAX_NURBS_DEGREE} curves, so a degree-5 Rhino/IGES/STEP
 *    curve imports as ITSELF rather than as a refusal or a silent cubic fit.
 *  • NON-UNIFORM knots — repeated interior knots for a deliberate kink, and
 *    unclamped/partial domains, both of which a Bézier chain cannot spell.
 *
 * ─── What is still refused, precisely ────────────────────────────────────────
 *  • PERIODIC (closed, wrap-around) curves as a KIND. A closed curve is
 *    expressed the way the NURBS book expresses it — repeat the first `degree`
 *    control points at the end — and that is a document-authoring act, not a
 *    flag this module reads. There is no `periodic: true` here and inventing
 *    one would mean inventing the wrap.
 *  • SURFACES. This is a curve module; a NURBS surface is a different animal
 *    with its own tessellation problem, and pretending otherwise by naming the
 *    file `nurbs.ts` would be the misreport C74 §3.1 is about.
 *  • NEGATIVE OR ZERO WEIGHTS. A non-positive weight makes the denominator
 *    vanish somewhere in the domain, so the curve has a pole inside its own
 *    parameter range. Refusing is the honest answer; clamping to a tiny
 *    positive number would move the curve without saying so.
 *
 * PURE — no THREE, no DOM, no I/O. Tolerances are CONSUMED from
 * `../tolerance.js` (C73 §2.2); this file declares none of its own.
 *
 * @file packages/geometry-kernel/src/math/nurbsCurve.ts
 */

import { EPSILON_ZERO, COINCIDENT_M } from '../tolerance.js';
import { distancePointToSegment } from '../pure/pointToSegment.js';
import type { Pt2 } from '../pure/polygonOffset.js';

/** Degree bounds. A degree-0 "curve" is a set of disconnected points, not a
 *  curve; the upper bound is Rhino's own maximum authorable degree, named here
 *  rather than left implicit so a degree-12 import refuses with a reason. */
export const MIN_NURBS_DEGREE = 1;
export const MAX_NURBS_DEGREE = 11;

/** Per-knot-span segment bounds. COUNTS, not tolerances — named without an
 *  `EPS`/`TOL` segment to match `cubicBezier.ts`'s convention for the same
 *  quantity. */
export const MIN_NURBS_SEGMENTS_PER_SPAN = 1;
export const MAX_NURBS_SEGMENTS_PER_SPAN = 512;

/**
 * A rational B-spline curve in the XZ plane.
 *
 * `weights` is REQUIRED and is the same length as `controls`. It is not
 * optional-with-a-default, because "all weights are 1" is a CLAIM about the
 * curve (it is polynomial) and a caller that has not decided that should not
 * have it decided for it silently. The `nurbsFromControls` helper writes the
 * ones explicitly for the caller that genuinely means them.
 */
export interface NurbsCurve2D {
  readonly degree: number;
  readonly controls: readonly Pt2[];
  readonly weights: readonly number[];
  readonly knots: readonly number[];
}

export type NurbsValidity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Every structural requirement of a NURBS, checked in one place and REPORTED
 * rather than thrown, so a caller that must turn the failure into its own
 * error code (e.g. `profileToPolygon`'s `'profile-needs-solver'`) can do so
 * without parsing a message.
 */
export function validateNurbsCurve(curve: NurbsCurve2D): NurbsValidity {
  const { degree: p, controls, weights, knots } = curve;
  if (!Number.isInteger(p) || p < MIN_NURBS_DEGREE || p > MAX_NURBS_DEGREE) {
    return {
      ok: false,
      reason: `degree must be an integer in [${MIN_NURBS_DEGREE}, ${MAX_NURBS_DEGREE}]; got ${JSON.stringify(p)}.`,
    };
  }
  if (controls.length < p + 1) {
    return {
      ok: false,
      reason: `a degree-${p} curve needs at least ${p + 1} control points; got ${controls.length}.`,
    };
  }
  if (weights.length !== controls.length) {
    return {
      ok: false,
      reason: `weights (${weights.length}) and control points (${controls.length}) must be the same length.`,
    };
  }
  const wantKnots = controls.length + p + 1;
  if (knots.length !== wantKnots) {
    return {
      ok: false,
      reason: `a degree-${p} curve over ${controls.length} control points needs exactly ${wantKnots} knots (count + degree + 1); got ${knots.length}.`,
    };
  }
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i]!;
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
      return { ok: false, reason: `control point ${i} is not finite: ${JSON.stringify(c)}.` };
    }
    const w = weights[i]!;
    // See the header: a non-positive weight puts a pole inside the domain.
    if (!Number.isFinite(w) || w <= 0) {
      return { ok: false, reason: `weight ${i} must be a finite number > 0; got ${JSON.stringify(w)}.` };
    }
  }
  for (let i = 0; i < knots.length; i++) {
    const k = knots[i]!;
    if (!Number.isFinite(k)) {
      return { ok: false, reason: `knot ${i} is not finite: ${JSON.stringify(k)}.` };
    }
    if (i > 0 && k < knots[i - 1]!) {
      return {
        ok: false,
        reason: `knots must be non-decreasing; knot ${i} (${k}) < knot ${i - 1} (${knots[i - 1]}).`,
      };
    }
  }
  // An interior knot of multiplicity > degree splits the curve into two
  // disconnected pieces; a caller asking for one polyline would get a jump
  // with no vertex explaining it.
  for (let i = p + 1; i < controls.length; i++) {
    let mult = 1;
    while (i + mult < controls.length && knots[i + mult] === knots[i]) mult++;
    if (mult > p) {
      return {
        ok: false,
        reason: `interior knot ${knots[i]} has multiplicity ${mult} > degree ${p}; the curve is discontinuous there and is not one curve.`,
      };
    }
    i += mult - 1;
  }
  const [a, b] = nurbsDomain(curve);
  if (!(b > a)) {
    return {
      ok: false,
      reason: `the curve's parameter domain [${a}, ${b}] is empty; knots[${p}] must be strictly less than knots[${controls.length}].`,
    };
  }
  return { ok: true };
}

/**
 * The parameter interval the curve is DEFINED on: `[U[p], U[n+1]]` where
 * `n + 1 = controls.length`.
 *
 * ⭐ This is not the same as `[U[0], U[last]]`, and the difference is the whole
 *    reason unclamped curves are expressible: the first and last `p` knots are
 *    outside the domain, and evaluating there would read basis functions that
 *    do not sum to 1.
 */
export function nurbsDomain(curve: NurbsCurve2D): readonly [number, number] {
  const p = curve.degree;
  const n = curve.controls.length - 1;
  return [curve.knots[p] ?? Number.NaN, curve.knots[n + 1] ?? Number.NaN];
}

/** True when the weights are not all equal — i.e. the curve is genuinely
 *  RATIONAL and no polynomial curve of the same degree can reproduce it. A
 *  uniform non-1 weight cancels in the quotient and is NOT rational. */
export function isRationalNurbs(curve: NurbsCurve2D): boolean {
  const first = curve.weights[0];
  if (first === undefined) return false;
  for (const w of curve.weights) {
    if (Math.abs(w - first) > EPSILON_ZERO) return true;
  }
  return false;
}

/**
 * The clamped uniform knot vector for `count` control points at `degree`:
 * `degree+1` zeros, then `1 … count−degree−1`, then `degree+1` copies of
 * `count−degree`. Endpoints are interpolated.
 */
export function clampedUniformKnots(degree: number, count: number): number[] {
  const interior = count - degree - 1;
  const out: number[] = [];
  for (let i = 0; i <= degree; i++) out.push(0);
  for (let i = 1; i <= interior; i++) out.push(i);
  const end = interior + 1;
  for (let i = 0; i <= degree; i++) out.push(end);
  return out;
}

/** A POLYNOMIAL (all weights 1) clamped-uniform curve through the given control
 *  polygon — the common case, with the ones written out explicitly. */
export function nurbsFromControls(degree: number, controls: readonly Pt2[]): NurbsCurve2D {
  return {
    degree,
    controls,
    weights: controls.map(() => 1),
    knots: clampedUniformKnots(degree, controls.length),
  };
}

/**
 * The cubic Bézier CHAIN of `cubicBezier.ts`, expressed as the NURBS it is:
 * degree 3, all weights 1, and a knot vector with each interior join at
 * multiplicity 3 (so the chain's C0 join is reproduced exactly, including a
 * genuine tangent break where the author made one).
 *
 * ⭐ This exists to make the "one family, not two curve types" claim FALSIFIABLE
 *    rather than asserted: the test evaluates the same control points through
 *    both modules and compares.
 *
 * @throws RangeError when `controls.length` is not `3k+1`.
 */
export function bezierChainAsNurbs(controls: readonly Pt2[]): NurbsCurve2D {
  const n = controls.length;
  if (!Number.isInteger(n) || n < 4 || (n - 1) % 3 !== 0) {
    throw new RangeError(
      `[nurbsCurve] a cubic Bézier chain needs 3k+1 control points (4, 7, 10, …); got ${n}.`,
    );
  }
  const spans = (n - 1) / 3;
  const knots: number[] = [0, 0, 0, 0];
  for (let s = 1; s < spans; s++) knots.push(s, s, s);
  knots.push(spans, spans, spans, spans);
  return { degree: 3, controls, weights: controls.map(() => 1), knots };
}

/**
 * The knot span index `k` with `U[k] ≤ u < U[k+1]`, clamped into `[p, n]` —
 * the NURBS book's `FindSpan`, binary search, O(log n).
 */
function findSpan(curve: NurbsCurve2D, u: number): number {
  const p = curve.degree;
  const n = curve.controls.length - 1;
  const U = curve.knots;
  if (u >= U[n + 1]!) return n;
  if (u <= U[p]!) return p;
  let low = p;
  let high = n + 1;
  let mid = (low + high) >> 1;
  while (u < U[mid]! || u >= U[mid + 1]!) {
    if (u < U[mid]!) high = mid;
    else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

/**
 * Evaluate the curve at parameter `u` — de Boor in HOMOGENEOUS coordinates
 * `(w·x, w·z, w)`, divided at the end.
 *
 * ⭐ **The division is what "rational" means, and doing it at the END is what
 *    makes it exact.** Interpolating `(x, z)` and `w` separately and dividing
 *    per control point is a different (wrong) curve; the weighted circle test
 *    fails by ~4% under that mistake, which is why the test exists.
 *
 * `u` outside the domain is CLAMPED to it. That is deliberate and is not a
 * silent extrapolation: outside `[U[p], U[n+1]]` the basis functions do not sum
 * to 1, so an "extrapolated" answer would not be on the curve at all.
 */
export function nurbsPointXZ(curve: NurbsCurve2D, u: number): Pt2 {
  const p = curve.degree;
  const U = curve.knots;
  const [a, b] = nurbsDomain(curve);
  const t = Math.min(b, Math.max(a, u));
  const span = findSpan(curve, t);

  // Homogeneous working set for this span: p+1 points.
  const dx: number[] = new Array(p + 1);
  const dz: number[] = new Array(p + 1);
  const dw: number[] = new Array(p + 1);
  for (let j = 0; j <= p; j++) {
    const idx = span - p + j;
    const c = curve.controls[idx]!;
    const w = curve.weights[idx]!;
    dx[j] = c[0] * w;
    dz[j] = c[1] * w;
    dw[j] = w;
  }

  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = span - p + j;
      const lo = U[i]!;
      const hi = U[i + p - r + 1]!;
      const den = hi - lo;
      // A zero denominator means this knot's multiplicity has already made the
      // basis function vanish; the NURBS book's convention is 0/0 := 0, and
      // taking the left value is exactly that.
      const alpha = den === 0 ? 0 : (t - lo) / den;
      dx[j] = (1 - alpha) * dx[j - 1]! + alpha * dx[j]!;
      dz[j] = (1 - alpha) * dz[j - 1]! + alpha * dz[j]!;
      dw[j] = (1 - alpha) * dw[j - 1]! + alpha * dw[j]!;
    }
  }

  const w = dw[p]!;
  // Cannot happen for validated curves (all weights > 0 ⇒ every convex
  // combination is > 0). Kept because this function is exported and a caller
  // may hand it an unvalidated curve; NaN is the honest answer to a pole, not
  // a large number that renders as a spike.
  if (!(Math.abs(w) > 0)) return [Number.NaN, Number.NaN];
  return [dx[p]! / w, dz[p]! / w];
}

/**
 * Fractions along each candidate chord at which the deviation is MEASURED.
 *
 * ⚠ **This is an ESTIMATOR, not a proven bound, and the difference is stated
 *   here rather than hidden.** `cubicBezier.ts` can quote a real bound
 *   (`max|B''| / 8n²`) because a polynomial Bézier's second derivative is
 *   bounded by its control-point second differences. A RATIONAL curve's second
 *   derivative involves the denominator's derivatives and admits no such
 *   convex-hull argument, so a "bound" derived that way would be a claim this
 *   module cannot support. Measuring is what it can support.
 *
 * ⭐ THREE fractions, not one. A single midpoint probe returns 0 on any span
 *   whose curve is symmetric about its chord midpoint — an S-shape — and would
 *   accept a single chord for a curve that visibly is not one. `nurbsCurve.test.ts`
 *   checks the achieved error against an INDEPENDENT dense sampling, so the
 *   estimator's quality is measured rather than assumed.
 */
const CHORD_PROBE_FRACTIONS = [0.25, 0.5, 0.75] as const;

/** The largest measured distance from the curve to its `segments`-chord
 *  polyline over one knot span, probed at {@link CHORD_PROBE_FRACTIONS}. */
export function nurbsSpanChordDeviation(
  curve: NurbsCurve2D,
  a: number,
  b: number,
  segments: number,
): number {
  let worst = 0;
  for (let s = 0; s < segments; s++) {
    const u0 = a + ((b - a) * s) / segments;
    const u1 = a + ((b - a) * (s + 1)) / segments;
    const q0 = nurbsPointXZ(curve, u0);
    const q1 = nurbsPointXZ(curve, u1);
    for (const f of CHORD_PROBE_FRACTIONS) {
      const q = nurbsPointXZ(curve, u0 + (u1 - u0) * f);
      const d = distancePointToSegment(q[0], q[1], q0[0], q0[1], q1[0], q1[1]);
      if (d > worst) worst = d;
    }
  }
  return Number.isFinite(worst) ? worst : Number.POSITIVE_INFINITY;
}

/**
 * Segments needed to hold one knot span inside `chordTolerance`, by DOUBLING
 * from 1 until the measured deviation fits or {@link MAX_NURBS_SEGMENTS_PER_SPAN}
 * is reached.
 *
 * ⭐ **Pure in its inputs** — `check-deterministic-regeneration`'s condition 2.
 *    No clock, no random, no counter, no LOD input: the same curve and the same
 *    tolerance always yield the same count, so a regenerated profile is
 *    byte-identical. Doubling (rather than incrementing) is what keeps that
 *    determinism cheap — at most `log2(512) = 9` trials.
 */
export function segmentsForNurbsSpan(
  curve: NurbsCurve2D,
  a: number,
  b: number,
  chordTolerance: number = COINCIDENT_M,
): number {
  if (!Number.isFinite(chordTolerance) || chordTolerance <= 0) {
    return MAX_NURBS_SEGMENTS_PER_SPAN;
  }
  let n = MIN_NURBS_SEGMENTS_PER_SPAN;
  for (;;) {
    if (nurbsSpanChordDeviation(curve, a, b, n) <= chordTolerance) return n;
    if (n >= MAX_NURBS_SEGMENTS_PER_SPAN) return MAX_NURBS_SEGMENTS_PER_SPAN;
    n = Math.min(MAX_NURBS_SEGMENTS_PER_SPAN, n * 2);
  }
}

/**
 * Sample the whole curve into one polyline over its domain, knot span by knot
 * span.
 *
 * ⭐ Spans are sampled INDEPENDENTLY and the shared parameter between two of
 *    them emits ONE vertex — an INDEX identity, not a tolerance test. That also
 *    means a repeated interior knot (an authored kink) lands ON a vertex
 *    instead of being rounded off by a uniform sampler that knew nothing about
 *    it, which is the practical reason a NURBS is sampled per span at all.
 *
 * ⚠ `chordTolerance` is in the SAME LENGTH UNIT as the control points. The
 *   default is the kernel's declared model-space coincidence tolerance
 *   (metres); a millimetre caller passes its own rather than minting an
 *   epsilon of its own.
 *
 * @throws RangeError when the curve is structurally invalid. Callers that need
 *         a code rather than a message call {@link validateNurbsCurve} first.
 */
export function sampleNurbsCurveXZ(
  curve: NurbsCurve2D,
  chordTolerance: number = COINCIDENT_M,
): Pt2[] {
  const v = validateNurbsCurve(curve);
  if (!v.ok) throw new RangeError(`[nurbsCurve] ${v.reason}`);
  const p = curve.degree;
  const n = curve.controls.length - 1;
  const out: Pt2[] = [];
  for (let i = p; i <= n; i++) {
    const a = curve.knots[i]!;
    const b = curve.knots[i + 1]!;
    // A zero-length span is a repeated knot, not a piece of curve.
    if (!(b > a)) continue;
    const segments = segmentsForNurbsSpan(curve, a, b, chordTolerance);
    for (let j = out.length === 0 ? 0 : 1; j <= segments; j++) {
      out.push(nurbsPointXZ(curve, a + ((b - a) * j) / segments));
    }
  }
  return out;
}
