// packages/sync-client/__tests__/_chaos/PeerHarness.ts — W-04.
//
// Chaos test harness for sync-client.  Each `Peer` owns:
//   • a Y.Doc
//   • a SyncClient with a HubProvider (the chaos transport)
//   • a CommandBus stub + EventLog stub matching the SyncClient interface
//   • a RandomEditGenerator
//
// All peers share a Hub that forwards Yjs binary updates (the same
// `update` event the real y-websocket provider emits) to every other peer.
// The hub is FIFO + optional jitter: the chaos harness can configure a
// per-peer probability of dropping a frame and / or reordering frames.
//
// Convergence is provable because Yjs CRDT updates are idempotent +
// commutative; the hub stress-tests the EventBridge ⇄ Y.Doc round-trip on
// top of that guarantee.

import * as Y from 'yjs';
import type { ProviderLike, ProviderFactory, EventLog as PryzmEventLog, SyncCommandBus, EventEnvelope } from '../../src/index.js';
import { SyncClient } from '../../src/index.js';
import { RandomEditGenerator, type ChaosEvent } from './RandomEditGenerator.js';
import type { SeededRng } from './prng.js';

export interface HubOptions {
  /** Per-frame probability of dropping the broadcast (0..1).  Default 0. */
  readonly dropP?: number;
  /** Per-frame probability of delaying the broadcast by `delayJitterMs`. */
  readonly delayP?: number;
  /** Max delay (uniform 0..delayJitterMs ms). */
  readonly delayJitterMs?: number;
  readonly rng: SeededRng;
}

interface HubSubscriber {
  readonly id: string;
  readonly emit: (update: Uint8Array) => void;
}

class Hub {
  private readonly subscribers = new Map<string, HubSubscriber>();
  private framesSent = 0;
  private framesDropped = 0;
  private framesDelayed = 0;
  constructor(private readonly opts: HubOptions) {}
  subscribe(s: HubSubscriber): () => void {
    this.subscribers.set(s.id, s);
    return () => { this.subscribers.delete(s.id); };
  }
  publish(fromId: string, update: Uint8Array): void {
    for (const sub of this.subscribers.values()) {
      if (sub.id === fromId) continue;
      this.framesSent += 1;
      const dropP = this.opts.dropP ?? 0;
      if (dropP > 0 && this.opts.rng.next() < dropP) {
        this.framesDropped += 1;
        continue;
      }
      const delayP = this.opts.delayP ?? 0;
      const jitter = this.opts.delayJitterMs ?? 0;
      if (delayP > 0 && jitter > 0 && this.opts.rng.next() < delayP) {
        this.framesDelayed += 1;
        const delay = Math.floor(this.opts.rng.next() * jitter);
        setTimeout(() => sub.emit(update), delay);
      } else {
        sub.emit(update);
      }
    }
  }
  stats() { return { framesSent: this.framesSent, framesDropped: this.framesDropped, framesDelayed: this.framesDelayed, peerCount: this.subscribers.size }; }
}

// ── HubProvider: a ProviderLike that joins the hub on construction ──────────

class HubProvider implements ProviderLike {
  wsconnected = true;
  wsconnecting = false;
  private readonly handlers = new Map<string, Set<(p: unknown) => void>>();
  private readonly unsubscribeHub: () => void;
  private readonly docUpdateOff: () => void;
  private readonly origin = Symbol('hub-provider');

  constructor(
    readonly id: string,
    private readonly doc: Y.Doc,
    private readonly hub: Hub,
  ) {
    // Forward local doc updates → hub.
    const docHandler = (update: Uint8Array, origin: unknown): void => {
      // Don't re-broadcast updates we ourselves applied from the hub.
      if (origin === this.origin) return;
      hub.publish(id, update);
    };
    doc.on('update', docHandler);
    this.docUpdateOff = () => doc.off('update', docHandler);

    // Subscribe to inbound hub frames.
    this.unsubscribeHub = hub.subscribe({
      id,
      emit: (update) => {
        // applyUpdate is idempotent + commutative — Yjs guarantees this
        // is safe regardless of arrival order.
        Y.applyUpdate(doc, update, this.origin);
      },
    });

    // Fire a 'status: connected' on the next microtask so SyncClient
    // observes the open transition synchronously.
    queueMicrotask(() => this.fire('status', { status: 'connected' }));
  }

  on(event: string, fn: (payload: unknown) => void): void {
    let s = this.handlers.get(event);
    if (!s) { s = new Set(); this.handlers.set(event, s); }
    s.add(fn);
  }
  off(event: string, fn: (payload: unknown) => void): void {
    this.handlers.get(event)?.delete(fn);
  }
  destroy(): void {
    this.unsubscribeHub();
    this.docUpdateOff();
    this.handlers.clear();
  }
  private fire(event: string, payload: unknown): void {
    for (const fn of this.handlers.get(event) ?? []) fn(payload);
  }
}

// ── Peer ────────────────────────────────────────────────────────────────────

export interface Peer {
  readonly id: string;
  readonly doc: Y.Doc;
  readonly client: SyncClient;
  readonly generator: RandomEditGenerator;
  readonly commandBus: ChaosCommandBus;
  readonly eventLog: ChaosEventLog;
  /** Convenience: commit `event` through the local CommandBus → EventBridge
   *  forward path, and then mirror the inbound applyPatchOnly when the
   *  hub echoes it back.  Returns once the local Y.Map has the entry
   *  (synchronous because Y.Map.set is synchronous). */
  commit(event: ChaosEvent): void;
  dispose(): void;
}

class ChaosCommandBus implements SyncCommandBus {
  readonly listeners: Array<(e: EventEnvelope) => void> = [];
  readonly applyPatchOnlyCalls: EventEnvelope[] = [];
  onCommitted(listener: (e: EventEnvelope) => void): () => void {
    this.listeners.push(listener);
    return () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); };
  }
  applyPatchOnly(payload: EventEnvelope): void {
    this.applyPatchOnlyCalls.push(payload);
  }
  fireCommit(event: EventEnvelope): void {
    for (const fn of this.listeners) fn(event);
  }
}

class ChaosEventLog implements PryzmEventLog {
  readonly entries = new Map<string, unknown>();
  has(id: string): boolean { return this.entries.has(id); }
  appendInbound(id: string, payload: unknown): void { this.entries.set(id, payload); }
}

export interface CreatePeerOptions {
  readonly id: string;
  readonly hub: Hub;
  readonly rng: SeededRng;
  readonly projectId: string;
}

function createPeer(opts: CreatePeerOptions): Peer {
  const doc = new Y.Doc();
  const commandBus = new ChaosCommandBus();
  const eventLog = new ChaosEventLog();
  const factory: ProviderFactory = ({ doc: d }) => new HubProvider(opts.id, d, opts.hub);
  const client = new SyncClient({
    projectId: opts.projectId,
    url: 'wss://chaos.local/sync',
    authToken: 'chaos-token',
    eventLog,
    commandBus,
    doc,
    providerFactory: factory,
  });
  client.connect();
  const generator = new RandomEditGenerator(opts.rng, opts.id);
  return {
    id: opts.id,
    doc,
    client,
    generator,
    commandBus,
    eventLog,
    commit(event) {
      // Local-side bookkeeping that the real CommandBus would do for us:
      //   1. Append to our own event log so the inbound observer's `has(id)`
      //      check skips the echo from the hub.
      eventLog.appendInbound(event.id, event.payload);
      //   2. Fire the onCommitted listener so EventBridge forwards into Y.Doc.
      commandBus.fireCommit(event);
    },
    dispose() {
      client.dispose();
      doc.destroy();
    },
  };
}

// ── PeerHarness: orchestrates N peers + a Hub ───────────────────────────────

export interface PeerHarnessOptions {
  readonly peerCount: number;
  readonly seed: number;
  readonly projectId?: string;
  readonly hub?: Partial<Pick<HubOptions, 'dropP' | 'delayP' | 'delayJitterMs'>>;
  /** Per-peer rng factory — mainly for tests that want each peer to be
   *  independently reproducible.  Default: derive from `seed` + index. */
  readonly rngFor?: (idx: number) => SeededRng;
}

export interface PeerHarness {
  readonly hub: Hub;
  readonly peers: readonly Peer[];
  hubStats(): ReturnType<Hub['stats']>;
  /** Mimics y-websocket's reconnect resync (sync step 2): broadcasts each
   *  peer's full encoded state to every other peer, recovering anything the
   *  Hub previously dropped.  Real production transports run this as part
   *  of WS reconnect; the chaos harness exposes it so tests with loss can
   *  assert eventual convergence after a "reconnect tick". */
  flushState(): void;
  dispose(): void;
}

export function createPeerHarness(opts: PeerHarnessOptions, mulberry: (n: number) => SeededRng): PeerHarness {
  const hubRng = mulberry(opts.seed ^ 0xA5A5A5A5);
  const hub = new Hub({
    rng: hubRng,
    dropP: opts.hub?.dropP ?? 0,
    delayP: opts.hub?.delayP ?? 0,
    delayJitterMs: opts.hub?.delayJitterMs ?? 0,
  });
  const projectId = opts.projectId ?? 'PRJ-CHAOS-01';
  const peers: Peer[] = [];
  for (let i = 0; i < opts.peerCount; i++) {
    const rng = (opts.rngFor ?? ((idx) => mulberry(opts.seed + idx + 1)))(i);
    peers.push(createPeer({ id: `peer-${i}`, hub, rng, projectId }));
  }
  return {
    hub,
    peers,
    hubStats: () => hub.stats(),
    flushState: () => {
      for (const p of peers) {
        // Encode the full state of this peer's doc and re-publish through
        // the hub.  applyUpdate() on each receiver is idempotent — anything
        // they already had is a no-op; anything they missed is filled in.
        const fullUpdate = Y.encodeStateAsUpdate(p.doc);
        hub.publish(p.id, fullUpdate);
      }
    },
    dispose: () => { for (const p of peers) p.dispose(); },
  };
}
