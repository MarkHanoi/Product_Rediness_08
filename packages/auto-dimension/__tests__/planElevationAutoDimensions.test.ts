// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the elevation rule set, proved.
//
// Every assertion here is a restatement of the normative rule set in
// `elevation/planElevationAutoDimensions.ts`. If a rule changes, one of these
// fails — which is the point: the rule set is executable, not a comment.

import { describe, it, expect } from 'vitest';
import {
  planElevationAutoDimensions,
  ELEVATION_RULES_BY_DETAIL_LEVEL,
  type ElevAutoDimSnapshot,
} from '../src/index.js';

/**
 * A 3-storey façade, 12 m wide, FFL at 0 / 3 / 6, top of wall at 9.
 * Four windows: two typical on L0 (sill 0.9, head 2.4) and two typical on L1.
 * A door on L0 (sill 0, head 2.1) — a DISTINCT sill/head group.
 */
function facade(): ElevAutoDimSnapshot {
  return {
    hMin: 0,
    hMax: 12,
    baseElevation: 0,
    topElevation: 9,
    topDatumKind: 'parapet',
    levels: [
      { id: 'lvl_1', name: 'Level 1', elevation: 3 },
      { id: 'lvl_0', name: 'Ground', elevation: 0 },   // deliberately unsorted
      { id: 'lvl_2', name: 'Level 2', elevation: 6 },
    ],
    openings: [
      { id: 'win_a', kind: 'window', levelId: 'lvl_0', hMin: 1, hMax: 2.5, sill: 0.9, head: 2.4 },
      { id: 'win_b', kind: 'window', levelId: 'lvl_0', hMin: 8, hMax: 9.5, sill: 0.9, head: 2.4 },
      { id: 'win_c', kind: 'window', levelId: 'lvl_1', hMin: 1, hMax: 2.5, sill: 3.9, head: 5.4 },
      { id: 'dor_a', kind: 'door',   levelId: 'lvl_0', hMin: 5, hMax: 6.0, sill: 0,   head: 2.1 },
    ],
  };
}

const OPTS = { viewId: 'view_elev_north' } as const;

describe('planElevationAutoDimensions — EV-1 overall building height', () => {
  it('measures base datum → top datum as ONE segment, labelled with the real top datum kind', () => {
    const { segments } = planElevationAutoDimensions(facade(), OPTS);
    const overall = segments.filter((s) => s.rule === 'overall-height');
    expect(overall).toHaveLength(1);
    expect(overall[0]!.v1).toBe(0);
    expect(overall[0]!.v2).toBe(9);
    expect(overall[0]!.valueM).toBe(9);
    // The label names what the height is measured TO — a parapet is not a ridge.
    expect(overall[0]!.label).toBe('parapet');
  });

  it('stands on the OUTERMOST left stack row — the biggest number is the outermost line', () => {
    const { segments } = planElevationAutoDimensions(facade(), OPTS);
    const overall = segments.find((s) => s.rule === 'overall-height')!;
    const chain = segments.find((s) => s.rule === 'floor-to-floor')!;
    expect(overall.side).toBe(-1);
    expect(chain.side).toBe(-1);
    // Further out = smaller H on the left side.
    expect(overall.lineH).toBeLessThan(chain.lineH);
  });
});

describe('planElevationAutoDimensions — EV-2 floor-to-floor chain', () => {
  it('chains the level datums ASCENDING regardless of input order, plus the top rise', () => {
    const { segments } = planElevationAutoDimensions(facade(), OPTS);
    const chain = segments.filter((s) => s.rule === 'floor-to-floor');
    // 3 levels ⇒ 2 inter-storey segments + 1 final rise to the top datum.
    expect(chain).toHaveLength(3);
    expect(chain.map((s) => [s.v1, s.v2])).toEqual([[0, 3], [3, 6], [6, 9]]);
    expect(chain.map((s) => s.valueM)).toEqual([3, 3, 3]);
  });

  it('L-127 — every value is DERIVED (v2 − v1), never a literal', () => {
    const s = facade();
    const shifted: ElevAutoDimSnapshot = {
      ...s,
      levels: [
        { id: 'lvl_0', name: 'Ground', elevation: 0 },
        { id: 'lvl_1', name: 'Level 1', elevation: 3.6 },   // a REAL 3.6 m storey
      ],
      topElevation: 7.2,
      openings: [],
    };
    const { segments } = planElevationAutoDimensions(shifted, OPTS);
    const chain = segments.filter((s2) => s2.rule === 'floor-to-floor');
    expect(chain).toHaveLength(2);
    // Both rises are the REAL 3.6 m storey, to float precision — not a rounded literal.
    expect(chain[0]!.valueM).toBeCloseTo(3.6, 9);
    expect(chain[1]!.valueM).toBeCloseTo(3.6, 9);
  });

  it('flags a closure failure when the envelope sits BELOW the topmost storey datum', () => {
    const s = facade();
    // The top datum is lower than the topmost level — the final rise is negative, so
    // it is dropped, and the chain no longer closes on the overall height. The model
    // is inconsistent and the drawing would lie; the engine must SAY so.
    const broken: ElevAutoDimSnapshot = {
      ...s,
      levels: [
        { id: 'lvl_0', name: 'Ground', elevation: 0 },
        { id: 'lvl_1', name: 'Level 1', elevation: 3 },
      ],
      baseElevation: 0,
      topElevation: 2,
      openings: [],
    };
    const { report } = planElevationAutoDimensions(broken, OPTS);
    expect(report.warnings.some((w) => w.code === 'overall-mismatch')).toBe(true);
  });
});

describe('planElevationAutoDimensions — EV-3 typical opening sill + head', () => {
  it('emits ONE sill/head chain per DISTINCT (level, sill, head) group, with member provenance', () => {
    const { segments } = planElevationAutoDimensions(facade(), OPTS);
    const sills = segments.filter((s) => s.rule === 'opening-sill');
    const heads = segments.filter((s) => s.rule === 'opening-head');

    // 3 distinct groups: L0 windows (0.9/2.4), L0 door (0/2.1), L1 windows (3.9/5.4).
    // The L0 door's sill sits ON its level datum → its SILL segment is a zero-length
    // sliver and is correctly skipped; its HEAD segment (opening height) still fires.
    expect(sills).toHaveLength(2);
    expect(heads).toHaveLength(3);

    const l0win = sills.find((s) => s.referenceIds.includes('win_a'))!;
    expect(l0win.referenceIds).toEqual(['win_a', 'win_b']); // both typical windows, sorted
    expect(l0win.v1).toBe(0);      // host level datum
    expect(l0win.v2).toBe(0.9);    // sill
    expect(l0win.valueM).toBeCloseTo(0.9, 9);

    const l0winHead = heads.find((s) => s.referenceIds.includes('win_a'))!;
    expect(l0winHead.v1).toBe(0.9);
    expect(l0winHead.v2).toBe(2.4);
    expect(l0winHead.valueM).toBeCloseTo(1.5, 9); // the opening's own height
  });

  it('measures at the group right jamb and stacks RIGHT — witness lines never cross the façade', () => {
    const { segments } = planElevationAutoDimensions(facade(), OPTS);
    const opening = segments.filter((s) => s.rule === 'opening-sill' || s.rule === 'opening-head');
    for (const s of opening) {
      expect(s.side).toBe(1);
      expect(s.lineH).toBeGreaterThan(12); // outside hMax
      expect(s.h).toBeLessThanOrEqual(12); // measured ON the façade
      expect(s.offsetH).toBeCloseTo(s.h - s.lineH, 9);
      expect(s.offsetH).toBeLessThan(0);   // the dim line is to the RIGHT of the geometry
    }
  });

  it('warns rather than inventing a datum when an opening references an unknown level', () => {
    const s = facade();
    const orphan: ElevAutoDimSnapshot = {
      ...s,
      openings: [{ id: 'win_x', kind: 'window', levelId: 'lvl_ghost', hMin: 1, hMax: 2, sill: 1, head: 2 }],
    };
    const { segments, report } = planElevationAutoDimensions(orphan, OPTS);
    expect(segments.filter((x) => x.rule === 'opening-sill')).toHaveLength(0);
    expect(report.warnings.some((w) => w.code === 'opening-undimensioned')).toBe(true);
  });
});

describe('planElevationAutoDimensions — view INTENT (P7 / C09), the L-262 LOD cell', () => {
  it('coarse (LOD 100) emits the overall height ONLY', () => {
    const { segments } = planElevationAutoDimensions(facade(), { ...OPTS, detailLevel: 'coarse' });
    expect(new Set(segments.map((s) => s.rule))).toEqual(new Set(['overall-height']));
  });

  it('medium (LOD 200) adds the storey structure but not opening set-out', () => {
    const { segments } = planElevationAutoDimensions(facade(), { ...OPTS, detailLevel: 'medium' });
    expect(new Set(segments.map((s) => s.rule))).toEqual(new Set(['overall-height', 'floor-to-floor']));
  });

  it('fine (LOD 300) adds the opening sill + head', () => {
    const { segments } = planElevationAutoDimensions(facade(), { ...OPTS, detailLevel: 'fine' });
    expect(new Set(segments.map((s) => s.rule))).toEqual(
      new Set(['overall-height', 'floor-to-floor', 'opening-sill', 'opening-head']),
    );
  });

  it('the LOD gate is a DECLARED table, not a code branch', () => {
    expect(ELEVATION_RULES_BY_DETAIL_LEVEL.coarse).toEqual(['overall-height']);
    expect(ELEVATION_RULES_BY_DETAIL_LEVEL.medium).toEqual(['overall-height', 'floor-to-floor']);
    expect(ELEVATION_RULES_BY_DETAIL_LEVEL.fine).toEqual([
      'overall-height', 'floor-to-floor', 'opening-sill', 'opening-head',
    ]);
  });
});

describe('planElevationAutoDimensions — governed records (C03) + determinism', () => {
  it('every segment has an index-aligned schema-parsed DimensionString (vertical / elevation)', () => {
    const { strings, segments } = planElevationAutoDimensions(facade(), OPTS);
    expect(strings).toHaveLength(segments.length);
    for (const s of strings) {
      expect(s.orientation).toBe('vertical');
      expect(s.autoMode).toBe('elevation');
      expect(s.isAutoGenerated).toBe(true);
      expect(s.viewId).toBe('view_elev_north');
      expect(s.references.length).toBeGreaterThanOrEqual(2);
      expect(s.override).toBeNull();
    }
  });

  it('is deterministic — same input ⇒ byte-identical output', () => {
    const a = planElevationAutoDimensions(facade(), OPTS);
    const b = planElevationAutoDimensions(facade(), OPTS);
    expect(JSON.stringify(a.segments)).toBe(JSON.stringify(b.segments));
    expect(JSON.stringify(a.strings)).toBe(JSON.stringify(b.strings));
  });

  it('a degenerate façade produces NOTHING and says why — never a fabricated dim', () => {
    const s = facade();
    const { segments, report } = planElevationAutoDimensions({ ...s, hMax: s.hMin }, OPTS);
    expect(segments).toHaveLength(0);
    expect(report.warnings.some((w) => w.code === 'degenerate-run')).toBe(true);
  });
});
