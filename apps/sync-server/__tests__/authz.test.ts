// apps/sync-server/__tests__/authz.test.ts — W-03 / ADR-0040.
//
// Unit + integration coverage for the authz boundary:
//   1. MemoryAuthz policy — allow-by-default, deny-by-default,
//      deny-anonymous, explicit member sets.
//   2. createAuthz factory — env-driven mode selection + injection.
//   3. Handler integration — handleAppendEvent, handleLoadEvents,
//      and HTTP locks routes return `error.forbidden` / 403 when the
//      gate denies.
//   4. SessionManager.handleSubscribe — denies + sends `error.forbidden`.

import { describe, expect, it } from 'vitest';
import express from 'express';
import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { WebSocket } from 'ws';

import {
  ANONYMOUS_USER_ID,
  MemoryAuthz,
  createAuthz,
} from '../src/authz/index.js';
import { handleAppendEvent } from '../src/handlers/AppendEvent.js';
import { handleLoadEvents } from '../src/handlers/LoadEvents.js';
import { mountLocksHandlers } from '../src/locks/handlers.js';
import { InMemoryEventLog } from '../src/eventLog/InMemoryEventLog.js';
import { NoopBakeEnqueuer } from '../src/bake/NoopBakeEnqueuer.js';
import { InMemorySoftLockStore } from '../src/locks/InMemorySoftLockStore.js';
import { SessionManager } from '../src/session/SessionManager.js';
import type { ServerMessage, EventAppendMessage, EventsLoadMessage } from '../src/protocol/messages.js';

class MockWS extends EventEmitter {
  readonly sent: ServerMessage[] = [];
  readyState = 1;
  static readonly OPEN = 1;
  readonly OPEN = 1;
  send(data: string): void { this.sent.push(JSON.parse(data) as ServerMessage); }
  close(): void { this.readyState = 3; }
}

const appendMsg = (projectId: string, id: string): EventAppendMessage => ({
  type: 'event.append',
  payload: { projectId, clientId: 'c1', event: { id, type: 'wall.create', actorId: 'u1', payload: {} } },
});

const loadMsg = (projectId: string, fromSeq = 0): EventsLoadMessage => ({
  type: 'events.load',
  payload: { projectId, fromSeq, cursor: 'cur-1' },
});

// ────────────────────────────────────────────────────────────────────────
// 1. MemoryAuthz policy
// ────────────────────────────────────────────────────────────────────────
describe('MemoryAuthz', () => {
  it('allow-by-default returns true for any actor on an unknown project', async () => {
    const az = new MemoryAuthz({ allowByDefault: true });
    expect(await az.can('projectRead', { actor: { id: 'alice' }, projectId: 'p-unknown' })).toBe(true);
    expect(await az.can('projectEdit', { actor: { id: 'bob' }, projectId: 'p-unknown' })).toBe(true);
    expect(await az.can('lockAcquire', { actor: { id: 'carol' }, projectId: 'p-unknown' })).toBe(true);
  });

  it('deny-by-default returns false on every action when no membership exists', async () => {
    const az = new MemoryAuthz({ allowByDefault: false });
    expect(await az.can('projectRead', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(await az.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(await az.can('lockAcquire', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
  });

  it('explicit membership: members allowed, non-members denied', async () => {
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    az.addMember('p1', 'bob');
    expect(await az.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(true);
    expect(await az.can('projectEdit', { actor: { id: 'bob' }, projectId: 'p1' })).toBe(true);
    expect(await az.can('projectEdit', { actor: { id: 'eve' }, projectId: 'p1' })).toBe(false);
  });

  it('removeMember revokes the prior decision', async () => {
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    expect(await az.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(true);
    az.removeMember('p1', 'alice');
    expect(await az.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
  });

  it('denyAnonymous=true rejects the magic anonymous actor even with allow-by-default', async () => {
    const az = new MemoryAuthz({ allowByDefault: true, denyAnonymous: true });
    expect(await az.can('projectRead', { actor: { id: ANONYMOUS_USER_ID }, projectId: 'p1' })).toBe(false);
    expect(await az.can('projectRead', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(true);
  });

  it('onDecision sink is called for every can() invocation', async () => {
    const events: string[] = [];
    const az = new MemoryAuthz({
      allowByDefault: false,
      onDecision: (d) => events.push(`${d.action}/${d.actorId}/${d.allowed}/${d.reason}`),
    });
    az.addMember('p1', 'alice');
    await az.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' });
    await az.can('projectEdit', { actor: { id: 'eve' }, projectId: 'p1' });
    await az.can('projectRead', { actor: { id: 'eve' }, projectId: 'p2' });
    expect(events).toEqual([
      'projectEdit/alice/true/member',
      'projectEdit/eve/false/not-a-member',
      'projectRead/eve/false/no-membership-table-deny',
    ]);
  });

  it('stats reflects member adds + clear', () => {
    const az = new MemoryAuthz();
    az.addMember('p1', 'a'); az.addMember('p1', 'b'); az.addMember('p2', 'c');
    expect(az.stats()).toEqual({ projects: 2, totalMembers: 3 });
    az.clear();
    expect(az.stats()).toEqual({ projects: 0, totalMembers: 0 });
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2. createAuthz factory
// ────────────────────────────────────────────────────────────────────────
describe('createAuthz', () => {
  it('defaults to memory-allow-by-default when env unset', () => {
    const r = createAuthz({ env: {} });
    expect(r.selection).toBe('memory-allow-by-default');
    expect(r.reason).toMatch(/unset/);
  });

  it('honours PRYZM_AUTHZ_MODE=memory-deny', async () => {
    const r = createAuthz({ env: { PRYZM_AUTHZ_MODE: 'memory-deny' } });
    expect(r.selection).toBe('memory-deny');
    expect(await r.authz.can('projectEdit', { actor: { id: 'u' }, projectId: 'p' })).toBe(false);
  });

  it('honours PRYZM_AUTHZ_MODE=memory-deny-anonymous', async () => {
    const r = createAuthz({ env: { PRYZM_AUTHZ_MODE: 'memory-deny-anonymous' } });
    expect(r.selection).toBe('memory-deny-anonymous');
    expect(await r.authz.can('projectEdit', { actor: { id: ANONYMOUS_USER_ID }, projectId: 'p' })).toBe(false);
    expect(await r.authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p' })).toBe(true);
  });

  it('opts.authz takes precedence over env', () => {
    const injected = new MemoryAuthz();
    const r = createAuthz({ env: { PRYZM_AUTHZ_MODE: 'memory-deny' }, authz: injected });
    expect(r.selection).toBe('injected');
    expect(r.authz).toBe(injected);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 3. Handler integration — negative paths
// ────────────────────────────────────────────────────────────────────────
describe('handleAppendEvent — authz gate', () => {
  it('rejects with error.forbidden when actor is not a member', async () => {
    const log = new InMemoryEventLog();
    const bake = new NoopBakeEnqueuer();
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const ws = new MockWS();
    let broadcast = 0;
    await handleAppendEvent(ws as unknown as WebSocket, appendMsg('p1', 'e1'), {
      log, bake, broadcast: () => { broadcast++; }, authz: az, actor: { id: 'eve' },
    });
    expect(log.snapshot('p1')).toHaveLength(0);
    expect(broadcast).toBe(0);
    expect(ws.sent[0]).toMatchObject({ type: 'error', code: 'authz.forbidden', correlationId: 'e1' });
  });

  it('allows member actor through to the persist+broadcast pipeline', async () => {
    const log = new InMemoryEventLog();
    const bake = new NoopBakeEnqueuer();
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const ws = new MockWS();
    await handleAppendEvent(ws as unknown as WebSocket, appendMsg('p1', 'e1'), {
      log, bake, broadcast: () => undefined, authz: az, actor: { id: 'alice' },
    });
    expect(log.snapshot('p1')).toHaveLength(1);
    expect(ws.sent[0]).toMatchObject({ type: 'event.ack', id: 'e1' });
  });
});

describe('handleLoadEvents — authz gate', () => {
  it('rejects with error.forbidden when actor is not a member', async () => {
    const log = new InMemoryEventLog();
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const ws = new MockWS();
    await handleLoadEvents(ws as unknown as WebSocket, loadMsg('p1', 0), {
      log, authz: az, actor: { id: 'eve' },
    });
    expect(ws.sent[0]).toMatchObject({ type: 'error', code: 'authz.forbidden', correlationId: 'cur-1' });
  });
});

describe('SessionManager.handleSubscribe — authz gate', () => {
  it('denies project.subscribe and sends error.forbidden', async () => {
    const log = new InMemoryEventLog();
    const bake = new NoopBakeEnqueuer();
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const sm = new SessionManager({ log, bake, authz: az });
    const ws = new MockWS();
    sm.register(ws as unknown as WebSocket, 'c1', 'eve');
    ws.emit('message', JSON.stringify({ type: 'project.subscribe', projectId: 'p1' }));
    await new Promise(r => setImmediate(r));
    expect(ws.sent[0]).toMatchObject({ type: 'error', code: 'authz.forbidden' });
    // Subsequent subscribe by an authorised actor should succeed.
    const ws2 = new MockWS();
    sm.register(ws2 as unknown as WebSocket, 'c2', 'alice');
    ws2.emit('message', JSON.stringify({ type: 'project.subscribe', projectId: 'p1' }));
    await new Promise(r => setImmediate(r));
    expect(ws2.sent[0]).toMatchObject({ type: 'project.subscribed', projectId: 'p1' });
  });
});

// ────────────────────────────────────────────────────────────────────────
// 4. HTTP locks routes — 403 on forbidden
// ────────────────────────────────────────────────────────────────────────
async function startServer(authz: MemoryAuthz): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express(); app.use(express.json());
  const store = new InMemorySoftLockStore();
  mountLocksHandlers(app, { store, authz });
  const httpServer: Server = createServer(app);
  await new Promise<void>(r => httpServer.listen(0, r));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => httpServer.close(() => r())),
  };
}

describe('mountLocksHandlers — authz gate', () => {
  it('POST /api/locks/:id → 403 when actor is not a member', async () => {
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const srv = await startServer(az);
    try {
      const res = await fetch(`${srv.baseUrl}/api/locks/wall_1?projectId=p1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'eve' },
        body: JSON.stringify({ ttlMs: 30_000 }),
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe('forbidden');
    } finally { await srv.close(); }
  });

  it('GET /api/locks → 403 when actor is not a member', async () => {
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const srv = await startServer(az);
    try {
      const res = await fetch(`${srv.baseUrl}/api/locks?projectId=p1`, { headers: { 'x-user-id': 'eve' } });
      expect(res.status).toBe(403);
    } finally { await srv.close(); }
  });

  it('POST /api/locks/:id → 200 when actor is a member', async () => {
    const az = new MemoryAuthz({ allowByDefault: false });
    az.addMember('p1', 'alice');
    const srv = await startServer(az);
    try {
      const res = await fetch(`${srv.baseUrl}/api/locks/wall_1?projectId=p1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'alice' },
        body: JSON.stringify({ ttlMs: 30_000 }),
      });
      expect(res.status).toBe(200);
    } finally { await srv.close(); }
  });
});
