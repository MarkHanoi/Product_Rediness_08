/**
 * ORACLE FIXTURE for §C73-P2S-CANONICAL — the point-to-segment-distance family
 * (C73 §3.1). Counting gates are blind to correctness by design
 * (`check-predicate-canonical.ts` header, §5.4a); this file is the other half.
 *
 * Every case below is an answer known WITHOUT running the implementation —
 * a 3-4-5 triangle, an axis-aligned drop, an endpoint. The point of an oracle
 * is that it is not the code's own output written down.
 *
 * The DEGENERATE cases are the ones that matter most: they are where the 59
 * rivals disagreed fourteen ways, and where 12 of them returned NaN.
 */
import { describe, it, expect } from 'vitest';
import {
  projectParamOnSegment,
  closestPointOnSegment,
  distancePointToSegment,
  distanceSqPointToSegment,
  distancePointToSegmentXZ,
  distancePointToRing,
} from '../src/pure/pointToSegment.js';

describe('§C73-P2S-CANONICAL — known answers', () => {
  it('perpendicular drop onto the interior of a segment', () => {
    // segment (0,0)→(10,0); point (3,4) ⇒ foot at (3,0), distance exactly 4.
    expect(projectParamOnSegment(3, 4, 0, 0, 10, 0)).toBe(0.3);
    expect(distancePointToSegment(3, 4, 0, 0, 10, 0)).toBe(4);
    expect(closestPointOnSegment(3, 4, 0, 0, 10, 0)).toEqual({ x: 3, y: 0 });
  });

  it('a point beyond an endpoint reports the distance to THAT ENDPOINT, not to the line', () => {
    // The unclamped point-to-LINE answer here is 4 (the perpendicular).
    // The point-to-SEGMENT answer is 5 (the 3-4-5 hypotenuse to the endpoint).
    // This single case is the whole difference between the two families.
    expect(projectParamOnSegment(13, 4, 0, 0, 10, 0)).toBe(1);
    expect(distancePointToSegment(13, 4, 0, 0, 10, 0)).toBe(5);
    expect(projectParamOnSegment(-3, 4, 0, 0, 10, 0)).toBe(0);
    expect(distancePointToSegment(-3, 4, 0, 0, 10, 0)).toBe(5);
  });

  it('a point ON the segment reads distance 0', () => {
    expect(distancePointToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
    expect(distancePointToSegment(0, 0, 0, 0, 10, 0)).toBe(0);
    expect(distancePointToSegment(10, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('squared distance is the un-rooted primitive, exactly', () => {
    expect(distanceSqPointToSegment(3, 4, 0, 0, 10, 0)).toBe(16);
    expect(distanceSqPointToSegment(13, 4, 0, 0, 10, 0)).toBe(25);
  });

  it('endpoint order does not change the answer', () => {
    const fwd = distancePointToSegment(3, 4, 0, 0, 10, 0);
    const rev = distancePointToSegment(3, 4, 10, 0, 0, 0);
    expect(rev).toBe(fwd);
  });

  it('the XZ wrapper is the same body on the plan convention', () => {
    expect(distancePointToSegmentXZ({ x: 3, z: 4 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(4);
  });
});

describe('§C73-P2S-CANONICAL — the DEGENERATE segment (decision 1 in the header)', () => {
  it('a zero-length segment is the POINT a, and the distance is |p − a| — the exact answer', () => {
    // 3-4-5 again, so the expected value is known without running anything.
    expect(distancePointToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
    expect(projectParamOnSegment(3, 4, 0, 0, 0, 0)).toBe(0);
    expect(closestPointOnSegment(3, 4, 0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('NEVER returns NaN on a degenerate segment — the defect 12 unguarded rivals carry', () => {
    // The unguarded rival arithmetic is `Math.max(0, Math.min(1, 0/0))` = NaN,
    // and NaN propagates into `dist < tol` as a silent FALSE — a missed hit
    // that reads exactly like a clean miss. Asserted directly.
    const rivalUnguarded = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    expect(Number.isNaN(rivalUnguarded(3, 4, 0, 0, 0, 0))).toBe(true);   // the rival
    expect(Number.isNaN(distancePointToSegment(3, 4, 0, 0, 0, 0))).toBe(false); // the canonical
    expect(distancePointToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('a point coincident with a degenerate segment reads 0, not NaN', () => {
    expect(distancePointToSegment(7, 7, 7, 7, 7, 7)).toBe(0);
  });

  it('an EXTREMELY short but nonzero segment is still projected onto, not snapped to its start', () => {
    // lenSq = 1e-20 here, below EVERY rival epsilon band in the tree. The
    // canonical still answers exactly; the difference from a banded rival is
    // bounded by the segment length itself (1e-10), which is why the exact
    // guard is not a behaviour change at the scales those bands care about.
    const d = distancePointToSegment(1e-10, 1, 0, 0, 1e-10, 0);
    expect(d).toBeCloseTo(1, 12);
    expect(projectParamOnSegment(1e-10, 1, 0, 0, 1e-10, 0)).toBe(1);
  });
});

describe('§C73-P2S-CANONICAL — the ring form', () => {
  it('distance to the nearest edge of a unit square, closing edge included', () => {
    const sq = [[0, 0], [4, 0], [4, 4], [0, 4]] as const;
    const xAt = (i: number): number => sq[i]![0];
    const yAt = (i: number): number => sq[i]![1];
    // (2,1) is 1 above the bottom edge — nearest of all four.
    expect(distancePointToRing(2, 1, 4, xAt, yAt)).toBe(1);
    // (-3, 2) is 3 left of the CLOSING edge (0,4)→(0,0); if the closing edge
    // were dropped the answer would be 5 (to the corner), so this pins it.
    expect(distancePointToRing(-3, 2, 4, xAt, yAt)).toBe(3);
  });

  it('fewer than 2 vertices has no edge and reads Infinity, not 0', () => {
    // 0 would read as "touching" — failure masquerading as a value (C73 §4.3).
    expect(distancePointToRing(1, 1, 1, () => 0, () => 0)).toBe(Infinity);
    expect(distancePointToRing(1, 1, 0, () => 0, () => 0)).toBe(Infinity);
  });
});

describe('§C73-P2S-CANONICAL — the four rival CLAMP spellings agree (decision 3)', () => {
  it('all four spellings compute the same t for every sampled input', () => {
    const raw = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
      const dx = bx - ax, dy = by - ay;
      return ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    };
    for (let px = -5; px <= 15; px += 1.25) {
      for (let py = -3; py <= 3; py += 0.75) {
        const t = raw(px, py, 0, 0, 10, 0);
        const maxMin = Math.max(0, Math.min(1, t));
        const minMax = Math.min(1, Math.max(0, t));
        const ternary = t < 0 ? 0 : t > 1 ? 1 : t;
        let ifAssign = t;
        if (ifAssign < 0) ifAssign = 0; else if (ifAssign > 1) ifAssign = 1;
        const canonical = projectParamOnSegment(px, py, 0, 0, 10, 0);
        expect(maxMin).toBe(canonical);
        expect(minMax).toBe(canonical);
        expect(ternary).toBe(canonical);
        expect(ifAssign).toBe(canonical);
      }
    }
  });
});
