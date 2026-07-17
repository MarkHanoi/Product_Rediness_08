// @pryzm/sync-client — collabProvider (L-391 Phase 0).
//
// The Phase-0 wiring seam for real-time CRDT replication.  It connects a
// YjsDocAdapter's Y.Doc to a websocket transport provider, GATED behind an
// explicit `enabled` flag owned by the caller (the composition root / editor
// bootstrap).  When disabled — the production default until Phase 1 ratifies a
// deployed sync-server — this is a strict no-op: no provider is constructed, no
// network handle is opened, and solo/offline editing is byte-identical to not
// calling it at all.
//
// Why a separate factory argument (P1 + testability):
//   The real transport (`createWebsocketProvider`, which imports `y-websocket`)
//   is injected by the caller.  This module holds ZERO transport dependency, so
//   the wiring logic is unit-testable in a plain Node env without a WebSocket.
//   Tests inject a MockProvider factory; production injects the real one.
//
// P8: the exported `connectCrdtProvider` wraps its work in an OTel span.

import type { Doc as YDoc } from 'yjs';
import { trace } from '@opentelemetry/api';
import type { YjsProvider } from './YjsDocAdapter.js';

const tracer = trace.getTracer('pryzm.sync-client.collab');

/**
 * The minimal surface `connectCrdtProvider` needs from a CRDT adapter.
 * `YjsDocAdapter` satisfies this structurally (`doc` + `connectWithProvider`).
 */
export interface CrdtProviderTarget {
  /** The live coordination / global Y.Doc the transport binds to. */
  readonly doc: YDoc;
  /** Register the transport provider so remote ops flow into `doc`. */
  connectWithProvider(provider: YjsProvider): void;
}

/**
 * Configuration for the Phase-0 CRDT provider wiring.  Assembled by the caller
 * from environment + runtime flags; the `enabled` gate MUST default to OFF at
 * the call site so nothing changes until a sync-server is deployed (Phase 1).
 */
export interface CollabProviderConfig {
  /**
   * Master gate.  When false, `connectCrdtProvider` is a strict no-op and
   * returns null — no provider is constructed and no socket is opened.
   */
  readonly enabled: boolean;
  /**
   * Sync-server websocket base URL, e.g. `wss://sync.pryzm.dev`.  Required when
   * `enabled` is true; when absent the wiring degrades to the disabled no-op.
   */
  readonly url?: string;
  /**
   * Room name — the project (or `${projectId}:${levelId}`) replication scope.
   * The transport joins exactly this room.
   */
  readonly room: string;
  /**
   * Optional auth token forwarded to the transport as a ws query param.
   * Server-side enforcement of this token lands in Phase 1 (ws auth); in
   * Phase 0 it is carried through opaquely so the seam is ready.
   */
  readonly authToken?: string;
  /** Optional periodic full-state resync interval (ms). */
  readonly resyncIntervalMs?: number;
}

/** Arguments handed to a transport factory. */
export interface WebsocketProviderFactoryArgs {
  readonly url: string;
  readonly room: string;
  readonly doc: YDoc;
  readonly authToken?: string;
  readonly resyncIntervalMs?: number;
}

/**
 * Factory that constructs a transport provider bound to the given doc + room.
 * The production implementation (`createWebsocketProvider`) builds a
 * `y-websocket` `WebsocketProvider`; tests inject a MockProvider factory.
 */
export type WebsocketProviderFactory = (
  args: WebsocketProviderFactoryArgs,
) => YjsProvider;

/**
 * Phase 0 (L-391) — connect the CRDT adapter's Y.Doc to a websocket transport,
 * gated by `config.enabled`.
 *
 * Behaviour:
 *   • `config.enabled === false`  → no-op, returns null (production default).
 *   • `config.enabled && !url`    → no-op, returns null (misconfigured).
 *   • `config.enabled && url`     → constructs a provider via `factory`,
 *     registers it on the adapter (`connectWithProvider`), returns it.
 *
 * Failure isolation: any throw from the factory or the adapter is caught,
 * recorded on the span, and swallowed (returns null) — collaboration wiring
 * MUST NEVER break the editor boot or solo editing.
 *
 * P1: pure wiring — the caller (composition root) owns the config + factory.
 * P8: wrapped in an OTel span.
 */
export function connectCrdtProvider(
  target: CrdtProviderTarget,
  config: CollabProviderConfig,
  factory: WebsocketProviderFactory,
): YjsProvider | null {
  const span = tracer.startSpan('pryzm.sync.collab.connectCrdtProvider', {
    attributes: {
      'pryzm.collab.enabled': config.enabled,
      'pryzm.collab.room': config.room,
      'pryzm.collab.has_url': Boolean(config.url),
    },
  });
  try {
    if (!config.enabled) {
      span.setAttribute('pryzm.collab.result', 'disabled');
      return null;
    }
    if (!config.url) {
      span.setAttribute('pryzm.collab.result', 'no-url');
      return null;
    }
    const provider = factory({
      url: config.url,
      room: config.room,
      doc: target.doc,
      ...(config.authToken !== undefined ? { authToken: config.authToken } : {}),
      ...(config.resyncIntervalMs !== undefined
        ? { resyncIntervalMs: config.resyncIntervalMs }
        : {}),
    });
    target.connectWithProvider(provider);
    span.setAttribute('pryzm.collab.result', 'connected');
    return provider;
  } catch (err) {
    span.recordException(err as Error);
    span.setAttribute('pryzm.collab.result', 'error');
    // Never let collaboration wiring break the editor — degrade to solo.
    // eslint-disable-next-line no-console
    console.warn('[collabProvider] connectCrdtProvider failed (non-fatal, staying solo):', err);
    return null;
  } finally {
    span.end();
  }
}
