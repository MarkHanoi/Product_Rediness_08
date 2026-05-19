// Bench: `persistence.save-reload.100events` — < 500 ms total (S06-T4 hard-fail).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S06-T4 (line 581):
//   "Bench `save-reload` — append 100 events, reload from log, hydrate
//    L1 stores via patches.  Hard-fail > 500 ms wall-clock."
//
// Pipeline measured (one sample = one full save→reload cycle):
//   1. Build a fresh IndexedDb-backed EventLog (fake-indexeddb).
//   2. Append 100 wall.create events (msgpack-aliased codec — ADR-004).
//   3. Open a SECOND EventLog handle on the same backend store.
//   4. Iterate every event; for each one, apply its forward patches to
//      a fresh WallStore.
//   5. Assert the WallStore ends with 100 walls.
//
// We measure the *whole cycle* — append + reload + hydrate — because
// the user-perceptible action is "save my project, close the tab,
// reopen the tab, see 100 walls".  500 ms is the bar at which the
// reload feels instantaneous.
//
// Why "hard-fail" instead of "warn":  this is the first cross-layer
// persistence promise PRYZM 2 makes the user.  If it regresses, the
// product is broken; check-regression.mjs gates it.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  EventLog,
  IndexedDbBackend,
} from '@pryzm/persistence-client';
import type { EventRecord } from '@pryzm/command-bus';
import { Store } from '@pryzm/stores';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

interface WallDto { id: string; length: number; height: number; points: number[]; }
class WallStore extends Store<WallDto> {
  constructor() { super('wall'); }
  size(): number { return super.size(); }
}

const SAMPLES = 30;
const WARMUP = 3;
const WARN_MS = 350;
const BUDGET_MS = 500;
const EVENT_COUNT = 100;

function buildWallCreate(seq: number): EventRecord {
  const wallId = `wall-${seq.toString(36).padStart(4, '0')}`;
  const fwd = {
    op: 'add' as const,
    path: [wallId],
    value: { id: wallId, length: 3.5, height: 2.4, points: [0, 0, 3.5, 0] },
  };
  const inv = { op: 'remove' as const, path: [wallId] };
  return {
    id: `01HZSAVE${seq.toString().padStart(18, '0')}`,
    type: 'wall.create',
    payload: { length: 3.5, height: 2.4, points: [0, 0, 3.5, 0] },
    affectedStores: ['wall'],
    patches: [
      {
        storeKey: 'wall',
        forwardPatches: [fwd],
        inversePatches: [inv],
        capturedAt: '2026-04-26T10:00:00.000Z',
      },
    ],
    audit: {
      actorId: 'bench',
      projectId: `p-save-reload-${seq}`,
      clientId: 'bench',
      timestamp: '2026-04-26T10:00:00.000Z',
    },
    forward: [fwd],
    inverse: [inv],
  };
}

describe('persistence.save-reload.100events', () => {
  it('appends 100 events, reloads from IDB, hydrates WallStore — under 500 ms p95', async () => {
    let dbCounter = 0;
    const sample = await measure(
      'persistence.save-reload.100events',
      async () => {
        const projectId = `bench-save-reload-${dbCounter++}`;
        // Phase 1 — write
        const writeBackend = new IndexedDbBackend({ projectId });
        await writeBackend.open();
        const writer = new EventLog(writeBackend);
        for (let i = 0; i < EVENT_COUNT; i++) {
          await writer.append(buildWallCreate(i));
        }
        await writer.close();

        // Phase 2 — reload + hydrate
        const readBackend = new IndexedDbBackend({ projectId });
        await readBackend.open();
        const reader = new EventLog(readBackend);
        const wallStore = new WallStore();
        for await (const persisted of reader.replay(0)) {
          for (const bundle of persisted.event.patches) {
            if (bundle.storeKey === 'wall') {
              wallStore.applyPatch(bundle.forwardPatches);
            }
          }
        }
        await reader.close();

        if (wallStore.size() !== EVENT_COUNT) {
          throw new Error(
            `expected ${EVENT_COUNT} walls after reload, got ${wallStore.size()}`,
          );
        }
      },
      { samples: SAMPLES, warmup: WARMUP, warnMs: WARN_MS, budgetMs: BUDGET_MS },
    );

    writeBenchSample(sample);
    expect(sample.p95).toBeGreaterThan(0);
    expect(sample.samples).toBe(SAMPLES);
  });
});
