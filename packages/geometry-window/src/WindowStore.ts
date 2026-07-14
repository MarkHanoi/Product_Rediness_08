import { WindowOpening, WindowOpeningSchema } from './WindowTypes';
import { storeEventBus } from '@pryzm/core-app-model';

type WindowEventType = 'add' | 'update' | 'remove';
type WindowEventListener = (event: WindowEventType, window: WindowOpening, prev?: WindowOpening) => void;

export class WindowStore {
    private windows: Map<string, WindowOpening> = new Map();
    private listeners: WindowEventListener[] = [];

    // ── §FIX-HOSTWALL-DOOR-INDEX (2026-07-02) ────────────────────────────────
    // Reverse index: hostWallId → Set<windowId>. Mirrors DoorStore exactly.
    // WindowBuilder.rebuildForWall used the identical UNBOUNDED O(all-windows)
    // scan that DoorBuilder did, so a wall move that hosts windows paid the same
    // quadratic cost per rebuilt wall inside the synchronous WallRebuildCoordinator
    // ._flush. See DoorStore for the full invariant statement; it holds verbatim
    // here with "door" → "window".
    private _byWall: Map<string, Set<string>> = new Map();

    /** §FIX-HOSTWALL-DOOR-INDEX — add id to its host-wall bucket. */
    private _indexAdd(wallId: string, id: string): void {
        let bucket = this._byWall.get(wallId);
        if (!bucket) { bucket = new Set<string>(); this._byWall.set(wallId, bucket); }
        bucket.add(id);
    }

    /** §FIX-HOSTWALL-DOOR-INDEX — remove id from a host-wall bucket; prune empties. */
    private _indexRemove(wallId: string, id: string): void {
        const bucket = this._byWall.get(wallId);
        if (!bucket) return;
        bucket.delete(id);
        if (bucket.size === 0) this._byWall.delete(wallId);
    }

    add(window: Partial<WindowOpening> & { id: string; openingId: string; wallId: string }): void {
        // B5/R7: Zod boundary validation — parse with defaults applied
        const result = WindowOpeningSchema.safeParse(window);
        if (!result.success) {
            // PLAN-18: include field paths in error message for easier debugging.
            const flat = result.error.flatten();
            const fieldSummary = Object.entries(flat.fieldErrors)
                .map(([k, v]) => `${k}: ${v?.join(', ')}`)
                .join('; ');
            throw new Error(`[WindowStore.add] Validation failed — ${fieldSummary || result.error.message}`);
        }
        const frozen = Object.freeze({ ...result.data });
        this.windows.set(frozen.id, frozen);
        this._indexAdd(frozen.wallId, frozen.id);  // §FIX-HOSTWALL-DOOR-INDEX
        this.notify('add', frozen);
        storeEventBus.emit({ elementId: frozen.id, elementType: 'window', operation: 'create', timestamp: Date.now() });
    }

    update(id: string, patch: Partial<WindowOpening>): void {
        const existing = this.windows.get(id);
        if (!existing) throw new Error(`[WindowStore.update] Window not found: ${id}`);
        // Guard identity fields — never overwrite with patch values
        const merged = { ...existing, ...patch, id: existing.id, wallId: existing.wallId, openingId: existing.openingId };
        const result = WindowOpeningSchema.safeParse(merged);
        if (!result.success) {
            // PLAN-18: include field paths in error message.
            const flat = result.error.flatten();
            const fieldSummary = Object.entries(flat.fieldErrors)
                .map(([k, v]) => `${k}: ${v?.join(', ')}`)
                .join('; ');
            throw new Error(`[WindowStore.update] Validation failed — ${fieldSummary || result.error.message}`);
        }
        const frozen = Object.freeze({ ...result.data });
        this.windows.set(id, frozen);
        // §FIX-HOSTWALL-DOOR-INDEX — re-home the id if the host wall changed.
        if (existing.wallId !== frozen.wallId) {
            this._indexRemove(existing.wallId, id);
            this._indexAdd(frozen.wallId, id);
        }
        this.notify('update', frozen, existing);
        storeEventBus.emit({ elementId: id, elementType: 'window', operation: 'update', timestamp: Date.now() });
    }

    /**
     * §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274) — AUTHORITATIVE FULL REPLACEMENT.
     * The mirror of `DoorStore.replace()`; see that method for the rationale. `update()`
     * merges and therefore cannot UNSET a field, so it cannot reverse a migration that
     * STAMPED `systemTypeId` / `frameFinish` / `columnRatios` onto an untyped record.
     * Identity (`id` / `wallId` / `openingId`) is pinned from the live record; the same
     * `'update'` event is emitted, so builders rebuild.
     */
    replace(record: WindowOpening): void {
        const existing = this.windows.get(record.id);
        if (!existing) throw new Error(`[WindowStore.replace] Window not found: ${record.id}`);
        const authoritative = {
            ...record,
            id:        existing.id,
            wallId:    existing.wallId,
            openingId: existing.openingId,
        };
        const result = WindowOpeningSchema.safeParse(authoritative);
        if (!result.success) {
            const flat = result.error.flatten();
            const fieldSummary = Object.entries(flat.fieldErrors)
                .map(([k, v]) => `${k}: ${v?.join(', ')}`)
                .join('; ');
            throw new Error(`[WindowStore.replace] Validation failed — ${fieldSummary || result.error.message}`);
        }
        const frozen = Object.freeze({ ...result.data });
        this.windows.set(frozen.id, frozen);
        this.notify('update', frozen, existing);
        storeEventBus.emit({ elementId: frozen.id, elementType: 'window', operation: 'update', timestamp: Date.now() });
    }

    remove(id: string): void {
        const existing = this.windows.get(id);
        if (!existing) return; // idempotent
        this.windows.delete(id);
        this._indexRemove(existing.wallId, id);  // §FIX-HOSTWALL-DOOR-INDEX
        this.notify('remove', existing);
        storeEventBus.emit({ elementId: id, elementType: 'window', operation: 'delete', timestamp: Date.now() });
    }

    getById(id: string): WindowOpening | undefined {
        return this.windows.get(id);
    }

    /**
     * §FIX-HOSTWALL-DOOR-INDEX — O(windows-on-that-wall) lookup of the window ids
     * hosted by `wallId`. Returns a fresh array so callers can iterate safely
     * while mutating the store.
     */
    getIdsByWallId(wallId: string): string[] {
        const bucket = this._byWall.get(wallId);
        return bucket ? [...bucket] : [];
    }

    getByWallId(wallId: string): WindowOpening[] {
        // §FIX-HOSTWALL-DOOR-INDEX — was O(all-windows); now O(windows-on-that-wall).
        const bucket = this._byWall.get(wallId);
        if (!bucket) return [];
        const out: WindowOpening[] = [];
        for (const id of bucket) {
            const w = this.windows.get(id);
            if (w) out.push(w);
        }
        return out;
    }

    getAll(): WindowOpening[] {
        return [...this.windows.values()];
    }

    has(id: string): boolean {
        return this.windows.has(id);
    }

    /**
     * §WALL-DEEP-2026 O2 (RESOLVED 2026-04-24) — geometry-rebuild trigger.
     *
     * Re-emits an `'update'` event for the window without changing any field.
     * Used by `WindowDependencyTracker` to force a builder rebuild after the
     * host wall's baseLine / height / thickness changes — the window's stored
     * data is unchanged but its world position depends on the wall, so the
     * mesh must be regenerated.
     *
     * Idempotent and safe to call repeatedly. Returns `true` if a window with
     * the given id was found and re-emitted; `false` otherwise.
     */
    touch(id: string): boolean {
        const win = this.windows.get(id);
        if (!win) return false;
        this.notify('update', win, win);
        return true;
    }

    /**
     * PLAN-08: clear() now notifies subscribers for each window before wiping the map.
     * This ensures WindowBuilder.dispose() is called for every window so no stale
     * scene objects remain after a project-clear operation.
     */
    clear(): void {
        for (const [, win] of this.windows) {
            this.notify('remove', win);
            storeEventBus.emit({ elementId: win.id, elementType: 'window', operation: 'delete', timestamp: Date.now() });
        }
        this.windows.clear();
        this._byWall.clear();  // §FIX-HOSTWALL-DOOR-INDEX — keep the index in lock-step
    }

    subscribe(listener: WindowEventListener): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify(event: WindowEventType, window: WindowOpening, prev?: WindowOpening): void {
        this.listeners.forEach(l => {
            try { l(event, window, prev); }
            catch (err) { console.error('[WindowStore] Listener error:', err); }
        });
    }
}

/** Singleton — imported by commands, builders, and the property panel */
export const windowStore = new WindowStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'windowStore',
    clear: () => windowStore.clear(),
});
