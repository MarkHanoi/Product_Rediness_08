// L0 persistence-client — public type surface.
//
// Spec source: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
//   • S03-T6 (line 374) — `EventLog.append(event) → Promise<void>`,
//                          `EventLog.replay(fromSeq) → AsyncIterable<Event>`,
//                          `EventLog.checkpoint(seq) → Promise<void>`.
//   • S03-T7 (line 375) — `InMemoryBackend` is the round-trip baseline.
//   • S03-T8 (line 376) — codecs are pluggable; ADR-004 ratifies the
//                          MessagePack vs JSON choice in S04.
//   • S03-T9 (line 377) — `IndexedDbBackend` sketch w/ single-writer
//                          queue (mitigates R1A-06 — concurrent writes
//                          corrupt the IDB transaction).

import type { EventRecord } from '@pryzm/command-bus';

/**
 * A `PersistedEvent<T>` wraps an `EventRecord<T>` from the command-bus
 * with a monotonic sequence number assigned by the EventLog at append
 * time.  Per ADR-004 the wire format carries a `version` field so
 * future schema migrations can be detected without re-reading the
 * whole log.
 */
export interface PersistedEvent<TPayload = unknown> {
  /** Monotonic, gap-free sequence number assigned by the EventLog. */
  readonly seq: number;
  /** Wire-format version — bumped by ADR-004 (S04) when schema migrates. */
  readonly version: number;
  /** ISO-8601 timestamp at the moment `append()` was invoked. */
  readonly persistedAt: string;
  /** The original L2 EventRecord, unchanged. */
  readonly event: EventRecord<TPayload>;
}

/**
 * The pluggable storage contract.  All methods MUST be safe to call
 * concurrently from a single client; the EventLog itself serialises
 * writes per ADR-004.  A backend MAY relax that constraint internally
 * (e.g. `InMemoryBackend` is single-threaded JS so it does nothing
 * extra), but every backend MUST honour the order in which `append`s
 * were issued — re-ordering breaks `replay()` causality.
 */
export interface Backend {
  /**
   * Persist a single event.  Returns when the event is durably written
   * (for `IndexedDbBackend` that means the IDB transaction has
   * committed).  The EventLog assigns `seq` BEFORE calling — the
   * backend MUST NOT mutate it.
   */
  append(event: PersistedEvent): Promise<void>;
  /**
   * Stream events with `seq >= fromSeq`.  Backends are free to choose
   * the page size; the iterator MUST yield events in ascending seq
   * order with no gaps.  An exhausted iterator means "no more events
   * up to the latest checkpoint at iteration start".
   */
  replay(fromSeq: number): AsyncIterable<PersistedEvent>;
  /**
   * Mark `seq` as the last durable, sync-acknowledged event.  Backends
   * MAY garbage-collect events with `seq <= seq` ONLY after the L3
   * sync engine has confirmed the snapshot upload (S04 contract); the
   * S03 implementation simply records the value.
   */
  checkpoint(seq: number): Promise<void>;
  /** Latest assigned seq (0 if the log is empty). */
  highestSeq(): Promise<number>;
  /** Last value passed to `checkpoint()` (0 if never called). */
  lastCheckpoint(): Promise<number>;
  /**
   * Release any resources (close DB handle, drain in-flight transactions).
   * Idempotent — calling twice is a no-op.  After `close()` every method
   * MUST throw `EventLogClosedError`.
   */
  close(): Promise<void>;
}

/**
 * Codec contract — symmetric encode / decode of a `PersistedEvent`.
 * The S04 codec choice (JSON vs MessagePack vs notepack.io) lands in
 * ADR-004; S03 ships JSON + `@msgpack/msgpack` so the bench harness
 * can compare them.
 */
export interface Codec {
  /** Stable name used in OTel + codec-spike bench output. */
  readonly name: string;
  encode(event: PersistedEvent): Uint8Array;
  decode(bytes: Uint8Array): PersistedEvent;
}

/**
 * Wire-format version constant — bumped explicitly per ADR-004.
 *
 * v1 (S03):  unaliased envelope; long property names; ISO-8601
 *            timestamps; ULID written as a 26-char string.  Encoded by
 *            `JsonCodec` and `MsgpackCodec`.
 * v2 (S04):  aliased envelope; epoch-ms timestamps; ULID packed as 16
 *            raw bytes; add↔remove patch pairs marked with a `mirror`
 *            flag and decoded by reconstruction.  Encoded by
 *            `MsgpackAliasedCodec` (the production wire format ratified
 *            by ADR-004).
 *
 * The bump from 1 → 2 in S04 closes the < 200 B / event budget owed by
 * ADR-004 §2.  `MsgpackCodec` (v1) is retained as the legacy reader for
 * any pre-S04 IDB log; new events are always written at v2.
 */
export const PERSISTED_EVENT_VERSION = 2 as const;

export class EventLogClosedError extends Error {
  constructor() {
    super('[EventLog] backend has been closed.');
    this.name = 'EventLogClosedError';
  }
}
