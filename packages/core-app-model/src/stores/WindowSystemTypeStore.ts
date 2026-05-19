/**
 * WindowSystemTypeStore — Registry of named window assembly finish types.
 *
 * Architecture position: Side System (like WallSystemTypeStore / DoorSystemTypeStore).
 * Built-in types are immutable factory presets; user-created custom types are mutable.
 *
 * CONTRACT COMPLIANCE:
 *   §01-BIM-ENGINE-CORE §2.2   : structuredClone for all immutable store updates.
 *   §01-BIM-ENGINE-CORE §3.8   : StoreEventBus emitted on all type store mutations. // TODO(TASK-08)
 *   §01-BIM-ENGINE-CORE §2.7   : Commands read from this store; never write to it directly.
 *   §03-COMMAND-PIPELINE §1.3  : Side system — not in undo/redo history.
 *
 * A WindowSystemType defines the finish materials (frame, glazing, sill) for a window
 * family.  The `frameColor` and `glassOpacity` fields drive WindowBuilder geometry,
 * matching the materialColor → builder pipeline used across all element types.
 *
 * When a window is placed using a type, the command stamps the type's default colours
 * and `systemTypeId` onto the WindowOpening record (see CreateWallOpeningCommand).
 *
 * Singleton export: windowSystemTypeStore
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

// ─── Finish descriptor ─────────────────────────────────────────────────────────
/** A single finish component on a window (frame, glazing, sill). */
export interface WindowFinishLayer {
    name: string;
    materialColor: string;
    materialId?: string;
    description?: string;
}

// ─── WindowSystemType ──────────────────────────────────────────────────────────
export interface WindowSystemType {
    id: string;
    name: string;
    description?: string;
    category: WindowTypeCategory;
    isBuiltIn: boolean;
    /** Finish applied to the frame and divider members */
    frameFinish: WindowFinishLayer;
    /** Sill finish (external sill nose) */
    sillFinish: WindowFinishLayer;
    /** Glazing opacity for 3D render: 0 = clear, 1 = opaque */
    glazingOpacity: number;
    /** Default column ratios — [1] single pane, [0.5,0.5] two equal panes */
    defaultColumnRatios?: number[];
    /** Default row ratios */
    defaultRowRatios?: number[];
    tags?: string[];
    ifcTypeName?: string;
    metadata: { createdAt: number; modifiedAt: number; createdBy: string; version: number };
}

export type WindowTypeCategory =
    | 'timber'
    | 'aluminium'
    | 'upvc'
    | 'steel'
    | 'composite'
    | 'curtain-wall'
    | 'custom';

// ─── Built-in presets ──────────────────────────────────────────────────────────

function makeMeta(createdBy = 'system') {
    const now = Date.now();
    return { createdAt: now, modifiedAt: now, createdBy, version: 1 };
}

function makeBuiltIn(
    id: string,
    name: string,
    category: WindowTypeCategory,
    frameFinish: WindowFinishLayer,
    sillFinish: WindowFinishLayer,
    glazingOpacity: number,
    description?: string,
    defaultColumnRatios?: number[],
    defaultRowRatios?: number[],
    tags?: string[],
    ifcTypeName?: string,
): WindowSystemType {
    return Object.freeze({
        id, name, description, category,
        isBuiltIn: true,
        frameFinish:  Object.freeze({ ...frameFinish }),
        sillFinish:   Object.freeze({ ...sillFinish }),
        glazingOpacity,
        defaultColumnRatios: defaultColumnRatios ? Object.freeze([...defaultColumnRatios]) : undefined,
        defaultRowRatios:    defaultRowRatios    ? Object.freeze([...defaultRowRatios])    : undefined,
        tags,
        ifcTypeName,
        metadata: Object.freeze(makeMeta()),
    }) as WindowSystemType;
}

const BUILT_IN_TYPES: WindowSystemType[] = [
    makeBuiltIn(
        'wt-single-pane',
        'Single Pane (Default)',
        'aluminium',
        { name: 'Aluminium Frame', materialColor: '#e8e8e8', description: 'Mill-finish aluminium' },
        { name: 'Aluminium Sill',  materialColor: '#e0e0e0', description: 'Mill-finish aluminium sill' },
        0.3,
        'Standard single-pane aluminium window — default residential.',
        [1],
        [1],
        ['aluminium', 'single', 'residential'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-timber-casement',
        'Timber Casement',
        'timber',
        { name: 'Softwood Frame', materialColor: '#d4aa70', description: 'Primed softwood frame' },
        { name: 'Timber Sill',    materialColor: '#c8a060', description: 'Painted timber sill' },
        0.3,
        'Traditional timber casement — residential and heritage.',
        [1],
        [1],
        ['timber', 'casement', 'residential', 'heritage'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-timber-double-hung',
        'Timber Double-Hung',
        'timber',
        { name: 'Painted Timber', materialColor: '#f0ece4', description: 'White-painted timber' },
        { name: 'Timber Sill',    materialColor: '#e8e4dc', description: 'White-painted sill' },
        0.3,
        'Double-hung sash in white-painted timber — Victorian and heritage.',
        [1],
        [0.5, 0.5],
        ['timber', 'double-hung', 'sash', 'heritage'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-aluminium-commercial',
        'Aluminium Commercial',
        'aluminium',
        { name: 'Anodised Aluminium', materialColor: '#b0b8c0', description: 'Dark anodised aluminium' },
        { name: 'Aluminium Sill',     materialColor: '#a8b0b8', description: 'Dark anodised sill' },
        0.25,
        'Commercial anodised aluminium — office and retail facades.',
        [0.5, 0.5],
        [1],
        ['aluminium', 'commercial', 'anodised'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-upvc-casement',
        'uPVC Casement',
        'upvc',
        { name: 'White uPVC Frame', materialColor: '#f4f4f4', description: 'White extruded uPVC' },
        { name: 'uPVC Sill',        materialColor: '#efefef', description: 'White uPVC sill board' },
        0.3,
        'Energy-efficient uPVC casement — domestic new-build.',
        [1],
        [1],
        ['upvc', 'casement', 'residential', 'energy-efficient'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-upvc-tilt-turn',
        'uPVC Tilt & Turn',
        'upvc',
        { name: 'White uPVC Frame', materialColor: '#f4f4f4', description: 'White extruded uPVC' },
        { name: 'uPVC Sill',        materialColor: '#efefef', description: 'White uPVC sill board' },
        0.3,
        'Tilt-and-turn uPVC — European residential standard.',
        [1],
        [1],
        ['upvc', 'tilt-turn', 'residential', 'european'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-steel-crittal',
        'Steel Crittal Style',
        'steel',
        { name: 'Steel Frame',   materialColor: '#444444', description: 'Dark-grey powder-coated steel' },
        { name: 'Steel Sill',    materialColor: '#3a3a3a', description: 'Dark powder-coated sill' },
        0.2,
        'Slim steel frame in Crittal style — heritage, residential, commercial.',
        [0.5, 0.5],
        [0.5, 0.5],
        ['steel', 'crittal', 'heritage', 'slim'],
        'WINDOW'
    ),
    makeBuiltIn(
        'wt-aluminium-triple-glazed',
        'Aluminium Triple Glazed',
        'aluminium',
        { name: 'Aluminium Frame', materialColor: '#c8cfd8', description: 'Silver anodised frame' },
        { name: 'Aluminium Sill',  materialColor: '#c0c8d0', description: 'Silver anodised sill' },
        0.22,
        'High-performance triple-glazed aluminium — Passivhaus and zero-carbon.',
        [1],
        [1],
        ['aluminium', 'triple-glazed', 'passivhaus', 'high-performance'],
        'WINDOW'
    ),
];

// ─── Store class ───────────────────────────────────────────────────────────────

export class WindowSystemTypeStore {
    private _types: Map<string, WindowSystemType> = new Map();

    constructor() {
        for (const t of BUILT_IN_TYPES) {
            this._types.set(t.id, t);
        }
    }

    getAll(): WindowSystemType[] {
        return Array.from(this._types.values());
    }

    getById(id: string): WindowSystemType | undefined {
        return this._types.get(id);
    }

    has(id: string): boolean {
        return this._types.has(id);
    }

    /** Add a user-created custom type. Throws if id already exists. */
    add(type: WindowSystemType): void {
        if (this._types.has(type.id)) {
            throw new Error(`[WindowSystemTypeStore] Type id "${type.id}" already exists.`);
        }
        const clone = structuredClone(type) as WindowSystemType;
        this._types.set(clone.id, clone);
        storeEventBus.emit({ elementId: clone.id, elementType: 'windowSystemType', operation: 'create', timestamp: Date.now() });
    }

    /** Update a user-created type. Built-in types cannot be modified. */
    update(id: string, patch: Partial<WindowSystemType>): void {
        const existing = this._types.get(id);
        if (!existing) throw new Error(`[WindowSystemTypeStore] Type "${id}" not found.`);
        if (existing.isBuiltIn) throw new Error(`[WindowSystemTypeStore] Built-in type "${id}" is immutable.`);
        const updated = structuredClone({ ...existing, ...patch, id }) as WindowSystemType;
        this._types.set(id, updated);
        storeEventBus.emit({ elementId: id, elementType: 'windowSystemType', operation: 'update', timestamp: Date.now() });
    }

    /** Remove a user-created type. Built-in types cannot be removed. */
    remove(id: string): void {
        const existing = this._types.get(id);
        if (!existing) return;
        if (existing.isBuiltIn) throw new Error(`[WindowSystemTypeStore] Built-in type "${id}" cannot be deleted.`);
        this._types.delete(id);
        storeEventBus.emit({ elementId: id, elementType: 'windowSystemType', operation: 'delete', timestamp: Date.now() });
    }

    /** Contract 45 — wipe USER-defined window types only. Built-ins preserved. */
    clearCustomTypes(): void {
        for (const [id, t] of [...this._types.entries()]) {
            if (!t.isBuiltIn) {
                this._types.delete(id);
                storeEventBus.emit({ elementId: id, elementType: 'windowSystemType', operation: 'delete', timestamp: Date.now() });
            }
        }
    }

    /** Duplicate a type (built-in or custom) and return the new type with a generated id. */
    duplicate(id: string, newId?: string, newName?: string): WindowSystemType {
        const source = this._types.get(id);
        if (!source) throw new Error(`[WindowSystemTypeStore] Type "${id}" not found.`);
        const clone = structuredClone(source) as WindowSystemType;
        clone.id = newId ?? `wt-custom-${Date.now()}`;
        clone.name = newName ?? `${source.name} (Copy)`;
        clone.isBuiltIn = false;
        (clone.metadata as any).createdBy = 'user';
        (clone.metadata as any).createdAt = Date.now();
        (clone.metadata as any).modifiedAt = Date.now();
        this._types.set(clone.id, clone);
        storeEventBus.emit({ elementId: clone.id, elementType: 'windowSystemType', operation: 'create', timestamp: Date.now() });
        return clone;
    }
}

export const windowSystemTypeStore = new WindowSystemTypeStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'windowSystemTypeStore',
    clear: () => windowSystemTypeStore.clearCustomTypes(),
});
