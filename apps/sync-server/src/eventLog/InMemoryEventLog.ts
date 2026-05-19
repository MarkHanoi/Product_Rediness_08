// apps/sync-server/eventLog/InMemoryEventLog.ts — default backend.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 line 968 — sequence numbers MUST be monotonic and gap-free
//     within a project.
//
// Concurrency: append() is serialised per-project via a chained promise
// (the in-process equivalent of the spec's `pg_advisory_lock`).  Two
// concurrent calls for the SAME projectId observe FIFO ordering; calls
// for DIFFERENT projectIds proceed in parallel.

import type { CommandEvent, LinearisedEvent } from '../protocol/messages.js';
import type { AppendResult, EventLog, LoadResult } from './types.js';

interface ProjectState {
  readonly events: LinearisedEvent[];
  readonly seenIds: Set<string>;
  /** Tail of the chained-promise mutex.  Each `append()` waits on the
   *  current tail then replaces it — gives FIFO serialisation per
   *  project without blocking other projects. */
  appendLock: Promise<void>;
}

export class InMemoryEventLog implements EventLog {
  private readonly projects = new Map<string, ProjectState>();
  private _closed = false;

  async append(projectId: string, event: CommandEvent): Promise<AppendResult> {
    if (this._closed) throw new Error('InMemoryEventLog: log is closed');
    const state = this.getOrCreate(projectId);

    // Chain onto the project mutex — guarantees no two appends to the
    // same projectId race the sequence-number assignment.
    const release = state.appendLock;
    let releaseNext: () => void = () => undefined;
    state.appendLock = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });

    try {
      await release;

      // Dedup: same event id is a no-op replay.  Returns the existing
      // sequence number so the client's ack semantics still hold.
      if (state.seenIds.has(event.id)) {
        const existing = state.events.find((e) => e.id === event.id);
        if (!existing) {
          // Should be unreachable — the seenIds set is only populated
          // alongside an events push.
          throw new Error(
            `InMemoryEventLog: invariant violated — id ${event.id} marked seen but no event found`,
          );
        }
        return {
          sequenceNumber: existing.sequenceNumber,
          persistedAt: existing.persistedAt,
        };
      }

      const sequenceNumber = state.events.length + 1;
      const persistedAt = new Date().toISOString();
      const linearised: LinearisedEvent = {
        ...event,
        projectId,
        sequenceNumber,
        persistedAt,
      };
      state.events.push(linearised);
      state.seenIds.add(event.id);
      return { sequenceNumber, persistedAt };
    } finally {
      releaseNext();
    }
  }

  async load(projectId: string, fromSeq: number, limit: number): Promise<LoadResult> {
    if (this._closed) throw new Error('InMemoryEventLog: log is closed');
    const state = this.projects.get(projectId);
    if (!state) {
      return { events: [], nextSeq: fromSeq, done: true };
    }
    // fromSeq is exclusive — return events with sequenceNumber > fromSeq.
    const startIdx = Math.max(0, fromSeq); // events[i].sequenceNumber === i+1
    const slice = state.events.slice(startIdx, startIdx + limit);
    const nextSeq = slice.length === 0 ? fromSeq : slice[slice.length - 1]!.sequenceNumber;
    const done = slice.length < limit;
    return { events: slice, nextSeq, done };
  }

  async latestSeq(projectId: string): Promise<number> {
    const state = this.projects.get(projectId);
    if (!state || state.events.length === 0) return 0;
    return state.events[state.events.length - 1]!.sequenceNumber;
  }

  async close(): Promise<void> {
    this._closed = true;
  }

  // ─── test / introspection helpers (not part of the EventLog contract) ─

  /** Read-only snapshot of all events for a project.  Test helper. */
  snapshot(projectId: string): readonly LinearisedEvent[] {
    return this.projects.get(projectId)?.events ?? [];
  }

  private getOrCreate(projectId: string): ProjectState {
    let state = this.projects.get(projectId);
    if (!state) {
      state = {
        events: [],
        seenIds: new Set<string>(),
        appendLock: Promise.resolve(),
      };
      this.projects.set(projectId, state);
    }
    return state;
  }
}
