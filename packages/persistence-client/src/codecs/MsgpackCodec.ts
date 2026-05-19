// MessagePack codec via `@msgpack/msgpack`.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 376 (S03-T8) —
// "encode 1K sample events with `@msgpack/msgpack`, `msgpack-lite`,
//  `notepack.io`.  Measure: bytes-per-event avg, encoding speed,
//  decoding speed, bundle size of the codec.  Output to ADR-004 draft.
//  Target: avg < 200 bytes per command event."
//
// `@msgpack/msgpack` is the reference implementation — strict spec
// compliance, well-typed, ~28 kB minified.  The other two contenders
// are evaluated in `apps/bench/src/benches/codec-spike.bench.ts` and
// the resulting numbers feed ADR-004 in S04.

import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import type { Codec, PersistedEvent } from '../types.js';

export const MsgpackCodec: Codec = {
  name: 'msgpack',
  encode(event: PersistedEvent): Uint8Array {
    // `encode` returns a tightly-packed Uint8Array; no copy needed.
    return msgpackEncode(event);
  },
  decode(bytes: Uint8Array): PersistedEvent {
    return msgpackDecode(bytes) as PersistedEvent;
  },
};
