// C29 PDF-α-1 — sheetToPdfBytes unit tests.

import {
  customPaper,
  defaultTitleBlock,
  paperSize,
  type Sheet,
  type Viewport,
  type ViewportContent,
} from '@pryzm/drawing-primitives';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { mmToPt, sheetToPdfBytes } from '../src/SheetToPdf.js';

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

const fixedNow = () => new Date('2026-06-01T00:00:00Z');

function makeViewport(id: string, overrides: Partial<Viewport> = {}): Viewport {
  return {
    id,
    bounds: { xMm: 20, yMm: 50, widthMm: 200, heightMm: 150 },
    scale: 50,
    viewType: 'plan',
    sourceRef: 'level-1',
    ...overrides,
  };
}

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 's-1',
    paper: paperSize('A4', 'portrait'),
    titleBlock: defaultTitleBlock('Test Project', 'A101', 'Plan', fixedNow),
    viewports: [makeViewport('vp-1')],
    ...overrides,
  };
}

function emptyContentMap(): ReadonlyMap<string, ViewportContent> {
  return new Map();
}

function decodeBytes(bytes: Uint8Array): string {
  // Latin-1 decode preserves byte-for-byte values for the PDF byte stream.
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('sheetToPdfBytes — bytes shape', () => {
  it('returns a Uint8Array', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('first 5 bytes are %PDF-', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap());
    const head = String.fromCharCode(...bytes.slice(0, 5));
    expect(head).toBe('%PDF-');
  });

  it('byte stream contains %%EOF near the tail', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap());
    const tail = decodeBytes(bytes.slice(Math.max(0, bytes.length - 64)));
    expect(tail).toContain('%%EOF');
  });
});

describe('sheetToPdfBytes — empty + sparse sheets', () => {
  it('empty content map → PDF generated successfully', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap());
    expect(bytes.byteLength).toBeGreaterThan(100);
    // Round-trip to prove the bytes are actually a valid PDF.
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('sheet with no viewports → PDF generated successfully', async () => {
    const bytes = await sheetToPdfBytes(
      makeSheet({ viewports: [] }),
      emptyContentMap(),
    );
    expect(bytes.byteLength).toBeGreaterThan(100);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });
});

describe('sheetToPdfBytes — metadata flow-through', () => {
  it('title / author / subject / keywords flow through to the PDF info dictionary', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap(), {
      title: 'My Sheet',
      author: 'PRYZM Bot',
      subject: 'Unit test',
      keywords: 'pryzm test pdf',
    });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getTitle()).toBe('My Sheet');
    expect(parsed.getAuthor()).toBe('PRYZM Bot');
    expect(parsed.getSubject()).toBe('Unit test');
    // Keywords round-trips as a string (pdf-lib normalises the array form).
    expect(parsed.getKeywords()).toBeDefined();
  });

  it('omitted metadata leaves the info dictionary unset', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap());
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getTitle()).toBeUndefined();
    expect(parsed.getAuthor()).toBeUndefined();
  });
});

describe('sheetToPdfBytes — page dimensions', () => {
  const PT_TOL = 0.1;

  it('A4 portrait → MediaBox ≈ 595.28 × 841.89 pt', async () => {
    const bytes = await sheetToPdfBytes(makeSheet(), emptyContentMap());
    const parsed = await PDFDocument.load(bytes);
    const page = parsed.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mmToPt(210), 1);
    expect(page.getHeight()).toBeCloseTo(mmToPt(297), 1);
    // Sanity-check the absolute numbers as well (1 mm = 72/25.4 pt).
    expect(Math.abs(page.getWidth() - 595.2755905511812)).toBeLessThan(PT_TOL);
    expect(Math.abs(page.getHeight() - 841.8897637795276)).toBeLessThan(PT_TOL);
  });

  it('A4 landscape → MediaBox ≈ 841.89 × 595.28 pt', async () => {
    const sheet = makeSheet({ paper: paperSize('A4', 'landscape') });
    const bytes = await sheetToPdfBytes(sheet, emptyContentMap());
    const parsed = await PDFDocument.load(bytes);
    const page = parsed.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mmToPt(297), 1);
    expect(page.getHeight()).toBeCloseTo(mmToPt(210), 1);
  });

  it('custom paper 500 × 300 mm → MediaBox dimensions match', async () => {
    const sheet = makeSheet({ paper: customPaper(500, 300) });
    const bytes = await sheetToPdfBytes(sheet, emptyContentMap());
    const parsed = await PDFDocument.load(bytes);
    const page = parsed.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mmToPt(500), 1);
    expect(page.getHeight()).toBeCloseTo(mmToPt(300), 1);
  });
});

describe('sheetToPdfBytes — visual sanity (byte-size deltas)', () => {
  it('grid spacing produces a larger PDF than no grid', async () => {
    const noGrid = makeSheet();
    const withGrid = makeSheet({ gridSpacingMm: 10 });
    const a = await sheetToPdfBytes(noGrid, emptyContentMap());
    const b = await sheetToPdfBytes(withGrid, emptyContentMap());
    expect(b.byteLength).toBeGreaterThan(a.byteLength);
  });

  it('viewport content (one polygon) produces a larger PDF than empty content', async () => {
    const sheet = makeSheet();
    const empty = emptyContentMap();
    const withPolygon = new Map<string, ViewportContent>([
      [
        'vp-1',
        {
          viewportId: 'vp-1',
          polygons: [
            {
              points: [
                { x: 0, y: 0 },
                { x: 5000, y: 0 },
                { x: 5000, y: 3000 },
                { x: 0, y: 3000 },
              ],
              fill: '#cccccc',
              stroke: '#000000',
            },
          ],
        },
      ],
    ]);
    const a = await sheetToPdfBytes(sheet, empty);
    const b = await sheetToPdfBytes(sheet, withPolygon);
    expect(b.byteLength).toBeGreaterThan(a.byteLength);
  });

  it('viewport label option produces a larger PDF when a label is set', async () => {
    const sheet = makeSheet({
      viewports: [makeViewport('vp-1', { label: 'PLAN — LEVEL 1' })],
    });
    const a = await sheetToPdfBytes(sheet, emptyContentMap(), {
      includeViewportLabels: false,
    });
    const b = await sheetToPdfBytes(sheet, emptyContentMap(), {
      includeViewportLabels: true,
    });
    expect(b.byteLength).toBeGreaterThan(a.byteLength);
  });
});

describe('sheetToPdfBytes — round-trip parseability', () => {
  it('PDFDocument.load accepts the emitted bytes (round-trip)', async () => {
    const sheet = makeSheet({
      gridSpacingMm: 25,
      viewports: [
        makeViewport('vp-1'),
        makeViewport('vp-2', {
          bounds: { xMm: 20, yMm: 220, widthMm: 100, heightMm: 50 },
          label: 'detail',
        }),
      ],
    });
    const content = new Map<string, ViewportContent>([
      [
        'vp-1',
        {
          viewportId: 'vp-1',
          polygons: [
            {
              points: [
                { x: 0, y: 0 },
                { x: 4000, y: 0 },
                { x: 4000, y: 3000 },
                { x: 0, y: 3000 },
              ],
              fill: '#eeeeee',
              label: 'living',
            },
          ],
          lines: [
            {
              points: [
                { x: 0, y: 0 },
                { x: 4000, y: 3000 },
              ],
              stroke: '#0000ff',
              strokeMm: 80,
            },
          ],
          texts: [
            { position: { x: 1000, y: 1000 }, text: 'A', anchor: 'middle' },
          ],
        },
      ],
    ]);
    const bytes = await sheetToPdfBytes(sheet, content, {
      title: 'Round-trip',
      author: 'test',
    });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getTitle()).toBe('Round-trip');
  });
});

describe('sheetToPdfBytes — content-map filtering', () => {
  it('content for an unknown viewport id is silently ignored', async () => {
    const sheet = makeSheet();
    const content = new Map<string, ViewportContent>([
      [
        'not-a-real-vp',
        {
          viewportId: 'not-a-real-vp',
          polygons: [
            {
              points: [
                { x: 0, y: 0 },
                { x: 1000, y: 0 },
                { x: 1000, y: 1000 },
              ],
            },
          ],
        },
      ],
    ]);
    // Should not throw, and should produce roughly the same byte stream as
    // the empty-content baseline (the unknown id contributes nothing).
    const bytes = await sheetToPdfBytes(sheet, content);
    expect(bytes.byteLength).toBeGreaterThan(100);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });
});

describe('mmToPt — pure helper', () => {
  it('converts millimetres to PDF points (72 / 25.4 ratio)', () => {
    expect(mmToPt(0)).toBe(0);
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
    expect(mmToPt(210)).toBeCloseTo(595.2755905511812, 6);
    expect(mmToPt(297)).toBeCloseTo(841.8897637795276, 6);
  });
});
