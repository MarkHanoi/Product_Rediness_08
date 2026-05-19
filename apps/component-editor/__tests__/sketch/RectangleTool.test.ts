import { describe, it, expect, vi } from 'vitest';
import { createRectangleTool } from '../../src/sketch/tools/RectangleTool.js';
import type { ToolEvent } from '../../src/sketch/tools/types.js';
import type { SnapHit } from '../../src/sketch/snap.js';

const NO_SNAP: SnapHit = { x: 0, z: 0, kind: 'none' };

function ev(kind: ToolEvent['kind'], worldX = 0, worldZ = 0): ToolEvent {
  return { kind, worldX, worldZ, snap: { ...NO_SNAP, x: worldX, z: worldZ } };
}

describe('RectangleTool — S52 D1 state machine', () => {
  it('has name "rectangle"', () => {
    const tool = createRectangleTool({ commitLine: vi.fn() });
    expect(tool.name).toBe('rectangle');
  });

  it('first-set + pointer-move previews 4 axis-aligned lines', () => {
    const tool = createRectangleTool({ commitLine: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-move', 100, 50));
    expect(out.previewLines).toHaveLength(4);
    const sides = out.previewLines.map((l) => `${l.x1},${l.z1}→${l.x2},${l.z2}`).sort();
    expect(sides).toEqual([
      '0,0→100,0',
      '0,50→0,0',
      '100,0→100,50',
      '100,50→0,50',
    ]);
  });

  it('second click commits 4 lines forming the rectangle and returns to idle', () => {
    const commitLine = vi.fn();
    const tool = createRectangleTool({ commitLine });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-down', 100, 50));
    expect(commitLine).toHaveBeenCalledTimes(4);
    const sides = commitLine.mock.calls.map((c) => `${c[0].x1},${c[0].z1}→${c[0].x2},${c[0].z2}`).sort();
    expect(sides).toEqual([
      '0,0→100,0',
      '0,50→0,0',
      '100,0→100,50',
      '100,50→0,50',
    ]);
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/first corner/);
  });

  it('rejects degenerate second click (zero width or zero height)', () => {
    const commitLine = vi.fn();
    const tool = createRectangleTool({ commitLine });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-down', 0, 50));
    expect(commitLine).not.toHaveBeenCalled();
    expect(out.previewLines).toHaveLength(4); // still rendering the (degenerate) preview
  });

  it('cancel during first-set returns to idle and emits empty preview', () => {
    const commitLine = vi.fn();
    const tool = createRectangleTool({ commitLine });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('cancel'));
    expect(out.previewLines).toEqual([]);
    tool.handle(ev('pointer-down', 5, 5));
    expect(commitLine).not.toHaveBeenCalled();
  });

  it('subsequent rectangles work after a commit', () => {
    const commitLine = vi.fn();
    const tool = createRectangleTool({ commitLine });
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 10, 10));
    tool.handle(ev('pointer-down', 100, 100));
    tool.handle(ev('pointer-down', 200, 200));
    expect(commitLine).toHaveBeenCalledTimes(8);
  });
});
