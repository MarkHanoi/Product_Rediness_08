/**
 * §CURVE-ONE-CUBIC-OWNER — THE cubic Bézier for this repository.
 *
 * ─── Why this module exists, and why it is HERE ──────────────────────────────
 * `apps/component-editor`'s sketcher had no free-form curve at all, and
 * `packages/family-instance/src/profileToPolygon.ts` REFUSED the `spline` kind
 * outright with the honest reason *"no spline control-point spelling exists
 * anywhere in this repository"*. Two consumers, one missing primitive — which
 * is exactly the shape that has repeatedly produced two incompatible copies
 * here. So the primitive lands ONCE, in the kernel, and both consume it.
 *
 * ⛔ **This is NOT a second curve type.** The repo already samples QUADRATIC
 *    Béziers in three places — `producers/_internal/WallPath.ts:arcToPoints`,
 *    `geometry-slab/src/boundaryArc.ts:tessellateArcSegment`, and
 *    `apps/editor/.../formaWallCurve.ts:sampleQuadraticBezierXZ` — all three
 *    are the SAME curve at degree 2, used for curved WALL PATHS. A quadratic
 *    span cannot express an S-curve (one inflection needs degree ≥ 3) and,
 *    per `profileToPolygon.ts`'s §4D header, cannot express a circular arc
 *    either (measured: max |r − R| = 0.060660 m at R = 1 m, INVARIANT in
 *    segment count). Degree 3 is therefore a capability the repo does not
 *    have, not a rival spelling of one it does.
 *
 * ⭐ **Why the CUBIC BÉZIER CHAIN and not a NURBS type.** A clamped uniform
 *    cubic B-spline — Rhino's degree-3 `Curve` / `InterpCrv`, the founder's
 *    *"any shape like Rhinoceros"* — converts EXACTLY to a chain of cubic
 *    Bézier spans; no approximation is involved. The Bézier chain is the
 *    canonical evaluation form of that family, and it has the one property the
 *    profile pipeline requires: **its endpoints are interpolated**, so a spline
 *    span meets the line or arc next to it at an authored point rather than
 *    near one. A raw (unclamped) B-spline control polygon does not, which is
 *    why it is not the persisted form.
 *
 * ⛔ **DECLARED GAP — RATIONAL curves are NOT expressible here.** Weighted
 *    NURBS (a true circle, a conic) needs a denominator this module does not
 *    carry. That is why `profileToPolygon` keeps a CIRCULAR-ARC entity kind of
 *    its own instead of approximating one with cubics: an exact arc beats a
 *    1e-4-ish cubic fit, and a fit dressed as a circle is the misreport C74
 *    §3.1 is about. If rational curves are ever needed, they are a NEW degree
 *    of freedom on this module (weights), not a new module.
 *
 * PURE — no THREE, no DOM, no I/O. Tolerances are CONSUMED from
 * `../tolerance.js` (C73 §2.2); this file declares none of its own.
 *
 * @file packages/geometry-kernel/src/math/cubicBezier.ts
 */

import { EPSILON_ZERO, COINCIDENT_M } from '../tolerance.js';
import type { Pt2 } from '../pure/polygonOffset.js';

/** The only degree this module evaluates. Named so a caller can refuse a
 *  document that asks for another rather than silently sampling it as a 3. */
export const CUBIC_BEZIER_DEGREE = 3;

/** Segment-count bounds. COUNTS, not tolerances — deliberately named so they
 *  carry no `EPS`/`TOL` segment, matching `profileToPolygon.ts`'s convention
 *  for the same quantity. */
export const MIN_BEZIER_SEGMENTS = 1;
export const MAX_BEZIER_SEGMENTS = 512;

/**
 * A cubic Bézier CHAIN is `3k + 1` control points for `k ≥ 1` spans: every
 * span shares its last control point with the next span's first, which is what
 * makes the chain C0 by construction (no join tolerance is involved, and none
 * is needed — the shared point is ONE point).
 *
 * 4 → 1 span · 7 → 2 spans · 10 → 3 spans …
 */
export function isCubicBezierChainLength(n: number): boolean {
  return Number.isInteger(n) && n >= 4 && (n - 1) % 3 === 0;
}

/** Number of spans in a chain of `n` control points, or 0 if `n` is not a
 *  valid chain length. */
export function cubicBezierSpanCount(n: number): number {
  return isCubicBezierChainLength(n) ? (n - 1) / 3 : 0;
}

/** B(t) = (1−t)³P0 + 3(1−t)²t·P1 + 3(1−t)t²·P2 + t³P3 */
export function cubicBezierPointXZ(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  p3: Pt2,
  t: number,
): Pt2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/**
 * B'(t) = 3(1−t)²(P1−P0) + 6(1−t)t(P2−P1) + 3t²(P3−P2).
 *
 * ⭐ At `t = 0` this is `3·(P1 − P0)` — i.e. **the curve's tangent direction at
 *    its start endpoint is the direction of the first control LEG**, and at
 *    `t = 1` it is `3·(P3 − P2)`, the last leg. That identity is what lets an
 *    endpoint-tangency constraint be expressed as a `parallel` over a two-point
 *    leg — an EXISTING executable constraint kind — instead of minting a
 *    `tangent` kind nothing evaluates (C74 §4.6.1/§4.6.3).
 */
export function cubicBezierTangentXZ(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  p3: Pt2,
  t: number,
): Pt2 {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return [
    a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]),
    a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]),
  ];
}

/**
 * Segments needed to hold one cubic span inside `chordTolerance`.
 *
 * ─── The bound, stated so it is falsifiable ─────────────────────────────────
 * `B''(t) = 6(1−t)·A + 6t·B` where `A = P0 − 2P1 + P2` and `B = P1 − 2P2 + P3`,
 * so `max|B''| ≤ 6·max(|A|, |B|)`. For UNIFORM subdivision into `n` chords the
 * maximum deviation of the curve from its chord polyline is bounded by
 * `max|B''| / (8n²)`. Requiring that ≤ `tol` gives
 *
 *     n ≥ sqrt( 6·max(|A|,|B|) / (8·tol) ) = sqrt( 3·max(|A|,|B|) / (4·tol) )
 *
 * which is what this returns (ceiled, clamped).
 *
 * ⭐ **Pure in its inputs** — `check-deterministic-regeneration`'s condition 2:
 *    no clock, no random, no counter, no LOD input. The same four control
 *    points and the same tolerance always yield the same count, so a
 *    regenerated profile is byte-identical.
 *
 * ⚠ `chordTolerance` is in the SAME LENGTH UNIT as the control points. The
 *   default is the kernel's declared model-space coincidence tolerance
 *   (metres); the sketch surface works in millimetres and passes its own.
 *   ⛔ It is a PARAMETER and not a declared constant precisely so that a
 *   millimetre caller does not have to mint a rival epsilon to be correct.
 */
export function segmentsForCubicBezier(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  p3: Pt2,
  chordTolerance: number = COINCIDENT_M,
): number {
  const ax = p0[0] - 2 * p1[0] + p2[0];
  const az = p0[1] - 2 * p1[1] + p2[1];
  const bx = p1[0] - 2 * p2[0] + p3[0];
  const bz = p1[1] - 2 * p2[1] + p3[1];
  const m = Math.max(Math.hypot(ax, az), Math.hypot(bx, bz));
  // A span whose second difference vanishes IS a straight line: two vertices
  // describe it exactly, and spending more is not "safer", it is noise in the
  // vertex buffer.
  if (!Number.isFinite(m) || m <= EPSILON_ZERO) return MIN_BEZIER_SEGMENTS;
  if (!Number.isFinite(chordTolerance) || chordTolerance <= 0) return MAX_BEZIER_SEGMENTS;
  const n = Math.ceil(Math.sqrt((3 * m) / (4 * chordTolerance)));
  if (!Number.isFinite(n)) return MAX_BEZIER_SEGMENTS;
  return Math.min(MAX_BEZIER_SEGMENTS, Math.max(MIN_BEZIER_SEGMENTS, n));
}

/** Sample one cubic span into `segments` chords — `segments + 1` vertices,
 *  INCLUDING both endpoints. */
export function sampleCubicBezierXZ(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  p3: Pt2,
  segments: number,
): Pt2[] {
  const n = Math.min(
    MAX_BEZIER_SEGMENTS,
    Math.max(MIN_BEZIER_SEGMENTS, Math.floor(segments)),
  );
  const out: Pt2[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    out[i] = cubicBezierPointXZ(p0, p1, p2, p3, i / n);
  }
  return out;
}

/**
 * Sample a whole chain into one polyline.
 *
 * The shared control point between two spans is emitted ONCE — this is an
 * INDEX identity (span `i` ends on the same array element span `i+1` starts
 * on), not a tolerance test, so no epsilon decides it.
 *
 * @throws RangeError when `controls.length` is not a valid chain length. A
 *         caller that cannot form a chain is under-determined, and refusing is
 *         the correct answer (spec §75) — guessing a closing control point
 *         would invent geometry the author did not draw.
 */
export function sampleCubicBezierChainXZ(
  controls: ReadonlyArray<Pt2>,
  chordTolerance: number = COINCIDENT_M,
): Pt2[] {
  if (!isCubicBezierChainLength(controls.length)) {
    throw new RangeError(
      `[cubicBezier] a cubic Bézier chain needs 3k+1 control points (4, 7, 10, …); got ${controls.length}.`,
    );
  }
  const out: Pt2[] = [];
  const spans = cubicBezierSpanCount(controls.length);
  for (let s = 0; s < spans; s++) {
    const i = s * 3;
    const p0 = controls[i]!;
    const p1 = controls[i + 1]!;
    const p2 = controls[i + 2]!;
    const p3 = controls[i + 3]!;
    const n = segmentsForCubicBezier(p0, p1, p2, p3, chordTolerance);
    const pts = sampleCubicBezierXZ(p0, p1, p2, p3, n);
    // Drop the duplicated join vertex on every span but the first.
    for (let k = s === 0 ? 0 : 1; k < pts.length; k++) out.push(pts[k]!);
  }
  return out;
}

/**
 * Convert a run of points the user wants the curve to PASS THROUGH into the
 * cubic Bézier chain that interpolates them — the standard Catmull-Rom
 * (cardinal, tension ½) → Bézier conversion:
 *
 *     m_i  = (P_{i+1} − P_{i−1}) / 2      (one-sided at the two ends)
 *     span = [ P_i, P_i + m_i/3, P_{i+1} − m_{i+1}/3, P_{i+1} ]
 *
 * ⛔ **This is a CONVERSION, not a second curve type.** Nothing downstream ever
 *    sees a Catmull-Rom: the function's output is the ONE persisted form, and
 *    every control point it produces is individually editable and
 *    constrainable afterwards. It exists because *"click the points the curve
 *    goes through"* is how a person draws, and *"place 3k+1 control points, two
 *    of which the curve misses"* is not.
 *
 * @throws RangeError for fewer than 2 through-points — one point is not a
 *         curve, and a curve invented from it would be invented geometry.
 */
export function catmullRomToCubicBezierChainXZ(
  through: ReadonlyArray<Pt2>,
): Pt2[] {
  if (through.length < 2) {
    throw new RangeError(
      `[cubicBezier] catmullRomToCubicBezierChainXZ needs at least 2 through-points; got ${through.length}.`,
    );
  }
  const n = through.length;
  const tangent = (i: number): Pt2 => {
    const prev = through[Math.max(0, i - 1)]!;
    const next = through[Math.min(n - 1, i + 1)]!;
    // Interior points get the centred difference /2; the two ends get the
    // one-sided difference (the clamp above collapses one side), which is the
    // conventional natural-end behaviour.
    const scale = i === 0 || i === n - 1 ? 1 : 0.5;
    return [(next[0] - prev[0]) * scale, (next[1] - prev[1]) * scale];
  };

  const out: Pt2[] = [[through[0]![0], through[0]![1]]];
  for (let i = 0; i < n - 1; i++) {
    const a = through[i]!;
    const b = through[i + 1]!;
    const ma = tangent(i);
    const mb = tangent(i + 1);
    out.push([a[0] + ma[0] / 3, a[1] + ma[1] / 3]);
    out.push([b[0] - mb[0] / 3, b[1] - mb[1] / 3]);
    out.push([b[0], b[1]]);
  }
  return out;
}
