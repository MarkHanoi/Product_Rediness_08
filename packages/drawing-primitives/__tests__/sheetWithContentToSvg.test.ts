// C24 — Sheet composition engine (SHT-α-4) composed-renderer tests.
//
// Pure-string assertions only: we never mount SVG into a DOM. The composer
// is L2, so the test surface is also L2-only.

import { describe, expect, it } from 'vitest';
import {
  addViewport,
  defaultContentMap,
  defaultTitleBlock,
  paperSize,
  sheetToSvg,
  sheetToSvgWithContent,
  type PolygonShape,
  type Sheet,
  type SheetWithContentToSvgOptions,
  type Viewport,
  type ViewportBounds,
  type ViewportContent,
} from '../src/index.js';

// ── helpers ────────────────────────────────────────────────────────────────

function bounds(xMm: number, yMm: number, widthMm: number, heightMm: number): ViewportBounds {
  return { xMm, yMm, widthMm, heightMm };
}

function vp(id: string, b: ViewportBounds, scale = 50, label?: string): Viewport {
  return {
    id,
    bounds: b,
    scale,
    viewType: 'plan',
    sourceRef: 'level-1',
    ...(label !== undefined ? { label } : {}),
  };
}

function a4Portrait(opts?: Partial<Sheet>): Sheet {
  return {
    id: 'sheet-1',
    paper: paperSize('A4'),
    titleBlock: defaultTitleBlock(
      'Demo',
      'A-101',
      'Plan',
      () => new Date('2026-06-01T00:00:00Z'),
    ),
    viewports: [],
    ...(opts ?? {}),
  };
}

function squareModel(): PolygonShape {
  return {
    points: [
      { x: -500, y: -500 },
      { x: 500, y: -500 },
      { x: 500, y: 500 },
      { x: -500, y: 500 },
    ],
  };
}

// Count non-overlapping occurrences of a substring.
function count(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let n = 0;
  let i = 0;
  while (true) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) return n;
    n++;
    i = j + needle.length;
  }
}

// ── empty content map ──────────────────────────────────────────────────────

describe('sheetToSvgWithContent — empty content map', () => {
  it('output matches sheetToSvg exactly when the map is empty', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 50, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const composed = sheetToSvgWithContent(sheet, new Map());
    const frameOnly = sheetToSvg(sheet);
    expect(composed).toBe(frameOnly);
  });

  it('content for a viewport id NOT on the sheet is silently ignored', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 50, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const stray: ViewportContent = {
      viewportId: 'does-not-exist',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(
      sheet,
      new Map([['does-not-exist', stray]]),
    );
    // No <path> emitted because the viewport id was not on the sheet.
    expect(composed).not.toContain('<path');
    // Same shape as the bare frame.
    expect(composed).toBe(sheetToSvg(sheet));
  });
});

// ── one viewport with content ─────────────────────────────────────────────

describe('sheetToSvgWithContent — basic composition', () => {
  it('one viewport with content emits BOTH the frame rect AND the content path', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));
    // Frame's viewport rect (fill="none") is present.
    expect(composed).toMatch(/<rect x="0" y="0" width="100" height="100"[^>]*fill="none"[^>]*\/>/);
    // Content path is present.
    expect(composed).toContain('<path ');
    expect(composed).toContain('M 45 45 L 55 45 L 55 55 L 45 55 Z');
  });

  it('output starts with the XML declaration', () => {
    const composed = sheetToSvgWithContent(a4Portrait(), new Map());
    expect(composed.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('output has exactly one <svg> root tag', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));
    expect(count(composed, '<svg ')).toBe(1);
    expect(count(composed, '</svg>')).toBe(1);
    expect(composed.trim().endsWith('</svg>')).toBe(true);
  });
});

// ── partial composition ───────────────────────────────────────────────────

describe('sheetToSvgWithContent — partial composition', () => {
  it('two viewports, content for only one → other gets just the empty frame rect', () => {
    const v1 = vp('vp1', bounds(0, 0, 80, 80), 100, 'A');
    const v2 = vp('vp2', bounds(100, 0, 80, 80), 100, 'B');
    const sheet: Sheet = { ...a4Portrait(), viewports: [v1, v2] };

    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));

    // Both frame rects are present.
    expect(composed).toContain('<rect x="0" y="0" width="80" height="80"');
    expect(composed).toContain('<rect x="100" y="0" width="80" height="80"');
    // Exactly ONE content clipPath (only vp1 has content).
    expect(count(composed, '<clipPath id="vp-clip-')).toBe(1);
    expect(composed).toContain('<clipPath id="vp-clip-vp1">');
    expect(composed).not.toContain('<clipPath id="vp-clip-vp2">');
    // Exactly ONE content <path>.
    expect(count(composed, '<path ')).toBe(1);
  });
});

// ── well-formedness ───────────────────────────────────────────────────────

describe('sheetToSvgWithContent — well-formedness', () => {
  it('balanced <g>/</g>, <text>/</text>, <svg>/</svg>', () => {
    const v1 = vp('vp1', bounds(0, 0, 80, 80), 100, 'A');
    const v2 = vp('vp2', bounds(100, 0, 80, 80), 100, 'B');
    const sheet: Sheet = {
      ...a4Portrait(),
      gridSpacingMm: 10,
      viewports: [v1, v2],
    };

    const content1: ViewportContent = {
      viewportId: 'vp1',
      polygons: [{ ...squareModel(), label: 'Living' }],
      lines: [{ points: [{ x: -500, y: 0 }, { x: 500, y: 0 }] }],
      texts: [{ position: { x: 0, y: 0 }, text: 'note' }],
    };
    const content2: ViewportContent = {
      viewportId: 'vp2',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(
      sheet,
      new Map([
        ['vp1', content1],
        ['vp2', content2],
      ]),
    );

    const opens = count(composed, '<g ') + count(composed, '<g>');
    const closes = count(composed, '</g>');
    expect(opens).toBe(closes);
    expect(count(composed, '<text')).toBe(count(composed, '</text>'));
    expect(count(composed, '<svg ')).toBe(count(composed, '</svg>'));
    expect(count(composed, '<clipPath')).toBe(count(composed, '</clipPath>'));
  });

  it('paper border rect and title block survive composition (regression check)', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));
    // Paper rect at (0,0) with full A4 portrait dims.
    expect(composed).toMatch(/<rect x="0" y="0" width="210" height="297"[^>]*\/>/);
    // Default title-block rect at (30, 0) width=180 height=60.
    expect(composed).toMatch(/<rect x="30" y="0" width="180" height="60"[^>]*\/>/);
    expect(composed).toContain('PROJECT: Demo');
    expect(composed).toContain('SHEET A-101 - Plan');
  });
});

// ── option forwarding ─────────────────────────────────────────────────────

describe('sheetToSvgWithContent — option forwarding', () => {
  it('frame options (gridStrokeMm + gridColor) flow to sheetToSvg', () => {
    const sheet: Sheet = { ...a4Portrait(), gridSpacingMm: 10 };
    const opts: SheetWithContentToSvgOptions = {
      gridStrokeMm: 0.25,
      gridColor: '#ff00ff',
    };
    const composed = sheetToSvgWithContent(sheet, new Map(), opts);
    expect(composed).toContain('stroke="#ff00ff"');
    expect(composed).toContain('stroke-width="0.25"');
  });

  it('content options (defaultStroke) flow to viewportContentToSvg', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [squareModel()],
    };
    const opts: SheetWithContentToSvgOptions = {
      defaultStroke: '#123456',
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]), opts);
    // The polygon's stroke uses the custom default.
    expect(composed).toContain('stroke="#123456"');
  });
});

// ── escaping (no double-escape) ───────────────────────────────────────────

describe('sheetToSvgWithContent — XML escaping', () => {
  it('escapes labels in viewport content (no double-escape)', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [{ ...squareModel(), label: 'Kitchen & Dining' }],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));
    expect(composed).toContain('Kitchen &amp; Dining');
    // Must NOT double-escape into &amp;amp;.
    expect(composed).not.toContain('&amp;amp;');
  });

  it('escapes titleBlock fields (no regression from SheetToSvg)', () => {
    const sheet: Sheet = {
      ...a4Portrait(),
      titleBlock: {
        ...a4Portrait().titleBlock,
        projectName: '<script>alert(1)</script>',
      },
    };
    const composed = sheetToSvgWithContent(sheet, new Map());
    expect(composed).not.toContain('<script');
    expect(composed).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

// ── defaultContentMap ─────────────────────────────────────────────────────

describe('defaultContentMap', () => {
  it('returns one entry per viewport with empty arrays', () => {
    const v1 = vp('vp1', bounds(0, 0, 80, 80), 100);
    const v2 = vp('vp2', bounds(100, 0, 80, 80), 100);
    const sheet: Sheet = { ...a4Portrait(), viewports: [v1, v2] };
    const map = defaultContentMap(sheet);
    expect(map.size).toBe(2);
    const c1 = map.get('vp1')!;
    const c2 = map.get('vp2')!;
    expect(c1.viewportId).toBe('vp1');
    expect(c1.polygons).toEqual([]);
    expect(c1.lines).toEqual([]);
    expect(c1.texts).toEqual([]);
    expect(c2.viewportId).toBe('vp2');
    expect(c2.polygons).toEqual([]);
  });

  it('returns an empty map for a sheet with no viewports', () => {
    const map = defaultContentMap(a4Portrait());
    expect(map.size).toBe(0);
  });
});

// ── round-trip ─────────────────────────────────────────────────────────────

describe('sheetToSvgWithContent — round-trip', () => {
  it('three viewports each with content → three distinct clipPath ids matching the viewport ids', () => {
    const v1 = vp('vpA', bounds(0, 0, 60, 60), 100, 'A');
    const v2 = vp('vpB', bounds(70, 0, 60, 60), 100, 'B');
    const v3 = vp('vpC', bounds(140, 0, 60, 60), 100, 'C');
    const sheet: Sheet = { ...a4Portrait(), viewports: [v1, v2, v3] };

    const map = new Map<string, ViewportContent>([
      ['vpA', { viewportId: 'vpA', polygons: [squareModel()] }],
      ['vpB', { viewportId: 'vpB', polygons: [squareModel()] }],
      ['vpC', { viewportId: 'vpC', polygons: [squareModel()] }],
    ]);
    const composed = sheetToSvgWithContent(sheet, map);

    expect(composed).toContain('<clipPath id="vp-clip-vpA">');
    expect(composed).toContain('<clipPath id="vp-clip-vpB">');
    expect(composed).toContain('<clipPath id="vp-clip-vpC">');
    // 3 distinct clipPath elements emitted from content.
    expect(count(composed, '<clipPath id="vp-clip-')).toBe(3);
    // 3 content <path> elements (one per viewport).
    expect(count(composed, '<path ')).toBe(3);
  });
});

// ── z-order ────────────────────────────────────────────────────────────────

describe('sheetToSvgWithContent — z-order', () => {
  it('later viewports content drawn ON TOP — last viewport content group appears after first', () => {
    const v1 = vp('first', bounds(0, 0, 80, 80), 100, 'First');
    const v2 = vp('second', bounds(0, 0, 80, 80), 100, 'Second');
    const sheet: Sheet = { ...a4Portrait(), viewports: [v1, v2] };

    const map = new Map<string, ViewportContent>([
      ['first', { viewportId: 'first', polygons: [squareModel()] }],
      ['second', { viewportId: 'second', polygons: [squareModel()] }],
    ]);
    const composed = sheetToSvgWithContent(sheet, map);

    const idxFirst = composed.indexOf('<clipPath id="vp-clip-first">');
    const idxSecond = composed.indexOf('<clipPath id="vp-clip-second">');
    expect(idxFirst).toBeGreaterThan(-1);
    expect(idxSecond).toBeGreaterThan(-1);
    expect(idxSecond).toBeGreaterThan(idxFirst);
  });
});

// ── empty content arrays ──────────────────────────────────────────────────

describe('sheetToSvgWithContent — empty content fields', () => {
  it('content with polygons: [] produces a valid (empty) <g> wrapper — no malformed output', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [],
      lines: [],
      texts: [],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));
    // The clip-path wrapper IS emitted, but is empty.
    expect(composed).toContain('<g clip-path="url(#vp-clip-vp1)"></g>');
    // No <path> from an empty polygons array.
    expect(composed).not.toContain('<path ');
    // Still well-formed.
    const opens = count(composed, '<g ') + count(composed, '<g>');
    const closes = count(composed, '</g>');
    expect(opens).toBe(closes);
  });
});

// ── arch-coords seam ──────────────────────────────────────────────────────

describe('sheetToSvgWithContent — content lives inside the arch-coords wrapper', () => {
  it('content group appears between the arch-coords <g …> open and the matching </g></svg> close', () => {
    const v = vp('vp1', bounds(0, 0, 100, 100), 100, 'Plan');
    const sheet = addViewport(a4Portrait(), v);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [squareModel()],
    };
    const composed = sheetToSvgWithContent(sheet, new Map([['vp1', content]]));

    // The arch-coords wrapper open includes the literal "translate(0," prefix.
    const archOpen = composed.indexOf('<g transform="translate(0, ');
    expect(archOpen).toBeGreaterThan(-1);
    // The matching arch-coords close is the LAST </g> before </svg>.
    const svgClose = composed.indexOf('</svg>');
    expect(svgClose).toBeGreaterThan(-1);
    const archClose = composed.lastIndexOf('</g>', svgClose);
    expect(archClose).toBeGreaterThan(archOpen);

    // The content's clipPath must sit between the open and the close.
    const clipIdx = composed.indexOf('<clipPath id="vp-clip-vp1">');
    expect(clipIdx).toBeGreaterThan(archOpen);
    expect(clipIdx).toBeLessThan(archClose);

    // The content's path must sit between the open and the close.
    const pathIdx = composed.indexOf('<path ');
    expect(pathIdx).toBeGreaterThan(archOpen);
    expect(pathIdx).toBeLessThan(archClose);
  });
});
