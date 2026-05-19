// EventLog — the public face of @pryzm/persistence-client.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 374.
//
//   "EventLog.append(event) → Promise<void>,
//    EventLog.replay(fromSeq) → AsyncIterable<Event>,
//    EventLog.checkpoint(seq) → Promise<void>"
//
// The class wraps a Backend.  Its only smarts are:
//   1. Assigning the monotonic `seq` (gap-free, restart-safe by reading
//      `backend.highestSeq()` once at construction).
//   2. Stamping `version` (per ADR-004) and `persistedAt`.
//   3. Single-writer queue — every `append` is awaited in arrival
//      order, mitigating R1A-06 ("concurrent writes corrupt the
//      IndexedDB transaction"; spec line 406).  This means an
//      EventLog instance is safe for concurrent callers without any
//      lock dance in user code.

import type { EventRecord } from '@pryzm/command-bus';
import { withSpan } from './otel.js';
import {
  EventLogClosedError,
  PERSISTED_EVENT_VERSION,
  type Backend,
  type PersistedEvent,
} from './types.js';

export class EventLog {
  private readonly backend: Backend;
  /** Resolves once the backend has reported its current `highestSeq`. */
  private readonly initPromise: Promise<void>;
  private nextSeq = 0;
  private closed = false;
  /**
   * The single-writer queue tail — every `append` chains onto this so
   * the backend sees writes in arrival order even under concurrent
   * callers (per ADR-004 / R1A-06).
   */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(backend: Backend) {
    this.backend = backend;
    this.initPromise = backend.highestSeq().then((seq) => {
      this.nextSeq = seq + 1;
    });
  }

  /**
   * Persist an EventRecord from the L2 command-bus.  Returns when the
   * backend has durably committed the write.  Concurrent calls are
   * serialised — the returned promise resolves AFTER all earlier
   * `append` calls' promises resolve.
   */
  async append<T>(event: EventRecord<T>): Promise<PersistedEvent<T>> {
    if (this.closed) throw new EventLogClosedError();
    await this.initPromise;
    // Capture the slot synchronously so concurrent callers get unique,
    // monotonic seq numbers regardless of the queue's await order.
    const seq = this.nextSeq++;
    const persisted: PersistedEvent<T> = {
      seq,
      version: PERSISTED_EVENT_VERSION,
      persistedAt: new Date().toISOString(),
      event,
    };
    // S04 D8 — emit `pryzm.persistence.append` span around the queued
    // backend write.  We start the span here (after slot capture) so
    // the span duration is the WAIT + WRITE the caller actually feels;
    // a parallel L2 `pryzm.command.execute` span sits as a sibling.
    return withSpan(
      'pryzm.persistence.append',
      {
        'pryzm.persistence.seq': seq,
        'pryzm.persistence.event_type': event.type,
        'pryzm.persistence.event_id': event.id,
        'pryzm.persistence.affected_stores': (
          event.affectedStores as readonly string[]
        ).join(','),
      },
      async () => {
        // Chain on the queue.  We rethrow the previous error so the
        // returned promise reflects this caller's outcome — but we also
        // catch it on the queue itself so a single failed append does not
        // poison every subsequent append.
        const ours = this.writeQueue.then(
          () => this.backend.append(persisted),
          // If a prior append failed we still want to attempt ours — the
          // backend gets to decide whether to fail (e.g. closed) or
          // succeed.  Swallowing here is correct; the prior caller already
          // received the error on their own promise.
          () => this.backend.append(persisted),
        );
        this.writeQueue = ours.catch(() => {
          /* intentional — see above */
        });
        await ours;
        return persisted;
      },
    );
  }

  /**
   * Stream events with `seq >= fromSeq` in ascending order.  Defaults
   * to the start of the log.  Replay is consistent with all `append`s
   * that resolved before iteration began; appends made DURING
   * iteration MAY or MAY NOT be visible (backend-defined).
   */
  replay(fromSeq = 0): AsyncIterable<PersistedEvent> {
    if (this.closed) throw new EventLogClosedError();
    return this.backend.replay(fromSeq);
  }

  /**
   * Mark `seq` as durably synced.  Backends MAY garbage-collect older
   * events; the InMemoryBackend simply records the value.  The S03
   * impl does NOT trim — full GC lands in S04 with the snapshot upload
   * pipeline.
   */
  async checkpoint(seq: number): Promise<void> {
    if (this.closed) throw new EventLogClosedError();
    if (seq < 0 || !Number.isFinite(seq)) {
      throw new RangeError(
        `[EventLog] checkpoint(seq) requires a non-negative finite number, got ${seq}.`,
      );
    }
    await this.initPromise;
    await this.backend.checkpoint(seq);
  }

  /** Highest sequence number assigned so far (0 before first append). */
  async highestSeq(): Promise<number> {
    await this.initPromise;
    return this.nextSeq - 1;
  }

  async lastCheckpoint(): Promise<number> {
    await this.initPromise;
    return this.backend.lastCheckpoint();
  }

  /** Idempotent close — flushes the write queue first. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Drain the queue so callers awaiting `append()` see a definite
    // result before the backend goes away.
    await this.writeQueue.catch(() => {
      /* errors already surfaced to the originating caller */
    });
    await this.backend.close();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
