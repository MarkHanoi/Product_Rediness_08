// LockManager unit suite — happy path, conflicts, release idempotence,
// auto-extend, awareness mirroring.  PURE: MockTransport + injected clock,
// no fetch polyfill required.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  LockManager,
  LockConflictError,
  LockTransportError,
  type LockTransport,
  type AwarenessHeldLocksSink,
  type LockAcquireSuccessBody,
} from '../src/locks.js';

class MockTransport implements LockTransport {
  acquireMock = vi.fn<(id: string, ttl: number) => Promise<LockAcquireSuccessBody>>();
  extendMock  = vi.fn<(id: string, lease: string, ttl: number) => Promise<LockAcquireSuccessBody>>();
  releaseMock = vi.fn<(id: string, lease: string) => Promise<void>>();
  listMock    = vi.fn<(projectId: string) => Promise<readonly never[]>>(async () => []);

  acquire = (id: string, ttl: number) => this.acquireMock(id, ttl);
  extend  = (id: string, lease: string, ttl: number) => this.extendMock(id, lease, ttl);
  release = (id: string, lease: string) => this.releaseMock(id, lease);
  list    = (projectId: string) => this.listMock(projectId);
}

class MockAwareness implements AwarenessHeldLocksSink {
  calls: readonly string[][] = [];
  setHeldLocks(locks: readonly string[]): void {
    this.calls = [...this.calls, [...locks]];
  }
}

let now = 1_700_000_000_000;
function makeMgr(transport: MockTransport, awareness: MockAwareness | null = null) {
  return new LockManager(transport, awareness, {
    defaultTtlMs: 30_000,
    extendMarginRatio: 0.5,
    now: () => now,
  });
}

beforeEach(() => {
  now = 1_700_000_000_000;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LockManager.acquire', () => {
  it('happy path — returns a handle and mirrors onto awareness', async () => {
    const t = new MockTransport();
    const a = new MockAwareness();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    const mgr = makeMgr(t, a);

    const handle = await mgr.acquire('wall-1');
    expect(handle.elementId).toBe('wall-1');
    expect(handle.leaseId).toBe('lease-1');
    expect(handle.getExpiresAtMs()).toBe(now + 30_000);
    expect(handle.isReleased()).toBe(false);
    expect(t.acquireMock).toHaveBeenCalledWith('wall-1', 30_000);
    expect(a.calls.at(-1)).toEqual(['wall-1']);

    mgr.dispose();
  });

  it('409 conflict surfaces as LockConflictError', async () => {
    const t = new MockTransport();
    // The two assertions below each call mgr.acquire, so we need two
    // rejection setups (mockRejectedValueOnce only consumes one).
    t.acquireMock.mockRejectedValueOnce(
      new LockConflictError('wall-1', { userId: 'u-bob', displayName: 'Bob', expiresAtMs: now + 12_000 }),
    );
    t.acquireMock.mockRejectedValueOnce(
      new LockConflictError('wall-1', { userId: 'u-bob', displayName: 'Bob', expiresAtMs: now + 12_000 }),
    );
    const mgr = makeMgr(t);
    await expect(mgr.acquire('wall-1')).rejects.toBeInstanceOf(LockConflictError);
    await expect(mgr.acquire('wall-1')).rejects.toMatchObject({
      elementId: 'wall-1',
      holder: { displayName: 'Bob' },
    });
  });

  it('double-acquire from same client returns the same handle', async () => {
    const t = new MockTransport();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    const mgr = makeMgr(t);
    const h1 = await mgr.acquire('wall-1');
    const h2 = await mgr.acquire('wall-1');
    expect(h2).toBe(h1);
    expect(t.acquireMock).toHaveBeenCalledTimes(1);
    mgr.dispose();
  });
});

describe('LockManager.extend', () => {
  it('manual extend pushes the expiry forward', async () => {
    const t = new MockTransport();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    t.extendMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 60_000,
    });
    const mgr = makeMgr(t);
    const h = await mgr.acquire('wall-1');
    const newExpiry = await mgr.extend(h);
    expect(newExpiry).toBe(now + 60_000);
    expect(h.getExpiresAtMs()).toBe(now + 60_000);
    mgr.dispose();
  });
});

describe('LockManager.release', () => {
  it('releases and clears awareness', async () => {
    const t = new MockTransport();
    const a = new MockAwareness();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    t.releaseMock.mockResolvedValueOnce(undefined);
    const mgr = makeMgr(t, a);
    await mgr.acquire('wall-1');
    await mgr.release('wall-1');
    expect(t.releaseMock).toHaveBeenCalledWith('wall-1', 'lease-1');
    expect(a.calls.at(-1)).toEqual([]);
    expect(mgr.heldElementIds()).toEqual([]);
    mgr.dispose();
  });

  it('release of an unheld lock is a no-op (idempotent)', async () => {
    const t = new MockTransport();
    const mgr = makeMgr(t);
    await mgr.release('wall-unknown');
    expect(t.releaseMock).not.toHaveBeenCalled();
    mgr.dispose();
  });

  it('swallows transport errors on release (sweeper is authoritative)', async () => {
    const t = new MockTransport();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    t.releaseMock.mockRejectedValueOnce(new LockTransportError(503, 'down'));
    const mgr = makeMgr(t);
    await mgr.acquire('wall-1');
    await expect(mgr.release('wall-1')).resolves.toBeUndefined();
    expect(mgr.heldElementIds()).toEqual([]);
    mgr.dispose();
  });
});

describe('LockManager auto-extend', () => {
  it('schedules an extend at ttl * extendMarginRatio after acquire', async () => {
    const t = new MockTransport();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    t.extendMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 45_000,
    });
    const mgr = makeMgr(t);
    await mgr.acquire('wall-1');
    expect(t.extendMock).not.toHaveBeenCalled();

    // Auto-extend window = 30_000 * 0.5 = 15_000.
    await vi.advanceTimersByTimeAsync(15_001);
    expect(t.extendMock).toHaveBeenCalledWith('wall-1', 'lease-1', 30_000);
    mgr.dispose();
  });

  it('failed auto-extend drops the local handle and clears awareness', async () => {
    const t = new MockTransport();
    const a = new MockAwareness();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    t.extendMock.mockRejectedValueOnce(new LockTransportError(404, 'gone'));
    const mgr = makeMgr(t, a);
    const h = await mgr.acquire('wall-1');
    await vi.advanceTimersByTimeAsync(20_000);
    // Drain micro-tasks so the rejected extend promise settles.
    await vi.runOnlyPendingTimersAsync();
    expect(h.isReleased()).toBe(true);
    expect(mgr.heldElementIds()).toEqual([]);
    expect(a.calls.at(-1)).toEqual([]);
    mgr.dispose();
  });

  it('release cancels pending auto-extend', async () => {
    const t = new MockTransport();
    t.acquireMock.mockResolvedValueOnce({
      elementId: 'wall-1', leaseId: 'lease-1', expiresAtMs: now + 30_000,
    });
    t.releaseMock.mockResolvedValueOnce(undefined);
    const mgr = makeMgr(t);
    await mgr.acquire('wall-1');
    await mgr.release('wall-1');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.extendMock).not.toHaveBeenCalled();
    mgr.dispose();
  });
});

describe('LockManager.releaseAll', () => {
  it('releases every held lock in parallel and tolerates failures', async () => {
    const t = new MockTransport();
    t.acquireMock.mockResolvedValue({
      elementId: 'x', leaseId: 'lease', expiresAtMs: now + 30_000,
    });
    t.releaseMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new LockTransportError(503, 'down'))
      .mockResolvedValueOnce(undefined);
    const mgr = makeMgr(t);
    await mgr.acquire('w-1');
    await mgr.acquire('w-2');
    await mgr.acquire('w-3');
    await mgr.releaseAll();
    expect(mgr.heldElementIds()).toEqual([]);
    mgr.dispose();
  });
});
