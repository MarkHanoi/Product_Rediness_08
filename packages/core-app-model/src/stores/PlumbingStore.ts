import { PlumbingFixtureData } from './PlumbingTypes';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class PlumbingStore {
    private fixtures = new Map<string, PlumbingFixtureData>();

    add(data: PlumbingFixtureData): void {
        this.fixtures.set(data.id, structuredClone(data));
        _bus.emit('bim-plumbing-added', { id: data.id }); // F.events.17
        storeEventBus.emit({ elementId: data.id, elementType: 'plumbing', operation: 'create', timestamp: Date.now() });
        console.log(`PlumbingStore: Added fixture ${data.id} of type ${data.fixtureType}`);
    }

    get(id: string): PlumbingFixtureData | undefined {
        return this.fixtures.get(id);
    }

    remove(id: string): void {
        this.fixtures.delete(id);
        // NOTE: remove() previously emitted no event at all. Added DOM and bus events for full parity.
        _bus.emit('bim-plumbing-removed', { id }); // F.events.17
        storeEventBus.emit({ elementId: id, elementType: 'plumbing', operation: 'delete', timestamp: Date.now() });
    }

    update(id: string, data: PlumbingFixtureData): void {
        this.fixtures.set(id, structuredClone(data));
        _bus.emit('bim-plumbing-updated', { id }); // F.events.17
        storeEventBus.emit({ elementId: id, elementType: 'plumbing', operation: 'update', timestamp: Date.now() });
    }

    getAll(): PlumbingFixtureData[] {
        return Array.from(this.fixtures.values());
    }

    clear(): void {
        this.fixtures.clear();
    }
}
