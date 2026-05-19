import { OpeningData } from './OpeningTypes';
import { ProjectContext } from '../context/ProjectContext';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * OpeningStore
 *
 * Contract compliance:
 * - §3.5 FIX: Removed self-mutation event listeners ('bim-level-removed',
 *   'bim-slab-removed') from the constructor. Store must be data-only.
 *   Cascading cleanup is now handled by OpeningCleanupHandler (external).
 * - §3.7 FIX: getById() and getAll() now return structuredClone copies,
 *   preventing external callers from mutating internal store state via reference.
 */
export class OpeningStore {
    private _openings = new Map<string, OpeningData>();

    constructor(_projectContext: ProjectContext) {
        // §3.5: No event listeners here. Level/slab removal cascade is
        // handled externally by OpeningCleanupHandler.
    }

    add(opening: OpeningData) {
        const newOpening = structuredClone(opening) as OpeningData;
        this._openings.set(newOpening.id, newOpening);
        _bus.emit('bim-opening-added', { id: newOpening.id }); // F.events.17
        storeEventBus.emit({ elementId: newOpening.id, elementType: 'opening', operation: 'create', timestamp: Date.now() });
    }

    remove(id: string) {
        const opening = this._openings.get(id);
        if (opening) {
            this._openings.delete(id);
            _bus.emit('bim-opening-removed', { id }); // F.events.17
            storeEventBus.emit({ elementId: id, elementType: 'opening', operation: 'delete', timestamp: Date.now() });
        }
    }

    update(id: string, updates: Partial<OpeningData>) {
        const opening = this._openings.get(id);
        if (opening) {
            const next = structuredClone(opening) as OpeningData;
            Object.assign(next, updates);
            this._openings.set(id, next);
            _bus.emit('bim-opening-updated', { id }); // F.events.17
            storeEventBus.emit({ elementId: id, elementType: 'opening', operation: 'update', timestamp: Date.now() });
        }
    }

    getById(id: string): OpeningData | undefined {
        const opening = this._openings.get(id);
        if (!opening) return undefined;
        // §3.7 FIX: Return a clone to prevent external mutation of internal state.
        return structuredClone(opening) as OpeningData;
    }

    getByHostId(hostId: string): OpeningData[] {
        return this.getAll().filter(o => o.hostId === hostId);
    }

    getAll(): OpeningData[] {
        // §3.7 FIX: Return clones to prevent external mutation of internal state.
        return Array.from(this._openings.values()).map(o => structuredClone(o) as OpeningData);
    }
}
