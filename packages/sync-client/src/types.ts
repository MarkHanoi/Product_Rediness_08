// @pryzm/sync-client — public type surface (S43 D1 / ADR-0033 §2.2).
//
// PURE: no DOM, no THREE, no transport, no Yjs at the type-only edge.
// Yjs types leak only into SyncClient.ts and event-bridge.ts.

import type { Doc as YDoc } from 'yjs';

/** Project identifier — opaque ULID-shaped string in v0.  Stable across
 *  Phase 2D and beyond; renaming this type triggers a protocol-version bump. */
export type ProjectId = string;

/** Event identifier — ULID-shaped string assigned by the editor at commit
 *  time and carried verbatim through the durable log + the Yjs map key. */
export type EventId = string;

/** Element identifier — opaque string-shaped ID assigned by handlers. */
export type ElementId = string;

/** User identifier — Supabase user-id from S43 D7 onwards; opaque string in v0. */
export type UserId = string;

/** Tool identifier — plugin-defined string slug (e.g. `wall.draw`). */
export type ToolId = string;

// ─── EventEnvelope ──────────────────────────────────────────────────────────
//
// The wire shape for one event in transit between the client and the
// sync-server.  Mirrors `apps/sync-server/src/protocol/messages.ts#CommandEvent`
// exactly — the two files are intentionally kept in lock-step.  When this
// changes, that file changes; the round-trip identity test in
// `__tests__/event-bridge-roundtrip.test.ts` is the contract.

export interface EventEnvelope {
  /** ULID — Crockford base32, 26 chars.  Used as the Yjs map key AND the
   *  durable-log dedup key.  Per ADR-0033 §2.3 this single key spans both
   *  storage tiers (event-log + Yjs) so dedup is O(1) on both sides. */
  readonly id: EventId;
  /** Command type, e.g. `wall.create`, `cde.linkDocument`. */
  readonly type: string;
  /** User who issued the command — opaque string in v0; full Supabase user-id
   *  wiring lands in S43 D7 per ADR-028 Part F. */
  readonly actorId: UserId;
  /** Command payload.  Shape is owned by the producer; sync-client treats
   *  it as opaque (the bake worker re-validates per-handler at replay time). */
  readonly payload: unknown;
}

// ─── EventLog (durable-source-of-truth handle) ──────────────────────────────
//
// Per strategic ADR-002 §"Storage division": PRYZM events are the durable
// source of truth; Yjs is the convergence transport.  The `EventLog` type
// is the handle the EventBridge uses to:
//   1. Check whether an inbound Yjs map op is already in the log (`has(id)`).
//   2. Append an inbound event to the log so the next reload sees it
//      (`appendInbound(id, payload)`).
//
// The implementation lives in `@pryzm/persistence-client`; the sync-client
// only depends on the *interface* so the package stays in vanilla TS with
// no Postgres / Supabase dependency.

export interface EventLog {
  /** Returns true if an event with this ID is already in the log.  Used by
   *  EventBridge to dedup inbound Yjs map ops against locally-committed
   *  events — prevents the "echo" problem where a peer sees its own commit
   *  arrive back as an inbound op. */
  has(id: EventId): boolean;

  /** Append an event the EventBridge received from a remote peer.  This is
   *  distinct from the local commit path (which goes through CommandBus.execute
   *  and thence to PatchEmitter); inbound events bypass execute() because
   *  they were already validated when the originating peer committed them. */
  appendInbound(id: EventId, payload: unknown): void;
}

// ─── Status surface ─────────────────────────────────────────────────────────
//
// SyncClient.status() returns one of these.  The editor paints offline
// indicators per `[strategic ADR-019]` UX (offline-first regression mitigation
// per R1-06).  Status transitions fire `SyncClient.onStatusChanged(...)`.

export type SyncClientStatus =
  /** Constructed but not yet `connect()`-ed. */
  | 'idle'
  /** First-time connect or reconnect handshake in flight. */
  | 'connecting'
  /** WS open AND project subscribed; bridge active. */
  | 'open'
  /** WS dropped; provider's exponential backoff is running. */
  | 'reconnecting'
  /** `disconnect()` called or terminal error. */
  | 'closed'
  /** Terminal error — auth-token rejection, malformed JSON, etc. */
  | 'error';

export type SyncStatusListener = (
  status: SyncClientStatus,
  reason?: string,
) => void;

// ─── Provider abstraction (DI seam) ─────────────────────────────────────────
//
// We do NOT take a hard dependency on `y-websocket`'s WebsocketProvider so
// that:
//   • Unit tests can inject a `MockProvider` that exposes `awareness` + a
//     way to simulate inbound updates without spinning up a real WS.
//   • Future transports (BroadcastChannel for same-origin tabs, WebRTC for
//     P2P, MessagePort for in-process tests) can be substituted without
//     touching SyncClient.
//
// The shape mirrors `y-websocket`'s `WebsocketProvider` for the methods we
// actually use; we DO NOT model `awareness.setLocalState` here because that
// lives behind the PryzmAwareness wrapper (ADR-0033 §2.6).

export interface ProviderLike {
  /** True once the underlying transport has handed shake completed. */
  readonly wsconnected?: boolean;
  /** True while the provider is in its reconnect backoff window. */
  readonly wsconnecting?: boolean;
  /** Provider awareness handle — opaque to sync-client, owned by PryzmAwareness. */
  readonly awareness?: {
    readonly clientID: number;
    setLocalState(state: Record<string, unknown> | null): void;
    getStates(): Map<number, Record<string, unknown>>;
    on(event: string, fn: (...args: unknown[]) => void): void;
    off(event: string, fn: (...args: unknown[]) => void): void;
  };
  /** Subscribe to provider lifecycle events.  Provider docs say the events
   *  we care about are `'status'`, `'sync'`, `'connection-close'`,
   *  `'connection-error'`.  We coerce these into our `SyncClientStatus`. */
  on(event: string, fn: (payload: unknown) => void): void;
  off(event: string, fn: (payload: unknown) => void): void;
  destroy(): void;
}

export type ProviderFactory = (args: {
  readonly url: string;
  readonly projectId: ProjectId;
  readonly authToken: string;
  readonly doc: YDoc;
}) => ProviderLike;

// ─── SyncClientOptions (the constructor input) ──────────────────────────────

export interface SyncClientOptions {
  readonly projectId: ProjectId;
  /** wss://sync.pryzm.com/projects/<id>  — no trailing slash. */
  readonly url: string;
  readonly authToken: string;
  /** The durable source of truth.  EventBridge writes inbound events here
   *  via `appendInbound(...)` and dedups against `has(...)`. */
  readonly eventLog: EventLog;
  /** The local CommandBus.  EventBridge subscribes to its `onCommitted`
   *  hook (forward direction) and calls `applyPatchOnly` (reverse). */
  readonly commandBus: SyncCommandBus;
  /** Optional: inject a Y.Doc for tests; default = `new Y.Doc()`. */
  readonly doc?: YDoc;
  /** Optional: inject a provider factory for tests; default = the y-websocket
   *  factory wired in at S43 D1.  Tests pass a MockProviderFactory so the
   *  unit suite runs without a real WebSocket. */
  readonly providerFactory?: ProviderFactory;
}

// ─── SyncCommandBus (the subset of CommandBus the bridge depends on) ───────
//
// We model only the two methods the bridge needs: `onCommitted` (forward
// hook) and `applyPatchOnly` (the non-broadcast primitive — see ADR-0033 §2.3).
// `applyPatchOnly` is the single new method `@pryzm/command-bus` must add
// for S43; until it lands the bridge will throw a clear error at construction
// time so this dependency is visible.

export interface SyncCommandBus {
  /** Subscribe to local-commit events.  Returns a disposer.  The forward
   *  direction of the bridge calls this exactly once at construction. */
  onCommitted(listener: (event: EventEnvelope) => void): () => void;

  /** Apply an event's patches without re-broadcasting.  This is the
   *  critical primitive for the reverse direction of the bridge — without
   *  it the network loops (an inbound event would trigger another local
   *  broadcast which would arrive back as another inbound event).
   *
   *  Per ADR-0033 §2.3, this is the only new method `@pryzm/command-bus`
   *  exposes for S43.  The legacy `executeCommand` path remains unchanged. */
  applyPatchOnly(payload: unknown): void;
}
