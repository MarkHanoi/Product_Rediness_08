// @pryzm/sync-client — public surface (ADR-0033 §2.1; ADR-049 §4.4).
//
// L3 of the architecture stack — the client side of the sync layer.  Owns:
//   • SyncClient (Y.Doc + transport + reconnect + status)
//   • EventBridge (Immer ⇄ Y.Doc translator, the strategic ADR-002
//     implementation companion at the client)
//   • PryzmAwareness (S44 land; type-only skeleton in S43 so soft locks
//     (S45) can take a stable type-side dependency)
//   • YjsDocAdapter (Phase 2D CRDT; ADR-049 §4.4 per-level extension)
//
// Consumed by:
//   • apps/editor (S43 D1 wiring)
//   • apps/sync-server (S46 server-side Y.Doc cache via `EventBridge` as a
//     library)
//   • plugins/multiplayer (S44 multiplayer cursors; awareness consumer)

export { SyncClient, DEFAULT_RESYNC_INTERVAL_MS } from './SyncClient.js';
export { EventBridge } from './event-bridge.js';
export { PryzmAwareness, AWARENESS_BYTES_PER_SEC_BUDGET } from './awareness.js';
export type {
  PryzmAwarenessState,
  PryzmAwarenessUserContext,
  PryzmAwarenessOptions,
  AwarenessThroughputStats,
} from './awareness.js';
export {
  LockManager,
  LockHandle,
  LockConflictError,
  LockTransportError,
  createFetchTransport,
} from './locks.js';
export type {
  LockTransport,
  LockAcquireSuccessBody,
  LockAcquireConflictBody,
  LockRow,
  LockManagerOptions,
  AwarenessHeldLocksSink,
  FetchTransportOptions,
} from './locks.js';
export type {
  ProjectId,
  EventId,
  ElementId,
  UserId,
  ToolId,
  EventEnvelope,
  EventLog,
  SyncCommandBus,
  SyncClientStatus,
  SyncStatusListener,
  SyncClientOptions,
  ProviderLike,
  ProviderFactory,
} from './types.js';

// Wave A19 — Phase 2D CRDT exports (YjsDocAdapter + CRDTConflictResolver)
// ADR-049 §4.4 — adds YjsDocAdapterOptions and per-level type extensions.
export {
  YjsDocAdapter,
  ELEMENTS_NAMESPACE,
  // §RIVAL-MINT — the authoritative flat property map and its key codec.
  ELEMENT_PROPS_NAMESPACE,
  splitElementKey,
} from './YjsDocAdapter.js';
// W5-3 — the sync-disposition declaration table.  Every authoritative
// property-mutation command type declares either a path into the CRDT document
// or an explicit NOT-SYNCED reason; `tools/ga-gate/check-sync-disposition.ts`
// fails the build on an undeclared one.
export {
  SYNC_DISPOSITIONS,
  getSyncDisposition,
  declaredCommandTypes,
  extractElementProperties,
  GLOBAL_PROPERTY_EXCLUDES,
} from './syncDisposition.js';
export type {
  SyncDisposition,
  ElementPropertyDisposition,
  NotSyncedDisposition,
  ConflictPolicy,
} from './syncDisposition.js';
export type {
  PresenceData,
  CRDTConflict,
  YjsProvider,
  YjsDocAdapterOptions,
  BatchWindowOpenInfo,
  BatchWindowCloseInfo,
} from './YjsDocAdapter.js';
// W5-4 "LEG B" — the READ-BACK path.  W5-3 made property mutations reach the
// collaborator's Y.Doc; this makes them reach the collaborator's authoritative
// state, which is what makes the renderer redraw.  See the file header for what
// it does NOT claim (there is still no deployed transport — L-391).
export { ElementSyncReader } from './elementSyncReader.js';
export type {
  RemoteElementUpdate,
  RemoteElementSink,
  ElementSyncReaderStats,
  ElementSyncReaderOptions,
} from './elementSyncReader.js';

// W5-4 — the non-lossy replacement for "the CRDT applier is null until idle".
export { DeferredCrdtApplier } from './deferredCrdtApplier.js';
export type {
  CrdtApplyFn,
  DeferredCrdtApplierStats,
  DeferredCrdtApplierOptions,
} from './deferredCrdtApplier.js';

export { CRDTConflictResolver } from './CRDTConflictResolver.js';
export type { MergeResult } from './CRDTConflictResolver.js';

// L-391 Phase 0 — real-time CRDT provider wiring (gated, default OFF).
// NOTE: `createWebsocketProvider` (the real transport, which imports
// `y-websocket`) is intentionally NOT re-exported here — it lives behind the
// `@pryzm/sync-client/websocket-provider` subpath so the base barrel stays free
// of the transport dependency and callers opt in explicitly.
export { connectCrdtProvider } from './collabProvider.js';
export type {
  CollabProviderConfig,
  CrdtProviderTarget,
  WebsocketProviderFactory,
  WebsocketProviderFactoryArgs,
} from './collabProvider.js';
export { SyncPresenceClient } from './SyncPresenceClient.js';
export type { PresenceUser } from './SyncPresenceClient.js';
