import { describe, it, expect, vi } from 'vitest';
import { createLineTool } from '../../src/sketch/tools/LineTool.js';
import type { ToolEvent } from '../../src/sketch/tools/types.js';
import type { SnapHit } from '../../src/sketch/snap.js';

const NO_SNAP: SnapHit = { x: 0, z: 0, kind: 'none' };

function ev(kind: ToolEvent['kind'], worldX = 0, worldZ = 0): ToolEvent {
  return { kind, worldX, worldZ, snap: { ...NO_SNAP, x: worldX, z: worldZ } };
}

describe('LineTool — S52 D1 state machine', () => {
  it('has name "line"', () => {
    const tool = createLineTool({ commitLine: vi.fn() });
    expect(tool.name).toBe('line');
  });

  it('idle + pointer-move emits the "click first point" hint and no preview', () => {
    const tool = createLineTool({ commitLine: vi.fn() });
    const out = tool.handle(ev('pointer-move', 50, 50));
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/Click first point/);
  });

  it('idle + pointer-down captures the first point and shows the second-click hint', () => {
    const commitLine = vi.fn();
    const tool = createLineTool({ commitLine });
    const out = tool.handle(ev('pointer-down', 100, 200));
    expect(commitLine).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/second point/);
  });

  it('first-set + pointer-move shows a rubber-band preview from first to cursor', () => {
    const tool = createLineTool({ commitLine: vi.fn() });
    tool.handle(ev('pointer-down', 100, 200));
    const out = tool.handle(ev('pointer-move', 300, 400));
    expect(out.previewLines).toEqual([{ x1: 100, z1: 200, x2: 300, z2: 400 }]);
  });

  it('first-set + pointer-down commits a line and returns to idle', () => {
    const commitLine = vi.fn();
    const tool = createLineTool({ commitLine });
    tool.handle(ev('pointer-down', 100, 200));
    const out = tool.handle(ev('pointer-down', 300, 400));
    expect(commitLine).toHaveBeenCalledTimes(1);
    expect(commitLine).toHaveBeenCalledWith({ x1: 100, z1: 200, x2: 300, z2: 400 });
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/Click first point/);
  });

  it('degenerate second click (same coords) is rejected and tool stays in first-set', () => {
    const commitLine = vi.fn();
    const tool = createLineTool({ commitLine });
    tool.handle(ev('pointer-down', 100, 200));
    const out = tool.handle(ev('pointer-down', 100, 200));
    expect(commitLine).not.toHaveBeenCalled();
    expect(out.previewLines).toHaveLength(1);
  });

  it('cancel during first-set clears preview and returns to idle', () => {
    const commitLine = vi.fn();
    const tool = createLineTool({ commitLine });
    tool.handle(ev('pointer-down', 100, 200));
    const out = tool.handle(ev('cancel'));
    expect(out.previewLines).toEqual([]);
    // Subsequent pointer-down should start fresh, not commit.
    tool.handle(ev('pointer-down', 0, 0));
    expect(commitLine).not.toHaveBeenCalled();
  });

  it('reset() during first-set clears state', () => {
    const commitLine = vi.fn();
    const tool = createLineTool({ commitLine });
    tool.handle(ev('pointer-down', 100, 200));
    tool.reset();
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 50, 50));
    expect(commitLine).toHaveBeenCalledWith({ x1: 0, z1: 0, x2: 50, z2: 50 });
  });
});
