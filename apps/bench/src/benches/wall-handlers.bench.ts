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
//
// ⚠ §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) + §FIX-DEAD-VERB-REFUSE (W3-3):
// `wall.move`, `wall.setDimensions` and `wall.setColor` now REFUSE in
// `canExecute` — they wrote the detached plugin DTO store nothing renders,
// exports or persists, and no production surface dispatches them (walls commit
// through `wall.updateBaseline` / `wall.updateDimensions` / `wall.updateColor`,
// which are initBusHandlers bridges, not members of `buildWallHandlerSet()`, so
// they cannot be benched here). This bench USED to time a handler that changed
// nothing and assert only `p95 > 0` — a timing of a lie. CONVERTED, NOT DELETED:
// the three cases keep their sample names (baseline.json continuity) and now
// time the REFUSAL dispatch path — validate → canExecute → throw — while
// pinning that the rejection names the live alternative. `wall.create` and
// `wall.delete` stay as the live-verb positive controls.

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

  // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — times the REFUSAL path, and pins that a
  // resolution (the old silent lie) fails the bench loudly instead of timing it.
  it('wall.move REFUSES (naming wall.updateBaseline) under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const id = createId('wall');
    seedWall(store, id);
    const sample = await measure(
      'command-bus.execute.wall-move',
      async () => {
        const err = await bus
          .executeCommand('wall.move', {
            id,
            baseLine: [
              { x: 0, y: 0, z: 0 },
              { x: 4, y: 0, z: 0 },
            ],
          })
          .then(() => null, (e: unknown) => e);
        if (err === null) {
          throw new Error('BENCH PINNED A LIE: wall.move resolved — it must refuse (wall.updateBaseline is the live path)');
        }
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
    // The refusal must name the live alternative, once, outside the timed loop.
    await expect(
      bus.executeCommand('wall.move', { id, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] }),
    ).rejects.toThrow(/wall\.updateBaseline/);
  });

  // §FIX-DEAD-VERB-REFUSE (W3-3 KNOWN FOLLOW-UP) — same conversion for the two
  // property verbs refused in the 17-verb batch; the live commands are
  // initBusHandlers bridges and cannot be registered from buildWallHandlerSet().
  it('wall.setDimensions REFUSES (naming wall.updateDimensions) under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const id = createId('wall');
    seedWall(store, id);
    const sample = await measure(
      'command-bus.execute.wall-setDimensions',
      async () => {
        const err = await bus
          .executeCommand('wall.setDimensions', { id, height: 3.0, thickness: 0.2 })
          .then(() => null, (e: unknown) => e);
        if (err === null) {
          throw new Error('BENCH PINNED A LIE: wall.setDimensions resolved — it must refuse (wall.updateDimensions is the live path)');
        }
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
    await expect(
      bus.executeCommand('wall.setDimensions', { id, height: 3.0, thickness: 0.2 }),
    ).rejects.toThrow(/wall\.updateDimensions/);
  });

  it('wall.setColor REFUSES (naming wall.updateColor) under the < 1 ms p95 budget', async () => {
    const store = new WallStore();
    const bus = buildBus(store);
    const id = createId('wall');
    seedWall(store, id);
    const sample = await measure(
      'command-bus.execute.wall-setColor',
      async () => {
        const err = await bus
          .executeCommand('wall.setColor', { id, materialColor: '#aabbcc' })
          .then(() => null, (e: unknown) => e);
        if (err === null) {
          throw new Error('BENCH PINNED A LIE: wall.setColor resolved — it must refuse (wall.updateColor is the live path)');
        }
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
    await expect(
      bus.executeCommand('wall.setColor', { id, materialColor: '#aabbcc' }),
    ).rejects.toThrow(/wall\.updateColor/);
  });
});
