// Curtain-wall intent resolver test suite (S13-T2).
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md §S13.

import { describe, expect, it } from 'vitest';
import {
  CurtainWallIntentResolver,
  DEFAULT_MULLION_EDGE_TOLERANCE_M,
  computeIntentGrid,
  type CurtainWallData,
} from '../src/intent.js';

function fixture(overrides: Partial<CurtainWallData> = {}): CurtainWallData {
  return {
    id: 'curtainwall_01HZS00000000000000FIXTUR' as CurtainWallData['id'],
    type: 'curtainwall',
    childrenIds: [],
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
    levelId: 'level:0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 3,
    mullionThickness: 0.05,
    bayWidth: 1.5,   // 4 columns: 0, 1.5, 3, 4.5, 6
    bayHeight: 1.5,  // 2 rows:    0, 1.5, 3
    panels: [],
    ...overrides,
  } as CurtainWallData;
}

describe('CurtainWallIntentResolver — grid math', () => {
  it('computeIntentGrid produces evenly spaced columns/rows + boundaries', () => {
    const cw = fixture();
    const g = computeIntentGrid(cw);
    expect(g.cols).toEqual([0, 1.5, 3, 4.5, 6]);
    expect(g.rows).toEqual([0, 1.5, 3]);
  });
});

describe('CurtainWallIntentResolver — resolvePanelCell', () => {
  it('hits the middle panel', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.resolvePanelCell(cw.id, { x: 2, y: 0.75 })).toEqual({ row: 0, col: 1 });
    expect(r.resolvePanelCell(cw.id, { x: 5, y: 2 })).toEqual({ row: 1, col: 3 });
  });

  it('returns null for out-of-grid points', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.resolvePanelCell(cw.id, { x: -1, y: 1 })).toBeNull();
    expect(r.resolvePanelCell(cw.id, { x: 6, y: 1 })).toBeNull();
    expect(r.resolvePanelCell(cw.id, { x: 1, y: 3 })).toBeNull();
  });

  it('returns null for unknown curtain wall id', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.resolvePanelCell('does-not-exist', { x: 1, y: 1 })).toBeNull();
  });
});

describe('CurtainWallIntentResolver — resolveSegmentIntent', () => {
  it('disambiguates mullion within the default 8 px tolerance', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    // x=1.5 is exactly on the second column line (index 1)
    const intent = r.resolveSegmentIntent(cw.id, { x: 1.5, y: 0.75 });
    expect(intent).toEqual({ kind: 'mullion', orientation: 'vertical', index: 1 });
  });

  it('prefers panel beyond the tolerance', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    // 1.5 + 0.1 = 1.6 is well outside the default 0.04 m tolerance
    const intent = r.resolveSegmentIntent(cw.id, { x: 1.6, y: 0.75 });
    expect(intent).toEqual({ kind: 'panel', row: 0, col: 1 });
  });

  it('resolves transom when on a horizontal grid line', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    const intent = r.resolveSegmentIntent(cw.id, { x: 2, y: 1.5 });
    expect(intent).toEqual({ kind: 'transom', orientation: 'horizontal', index: 1 });
  });

  it('respects a custom tolerance', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw }, { mullionEdgeToleranceM: 0.2 });
    // 1.6 is now within 0.2 m of the line at 1.5 → mullion
    expect(r.resolveSegmentIntent(cw.id, { x: 1.6, y: 0.75 }))
      .toEqual({ kind: 'mullion', orientation: 'vertical', index: 1 });
  });

  it('default tolerance constant matches doc', () => {
    expect(DEFAULT_MULLION_EDGE_TOLERANCE_M).toBeCloseTo(0.04, 5);
  });
});

describe('CurtainWallIntentResolver — validateGridCoordinate', () => {
  it('rejects out-of-range cells', () => {
    const cw = fixture(); // 4 cols × 2 rows
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.validateGridCoordinate(cw.id, -1, 0)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(r.validateGridCoordinate(cw.id, 0, 4)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(r.validateGridCoordinate(cw.id, 2, 0)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('rejects overlap with an existing panel', () => {
    const cw = fixture({
      panels: [{ id: 'p1', row: 0, col: 1, kind: 'glazed', rotation: 0 }],
    });
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.validateGridCoordinate(cw.id, 0, 1)).toEqual({ ok: false, reason: 'overlaps-existing' });
  });

  it('accepts a free, in-range cell', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.validateGridCoordinate(cw.id, 0, 0)).toEqual({ ok: true });
    expect(r.validateGridCoordinate(cw.id, 1, 3)).toEqual({ ok: true });
  });

  it('cellCount returns row/col counts', () => {
    const cw = fixture();
    const r = new CurtainWallIntentResolver({ [cw.id]: cw });
    expect(r.cellCount(cw.id)).toEqual({ rows: 2, cols: 4 });
  });
});
