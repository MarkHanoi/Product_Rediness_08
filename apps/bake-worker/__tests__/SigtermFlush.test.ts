// SigtermFlush.test.ts — exit criterion #3 (SIGTERM flush).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 876 — exit criterion #3 ("SIGTERM flush — pending
//      coalesced batches written before exit").

import { describe, expect, it } from 'vitest';
import { CoalesceWindow } from '../src/coalescing/CoalesceWindow.js';
import { InMemoryBakeQueue } from '../src/queue/InMemoryBakeQueue.js';
import type { BakeJobData, BakeJobResult } from '../src/queue/types.js';

describe('SIGTERM flush behaviour', () => {
  it('flushAll() drains all pending coalescer buckets immediately', async () => {
    const queue = new InMemoryBakeQueue({ concurrency: 2 });
    const seen: BakeJobData[] = [];
    queue.process(async (job): Promise<BakeJobResult> => {
      seen.push(job.data);
      return {
        chunkHash: 'hash',
        byteLength: 0,
        durationMs: 0,
        signedUrl: 'inmem://hash',
        elementCount: 0,
      };
    });

    // 250 ms window — long enough that no auto-flush happens during
    // the test's synchronous body.
    const cw = new CoalesceWindow(queue, { windowMs: 250 });

    await cw.enqueue({
      projectId: 'pA', levelId: 'L', events: [{ id: '01', type: 't', payload: {} }],
    });
    await cw.enqueue({
      projectId: 'pB', levelId: 'L', events: [{ id: '02', type: 't', payload: {} }],
    });

    // Stats: 2 buckets pending, 0 jobs flushed.
    expect(cw.stats().pendingBuckets).toBe(2);
    expect(cw.stats().flushedJobs).toBe(0);

    await cw.flushAll();
    await queue.drain(2000);

    expect(seen).toHaveLength(2);
    expect(cw.stats().pendingBuckets).toBe(0);
    expect(cw.stats().flushedJobs).toBe(2);
  });
});
