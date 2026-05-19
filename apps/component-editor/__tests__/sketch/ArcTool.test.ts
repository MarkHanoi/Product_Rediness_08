// ArcTool tests (S53 D1) — three-click centre / start / end state machine.

import { describe, expect, it, vi } from 'vitest';
import { createArcTool } from '../../src/sketch/tools/ArcTool.js';
import type { ToolEvent } from '../../src/sketch/tools/types.js';
import type { SnapHit } from '../../src/sketch/snap.js';

const NO_SNAP: SnapHit = { x: 0, z: 0, kind: 'none' };

function ev(kind: ToolEvent['kind'], worldX = 0, worldZ = 0): ToolEvent {
  return { kind, worldX, worldZ, snap: { ...NO_SNAP, x: worldX, z: worldZ } };
}

describe('ArcTool — name + initial state', () => {
  it('has name "arc"', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    expect(tool.name).toBe('arc');
  });

  it('idle hover hints "Click arc centre"', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    const out = tool.handle(ev('pointer-move', 5, 5));
    expect(out.previewLines).toEqual([]);
    expect(out.hint).toMatch(/centre/i);
  });
});

describe('ArcTool — three-click flow', () => {
  it('first click → centre-set, hint asks for arc start', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    const out = tool.handle(ev('pointer-down', 0, 0));
    expect(out.hint).toMatch(/arc start/);
  });

  it('after centre click, pointer-move previews the radial line', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-move', 10, 0));
    expect(out.previewLines).toHaveLength(1);
    expect(out.previewLines[0]).toMatchObject({ x1: 0, z1: 0, x2: 10, z2: 0 });
  });

  it('second click → start-set, hint asks for arc end', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-down', 5, 0));
    expect(out.hint).toMatch(/arc end/);
  });

  it('after start-set, pointer-move previews an arc with the locked radius', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 10, 0));
    const out = tool.handle(ev('pointer-move', 0, 10));
    expect(out.previewArcs).toHaveLength(1);
    const arc = out.previewArcs![0]!;
    expect(arc.cx).toBeCloseTo(0, 6);
    expect(arc.cz).toBeCloseTo(0, 6);
    expect(arc.radius).toBeCloseTo(10, 6);
    expect(arc.startAngle).toBeCloseTo(0, 6);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('third click commits an arc through commitArc and returns to idle', () => {
    const commitArc = vi.fn();
    const tool = createArcTool({ commitLine: vi.fn(), commitArc });
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 5, 0));
    const out = tool.handle(ev('pointer-down', 0, 5));
    expect(commitArc).toHaveBeenCalledTimes(1);
    const a = commitArc.mock.calls[0]![0];
    expect(a.cx).toBeCloseTo(0, 6);
    expect(a.cz).toBeCloseTo(0, 6);
    expect(a.radius).toBeCloseTo(5, 6);
    expect(a.startAngle).toBeCloseTo(0, 6);
    expect(a.endAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(out.hint).toMatch(/centre/i);
  });
});

describe('ArcTool — degenerate inputs + cancel', () => {
  it('rejects a second click that lands on the centre (radius = 0)', () => {
    const commitArc = vi.fn();
    const tool = createArcTool({ commitLine: vi.fn(), commitArc });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.handle(ev('pointer-down', 0, 0));
    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/arc start/);
  });

  it('rejects a third click whose end angle equals the start angle', () => {
    const commitArc = vi.fn();
    const tool = createArcTool({ commitLine: vi.fn(), commitArc });
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 5, 0));
    const out = tool.handle(ev('pointer-down', 5, 0));
    expect(commitArc).not.toHaveBeenCalled();
    expect(out.hint).toMatch(/end angle equals start/i);
  });

  it('cancel returns to idle', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 5, 0));
    const out = tool.handle(ev('cancel'));
    expect(out.previewLines).toEqual([]);
    expect(out.previewArcs ?? []).toEqual([]);
  });

  it('throws when commitArc is missing', () => {
    const tool = createArcTool({ commitLine: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    tool.handle(ev('pointer-down', 5, 0));
    expect(() => tool.handle(ev('pointer-down', 0, 5))).toThrow(/commitArc is required/);
  });

  it('reset clears state and the preview', () => {
    const tool = createArcTool({ commitLine: vi.fn(), commitArc: vi.fn() });
    tool.handle(ev('pointer-down', 0, 0));
    const out = tool.reset();
    expect(out.previewLines).toEqual([]);
  });
});
