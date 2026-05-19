import { StairRailingConfig } from './StairRailingTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §P0-A40: Suppress storeEventBus emissions during a stair batch.
 * StairRailingStore events fire synchronously on each railing add().
 * Without this guard a future stair batch creation would accumulate
 * per-railing storeEventBus events into the outer batch buffer, adding
 * unnecessary drain chunks identical to the CurtainPanelStore problem
 * fixed in A39-P1.  Normal (non-batch) editing paths emit fully.
 * batchCoordinator.isBatching stays true through the full yielded drain;
 * StairBuilder reads stairRailingStore.getByStairId() directly so it does
 * not need a separate storeEventBus event per railing.
 */
export class StairRailingStore {
    private railings: Map<string, StairRailingConfig> = new Map();

    add(railing: StairRailingConfig): void {
        if (!railing.ifcData) {
            railing.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcRailing',
                predefinedType: 'GUARDRAIL'
            };
        }
        // §3.4: Clone to prevent external callers from mutating internal store state.
        this.railings.set(railing.id, structuredClone(railing));
        _bus.emit('bim-stair-railing-added', { id: railing.id }); // F.events.18 // TODO(TASK-10)
        // §P0-A40: gate storeEventBus emission during stair batch creation.
        if (!batchCoordinator.isBatching) {
            storeEventBus.emit({ elementId: railing.id, elementType: 'stairRailing', operation: 'create', timestamp: Date.now() });
        }
        console.log(`[StairRailingStore] Added railing ${railing.id} (${railing.side}) for stair ${railing.stairId}`);
    }

    get(id: string): StairRailingConfig | undefined {
        return this.railings.get(id);
    }

    getAll(): StairRailingConfig[] {
        return Array.from(this.railings.values());
    }

    getByStairId(stairId: string): StairRailingConfig[] {
        return Array.from(this.railings.values()).filter(r => r.stairId === stairId);
    }

    update(id: string, updates: Partial<StairRailingConfig>): void {
        const railing = this.railings.get(id);
        if (railing) {
            // §3.4: structuredClone produces a fully immutable next-state object.
            const updated: StairRailingConfig = structuredClone(railing);
            Object.assign(updated, updates);
            this.railings.set(id, updated);
            _bus.emit('bim-stair-railing-updated', { id: updated.id }); // F.events.18 // TODO(TASK-10)
            // §P0-A40: gate update emissions during batch.
            if (!batchCoordinator.isBatching) {
                storeEventBus.emit({ elementId: id, elementType: 'stairRailing', operation: 'update', timestamp: Date.now() });
            }
        }
    }

    remove(id: string): void {
        const railing = this.railings.get(id);
        if (railing) {
            this.railings.delete(id);
            _bus.emit('bim-stair-railing-removed', { id }); // F.events.18 // TODO(TASK-10)
            // §P0-A40: gate delete emissions during batch.
            if (!batchCoordinator.isBatching) {
                storeEventBus.emit({ elementId: id, elementType: 'stairRailing', operation: 'delete', timestamp: Date.now() });
            }
            console.log(`[StairRailingStore] Removed railing ${id}`);
        }
    }

    removeByStairId(stairId: string): void {
        this.getByStairId(stairId).forEach(r => this.remove(r.id));
    }

    clear(): void {
        this.railings.clear();
    }
}
