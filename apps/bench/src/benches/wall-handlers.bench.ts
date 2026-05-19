// Bench: `command-bus.execute.wall-handlers` — < 1 ms p95 (S07-T11 hard-fail).
//
// Exercises the full L2 pipeline for the 5 simplest wall handlers.  Each
// handler is a separate measurement so we can chase regressions per
// handler in `apps/bench/baseline.json` without one slow handler hiding
// behind a fast one.
//
// Budget: warnMs 0.5, budgetMs 1.0 — same envelope as `move-cube`.
// Replit shared CPU is variable; the hard-fail flip is owned by
// `scripts/check-regression.mjs`, not the assertion below.

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/command-bus';
import { Wall, createId } from '@pryzm/schemas';
import {
  WallStore,
  buildWallHandlerSet,
  type WallData,
  type WallsState,
} from '@pryzm/plugin-wall';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

function buildBus(store: WallStore): CommandBus {
  const bus = new CommandBus({
    audit: { actorId: 'bench', projectId: 'bench', clientId: 'bench' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 100 }),
    storesProvider: () => ({
      wall: Object.fromEntries(store.getState()) as WallsState,
    }),
  });
  for (const h of buildWallHandlerSet()) bus.register(h);
  return bus;
}

function seedWall(store: WallStore, id: string): WallData {
  const wall = Wall.parse({ id, levelId: 'lvl_test' }) as WallData;
  store.applyPatch([{ op: 'add', path: [id], value: wall }]);
  return wall;
}

describe('command-bus.execute.wall-handlers', () => {
  it('wall.create executes under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const sample = await measure(
      'command-bus.execute.wall-create',
      async () => {
        await bus.executeCommand('wall.create', {
          id: createId('wall'),
          levelId: 'lvl_test',
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('wall.delete executes under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const sample = await measure(
      'command-bus.execute.wall-delete',
      async () => {
        const id = createId('wall');
        seedWall(store, id);
        await bus.executeCommand('wall.delete', { id });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('wall.move executes under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const id = createId('wall');
    seedWall(store, id);
    const sample = await measure(
      'command-bus.execute.wall-move',
      async () => {
        await bus.executeCommand('wall.move', {
          id,
          baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
          ],
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('wall.setDimensions executes under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const id = createId('wall');
    seedWall(store, id);
    const sample = await measure(
      'command-bus.execute.wall-setDimensions',
      async () => {
        await bus.executeCommand('wall.setDimensions', {
          id,
          height: 3.0,
          thickness: 0.2,
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('wall.setColor executes under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const id = createId('wall');
    seedWall(store, id);
    const sample = await measure(
      'command-bus.execute.wall-setColor',
      async () => {
        await bus.executeCommand('wall.setColor', {
          id,
          materialColor: '#aabbcc',
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });
});
