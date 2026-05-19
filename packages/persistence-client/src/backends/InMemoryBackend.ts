// `InMemoryBackend` — simplest possible Backend.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 375 (S03-T7).
//
// Used by:
//   • Unit tests (no IDB available in headless Node).
//   • The MessagePack codec spike — codec correctness is independent of
//     the backend, so we round-trip through InMemory.
//   • Future Node-side replay tools (S20+ — diagnose a corrupted log
//     by importing the JSONL dump into InMemory and running queries).
//
// Round-trip test in `__tests__/in-memory-backend.test.ts` covers the
// 1K-event sanity check from the spec.

import {
  EventLogClosedError,
  type Backend,
  type PersistedEvent,
} from '../types.js';

export class InMemoryBackend implements Backend {
  private events: PersistedEvent[] = [];
  private checkpointSeq = 0;
  private closed = false;

  // ────────────────────────────────────────────────────────────── Backend
  async append(event: PersistedEvent): Promise<void> {
    this.assertOpen();
    // Guard against backwards seq — the EventLog assigns these
    // monotonically, so a violation is a protocol bug, not a runtime
    // condition we should silently fix.
    const last = this.events[this.events.length - 1];
    if (last !== undefined && event.seq <= last.seq) {
      throw new Error(
        `[InMemoryBackend] non-monotonic seq — got ${event.seq}, ` +
          `last=${last.seq} (the EventLog must be the sole writer).`,
      );
    }
    this.events.push(event);
  }

  async *replay(fromSeq: number): AsyncIterable<PersistedEvent> {
    this.assertOpen();
    // Snapshot length at iteration start so concurrent appends do
    // not show up mid-iteration (matches IDB cursor semantics).
    const upTo = this.events.length;
    for (let i = 0; i < upTo; i++) {
      const ev = this.events[i]!;
      if (ev.seq >= fromSeq) yield ev;
    }
  }

  async checkpoint(seq: number): Promise<void> {
    this.assertOpen();
    if (seq < this.checkpointSeq) {
      throw new RangeError(
        `[InMemoryBackend] checkpoint cannot go backwards ` +
          `(${seq} < ${this.checkpointSeq}).`,
      );
    }
    this.checkpointSeq = seq;
  }

  async highestSeq(): Promise<number> {
    this.assertOpen();
    const last = this.events[this.events.length - 1];
    return last ? last.seq : 0;
  }

  async lastCheckpoint(): Promise<number> {
    this.assertOpen();
    return this.checkpointSeq;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.events = [];
  }

  // ────────────────────────────────────────────────────────────── helpers
  /** Test-only — number of events currently in memory. */
  size(): number {
    return this.events.length;
  }

  /** Test-only — direct snapshot for assertion convenience. */
  snapshot(): readonly PersistedEvent[] {
    return [...this.events];
  }

  private assertOpen(): void {
    if (this.closed) throw new EventLogClosedError();
  }
}
