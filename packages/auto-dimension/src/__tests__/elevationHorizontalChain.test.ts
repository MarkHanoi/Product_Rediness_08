// §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — THE OTHER HALF OF THE ELEVATION SET.
//
// The founder's elevation came back with correct VERTICAL chains (sill, head,
// floor-to-floor, overall height) and NOT ONE horizontal dimension: no opening widths, no
// spacing, no distance to the façade ends, no overall façade length. L-263 built the
// genuinely-new vertical rule set and left the horizontal axis IMPLICIT — and implicit
// means ABSENT.
//
// The guard, exactly as stated: an elevation with TWO WINDOWS yields BOTH widths, the GAP
// between them, BOTH end distances, and ONE overall — and no horizontal dimension crosses
// the building silhouette.

import { describe, it, expect } from 'vitest';
import { planElevationAutoDimensions } from '../elevation/planElevationAutoDimensions.js';
import type { ElevAutoDimSnapshot } from '../elevation/types.js';
import { tierGapWorldM, tierOfRank } from '../tiers.js';

const GAP = tierGapWorldM(100);   // 8 mm of paper at 1:100 = 0.8 m

/**
 * A 12 m façade, base at 0, top at 6. TWO WINDOWS:
 *   window A: H 2.0 → 3.5   (1.5 m wide)
 *   window B: H 7.0 → 9.0   (2.0 m wide)
 * ⇒ end 2.0 · width 1.5 · gap 3.5 · width 2.0 · end 3.0   (sums to 12.0)
 */
const FACADE: ElevAutoDimSnapshot = {
  hMin: 0,
  hMax: 12,
  baseElevation: 0,
  topElevation: 6,
  topDatumKind: 'wall-top',
  levels: [
    { id: 'L0', name: 'Ground', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
  ],
  openings: [
    { id: 'win_a', kind: 'window', levelId: 'L0', hMin: 2.0, hMax: 3.5, sill: 0.9, head: 2.3 },
    { id: 'win_b', kind: 'window', levelId: 'L0', hMin: 7.0, hMax: 9.0, sill: 0.9, head: 2.3 },
  ],
};

const plan = (detailLevel: 'coarse' | 'medium' | 'fine' = 'fine') =>
  planElevationAutoDimensions(FACADE, { viewId: 'v_elev', detailLevel, tierGapM: GAP });

describe('an elevation dimension set is TWO chains, not one', () => {
  it('THE REGRESSION: the vertical set alone is not a dimensioned elevation', () => {
    const { segments, hSegments } = plan();
    expect(segments.length).toBeGreaterThan(0);      // L-263 shipped this…
    expect(hSegments.length).toBeGreaterThan(0);     // …and NOT this. That was the bug.
  });

  it('two windows → BOTH widths, the GAP, BOTH end distances, and ONE overall', () => {
    const { hSegments } = plan();

    const overall = hSegments.filter((s) => s.rule === 'facade-overall');
    expect(overall).toHaveLength(1);
    expect(overall[0]!.valueM).toBeCloseTo(12, 9);   // the whole façade

    const chain = hSegments.filter((s) => s.rule === 'facade-chain');
    const widths = chain.filter((s) => s.label === 'width').map((s) => s.valueM).sort();
    const gaps = chain.filter((s) => s.label === 'gap').map((s) => s.valueM);
    const ends = chain.filter((s) => s.label === 'end').map((s) => s.valueM).sort();

    expect(widths).toEqual([1.5, 2.0]);              // BOTH widths
    expect(gaps).toEqual([3.5]);                     // the GAP between them
    expect(ends).toEqual([2.0, 3.0]);                // BOTH end distances

    // …and the chain PARTITIONS the façade: no gap, no overlap.
    const sum = chain.reduce((acc, s) => acc + s.valueM, 0);
    expect(sum).toBeCloseTo(12, 9);
  });

  it('every value is DERIVED (h2 − h1) — never a literal (L-127)', () => {
    for (const s of plan().hSegments) {
      expect(s.valueM).toBeCloseTo(s.h2 - s.h1, 12);
      expect(s.h2).toBeGreaterThan(s.h1);
    }
  });

  it('carries the OPENING ids it measures — the provenance a width dim must have', () => {
    const widths = plan().hSegments.filter((s) => s.label === 'width');
    expect(widths.map((s) => s.referenceIds).flat().sort()).toEqual(['win_a', 'win_b']);
  });
});

describe('no horizontal dimension crosses the building silhouette', () => {
  it('every horizontal dim LINE sits BELOW the façade base', () => {
    for (const s of plan().hSegments) {
      expect(s.lineV).toBeLessThan(FACADE.baseElevation);
      expect(s.side).toBe(-1);
      // The measured points are ON the base datum; the offset carries the line below it.
      expect(s.v).toBe(FACADE.baseElevation);
      expect(s.offsetV).toBeCloseTo(s.lineV - s.v, 12);
      expect(s.offsetV).toBeLessThan(0);
    }
  });

  it('inherits the L-281 TIER MODEL for free — the OVERALL is the outermost tier', () => {
    const { hSegments } = plan();
    const overall = hSegments.find((s) => s.rule === 'facade-overall')!;
    const chain = hSegments.filter((s) => s.rule === 'facade-chain');

    expect(overall.rowIndex).toBe(tierOfRank(1));
    expect(chain.every((s) => s.rowIndex === tierOfRank(2))).toBe(true);
    // "Outermost" below a façade means LOWEST.
    expect(overall.lineV).toBeLessThan(chain[0]!.lineV);
    // …and each tier is exactly one gap further out (base − gap·(tier+1)).
    expect(overall.lineV).toBeCloseTo(0 - GAP * (tierOfRank(1) + 1), 9);
    expect(chain[0]!.lineV).toBeCloseTo(0 - GAP * (tierOfRank(2) + 1), 9);
  });

  it('the tier gap is the VIEW\'s scale, not a literal (C24)', () => {
    const at50 = planElevationAutoDimensions(FACADE, {
      viewId: 'v', detailLevel: 'fine', tierGapM: tierGapWorldM(50),
    }).hSegments.find((s) => s.rule === 'facade-overall')!;
    const at100 = plan().hSegments.find((s) => s.rule === 'facade-overall')!;
    expect(Math.abs(at50.offsetV)).toBeCloseTo(Math.abs(at100.offsetV) / 2, 9);
  });
});

describe('the horizontal set is INTENT-GATED, like its vertical twin (P7 / C09)', () => {
  it('coarse → the façade length alone; medium/fine → the station chain too', () => {
    expect(plan('coarse').hSegments.map((s) => s.rule)).toEqual(['facade-overall']);
    expect(plan('medium').hSegments.some((s) => s.rule === 'facade-chain')).toBe(true);
    expect(plan('fine').hSegments.some((s) => s.rule === 'facade-chain')).toBe(true);
  });

  it('a façade with NO openings still gets its length (and no chain slivers)', () => {
    const bare = { ...FACADE, openings: [] };
    const { hSegments } = planElevationAutoDimensions(bare, { viewId: 'v', detailLevel: 'fine', tierGapM: GAP });
    expect(hSegments.filter((s) => s.rule === 'facade-overall')).toHaveLength(1);
    // The chain degenerates to a single end-to-end interval — which IS the façade, once.
    expect(hSegments.filter((s) => s.rule === 'facade-chain')).toHaveLength(1);
  });

  it('is DETERMINISTIC — same façade, byte-identical output (ADR-0061)', () => {
    const run = () => plan().hSegments.map((s) => `${s.rule}|${s.label}|${s.h1}|${s.h2}|${s.lineV}`);
    expect(run()).toEqual(run());
  });
});
