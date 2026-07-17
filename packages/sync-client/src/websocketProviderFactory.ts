// @pryzm/sync-client — websocketProviderFactory (L-391 Phase 0).
//
// The PRODUCTION transport factory: constructs a `y-websocket`
// `WebsocketProvider` bound to a Y.Doc + room.  Isolated in its own module so
// the `y-websocket` import stays OUT of `collabProvider.ts` — keeping the
// wiring seam unit-testable in a plain Node env (tests inject a MockProvider
// factory and never load this module).
//
// The provider speaks the standard y-protocols binary sync + awareness protocol
// on `${url}/${room}`.  The current `apps/sync-server` does NOT yet implement
// this protocol (it speaks the S22 JSON command-event protocol) — closing that
// gap is Phase 1 (see docs/04-reference/L-391-CRDT-COLLAB-PLAN.md).  For local
// two-browser verification, point the URL at a stock `y-websocket` server.
//
// P8: the exported factory wraps construction in an OTel span.

import { WebsocketProvider } from 'y-websocket';
import { trace } from '@opentelemetry/api';
import type { YjsProvider } from './YjsDocAdapter.js';
import type { WebsocketProviderFactory } from './collabProvider.js';

const tracer = trace.getTracer('pryzm.sync-client.collab');

/**
 * Production `WebsocketProviderFactory` — builds a real `y-websocket`
 * `WebsocketProvider`.  The returned handle is structurally compatible with
 * the adapter's `YjsProvider` interface (awareness / connect / disconnect /
 * destroy).
 */
export const createWebsocketProvider: WebsocketProviderFactory = (args): YjsProvider => {
  const span = tracer.startSpan('pryzm.sync.collab.createWebsocketProvider', {
    attributes: {
      'pryzm.collab.room': args.room,
    },
  });
  try {
    const provider = new WebsocketProvider(args.url, args.room, args.doc, {
      connect: true,
      ...(args.authToken ? { params: { token: args.authToken } } : {}),
      ...(args.resyncIntervalMs !== undefined
        ? { resyncInterval: args.resyncIntervalMs }
        : {}),
    });
    // WebsocketProvider exposes awareness / connect / disconnect / destroy —
    // a superset of the adapter's YjsProvider surface.  The awareness shape
    // differs at the type edge, hence the structural cast.
    return provider as unknown as YjsProvider;
  } finally {
    span.end();
  }
};
