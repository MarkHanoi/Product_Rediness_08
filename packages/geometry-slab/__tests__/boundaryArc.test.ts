import { describe, it, expect } from 'vitest';
import {
  bezierControlFromMidpoint,
  tessellateArcSegment,
  arcSegmentThroughMidpoint,
  BOUNDARY_ARC_SEGMENTS,
} from '../src/boundaryArc';

/**
 * §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06) — the ONE arc model for curved boundary
 * drawing (floors / ceilings / slabs). These tests pin it to the WALL tool's arc
 * semantics so the two can never drift:
 *   • control = 2·M − 0.5·(S + E)  (WallPlanToolHandler._bezierControl)
 *   • sampling p(t) = (1−t)²·S + 2(1−t)t·C + t²·E at 16 segments (PathResolver).
 */
describe('boundaryArc — the shared wall-identical arc model', () => {
  const S = { x: 0, z: 0 };
  const E = { x: 4, z: 0 };
  const M = { x: 2, z: 1 }; // user-clicked arc midpoint (bulge)

  it('control point makes the Bézier pass through the clicked midpoint at t=0.5', () => {
    const c = bezierControlFromMidpoint(S, M, E);
    // Wall formula: C = 2·M − 0.5·(S+E) = (4−2, 2−0) = (2, 2)
    expect(c.x).toBeCloseTo(2, 12);
    expect(c.z).toBeCloseTo(2, 12);
    // p(0.5) = 0.25·S + 0.5·C + 0.25·E must equal M.
    const px = 0.25 * S.x + 0.5 * c.x + 0.25 * E.x;
    const pz = 0.25 * S.z + 0.5 * c.z + 0.25 * E.z;
    expect(px).toBeCloseTo(M.x, 12);
    expect(pz).toBeCloseTo(M.z, 12);
  });

  it('tessellation excludes the start, ends exactly at the end, default 16 segments', () => {
    const c = bezierControlFromMidpoint(S, M, E);
    const run = tessellateArcSegment(S, c, E);
    expect(run).toHaveLength(BOUNDARY_ARC_SEGMENTS); // n points for n segments, start excluded
    expect(run[0]!.x).not.toBeCloseTo(S.x, 6);       // start NOT duplicated
    expect(run[run.length - 1]!.x).toBeCloseTo(E.x, 12);
    expect(run[run.length - 1]!.z).toBeCloseTo(E.z, 12);
    // The midpoint sample (t=0.5 → index 7 of 16) is the clicked through-point.
    const mid = run[BOUNDARY_ARC_SEGMENTS / 2 - 1]!;
    expect(mid.x).toBeCloseTo(M.x, 12);
    expect(mid.z).toBeCloseTo(M.z, 12);
  });

  it('matches THREE.QuadraticBezierCurve3 sampling exactly (the room-detection tessellation)', () => {
    const c = bezierControlFromMidpoint(S, M, E);
    const run = tessellateArcSegment(S, c, E, 16);
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
      expect(run[i - 1]!.x).toBeCloseTo(a * S.x + b * c.x + d * E.x, 12);
      expect(run[i - 1]!.z).toBeCloseTo(a * S.z + b * c.z + d * E.z, 12);
    }
  });

  it('arcSegmentThroughMidpoint composes the two (the vertex run a curved click appends)', () => {
    const composed = arcSegmentThroughMidpoint(S, M, E);
    const manual = tessellateArcSegment(S, bezierControlFromMidpoint(S, M, E), E);
    expect(composed).toEqual(manual);
  });

  it('degenerate segment count falls back to the default, is clamped, never throws', () => {
    expect(arcSegmentThroughMidpoint(S, M, E, Number.NaN)).toHaveLength(BOUNDARY_ARC_SEGMENTS);
    expect(arcSegmentThroughMidpoint(S, M, E, 0)).toHaveLength(BOUNDARY_ARC_SEGMENTS);
    expect(arcSegmentThroughMidpoint(S, M, E, 1000)).toHaveLength(256);
  });
});
