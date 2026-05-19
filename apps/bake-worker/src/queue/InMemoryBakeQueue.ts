// apps/bake-worker/queue/InMemoryBakeQueue.ts — default in-process queue.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 617 — `[strategic ADR-005]` `os.cpus().length - 1`
//     concurrency (one core reserved for the BullMQ main loop).
//
// Concurrency contract:
//   • Up to `concurrency` jobs run simultaneously.
//   • New jobs queue when concurrency is saturated; FIFO ordering.
//   • `drain(timeoutMs)` resolves when no pending and no running jobs
//     remain, or rejects after the timeout.
//   • `add()` with a duplicate `jobId` is a no-op (deduplication).
//
// This implementation is intentionally simple; the BullMQ adapter
// (`createQueue.ts` when REDIS_URL is set) inherits the same interface
// so the bake worker's index.ts is queue-implementation agnostic.

import { ulid } from 'ulid';
import type {
  BakeJobData,
  BakeJobHandler,
  BakeJobResult,
  BakeQueue,
  BakeQueueStats,
  QueueAddOptions,
} from './types.js';

interface PendingJob {
  readonly id: string;
  readonly name: string;
  readonly data: BakeJobData;
  readonly resolve: (result: BakeJobResult) => void;
  readonly reject: (err: Error) => void;
}

export interface InMemoryBakeQueueOptions {
  /** Maximum jobs running concurrently.  Default `os.cpus().length - 1`
   *  (clamped to ≥ 1).  Spec: `[strategic ADR-005]`. */
  readonly concurrency: number;
}

export class InMemoryBakeQueue implements BakeQueue {
  private readonly pending: PendingJob[] = [];
  private readonly running = new Set<string>();
  private readonly seenJobIds = new Set<string>();
  private readonly waiters = new Set<() => void>();
  private handler: BakeJobHandler | null = null;
  private _processed = 0;
  private _failed = 0;
  private _closed = false;

  constructor(private readonly opts: InMemoryBakeQueueOptions) {
    if (opts.concurrency < 1) {
      throw new Error(`InMemoryBakeQueue: concurrency must be ≥ 1 (got ${opts.concurrency})`);
    }
  }

  async add(name: string, data: BakeJobData, opts: QueueAddOptions = {}): Promise<string> {
    if (this._closed) throw new Error('InMemoryBakeQueue: queue is closed');
    const id = opts.jobId ?? ulid();
    if (this.seenJobIds.has(id)) {
      // Deduplication — same as BullMQ's jobId behaviour.
      return id;
    }
    this.seenJobIds.add(id);

    return new Promise<string>((resolve, reject) => {
      this.pending.push({
        id,
        name,
        data,
        resolve: () => resolve(id),
        reject,
      });
      // Kick off processing on the next microtask so that callers can
      // chain `add()` calls without recursive scheduling.
      queueMicrotask(() => this.tryDispatch());
    });
  }

  process(handler: BakeJobHandler): void {
    this.handler = handler;
    queueMicrotask(() => this.tryDispatch());
  }

  async drain(timeoutMs: number): Promise<void> {
    if (this.pending.length === 0 && this.running.size === 0) return;
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        this.waiters.delete(check);
        reject(new Error(
          `InMemoryBakeQueue.drain timed out after ${timeoutMs} ms ` +
          `(pending=${this.pending.length}, running=${this.running.size})`,
        ));
      }, timeoutMs);
      const check = (): void => {
        if (this.pending.length === 0 && this.running.size === 0) {
          clearTimeout(t);
          this.waiters.delete(check);
          resolve();
        }
      };
      this.waiters.add(check);
      check();
    });
  }

  stats(): BakeQueueStats {
    return {
      pending: this.pending.length,
      running: this.running.size,
      processed: this._processed,
      failed: this._failed,
    };
  }

  async close(): Promise<void> {
    this._closed = true;
    // Reject any pending jobs so awaiters get notified.
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      job.reject(new Error('InMemoryBakeQueue: closed before processing'));
    }
    this.handler = null;
  }

  private tryDispatch(): void {
    if (this._closed) return;
    if (this.handler === null) return;
    while (this.running.size < this.opts.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running.add(job.id);
      // Fire-and-forget — completion / failure is observed via the job's
      // promise, not via the dispatch loop.
      this.runJob(job).catch(() => undefined);
    }
  }

  private async runJob(job: PendingJob): Promise<void> {
    try {
      const result = await this.handler!({ id: job.id, data: job.data });
      this._processed++;
      job.resolve(result);
    } catch (err) {
      this._failed++;
      job.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.running.delete(job.id);
      this.notifyWaiters();
      this.tryDispatch();
    }
  }

  private notifyWaiters(): void {
    for (const w of this.waiters) w();
  }
}
