// Soft-lock store + handlers + sweeper — unit suite (S45).
//
// Covers the in-memory implementation end-to-end (the same contract is
// asserted against PgSoftLockStore in S45 D9 demo + the bench harness;
// both implementations satisfy the same SoftLockStore interface).

import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import { InMemorySoftLockStore } from '../src/locks/InMemorySoftLockStore.js';
import { mountLocksHandlers } from '../src/locks/handlers.js';
import { Sweeper } from '../src/locks/Sweeper.js';
import { LeaseMismatchError, NoSuchLockError } from '../src/locks/types.js';
import { MemoryAuthz } from '../src/authz/index.js';

const ALLOW_ALL = new MemoryAuthz({ allowByDefault: true });

// ─── In-process HTTP test client ───────────────────────────────────────────

interface TestServer { app: Express; baseUrl: string; close(): Promise<void> }

async function startTestServer(mount: (app: Express) => void): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  mount(app);
  const httpServer: Server = createServer(app);
  await new Promise<void>(resolve => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => httpServer.close(() => resolve())),
  };
}

// ─── InMemorySoftLockStore ─────────────────────────────────────────────────

describe('InMemorySoftLockStore', () => {
  let now = 1_700_000_000_000;
  let store: InMemorySoftLockStore;
  beforeEach(() => {
    now = 1_700_000_000_000;
    store = new InMemorySoftLockStore({ now: () => now });
  });

  it('acquire grants a lease and lists it project-scoped', async () => {
    const r = await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 30_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.row.elementId).toBe('wall-1');
    expect(r.row.expiresAtMs).toBe(now + 30_000);
    const list = await store.list('P1');
    expect(list).toHaveLength(1);
    expect(await store.list('P2')).toHaveLength(0);
  });

  it('acquire by a second peer returns ok=false with the holder block', async () => {
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 30_000,
    });
    const r = await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-alice',
      holderDisplayName: 'Alice', leaseId: 'lease-2', ttlMs: 30_000,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected conflict');
    expect(r.holder.userId).toBe('u-bob');
    expect(r.holder.displayName).toBe('Bob');
  });

  it('acquire by the same peer is treated as a re-acquire (preserves acquired_at)', async () => {
    const a = await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 30_000,
    });
    if (!a.ok) throw new Error('expected ok');
    const acquiredAt = a.row.acquiredAtMs;
    now += 10_000;
    const b = await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-2', ttlMs: 30_000,
    });
    if (!b.ok) throw new Error('expected ok');
    expect(b.row.acquiredAtMs).toBe(acquiredAt);
    expect(b.row.expiresAtMs).toBe(now + 30_000);
  });

  it('extend pushes expires_at forward and validates the lease', async () => {
    const a = await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 30_000,
    });
    if (!a.ok) throw new Error('expected ok');
    now += 5_000;
    const ext = await store.extend({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      leaseId: 'lease-1', ttlMs: 60_000,
    });
    expect(ext.expiresAtMs).toBe(now + 60_000);
    await expect(store.extend({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      leaseId: 'wrong-lease', ttlMs: 60_000,
    })).rejects.toBeInstanceOf(LeaseMismatchError);
  });

  it('extend on a missing lock throws NoSuchLockError', async () => {
    await expect(store.extend({
      projectId: 'P1', elementId: 'never', holderId: 'u-bob',
      leaseId: 'l', ttlMs: 30_000,
    })).rejects.toBeInstanceOf(NoSuchLockError);
  });

  it('release deletes the row; idempotent on second release', async () => {
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 30_000,
    });
    expect(await store.release({ projectId: 'P1', elementId: 'wall-1', leaseId: 'lease-1' })).toBe(true);
    expect(await store.release({ projectId: 'P1', elementId: 'wall-1', leaseId: 'lease-1' })).toBe(false);
  });

  it('release rejects mismatched leases (LeaseMismatchError)', async () => {
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 30_000,
    });
    await expect(store.release({
      projectId: 'P1', elementId: 'wall-1', leaseId: 'wrong',
    })).rejects.toBeInstanceOf(LeaseMismatchError);
  });

  it('sweepExpired deletes rows past expires_at and returns them', async () => {
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 5_000,
    });
    await store.acquire({
      projectId: 'P1', elementId: 'wall-2', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-2', ttlMs: 60_000,
    });
    now += 6_000;
    const swept = await store.sweepExpired();
    expect(swept.map(r => r.elementId)).toEqual(['wall-1']);
    expect((await store.list('P1')).map(r => r.elementId)).toEqual(['wall-2']);
  });

  it('list filters expired rows even if sweeper hasn\'t run yet', async () => {
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u-bob',
      holderDisplayName: 'Bob', leaseId: 'lease-1', ttlMs: 5_000,
    });
    now += 10_000;
    expect(await store.list('P1')).toHaveLength(0);
  });

  it('releaseAllForProject clears every row in the project', async () => {
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u', holderDisplayName: 'U', leaseId: 'l1', ttlMs: 30_000,
    });
    await store.acquire({
      projectId: 'P1', elementId: 'wall-2', holderId: 'u', holderDisplayName: 'U', leaseId: 'l2', ttlMs: 30_000,
    });
    await store.acquire({
      projectId: 'P2', elementId: 'wall-1', holderId: 'u', holderDisplayName: 'U', leaseId: 'l3', ttlMs: 30_000,
    });
    expect(await store.releaseAllForProject('P1')).toBe(2);
    expect(await store.list('P1')).toHaveLength(0);
    expect(await store.list('P2')).toHaveLength(1);
  });
});

// ─── Sweeper ────────────────────────────────────────────────────────────────

describe('Sweeper', () => {
  it('sweepOnce delegates to the store and fires onLockReleased per row', async () => {
    let now = 1_700_000_000_000;
    const store = new InMemorySoftLockStore({ now: () => now });
    await store.acquire({
      projectId: 'P1', elementId: 'wall-1', holderId: 'u', holderDisplayName: 'U', leaseId: 'l', ttlMs: 1_000,
    });
    now += 5_000;
    const released: string[] = [];
    const sweeper = new Sweeper(store, { onLockReleased: r => released.push(r.elementId) });
    await sweeper.sweepOnce();
    expect(released).toEqual(['wall-1']);
    expect(sweeper.stats().rowsSwept).toBe(1);
  });

  it('survives store errors without throwing', async () => {
    const store = new InMemorySoftLockStore();
    // Force an error by replacing sweepExpired with a thrower.
    const broken: typeof store = Object.assign(Object.create(store), {
      sweepExpired: async () => { throw new Error('boom'); },
    });
    const sweeper = new Sweeper(broken, { logger: { warn: () => {} } });
    const out = await sweeper.sweepOnce();
    expect(out).toEqual([]);
    expect(sweeper.stats().cycles).toBe(1);
  });
});

// ─── HTTP handlers ─────────────────────────────────────────────────────────

describe('mountLocksHandlers (HTTP integration)', () => {
  it('POST /api/locks/:id → 200 then 409 on second peer', async () => {
    let leaseCounter = 0;
    const newLeaseId = () => `lease-${++leaseCounter}`;
    const store = new InMemorySoftLockStore();
    const srv = await startTestServer(app => mountLocksHandlers(app, { store, newLeaseId, authz: ALLOW_ALL }));
    try {
      const r1 = await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob', 'x-display-name': 'Bob' },
        body: JSON.stringify({ ttlMs: 30_000 }),
      });
      expect(r1.status).toBe(200);
      const body1 = await r1.json() as { elementId: string; leaseId: string };
      expect(body1.elementId).toBe('wall-1');
      expect(body1.leaseId).toBe('lease-1');

      const r2 = await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-alice', 'x-display-name': 'Alice' },
        body: JSON.stringify({ ttlMs: 30_000 }),
      });
      expect(r2.status).toBe(409);
      const body2 = await r2.json() as { holder: { displayName: string } };
      expect(body2.holder.displayName).toBe('Bob');
    } finally {
      await srv.close();
    }
  });

  it('POST /extend → 200 with new expiresAtMs', async () => {
    const store = new InMemorySoftLockStore();
    const srv = await startTestServer(app => mountLocksHandlers(app, { store, newLeaseId: () => 'L', authz: ALLOW_ALL }));
    try {
      await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob', 'x-display-name': 'Bob' },
        body: JSON.stringify({ ttlMs: 5_000 }),
      });
      const r = await fetch(`${srv.baseUrl}/api/locks/wall-1/extend?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob', 'x-display-name': 'Bob' },
        body: JSON.stringify({ leaseId: 'L', ttlMs: 60_000 }),
      });
      expect(r.status).toBe(200);
      const body = await r.json() as { elementId: string };
      expect(body.elementId).toBe('wall-1');
    } finally {
      await srv.close();
    }
  });

  it('DELETE /api/locks/:id → 204 on success, 404 on idempotent re-release', async () => {
    const store = new InMemorySoftLockStore();
    const srv = await startTestServer(app => mountLocksHandlers(app, { store, newLeaseId: () => 'L', authz: ALLOW_ALL }));
    try {
      await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob', 'x-display-name': 'Bob' },
        body: JSON.stringify({ ttlMs: 30_000 }),
      });
      const r1 = await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'DELETE',
        headers: { 'x-user-id': 'u-bob', 'x-display-name': 'Bob', 'x-lease-id': 'L' },
      });
      expect(r1.status).toBe(204);
      const r2 = await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'DELETE',
        headers: { 'x-user-id': 'u-bob', 'x-display-name': 'Bob', 'x-lease-id': 'L' },
      });
      expect(r2.status).toBe(404);
    } finally {
      await srv.close();
    }
  });

  it('GET /api/locks → list of held rows', async () => {
    const store = new InMemorySoftLockStore();
    const srv = await startTestServer(app => mountLocksHandlers(app, { store, newLeaseId: () => 'L', authz: ALLOW_ALL }));
    try {
      await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob', 'x-display-name': 'Bob' },
        body: JSON.stringify({ ttlMs: 30_000 }),
      });
      const r = await fetch(`${srv.baseUrl}/api/locks?projectId=P1`, {
        headers: { 'x-user-id': 'u-bob' },
      });
      expect(r.status).toBe(200);
      const list = await r.json() as Array<{ elementId: string; holderDisplayName: string }>;
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(1);
      const row = list[0]!;
      expect(row.elementId).toBe('wall-1');
      expect(row.holderDisplayName).toBe('Bob');
    } finally {
      await srv.close();
    }
  });

  it('rejects malformed requests with 400', async () => {
    const store = new InMemorySoftLockStore();
    const srv = await startTestServer(app => mountLocksHandlers(app, { store, authz: ALLOW_ALL }));
    try {
      // Missing projectId
      const r1 = await fetch(`${srv.baseUrl}/api/locks/wall-1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob' },
        body: JSON.stringify({}),
      });
      expect(r1.status).toBe(400);
      // Missing userId
      const r2 = await fetch(`${srv.baseUrl}/api/locks/wall-1?projectId=P1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(r2.status).toBe(400);
    } finally {
      await srv.close();
    }
  });
});
