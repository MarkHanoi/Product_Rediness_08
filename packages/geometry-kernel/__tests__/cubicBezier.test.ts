// §CURVE-ONE-CUBIC-OWNER — the cubic Bézier primitive, proven against
// properties that are INDEPENDENT of the implementation rather than against a
// snapshot of its own output.
//
// ⛔ Deliberately NOT asserted here: "the curve looks right". Every assertion
//    below is either an ALGEBRAIC IDENTITY (endpoint interpolation, the
//    de Casteljau midpoint, the t=0/t=1 tangent legs), a DEGENERATE case with a
//    known exact answer (a straight-line span), or a MEASURED error bound
//    checked against an INDEPENDENT dense sampling — not against the same
//    formula that produced the polyline.

import { describe, expect, it } from 'vitest';
import {
  catmullRomToCubicBezierChainXZ,
  cubicBezierPointXZ,
  cubicBezierSpanCount,
  cubicBezierTangentXZ,
  isCubicBezierChainLength,
  MAX_BEZIER_SEGMENTS,
  sampleCubicBezierChainXZ,
  sampleCubicBezierXZ,
  segmentsForCubicBezier,
  type Pt2,
} from '../src/index.js';

const P0: Pt2 = [0, 0];
const P1: Pt2 = [0, 1];
const P2: Pt2 = [1, 1];
const P3: Pt2 = [1, 0];

/** Distance from a point to the polyline `poly` — the INDEPENDENT measuring
 *  stick for the chord-tolerance claim. Written out here rather than imported
 *  so the bound is not checked with a function the subject also uses. */
function distanceToPolyline(p: Pt2, poly: ReadonlyArray<Pt2>): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!;
    const b = poly[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lenSq = dx * dx + dz * dz;
    let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
    if (d < best) best = d;
  }
  return best;
}

describe('cubicBezierPointXZ — algebraic identities', () => {
  it('interpolates both endpoints exactly (t=0 → P0, t=1 → P3)', () => {
    expect(cubicBezierPointXZ(P0, P1, P2, P3, 0)).toEqual([0, 0]);
    expect(cubicBezierPointXZ(P0, P1, P2, P3, 1)).toEqual([1, 0]);
  });

  it('the t=0.5 point equals the de Casteljau midpoint (P0+3P1+3P2+P3)/8', () => {
    const mid = cubicBezierPointXZ(P0, P1, P2, P3, 0.5);
    const ex = (P0[0] + 3 * P1[0] + 3 * P2[0] + P3[0]) / 8;
    const ez = (P0[1] + 3 * P1[1] + 3 * P2[1] + P3[1]) / 8;
    expect(mid[0]).toBeCloseTo(ex, 15);
    expect(mid[1]).toBeCloseTo(ez, 15);
  });

  it('a span whose control points are collinear and evenly spaced IS the line', () => {
    const a: Pt2 = [0, 0];
    const b: Pt2 = [1, 0];
    const c: Pt2 = [2, 0];
    const d: Pt2 = [3, 0];
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const p = cubicBezierPointXZ(a, b, c, d, t);
      expect(p[0]).toBeCloseTo(3 * t, 12);
      expect(p[1]).toBeCloseTo(0, 15);
    }
  });
});

describe('cubicBezierTangentXZ — the identity endpoint tangency is built on', () => {
  it('B′(0) = 3·(P1−P0) and B′(1) = 3·(P3−P2)', () => {
    const t0 = cubicBezierTangentXZ(P0, P1, P2, P3, 0);
    expect(t0[0]).toBeCloseTo(3 * (P1[0] - P0[0]), 15);
    expect(t0[1]).toBeCloseTo(3 * (P1[1] - P0[1]), 15);
    const t1 = cubicBezierTangentXZ(P0, P1, P2, P3, 1);
    expect(t1[0]).toBeCloseTo(3 * (P3[0] - P2[0]), 15);
    expect(t1[1]).toBeCloseTo(3 * (P3[1] - P2[1]), 15);
  });

  it('so the start tangent DIRECTION is exactly the first control leg', () => {
    // This is what `parallel(line, splineStartLeg)` expresses. If this identity
    // ever failed, the tangency constraint would be a decoy.
    const t0 = cubicBezierTangentXZ(P0, P1, P2, P3, 0);
    const leg: Pt2 = [P1[0] - P0[0], P1[1] - P0[1]];
    const cross = t0[0] * leg[1] - t0[1] * leg[0];
    expect(Math.abs(cross)).toBeLessThan(1e-15);
  });
});

describe('segmentsForCubicBezier — the chord bound, measured independently', () => {
  it('a straight span costs exactly 1 segment, at any tolerance', () => {
    const a: Pt2 = [0, 0];
    const b: Pt2 = [1, 0];
    const c: Pt2 = [2, 0];
    const d: Pt2 = [3, 0];
    expect(segmentsForCubicBezier(a, b, c, d, 1e-6)).toBe(1);
  });

  it('the sampled polyline holds a 1 mm tolerance, checked against 4096 independent samples', () => {
    const tol = 0.001;
    const n = segmentsForCubicBezier(P0, P1, P2, P3, tol);
    const poly = sampleCubicBezierXZ(P0, P1, P2, P3, n);
    let worst = 0;
    for (let i = 0; i <= 4096; i++) {
      const p = cubicBezierPointXZ(P0, P1, P2, P3, i / 4096);
      const d = distanceToPolyline(p, poly);
      if (d > worst) worst = d;
    }
    expect(worst).toBeLessThanOrEqual(tol);
  });

  it('is deterministic and pure in its inputs — same inputs, same count, twice', () => {
    const a = segmentsForCubicBezier(P0, P1, P2, P3, 0.001);
    const b = segmentsForCubicBezier(P0, P1, P2, P3, 0.001);
    expect(a).toBe(b);
  });

  it('clamps rather than diverging on a non-positive tolerance', () => {
    expect(segmentsForCubicBezier(P0, P1, P2, P3, 0)).toBe(MAX_BEZIER_SEGMENTS);
  });
});

describe('chain arithmetic', () => {
  it('accepts 3k+1 control points and rejects everything else', () => {
    expect([4, 7, 10, 13].map(isCubicBezierChainLength)).toEqual([true, true, true, true]);
    expect([0, 1, 2, 3, 5, 6, 8, 9].map(isCubicBezierChainLength)).toEqual([
      false, false, false, false, false, false, false, false,
    ]);
    expect(cubicBezierSpanCount(10)).toBe(3);
    expect(cubicBezierSpanCount(9)).toBe(0);
  });

  it('REFUSES an invalid chain length rather than guessing a control point', () => {
    expect(() => sampleCubicBezierChainXZ([P0, P1, P2])).toThrow(/3k\+1 control points/);
  });

  it('emits the shared join vertex once, and interpolates both chain ends', () => {
    const chain: Pt2[] = [
      [0, 0], [0, 1], [1, 1], [1, 0],
      [1, -1], [2, -1], [2, 0],
    ];
    const poly = sampleCubicBezierChainXZ(chain, 0.01);
    expect(poly[0]).toEqual([0, 0]);
    expect(poly[poly.length - 1]![0]).toBeCloseTo(2, 12);
    expect(poly[poly.length - 1]![1]).toBeCloseTo(0, 12);
    // No duplicated join: the shared point [1,0] appears exactly once.
    const joins = poly.filter((p) => Math.abs(p[0] - 1) < 1e-12 && Math.abs(p[1] - 0) < 1e-12);
    expect(joins).toHaveLength(1);
  });
});

describe('catmullRomToCubicBezierChainXZ — a CONVERSION, not a second curve', () => {
  it('produces a valid chain of 3(n−1)+1 control points', () => {
    const through: Pt2[] = [[0, 0], [1, 2], [3, 1], [4, 3]];
    const chain = catmullRomToCubicBezierChainXZ(through);
    expect(chain).toHaveLength(10);
    expect(isCubicBezierChainLength(chain.length)).toBe(true);
  });

  it('the resulting curve PASSES THROUGH every authored point', () => {
    const through: Pt2[] = [[0, 0], [1, 2], [3, 1], [4, 3]];
    const chain = catmullRomToCubicBezierChainXZ(through);
    for (let i = 0; i < through.length; i++) {
      const cp = chain[i * 3]!;
      expect(cp[0]).toBeCloseTo(through[i]![0], 12);
      expect(cp[1]).toBeCloseTo(through[i]![1], 12);
    }
  });

  it('two through-points give the straight segment between them', () => {
    const chain = catmullRomToCubicBezierChainXZ([[0, 0], [3, 0]]);
    const poly = sampleCubicBezierChainXZ(chain, 0.001);
    for (const p of poly) expect(Math.abs(p[1])).toBeLessThan(1e-12);
  });

  it('REFUSES a single point rather than inventing a curve from it', () => {
    expect(() => catmullRomToCubicBezierChainXZ([[0, 0]])).toThrow(/at least 2 through-points/);
  });
});
