// chunks/ChunkStore.ts — content-addressed chunk store interface
// + IndexedDB and in-memory implementations.  S19 D7 deliverable.
//
// Spec source: PHASE-1D §S19 D7 (line 395):
//   "Wire ChunkReader into apps/editor/src/bootstrap.ts load path
//    (feature flagged).  Medium fixture save → chunk written to
//    IndexedDB → reload reads chunk instead of reconstructing from
//    events."
//
// The store is a thin CRUD over `(hash → bytes)`; one entry per
// content-addressed chunk regardless of how many `(level, version)`
// tuples reference it.  S20 (`packages/file-format/pack.ts`) calls
// `getMany(hashes)` to assemble the `.pryzm` ZIP; S21 (`bake-worker`)
// will adopt this interface for its R2 driver as well.
//
// IDB schema — frozen by this S19 deliverable.  Bumping
// `IDB_CHUNKS_DB_VERSION` requires writing a migration in S20.
//
//   DB:        `pryzm-chunks-${projectId}`
//   Version:   1
//   Stores:
//     • `chunks` — keyPath `hash`, value = `{ hash, bytes, byteLength,
//                  createdAt }`.

import { openDB, type IDBPDatabase } from 'idb';

export interface ChunkRecord {
  /** SHA-256 hex; matches `ChunkEntry.hash`. */
  readonly hash: string;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  /** ISO-8601 — used by SPEC-02 §8.2 GC (chunks > 7 days unreferenced). */
  readonly createdAt: string;
}

/**
 * Generic content-addressed chunk persistence.  The interface is
 * intentionally minimal so the same shape works for IndexedDB
 * (browser editor S19), R2 / MinIO (bake worker S21), and an
 * in-memory mock (tests).
 */
export interface ChunkStore {
  /** Persist a chunk; idempotent on `hash`. */
  put(record: ChunkRecord): Promise<void>;
  /** Fetch a chunk by hash; `null` if not found. */
  get(hash: string): Promise<ChunkRecord | null>;
  /** Bulk fetch.  Missing entries are returned as `null` in the same
   *  positional slot.  Used by `pack.ts` and the tier-streamed loader. */
  getMany(hashes: readonly string[]): Promise<ReadonlyArray<ChunkRecord | null>>;
  /** Whether `hash` is present without materialising the bytes. */
  has(hash: string): Promise<boolean>;
  /** Remove a chunk.  Returns `true` if deleted, `false` if absent. */
  delete(hash: string): Promise<boolean>;
  /** Hashes of all stored chunks.  Used by GC. */
  listHashes(): Promise<readonly string[]>;
  /** Release any underlying handles.  Idempotent. */
  close(): Promise<void>;
}

// --------------------------------------------------------------------
// In-memory implementation — for tests, the bake-worker dry-run mode,
// and the headless CLI's `--no-persist` flag.
// --------------------------------------------------------------------

export class InMemoryChunkStore implements ChunkStore {
  private readonly map = new Map<string, ChunkRecord>();
  private closed = false;

  async put(record: ChunkRecord): Promise<void> {
    this.assertOpen();
    this.map.set(record.hash, {
      hash: record.hash,
      bytes: record.bytes.slice(), // copy to avoid aliasing
      byteLength: record.byteLength,
      createdAt: record.createdAt,
    });
  }
  async get(hash: string): Promise<ChunkRecord | null> {
    this.assertOpen();
    return this.map.get(hash) ?? null;
  }
  async getMany(hashes: readonly string[]): Promise<ReadonlyArray<ChunkRecord | null>> {
    this.assertOpen();
    return hashes.map((h) => this.map.get(h) ?? null);
  }
  async has(hash: string): Promise<boolean> {
    this.assertOpen();
    return this.map.has(hash);
  }
  async delete(hash: string): Promise<boolean> {
    this.assertOpen();
    return this.map.delete(hash);
  }
  async listHashes(): Promise<readonly string[]> {
    this.assertOpen();
    return Array.from(this.map.keys());
  }
  async close(): Promise<void> {
    this.closed = true;
    this.map.clear();
  }
  private assertOpen() {
    if (this.closed) throw new Error('[InMemoryChunkStore] store is closed');
  }
}

// --------------------------------------------------------------------
// IndexedDB implementation — the editor's chunk cache.
// --------------------------------------------------------------------

export const IDB_CHUNKS_DB_NAME_PREFIX = 'pryzm-chunks-';
export const IDB_CHUNKS_DB_VERSION = 1;
export const IDB_CHUNKS_STORE = 'chunks';

export interface IndexedDbChunkStoreOptions {
  /** Per-project DB name suffix.  REQUIRED — projects MUST be isolated. */
  projectId: string;
}

export class IndexedDbChunkStore implements ChunkStore {
  private readonly dbName: string;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private closed = false;

  constructor(opts: IndexedDbChunkStoreOptions) {
    if (!opts.projectId) {
      throw new Error('[IndexedDbChunkStore] options.projectId is required.');
    }
    this.dbName = IDB_CHUNKS_DB_NAME_PREFIX + opts.projectId;
  }

  private db(): Promise<IDBPDatabase> {
    if (this.closed) throw new Error('[IndexedDbChunkStore] store is closed');
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.dbName, IDB_CHUNKS_DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(IDB_CHUNKS_STORE)) {
            db.createObjectStore(IDB_CHUNKS_STORE, { keyPath: 'hash' });
          }
        },
      });
    }
    return this.dbPromise;
  }

  async put(record: ChunkRecord): Promise<void> {
    const db = await this.db();
    // `idb` cannot structured-clone Uint8Array views with offset; copy
    // to a clean buffer-backed Uint8Array to be safe.
    const safeBytes = record.bytes.byteOffset === 0 &&
      record.bytes.byteLength === record.bytes.buffer.byteLength
      ? record.bytes
      : record.bytes.slice();
    await db.put(IDB_CHUNKS_STORE, {
      hash: record.hash,
      bytes: safeBytes,
      byteLength: record.byteLength,
      createdAt: record.createdAt,
    });
  }

  async get(hash: string): Promise<ChunkRecord | null> {
    const db = await this.db();
    const r = (await db.get(IDB_CHUNKS_STORE, hash)) as ChunkRecord | undefined;
    return r ?? null;
  }

  async getMany(hashes: readonly string[]): Promise<ReadonlyArray<ChunkRecord | null>> {
    const db = await this.db();
    const tx = db.transaction(IDB_CHUNKS_STORE, 'readonly');
    const out = await Promise.all(
      hashes.map((h) => tx.store.get(h) as Promise<ChunkRecord | undefined>),
    );
    await tx.done;
    return out.map((r) => r ?? null);
  }

  async has(hash: string): Promise<boolean> {
    const db = await this.db();
    const k = await db.getKey(IDB_CHUNKS_STORE, hash);
    return k !== undefined;
  }

  async delete(hash: string): Promise<boolean> {
    const db = await this.db();
    const tx = db.transaction(IDB_CHUNKS_STORE, 'readwrite');
    const k = await tx.store.getKey(hash);
    if (k === undefined) {
      await tx.done;
      return false;
    }
    await tx.store.delete(hash);
    await tx.done;
    return true;
  }

  async listHashes(): Promise<readonly string[]> {
    const db = await this.db();
    const keys = await db.getAllKeys(IDB_CHUNKS_STORE);
    return keys.map(String);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }
}
