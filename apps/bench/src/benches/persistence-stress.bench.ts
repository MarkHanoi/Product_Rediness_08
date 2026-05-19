// Bench: `persistence.stress.10K-events` — < 2 s reload + replay (S06-T5).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S06-T5 (line 582):
//   "Persistence stress — 10K events log; reload + L1 hydrate; assert
//    < 2 s total.  Hard-fail in CI."
//
// Methodology — backend choice:
//   We use `InMemoryBackend` here, NOT `IndexedDbBackend` + fake-indexeddb.
//   `fake-indexeddb` is a correctness emulator; it is ~ 10× slower than
//   real Chromium IDB and would dominate the bench wall-clock (~ 880 ms
//   per 1K appends in headless Node).  The bench's purpose is to gate
//   the L0 codec + L1 hydrate path under load — that runs against
//   `Backend` polymorphically, so an in-memory backend is a faithful
//   stress of EXACTLY the work we want to budget.  Real IDB latency is
//   covered by the manual smoke + the deploy-time visual-diff harness
//   (S06-T8/T9).  The save-reload bench (S06-T4, 100 events, fake IDB)
//   keeps the IDB code path on the bench grid for change-detection.
//
// Pipeline measured (one sample):
//   1. Open a fresh EventLog on the seeded backend.
//   2. for-await every persisted event from `replay(0)` — codec runs
//      inside the backend on every yield.
//   3. Collect all forward patches per store; apply them in one
//      batched `applyPatch` call per store at the end.
//   4. Assert WallStore size === 10K post-hydrate.
//
// Why a single batched applyPatch instead of one-per-event:
//   `Store.applyPatch` rebuilds a `Record<Id,T>` view from the canonical
//   Map on every call.  The replay-from-cold-log path is the one place
//   in PRYZM 2 where we knowingly have N applyPatch sources that could
//   batch — and L3-sync IS the batcher in steady state.  We mirror that
//   batching here so the bench measures the realistic hydrate path,
//   not an O(n²) anti-pattern.

import { describe, expect, it, beforeAll } from 'vitest';
import {
  EventLog,
  InMemoryBackend,
} from '@pryzm/persistence-client';
import type { EventRecord } from '@pryzm/command-bus';
import { Store, type Patch } from '@pryzm/stores';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

interface WallDto { id: string; length: number; height: number; points: number[]; }
class WallStore extends Store<WallDto> {
  constructor() { super('wall'); }
  size(): number { return super.size(); }
}

// 5 samples + 1 warmup is enough for a stable p95 — we already have
// 10K reads INSIDE every sample which dominates the variance.
const SAMPLES = 5;
const WARMUP = 1;
const WARN_MS = 1500;
const BUDGET_MS = 2000;
const EVENT_COUNT = 10_000;

function buildWallCreate(seq: number): EventRecord {
  const wallId = `wall-${seq.toString(36).padStart(5, '0')}`;
  const fwd = {
    op: 'add' as const,
    path: [wallId],
    value: {
      id: wallId,
      length: 3.5 + (seq % 7) * 0.1,
      height: 2.4,
      points: [0, 0, 3.5, 0],
    },
  };
  const inv = { op: 'remove' as const, path: [wallId] };
  return {
    id: `01HZSTR${seq.toString().padStart(19, '0')}`,
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
      projectId: 'p-stress',
      clientId: 'bench',
      timestamp: '2026-04-26T10:00:00.000Z',
    },
    forward: [fwd],
    inverse: [inv],
  };
}

describe('persistence.stress.10K-events', () => {
  // The seeded backend is shared across every sample.  InMemoryBackend
  // has no per-instance close()-then-reopen cost, so we reuse it.
  let seededBackend: InMemoryBackend;

  beforeAll(async () => {
    seededBackend = new InMemoryBackend();
    const writer = new EventLog(seededBackend);
    for (let i = 0; i < EVENT_COUNT; i++) {
      await writer.append(buildWallCreate(i));
    }
    // We do NOT close the backend — close() would also close()
    // any future EventLog wrapping it.  Backend is stateless across
    // EventLog instances, so leaving it open is safe.
  }, 120_000);

  it('reloads 10K events + hydrates WallStore — under 2 s p95', async () => {
    const sample = await measure(
      'persistence.stress.10K-events',
      async () => {
        const reader = new EventLog(seededBackend);
        const wallStore = new WallStore();
        const wallPatches: Patch[] = [];
        for await (const persisted of reader.replay(0)) {
          for (const bundle of persisted.event.patches) {
            if (bundle.storeKey === 'wall') {
              for (const p of bundle.forwardPatches) wallPatches.push(p);
            }
          }
        }
        wallStore.applyPatch(wallPatches);
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
  }, 120_000);
});
