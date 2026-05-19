// tool-arc.spec — S10-D6 Arc mode (3-click) state machine.

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

describe('WallCreationTool — arc mode', () => {
  it('default mode is straight; arc mode requires explicit opt-in', () => {
    const tool = new WallCreationTool({
      commandBus: makeBus() as never,
      screenToWorld: () => undefined,
    });
    expect(tool.getMode()).toBe('straight');
  });

  it('arc mode: 3 clicks → IDLE → AWAITING_THROUGH → AWAITING_END_ARC → IDLE', () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '10,10': { x: 0, y: 0, z: 0 },
      '20,10': { x: 1, y: 0, z: 0.5 },
      '30,10': { x: 2, y: 0, z: 0 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'arc',
      levelId: 'level:0',
    });

    expect(tool.getState()).toBe('IDLE');
    tool.onPointerDown(evAt(10, 10));
    expect(tool.getState()).toBe('AWAITING_THROUGH');
    expect(tool.getStartPoint()).toEqual({ x: 0, y: 0, z: 0 });

    tool.onPointerDown(evAt(20, 10));
    expect(tool.getState()).toBe('AWAITING_END_ARC');
    expect(tool.getThroughPoint()).toEqual({ x: 1, y: 0, z: 0.5 });

    tool.onPointerDown(evAt(30, 10));
    expect(tool.getState()).toBe('IDLE');
    expect(tool.getStartPoint()).toBeNull();
    expect(tool.getThroughPoint()).toBeNull();

    expect(bus.executeCommand).toHaveBeenCalledTimes(1);
    const [cmd, payload] = bus.executeCommand.mock.calls[0]!;
    expect(cmd).toBe('wall.create');
    expect(payload).toMatchObject({
      levelId: 'level:0',
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      curve: {
        control: { x: 1, y: 0, z: 0.5 },
        segments: 16,
      },
    });
  });

  it('arc mode: Esc from AWAITING_THROUGH returns to IDLE without dispatch', () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({ '10,10': { x: 0, y: 0, z: 0 } });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'arc',
    });

    tool.onPointerDown(evAt(10, 10));
    expect(tool.getState()).toBe('AWAITING_THROUGH');
    tool.onKeyDown({ key: 'Escape' });
    expect(tool.getState()).toBe('IDLE');
    expect(tool.getStartPoint()).toBeNull();
    expect(bus.executeCommand).not.toHaveBeenCalled();
  });

  it('arc mode: Esc from AWAITING_END_ARC returns to IDLE without dispatch', () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '10,10': { x: 0, y: 0, z: 0 },
      '20,10': { x: 1, y: 0, z: 0.5 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'arc',
    });

    tool.onPointerDown(evAt(10, 10));
    tool.onPointerDown(evAt(20, 10));
    expect(tool.getState()).toBe('AWAITING_END_ARC');
    tool.onKeyDown({ key: 'Escape' });
    expect(tool.getState()).toBe('IDLE');
    expect(tool.getThroughPoint()).toBeNull();
    expect(bus.executeCommand).not.toHaveBeenCalled();
  });

  it('arc mode: preview hook fires with 2-tuple after 1st click and 3-tuple after 2nd', () => {
    const previewCalls: ToolPoint3D[][] = [];
    const s2w = makeScreenToWorld({
      '10,10': { x: 0, y: 0, z: 0 },
      '15,10': { x: 0.5, y: 0, z: 0.25 },
      '20,10': { x: 1, y: 0, z: 0.5 },
      '25,10': { x: 1.5, y: 0, z: 0.25 },
    });
    const tool = new WallCreationTool({
      commandBus: makeBus() as never,
      screenToWorld: s2w,
      mode: 'arc',
      previewLine: (pts) => previewCalls.push(pts.map((p) => ({ ...p }))),
    });

    tool.onPointerDown(evAt(10, 10));     // 2-tuple [start,start]
    tool.onPointerMove(evAt(15, 10));     // 2-tuple [start,current]
    tool.onPointerDown(evAt(20, 10));     // 3-tuple [start,through,through]
    tool.onPointerMove(evAt(25, 10));     // 3-tuple [start,through,current]

    expect(previewCalls.length).toBe(4);
    expect(previewCalls[0]!.length).toBe(2);
    expect(previewCalls[1]!.length).toBe(2);
    expect(previewCalls[2]!.length).toBe(3);
    expect(previewCalls[3]!.length).toBe(3);
    expect(previewCalls[3]![2]).toEqual({ x: 1.5, y: 0, z: 0.25 });
  });

  it('arc mode: systemType + levelId flow through to the dispatched payload', async () => {
    const bus = makeBus();
    const s2w = makeScreenToWorld({
      '10,10': { x: 0, y: 0, z: 0 },
      '20,10': { x: 1, y: 0, z: 0.5 },
      '30,10': { x: 2, y: 0, z: 0 },
    });
    const tool = new WallCreationTool({
      commandBus: bus as never,
      screenToWorld: s2w,
      mode: 'arc',
      levelId: 'level:42',
      systemType: { id: 'sys-A', name: 'A', layers: [] } as never,
    });

    tool.onPointerDown(evAt(10, 10));
    tool.onPointerDown(evAt(20, 10));
    tool.onPointerDown(evAt(30, 10));

    const [, payload] = bus.executeCommand.mock.calls[0]!;
    expect(payload).toMatchObject({
      levelId: 'level:42',
      systemTypeId: 'sys-A',
    });
  });
});
