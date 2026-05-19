import { describe, expect, it } from 'vitest';
import { computeMultiViewLayout } from '../src/multi-view-layout.js';

describe('computeMultiViewLayout', () => {
  it('tabs mode shows only the first view full-canvas', () => {
    const r = computeMultiViewLayout({
      mode: 'tabs',
      viewIds: ['v1', 'v2', 'v3'],
      canvasWidthPx: 800, canvasHeightPx: 600,
    });
    expect(r.rects[0]).toEqual({ viewId: 'v1', x: 0, y: 0, w: 800, h: 600, visible: true });
    expect(r.rects[1]?.visible).toBe(false);
    expect(r.rects[2]?.visible).toBe(false);
  });

  it('split-2 mode splits at the requested ratio (no rounding gap)', () => {
    const r = computeMultiViewLayout({
      mode: 'split-2',
      viewIds: ['v1', 'v2'],
      canvasWidthPx: 1001, canvasHeightPx: 600,
      splitRatio: 0.4,
    });
    const a = r.rects[0]!, b = r.rects[1]!;
    expect(a.x).toBe(0);
    expect(b.x).toBe(a.w);
    expect(a.w + b.w).toBe(1001);
    expect(a.h).toBe(600);
    expect(b.h).toBe(600);
  });

  it('split-2 clamps absurd ratios into [0.05, 0.95]', () => {
    const r1 = computeMultiViewLayout({
      mode: 'split-2', viewIds: ['v1', 'v2'],
      canvasWidthPx: 1000, canvasHeightPx: 100, splitRatio: 0,
    });
    expect(r1.rects[0]!.w).toBe(50);
    const r2 = computeMultiViewLayout({
      mode: 'split-2', viewIds: ['v1', 'v2'],
      canvasWidthPx: 1000, canvasHeightPx: 100, splitRatio: 1,
    });
    expect(r2.rects[0]!.w).toBe(950);
  });

  it('grid-4 produces 4 visible cells with no overlap and no gaps', () => {
    const r = computeMultiViewLayout({
      mode: 'grid-4',
      viewIds: ['v1', 'v2', 'v3', 'v4', 'v5'],
      canvasWidthPx: 800, canvasHeightPx: 600,
    });
    expect(r.rects[0]).toMatchObject({ x: 0, y: 0, w: 400, h: 300, visible: true });
    expect(r.rects[1]).toMatchObject({ x: 400, y: 0, w: 400, h: 300, visible: true });
    expect(r.rects[2]).toMatchObject({ x: 0, y: 300, w: 400, h: 300, visible: true });
    expect(r.rects[3]).toMatchObject({ x: 400, y: 300, w: 400, h: 300, visible: true });
    expect(r.rects[4]?.visible).toBe(false);
  });

  it('empty viewIds returns empty rects', () => {
    expect(computeMultiViewLayout({
      mode: 'tabs', viewIds: [], canvasWidthPx: 100, canvasHeightPx: 100,
    }).rects).toEqual([]);
  });
});
