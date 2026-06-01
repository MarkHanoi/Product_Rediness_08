// C24 — Sheet composition engine (SHT-α-3) viewport content renderer tests.
//
// Pure-string assertions only: we never mount SVG into a DOM. The renderer
// is L2, so the test surface is also L2-only.

import { describe, expect, it } from 'vitest';
import {
  applyViewportTransform,
  boundsOf,
  centroidOf,
  viewportContentToSvg,
  type LineShape,
  type PolygonShape,
  type TextShape,
  type Viewport,
  type ViewportBounds,
  type ViewportContent,
} from '../src/index.js';

// ── helpers ────────────────────────────────────────────────────────────────

function bounds(xMm: number, yMm: number, widthMm: number, heightMm: number): ViewportBounds {
  return { xMm, yMm, widthMm, heightMm };
}

function vpOf(
  id: string,
  b: ViewportBounds,
  scale = 50,
): Viewport {
  return { id, bounds: b, scale, viewType: 'plan', sourceRef: 'level-1' };
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

/** Extract the d="…" attribute from the first <path> in `svg`, or null. */
function firstPathD(svg: string): string | null {
  const m = svg.match(/<path[^>]*\sd="([^"]+)"/);
  return m ? m[1]! : null;
}

// ── empty content ──────────────────────────────────────────────────────────

describe('viewportContentToSvg — empty content', () => {
  it('emits the clipPath element and an empty content group', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100));
    const content: ViewportContent = { viewportId: 'vp1' };
    const svg = viewportContentToSvg(vp, content);

    expect(svg).toContain('<clipPath id="vp-clip-vp1">');
    expect(svg).toContain('<g clip-path="url(#vp-clip-vp1)"></g>');
  });

  it('clipPath rectangle matches the viewport bounds', () => {
    const vp = vpOf('vp1', bounds(20, 30, 100, 80));
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1' });
    expect(svg).toContain('<rect x="20" y="30" width="100" height="80" />');
  });
});

// ── polygons ───────────────────────────────────────────────────────────────

describe('viewportContentToSvg — polygons', () => {
  it('emits a <path> with an M…L…Z d attribute', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: -500, y: -500 },
        { x: 500, y: -500 },
        { x: 500, y: 500 },
        { x: -500, y: 500 },
      ],
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    const d = firstPathD(svg);
    expect(d).not.toBeNull();
    expect(d!.startsWith('M ')).toBe(true);
    expect(d!.endsWith(' Z')).toBe(true);
    expect(count(d!, ' L ')).toBe(3);
  });

  it('1000x1000 mm model square at origin in 100x100 mm viewport @ scale=100 fills the viewport', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: -500, y: -500 },
        { x: 500, y: -500 },
        { x: 500, y: 500 },
        { x: -500, y: 500 },
      ],
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    const d = firstPathD(svg)!;
    // Model 1000mm / scale 100 = 10mm sheet — centred on (50, 50) → 45..55.
    expect(d).toBe('M 45 45 L 55 45 L 55 55 L 45 55 Z');
  });

  it('emits fill + fill-opacity attributes when set', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      fill: '#aabbcc',
      fillOpacity: 0.5,
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    expect(svg).toContain('fill="#aabbcc"');
    expect(svg).toContain('fill-opacity="0.5"');
  });

  it('omits fill-opacity when fill is undefined and emits fill="none"', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    expect(svg).toContain('fill="none"');
    expect(svg).not.toContain('fill-opacity=');
  });

  it('uses custom stroke colour and width', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      stroke: '#ff0000',
      strokeMm: 200, // model mm
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    expect(svg).toContain('stroke="#ff0000"');
    // 200 model mm / scale 100 = 2 mm sheet stroke.
    expect(svg).toContain('stroke-width="2"');
  });
});

// ── lines ──────────────────────────────────────────────────────────────────

describe('viewportContentToSvg — lines', () => {
  it('emits a <polyline> with a points attribute', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const line: LineShape = {
      points: [
        { x: -500, y: 0 },
        { x: 500, y: 0 },
      ],
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', lines: [line] });
    expect(svg).toContain('<polyline ');
    // Model 1000mm / scale 100 = 10mm sheet, centred on (50, 50).
    expect(svg).toContain('points="45,50 55,50"');
    expect(svg).toContain('fill="none"');
  });

  it('emits stroke-dasharray when dashed=true', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const line: LineShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      dashed: true,
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', lines: [line] });
    expect(svg).toContain('stroke-dasharray="');
  });

  it('omits stroke-dasharray by default', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const line: LineShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', lines: [line] });
    expect(svg).not.toContain('stroke-dasharray');
  });
});

// ── texts ──────────────────────────────────────────────────────────────────

describe('viewportContentToSvg — texts', () => {
  it('emits a <text> element with the right text-anchor and font-size', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const text: TextShape = {
      position: { x: 0, y: 0 },
      text: 'BEDROOM',
      fontSizeMm: 500, // model mm
      anchor: 'start',
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', texts: [text] });
    expect(svg).toContain('<text ');
    expect(svg).toContain('text-anchor="start"');
    // 500 model mm / scale 100 = 5 mm sheet font.
    expect(svg).toContain('font-size="5"');
    expect(svg).toContain('>BEDROOM</text>');
  });

  it('positions text at the viewport centre when the only model point is at the model centre', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const content: ViewportContent = {
      viewportId: 'vp1',
      modelBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      texts: [{ position: { x: 0, y: 0 }, text: 'X' }],
    };
    const svg = viewportContentToSvg(vp, content);
    expect(svg).toContain('translate(50, 50) scale(1, -1)');
  });
});

// ── XML escaping ───────────────────────────────────────────────────────────

describe('viewportContentToSvg — XML escaping', () => {
  it('escapes & in a polygon label as &amp;', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      label: 'Kitchen & Dining',
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    expect(svg).toContain('Kitchen &amp; Dining');
    expect(svg).not.toContain('Kitchen & Dining');
  });

  it('escapes <script> in a text shape', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const text: TextShape = {
      position: { x: 0, y: 0 },
      text: '<script>alert(1)</script>',
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', texts: [text] });
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

// ── geometry helpers ───────────────────────────────────────────────────────

describe('centroidOf', () => {
  it('returns the average of a 4-point square', () => {
    const c = centroidOf([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(c).toEqual({ x: 5, y: 5 });
  });

  it('returns {0,0} for an empty point list', () => {
    const c = centroidOf([]);
    expect(c).toEqual({ x: 0, y: 0 });
  });
});

describe('boundsOf', () => {
  it('returns null for empty input', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('returns null for items with empty point arrays', () => {
    expect(boundsOf([{ points: [] }])).toBeNull();
  });

  it('computes bounds across multiple items', () => {
    const b = boundsOf([
      { points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] },
      { points: [{ x: -3, y: 20 }] },
    ]);
    expect(b).toEqual({ minX: -3, minY: 0, maxX: 10, maxY: 20 });
  });
});

describe('applyViewportTransform', () => {
  it('maps the model centre to the viewport centre', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const content: ViewportContent = {
      viewportId: 'vp1',
      modelBounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
    };
    const out = applyViewportTransform({ x: 0, y: 0 }, vp, content);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(50);
  });

  it('applies content.panMm after the scale transform', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const content: ViewportContent = {
      viewportId: 'vp1',
      modelBounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
      panMm: { x: 2, y: -3 },
    };
    const out = applyViewportTransform({ x: 0, y: 0 }, vp, content);
    expect(out.x).toBeCloseTo(52);
    expect(out.y).toBeCloseTo(47);
  });

  it('explicit modelBounds overrides computed bounds from polygons', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    // The polygon implies a centre of (50, 50), but modelBounds says (0, 0).
    const content: ViewportContent = {
      viewportId: 'vp1',
      modelBounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
      polygons: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
      ],
    };
    const out = applyViewportTransform({ x: 0, y: 0 }, vp, content);
    // With modelBounds centre (0,0), point (0,0) → viewport centre (50,50).
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(50);
  });
});

// ── options ────────────────────────────────────────────────────────────────

describe('viewportContentToSvg — options', () => {
  it('includeClipPath:false omits the <clipPath> element', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1' }, { includeClipPath: false });
    expect(svg).not.toContain('<clipPath');
    // The <g clip-path=...> wrapper is still emitted; the caller is expected to
    // own the clipPath fragment (e.g. emitted once at sheet level).
    expect(svg).toContain('<g clip-path="url(#vp-clip-vp1)"');
  });

  it('default stroke is #0f172a and default stroke-width = strokeMm / scale', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const poly: PolygonShape = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    const svg = viewportContentToSvg(vp, { viewportId: 'vp1', polygons: [poly] });
    expect(svg).toContain('stroke="#0f172a"');
    // Default 50 model mm / scale 100 = 0.5 mm sheet.
    expect(svg).toContain('stroke-width="0.5"');
  });
});

// ── round-trip ─────────────────────────────────────────────────────────────

describe('viewportContentToSvg — round-trip', () => {
  it('content with one polygon + one line + one text emits exactly one of each tag', () => {
    const vp = vpOf('vp1', bounds(0, 0, 100, 100), 100);
    const content: ViewportContent = {
      viewportId: 'vp1',
      polygons: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
      lines: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }],
      texts: [{ position: { x: 50, y: 50 }, text: 'X' }],
    };
    const svg = viewportContentToSvg(vp, content);
    expect(count(svg, '<path ')).toBe(1);
    expect(count(svg, '<polyline ')).toBe(1);
    expect(count(svg, '<text ')).toBe(1);
  });
});
