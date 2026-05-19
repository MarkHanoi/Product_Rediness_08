import { describe, expect, it } from 'vitest';
import { PatchEmitter } from '../src/PatchEmitter.js';
import type { EventRecord } from '../src/types.js';

const SAMPLE: EventRecord = {
  id: '01HXXXXX0000000000000000AB',
  type: 'wall.create',
  payload: { id: 'wall_01HX', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 0 } },
  affectedStores: ['wall'],
  patches: [
    {
      storeKey: 'wall',
      forwardPatches: [{ op: 'add', path: ['walls', 'wall_01HX'], value: { x: 0 } }],
      inversePatches: [{ op: 'remove', path: ['walls', 'wall_01HX'] }],
      capturedAt: '2026-04-26T12:34:56.000Z',
    },
  ],
  forward: [{ op: 'add', path: ['walls', 'wall_01HX'], value: { x: 0 } }],
  inverse: [{ op: 'remove', path: ['walls', 'wall_01HX'] }],
  audit: {
    actorId: 'u-42',
    projectId: 'p-acme',
    clientId: 'tab-1',
    timestamp: '2026-04-26T12:34:56.000Z',
  },
};

describe('PatchEmitter — MessagePack round-trip (S04 — ADR-004)', () => {
  it('decode(encode(x)) is structurally equal to x', () => {
    const bytes = PatchEmitter.encode(SAMPLE);
    expect(bytes).toBeInstanceOf(Uint8Array);
    // MessagePack wire format — first byte is a fixmap marker (0x80–0x8f),
    // NOT the JSON `{` character (0x7b).  SAMPLE has 8 top-level keys → 0x88.
    expect(bytes[0]).not.toBe(0x7b);
    const decoded = PatchEmitter.decode(bytes);
    expect(decoded).toEqual(SAMPLE);
  });

  it('emit() returns bytes AND notifies every subscriber synchronously', () => {
    const emitter = new PatchEmitter();
    const seenA: Uint8Array[] = [];
    const seenB: EventRecord[] = [];
    const offA = emitter.subscribe(b => seenA.push(b));
    emitter.subscribe((_b, r) => seenB.push(r));

    const bytes = emitter.emit(SAMPLE);
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    expect(seenA[0]).toBe(bytes);
    expect(seenB[0]).toEqual(SAMPLE);

    offA();
    emitter.emit(SAMPLE);
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(2);
  });
});
