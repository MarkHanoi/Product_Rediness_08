/**
 * VersionCacheStore — §VERSION-QUOTA-INDEXEDDB (2026-06-25)
 *
 * IndexedDB-backed durable store for per-project version-history snapshots
 * (compressed BIM scene payloads) and the ServerSyncQueue overflow queue.
 *
 * WHY THIS EXISTS — the large-project quota root cause:
 *   A real founder project (785 elements) produced a 5.4 MB *compressed* version
 *   snapshot. localStorage's origin cap is ~5–10 MB and is SHARED with the project
 *   index, every other project's version store, and the sync queue. So:
 *     • `[VersionRepository] localStorage quota exhausted … Versions NOT saved.`
 *     • `[ServerSyncQueue] Newest queued version exceeds the persist byte budget`
 *   Version history for large projects was silently dropped — it could not survive
 *   a reload even though the SERVER copy saved fine.
 *
 *   Fix: the heavy version BYTES live here, in IndexedDB (origin quota is typically
 *   hundreds of MB — orders of magnitude more than localStorage). The compressed
 *   payload string is stored verbatim (compression is preserved — we store exactly
 *   what `_compressJSON` produced). This is a pure LOCAL storage relocation: the
 *   server persistence path is untouched, and a cold cache simply falls back to the
 *   server version on load.
 *
 * Design (mirrors ThumbnailCacheStore.ts / GeometryCacheStore.ts — the codebase's
 * existing IndexedDB pattern):
 *   • Two object stores:
 *       - `versions`  keyed by projectId        → compressed payload string.
 *       - `syncQueue` keyed by a single fixed key → the serialised sync-queue JSON.
 *   • A synchronous in-memory MIRROR so the (synchronous) version read path
 *     (`VersionRepository.getVersions`, called at project-open to auto-restore)
 *     can read without awaiting IDB. `warm()` populates the mirror from IDB once
 *     per session; `putVersions()` updates both the mirror and IDB; `getVersionsSync()`
 *     reads the mirror.
 *   • Fire-and-forget writes that swallow quota errors — a version-store write must
 *     never throw into a caller that was previously a soft, best-effort save.
 *   • Graceful degrade: if IndexedDB is unavailable the mirror still works for the
 *     session (in-memory only) and the localStorage fallback in the repository
 *     covers cold reloads exactly as before this change.
 */

const DB_NAME = 'pryzm-project-versions';
const DB_VERSION = 1;
const VERSIONS_STORE = 'versions';
const SYNC_QUEUE_STORE = 'syncQueue';
/** Single fixed key for the (singleton) sync-queue payload. */
const SYNC_QUEUE_KEY = 'queue';

/**
 * §VERSION-QUOTA-INDEXEDDB — synchronous mirror of projectId → compressed payload
 * string. Holds exactly what `_compressJSON(JSON.stringify(versions))` produced, so
 * the repository's existing `_decompressJSON` read path is unchanged.
 */
const _versionMirror = new Map<string, string>();

/** Synchronous mirror of the serialised sync-queue JSON (or null = none). */
let _syncQueueMirror: string | null = null;

class VersionCacheStore {
    private _db: IDBDatabase | null = null;
    private _initPromise: Promise<void> | null = null;
    private _disabled = false;
    private _warmed = false;

    /** Idempotent open. Never throws — disables the IDB layer on failure. */
    init(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        if (typeof indexedDB === 'undefined') {
            this._disabled = true;
            this._initPromise = Promise.resolve();
            return this._initPromise;
        }
        this._initPromise = new Promise<void>((resolve) => {
            try {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(VERSIONS_STORE)) db.createObjectStore(VERSIONS_STORE);
                    if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) db.createObjectStore(SYNC_QUEUE_STORE);
                };
                req.onsuccess = () => { this._db = req.result; resolve(); };
                req.onerror = () => {
                    console.warn('[VersionCacheStore] open failed — IDB store disabled:', req.error);
                    this._disabled = true;
                    resolve();
                };
                req.onblocked = () => { this._disabled = true; resolve(); };
            } catch (err) {
                console.warn('[VersionCacheStore] init threw — IDB store disabled:', err);
                this._disabled = true;
                resolve();
            }
        });
        return this._initPromise;
    }

    /**
     * True when the IDB layer is unavailable. Detects the synchronous
     * `indexedDB === undefined` case eagerly so a caller can choose the
     * localStorage fallback BEFORE the async `init()` resolves; a later async
     * open failure also flips this (subsequent writes degrade to mirror-only and
     * callers fall back on the next call).
     */
    isDisabled(): boolean {
        if (!this._disabled && this._initPromise === null && typeof indexedDB === 'undefined') {
            this._disabled = true;
        }
        return this._disabled;
    }

    /**
     * Load every stored version payload + the sync queue into the synchronous
     * mirrors so subsequent synchronous reads (`getVersionsSync`) surface them
     * without awaiting. Runs once per session; resolves immediately on a
     * warm/disabled store. Never throws.
     */
    async warm(): Promise<void> {
        if (this._warmed) return;
        await this.init();
        if (this._disabled || !this._db) { this._warmed = true; return; }
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = this._db!.transaction(VERSIONS_STORE, 'readonly');
                const store = tx.objectStore(VERSIONS_STORE);
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = () => {
                    const cursor = cursorReq.result;
                    if (cursor) {
                        if (typeof cursor.value === 'string') _versionMirror.set(String(cursor.key), cursor.value);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                cursorReq.onerror = () => reject(cursorReq.error);
            });
            await new Promise<void>((resolve) => {
                const tx = this._db!.transaction(SYNC_QUEUE_STORE, 'readonly');
                const getReq = tx.objectStore(SYNC_QUEUE_STORE).get(SYNC_QUEUE_KEY);
                getReq.onsuccess = () => {
                    if (typeof getReq.result === 'string') _syncQueueMirror = getReq.result;
                    resolve();
                };
                getReq.onerror = () => resolve();
            });
        } catch (err) {
            console.warn('[VersionCacheStore] warm failed (non-fatal):', err);
        }
        this._warmed = true;
    }

    /** True once `warm()` has completed (or short-circuited on a disabled store). */
    isWarmed(): boolean { return this._warmed; }

    // ── Version snapshots ──────────────────────────────────────────────────────

    /** Synchronous mirror read — the compressed payload string for a project. */
    getVersionsSync(projectId: string): string | undefined {
        return _versionMirror.get(projectId);
    }

    /**
     * Persist a project's compressed version payload. Updates the synchronous
     * mirror immediately (so the next read sees it) and writes to IDB
     * fire-and-forget. NEVER throws.
     */
    putVersions(projectId: string, payload: string): void {
        _versionMirror.set(projectId, payload);
        this.init().then(() => {
            if (this._disabled || !this._db) return;
            try {
                const tx = this._db.transaction(VERSIONS_STORE, 'readwrite');
                tx.objectStore(VERSIONS_STORE).put(payload, projectId);
                tx.onerror = () => {
                    const name = (tx.error as { name?: string } | null)?.name ?? '';
                    if (name !== 'QuotaExceededError') {
                        console.warn('[VersionCacheStore] putVersions failed (non-fatal):', tx.error);
                    }
                };
            } catch (err) {
                console.warn('[VersionCacheStore] putVersions threw (non-fatal):', err);
            }
        }).catch(() => { /* mirror still holds the value for this session */ });
    }

    /** Drop a project's version payload from both IDB and the mirror. */
    deleteVersions(projectId: string): void {
        _versionMirror.delete(projectId);
        this.init().then(() => {
            if (this._disabled || !this._db) return;
            try {
                const tx = this._db.transaction(VERSIONS_STORE, 'readwrite');
                tx.objectStore(VERSIONS_STORE).delete(projectId);
            } catch { /* non-fatal */ }
        }).catch(() => { /* non-fatal */ });
    }

    // ── Sync queue ─────────────────────────────────────────────────────────────

    /** Synchronous mirror read — the serialised sync-queue JSON, or null. */
    getSyncQueueSync(): string | null {
        return _syncQueueMirror;
    }

    /**
     * Persist the serialised sync-queue JSON. Updates the synchronous mirror
     * immediately and writes to IDB fire-and-forget. NEVER throws.
     */
    putSyncQueue(json: string): void {
        _syncQueueMirror = json;
        this.init().then(() => {
            if (this._disabled || !this._db) return;
            try {
                const tx = this._db.transaction(SYNC_QUEUE_STORE, 'readwrite');
                tx.objectStore(SYNC_QUEUE_STORE).put(json, SYNC_QUEUE_KEY);
                tx.onerror = () => {
                    const name = (tx.error as { name?: string } | null)?.name ?? '';
                    if (name !== 'QuotaExceededError') {
                        console.warn('[VersionCacheStore] putSyncQueue failed (non-fatal):', tx.error);
                    }
                };
            } catch (err) {
                console.warn('[VersionCacheStore] putSyncQueue threw (non-fatal):', err);
            }
        }).catch(() => { /* mirror still holds the value for this session */ });
    }

    /** Drop the persisted sync queue from both IDB and the mirror. */
    clearSyncQueue(): void {
        _syncQueueMirror = null;
        this.init().then(() => {
            if (this._disabled || !this._db) return;
            try {
                const tx = this._db.transaction(SYNC_QUEUE_STORE, 'readwrite');
                tx.objectStore(SYNC_QUEUE_STORE).delete(SYNC_QUEUE_KEY);
            } catch { /* non-fatal */ }
        }).catch(() => { /* non-fatal */ });
    }
}

let _singleton: VersionCacheStore | null = null;

/** Process-wide singleton version + sync-queue cache. */
export function getVersionCacheStore(): VersionCacheStore {
    if (!_singleton) _singleton = new VersionCacheStore();
    return _singleton;
}

export type { VersionCacheStore };
