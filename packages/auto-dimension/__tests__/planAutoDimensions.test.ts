import { describe, it, expect } from 'vitest';
import {
  planAutoDimensions, polygonCentroid, outwardNormal, segmentsCross,
  cardinalMeasurementAxis, detectChainCoverageGaps,
} from '../src/index.js';
import type { AutoDimSnapshot, AutoDimWall } from '../src/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A 6 m × 4 m rectangle (bottom, right, top, left), clockwise. */
function rectangle(openings: AutoDimWall['openings'] = []): AutoDimSnapshot {
  return {
    walls: [
      { id: 'wall_b', a: { x: 0, z: 0 }, b: { x: 6, z: 0 }, thickness: 0.2, openings },
      { id: 'wall_r', a: { x: 6, z: 0 }, b: { x: 6, z: 4 }, thickness: 0.2, openings: [] },
      { id: 'wall_t', a: { x: 6, z: 4 }, b: { x: 0, z: 4 }, thickness: 0.2, openings: [] },
      { id: 'wall_l', a: { x: 0, z: 4 }, b: { x: 0, z: 0 }, thickness: 0.2, openings: [] },
    ],
  };
}

/** An L-plan: outer 8×6, notch cut so the footprint is an L (6 exterior sides). */
function lPlan(): AutoDimSnapshot {
  // Vertices (CCW): (0,0)(8,0)(8,3)(4,3)(4,6)(0,6)
  const v = [
    { x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 3 },
    { x: 4, z: 3 }, { x: 4, z: 6 }, { x: 0, z: 6 },
  ];
  const walls: AutoDimWall[] = v.map((p, i) => ({
    id: `wall_${i}`,
    a: p,
    b: v[(i + 1) % v.length]!,
    thickness: 0.2,
    openings: [],
  }));
  return { walls };
}

/**
 * §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147) — a NOTCHED-CORNER L whose min-X
 * extreme corner and max-X extreme corner sit at DIFFERENT z (and min-Z vs max-Z
 * at different x). This is the founder's staircase footprint: the perimeter AABB
 * corners the `overall` references are NOT collinear on the cross-axis, so a bare
 * point-to-point render would draw the corner-to-corner DIAGONAL (hypot of the
 * bbox). Vertices CCW: (2,0)(8,0)(8,6)(0,6)(0,3)(2,3) — bbox 8 × 6.
 */
function notchedCornerPlan(): AutoDimSnapshot {
  const v = [
    { x: 2, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 6 },
    { x: 0, z: 6 }, { x: 0, z: 3 }, { x: 2, z: 3 },
  ];
  const walls: AutoDimWall[] = v.map((p, i) => ({
    id: `wall_${i}`, a: p, b: v[(i + 1) % v.length]!, thickness: 0.2, openings: [],
  }));
  return { walls };
}

const OPTS = { viewId: 'view-plan-1', levelId: 'level-1' };

// A minimal anchor resolver mirroring the geometry-kernel evaluator (test-only)
// so we can assert real measured lengths from the element+anchor references.
function resolvePoint(snapshot: AutoDimSnapshot, elementId: string, anchor: string): { x: number; z: number } {
  const wall = snapshot.walls.find((w) => w.id === elementId);
  if (wall) {
    if (anchor === 'start') return wall.a;
    if (anchor === 'end') return wall.b;
    return { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
  }
  // opening — find host wall
  for (const w of snapshot.walls) {
    const op = w.openings.find((o) => o.id === elementId);
    if (!op) continue;
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const at = (d: number) => ({ x: w.a.x + ux * d, z: w.a.z + uz * d });
    if (anchor === 'left') return at(op.offset);
    if (anchor === 'right') return at(op.offset + op.width);
    return at(op.offset + op.width / 2); // center
  }
  return { x: 0, z: 0 };
}

function measured(snapshot: AutoDimSnapshot, s: { references: readonly { elementId: string; anchor: string }[]; orientation: string }): number {
  const p1 = resolvePoint(snapshot, s.references[0]!.elementId as string, s.references[0]!.anchor);
  const p2 = resolvePoint(snapshot, s.references[1]!.elementId as string, s.references[1]!.anchor);
  if (s.orientation === 'horizontal') return Math.abs(p2.x - p1.x);
  if (s.orientation === 'vertical') return Math.abs(p2.z - p1.z);
  return Math.hypot(p2.x - p1.x, p2.z - p1.z);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('planAutoDimensions — determinism (ADR-0061)', () => {
  it('same input → byte-identical output', () => {
    const a = planAutoDimensions(rectangle(), OPTS);
    const b = planAutoDimensions(rectangle(), OPTS);
    expect(JSON.stringify(a.strings)).toEqual(JSON.stringify(b.strings));
  });

  it('output is independent of wall input order', () => {
    const base = rectangle();
    const shuffled: AutoDimSnapshot = { walls: [base.walls[2]!, base.walls[0]!, base.walls[3]!, base.walls[1]!] };
    const a = planAutoDimensions(base, OPTS);
    const b = planAutoDimensions(shuffled, OPTS);
    // Same measured value multiset + same count (ids are positional, geometry identical).
    expect(a.strings.length).toBe(b.strings.length);
    const va = a.strings.map((s) => measured(base, s)).sort();
    const vb = b.strings.map((s) => measured(shuffled, s)).sort();
    expect(va).toEqual(vb);
  });
});

describe('planAutoDimensions — overall dims for a rectangle', () => {
  it('emits one horizontal (6 m) + one vertical (4 m) overall', () => {
    const snap = rectangle();
    const { strings } = planAutoDimensions(snap, OPTS);
    const overalls = strings.filter((s) => s.kind === 'overall');
    expect(overalls.length).toBe(2);
    const h = overalls.find((s) => s.orientation === 'horizontal')!;
    const v = overalls.find((s) => s.orientation === 'vertical')!;
    expect(measured(snap, h)).toBeCloseTo(6, 6);
    expect(measured(snap, v)).toBeCloseTo(4, 6);
  });

  it('every string parses the DimensionString schema and is auto-tagged', () => {
    const { strings } = planAutoDimensions(rectangle(), OPTS);
    expect(strings.length).toBeGreaterThan(0);
    for (const s of strings) {
      expect(s.isAutoGenerated).toBe(true);
      expect(s.autoMode).toBe('set-out');
      expect(s.references.length).toBeGreaterThanOrEqual(2);
      expect(s.viewId as string).toBe('view-plan-1');
    }
  });
});

describe('planAutoDimensions — exterior chain for an L-plan', () => {
  it('produces a wall chain per exterior side (6 sides) and overall AABB', () => {
    const snap = lPlan();
    const { strings, report } = planAutoDimensions(snap, OPTS);
    expect(report.coverage.runCount).toBe(6); // one run per L side
    const overalls = strings.filter((s) => s.kind === 'overall');
    // Overall = perimeter AABB extent (8 × 6), NOT a single façade.
    const h = overalls.find((s) => s.orientation === 'horizontal')!;
    const v = overalls.find((s) => s.orientation === 'vertical')!;
    expect(measured(snap, h)).toBeCloseTo(8, 6);
    expect(measured(snap, v)).toBeCloseTo(6, 6);
    expect(report.warnings.filter((w) => w.code === 'overall-mismatch').length).toBe(0);
  });
});

describe('planAutoDimensions — openings (door + window on one wall)', () => {
  const openings: AutoDimWall['openings'] = [
    { id: 'door_1', kind: 'door', offset: 2, width: 0.9 },
    { id: 'window_1', kind: 'window', offset: 4, width: 1.2 },
  ];

  it('locates + widths every opening (QA-1 clean)', () => {
    const snap = rectangle(openings);
    const { strings, report } = planAutoDimensions(snap, OPTS);
    expect(report.warnings.filter((w) => w.code === 'opening-undimensioned').length).toBe(0);
    expect(report.coverage.openingsDimensioned).toBe(2);

    // A width dim exists for the door (left→right edge = 0.9) and window (1.2).
    const widths = strings
      .filter((s) => s.references.every((r) => (r.elementId as string) === 'door_1'))
      .map((s) => measured(snap, s));
    expect(widths.some((w) => Math.abs(w - 0.9) < 1e-6)).toBe(true);

    const winWidths = strings
      .filter((s) => s.references.every((r) => (r.elementId as string) === 'window_1'))
      .map((s) => measured(snap, s));
    expect(winWidths.some((w) => Math.abs(w - 1.2) < 1e-6)).toBe(true);

    // A location dim references the door centre from a corner datum.
    const loc = strings.filter((s) =>
      s.kind === 'linear-element' &&
      s.references.some((r) => (r.elementId as string) === 'door_1' && r.anchor === 'center'));
    expect(loc.length).toBeGreaterThanOrEqual(1);
  });

  it('never dimensions the same distance twice (no duplicate ref-pairs)', () => {
    const { strings } = planAutoDimensions(rectangle(openings), OPTS);
    const keys = strings.map((s) =>
      `${s.orientation}|${[...s.references].map((r) => `${r.elementId as string}:${r.anchor}`).sort().join('|')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('skips tiny (< 0.05 m) pier segments — no degenerate dims', () => {
    // Door flush 0.02 m from the corner → the near pier is a 0.02 m sliver.
    const tiny: AutoDimWall['openings'] = [{ id: 'door_x', kind: 'door', offset: 0.02, width: 0.9 }];
    const snap = rectangle(tiny);
    const { strings } = planAutoDimensions(snap, OPTS);
    for (const s of strings) {
      expect(measured(snap, s)).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
  });
});

// ── P2 — outward-side placement + conflict/overlap resolution (L-138 P2) ────────

/** The engine's own outward-side rule (§SPIKE §8), re-derived from geometry. */
function outwardSideOf(
  snap: AutoDimSnapshot,
  centroid: { x: number; z: number },
  s: { references: readonly { elementId: string; anchor: string }[]; orientation: string },
): 1 | -1 {
  const p1 = resolvePoint(snap, s.references[0]!.elementId as string, s.references[0]!.anchor);
  const p2 = resolvePoint(snap, s.references[1]!.elementId as string, s.references[1]!.anchor);
  const anchor = s.orientation === 'horizontal' ? Math.max(p1.z, p2.z) : Math.max(p1.x, p2.x);
  const c = s.orientation === 'horizontal' ? centroid.z : centroid.x;
  return anchor >= c ? 1 : -1;
}

describe('planAutoDimensions — P2 outward-side placement', () => {
  it('every exterior dim sits on the correct OUTSIDE side (rectangle)', () => {
    const snap = rectangle();
    const centroid = polygonCentroid([
      { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 },
    ]);
    const { strings } = planAutoDimensions(snap, OPTS);
    // Signed offset encodes side: below/left = negative, above/right = positive.
    for (const s of strings) {
      expect(Math.sign(s.offsetMm)).toBe(outwardSideOf(snap, centroid, s));
    }
    // The bottom overall is below (negative), a top chain is above (positive):
    // both sides are actually used (not merely stacked outward by rank).
    const signs = new Set(strings.map((s) => Math.sign(s.offsetMm)));
    expect(signs.has(1)).toBe(true);
    expect(signs.has(-1)).toBe(true);
  });

  it('every exterior dim sits on the correct OUTSIDE side (L-plan)', () => {
    const snap = lPlan();
    const centroid = polygonCentroid([
      { x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 3 },
      { x: 4, z: 3 }, { x: 4, z: 6 }, { x: 0, z: 6 },
    ]);
    const { strings, report } = planAutoDimensions(snap, OPTS);
    for (const s of strings) {
      expect(Math.sign(s.offsetMm)).toBe(outwardSideOf(snap, centroid, s));
    }
    // A correct outward placement crosses no geometry on a rect/L plan.
    expect(report.warnings.filter((w) => w.code === 'geometry-crossing').length).toBe(0);
  });
});

describe('planAutoDimensions — P2 conflict resolution', () => {
  const openings: AutoDimWall['openings'] = [
    { id: 'door_1', kind: 'door', offset: 2, width: 0.9 },
    { id: 'window_1', kind: 'window', offset: 4, width: 1.2 },
  ];

  it('no duplicate string survives resolution (QA-4) and every opening is located AND sized (DI-2)', () => {
    const { strings, report } = planAutoDimensions(rectangle(openings), OPTS);
    // No structural duplicates flagged.
    for (const code of ['duplicate-string', 'opening-unsized', 'opening-unlocated', 'opening-undimensioned'] as const) {
      expect(report.warnings.filter((w) => w.code === code).length).toBe(0);
    }
    // And no two strings share (orientation, axis-span) — checked directly on output.
    const keys = strings.map((s) =>
      `${s.orientation}|${[...s.references].map((r) => `${r.elementId as string}:${r.anchor}`).sort().join('|')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('bumps an overlapping label to a new stack row — deterministically', () => {
    // With a small label footprint the two location dims share a row (same |offset|).
    const small = planAutoDimensions(rectangle(openings), { ...OPTS, labelCharWidthM: 0.15 });
    const smallLocs = small.strings.filter((s) =>
      s.kind === 'linear-element' && s.references.some((x) => x.anchor === 'center'));
    const smallOffsets = smallLocs.map((s) => Math.abs(s.offsetMm));
    expect(new Set(smallOffsets).size).toBe(1); // same row

    // With a large label footprint they overlap → the lower-priority one bumps out.
    const bigA = planAutoDimensions(rectangle(openings), { ...OPTS, labelCharWidthM: 1.5 });
    const bigB = planAutoDimensions(rectangle(openings), { ...OPTS, labelCharWidthM: 1.5 });
    // Determinism preserved through the bump (byte-identical).
    expect(JSON.stringify(bigA.strings)).toEqual(JSON.stringify(bigB.strings));
    const bigLocs = bigA.strings.filter((s) =>
      s.kind === 'linear-element' && s.references.some((x) => x.anchor === 'center'));
    const bigOffsets = bigLocs.map((s) => Math.abs(s.offsetMm));
    expect(new Set(bigOffsets).size).toBeGreaterThan(1); // bumped to distinct rows
    // The closer-to-wall (smaller centre = door at offset 2) keeps the inner row.
    const door = bigLocs.find((s) => s.references.some((x) => (x.elementId as string) === 'door_1'))!;
    const win = bigLocs.find((s) => s.references.some((x) => (x.elementId as string) === 'window_1'))!;
    expect(Math.abs(win.offsetMm)).toBeGreaterThan(Math.abs(door.offsetMm));
  });

  it('re-asserts determinism + input-order independence AFTER the P2 stages (with openings)', () => {
    const base = rectangle(openings);
    const shuffled: AutoDimSnapshot = { walls: [base.walls[2]!, base.walls[0]!, base.walls[3]!, base.walls[1]!] };
    const a = planAutoDimensions(base, OPTS);
    const b = planAutoDimensions(base, OPTS);
    expect(JSON.stringify(a.strings)).toEqual(JSON.stringify(b.strings)); // byte-identical
    const c = planAutoDimensions(shuffled, OPTS);
    // Same measured multiset + same signed-offset multiset regardless of input order.
    expect(a.strings.length).toBe(c.strings.length);
    expect(a.strings.map((s) => measured(base, s)).sort()).toEqual(c.strings.map((s) => measured(shuffled, s)).sort());
    expect(a.strings.map((s) => s.offsetMm).sort()).toEqual(c.strings.map((s) => s.offsetMm).sort());
  });
});

describe('planAutoDimensions — P2 edge cases (angled walls, geometry helpers)', () => {
  it('handles a fully angled (diamond) plan deterministically along run normals', () => {
    const v = [{ x: 3, z: 0 }, { x: 6, z: 3 }, { x: 3, z: 6 }, { x: 0, z: 3 }];
    const walls: AutoDimWall[] = v.map((p, i) => ({
      id: `w${i}`, a: p, b: v[(i + 1) % v.length]!, thickness: 0.2, openings: [],
    }));
    const snap: AutoDimSnapshot = { walls };
    const a = planAutoDimensions(snap, OPTS);
    const b = planAutoDimensions(snap, OPTS);
    expect(JSON.stringify(a.strings)).toEqual(JSON.stringify(b.strings));
    expect(a.strings.filter((s) => s.kind === 'overall').length).toBe(2);
    expect(a.report.coverage.runCount).toBe(4); // one run per angled side
    // Order-independent.
    const shuffled: AutoDimSnapshot = { walls: [walls[2]!, walls[0]!, walls[3]!, walls[1]!] };
    const c = planAutoDimensions(shuffled, OPTS);
    expect(a.strings.length).toBe(c.strings.length);
  });

  it('outwardNormal points away from the centroid (angled edge)', () => {
    const n = outwardNormal({ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 3, z: 1 });
    // Unit length, and the dot with (midpoint − centroid) is positive (outward).
    expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 6);
    const mid = { x: 2, z: 2 };
    expect(n.x * (mid.x - 3) + n.z * (mid.z - 1)).toBeGreaterThan(0);
    // Axis-aligned bottom edge → straight down.
    expect(outwardNormal({ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 3, z: 2 })).toEqual({ x: 0, z: -1 });
  });

  it('segmentsCross detects only strict transverse crossings (collinear/endpoint excluded)', () => {
    expect(segmentsCross({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: -1 }, { x: 2, z: 1 })).toBe(true); // cross
    expect(segmentsCross({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 })).toBe(false); // touch at endpoint
    expect(segmentsCross({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 1, z: 0 }, { x: 3, z: 0 })).toBe(false); // collinear
  });
});

// ── L-147 §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS — orthogonal-only + completeness ────

/**
 * Mirror of the renderer's §DIM-ORTHO measurement (PlanViewAnnotationRenderer.
 * _renderLinearDim): given a cardinal measurement axis, the drawn/labelled length
 * is the PROJECTION of (p2−p1) onto that axis — NOT the point-to-point hypot.
 * Without a measurement axis the renderer falls back to the hypot (the diagonal).
 */
function renderMeasure(
  snapshot: AutoDimSnapshot,
  s: { references: readonly { elementId: string; anchor: string }[]; orientation: string },
): number {
  const p1 = resolvePoint(snapshot, s.references[0]!.elementId as string, s.references[0]!.anchor);
  const p2 = resolvePoint(snapshot, s.references[1]!.elementId as string, s.references[1]!.anchor);
  const axis = cardinalMeasurementAxis(s.orientation as 'horizontal' | 'vertical' | 'aligned' | 'angular');
  if (!axis) return Math.hypot(p2.x - p1.x, p2.z - p1.z); // aligned → along-line hypot
  // Project onto the cardinal axis (world +X for horizontal, +Z for vertical).
  return Math.abs((p2.x - p1.x) * axis.x + (p2.z - p1.z) * axis.z);
}

describe('cardinalMeasurementAxis — the orthogonal-only invariant (DI-7)', () => {
  it('maps cardinal orientations to a world axis, aligned/angular to null', () => {
    expect(cardinalMeasurementAxis('horizontal')).toEqual({ x: 1, y: 0, z: 0 });
    expect(cardinalMeasurementAxis('vertical')).toEqual({ x: 0, y: 0, z: 1 });
    expect(cardinalMeasurementAxis('aligned')).toBeNull();
    expect(cardinalMeasurementAxis('angular')).toBeNull();
  });
});

describe('planAutoDimensions — ORTHOGONAL-ONLY on a notched-corner L (no diagonal)', () => {
  it('the overall corners are non-collinear (would render a diagonal without the axis)', () => {
    const snap = notchedCornerPlan();
    const { strings } = planAutoDimensions(snap, OPTS);
    const h = strings.find((s) => s.kind === 'overall' && s.orientation === 'horizontal')!;
    const v = strings.find((s) => s.kind === 'overall' && s.orientation === 'vertical')!;
    // Diagonal-prone: the two referenced corners differ on the cross-axis.
    const hp1 = resolvePoint(snap, h.references[0]!.elementId as string, h.references[0]!.anchor);
    const hp2 = resolvePoint(snap, h.references[1]!.elementId as string, h.references[1]!.anchor);
    expect(Math.abs(hp1.z - hp2.z)).toBeGreaterThan(0.001); // NOT collinear on z
    // A naive point-to-point render would label the bbox HYPOT (the founder's bug).
    expect(Math.hypot(hp2.x - hp1.x, hp2.z - hp1.z)).toBeGreaterThan(8 + 0.01);
    // The ORTHOGONAL render measures the axis extent: exactly the bbox width/height.
    expect(renderMeasure(snap, h)).toBeCloseTo(8, 6);
    expect(renderMeasure(snap, v)).toBeCloseTo(6, 6);
  });

  it('EVERY emitted string is cardinal (zero diagonal strings) with a defined axis', () => {
    for (const snap of [lPlan(), notchedCornerPlan()]) {
      const { strings } = planAutoDimensions(snap, OPTS);
      expect(strings.length).toBeGreaterThan(0);
      for (const s of strings) {
        // No 'aligned'/'angular' string on an axis-aligned footprint.
        expect(['horizontal', 'vertical']).toContain(s.orientation);
        // Its cardinal measurement axis is defined → renderer draws axis-aligned.
        expect(cardinalMeasurementAxis(s.orientation as 'horizontal' | 'vertical')).not.toBeNull();
        // The orthogonal render never exceeds the point-to-point hypot (it is the
        // axis projection of it), and matches the orientation-aware value.
        const rm = renderMeasure(snap, s);
        expect(rm).toBeCloseTo(measured(snap, s), 6);
      }
    }
  });

  it('QA flags no non-orthogonal overall on the notched plan', () => {
    const { report } = planAutoDimensions(notchedCornerPlan(), OPTS);
    expect(report.warnings.filter((w) => w.code === 'non-orthogonal-string').length).toBe(0);
  });

  it('re-run is byte-identical (determinism preserved on the notched plan)', () => {
    const a = planAutoDimensions(notchedCornerPlan(), OPTS);
    const b = planAutoDimensions(notchedCornerPlan(), OPTS);
    expect(JSON.stringify(a.strings)).toEqual(JSON.stringify(b.strings));
    expect(JSON.stringify(a.report.warnings)).toEqual(JSON.stringify(b.report.warnings));
  });
});

describe('planAutoDimensions — COMPLETE exterior chains (DI-3, QA-2)', () => {
  it('every exterior run interval is covered — no chain-gap/overlap (L + notched)', () => {
    for (const snap of [lPlan(), notchedCornerPlan()]) {
      const { report } = planAutoDimensions(snap, OPTS);
      expect(report.warnings.filter((w) => w.code === 'chain-gap').length).toBe(0);
      expect(report.warnings.filter((w) => w.code === 'chain-overlap').length).toBe(0);
    }
  });

  it('the notch jogs each get their own chain segment (per-side coverage)', () => {
    const snap = notchedCornerPlan();
    const { strings } = planAutoDimensions(snap, OPTS);
    const chainLens = strings
      .filter((s) => s.kind === 'linear-chain')
      .map((s) => measured(snap, s));
    // Bottom-left notch jog (x: 0→2 on the z=3 step) and (z: 0→3 on the x=2 step).
    expect(chainLens.some((l) => Math.abs(l - 2) < 1e-6)).toBe(true);
    expect(chainLens.some((l) => Math.abs(l - 3) < 1e-6)).toBe(true);
    // Full-width top (8) and full-height right (6) façades are chained too.
    expect(chainLens.some((l) => Math.abs(l - 8) < 1e-6)).toBe(true);
    expect(chainLens.some((l) => Math.abs(l - 6) < 1e-6)).toBe(true);
  });
});

describe('detectChainCoverageGaps — QA-2 gap/overlap detection (unit)', () => {
  const run = { id: 'run:A', nodeRefs: [{ station: 0 }, { station: 6 }] };

  it('reports a chain-gap when part of a run has no covering dim', () => {
    // Only [0,2] covered; [2,6] is an undimensioned façade interval.
    const warnings = detectChainCoverageGaps(
      [run],
      [{ axisId: 'run:A', kind: 'linear-chain', stationSpan: [0, 2] }],
      0.05,
    );
    expect(warnings.some((w) => w.code === 'chain-gap')).toBe(true);
  });

  it('reports a chain-overlap when two segments cover the same interval', () => {
    const warnings = detectChainCoverageGaps(
      [run],
      [
        { axisId: 'run:A', kind: 'linear-chain', stationSpan: [0, 4] },
        { axisId: 'run:A', kind: 'linear-chain', stationSpan: [3, 6] },
      ],
      0.05,
    );
    expect(warnings.some((w) => w.code === 'chain-overlap')).toBe(true);
  });

  it('a fully-partitioned run is clean (no gap, no overlap) — non-crashing', () => {
    const warnings = detectChainCoverageGaps(
      [run],
      [
        { axisId: 'run:A', kind: 'linear-chain', stationSpan: [0, 3] },
        { axisId: 'run:A', kind: 'linear-chain', stationSpan: [3, 6] },
      ],
      0.05,
    );
    expect(warnings.length).toBe(0);
  });

  it('ignores sub-minSeg slivers (intentional un-dimensioned tick)', () => {
    // [0,2.99] covered, 0.01 sliver to 3 (< minSeg 0.05) — not a reportable gap.
    const warnings = detectChainCoverageGaps(
      [{ id: 'run:A', nodeRefs: [{ station: 0 }, { station: 3 }] }],
      [{ axisId: 'run:A', kind: 'linear-chain', stationSpan: [0, 2.99] }],
      0.05,
    );
    expect(warnings.length).toBe(0);
  });
});
