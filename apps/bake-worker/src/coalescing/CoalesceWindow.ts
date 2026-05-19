// apps/bake-worker/coalescing/CoalesceWindow.ts — 250 ms trailing-edge debounce.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 621      — `[strategic ADR-010]` (250 ms bake debounce)
//                          implementation in this sprint.
//   • S21 lines 765-767 — ULID sort + SIGTERM flush correctness.
//   • S21 exit #2 (875) — 20 edits / 500 ms → ≤ 2 jobs.
//   • S21 exit #3 (876) — SIGTERM flush.
//
// Algorithm:
//   • Pending events are bucketed by `${projectId}/${levelId}` key.
//   • A new event resets the trailing-edge timer for its bucket.
//   • When the timer fires, the bucket flushes — events are sorted by
//     ULID (handles network reorder) and pushed as one queue job.
//
// Hard cap (`[strategic ADR-010]`):
//   • If events keep arriving for the same key, force a flush every
//     `hardCapMs` (default 1500 ms) to prevent indefinite starvation.

import { ulid as makeUlid } from 'ulid';
import type {
  BakeEventRecord,
  BakeQueue,
  QueueAddOptions,
} from '../queue/types.js';
import { BAKE_SPANS, withSpan } from '../otel.js';

interface PendingBatch {
  events: BakeEventRecord[];
  timer: ReturnType<typeof setTimeout>;
  /** When the first event arrived — used for hard-cap enforcement. */
  windowOpenedAt: number;
}

export interface CoalesceWindowOptions {
  /** Trailing-edge window in ms.  Spec default = 250. */
  readonly windowMs: number;
  /** Hard cap on coalescing — force a flush after this duration even
   *  if new events keep arriving.  Spec default = 1500.  See ADR-010
   *  "Coalescing rules — Hard cap of 1500 ms". */
  readonly hardCapMs?: number;
}

export interface EnqueueInput {
  readonly projectId: string;
  readonly levelId: string;
  readonly events: readonly BakeEventRecord[];
}

/** Spec `[strategic ADR-010]` — canonical 250 ms window. */
export const COALESCE_WINDOW_MS = 250;
/** Spec `[strategic ADR-010]` — canonical 1500 ms hard cap. */
export const COALESCE_HARD_CAP_MS = 1500;

export class CoalesceWindow {
  private readonly pending = new Map<string, PendingBatch>();
  private readonly hardCapMs: number;
  private _flushedJobs = 0;
  private _coalescedEvents = 0;

  constructor(
    private readonly queue: BakeQueue,
    private readonly opts: CoalesceWindowOptions,
  ) {
    if (opts.windowMs < 1) {
      throw new Error(`CoalesceWindow: windowMs must be ≥ 1 (got ${opts.windowMs})`);
    }
    this.hardCapMs = opts.hardCapMs ?? COALESCE_HARD_CAP_MS;
  }

  /** Push events into the coalescer.  Returns immediately — the actual
   *  queue.add() call happens after the trailing-edge timer fires. */
  async enqueue(input: EnqueueInput): Promise<void> {
    return withSpan(
      BAKE_SPANS.enqueue,
      {
        'pryzm.bake.projectId': input.projectId,
        'pryzm.bake.levelId': input.levelId,
        'pryzm.bake.eventCount': input.events.length,
      },
      async () => {
        const key = `${input.projectId}/${input.levelId}`;
        const existing = this.pending.get(key);
        const now = Date.now();

        if (existing) {
          existing.events.push(...input.events);
          this._coalescedEvents += input.events.length;
          // Hard-cap check — if the window has been open longer than
          // `hardCapMs`, flush immediately rather than reset the timer.
          if (now - existing.windowOpenedAt >= this.hardCapMs) {
            clearTimeout(existing.timer);
            this.flush(key).catch(this.onError);
            return;
          }
          // Trailing-edge: reset the timer to defer flush.
          clearTimeout(existing.timer);
          existing.timer = setTimeout(() => {
            this.flush(key).catch(this.onError);
          }, this.opts.windowMs);
        } else {
          const timer = setTimeout(() => {
            this.flush(key).catch(this.onError);
          }, this.opts.windowMs);
          this.pending.set(key, {
            events: [...input.events],
            timer,
            windowOpenedAt: now,
          });
          this._coalescedEvents += input.events.length;
        }
      },
    );
  }

  /** Force-flush ALL pending buckets.  Used by the SIGTERM handler
   *  (S21 exit criterion #3) and by tests. */
  async flushAll(): Promise<void> {
    const keys = [...this.pending.keys()];
    for (const k of keys) {
      const batch = this.pending.get(k);
      if (batch) clearTimeout(batch.timer);
    }
    await Promise.all(keys.map((k) => this.flush(k)));
  }

  /** Snapshot — pending bucket count + stats. */
  stats(): {
    pendingBuckets: number;
    flushedJobs: number;
    coalescedEvents: number;
  } {
    return {
      pendingBuckets: this.pending.size,
      flushedJobs: this._flushedJobs,
      coalescedEvents: this._coalescedEvents,
    };
  }

  private async flush(key: string): Promise<void> {
    const batch = this.pending.get(key);
    if (!batch) return;
    this.pending.delete(key);

    // Sort by ULID before submitting.  Spec line 765:
    //   "If two events arrive out of order (network reorder), the
    //    coalescer must sort by ULID before flushing."
    batch.events.sort((a, b) => a.id.localeCompare(b.id));

    const slash = key.indexOf('/');
    const projectId = key.slice(0, slash);
    const levelId = key.slice(slash + 1);

    const opts: QueueAddOptions = {
      jobId: `${projectId}-${levelId}-${makeUlid()}`,
    };

    await this.queue.add(
      'rebake',
      {
        projectId,
        levelId,
        eventBatch: batch.events,
        previousChunkHash: null, // bake worker fetches from manifest in S22+
      },
      opts,
    );
    this._flushedJobs++;
  }

  private onError = (err: unknown): void => {
    // Coalescer-internal errors should never crash the bake worker —
    // surface via OTel + console, then continue.  The job-level retry
    // policy (BullMQ in S22) covers transient failures from the
    // queue side.
    // eslint-disable-next-line no-console
    console.error('[CoalesceWindow] flush failed:', err);
  };
}
