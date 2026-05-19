/**
 * IndexedDBStore — C05 §1.2 (amended) tier 2.5 offline-first project cache.
 *
 * Stores the last-known project snapshot (JSON blob) and optional geometry
 * cache blobs so the app can open a project in read-only offline mode when
 * Supabase is unreachable.  This is a THIN PROJECT-SNAPSHOT FACADE on top of
 * the browser's native `indexedDB` global (not the `idb` helper used by
 * `IndexedDbBackend` for the event log) — the two stores are intentionally
 * separate because their schemas, lifecycles, and consumers differ.
 *
 * DB name:    `pryzm-offline-v1`
 * DB version: 1
 * Stores:
 *   • `snapshots`     — keyPath `projectId`; value: `{ projectId, snapshot, savedAt }`.
 *   • `geometryCache` — keyPath `key`;       value: any blob.
 *
 * CONTRACT (C05 §1.2 amended):
 *   - Active whenever a project has been opened at least once on this device.
 *   - MUST display "Offline — read only" banner (see `OfflineBanner.ts`) when
 *     the app is serving content from this cache.
 *   - MUST NOT block the main thread: every method is async.
 *
 * Wave A17-T8/T9 (2026-05-03).
 */
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.persistence-client.indexeddb');

const DB_NAME = 'pryzm-offline-v1';
const DB_VERSION = 1;

export class IndexedDBStore {
  private _db: IDBDatabase | null = null;

  /** Open (or upgrade) the IDB database. Idempotent — repeat calls are no-ops. */
  async init(): Promise<void> {
    if (this._db !== null) return;
    const span = _tracer.startSpan('pryzm.persistence.idb.init');
    try {
      this._db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (ev) => {
          const db = (ev.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('snapshots')) {
            db.createObjectStore('snapshots', { keyPath: 'projectId' });
          }
          if (!db.objectStoreNames.contains('geometryCache')) {
            db.createObjectStore('geometryCache', { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      span.end();
    }
  }

  /**
   * Persist the latest project snapshot for offline access.
   * Pass any JSON-serialisable project shape (typically `ProjectSnapshot`
   * from `@pryzm/protocol`).
   */
  async saveSnapshot(projectId: string, snapshot: unknown): Promise<void> {
    const span = _tracer.startSpan('pryzm.persistence.idb.saveSnapshot');
    try {
      await this._put('snapshots', { projectId, snapshot, savedAt: Date.now() });
    } finally {
      span.end();
    }
  }

  /**
   * Load the last-persisted snapshot for `projectId`.
   * Returns `null` when no snapshot exists yet (project never opened offline).
   */
  async loadSnapshot(projectId: string): Promise<unknown | null> {
    const span = _tracer.startSpan('pryzm.persistence.idb.loadSnapshot');
    try {
      const record = await this._get<{ snapshot: unknown } | undefined>(
        'snapshots',
        projectId,
      );
      return record?.snapshot ?? null;
    } finally {
      span.end();
    }
  }

  /** Returns `true` if a snapshot for `projectId` has been stored on this device. */
  async isAvailable(projectId: string): Promise<boolean> {
    const record = await this._get<unknown>('snapshots', projectId);
    return record != null;
  }

  /** Delete a stored snapshot (e.g. when the project is deleted). */
  async deleteSnapshot(projectId: string): Promise<void> {
    const span = _tracer.startSpan('pryzm.persistence.idb.deleteSnapshot');
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this._db!.transaction('snapshots', 'readwrite');
        const req = tx.objectStore('snapshots').delete(projectId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      span.end();
    }
  }

  // ─────────────────────────────────────────────────── private helpers

  private _put(store: string, value: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private _get<T>(store: string, key: string): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = this._db!.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }
}
