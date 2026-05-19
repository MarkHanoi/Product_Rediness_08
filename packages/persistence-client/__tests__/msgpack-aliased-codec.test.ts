// MsgpackAliasedCodec (v2) round-trip tests + ULID packing tests.
//
// Spec: ADR-004 §2 byte-budget closure; the v2 codec MUST
//   1. round-trip lossless,
//   2. detect non-v2 inputs (refuse to decode v1),
//   3. produce strictly smaller output than the v1 MsgpackCodec.

import { describe, expect, it } from 'vitest';
import {
  isUlid,
  JsonCodec,
  MsgpackAliasedCodec,
  MsgpackCodec,
  PERSISTED_EVENT_VERSION,
  ulidBytesToString,
  ulidStringToBytes,
  type PersistedEvent,
} from '../src/index.js';
import { ulid } from 'ulid';

// Fixture ULIDs must use only Crockford-base32 chars — i.e. no I, L, O, U.
const FIXTURE_ULID = '01HZ0000000000000000000000';

function fixture(overrides: Partial<PersistedEvent> = {}): PersistedEvent {
  const id = FIXTURE_ULID;
  const wallId = 'wall-1';
  return {
    seq: 42,
    version: PERSISTED_EVENT_VERSION,
    persistedAt: '2026-04-26T10:00:00.000Z',
    event: {
      id,
      type: 'wall.create',
      payload: { length: 3.5, height: 2.4 },
      affectedStores: ['wall'],
      patches: [
        {
          storeKey: 'wall',
          forwardPatches: [
            { op: 'add', path: ['walls', wallId], value: { id: wallId, length: 3.5 } },
          ],
          inversePatches: [{ op: 'remove', path: ['walls', wallId] }],
          capturedAt: '2026-04-26T10:00:00.000Z',
        },
      ],
      audit: {
        actorId: 'user-1',
        projectId: 'p-7',
        clientId: 'tab-3',
        timestamp: '2026-04-26T10:00:00.000Z',
      },
      forward: [{ op: 'add', path: ['walls', wallId], value: { id: wallId, length: 3.5 } }],
      inverse: [{ op: 'remove', path: ['walls', wallId] }],
    },
    ...overrides,
  };
}

// Strip wire-omitted fields so round-trip equality is checkable.  The v2
// wire intentionally drops `payload` (audit-only); decoded events surface
// `payload: undefined` to make this loss explicit.  See ADR-004 §2.
function withoutPayload(ev: PersistedEvent): PersistedEvent {
  return { ...ev, event: { ...ev.event, payload: undefined } };
}

describe('MsgpackAliasedCodec (v2)', () => {
  it('round-trips an add/remove mirror pair losslessly (modulo payload)', () => {
    const ev = fixture();
    const decoded = MsgpackAliasedCodec.decode(MsgpackAliasedCodec.encode(ev));
    expect(decoded).toEqual(withoutPayload(ev));
  });

  it('round-trips a replace/replace pair (no mirror flag)', () => {
    const ev = fixture({
      event: {
        ...fixture().event,
        patches: [
          {
            storeKey: 'wall',
            forwardPatches: [{ op: 'replace', path: ['walls', 'w1', 'length'], value: 5.5 }],
            inversePatches: [{ op: 'replace', path: ['walls', 'w1', 'length'], value: 3.5 }],
            capturedAt: '2026-04-26T10:00:00.000Z',
          },
        ],
        forward: [{ op: 'replace', path: ['walls', 'w1', 'length'], value: 5.5 }],
        inverse: [{ op: 'replace', path: ['walls', 'w1', 'length'], value: 3.5 }],
      },
    });
    const decoded = MsgpackAliasedCodec.decode(MsgpackAliasedCodec.encode(ev));
    expect(decoded).toEqual(withoutPayload(ev));
  });

  it('round-trips empty patches arrays', () => {
    const ev = fixture({
      event: {
        ...fixture().event,
        patches: [],
        forward: [],
        inverse: [],
      },
    });
    const decoded = MsgpackAliasedCodec.decode(MsgpackAliasedCodec.encode(ev));
    expect(decoded).toEqual({
      ...ev,
      event: {
        ...ev.event,
        payload: undefined,
        // affectedStores is reconstructed from patches; with zero patches it's [].
        affectedStores: [],
      },
    });
  });

  it('round-trips a real ULID via the 16-byte raw packing', () => {
    const id = ulid();
    expect(isUlid(id)).toBe(true);
    const ev = fixture({ event: { ...fixture().event, id } });
    const decoded = MsgpackAliasedCodec.decode(MsgpackAliasedCodec.encode(ev));
    expect(decoded.event.id).toBe(id);
  });

  it('round-trips a non-ULID id (test-fixture string) without packing', () => {
    const ev = fixture({ event: { ...fixture().event, id: 'not-a-ulid-id' } });
    const decoded = MsgpackAliasedCodec.decode(MsgpackAliasedCodec.encode(ev));
    expect(decoded.event.id).toBe('not-a-ulid-id');
  });

  it('refuses to encode a non-v2 envelope', () => {
    const ev = fixture({ version: 999 as never });
    expect(() => MsgpackAliasedCodec.encode(ev)).toThrow(/cannot encode event with version=999/);
  });

  it('refuses to decode a non-v2 wire payload', () => {
    // Encode with the v1 codec and try to decode with v2 — must throw.
    const v1Bytes = MsgpackCodec.encode(fixture());
    expect(() => MsgpackAliasedCodec.decode(v1Bytes)).toThrow();
  });

  it('produces strictly smaller bytes than MsgpackCodec (v1) on the fixture', () => {
    const ev = fixture();
    const v1 = MsgpackCodec.encode(ev).byteLength;
    const v2 = MsgpackAliasedCodec.encode(ev).byteLength;
    expect(v2).toBeLessThan(v1);
  });

  it('beats the < 200 B / event ADR-004 target on the canonical wall.create fixture', () => {
    const ev = fixture();
    const v2 = MsgpackAliasedCodec.encode(ev).byteLength;
    // Canonical wall.create event: 1 patch entry, 1 forward, 1 inverse mirror.
    // ADR-004 target: < 200 B / event.  This is the per-event closure proof.
    expect(v2).toBeLessThan(200);
    // Sanity: also strictly smaller than JSON.
    const j = JsonCodec.encode(ev).byteLength;
    expect(v2).toBeLessThan(j);
  });
});

describe('ULID 16-byte packing', () => {
  it('round-trips a fresh ULID', () => {
    for (let i = 0; i < 100; i++) {
      const id = ulid();
      const bytes = ulidStringToBytes(id);
      expect(bytes.byteLength).toBe(16);
      expect(ulidBytesToString(bytes)).toBe(id);
    }
  });

  it('round-trips known fixtures', () => {
    // Crockford-base32 alphabet excludes I, L, O, U.
    const cases = [
      '01HZ0000000000000000000000',
      '00000000000000000000000000',
      '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
    ];
    for (const id of cases) {
      const bytes = ulidStringToBytes(id);
      expect(bytes.byteLength).toBe(16);
      expect(ulidBytesToString(bytes)).toBe(id);
    }
  });

  it('rejects non-ULIDs', () => {
    expect(() => ulidStringToBytes('not-a-ulid')).toThrow();
    expect(() => ulidStringToBytes('TOO-SHORT')).toThrow();
  });

  it('rejects buffers of the wrong length', () => {
    expect(() => ulidBytesToString(new Uint8Array(15))).toThrow(/expected 16 bytes/);
  });
});
