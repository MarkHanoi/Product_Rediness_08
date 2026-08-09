// Bench: `command-bus.execute.curtain-wall-handlers` — < 1 ms p95.
//
// Flow-5 named-verifier proxy.  Spec at
// `docs/archive/pryzm3-internal/04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md`
// §1 Flow 5 calls for `pnpm bench create-300-curtain-walls` ≤ 4.5 s.
// At < 1 ms per dispatch (this bench's per-handler envelope), 300
// dispatches comfortably clear the spec's 4.5 s budget by ~15× — same
// reasoning as Flow-4's `wall-handlers.bench.ts:1-10`.  The dedicated
// `create-300-curtain-walls.bench.ts` (300-call loop + wall-clock + FPS
// gate) lands in the Wave 13 NFT batch alongside `create-300-walls`.
//
// Mirrors `wall-handlers.bench.ts`: each command type is a separate
// measurement so a per-handler regression doesn't hide behind a fast
// neighbour in `apps/bench/baseline.json`.
//
// Budget: warnMs 0.5, budgetMs 1.0 — same envelope as `wall-handlers`
// and `move-cube`.  Replit shared CPU is variable; the hard-fail flip
// is owned by `scripts/check-regression.mjs`, not the assertion below.
//
// Naming (§FIX-COMMAND-NAMESPACE, L-796):
// - The canonical command prefix is `curtain-wall` (hyphenated), matching
//   the plugin id and the flows-doc §1 Flow 5 row — see
//   `CURTAIN_WALL_HANDLER_TYPES` in `plugins/curtain-wall/src/handlers/index.ts`.
//   The un-hyphenated `curtainwall.*` spelling this bench used to dispatch is
//   now a deprecated `CommandHandler.aliases` entry, kept only so replayed
//   history and unmigrated callers still resolve.
// - `curtainwall` REMAINS the storeKey. Store ids are a separate namespace
//   from command types and were deliberately left alone.

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/command-bus';
import { CurtainWall, createId } from '@pryzm/schemas';
import {
  CurtainWallStore,
  buildCurtainWallHandlerSet,
  type CurtainWallData,
  type CurtainWallsState,
} from '@pryzm/plugin-curtain-wall';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

function buildBus(store: CurtainWallStore): CommandBus {
  const bus = new CommandBus({
    audit: { actorId: 'bench', projectId: 'bench', clientId: 'bench' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 100 }),
    storesProvider: () => ({
      curtainwall: Object.fromEntries(store.getState()) as CurtainWallsState,
    }),
  });
  for (const h of buildCurtainWallHandlerSet()) bus.register(h);
  return bus;
}

function seedCurtainWall(store: CurtainWallStore, id: string): CurtainWallData {
  const cw = CurtainWall.parse({ id, levelId: 'lvl_test' }) as CurtainWallData;
  store.applyPatch([{ op: 'add', path: [id], value: cw }]);
  return cw;
}

describe('command-bus.execute.curtain-wall-handlers', () => {
  it('curtain-wall.create executes under the < 1 ms p95 budget', async () => {
    const store = new CurtainWallStore();
    const bus = buildBus(store);
    const sample = await measure(
      'command-bus.execute.curtain-wall-create',
      async () => {
        await bus.executeCommand('curtain-wall.create', {
          id: createId('curtainwall'),
          levelId: 'lvl_test',
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('curtain-wall.delete executes under the < 1 ms p95 budget', async () => {
    const store = new CurtainWallStore();
    const bus = buildBus(store);
    const sample = await measure(
      'command-bus.execute.curtain-wall-delete',
      async () => {
        const id = createId('curtainwall');
        seedCurtainWall(store, id);
        await bus.executeCommand('curtain-wall.delete', { curtainWallId: id });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('curtain-wall.move executes under the < 1 ms p95 budget', async () => {
    const store = new CurtainWallStore();
    const bus = buildBus(store);
    const id = createId('curtainwall');
    seedCurtainWall(store, id);
    const sample = await measure(
      'command-bus.execute.curtain-wall-move',
      async () => {
        await bus.executeCommand('curtain-wall.move', {
          curtainWallId: id,
          delta: { x: 0.01, y: 0, z: 0 },
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('curtain-wall.setGrid executes under the < 1 ms p95 budget', async () => {
    const store = new CurtainWallStore();
    const bus = buildBus(store);
    const id = createId('curtainwall');
    seedCurtainWall(store, id);
    const sample = await measure(
      'command-bus.execute.curtain-wall-setGrid',
      async () => {
        await bus.executeCommand('curtain-wall.setGrid', {
          curtainWallId: id,
          bayWidth: 1.5,
          bayHeight: 1.8,
        });
      },
      { samples: 200, warmup: 50, warnMs: 0.5, budgetMs: 1.0 },
    );
    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
  });
});
