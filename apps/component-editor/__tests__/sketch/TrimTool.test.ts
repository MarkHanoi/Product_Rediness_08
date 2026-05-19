// TrimTool tests (S53 D1) — one-click line trim.

import { describe, expect, it, vi } from 'vitest';
import { createTrimTool, type TrimDeps } from '../../src/sketch/tools/TrimTool.js';
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

function makeDeps(entities: readonly SketchEntity[]): {
  deps: TrimDeps;
  trimLine: ReturnType<typeof vi.fn>;
} {
  const trimLine = vi.fn();
  const deps: TrimDeps = {
    commitLine: vi.fn(),
    trimLine,
    entitiesNow: () => entities,
    defaultTolMm: () => 1,
  };
  return { deps, trimLine };
}

const HORIZONTAL = [PT('p0', 0, 0), PT('p1', 10, 0), LN('l0', 'p0', 'p1')];

describe('TrimTool — basics', () => {
  it('has name "trim"', () => {
    const { deps } = makeDeps([]);
    expect(createTrimTool(deps).name).toBe('trim');
  });

  it('pointer-move shows the hover hint without trimming', () => {
    const { deps, trimLine } = makeDeps(HORIZONTAL);
    const tool = createTrimTool(deps);
    const out = tool.handle(ev('pointer-move', 5, 0));
    expect(out.hint).toMatch(/Click the part of a line to trim/);
    expect(trimLine).not.toHaveBeenCalled();
  });

  it('cancel shows the hover hint without trimming', () => {
    const { deps, trimLine } = makeDeps(HORIZONTAL);
    const tool = createTrimTool(deps);
    const out = tool.handle(ev('cancel', 5, 0));
    expect(out.hint).toMatch(/Click the part of a line to trim/);
    expect(trimLine).not.toHaveBeenCalled();
  });
});

describe('TrimTool — single-click trim', () => {
  it('clicking near p2 keeps "start" and trims the end of the segment', () => {
    const { deps, trimLine } = makeDeps(HORIZONTAL);
    const tool = createTrimTool(deps);
    tool.handle(ev('pointer-down', 8, 0));
    expect(trimLine).toHaveBeenCalledTimes(1);
    const [id, keep, cutX, cutZ] = trimLine.mock.calls[0]!;
    expect(id).toBe('l0');
    expect(keep).toBe('start');
    expect(cutX).toBeCloseTo(8, 6);
    expect(cutZ).toBeCloseTo(0, 6);
  });

  it('clicking near p1 keeps "end" and trims the start of the segment', () => {
    const { deps, trimLine } = makeDeps(HORIZONTAL);
    const tool = createTrimTool(deps);
    tool.handle(ev('pointer-down', 2, 0));
    expect(trimLine).toHaveBeenCalledTimes(1);
    const [, keep, cutX] = trimLine.mock.calls[0]!;
    expect(keep).toBe('end');
    expect(cutX).toBeCloseTo(2, 6);
  });

  it('miss on empty space surfaces a "Miss" hint without trimming', () => {
    const { deps, trimLine } = makeDeps(HORIZONTAL);
    const tool = createTrimTool(deps);
    const out = tool.handle(ev('pointer-down', 5, 50));
    expect(trimLine).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/Miss/);
  });

  it('throws when trimLine is missing', () => {
    const deps: TrimDeps = {
      commitLine: vi.fn(),
      entitiesNow: () => HORIZONTAL,
      defaultTolMm: () => 1,
    };
    const tool = createTrimTool(deps);
    expect(() => tool.handle(ev('pointer-down', 5, 0))).toThrow(/trimLine is required/);
  });
});
