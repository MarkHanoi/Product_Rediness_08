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
// §SLABTYPES117 — the data table this registry seeds from (THREE-free, DOM-free).
import { SLAB_TYPE_CATALOGUE, type SlabTypeGroup } from './SlabTypeCatalogue';

export interface SlabSystemType {
    id: string;
    name: string;
    description?: string;
    /** Ordered top-to-bottom, matching Revit's "Edit Type" layer convention. */
    layers: SlabLayer[];
    /** Sum of all layer thicknesses — computed at creation, stored as plain number. */
    totalThickness: number;
    /**
     * §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — whether this assembly is structural.
     * Absent on the four original concrete types, which are all load-bearing;
     * `false` on every landscape type, where a topsoil build-up carries nothing.
     *
     * ⚠ THIS IS METADATA, AND NOTHING ENFORCES IT TODAY. A census of the repo
     * found NO consumer that asks "is this slab structural?" — walls-by-slab,
     * SlabColumnCoupling and the region tracer all treat every slab alike. So
     * NOTHING CURRENTLY PREVENTS A LANDSCAPE SLAB BEING USED STRUCTURALLY: a
     * user can stand columns on a lawn and the product will not object. The
     * field is published so schedules and the AI plane can READ the fact and so
     * a future guard has something true to read — not because a guard exists.
     * Do not write a comment here implying protection that is not built.
     */
    loadBearing?: boolean;
    /**
     * §SLABTYPES117 — the dropdown optgroup this built-in belongs to. Absent on every
     * USER-created type (they land under "Custom"). Display grouping only: no consumer
     * may branch on it for behaviour, and it is not persisted (built-ins never are).
     */
    group?: SlabTypeGroup;
    createdAt: number;
    modifiedAt: number;
}

// ─── BUILT-IN PRESETS ─────────────────────────────────────────────────────────
//
// §SLABTYPES117 — THE ROWS LIVE IN `SlabTypeCatalogue.ts`, not here. This store is
// the REGISTRY (what every consumer reads through `getAll()`); the catalogue is the
// DATA TABLE it seeds from. Two files, one answer: adding a type is adding a row
// there, and it is in the dropdown, the AI ladder and the schedules by construction.
// The four original concrete types and the ten landscape types moved there verbatim.

const BUILTIN_TYPES: readonly SlabSystemType[] = SLAB_TYPE_CATALOGUE;

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
