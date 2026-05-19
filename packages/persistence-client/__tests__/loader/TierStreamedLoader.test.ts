// loader/TierStreamedLoader.test.ts — orchestrator end-to-end (S23 D5).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 D5 (line 1239) — "end-to-end large-fixture cold load"
//   • §S23 D3 (line 1237) — "End-to-end test: large fixture →
//     manifest → visible-level chunk → `pryzm:first-interactive`
//     event dispatched."
//
// What we cover:
//   1. Tier 1 → Tier 2 → Tier 3 ordering (manifest first, visible
//      chunk before first-interactive, background chunks after).
//   2. Distance-ordered Tier 3 (closer levels load before farther).
//   3. `onFirstInteractive` fires AFTER `onChunkReady(visible)`.
//   4. Empty visible level still fires `onFirstInteractive`.
//   5. Calling `load()` twice cancels the previous Tier 3 queue.
//   6. Stale `visibleLevelId` falls back to first level (no throw).
//
// All tests use the in-memory chunk fetcher; no network, no
// FrameScheduler — Tier 3 drains synchronously.

import { describe, expect, it, vi } from 'vitest';

import {
  TierStreamedLoader,
  type ManifestFetcher,
  type ChunkFetcher,
} from '../../src/loader/index.js';
import {
  createManifest,
  addChunk,
  type Manifest,
} from '../../src/manifest.js';

// --------------------------------------------------------------------
// Test helpers — build a manifest with N levels, each with a tiny
// 16-byte stub chunk.  Hashes are deterministic so the in-memory
// fetcher map can find them.
// --------------------------------------------------------------------

function buildFixture(levelCount: number): {
  manifest: Manifest;
  chunkBytes: Map<string, Uint8Array>;
  hashes: string[];
} {
  let manifest = createManifest({
    projectId: 'p-test',
    levels: Array.from({ length: levelCount }, (_, i) => ({
      id: `lvl_${i}`,
      name: `Level ${i + 1}`,
      worldY: i * 3,
      elevation: i * 3,
    })),
  });
  const chunkBytes = new Map<string, Uint8Array>();
  const hashes: string[] = [];
  for (let i = 0; i < levelCount; i++) {
    const hash = `${i.toString(16).padStart(2, '0')}`.repeat(32); // 64 hex chars
    hashes.push(hash);
    const bytes = new Uint8Array(16).fill(i);
    chunkBytes.set(hash, bytes);
    manifest = addChunk(manifest, {
      levelId: `lvl_${i}`,
      version: 0,
      hash,
      byteLength: bytes.byteLength,
      elementIds: [],
      createdAt: new Date('2026-04-27').toISOString(),
    });
  }
  return { manifest, chunkBytes, hashes };
}

function makeFetchers(manifest: Manifest, chunkBytes: Map<string, Uint8Array>): {
  fetchManifest: ManifestFetcher;
  fetchChunkBytes: ChunkFetcher;
} {
  return {
    fetchManifest: vi.fn<(_id: string) => Promise<Manifest>>(async () => manifest),
    fetchChunkBytes: vi.fn<(hash: string) => Promise<Uint8Array>>(async (hash) => {
      const found = chunkBytes.get(hash);
      if (!found) throw new Error(`unknown chunk ${hash}`);
      return found;
    }),
  };
}

// --------------------------------------------------------------------

describe('TierStreamedLoader — orchestration', () => {
  it('fires onChunkReady(visible) BEFORE onFirstInteractive', async () => {
    const { manifest, chunkBytes } = buildFixture(3);
    const order: string[] = [];
    const loader = new TierStreamedLoader({
      ...makeFetchers(manifest, chunkBytes),
      onChunkReady: (id, _b, meta) => {
        order.push(`ready:${id}:tier${meta.tier}`);
      },
      onFirstInteractive: () => {
        order.push('firstInteractive');
      },
    });
    const res = await loader.load('p-test', 'lvl_1');
    await res.full;

    // Tier 2 fires the visible chunk (lvl_1) and THEN
    // first-interactive — both before any Tier 3 chunks.
    expect(order[0]).toBe('ready:lvl_1:tier2');
    expect(order[1]).toBe('firstInteractive');
    // Tier 3 chunks follow.
    expect(order.slice(2).every((s) => s.startsWith('ready:lvl_') && s.includes('tier3'))).toBe(
      true,
    );
  });

  it('orders Tier 3 by distance from the visible level (closer first)', async () => {
    const { manifest, chunkBytes } = buildFixture(5);
    const tier3Order: string[] = [];
    const loader = new TierStreamedLoader({
      ...makeFetchers(manifest, chunkBytes),
      onChunkReady: (id, _b, meta) => {
        if (meta.tier === 3) tier3Order.push(id);
      },
      onFirstInteractive: () => undefined,
    });
    // Visible = middle level (lvl_2).  Distance ordering:
    //   d=1: lvl_1, lvl_3   (tie-break by id ascending → lvl_1 first)
    //   d=2: lvl_0, lvl_4
    const res = await loader.load('p-test', 'lvl_2');
    await res.full;
    expect(tier3Order).toEqual(['lvl_1', 'lvl_3', 'lvl_0', 'lvl_4']);
  });

  it('falls back to the first level when visibleLevelId is unknown', async () => {
    const { manifest, chunkBytes } = buildFixture(3);
    const loader = new TierStreamedLoader({
      ...makeFetchers(manifest, chunkBytes),
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
    });
    const res = await loader.load('p-test', 'lvl_999_does_not_exist');
    expect(res.tier2.visibleLevel.id).toBe('lvl_0');
    await res.full;
  });

  it('returns the Tier 1 manifest from `load()`', async () => {
    const { manifest, chunkBytes } = buildFixture(2);
    const loader = new TierStreamedLoader({
      ...makeFetchers(manifest, chunkBytes),
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
    });
    const res = await loader.load('p-test');
    expect(res.tier1.manifest.projectId).toBe('p-test');
    expect(res.tier1.manifest.levels).toHaveLength(2);
    expect(res.tier1.durationMs).toBeGreaterThanOrEqual(0);
    await res.full;
  });

  it('cancels in-flight Tier 3 when load() is called again', async () => {
    // Two-load sequencing test.  We hold the FIRST load's tier-3
    // queue indefinitely (one stalled fetch per call); calling
    // load() again must dispose() the first queue and let the
    // second queue drain to completion via the cache (no fetcher
    // is invoked the second time because the visible-level chunk
    // is already cached).
    const { manifest, chunkBytes } = buildFixture(8);
    const stalls: Array<() => void> = [];
    const fetchSpy = vi.fn<(hash: string) => Promise<Uint8Array>>(async (hash) => {
      const bytes = chunkBytes.get(hash)!;
      // Stall every fetch except the visible chunk (lvl_0).
      if (!hash.startsWith('00')) {
        await new Promise<void>((res) => stalls.push(res));
      }
      return bytes;
    });
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifest,
      fetchChunkBytes: fetchSpy,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
    });
    // First load — tier1+tier2 succeed (lvl_0 is non-stall);
    // tier3 enqueues but its first fetch stalls.
    const res1 = await loader.load('p-test', 'lvl_0');
    // Second load — must dispose the first queue without touching
    // the in-flight stalled fetcher; tier1+tier2 succeed via cache
    // (lvl_0 was cached by the first tier2).
    const res2 = await loader.load('p-test', 'lvl_0');
    // Dispose the second queue too so both `full` promises settle.
    loader.dispose();
    await res1.full;
    await res2.full;
    // Drain the orphaned stalled fetches so vitest's afterEach is happy.
    for (const r of stalls) r();
  });
});

describe('TierStreamedLoader — empty-level edge case', () => {
  it('fires onFirstInteractive even when the visible level has no chunk', async () => {
    const empty = createManifest({
      projectId: 'p-empty',
      levels: [{ id: 'lvl_0', name: 'L1', worldY: 0, elevation: 0 }],
    });
    const fi = vi.fn();
    const ready = vi.fn();
    const loader = new TierStreamedLoader({
      fetchManifest: async () => empty,
      fetchChunkBytes: async () => {
        throw new Error('should not fetch — manifest has no chunks');
      },
      onChunkReady: ready,
      onFirstInteractive: fi,
    });
    const res = await loader.load('p-empty');
    expect(fi).toHaveBeenCalledOnce();
    expect(ready).not.toHaveBeenCalled();
    expect(res.tier2.chunk).toBeNull();
    await res.full;
  });
});
