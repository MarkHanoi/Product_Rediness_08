// `InMemoryBackend` round-trip + `EventLog` contract tests.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 375 (S03-T7) —
// "Round-trip 1K events sanity check."

import { describe, expect, it } from 'vitest';
import type { EventRecord } from '@pryzm/command-bus';
import {
  EventLog,
  EventLogClosedError,
  InMemoryBackend,
  PERSISTED_EVENT_VERSION,
} from '../src/index.js';

function fakeEvent(i: number): EventRecord<{ n: number }> {
  return {
    id: `01HZ${i.toString().padStart(22, '0')}`,
    type: 'test.tick',
    payload: { n: i },
    affectedStores: ['test'],
    patches: [
      {
        storeKey: 'test',
        forwardPatches: [{ op: 'replace', path: ['n'], value: i }],
        inversePatches: [{ op: 'replace', path: ['n'], value: i - 1 }],
        capturedAt: new Date(0).toISOString(),
      },
    ],
    audit: {
      actorId: 'system',
      projectId: 'p',
      clientId: 'c',
      timestamp: new Date(0).toISOString(),
    },
    forward: [{ op: 'replace', path: ['n'], value: i }],
    inverse: [{ op: 'replace', path: ['n'], value: i - 1 }],
  };
}

describe('InMemoryBackend + EventLog', () => {
  it('round-trips 1K events with monotonic seq', async () => {
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    const persisted = [];
    for (let i = 0; i < 1000; i++) {
      persisted.push(await log.append(fakeEvent(i)));
    }
    // Seq is monotonic, gap-free, starting at 1.
    for (let i = 0; i < 1000; i++) {
      expect(persisted[i]!.seq).toBe(i + 1);
      expect(persisted[i]!.version).toBe(PERSISTED_EVENT_VERSION);
      expect(persisted[i]!.event.payload.n).toBe(i);
    }
    expect(await log.highestSeq()).toBe(1000);
    expect(backend.size()).toBe(1000);

    // Replay yields all events in order.
    const replayed: number[] = [];
    for await (const ev of log.replay()) replayed.push(ev.seq);
    expect(replayed).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));

    // Replay from cursor.
    const tail: number[] = [];
    for await (const ev of log.replay(998)) tail.push(ev.seq);
    expect(tail).toEqual([998, 999, 1000]);

    await log.close();
  });

  it('serialises concurrent appends in arrival order', async () => {
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    // Fire 50 appends without awaiting between them.
    const promises = Array.from({ length: 50 }, (_, i) => log.append(fakeEvent(i)));
    const out = await Promise.all(promises);
    // The seq numbers reflect call order, not resolve order.
    for (let i = 0; i < 50; i++) {
      expect(out[i]!.seq).toBe(i + 1);
      expect(out[i]!.event.payload.n).toBe(i);
    }
    // Backend received them in the same order.
    const snap = backend.snapshot();
    for (let i = 0; i < 50; i++) {
      expect(snap[i]!.seq).toBe(i + 1);
    }
    await log.close();
  });

  it('honours checkpoint() and surfaces lastCheckpoint()', async () => {
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    for (let i = 0; i < 5; i++) await log.append(fakeEvent(i));
    expect(await log.lastCheckpoint()).toBe(0);
    await log.checkpoint(3);
    expect(await log.lastCheckpoint()).toBe(3);
    // Backwards checkpoint is a programmer error.
    await expect(log.checkpoint(2)).rejects.toThrow(/cannot go backwards/);
    // Negative checkpoint is rejected at the EventLog layer.
    await expect(log.checkpoint(-1)).rejects.toThrow(RangeError);
    await log.close();
  });

  it('throws EventLogClosedError after close', async () => {
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    await log.append(fakeEvent(0));
    await log.close();
    expect(log.isClosed).toBe(true);
    await expect(log.append(fakeEvent(1))).rejects.toBeInstanceOf(EventLogClosedError);
    await expect(log.checkpoint(0)).rejects.toBeInstanceOf(EventLogClosedError);
    expect(() => log.replay()).toThrow(EventLogClosedError);
    // close() is idempotent.
    await log.close();
  });

  it('rejects backwards seq at the backend layer (protocol bug guard)', async () => {
    const backend = new InMemoryBackend();
    await backend.append({
      seq: 5,
      version: PERSISTED_EVENT_VERSION,
      persistedAt: new Date(0).toISOString(),
      event: fakeEvent(0),
    });
    await expect(
      backend.append({
        seq: 5,
        version: PERSISTED_EVENT_VERSION,
        persistedAt: new Date(0).toISOString(),
        event: fakeEvent(1),
      }),
    ).rejects.toThrow(/non-monotonic seq/);
  });

  it('continues after a backend failure (single-writer queue does not poison)', async () => {
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    // First append succeeds.
    await log.append(fakeEvent(0));
    // Sabotage the backend so the next append rejects.
    const original = backend.append.bind(backend);
    let calls = 0;
    backend.append = async (ev) => {
      calls++;
      if (calls === 1) throw new Error('disk full');
      return original(ev);
    };
    await expect(log.append(fakeEvent(1))).rejects.toThrow(/disk full/);
    // Subsequent append still works — seq advances regardless.
    const ok = await log.append(fakeEvent(2));
    expect(ok.seq).toBe(3);
    await log.close();
  });
});
