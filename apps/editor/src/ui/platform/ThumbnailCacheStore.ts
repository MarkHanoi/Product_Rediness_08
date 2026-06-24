/**
 * ThumbnailCacheStore — §HUB-THUMBNAIL-STORAGE (2026-06-24)
 *
 * IndexedDB-backed cache for project-card thumbnail data URLs, keyed by project id.
 *
 * WHY THIS EXISTS — the quota-spam + blank-thumbnail root cause:
 *   Thumbnails are ~5–500 KB WebP data URLs. They USED to be stored inline in the
 *   single `bim-projects-index` localStorage blob (one `ProjectMeta.thumbnail`
 *   string per project). With ~50 projects the index blob alone blew the ~5 MB
 *   localStorage budget, so `saveProject`'s `setItem` threw QuotaExceededError.
 *   The eviction fallback (`_setItemWithEviction`) can only drop OTHER projects'
 *   `bim-project-*-versions` stores — it can NEVER shrink the index's own inline
 *   thumbnail payload — so it ran out of things to evict ("eviction exhausted")
 *   and the whole project index failed to persist. Cascade:
 *     • the per-project metadata (name / timestamps / stars) wasn't saved, and
 *     • whichever projects didn't fit rendered the generic "BIM Project"
 *       placeholder card instead of their real preview.
 *
 *   Fix: thumbnail BYTES live here, in IndexedDB (origin quota is typically
 *   hundreds of MB — orders of magnitude more than localStorage). The
 *   `bim-projects-index` now carries only lightweight metadata. The server
 *   already persists thumbnails (`/api/projects/:id/thumbnail` →
 *   `thumbnailUrl` in the project summary), so this is purely a LOCAL cache
 *   relocation — no schema/contract change, and a cold cache simply falls back
 *   to the server URL.
 *
 * Design (mirrors GeometryCacheStore.ts, the codebase's existing IDB pattern):
 *   • One object store `thumbnails` keyed by project id; value = data URL string.
 *   • A synchronous in-memory MIRROR so the (synchronous) project-hub render path
 *     and `ProjectRepository.listProjects()` can read a thumbnail without awaiting
 *     IDB. `warm()` populates the mirror from IDB on hub mount; `put()` updates
 *     both IDB and the mirror; `getSync()` reads the mirror.
 *   • Fire-and-forget writes that swallow quota errors — a thumbnail write must
 *     NEVER block or abort the project-index save (the decoupling the bug needs).
 *   • Graceful degrade: if IndexedDB is unavailable the mirror still works for the
 *     session (in-memory only) and the server URL fallback covers cold loads.
 */

const DB_NAME = 'pryzm-project-thumbnails';
const DB_VERSION = 1;
const STORE = 'thumbnails';

/** Per §HUB-THUMBNAIL-STORAGE — synchronous mirror of id → data URL. */
const _mirror = new Map<string, string>();

class ThumbnailCacheStore {
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
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
                };
                req.onsuccess = () => { this._db = req.result; resolve(); };
                req.onerror = () => {
                    console.warn('[ThumbnailCacheStore] open failed — IDB cache disabled:', req.error);
                    this._disabled = true;
                    resolve();
                };
                req.onblocked = () => { this._disabled = true; resolve(); };
            } catch (err) {
                console.warn('[ThumbnailCacheStore] init threw — IDB cache disabled:', err);
                this._disabled = true;
                resolve();
            }
        });
        return this._initPromise;
    }

    /**
     * Load every stored thumbnail into the synchronous mirror so the hub's
     * (synchronous) render reads them without awaiting. Runs once per session;
     * resolves immediately on a warm/disabled store.
     */
    async warm(): Promise<void> {
        if (this._warmed) return;
        await this.init();
        if (this._disabled || !this._db) { this._warmed = true; return; }
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = this._db!.transaction(STORE, 'readonly');
                const store = tx.objectStore(STORE);
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = () => {
                    const cursor = cursorReq.result;
                    if (cursor) {
                        if (typeof cursor.value === 'string') _mirror.set(String(cursor.key), cursor.value);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                cursorReq.onerror = () => reject(cursorReq.error);
            });
        } catch (err) {
            console.warn('[ThumbnailCacheStore] warm failed (non-fatal):', err);
        }
        this._warmed = true;
    }

    /** Synchronous mirror read — used by the hub render + ProjectRepository. */
    getSync(id: string): string | undefined {
        return _mirror.get(id);
    }

    /**
     * Persist a thumbnail for `id`. Updates the synchronous mirror immediately
     * (so the next render shows it) and writes to IDB fire-and-forget. NEVER
     * throws — a failed thumbnail write must not affect the project-index save.
     */
    put(id: string, dataUrl: string | undefined | null): void {
        if (!dataUrl) return;
        _mirror.set(id, dataUrl);
        // init() is idempotent and cheap; await it inside the fire-and-forget chain.
        this.init().then(() => {
            if (this._disabled || !this._db) return;
            try {
                const tx = this._db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(dataUrl, id);
                tx.onerror = () => {
                    const name = (tx.error as { name?: string } | null)?.name ?? '';
                    if (name !== 'QuotaExceededError') {
                        console.warn('[ThumbnailCacheStore] put failed (non-fatal):', tx.error);
                    }
                };
            } catch (err) {
                console.warn('[ThumbnailCacheStore] put threw (non-fatal):', err);
            }
        }).catch(() => { /* swallow — mirror still holds the value for this session */ });
    }

    /** Drop a project's thumbnail from both IDB and the mirror. */
    delete(id: string): void {
        _mirror.delete(id);
        this.init().then(() => {
            if (this._disabled || !this._db) return;
            try {
                const tx = this._db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(id);
            } catch { /* non-fatal */ }
        }).catch(() => { /* non-fatal */ });
    }
}

let _singleton: ThumbnailCacheStore | null = null;

/** Process-wide singleton thumbnail cache. */
export function getThumbnailCacheStore(): ThumbnailCacheStore {
    if (!_singleton) _singleton = new ThumbnailCacheStore();
    return _singleton;
}

export type { ThumbnailCacheStore };
