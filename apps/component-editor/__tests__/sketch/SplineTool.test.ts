// SplineTool tests (C111 §9.6) — the free-form curve gesture.
//
// The founder's requirement is *"ANY SHAPE LIKE RHINOCEROS"*. The gesture under
// test is Rhino's `InterpCrv`: click the points the curve must PASS THROUGH,
// re-click the last one to finish.
//
// ⭐ **THE LOAD-BEARING ASSERTION IS THAT THE TOOL COMPUTES NO CURVE.** The
//    preview is sampled through the SAME `@pryzm/geometry-kernel` functions the
//    bake uses, so `expect`-ing preview vertices against an independently
//    computed kernel sample is not a tautology — it fails the moment the tool
//    grows a sampler of its own, which is the "two copies, one tested, one
//    shipped" defect (C74 §5.e) this repo keeps re-minting.

import { describe, expect, it, vi } from 'vitest';
import {
  catmullRomToCubicBezierChainXZ,
  sampleCubicBezierChainXZ,
  isCubicBezierChainLength,
  type Pt2,
} from '@pryzm/geometry-kernel';
import { createSplineTool } from '../../src/sketch/tools/SplineTool.js';
import type { ToolEvent } from '../../src/sketch/tools/types.js';
import type { SnapHit } from '../../src/sketch/snap.js';

const NO_SNAP: SnapHit = { x: 0, z: 0, kind: 'none' };

function ev(kind: ToolEvent['kind'], worldX = 0, worldZ = 0): ToolEvent {
  return { kind, worldX, worldZ, snap: { ...NO_SNAP, x: worldX, z: worldZ } };
}

function tool(commitSpline = vi.fn()) {
  return { t: createSplineTool({ commitLine: vi.fn(), commitSpline }), commitSpline };
}

describe('SplineTool — name + initial state', () => {
  it('has name "spline"', () => {
    expect(tool().t.name).toBe('spline');
  });

  it('idle hover asks for the first curve point and previews nothing', () => {
    const out = tool().t.handle(ev('pointer-move', 5, 5));
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/first curve point/i);
  });
});

describe('SplineTool — the through-point gesture', () => {
  it('one click alone previews no curve — a single point is not a curve', () => {
    const { t } = tool();
    const out = t.handle(ev('pointer-down', 0, 0));
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/next curve point/i);
  });

  it('TWO through-points degenerate to ONE exact segment — a 2-point curve IS a line', () => {
    const { t } = tool();
    t.handle(ev('pointer-down', 0, 0));
    const out = t.handle(ev('pointer-down', 100, 50));
    // ⭐ NOT a shortcut, and not under-tessellation. Catmull-Rom over two
    //    points yields four COLLINEAR controls, so the span's second
    //    difference vanishes and `segmentsForCubicBezier` returns its
    //    documented minimum: *"a span whose second difference vanishes IS a
    //    straight line; two vertices describe it exactly, and spending more is
    //    not safer, it is noise in the vertex buffer."* Asserting `> 1` here
    //    would have demanded the kernel pad a straight line with fake vertices.
    expect(out.previewLines).toHaveLength(1);
    expect(out.previewLines[0]).toMatchObject({ x1: 0, z1: 0, x2: 100, z2: 50 });
  });

  it('THREE through-points tessellate — the curve is sampled, not drawn as its control polygon', () => {
    const { t } = tool();
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 100, 80));
    const out = t.handle(ev('pointer-down', 200, 0));
    // Genuinely curved now, so many short chords. Two segments would mean the
    // tool had drawn the through-points as a polyline.
    expect(out.previewLines.length).toBeGreaterThan(2);
  });

  it('the preview is EXACTLY the kernel sample — the tool owns no sampler', () => {
    const { t } = tool();
    const pts: Pt2[] = [[0, 0], [100, 80], [200, 0]];
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 100, 80));
    const out = t.handle(ev('pointer-down', 200, 0));

    // Recompute independently through the kernel, with the tool's declared
    // millimetre chord tolerance.
    const expected = sampleCubicBezierChainXZ(catmullRomToCubicBezierChainXZ(pts), 0.5);
    expect(out.previewLines).toHaveLength(expected.length - 1);
    for (let i = 0; i < out.previewLines.length; i++) {
      expect(out.previewLines[i]!.x1).toBeCloseTo(expected[i]![0], 9);
      expect(out.previewLines[i]!.z1).toBeCloseTo(expected[i]![1], 9);
      expect(out.previewLines[i]!.x2).toBeCloseTo(expected[i + 1]![0], 9);
      expect(out.previewLines[i]!.z2).toBeCloseTo(expected[i + 1]![1], 9);
    }
  });

  it('the curve INTERPOLATES every through-point — it does not merely approach them', () => {
    const { t } = tool();
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 100, 80));
    const out = t.handle(ev('pointer-down', 200, 0));
    const first = out.previewLines[0]!;
    const last = out.previewLines[out.previewLines.length - 1]!;
    // Endpoints are ON the curve — that is what lets a spline close a profile
    // against a line at an AUTHORED point (C111 §9.6).
    expect(first.x1).toBeCloseTo(0, 9);
    expect(first.z1).toBeCloseTo(0, 9);
    expect(last.x2).toBeCloseTo(200, 9);
    expect(last.z2).toBeCloseTo(0, 9);
  });
});

describe('SplineTool — finishing', () => {
  it('re-clicking the last point commits the through-points, in order', () => {
    const { t, commitSpline } = tool();
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 100, 80));
    t.handle(ev('pointer-down', 200, 0));
    t.handle(ev('pointer-down', 200, 0)); // repeat = finish

    expect(commitSpline).toHaveBeenCalledTimes(1);
    expect(commitSpline.mock.calls[0]![0]).toEqual([
      { x: 0, z: 0 },
      { x: 100, z: 80 },
      { x: 200, z: 0 },
    ]);
  });

  it('the committed through-points convert to a VALID 3k+1 control chain', () => {
    const { t, commitSpline } = tool();
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 100, 80));
    t.handle(ev('pointer-down', 200, 0));
    t.handle(ev('pointer-down', 200, 0));
    const through = commitSpline.mock.calls[0]![0] as ReadonlyArray<{ x: number; z: number }>;
    const chain = catmullRomToCubicBezierChainXZ(through.map((p): Pt2 => [p.x, p.z]));
    // 3 through-points → 2 spans → 7 controls. The store REFUSES anything else.
    expect(isCubicBezierChainLength(chain.length)).toBe(true);
    expect(chain).toHaveLength(7);
  });

  it('REFUSES to commit a one-point "curve" and keeps the state so the user can continue', () => {
    const { t, commitSpline } = tool();
    t.handle(ev('pointer-down', 10, 10));
    const out = t.handle(ev('pointer-down', 10, 10)); // repeat with only 1 point
    expect(commitSpline).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/at least 2 points/i);
    // Still drawing: a second real point then finishes normally.
    t.handle(ev('pointer-down', 60, 40));
    t.handle(ev('pointer-down', 60, 40));
    expect(commitSpline).toHaveBeenCalledTimes(1);
  });

  it('after committing, the tool returns to idle rather than continuing the old curve', () => {
    const { t, commitSpline } = tool();
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 50, 50));
    t.handle(ev('pointer-down', 50, 50));
    const out = t.handle(ev('pointer-move', 500, 500));
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/first curve point/i);
    expect(commitSpline).toHaveBeenCalledTimes(1);
  });

  it('cancel discards the in-progress curve and commits nothing', () => {
    const { t, commitSpline } = tool();
    t.handle(ev('pointer-down', 0, 0));
    t.handle(ev('pointer-down', 100, 100));
    const out = t.handle(ev('cancel'));
    expect(out.previewLines).toEqual([]);
    expect(commitSpline).not.toHaveBeenCalled();
    // And the discarded points are really gone.
    const after = t.handle(ev('pointer-move', 10, 10));
    expect(after.previewLines).toEqual([]);
  });
});
