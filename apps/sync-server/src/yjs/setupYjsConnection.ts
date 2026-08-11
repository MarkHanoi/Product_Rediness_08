// apps/sync-server/src/yjs/setupYjsConnection.ts — L-391 leg C (Phase 1, R-A Option A).
//
// The y-protocols WebSocket handler: makes this server speak the STANDARD
// binary sync + awareness protocol that a stock `y-websocket`
// `WebsocketProvider` (the exact transport `packages/sync-client/src/
// websocketProviderFactory.ts` builds in production) expects on
// `${url}/${room}`.
//
// Before this file existed the server had a real Yjs merge cache
// (`YjsProjectCache`) but NOTHING wired it to the wire — the WS dispatch
// only routed the S22 JSON message types, so a stock provider connecting to
// `/${room}` was 404'd at upgrade (L-391 plan §1.4: "the cache is dead code
// w.r.t. the transport").  This handler closes exactly that gap:
//
//   • room doc  = `yjsProjectCache.getOrCreateDocForRoom(room)` — the SAME
//     doc the cache merges and `/health` reports.  Rooms follow ADR-049
//     §4.4 naming: "${projectId}" or "${projectId}:${levelId}".
//   • sync      = y-protocols/sync step1/step2/update framing (message 0).
//   • awareness = y-protocols/awareness (message 1) + query (message 3),
//     one Awareness instance per room, client states removed on disconnect.
//
// Modeled on the reference y-websocket server implementation
// (@y/websocket-server `utils.js` — y-websocket v3 no longer ships server
// utils, so the framing lives here as the plan's "thin wrapper").
//
// What this file does NOT do (deliberately, per the L-391 ratification
// table): WS auth is still the v0 trust model (R-B — the JWT upgrade gate
// is a human-gated Phase 1 decision); durability of room docs across
// process restart is R-E (the docs live in the in-memory YjsProjectCache;
// within one process they survive server instance restarts because the
// cache is a module singleton).  The S22 JSON path on `/sync` (with its
// Postgres advisory-lock event-log persistence) is untouched.
//
// P8: every entry point wraps in an OTel span.

import type { WebSocket, RawData } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { trace } from '@opentelemetry/api';
import { yjsProjectCache } from '../YjsProjectCache.js';

const tracer = trace.getTracer('pryzm.sync-server.yjs-protocol');

// ─── Wire message types (MUST match y-websocket's client constants) ─────────

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
// const MESSAGE_AUTH = 2;        — not implemented (R-B, Phase 1 ratification)
const MESSAGE_QUERY_AWARENESS = 3;

/** Keepalive ping interval — matches the reference server's 30 s. */
const PING_TIMEOUT_MS = 30_000;

// ─── Per-room state ─────────────────────────────────────────────────────────

interface YjsRoom {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  /** conn → set of awareness clientIDs controlled by that conn. */
  readonly conns: Map<WebSocket, Set<number>>;
}

/**
 * Module-level registry.  Deliberately module-scoped (like the
 * `yjsProjectCache` singleton it fronts) so that an in-process server
 * restart — shutdown() then a fresh createSyncServer() on the same port —
 * reconnects clients to the same merged docs and convergence RESUMES
 * (exercised by the chaos suite).  Dead conns are pruned on socket close.
 */
const rooms = new Map<string, YjsRoom>();

function getOrCreateRoom(name: string): YjsRoom {
  let room = rooms.get(name);
  if (room) return room;

  const doc = yjsProjectCache.getOrCreateDocForRoom(name);
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null); // the server itself has no presence
  const created: YjsRoom = { name, doc, awareness, conns: new Map() };

  // Fan out every doc update (whatever its origin — a client message merged
  // via readSyncMessage, or a server-side cache merge) to all subscribers.
  // The originator receives its own update too, exactly like the reference
  // server: Yjs update application is idempotent, so this is harmless and
  // keeps the fan-out single-path.
  doc.on('update', (update: Uint8Array) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of created.conns.keys()) send(created, conn, message);
  });

  // Fan out awareness changes; track which conn controls which clientIDs so
  // a disconnect can remove exactly that conn's presence states.
  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      connOrigin: unknown,
    ) => {
      const changed = added.concat(updated, removed);
      if (connOrigin !== null && created.conns.has(connOrigin as WebSocket)) {
        const controlled = created.conns.get(connOrigin as WebSocket)!;
        for (const clientId of added) controlled.add(clientId);
        for (const clientId of removed) controlled.delete(clientId);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
      );
      const message = encoding.toUint8Array(encoder);
      for (const conn of created.conns.keys()) send(created, conn, message);
    },
  );

  rooms.set(name, created);
  return created;
}

// ─── Connection lifecycle ───────────────────────────────────────────────────

function send(room: YjsRoom, conn: WebSocket, message: Uint8Array): void {
  // 0 = CONNECTING, 1 = OPEN — anything else is closing/closed.
  if (conn.readyState !== 0 && conn.readyState !== 1) {
    closeConn(room, conn);
    return;
  }
  try {
    conn.send(message, (err) => {
      if (err) closeConn(room, conn);
    });
  } catch {
    closeConn(room, conn);
  }
}

function closeConn(room: YjsRoom, conn: WebSocket): void {
  const controlled = room.conns.get(conn);
  if (controlled !== undefined) {
    room.conns.delete(conn);
    // Presence must not outlive the socket (the reference server does the
    // same): peers see the collaborator leave immediately.
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlled), null);
  }
  try {
    conn.close();
  } catch { /* already closed */ }
}

function handleMessage(room: YjsRoom, conn: WebSocket, message: Uint8Array): void {
  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        // Applies steps 1/2/update against the room doc (origin = conn).
        // Updates merged here fan out via the doc 'update' handler above —
        // i.e. every binary update passes through the YjsProjectCache doc,
        // which is the C08 §3.1 contract the cache existed to satisfy.
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
        // A step-1 read writes a step-2 reply into the encoder; forward it.
        if (encoding.length(encoder) > 1) send(room, conn, encoding.toUint8Array(encoder));
        break;
      }
      case MESSAGE_AWARENESS: {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      }
      case MESSAGE_QUERY_AWARENESS: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            room.awareness,
            Array.from(room.awareness.getStates().keys()),
          ),
        );
        send(room, conn, encoding.toUint8Array(encoder));
        break;
      }
      default:
        // Unknown frame (incl. MESSAGE_AUTH, which v0 does not implement) —
        // ignore rather than kill the conn; the client protocol tolerates it.
        break;
    }
  } catch (err) {
    // A malformed frame must never crash the room (chaos invariant).
    console.error(`[sync-server] yjs message error in room '${room.name}':`, err);
  }
}

/**
 * Attach a freshly-upgraded WebSocket to a Yjs room.
 *
 * Called by the HTTP upgrade handler in `src/index.ts` for every path that
 * is not the legacy `/sync` JSON endpoint — the path (minus the leading
 * slash) IS the room name, matching `WebsocketProvider`'s
 * `${serverUrl}/${roomname}` URL contract.
 */
export function setupYjsConnection(conn: WebSocket, roomName: string): void {
  const span = tracer.startSpan('pryzm.sync.yjs.connection', {
    attributes: { 'pryzm.yjs.room': roomName },
  });
  try {
    conn.binaryType = 'arraybuffer';
    const room = getOrCreateRoom(roomName);
    room.conns.set(conn, new Set());

    conn.on('message', (data: RawData) => {
      const bytes = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data as Buffer);
      handleMessage(room, conn, bytes);
    });

    // Keepalive: terminate conns that miss a ping round-trip.
    let pongReceived = true;
    const pingInterval = setInterval(() => {
      if (!pongReceived) {
        closeConn(room, conn);
        clearInterval(pingInterval);
        return;
      }
      if (!room.conns.has(conn)) {
        clearInterval(pingInterval);
        return;
      }
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(room, conn);
        clearInterval(pingInterval);
      }
    }, PING_TIMEOUT_MS);
    conn.on('pong', () => { pongReceived = true; });
    conn.on('close', () => {
      closeConn(room, conn);
      clearInterval(pingInterval);
    });
    conn.on('error', () => {
      closeConn(room, conn);
      clearInterval(pingInterval);
    });

    // ── Sync step 1: ask the client for what the server is missing.  The
    //    client replies step 2 AND sends its own step 1, to which
    //    readSyncMessage above replies with the server's step 2 — after
    //    which both ends converge and live updates flow both ways.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, room.doc);
    send(room, conn, encoding.toUint8Array(syncEncoder));

    // ── Current presence roster, so a late joiner sees who is here.
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
      );
      send(room, conn, encoding.toUint8Array(awarenessEncoder));
    }
  } finally {
    span.end();
  }
}

/** Room/connection counts for the `/health` endpoint. */
export function yjsRoomStats(): { rooms: number; connections: number } {
  let connections = 0;
  for (const room of rooms.values()) connections += room.conns.size;
  return { rooms: rooms.size, connections };
}
