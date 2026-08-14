// §C73-SEGSEG-CANONICAL — ORACLE FIXTURES at known answers (C73 §5.4a / §6),
// plus the ONE-FAMILY PROOF, EXECUTED.
//
// `check-predicate-canonical.ts` counts implementations; it is deliberately
// blind to whether the surviving body is CORRECT. This file is the other half
// of the family's exit condition, the way point-in-polygon is pinned by
// `pointInPolygon.oracle.test.ts` and polygon offset at the 300 mm eave.
//
// ── The one-family question, answered by execution ───────────────────────────
// The register's blocker for this family was: "prove the parametric (t/u) form
// and the cross-product (four-orientation straddle) form are ONE family before
// a single count over both means anything." The algebraic argument lives in the
// canonical file's header (d1 = −u·D, d2 = (1−u)·D, d3 = t·D, d4 = (t−1)·D —
// both forms are decision procedures over the same four scalars). This file
// EXECUTES that argument: two REFERENCE RIVALS are re-implemented below,
// verbatim in shape —
//
//   • REF_CROSS   — the four-cross-product straddle form
//                   (`polygonOffset.findSelfIntersection`'s body, pre-collapse)
//   • REF_PARAM   — the eps-banded parametric t/u form
//                   (`ringSimplicity.ringSegmentsProperlyCross`'s body)
//
// and both are driven against the canonical body over an exhaustive grid of
// degenerate cases (collinear, touching endpoints, parallel, zero-length,
// proper crossings) asserting IDENTICAL verdicts wherever the two live
// conventions agree, with every divergence pinned to a NAMED boundary-set case
// (endpoint touches and the near-parallel refusal band) rather than left as an
// unexplained mismatch. Identical verdicts on the same scalars = one family.

import { describe, expect, it } from 'vitest';
import {
  intersectSegments2D,
  segmentsCrossHalfOpen2D,
  segmentsProperlyCross2D,
} from '../src/pure/segmentIntersection.js';
import { EPSILON_ZERO } from '../src/tolerance.js';

// ── Reference rival bodies (shapes measured in the census, re-implemented) ───

/** The cross-product straddle form — `findSelfIntersection`'s body, verbatim shape. */
function refCrossForm(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(ax, ay, bx, by, cx, cy);
  const d2 = cross(ax, ay, bx, by, dx, dy);
  const d3 = cross(cx, cy, dx, dy, ax, ay);
  const d4 = cross(cx, cy, dx, dy, bx, by);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

/** The eps-banded parametric form — `ringSegmentsProperlyCross`'s body, verbatim shape. */
function refParamForm(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * d2y - qy * d2x) / cross;
  const u = (qx * d1y - qy * d1x) / cross;
  return t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10;
}

describe('segmentIntersection — oracle at known answers', () => {
  it('X-crossing: the diagonals of the unit-2 square cross at (1,1), t = u = 0.5', () => {
    const hit = intersectSegments2D(0, 0, 2, 2, 0, 2, 2, 0);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0.5);
    expect(hit!.u).toBe(0.5);
    expect(hit!.x).toBe(1);
    expect(hit!.y).toBe(1);
    expect(segmentsProperlyCross2D(0, 0, 2, 2, 0, 2, 2, 0)).toBe(true);
    expect(segmentsCrossHalfOpen2D(0, 0, 2, 2, 0, 2, 2, 0)).toBe(true);
  });

  it('asymmetric known answer: (0,0)→(4,0) × (1,-1)→(1,3) hits (1,0), t = 0.25, u = 0.25', () => {
    const hit = intersectSegments2D(0, 0, 4, 0, 1, -1, 1, 3);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0.25);
    expect(hit!.u).toBe(0.25);
    expect(hit!.x).toBe(1);
    expect(hit!.y).toBe(0);
  });

  it('disjoint segments whose INFINITE lines cross: refused (t or u outside [0,1])', () => {
    // Lines cross at (5,5); both segments end well before it.
    expect(intersectSegments2D(0, 0, 1, 1, 0, 10, 1, 9)).toBeNull();
    expect(segmentsProperlyCross2D(0, 0, 1, 1, 0, 10, 1, 9)).toBe(false);
    expect(segmentsCrossHalfOpen2D(0, 0, 1, 1, 0, 10, 1, 9)).toBe(false);
  });

  it('parallel offset segments: no intersection under any view', () => {
    expect(intersectSegments2D(0, 0, 4, 0, 0, 1, 4, 1)).toBeNull();
    expect(segmentsProperlyCross2D(0, 0, 4, 0, 0, 1, 4, 1)).toBe(false);
    expect(segmentsCrossHalfOpen2D(0, 0, 4, 0, 0, 1, 4, 1)).toBe(false);
  });

  it('collinear overlap: parametric REFUSES (null, D = 0 — no unique point exists); both booleans read false', () => {
    // (0,0)→(4,0) and (2,0)→(6,0) share the sub-segment [2,4]×{0}. There is no
    // single intersection point, so a body that returned one would be inventing
    // geometry. Refusal is the correct answer, not a missing feature
    // (§CONTEXT-DATA-HONESTY). Callers needing overlap handling compose an
    // explicit collinear branch at the call site (ringValidation does).
    expect(intersectSegments2D(0, 0, 4, 0, 2, 0, 6, 0)).toBeNull();
    expect(segmentsProperlyCross2D(0, 0, 4, 0, 2, 0, 6, 0)).toBe(false);
    expect(segmentsCrossHalfOpen2D(0, 0, 4, 0, 2, 0, 6, 0)).toBe(false);
  });

  it('collinear disjoint: no intersection under any view', () => {
    expect(intersectSegments2D(0, 0, 1, 0, 2, 0, 3, 0)).toBeNull();
    expect(segmentsProperlyCross2D(0, 0, 1, 0, 2, 0, 3, 0)).toBe(false);
    expect(segmentsCrossHalfOpen2D(0, 0, 1, 0, 2, 0, 3, 0)).toBe(false);
  });

  it('zero-length segment: never crosses anything', () => {
    expect(intersectSegments2D(1, 1, 1, 1, 0, 0, 2, 2)).toBeNull();
    expect(segmentsProperlyCross2D(1, 1, 1, 1, 0, 0, 2, 2)).toBe(false);
    expect(segmentsCrossHalfOpen2D(1, 1, 1, 1, 0, 0, 2, 2)).toBe(false);
  });

  // ── The decided boundary semantics (§3.7), pinned exactly ──────────────────

  it('T-touch (endpoint of one segment ON the interior of the other): the three views answer their three questions', () => {
    // cd's endpoint c = (1,0) lies on ab's interior. u = 0 exactly.
    // • parametric closed [0,1]: this IS an intersection — t = 0.5, u = 0.
    const hit = intersectSegments2D(0, 0, 2, 0, 1, 0, 1, 1);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0.5);
    expect(hit!.u).toBe(0);
    // • strict interior: a touch is NOT a proper crossing.
    expect(segmentsProperlyCross2D(0, 0, 2, 0, 1, 0, 1, 1)).toBe(false);
    // • half-open (the XOR encoding `(d>0)!==(d>0)`, zero on the ≤ side): this
    //   touch READS AS A CROSSING — the live polygonOffset convention, pinned
    //   here so a "fix" of it is seen as the behaviour change it would be.
    expect(segmentsCrossHalfOpen2D(0, 0, 2, 0, 1, 0, 1, 1)).toBe(true);
  });

  it('shared endpoint (two segments of a chain): closed hit at t=1/u=0, never a proper crossing', () => {
    const hit = intersectSegments2D(0, 0, 1, 1, 1, 1, 2, 0);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(1);
    expect(hit!.u).toBe(0);
    expect(segmentsProperlyCross2D(0, 0, 1, 1, 1, 1, 2, 0)).toBe(false);
  });

  it('near-parallel at the declared tolerance: parametric refuses BELOW EPSILON_ZERO, answers ABOVE it', () => {
    // Two nearly-horizontal segments genuinely crossing at (1, 0). The
    // determinant D = -4e-10 sits below EPSILON_ZERO (1e-9): the parametric
    // view REFUSES (no trustworthy point), while the exact sign tests still
    // see the crossing. This divergence is the declared-tolerance refusal
    // band, stated rather than hidden — and the guard is EPSILON_ZERO from the
    // kernel's tolerance module, never a per-call-site literal (C73 §2.4).
    expect(intersectSegments2D(0, 0, 2, 0, 0, 1e-10, 2, -1e-10)).toBeNull();
    expect(segmentsProperlyCross2D(0, 0, 2, 0, 0, 1e-10, 2, -1e-10)).toBe(true);
    // Same construction with D an order of magnitude above the tolerance: answered.
    const hit = intersectSegments2D(0, 0, 2, 0, 0, 1e-8, 2, -1e-8);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 12);
    expect(hit!.x).toBeCloseTo(1, 12);
    // Guard value is the DECLARED one — this line goes red if either drifts.
    expect(EPSILON_ZERO).toBe(1e-9);
  });

  it('consistency law: a closed-hit with strictly interior params ⇔ a proper crossing (for non-degenerate D)', () => {
    // Sampled over a coordinate grid rich in degenerate configurations
    // (collinear triples, shared endpoints, axis-aligned overlaps).
    const coords = [0, 1, 2, 3];
    const pts: Array<[number, number]> = [];
    for (const x of coords) for (const y of coords) pts.push([x, y]);
    let checked = 0;
    for (let i = 0; i < pts.length; i += 3) {
      for (let j = 0; j < pts.length; j += 2) {
        for (let k = 1; k < pts.length; k += 3) {
          for (let l = 0; l < pts.length; l += 2) {
            const [ax, ay] = pts[i]!; const [bx, by] = pts[j]!;
            const [cx, cy] = pts[k]!; const [dx, dy] = pts[l]!;
            const hit = intersectSegments2D(ax, ay, bx, by, cx, cy, dx, dy);
            const interiorHit = hit !== null && hit.t > 0 && hit.t < 1 && hit.u > 0 && hit.u < 1;
            const proper = segmentsProperlyCross2D(ax, ay, bx, by, cx, cy, dx, dy);
            expect(interiorHit).toBe(proper);
            // proper ⇒ half-open (strict signs imply the XOR encoding).
            if (proper) expect(segmentsCrossHalfOpen2D(ax, ay, bx, by, cx, cy, dx, dy)).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('segmentIntersection — the one-family proof, executed against both rival forms', () => {
  // The same grid sweep, now driving the two REFERENCE RIVAL bodies. Both are
  // decision procedures over the same four scalars (header identities), so
  // away from the boundary set they MUST agree with the canonical body — and
  // with each other. On the boundary set their two conventions differ in
  // exactly the ways pinned above (touches; the eps bands), so each reference
  // is compared against the canonical view that carries ITS convention.
  it('cross-product reference ≡ segmentsCrossHalfOpen2D on every grid case (identical form, identical verdicts)', () => {
    const coords = [0, 0.5, 1, 2];
    const pts: Array<[number, number]> = [];
    for (const x of coords) for (const y of coords) pts.push([x, y]);
    for (let i = 0; i < pts.length; i += 2) {
      for (let j = 1; j < pts.length; j += 2) {
        for (let k = 0; k < pts.length; k += 3) {
          for (let l = 1; l < pts.length; l += 3) {
            const [ax, ay] = pts[i]!; const [bx, by] = pts[j]!;
            const [cx, cy] = pts[k]!; const [dx, dy] = pts[l]!;
            expect(segmentsCrossHalfOpen2D(ax, ay, bx, by, cx, cy, dx, dy))
              .toBe(refCrossForm(ax, ay, bx, by, cx, cy, dx, dy));
          }
        }
      }
    }
  });

  it('parametric reference ≡ segmentsProperlyCross2D on every grid case whose params sit outside the 1e-10 bands', () => {
    // The reference's 1e-10 interior band and 1e-10 parallel guard are the
    // private epsilons the collapse retires. On grid coordinates every
    // non-degenerate configuration has |D| ≥ 0.25 and params at least 0.1 from
    // the band edges, so the band never bites and the two must agree exactly.
    const coords = [0, 0.5, 1, 2];
    const pts: Array<[number, number]> = [];
    for (const x of coords) for (const y of coords) pts.push([x, y]);
    for (let i = 0; i < pts.length; i += 2) {
      for (let j = 1; j < pts.length; j += 2) {
        for (let k = 0; k < pts.length; k += 3) {
          for (let l = 1; l < pts.length; l += 3) {
            const [ax, ay] = pts[i]!; const [bx, by] = pts[j]!;
            const [cx, cy] = pts[k]!; const [dx, dy] = pts[l]!;
            expect(segmentsProperlyCross2D(ax, ay, bx, by, cx, cy, dx, dy))
              .toBe(refParamForm(ax, ay, bx, by, cx, cy, dx, dy));
          }
        }
      }
    }
  });

  it('the two rival forms agree with EACH OTHER off the boundary set — one family, two spellings', () => {
    // Proper crossings and clean separations: both conventions must concur.
    const properCases: Array<[number[], boolean]> = [
      [[0, 0, 2, 2, 0, 2, 2, 0], true],   // X-cross
      [[0, 0, 4, 0, 1, -1, 1, 3], true],  // transverse
      [[0, 0, 4, 0, 0, 1, 4, 1], false],  // parallel
      [[0, 0, 1, 1, 0, 10, 1, 9], false], // disjoint, lines cross far away
      [[0, 0, 1, 0, 2, 0, 3, 0], false],  // collinear disjoint
    ];
    for (const [s, want] of properCases) {
      const [ax, ay, bx, by, cx, cy, dx, dy] = s as [number, number, number, number, number, number, number, number];
      expect(refCrossForm(ax, ay, bx, by, cx, cy, dx, dy)).toBe(want);
      expect(refParamForm(ax, ay, bx, by, cx, cy, dx, dy)).toBe(want);
      expect(segmentsProperlyCross2D(ax, ay, bx, by, cx, cy, dx, dy)).toBe(want);
      expect(segmentsCrossHalfOpen2D(ax, ay, bx, by, cx, cy, dx, dy)).toBe(want);
    }
  });
});
