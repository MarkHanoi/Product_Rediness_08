import { DoorOpening, DoorOpeningSchema } from './DoorTypes';
import { storeEventBus } from '@pryzm/core-app-model';

type DoorEventType = 'add' | 'update' | 'remove';
type DoorEventListener = (event: DoorEventType, door: DoorOpening, prev?: DoorOpening) => void;

export class DoorStore {
    private doors: Map<string, DoorOpening> = new Map();
    private listeners: DoorEventListener[] = [];

    // ── §FIX-HOSTWALL-DOOR-INDEX (2026-07-02) ────────────────────────────────
    // Reverse index: hostWallId → Set<doorId>. This is the single biggest fix
    // for the "move a wall that hosts a door → whole app freezes" hang.
    //
    // ROOT CAUSE it removes: DoorBuilder.rebuildForWall(wallId) and getByWallId()
    // used to `for (const door of this.getAll())` — an UNBOUNDED O(all-doors-in-
    // project) scan — to find the doors on ONE wall. On a wall baseline move,
    // WallRebuildCoordinator._flush re-anchors hosted children by calling
    // rebuildForWall ONCE PER REBUILT WALL, so a single move cost
    // O(walls-rebuilt × all-doors) — quadratic in a dense model. The whole
    // _flush is synchronous with no main-thread yield, so this pegged the thread.
    //
    // INVARIANT (must hold after EVERY mutation):
    //   for every door d in `doors`:  d.wallId ∈ index  AND  d.id ∈ index[d.wallId]
    //   and NO stale id remains in any bucket (a door appears under exactly its
    //   CURRENT host wall, never a previous one).
    // The index is maintained transactionally alongside `doors` in add/update/
    // remove/clear — the ONLY four mutators. `getIdsByWallId` is now O(doors-on-
    // that-wall). update() re-homes the id when a door is re-hosted onto another
    // wall (wallId is guarded as an identity field today, but the index handles a
    // host change defensively so it can never leak a stale bucket entry).
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

    add(door: Partial<DoorOpening> & { id: string; openingId: string; wallId: string }): void {
        // B5/R7: Zod boundary validation — parse with defaults applied
        const result = DoorOpeningSchema.safeParse(door);
        if (!result.success) {
            // PLAN-18: include field paths in error message for easier debugging.
            const flat = result.error.flatten();
            const fieldSummary = Object.entries(flat.fieldErrors)
                .map(([k, v]) => `${k}: ${v?.join(', ')}`)
                .join('; ');
            throw new Error(`[DoorStore.add] Validation failed — ${fieldSummary || result.error.message}`);
        }
        const frozen = Object.freeze({ ...result.data });
        this.doors.set(frozen.id, frozen);
        this._indexAdd(frozen.wallId, frozen.id);  // §FIX-HOSTWALL-DOOR-INDEX
        this.notify('add', frozen);
        storeEventBus.emit({ elementId: frozen.id, elementType: 'door', operation: 'create', timestamp: Date.now() });
    }

    update(id: string, patch: Partial<DoorOpening>): void {
        const existing = this.doors.get(id);
        if (!existing) throw new Error(`[DoorStore.update] Door not found: ${id}`);
        // Guard identity fields — never overwrite with patch values
        const merged = { ...existing, ...patch, id: existing.id, wallId: existing.wallId, openingId: existing.openingId };
        const result = DoorOpeningSchema.safeParse(merged);
        if (!result.success) {
            // PLAN-18: include field paths in error message.
            const flat = result.error.flatten();
            const fieldSummary = Object.entries(flat.fieldErrors)
                .map(([k, v]) => `${k}: ${v?.join(', ')}`)
                .join('; ');
            throw new Error(`[DoorStore.update] Validation failed — ${fieldSummary || result.error.message}`);
        }
        const frozen = Object.freeze({ ...result.data });
        this.doors.set(id, frozen);
        // §FIX-HOSTWALL-DOOR-INDEX — re-home the id if the host wall changed. The
        // merge above pins wallId to `existing.wallId`, so a change is not expected
        // today; handling it keeps the index invariant true unconditionally.
        if (existing.wallId !== frozen.wallId) {
            this._indexRemove(existing.wallId, id);
            this._indexAdd(frozen.wallId, id);
        }
        this.notify('update', frozen, existing);
        storeEventBus.emit({ elementId: id, elementType: 'door', operation: 'update', timestamp: Date.now() });
    }

    remove(id: string): void {
        const existing = this.doors.get(id);
        if (!existing) return; // idempotent
        this.doors.delete(id);
        this._indexRemove(existing.wallId, id);  // §FIX-HOSTWALL-DOOR-INDEX
        this.notify('remove', existing);
        storeEventBus.emit({ elementId: id, elementType: 'door', operation: 'delete', timestamp: Date.now() });
    }

    getById(id: string): DoorOpening | undefined {
        return this.doors.get(id);
    }

    /**
     * §FIX-HOSTWALL-DOOR-INDEX — O(doors-on-that-wall) lookup of the door ids
     * hosted by `wallId`. Returns a fresh array (never the internal Set) so
     * callers can iterate safely while mutating the store. Empty when the wall
     * hosts no doors — the common case for the many neighbour walls a whole-level
     * rebuild touches, which now cost ZERO door work instead of a full scan.
     */
    getIdsByWallId(wallId: string): string[] {
        const bucket = this._byWall.get(wallId);
        return bucket ? [...bucket] : [];
    }

    getByWallId(wallId: string): DoorOpening[] {
        // §FIX-HOSTWALL-DOOR-INDEX — was O(all-doors); now O(doors-on-that-wall).
        const bucket = this._byWall.get(wallId);
        if (!bucket) return [];
        const out: DoorOpening[] = [];
        for (const id of bucket) {
            const d = this.doors.get(id);
            if (d) out.push(d);
        }
        return out;
    }

    getAll(): DoorOpening[] {
        return [...this.doors.values()];
    }

    has(id: string): boolean {
        return this.doors.has(id);
    }

    /**
     * §WALL-DEEP-2026 O2 (RESOLVED 2026-04-24) — geometry-rebuild trigger.
     *
     * Re-emits an `'update'` event for the door without changing any field.
     * Used by `DoorDependencyTracker` to force a builder rebuild after the
     * host wall's baseLine / height / thickness changes — the door's stored
     * data is unchanged but its world position depends on the wall, so the
     * mesh must be regenerated.
     *
     * Idempotent and safe to call repeatedly. Returns `true` if a door with
     * the given id was found and re-emitted; `false` otherwise.
     */
    touch(id: string): boolean {
        const door = this.doors.get(id);
        if (!door) return false;
        this.notify('update', door, door);
        return true;
    }

    /**
     * PLAN-08: clear() now notifies subscribers for each door before wiping the map.
     * This ensures DoorBuilder.dispose() is called for every door so no stale scene
     * objects remain after a project-clear operation.
     */
    clear(): void {
        for (const [, door] of this.doors) {
            this.notify('remove', door);
            storeEventBus.emit({ elementId: door.id, elementType: 'door', operation: 'delete', timestamp: Date.now() });
        }
        this.doors.clear();
        this._byWall.clear();  // §FIX-HOSTWALL-DOOR-INDEX — keep the index in lock-step
    }

    subscribe(listener: DoorEventListener): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify(event: DoorEventType, door: DoorOpening, prev?: DoorOpening): void {
        this.listeners.forEach(l => {
            try { l(event, door, prev); }
            catch (err) { console.error('[DoorStore] Listener error:', err); }
        });
    }
}

/** Singleton — imported by commands, builders, and the property panel */
export const doorStore = new DoorStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'doorStore',
    clear: () => doorStore.clear(),
});
