// PatchEmitter — listens for command bus output and emits encoded event
// bytes to subscribers.  Subscribers are the L0 event-log persistor (S04)
// and the L3 sync server (S22).
//
// WIRE FORMAT (S04 — ADR-004): MessagePack binary encoding via
// `@msgpack/msgpack`.  Replaces the S02 JSON-over-Uint8Array prototype.
//
// Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T4` line 296:
//   "MessagePack codec choice → ADR-004 in S04 (S02 ships JSON-only;
//    codec swap is a single-file change later)."
//
// ADR-004 status: IMPLEMENTED (this file).
//
// `decode(encode(x))` MUST be structurally equal to `x` — covered by
// `__tests__/patch-emitter.test.ts`.

import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import type { EventRecord } from './types.js';

export type EmitterListener = (bytes: Uint8Array, record: EventRecord) => void;

export class PatchEmitter {
  private readonly listeners = new Set<EmitterListener>();

  subscribe(listener: EmitterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Emit an event record to every subscriber.  Returns the encoded bytes. */
  emit(record: EventRecord): Uint8Array {
    const bytes = PatchEmitter.encode(record);
    for (const listener of this.listeners) {
      listener(bytes, record);
    }
    return bytes;
  }

  /** S04 (ADR-004): MessagePack binary encoding. */
  static encode(record: EventRecord): Uint8Array {
    return msgpackEncode(record);
  }

  /** S04 (ADR-004): MessagePack binary decoding. */
  static decode(bytes: Uint8Array): EventRecord {
    return msgpackDecode(bytes) as EventRecord;
  }
}
