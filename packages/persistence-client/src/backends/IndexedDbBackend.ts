/// <reference lib="dom" />
// IndexedDB backend — SKETCH ONLY for S03 (`phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 377).
//
// The full implementation lands in S04 alongside ADR-004 (codec choice).
// What we ship here is the design *as code*: the types are correct, the
// single-writer queue (mitigation for R1A-06) is wired, and the IDB
// schema is fixed.  The actual DB calls are gated behind a runtime
// `_assertImplemented()` so any caller in S03 fails loudly instead of
// silently dropping events.
//
// IDB schema (frozen at this sketch — S04 must not change it without
// bumping `IDB_DB_VERSION` and adding a migration):
//
//   DB:        `pryzm-eventlog-${projectId}`
//   Version:   1
//   Stores:
//     • `events` — keyPath `seq`, sole value is a `PersistedEvent`.
//     • `meta`   — keyPath `key`, single record `{ key:'checkpoint', seq:number }`.
//
// Single-writer queue:
//   `append()` chains every write onto the same promise so the IDB
//   transaction sequence is deterministic.  Without this, two
//   concurrent `append()`s could open overlapping read-write
//   transactions on `events` — IDB serialises them anyway, but the
//   chained-promise design makes the order visible to callers and
//   short-circuits a second open if the first is still in flight.

import { openDB, type IDBPDatabase } from 'idb';
import {
  EventLogClosedError,
  type Backend,
  type PersistedEvent,
} from '../types.js';

export const IDB_DB_NAME_PREFIX = 'pryzm-eventlog-';
export const IDB_DB_VERSION = 1;
export const IDB_EVENTS_STORE = 'events';
export const IDB_META_STORE = 'meta';
export const IDB_CHECKPOINT_KEY = 'checkpoint';

export interface IndexedDbBackendOptions {
  /** Per-project DB name suffix.  REQUIRED — projects MUST be isolated. */
  projectId: string;
}

export class IndexedDbBackend implements Backend {
  private readonly dbName: string;
  private db: IDBPDatabase | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(opts: IndexedDbBackendOptions) {
    if (!opts.projectId) {
      throw new Error('[IndexedDbBackend] options.projectId is required.');
    }
    this.dbName = IDB_DB_NAME_PREFIX + opts.projectId;
  }

  /**
   * Open (or create) the IDB database.  Idempotent — repeat calls
   * resolve to the existing handle.  S03 ships the schema; S04 will
   * add the `bytes: Uint8Array` column once ADR-004 ratifies the codec.
   */
  async open(): Promise<void> {
    if (this.closed) throw new EventLogClosedError();
    if (this.db !== null) return;
    if (typeof globalThis.indexedDB === 'undefined') {
      throw new Error(
        '[IndexedDbBackend] globalThis.indexedDB is not available in this environment.  ' +
          'Use InMemoryBackend in headless Node.',
      );
    }
    this.db = await openDB(this.dbName, IDB_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_EVENTS_STORE)) {
          db.createObjectStore(IDB_EVENTS_STORE, { keyPath: 'seq' });
        }
        if (!db.objectStoreNames.contains(IDB_META_STORE)) {
          db.createObjectStore(IDB_META_STORE, { keyPath: 'key' });
        }
      },
    });
  }

  // ────────────────────────────────────────────────────────────── Backend
  async append(event: PersistedEvent): Promise<void> {
    if (this.closed) throw new EventLogClosedError();
    // Single-writer queue (R1A-06 mitigation) — chain every write so
    // IDB transactions are committed in the order callers issued them.
    const ours = this.writeQueue.then(async () => {
      const db = await this.requireDb();
      const tx = db.transaction(IDB_EVENTS_STORE, 'readwrite');
      await tx.store.put(event);
      await tx.done;
    });
    this.writeQueue = ours.catch(() => {
      /* prior caller already received the rejection on their own promise */
    });
    await ours;
  }

  async *replay(fromSeq: number): AsyncIterable<PersistedEvent> {
    if (this.closed) throw new EventLogClosedError();
    const db = await this.requireDb();
    const tx = db.transaction(IDB_EVENTS_STORE, 'readonly');
    const range = IDBKeyRange.lowerBound(fromSeq);
    let cursor = await tx.store.openCursor(range);
    while (cursor) {
      yield cursor.value as PersistedEvent;
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async checkpoint(seq: number): Promise<void> {
    if (this.closed) throw new EventLogClosedError();
    const db = await this.requireDb();
    const tx = db.transaction(IDB_META_STORE, 'readwrite');
    await tx.store.put({ key: IDB_CHECKPOINT_KEY, seq });
    await tx.done;
  }

  async highestSeq(): Promise<number> {
    if (this.closed) throw new EventLogClosedError();
    const db = await this.requireDb();
    const tx = db.transaction(IDB_EVENTS_STORE, 'readonly');
    // `openCursor` with `'prev'` returns the highest key first.
    const cursor = await tx.store.openCursor(null, 'prev');
    const seq = cursor ? (cursor.key as number) : 0;
    await tx.done;
    return seq;
  }

  async lastCheckpoint(): Promise<number> {
    if (this.closed) throw new EventLogClosedError();
    const db = await this.requireDb();
    const tx = db.transaction(IDB_META_STORE, 'readonly');
    const record = (await tx.store.get(IDB_CHECKPOINT_KEY)) as
      | { key: string; seq: number }
      | undefined;
    await tx.done;
    return record?.seq ?? 0;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Drain pending writes before closing the handle.
    await this.writeQueue.catch(() => {
      /* errors already surfaced */
    });
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
  }

  // ────────────────────────────────────────────────────────────── helpers
  private async requireDb(): Promise<IDBPDatabase> {
    if (this.db === null) await this.open();
    if (this.db === null) {
      throw new Error('[IndexedDbBackend] failed to open database.');
    }
    return this.db;
  }
}
