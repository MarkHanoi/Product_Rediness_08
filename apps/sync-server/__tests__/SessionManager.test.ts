// Spec source: PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md S22 lines
// 980-1037 — SessionManager wires WS handlers + broadcasts.

import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { InMemoryEventLog } from '../src/eventLog/InMemoryEventLog.js';
import { NoopBakeEnqueuer } from '../src/bake/NoopBakeEnqueuer.js';
import { SessionManager } from '../src/session/SessionManager.js';
import { MemoryAuthz } from '../src/authz/index.js';
import type { ServerMessage, LinearisedEvent } from '../src/protocol/messages.js';
import type { WebSocket } from 'ws';

class MockWS extends EventEmitter {
  readonly sent: ServerMessage[] = [];
  readyState = 1;
  static readonly OPEN = 1;
  readonly OPEN = 1;
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
  emitMessage(payload: unknown): void {
    this.emit('message', JSON.stringify(payload));
  }
}

const setup = () => {
  const log = new InMemoryEventLog();
  const bake = new NoopBakeEnqueuer();
  const sm = new SessionManager({ log, bake, authz: new MemoryAuthz({ allowByDefault: true }) });
  return { log, bake, sm };
};

describe('SessionManager — registration + broadcast', () => {
  it('two registered clients show up in stats', async () => {
    const { sm } = setup();
    const w1 = new MockWS();
    const w2 = new MockWS();
    sm.register(w1 as unknown as WebSocket, 'c1', 'u1');
    sm.register(w2 as unknown as WebSocket, 'c2', 'u2');
    expect(sm.stats().sessions).toBe(2);
  });

  it('close event removes the session from the map', async () => {
    const { sm } = setup();
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u1');
    expect(sm.stats().sessions).toBe(1);
    w.emit('close');
    expect(sm.stats().sessions).toBe(0);
  });

  it('subscribes a client and acks with the current latestSeq', async () => {
    const { sm, log } = setup();
    await log.append('p1', { id: 'e1', type: 'wall.create', actorId: 'u1', payload: {} });
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u1');
    w.emitMessage({ type: 'project.subscribe', projectId: 'p1' });
    await new Promise((r) => setImmediate(r));
    expect(w.sent).toEqual([{ type: 'project.subscribed', projectId: 'p1', latestSeq: 1 }]);
    expect(sm.stats().subscribed).toBe(1);
    expect(sm.stats().projectSubscriberCounts).toEqual({ p1: 1 });
  });

  it('broadcast reaches subscribers of the same project only', async () => {
    const { sm } = setup();
    const a = new MockWS();
    const b = new MockWS();
    const c = new MockWS();
    sm.register(a as unknown as WebSocket, 'a', 'u');
    sm.register(b as unknown as WebSocket, 'b', 'u');
    sm.register(c as unknown as WebSocket, 'c', 'u');
    a.emitMessage({ type: 'project.subscribe', projectId: 'p1' });
    b.emitMessage({ type: 'project.subscribe', projectId: 'p1' });
    c.emitMessage({ type: 'project.subscribe', projectId: 'p2' });
    await new Promise((r) => setImmediate(r));

    const ev: LinearisedEvent = {
      id: 'e1',
      type: 'wall.create',
      actorId: 'u',
      payload: {},
      projectId: 'p1',
      sequenceNumber: 1,
      persistedAt: new Date().toISOString(),
    };
    sm.broadcast('p1', ev);
    await new Promise((r) => setImmediate(r));

    const pushes = (ws: MockWS) => ws.sent.filter((m) => m.type === 'event.push');
    expect(pushes(a)).toHaveLength(1);
    expect(pushes(b)).toHaveLength(1);
    expect(pushes(c)).toHaveLength(0);
    expect(sm.stats().broadcasts).toBe(1);
    expect(sm.stats().broadcastTargets).toBe(2);
  });

  it('broadcast skips closed sockets', async () => {
    const { sm } = setup();
    const a = new MockWS();
    sm.register(a as unknown as WebSocket, 'a', 'u');
    a.emitMessage({ type: 'project.subscribe', projectId: 'p1' });
    await new Promise((r) => setImmediate(r));
    a.readyState = 3; // CLOSED
    sm.broadcast('p1', {
      id: 'x', type: 'wall.create', actorId: 'u', payload: {},
      projectId: 'p1', sequenceNumber: 1, persistedAt: new Date().toISOString(),
    });
    await new Promise((r) => setImmediate(r));
    expect(a.sent.filter((m) => m.type === 'event.push')).toHaveLength(0);
  });

  it('event.append flows through SessionManager → log → broadcast → ack', async () => {
    const { sm, log } = setup();
    const a = new MockWS();
    const b = new MockWS();
    sm.register(a as unknown as WebSocket, 'a', 'u');
    sm.register(b as unknown as WebSocket, 'b', 'u');
    a.emitMessage({ type: 'project.subscribe', projectId: 'p1' });
    b.emitMessage({ type: 'project.subscribe', projectId: 'p1' });
    await new Promise((r) => setImmediate(r));

    a.emitMessage({
      type: 'event.append',
      payload: {
        projectId: 'p1',
        clientId: 'a',
        event: { id: 'e1', type: 'wall.create', actorId: 'u', payload: { x: 1 } },
      },
    });
    await new Promise((r) => setImmediate(r));

    expect(log.snapshot('p1')).toHaveLength(1);
    expect(a.sent.find((m) => m.type === 'event.ack')).toBeTruthy();
    expect(b.sent.find((m) => m.type === 'event.push')).toBeTruthy();
  });

  it('events.load returns the requested page', async () => {
    const { sm, log } = setup();
    for (let i = 1; i <= 7; i++) {
      await log.append('p1', { id: `e${i}`, type: 'wall.create', actorId: 'u', payload: {} });
    }
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u');
    w.emitMessage({ type: 'events.load', payload: { projectId: 'p1', fromSeq: 2, limit: 3, cursor: 'cur1' } });
    await new Promise((r) => setImmediate(r));
    const page = w.sent.find((m) => m.type === 'events.page');
    expect(page).toMatchObject({
      type: 'events.page',
      projectId: 'p1',
      fromSeq: 2,
      nextSeq: 5,
      done: false,
      cursor: 'cur1',
    });
  });

  it('events.load caps requested limit at 500', async () => {
    const { sm, log } = setup();
    for (let i = 1; i <= 600; i++) {
      await log.append('p1', { id: `e${i}`, type: 'wall.create', actorId: 'u', payload: {} });
    }
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u');
    w.emitMessage({ type: 'events.load', payload: { projectId: 'p1', fromSeq: 0, limit: 10000 } });
    await new Promise((r) => setImmediate(r));
    const page = w.sent.find((m) => m.type === 'events.page');
    expect(page?.type).toBe('events.page');
    if (page?.type === 'events.page') {
      expect(page.events).toHaveLength(500);
      expect(page.done).toBe(false);
    }
  });

  it('malformed messages produce an error response, no crash', async () => {
    const { sm } = setup();
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u');
    w.emit('message', 'not json at all');
    await new Promise((r) => setImmediate(r));
    expect(w.sent[0]).toMatchObject({ type: 'error', code: 'protocol.malformed' });
  });
});
