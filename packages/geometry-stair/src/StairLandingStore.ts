import { StairLandingEntity } from './StairLandingTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §STAIR-AUDIT-2026 Sprint R1 (FIXED 2026-04-25)
 *  - F4 (clone-first): the input is no longer mutated before the clone.
 *  - F2  (no `update` method): an identity-preserving `update()` is now
 *    provided so landings can be edited without losing their IFC GUID.
 *    Both the window event and the storeEventBus message are dispatched.
 *
 * §P0-A40: Suppress storeEventBus emissions during a stair batch.
 * StairLandingStore events fire synchronously on each landing add().
 * Without this guard a future stair batch creation would accumulate
 * per-landing storeEventBus events into the outer batch buffer, adding
 * unnecessary drain chunks identical to the CurtainPanelStore problem
 * fixed in A39-P1.  Normal (non-batch) editing paths emit fully.
 * batchCoordinator.isBatching stays true through the full yielded drain;
 * StairBuilder reads stairLandingStore.getByStairId() directly so it does
 * not need a separate storeEventBus event per landing.
 */
export class StairLandingStore {
    private landings: Map<string, StairLandingEntity> = new Map();

    add(landing: StairLandingEntity): void {
        // §F4 fix: clone FIRST, then mutate the clone (auto-fill ifcData).
        const cloned = structuredClone(landing);
        if (!cloned.ifcData) {
            cloned.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcSlab',
                predefinedType: 'LANDING'
            };
        }
        this.landings.set(cloned.id, cloned);
        // §F24 fix: dispatch the cloned reference, never the caller's input.
        _bus.emit('bim-stair-landing-added', { id: cloned.id }); // F.events.18 // TODO(TASK-10)
        // §P0-A40: gate storeEventBus emission during stair batch creation.
        if (!batchCoordinator.isBatching) {
            storeEventBus.emit({ elementId: cloned.id, elementType: 'stairLanding', operation: 'create', timestamp: Date.now() });
        }
        console.log(`[StairLandingStore] Added landing ${cloned.id} for stair ${cloned.stairId}`);
    }

    /**
     * §F2 fix: identity-preserving update — preserves the existing IFC GUID
     * (so IFC round-tripping is not broken by a remove + re-add cycle).
     */
    update(id: string, updates: Partial<StairLandingEntity>): StairLandingEntity | undefined {
        const existing = this.landings.get(id);
        if (!existing) return undefined;

        const merged: StairLandingEntity = {
            ...existing,
            ...updates,
            id: existing.id,                         // identity is locked
            ifcData: existing.ifcData,               // GUID is preserved
        };
        const cloned = structuredClone(merged);
        this.landings.set(cloned.id, cloned);
        _bus.emit('bim-stair-landing-updated', { id: cloned.id }); // F.events.18 // TODO(TASK-10)
        // §P0-A40: gate update emissions during batch.
        if (!batchCoordinator.isBatching) {
            storeEventBus.emit({ elementId: cloned.id, elementType: 'stairLanding', operation: 'update', timestamp: Date.now() });
        }
        return cloned;
    }

    get(id: string): StairLandingEntity | undefined {
        return this.landings.get(id);
    }

    getAll(): StairLandingEntity[] {
        return Array.from(this.landings.values());
    }

    getByStairId(stairId: string): StairLandingEntity[] {
        return Array.from(this.landings.values()).filter(l => l.stairId === stairId);
    }

    remove(id: string): void {
        const landing = this.landings.get(id);
        if (landing) {
            this.landings.delete(id);
            _bus.emit('bim-stair-landing-removed', { id }); // F.events.18 // TODO(TASK-10)
            // §P0-A40: gate delete emissions during batch.
            if (!batchCoordinator.isBatching) {
                storeEventBus.emit({ elementId: id, elementType: 'stairLanding', operation: 'delete', timestamp: Date.now() });
            }
            console.log(`[StairLandingStore] Removed landing ${id}`);
        }
    }

    removeByStairId(stairId: string): void {
        this.getByStairId(stairId).forEach(l => this.remove(l.id));
    }

    clear(): void {
        this.landings.clear();
    }
}
