// PlanViewRenderer unit tests (S31).
//
// Covers:
//   • Z-flip: world Y carrying world-Z value is negated at the moveTo/lineTo
//     boundary (ADR-0023 §2 — the "common visual-diff failure cause #1").
//   • Draw order (background → poche → edges → door breaks).
//   • Renders gracefully when annotations / rooms are absent.

import { describe, expect, it } from 'vitest';
import {
  PlanViewRenderer,
  type PlanRenderingContext2D,
  type PlanViewData,
} from '../src/PlanViewRenderer.js';
import type { Edge2D, PocheFill } from '@pryzm/plugin-sdk';

interface RecCall {
  fn: string;
  args: number[];
}

function buildRecCtx(): { ctx: PlanRenderingContext2D; calls: RecCall[] } {
  const calls: RecCall[] = [];
  const rec = (fn: string) => (...nums: number[]) => calls.push({ fn, args: nums });
  const ctx: PlanRenderingContext2D = {
    setTransform: rec('setTransform'),
    clearRect: rec('clearRect'),
    fillRect: rec('fillRect'),
    beginPath: () => calls.push({ fn: 'beginPath', args: [] }),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath: () => calls.push({ fn: 'closePath', args: [] }),
    stroke: () => calls.push({ fn: 'stroke', args: [] }),
    fill: () => calls.push({ fn: 'fill', args: [] }),
    save: () => calls.push({ fn: 'save', args: [] }),
    restore: () => calls.push({ fn: 'restore', args: [] }),
    translate: rec('translate'),
    scale: rec('scale'),
    rotate: rec('rotate'),
    fillText: ((text: string, x: number, y: number) => calls.push({ fn: 'fillText', args: [x, y] })) as PlanRenderingContext2D['fillText'],
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
  };
  return { ctx, calls };
}

const noopApply = (_ctx: PlanRenderingContext2D): void => {
  // Identity — the renderer's Z-flip is independent of any camera.
};

function buildDataWithEdges(edges: Edge2D[], pocheFills: PocheFill[] = []): PlanViewData {
  return {
    levelId: 'L1',
    levelZ: 0,
    slabOutlines: [],
    pocheFills,
    edges,
    doorBreaks: [],
  };
}

describe('PlanViewRenderer — S31', () => {
  it('flips world-Z to canvas-Y on every edge moveTo/lineTo (ADR-0023 §2)', () => {
    const renderer = new PlanViewRenderer();
    renderer.setCanvasGeometry(800, 600, 1);
    const { ctx, calls } = buildRecCtx();
    const edges: Edge2D[] = [{
      kind: 'wall-outer',
      start: { x: 1, y: 2 },   // world-X = 1, world-Z = 2
      end:   { x: 3, y: 4 },   // world-X = 3, world-Z = 4
      elementId: 'wall_a', lineWeight: 0.5,
    }];
    renderer.render(ctx, noopApply, buildDataWithEdges(edges));

    const moveTos = calls.filter((c) => c.fn === 'moveTo');
    const lineTos = calls.filter((c) => c.fn === 'lineTo');
    // We expect at LEAST one moveTo with (1, -2) and one lineTo with (3, -4).
    expect(moveTos.some((c) => c.args[0] === 1 && c.args[1] === -2)).toBe(true);
    expect(lineTos.some((c) => c.args[0] === 3 && c.args[1] === -4)).toBe(true);
  });

  it('clears + fills the background at identity transform first', () => {
    const renderer = new PlanViewRenderer();
    renderer.setCanvasGeometry(640, 480, 1);
    const { ctx, calls } = buildRecCtx();
    renderer.render(ctx, noopApply, buildDataWithEdges([]));

    // First setTransform must be identity-DPR (1).
    const firstTx = calls.find((c) => c.fn === 'setTransform')!;
    expect(firstTx.args[0]).toBe(1);
    expect(firstTx.args[3]).toBe(1);

    // clearRect + fillRect both spanning the full surface.
    const clear = calls.find((c) => c.fn === 'clearRect')!;
    expect(clear.args).toEqual([0, 0, 640, 480]);
    const bg = calls.find((c) => c.fn === 'fillRect')!;
    expect(bg.args).toEqual([0, 0, 640, 480]);
  });

  it('fills poche polygons before stroking edges (painters order)', () => {
    const renderer = new PlanViewRenderer();
    renderer.setCanvasGeometry(800, 600, 1);
    const { ctx, calls } = buildRecCtx();
    const poche: PocheFill[] = [{
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.1 },
        { x: 0, y: 0.1 },
      ],
      elementId: 'wall_a',
      hatchAngle: 0,
    }];
    const edges: Edge2D[] = [{
      kind: 'wall-outer',
      start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
      elementId: 'wall_a', lineWeight: 0.5,
    }];
    renderer.render(ctx, noopApply, buildDataWithEdges(edges, poche));

    const firstFill = calls.findIndex((c) => c.fn === 'fill');
    const firstStroke = calls.findIndex((c) => c.fn === 'stroke');
    expect(firstFill).toBeGreaterThan(-1);
    expect(firstStroke).toBeGreaterThan(-1);
    expect(firstFill).toBeLessThan(firstStroke);
  });

  it('renders empty scene without throwing', () => {
    const renderer = new PlanViewRenderer();
    renderer.setCanvasGeometry(800, 600, 1);
    const { ctx } = buildRecCtx();
    expect(() => renderer.render(ctx, noopApply, buildDataWithEdges([]))).not.toThrow();
  });

  it('mm-to-world line weight scales with sheet scale denominator', () => {
    const r50 = new PlanViewRenderer({ sheetScale: 50 });
    const r100 = new PlanViewRenderer({ sheetScale: 100 });
    r50.setCanvasGeometry(800, 600, 1);
    r100.setCanvasGeometry(800, 600, 1);
    const edges: Edge2D[] = [{
      kind: 'wall-outer', start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
      elementId: 'w', lineWeight: 0.5, // 0.5 mm
    }];
    let lw50 = -1, lw100 = -1;
    const captureLw = (target: () => number) => target();
    const ctx50 = buildRecCtx().ctx;
    const ctx100 = buildRecCtx().ctx;
    Object.defineProperty(ctx50, 'lineWidth', {
      set(v: number) { lw50 = v; }, get() { return lw50; }, configurable: true,
    });
    Object.defineProperty(ctx100, 'lineWidth', {
      set(v: number) { lw100 = v; }, get() { return lw100; }, configurable: true,
    });
    r50.render(ctx50, noopApply, buildDataWithEdges(edges));
    r100.render(ctx100, noopApply, buildDataWithEdges(edges));
    captureLw(() => 0); // touch helper
    // 1:100 sheet should produce double the world-line-width vs 1:50 for the
    // same on-paper mm.
    expect(lw100).toBeCloseTo(lw50 * 2, 8);
  });
});
