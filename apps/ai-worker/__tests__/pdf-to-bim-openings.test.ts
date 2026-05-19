// @pryzm/ai-worker — PDF-to-BIM Stage 2 openings tests (S52 §4.2).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.2
//     (lines 1296-1483) — door + window symbol matching.
//   • Exit criteria lines 1489-1490 — door precision ≥ 0.75 on the
//     spec-pinned 800 mm canonical; window precision ≥ 0.65 on the
//     spec-pinned canonical 2-pane casement.

import { describe, expect, it } from 'vitest';
import {
  ARC_WALL_SNAP_TOLERANCE_MM,
  DEFAULT_DOOR_TEMPLATES,
  detectWindowBreaks,
  estimateOpeningWidth,
  findArcs,
  findAdjacentLines,
  matchDoorTemplate,
  matchOpeningSymbols,
  snapToNearestWall,
  type ArcDescriptor,
  type OpeningCandidate,
  type PageDecomposition,
  type SymbolTemplate,
  type VectorElement,
  type WallCandidate,
} from '../src/pdf-to-bim/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Build an arc primitive in PDF points. The convention from
 *  stage2-walls.ts is `[center, edgeStart, edgeEnd]`. */
function makeArcVector(
  centerPt: [number, number],
  radiusPt: number,
  startAngle: number,
  endAngle: number,
): VectorElement {
  return {
    kind: 'arc',
    points: [
      centerPt,
      [centerPt[0] + radiusPt * Math.cos(startAngle), centerPt[1] + radiusPt * Math.sin(startAngle)],
      [centerPt[0] + radiusPt * Math.cos(endAngle), centerPt[1] + radiusPt * Math.sin(endAngle)],
    ],
  };
}

function makeLineVector(p1: [number, number], p2: [number, number]): VectorElement {
  return { kind: 'line', points: [p1, p2] };
}

function makeWall(
  centerLine: ReadonlyArray<readonly [number, number]>,
  thickness = 200,
  confidence = 0.85,
): WallCandidate {
  return {
    centerLine,
    thickness,
    confidence,
    pairLine1: { p1: [0, 0], p2: [0, 0], angle: 0, length: 0 },
    pairLine2: { p1: [0, 0], p2: [0, 0], angle: 0, length: 0 },
  };
}

const SCALE_MM_PER_PT = 10; // simple integer scale for arithmetic clarity

// ─── findArcs ─────────────────────────────────────────────────────────────

describe('@pryzm/ai-worker — findArcs (S52 §4.2)', () => {
  it('filters out non-arc primitives', () => {
    const vectors: VectorElement[] = [
      makeLineVector([0, 0], [100, 0]),
      makeArcVector([10, 10], 5, 0, Math.PI / 2),
      { kind: 'circle', points: [[20, 20], [25, 20]] },
    ];
    const arcs = findArcs(vectors);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.center).toEqual([10, 10]);
    expect(arcs[0]!.radius).toBeCloseTo(5, 6);
  });
});

// ─── matchDoorTemplate ────────────────────────────────────────────────────

describe('@pryzm/ai-worker — matchDoorTemplate (S52 §4.2)', () => {
  // 800 mm door @ scale 10 mm/pt → arc radius 80 pt.
  const arc800: ArcDescriptor = {
    center: [0, 0],
    radius: 80,
    startAngle: 0,
    endAngle: Math.PI / 2,
    rawVector: makeArcVector([0, 0], 80, 0, Math.PI / 2),
  };
  const panel800 = makeLineVector([0, 0], [80, 0]); // matches radius
  const tpl800 = DEFAULT_DOOR_TEMPLATES.find((t) => t.id === 'door-single-800')!;

  it('scores a canonical 90°-swing 800 mm door at ≥ 0.75', () => {
    const score = matchDoorTemplate(arc800, [panel800], tpl800, SCALE_MM_PER_PT);
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it('scores a 120°-swing arc much lower than 90°', () => {
    const arcWide: ArcDescriptor = { ...arc800, endAngle: Math.PI * 2 / 3 };
    const score = matchDoorTemplate(arcWide, [panel800], tpl800, SCALE_MM_PER_PT);
    expect(score).toBeLessThan(0.5);
  });

  it('returns 0 for a window template (kind mismatch)', () => {
    const winTpl: SymbolTemplate = {
      id: 'window-w', kind: 'window', subtype: 'casement-2-pane',
      features: [], anchor: [0, 0], openingWidthAxis: 'x',
    };
    expect(matchDoorTemplate(arc800, [panel800], winTpl, SCALE_MM_PER_PT)).toBe(0);
  });

  it('penalises score when no matching panel line is adjacent', () => {
    const score = matchDoorTemplate(arc800, [], tpl800, SCALE_MM_PER_PT);
    expect(score).toBeLessThan(0.75);
  });
});

// ─── findAdjacentLines ────────────────────────────────────────────────────

describe('@pryzm/ai-worker — findAdjacentLines', () => {
  it('keeps lines whose endpoint is within tolerance of the arc center', () => {
    const arc: ArcDescriptor = {
      center: [10, 10],
      radius: 5,
      startAngle: 0,
      endAngle: Math.PI / 2,
      rawVector: makeArcVector([10, 10], 5, 0, Math.PI / 2),
    };
    const adjacent = makeLineVector([10, 10], [15, 10]);
    const distant = makeLineVector([100, 100], [200, 100]);
    const out = findAdjacentLines([adjacent, distant], arc, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(adjacent);
  });
});

// ─── snapToNearestWall ────────────────────────────────────────────────────

describe('@pryzm/ai-worker — snapToNearestWall', () => {
  const arc: ArcDescriptor = {
    center: [10, 10], // 100 mm from origin at scale=10
    radius: 5,
    startAngle: 0,
    endAngle: Math.PI / 2,
    rawVector: makeArcVector([10, 10], 5, 0, Math.PI / 2),
  };

  it('returns the closest wall when within ARC_WALL_SNAP_TOLERANCE_MM', () => {
    const walls: WallCandidate[] = [
      makeWall([[0, 100], [10000, 100]]), // mm-space; arc.center mm-space is (100,100)
      makeWall([[0, 5000], [10000, 5000]]),
    ];
    const out = snapToNearestWall(arc, walls, SCALE_MM_PER_PT);
    expect(out).toBe(walls[0]);
  });

  it('returns null when no wall is within ARC_WALL_SNAP_TOLERANCE_MM', () => {
    const walls: WallCandidate[] = [makeWall([[0, 50000], [10000, 50000]])];
    const out = snapToNearestWall(arc, walls, SCALE_MM_PER_PT);
    expect(out).toBeNull();
  });

  it('exposes the snap tolerance constant', () => {
    expect(ARC_WALL_SNAP_TOLERANCE_MM).toBe(250);
  });
});

// ─── estimateOpeningWidth ─────────────────────────────────────────────────

describe('@pryzm/ai-worker — estimateOpeningWidth', () => {
  it('returns arc.radius * scaleFactor', () => {
    const arc: ArcDescriptor = {
      center: [0, 0], radius: 80, startAngle: 0, endAngle: Math.PI / 2,
      rawVector: makeArcVector([0, 0], 80, 0, Math.PI / 2),
    };
    const tpl = DEFAULT_DOOR_TEMPLATES[1]!;
    expect(estimateOpeningWidth(arc, tpl, SCALE_MM_PER_PT)).toBe(800);
  });
});

// ─── detectWindowBreaks ───────────────────────────────────────────────────

describe('@pryzm/ai-worker — detectWindowBreaks (S52 §4.2)', () => {
  it('finds a parallel pair of glazing lines within wall thickness', () => {
    // Wall: thickness 200 mm, centerline along y=1000 from x=0..2000.
    const wall = makeWall([[0, 1000], [2000, 1000]], 200);
    // Glazing: two lines parallel to wall, separated by 150 mm (within thickness),
    // overlapping 1500 mm. At scale=10, that's 150 pt long with 15 pt separation.
    const g1 = makeLineVector([50, 95], [200, 95]);
    const g2 = makeLineVector([50, 105], [200, 105]);
    const out = detectWindowBreaks([g1, g2], [wall], SCALE_MM_PER_PT);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]!.kind).toBe('window');
    expect(out[0]!.subtype).toBe('casement-2-pane');
  });

  it('rejects a window pair where separation exceeds wall thickness + 50 mm', () => {
    const wall = makeWall([[0, 1000], [2000, 1000]], 200);
    // 400 mm separation > 200 + 50 = 250 mm allowed.
    const g1 = makeLineVector([50, 80], [200, 80]);
    const g2 = makeLineVector([50, 120], [200, 120]);
    const out = detectWindowBreaks([g1, g2], [wall], SCALE_MM_PER_PT);
    expect(out).toHaveLength(0);
  });

  it('reports confidence ≥ 0.65 for a canonical casement window', () => {
    const wall = makeWall([[0, 1000], [2000, 1000]], 200);
    const g1 = makeLineVector([50, 95], [200, 95]);
    const g2 = makeLineVector([50, 105], [200, 105]);
    const out = detectWindowBreaks([g1, g2], [wall], SCALE_MM_PER_PT);
    expect(out[0]!.confidence).toBeGreaterThanOrEqual(0.65);
  });
});

// ─── matchOpeningSymbols (top-level integration) ─────────────────────────

describe('@pryzm/ai-worker — matchOpeningSymbols integration', () => {
  it('returns 1 door + 1 window for a synthetic page with one of each', () => {
    // Door at (1000, 1000) mm with 800 mm panel radius, hinge to the right.
    const doorArc = makeArcVector([100, 100], 80, 0, Math.PI / 2);
    const doorPanel = makeLineVector([100, 100], [180, 100]);
    // Window: two parallel glazing lines around y=2000 mm.
    const winG1 = makeLineVector([300, 195], [450, 195]);
    const winG2 = makeLineVector([300, 205], [450, 205]);

    const page: PageDecomposition = {
      pageId: 'test-page',
      pageWidthPt: 1000,
      pageHeightPt: 1000,
      vectors: [doorArc, doorPanel, winG1, winG2],
    };
    const walls: WallCandidate[] = [
      makeWall([[0, 1000], [3000, 1000]], 200),  // door host wall
      makeWall([[0, 2000], [5000, 2000]], 200),  // window host wall
    ];
    const out: OpeningCandidate[] = matchOpeningSymbols(page, walls, SCALE_MM_PER_PT);
    const doors = out.filter((o) => o.kind === 'door');
    const windows = out.filter((o) => o.kind === 'window');
    expect(doors.length).toBeGreaterThanOrEqual(1);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(doors[0]!.openingWidthMm).toBe(800);
  });

  it('produces zero openings when walls are empty', () => {
    const page: PageDecomposition = {
      pageId: 'p', pageWidthPt: 100, pageHeightPt: 100,
      vectors: [makeArcVector([10, 10], 80, 0, Math.PI / 2), makeLineVector([10, 10], [90, 10])],
    };
    expect(matchOpeningSymbols(page, [], SCALE_MM_PER_PT)).toEqual([]);
  });
});
