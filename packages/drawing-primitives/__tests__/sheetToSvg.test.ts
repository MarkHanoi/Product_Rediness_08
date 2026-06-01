// C24 — Sheet composition engine (SHT-α-2) renderer tests.
//
// Pure-string assertions only: we do NOT mount the SVG into a DOM. The
// renderer is L2, so the test surface is also L2-only.

import { describe, expect, it } from 'vitest';
import {
  addViewport,
  customPaper,
  defaultTitleBlock,
  paperSize,
  sheetToSvg,
  type Sheet,
  type SheetToSvgOptions,
  type Viewport,
  type ViewportBounds,
} from '../src/index.js';

// ── helpers ────────────────────────────────────────────────────────────────

function bounds(xMm: number, yMm: number, widthMm: number, heightMm: number): ViewportBounds {
  return { xMm, yMm, widthMm, heightMm };
}

function vp(
  id: string,
  b: ViewportBounds,
  scale = 50,
  label?: string,
): Viewport {
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

// ── declaration + envelope ────────────────────────────────────────────────

describe('sheetToSvg — envelope', () => {
  it('starts with the XML declaration', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('emits an <svg> root with xmlns + width/height/viewBox', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="210mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain('viewBox="0 0 210 297"');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('wraps the body in a translate-and-flip group so callers write in arch coords', () => {
    const svg = sheetToSvg(a4Portrait());
    // A4 portrait height = 297.
    expect(svg).toContain('<g transform="translate(0, 297) scale(1, -1)">');
  });

  it('emits a paper rect with the paper dimensions', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg).toMatch(/<rect x="0" y="0" width="210" height="297"[^>]*\/>/);
  });

  it('empty sheet (no viewports, no grid) is structurally balanced', () => {
    const svg = sheetToSvg(a4Portrait());
    // Balanced container tags.
    expect(count(svg, '<svg ')).toBe(1);
    expect(count(svg, '</svg>')).toBe(1);
    expect(count(svg, '<g ') + count(svg, '<g>')).toBe(count(svg, '</g>'));
    expect(count(svg, '<text')).toBe(count(svg, '</text>'));
    // Every <rect appears as a self-closing tag.
    expect(count(svg, '<rect')).toBe(count(svg, '/>') >= count(svg, '<rect') ? count(svg, '<rect') : -1);
    expect(count(svg, '<rect')).toBeGreaterThan(0);
  });
});

// ── viewBox variants ──────────────────────────────────────────────────────

describe('sheetToSvg — paper sizes', () => {
  it('A4 portrait → viewBox "0 0 210 297"', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg).toContain('viewBox="0 0 210 297"');
  });

  it('A4 landscape → viewBox "0 0 297 210"', () => {
    const sheet: Sheet = {
      ...a4Portrait(),
      paper: paperSize('A4', 'landscape'),
    };
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('viewBox="0 0 297 210"');
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain('height="210mm"');
  });

  it('custom paper 500x300 → viewBox "0 0 500 300"', () => {
    const sheet: Sheet = {
      ...a4Portrait(),
      paper: customPaper(500, 300),
    };
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('viewBox="0 0 500 300"');
  });
});

// ── grid ──────────────────────────────────────────────────────────────────

describe('sheetToSvg — grid', () => {
  it('omits grid lines when gridSpacingMm is unset', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg).not.toContain('<line');
  });

  it('emits grid lines when gridSpacingMm is set', () => {
    const sheet: Sheet = { ...a4Portrait(), gridSpacingMm: 10 };
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('<line');
    // A4 portrait is 210x297; at 10mm step (exclusive of edges):
    // 20 vertical lines (10..200) + 29 horizontal (10..290) ≈ 49 lines.
    expect(count(svg, '<line')).toBeGreaterThanOrEqual(48);
  });
});

// ── viewports ─────────────────────────────────────────────────────────────

describe('sheetToSvg — viewports', () => {
  it('renders one rect per viewport with the supplied bounds', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 50, 'Ground Plan');
    const sheet = addViewport(a4Portrait(), v);
    const svg = sheetToSvg(sheet);
    expect(svg).toMatch(/<rect x="20" y="30" width="100" height="80"[^>]*fill="none"[^>]*\/>/);
  });

  it('viewport label includes the formatted scale (1:50 for scale=50)', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 50, 'Ground Plan');
    const sheet = addViewport(a4Portrait(), v);
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('Ground Plan (1:50)');
  });

  it('viewport label includes the formatted scale (1:100 for scale=100)', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 100, 'Site Plan');
    const sheet = addViewport(a4Portrait(), v);
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('Site Plan (1:100)');
  });

  it('falls back to viewport id as the label when label is omitted', () => {
    const v = vp('VP-ID-XYZ', bounds(20, 30, 100, 80), 50);
    const sheet = addViewport(a4Portrait(), v);
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('VP-ID-XYZ (1:50)');
  });

  it('omits labels when includeViewportLabels is false', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 50, 'Ground Plan');
    const sheet = addViewport(a4Portrait(), v);
    const opts: SheetToSvgOptions = { includeViewportLabels: false };
    const svg = sheetToSvg(sheet, opts);
    expect(svg).not.toContain('Ground Plan');
    // Rect is still emitted.
    expect(svg).toMatch(/<rect x="20" y="30" width="100" height="80"/);
  });
});

// ── title block ───────────────────────────────────────────────────────────

describe('sheetToSvg — title block', () => {
  it('anchors title-block rect at (paperWidth - 180, 0) by default', () => {
    const svg = sheetToSvg(a4Portrait());
    // A4 portrait paper width = 210, default titleBlockWidthMm = 180.
    // So rect should sit at x=30, y=0, width=180, height=60.
    expect(svg).toMatch(/<rect x="30" y="0" width="180" height="60"[^>]*\/>/);
  });

  it('respects custom titleBlockWidthMm / titleBlockHeightMm', () => {
    const svg = sheetToSvg(a4Portrait(), { titleBlockWidthMm: 120, titleBlockHeightMm: 40 });
    // 210 - 120 = 90.
    expect(svg).toMatch(/<rect x="90" y="0" width="120" height="40"[^>]*\/>/);
  });

  it('includes project name + sheet number + sheet name', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg).toContain('PROJECT: Demo');
    expect(svg).toContain('SHEET A-101 - Plan');
  });

  it('does NOT include "AUTHOR:" line when author is undefined', () => {
    const svg = sheetToSvg(a4Portrait());
    expect(svg).not.toContain('AUTHOR:');
  });

  it('includes "AUTHOR:" line when author is set', () => {
    const sheet: Sheet = {
      ...a4Portrait(),
      titleBlock: {
        ...a4Portrait().titleBlock,
        author: 'Jane Smith',
      },
    };
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('AUTHOR: Jane Smith');
  });
});

// ── escaping ──────────────────────────────────────────────────────────────

describe('sheetToSvg — XML escaping', () => {
  it('escapes <script> in the project name', () => {
    const sheet: Sheet = {
      ...a4Portrait(),
      titleBlock: {
        ...a4Portrait().titleBlock,
        projectName: '<script>alert(1)</script>',
      },
    };
    const svg = sheetToSvg(sheet);
    // No raw <script in output (only the legal <svg, <g, <rect, <line, <text, <?xml).
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes & in the project name as &amp;', () => {
    const sheet: Sheet = {
      ...a4Portrait(),
      titleBlock: {
        ...a4Portrait().titleBlock,
        projectName: 'Smith & Co',
      },
    };
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('Smith &amp; Co');
    // Must NOT contain a stray unescaped & before "Co".
    expect(svg).not.toContain('Smith & Co');
  });

  it('escapes " and \' in labels', () => {
    const v = vp('vp1', bounds(20, 30, 100, 80), 50, `He said "hi" & it's fine`);
    const sheet = addViewport(a4Portrait(), v);
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('&quot;hi&quot;');
    expect(svg).toContain('it&apos;s');
    expect(svg).toContain('&amp;');
  });
});

// ── trust the caller ──────────────────────────────────────────────────────

describe('sheetToSvg — trusts the caller', () => {
  it('renders an invalid sheet (viewport extending past paper) without throwing', () => {
    // A4 portrait is 210 x 297. Place a viewport that runs off the right edge.
    const v = vp('off', bounds(150, 30, 100, 80), 50, 'Off-edge');
    const sheet = addViewport(a4Portrait(), v);
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('<rect x="150" y="30" width="100" height="80"');
    expect(svg).toContain('Off-edge (1:50)');
  });
});

// ── balanced tags ─────────────────────────────────────────────────────────

describe('sheetToSvg — balanced tags', () => {
  it('opens and closes <g> groups in balanced count', () => {
    const v1 = vp('a', bounds(20, 30, 100, 80), 50, 'A');
    const v2 = vp('b', bounds(140, 30, 60, 60), 100, 'B');
    const sheet: Sheet = {
      ...a4Portrait(),
      gridSpacingMm: 10,
      viewports: [v1, v2],
    };
    const svg = sheetToSvg(sheet);
    const opens = count(svg, '<g ') + count(svg, '<g>');
    const closes = count(svg, '</g>');
    expect(opens).toBe(closes);
    expect(count(svg, '<text')).toBe(count(svg, '</text>'));
    expect(count(svg, '<svg ')).toBe(count(svg, '</svg>'));
  });
});
