// @pryzm/ai-worker — PDF Stage 2 wall + column tests (S51 Track B).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md`
// §3.2 lines 850-1093 + §3 S51 exit criteria lines 1096-1102.
//
// Notes:
// • Coordinates are PDF points in `VectorElement.points`. Tests pass
//   `scaleFactor = 1.0` so points map 1:1 to mm — easier to assert.
// • Wall thickness fixtures use 100, 140, 200, 250 — common values
//   that the confidence booster recognises.
// • Column fixtures are 300×300 mm (common RC size).

import { describe, expect, it } from 'vitest';
import {
  AI_FALLBACK_THRESHOLD,
  classifyPageStage2,
  classifyWallsAndColumns,
  computeCenterline,
  computeColumnConfidence,
  computeOverlap,
  computeWallConfidence,
  detectColumns,
  detectWallPairs,
  extractLines,
  groupByAngle,
  isApproximateRectangle,
  perpendicularDistance,
  STAGE2_OTEL_NAMESPACE,
} from '../src/pdf-to-bim/index.js';
import type {
  ClassifiedLine,
  PageDecomposition,
  VectorElement,
} from '../src/pdf-to-bim/index.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────

function line(p1: [number, number], p2: [number, number]): VectorElement {
  return { kind: 'line', points: [p1, p2] };
}

function rect(x: number, y: number, w: number, h: number): VectorElement {
  return {
    kind: 'polygon',
    closed: true,
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  };
}

function makePage(vectors: VectorElement[]): PageDecomposition {
  return {
    pageId: 'pg-1',
    pageWidthPt: 1700,
    pageHeightPt: 2200,
    vectors,
  };
}

function classifiedLine(p1: [number, number], p2: [number, number]): ClassifiedLine {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (((Math.atan2(y2 - y1, x2 - x1) % Math.PI) + Math.PI) % Math.PI);
  return { p1, p2, angle, length };
}

// ─── Constants + telemetry ────────────────────────────────────────────────

describe('@pryzm/ai-worker — pdf-to-bim Stage 2 (S51 Track B)', () => {
  it('exports the expected OTel namespace per phase doc line 1102', () => {
    expect(STAGE2_OTEL_NAMESPACE).toBe('pryzm.pdf.stage2');
  });
  it('exposes the AI_FALLBACK_THRESHOLD constant for S52 wiring', () => {
    expect(AI_FALLBACK_THRESHOLD).toBe(0.6);
  });

  // ─── extractLines ──────────────────────────────────────────────────────
  describe('extractLines', () => {
    it('skips lines shorter than 100 mm (hatching filter per spec line 889)', () => {
      const vectors = [line([0, 0], [50, 0]), line([0, 0], [200, 0])];
      const lines = extractLines(vectors, 1.0);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.length).toBe(200);
    });
    it('normalises angle to 0–π regardless of point order (spec line 891)', () => {
      const left = extractLines([line([0, 0], [1000, 0])], 1.0);
      const right = extractLines([line([1000, 0], [0, 0])], 1.0);
      expect(left[0]!.angle).toBeCloseTo(right[0]!.angle, 6);
      expect(left[0]!.angle).toBeGreaterThanOrEqual(0);
      expect(left[0]!.angle).toBeLessThan(Math.PI);
    });
    it('applies the scaleFactor to convert PDF points → mm', () => {
      const lines = extractLines([line([0, 0], [200, 0])], 0.5);
      expect(lines[0]!.length).toBe(100);
    });
    it('ignores non-line vectors', () => {
      const vectors = [
        rect(0, 0, 300, 300),
        { kind: 'circle', points: [[0, 0], [100, 0]] } as VectorElement,
      ];
      expect(extractLines(vectors, 1.0)).toEqual([]);
    });
  });

  // ─── detectWallPairs ───────────────────────────────────────────────────
  describe('detectWallPairs', () => {
    it('finds a single parallel pair at 200 mm spacing', () => {
      const lines = [
        classifiedLine([0, 0], [3000, 0]),
        classifiedLine([0, 200], [3000, 200]),
      ];
      const walls = detectWallPairs(lines);
      expect(walls).toHaveLength(1);
      expect(walls[0]!.thickness).toBe(200);
      expect(walls[0]!.centerLine).toEqual([[0, 100], [3000, 100]]);
    });
    it('skips pairs with spacing < WALL_THICKNESS_MIN_MM (50)', () => {
      const lines = [
        classifiedLine([0, 0], [3000, 0]),
        classifiedLine([0, 30], [3000, 30]),
      ];
      expect(detectWallPairs(lines)).toHaveLength(0);
    });
    it('skips pairs with spacing > WALL_THICKNESS_MAX_MM (600)', () => {
      const lines = [
        classifiedLine([0, 0], [3000, 0]),
        classifiedLine([0, 800], [3000, 800]),
      ];
      expect(detectWallPairs(lines)).toHaveLength(0);
    });
    it('skips pairs with overlap < WALL_MIN_OVERLAP_MM (500)', () => {
      // Two parallel 600 mm lines, only 200 mm overlap.
      const lines = [
        classifiedLine([0, 0], [600, 0]),
        classifiedLine([400, 200], [1000, 200]),
      ];
      expect(detectWallPairs(lines)).toHaveLength(0);
    });
    it('confidence boosts on a common 200 mm thickness + long lines + good overlap', () => {
      // 5000 mm long, 200 mm spacing — all three boosters fire.
      const lines = [
        classifiedLine([0, 0], [5000, 0]),
        classifiedLine([0, 200], [5000, 200]),
      ];
      const walls = detectWallPairs(lines);
      expect(walls[0]!.confidence).toBeGreaterThanOrEqual(1.0);
    });
    it('confidence stays modest for short lines + uncommon thickness (e.g. 175 + 70 mm)', () => {
      const lines = [
        classifiedLine([0, 0], [600, 0]),  // length 600 mm
        classifiedLine([0, 73], [600, 73]),  // 73 mm spacing — not a common thickness
      ];
      const walls = detectWallPairs(lines);
      expect(walls).toHaveLength(1);
      expect(walls[0]!.confidence).toBeLessThan(AI_FALLBACK_THRESHOLD);
    });
    it('skips non-parallel lines (perpendicular pair)', () => {
      const lines = [
        classifiedLine([0, 0], [3000, 0]),
        classifiedLine([0, 0], [0, 3000]),
      ];
      expect(detectWallPairs(lines)).toHaveLength(0);
    });
    it('finds two independent walls in two angle groups', () => {
      const lines = [
        // Horizontal pair
        classifiedLine([0, 0], [3000, 0]),
        classifiedLine([0, 200], [3000, 200]),
        // Vertical pair
        classifiedLine([0, 0], [0, 3000]),
        classifiedLine([200, 0], [200, 3000]),
      ];
      const walls = detectWallPairs(lines);
      expect(walls).toHaveLength(2);
      expect(walls[0]!.thickness).toBe(200);
      expect(walls[1]!.thickness).toBe(200);
    });
  });

  // ─── detectColumns ─────────────────────────────────────────────────────
  describe('detectColumns', () => {
    it('finds a 300×300 mm rectangle with confidence ≥ 0.9 (boosters fire)', () => {
      const cols = detectColumns([rect(1000, 1000, 300, 300)], 1.0);
      expect(cols).toHaveLength(1);
      expect(cols[0]!.position).toEqual([1150, 1150]);
      expect(cols[0]!.width).toBe(300);
      expect(cols[0]!.depth).toBe(300);
      expect(cols[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    });
    it('skips highly-elongated rectangles (aspect > 4)', () => {
      const cols = detectColumns([rect(0, 0, 600, 100)], 1.0);
      expect(cols).toHaveLength(0);
    });
    it('skips rectangles outside 100–800 mm size range', () => {
      const cols = detectColumns(
        [
          rect(0, 0, 50, 50),     // too small
          rect(0, 0, 1000, 1000), // too large
        ],
        1.0,
      );
      expect(cols).toHaveLength(0);
    });
    it('ignores open polygons (closed=false)', () => {
      const open: VectorElement = {
        kind: 'polygon',
        closed: false,
        points: [[0, 0], [300, 0], [300, 300], [0, 300]],
      };
      expect(detectColumns([open], 1.0)).toHaveLength(0);
    });
    it('ignores polygons with too few or too many vertices (4–8 only)', () => {
      const triangle: VectorElement = {
        kind: 'polygon',
        closed: true,
        points: [[0, 0], [300, 0], [150, 300]],
      };
      expect(detectColumns([triangle], 1.0)).toHaveLength(0);
    });
  });

  // ─── classifyWallsAndColumns + classifyPage ───────────────────────────
  describe('top-level classifyWallsAndColumns', () => {
    it('combines walls + columns from a mixed page', () => {
      const page = makePage([
        line([0, 0], [3000, 0]),
        line([0, 200], [3000, 200]),
        rect(5000, 5000, 300, 300),
      ]);
      const out = classifyWallsAndColumns(page, 1.0);
      expect(out.walls).toHaveLength(1);
      expect(out.columns).toHaveLength(1);
    });
    it('classifyPageStage2 returns metrics with avg confidences', () => {
      const page = makePage([
        line([0, 0], [3000, 0]),
        line([0, 200], [3000, 200]),
        rect(5000, 5000, 300, 300),
      ]);
      const layer = classifyPageStage2(page, 1.0);
      expect(layer.pageId).toBe('pg-1');
      expect(layer.metrics?.wallsCount).toBe(1);
      expect(layer.metrics?.columnsCount).toBe(1);
      expect(layer.metrics?.avgWallConfidence).toBeGreaterThan(0.5);
      expect(layer.metrics?.avgColumnConfidence).toBeGreaterThan(0.5);
    });
  });

  // ─── geometry utils ────────────────────────────────────────────────────
  describe('geometry utilities', () => {
    it('groupByAngle groups parallel lines, separates perpendicular', () => {
      const lines = [
        classifiedLine([0, 0], [1000, 0]),
        classifiedLine([0, 100], [1000, 100]),
        classifiedLine([0, 0], [0, 1000]),
      ];
      const groups = groupByAngle(lines, (5 * Math.PI) / 180);
      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveLength(2);
      expect(groups[1]).toHaveLength(1);
    });
    it('perpendicularDistance returns 200 for two parallel lines 200 mm apart', () => {
      const l1 = classifiedLine([0, 0], [1000, 0]);
      const l2 = classifiedLine([0, 200], [1000, 200]);
      expect(perpendicularDistance(l1, l2)).toBeCloseTo(200, 6);
    });
    it('computeOverlap returns the projected overlap length', () => {
      const l1 = classifiedLine([0, 0], [1000, 0]);
      const l2 = classifiedLine([400, 100], [1400, 100]);
      expect(computeOverlap(l1, l2)).toBeCloseTo(600, 3);
    });
    it('computeCenterline returns the midpoint segment', () => {
      const l1 = classifiedLine([0, 0], [1000, 0]);
      const l2 = classifiedLine([0, 200], [1000, 200]);
      expect(computeCenterline(l1, l2)).toEqual([[0, 100], [1000, 100]]);
    });
    it('isApproximateRectangle accepts a square within tolerance', () => {
      expect(isApproximateRectangle([[0, 0], [300, 0], [300, 300], [0, 300]])).toBe(true);
    });
    it('isApproximateRectangle rejects skewed quads', () => {
      expect(isApproximateRectangle([[0, 0], [300, 50], [350, 350], [50, 300]])).toBe(false);
    });
  });

  // ─── confidence formulas ───────────────────────────────────────────────
  describe('confidence formulas', () => {
    it('wall confidence stacks all four boosters when applicable', () => {
      const l1 = classifiedLine([0, 0], [5000, 0]);
      const l2 = classifiedLine([0, 200], [5000, 200]);
      const c = computeWallConfidence(l1, l2, 200, 4500);
      expect(c).toBe(1.0);
    });
    it('column confidence stacks size + aspect boosters for a 300×300', () => {
      const c = computeColumnConfidence(300, 300, 1.0);
      // base 0.5 + 0.25 (common size) + 0.15 (aspect < 1.2) = 0.9
      expect(c).toBeCloseTo(0.9, 6);
    });
  });
});
