// IndexedDBStore — ADR-048 · Task 4.3
//
// Async key-value store backed by the browser's IndexedDB API.
// Used by `ElementStore` as the overflow tier: elements evicted from the
// `LRUElementMap` are serialized here; cache-miss reads deserialize them
// back into the LRU map.
//
// Design invariants:
//   P2 — No import from 'three' or '@pryzm/renderer-three/three'.
//   P3 — No requestAnimationFrame usage.
//
// Testability:
//   The constructor accepts an optional `IDBFactory` parameter.  Tests pass
//   an in-memory implementation (see `__tests__/` helper); production code
//   uses `globalThis.indexedDB` (the default).
//
// Error handling:
//   `write()` and `delete()` are fire-and-forget; failures are logged as
//   warnings (non-fatal: the LRU cache remains authoritative).
//   `read()` rejects the returned Promise on IDB errors so callers can
//   handle cache-miss failures explicitly.
//
// Serialisation:
//   Values are serialised via `JSON.stringify` / `JSON.parse`.  The schema
//   layer (Zod) sits above this class and validates before/after.

// ---------------------------------------------------------------------------
// IDB backend interface (injectable for testing)
// ---------------------------------------------------------------------------

/**
 * Subset of the native IDBFactory API used by IndexedDBStore.
 * Pass a conforming implementation in tests (e.g., an in-memory IDB).
 */
export interface IDBFactoryLike {
    open(name: string, version: number): IDBOpenDBRequestLike;
}

export interface IDBOpenDBRequestLike {
    result: IDBDatabaseLike;
    error:  DOMException | null;
    onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => void) | null;
    onsuccess:       ((this: IDBRequest<IDBDatabase>) => void) | null;
    onerror:         ((this: IDBRequest<IDBDatabase>) => void) | null;
}

export interface IDBDatabaseLike {
    createObjectStore(name: string): void;
    transaction(storeNames: string, mode: IDBTransactionMode): IDBTransactionLike;
    close(): void;
}

export interface IDBTransactionLike {
    objectStore(name: string): IDBObjectStoreLike;
}

export interface IDBObjectStoreLike {
    put(value: unknown, key: string): IDBRequestLike<void>;
    get(key: string): IDBRequestLike<unknown>;
    delete(key: string): IDBRequestLike<void>;
}

export interface IDBRequestLike<T> {
    result:    T;
    error:     DOMException | null;
    onsuccess: ((this: IDBRequest) => void) | null;
    onerror:   ((this: IDBRequest) => void) | null;
}

// ---------------------------------------------------------------------------
// IndexedDBStore
// ---------------------------------------------------------------------------

export class IndexedDBStore<V> {
    private readonly _dbName:    string;
    private readonly _storeName: string;
    private readonly _factory:   IDBFactoryLike;

    /** Resolved once the database is successfully opened. */
    private _dbPromise: Promise<IDBDatabaseLike> | null = null;
    /** Cached resolved database handle (null until first open). */
    private _db: IDBDatabaseLike | null = null;
    /** Set to true after `close()` to prevent further IDB operations. */
    private _closed = false;

    /**
     * @param dbName    IndexedDB database name (unique per store type + project).
     * @param storeName Object-store name within the database.
     * @param factory   IDBFactory implementation.  Defaults to `globalThis.indexedDB`.
     *                  Pass an in-memory implementation for unit tests.
     */
    constructor(
        dbName:    string,
        storeName: string,
        factory?:  IDBFactoryLike,
    ) {
        this._dbName    = dbName;
        this._storeName = storeName;
        this._factory   = factory ?? (globalThis as unknown as { indexedDB: IDBFactoryLike }).indexedDB;
    }

    // ── Public API ─────────────────────────────────────────────────────

    /**
     * Persist a value under `key`.  Fire-and-forget — errors are logged
     * but not propagated.  The write is enqueued as soon as the database
     * is ready (lazy open on first call).
     */
    write(key: string, value: V): void {
        if (this._closed) return;
        this._open().then(db => {
            const tx   = db.transaction(this._storeName, 'readwrite');
            const req  = tx.objectStore(this._storeName).put(JSON.stringify(value), key);
            req.onerror = () => {
                console.warn(`[IndexedDBStore:${this._dbName}] write failed for "${key}":`, req.error);
            };
        }).catch(err => {
            console.warn(`[IndexedDBStore:${this._dbName}] write: could not open DB:`, err);
        });
    }

    /**
     * Read and deserialise a value by key.
     * Returns `null` if the key is absent, the raw value is null / undefined,
     * or JSON parsing fails.
     *
     * Cache-miss latency target (NFT): ≤ 2 ms p95.
     */
    async read(key: string): Promise<V | null> {
        if (this._closed) return null;
        const db = await this._open();
        return new Promise<V | null>((resolve, reject) => {
            const tx  = db.transaction(this._storeName, 'readonly');
            const req = tx.objectStore(this._storeName).get(key);
            req.onsuccess = () => {
                const raw = req.result;
                if (raw === undefined || raw === null) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(raw as string) as V);
                } catch {
                    console.warn(
                        `[IndexedDBStore:${this._dbName}] read: JSON parse failed for "${key}".`,
                    );
                    resolve(null);
                }
            };
            req.onerror = () => {
                reject(
                    new Error(
                        `[IndexedDBStore:${this._dbName}] read failed for "${key}": ` +
                        String(req.error),
                    ),
                );
            };
        });
    }

    /**
     * Delete a key from the store.  Fire-and-forget.
     * Called when an element is permanently removed from the ElementStore.
     */
    delete(key: string): void {
        if (this._closed) return;
        this._open().then(db => {
            const tx  = db.transaction(this._storeName, 'readwrite');
            const req = tx.objectStore(this._storeName).delete(key);
            req.onerror = () => {
                console.warn(`[IndexedDBStore:${this._dbName}] delete failed for "${key}":`, req.error);
            };
        }).catch(() => {
            // Non-fatal: element already evicted, DB unavailable.
        });
    }

    /**
     * Close the underlying IndexedDB connection.
     * Should be called when the project is closed or the store is disposed.
     * Subsequent `write()` / `read()` / `delete()` calls are no-ops / return null.
     */
    close(): void {
        this._closed = true;
        this._db?.close();
        this._db = null;
        this._dbPromise = null;
    }

    /** True after `close()` has been called. */
    get isClosed(): boolean {
        return this._closed;
    }

    // ── Lazy database open ─────────────────────────────────────────────

    /**
     * Open (or reuse) the IndexedDB connection.  Idempotent — concurrent
     * callers share the same Promise.
     */
    private _open(): Promise<IDBDatabaseLike> {
        if (this._db !== null) return Promise.resolve(this._db);
        if (this._dbPromise !== null) return this._dbPromise;

        this._dbPromise = new Promise<IDBDatabaseLike>((resolve, reject) => {
            const req = this._factory.open(this._dbName, 1);

            req.onupgradeneeded = () => {
                // Create the object store on first open (version 1 → 2 upgrade
                // is not expected in the initial schema).
                try {
                    req.result.createObjectStore(this._storeName);
                } catch {
                    // Store already exists — safe to ignore.
                }
            };

            req.onsuccess = () => {
                this._db = req.result;
                resolve(req.result);
            };

            req.onerror = () => {
                this._dbPromise = null; // allow retry
                reject(
                    new Error(
                        `[IndexedDBStore] Could not open database "${this._dbName}": ` +
                        String(req.error),
                    ),
                );
            };
        });

        return this._dbPromise;
    }
}
