// tool-polyline.spec — S10-D6 Polyline mode (N-click) state machine.

import { describe, expect, it, vi } from 'vitest';
import {
  WallCreationTool,
  type ScreenToWorld,
  type ToolPoint3D,
} from '../src/tool.js';

interface FakeBus {
  executeCommand: ReturnType<typeof vi.fn>;
}

function makeBus(): FakeBus {
  return { executeCommand: vi.fn().mockResolvedValue(undefined) };
}

function makeScreenToWorld(map: Record<string, ToolPoint3D>): ScreenToWorld {
  return (ev) => map[`${ev.clientX},${ev.clientY}`];
}

const evAt = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1 });

describe('WallCreationTool — polyline mode', () => {
  it('polyline mode: 4 clicks + Enter → 3 wall.create commands (sequential)', async () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '0,0':   { x: 0, y: 0, z: 0 },
      '10,0':  { x: 1, y: 0, z: 0 },
      '10,10': { x: 1, y: 0, z: 1 },
      '20,10': { x: 2, y: 0, z: 1 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'polyline',
      levelId: 'level:0',
    });

    expect(tool.getMode()).toBe('polyline');
    expect(tool.getState()).toBe('IDLE');

    tool.onPointerDown(evAt(0, 0));
    expect(tool.getState()).toBe('BUILDING');
    expect(tool.getVertices().length).toBe(1);

    tool.onPointerDown(evAt(10, 0));
    tool.onPointerDown(evAt(10, 10));
    tool.onPointerDown(evAt(20, 10));
    expect(tool.getVertices().length).toBe(4);

    tool.onKeyDown({ key: 'Enter' });

    // commitPolyline is async — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(tool.getState()).toBe('IDLE');
    expect(tool.getVertices().length).toBe(0);
    expect(bus.executeCommand).toHaveBeenCalledTimes(3);

    // Segment ordering and shared levelId.
    const calls = bus.executeCommand.mock.calls;
    expect(calls[0]![1]).toMatchObject({
      levelId: 'level:0',
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    });
    expect(calls[1]![1]).toMatchObject({
      baseLine: [
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
      ],
    });
    expect(calls[2]![1]).toMatchObject({
      baseLine: [
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ],
    });
  });

  it('polyline mode: double-click also commits', async () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '0,0':  { x: 0, y: 0, z: 0 },
      '10,0': { x: 1, y: 0, z: 0 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'polyline',
    });

    tool.onPointerDown(evAt(0, 0));
    tool.onPointerDown(evAt(10, 0));
    tool.onDoubleClick(evAt(10, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(tool.getState()).toBe('IDLE');
    expect(bus.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('polyline mode: Backspace pops the last vertex; popping to zero returns to IDLE', () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '0,0':  { x: 0, y: 0, z: 0 },
      '10,0': { x: 1, y: 0, z: 0 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'polyline',
    });

    tool.onPointerDown(evAt(0, 0));
    tool.onPointerDown(evAt(10, 0));
    expect(tool.getVertices().length).toBe(2);

    tool.onKeyDown({ key: 'Backspace' });
    expect(tool.getVertices().length).toBe(1);
    expect(tool.getState()).toBe('BUILDING');

    tool.onKeyDown({ key: 'Backspace' });
    expect(tool.getVertices().length).toBe(0);
    expect(tool.getState()).toBe('IDLE');
    expect(bus.executeCommand).not.toHaveBeenCalled();
  });

  it('polyline mode: Esc cancels everything without dispatch', () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '0,0':  { x: 0, y: 0, z: 0 },
      '10,0': { x: 1, y: 0, z: 0 },
      '20,0': { x: 2, y: 0, z: 0 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'polyline',
    });

    tool.onPointerDown(evAt(0, 0));
    tool.onPointerDown(evAt(10, 0));
    tool.onPointerDown(evAt(20, 0));
    tool.onKeyDown({ key: 'Escape' });

    expect(tool.getState()).toBe('IDLE');
    expect(tool.getVertices().length).toBe(0);
    expect(bus.executeCommand).not.toHaveBeenCalled();
  });

  it('polyline mode: Enter on a single vertex is a no-op (cannot form a 0-length wall)', async () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({ '0,0': { x: 0, y: 0, z: 0 } });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'polyline',
    });

    tool.onPointerDown(evAt(0, 0));
    tool.onKeyDown({ key: 'Enter' });
    await Promise.resolve();

    expect(tool.getState()).toBe('IDLE');
    expect(bus.executeCommand).not.toHaveBeenCalled();
  });

  it('polyline mode: preview hook receives accumulated vertices + current pointer', () => {
    const previewCalls: ToolPoint3D[][] = [];
    const s2w = makeScreenToWorld({
      '0,0':  { x: 0, y: 0, z: 0 },
      '5,0':  { x: 0.5, y: 0, z: 0 },
      '10,0': { x: 1, y: 0, z: 0 },
    });
    const tool = new WallCreationTool({
      commandBus: makeBus() as never,
      screenToWorld: s2w,
      mode: 'polyline',
      previewLine: (pts) => previewCalls.push(pts.map((p) => ({ ...p }))),
    });

    tool.onPointerDown(evAt(0, 0));      // [v0]
    tool.onPointerMove(evAt(5, 0));      // [v0, current]
    tool.onPointerDown(evAt(10, 0));     // [v0, v1]

    expect(previewCalls.length).toBeGreaterThanOrEqual(3);
    expect(previewCalls[0]!.length).toBe(1);
    expect(previewCalls[1]!.length).toBe(2);
    expect(previewCalls[2]!.length).toBe(2);
    expect(previewCalls[2]![1]).toEqual({ x: 1, y: 0, z: 0 });
  });
});
