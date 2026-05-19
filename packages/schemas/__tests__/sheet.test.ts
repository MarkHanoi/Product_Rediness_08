// SheetSchema + paper-size — round-trip + invariant coverage (S37 / Phase 2C).

import { describe, it, expect } from 'vitest';
import {
  SheetSchema,
  ViewportSchema,
  WidgetSchema,
  PAPER_SIZES,
  PLACEHOLDER_TITLE_BLOCK_ID,
  getSheetDimensions,
  isPaperSize,
  isOrientation,
  type SheetData,
} from '../src/sheet/index.js';

describe('paper-size', () => {
  it('exposes the 7 supported paper sizes', () => {
    expect(PAPER_SIZES).toEqual(['A0', 'A1', 'A2', 'A3', 'A4', 'ARCH-D', 'ARCH-E']);
  });

  it('returns the spec dimensions for A1 (594 × 841 mm portrait)', () => {
    const portrait = getSheetDimensions('A1', 'portrait');
    expect(portrait).toEqual({ widthMm: 594, heightMm: 841 });
    const landscape = getSheetDimensions('A1', 'landscape');
    expect(landscape).toEqual({ widthMm: 841, heightMm: 594 });
  });

  it('A0 area is approximately 1 m² (the ISO A definition)', () => {
    const { widthMm, heightMm } = getSheetDimensions('A0', 'portrait');
    const areaM2 = (widthMm * heightMm) / 1_000_000;
    expect(areaM2).toBeGreaterThan(0.99);
    expect(areaM2).toBeLessThan(1.01);
  });

  it('halving the long side of A(n) approximately yields A(n+1)', () => {
    // ISO 216 rounds to whole mm — A1.height = 841, A2.width = 420,
    // so 841/2 = 420.5 vs 420 (diff = 0.5).  Tolerance of 1 mm is the
    // documented ISO rounding allowance.
    const a1 = getSheetDimensions('A1', 'portrait');
    const a2 = getSheetDimensions('A2', 'portrait');
    expect(Math.abs(a2.widthMm - a1.heightMm / 2)).toBeLessThanOrEqual(1);
  });

  it('ARCH-D = 24 × 36 in (609.6 × 914.4 mm portrait)', () => {
    expect(getSheetDimensions('ARCH-D', 'portrait')).toEqual({ widthMm: 609.6, heightMm: 914.4 });
  });

  it('ARCH-E = 36 × 48 in (914.4 × 1219.2 mm portrait)', () => {
    expect(getSheetDimensions('ARCH-E', 'portrait')).toEqual({ widthMm: 914.4, heightMm: 1219.2 });
  });

  it('rejects unknown sizes', () => {
    // Force the bad input through a cast — runtime guard is what matters.
    expect(() => getSheetDimensions('B5' as never, 'portrait')).toThrow(/unknown PaperSize/);
  });

  it('isPaperSize / isOrientation predicates accept valid values, reject everything else', () => {
    expect(isPaperSize('A3')).toBe(true);
    expect(isPaperSize('B5')).toBe(false);
    expect(isPaperSize(null)).toBe(false);
    expect(isOrientation('landscape')).toBe(true);
    expect(isOrientation('portrait')).toBe(true);
    expect(isOrientation('square')).toBe(false);
  });
});

describe('ViewportSchema', () => {
  it('parses a minimal viewport with no clipping box', () => {
    const v = ViewportSchema.parse({
      id: 'vp-1', viewId: 'view-default-3d',
      x: 10, y: 20, width: 100, height: 80, scale: 50,
    });
    expect(v.clippingBox).toBeUndefined();
    expect(v.scale).toBe(50);
  });

  it('parses a clipping box', () => {
    const v = ViewportSchema.parse({
      id: 'vp-2', viewId: 'view-1',
      x: 0, y: 0, width: 100, height: 100, scale: 100,
      clippingBox: { x: 5, y: 5, width: 50, height: 50 },
    });
    expect(v.clippingBox).toEqual({ x: 5, y: 5, width: 50, height: 50 });
  });

  it('rejects non-positive width / height / scale', () => {
    expect(() => ViewportSchema.parse({
      id: 'vp', viewId: 'v', x: 0, y: 0, width: 0, height: 1, scale: 1,
    })).toThrow();
    expect(() => ViewportSchema.parse({
      id: 'vp', viewId: 'v', x: 0, y: 0, width: 1, height: 1, scale: -1,
    })).toThrow();
  });
});

describe('WidgetSchema', () => {
  it('defaults payload to {}', () => {
    const w = WidgetSchema.parse({ id: 'w', kind: 'text', x: 0, y: 0, width: 30, height: 10 });
    expect(w.payload).toEqual({});
  });
});

describe('SheetSchema', () => {
  const seed: Partial<SheetData> = {
    id: 'sheet-001', name: 'Site Plan', number: 'A-001',
    size: 'A1', orientation: 'landscape',
    titleBlockId: PLACEHOLDER_TITLE_BLOCK_ID,
    seq: 0,
  };

  it('round-trips an A1 landscape sheet with one viewport', () => {
    const parsed = SheetSchema.parse({
      ...seed,
      viewports: [{
        id: 'vp', viewId: 'view-default-3d',
        x: 10, y: 10, width: 200, height: 150, scale: 50,
      }],
    });
    const reparsed = SheetSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it('defaults viewports/widgets/revision/issue when omitted', () => {
    const s = SheetSchema.parse(seed);
    expect(s.viewports).toEqual([]);
    expect(s.widgets).toEqual([]);
    expect(s.revision).toBe('');
    expect(s.issue).toBe('');
  });

  it('rejects unknown size / orientation', () => {
    expect(() => SheetSchema.parse({ ...seed, size: 'B5' })).toThrow();
    expect(() => SheetSchema.parse({ ...seed, orientation: 'square' })).toThrow();
  });

  it('rejects negative seq', () => {
    expect(() => SheetSchema.parse({ ...seed, seq: -1 })).toThrow();
  });

  it('rejects empty name / number / titleBlockId', () => {
    expect(() => SheetSchema.parse({ ...seed, name: '' })).toThrow();
    expect(() => SheetSchema.parse({ ...seed, number: '' })).toThrow();
    expect(() => SheetSchema.parse({ ...seed, titleBlockId: '' })).toThrow();
  });

  it('exposes a placeholder title-block id constant for S37', () => {
    expect(typeof PLACEHOLDER_TITLE_BLOCK_ID).toBe('string');
    expect(PLACEHOLDER_TITLE_BLOCK_ID.length).toBeGreaterThan(0);
  });
});
