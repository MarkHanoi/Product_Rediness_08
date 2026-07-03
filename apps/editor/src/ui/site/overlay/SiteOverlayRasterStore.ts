// §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58)
//
// IndexedDB-backed, per-project store for the SITE-PLAN overlay RASTER
// (the rasterised PDF page / JPG / PNG as a base64 data URL), keyed by project id.
//
// WHY THIS EXISTS — the QuotaExceededError root cause (mirrors the L-45 floor-plan
// UnderlayRasterStore, but a SEPARATE, independently-keyed store so the two overlays
// never clobber each other — C13 project isolation):
//   `sitePlanOverlayPersistence` used to serialise the ENTIRE record — including the
//   multi-MB `imageDataUrl` raster — into ONE localStorage key
//   (`pryzm.sitePlanOverlay.v1.<projectId>`). A single survey scan easily exceeds the
//   ~5 MB localStorage budget, so `localStorage.setItem` threw `QuotaExceededError`
//   and the overlay silently failed to persist → on reload it never restored → the
//   raster never painted.
//
//   Fix: the raster BYTES live here, in IndexedDB (origin quota is typically hundreds
//   of MB). The localStorage record now carries only lean METADATA (bounds / transform
//   / scale / opacity / lock / visibility), which never blows the quota.
//
// Design mirrors engine/UnderlayRasterStore.ts (the codebase's proven IDB raster
// pattern): one object store `rasters` keyed by project id; async get/put/delete;
// never throws — a failed raster write must NEVER abort the (lean) metadata save, and
// a cold / disabled IDB simply degrades to "no persisted overlay".

const DB_NAME = 'pryzm-site-overlay-rasters';
const DB_VERSION = 1;
const STORE = 'rasters';

class SiteOverlayRasterStore {
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
                    console.warn('[SiteOverlayRasterStore] open failed — IDB disabled:', req.error);
                    this._disabled = true;
                    resolve();
                };
                req.onblocked = () => { this._disabled = true; resolve(); };
            } catch (err) {
                console.warn('[SiteOverlayRasterStore] init threw — IDB disabled:', err);
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
            console.warn('[SiteOverlayRasterStore] get failed (non-fatal):', err);
            return null;
        }
    }

    /**
     * Persist the raster data URL for `projectId`. Resolves true on success, false on
     * any failure (disabled IDB, quota, private mode) — NEVER throws, so a raster write
     * can't abort the lean metadata save.
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
                        console.warn('[SiteOverlayRasterStore] put failed (non-fatal):', tx.error);
                    }
                    resolve(false);
                };
                tx.onabort = () => resolve(false);
            });
        } catch (err) {
            console.warn('[SiteOverlayRasterStore] put threw (non-fatal):', err);
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

let _singleton: SiteOverlayRasterStore | null = null;

/** Process-wide singleton site-overlay raster cache. */
export function getSiteOverlayRasterStore(): SiteOverlayRasterStore {
    if (!_singleton) _singleton = new SiteOverlayRasterStore();
    return _singleton;
}

export type { SiteOverlayRasterStore };
