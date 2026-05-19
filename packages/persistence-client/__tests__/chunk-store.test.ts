// ChunkStore tests — both InMemoryChunkStore and IndexedDbChunkStore
// (the latter via fake-indexeddb).
//
// Spec source: PHASE-1D §S19 D7 — wire ChunkReader into editor load
// path; the IDB store is the persistence layer that wiring consumes.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  IDB_CHUNKS_DB_NAME_PREFIX,
  IDB_CHUNKS_DB_VERSION,
  IDB_CHUNKS_STORE,
  IndexedDbChunkStore,
  InMemoryChunkStore,
  type ChunkRecord,
  type ChunkStore,
} from '../src/index.js';

const A_HASH = 'a'.repeat(64);
const B_HASH = 'b'.repeat(64);
const C_HASH = 'c'.repeat(64);

function rec(hash: string, payload: number[]): ChunkRecord {
  return {
    hash,
    bytes: new Uint8Array(payload),
    byteLength: payload.length,
    createdAt: '2026-04-27T00:00:00.000Z',
  };
}

let projectCounter = 0;
const freshProject = () => `chunkstore-${Date.now()}-${projectCounter++}`;

function describeStore(name: string, factory: () => ChunkStore) {
  describe(name, () => {
    let store: ChunkStore;
    beforeEach(() => { store = factory(); });

    it('put + get round-trip', async () => {
      await store.put(rec(A_HASH, [1, 2, 3, 4]));
      const got = await store.get(A_HASH);
      expect(got).not.toBeNull();
      expect(got!.byteLength).toBe(4);
      expect(Array.from(got!.bytes)).toEqual([1, 2, 3, 4]);
    });

    it('get returns null for unknown hash', async () => {
      expect(await store.get('0'.repeat(64))).toBeNull();
    });

    it('has reflects presence', async () => {
      expect(await store.has(A_HASH)).toBe(false);
      await store.put(rec(A_HASH, [1]));
      expect(await store.has(A_HASH)).toBe(true);
    });

    it('put is idempotent on identical hash', async () => {
      await store.put(rec(A_HASH, [1]));
      await store.put(rec(A_HASH, [1, 2])); // overwrite is fine; hash matches
      const r = await store.get(A_HASH);
      expect(r!.bytes.length).toBe(2);
    });

    it('getMany returns positional results with null for misses', async () => {
      await store.put(rec(A_HASH, [1]));
      await store.put(rec(C_HASH, [3, 3, 3]));
      const got = await store.getMany([A_HASH, B_HASH, C_HASH]);
      expect(got[0]?.hash).toBe(A_HASH);
      expect(got[1]).toBeNull();
      expect(got[2]?.hash).toBe(C_HASH);
    });

    it('delete returns true on present, false on absent', async () => {
      await store.put(rec(A_HASH, [1]));
      expect(await store.delete(A_HASH)).toBe(true);
      expect(await store.delete(A_HASH)).toBe(false);
      expect(await store.get(A_HASH)).toBeNull();
    });

    it('listHashes enumerates inserted keys', async () => {
      await store.put(rec(A_HASH, [1]));
      await store.put(rec(B_HASH, [2]));
      const keys = (await store.listHashes()).slice().sort();
      expect(keys).toEqual([A_HASH, B_HASH].sort());
    });

    it('close prevents further use', async () => {
      await store.put(rec(A_HASH, [1]));
      await store.close();
      await expect(store.put(rec(B_HASH, [1]))).rejects.toBeTruthy();
    });
  });
}

describeStore('InMemoryChunkStore', () => new InMemoryChunkStore());
describeStore('IndexedDbChunkStore', () => new IndexedDbChunkStore({ projectId: freshProject() }));

describe('IndexedDbChunkStore — schema constants', () => {
  it('exposes frozen schema constants for migration tracking', () => {
    expect(IDB_CHUNKS_DB_NAME_PREFIX).toBe('pryzm-chunks-');
    expect(IDB_CHUNKS_DB_VERSION).toBe(1);
    expect(IDB_CHUNKS_STORE).toBe('chunks');
  });

  it('rejects empty projectId in constructor', () => {
    expect(() => new IndexedDbChunkStore({ projectId: '' })).toThrow();
  });
});

describe('ChunkStore — multi-store coexistence', () => {
  it('two stores on different projects do not see each other', async () => {
    const a = new IndexedDbChunkStore({ projectId: freshProject() });
    const b = new IndexedDbChunkStore({ projectId: freshProject() });
    await a.put(rec(A_HASH, [1, 2, 3]));
    expect(await a.has(A_HASH)).toBe(true);
    expect(await b.has(A_HASH)).toBe(false);
    await a.close();
    await b.close();
  });
});
