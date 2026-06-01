// @pryzm/persistence-client — public surface (L0).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
//   • S03-T6 (line 374) — `EventLog` interface.
//   • S03-T7 (line 375) — `InMemoryBackend`.
//   • S03-T8 (line 376) — pluggable codecs (JSON / MessagePack);
//                          ADR-004 ratifies the wire-format choice in S04.
//   • S03-T9 (line 377) — `IndexedDbBackend` sketch.

export type {
  Backend,
  Codec,
  PersistedEvent,
} from './types.js';
export { EventLogClosedError, PERSISTED_EVENT_VERSION } from './types.js';

export { EventLog } from './EventLog.js';

export { InMemoryBackend } from './backends/InMemoryBackend.js';
// `FileSystemBackend` lives at `@pryzm/persistence-client/node` because it
// imports `node:fs/promises` + `node:path` and would otherwise pull node
// builtins into the browser bundle (see ./node.ts header for full rationale).
export {
  IndexedDbBackend,
  IDB_DB_NAME_PREFIX,
  IDB_DB_VERSION,
  IDB_EVENTS_STORE,
  IDB_META_STORE,
  IDB_CHECKPOINT_KEY,
  type IndexedDbBackendOptions,
} from './backends/IndexedDbBackend.js';

export { JsonCodec } from './codecs/JsonCodec.js';
export { MsgpackCodec } from './codecs/MsgpackCodec.js';
export { MsgpackAliasedCodec } from './codecs/MsgpackAliasedCodec.js';

export {
  attachEventLog,
  type AttachOptions,
  type EventLogAttachment,
  type PatchEmitterLike,
} from './attachEventLog.js';

// S28 — Project hub REST adapter.  Spec:
// `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S28.
export {
  ProjectListClient,
  ProjectListClientError,
  rowToSummary,
  type ProjectListClientErrorKind,
  type ProjectListClientOptions,
  type ServerProjectRow,
} from './ProjectListClient.js';

// Phase C (S74-WIRE) — see PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3.
export {
  ProjectListController,
  type ProjectPatch,
  type ProjectListControllerOptions,
} from './ProjectListController.js';

// AuthClient — typed auth surface (chunks/22 §22.1 step 1.2 leg).
// Owned by ProjectListClient via composition; exposed here for direct
// instantiation in tests + for the bench harness shape assertions.
export {
  AuthClient,
  AuthClientError,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_SIGNED_OUT_EVENT,
  PRYZM_OAUTH_MESSAGE_TYPE,
  type AuthClientOptions,
} from './AuthClient.js';

export type {
  AuthUser,
  AuthResult,
  AuthClientErrorKind,
  PryzmOAuthMessage,
  Plan,
  PlanStatus,
} from './AuthClient.types.js';

export {
  MembersClient,
  rowToMember,
  type MembersClientOptions,
  type MemberRecord,
  type ProjectMemberRole,
  type ServerMemberRow,
} from './MembersClient.js';

export {
  PryzmExporter,
  PryzmImporter,
  PRYZM_ARCHIVE_VERSION,
  type PryzmArchiveManifest,
  type PryzmExporterDeps,
  type PryzmImporterDeps,
} from './PryzmArchive.js';

export {
  RuntimeEventLog,
  TAG_EVENT_TYPE,
  type TagPayload,
  type TagRecord,
  type DiffSummary,
  type RuntimeEventLogDeps,
} from './RuntimeEventLog.js';

export {
  isUlid,
  ulidStringToBytes,
  ulidBytesToString,
  ulidStringToBase64,
  base64ToUlid,
} from './util/ulid-pack.js';

// --------------------------------------------------------------------
// S19 — Chunked binary persistence.  Manifest schema (D5 interface
// lock), codec lazy singletons (Draco / Meshopt / KTX2 stub), and
// ChunkWriter / ChunkReader.  See `docs/04-reference/architecture-detail/chunks.md`.
// --------------------------------------------------------------------

export {
  ManifestSchema,
  ChunkEntrySchema,
  LevelEntrySchema,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_FORMAT_VERSION,
  createManifest,
  addChunk,
  setLastEvent,
  chunkForLevel,
  manifestToJson,
  parseManifest,
  type Manifest,
  type ChunkEntry,
  type LevelEntry,
} from './manifest.js';

export {
  DRACO_DEFAULT_QUANTIZATION,
  getDracoEncoder,
  getDracoDecoder,
  isDracoAvailable,
  __resetDracoSingletons,
  type DracoQuantization,
  getMeshopt,
  getMeshoptEncoder,
  getMeshoptDecoder,
  isMeshoptAvailable,
  __resetMeshoptSingleton,
  Ktx2,
  type Ktx2Codec,
  type Ktx2EncodeOptions,
} from './codec/index.js';

export {
  ChunkWriter,
  ChunkReader,
  ChunkHashMismatchError,
  InMemoryChunkStore,
  IndexedDbChunkStore,
  IDB_CHUNKS_DB_NAME_PREFIX,
  IDB_CHUNKS_DB_VERSION,
  IDB_CHUNKS_STORE,
  type ChunkGeometryDescriptor,
  type ChunkWriteInput,
  type ChunkWriteOptions,
  type ChunkWriteResult,
  type ChunkReadDescriptor,
  type ChunkReadInput,
  type ChunkReadResult,
  type ChunkStore,
  type ChunkRecord,
  type IndexedDbChunkStoreOptions,
  hydrateFromChunk,
  type HydrateFromChunkInput,
  type HydratedChunk,
} from './chunks/index.js';

// --------------------------------------------------------------------
// S23 — Tier-streamed cold-load orchestrator.  See
// `docs/04-reference/architecture-detail/loader.md` and ADR-0020 for the full design.
// --------------------------------------------------------------------

export {
  TierStreamedLoader,
  DEFAULT_MAX_LOADER_BYTES,
  Tier1Manifest,
  Tier2Visible,
  Tier3Background,
  HistoryStreamer,
  HistorySequenceGapError,
  TierLoaderError,
  resolveVisibleLevel,
  buildQueue,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  type TierStreamedLoaderOptions,
  type LoadResult,
  type ManifestFetcher,
  type Tier1Result,
  type ChunkFetcher,
  type OnChunkReady,
  type OnFirstInteractive,
  type Tier2Args,
  type Tier2Result,
  type FrameSchedulerLike,
  type Tier3Args,
  type Tier3Disposer,
  type HistoryFetcher,
  type HistorySegment,
  type LinearisedHistoryEvent,
} from './loader/index.js';

// A17-T8 — IndexedDBStore: offline project-snapshot cache (C05 §1.2 tier 2.5).
export { IndexedDBStore } from './IndexedDBStore.js';

// D.4.2 — persistence-half composition root.  Spec:
// `04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §1` Day-7 STATUS row.
// Mirror of `@pryzm/renderer/src/SceneBootstrap.ts` (D.4.1 Day-2).
export {
  bootstrapPersistence,
  bootstrapPersistenceIdle,
  type PersistenceBootstrapAudit,
  type PersistenceBootstrapInput,
  type PersistenceBootstrapResult,
  type PersistenceSlotShape,
  type EnginePersistenceBootstrapFn,
} from './bootstrap.js';

// ── Sprint H P9 (2026-05-10) — apiFetch ────────────────────────────────────────
export { getStoredToken, apiFetch } from './apiFetch';
