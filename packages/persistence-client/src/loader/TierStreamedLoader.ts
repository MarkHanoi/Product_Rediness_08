// loader/TierStreamedLoader.ts — orchestrator for the 3-tier cold-load (S23).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 lines 1082-1260 (sprint definition).
//   • §S23 lines 1106-1197 (canonical TierStreamedLoader sketch).
//   • §S23 line 1098 — "Eviction policy: LRU, maximum 200 MB per
//     session.  Levels evicted when the limit is hit.  Re-fetched
//     on demand when the user navigates to the evicted level."
//
// PUBLIC SURFACE (matches the spec sketch but with the audit's
// 4-file split):
//
//   const loader = new TierStreamedLoader({
//     fetchManifest, fetchChunkBytes, fetchHistorySegment,
//     onChunkReady, onFirstInteractive,
//     scheduler,                       // optional (FrameScheduler)
//     maxBytes: 200 * 1024 * 1024,     // optional, defaults to spec
//   });
//
//   await loader.load(projectId, visibleLevelId?);
//   await loader.full();              // resolves when Tier 3 drains
//   await loader.loadHistorySegment(0, 499);
//   loader.dispose();
//
// EXIT-CRITERIA WIRING
// --------------------
// • #1 (large fixture < 3 s p95): bench `apps/bench/src/benches/load-large.bench.ts`
//   measures `firstInteractiveMs` (Tier 2 done) and `fullLoadMs`
//   (Tier 3 drained) across 5 cold-load runs.
// • #2 (OTel spans visible): `Tier1Manifest`, `Tier2Visible`,
//   `Tier3Background`, `HistoryStreamer` each emit named spans.
// • #3 (progressive UI reveal): `onChunkReady(levelId, bytes,
//   { tier })` lets the editor's status bar update as each
//   background chunk lands.
// • #4 (LRU 100-load stress test): the LRU cache here, exercised
//   by `LruEviction.test.ts`, is bounded by `maxBytes`.
// • #5 (history-on-demand): `loadHistorySegment(0, 499)` returns
//   events; tested by `HistoryStreamer.test.ts`.
// • #6 (ADR-0020 merged): `docs/02-decisions/adrs/0020-tier-streamed-loader.md`.
// • #7 (K1-E preview, small fixture < 800 ms): bench
//   `apps/bench/src/benches/load-small-preview.bench.ts`.

import type { Manifest } from '../manifest.js';
import {
  Tier1Manifest,
  type ManifestFetcher,
  type Tier1Result,
} from './Tier1Manifest.js';
import {
  Tier2Visible,
  type ChunkFetcher,
  type OnChunkReady,
  type OnFirstInteractive,
  type Tier2Result,
  TierLoaderError,
} from './Tier2Visible.js';
import {
  Tier3Background,
  type FrameSchedulerLike,
  type Tier3Disposer,
} from './Tier3Background.js';
import {
  HistoryStreamer,
  type HistoryFetcher,
  type HistorySegment,
  DEFAULT_HISTORY_PAGE_SIZE,
} from './HistoryStreamer.js';

/** Spec line 1125: `MAX_BYTES = 200 * 1024 * 1024` — 200 MiB LRU
 *  budget.  We expose it as a constructor option so the bench can
 *  shrink it for the eviction stress test, but production never
 *  changes the default. */
export const DEFAULT_MAX_LOADER_BYTES = 200 * 1024 * 1024;

export interface TierStreamedLoaderOptions {
  readonly fetchManifest: ManifestFetcher;
  readonly fetchChunkBytes: ChunkFetcher;
  readonly fetchHistorySegment?: HistoryFetcher;
  readonly onChunkReady: OnChunkReady;
  readonly onFirstInteractive: OnFirstInteractive;
  readonly scheduler?: FrameSchedulerLike | null;
  readonly maxBytes?: number;
}

export interface LoadResult {
  readonly tier1: Tier1Result;
  readonly tier2: Tier2Result;
  /** Resolves when Tier 3 finishes draining (or `dispose()` aborts). */
  readonly full: Promise<void>;
  /** Hashes still pending at the moment `load()` returns. */
  readonly tier3PendingAtKickoff: readonly string[];
}

/**
 * The single class the editor imports.  Wraps the four tier
 * primitives + the LRU.  Stateless across `load()` calls except
 * for the LRU (which spans every load to maximise cache hits when
 * the user reopens a project they viewed earlier in the session).
 */
export class TierStreamedLoader {
  private readonly tier1: Tier1Manifest;
  private readonly tier2: Tier2Visible;
  private readonly tier3: Tier3Background;
  private readonly history: HistoryStreamer;
  private readonly lru: LruByteCache;
  private currentDisposer: Tier3Disposer | null = null;

  constructor(opts: TierStreamedLoaderOptions) {
    this.lru = new LruByteCache(opts.maxBytes ?? DEFAULT_MAX_LOADER_BYTES);
    const wrappedFetcher: ChunkFetcher = async (hash) => {
      const cached = this.lru.get(hash);
      if (cached !== null) return cached;
      const bytes = await opts.fetchChunkBytes(hash);
      this.lru.put(hash, bytes);
      return bytes;
    };
    this.tier1 = new Tier1Manifest(opts.fetchManifest);
    this.tier2 = new Tier2Visible(
      wrappedFetcher,
      opts.onChunkReady,
      opts.onFirstInteractive,
    );
    this.tier3 = new Tier3Background(
      wrappedFetcher,
      opts.onChunkReady,
      opts.scheduler ?? null,
    );
    this.history = new HistoryStreamer(
      opts.fetchHistorySegment ?? noopHistoryFetcher,
    );
  }

  /**
   * Cold-load a project.  Awaits Tier 1 + Tier 2 (first interactive)
   * before resolving — the returned `full` promise resolves when
   * Tier 3 drains.  Calling `load()` while a previous load is
   * still draining Tier 3 cancels the previous Tier 3 queue
   * (`Tier3Disposer.dispose()`).
   */
  async load(projectId: string, visibleLevelId?: string): Promise<LoadResult> {
    if (this.currentDisposer) {
      this.currentDisposer.dispose();
      this.currentDisposer = null;
    }
    const tier1 = await this.tier1.load(projectId);
    const tier2 = await this.tier2.load({
      manifest: tier1.manifest,
      visibleLevelId,
    });
    const tier3Disposer = this.tier3.enqueue({
      manifest: tier1.manifest,
      visibleLevel: tier2.visibleLevel,
    });
    this.currentDisposer = tier3Disposer;
    return {
      tier1,
      tier2,
      full: tier3Disposer.done,
      tier3PendingAtKickoff: tier3Disposer.pendingHashes(),
    };
  }

  /**
   * Spec lines 1241/1256 — undo-panel calls this when the in-memory
   * undo stack runs out and the user keeps pressing Ctrl-Z.
   * `fromSeq` and `toSeq` are inclusive; matches sync-server's
   * `events.load` frame.  Pages > 1000 events throw `RangeError`.
   */
  loadHistorySegment(
    projectId: string,
    fromSeq: number,
    toSeq: number = fromSeq + DEFAULT_HISTORY_PAGE_SIZE - 1,
  ): Promise<HistorySegment> {
    return this.history.loadHistorySegment(projectId, fromSeq, toSeq);
  }

  /**
   * Driven by the host editor's FrameScheduler `'background'` lane:
   * the host registers a tick listener that calls this once per
   * background frame.  In scheduler-free mode (bench / CLI) Tier 3
   * drains synchronously inside `enqueue()` and this is a no-op.
   */
  async processNextTier3(): Promise<void> {
    const next = this.tier3.processNext;
    if (next) await next();
  }

  /** LRU diagnostics — used by tests + the M12 OTel dashboard. */
  cacheStats(): Readonly<{ entries: number; totalBytes: number; maxBytes: number }> {
    return {
      entries: this.lru.entryCount(),
      totalBytes: this.lru.totalBytes(),
      maxBytes: this.lru.maxBytes(),
    };
  }

  /** Cancel any in-flight Tier 3 queue; safe to call repeatedly. */
  dispose(): void {
    this.currentDisposer?.dispose();
    this.currentDisposer = null;
  }
}

// --------------------------------------------------------------------
// LRU byte-budget cache.  Spec line 1188-1196:
//   `evictIfNeeded(incomingBytes)` — remove least-recently-loaded
//   entries until the budget is within limit.
//
// We use `Map` insertion-order as the LRU order.  On `get(hash)`
// we delete + re-insert to bump the entry to "most recent".  On
// `put` we evict from the front of the Map until there is room.
// --------------------------------------------------------------------

class LruByteCache {
  private readonly cache = new Map<string, Uint8Array>();
  private bytes = 0;

  constructor(private readonly cap: number) {
    if (!Number.isFinite(cap) || cap <= 0) {
      throw new RangeError(`maxBytes must be positive (got ${cap})`);
    }
  }

  get(hash: string): Uint8Array | null {
    const found = this.cache.get(hash);
    if (found === undefined) return null;
    // Bump to MRU.
    this.cache.delete(hash);
    this.cache.set(hash, found);
    return found;
  }

  put(hash: string, bytes: Uint8Array): void {
    // De-dupe: if we already have it, just bump it.
    const existing = this.cache.get(hash);
    if (existing !== undefined) {
      this.cache.delete(hash);
      this.cache.set(hash, existing);
      return;
    }
    // A single chunk that exceeds the cap: refuse to cache it
    // entirely (storing it would force eviction of EVERYTHING and
    // still leave us over budget).  Spec doesn't dictate this
    // edge case; we choose "do not poison the cache".
    if (bytes.byteLength > this.cap) return;
    while (this.bytes + bytes.byteLength > this.cap) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      const oldestBytes = this.cache.get(oldest.value)!;
      this.cache.delete(oldest.value);
      this.bytes -= oldestBytes.byteLength;
    }
    this.cache.set(hash, bytes);
    this.bytes += bytes.byteLength;
  }

  entryCount(): number {
    return this.cache.size;
  }
  totalBytes(): number {
    return this.bytes;
  }
  maxBytes(): number {
    return this.cap;
  }
}

const noopHistoryFetcher: HistoryFetcher = async () => {
  throw new TierLoaderError(
    'history fetch not configured: pass `fetchHistorySegment` to TierStreamedLoader',
    'history-fetch-failed',
  );
};

// Re-export the common types so callers `import { Manifest }` from
// `@pryzm/persistence-client/loader` rather than reaching into the
// manifest module directly.  Keeps the public surface tidy.
export type { Manifest };
