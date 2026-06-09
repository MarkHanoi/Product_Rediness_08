// C24 — Sheet composition engine (DOC-AUTO DS1) — buildSheetFromViews tests.
//
// Pure-data assertions only: the helper is L2 so the tests stay L2. The
// round-trip test pipes the result through `sheetToSvgWithContent` to prove
// the shape is composer-ready.

import { describe, expect, it } from 'vitest';
import {
  buildSheetFromViews,
  validateSheet,
  viewportBoundsOverlap,
  sheetToSvgWithContent,
  _pickGridColumns,
  type PlacedView,
  type Sheet,
} from '../src/index.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const FIXED_NOW = (): Date => new Date('2026-06-01T00:00:00Z');

/** A square view of `sizeMm` model-mm centred at the origin. */
function squareView(
  id: string,
  sizeMm: number,
  extra?: Partial<PlacedView>,
): PlacedView {
  const h = sizeMm / 2;
  return {
    id,
    contentBounds: { minX: -h, minY: -h, maxX: h, maxY: h },
    content: {
      viewportId: 'placeholder',
      polygons: [
        {
          points: [
            { x: -h, y: -h },
            { x: h, y: -h },
            { x: h, y: h },
            { x: -h, y: h },
          ],
          fill: '#e2e8f0',
        },
      ],
    },
    ...(extra ?? {}),
  };
}

/** Assert a viewport sits fully inside `paper minus margins` (default 25). */
function assertInsidePaperMinusMargins(
  sheet: Sheet,
  marginMm = 25,
): void {
  for (const vp of sheet.viewports) {
    const b = vp.bounds;
    expect(b.xMm).toBeGreaterThanOrEqual(marginMm - 1e-6);
    expect(b.yMm).toBeGreaterThanOrEqual(marginMm - 1e-6);
    expect(b.xMm + b.widthMm).toBeLessThanOrEqual(sheet.paper.widthMm - marginMm + 1e-6);
    expect(b.yMm + b.heightMm).toBeLessThanOrEqual(sheet.paper.heightMm - marginMm + 1e-6);
  }
}

// ── empty views ─────────────────────────────────────────────────────────────

describe('buildSheetFromViews — empty input', () => {
  it('produces a valid sheet with NO viewports and empty content map', () => {
    const { sheet, contentByViewportId } = buildSheetFromViews([], { now: FIXED_NOW });
    expect(sheet.id).toBe('sheet-1');
    expect(sheet.viewports).toHaveLength(0);
    expect(contentByViewportId.size).toBe(0);
    expect(validateSheet(sheet)).toEqual({ valid: true });
  });
});

// ── single view ─────────────────────────────────────────────────────────────

describe('buildSheetFromViews — single view', () => {
  it('emits one viewport contained within paper minus margins', () => {
    const { sheet, contentByViewportId } = buildSheetFromViews([squareView('v1', 1000)], {
      paperName: 'A3',
      orientation: 'landscape',
      now: FIXED_NOW,
    });

    expect(sheet.viewports).toHaveLength(1);
    expect(validateSheet(sheet)).toEqual({ valid: true });
    assertInsidePaperMinusMargins(sheet);

    const vp = sheet.viewports[0]!;
    // 1000 mm / 50 = 20 mm — fits an A3 cell, so the largest scale (50) wins.
    expect(vp.scale).toBe(50);
    expect(vp.sourceRef).toBe('v1');

    // ONE content entry, keyed by — and bound to — the viewport's id.
    expect(contentByViewportId.size).toBe(1);
    const content = contentByViewportId.get(vp.id);
    expect(content).toBeDefined();
    expect(content!.viewportId).toBe(vp.id);
    expect(content!.modelBounds).toEqual({ minX: -500, minY: -500, maxX: 500, maxY: 500 });
    expect(content!.polygons).toHaveLength(1);
  });

  it('honours a preferredScale when it fits the cell', () => {
    const { sheet } = buildSheetFromViews([squareView('v1', 1000, { preferredScale: 100 })], {
      now: FIXED_NOW,
    });
    expect(sheet.viewports[0]!.scale).toBe(100);
  });
});

// ── multiple views ──────────────────────────────────────────────────────────

describe('buildSheetFromViews — multiple views', () => {
  it('emits N non-overlapping viewports, all inside the paper, each at a chosen scale', () => {
    const views: PlacedView[] = [
      squareView('a', 1000),
      squareView('b', 2000),
      squareView('c', 1500),
      squareView('d', 3000),
    ];
    const { sheet } = buildSheetFromViews(views, {
      paperName: 'A3',
      orientation: 'landscape',
      now: FIXED_NOW,
    });

    expect(sheet.viewports).toHaveLength(4);
    expect(validateSheet(sheet)).toEqual({ valid: true });
    assertInsidePaperMinusMargins(sheet);

    // Each viewport at a positive allowed scale.
    for (const vp of sheet.viewports) {
      expect([50, 100, 200, 500, 1000]).toContain(vp.scale);
    }

    // No two viewports overlap.
    for (let i = 0; i < sheet.viewports.length; i++) {
      for (let j = i + 1; j < sheet.viewports.length; j++) {
        expect(
          viewportBoundsOverlap(sheet.viewports[i]!.bounds, sheet.viewports[j]!.bounds),
        ).toBe(false);
      }
    }
  });

  it('is deterministic — identical input yields identical output', () => {
    const make = (): PlacedView[] => [
      squareView('a', 1000),
      squareView('b', 2000),
      squareView('c', 1500),
      squareView('d', 3000),
      squareView('e', 800),
    ];
    const r1 = buildSheetFromViews(make(), { now: FIXED_NOW });
    const r2 = buildSheetFromViews(make(), { now: FIXED_NOW });
    expect(r1.sheet).toEqual(r2.sheet);
    expect([...r1.contentByViewportId.entries()]).toEqual([...r2.contentByViewportId.entries()]);
  });
});

// ── grid column picker ──────────────────────────────────────────────────────

describe('_pickGridColumns', () => {
  it('returns 1 for a single cell', () => {
    expect(_pickGridColumns(1, 300, 200, 10)).toBe(1);
  });

  it('prefers a 2×2 grid for 4 cells on a near-square region', () => {
    expect(_pickGridColumns(4, 300, 300, 10)).toBe(2);
  });

  it('uses more columns for a wide region', () => {
    // Very wide region → squarest cells come from spreading across columns.
    expect(_pickGridColumns(4, 1200, 100, 10)).toBeGreaterThan(2);
  });
});

// ── title block flow-through ────────────────────────────────────────────────

describe('buildSheetFromViews — title block', () => {
  it('project/sheet metadata + author flow into the title block', () => {
    const { sheet } = buildSheetFromViews([squareView('a', 1000)], {
      projectName: 'PRYZM Demo',
      sheetNumber: 'A-301',
      sheetName: 'Level Plans',
      author: 'Mark',
      now: FIXED_NOW,
    });
    expect(sheet.titleBlock.projectName).toBe('PRYZM Demo');
    expect(sheet.titleBlock.sheetNumber).toBe('A-301');
    expect(sheet.titleBlock.sheetName).toBe('Level Plans');
    expect(sheet.titleBlock.author).toBe('Mark');
    expect(sheet.titleBlock.date).toBe('2026-06-01');
  });
});

// ── custom sheetId ──────────────────────────────────────────────────────────

describe('buildSheetFromViews — sheetId', () => {
  it('honours a custom sheetId in the viewport ids', () => {
    const { sheet } = buildSheetFromViews([squareView('a', 1000), squareView('b', 1000)], {
      sheetId: 'sheet-42',
      now: FIXED_NOW,
    });
    expect(sheet.id).toBe('sheet-42');
    expect(sheet.viewports[0]!.id).toBe('sheet-42-vp-1');
    expect(sheet.viewports[1]!.id).toBe('sheet-42-vp-2');
  });
});

// ── round-trip via sheetToSvgWithContent ────────────────────────────────────

describe('buildSheetFromViews — round-trip', () => {
  it('result feeds straight into sheetToSvgWithContent and produces a valid SVG', () => {
    const views: PlacedView[] = [
      squareView('plan-l1', 4000, { label: 'Level 1' }),
      squareView('plan-l2', 4000, { label: 'Level 2' }),
    ];
    const { sheet, contentByViewportId } = buildSheetFromViews(views, {
      projectName: 'RT-Demo',
      now: FIXED_NOW,
    });
    const svg = sheetToSvgWithContent(sheet, contentByViewportId);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg.includes('<svg')).toBe(true);
    expect(svg.includes('</svg>')).toBe(true);
    expect(svg.includes('RT-Demo')).toBe(true);
  });
});
