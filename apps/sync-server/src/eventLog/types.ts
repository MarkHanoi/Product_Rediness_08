// apps/sync-server/eventLog/types.ts — append-only event-log contract.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 920-970 — Postgres advisory lock + INSERT pattern.
//   • S22 line 968 — sequence numbers MUST be monotonic and gap-free
//     within a project.
//
// We define the log as an INTERFACE so the sync server is independent of
// its storage backend.  Two implementations satisfy it:
//
//   • InMemoryEventLog  — default; no DB dependency.  Used in dev, in
//                         CI, in the Replit container, and in the bench
//                         harness.  Sequencing via in-process mutex.
//
//   • PgEventLog        — production opt-in, gated by `SYNC_EVENT_LOG=pg`
//                         + `DATABASE_URL`.  Sequencing via
//                         `pg_advisory_lock(hashProjectId(projectId))`.
//
// Both implementations satisfy the same contract and share the same
// tests (parametrised in `__tests__/EventLog.contract.test.ts`).

import type { CommandEvent, LinearisedEvent } from '../protocol/messages.js';

export interface AppendResult {
  readonly sequenceNumber: number;
  readonly persistedAt: string;
}

export interface LoadResult {
  readonly events: readonly LinearisedEvent[];
  readonly nextSeq: number;
  readonly done: boolean;
}

export interface EventLog {
  /** Append a single event to the log for `projectId`.  MUST assign a
   *  monotonically increasing, gap-free sequence number within the
   *  project.  MUST be safe to call concurrently — sequence assignment
   *  is serialised inside the implementation. */
  append(projectId: string, event: CommandEvent): Promise<AppendResult>;

  /** Stream events with `sequenceNumber > fromSeq` for `projectId`,
   *  ordered ascending by `sequenceNumber`, paginated to at most
   *  `limit` results.  Spec line 1058: page limit = 500. */
  load(projectId: string, fromSeq: number, limit: number): Promise<LoadResult>;

  /** Highest `sequenceNumber` currently assigned for `projectId`, or 0
   *  if no events exist.  Used by the subscribe handler to send a
   *  `latestSeq` hint to the client. */
  latestSeq(projectId: string): Promise<number>;

  /** Release any held resources. */
  close(): Promise<void>;
}
