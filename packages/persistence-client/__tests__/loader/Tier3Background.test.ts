// loader/Tier3Background.test.ts — FrameScheduler integration (S23 D4/D5).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 line 1162 — "this.scheduler.requestFrame('tier3-
//     background-load', 'background')"
//   • §S23 D4 (line 1238) — "background levels in FrameScheduler
//     background queue, distance-ordered"
//   • §S23 D5 (line 1239) — "confirm `FrameScheduler.requestFrame
//     ('tier3-background-load', 'background')` is correctly
//     scheduled without interfering with interactive frame budget."
//
// We don't run the real rAF pump here — we verify that
//   1. enqueue() requests a `'background'` frame
//   2. the disposer cancels the frame on dispose()
//   3. queue is built in distance-then-id order (covered by
//      buildQueue unit test below)
//   4. tier3 fetches in scheduler-driven mode wait for
//      processNext() before progressing

import { describe, expect, it, vi } from 'vitest';

import {
  Tier3Background,
  buildQueue,
  type FrameSchedulerLike,
} from '../../src/loader/index.js';
import { addChunk, createManifest, type Manifest } from '../../src/manifest.js';

function buildFixture(levelCount: number): {
  manifest: Manifest;
  chunkBytes: Map<string, Uint8Array>;
} {
  let m = createManifest({
    projectId: 'p-test',
    levels: Array.from({ length: levelCount }, (_, i) => ({
      id: `lvl_${i}`,
      name: `L${i}`,
      worldY: i * 3,
      elevation: i * 3,
    })),
  });
  const chunks = new Map<string, Uint8Array>();
  for (let i = 0; i < levelCount; i++) {
    const hash = `${i.toString(16).padStart(2, '0')}`.repeat(32);
    chunks.set(hash, new Uint8Array(8).fill(i));
    m = addChunk(m, {
      levelId: `lvl_${i}`,
      version: 0,
      hash,
      byteLength: 8,
      elementIds: [],
      createdAt: new Date('2026-04-27').toISOString(),
    });
  }
  return { manifest: m, chunkBytes: chunks };
}

describe('Tier3Background — buildQueue ordering', () => {
  it('orders by distance from visible level, then by levelId', () => {
    const { manifest } = buildFixture(5);
    const visible = manifest.levels[2]!; // lvl_2
    const q = buildQueue(manifest, visible);
    // d=1: lvl_1 (id < lvl_3), lvl_3
    // d=2: lvl_0 (id < lvl_4), lvl_4
    expect(q.map((r) => r.levelId)).toEqual(['lvl_1', 'lvl_3', 'lvl_0', 'lvl_4']);
    expect(q.map((r) => r.distance)).toEqual([1, 1, 2, 2]);
  });

  it('skips levels with null latestChunkHash', () => {
    let m = createManifest({
      projectId: 'p',
      levels: [
        { id: 'a', name: 'A', worldY: 0, elevation: 0 },
        { id: 'b', name: 'B', worldY: 3, elevation: 3 },
        { id: 'c', name: 'C', worldY: 6, elevation: 6 },
      ],
    });
    // Only level "c" has a chunk.
    m = addChunk(m, {
      levelId: 'c',
      version: 0,
      hash: 'cc'.repeat(32),
      byteLength: 4,
      elementIds: [],
      createdAt: new Date('2026-04-27').toISOString(),
    });
    const q = buildQueue(m, m.levels[0]!);
    expect(q).toHaveLength(1);
    expect(q[0]!.levelId).toBe('c');
  });

  it('omits the visible level itself', () => {
    const { manifest } = buildFixture(3);
    const q = buildQueue(manifest, manifest.levels[1]!);
    expect(q.find((r) => r.levelId === 'lvl_1')).toBeUndefined();
  });
});

describe('Tier3Background — scheduler integration', () => {
  it('requests a background frame on enqueue and cancels on dispose', () => {
    const { manifest, chunkBytes } = buildFixture(3);
    const requestFrame = vi.fn<
      (reason: string, p: 'interaction' | 'idle' | 'background') => string
    >(() => 'tok-1');
    const cancelFrame = vi.fn<(t: string) => boolean>(() => true);
    const scheduler: FrameSchedulerLike = { requestFrame, cancelFrame };

    const tier3 = new Tier3Background(
      async (h) => chunkBytes.get(h)!,
      () => undefined,
      scheduler,
    );
    const disposer = tier3.enqueue({
      manifest,
      visibleLevel: manifest.levels[0]!,
    });

    expect(requestFrame).toHaveBeenCalledWith('tier3-background-load', 'background');
    expect(disposer.pendingHashes()).toHaveLength(2);

    disposer.dispose();
    expect(cancelFrame).toHaveBeenCalledWith('tok-1');
    expect(disposer.pendingHashes()).toHaveLength(0);
  });

  it('processes one chunk per processNext() call in scheduler mode', async () => {
    const { manifest, chunkBytes } = buildFixture(4);
    const ready: string[] = [];
    const scheduler: FrameSchedulerLike = {
      requestFrame: () => 'tok',
      cancelFrame: () => true,
    };

    const tier3 = new Tier3Background(
      async (h) => chunkBytes.get(h)!,
      (id) => {
        ready.push(id);
      },
      scheduler,
    );
    const disposer = tier3.enqueue({
      manifest,
      visibleLevel: manifest.levels[0]!,
    });

    // Drive the queue manually as the FrameScheduler would.
    expect(tier3.processNext).not.toBeNull();
    while (disposer.pendingHashes().length > 0) {
      await tier3.processNext!();
    }
    // Last in-flight chunk needs one final processNext to settle.
    await tier3.processNext!();
    await disposer.done;

    // 3 background levels (lvl_1, lvl_2, lvl_3) all delivered.
    expect(ready).toHaveLength(3);
    expect(new Set(ready)).toEqual(new Set(['lvl_1', 'lvl_2', 'lvl_3']));
    // First one should be lvl_1 (distance 1 from lvl_0).
    expect(ready[0]).toBe('lvl_1');
  });

  it('drains synchronously when scheduler is null (bench mode)', async () => {
    const { manifest, chunkBytes } = buildFixture(5);
    const ready: string[] = [];
    const tier3 = new Tier3Background(
      async (h) => chunkBytes.get(h)!,
      (id) => {
        ready.push(id);
      },
      null,
    );
    const disposer = tier3.enqueue({
      manifest,
      visibleLevel: manifest.levels[0]!,
    });
    await disposer.done;
    expect(ready).toHaveLength(4);
    expect(ready[0]).toBe('lvl_1');
    expect(ready[1]).toBe('lvl_2');
    expect(ready[2]).toBe('lvl_3');
    expect(ready[3]).toBe('lvl_4');
  });

  it('continues past a single failed chunk', async () => {
    const { manifest, chunkBytes } = buildFixture(4);
    const ready: string[] = [];
    const tier3 = new Tier3Background(
      async (h) => {
        // Fail the first background chunk.
        if (h.startsWith('01')) throw new Error('simulated R2 timeout');
        return chunkBytes.get(h)!;
      },
      (id) => {
        ready.push(id);
      },
      null,
    );
    const disposer = tier3.enqueue({
      manifest,
      visibleLevel: manifest.levels[0]!,
    });
    await disposer.done;
    // lvl_1 (failed) is skipped; lvl_2 + lvl_3 succeed.
    expect(ready).toEqual(['lvl_2', 'lvl_3']);
  });
});
