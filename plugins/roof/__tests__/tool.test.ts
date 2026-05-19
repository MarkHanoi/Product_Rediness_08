// RoofPlacementTool unit tests (S11-T3).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { RoofStore, type RoofsState } from '../src/store.js';
import { buildRoofHandlerSet } from '../src/handlers/index.js';
import { RoofPlacementTool } from '../src/tool.js';

function buildEnv() {
  const roof = new RoofStore();
  const stores = { roof: roof as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      roof: Object.fromEntries(roof.getState()) as RoofsState,
    }),
  });
  for (const h of buildRoofHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { roof, bus, detach };
}

const SQUARE = [
  { x: 0, y: 0, z: 0 },
  { x: 5, y: 0, z: 0 },
  { x: 5, y: 0, z: 5 },
  { x: 0, y: 0, z: 5 },
];

describe('RoofPlacementTool', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('throws when constructor deps are missing', () => {
    expect(
      () =>
        new RoofPlacementTool({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          commandBus: undefined as any,
        }),
    ).toThrow();
  });

  it('places a roof from a valid boundary', async () => {
    env = buildEnv();
    const tool = new RoofPlacementTool({ commandBus: env.bus });
    const res = await tool.place({ boundary: SQUARE, levelId: 'lvl_1' });
    expect(res).toBeDefined();
    expect(env.roof.size()).toBe(1);
    expect(env.roof.get(res!.roofId)?.shape).toBe('flat');
  });

  it('returns undefined for a degenerate boundary', async () => {
    env = buildEnv();
    const tool = new RoofPlacementTool({ commandBus: env.bus });
    const res = await tool.place({
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    });
    expect(res).toBeUndefined();
    expect(env.roof.size()).toBe(0);
  });

  it('honours a non-default systemTypeId', async () => {
    env = buildEnv();
    const tool = new RoofPlacementTool({ commandBus: env.bus });
    const res = await tool.place({
      boundary: SQUARE,
      systemTypeId: 'roof.gable.standard',
    });
    expect(res).toBeDefined();
    expect(env.roof.get(res!.roofId)?.shape).toBe('gable');
  });
});
