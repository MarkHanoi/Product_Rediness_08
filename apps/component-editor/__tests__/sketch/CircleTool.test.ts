// CircleTool tests (S53 D1) — two-click centre + radius state machine.

import { describe, expect, it, vi } from 'vitest';
import { createCircleTool } from '../../src/sketch/tools/CircleTool.js';
import type { ToolEvent } from '../../src/sketch/tools/types.js';
import type { SnapHit } from '../../src/sketch/snap.js';

const NO_SNAP: SnapHit = { x: 0, z: 0, kind: 'none' };

function ev(kind: ToolEvent['kind'], worldX = 0, worldZ = 0): ToolEvent {
  return { kind, worldX, worldZ, snap: { ...NO_SNAP, x: worldX, z: worldZ } };
}

describe('CircleTool — name + initial state', () => {
  it('has name "circle"', () => {
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle: vi.fn() });
    expect(tool.name).toBe('circle');
  });

  it('idle hover hints "Click circle centre"', () => {
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle: vi.fn() });
    const out = tool.handle(ev('pointer-move', 5, 5));
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/centre/i);
  });
});

describe('CircleTool — two-click flow', () => {
  it('first click → centre-set, hint asks for radius point', () => {
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle: vi.fn() });
    const out = tool.handle(ev('pointer-down', 1, 2));
    expect(out.hint).toMatch(/radius/);
  });

  it('after centre-set, pointer-move previews a circle with the right radius', () => {
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-move', 3, 4));
    expect(out.previewCircles).toHaveLength(1);
    const c = out.previewCircles![0]!;
    expect(c.cx).toBeCloseTo(0, 6);
    expect(c.cz).toBeCloseTo(0, 6);
    expect(c.radius).toBeCloseTo(5, 6);
    expect(out.hint).toMatch(/Radius: 5\.00 mm/);
  });

  it('second click commits a circle through commitCircle and returns to idle', () => {
    const commitCircle = vi.fn();
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle });
    tool.handle(ev('pointer-down', 1, 1));
    const out = tool.handle(ev('pointer-down', 4, 5));
    expect(commitCircle).toHaveBeenCalledTimes(1);
    const c = commitCircle.mock.calls[0]![0];
    expect(c.cx).toBeCloseTo(1, 6);
    expect(c.cz).toBeCloseTo(1, 6);
    expect(c.radius).toBeCloseTo(5, 6);
    expect(out.hint).toMatch(/centre/i);
  });
});

describe('CircleTool — degenerate inputs + cancel', () => {
  it('does not preview a circle when the cursor is on the centre', () => {
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-move', 0, 0));
    expect(out.previewCircles ?? []).toEqual([]);
    expect(out.hint).toMatch(/radius/i);
  });

  it('rejects a commit when radius is below the minimum', () => {
    const commitCircle = vi.fn();
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-down', 0, 0));
    expect(commitCircle).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/Radius too small/i);
  });

  it('cancel returns to idle with no preview', () => {
    const tool = createCircleTool({ commitLine: vi.fn(), commitCircle: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('cancel'));
    expect(out.previewLines).toEqual([]);
    expect(out.previewCircles ?? []).toEqual([]);
  });

  it('throws when commitCircle is missing', () => {
    const tool = createCircleTool({ commitLine: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    expect(() => tool.handle(ev('pointer-down', 5, 0))).toThrow(/commitCircle is required/);
  });
});
