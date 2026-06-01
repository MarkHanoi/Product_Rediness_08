// C29 / C24 — Sheet composition primitives (sheet-α-1) tests.

import { describe, expect, it } from 'vitest';
import {
  PAPER_SIZES_MM,
  paperSize,
  customPaper,
  defaultTitleBlock,
  formatScale,
  viewportArea,
  viewportBoundsContain,
  viewportBoundsOverlap,
  addViewport,
  removeViewport,
  findViewportAt,
  validateSheet,
  type PaperSize,
  type Sheet,
  type Viewport,
  type ViewportBounds,
} from '../src/index.js';

// ── helpers ────────────────────────────────────────────────────────────────

function bounds(xMm: number, yMm: number, widthMm: number, heightMm: number): ViewportBounds {
  return { xMm, yMm, widthMm, heightMm };
}

function vp(id: string, b: ViewportBounds, scale = 50): Viewport {
  return { id, bounds: b, scale, viewType: 'plan', sourceRef: 'level-1' };
}

function emptyA1Sheet(): Sheet {
  return {
    id: 'sheet-1',
    paper: paperSize('A1', 'landscape'),
    titleBlock: defaultTitleBlock('P', '01', 'Plan', () => new Date('2026-06-01T00:00:00Z')),
    viewports: [],
  };
}

// ── PaperSize ──────────────────────────────────────────────────────────────

describe('PaperSize', () => {
  it('all 7 paper sizes have positive dimensions', () => {
    const names = Object.keys(PAPER_SIZES_MM);
    expect(names).toHaveLength(7);
    for (const name of names) {
      const { width, height } = PAPER_SIZES_MM[name as keyof typeof PAPER_SIZES_MM];
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  it("paperSize('A4') returns 210x297 portrait", () => {
    const p = paperSize('A4');
    expect(p.widthMm).toBe(210);
    expect(p.heightMm).toBe(297);
    expect(p.orientation).toBe('portrait');
    expect(p.name).toBe('A4');
  });

  it("paperSize('A4', 'landscape') returns 297x210", () => {
    const p = paperSize('A4', 'landscape');
    expect(p.widthMm).toBe(297);
    expect(p.heightMm).toBe(210);
    expect(p.orientation).toBe('landscape');
  });

  it('customPaper(500, 300) infers landscape', () => {
    const p = customPaper(500, 300);
    expect(p.name).toBe('custom');
    expect(p.widthMm).toBe(500);
    expect(p.heightMm).toBe(300);
    expect(p.orientation).toBe('landscape');
  });

  it('customPaper(300, 500) infers portrait', () => {
    const p = customPaper(300, 500);
    expect(p.name).toBe('custom');
    expect(p.widthMm).toBe(300);
    expect(p.heightMm).toBe(500);
    expect(p.orientation).toBe('portrait');
  });
});

// ── TitleBlock ─────────────────────────────────────────────────────────────

describe('TitleBlock', () => {
  it('defaultTitleBlock() pre-fills required fields + date + revision=A', () => {
    const fixedNow = () => new Date('2026-06-01T12:34:56Z');
    const tb = defaultTitleBlock('Project X', 'A-101', 'Ground Floor Plan', fixedNow);
    expect(tb.projectName).toBe('Project X');
    expect(tb.sheetNumber).toBe('A-101');
    expect(tb.sheetName).toBe('Ground Floor Plan');
    expect(tb.revision).toBe('A');
    expect(tb.date).toBe('2026-06-01');
  });

  it('formatScale(1/50) === "1:50"', () => {
    expect(formatScale(1 / 50)).toBe('1:50');
  });

  it('formatScale(1/100) === "1:100"', () => {
    expect(formatScale(1 / 100)).toBe('1:100');
  });

  it('formatScale(0.5) === "1:2"', () => {
    expect(formatScale(0.5)).toBe('1:2');
  });

  it('formatScale(2) === "2:1"', () => {
    expect(formatScale(2)).toBe('2:1');
  });

  it('formatScale(1) === "1:1"', () => {
    expect(formatScale(1)).toBe('1:1');
  });
});

// ── Viewport ───────────────────────────────────────────────────────────────

describe('Viewport', () => {
  it('viewportArea returns width x height', () => {
    const v = vp('v1', bounds(10, 20, 100, 50));
    expect(viewportArea(v)).toBe(100 * 50);
  });

  it('viewportBoundsContain: inside hit, outside miss, inclusive edge hit', () => {
    const b = bounds(0, 0, 100, 50);
    expect(viewportBoundsContain(b, 50, 25)).toBe(true);
    expect(viewportBoundsContain(b, 200, 25)).toBe(false);
    expect(viewportBoundsContain(b, -1, 25)).toBe(false);
    expect(viewportBoundsContain(b, 100, 50)).toBe(true);
    expect(viewportBoundsContain(b, 0, 0)).toBe(true);
  });

  it('viewportBoundsOverlap: overlap=true, abut=false, nested=true', () => {
    const a = bounds(0, 0, 100, 100);
    const overlap = bounds(50, 50, 100, 100);
    const abut = bounds(100, 0, 100, 100);
    const nested = bounds(25, 25, 10, 10);

    expect(viewportBoundsOverlap(a, overlap)).toBe(true);
    expect(viewportBoundsOverlap(a, abut)).toBe(false);
    expect(viewportBoundsOverlap(a, nested)).toBe(true);
  });
});

// ── Sheet ──────────────────────────────────────────────────────────────────

describe('Sheet', () => {
  it('addViewport is pure (original sheet unchanged)', () => {
    const sheet = emptyA1Sheet();
    const v = vp('v1', bounds(10, 10, 100, 100));
    const next = addViewport(sheet, v);
    expect(sheet.viewports).toHaveLength(0);
    expect(next.viewports).toHaveLength(1);
    expect(next.viewports[0]).toBe(v);
    expect(next).not.toBe(sheet);
  });

  it('removeViewport drops the right one and is pure', () => {
    const v1 = vp('v1', bounds(10, 10, 100, 100));
    const v2 = vp('v2', bounds(200, 10, 100, 100));
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [v1, v2] };
    const next = removeViewport(sheet, 'v1');

    expect(sheet.viewports).toHaveLength(2);
    expect(next.viewports).toHaveLength(1);
    expect(next.viewports[0]?.id).toBe('v2');
    expect(next).not.toBe(sheet);
  });

  it('findViewportAt returns the last-added when two overlap at the point', () => {
    const lower = vp('lower', bounds(0, 0, 200, 200));
    const upper = vp('upper', bounds(50, 50, 100, 100));
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [lower, upper] };
    const hit = findViewportAt(sheet, 100, 100);
    expect(hit?.id).toBe('upper');
  });

  it('findViewportAt returns undefined when nothing is hit', () => {
    const v = vp('v1', bounds(0, 0, 100, 100));
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [v] };
    expect(findViewportAt(sheet, 500, 500)).toBeUndefined();
  });

  it('validateSheet flags out-of-paper viewport', () => {
    // A1 landscape paper is 841 x 594 mm.
    const v = vp('v1', bounds(800, 500, 200, 200));
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [v] };
    const result = validateSheet(sheet);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.includes('outside the paper'))).toBe(true);
    }
  });

  it('validateSheet flags duplicate viewport ids', () => {
    const v1 = vp('dup', bounds(10, 10, 100, 100));
    const v2 = vp('dup', bounds(200, 10, 100, 100));
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [v1, v2] };
    const result = validateSheet(sheet);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.includes('duplicate viewport id'))).toBe(true);
    }
  });

  it('validateSheet flags non-positive scale', () => {
    const v: Viewport = { ...vp('v1', bounds(10, 10, 100, 100)), scale: 0 };
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [v] };
    const result = validateSheet(sheet);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons.some((r) => r.includes('non-positive scale'))).toBe(true);
    }
  });

  it('validateSheet passes legal overlapping viewports', () => {
    const v1 = vp('plan', bounds(50, 50, 500, 400));
    const v2 = vp('detail', bounds(100, 100, 80, 80));
    const sheet: Sheet = { ...emptyA1Sheet(), viewports: [v1, v2] };
    const result = validateSheet(sheet);
    expect(result.valid).toBe(true);
  });

  it('validateSheet passes empty viewport list', () => {
    const result = validateSheet(emptyA1Sheet());
    expect(result.valid).toBe(true);
  });
});

// Sanity export — used to keep `PaperSize` type referenced when downstream
// callers `import type` it. Pure-data smoke test.
describe('PaperSize type export', () => {
  it('is structurally usable as a record', () => {
    const p: PaperSize = paperSize('A3');
    expect(p.widthMm).toBe(297);
  });
});
