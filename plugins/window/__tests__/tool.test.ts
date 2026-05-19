// WindowPlacementTool unit tests (S11-T2).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { Wall, createId } from '@pryzm/plugin-sdk';
import { WindowStore, type WindowsState } from '../src/store.js';
import { WallStore, type WallsState } from '@pryzm/plugin-wall';
import { buildWindowHandlerSet } from '../src/handlers/index.js';
import { buildWallHandlerSet } from '@pryzm/plugin-wall/handlers';
import { WindowPlacementTool } from '../src/tool.js';

function buildEnv() {
  const window = new WindowStore();
  const wall = new WallStore();
  const stores = {
    window: window as unknown as import('@pryzm/stores').Store<object>,
    wall: wall as unknown as import('@pryzm/stores').Store<object>,
  };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      window: Object.fromEntries(window.getState()) as WindowsState,
      wall: Object.fromEntries(wall.getState()) as WallsState,
    }),
  });
  for (const h of buildWallHandlerSet()) bus.register(h);
  for (const h of buildWindowHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { window, wall, bus, detach };
}

describe('WindowPlacementTool', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('throws when constructor deps are missing', () => {
    expect(
      () =>
        new WindowPlacementTool({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          commandBus: undefined as any,
          screenToWorld: () => ({ x: 0, y: 0, z: 0 }),
          wallsSnapshot: () => ({}),
        }),
    ).toThrow();
  });

  it('places a window on the nearest wall (dispatches wall.createOpening + window.create)', async () => {
    env = buildEnv();
    const wallId = createId('wall');
    const wall = Wall.parse({
      id: wallId,
      levelId: 'lvl_1',
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
      height: 2.4,
      thickness: 0.1,
    });
    await env.bus.executeCommand('wall.create', {
      id: wallId,
      levelId: 'lvl_1',
      baseLine: wall.baseLine,
      height: wall.height,
      thickness: wall.thickness,
    });
    expect(env.wall.size()).toBe(1);

    const tool = new WindowPlacementTool({
      commandBus: env.bus,
      screenToWorld: () => ({ x: 2.5, y: 0, z: 0.05 }),
      wallsSnapshot: () => Object.fromEntries(env.wall.getState()) as WallsState,
    });

    const result = await tool.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });
    expect(result).toBeDefined();
    expect(result!.wallId).toBe(wallId);
    expect(env.window.size()).toBe(1);
    const wallAfter = env.wall.get(wallId)!;
    expect(wallAfter.openings).toHaveLength(1);
    expect(wallAfter.openings[0]!.elementId).toBe(result!.windowId);
  });

  it('returns undefined when click misses every wall', async () => {
    env = buildEnv();
    const tool = new WindowPlacementTool({
      commandBus: env.bus,
      screenToWorld: () => ({ x: 0, y: 0, z: 100 }),
      wallsSnapshot: () => ({}),
    });
    const result = await tool.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });
    expect(result).toBeUndefined();
    expect(env.window.size()).toBe(0);
  });
});
