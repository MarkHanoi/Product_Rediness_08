// CoalesceWindow.test.ts — exit criterion #2 (20 events / 500 ms ≤ 2 jobs).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 875 — exit criterion #2 (20 edits, 500 ms, ≤ 2 jobs)
//   • S21 line 765 — ULID sort guarantee.

import { describe, expect, it, vi } from 'vitest';
import {
  CoalesceWindow,
  COALESCE_WINDOW_MS,
} from '../src/coalescing/CoalesceWindow.js';
import type {
  BakeJobData,
  BakeJobHandler,
  BakeQueue,
  BakeQueueStats,
  QueueAddOptions,
} from '../src/queue/types.js';

class CapturingQueue implements BakeQueue {
  public readonly added: Array<{ name: string; data: BakeJobData; opts: QueueAddOptions }> = [];
  async add(name: string, data: BakeJobData, opts: QueueAddOptions = {}): Promise<string> {
    this.added.push({ name, data, opts });
    return opts.jobId ?? `${name}-${this.added.length}`;
  }
  process(_h: BakeJobHandler): void { /* noop */ }
  async drain(_t: number): Promise<void> { /* noop */ }
  stats(): BakeQueueStats {
    return { pending: 0, running: 0, processed: this.added.length, failed: 0 };
  }
  async close(): Promise<void> { /* noop */ }
}

describe('CoalesceWindow', () => {
  it('20 events arriving every ~25 ms collapse into ≤ 2 queue jobs (exit #2)', async () => {
    vi.useFakeTimers();
    try {
      const queue = new CapturingQueue();
      const cw = new CoalesceWindow(queue, { windowMs: COALESCE_WINDOW_MS });

      // 20 edits dispatched every 25 ms → spans 500 ms total.  With a
      // 250 ms trailing-edge window, every reset within 25 ms keeps
      // the timer alive.  The 1500 ms hard cap is NOT triggered (500
      // ms < 1500 ms), so the entire batch flushes once after 250 ms
      // of post-final silence.
      for (let i = 0; i < 20; i++) {
        await cw.enqueue({
          projectId: 'p',
          levelId: 'L',
          events: [{ id: `01HMW000000000000000000${i.toString(16).padStart(2, '0')}`, type: 'wall.create', payload: {} }],
        });
        await vi.advanceTimersByTimeAsync(25);
      }
      // Drain trailing-edge timer.
      await vi.advanceTimersByTimeAsync(COALESCE_WINDOW_MS + 50);

      expect(queue.added.length).toBeLessThanOrEqual(2);
      expect(queue.added.length).toBeGreaterThanOrEqual(1);

      // Sanity: the flushed job(s) carry all 20 events combined.
      const totalEvents = queue.added.reduce((sum, j) => sum + j.data.eventBatch.length, 0);
      expect(totalEvents).toBe(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sorts events by ULID before flushing (spec line 765)', async () => {
    vi.useFakeTimers();
    try {
      const queue = new CapturingQueue();
      const cw = new CoalesceWindow(queue, { windowMs: 50 });

      // ULIDs are case-insensitive Crockford base32 — they sort
      // lexicographically.  Submit them out of order.
      const ulids = [
        '01HMW0000000000000000000ZZ',
        '01HMW0000000000000000000AA',
        '01HMW0000000000000000000MM',
      ];
      await cw.enqueue({
        projectId: 'p',
        levelId: 'L',
        events: ulids.map((id) => ({ id, type: 't', payload: {} })),
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(queue.added).toHaveLength(1);
      const ids = queue.added[0]!.data.eventBatch.map((e) => e.id);
      expect(ids).toEqual([...ulids].sort());
    } finally {
      vi.useRealTimers();
    }
  });

  it('partitions buckets per-(projectId,levelId)', async () => {
    vi.useFakeTimers();
    try {
      const queue = new CapturingQueue();
      const cw = new CoalesceWindow(queue, { windowMs: 50 });

      await cw.enqueue({
        projectId: 'pA', levelId: 'L', events: [{ id: '01', type: 't', payload: {} }],
      });
      await cw.enqueue({
        projectId: 'pB', levelId: 'L', events: [{ id: '02', type: 't', payload: {} }],
      });
      await cw.enqueue({
        projectId: 'pA', levelId: 'L2', events: [{ id: '03', type: 't', payload: {} }],
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(queue.added).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hard-cap: forces flush after 1500 ms of continuous arrivals', async () => {
    vi.useFakeTimers();
    try {
      const queue = new CapturingQueue();
      const cw = new CoalesceWindow(queue, { windowMs: 250, hardCapMs: 1500 });

      // Submit one event every 100 ms for 2 seconds — the 250 ms
      // trailing-edge timer keeps resetting, but the 1500 ms hard cap
      // forces a flush before then.
      for (let i = 0; i < 20; i++) {
        await cw.enqueue({
          projectId: 'p', levelId: 'L',
          events: [{ id: `0${i}`, type: 't', payload: {} }],
        });
        await vi.advanceTimersByTimeAsync(100);
      }
      await vi.advanceTimersByTimeAsync(300); // drain trailing-edge

      expect(queue.added.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
