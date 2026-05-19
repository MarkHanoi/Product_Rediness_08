// JSON codec — the baseline.  Slow + verbose but transparent.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 376 (S03-T8).
// Used as the comparison rung in the codec spike bench
// (`apps/bench/src/benches/codec-spike.bench.ts`).

import type { Codec, PersistedEvent } from '../types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export const JsonCodec: Codec = {
  name: 'json',
  encode(event: PersistedEvent): Uint8Array {
    return encoder.encode(JSON.stringify(event));
  },
  decode(bytes: Uint8Array): PersistedEvent {
    return JSON.parse(decoder.decode(bytes)) as PersistedEvent;
  },
};
