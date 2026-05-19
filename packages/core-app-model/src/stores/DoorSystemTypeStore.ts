/**
 * DoorSystemTypeStore — Registry of named door assembly finish types.
 *
 * Architecture position: Side System (like WallSystemTypeStore / FloorSystemTypeStore).
 * Built-in types are immutable factory presets; user-created custom types are mutable.
 *
 * CONTRACT COMPLIANCE:
 *   §01-BIM-ENGINE-CORE §2.2   : structuredClone for all immutable store updates.
 *   §01-BIM-ENGINE-CORE §3.8   : StoreEventBus emitted on all type store mutations. // TODO(TASK-08)
 *   §01-BIM-ENGINE-CORE §2.7   : Commands read from this store; never write to it directly.
 *   §03-COMMAND-PIPELINE §1.3  : Side system — not in undo/redo history.
 *
 * A DoorSystemType defines the finish materials (frame, leaf, glazing) for a door
 * family.  The `frameColor` / `leafColor` fields drive DoorBuilder geometry colour,
 * matching the materialColor → builder pipeline used by walls, floors and ceilings.
 *
 * When a door is placed using a type, the command stamps the type's default colours
 * and `systemTypeId` onto the DoorOpening record (see CreateWallOpeningCommand).
 *
 * Singleton export: doorSystemTypeStore
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

// ─── Finish descriptor ─────────────────────────────────────────────────────────
/** A single finish component on a door (frame, leaf, glass). */
export interface DoorFinishLayer {
    name: string;
    materialColor: string;
    materialId?: string;
    description?: string;
}

// ─── DoorSystemType ────────────────────────────────────────────────────────────
export interface DoorSystemType {
    id: string;
    name: string;
    description?: string;
    category: DoorTypeCategory;
    isBuiltIn: boolean;
    /** Finish applied to the door frame members */
    frameFinish: DoorFinishLayer;
    /** Finish applied to the leaf panel(s) */
    leafFinish: DoorFinishLayer;
    /** Glazing opacity: 0 = clear glass, 1 = opaque (no glazing shown) */
    glazingOpacity: number;
    /** Default leaf configuration rows */
    defaultSegments?: Array<{
        type: 'panel' | 'glass' | 'empty';
        heightRatio: number;
        columnRatios?: number[];
    }>;
    tags?: string[];
    ifcTypeName?: string;
    metadata: { createdAt: number; modifiedAt: number; createdBy: string; version: number };
}

export type DoorTypeCategory =
    | 'solid-timber'
    | 'glazed'
    | 'fire-rated'
    | 'steel'
    | 'aluminium'
    | 'composite'
    | 'custom';

// ─── Built-in presets ──────────────────────────────────────────────────────────

function makeMeta(createdBy = 'system') {
    const now = Date.now();
    return { createdAt: now, modifiedAt: now, createdBy, version: 1 };
}

function makeBuiltIn(
    id: string,
    name: string,
    category: DoorTypeCategory,
    frameFinish: DoorFinishLayer,
    leafFinish: DoorFinishLayer,
    glazingOpacity: number,
    description?: string,
    defaultSegments?: DoorSystemType['defaultSegments'],
    tags?: string[],
    ifcTypeName?: string,
): DoorSystemType {
    return Object.freeze({
        id, name, description, category,
        isBuiltIn: true,
        frameFinish: Object.freeze({ ...frameFinish }),
        leafFinish:  Object.freeze({ ...leafFinish }),
        glazingOpacity,
        defaultSegments: defaultSegments
            ? Object.freeze(defaultSegments.map(s => Object.freeze({ ...s })))
            : undefined,
        tags,
        ifcTypeName,
        metadata: Object.freeze(makeMeta()),
    }) as DoorSystemType;
}

const BUILT_IN_TYPES: DoorSystemType[] = [
    makeBuiltIn(
        'dt-solid-timber',
        'Solid Timber (Default)',
        'solid-timber',
        { name: 'Timber Frame', materialColor: '#c8a55a', description: 'Stained hardwood frame' },
        { name: 'Timber Leaf',  materialColor: '#c8a55a', description: 'Stained hardwood panel' },
        1.0,
        'Solid hardwood door — standard residential and commercial.',
        [
            { type: 'panel', heightRatio: 0.4, columnRatios: [1] },
            { type: 'panel', heightRatio: 0.6, columnRatios: [1] },
        ],
        ['timber', 'solid', 'residential'],
        'DOOR'
    ),
    makeBuiltIn(
        'dt-white-primed',
        'White Primed Softwood',
        'solid-timber',
        { name: 'MDF Frame', materialColor: '#f0ece4', description: 'White primed MDF frame' },
        { name: 'MDF Leaf',  materialColor: '#f0ece4', description: 'White primed MDF flush leaf' },
        1.0,
        'White primed flush door — typical interior partition.',
        [
            { type: 'panel', heightRatio: 1.0, columnRatios: [1] },
        ],
        ['white', 'primed', 'interior', 'flush'],
        'DOOR'
    ),
    makeBuiltIn(
        'dt-glazed-timber',
        'Glazed Timber (Half-Light)',
        'glazed',
        { name: 'Timber Frame',   materialColor: '#b8895a', description: 'Dark stain timber frame' },
        { name: 'Glazed Leaf',    materialColor: '#b8895a', description: 'Timber with glass panel' },
        0.25,
        'Timber door with upper glass panel — half-light configuration.',
        [
            { type: 'glass',  heightRatio: 0.5, columnRatios: [1] },
            { type: 'panel',  heightRatio: 0.5, columnRatios: [1] },
        ],
        ['glazed', 'half-light', 'timber', 'vision'],
        'DOOR'
    ),
    makeBuiltIn(
        'dt-glazed-aluminium',
        'Glazed Aluminium Frame',
        'glazed',
        { name: 'Aluminium Frame', materialColor: '#b0b8c8', description: 'Mill-finish aluminium' },
        { name: 'Glazed Panel',    materialColor: '#b0b8c8', description: 'Full glass leaf in aluminium' },
        0.2,
        'Full-height glazed door in aluminium frame — office and commercial.',
        [
            { type: 'glass', heightRatio: 1.0, columnRatios: [1] },
        ],
        ['glazed', 'aluminium', 'commercial', 'full-light'],
        'DOOR'
    ),
    makeBuiltIn(
        'dt-fire-rated-60',
        'Fire Door FD60',
        'fire-rated',
        { name: 'Steel Frame', materialColor: '#888888', description: 'Grey-painted steel frame' },
        { name: 'Fire Leaf',   materialColor: '#a0a0a0', description: 'Intumescent fire-rated leaf' },
        1.0,
        '60-minute fire-rated door — stairwells, plant rooms and corridors.',
        [
            { type: 'panel', heightRatio: 1.0, columnRatios: [1] },
        ],
        ['fire-rated', 'FD60', 'steel', 'safety'],
        'FIRE_DOOR'
    ),
    makeBuiltIn(
        'dt-fire-rated-30',
        'Fire Door FD30',
        'fire-rated',
        { name: 'Timber Frame', materialColor: '#907060', description: 'Painted timber frame' },
        { name: 'Fire Leaf',    materialColor: '#9a8878', description: '30-minute fire-rated timber leaf' },
        1.0,
        '30-minute fire-rated door — residential and light commercial.',
        [
            { type: 'panel', heightRatio: 1.0, columnRatios: [1] },
        ],
        ['fire-rated', 'FD30', 'timber', 'residential'],
        'FIRE_DOOR'
    ),
    makeBuiltIn(
        'dt-steel-industrial',
        'Steel Industrial',
        'steel',
        { name: 'Steel Frame', materialColor: '#7a7a7a', description: 'Galvanised steel frame' },
        { name: 'Steel Leaf',  materialColor: '#909090', description: 'Cold-rolled steel leaf' },
        1.0,
        'Heavy-duty galvanised steel door — industrial, plant, and security.',
        [
            { type: 'panel', heightRatio: 1.0, columnRatios: [1] },
        ],
        ['steel', 'industrial', 'security', 'heavy-duty'],
        'DOOR'
    ),
    makeBuiltIn(
        'dt-aluminium-commercial',
        'Aluminium Commercial',
        'aluminium',
        { name: 'Aluminium Frame', materialColor: '#a8b0b8', description: 'Anodised aluminium frame' },
        { name: 'Aluminium Leaf',  materialColor: '#b8bfc8', description: 'Extruded aluminium leaf' },
        1.0,
        'Anodised aluminium door — shopfronts and commercial entrances.',
        [
            { type: 'panel', heightRatio: 1.0, columnRatios: [1] },
        ],
        ['aluminium', 'commercial', 'anodised'],
        'DOOR'
    ),
];

// ─── Store class ───────────────────────────────────────────────────────────────

export class DoorSystemTypeStore {
    private _types: Map<string, DoorSystemType> = new Map();

    constructor() {
        for (const t of BUILT_IN_TYPES) {
            this._types.set(t.id, t);
        }
    }

    getAll(): DoorSystemType[] {
        return Array.from(this._types.values());
    }

    getById(id: string): DoorSystemType | undefined {
        return this._types.get(id);
    }

    has(id: string): boolean {
        return this._types.has(id);
    }

    /** Add a user-created custom type. Throws if id already exists. */
    add(type: DoorSystemType): void {
        if (this._types.has(type.id)) {
            throw new Error(`[DoorSystemTypeStore] Type id "${type.id}" already exists.`);
        }
        const clone = structuredClone(type) as DoorSystemType;
        this._types.set(clone.id, clone);
        storeEventBus.emit({ elementId: clone.id, elementType: 'doorSystemType', operation: 'create', timestamp: Date.now() });
    }

    /** Update a user-created type. Built-in types cannot be modified. */
    update(id: string, patch: Partial<DoorSystemType>): void {
        const existing = this._types.get(id);
        if (!existing) throw new Error(`[DoorSystemTypeStore] Type "${id}" not found.`);
        if (existing.isBuiltIn) throw new Error(`[DoorSystemTypeStore] Built-in type "${id}" is immutable.`);
        const updated = structuredClone({ ...existing, ...patch, id }) as DoorSystemType;
        this._types.set(id, updated);
        storeEventBus.emit({ elementId: id, elementType: 'doorSystemType', operation: 'update', timestamp: Date.now() });
    }

    /** Remove a user-created type. Built-in types cannot be removed. */
    remove(id: string): void {
        const existing = this._types.get(id);
        if (!existing) return;
        if (existing.isBuiltIn) throw new Error(`[DoorSystemTypeStore] Built-in type "${id}" cannot be deleted.`);
        this._types.delete(id);
        storeEventBus.emit({ elementId: id, elementType: 'doorSystemType', operation: 'delete', timestamp: Date.now() });
    }

    /** Contract 45 — wipe USER-defined door types only. Built-ins preserved. */
    clearCustomTypes(): void {
        for (const [id, t] of [...this._types.entries()]) {
            if (!t.isBuiltIn) {
                this._types.delete(id);
                storeEventBus.emit({ elementId: id, elementType: 'doorSystemType', operation: 'delete', timestamp: Date.now() });
            }
        }
    }

    /** Duplicate a type (built-in or custom) and return the new type with a generated id. */
    duplicate(id: string, newId?: string, newName?: string): DoorSystemType {
        const source = this._types.get(id);
        if (!source) throw new Error(`[DoorSystemTypeStore] Type "${id}" not found.`);
        const clone = structuredClone(source) as DoorSystemType;
        clone.id = newId ?? `dt-custom-${Date.now()}`;
        clone.name = newName ?? `${source.name} (Copy)`;
        clone.isBuiltIn = false;
        (clone.metadata as any).createdBy = 'user';
        (clone.metadata as any).createdAt = Date.now();
        (clone.metadata as any).modifiedAt = Date.now();
        this._types.set(clone.id, clone);
        storeEventBus.emit({ elementId: clone.id, elementType: 'doorSystemType', operation: 'create', timestamp: Date.now() });
        return clone;
    }
}

export const doorSystemTypeStore = new DoorSystemTypeStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'doorSystemTypeStore',
    clear: () => doorSystemTypeStore.clearCustomTypes(),
});
