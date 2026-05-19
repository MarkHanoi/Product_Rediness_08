// End-to-end two-client WebSocket roundtrip — replaces the spec's
// Playwright two-tab demo (S22 exit criterion #1, line 1072).
//
// Spins up the real `createSyncServer` on an ephemeral port, opens two
// `ws` clients, has client A append an event, asserts client B receives
// it via `event.push`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ulid } from 'ulid';
import { createSyncServer, type SyncServerInstance } from '../src/index.js';

interface Buffered {
  readonly ws: WebSocket;
  /** All messages received so far, in arrival order. */
  readonly messages: unknown[];
  /** Wait until a message matching `pred` arrives.  Resolves with the
   *  matched message; rejects after `timeoutMs`. */
  waitFor(pred: (m: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
  close(): Promise<void>;
}

function bufferedClient(port: number, clientId: string): Promise<Buffered> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sync?clientId=${clientId}&userId=u-${clientId}`);
  const messages: unknown[] = [];
  const watchers: Array<{ pred: (m: unknown) => boolean; resolve: (m: unknown) => void; reject: (e: Error) => void; t: NodeJS.Timeout }> = [];

  ws.on('message', (data: Buffer | string) => {
    const m = JSON.parse(typeof data === 'string' ? data : data.toString('utf-8'));
    messages.push(m);
    for (let i = watchers.length - 1; i >= 0; i--) {
      const w = watchers[i]!;
      if (w.pred(m)) {
        clearTimeout(w.t);
        w.resolve(m);
        watchers.splice(i, 1);
      }
    }
  });
  ws.on('error', () => {/* tests check error state via close */});

  return new Promise((resolve, reject) => {
    ws.once('open', () => {
      resolve({
        ws,
        messages,
        waitFor(pred, timeoutMs = 2000) {
          // First, scan existing buffer.
          const hit = messages.find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise<unknown>((res, rej) => {
            const t = setTimeout(() => {
              const idx = watchers.findIndex((w) => w.t === t);
              if (idx >= 0) watchers.splice(idx, 1);
              rej(new Error(`waitFor timed out after ${timeoutMs}ms (got ${messages.length} msgs)`));
            }, timeoutMs);
            watchers.push({ pred, resolve: res, reject: rej, t });
          });
        },
        async close() {
          await new Promise<void>((r) => {
            if (ws.readyState === WebSocket.CLOSED) return r();
            ws.once('close', () => r());
            ws.close();
          });
        },
      });
    });
    ws.once('error', reject);
  });
}

function send(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg));
}

const isType = (t: string) => (m: unknown): boolean =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === t;

describe('Two-client WebSocket roundtrip', () => {
  let server: SyncServerInstance;
  let port: number;

  beforeEach(async () => {
    server = await createSyncServer({});
    port = await server.listen(0); // ephemeral
  });

  afterEach(async () => {
    await server.shutdown('test-cleanup');
  });

  it('client A append → client B receives via event.push', async () => {
    const a = await bufferedClient(port, 'A');
    const b = await bufferedClient(port, 'B');
    await a.waitFor(isType('session.opened'));
    await b.waitFor(isType('session.opened'));

    send(a.ws, { type: 'project.subscribe', projectId: 'p1' });
    send(b.ws, { type: 'project.subscribe', projectId: 'p1' });
    await a.waitFor(isType('project.subscribed'));
    await b.waitFor(isType('project.subscribed'));

    const eid = ulid();
    send(a.ws, {
      type: 'event.append',
      payload: {
        projectId: 'p1',
        clientId: 'A',
        event: { id: eid, type: 'wall.create', actorId: 'u-A', payload: { color: 'red' } },
      },
    });

    const ack = await a.waitFor(isType('event.ack')) as { id: string; sequenceNumber: number };
    const push = await b.waitFor(isType('event.push')) as { event: { id: string; sequenceNumber: number } };

    expect(ack.id).toBe(eid);
    expect(ack.sequenceNumber).toBe(1);
    expect(push.event.id).toBe(eid);
    expect(push.event.sequenceNumber).toBe(1);

    // A is also subscribed → A also gets a push for its own event.
    const ownPush = await a.waitFor(isType('event.push')) as { event: { id: string } };
    expect(ownPush.event.id).toBe(eid);

    await a.close();
    await b.close();
  });

  it('round-trip latency is sub-second on localhost (smoke)', async () => {
    const a = await bufferedClient(port, 'A');
    const b = await bufferedClient(port, 'B');
    await a.waitFor(isType('session.opened'));
    await b.waitFor(isType('session.opened'));
    send(a.ws, { type: 'project.subscribe', projectId: 'p2' });
    send(b.ws, { type: 'project.subscribe', projectId: 'p2' });
    await a.waitFor(isType('project.subscribed'));
    await b.waitFor(isType('project.subscribed'));

    const N = 10;
    const observations: number[] = [];
    for (let i = 0; i < N; i++) {
      const eid = ulid();
      const start = performance.now();
      const pushP = b.waitFor((m) => isType('event.push')(m) && (m as { event: { id: string } }).event.id === eid);
      send(a.ws, {
        type: 'event.append',
        payload: {
          projectId: 'p2',
          clientId: 'A',
          event: { id: eid, type: 'wall.create', actorId: 'u', payload: {} },
        },
      });
      await pushP;
      observations.push(performance.now() - start);
    }
    observations.sort((x, y) => x - y);
    const p50 = observations[Math.floor(N * 0.5)] ?? 0;
    // Spec exit criterion #4: < 250 ms p95 on localhost.  We assert a
    // looser smoke bound here; the strict p95 gate lives in
    // apps/bench/src/benches/sync-roundtrip.bench.ts.
    expect(p50).toBeLessThan(250);

    await a.close();
    await b.close();
  });

  it('reconnect catches up via fromSeq', async () => {
    // Seed 4 events directly via the in-memory log so we can isolate
    // the catch-up path.
    for (let i = 1; i <= 4; i++) {
      await server.log.append('reconnectP', {
        id: `e${i}`, type: 'wall.create', actorId: 'u', payload: { i },
      });
    }
    const c = await bufferedClient(port, 'reconnector');
    await c.waitFor(isType('session.opened'));
    send(c.ws, { type: 'project.subscribe', projectId: 'reconnectP', fromSeq: 1 });

    const ack = await c.waitFor(isType('project.subscribed')) as { latestSeq: number };
    const page = await c.waitFor(isType('events.page')) as { events: Array<{ sequenceNumber: number }> };
    expect(ack.latestSeq).toBe(4);
    expect(page.events.map((e) => e.sequenceNumber)).toEqual([2, 3, 4]);

    await c.close();
  });

  it('/health endpoint reports session and log state', async () => {
    const c = await bufferedClient(port, 'health-A');
    await c.waitFor(isType('session.opened'));
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json() as {
      status: string;
      sessions: { sessions: number };
      log: { selection: string };
      bake: { selection: string };
    };
    expect(body.status).toBe('ok');
    expect(body.sessions.sessions).toBeGreaterThanOrEqual(1);
    expect(body.log.selection).toBe('memory');
    expect(body.bake.selection).toBe('noop');
    await c.close();
  });
});
