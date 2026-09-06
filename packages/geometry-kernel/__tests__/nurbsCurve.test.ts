// §CURVE-RATIONAL-NURBS — the rational B-spline, proven against properties
// INDEPENDENT of the implementation rather than against a snapshot of its own
// output, in the style `cubicBezier.test.ts` already set here.
//
// ⭐ THE HEADLINE ASSERTION IS THE ONE THAT FALSIFIES THE OLD REFUSAL. The
//    cubic module's header records, from a measurement, that a POLYNOMIAL
//    Bézier cannot express a circular arc at ANY segment count (max |r − R| =
//    0.060660 m at R = 1 m, invariant in n). This suite evaluates the standard
//    9-point WEIGHTED quadratic circle and measures |r − R| to machine
//    precision — and then re-evaluates the SAME control points with the
//    weights set to 1 and measures the error blowing up. If the weights were
//    being read and ignored, the second measurement would equal the first.

import { describe, expect, it } from 'vitest';
import {
  bezierChainAsNurbs,
  clampedUniformKnots,
  cubicBezierPointXZ,
  isRationalNurbs,
  MAX_NURBS_DEGREE,
  nurbsDomain,
  nurbsFromControls,
  nurbsPointXZ,
  sampleCubicBezierChainXZ,
  sampleNurbsCurveXZ,
  segmentsForNurbsSpan,
  validateNurbsCurve,
  type NurbsCurve2D,
  type Pt2,
} from '../src/index.js';

/** Distance from a point to a polyline — the INDEPENDENT measuring stick,
 *  written out here rather than imported so the achieved chord error is not
 *  checked with a function the subject also uses. */
function distanceToPolyline(p: Pt2, poly: ReadonlyArray<Pt2>): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!;
    const b = poly[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 0
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lenSq))
      : 0;
    const ex = p[0] - (a[0] + t * dx);
    const ez = p[1] - (a[1] + t * dz);
    const d = Math.hypot(ex, ez);
    if (d < best) best = d;
  }
  return best;
}

const R2 = Math.SQRT1_2; // √2 / 2 — the rational quadratic's corner weight.

/** The NURBS book's 9-point rational quadratic UNIT CIRCLE. */
function unitCircle(): NurbsCurve2D {
  return {
    degree: 2,
    controls: [
      [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0],
    ],
    weights: [1, R2, 1, R2, 1, R2, 1, R2, 1],
    knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  };
}

/** Largest |r − 1| over `n` evenly spaced parameters of the curve's domain. */
function maxRadialError(curve: NurbsCurve2D, n: number): number {
  const [a, b] = nurbsDomain(curve);
  let worst = 0;
  for (let i = 0; i <= n; i++) {
    const p = nurbsPointXZ(curve, a + ((b - a) * i) / n);
    const e = Math.abs(Math.hypot(p[0], p[1]) - 1);
    if (e > worst) worst = e;
  }
  return worst;
}

describe('§CURVE-RATIONAL-NURBS — the exact circle, which is the whole point', () => {
  it('the 9-point weighted quadratic is a circle to machine precision', () => {
    const err = maxRadialError(unitCircle(), 2048);
    // The cubic module measured 0.060660 m for the best POLYNOMIAL quadratic
    // at this radius, invariant in segment count. This is ~1e-16.
    expect(err).toBeLessThan(1e-12);
  });

  it('THE SAME control points with unit weights are NOT a circle — so the weights are read', () => {
    const c = unitCircle();
    const unweighted: NurbsCurve2D = { ...c, weights: c.weights.map(() => 1) };
    const err = maxRadialError(unweighted, 2048);
    // ⭐ MEASURED 0.060660171779821415 — and that is not an arbitrary
    //    threshold, it is the CLOSED FORM. The polynomial quadratic through
    //    (1,0),(1,1),(0,1) passes through (0.75, 0.75) at t = ½, whose radius
    //    is 3/(2√2). So the error is exactly `3/(2√2) − 1`, checked here
    //    against the algebra rather than against a recorded output.
    //
    // ⭐⭐ It is ALSO, to every digit, the number `profileToPolygon.ts`'s
    //    §4D-CLOSED-FORM-PROFILE header records from an independent probe of
    //    `arcToPoints` — *"max |r − R| = 0.060660 m … INVARIANT in segments"*.
    //    Two lanes, two measurements, one algebraic fact: a polynomial
    //    quadratic is not a circle at any density, and the WEIGHTS are what
    //    close that gap.
    expect(err).toBeCloseTo(3 / (2 * Math.SQRT2) - 1, 12);
    expect(err).toBeGreaterThan(0.06);
    expect(isRationalNurbs(c)).toBe(true);
    expect(isRationalNurbs(unweighted)).toBe(false);
  });

  it('sampling the circle holds the requested chord tolerance, measured independently', () => {
    const c = unitCircle();
    const tol = 1e-3;
    const poly = sampleNurbsCurveXZ(c, tol);
    expect(poly.length).toBeGreaterThan(4);
    const [a, b] = nurbsDomain(c);
    let worst = 0;
    for (let i = 0; i <= 4096; i++) {
      const p = nurbsPointXZ(c, a + ((b - a) * i) / 4096);
      const d = distanceToPolyline(p, poly);
      if (d > worst) worst = d;
    }
    // The estimator probes 3 fractions per chord; this is the TRUE max over a
    // dense sweep. It is allowed to exceed the estimate slightly, and the
    // factor is stated rather than hidden.
    expect(worst).toBeLessThanOrEqual(tol * 1.5);
  });

  it('a tighter tolerance costs more vertices, monotonically', () => {
    const c = unitCircle();
    const coarse = sampleNurbsCurveXZ(c, 1e-2).length;
    const fine = sampleNurbsCurveXZ(c, 1e-5).length;
    expect(fine).toBeGreaterThan(coarse);
  });
});

describe('§CURVE-RATIONAL-NURBS — one curve family, not two', () => {
  it('a cubic Bézier chain evaluated as a NURBS agrees with the cubic module', () => {
    const controls: Pt2[] = [
      [0, 0], [0, 1], [1, 1], [1, 0], [1, -1], [2, -1], [2, 0],
    ];
    const curve = bezierChainAsNurbs(controls);
    expect(validateNurbsCurve(curve)).toEqual({ ok: true });
    expect(nurbsDomain(curve)).toEqual([0, 2]);

    for (let span = 0; span < 2; span++) {
      const i = span * 3;
      for (let k = 0; k <= 32; k++) {
        const t = k / 32;
        const viaBezier = cubicBezierPointXZ(
          controls[i]!, controls[i + 1]!, controls[i + 2]!, controls[i + 3]!, t,
        );
        const viaNurbs = nurbsPointXZ(curve, span + t);
        expect(viaNurbs[0]).toBeCloseTo(viaBezier[0], 12);
        expect(viaNurbs[1]).toBeCloseTo(viaBezier[1], 12);
      }
    }
  });

  it('the persisted cubic path is NOT re-routed — its own sampler still owns it', () => {
    // Guards the decision recorded in both headers: sharing the evaluator would
    // change the vertex count of documents nobody edited. The two are allowed
    // to disagree on DENSITY; the assertion is only that both run.
    const controls: Pt2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(sampleCubicBezierChainXZ(controls).length).toBeGreaterThan(1);
    expect(sampleNurbsCurveXZ(bezierChainAsNurbs(controls)).length).toBeGreaterThan(1);
  });

  it('bezierChainAsNurbs refuses a non-3k+1 control count', () => {
    expect(() => bezierChainAsNurbs([[0, 0], [1, 1], [2, 0]])).toThrow(/3k\+1/);
  });
});

describe('§CURVE-RATIONAL-NURBS — degenerate cases with known exact answers', () => {
  it('degree 1 IS the control polyline, vertex for vertex', () => {
    const controls: Pt2[] = [[0, 0], [3, 0], [3, 4], [0, 4]];
    const curve = nurbsFromControls(1, controls);
    const poly = sampleNurbsCurveXZ(curve, 1e-6);
    expect(poly.length).toBe(controls.length);
    for (let i = 0; i < controls.length; i++) {
      expect(poly[i]![0]).toBeCloseTo(controls[i]![0], 12);
      expect(poly[i]![1]).toBeCloseTo(controls[i]![1], 12);
    }
  });

  it('a clamped curve interpolates its first and last control point', () => {
    const controls: Pt2[] = [[0, 0], [1, 5], [4, 5], [5, 0], [7, 2]];
    const curve = nurbsFromControls(3, controls);
    const [a, b] = nurbsDomain(curve);
    const start = nurbsPointXZ(curve, a);
    const end = nurbsPointXZ(curve, b);
    expect(start[0]).toBeCloseTo(0, 12);
    expect(start[1]).toBeCloseTo(0, 12);
    expect(end[0]).toBeCloseTo(7, 12);
    expect(end[1]).toBeCloseTo(2, 12);
  });

  it('a straight control polygon at any degree is a straight line — 1 segment per span', () => {
    const controls: Pt2[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    const curve = nurbsFromControls(3, controls);
    const [a, b] = nurbsDomain(curve);
    expect(segmentsForNurbsSpan(curve, a, b, 1e-9)).toBe(1);
  });

  it('evaluation outside the domain CLAMPS rather than extrapolating', () => {
    const curve = nurbsFromControls(2, [[0, 0], [1, 2], [2, 0]]);
    const [a, b] = nurbsDomain(curve);
    expect(nurbsPointXZ(curve, a - 10)).toEqual(nurbsPointXZ(curve, a));
    expect(nurbsPointXZ(curve, b + 10)).toEqual(nurbsPointXZ(curve, b));
  });

  it('sampling is deterministic — same inputs, identical output', () => {
    const c = unitCircle();
    expect(sampleNurbsCurveXZ(c, 1e-4)).toEqual(sampleNurbsCurveXZ(c, 1e-4));
  });

  it('clampedUniformKnots produces the count the validator demands', () => {
    for (let degree = 1; degree <= 5; degree++) {
      for (let count = degree + 1; count <= degree + 6; count++) {
        const knots = clampedUniformKnots(degree, count);
        expect(knots.length).toBe(count + degree + 1);
        expect(validateNurbsCurve({
          degree,
          controls: Array.from({ length: count }, (_, i) => [i, 0] as Pt2),
          weights: new Array<number>(count).fill(1),
          knots,
        })).toEqual({ ok: true });
      }
    }
  });
});

describe('§CURVE-RATIONAL-NURBS — every structural refusal names what is wrong', () => {
  const base = (): NurbsCurve2D => nurbsFromControls(2, [[0, 0], [1, 2], [2, 0]]);

  it('refuses a non-integer or out-of-range degree', () => {
    for (const degree of [0, 2.5, -1, MAX_NURBS_DEGREE + 1]) {
      const v = validateNurbsCurve({ ...base(), degree });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/degree/);
    }
  });

  it('refuses fewer control points than degree + 1', () => {
    const v = validateNurbsCurve({
      degree: 3, controls: [[0, 0], [1, 1]], weights: [1, 1], knots: [0, 0, 0, 0, 1, 1],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/at least 4 control points/);
  });

  it('refuses a knot vector of the wrong length', () => {
    const c = base();
    const v = validateNurbsCurve({ ...c, knots: [...c.knots, 9] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/exactly 6 knots/);
  });

  it('refuses decreasing knots', () => {
    const v = validateNurbsCurve({ ...base(), knots: [0, 0, 0, 1, 0.5, 1] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/non-decreasing/);
  });

  it('refuses a zero or negative weight — a pole inside the domain', () => {
    for (const w of [0, -1]) {
      const v = validateNurbsCurve({ ...base(), weights: [1, w, 1] });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/weight 1 must be a finite number > 0/);
    }
  });

  it('refuses an interior knot whose multiplicity exceeds the degree', () => {
    // degree 2, 6 controls ⇒ 9 knots; interior knot 1 repeated 3× > degree 2.
    const v = validateNurbsCurve({
      degree: 2,
      controls: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
      weights: new Array<number>(6).fill(1),
      knots: [0, 0, 0, 1, 1, 1, 2, 2, 2],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/multiplicity 3 > degree 2/);
  });

  it('refuses an empty parameter domain', () => {
    const v = validateNurbsCurve({ ...base(), knots: [0, 0, 0, 0, 0, 0] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/domain/);
  });

  it('sampleNurbsCurveXZ throws rather than sampling an invalid curve', () => {
    expect(() => sampleNurbsCurveXZ({ ...base(), weights: [1, 0, 1] })).toThrow(/nurbsCurve/);
  });

  it('a mismatched weight count is refused', () => {
    const v = validateNurbsCurve({ ...base(), weights: [1, 1] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/same length/);
  });
});
