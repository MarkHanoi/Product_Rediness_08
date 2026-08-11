// apps/sync-server/__tests__/YjsTwoClient.test.ts — L-391 leg C (Phase 1, R-A Option A).
//
// THE FIRST TWO-CLIENT CONVERGENCE EVIDENCE IN THIS REPOSITORY.
//
// Two REAL stock `y-websocket` WebsocketProviders (the exact transport
// `packages/sync-client/src/websocketProviderFactory.ts` constructs in
// production) connect to the sync-server and exchange a wall-height edit
// written through the REAL `YjsDocAdapter.applyCommand()` + syncDisposition
// path (`wall.create` / `wall.updateDimensions`, both declared
// element-property in `packages/sync-client/src/syncDisposition.ts`).
//
// Anti-staleness design (per the L-391 leg-C brief):
//   • Client B is seeded with the STALE creation value (height = 3) BEFORE
//     any transport exists — by applying A's creation snapshot, exactly as a
//     late joiner loads the persisted project.  So a broken transport leaves
//     B reading 3, and the final assertion is `toBe(5)` — staleness CANNOT
//     pass, and `toBeDefined()` is never used.
//   • BroadcastChannel is disabled on both providers (`disableBc: true`) so
//     the ONLY route between A and B is the server's WebSocket protocol.
//     Without that, two providers in one Node process would converge via the
//     in-process BroadcastChannel and prove nothing about the server.
//
// This test FAILS against the S22-JSON-only sync-server (upgrade on
// `/${room}` is 404'd; no y-protocols framing) and passes once the server
// speaks y-protocols sync + awareness (src/yjs/setupYjsConnection.ts).

import { afterEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { YjsDocAdapter, ELEMENTS_NAMESPACE, type YjsProvider } from '@pryzm/sync-client';
import type * as Y from 'yjs';
import { createSyncServer, type SyncServerInstance } from '../src/index.js';
import { yjsProjectCache } from '../src/YjsProjectCache.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Poll until `pred()` is true or `timeoutMs` elapses. Resolves either way —
 *  the caller's subsequent `expect(...).toBe(...)` carries the assertion, so
 *  a timeout produces the sharp "expected 3 to be 5" failure, not a vague
 *  timeout error. */
async function until(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

interface Peer {
  adapter: YjsDocAdapter;
  provider: WebsocketProvider;
}

function connectPeer(adapter: YjsDocAdapter, port: number, room: string): Peer {
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}`, room, adapter.doc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    // CRITICAL: without this, the two providers in this one Node process
    // sync via BroadcastChannel and the server is never exercised.
    disableBc: true,
    maxBackoffTime: 500,
  });
  adapter.connectWithProvider(provider as unknown as YjsProvider);
  return { adapter, provider };
}

function teardownPeer(p: Peer): void {
  p.provider.destroy();
  p.adapter.destroy();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('L-391 leg C — two real y-websocket clients through the sync-server', () => {
  let server: SyncServerInstance | undefined;
  const peers: Peer[] = [];

  afterEach(async () => {
    for (const p of peers.splice(0)) teardownPeer(p);
    if (server) { await server.shutdown('yjs-two-client-cleanup'); server = undefined; }
  });

  it('B (seeded with stale creation height 3) converges to 5 after A edits through YjsDocAdapter', async () => {
    server = await createSyncServer({});
    const port = await server.listen(0);
    const room = `proj-${ulid()}`;

    const adapterA = new YjsDocAdapter(room);
    const adapterB = new YjsDocAdapter(room);

    // ── Creation: A authors the wall at height 3 through the real
    //    syncDisposition path ('wall.create' → ELEMENTS_NAMESPACE record).
    adapterA.applyCommand('wall.create', { id: 'wall-1', height: 3, thickness: 0.2 });

    // ── Seed B with the STALE creation snapshot (what a late joiner loads
    //    from persistence). B genuinely holds 3 before any transport exists.
    adapterB.applyUpdate(adapterA.encodeStateAsUpdate());
    expect(adapterB.readElementProperty('wall-1', 'height')).toBe(3);

    // ── Transport: two REAL stock y-websocket providers, server-only route.
    peers.push(connectPeer(adapterA, port, room));
    peers.push(connectPeer(adapterB, port, room));

    // ── A edits the wall height to 5 through the declared verb.
    adapterA.applyCommand('wall.updateDimensions', { wallId: 'wall-1', height: 5 });

    // ── Convergence: B must read the NEW value. `toBe(5)` — a dead transport
    //    leaves B at the seeded stale 3 and this fails loudly.
    await until(() => adapterB.readElementProperty('wall-1', 'height') === 5, 8_000);
    expect(adapterB.readElementProperty('wall-1', 'height')).toBe(5);

    // ── The server-side merge cache is the same doc the wire served: the
    //    room doc in YjsProjectCache must also hold 5 (C08 §3.1 — all binary
    //    updates pass through the cache, which is no longer dead code).
    const serverDoc = yjsProjectCache.getOrCreateDocForRoom(room);
    const serverRecord = serverDoc
      .getMap<Y.Map<unknown>>(ELEMENTS_NAMESPACE)
      .get('wall-1');
    expect(serverRecord?.get('height')).toBe(5);
  }, 30_000);

  it('awareness: A presence reaches B through the server awareness channel', async () => {
    server = await createSyncServer({});
    const port = await server.listen(0);
    const room = `proj-${ulid()}`;

    const adapterA = new YjsDocAdapter(room);
    const adapterB = new YjsDocAdapter(room);
    const a = connectPeer(adapterA, port, room);
    const b = connectPeer(adapterB, port, room);
    peers.push(a, b);

    adapterA.setPresence({ userId: 'user-a', displayName: 'Alice', color: '#6600FF' });

    const remoteOnB = (): unknown => {
      for (const [clientId, state] of b.provider.awareness.getStates()) {
        if (clientId !== b.provider.awareness.clientID && state !== null) return state;
      }
      return undefined;
    };
    await until(() => (remoteOnB() as { userId?: string } | undefined)?.userId === 'user-a', 8_000);
    expect((remoteOnB() as { userId?: string } | undefined)?.userId).toBe('user-a');
  }, 30_000);
});
