// loader/Tier2Visible.ts — Tier 2 visible-level chunk fetch + commit (S23 D3).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 line 1093 — "Fetches only the visible-level chunk
//     (< 500 ms for a 200-wall level — the dominant chunk)."
//   • §S23 line 1093 — "Commits the visible-level chunk to the scene
//     → first interactive."
//   • §S23 D3 (line 1237) — "Implement TierStreamedLoader Tier 2
//     (visible-level chunk immediate fetch + commit).  End-to-end
//     test: large fixture → manifest → visible-level chunk →
//     `pryzm:first-interactive` event dispatched."
//
// Tier 2 is the SHORTEST CRITICAL PATH.  Once Tier 1 returns the
// manifest, Tier 2 fetches exactly one chunk — the chunk for the
// level the user was last on (or level 0 for a fresh load) — and
// hands the bytes to the LRU + the onChunkReady callback.  When
// the callback returns the loader fires `onFirstInteractive`,
// which the editor uses to dismiss its splash screen.
//
// EMPTY-LEVEL CASE: when the visible level has no chunk
// (latestChunkHash === null — fresh project that has never been
// baked), Tier 2 still fires `onFirstInteractive` synchronously
// after Tier 1 so the editor opens at the empty grid view rather
// than hanging on the splash screen.  This behaviour is required
// by the spec line 1149: "empty project — still first interactive".

import type { ChunkEntry, LevelEntry, Manifest } from '../manifest.js';
import { chunkForLevel } from '../manifest.js';
import { withLoaderSpan } from './otel.js';

/**
 * Pluggable chunk fetcher — production: signed-URL R2 GET; tests:
 * `InMemoryChunkStore.get(hash).then(r => r.bytes)`; bench:
 * direct map lookup with zero copy.
 */
export type ChunkFetcher = (hash: string) => Promise<Uint8Array>;

/**
 * Callback invoked once Tier 2 (or Tier 3) bytes are ready.  Hot
 * path — the editor implementation calls `ChunkReader.read` then
 * commits to stores.  Returning a promise lets the loader await
 * the commit so OTel timing covers the full ready→committed arc.
 */
export type OnChunkReady = (
  levelId: string,
  bytes: Uint8Array,
  meta: { tier: 1 | 2 | 3; chunkHash: string | null },
) => void | Promise<void>;

export type OnFirstInteractive = () => void | Promise<void>;

export interface Tier2Args {
  readonly manifest: Manifest;
  readonly visibleLevelId?: string | undefined;
}

export interface Tier2Result {
  /** The level Tier 2 actually committed (resolved from visibleLevelId). */
  readonly visibleLevel: LevelEntry;
  /** Null when the visible level had no chunk (fresh / empty project). */
  readonly chunk: ChunkEntry | null;
  /** Wall-clock first-interactive duration (Tier 1 done → Tier 2 callback returned). */
  readonly durationMs: number;
}

export class Tier2Visible {
  constructor(
    private readonly fetcher: ChunkFetcher,
    private readonly onChunkReady: OnChunkReady,
    private readonly onFirstInteractive: OnFirstInteractive,
  ) {}

  /**
   * Resolve the visible level (`visibleLevelId` or the first level),
   * fetch its chunk, hand bytes to `onChunkReady`, then fire
   * `onFirstInteractive`.  Returns the resolved chunk entry (or null
   * for the empty-level case).
   */
  async load(args: Tier2Args): Promise<Tier2Result> {
    const { manifest, visibleLevelId } = args;
    const visibleLevel = resolveVisibleLevel(manifest, visibleLevelId);
    return withLoaderSpan(
      'pryzm.loader.tier2',
      {
        'pryzm.loader.projectId': manifest.projectId,
        'pryzm.loader.tier2.levelId': visibleLevel.id,
      },
      async (span) => {
        const t0 = nowMs();
        const chunk = chunkForLevel(manifest, visibleLevel.id);

        if (chunk === null) {
          // Empty-level → first-interactive without any commit.
          span.setAttribute('pryzm.loader.tier2.empty_level', true);
          await this.onFirstInteractive();
          const durationMs = nowMs() - t0;
          span.setAttribute('pryzm.loader.tier2.duration_ms', durationMs);
          return { visibleLevel, chunk: null, durationMs };
        }

        span.setAttribute('pryzm.loader.tier2.chunk_hash', chunk.hash);
        span.setAttribute('pryzm.loader.tier2.byte_length', chunk.byteLength);

        const bytes = await this.fetcher(chunk.hash);
        await this.onChunkReady(visibleLevel.id, bytes, {
          tier: 2,
          chunkHash: chunk.hash,
        });
        await this.onFirstInteractive();
        const durationMs = nowMs() - t0;
        span.setAttribute('pryzm.loader.tier2.duration_ms', durationMs);
        return { visibleLevel, chunk, durationMs };
      },
    );
  }
}

/**
 * Resolve the visible level: prefer the explicit id; fall back to
 * the first level in the stack; throw if the manifest has zero
 * levels (a project must have at least level 0 — enforced by the
 * editor's project-create flow).
 */
export function resolveVisibleLevel(
  manifest: Manifest,
  visibleLevelId: string | undefined,
): LevelEntry {
  if (manifest.levels.length === 0) {
    throw new TierLoaderError(
      'manifest has zero levels',
      'manifest-no-levels',
    );
  }
  if (visibleLevelId !== undefined) {
    const explicit = manifest.levels.find((l) => l.id === visibleLevelId);
    if (explicit) return explicit;
    // The requested level is not in the manifest — fall through to
    // the first level.  This handles the case where a stale
    // bookmark points at a deleted level.  The editor logs a
    // warning; the loader never throws on this.
  }
  return manifest.levels[0]!;
}

export class TierLoaderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'manifest-invalid'
      | 'manifest-no-levels'
      | 'chunk-fetch-failed'
      | 'history-fetch-failed',
  ) {
    super(message);
    this.name = 'TierLoaderError';
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
