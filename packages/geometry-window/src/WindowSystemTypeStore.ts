/**
 * WindowSystemTypeStore — Registry of named window assembly finish types.
 *
 * Architecture position: Side System (like WallSystemTypeStore / DoorSystemTypeStore).
 * Built-in types are immutable factory presets; user-created custom types are mutable.
 *
 * CONTRACT COMPLIANCE:
 *   §01-BIM-ENGINE-CORE §2.2   : structuredClone for all immutable store updates.
 *   §01-BIM-ENGINE-CORE §3.8   : StoreEventBus emitted on all type store mutations.
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

import { storeEventBus } from '@pryzm/core-app-model';
// TODO(TASK-08): store-unification debt (ADR-0318) — this storeEventBus import is the
// §01 §3.8 emission surface TASK-08 unifies. Work note relocated from the file header,
// where it read to the C74 §3.4 M-B gate as a module-scaffold claim; this store is
// production, not a stand-in (CO-06, 2026-08-14).
// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6) — a TYPE-TYPE ONLY import, and type-only so it
// is erased at runtime: `CustomOutline` never appears as a value here. The pure `./opening-profile`
// subpath is used rather than the bare barrel for the SAME reason `WindowTypes.ts` already does
// (see that file's own header) — this store is loaded early enough in the module graph that the
// bare barrel's re-entry risk (L-11261) is worth avoiding even for a type-only import, since a
// future edit could turn it into a value import without anyone re-deriving the reasoning.
import type { CustomOutline } from '@pryzm/geometry-wall/opening-profile';

// ─── Finish descriptor ─────────────────────────────────────────────────────────
/** A single finish component on a window (frame, glazing, sill). */
export interface WindowFinishLayer {
    name: string;
    materialColor: string;
    materialId?: string;
    description?: string;
}

// ─── Type dimensions ───────────────────────────────────────────────────────────
/**
 * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the TYPE's standard dimensions.
 *
 * Mirrors `DoorSystemType.dimensions`. A window instance may override any of these
 * on its own record; when it does not, `resolveWindowDimensions()` reads them from
 * here, and only then from `DEFAULT_WINDOW_DIMENSIONS`. This is the plumbing that
 * lets a symbol be dimensionally true (L-127) without a single literal in the
 * symbol builder: a slim Crittal steel frame and a fat uPVC frame draw differently
 * because their TYPE says so, not because the drawing code guessed.
 *
 * All values in metres; every field optional (an omitted field falls through).
 */
export interface WindowTypeDimensions {
    /**
     * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the STRUCTURAL OPENING
     * dimensions. Mirrors `DoorSystemType.dimensions.width` / `.doubleWidth` /
     * `.height`, and exists for the same reason: before L-266 these lived as
     * `DEFAULT_SINGLE_WIDTH` / `DEFAULT_DOUBLE_WIDTH` / `DEFAULT_HEIGHT` /
     * `DEFAULT_SILL_HEIGHT` private fields on `WindowTool` AND, independently, as the
     * bare literals `1.2` / `2.4` / `1.2` / `1.0` inside `WindowPlanToolHandler`. Two
     * truths for one dimension is precisely L-127, and it is what made a window drawn
     * in plan a different object from the "same" window drawn in 3D.
     */
    /** Single-leaf structural opening width. */
    width?: number;
    /** Double-leaf structural opening width. */
    doubleWidth?: number;
    /** Window head height (sill → head). */
    height?: number;
    /** Sill height above the level. */
    sillHeight?: number;
    /** Frame member face width — how far the frame reaches into the opening. */
    frameThickness?: number;
    /** Frame member depth across the wall reveal. */
    frameDepth?: number;
    /**
     * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — SASH member face width.
     * The openable leaf frame captured inside the outer frame. The founder's LOD-300
     * reference draws the window as a REAL multi-line profile — outer frame, SASH,
     * mullion/meeting-stile, glazing — and the sash was the one member neither the
     * record nor the type could name, so the symbol could not draw it without
     * inventing an offset (which L-127 forbids).
     */
    sashThickness?: number;
    /** SASH member depth across the reveal — the sash sits proud of the glazing plane. */
    sashDepth?: number;
    /** Glazing unit thickness (e.g. 0.024 for a 4-16-4 sealed unit). */
    glazingThickness?: number;
    /** Jamb rebate / check depth — the pocket that captures the glazing. */
    rebateDepth?: number;
    /**
     * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — MULLION / meeting-stile member face width
     * (the centre post between panes), and its horizontal counterpart the TRANSOM.
     *
     * NOTE THE NAMES. These are the `WindowOpening` record's OWN field names, so the
     * resolution chain record → systemType → default reads ONE dimension under ONE name
     * the whole way down. The slot here was previously called `mullionThickness` — a
     * SECOND name for `columnDividerThickness`, which is the field `WindowBuilder`
     * actually extrudes its mullions from. Nothing ever set it, so nothing ever read a
     * type's mullion; a catalogue author could not state one. Now they can.
     */
    columnDividerThickness?: number;
    rowDividerThickness?: number;
    /** Sill board projection beyond the wall face. */
    sillDepth?: number;
    /** Sill board thickness (vertical). */
    sillThickness?: number;
    /** Sill board overhang past each jamb. */
    sillOverhang?: number;
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
    /**
     * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the type's standard dimensions.
     * Consumed by `resolveWindowDimensions()` when the instance record does not
     * carry the field itself. Absent on the built-in presets → they resolve to
     * `DEFAULT_WINDOW_DIMENSIONS`, i.e. unchanged behaviour.
     */
    dimensions?: WindowTypeDimensions;
    /**
     * §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6, C86 §10.5.b amendment) — a shape TEMPLATE,
     * not a live binding. Optional, normalised `{u,v} ∈ [0,1]²` ring (`CustomOutline` from
     * `@pryzm/geometry-wall`).
     *
     * ⛔ THIS IS NOT "the type's shape". A window CREATED while the active type carries this
     * ring is created `openingProfile: 'custom'` with a COPY of it on its OWN `Opening` — the
     * instance owns its ring from that point on. Editing THIS field afterwards reaches no
     * placed instance (that is the L-10948 "type does not change shape" ruling, unchanged by
     * this field's existence); only the explicit, undoable "Apply shape from type" command
     * copies template → instance. See `ElementTypeAuthoringRegistry.ts`'s `finishEditor.outline`
     * declaration for the authoring surface and C86 §10.5.b for the ruling this field satisfies.
     */
    customOutline?: CustomOutline;
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
        { name: 'Aluminium Frame', materialId: 'aluminium-anodised-silver', materialColor: '#c0c4c8', description: 'Mill-finish aluminium' },
        { name: 'Aluminium Sill',  materialId: 'aluminium-anodised-silver', materialColor: '#c0c4c8', description: 'Mill-finish aluminium sill' },
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
        { name: 'Softwood Frame', materialId: 'wood-pine', materialColor: '#deb887', description: 'Primed softwood frame' },
        { name: 'Timber Sill',    materialId: 'wood-pine', materialColor: '#deb887', description: 'Painted timber sill' },
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
        { name: 'Painted Timber', materialId: 'wood-painted-white', materialColor: '#f5f5f0', description: 'White-painted timber' },
        { name: 'Timber Sill',    materialId: 'wood-painted-white', materialColor: '#f5f5f0', description: 'White-painted sill' },
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
        { name: 'Anodised Aluminium', materialId: 'aluminium-anodised-silver', materialColor: '#c0c4c8', description: 'Dark anodised aluminium' },
        { name: 'Aluminium Sill',     materialId: 'aluminium-anodised-silver', materialColor: '#c0c4c8', description: 'Dark anodised sill' },
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
        { name: 'White uPVC Frame', materialId: 'plastic-white', materialColor: '#ffffff', description: 'White extruded uPVC' },
        { name: 'uPVC Sill',        materialId: 'plastic-white', materialColor: '#ffffff', description: 'White uPVC sill board' },
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
        { name: 'White uPVC Frame', materialId: 'plastic-white', materialColor: '#ffffff', description: 'White extruded uPVC' },
        { name: 'uPVC Sill',        materialId: 'plastic-white', materialColor: '#ffffff', description: 'White uPVC sill board' },
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
        { name: 'Steel Frame',   materialId: 'steel-powder-coated-dark', materialColor: '#444444', description: 'Dark-grey powder-coated steel' },
        { name: 'Steel Sill',    materialId: 'steel-powder-coated-dark', materialColor: '#444444', description: 'Dark powder-coated sill' },
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
        { name: 'Aluminium Frame', materialId: 'aluminium-anodised-silver', materialColor: '#c0c4c8', description: 'Silver anodised frame' },
        { name: 'Aluminium Sill',  materialId: 'aluminium-anodised-silver', materialColor: '#c0c4c8', description: 'Silver anodised sill' },
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

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'windowSystemTypeStore',
    clear: () => windowSystemTypeStore.clearCustomTypes(),
});
