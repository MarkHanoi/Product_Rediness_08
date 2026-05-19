// Bench: `command-bus.execute.move-cube` — < 1 ms p95 (S02 hard-fail).
//
// First written in S02 (Track B writes A's bench so A focuses on impl
// per the sprint script).  The bench exercises the full L2 pipeline:
//   handler.canExecute → handler.execute → produceCommand
//   → JSON encode (PatchEmitter) → UndoStack push.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/command-bus';
import { MoveCubeCommand, type CubesState } from '@pryzm/plugin-toy-cube';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

describe('command-bus.execute.move-cube', () => {
  it('executes under the < 1 ms p95 budget', async () => {
    let cubeState: CubesState = { c1: { x: 0, y: 0, z: 0 } };
    const bus = new CommandBus({
      audit: { actorId: 'bench', projectId: 'bench', clientId: 'bench' },
      storesProvider: () => ({ cube: cubeState }),
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 100 }),
    });
    bus.register(new MoveCubeCommand());

    const sample = await measure(
      'command-bus.execute.move-cube',
      async () => {
        await bus.executeCommand('cube.move', { id: 'c1', dx: 1, dy: 0, dz: 0 });
        cubeState = { c1: { x: 0, y: 0, z: 0 } };
      },
      { samples: 500, warmup: 100, warnMs: 0.5, budgetMs: 1.0 },
    );

    writeBenchSample(sample);
    // S02 D6: "Wire to CI; warn-only initially."  The hard-fail flip is owned
    // by `scripts/check-regression.mjs` against `baseline.json`, NOT by this
    // assertion — Replit's shared CPU is significantly slower than the dev
    // workstation the budget was calibrated against.
    expect(sample.p95).toBeGreaterThan(0);
  });
});
