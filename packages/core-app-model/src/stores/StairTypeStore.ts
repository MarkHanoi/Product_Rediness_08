import { StairTypeDefinition, BUILT_IN_STAIR_TYPES } from './StairTypeDefinitions';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §STAIR-AUDIT-2026 Sprint R1 (FIXED 2026-04-25)
 *  - F2 / F22 / F23: stair-type CRUD now publishes on BOTH the window-event
 *    channel AND the centralized `storeEventBus`, matching the other three
 *    stair stores.  This wakes up the Property Inspector, the Schedule
 *    Extractor and the IFC Exporter when a custom type is added or removed.
 *  - F21: `add()` now refuses to overwrite a built-in stair type.
 */
export class StairTypeStore {
    private types: Map<string, StairTypeDefinition> = new Map();

    constructor() {
        BUILT_IN_STAIR_TYPES.forEach(t => this.types.set(t.id, t));
    }

    getAll(): StairTypeDefinition[] {
        return Array.from(this.types.values());
    }

    get(id: string): StairTypeDefinition | undefined {
        return this.types.get(id);
    }

    add(type: StairTypeDefinition): void {
        // §F21 fix: built-in types are immutable; refuse to overwrite them.
        const isBuiltIn = BUILT_IN_STAIR_TYPES.some(t => t.id === type.id);
        if (isBuiltIn) {
            throw new Error(
                `Cannot overwrite built-in stair type: ${type.id}. ` +
                `Built-in types are immutable; clone with a new id instead.`
            );
        }
        this.types.set(type.id, type);
        this._notify('add', type.id);
    }

    remove(id: string): boolean {
        const builtIn = BUILT_IN_STAIR_TYPES.find(t => t.id === id);
        if (builtIn) {
            throw new Error(`Cannot remove built-in stair type: ${id}`);
        }
        const ok = this.types.delete(id);
        if (ok) this._notify('remove', id);
        return ok;
    }

    resolveDefaults(typeId: string): StairTypeDefinition['defaults'] | undefined {
        return this.types.get(typeId)?.defaults;
    }

    resolveRules(typeId: string): StairTypeDefinition['rules'] | undefined {
        return this.types.get(typeId)?.rules;
    }

    private _notify(op: 'add' | 'remove', typeId: string): void {
        if (op === 'add') _bus.emit('bim-stair-type-added', { id: typeId }); // F.events.17
        else _bus.emit('bim-stair-type-removed', { id: typeId });
        // §3.8: publish to centralized StoreEventBus for DependencyResolver,
        // Topology, World Model — same channel the other three stair stores use.
        storeEventBus.emit({
            elementId: typeId,
            elementType: 'stair-type',
            operation: op === 'add' ? 'create' : 'delete',
            timestamp: Date.now(),
        });
    }
}
