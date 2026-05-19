// `IndexedDbBackend` sketch tests.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 377 (S03-T9) —
// "Sketch with single-writer queue design (full impl S04). Documents
//  the queue contract; basic in-memory simulation test for the queue
//  ordering."
//
// Node 20 has no native IndexedDB, so we use a fake-indexeddb shim.
// The shim is a dev-only test dependency — the real code path uses
// `globalThis.indexedDB` directly via `idb`.

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EventLog,
  IDB_DB_NAME_PREFIX,
  IDB_DB_VERSION,
  IDB_EVENTS_STORE,
  IDB_META_STORE,
  IDB_CHECKPOINT_KEY,
  IndexedDbBackend,
  PERSISTED_EVENT_VERSION,
  type PersistedEvent,
} from '../src/index.js';

let nextProject = 0;
function freshProject(): string {
  return `test-${Date.now()}-${nextProject++}`;
}

function fakeEvent(seq: number): PersistedEvent {
  return {
    seq,
    version: PERSISTED_EVENT_VERSION,
    persistedAt: '2026-04-26T10:00:00.000Z',
    event: {
      id: `01HZ${seq.toString().padStart(22, '0')}`,
      type: 'test.tick',
      payload: { n: seq },
      affectedStores: ['test'],
      patches: [],
      audit: {
        actorId: 'system',
        projectId: 'p',
        clientId: 'c',
        timestamp: '2026-04-26T10:00:00.000Z',
      },
      forward: [],
      inverse: [],
    },
  };
}

const openBackends: IndexedDbBackend[] = [];

afterEach(async () => {
  while (openBackends.length > 0) {
    const b = openBackends.pop();
    try {
      await b?.close();
    } catch {
      /* ignore */
    }
  }
});

describe('IndexedDbBackend (sketch)', () => {
  it('exposes a fixed schema (frozen at S03)', () => {
    expect(IDB_DB_NAME_PREFIX).toBe('pryzm-eventlog-');
    expect(IDB_DB_VERSION).toBe(1);
    expect(IDB_EVENTS_STORE).toBe('events');
    expect(IDB_META_STORE).toBe('meta');
    expect(IDB_CHECKPOINT_KEY).toBe('checkpoint');
  });

  it('requires a projectId', () => {
    expect(() => new IndexedDbBackend({ projectId: '' })).toThrow(/projectId is required/);
  });

  it('round-trips events through IDB', async () => {
    const backend = new IndexedDbBackend({ projectId: freshProject() });
    openBackends.push(backend);
    await backend.append(fakeEvent(1));
    await backend.append(fakeEvent(2));
    await backend.append(fakeEvent(3));
    expect(await backend.highestSeq()).toBe(3);
    const out: number[] = [];
    for await (const ev of backend.replay(0)) out.push(ev.seq);
    expect(out).toEqual([1, 2, 3]);
  });

  it('replay(fromSeq) yields seq >= fromSeq only', async () => {
    const backend = new IndexedDbBackend({ projectId: freshProject() });
    openBackends.push(backend);
    for (let i = 1; i <= 10; i++) await backend.append(fakeEvent(i));
    const out: number[] = [];
    for await (const ev of backend.replay(7)) out.push(ev.seq);
    expect(out).toEqual([7, 8, 9, 10]);
  });

  it('persists checkpoints', async () => {
    const backend = new IndexedDbBackend({ projectId: freshProject() });
    openBackends.push(backend);
    expect(await backend.lastCheckpoint()).toBe(0);
    await backend.checkpoint(42);
    expect(await backend.lastCheckpoint()).toBe(42);
    await backend.checkpoint(100);
    expect(await backend.lastCheckpoint()).toBe(100);
  });

  it('single-writer queue preserves arrival order under concurrent appends', async () => {
    const backend = new IndexedDbBackend({ projectId: freshProject() });
    openBackends.push(backend);
    // Fire 30 appends without intermediate awaits.  The queue must
    // commit them in arrival order (R1A-06 mitigation).
    const promises = Array.from({ length: 30 }, (_, i) => backend.append(fakeEvent(i + 1)));
    await Promise.all(promises);
    const out: number[] = [];
    for await (const ev of backend.replay(0)) out.push(ev.seq);
    expect(out).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('integrates with EventLog round-trip', async () => {
    const projectId = freshProject();
    const backend = new IndexedDbBackend({ projectId });
    openBackends.push(backend);
    const log = new EventLog(backend);
    for (let i = 0; i < 10; i++) {
      const ev = fakeEvent(i).event;
      await log.append(ev);
    }
    expect(await log.highestSeq()).toBe(10);
    const replayed: number[] = [];
    for await (const ev of log.replay(5)) replayed.push(ev.seq);
    expect(replayed).toEqual([5, 6, 7, 8, 9, 10]);
    await log.close();
  });
});
