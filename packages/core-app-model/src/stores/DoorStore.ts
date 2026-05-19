import { DoorOpening, DoorOpeningSchema } from './DoorTypes';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

type DoorEventType = 'add' | 'update' | 'remove';
type DoorEventListener = (event: DoorEventType, door: DoorOpening, prev?: DoorOpening) => void;

export class DoorStore {
    private doors: Map<string, DoorOpening> = new Map();
    private listeners: DoorEventListener[] = [];

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
        this.notify('update', frozen, existing);
        storeEventBus.emit({ elementId: id, elementType: 'door', operation: 'update', timestamp: Date.now() });
    }

    remove(id: string): void {
        const existing = this.doors.get(id);
        if (!existing) return; // idempotent
        this.doors.delete(id);
        this.notify('remove', existing);
        storeEventBus.emit({ elementId: id, elementType: 'door', operation: 'delete', timestamp: Date.now() });
    }

    getById(id: string): DoorOpening | undefined {
        return this.doors.get(id);
    }

    getByWallId(wallId: string): DoorOpening[] {
        return [...this.doors.values()].filter(d => d.wallId === wallId);
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

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'doorStore',
    clear: () => doorStore.clear(),
});
