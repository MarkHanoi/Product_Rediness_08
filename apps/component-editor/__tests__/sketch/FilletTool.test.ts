// FilletTool tests (S53 D1) — round the corner between two intersecting lines.

import { describe, expect, it, vi } from 'vitest';
import { createFilletTool, type FilletDeps } from '../../src/sketch/tools/FilletTool.js';
import type { EntityId, SketchEntity } from '../../src/sketch/entities.js';
import type { ToolEvent } from '../../src/sketch/tools/types.js';
import type { SnapHit } from '../../src/sketch/snap.js';

const NO_SNAP: SnapHit = { x: 0, z: 0, kind: 'none' };

function ev(kind: ToolEvent['kind'], worldX = 0, worldZ = 0): ToolEvent {
  return { kind, worldX, worldZ, snap: { ...NO_SNAP, x: worldX, z: worldZ } };
}

const PT = (id: string, x: number, z: number): SketchEntity => ({
  id: id as EntityId,
  kind: 'point',
  x,
  z,
});

const LN = (id: string, p1: string, p2: string): SketchEntity => ({
  id: id as EntityId,
  kind: 'line',
  p1: p1 as EntityId,
  p2: p2 as EntityId,
});

// Right-angle corner at (0,0): horizontal A from (0,0)→(10,0)
// and vertical B from (0,0)→(0,10).
const CORNER_AT_ORIGIN: readonly SketchEntity[] = [
  PT('a0', 0, 0),
  PT('a1', 10, 0),
  PT('b0', 0, 0),
  PT('b1', 0, 10),
  LN('lA', 'a0', 'a1'),
  LN('lB', 'b0', 'b1'),
];

function makeDeps(
  entities: readonly SketchEntity[],
  radius = 2,
): {
  deps: FilletDeps;
  commitArc: ReturnType<typeof vi.fn>;
} {
  const commitArc = vi.fn();
  const deps: FilletDeps = {
    commitLine: vi.fn(),
    commitArc,
    entitiesNow: () => entities,
    defaultTolMm: () => 1,
    radiusMm: () => radius,
  };
  return { deps, commitArc };
}

describe('FilletTool — basics', () => {
  it('has name "fillet"', () => {
    const { deps } = makeDeps([]);
    expect(createFilletTool(deps).name).toBe('fillet');
  });

  it('idle hover hints "Click first line"', () => {
    const { deps } = makeDeps(CORNER_AT_ORIGIN);
    const out = createFilletTool(deps).handle(ev('pointer-move', 0, 0));
    expect(out.hint).toMatch(/Click first line/);
  });

  it('miss on the first click surfaces a "Miss" hint', () => {
    const { deps, commitArc } = makeDeps(CORNER_AT_ORIGIN);
    const out = createFilletTool(deps).handle(ev('pointer-down', 100, 100));
    expect(out.hint).toMatch(/Miss/);
    expect(commitArc).not.toHaveBeenCalled();
  });
});

describe('FilletTool — two-click flow', () => {
  it('first click on lA → second click on lB commits an arc', () => {
    const { deps, commitArc } = makeDeps(CORNER_AT_ORIGIN, 2);
    const tool = createFilletTool(deps);
    tool.handle(ev('pointer-down', 5, 0));
    tool.handle(ev('pointer-down', 0, 5));
    expect(commitArc).toHaveBeenCalledTimes(1);
    const arc = commitArc.mock.calls[0]![0];
    // For a 90° corner with radius 2, the arc centre is at (2, 2)
    // and the arc spans from (2, 0) to (0, 2) — startAngle = -π/2,
    // endAngle = π (i.e. it sweeps the inside corner).
    expect(arc.cx).toBeCloseTo(2, 5);
    expect(arc.cz).toBeCloseTo(2, 5);
    expect(arc.radius).toBeCloseTo(2, 5);
  });

  it('clicking the same line twice is rejected', () => {
    const { deps, commitArc } = makeDeps(CORNER_AT_ORIGIN);
    const tool = createFilletTool(deps);
    tool.handle(ev('pointer-down', 5, 0));
    // Second click also lands on lA, NOT near a point endpoint —
    // hitTest picks points first so we offset slightly off-axis to
    // keep `lA` the closest entity.
    const out = tool.handle(ev('pointer-down', 5, 0.5));
    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/different second line/);
  });

  it('rejects parallel lines', () => {
    const PARALLEL: SketchEntity[] = [
      PT('p0', 0, 0), PT('p1', 10, 0), LN('lA', 'p0', 'p1'),
      PT('p2', 0, 5), PT('p3', 10, 5), LN('lB', 'p2', 'p3'),
    ];
    const { deps, commitArc } = makeDeps(PARALLEL);
    const tool = createFilletTool(deps);
    tool.handle(ev('pointer-down', 5, 0));
    const out = tool.handle(ev('pointer-down', 5, 5));
    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/parallel|do not meet/i);
  });

  it('rejects an oversized radius that does not fit in either segment', () => {
    const { deps, commitArc } = makeDeps(CORNER_AT_ORIGIN, 100);
    const tool = createFilletTool(deps);
    tool.handle(ev('pointer-down', 5, 0));
    const out = tool.handle(ev('pointer-down', 0, 5));
    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/too large/i);
  });

  it('rejects a non-positive radius', () => {
    const { deps, commitArc } = makeDeps(CORNER_AT_ORIGIN, 0);
    const tool = createFilletTool(deps);
    tool.handle(ev('pointer-down', 5, 0));
    const out = tool.handle(ev('pointer-down', 0, 5));
    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/radius must be > 0/i);
  });
});

// ─── SEGMENT BOUNDS — the tool may not answer about geometry it cannot reach ──
//
// This block WAS a C74 §3.4 retiring assertion pinning a measured defect: for
// two NON-parallel segments that do not touch, `findCommonOrIntersection` solved
// the INFINITE-line intersection with no segment-bounds check, so the tool
// REPORTED SUCCESS — it committed an arc tangent to a point beyond the end of
// segment A, in empty space, extended neither line, and returned the ordinary
// "Click first line" ready-hint. A wrong result and a correct one were
// indistinguishable to the user.
//
// It is now flipped to the CORRECT expectation. The tool REFUSES, and the
// refusal carries BOTH measured overshoots, so "I cannot do this" can never
// again be rendered as "done". Extending the segments to their virtual corner
// is a real capability and is still absent — that remains the S55 extend
// variant's job — but the tool no longer pretends to have done it.
//
// The parallel case is NOT what this pins: that fixture's cross-product
// determinant is exactly 0, so it was already refused for a different reason
// and could never have caught this.
describe('FilletTool — segments that do NOT meet are REFUSED with the measured gap', () => {
  // A: (0,0)→(4,0). B: (10,2)→(10,12). Perpendicular, non-parallel, and they
  // do NOT touch — their extensions meet at the virtual corner (10, 0), which
  // is 6 mm past A's far endpoint and 2 mm past B's near endpoint.
  const NOT_MEETING: SketchEntity[] = [
    PT('a0', 0, 0), PT('a1', 4, 0), LN('lA', 'a0', 'a1'),
    PT('b0', 10, 2), PT('b1', 10, 12), LN('lB', 'b0', 'b1'),
  ];

  it('commits NOTHING and names how far past each segment the corner lies', () => {
    const commitArc = vi.fn();
    const commitLine = vi.fn();
    const trimLine = vi.fn();
    const deps: FilletDeps = {
      commitLine, commitArc, trimLine,
      entitiesNow: () => NOT_MEETING,
      defaultTolMm: () => 1,
      radiusMm: () => 2,
    };
    const tool = createFilletTool(deps);
    tool.handle(ev('pointer-down', 2, 0));
    const out = tool.handle(ev('pointer-down', 10, 7));

    // No arc. The old behaviour committed one, tangent to (8, 0) — 4 mm past
    // the end of a segment that stops at x = 4.
    expect(commitArc).not.toHaveBeenCalled();
    // And still no extend and no trim: refusing is not silently repairing.
    expect(commitLine).not.toHaveBeenCalled();
    expect(trimLine).not.toHaveBeenCalled();

    // The refusal says WHY, and it says it in numbers. BOTH overshoots are
    // required: a refusal that names one segment tells the user to fix half a
    // problem. 6 mm past A's far end (x = 4 → corner x = 10), 2 mm past B's
    // near end (z = 2 → corner z = 0).
    expect(out.hint).toMatch(/do not meet/i);
    expect(out.hint).toContain('6.0 mm');
    expect(out.hint).toContain('2.0 mm');

    // And it is NOT the ordinary ready-hint. This is the assertion that would
    // have caught the original defect on its own.
    expect(out.hint).not.toBe('Click first line');
  });

  it('the refusal is not vacuous — an X-crossing INSIDE both segments still fillets', () => {
    // A: (0,0)→(10,0) crossed at its midpoint by B: (5,-5)→(5,5). The corner
    // (5, 0) is strictly interior to BOTH, so nothing here is out of reach and
    // the bounds check must not fire. Without this case a tool that refused
    // every non-shared-endpoint pair would satisfy the assertion above.
    const CROSSING: SketchEntity[] = [
      PT('a0', 0, 0), PT('a1', 10, 0), LN('lA', 'a0', 'a1'),
      PT('b0', 5, -5), PT('b1', 5, 5), LN('lB', 'b0', 'b1'),
    ];
    const { deps, commitArc } = makeDeps(CROSSING, 2);
    const tool = createFilletTool(deps);
    // Both clicks are >1 mm (the tolerance) from every vertex — `hitTest` tries
    // points before lines, so a click nearer a vertex than the tolerance would
    // resolve to the point and the tool would answer "Miss" for the wrong reason.
    tool.handle(ev('pointer-down', 3, 0));
    const out = tool.handle(ev('pointer-down', 5, -2));

    expect(commitArc).toHaveBeenCalledTimes(1);
    const arc = commitArc.mock.calls[0]![0];
    // Quadrant chosen by `farther`: away from (10,0) along A and away from
    // (5,5) along B, so the centre lands at (3, −2) and the tangent point on A
    // is (3, 0) — inside the segment, which is the whole point.
    expect(arc.cx).toBeCloseTo(3, 6);
    expect(arc.cz).toBeCloseTo(-2, 6);
    expect(arc.radius).toBeCloseTo(2, 6);
    expect(out.hint).toBe('Click first line');
  });

  it('a radius whose tangent point would overrun the available run is refused', () => {
    // The SAME defect by a second route, and the one the segment-bounds check
    // alone does not close. The corner (5,0) is interior to A, so only 5 mm of
    // A runs from the corner to its far end — but `lenA` is 10. A radius of 4
    // puts the tangent point 4 mm along a 5 mm run (fine), a radius of 8 puts
    // it at 8 mm along that same 5 mm run: off the segment again, while the
    // old `t >= lenA` test compared 8 against 10 and passed it.
    const CROSSING: SketchEntity[] = [
      PT('a0', 0, 0), PT('a1', 10, 0), LN('lA', 'a0', 'a1'),
      PT('b0', 5, -5), PT('b1', 5, 5), LN('lB', 'b0', 'b1'),
    ];
    const { deps, commitArc } = makeDeps(CROSSING, 8);
    const tool = createFilletTool(deps);
    // Both clicks are >1 mm (the tolerance) from every vertex — `hitTest` tries
    // points before lines, so a click nearer a vertex than the tolerance would
    // resolve to the point and the tool would answer "Miss" for the wrong reason.
    tool.handle(ev('pointer-down', 3, 0));
    const out = tool.handle(ev('pointer-down', 5, -2));

    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/too large/i);
  });
});
