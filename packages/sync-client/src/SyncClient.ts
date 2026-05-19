// @pryzm/sync-client — SyncClient (S43 D1; ADR-0033 §2.2).
//
// Owns:
//   • the Y.Doc (one per project, instantiated lazily if not injected)
//   • the ProviderLike (y-websocket WebsocketProvider in production; a
//     MockProvider in tests)
//   • the EventBridge wired to (Y.Doc, CommandBus, EventLog)
//   • the SyncClientStatus surface (idle | connecting | open |
//     reconnecting | closed | error)
//
// Does NOT own:
//   • the JSON event-log channel (that lives in @pryzm/persistence-client and
//     speaks to apps/sync-server's existing S22 protocol).  Both wire formats
//     coexist on the same WebSocket per ADR-0033 §2.4 — SyncClient ONLY
//     touches the Yjs binary frame.
//   • the soft-lock state (S45; mirrored into PryzmAwareness.heldLocks)
//   • the per-route authz.can middleware (S43 D7 server-side concern)
//
// PURE-ish: side effects are confined to the provider lifecycle and the
// EventBridge construction.  No DOM, no THREE.

import * as Y from 'yjs';
import type {
  ProjectId,
  ProviderFactory,
  ProviderLike,
  SyncClientOptions,
  SyncClientStatus,
  SyncStatusListener,
} from './types.js';
import { EventBridge } from './event-bridge.js';
import { withSpan } from './tracing.js';

const DEFAULT_RESYNC_INTERVAL_MS = 5_000;

export class SyncClient {
  readonly doc: Y.Doc;
  readonly bridge: EventBridge;
  readonly projectId: ProjectId;

  private provider: ProviderLike | null = null;
  private status: SyncClientStatus = 'idle';
  private readonly statusListeners = new Set<SyncStatusListener>();
  private readonly providerFactory: ProviderFactory;
  private readonly url: string;
  private readonly authToken: string;
  private disposed = false;

  constructor(opts: SyncClientOptions) {
    if (!opts.projectId) throw new Error('@pryzm/sync-client: projectId is required');
    if (!opts.url) throw new Error('@pryzm/sync-client: url is required');
    if (!opts.authToken) throw new Error('@pryzm/sync-client: authToken is required');
    if (!opts.commandBus) throw new Error('@pryzm/sync-client: commandBus is required');
    if (!opts.eventLog) throw new Error('@pryzm/sync-client: eventLog is required');

    this.projectId = opts.projectId;
    this.url = opts.url;
    this.authToken = opts.authToken;
    this.doc = opts.doc ?? new Y.Doc();
    this.providerFactory = opts.providerFactory ?? defaultProviderFactory;
    this.bridge = new EventBridge(this.doc, opts.commandBus, opts.eventLog);
  }

  /** Open the WebSocket connection and start syncing.  Idempotent — second
   *  call returns the existing provider.  Status transitions:
   *    idle → connecting → open
   *  On transport error: → reconnecting → open (loop until disconnect()).
   *  On terminal error:  → error (calling code should disconnect()). */
  connect(): void {
    if (this.disposed) throw new Error('@pryzm/sync-client: SyncClient is disposed');
    if (this.provider) return;
    this.transitionTo('connecting');
    this.provider = this.providerFactory({
      url: this.url,
      projectId: this.projectId,
      authToken: this.authToken,
      doc: this.doc,
    });

    // Coerce provider lifecycle events into our status surface.
    this.provider.on('status', (payload) => {
      const ev = payload as { status?: string };
      switch (ev?.status) {
        case 'connected':
          this.transitionTo('open');
          break;
        case 'connecting':
          this.transitionTo(this.status === 'open' ? 'reconnecting' : 'connecting');
          break;
        case 'disconnected':
          if (this.status !== 'closed') this.transitionTo('reconnecting');
          break;
      }
    });
    this.provider.on('connection-error', (payload) => {
      this.transitionTo('error', String(payload));
    });
    this.provider.on('connection-close', () => {
      if (this.status !== 'closed' && this.status !== 'error') {
        this.transitionTo('reconnecting');
      }
    });
  }

  /** Disconnect the WebSocket and dispose the provider.  Status: → closed.
   *  The Y.Doc and EventBridge survive — call `dispose()` to also tear those
   *  down. */
  disconnect(): void {
    if (this.provider) {
      withSpan('pryzm.sync-client.reconnect', () => {
        this.provider?.destroy();
      }, { 'pryzm.sync-client.action': 'disconnect' });
      this.provider = null;
    }
    if (!this.disposed) this.transitionTo('closed');
  }

  /** Tear down everything: provider, EventBridge, Y.Doc. */
  dispose(): void {
    if (this.disposed) return;
    this.disconnect();
    this.bridge.dispose();
    this.doc.destroy();
    this.statusListeners.clear();
    this.disposed = true;
  }

  /** Current status. */
  getStatus(): SyncClientStatus { return this.status; }

  /** Subscribe to status transitions.  Listener fires synchronously with
   *  the current status on subscribe.  Returns a disposer. */
  onStatusChanged(listener: SyncStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => { this.statusListeners.delete(listener); };
  }

  /** Returns the underlying provider — exposed for PryzmAwareness wiring
   *  (which needs the `provider.awareness` handle).  Null until connect(). */
  getProvider(): ProviderLike | null { return this.provider; }

  /** Internal: change status + fan out to listeners. */
  private transitionTo(next: SyncClientStatus, reason?: string): void {
    if (this.status === next) return;
    this.status = next;
    for (const l of this.statusListeners) {
      try { l(next, reason); } catch { /* swallow — listeners must be best-effort */ }
    }
  }
}

// ─── Default provider factory ────────────────────────────────────────────────
//
// The y-websocket dependency is intentionally NOT installed in S43 D1 —
// per ADR-0033 §2.2 the production provider wiring lands at S43 D1's
// transport task.  Until then, `defaultProviderFactory` throws a clear
// error so that:
//   • Production use is gated explicitly (no silent localhost-only behaviour).
//   • Tests inject their own factory (the documented happy path).
//
// When y-websocket is added to package.json (S43 D1), this factory becomes:
//
//   import { WebsocketProvider } from 'y-websocket';
//   return new WebsocketProvider(args.url, args.projectId, args.doc, {
//     params: { token: args.authToken },
//     resyncInterval: DEFAULT_RESYNC_INTERVAL_MS,
//   }) as unknown as ProviderLike;
//
// The shape of args matches WebsocketProvider's constructor 1:1, so the
// switch is one import + one return.

const defaultProviderFactory: ProviderFactory = () => {
  throw new Error(
    '@pryzm/sync-client: no providerFactory injected and the default y-websocket ' +
      'provider is not yet wired (see ADR-0033 §2.2 — production wiring lands at S43 D1).  ' +
      'Pass `opts.providerFactory` explicitly until then.',
  );
};

/** Re-exported for tests + downstream wiring. */
export { DEFAULT_RESYNC_INTERVAL_MS };
