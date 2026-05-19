// Codec round-trip tests — JSON + MessagePack.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 376 (S03-T8).
//
// Correctness here is independent of the bench numbers (those land in
// `apps/bench/src/benches/codec-spike.bench.ts`).  The point of these
// tests is to lock the wire-format invariants — once ADR-004 ratifies a
// codec, breaking these tests means the wire format changed and the
// existing IDB events become unreadable.

import { describe, expect, it } from 'vitest';
import {
  JsonCodec,
  MsgpackCodec,
  PERSISTED_EVENT_VERSION,
  type Codec,
  type PersistedEvent,
} from '../src/index.js';

const sample: PersistedEvent = {
  seq: 42,
  version: PERSISTED_EVENT_VERSION,
  persistedAt: '2026-04-26T10:00:00.000Z',
  event: {
    id: '01HZTESTID0000000000000000',
    type: 'wall.create',
    payload: { length: 3.5, height: 2.4, points: [0, 0, 3.5, 0] },
    affectedStores: ['wall'],
    patches: [
      {
        storeKey: 'wall',
        forwardPatches: [{ op: 'add', path: ['walls', 'w-1'], value: { id: 'w-1' } }],
        inversePatches: [{ op: 'remove', path: ['walls', 'w-1'] }],
        capturedAt: '2026-04-26T10:00:00.000Z',
      },
    ],
    audit: {
      actorId: 'user-1',
      projectId: 'p-7',
      clientId: 'tab-3',
      timestamp: '2026-04-26T10:00:00.000Z',
    },
    forward: [{ op: 'add', path: ['walls', 'w-1'], value: { id: 'w-1' } }],
    inverse: [{ op: 'remove', path: ['walls', 'w-1'] }],
  },
};

const codecs: Codec[] = [JsonCodec, MsgpackCodec];

for (const codec of codecs) {
  describe(`${codec.name} codec`, () => {
    it('round-trips the sample event', () => {
      const bytes = codec.encode(sample);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.byteLength).toBeGreaterThan(0);
      const decoded = codec.decode(bytes);
      expect(decoded).toEqual(sample);
    });

    it('round-trips 100 distinct events', () => {
      for (let i = 0; i < 100; i++) {
        const ev: PersistedEvent = {
          ...sample,
          seq: i,
          event: { ...sample.event, payload: { i } },
        };
        const decoded = codec.decode(codec.encode(ev));
        expect(decoded).toEqual(ev);
      }
    });

    it('handles empty patches arrays', () => {
      const empty: PersistedEvent = {
        ...sample,
        event: { ...sample.event, patches: [], forward: [], inverse: [] },
      };
      const decoded = codec.decode(codec.encode(empty));
      expect(decoded).toEqual(empty);
    });
  });
}

describe('msgpack vs json size', () => {
  it('msgpack produces a smaller payload than JSON for the sample event', () => {
    const jsonBytes = JsonCodec.encode(sample).byteLength;
    const msgpackBytes = MsgpackCodec.encode(sample).byteLength;
    // Sanity check, not a hard ratchet — the ADR-004 ratchet lives in
    // `apps/bench/src/benches/codec-spike.bench.ts`.
    expect(msgpackBytes).toBeLessThan(jsonBytes);
  });
});
