/**
 * SlabSystemTypeStore
 *
 * Contract §03-1.3: Stores named SlabSystemType definitions with layered
 * construction assemblies. Mirrors the WallSystemTypeStore architecture.
 *
 * This store is NOT part of the undo/redo history — slab types are project
 * configuration, not element mutations. Commands read from this store but
 * never write to it (type management is a separate UI concern).
 *
 * Architecture position: Side System (like BimManager / materialLibrary).
 * Accessed by: Commands (read typeId validation), PropertyInspector (UI).
 * Never triggers scene rebuilds directly.
 */

import { SlabLayer } from './SlabTypes';
import { storeEventBus } from '@pryzm/core-app-model';

export interface SlabSystemType {
    id: string;
    name: string;
    description?: string;
    /** Ordered top-to-bottom, matching Revit's "Edit Type" layer convention. */
    layers: SlabLayer[];
    /** Sum of all layer thicknesses — computed at creation, stored as plain number. */
    totalThickness: number;
    createdAt: number;
    modifiedAt: number;
}

// ─── FACTORY ──────────────────────────────────────────────────────────────────

function makeBuiltIn(
    id: string,
    name: string,
    description: string,
    layers: SlabLayer[]
): SlabSystemType {
    return {
        id, name, description, layers,
        totalThickness: parseFloat(layers.reduce((s, l) => s + l.thickness, 0).toFixed(6)),
        createdAt: 0, modifiedAt: 0
    };
}

// ─── BUILT-IN PRESETS ─────────────────────────────────────────────────────────

const BUILTIN_TYPES: SlabSystemType[] = [
    makeBuiltIn(
        'st-monolithic-rc-200',
        'RC Slab – Monolithic 200mm',
        'Single-pour reinforced concrete slab — identical to pre-type-system slabs.',
        [
            { name: 'RC Concrete', thickness: 0.200, function: 'structure', materialColor: '#909090' }
        ]
    ),
    makeBuiltIn(
        'st-composite-deck-300',
        'Composite Deck – 300mm',
        'Structural concrete with insulation and screed finish.',
        [
            { name: 'Screed',        thickness: 0.050, function: 'screed',      materialColor: '#c8bfa8' },
            { name: 'Insulation',    thickness: 0.050, function: 'insulation',   materialColor: '#f5e07a' },
            { name: 'RC Concrete',   thickness: 0.200, function: 'structure',    materialColor: '#909090' }
        ]
    ),
    makeBuiltIn(
        'st-insulated-screed',
        'Insulated Screed – 250mm',
        'Ground-bearing slab with waterproofing, insulation, screed and finish.',
        [
            { name: 'Floor Finish',    thickness: 0.010, function: 'finish-surface', materialColor: '#e8e0d8' },
            { name: 'Screed',          thickness: 0.065, function: 'screed',         materialColor: '#c8bfa8' },
            { name: 'Insulation',      thickness: 0.075, function: 'insulation',      materialColor: '#f5e07a' },
            { name: 'Waterproofing',   thickness: 0.005, function: 'waterproofing',   materialColor: '#404040' },
            { name: 'RC Concrete',     thickness: 0.100, function: 'structure',       materialColor: '#909090' }
        ]
    ),
    makeBuiltIn(
        'st-topping-slab-150',
        'Topping Slab – 150mm',
        'Thin lightweight concrete topping over structural substrate.',
        [
            { name: 'Screed Topping', thickness: 0.050, function: 'screed',     materialColor: '#c8bfa8' },
            { name: 'Substrate',      thickness: 0.100, function: 'substrate',   materialColor: '#a0a0a0' }
        ]
    ),
];

// ─────────────────────────────────────────────────────────────────────────────

export class SlabSystemTypeStore {
    private types = new Map<string, SlabSystemType>();

    constructor() {
        for (const t of BUILTIN_TYPES) {
            const frozen: SlabSystemType = Object.freeze({
                ...t,
                layers: t.layers.map(l => Object.freeze({ ...l })) as SlabLayer[],
                totalThickness: t.layers.reduce((s, l) => s + l.thickness, 0)
            }) as SlabSystemType;
            this.types.set(t.id, frozen);
        }
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getById(id: string): SlabSystemType | undefined {
        return this.types.get(id);
    }

    getAll(): SlabSystemType[] {
        return Array.from(this.types.values());
    }

    isBuiltIn(id: string): boolean {
        return BUILTIN_TYPES.some(t => t.id === id);
    }

    getTotalThickness(id: string): number | null {
        const type = this.types.get(id);
        if (!type) return null;
        return type.totalThickness;
    }

    // ── Write API ─────────────────────────────────────────────────────────────

    /**
     * §M-B1 (DAILY-USE-AUDIT 2026-05-20) — caller may supply an explicit `id`
     * (e.g. `ProjectLoader` restoring a custom slab type from a snapshot). The
     * previous unconditional `crypto.randomUUID()` regenerated the id on every
     * load, breaking every slab that referenced the custom type. Fresh types
     * still get a random id.
     */
    add(type: Omit<SlabSystemType, 'id' | 'createdAt' | 'modifiedAt' | 'totalThickness'> & { id?: string }): SlabSystemType {
        // §M-B1 follow-up — strip 'id' from Omit (see WallSystemTypeStore for
        // the full reasoning) so intersection with `{ id?: string }` correctly
        // makes the id field optional for fresh user-create paths while still
        // honouring an explicit id passed by the project-loader restore path.
        const id = (typeof type.id === 'string' && type.id.length > 0) ? type.id : crypto.randomUUID();
        const now = Date.now();
        const { id: _drop, ...rest } = type as { id?: string } & Omit<SlabSystemType, 'id' | 'createdAt' | 'modifiedAt' | 'totalThickness'>;
        const newType: SlabSystemType = Object.freeze({
            ...rest,
            id,
            createdAt: now,
            modifiedAt: now,
            layers: type.layers.map(l => Object.freeze({ ...l })) as SlabLayer[],
            totalThickness: type.layers.reduce((s, l) => s + l.thickness, 0)
        });
        this.types.set(id, newType);

        // FIX §07: Canonical bus emission — consumers can subscribe to type lifecycle events.
        storeEventBus.emit({ elementId: id, elementType: 'slabSystemType', operation: 'create', timestamp: now });
        return newType;
    }

    update(id: string, patch: Partial<Pick<SlabSystemType, 'name' | 'layers' | 'description'>>): SlabSystemType | null {
        if (this.isBuiltIn(id)) {
            console.warn(`[SlabSystemTypeStore] Cannot modify built-in type: ${id}`);
            return null;
        }
        const existing = this.types.get(id);
        if (!existing) return null;

        const updated: SlabSystemType = Object.freeze({
            ...existing,
            ...patch,
            layers: (patch.layers ?? existing.layers).map(l => Object.freeze({ ...l })) as SlabLayer[],
            modifiedAt: Date.now()
        });
        this.types.set(id, updated);

        // FIX §07: Canonical bus emission.
        storeEventBus.emit({ elementId: id, elementType: 'slabSystemType', operation: 'update', timestamp: Date.now() });
        return updated;
    }

    /** Contract 45 — wipe USER-defined slab types only. Built-ins preserved. */
    clearCustomTypes(): void {
        for (const id of [...this.types.keys()]) {
            if (!this.isBuiltIn(id)) {
                this.types.delete(id);
                storeEventBus.emit({ elementId: id, elementType: 'slabSystemType', operation: 'delete', timestamp: Date.now() });
            }
        }
    }

    remove(id: string): boolean {
        if (this.isBuiltIn(id)) {
            console.warn(`[SlabSystemTypeStore] Cannot delete built-in type: ${id}`);
            return false;
        }
        const deleted = this.types.delete(id);
        if (deleted) {
            // FIX §07: Canonical bus emission.
            storeEventBus.emit({ elementId: id, elementType: 'slabSystemType', operation: 'delete', timestamp: Date.now() });
        }
        return deleted;
    }
}

/**
 * Module-level singleton — imported directly where slab type lookups are needed.
 * Injected into CommandContext.stores.slabSystemTypeStore in main.ts.
 * Contract §01 §1.1: Side Systems must be injected, never accessed via window.
 */
export const slabSystemTypeStore = new SlabSystemTypeStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'slabSystemTypeStore',
    clear: () => slabSystemTypeStore.clearCustomTypes(),
});
