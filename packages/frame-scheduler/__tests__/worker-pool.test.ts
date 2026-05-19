// WorkerPool — unit tests for S03-T2a worker pool cap enforcement.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S03-T2a (added 2026-04-27):
//   "test with a fixture that requests 5 workers and asserts the 5th is rejected"
//
// The `Worker` constructor is unavailable in Node.js (no DOM).  We supply a
// minimal shim — just enough for `WorkerPool` to track the identity of the
// objects and call `.terminate()` on them.

import { describe, expect, it, vi } from 'vitest';
import {
  WorkerPool,
  WorkerPoolExhaustedError,
  WORKER_POOL_CAP,
} from '../src/WorkerPool.js';

// ── minimal Worker shim ───────────────────────────────────────────────────

class FakeWorker {
  readonly id = Math.random();
  terminated = false;
  terminate(): void { this.terminated = true; }
}

function fakeFactory(): FakeWorker {
  return new FakeWorker();
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('WorkerPool — hard cap enforcement (S03-T2a)', () => {
  it(`WORKER_POOL_CAP constant is ${WORKER_POOL_CAP}`, () => {
    expect(WORKER_POOL_CAP).toBe(4);
  });

  it('spawns workers up to the cap without throwing', () => {
    const pool = new WorkerPool(4);
    for (let i = 0; i < 4; i++) {
      expect(() => pool.spawn(fakeFactory as never)).not.toThrow();
    }
    expect(pool.count).toBe(4);
    expect(pool.exhausted).toBe(true);
    pool.dispose();
  });

  it('rejects the 5th spawn with WorkerPoolExhaustedError (code worker.pool.exhausted)', () => {
    const pool = new WorkerPool(4);
    for (let i = 0; i < 4; i++) pool.spawn(fakeFactory as never);

    expect(() => pool.spawn(fakeFactory as never)).toThrow(WorkerPoolExhaustedError);
    try {
      pool.spawn(fakeFactory as never);
    } catch (e) {
      expect(e).toBeInstanceOf(WorkerPoolExhaustedError);
      expect((e as WorkerPoolExhaustedError).code).toBe('worker.pool.exhausted');
      expect((e as WorkerPoolExhaustedError).cap).toBe(4);
    }
    pool.dispose();
  });

  it('factory is never called when pool is exhausted — no resource waste', () => {
    const pool = new WorkerPool(4);
    for (let i = 0; i < 4; i++) pool.spawn(fakeFactory as never);

    const factory = vi.fn(() => new FakeWorker());
    try {
      pool.spawn(factory as never);
    } catch {
      // expected
    }
    expect(factory).not.toHaveBeenCalled();
    pool.dispose();
  });

  it('releasing a worker decrements count and allows a new spawn', () => {
    const pool = new WorkerPool(4);
    const workers: FakeWorker[] = [];
    for (let i = 0; i < 4; i++) {
      workers.push(pool.spawn(fakeFactory as never) as unknown as FakeWorker);
    }
    expect(pool.exhausted).toBe(true);

    const toRelease = workers[0]!;
    pool.release(toRelease as never as Worker);
    expect(toRelease.terminated).toBe(true);
    expect(pool.count).toBe(3);
    expect(pool.available).toBe(1);
    expect(pool.exhausted).toBe(false);

    expect(() => pool.spawn(fakeFactory as never)).not.toThrow();
    expect(pool.count).toBe(4);
    pool.dispose();
  });

  it('release of an unknown worker is a no-op', () => {
    const pool = new WorkerPool(4);
    const alien = new FakeWorker();
    expect(() => pool.release(alien as never as Worker)).not.toThrow();
    expect(alien.terminated).toBe(false);
  });

  it('dispose terminates all workers and clears the pool', () => {
    const pool = new WorkerPool(4);
    const workers: FakeWorker[] = [];
    for (let i = 0; i < 3; i++) {
      workers.push(pool.spawn(fakeFactory as never) as unknown as FakeWorker);
    }
    pool.dispose();
    expect(pool.count).toBe(0);
    expect(pool.available).toBe(4);
    for (const w of workers) {
      expect(w.terminated).toBe(true);
    }
    // dispose is idempotent
    expect(() => pool.dispose()).not.toThrow();
  });

  it('custom cap is respected (cap=2 → 3rd spawn throws)', () => {
    const pool = new WorkerPool(2);
    expect(pool.cap).toBe(2);
    pool.spawn(fakeFactory as never);
    pool.spawn(fakeFactory as never);
    expect(() => pool.spawn(fakeFactory as never)).toThrow(WorkerPoolExhaustedError);
    pool.dispose();
  });

  it('cap < 1 throws RangeError at construction', () => {
    expect(() => new WorkerPool(0)).toThrow(RangeError);
    expect(() => new WorkerPool(-1)).toThrow(RangeError);
  });

  it('available is cap - count', () => {
    const pool = new WorkerPool(4);
    expect(pool.available).toBe(4);
    pool.spawn(fakeFactory as never);
    expect(pool.available).toBe(3);
    pool.spawn(fakeFactory as never);
    expect(pool.available).toBe(2);
    pool.dispose();
  });
});
