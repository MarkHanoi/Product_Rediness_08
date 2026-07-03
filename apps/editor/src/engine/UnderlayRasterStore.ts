/**
 * @file UnderlayRasterStore.ts
 * §FIX-UNDERLAY-DELETE-AND-STORAGE (L-45)
 *
 * IndexedDB-backed, per-project store for the floor-plan underlay RASTER
 * (the rasterised PDF / JPG / PNG page as a base64 data URL), keyed by project id.
 *
 * WHY THIS EXISTS — the QuotaExceededError root cause:
 *   UnderlayPersistence used to serialise the ENTIRE record — including the
 *   multi-MB `imageDataUrl` raster — into one localStorage key
 *   (`pryzm.floorPlanUnderlay.v2.<projectId>`). A single A1 plan easily exceeds
 *   the ~5 MB localStorage budget, so `localStorage.setItem` threw
 *   `QuotaExceededError` and the underlay silently failed to persist.
 *
 *   Fix: the raster BYTES live here, in IndexedDB (origin quota is typically
 *   hundreds of MB — orders of magnitude more than localStorage). The
 *   `pryzm.floorPlanUnderlay.v2.<projectId>` localStorage record now carries only
 *   lightweight METADATA (transform / scale / dimensions / lock / visibility),
 *   which is tiny and never blows the quota.
 *
 * Design (mirrors ThumbnailCacheStore.ts / GeometryCacheStore.ts — the codebase's
 * existing IDB pattern):
 *   • One object store `rasters` keyed by project id; value = data URL string.
 *   • Async get / put / delete. The underlay restore + save paths are already
 *     async (texture decode / FileReader), so no synchronous mirror is required.
 *   • Never throws — a failed raster write must NEVER abort the metadata save,
 *     and a cold / disabled IDB simply degrades to "no persisted underlay".
 *
 * Project isolation (Contract 48): keyed strictly by projectId. Deleting a
 * project's underlay (or the project itself) removes its raster via delete().
 */

const DB_NAME = 'pryzm-underlay-rasters';
const DB_VERSION = 1;
const STORE = 'rasters';

class UnderlayRasterStore {
    private _db: IDBDatabase | null = null;
    private _initPromise: Promise<void> | null = null;
    private _disabled = false;

    /** Idempotent open. Never throws — disables the IDB layer on failure. */
    private init(): Promise<void> {
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
                    console.warn('[UnderlayRasterStore] open failed — IDB disabled:', req.error);
                    this._disabled = true;
                    resolve();
                };
                req.onblocked = () => { this._disabled = true; resolve(); };
            } catch (err) {
                console.warn('[UnderlayRasterStore] init threw — IDB disabled:', err);
                this._disabled = true;
                resolve();
            }
        });
        return this._initPromise;
    }

    /** Read the raster data URL for `projectId`. Null on miss / disabled / error. */
    async get(projectId: string): Promise<string | null> {
        if (!projectId) return null;
        await this.init();
        if (this._disabled || !this._db) return null;
        try {
            return await new Promise<string | null>((resolve) => {
                const tx = this._db!.transaction(STORE, 'readonly');
                const req = tx.objectStore(STORE).get(projectId);
                req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
                req.onerror = () => resolve(null);
            });
        } catch (err) {
            console.warn('[UnderlayRasterStore] get failed (non-fatal):', err);
            return null;
        }
    }

    /**
     * Persist the raster data URL for `projectId`. Resolves true on success,
     * false on any failure (disabled IDB, quota, private mode) — NEVER throws,
     * so a raster write can't abort the metadata save.
     */
    async put(projectId: string, dataUrl: string): Promise<boolean> {
        if (!projectId || !dataUrl) return false;
        await this.init();
        if (this._disabled || !this._db) return false;
        try {
            return await new Promise<boolean>((resolve) => {
                const tx = this._db!.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(dataUrl, projectId);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => {
                    const name = (tx.error as { name?: string } | null)?.name ?? '';
                    if (name !== 'QuotaExceededError') {
                        console.warn('[UnderlayRasterStore] put failed (non-fatal):', tx.error);
                    }
                    resolve(false);
                };
                tx.onabort = () => resolve(false);
            });
        } catch (err) {
            console.warn('[UnderlayRasterStore] put threw (non-fatal):', err);
            return false;
        }
    }

    /** Drop a project's raster from IDB. Never throws. */
    async delete(projectId: string): Promise<void> {
        if (!projectId) return;
        await this.init();
        if (this._disabled || !this._db) return;
        try {
            await new Promise<void>((resolve) => {
                const tx = this._db!.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(projectId);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            });
        } catch { /* non-fatal */ }
    }
}

let _singleton: UnderlayRasterStore | null = null;

/** Process-wide singleton underlay raster cache. */
export function getUnderlayRasterStore(): UnderlayRasterStore {
    if (!_singleton) _singleton = new UnderlayRasterStore();
    return _singleton;
}

export type { UnderlayRasterStore };
