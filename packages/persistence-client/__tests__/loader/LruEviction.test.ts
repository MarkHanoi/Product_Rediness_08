// loader/LruEviction.test.ts — LRU 200 MB cache (S23 exit #4).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 line 1098 — "LRU, maximum 200 MB per session.  Levels
//     evicted when the limit is hit.  Re-fetched on demand when
//     the user navigates to the evicted level."
//   • §S23 D7 (line 1241) — "Stress test: 100 sequential
//     large-fixture loads (no page reload — simulate tab reuse).
//     Assert: no memory leak (heap stable after GC between loads)."
//   • §S23 exit criterion #4 (line 1255) — "LRU eviction: 100-load
//     stress test shows stable heap (no leak)."
//
// We don't have a real heap profiler in vitest, so we verify the
// loader's INVARIANTS that produce stable heap behaviour:
//   * total cached bytes never exceed `maxBytes`
//   * after N loads, the cache size stays bounded
//   * on cache hit, the fetcher is NOT called (LRU keeps recently
//     used chunks resident)
//   * on eviction, the fetcher IS called again (re-fetch on access)
//
// We use a TINY budget (1 KB) to force eviction without needing
// to allocate megabytes.

import { describe, expect, it, vi } from 'vitest';

import { TierStreamedLoader } from '../../src/loader/index.js';
import { addChunk, createManifest, type Manifest } from '../../src/manifest.js';

// 256-byte chunks; cap = 1024 → cache holds ≤ 4 entries.
const CHUNK_SIZE = 256;
const CAP = 1024;

function buildSingleLevelManifests(count: number): {
  manifests: Manifest[];
  chunkBytes: Map<string, Uint8Array>;
} {
  const chunkBytes = new Map<string, Uint8Array>();
  const manifests: Manifest[] = [];
  for (let i = 0; i < count; i++) {
    const hash = `${i.toString(16).padStart(2, '0')}`.repeat(32);
    chunkBytes.set(hash, new Uint8Array(CHUNK_SIZE).fill(i & 0xff));
    let m = createManifest({
      projectId: `p-${i}`,
      levels: [{ id: 'lvl_0', name: 'L1', worldY: 0, elevation: 0 }],
    });
    m = addChunk(m, {
      levelId: 'lvl_0',
      version: 0,
      hash,
      byteLength: CHUNK_SIZE,
      elementIds: [],
      createdAt: new Date('2026-04-27').toISOString(),
    });
    manifests.push(m);
  }
  return { manifests, chunkBytes };
}

describe('TierStreamedLoader — LRU 200 MB cache', () => {
  it('caps total cached bytes at maxBytes', async () => {
    const { manifests, chunkBytes } = buildSingleLevelManifests(10);
    let cursor = 0;
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifests[cursor]!,
      fetchChunkBytes: async (h) => chunkBytes.get(h)!,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
      maxBytes: CAP,
    });

    for (let i = 0; i < 10; i++) {
      cursor = i;
      const r = await loader.load(`p-${i}`);
      await r.full;
      const stats = loader.cacheStats();
      expect(stats.totalBytes).toBeLessThanOrEqual(CAP);
      expect(stats.entries).toBeLessThanOrEqual(Math.floor(CAP / CHUNK_SIZE));
    }
  });

  it('serves cache hits without invoking the fetcher', async () => {
    const { manifests, chunkBytes } = buildSingleLevelManifests(2);
    const fetcher = vi.fn<(h: string) => Promise<Uint8Array>>(async (h) => chunkBytes.get(h)!);

    let cursor = 0;
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifests[cursor]!,
      fetchChunkBytes: fetcher,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
      maxBytes: CAP,
    });

    cursor = 0;
    const r1 = await loader.load('p-0');
    await r1.full;
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Reload the same project — chunk hash unchanged → LRU hit, no
    // new fetch.
    fetcher.mockClear();
    cursor = 0;
    const r1b = await loader.load('p-0');
    await r1b.full;
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('re-fetches an evicted chunk', async () => {
    // Cap = 512 → cache holds at most 2 chunks of 256 B each.
    const { manifests, chunkBytes } = buildSingleLevelManifests(4);
    const fetcher = vi.fn<(h: string) => Promise<Uint8Array>>(async (h) => chunkBytes.get(h)!);

    let cursor = 0;
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifests[cursor]!,
      fetchChunkBytes: fetcher,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
      maxBytes: 512,
    });

    // Load 4 distinct projects → first 2 chunks evicted.
    for (let i = 0; i < 4; i++) {
      cursor = i;
      const r = await loader.load(`p-${i}`);
      await r.full;
    }
    expect(fetcher).toHaveBeenCalledTimes(4);

    // Reload p-0 → chunk was evicted → fetcher invoked again.
    fetcher.mockClear();
    cursor = 0;
    const r = await loader.load('p-0');
    await r.full;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('survives 100 sequential loads with bounded cache', async () => {
    const { manifests, chunkBytes } = buildSingleLevelManifests(100);
    let cursor = 0;
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifests[cursor]!,
      fetchChunkBytes: async (h) => chunkBytes.get(h)!,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
      maxBytes: CAP,
    });

    for (let i = 0; i < 100; i++) {
      cursor = i;
      const r = await loader.load(`p-${i}`);
      await r.full;
    }
    const stats = loader.cacheStats();
    // After 100 distinct loads, cache must STILL be bounded.
    expect(stats.totalBytes).toBeLessThanOrEqual(CAP);
    // And it must hold the maximum number of entries it can fit.
    expect(stats.entries).toBe(Math.floor(CAP / CHUNK_SIZE));
  });

  it('refuses to cache a single chunk larger than the cap', async () => {
    const oversized = new Uint8Array(CAP + 1);
    const hash = 'ff'.repeat(32);
    let m = createManifest({
      projectId: 'p-big',
      levels: [{ id: 'lvl_0', name: 'L1', worldY: 0, elevation: 0 }],
    });
    m = addChunk(m, {
      levelId: 'lvl_0',
      version: 0,
      hash,
      byteLength: oversized.byteLength,
      elementIds: [],
      createdAt: new Date('2026-04-27').toISOString(),
    });
    const loader = new TierStreamedLoader({
      fetchManifest: async () => m,
      fetchChunkBytes: async () => oversized,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
      maxBytes: CAP,
    });
    const r = await loader.load('p-big');
    await r.full;
    // Cache rejects the oversized chunk — totalBytes stays 0, the
    // load itself succeeded (the bytes flowed through to onChunkReady
    // even though they were not stored).
    const stats = loader.cacheStats();
    expect(stats.totalBytes).toBe(0);
    expect(stats.entries).toBe(0);
  });
});
