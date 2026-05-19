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
