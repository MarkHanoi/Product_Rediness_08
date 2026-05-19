// apps/bake-worker/index.ts — Express entry point + queue + coalescer.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 lines 643-703 — implementation detail for the entry point.
//   • S21 exit #6 (878) — `apps/bake-worker/` starts cleanly.
//
// Endpoints:
//   • POST /enqueue   — sync server posts event batches here.
//   • GET  /health    — liveness / readiness probe; returns concurrency.
//   • GET  /cost      — cost meter snapshot for ops monitoring.
//   • GET  /stats     — queue + coalescer counters.

import express, { type Express, type Request, type Response } from 'express';
import {
  createStorageDriver,
  type StorageDriver,
} from '@pryzm/storage-driver';
import { createQueue, defaultConcurrency } from './queue/createQueue.js';
import type { BakeJobHandler, BakeQueue } from './queue/types.js';
import { CoalesceWindow, COALESCE_WINDOW_MS } from './coalescing/CoalesceWindow.js';
import { processRebakeJob } from './jobs/RebakeChunkJob.js';
import { CostMeter } from './cost/CostMeter.js';
import { withSpan, BAKE_SPANS } from './otel.js';

export interface BakeWorkerOptions {
  readonly port?: number;
  readonly env?: Record<string, string | undefined>;
  readonly storage?: StorageDriver;
  readonly queue?: BakeQueue;
  readonly concurrency?: number;
  /** Coalescing window in ms.  Default = 250 (spec ADR-010). */
  readonly windowMs?: number;
}

export interface BakeWorkerInstance {
  readonly app: Express;
  readonly queue: BakeQueue;
  readonly coalescer: CoalesceWindow;
  readonly storage: StorageDriver;
  readonly costMeter: CostMeter;
  readonly concurrency: number;
  /** Stop the worker — flushes pending coalescer batches, drains the
   *  queue, and releases the storage driver.  Called from the SIGTERM
   *  handler (S21 exit #3). */
  shutdown(reason: string): Promise<void>;
  /** Listen on a port.  Returns once the server is accepting connections. */
  listen(port: number): Promise<void>;
}

export async function createBakeWorker(
  opts: BakeWorkerOptions = {},
): Promise<BakeWorkerInstance> {
  const env = opts.env ?? process.env;
  const concurrency = opts.concurrency ?? defaultConcurrency();
  const windowMs = opts.windowMs ?? COALESCE_WINDOW_MS;

  // Storage driver (ADR-003).
  const storage =
    opts.storage ??
    createStorageDriver({ env }).driver;

  // Queue.
  const queue =
    opts.queue ??
    (await createQueue({ env, concurrency })).queue;

  // Coalescer (ADR-010).
  const coalescer = new CoalesceWindow(queue, { windowMs });

  // Cost meter — wraps the storage driver.
  const costMeter = new CostMeter(storage);

  // Worker handler — pulled from the queue, runs the bake pipeline,
  // then ticks the cost meter.
  const handler: BakeJobHandler = async (job) => {
    const result = await processRebakeJob(job.data, { storage });
    costMeter.recordEvent({
      projectId: job.data.projectId,
      levelId: job.data.levelId,
      jobId: job.id,
    });
    return result;
  };
  queue.process(handler);

  // Express app.
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.post('/enqueue', async (req: Request, res: Response) => {
    try {
      const { projectId, levelId, events } = req.body as {
        projectId?: string;
        levelId?: string;
        events?: Array<{ id: string; type: string; payload: unknown }>;
      };
      if (!projectId || !levelId || !Array.isArray(events) || events.length === 0) {
        res.status(400).json({
          error: 'projectId, levelId, and a non-empty events array are required',
        });
        return;
      }
      await coalescer.enqueue({ projectId, levelId, events });
      res.json({ ok: true, queued: events.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.get('/health', (_: Request, res: Response) => {
    res.json({
      status: 'ok',
      concurrency,
      queue: queue.stats(),
      coalescer: coalescer.stats(),
    });
  });

  app.get('/cost', (_: Request, res: Response) => {
    res.json(costMeter.summary());
  });

  app.get('/stats', (_: Request, res: Response) => {
    res.json({
      queue: queue.stats(),
      coalescer: coalescer.stats(),
      storage: storage.stats(),
      cost: costMeter.summary(),
    });
  });

  // Wire the SIGTERM handler — flushes the coalescer + drains the queue
  // + closes the storage driver.  Spec exit #3 (line 876).
  let server: import('node:http').Server | null = null;
  let shuttingDown = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    return withSpan(
      'pryzm.bake.shutdown',
      { 'pryzm.bake.shutdown.reason': reason },
      async () => {
        await coalescer.flushAll();
        await queue.drain(5_000).catch((err: Error) => {
          // eslint-disable-next-line no-console
          console.warn('[bake-worker] queue.drain timed out:', err.message);
        });
        await queue.close();
        await storage.dispose();
        if (server) {
          await new Promise<void>((resolve) => server!.close(() => resolve()));
        }
      },
    );
  };

  return {
    app,
    queue,
    coalescer,
    storage,
    costMeter,
    concurrency,
    shutdown,
    async listen(port: number): Promise<void> {
      await new Promise<void>((resolve) => {
        server = app.listen(port, () => resolve());
      });
    },
  };
}

// CLI entry — only runs when invoked directly (not when imported by
// tests / bench).  Honours `BAKE_PORT` env var (default 4001).
const isDirectInvoke =
  // Vitest pre-loads modules via import; check `import.meta.url` against
  // process.argv[1] for CLI invocation.
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('apps/bake-worker/src/index.ts') === true;

if (isDirectInvoke) {
  const PORT = parseInt(process.env.BAKE_PORT ?? '4001', 10);
  void (async () => {
    const worker = await createBakeWorker();
    process.on('SIGTERM', () => {
      // eslint-disable-next-line no-console
      console.log('[bake-worker] SIGTERM received — flushing coalescer + draining queue');
      worker.shutdown('SIGTERM').then(() => process.exit(0)).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[bake-worker] shutdown failed:', e);
        process.exit(1);
      });
    });
    await worker.listen(PORT);
    // eslint-disable-next-line no-console
    console.log(`[bake-worker] listening on :${PORT} (concurrency=${worker.concurrency})`);
  })();
}
