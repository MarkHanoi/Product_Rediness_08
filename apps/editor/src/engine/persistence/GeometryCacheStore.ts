/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System (NEW FILE) — IndexedDB persistence wrapper
 * Phase:             Project-Load-Performance Phase 7 (§8) — FOUNDATION ONLY
 * Files Modified:    src/core/persistence/GeometryCacheStore.ts (new)
 * Classification:    A
 *
 * Impact Assessment:
 *   Store Reads:      NO — pure IndexedDB wrapper
 *   Store Writes:     NO
 *   Event Bus:        NO (a BroadcastChannel is exposed for multi-tab
 *                     write notifications but the store does not publish
 *                     PRYZM event-bus events)
 *   Builder Calls:    NO — not yet wired into any FragmentBuilder
 *   Command Dispatch: NO — passive infrastructure
 *
 * Risk Level:   None — module is unreferenced by production code in this
 *               commit. Wiring is deferred to Phase 7-extension after
 *               Contract 50 (Client-Side Geometry Cache) is drafted.
 *               See PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md
 *               §8 + §18.2 Phase 7 STATUS for the full deferral rationale.
 *
 * Rationale:
 *   §8 of the 13-phase plan promises "second open of the same project
 *   finishes geometry rebuild in <300 ms" by persisting per-element
 *   BufferGeometry buffers across browser sessions. §18.2 critique #1
 *   warns that any cache key that omits any of the 11 inputs that
 *   actually drive geometry will produce silent stale-mesh corruption.
 *   This file is the typed wrapper around IndexedDB; the per-element
 *   key composers (composeWallGeometryHash, future composeSlabGeometryHash,
 *   etc.) live in their respective element folders so the silent-corruption
 *   surface is fenced into the specific element types.
 *
 *   The wrapper deliberately contains every safety hook §8 requires
 *   (schema-version invalidation, navigator.storage.estimate quota
 *   degradation, BroadcastChannel multi-tab notification, fire-and-forget
 *   writes that swallow quota errors) so that the eventual builder wiring
 *   in Phase 7-extension is a pure call-site change with zero new
 *   infrastructure design.
 *
 * Schema-version invalidation:
 *   The cache is keyed against `SNAPSHOT_SCHEMA_VERSION` from
 *   ProjectSerializer.ts. On `init()` the wrapper reads the previously-
 *   stored version from a tiny `_meta` object store; if it does not
 *   match the current SNAPSHOT_SCHEMA_VERSION the entire object store
 *   is wiped and the new version is written. This matches §8 step 5
 *   "On schema-version bump, wipe the entire cache".
 *
 * Multi-tab safety:
 *   A BroadcastChannel named `pryzm-geometry-cache` is opened on init.
 *   Every successful `put()` posts `{ kind: 'put', key }` so other tabs
 *   can invalidate any in-memory mirror they hold. Phase 7-extension
 *   may also use the same channel for a single-writer election; the
 *   foundation just provides the pipe.
 *
 * Quota handling:
 *   Before the first `put()` of a session the wrapper queries
 *   `navigator.storage.estimate()`. If `(usage / quota) > QUOTA_WATERMARK`
 *   subsequent `put()` calls become no-ops (the cache is read-only for
 *   the rest of the session). All `put()` errors are caught, logged via
 *   console.warn, and never thrown — the render pipeline must never
 *   block on a cache write.
 *
 * Storage shape:
 *   Per §18.2 critique #2, all geometry buffers are stored as the
 *   underlying ArrayBuffer (NOT JSON-stringified) so the WebGPU TSL
 *   pipeline (Contract 15) can hydrate them with zero re-encoding.
 *   IndexedDB natively supports structured-clone of ArrayBuffer values.
 */

import { SNAPSHOT_SCHEMA_VERSION } from './ProjectSerializer';

/** Persisted geometry payload — all buffers stored as raw ArrayBuffer. */
export interface GeometryCacheEntry {
    /** Vertex positions (x,y,z triplets), Float32Array.buffer. */
    positions: ArrayBuffer;
    /** Triangle indices, Uint32Array.buffer (or Uint16Array for small meshes — see `indicesType`). */
    indices: ArrayBuffer;
    /** Per-vertex normals, Float32Array.buffer. */
    normals: ArrayBuffer;
    /** Optional UVs, Float32Array.buffer. May be undefined when an element has no texture. */
    uvs?: ArrayBuffer;
    /** 'u16' or 'u32' so consumers know which view to construct over `indices`. */
    indicesType: 'u16' | 'u32';
    /** Bounding-box min corner — used by consumers for the §8 acceptance bbox-validation check. */
    bboxMin: [number, number, number];
    /** Bounding-box max corner. */
    bboxMax: [number, number, number];
    /** Wall-clock unix-ms of last access — drives LRU eviction in Phase 7-extension. */
    lastAccessedMs: number;
}

const DB_NAME = 'pryzm-geometry-cache';
const DB_VERSION = 1;
const STORE_GEOMETRY = 'geometry';
const STORE_META = '_meta';
const META_KEY_SCHEMA_VERSION = 'snapshotSchemaVersion';

/**
 * Quota high-water mark — once IndexedDB usage exceeds this fraction of
 * the browser-granted quota, the wrapper goes read-only for the rest of
 * the session. Conservative default; Phase 7-extension may raise it.
 */
const QUOTA_WATERMARK = 0.85;

const BROADCAST_CHANNEL_NAME = 'pryzm-geometry-cache';

/**
 * Typed IndexedDB wrapper for cached BufferGeometry buffers.
 *
 * Singleton — there is one cache per origin per browser. All consumers
 * call the same exported `geometryCacheStore`. The constructor is private
 * by convention; consumers obtain the singleton from `getGeometryCacheStore()`.
 *
 * Lifecycle:
 *   1. Construct (no I/O).
 *   2. Call `init()` on app boot (idempotent — safe to call from many
 *      sites; the underlying open is reference-counted).
 *   3. Use `get()` / `put()` / `delete()` freely after init resolves.
 *   4. The wrapper never closes the connection — IndexedDB closes it
 *      automatically on tab unload.
 */
export class GeometryCacheStore {
    private _db: IDBDatabase | null = null;
    private _initPromise: Promise<void> | null = null;
    private _disabled = false;
    private _readOnly = false;
    private _broadcast: BroadcastChannel | null = null;

    /**
     * Idempotent — first call opens the DB and runs schema-invalidation;
     * subsequent calls return the same in-flight or settled promise.
     * Never throws — on failure the wrapper sets `_disabled = true` and
     * all subsequent `get/put/delete` become no-ops (graceful degrade).
     */
    init(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        if (typeof indexedDB === 'undefined') {
            console.warn('[GeometryCacheStore] indexedDB unavailable — cache disabled.');
            this._disabled = true;
            this._initPromise = Promise.resolve();
            return this._initPromise;
        }
        this._initPromise = this._open()
            .then(() => this._invalidateOnSchemaChange())
            .then(() => this._openBroadcastChannel())
            .catch((err) => {
                console.warn('[GeometryCacheStore] init failed — cache disabled:', err);
                this._disabled = true;
            });
        return this._initPromise;
    }

    /**
     * Returns the cached entry for `key`, or `null` on miss / disabled / error.
     * Updates `lastAccessedMs` fire-and-forget (LRU bookkeeping for the future
     * eviction policy in Phase 7-extension).
     */
    async get(key: string): Promise<GeometryCacheEntry | null> {
        if (this._disabled || !this._db) return null;
        try {
            const entry = await this._readOne(key);
            if (entry) {
                entry.lastAccessedMs = Date.now();
                this._writeOne(key, entry).catch(() => { /* swallow — read still succeeded */ });
            }
            return entry;
        } catch (err) {
            console.warn('[GeometryCacheStore] get failed for key', key, err);
            return null;
        }
    }

    /**
     * Fire-and-forget write — never blocks the render pipeline. Errors are
     * logged via console.warn but not thrown. Quota errors trigger the
     * `_readOnly = true` latch so subsequent puts are skipped for the
     * rest of the session.
     */
    async put(key: string, entry: GeometryCacheEntry): Promise<void> {
        if (this._disabled || this._readOnly || !this._db) return;
        try {
            await this._maybeCheckQuota();
            if (this._readOnly) return;
            await this._writeOne(key, entry);
            this._broadcast?.postMessage({ kind: 'put', key });
        } catch (err) {
            const name = (err as { name?: string } | null)?.name ?? '';
            if (name === 'QuotaExceededError') {
                console.warn('[GeometryCacheStore] quota exceeded — going read-only for the session.');
                this._readOnly = true;
            } else {
                console.warn('[GeometryCacheStore] put failed for key', key, err);
            }
        }
    }

    async delete(key: string): Promise<void> {
        if (this._disabled || !this._db) return;
        try {
            await this._tx(STORE_GEOMETRY, 'readwrite', (store) => store.delete(key));
            this._broadcast?.postMessage({ kind: 'delete', key });
        } catch (err) {
            console.warn('[GeometryCacheStore] delete failed for key', key, err);
        }
    }

    async clear(): Promise<void> {
        if (this._disabled || !this._db) return;
        try {
            await this._tx(STORE_GEOMETRY, 'readwrite', (store) => store.clear());
            this._broadcast?.postMessage({ kind: 'clear' });
        } catch (err) {
            console.warn('[GeometryCacheStore] clear failed:', err);
        }
    }

    /**
     * Subscribe to multi-tab cache mutation events. Returns an unsubscribe
     * function. Phase 7-extension uses this to invalidate any in-memory
     * mirror of cache contents when a sibling tab writes.
     */
    onRemoteMutation(handler: (msg: { kind: 'put' | 'delete' | 'clear'; key?: string }) => void): () => void {
        if (!this._broadcast) return () => { /* no-op */ };
        const fn = (e: MessageEvent) => handler(e.data);
        this._broadcast.addEventListener('message', fn);
        return () => this._broadcast?.removeEventListener('message', fn);
    }

    /** Test/diagnostic — exposes whether the store has gone read-only. */
    get isReadOnly(): boolean { return this._readOnly; }
    get isDisabled(): boolean { return this._disabled; }

    // ── Internals ────────────────────────────────────────────────────────────

    private _open(): Promise<void> {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_GEOMETRY)) {
                    db.createObjectStore(STORE_GEOMETRY);
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META);
                }
            };
            req.onsuccess = () => { this._db = req.result; resolve(); };
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IndexedDB open blocked'));
        });
    }

    private async _invalidateOnSchemaChange(): Promise<void> {
        const stored = await this._tx(STORE_META, 'readonly', (s) => s.get(META_KEY_SCHEMA_VERSION));
        if (stored !== SNAPSHOT_SCHEMA_VERSION) {
            console.log(
                `[GeometryCacheStore] schema version mismatch (stored=${stored ?? 'none'}, ` +
                `current=${SNAPSHOT_SCHEMA_VERSION}) — wiping cache.`,
            );
            await this._tx(STORE_GEOMETRY, 'readwrite', (s) => s.clear());
            await this._tx(STORE_META, 'readwrite', (s) => s.put(SNAPSHOT_SCHEMA_VERSION, META_KEY_SCHEMA_VERSION));
        }
    }

    private _openBroadcastChannel(): void {
        if (typeof BroadcastChannel === 'undefined') return;
        try {
            this._broadcast = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        } catch {
            // Some embedded webviews block BroadcastChannel; survive silently.
            this._broadcast = null;
        }
    }

    private _quotaCheckedThisSession = false;

    private async _maybeCheckQuota(): Promise<void> {
        if (this._quotaCheckedThisSession) return;
        this._quotaCheckedThisSession = true;
        try {
            const est = await navigator.storage?.estimate?.();
            if (!est || !est.quota || !est.usage) return;
            if (est.usage / est.quota > QUOTA_WATERMARK) {
                console.warn(
                    `[GeometryCacheStore] storage usage ${(est.usage / 1024 / 1024).toFixed(1)} MiB / ` +
                    `${(est.quota / 1024 / 1024).toFixed(1)} MiB above ${QUOTA_WATERMARK * 100}% — going read-only.`,
                );
                this._readOnly = true;
            }
        } catch {
            // navigator.storage may not exist on older browsers — allow writes.
        }
    }

    private _readOne(key: string): Promise<GeometryCacheEntry | null> {
        return this._tx(STORE_GEOMETRY, 'readonly', (s) => s.get(key)) as Promise<GeometryCacheEntry | null>;
    }

    private _writeOne(key: string, entry: GeometryCacheEntry): Promise<void> {
        return this._tx(STORE_GEOMETRY, 'readwrite', (s) => s.put(entry, key)) as unknown as Promise<void>;
    }

    private _tx<T>(
        storeName: string,
        mode: IDBTransactionMode,
        op: (store: IDBObjectStore) => IDBRequest<T>,
    ): Promise<T | null> {
        return new Promise((resolve, reject) => {
            if (!this._db) { reject(new Error('GeometryCacheStore not initialised')); return; }
            const tx = this._db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const req = op(store);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    }
}

let _singleton: GeometryCacheStore | null = null;

/**
 * Returns the process-wide singleton wrapper. Construction is cheap (no I/O);
 * call `init()` separately when ready to actually open the database.
 */
export function getGeometryCacheStore(): GeometryCacheStore {
    if (!_singleton) _singleton = new GeometryCacheStore();
    return _singleton;
}
