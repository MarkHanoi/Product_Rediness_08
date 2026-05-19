// SectionViewCanvasHost — integration test that pixels are touched (W-09).
//
// Asserts that the host:
//   1. Drives `produceSectionCut` over its source,
//   2. Calls into the renderer's draw() path,
//   3. The renderer reports non-zero pixels touched.
//
// Uses a `CanvasLike` fake (no DOM dep) — equivalent to plan-view's
// canvas-host integration approach.

import { describe, expect, it } from 'vitest';
import type { AabbForSection, SectionLine } from '@pryzm/plugin-sdk';
import { SectionViewCanvasHost, type CanvasLike } from '../src/index.js';

interface FakeCtxOps {
  fillRect: number;
  strokeCalls: number;
  moveTo: number;
  lineTo: number;
}

function makeFakeCanvas(width = 800, height = 400): { canvas: CanvasLike; ops: FakeCtxOps } {
  const ops: FakeCtxOps = { fillRect: 0, strokeCalls: 0, moveTo: 0, lineTo: 0 };
  const ctx = {
    save() {},
    restore() {},
    clearRect() {},
    beginPath() {},
    moveTo() { ops.moveTo++; },
    lineTo() { ops.lineTo++; },
    stroke() { ops.strokeCalls++; },
    fillRect() { ops.fillRect++; },
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
  };
  const canvas: CanvasLike = {
    width,
    height,
    getContext(kind: '2d') { return kind === '2d' ? ctx : null; },
  };
  return { canvas, ops };
}

const LINE: SectionLine = { a: { x: -10, y: 0 }, b: { x: 10, y: 0 }, lookDepth: 5 };
const STRADDLING: AabbForSection = { id: 'wall-cut', min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 3 } };
const BEYOND: AabbForSection = { id: 'wall-beyond', min: { x: -1, y: 2, z: 0 }, max: { x: 1, y: 4, z: 3 } };

describe('SectionViewCanvasHost — integration', () => {
  it('renders cut + beyond edges and touches non-zero pixels', () => {
    const { canvas, ops } = makeFakeCanvas();
    const host = new SectionViewCanvasHost({
      line: LINE,
      aabbSource: { getState: () => [STRADDLING, BEYOND] },
      target: canvas,
      viewport: { minX: -10, maxX: 10, minY: 0, maxY: 5 },
    });
    const result = host.render();
    expect(result.cutEdges.length).toBe(1);
    expect(result.beyondEdges.length).toBe(2);
    const snap = host.snapshot();
    expect(snap.cutCount).toBe(1);
    expect(snap.beyondCount).toBe(2);
    expect(snap.renderCount).toBe(1);
    expect(snap.renderStats.cutDrawn).toBe(1);
    expect(snap.renderStats.beyondDrawn).toBe(2);
    expect(snap.renderStats.pixelsTouched).toBeGreaterThan(0);
    // The renderer issued fill (background) + 2 stroke passes (beyond, cut).
    expect(ops.fillRect).toBe(1);
    expect(ops.strokeCalls).toBe(2);
    expect(ops.moveTo).toBe(3); // 1 cut + 2 beyond
    expect(ops.lineTo).toBe(3);
  });

  it('with no elements: zero edges, zero pixels (degenerate happy path)', () => {
    const { canvas } = makeFakeCanvas();
    const host = new SectionViewCanvasHost({
      line: LINE,
      aabbSource: { getState: () => [] },
      target: canvas,
    });
    const result = host.render();
    expect(result.cutEdges.length).toBe(0);
    expect(result.beyondEdges.length).toBe(0);
    expect(host.snapshot().renderStats.pixelsTouched).toBe(0);
  });
});
