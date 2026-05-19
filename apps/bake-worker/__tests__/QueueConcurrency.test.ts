// QueueConcurrency.test.ts — exit criterion #8 (`[strategic ADR-005]`).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 617 — pool size = `os.cpus().length - 1` (clamped ≥ 1).
//   • S21 line 879 — exit criterion #8.

import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { defaultConcurrency, createQueue } from '../src/queue/createQueue.js';
import { InMemoryBakeQueue } from '../src/queue/InMemoryBakeQueue.js';

describe('Queue concurrency (ADR-005)', () => {
  it('defaultConcurrency() = max(1, os.cpus().length - 1)', () => {
    const expected = Math.max(1, os.cpus().length - 1);
    expect(defaultConcurrency()).toBe(expected);
  });

  it('createQueue() defaults to in-memory when REDIS_URL is absent', async () => {
    const result = await createQueue({ env: {} });
    expect(result.selection).toBe('memory');
    expect(result.concurrency).toBe(defaultConcurrency());
    await result.queue.close();
  });

  it('honours explicit BAKE_QUEUE=memory regardless of REDIS_URL', async () => {
    const result = await createQueue({
      env: { BAKE_QUEUE: 'memory', REDIS_URL: 'redis://localhost:6379' },
    });
    expect(result.selection).toBe('memory');
    await result.queue.close();
  });

  it('respects concurrency cap — never exceeds N concurrent jobs', async () => {
    const N = 3;
    const queue = new InMemoryBakeQueue({ concurrency: N });
    let inflight = 0;
    let peak = 0;
    const results: number[] = [];

    queue.process(async (job) => {
      inflight++;
      peak = Math.max(peak, inflight);
      // Hold the slot briefly so we can observe concurrency.
      await new Promise((r) => setTimeout(r, 20));
      inflight--;
      results.push(parseInt(job.id.split('-').pop()!, 10));
      return {
        chunkHash: 'h', byteLength: 0, durationMs: 0,
        signedUrl: '', elementCount: 0,
      };
    });

    const adds = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        queue.add('rebake', {
          projectId: 'p', levelId: 'L', previousChunkHash: null,
          eventBatch: [{ id: `e${i}`, type: 't', payload: {} }],
        }, { jobId: `job-${i}` }),
      ),
    );
    expect(adds).toHaveLength(10);

    await queue.drain(5000);
    expect(peak).toBeLessThanOrEqual(N);
    expect(queue.stats().processed).toBe(10);
    await queue.close();
  });

  it('deduplicates by jobId (BullMQ-shape contract)', async () => {
    const queue = new InMemoryBakeQueue({ concurrency: 2 });
    let count = 0;
    queue.process(async () => {
      count++;
      return {
        chunkHash: 'h', byteLength: 0, durationMs: 0,
        signedUrl: '', elementCount: 0,
      };
    });
    const data = {
      projectId: 'p', levelId: 'L', previousChunkHash: null,
      eventBatch: [{ id: 'e', type: 't', payload: {} }],
    } as const;
    await queue.add('rebake', data, { jobId: 'same' });
    await queue.add('rebake', data, { jobId: 'same' });
    await queue.add('rebake', data, { jobId: 'same' });
    await queue.drain(2000);
    expect(count).toBe(1);
    await queue.close();
  });
});
