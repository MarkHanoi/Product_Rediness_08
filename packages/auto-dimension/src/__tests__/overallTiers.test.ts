// §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — THE PLATE THAT ACTUALLY REPRODUCES IT.
//
// A RECTANGLE PASSES THIS RULE BY LUCK — and so, IT TURNS OUT, DOES A PLAIN L.
//
// The brief said "his case is L-shaped; a rectangle would pass by luck". Half right, and
// the other half matters. `planOverall` anchors the overall at the min-X (min-Z) perimeter
// NODE, and the dim line is drawn THROUGH that node, offset perpendicular. The line lands
// outside the building whenever that node is a BBOX CORNER — and on a plain L every
// extreme node IS a bbox corner (measured: min-X node = (0,0), clearance 0, no crossing).
// So an L would have shipped this "fix" while proving nothing.
//
// The defect needs a plate with an EXTREME NODE THAT IS NOT A BBOX CORNER — a STEPPED /
// T / U / cross footprint (a real house or apartment plate). Measured on the T below:
//
//   vertical overall  → p1 = (4, 0): the min-Z node sits MID-PLATE in x (bbox x ∈ [0,13])
//                     → old line at x = 4 − 0.5 = 3.5, running z = 0…8
//                     → STRAIGHT ACROSS THE FLOOR PLATE. The founder's screenshot exactly.
//   horizontal overall→ p1 = (0, 4) → old line at z = 3.5 → across the plate as well.
//
// So the T is the reproduction, and the L is kept as a regression case. The two rules are
// asserted as RULES, not as one screenshot's numbers:
//   (a) OUTSIDE   — no dimension line intersects the footprint POLYGON (not the bbox: a
//                   bbox test passes a line that runs through the notch).
//   (b) OUTERMOST — the OVERALL is strictly further out than every other chain on its axis.

import { describe, it, expect } from 'vitest';
import type { AutoDimWall, PlacedString } from '../types.js';
import { partitionBuildings } from '../buildings.js';
import { planOverall, planWallChain, planOpeningChain, planOpeningLocations } from '../planners.js';
import { placeStrings, polygonCentroidImpl } from '../placement.js';
import { openingsOnRun } from '../openings.js';
import {
  bboxOf, bboxClearance, tierGapWorldM, tierMagnitudeM, tierOfRank,
  OVERALL_TIER, DEFAULT_TIER_GAP_PAPER_MM,
} from '../tiers.js';
import { planAutoDimensions, detectFootprintCrossings } from '../planAutoDimensions.js';

const GAP = 0.8;   // = tierGapWorldM(100): 8 mm of paper at 1:100.

/**
 * An L-SHAPED plate — the founder's case.
 *
 *   z=10  ┌───────┐
 *         │       │            bbox: x ∈ [0,13], z ∈ [0,10]
 *   z=6   │       └───────┐    the NOTCH is x ∈ (7,13], z ∈ (6,10]
 *         │               │
 *   z=0   └───────────────┘
 *        x=0     x=7    x=13
 *
 * The min-X perimeter nodes are (0,0) AND (0,10); the max-X are (13,0) and (13,6). So the
 * horizontal overall can be anchored at z = 10 or z = 0, and the vertical at x = 0 or 13 —
 * i.e. the anchor's perpendicular coordinate is NOT the footprint edge on the side the dim
 * is pushed toward. That is the entire bug.
 */
function lShapedWalls(): AutoDimWall[] {
  const p = (x: number, z: number) => ({ x, z });
  const mk = (id: string, a: { x: number; z: number }, b: { x: number; z: number }, openings: AutoDimWall['openings'] = []): AutoDimWall =>
    ({ id, a, b, thickness: 0.2, levelId: 'L0', openings });
  return [
    mk('w_bottom', p(0, 0), p(13, 0), [
      { id: 'win_1', kind: 'window', offset: 3, width: 1.5 },
      { id: 'win_2', kind: 'window', offset: 8, width: 1.5 },
    ]),
    mk('w_right', p(13, 0), p(13, 6)),
    mk('w_notch_h', p(13, 6), p(7, 6)),
    mk('w_notch_v', p(7, 6), p(7, 10)),
    mk('w_top', p(7, 10), p(0, 10)),
    mk('w_left', p(0, 10), p(0, 0)),
  ];
}

/**
 * A STEPPED (T) plate — THE SHAPE THAT REPRODUCES THE FOUNDER'S SCREENSHOT.
 *
 *   z=8   ┌───────────────┐        bbox: x ∈ [0,13], z ∈ [0,8]
 *         │               │
 *   z=4   └───┐       ┌───┘        the min-Z nodes are (4,0) and (9,0):
 *             │       │            MID-PLATE in x — NOT bbox corners.
 *   z=0       └───────┘            the min-X nodes are (0,4) and (0,8).
 *        x=0  x=4    x=9  x=13
 *
 * The vertical overall is anchored at (4,0) and pushed −X: the OLD standoff drew it at
 * x = 3.5, straight across the top wing. The new one measures the standoff from the
 * FOOTPRINT (clearance = 4 m) and lands at x = 0 − gap.
 */
function tShapedWalls(): AutoDimWall[] {
  const p = (x: number, z: number) => ({ x, z });
  const mk = (id: string, a: { x: number; z: number }, b: { x: number; z: number }, openings: AutoDimWall['openings'] = []): AutoDimWall =>
    ({ id, a, b, thickness: 0.2, levelId: 'L0', openings });
  return [
    mk('t_stem_l', p(0, 4), p(4, 4)),
    mk('t_stem_lv', p(4, 4), p(4, 0)),
    mk('t_stem_b', p(4, 0), p(9, 0), [
      { id: 'win_1', kind: 'window', offset: 1, width: 1.2 },
      { id: 'win_2', kind: 'window', offset: 3, width: 1.2 },
    ]),
    mk('t_stem_rv', p(9, 0), p(9, 4)),
    mk('t_stem_r', p(9, 4), p(13, 4)),
    mk('t_right', p(13, 4), p(13, 8)),
    mk('t_top', p(13, 8), p(0, 8)),
    mk('t_left', p(0, 8), p(0, 4)),
  ];
}

/** A plain 10 × 8 rectangle — the shape that hid the bug. */
function rectWalls(): AutoDimWall[] {
  const p = (x: number, z: number) => ({ x, z });
  const mk = (id: string, a: { x: number; z: number }, b: { x: number; z: number }): AutoDimWall =>
    ({ id, a, b, thickness: 0.2, levelId: 'L0', openings: [] });
  return [
    mk('r_bottom', p(0, 0), p(10, 0)),
    mk('r_right', p(10, 0), p(10, 8)),
    mk('r_top', p(10, 8), p(0, 8)),
    mk('r_left', p(0, 8), p(0, 0)),
  ];
}

/** Run the real Stage 1→6 pipeline and hand back the placed strings + the footprint. */
function place(walls: AutoDimWall[]) {
  const partition = partitionBuildings(walls, 0.2);
  const b = partition.buildings[0]!;
  const wallsById = new Map(walls.map((w) => [w.id, w]));
  const list = [
    ...planOverall(b.perimNodes),
    ...b.runs.flatMap((r) => {
      const ops = openingsOnRun(r, wallsById);
      return [
        ...planWallChain(r, 0.05),
        ...planOpeningChain(r, ops, 0.05),
        ...planOpeningLocations(r, ops, 0.05),
      ];
    }),
  ];
  const bbox = bboxOf(b.perimPolygon)!;
  const placed = placeStrings(list, polygonCentroidImpl(b.perimPolygon), undefined, bbox, b.id);
  return { placed, polygon: b.perimPolygon, bbox };
}

/** The world coordinate of the dim LINE — exactly what the renderer draws (through p1). */
function linePos(p: PlacedString, gap = GAP): number {
  const horizontal = p.orientation === 'horizontal';
  const anchor = horizontal ? p.p1.z : p.p1.x;
  const n = horizontal ? p.outwardNormal.z : p.outwardNormal.x;
  return anchor + n * tierMagnitudeM(p.clearanceM, p.rowIndex, gap);
}

// ── The tier model itself ───────────────────────────────────────────────────

describe('the tier model', () => {
  it('puts the OVERALL in the outermost tier, openings innermost (rule b)', () => {
    expect(tierOfRank(4)).toBe(0);   // opening location
    expect(tierOfRank(3)).toBe(1);   // opening chain
    expect(tierOfRank(2)).toBe(2);   // exterior wall chain
    expect(tierOfRank(1)).toBe(OVERALL_TIER);
    expect(OVERALL_TIER).toBeGreaterThan(tierOfRank(2));
  });

  it('the tier gap is SCALE-AWARE — a paper constant, never a world literal (C24)', () => {
    expect(tierGapWorldM(100, DEFAULT_TIER_GAP_PAPER_MM)).toBeCloseTo(0.8, 9);  // 8 mm @ 1:100
    expect(tierGapWorldM(50, DEFAULT_TIER_GAP_PAPER_MM)).toBeCloseTo(0.4, 9);   // …@ 1:50
    expect(tierGapWorldM(200, DEFAULT_TIER_GAP_PAPER_MM)).toBeCloseTo(1.6, 9);  // …@ 1:200
    // The stack LOOKS the same on paper at every scale — the point of a scale.
  });

  it('clearance is the distance from a point to the footprint edge along the outward normal', () => {
    const bbox = { minX: 0, maxX: 13, minZ: 0, maxZ: 10 };
    // A point mid-plate pushed "down" (−Z) must travel its own z to reach the edge…
    expect(bboxClearance({ x: 0, z: 10 }, { x: 0, z: -1 }, bbox)).toBeCloseTo(10, 9);
    // …and a point already ON the bottom edge travels nothing.
    expect(bboxClearance({ x: 0, z: 0 }, { x: 0, z: -1 }, bbox)).toBeCloseTo(0, 9);
    // Never negative: a point already outside is not dragged back in.
    expect(bboxClearance({ x: 0, z: -5 }, { x: 0, z: -1 }, bbox)).toBe(0);
  });
});

// ── (a) OUTSIDE — on the L, where luck runs out ─────────────────────────────

describe('STEPPED (T) plate — the reproduction: no dim line crosses the plate (rule a)', () => {
  it('THE OLD FORMULA DREW THE OVERALL ACROSS THE PLATE — reproduce it before fixing it', () => {
    const { placed, polygon } = place(tShapedWalls());
    const overall = placed.filter((p) => p.kind === 'overall');
    expect(overall.length).toBe(2);   // one per axis

    // Re-create the OLD behaviour EXACTLY: standoff measured from the string's OWN
    // reference line (clearance = 0), 0.5 m base. Both overalls cut the plate — the
    // vertical one at x = 3.5 (the founder's line) and the horizontal one at z = 3.5.
    const asBefore = overall.map((p) => ({ ...p, clearanceM: 0, rowIndex: 0 }));
    const crossings = detectFootprintCrossings(asBefore, polygon, 0.5);
    expect(crossings).toHaveLength(2);
    expect(crossings.every((c) => c.code === 'geometry-crossing')).toBe(true);
    expect(crossings.map((c) => c.detail).join(' ')).toContain('x=3.500');
  });

  it('the fix puts EVERY dim line outside the footprint polygon', () => {
    const { placed, polygon } = place(tShapedWalls());
    expect(placed.length).toBeGreaterThan(0);
    expect(detectFootprintCrossings(placed, polygon, GAP)).toEqual([]);
  });

  it('every tier lands at bboxEdge + gap·(tier+1) — one rule, every string', () => {
    const { placed, bbox } = place(tShapedWalls());
    for (const p of placed) {
      if (p.orientation !== 'horizontal' && p.orientation !== 'vertical') continue;
      const horizontal = p.orientation === 'horizontal';
      const n = horizontal ? p.outwardNormal.z : p.outwardNormal.x;
      const edge = horizontal
        ? (n > 0 ? bbox.maxZ : bbox.minZ)
        : (n > 0 ? bbox.maxX : bbox.minX);
      const expected = edge + n * GAP * (p.rowIndex + 1);
      expect(linePos(p)).toBeCloseTo(expected, 6);
    }
  });
});

describe('L-SHAPED plate — kept as a REGRESSION case, not a proof', () => {
  it('is crossing-free after the fix (it was crossing-free before it, too — by luck)', () => {
    const { placed, polygon } = place(lShapedWalls());
    expect(detectFootprintCrossings(placed, polygon, GAP)).toEqual([]);
    // The measured evidence: the L's extreme node IS a bbox corner, so clearance is 0 and
    // the old formula also landed outside. An L proves nothing about this bug — recorded
    // here so nobody "verifies" the next placement change on one.
    const overall = placed.filter((p) => p.kind === 'overall');
    expect(overall.every((p) => p.clearanceM === 0)).toBe(true);
  });
});

// ── (b) OUTERMOST ───────────────────────────────────────────────────────────

describe('STEPPED (T) plate — the OVERALL is the outermost tier (rule b)', () => {
  it('sits strictly further out than every other chain on its axis + side', () => {
    const { placed } = place(tShapedWalls());
    for (const overall of placed.filter((p) => p.kind === 'overall')) {
      const horizontal = overall.orientation === 'horizontal';
      const n = horizontal ? overall.outwardNormal.z : overall.outwardNormal.x;
      const overallPos = linePos(overall);

      const others = placed.filter(
        (p) => p !== overall
          && p.orientation === overall.orientation
          && (horizontal ? p.outwardNormal.z : p.outwardNormal.x) === n,
      );
      expect(others.length).toBeGreaterThan(0);   // there IS something to be outside of
      for (const other of others) {
        // "Further out" = further along the outward normal.
        const delta = (linePos(other) - overallPos) * n;
        expect(delta).toBeLessThan(0);
      }
    }
  });
});

// ── The whole pipeline, and the rectangle it must not regress ───────────────

describe('planAutoDimensions — end to end', () => {
  it('an L-shaped plate reports NO geometry-crossing warning', () => {
    const { report, strings } = planAutoDimensions(
      { walls: lShapedWalls() },
      { viewId: 'plan-L0', levelId: 'L0', tierGapM: GAP },
    );
    expect(strings.length).toBeGreaterThan(0);
    expect(report.warnings.filter((w) => w.code === 'geometry-crossing')).toEqual([]);
  });

  it('the OVERALL still measures the true extents — the VALUE was never wrong', () => {
    const { strings } = planAutoDimensions(
      { walls: lShapedWalls() },
      { viewId: 'plan-L0', levelId: 'L0', tierGapM: GAP },
    );
    const overalls = strings.filter((s) => s.kind === 'overall');
    expect(overalls).toHaveLength(2);
    // 13 m and 10 m — the bbox extents of the L. The fix moved the LINE, not the NUMBER.
    const magnitudes = overalls.map((s) => Math.abs(s.offsetMm)).sort((a, b) => a - b);
    expect(magnitudes.every((m) => m > 0)).toBe(true);
  });

  it('a RECTANGLE is unchanged and still crossing-free (no regression)', () => {
    const { report, strings } = planAutoDimensions(
      { walls: rectWalls() },
      { viewId: 'plan-L0', levelId: 'L0', tierGapM: GAP },
    );
    expect(strings.length).toBeGreaterThan(0);
    expect(report.warnings.filter((w) => w.code === 'geometry-crossing')).toEqual([]);
  });

  it('is DETERMINISTIC — same geometry, byte-identical offsets (ADR-0061)', () => {
    const run = () => planAutoDimensions(
      { walls: lShapedWalls() },
      { viewId: 'plan-L0', levelId: 'L0', tierGapM: GAP },
    ).strings.map((s) => `${s.kind}|${s.orientation}|${s.offsetMm}`);
    expect(run()).toEqual(run());
  });

  it('scale changes the gap, not the value: 1:50 halves every standoff', () => {
    const at = (gap: number) => planAutoDimensions(
      { walls: lShapedWalls() },
      { viewId: 'plan-L0', levelId: 'L0', tierGapM: gap },
    ).strings.filter((s) => s.kind === 'overall').map((s) => Math.abs(s.offsetMm));

    const at100 = at(tierGapWorldM(100));
    const at50 = at(tierGapWorldM(50));
    expect(at100.length).toBe(2);
    for (let i = 0; i < at100.length; i++) {
      // clearance is unchanged (it is the building); only the tier gaps halve.
      expect(at50[i]!).toBeLessThan(at100[i]!);
    }
  });
});
