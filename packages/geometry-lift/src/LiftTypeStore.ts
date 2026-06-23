// @pryzm/geometry-lift — LiftTypeStore (mirror of StairTypeStore).
//
// Residential-building (multi-family) — Slice A / P2. CRUD over lift system types,
// publishing on BOTH the window-event channel AND the centralized storeEventBus
// (§3.8), refusing to overwrite/remove built-in types (stair §F21).

import { LiftTypeDefinition, BUILT_IN_LIFT_TYPES } from './LiftTypeDefinitions';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

export class LiftTypeStore {
    private types: Map<string, LiftTypeDefinition> = new Map();

    constructor() {
        BUILT_IN_LIFT_TYPES.forEach(t => this.types.set(t.id, t));
    }

    getAll(): LiftTypeDefinition[] {
        return Array.from(this.types.values());
    }

    get(id: string): LiftTypeDefinition | undefined {
        return this.types.get(id);
    }

    add(type: LiftTypeDefinition): void {
        // §F21 (mirror): built-in types are immutable.
        const isBuiltIn = BUILT_IN_LIFT_TYPES.some(t => t.id === type.id);
        if (isBuiltIn) {
            throw new Error(
                `Cannot overwrite built-in lift type: ${type.id}. ` +
                `Built-in types are immutable; clone with a new id instead.`,
            );
        }
        this.types.set(type.id, type);
        this._notify('add', type.id);
    }

    remove(id: string): boolean {
        const builtIn = BUILT_IN_LIFT_TYPES.find(t => t.id === id);
        if (builtIn) {
            throw new Error(`Cannot remove built-in lift type: ${id}`);
        }
        const ok = this.types.delete(id);
        if (ok) this._notify('remove', id);
        return ok;
    }

    resolveDefaults(typeId: string): LiftTypeDefinition['defaults'] | undefined {
        return this.types.get(typeId)?.defaults;
    }

    resolveRules(typeId: string): LiftTypeDefinition['rules'] | undefined {
        return this.types.get(typeId)?.rules;
    }

    private _notify(op: 'add' | 'remove', typeId: string): void {
        if (op === 'add') _bus.emit('bim-lift-type-added', { id: typeId });
        else _bus.emit('bim-lift-type-removed', { id: typeId });
        storeEventBus.emit({
            elementId: typeId,
            elementType: 'verticalCirculation-type',
            operation: op === 'add' ? 'create' : 'delete',
            timestamp: Date.now(),
        });
    }
}
