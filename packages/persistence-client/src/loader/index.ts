// @pryzm/persistence-client/loader — public barrel for the
// tier-streamed cold-load orchestrator (S23).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 lines 1082-1260 (sprint definition).
//
// The 4-file split (per audit doc
// `phases/audits/PHASE-1-GAP-ANALYSIS-2026-04-27.md`) keeps each
// tier's logic isolated for testing while the orchestrator
// (`TierStreamedLoader`) presents the single public surface the
// editor consumes.

export {
  TierStreamedLoader,
  DEFAULT_MAX_LOADER_BYTES,
  type TierStreamedLoaderOptions,
  type LoadResult,
} from './TierStreamedLoader.js';

export {
  Tier1Manifest,
  type ManifestFetcher,
  type Tier1Result,
} from './Tier1Manifest.js';

export {
  Tier2Visible,
  TierLoaderError,
  resolveVisibleLevel,
  type ChunkFetcher,
  type OnChunkReady,
  type OnFirstInteractive,
  type Tier2Args,
  type Tier2Result,
} from './Tier2Visible.js';

export {
  Tier3Background,
  buildQueue,
  type FrameSchedulerLike,
  type Tier3Args,
  type Tier3Disposer,
} from './Tier3Background.js';

export {
  HistoryStreamer,
  HistorySequenceGapError,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  type HistoryFetcher,
  type HistorySegment,
  type LinearisedHistoryEvent,
} from './HistoryStreamer.js';
