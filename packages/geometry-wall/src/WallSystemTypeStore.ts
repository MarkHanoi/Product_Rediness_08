/**
 * WallSystemTypeStore
 *
 * Contract §03-1.3: Stores named WallSystemType definitions.
 * Wall types are project-level resources referenced by WallData.typeId.
 *
 * This store is NOT part of the undo/redo history — wall types are project
 * configuration, not element mutations.  Commands read from this store but
 * never write to it (type management is a separate UI concern).
 *
 * Architecture position: Side System (like BimManager / materialLibrary).
 * Accessed by: Commands (read typeId validation), Builders (read layers).
 * Never triggers scene rebuilds directly.
 */

import { WallLayer } from './WallTypes';
import { storeEventBus } from '@pryzm/core-app-model';

// ─── WallSystemType (defined here, re-exported from WallTypes) ──────────────
// Declared as a plain interface with totalThickness as a regular field.
// The store computes it at construction/add time.
export interface WallSystemType {
    id: string;
    name: string;
    description?: string;
    layers: WallLayer[];
    /** Sum of all layer thicknesses — computed at creation, stored as plain number */
    totalThickness: number;
    createdAt: number;
    modifiedAt: number;
}

// ─── BUILT-IN PRESETS ─────────────────────────────────────────────────────────
// These are always available and cannot be deleted.  User-created types are
// stored alongside them in the same map.
// ─────────────────────────────────────────────────────────────────────────────

/** Factory — computes totalThickness so literal objects satisfy WallSystemType. */
function makeBuiltIn(
    id: string,
    name: string,
    description: string,
    layers: WallLayer[]
): WallSystemType {
    return {
        id, name, description, layers,
        totalThickness: parseFloat(layers.reduce((s, l) => s + l.thickness, 0).toFixed(6)),
        createdAt: 0, modifiedAt: 0
    };
}

const BUILTIN_TYPES: WallSystemType[] = [
    makeBuiltIn('wt-monolithic', 'Monolithic (Default)',
        'Single-material wall — identical to pre-type-system walls.',
        [
            { name: 'Wall Body', thickness: 1.0, function: 'structure', materialColor: '#d4c5b0' }
        ]
    ),
    makeBuiltIn('wt-interior-partition', 'Interior – Partition 100mm',
        'Lightweight interior partition: plaster / stud / plaster.',
        [
            { name: 'Plaster (Inner)',  thickness: 0.012, function: 'finish-interior', materialColor: '#f0ece4' },
            { name: 'Stud / Cavity',   thickness: 0.076, function: 'structure',        materialColor: '#d4b896' },
            { name: 'Plaster (Outer)', thickness: 0.012, function: 'finish-exterior',  materialColor: '#f0ece4' }
        ]
    ),
    makeBuiltIn('wt-exterior-brick', 'Exterior – Brick 300mm',
        'Cavity brick wall: brick / insulation / blockwork / plaster.',
        [
            { name: 'Face Brick',      thickness: 0.110, function: 'finish-exterior', materialColor: '#c0674a' },
            { name: 'Air Cavity',      thickness: 0.050, function: 'air-barrier',     materialColor: '#e8e8e8' },
            { name: 'Insulation',      thickness: 0.060, function: 'insulation',      materialColor: '#f5e07a' },
            { name: 'Concrete Block',  thickness: 0.140, function: 'structure',       materialColor: '#a0a0a0' },
            { name: 'Internal Render', thickness: 0.015, function: 'finish-interior', materialColor: '#f0ece4' }
        ]
    ),
    makeBuiltIn('wt-exterior-concrete', 'Exterior – Concrete 250mm',
        'Insulated concrete wall: render / insulation / concrete / plaster.',
        [
            { name: 'External Render', thickness: 0.015, function: 'finish-exterior', materialColor: '#c8bfa8' },
            { name: 'Insulation',      thickness: 0.080, function: 'insulation',      materialColor: '#f5e07a' },
            { name: 'Concrete',        thickness: 0.200, function: 'structure',       materialColor: '#909090' },
            { name: 'Plaster',         thickness: 0.012, function: 'finish-interior', materialColor: '#f0ece4' }
        ]
    ),
    makeBuiltIn('wt-exposed-precast-hipster-concrete', 'Exposed Precast – Hipster Concrete 290mm',
        'Architectural exposed precast concrete wall with sealed board-marked face, insulation backing, and clean interior skim.',
        [
            { name: 'Sealed Board-Marked Precast Face', thickness: 0.025, function: 'finish-exterior', materialId: 'concrete-formwork-oiled', materialColor: '#ada99f' },
            { name: 'Precast Concrete Panel',           thickness: 0.200, function: 'structure',       materialId: 'concrete-precast',       materialColor: '#d0d0ca' },
            { name: 'Mineral Wool Acoustic Backing',    thickness: 0.050, function: 'insulation',      materialId: 'insulation-mineral-wool', materialColor: '#f0d080' },
            { name: 'Interior Skim Plaster',            thickness: 0.015, function: 'finish-interior', materialId: 'gypsum-skim',            materialColor: '#f5f5f0' }
        ]
    ),
    makeBuiltIn('wt-exposed-stone', 'Exposed Stone – Feature Wall 350mm',
        'High-graphic exposed stone assembly with a textured stone face, drained cavity, blockwork backup, insulation, and plaster finish.',
        [
            { name: 'Split-Face Exposed Stone', thickness: 0.080, function: 'finish-exterior', materialId: 'stone-limestone-grey',    materialColor: '#b0a898' },
            { name: 'Drained Air Cavity',       thickness: 0.035, function: 'air-barrier',     materialId: 'membrane-tpo',           materialColor: '#d8d8d8' },
            { name: 'Dense Blockwork Backup',   thickness: 0.140, function: 'structure',       materialId: 'blockwork-dense',        materialColor: '#a0a09a' },
            { name: 'Mineral Wool Insulation',  thickness: 0.080, function: 'insulation',      materialId: 'insulation-mineral-wool', materialColor: '#f0d080' },
            { name: 'Interior Plaster Skim',    thickness: 0.015, function: 'finish-interior', materialId: 'gypsum-skim',            materialColor: '#f5f5f0' }
        ]
    ),
    makeBuiltIn('wt-exposed-wooden-frames', 'Wooden Frames – Exposed Timber 296mm',
        'Exposed timber-frame wall with oak rainscreen, engineered timber structure, insulated cavity, sheathing, and plywood interior lining.',
        [
            { name: 'Exposed Oak Rainscreen',       thickness: 0.025, function: 'finish-exterior', materialId: 'wood-oak-smoked',       materialColor: '#6b523a' },
            { name: 'Breather Membrane',            thickness: 0.005, function: 'air-barrier',     materialId: 'membrane-tpo',         materialColor: '#d8d8d8' },
            { name: 'Structural Timber Frame',      thickness: 0.140, function: 'structure',       materialId: 'timber-glulam',        materialColor: '#c8a060' },
            { name: 'Mineral Wool Between Frames',  thickness: 0.090, function: 'insulation',      materialId: 'insulation-mineral-wool', materialColor: '#f0d080' },
            { name: 'OSB Sheathing',                thickness: 0.018, function: 'substrate',       materialId: 'timber-osb',           materialColor: '#c89d5f' },
            { name: 'Birch Plywood Interior Lining', thickness: 0.018, function: 'finish-interior', materialId: 'timber-plywood',       materialColor: '#e0c890' }
        ]
    ),
    makeBuiltIn('wt-timber-frame', 'Timber Frame – 200mm',
        'Timber stud frame with insulation and sheeting.',
        [
            { name: 'Cladding',          thickness: 0.020, function: 'finish-exterior', materialColor: '#8b6f47' },
            { name: 'Breather Membrane', thickness: 0.003, function: 'substrate',        materialColor: '#e0e0e0' },
            { name: 'Timber Frame',      thickness: 0.140, function: 'structure',        materialColor: '#c8a55a' },
            { name: 'Insulation',        thickness: 0.060, function: 'insulation',       materialColor: '#f5e07a' },
            { name: 'Plasterboard',      thickness: 0.013, function: 'finish-interior',  materialColor: '#f0ece4' }
        ]
    ),
];

// ─────────────────────────────────────────────────────────────────────────────

export class WallSystemTypeStore {
    private types = new Map<string, WallSystemType>();

    constructor() {
        // Load built-in presets
        for (const t of BUILTIN_TYPES) {
            const tt: WallSystemType = Object.freeze({
                ...t,
                layers: t.layers.map(l => Object.freeze({ ...l })) as WallLayer[],
                totalThickness: t.layers.reduce((s, l) => s + l.thickness, 0)
            }) as WallSystemType;
            this.types.set(t.id, tt);
        }
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getById(id: string): WallSystemType | undefined {
        return this.types.get(id);
    }

    getAll(): WallSystemType[] {
        return Array.from(this.types.values());
    }

    isBuiltIn(id: string): boolean {
        return BUILTIN_TYPES.some(t => t.id === id);
    }

    /**
     * Compute total wall thickness from a type's layer stack.
     * Used by CreateWallCommand to override the payload thickness.
     */
    getTotalThickness(id: string): number | null {
        const type = this.types.get(id);
        if (!type) return null;
        return type.totalThickness;
    }

    // ── Write API ─────────────────────────────────────────────────────────────

    /**
     * Add or replace a user-defined wall type.
     * Built-in types cannot be overwritten.
     *
     * §M-B1 (DAILY-USE-AUDIT 2026-05-20) — callers (notably `ProjectLoader` on
     * snapshot restore) MUST be able to preserve the original id. Previously
     * `crypto.randomUUID()` was minted unconditionally, so on every save/load
     * every wall referencing a custom type became a dangling reference and fell
     * back to built-in defaults. Now `params.id` (when supplied) is honoured;
     * fresh user-created types still get a random id.
     */
    add(type: Omit<WallSystemType, 'id' | 'createdAt' | 'modifiedAt' | 'totalThickness'> & { id?: string }): WallSystemType {
        // §M-B1 follow-up — strip `'id'` from the `Omit` set so the intersection
        // with `{ id?: string }` actually makes id optional (a TS intersection
        // of required + optional resolves to required, which broke existing
        // callers that omit id). Now: id stripped by Omit, then added back as
        // optional via the intersection — fresh callers may still omit it.
        const id = (typeof type.id === 'string' && type.id.length > 0) ? type.id : crypto.randomUUID();
        const now = Date.now();
        const { id: _drop, ...rest } = type as { id?: string } & Omit<WallSystemType, 'id' | 'createdAt' | 'modifiedAt' | 'totalThickness'>;
        const newType: WallSystemType = Object.freeze({
            ...rest,
            id,
            createdAt: now,
            modifiedAt: now,
            layers: type.layers.map(l => Object.freeze({ ...l })) as WallLayer[],
            totalThickness: type.layers.reduce((s, l) => s + l.thickness, 0)
        });
        this.types.set(id, newType);
        // FIX-4 (M8): Emit to StoreEventBus so SemanticIndex / DependencyResolver
        // can track wall-type lifecycle without polling.
        storeEventBus.emit({ elementId: id, elementType: 'wallSystemType', operation: 'create', timestamp: Date.now() });
        return newType;
    }

    update(id: string, patch: Partial<Pick<WallSystemType, 'name' | 'layers' | 'description'>>): WallSystemType | null {
        if (this.isBuiltIn(id)) {
            console.warn(`[WallSystemTypeStore] Cannot modify built-in type: ${id}`);
            return null;
        }
        const existing = this.types.get(id);
        if (!existing) return null;

        // FIX: Recompute totalThickness whenever layers are patched so the stored
        // value stays consistent with the actual layer stack.  Without this, a
        // type whose layers were edited would report the pre-edit totalThickness to
        // CreateWallCommand, producing walls with incorrect geometry dimensions.
        const resolvedLayers = (patch.layers ?? existing.layers).map(l => Object.freeze({ ...l })) as WallLayer[];
        const updated: WallSystemType = Object.freeze({
            ...existing,
            ...patch,
            layers: resolvedLayers,
            totalThickness: parseFloat(resolvedLayers.reduce((s, l) => s + l.thickness, 0).toFixed(6)),
            modifiedAt: Date.now()
        });
        this.types.set(id, updated);
        // FIX-4 (M8): Emit to StoreEventBus.
        storeEventBus.emit({ elementId: id, elementType: 'wallSystemType', operation: 'update', timestamp: Date.now() });
        return updated;
    }

    /**
     * Contract 45 — wipe all USER-defined wall types on project switch.
     * Built-in presets are preserved (they are factory data, not project data).
     */
    clearCustomTypes(): void {
        for (const id of [...this.types.keys()]) {
            if (!this.isBuiltIn(id)) {
                this.types.delete(id);
                storeEventBus.emit({ elementId: id, elementType: 'wallSystemType', operation: 'delete', timestamp: Date.now() });
            }
        }
    }

    remove(id: string): boolean {
        if (this.isBuiltIn(id)) {
            console.warn(`[WallSystemTypeStore] Cannot delete built-in type: ${id}`);
            return false;
        }
        const deleted = this.types.delete(id);
        if (deleted) {
            // FIX-4 (M8): Emit to StoreEventBus.
            storeEventBus.emit({ elementId: id, elementType: 'wallSystemType', operation: 'delete', timestamp: Date.now() });
        }
        return deleted;
    }
}

/**
 * Module-level singleton.
 *
 * Import directly wherever wall type lookups are needed:
 *   import { wallSystemTypeStore } from '.../WallSystemTypeStore';
 *
 * Injected into CommandContext.stores.wallSystemTypeStore in main.ts so commands
 * receive it via dependency injection rather than accessing a browser global.
 *
 * Contract §01 §1.1: Side Systems must be injected, never accessed via window.
 */
export const wallSystemTypeStore = new WallSystemTypeStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'wallSystemTypeStore',
    clear: () => wallSystemTypeStore.clearCustomTypes(),
});
