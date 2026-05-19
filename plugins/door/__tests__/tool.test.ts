// DoorPlacementTool unit tests (S11-T1).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { Wall, createId } from '@pryzm/plugin-sdk';
import { DoorStore, type DoorsState } from '../src/store.js';
import { WallStore, type WallsState } from '@pryzm/plugin-wall';
import {
  buildDoorHandlerSet,
} from '../src/handlers/index.js';
import {
  buildWallHandlerSet,
} from '@pryzm/plugin-wall/handlers';
import { DoorPlacementTool } from '../src/tool.js';

function buildEnv() {
  const door = new DoorStore();
  const wall = new WallStore();
  const stores = {
    door: door as unknown as import('@pryzm/stores').Store<object>,
    wall: wall as unknown as import('@pryzm/stores').Store<object>,
  };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      door: Object.fromEntries(door.getState()) as DoorsState,
      wall: Object.fromEntries(wall.getState()) as WallsState,
    }),
  });
  for (const h of buildWallHandlerSet()) bus.register(h);
  for (const h of buildDoorHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { door, wall, bus, detach };
}

describe('DoorPlacementTool', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('throws when constructor deps are missing', () => {
    expect(
      () =>
        new DoorPlacementTool({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          commandBus: undefined as any,
          screenToWorld: () => ({ x: 0, y: 0, z: 0 }),
          wallsSnapshot: () => ({}),
        }),
    ).toThrow();
  });

  it('places a door on the nearest wall (dispatches wall.createOpening + door.create)', async () => {
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

    const tool = new DoorPlacementTool({
      commandBus: env.bus,
      screenToWorld: () => ({ x: 2.5, y: 0, z: 0.05 }),
      wallsSnapshot: () =>
        Object.fromEntries(env.wall.getState()) as WallsState,
    });

    const result = await tool.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });
    expect(result).toBeDefined();
    expect(result!.wallId).toBe(wallId);
    expect(env.door.size()).toBe(1);
    const wallAfter = env.wall.get(wallId)!;
    expect(wallAfter.openings).toHaveLength(1);
    expect(wallAfter.openings[0]!.elementId).toBe(result!.doorId);
  });

  it('returns undefined when click misses every wall', async () => {
    env = buildEnv();
    const tool = new DoorPlacementTool({
      commandBus: env.bus,
      screenToWorld: () => ({ x: 0, y: 0, z: 100 }),
      wallsSnapshot: () => ({}),
    });
    const result = await tool.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });
    expect(result).toBeUndefined();
    expect(env.door.size()).toBe(0);
  });
});
