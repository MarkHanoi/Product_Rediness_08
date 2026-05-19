// apps/bake-worker/queue/types.ts — bake-job queue contract.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 858 — D2 deliverable: BullMQ + Express + worker_threads pool.
//   • S21 line 617 — `[strategic ADR-005]` worker pool sizing = `os.cpus() - 1`.
//
// We define the queue as an INTERFACE (BullMQ-shape subset) so the bake
// worker depends on a small contract rather than the BullMQ runtime
// directly.  Two implementations satisfy it:
//
//   • InMemoryBakeQueue     — default; no Redis dependency.  Used in
//                             dev, in CI, in the Replit container, and
//                             in the bench harness.
//
//   • BullMQBakeQueue       — production opt-in, gated by `REDIS_URL`.
//                             Wires `bullmq` + `ioredis` when present;
//                             falls back to InMemory with a warning if
//                             the dep is not installed.  Lands in S22 D2
//                             alongside the sync server (which is the
//                             producer side of the queue).
//
// The contract intentionally omits BullMQ features the bake worker does
// not use (priorities, repeat schedules, queue events) so the InMemory
// implementation stays small.

export interface BakeJobData {
  readonly projectId: string;
  readonly levelId: string;
  /** The event records to apply.  Sorted by ULID before this point. */
  readonly eventBatch: readonly BakeEventRecord[];
  /** Hash of the previous chunk for this (projectId, levelId), or null
   *  when no chunk exists yet.  S21 v0 ignores this; S23's tier-streamed
   *  loader reactivates the field when full hydration lands. */
  readonly previousChunkHash: string | null;
}

/** Trimmed-down `EventRecord` shape — only the fields the bake worker
 *  needs to replay the event.  Keeps the bake worker decoupled from
 *  the full `EventRecord<T>` import surface. */
export interface BakeEventRecord {
  /** ULID — used for ordering inside a coalesced batch. */
  readonly id: string;
  /** Command type, e.g. `wall.create`. */
  readonly type: string;
  /** Command payload as accepted by the matching handler. */
  readonly payload: unknown;
}

export interface BakeJobResult {
  readonly chunkHash: string;
  readonly byteLength: number;
  readonly durationMs: number;
  /** Time-limited URL the editor can fetch directly. */
  readonly signedUrl: string;
  /** How many descriptors (elements) the chunk encoded. */
  readonly elementCount: number;
}

export interface QueueAddOptions {
  /** Optional deterministic id for de-duplication.  When set, the queue
   *  treats two `add()` calls with the same id as a single job. */
  readonly jobId?: string;
}

export type BakeJobHandler = (job: { id: string; data: BakeJobData }) => Promise<BakeJobResult>;

/**
 * BullMQ-shape subset.  Add-on classes are deliberately omitted (no
 * `Worker`, no `QueueEvents`) so callers can swap the implementation
 * without touching the bake worker's index.ts.
 */
export interface BakeQueue {
  /** Push a job onto the queue.  Returns the assigned id. */
  add(name: string, data: BakeJobData, opts?: QueueAddOptions): Promise<string>;
  /** Register the worker.  Idempotent — multiple registrations replace
   *  the previous handler. */
  process(handler: BakeJobHandler): void;
  /** Wait for the queue to drain.  Implementations MAY reject after a
   *  configurable timeout; callers SHOULD specify one. */
  drain(timeoutMs: number): Promise<void>;
  /** Snapshot of queue counters — pending + running + processed. */
  stats(): BakeQueueStats;
  /** Release any held resources. */
  close(): Promise<void>;
}

export interface BakeQueueStats {
  readonly pending: number;
  readonly running: number;
  readonly processed: number;
  readonly failed: number;
}
