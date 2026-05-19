// SelectTool tests (S53 D1) — selection dispatch with optional Shift toggle.

import { describe, expect, it, vi } from 'vitest';
import { createSelectTool, type SelectToolDeps } from '../../src/sketch/tools/SelectTool.js';
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
  deps: SelectToolDeps;
  replaceWith: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
} {
  const replaceWith = vi.fn();
  const toggle = vi.fn();
  const clear = vi.fn();
  const deps: SelectToolDeps = {
    entitiesNow: () => entities,
    replaceWith,
    toggle,
    clear,
    defaultTolMm: () => 1,
  };
  return { deps, replaceWith, toggle, clear };
}

describe('SelectTool — basics', () => {
  it('has name "select"', () => {
    const { deps } = makeDeps([]);
    expect(createSelectTool(deps).name).toBe('select');
  });

  it('pointer-move never selects', () => {
    const { deps, replaceWith, toggle, clear } = makeDeps([PT('p0', 0, 0)]);
    const tool = createSelectTool(deps);
    tool.handle(ev('pointer-move', 0, 0));
    expect(replaceWith).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('cancel never selects', () => {
    const { deps, replaceWith, toggle, clear } = makeDeps([PT('p0', 0, 0)]);
    const tool = createSelectTool(deps);
    tool.handle(ev('cancel', 0, 0));
    expect(replaceWith).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('SelectTool — non-additive (bare click)', () => {
  it('hits a point and replaces the selection', () => {
    const entities = [PT('p0', 0, 0)];
    const { deps, replaceWith } = makeDeps(entities);
    const tool = createSelectTool(deps);
    tool.handle(ev('pointer-down', 0, 0));
    expect(replaceWith).toHaveBeenCalledTimes(1);
    expect(replaceWith).toHaveBeenCalledWith('p0');
  });

  it('miss on empty space clears the selection', () => {
    const { deps, clear } = makeDeps([PT('p0', 100, 100)]);
    const tool = createSelectTool(deps);
    tool.handle(ev('pointer-down', 0, 0));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('hits a line when no point is under the cursor', () => {
    const entities = [PT('p0', 0, 0), PT('p1', 10, 0), LN('l0', 'p0', 'p1')];
    const { deps, replaceWith } = makeDeps(entities);
    const tool = createSelectTool(deps);
    tool.handle(ev('pointer-down', 5, 0));
    expect(replaceWith).toHaveBeenCalledWith('l0');
  });
});

describe('SelectTool — additive (Shift)', () => {
  it('toggles when isAdditive is true', () => {
    const { deps, toggle, replaceWith } = makeDeps([PT('p0', 0, 0)]);
    const tool = createSelectTool(deps, { isAdditive: () => true });
    tool.handle(ev('pointer-down', 0, 0));
    expect(toggle).toHaveBeenCalledWith('p0');
    expect(replaceWith).not.toHaveBeenCalled();
  });

  it('miss with isAdditive does NOT clear', () => {
    const { deps, clear } = makeDeps([PT('p0', 100, 100)]);
    const tool = createSelectTool(deps, { isAdditive: () => true });
    tool.handle(ev('pointer-down', 0, 0));
    expect(clear).not.toHaveBeenCalled();
  });
});
