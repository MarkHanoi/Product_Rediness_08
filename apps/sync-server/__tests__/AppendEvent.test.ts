// Spec source: PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md S22 lines
// 905-966 — AppendEvent pipeline.

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleAppendEvent } from '../src/handlers/AppendEvent.js';
import { InMemoryEventLog } from '../src/eventLog/InMemoryEventLog.js';
import { NoopBakeEnqueuer } from '../src/bake/NoopBakeEnqueuer.js';
import { InProcessBakeEnqueuer } from '../src/bake/InProcessBakeEnqueuer.js';
import { MemoryAuthz } from '../src/authz/index.js';
import type {
  EventAppendMessage,
  LinearisedEvent,
  ServerMessage,
} from '../src/protocol/messages.js';
import type { WebSocket } from 'ws';

const ALLOW_ALL = new MemoryAuthz({ allowByDefault: true });
const ACTOR = { id: 'u1' };

/** Mock WebSocket — collects sent messages for assertions. */
class MockWS extends EventEmitter {
  readonly sent: ServerMessage[] = [];
  readyState = 1; // OPEN
  static readonly OPEN = 1;
  readonly OPEN = 1;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
  }
}

const appendMsg = (
  projectId: string,
  id: string,
  type = 'wall.create',
  payload: unknown = { foo: 1 },
): EventAppendMessage => ({
  type: 'event.append',
  payload: { projectId, clientId: 'c1', event: { id, type, actorId: 'u1', payload } },
});

describe('handleAppendEvent', () => {
  it('appends, broadcasts, enqueues, and acks in that order', async () => {
    const log = new InMemoryEventLog();
    const bake = new NoopBakeEnqueuer();
    const broadcast = vi.fn<(pid: string, ev: LinearisedEvent) => void>();
    const ws = new MockWS();

    await handleAppendEvent(ws as unknown as WebSocket, appendMsg('p1', 'e1'), {
      log,
      bake,
      broadcast,
      authz: ALLOW_ALL,
      actor: ACTOR,
    });

    expect(log.snapshot('p1')).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls[0]![0]).toBe('p1');
    expect(broadcast.mock.calls[0]![1].sequenceNumber).toBe(1);
    // Microtask drain so the queueMicrotask in InProcessBakeEnqueuer.* fires.
    await Promise.resolve();
    expect(bake.stats().enqueued).toBe(1);
    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0]).toEqual({ type: 'event.ack', id: 'e1', sequenceNumber: 1 });
  });

  it('uses payload.levelId when present', async () => {
    const log = new InMemoryEventLog();
    const bake = new InProcessBakeEnqueuer((req) => {
      received = req.levelId;
    });
    let received: string | null = null;
    const ws = new MockWS();
    await handleAppendEvent(
      ws as unknown as WebSocket,
      appendMsg('p1', 'e1', 'wall.create', { levelId: 'L7', x: 1 }),
      { log, bake, broadcast: () => undefined, authz: ALLOW_ALL, actor: ACTOR },
    );
    await new Promise((r) => setImmediate(r));
    expect(received).toBe('L7');
  });

  it('falls back to __root__ when no levelId in payload', async () => {
    const log = new InMemoryEventLog();
    let received: string | null = null;
    const bake = new InProcessBakeEnqueuer((req) => {
      received = req.levelId;
    });
    const ws = new MockWS();
    await handleAppendEvent(
      ws as unknown as WebSocket,
      appendMsg('p1', 'e1', 'cde.linkDocument', { entityId: 'wall_x', documentUri: 'https://x' }),
      { log, bake, broadcast: () => undefined, authz: ALLOW_ALL, actor: ACTOR },
    );
    await new Promise((r) => setImmediate(r));
    expect(received).toBe('__root__');
  });

  it('runs the CDE validator and rejects invalid payloads', async () => {
    const log = new InMemoryEventLog();
    const bake = new NoopBakeEnqueuer();
    const broadcast = vi.fn();
    const ws = new MockWS();
    await handleAppendEvent(
      ws as unknown as WebSocket,
      appendMsg('p1', 'e1', 'cde.linkDocument', { /* missing entityId */ }),
      { log, bake, broadcast, authz: ALLOW_ALL, actor: ACTOR },
    );
    expect(broadcast).not.toHaveBeenCalled();
    expect(log.snapshot('p1')).toHaveLength(0);
    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0]).toMatchObject({
      type: 'error',
      code: 'cde.validation',
      correlationId: 'e1',
    });
  });

  it('preserves monotonic sequence under concurrent appends', async () => {
    const log = new InMemoryEventLog();
    const bake = new NoopBakeEnqueuer();
    const seqs: number[] = [];
    const broadcast = (_pid: string, ev: LinearisedEvent) => seqs.push(ev.sequenceNumber);
    const ws = new MockWS();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        handleAppendEvent(ws as unknown as WebSocket, appendMsg('p1', `e${i}`), {
          log,
          bake,
          broadcast,
          authz: ALLOW_ALL,
          actor: ACTOR,
        }),
      ),
    );
    expect([...seqs].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('a misbehaving bake enqueuer never crashes the handler', async () => {
    const log = new InMemoryEventLog();
    const bake = new InProcessBakeEnqueuer(() => {
      throw new Error('boom');
    });
    const ws = new MockWS();
    await handleAppendEvent(ws as unknown as WebSocket, appendMsg('p1', 'e1'), {
      log,
      bake,
      broadcast: () => undefined,
      authz: ALLOW_ALL,
      actor: ACTOR,
    });
    // Drain the microtask + the .catch chain.
    await new Promise((r) => setImmediate(r));
    expect(ws.sent[0]?.type).toBe('event.ack'); // ack still sent
    expect(bake.stats().failed).toBe(1);
  });
});
