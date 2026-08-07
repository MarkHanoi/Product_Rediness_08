/**
 * §ARC-DENSITY — unit tests for THE ONE curved-wall chord-density authority.
 *
 * The founder's "not organic" roof-by-region (2026-08-07, second half of the
 * §FIX-REGION-RING-PRETRIM-FRAME report): the traced ring was CORRECT but
 * tessellated at a curvature-blind chord count (schema default 16 ⇒ ~15 mm
 * mid-chord departure on a 10 m-scale arc). Density is now solved from the
 * arc's curvature against a sagitta target, with two bounds that must be LOUD
 * when they bite (ADR-0299 — no silent truncation).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeArcDensity,
  resolveArcSegmentCount,
  arcChordSagittaBound,
  ARC_SAGITTA_TARGET_M,
  ARC_MAX_SEGMENTS,
  type TessPoint,
} from '../curvedWallTessellation';

// ── Numeric reference: dense-sample the Bézier and measure polyline departure ──
function bez(p0: TessPoint, c: TessPoint, p1: TessPoint, t: number): TessPoint {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    z: mt * mt * p0.z + 2 * mt * t * c.z + t * t * p1.z,
  };
}
function distToSeg(p: TessPoint, a: TessPoint, b: TessPoint): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}
function measuredSagitta(p0: TessPoint, c: TessPoint, p1: TessPoint, n: number): number {
  const poly: TessPoint[] = [];
  for (let i = 0; i <= n; i++) poly.push(bez(p0, c, p1, i / n));
  let worst = 0;
  for (let i = 0; i <= 2048; i++) {
    const p = bez(p0, c, p1, i / 2048);
    let best = Infinity;
    for (let s = 0; s + 1 < poly.length; s++) best = Math.min(best, distToSeg(p, poly[s]!, poly[s + 1]!));
    worst = Math.max(worst, best);
  }
  return worst;
}

// The founder's shape class: 10 m chord, 2.5 m bulge (|P0−2C+P1| = 10 m).
const A: TessPoint = { x: 0, z: 0 };
const B: TessPoint = { x: 10, z: 0 };
const C: TessPoint = { x: 5, z: -5 };

afterEach(() => vi.restoreAllMocks());

describe('arcChordSagittaBound — the closed form is the real number', () => {
  it('matches dense numeric measurement within 2% on the founder arc', () => {
    for (const n of [8, 16, 32]) {
      const bound = arcChordSagittaBound(A, B, C, n);
      const measured = measuredSagitta(A, C, B, n);
      expect(measured).toBeLessThanOrEqual(bound * 1.001); // it is an upper bound…
      expect(measured).toBeGreaterThan(bound * 0.98);      // …and a TIGHT one
    }
  });

  it('documents the defect magnitude: schema-default 16 chords ≈ 9.8mm on a 10m arc', () => {
    expect(arcChordSagittaBound(A, B, C, 16)).toBeCloseTo(0.00977, 4);
  });
});

describe('computeArcDensity — sagitta-target solve', () => {
  it('achieves the default target on the founder arc (and beats the "not organic" 15mm residual)', () => {
    const d = computeArcDensity({ start: A, end: B, control: C });
    expect(d.boundedBy).toBe('none');
    expect(d.achievedSagittaBound).toBeLessThanOrEqual(ARC_SAGITTA_TARGET_M);
    expect(d.segments).toBe(23); // ⌈√(10 / (4·0.005))⌉
    expect(measuredSagitta(A, C, B, d.segments)).toBeLessThanOrEqual(ARC_SAGITTA_TARGET_M);
  });

  it('honours a user-authored `segments` as a FLOOR, never a ceiling', () => {
    const d = computeArcDensity({ start: A, end: B, control: C, requested: 40 });
    expect(d.segments).toBe(40);
    const raised = computeArcDensity({ start: A, end: B, control: C, requested: 8 });
    expect(raised.segments).toBe(raised.requiredForTarget); // 8 is coarser than the target needs
  });

  it('a straight-ish arc (control on the chord) needs only the minimum 2 chords', () => {
    const d = computeArcDensity({ start: A, end: B, control: { x: 5, z: 0 } });
    expect(d.requiredForTarget).toBe(2);
    expect(d.segments).toBe(2);
  });

  it('ceiling bound: a pathological arc cannot explode the triangle budget', () => {
    const d = computeArcDensity({ start: A, end: B, control: { x: 5, z: -200 } });
    expect(d.segments).toBe(ARC_MAX_SEGMENTS);
    expect(d.boundedBy).toBe('ceiling');
    expect(d.requiredForTarget).toBeGreaterThan(ARC_MAX_SEGMENTS);
  });

  it('min-chord bound: density never drops chords below the consumer weld radius', () => {
    // 1 m fillet arc with a large weld radius: the survival cap must win.
    const d = computeArcDensity({
      start: { x: 0, z: 0 }, end: { x: 1, z: 0 }, control: { x: 0.5, z: -0.4 },
      sagittaTarget: 0.0001, // demand absurd smoothness…
      minChordLength: 0.225, // …but the loop-builder weld radius forbids it
    });
    expect(d.boundedBy).toBe('min-chord');
    // arcLen ≈ 1.14 m ⇒ at most ⌊1.14/0.225⌋ = 5 chords survive the weld.
    expect(d.segments).toBeLessThanOrEqual(5);
    expect(d.segments).toBeGreaterThanOrEqual(2);
  });
});

describe('resolveArcSegmentCount — a bound that bites is LOUD (ADR-0299)', () => {
  it('warns once per (tag, bound) and stays quiet when no bound bites', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resolveArcSegmentCount({ start: A, end: B, control: C, tag: 'test-quiet' });
    expect(warn).not.toHaveBeenCalled();

    const args = { start: A, end: B, control: { x: 5, z: -200 }, tag: 'test-ceiling-bite' };
    const n1 = resolveArcSegmentCount(args);
    expect(n1).toBe(ARC_MAX_SEGMENTS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('§ARC-DENSITY');
    expect(String(warn.mock.calls[0]![0])).toContain('test-ceiling-bite');

    // Same tag + same bound again: throttled (a rebuild loop must not flood).
    resolveArcSegmentCount(args);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
