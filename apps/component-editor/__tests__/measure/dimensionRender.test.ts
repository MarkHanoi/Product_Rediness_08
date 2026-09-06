// dimensionRender — WHAT IS ACTUALLY DRAWN, to SPEC-AUTODIMENSION §12.
//
// jsdom has no 2D context, so these tests record every call against a stub
// context. That is not a workaround — it is the only way to assert the §12
// clauses at all, because the clauses are about the DRAWING OPERATIONS
// (lineweight, fill-vs-stroke, where the value sits), not about pixels.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PKG_ROOT } from '../quality-gates/_walk.js';
import { DIM_COLOR, DIM_DRIVING_COLOR, DIM_LINE_WIDTH_PX, drawDimensions } from '../../src/measure/dimensionRender.js';
import { createSketchDocStore } from '../../src/stores/sketchDocStore.js';
import { defaultView } from '../../src/sketch/transform.js';
import type { DimensionId, LinearDimension } from '../../src/measure/dimension.js';
import type { EntityId } from '../../src/sketch/entities.js';

interface Call { readonly op: string; readonly args: readonly unknown[] }

function stubCtx() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { lineWidth: 1.5, font: '', strokeStyle: '', fillStyle: '' };
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  const ctx = {
    get lineWidth() { return state.lineWidth as number; },
    set lineWidth(v: number) { state.lineWidth = v; calls.push({ op: 'set:lineWidth', args: [v] }); },
    get strokeStyle() { return state.strokeStyle as string; },
    set strokeStyle(v: string) { state.strokeStyle = v; calls.push({ op: 'set:strokeStyle', args: [v] }); },
    get fillStyle() { return state.fillStyle as string; },
    set fillStyle(v: string) { state.fillStyle = v; calls.push({ op: 'set:fillStyle', args: [v] }); },
    get font() { return state.font as string; },
    set font(v: string) { state.font = v; calls.push({ op: 'set:font', args: [v] }); },
    textAlign: '', textBaseline: '',
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    stroke: rec('stroke'), fillRect: rec('fillRect'), fillText: rec('fillText'),
    strokeText: rec('strokeText'), save: rec('save'), restore: rec('restore'),
    translate: rec('translate'), rotate: rec('rotate'), clearRect: rec('clearRect'),
    measureText: (t: string) => ({ width: t.length * 6 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function dim(p1: EntityId, p2: EntityId, extra: Partial<LinearDimension> = {}): LinearDimension {
  return {
    id: 'd1' as DimensionId, kind: 'linear', view: 'plan', p1, p2,
    offsetMm: 400, stringRank: 3, drivingConstraintId: null, ...extra,
  };
}

function fixture() {
  const doc = createSketchDocStore();
  const p1 = doc.addPoint(0, 0);
  const p2 = doc.addPoint(1000, 0);
  return { doc, p1, p2, view: defaultView(800, 600) };
}

describe('drawDimensions — SPEC-AUTODIMENSION §12', () => {
  it('draws nothing at all when there is no dimension to draw', () => {
    const { doc, view } = fixture();
    const { ctx, calls } = stubCtx();
    drawDimensions(ctx, doc.get(), [], view);
    expect(calls).toEqual([]);
  });

  it('draws the dimension line, two witness lines and two ticks', () => {
    const { doc, p1, p2, view } = fixture();
    const { ctx, calls } = stubCtx();
    drawDimensions(ctx, doc.get(), [dim(p1, p2)], view);
    // 2 witness + 1 dimension line + 2 ticks = 5 stroked paths.
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(5);
    expect(calls.filter((c) => c.op === 'beginPath')).toHaveLength(5);
  });

  // §12.11 LINEWEIGHT HIERARCHY — annotations must never visually overpower
  // cut geometry. Asserted as an INEQUALITY against the weight
  // `sketchRender.ts` actually uses, read off disk: bumping geometry weight
  // later must not silently invert the hierarchy.
  it('strokes dimensions THINNER than the sketch geometry (§12.11)', async () => {
    const source = await fs.readFile(
      path.join(PKG_ROOT, 'src/sketch/sketchRender.ts'), 'utf8',
    );
    const weights = [...source.matchAll(/ctx\.lineWidth\s*=\s*([0-9.]+)/g)]
      .map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    const entityWeight = Math.max(...weights);
    expect(DIM_LINE_WIDTH_PX).toBeLessThan(entityWeight);

    const { doc, p1, p2, view } = fixture();
    const { ctx, calls } = stubCtx();
    drawDimensions(ctx, doc.get(), [dim(p1, p2)], view);
    const set = calls.filter((c) => c.op === 'set:lineWidth');
    expect(set[0]!.args[0]).toBe(DIM_LINE_WIDTH_PX);
    // …and the caller's lineWidth is RESTORED, or the next geometry pass
    // would be drawn at annotation weight.
    expect(set.at(-1)!.args[0]).toBe(1.5);
  });

  // §12.14 — the value is FILLED, never stroked. Emitting both is not "bold",
  // it is a smear.
  it('fills the dimension value and never strokes the letterform (§12.14)', () => {
    const { doc, p1, p2, view } = fixture();
    const { ctx, calls } = stubCtx();
    drawDimensions(ctx, doc.get(), [dim(p1, p2)], view);
    const fills = calls.filter((c) => c.op === 'fillText');
    expect(fills).toHaveLength(1);
    expect(fills[0]!.args[0]).toBe('1000');
    expect(calls.filter((c) => c.op === 'strokeText')).toHaveLength(0);
  });

  // §12.14 — text height is a PAPER dimension, INVARIANT under drawing scale.
  // The naive implementation multiplies by the sketcher's zoom, which shrinks
  // the lettering to nothing as the author zooms out.
  it('letters at the SAME size at every zoom level (§12.14 invariance)', () => {
    const { doc, p1, p2 } = fixture();
    const fontAt = (zoom: number) => {
      const { ctx, calls } = stubCtx();
      drawDimensions(ctx, doc.get(), [dim(p1, p2)], { ...defaultView(800, 600), zoom });
      return calls.find((c) => c.op === 'set:font')!.args[0];
    };
    expect(fontAt(0.1)).toBe(fontAt(1));
    expect(fontAt(1)).toBe(fontAt(25));
  });

  // A driving dimension controls the geometry; a reporting one merely
  // describes it. The author must be able to tell which at a glance.
  it('draws a DRIVING dimension in PRYZM purple and a reporting one in grey', () => {
    const { doc, p1, p2, view } = fixture();
    const strokeOf = (d: LinearDimension) => {
      const { ctx, calls } = stubCtx();
      drawDimensions(ctx, doc.get(), [d], view);
      return calls.find((c) => c.op === 'set:strokeStyle')!.args[0];
    };
    expect(strokeOf(dim(p1, p2))).toBe(DIM_COLOR);
    expect(strokeOf(dim(p1, p2, { drivingConstraintId: 'cdist-1' }))).toBe(DIM_DRIVING_COLOR);
    expect(DIM_DRIVING_COLOR.toUpperCase()).toBe('#6600FF');
  });

  // A dimension whose points were deleted, or whose points are coincident,
  // draws NOTHING rather than a NaN streak across the sketch.
  it('draws nothing for a broken or degenerate dimension', () => {
    const { doc, p1, p2, view } = fixture();
    const broken = stubCtx();
    doc.removeEntity(p2);
    drawDimensions(broken.ctx, doc.get(), [dim(p1, p2)], view);
    expect(broken.calls.filter((c) => c.op === 'stroke')).toHaveLength(0);
    expect(broken.calls.filter((c) => c.op === 'fillText')).toHaveLength(0);

    const doc2 = createSketchDocStore();
    const a = doc2.addPoint(5, 5);
    const b = doc2.addPoint(5, 5);
    const degenerate = stubCtx();
    drawDimensions(degenerate.ctx, doc2.get(), [dim(a, b)], view);
    expect(degenerate.calls.filter((c) => c.op === 'stroke')).toHaveLength(0);
  });

  it('emits no NaN coordinate in any drawing call', () => {
    const { doc, p1, p2, view } = fixture();
    const { ctx, calls } = stubCtx();
    drawDimensions(ctx, doc.get(), [dim(p1, p2)], view);
    for (const c of calls) {
      for (const a of c.args) {
        if (typeof a === 'number') expect(Number.isFinite(a)).toBe(true);
      }
    }
  });
});
