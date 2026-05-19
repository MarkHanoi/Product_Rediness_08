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
export { YjsDocAdapter } from './YjsDocAdapter.js';
export type {
  PresenceData,
  CRDTConflict,
  YjsProvider,
  YjsDocAdapterOptions,
  BatchWindowOpenInfo,
  BatchWindowCloseInfo,
} from './YjsDocAdapter.js';
export { CRDTConflictResolver } from './CRDTConflictResolver.js';
export type { MergeResult } from './CRDTConflictResolver.js';
export { SyncPresenceClient } from './SyncPresenceClient.js';
export type { PresenceUser } from './SyncPresenceClient.js';
