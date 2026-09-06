// dimension — the measurement primitive (lane CE-VIEWS-AND-MEASURE).
//
// The load-bearing assertion in this file is that a dimension on a VERTICAL
// work plane reports a real HEIGHT in millimetres. That is only true because
// `measureLinearDimension` lifts both endpoints back into world space through
// `unprojectFromView()` before measuring; a naive implementation that measured
// plane-local screen coordinates would pass a plan test and quietly report
// nonsense on every elevation.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERIOR_OFFSET_MM,
  DIM_STRING_OFFSET_MM,
  dimensionGeometry,
  formatDimensionValue,
  measureLinearDimension,
  offsetForRank,
  type DimensionId,
  type LinearDimension,
} from '../../src/measure/dimension.js';
import { createSketchDocStore } from '../../src/stores/sketchDocStore.js';
import { unprojectFromView, type SketchViewKind } from '../../src/views/viewProjection.js';
import type { EntityId } from '../../src/sketch/entities.js';

function dim(
  view: SketchViewKind,
  p1: EntityId,
  p2: EntityId,
  extra: Partial<LinearDimension> = {},
): LinearDimension {
  return {
    id: 'd1' as DimensionId,
    kind: 'linear',
    view,
    p1,
    p2,
    offsetMm: 250,
    stringRank: null,
    drivingConstraintId: null,
    ...extra,
  };
}

describe('measureLinearDimension — a dimension reads the TRUE world distance', () => {
  // Plan: the ordinary case.
  it('measures a plan dimension as a floor distance in millimetres', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(0, 0);
    const b = doc.addPoint(3000, 4000);
    const m = measureLinearDimension(doc.get(), dim('plan', a, b));
    // 3-4-5 triangle: the answer must be 5000 mm, not 3000 and not 7000.
    expect(m?.mm).toBeCloseTo(5000, 9);
  });

  // THE ELEVATION ASSERTION. A point 2400 mm up the front elevation sits at
  // plane z = -2400 (plane +z is screen-down) and must measure 2400 mm from
  // the origin — and specifically 2400 mm in WORLD Y, not world Z.
  it('measures a front-elevation dimension as a real HEIGHT (2400 mm in world Y)', () => {
    const doc = createSketchDocStore();
    const ground = doc.addPoint(0, 0);
    const head = doc.addPoint(0, -2400);
    const m = measureLinearDimension(doc.get(), dim('elevation-front', ground, head));
    expect(m?.mm).toBeCloseTo(2400, 9);

    // …and prove it is HEIGHT, by lifting the endpoint into the world.
    const world = unprojectFromView({ x: 0, z: -2400 }, 'elevation-front');
    expect(world).toEqual({ x: 0, y: 2400, z: 0 });
  });

  it('measures a side-elevation dimension as a real height too', () => {
    const doc = createSketchDocStore();
    const ground = doc.addPoint(0, 0);
    const head = doc.addPoint(0, -1800);
    expect(measureLinearDimension(doc.get(), dim('elevation-side', ground, head))?.mm)
      .toBeCloseTo(1800, 9);
  });

  // The SAME two plane coordinates measure the SAME length in every view —
  // that is the orthonormality of the basis, and it is the property that makes
  // an elevation dimension trustworthy. A skewed basis breaks HERE.
  it('reports the same length for the same plane coordinates in all three views', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(120, -60);
    const b = doc.addPoint(1120, 940);
    const lengths = (['plan', 'elevation-front', 'elevation-side'] as const).map(
      (v) => measureLinearDimension(doc.get(), dim(v, a, b))!.mm,
    );
    const expected = Math.hypot(1000, 1000);
    for (const l of lengths) expect(l).toBeCloseTo(expected, 9);
  });

  it('tracks the geometry — moving a point changes what the dimension reads', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(0, 0);
    const b = doc.addPoint(1000, 0);
    const d = dim('plan', a, b);
    expect(measureLinearDimension(doc.get(), d)?.mm).toBeCloseTo(1000, 9);
    doc.movePoints([{ pointId: b, x: 2500, z: 0 }]);
    expect(measureLinearDimension(doc.get(), d)?.mm).toBeCloseTo(2500, 9);
  });

  // §CONTEXT-DATA-HONESTY at the measurement layer.
  //
  // FAILURE != EMPTY. `0 mm` is a legitimate reading for two coincident
  // points; a dimension whose endpoint was deleted has FAILED. Collapsing the
  // two makes a broken dimension indistinguishable from a valid one.
  it('returns NULL (not 0) when an endpoint no longer exists', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(0, 0);
    const b = doc.addPoint(1000, 0);
    const d = dim('plan', a, b);
    doc.removeEntity(b);
    expect(measureLinearDimension(doc.get(), d)).toBeNull();
  });

  it('returns 0 mm — a real reading — for two coincident points', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(500, 500);
    const b = doc.addPoint(500, 500);
    expect(measureLinearDimension(doc.get(), dim('plan', a, b))?.mm).toBe(0);
  });
});

describe('dimensionGeometry — SPEC-AUTODIMENSION §12 placement', () => {
  it('offsets the dimension line perpendicular to the measured segment', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(0, 0);
    const b = doc.addPoint(1000, 0);
    const geo = dimensionGeometry(doc.get(), dim('plan', a, b, { offsetMm: 400 }))!;
    // Segment runs along +x, so the perpendicular is ±z and the offset is 400.
    expect(geo.lineA.x).toBeCloseTo(0, 9);
    expect(geo.lineB.x).toBeCloseTo(1000, 9);
    expect(Math.abs(geo.lineA.z)).toBeCloseTo(400, 9);
    expect(geo.lineA.z).toBeCloseTo(geo.lineB.z, 9);
    // §12.10 — the value sits ON the dimension line, at its midpoint.
    expect(geo.textAt.x).toBeCloseTo(500, 9);
    expect(geo.textAt.z).toBeCloseTo(geo.lineA.z, 9);
    expect(geo.mm).toBeCloseTo(1000, 9);
    // The normal is a UNIT vector — otherwise the offset is not in mm.
    expect(Math.hypot(geo.normal.x, geo.normal.z)).toBeCloseTo(1, 12);
  });

  // A degenerate segment has no perpendicular. Drawing one anyway renders a
  // NaN streak, so the geometry REFUSES instead of producing one.
  it('refuses a degenerate (coincident) segment rather than emitting NaN', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(10, 10);
    const b = doc.addPoint(10, 10);
    expect(dimensionGeometry(doc.get(), dim('plan', a, b))).toBeNull();
  });

  it('returns null for a missing endpoint, like measureLinearDimension', () => {
    const doc = createSketchDocStore();
    const a = doc.addPoint(0, 0);
    const b = doc.addPoint(1, 1);
    doc.removeEntity(a);
    expect(dimensionGeometry(doc.get(), dim('plan', a, b))).toBeNull();
  });
});

describe('SPEC-AUTODIMENSION §12.2 string offsets', () => {
  it('ranks 1/2/3 at 1200 / 800 / 400 mm, outermost first', () => {
    expect(DIM_STRING_OFFSET_MM[1]).toBe(1200);
    expect(DIM_STRING_OFFSET_MM[2]).toBe(800);
    expect(DIM_STRING_OFFSET_MM[3]).toBe(400);
    // The ordering is the standard, not the literals: outer strings sit
    // further out, which is what keeps a dimension band readable.
    expect(DIM_STRING_OFFSET_MM[1]).toBeGreaterThan(DIM_STRING_OFFSET_MM[2]);
    expect(DIM_STRING_OFFSET_MM[2]).toBeGreaterThan(DIM_STRING_OFFSET_MM[3]);
  });

  it('maps rank to offset, and null to the §12.3 interior default', () => {
    expect(offsetForRank(1)).toBe(1200);
    expect(offsetForRank(2)).toBe(800);
    expect(offsetForRank(3)).toBe(400);
    expect(offsetForRank(null)).toBe(DEFAULT_INTERIOR_OFFSET_MM);
  });
});

describe('formatDimensionValue', () => {
  it('letters whole millimetres', () => {
    expect(formatDimensionValue(2400)).toBe('2400');
    expect(formatDimensionValue(2400.4)).toBe('2400');
  });

  // A nearly-coincident pair must NOT read as `0` — that looks exactly like a
  // satisfied coincident constraint, which is a different fact.
  it('keeps a decimal below 1 mm so near-coincidence is visible', () => {
    expect(formatDimensionValue(0.4)).toBe('0.4');
    expect(formatDimensionValue(0)).toBe('0.0');
  });

  it('renders a non-finite value as an em dash rather than NaN', () => {
    expect(formatDimensionValue(Number.NaN)).toBe('—');
    expect(formatDimensionValue(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
