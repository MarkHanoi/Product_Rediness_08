import { FurnitureData } from './FurnitureTypes';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { produce } from 'immer';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class FurnitureStore {
    private furniture = new Map<string, FurnitureData>();

    /**
     * §01 §2.2.3 — Use Immer's `produce` for structural sharing snapshots
     * instead of structuredClone(). produce() returns a deeply-frozen object
     * that shares unmodified branches with the source — cheaper, immutable,
     * and contract-aligned with the rest of the BIM kernel.
     */
    private snapshot(data: FurnitureData): FurnitureData {
        return produce(data, () => { /* no-op: returns frozen structural copy */ }) as FurnitureData;
    }

    add(data: FurnitureData): void {
        const snap = this.snapshot(data);
        this.furniture.set(snap.id, snap);
        _bus.emit('bim-furniture-added', { id: snap.id }); // F.events.17
        storeEventBus.emit({ elementId: snap.id, elementType: 'furniture', operation: 'create', timestamp: Date.now() });
    }

    update(id: string, data: FurnitureData): void {
        if (!this.furniture.has(id)) {
            console.warn(`[FurnitureStore] update() — ID not found: ${id}`);
            return;
        }
        const snap = this.snapshot(data);
        this.furniture.set(id, snap);
        _bus.emit('bim-furniture-updated', { id: snap.id }); // F.events.17
        storeEventBus.emit({ elementId: id, elementType: 'furniture', operation: 'update', timestamp: Date.now() });
    }

    get(id: string): FurnitureData | undefined {
        return this.furniture.get(id);
    }

    remove(id: string): void {
        this.furniture.delete(id);
        _bus.emit('bim-furniture-removed', { id }); // F.events.17
        storeEventBus.emit({ elementId: id, elementType: 'furniture', operation: 'delete', timestamp: Date.now() });
    }

    getAll(): FurnitureData[] {
        return Array.from(this.furniture.values());
    }

    clear(): void {
        this.furniture.clear();
    }
}
