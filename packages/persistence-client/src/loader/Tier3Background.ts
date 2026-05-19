// loader/Tier3Background.ts — Tier 3 background levels via FrameScheduler (S23 D4).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 line 1094 — "Fetches background level chunks lazily, in
//     priority order (levels near the visible level first), via the
//     `FrameScheduler`'s `'background'` priority queue."
//   • §S23 D4 (line 1238) — "Implement TierStreamedLoader Tier 3
//     (background levels in FrameScheduler background queue,
//     distance-ordered)."
//   • §S23 example code (lines 1162-1175) — `processNextTier3` is
//     called from FrameScheduler background queue, max 1 chunk per
//     background frame.
//
// Tier 3 NEVER blocks first-interactive.  After Tier 2 fires, the
// orchestrator calls `Tier3Background.enqueue()` to populate the
// queue (sorted by distance from the visible level — closer first
// because the user is most likely to scroll up/down to the
// neighbouring level next).  Each `requestFrame('tier3-...',
// 'background')` ticks one chunk.  When the queue empties, no
// further frames are requested — the FrameScheduler returns to
// idle (ADR-006).
//
// IDLE-CONTINUATION INTERACTION: per ADR-006, background-priority
// frames are gated by the 30-frame idle continuation budget.  In
// practice this means the loader processes ~1 chunk per ~16 ms
// frame for ~30 frames = ~480 ms, then yields for any other
// background work.  For the 5K × 20 fixture this means full-load
// completes in roughly:
//   tier2 (≤ 500 ms) + 19 background chunks × 16 ms + draco decode
//                              ≈ 0.5 s + 0.3 s + decode time
// → well within the 12-second exit criterion.
//
// SCHEDULER-FREE FAST PATH: when the orchestrator runs without a
// FrameScheduler (e.g. the bench harness, or a Node CLI tool), the
// constructor accepts `null` for `scheduler`.  In that mode
// `enqueue()` synchronously drains the queue with `await`, which
// is exactly what the bench wants for measuring full-load time.
//
// CANCELLATION: callers stash the disposer returned by `enqueue()`.
// Calling `dispose()` cancels any in-flight frame request and
// clears the queue — used by the editor when the user closes a
// project mid-load.

import type { ChunkEntry, LevelEntry, Manifest } from '../manifest.js';
import { chunkForLevel } from '../manifest.js';
import type { ChunkFetcher, OnChunkReady } from './Tier2Visible.js';
import { withLoaderSpan } from './otel.js';

/**
 * Subset of `FrameScheduler` that the loader needs.  Defined here
 * rather than imported as a type so the loader package can avoid a
 * compile-time dependency on `@pryzm/frame-scheduler` (the
 * scheduler is a peer concern; the loader does not need its
 * `start`/`stop`/`tickListeners` surface).
 */
export interface FrameSchedulerLike {
  requestFrame(reason: string, priority: 'interaction' | 'idle' | 'background'): string;
  cancelFrame(token: string): boolean;
}

interface QueuedRequest {
  readonly levelId: string;
  readonly chunk: ChunkEntry;
  readonly distance: number;
}

export interface Tier3Args {
  readonly manifest: Manifest;
  readonly visibleLevel: LevelEntry;
}

export interface Tier3Disposer {
  /** Cancel any in-flight frame request and clear the queue. */
  dispose(): void;
  /** Promise that resolves when the queue drains (or aborts). */
  readonly done: Promise<void>;
  /** Hashes still pending — useful for tests + the status bar. */
  pendingHashes(): readonly string[];
}

export class Tier3Background {
  constructor(
    private readonly fetcher: ChunkFetcher,
    private readonly onChunkReady: OnChunkReady,
    private readonly scheduler: FrameSchedulerLike | null,
  ) {}

  enqueue(args: Tier3Args): Tier3Disposer {
    const { manifest, visibleLevel } = args;
    const queue = buildQueue(manifest, visibleLevel);
    let aborted = false;
    let activeFrameToken: string | null = null;

    let resolveDone!: () => void;
    const done = new Promise<void>((res) => {
      resolveDone = res;
    });

    const tickOne = async (): Promise<void> => {
      if (aborted) {
        resolveDone();
        return;
      }
      const next = queue.shift();
      if (next === undefined) {
        resolveDone();
        return;
      }
      try {
        await withLoaderSpan(
          'pryzm.loader.tier3',
          {
            'pryzm.loader.projectId': manifest.projectId,
            'pryzm.loader.tier3.levelId': next.levelId,
            'pryzm.loader.tier3.chunk_hash': next.chunk.hash,
            'pryzm.loader.tier3.byte_length': next.chunk.byteLength,
            'pryzm.loader.tier3.distance': next.distance,
            'pryzm.loader.tier3.queue_remaining': queue.length,
          },
          async () => {
            const bytes = await this.fetcher(next.chunk.hash);
            await this.onChunkReady(next.levelId, bytes, {
              tier: 3,
              chunkHash: next.chunk.hash,
            });
          },
        );
      } catch (err) {
        // A single failed chunk should NOT abort the rest of the
        // queue — record on the span (already done by withLoaderSpan)
        // and continue.  The status bar will show "X of Y loaded
        // (1 failed)".  Production behaviour is captured by the
        // K1D-3 kill-switch (loader.md §"Failure modes").
        // Eslint-disable-next-line no-console — diagnostic only.
        // eslint-disable-next-line no-console
        console.warn('[loader] tier3 chunk failed', next.chunk.hash, err);
      }
      // Schedule the next chunk.  When the scheduler is null (bench
      // harness), we recurse synchronously via Promise.resolve.
      if (queue.length > 0 && !aborted) {
        if (this.scheduler) {
          activeFrameToken = this.scheduler.requestFrame(
            'tier3-background-load',
            'background',
          );
          // The scheduler ticks `tickOne` via the host's
          // `processNextTier3` wrapper (registered in
          // `TierStreamedLoader.attachToScheduler`).  In the absence
          // of an actual rAF pump (e.g. node tests) the host calls
          // `processNext()` manually.
        } else {
          // Synchronous drain — yield to the microtask queue so
          // pending IndexedDB / fetch callbacks can interleave.
          await Promise.resolve();
          await tickOne();
        }
      } else {
        resolveDone();
      }
    };

    // Kick off the first tick.  In scheduler mode this returns
    // immediately and the host pump invokes `processNext`; in
    // synchronous mode it drains end-to-end.
    if (this.scheduler && queue.length > 0) {
      activeFrameToken = this.scheduler.requestFrame(
        'tier3-background-load',
        'background',
      );
      this.processNext = tickOne;
    } else if (queue.length === 0) {
      resolveDone();
    } else {
      // Fire-and-forget — tickOne resolves `done` when complete.
      void tickOne();
    }

    return {
      dispose: () => {
        aborted = true;
        if (activeFrameToken !== null && this.scheduler) {
          this.scheduler.cancelFrame(activeFrameToken);
        }
        queue.length = 0;
        resolveDone();
      },
      done,
      pendingHashes: () => queue.map((q) => q.chunk.hash),
    };
  }

  /**
   * Set by `enqueue()` when running in scheduler mode.  The host
   * editor invokes this from its `'background'` frame handler.  In
   * scheduler-free mode this stays null; the bench drains
   * synchronously inside `enqueue()`.
   */
  processNext: (() => Promise<void>) | null = null;
}

/**
 * Build the Tier 3 queue: every level OTHER than the visible one
 * that has a baked chunk, sorted by absolute distance from the
 * visible level's index in the stack (closer = higher priority).
 * Ties broken by world-Y ascending so the result is deterministic.
 */
export function buildQueue(
  manifest: Manifest,
  visibleLevel: LevelEntry,
): QueuedRequest[] {
  const visibleIndex = manifest.levels.findIndex((l) => l.id === visibleLevel.id);
  const out: QueuedRequest[] = [];
  for (let i = 0; i < manifest.levels.length; i++) {
    const level = manifest.levels[i]!;
    if (level.id === visibleLevel.id) continue;
    const chunk = chunkForLevel(manifest, level.id);
    if (chunk === null) continue;
    out.push({
      levelId: level.id,
      chunk,
      distance: Math.abs(i - visibleIndex),
    });
  }
  out.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.levelId.localeCompare(b.levelId);
  });
  return out;
}
