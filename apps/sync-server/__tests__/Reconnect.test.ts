// Spec source: PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md S22 D6 (line 1060)
// + exit criterion #6 (line 1077) — close tab → reopen → events from
// `lastSeq + 1` loaded.

import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { InMemoryEventLog } from '../src/eventLog/InMemoryEventLog.js';
import { NoopBakeEnqueuer } from '../src/bake/NoopBakeEnqueuer.js';
import { SessionManager } from '../src/session/SessionManager.js';
import { MemoryAuthz } from '../src/authz/index.js';
import type { ServerMessage } from '../src/protocol/messages.js';
import type { WebSocket } from 'ws';

class MockWS extends EventEmitter {
  readonly sent: ServerMessage[] = [];
  readyState = 1;
  static readonly OPEN = 1;
  readonly OPEN = 1;
  send(d: string): void {
    this.sent.push(JSON.parse(d));
  }
  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
  emitMessage(p: unknown): void {
    this.emit('message', JSON.stringify(p));
  }
}

describe('Reconnect + re-subscribe', () => {
  it('replays missed events from fromSeq immediately after subscribe', async () => {
    const log = new InMemoryEventLog();
    const sm = new SessionManager({ log, bake: new NoopBakeEnqueuer(), authz: new MemoryAuthz({ allowByDefault: true }) });

    // Seed 5 events in the log before any client connects.
    for (let i = 1; i <= 5; i++) {
      await log.append('p1', {
        id: `e${i}`, type: 'wall.create', actorId: 'u', payload: { i },
      });
    }

    // Reconnect: client says "I have up to seq=2, give me 3..5".
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u');
    w.emitMessage({ type: 'project.subscribe', projectId: 'p1', fromSeq: 2 });
    await new Promise((r) => setImmediate(r));

    expect(w.sent[0]).toEqual({
      type: 'project.subscribed', projectId: 'p1', latestSeq: 5,
    });
    expect(w.sent[1]?.type).toBe('events.page');
    if (w.sent[1]?.type === 'events.page') {
      expect(w.sent[1].events.map((e) => e.sequenceNumber)).toEqual([3, 4, 5]);
      expect(w.sent[1].fromSeq).toBe(2);
      expect(w.sent[1].done).toBe(true);
    }
  });

  it('does NOT replay when fromSeq matches latestSeq', async () => {
    const log = new InMemoryEventLog();
    const sm = new SessionManager({ log, bake: new NoopBakeEnqueuer(), authz: new MemoryAuthz({ allowByDefault: true }) });
    for (let i = 1; i <= 3; i++) {
      await log.append('p1', { id: `e${i}`, type: 'wall.create', actorId: 'u', payload: {} });
    }
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u');
    w.emitMessage({ type: 'project.subscribe', projectId: 'p1', fromSeq: 3 });
    await new Promise((r) => setImmediate(r));
    expect(w.sent.find((m) => m.type === 'events.page')).toBeUndefined();
    expect(w.sent[0]).toEqual({ type: 'project.subscribed', projectId: 'p1', latestSeq: 3 });
  });

  it('after replay, subsequent broadcasts deliver only NEW events', async () => {
    const log = new InMemoryEventLog();
    const sm = new SessionManager({ log, bake: new NoopBakeEnqueuer(), authz: new MemoryAuthz({ allowByDefault: true }) });
    for (let i = 1; i <= 3; i++) {
      await log.append('p1', { id: `e${i}`, type: 'wall.create', actorId: 'u', payload: {} });
    }
    const w = new MockWS();
    sm.register(w as unknown as WebSocket, 'c1', 'u');
    w.emitMessage({ type: 'project.subscribe', projectId: 'p1', fromSeq: 1 });
    await new Promise((r) => setImmediate(r));

    // After replay, append a new event and broadcast — should arrive once.
    const fourth = await log.append('p1', {
      id: 'e4', type: 'wall.create', actorId: 'u', payload: {},
    });
    sm.broadcast('p1', {
      id: 'e4', type: 'wall.create', actorId: 'u', payload: {},
      projectId: 'p1',
      sequenceNumber: fourth.sequenceNumber,
      persistedAt: fourth.persistedAt,
    });
    await new Promise((r) => setImmediate(r));

    const pushes = w.sent.filter((m) => m.type === 'event.push');
    expect(pushes).toHaveLength(1);
    if (pushes[0]?.type === 'event.push') {
      expect(pushes[0].event.sequenceNumber).toBe(4);
    }
  });
});
