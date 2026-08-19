/**
 * BrowserDataHelpers — data-access and utility functions for UnifiedBrowserPanel.
 *
 * Also defines UBPBag (shared state + callback bag) to avoid circular imports.
 * Shell creates one bag instance per UnifiedBrowserPanel; zone files receive it
 * as their first parameter.
 *
 * Window globals (all Phase D/E/C scope — unchanged from original file):
 *   window.bimManager        TODO(D.4)
 *   window.wallStore         TODO(E.wall.S)
 *   window.curtainWallStore  TODO(E.curtain-wall.S)
 *   window.slabStore         TODO(E.slab.S)
 *   window.floorStore        TODO(E.floor.S)
 *   window.ceilingStore      TODO(E.ceiling.S)
 *   window.doorStore         TODO(E.door.S)
 *   window.windowStore       TODO(E.window.S)
 *   window.openingStore      TODO(E.14)
 *   window.furnitureStore    TODO(E.furniture.S)
 *   window.lightingStore     TODO(E.lighting.S)
 *   window.stairStore        TODO(E.stair.S)
 *   window.handrailStore     TODO(E.handrail.S)
 *   window.columnStore       TODO(E.column.S)
 *   window.beamStore         TODO(E.beam.S)
 *   window.plumbingStore     TODO(E.plumbing.S)
 *   window.roomStore         TODO(E.18-R.S)
 *   window.ifcModelStore     TODO(E.ifc.S)
 *   window.projectStore      TODO(C.3.x)
 *   window.projectContext    TODO(C.3.x)
 *
 * (The per-global window.*-store migration work notes live inline on the code
 * sites below, where the reads actually happen — not here.)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Shared state bag ──────────────────────────────────────────────────────────

/**
 * UBPBag — shared state + callback contract for UnifiedBrowserPanel zones.
 *
 * The three primitive fields (buildingVisible, isolateMode, selectedElemId) are
 * backed by live getter/setters on the shell instance so that mutations from
 * any zone are immediately visible to all other zones.
 *
 * Maps and Sets are passed by reference — in-place mutations propagate
 * automatically.
 */
export interface UBPBag {
    readonly sectionId: string;
    runtime:   PryzmRuntime | null;
    roofStore: { getAll(): any[] } | null;

    // Mutable primitive state (getter/setter backed by shell fields)
    buildingVisible: boolean;
    isolateMode:     string | null;
    selectedElemId:  string | null;

    // Mutable collection state (direct references)
    expandedLevels:  Set<string>;
    expandedTypes:   Map<string, Set<string>>;
    levelVisible:    Map<string, boolean>;
    typeVisible:     Map<string, boolean>;
    elemVisible:     Map<string, boolean>;
    catExpanded:     Set<string>;
    catTypeExpanded: Map<string, Set<string>>;
    catVisible:      Map<string, boolean>;
    catTypeVisible:  Map<string, boolean>;

    // Core UI callbacks (implemented in shell)
    refresh():    void;
    makeVisBtn(visible: boolean, onChange: (v: boolean) => void): HTMLElement;
    makeIsoBtn(key: string, getElemIds: () => string[]): HTMLElement;
}

// ── Level helpers ─────────────────────────────────────────────────────────────

export function getLevels(): Array<{ id: string; name: string; elevation?: number }> {
    try {
        const bm = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        if (bm && typeof bm.getLevels === 'function') return bm.getLevels();
        const ws = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
        if (ws && typeof ws.getLevels === 'function') return ws.getLevels();
        const pc = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
        if (pc && Array.isArray(pc.levels)) return pc.levels;
    } catch { /* ignore */ }
    return [];
}

export function isActiveLevel(levelId: string): boolean {
    try {
        const pc = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
        return pc?.activeLevelId === levelId;
    } catch { return false; }
}

export function setActiveLevel(levelId: string): void {
    try {
        const pc = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
        if (pc) {
            pc.activeLevelId = levelId;
        } else {
            const bm = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
            if (bm && typeof bm.setActiveLevel === 'function') bm.setActiveLevel(levelId);
        }
    } catch { /* ignore */ }
}

// ── IFC helpers ───────────────────────────────────────────────────────────────

export function getIfcModels(): any[] {
    const store = window.ifcModelStore; // TODO(E.ifc.S): legacy ifcModelStore — replace with runtime.stores.ifcModel // TODO(TASK-08)
    if (!store?.getAll) return [];
    return store.getAll();
}

export function normalizeStoreyName(name: string): string {
    return name.toLowerCase()
        .replace(/\s*\([\d.+-]+\s*m?\)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function getIfcElementsForStorey(storeyName: string): any[] {
    const normTarget = normalizeStoreyName(storeyName);
    const result: any[] = [];
    for (const model of getIfcModels()) {
        for (const el of model.elements ?? []) {
            if (normalizeStoreyName(el.storeyName ?? '') === normTarget) {
                result.push({
                    id:          el.id ?? `ifc-${el.expressID}`,
                    name:        el.name ?? `${el.ifcTypeName} ${el.expressID}`,
                    type:        (el.ifcTypeName ?? 'Element').toLowerCase(),
                    elementType: (el.ifcTypeName ?? 'Element').toLowerCase(),
                    _isIfc:      true,
                });
            }
        }
    }
    return result;
}

export function getUnifiedLevels(): Array<{ id: string; name: string; elevation?: number; isIfcOnly?: boolean }> {
    const nativeLevels = getLevels().sort((a: any, b: any) =>
        (b.elevation ?? b.index ?? 0) - (a.elevation ?? a.index ?? 0)
    );
    const nativeNorms = new Set(nativeLevels.map(l => normalizeStoreyName(l.name)));

    const ifcOnlyStoreys: string[] = [];
    const seen = new Set<string>();
    for (const model of getIfcModels()) {
        for (const storeyName of model.storeyOrder ?? []) {
            const norm = normalizeStoreyName(storeyName);
            if (!nativeNorms.has(norm) && !seen.has(norm)) {
                seen.add(norm);
                ifcOnlyStoreys.push(storeyName);
            }
        }
    }

    const ifcVirtual = ifcOnlyStoreys.map(sn => ({
        id:       `ifc-storey:${sn}`,
        name:      sn,
        elevation: undefined,
        isIfcOnly: true as const,
    }));

    return [...nativeLevels, ...ifcVirtual];
}

// ── Store helpers ─────────────────────────────────────────────────────────────

export function getAllStores(bag: UBPBag): any[] {
    return [
        window.wallStore,         // TODO(E.wall.S) // TODO(TASK-08)
        window.curtainWallStore,  // TODO(E.curtain-wall.S) // TODO(TASK-08)
        window.slabStore,         // TODO(E.slab.S) // TODO(TASK-08)
        window.floorStore,        // TODO(E.floor.S) // TODO(TASK-08)
        window.ceilingStore,      // TODO(E.ceiling.S) // TODO(TASK-08)
        bag.roofStore,
        window.doorStore,         // TODO(E.door.S) // TODO(TASK-08)
        window.windowStore,       // TODO(E.window.S) // TODO(TASK-08)
        window.openingStore,      // TODO(E.14) // TODO(TASK-08)
        window.furnitureStore,    // TODO(E.furniture.S) // TODO(TASK-08)
        window.lightingStore,     // TODO(E.lighting.S) // TODO(TASK-08)
        window.stairStore,        // TODO(E.stair.S) // TODO(TASK-08)
        window.handrailStore,     // TODO(E.handrail.S) // TODO(TASK-08)
        window.columnStore,       // TODO(E.column.S) // TODO(TASK-08)
        window.beamStore,         // TODO(E.beam.S) // TODO(TASK-08)
        window.plumbingStore,     // TODO(E.plumbing.S) // TODO(TASK-08)
        window.roomStore,         // TODO(E.18-R.S) // TODO(TASK-08)
    ];
}

export function getElementsForLevel(bag: UBPBag, levelId: string): any[] {
    if (levelId.startsWith('ifc-storey:')) {
        return getIfcElementsForStorey(levelId.slice('ifc-storey:'.length));
    }
    const result: any[] = [];
    const target = String(levelId);
    // §149 ISOLATE-LEVEL-HOSTED-MISSING — doors/windows/openings are HOSTED on a wall
    // and carry NO `levelId` of their own in their store record (only `wallId`; see
    // DoorStore/WindowStore). Matching purely on `el.levelId` therefore yielded
    // 'undefined' === levelId → false for every hosted element, so isolating/hiding a
    // floor plan wrongly EXCLUDED that level's doors & windows and they vanished. Resolve
    // a hosted element's level through its host wall (C15 hosted-element semantics) so a
    // level's openings travel with their host.
    const ws = window.wallStore; // TODO(E.wall.S): legacy wallStore — replace with runtime.stores.wall
    const levelOfElement = (el: any): string | undefined => {
        if (el?.levelId != null) return String(el.levelId);
        if (el?.wallId != null && typeof ws?.getById === 'function') {
            const host = ws.getById(String(el.wallId));
            if (host?.levelId != null) return String(host.levelId);
        }
        return undefined;
    };
    for (const store of getAllStores(bag)) {
        if (!store?.getAll) continue;
        for (const el of store.getAll()) {
            if (levelOfElement(el) === target) result.push(el);
        }
    }
    const nativeLevel = getLevels().find(l => String(l.id) === target);
    if (nativeLevel) result.push(...getIfcElementsForStorey(nativeLevel.name));
    return result;
}

// ── §BROWSER-ONE-VOCABULARY (L-1172) — ONE classifier for the Project tree ────
//
// THE FOUNDER'S DEFECT (2026-08-19): his Level 15 tree read
// `WALL 25 · SLAB 1 · UNKNOWN 227 · ROOM 1` right after a bulk window create.
//
// ⭐ THE ELEMENTS GENUINELY HAVE NO TYPE. This is not a casing mismatch and not a
// browser bug in the usual sense — it is a HOLE IN THE DTO. `DoorOpeningSchema`
// (`packages/geometry-door/src/DoorTypes.ts`), `WindowOpeningSchema`
// (`packages/geometry-window/src/WindowTypes.ts`) and `BeamData`
// (`packages/core-app-model/src/stores/BeamTypes.ts`) declare NO `type` /
// `elementType` field at all. They are Zod objects in default STRIP mode, so a
// caller that passes `type` has it DELETED on the way in: a door record cannot
// carry its own kind today even if someone tried. Every other store in
// `getAllStores` declares one (`'wall'`, `'slab'`, `'opening'`, `'room'`, …).
// So `UNKNOWN` == doors + windows + beams, exactly, and 227 of them is a bulk
// window create landing in the only bucket the tree could put them in.
//
// ⚠ THE BROWSER MUST NOT INVENT A VOCABULARY TO PATCH THIS. That is the C84 EI-8/EI-9
// trap: a fourth private guess ("it has a `doorType` field, so it's probably a door")
// is how a repo ends up with five disagreeing answers to "what kind of thing is this?".
// The fallback below is PROVENANCE, which is not a guess but the strongest statement
// available: a record returned by `window.doorStore.getAll()` IS a door — the store's
// identity is the classification, and `getAllStores()` already knows it. One expression,
// one table, and it is the SAME table the read above uses.
//
// ⛔ THIS IS A READ-SIDE REPAIR, NOT THE ROOT FIX. The root is the missing DTO field,
// and it belongs to the geometry-door / geometry-window / core-app-model owners because
// it changes the persisted schema and every `safeParse` round-trip. Logged separately —
// do not close that on the strength of this. When the DTO carries `type`, the
// `declared` branch below wins and this table becomes dead weight to delete.

/** The window-global name → element-kind table. The ONLY place store identity is read
 *  as a classification, and deliberately in the SAME order as `getAllStores`. */
const STORE_KIND_BY_GLOBAL: ReadonlyArray<readonly [string, string]> = [
    ['wallStore', 'wall'],
    ['curtainWallStore', 'curtain-wall'],
    ['slabStore', 'slab'],
    ['floorStore', 'floor'],
    ['ceilingStore', 'ceiling'],
    ['doorStore', 'door'],
    ['windowStore', 'window'],
    ['openingStore', 'opening'],
    ['furnitureStore', 'furniture'],
    ['lightingStore', 'lighting'],
    ['stairStore', 'stair'],
    ['handrailStore', 'handrail'],
    ['columnStore', 'column'],
    ['beamStore', 'beam'],
    ['plumbingStore', 'plumbing_fixture'],
    ['roomStore', 'room'],
];

/** Memo so a tree render does not re-scan the stores per row. Keyed by RECORD IDENTITY —
 *  store records are frozen singletons, and `Object.freeze` means we cannot stamp the kind
 *  onto the record itself (which is why this is a WeakMap and not a mutation). */
const _kindByRecord = new WeakMap<object, string>();

/**
 * ⭐ THE ONE CLASSIFIER. Every surface of the Project tree that asks "what kind of element
 * is this?" calls THIS — `groupByType`, `getTypeElementIds`, and
 * `UnifiedBrowserPanel._expandToElement` — so the group a row is filed under, the ids the
 * isolate button collects, and the node auto-expand targets can never disagree. They were
 * three copies of the same expression before, which is how a fix lands in one and not the
 * others.
 *
 * Order is deliberate: a DECLARED type always wins, so the day the DTOs gain their `type`
 * field this function silently stops using provenance at all.
 */
export function elementTypeName(el: any): string {
    const declared = el?.type ?? el?.elementType;
    if (declared != null && String(declared).length > 0) return String(declared);
    if (el == null || typeof el !== 'object') return 'Unknown';
    const memo = _kindByRecord.get(el as object);
    if (memo !== undefined) return memo;
    // Provenance scan — only ever reached for a record whose DTO declares no kind.
    // `getById` is a Map lookup, so this is ~16 lookups for a door and zero for
    // everything else in the model.
    const id = el.id != null ? String(el.id) : null;
    if (id !== null) {
        for (const [globalName, kind] of STORE_KIND_BY_GLOBAL) {
            const store = (window as unknown as Record<string, { getById?: (id: string) => unknown }>)[globalName];
            const hit: unknown = typeof store?.getById === 'function' ? store.getById(id) : undefined;
            if (hit === el || (hit != null && String((hit as { id?: unknown }).id) === id)) {
                _kindByRecord.set(el as object, kind);
                return kind;
            }
        }
    }
    // Genuinely unclassifiable — an element that is in no known store and declares no
    // kind. Kept as a VISIBLE bucket rather than hidden: a row the tree cannot name is
    // a finding, and silently dropping it would be the false negative.
    _kindByRecord.set(el as object, 'Unknown');
    return 'Unknown';
}

export function groupByType(elements: any[], _levelId: string): Map<string, any[]> {
    const map = new Map<string, any[]>();
    for (const el of elements) {
        const typeName = elementTypeName(el);
        if (!map.has(typeName)) map.set(typeName, []);
        map.get(typeName)!.push(el);
    }
    return map;
}

export function getAllElementIds(bag: UBPBag): string[] {
    const result: string[] = [];
    for (const store of getAllStores(bag)) {
        if (!store?.getAll) continue;
        for (const el of store.getAll()) result.push(String(el.id));
    }
    for (const model of getIfcModels()) {
        for (const el of model.elements ?? []) {
            result.push(String(el.id ?? `ifc-${el.expressID}`));
        }
    }
    return result;
}

export function getTypeElementIds(bag: UBPBag, levelId: string, typeName: string): string[] {
    // §BROWSER-ONE-VOCABULARY (L-1172) — the SAME classifier `groupByType` filed the rows
    // under. Before, this was a second copy of the expression, so "isolate this type"
    // could collect a different set than the group it was clicked on.
    return getElementsForLevel(bag, levelId)
        .filter(el => elementTypeName(el) === typeName)
        .map(el => String(el.id));
}

// TASK-10 T3: Maps category labels to their backing window global store key name.
// Returns null for categories that use non-window-global stores (e.g. roofStore via bag).
function _categoryStoreKey(catLabel: string): string | null {
    switch (catLabel) {
        case 'Walls':             return 'wallStore';
        case 'Curtain Walls':     return 'curtainWallStore';
        case 'Slabs':             return 'slabStore';
        case 'Floors':            return 'floorStore';
        case 'Ceilings':          return 'ceilingStore';
        case 'Doors':             return 'doorStore';
        case 'Windows':           return 'windowStore';
        case 'Openings':          return 'openingStore';
        case 'Furniture':         return 'furnitureStore';
        case 'Lighting Fixtures': return 'lightingStore';
        case 'Stairs':            return 'stairStore';
        case 'Handrails':         return 'handrailStore';
        case 'Columns':           return 'columnStore';
        case 'Beams':             return 'beamStore';
        case 'Plumbing':          return 'plumbingStore';
        case 'Rooms':             return 'roomStore';
        case 'Project Origin':    return 'projectOriginStore'; // §FEAT-PROJECT-ORIGIN (L-109)
        default:                  return null;
    }
}

/**
 * §C78-U-INV-4 — "which elements are in this category?", with its determination
 * status carried in the TYPE.
 *
 * THE DEFECT. `getCategoryElements` below answers `[]` for three different
 * facts: the project genuinely holds no walls; the backing store is not yet on
 * `window` (premature access before engine init — the case its own `console.warn`
 * documents); and the read THREW. `ElementsSummarySection` renders that `[]` as
 * a COUNT, so an unavailable store became the user-visible assertion **"0 walls
 * in this project"** — a positive claim about the model manufactured from
 * absence. The `console.warn` never reaches the UI and does not fire on the
 * `catch` path at all.
 *
 * `null` — never `[]` — is the unknown value here, so a caller cannot take
 * `.length` of it by accident.
 *
 * NO RIVAL VOCABULARY: the reason is C78 §8.1's `RELATIONSHIP_NOT_READABLE`,
 * the member for an absent or throwing substrate.
 */
export type CategoryElementsDetermination =
    | { readonly kind: 'determined'; readonly elements: any[] }
    | {
        readonly kind: 'undetermined';
        readonly scope: string;
        readonly reason: 'RELATIONSHIP_NOT_READABLE';
        readonly detail?: string;
    };

export function determineCategoryElements(
    bag: UBPBag,
    catLabel: string,
): CategoryElementsDetermination {
    const scope = `elements in category "${catLabel}"`;

    // An UNKNOWN category is not an empty one — the old `default: return []`
    // conflated "this label names no store" with "this store is empty".
    const storeKey = _categoryStoreKey(catLabel);
    if (!storeKey && catLabel !== 'Roofs') {
        return {
            kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_READABLE',
            detail: `"${catLabel}" does not name a known store, so its contents were never read`,
        };
    }

    // The store is not on `window` yet — premature access before engine init.
    // This is the case the existing console.warn describes, now RETURNED
    // instead of only logged.
    if (storeKey && !(window as any)[storeKey]) {
        return {
            kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_READABLE',
            detail: `${storeKey} is not available yet — the store was never read, ` +
                    'so an empty category was NOT determined',
        };
    }

    let raw: unknown;
    try {
        raw = _rawCategoryElements(bag, catLabel);
    } catch (e) {
        return {
            kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_READABLE',
            detail: `reading ${catLabel} threw: ${String((e as Error)?.message ?? e)}`,
        };
    }

    if (!Array.isArray(raw)) {
        return {
            kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_READABLE',
            detail: `the ${catLabel} store did not return a list`,
        };
    }
    return { kind: 'determined', elements: raw };
}

/** The count, or `null` when the category could not be read — never `0`. */
export function categoryCountOrUnknown(bag: UBPBag, catLabel: string): number | null {
    const d = determineCategoryElements(bag, catLabel);
    return d.kind === 'determined' ? d.elements.length : null;
}

/**
 * The raw switch. Kept private and UNGUARDED: `determineCategoryElements` owns
 * the try/catch, so the discrimination happens in exactly one place.
 */
function _rawCategoryElements(bag: UBPBag, catLabel: string): any[] {
    switch (catLabel) {
        case 'Walls':             return window.wallStore?.getAll?.()         ?? [];
        case 'Curtain Walls':     return window.curtainWallStore?.getAll?.()  ?? [];
        case 'Slabs':             return window.slabStore?.getAll?.()         ?? [];
        case 'Floors':            return window.floorStore?.getAll?.()        ?? [];
        case 'Ceilings':          return window.ceilingStore?.getAll?.()      ?? [];
        case 'Roofs':             return bag.roofStore?.getAll?.()            ?? [];
        case 'Doors':             return window.doorStore?.getAll?.()         ?? window.wallStore?.getAllDoors?.()    ?? [];
        case 'Windows':           return window.windowStore?.getAll?.()       ?? window.wallStore?.getAllWindows?.()  ?? [];
        case 'Openings':          return window.openingStore?.getAll?.()      ?? [];
        case 'Furniture':         return window.furnitureStore?.getAll?.()    ?? [];
        case 'Lighting Fixtures': return window.lightingStore?.getAll?.()     ?? [];
        case 'Stairs':            return window.stairStore?.getAll?.()        ?? [];
        case 'Handrails':         return window.handrailStore?.getAll?.()     ?? [];
        case 'Columns':           return window.columnStore?.getAll?.()       ?? [];
        case 'Beams':             return window.beamStore?.getAll?.()         ?? [];
        case 'Plumbing':          return window.plumbingStore?.getAll?.()     ?? [];
        case 'Rooms':             return window.roomStore?.getAll?.()         ?? [];
        case 'Project Origin':    return window.projectOriginStore?.getAll?.() ?? [];
        default: return [];
    }
}

/**
 * The elements, or `[]` when unreadable.
 *
 * RETAINED for the visibility-toggle callers (`ProjectVisibilitySection`),
 * where an empty list means "select/hide nothing" and is genuinely benign.
 * Any caller that COUNTS must use `determineCategoryElements` /
 * `categoryCountOrUnknown` instead — counting this `[]` is how "the store is
 * not ready" became "0 walls in this project".
 */
export function getCategoryElements(bag: UBPBag, catLabel: string): any[] {
    const d = determineCategoryElements(bag, catLabel);
    return d.kind === 'determined' ? d.elements : [];
}

export function getSubType(catLabel: string, el: any): string {
    switch (catLabel) {
        case 'Walls':             return el.wallType        || el.type || 'Standard';
        case 'Curtain Walls':     return el.systemType      || el.type || 'Standard';
        case 'Slabs':             return el.material        || el.slabType || 'Standard';
        case 'Floors':            return el.systemType      || el.material || el.type || 'Standard';
        case 'Ceilings':          return el.systemType      || el.material || el.type || 'Standard';
        case 'Roofs':             return el.roofType        || el.type || 'Standard';
        case 'Doors':             return el.doorType        || el.type || 'Standard';
        case 'Windows':           return el.windowType      || el.type || 'Standard';
        case 'Openings':          return el.openingType     || el.type || 'Standard';
        case 'Furniture':         return el.furnitureType   || el.type || 'Standard';
        case 'Lighting Fixtures': return el.fixtureType     || el.type || 'Standard';
        case 'Stairs':            return el.stairType       || el.type || 'Standard';
        case 'Handrails':         return el.handrailType    || el.type || 'Standard';
        case 'Columns':           return el.columnType      || el.type || 'Standard';
        case 'Beams':             return el.beamType        || el.type || 'Standard';
        case 'Plumbing':          return el.fixtureType     || el.type || 'Standard';
        case 'Rooms':             return el.roomType        || el.usage || 'Standard';
        case 'Project Origin':    return el.label          || 'Base Point'; // §FEAT-PROJECT-ORIGIN (L-109)
        default: return el.type || 'Standard';
    }
}

// ── Project metadata helpers ──────────────────────────────────────────────────

export function getProjectName(): string {
    try {
        const ps = window.projectStore; // TODO(C.3.x): legacy projectStore — replace with runtime.projectContext // TODO(TASK-08)
        if (ps && typeof ps.getActive === 'function') return ps.getActive()?.name ?? 'Project';
        const pc = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
        return pc?.projectName ?? pc?.name ?? 'Project';
    } catch { return 'Project'; }
}

export function getActiveLevelName(): string {
    try {
        const pc = window.projectContext; // TODO(C.3.x): legacy projectContext — replace with runtime.projectContext
        if (!pc?.activeLevelId) return 'L0';
        const levels = getLevels();
        const lvl = levels.find((l: any) => l.id === pc.activeLevelId);
        return lvl?.name ?? 'L0';
    } catch { return 'L0'; }
}

// ── Type icon ─────────────────────────────────────────────────────────────────

export function getTypeIcon(typeName: string): string {
    const t = typeName.toLowerCase();
    if (t.includes('wall'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="8" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1"/><line x1="6" y1="5" x2="6" y2="10" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('slab'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="5" width="10" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/><rect x="1" y="3" width="10" height="2" rx="0.5" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('roof'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 7L6 2.5 11 7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><rect x="2.5" y="7" width="7" height="4" rx="0.5" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('door'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2.5" y="1.5" width="7" height="9" rx="0.5" stroke="currentColor" stroke-width="1.1"/><circle cx="8.5" cy="6" r="0.7" fill="currentColor"/></svg>`;
    if (t.includes('window'))    return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="6" y1="1.5" x2="6" y2="10.5" stroke="currentColor" stroke-width="1"/><line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('stair'))     return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 10h3V7h3V4h3V1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (t.includes('column'))    return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="1.5" width="4" height="9" rx="0.5" stroke="currentColor" stroke-width="1.1"/></svg>`;
    if (t.includes('beam'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="4.5" width="10" height="3" rx="0.5" stroke="currentColor" stroke-width="1.1"/></svg>`;
    if (t.includes('furniture')) return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="3" width="9" height="7.5" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M4 3V2.5a2 2 0 014 0V3" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('lighting') || t.includes('fixture') || t.includes('downlight') || t.includes('pendant') || t.includes('linear_led') || t.includes('floor_') || t.includes('table_'))
        return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4.5" r="2.2" stroke="currentColor" stroke-width="1.1"/><line x1="6" y1="1" x2="6" y2="2.1" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="6" y1="6.8" x2="6" y2="11" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="3.2" y1="2.2" x2="3.8" y2="2.8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="8.8" y1="2.2" x2="8.2" y2="2.8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="4.5" x2="2" y2="4.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="11" y1="4.5" x2="10" y2="4.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
    if (t.includes('curtain'))   return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="4" y1="1" x2="4" y2="11" stroke="currentColor" stroke-width="1"/><line x1="7.5" y1="1" x2="7.5" y2="11" stroke="currentColor" stroke-width="1"/><line x1="1" y1="4.5" x2="11" y2="4.5" stroke="currentColor" stroke-width="1"/><line x1="1" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('floor'))     return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="7.5" width="10" height="3" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="2.5" y1="7.5" x2="2.5" y2="5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="6" y1="7.5" x2="6" y2="5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="9.5" y1="7.5" x2="9.5" y2="5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('ceil'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1.5" width="10" height="3" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="2.5" y1="4.5" x2="2.5" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="6" y1="4.5" x2="6" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="9.5" y1="4.5" x2="9.5" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1"/></svg>`;
    if (t.includes('opening'))   return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="8" rx="0.5" stroke="currentColor" stroke-width="1.1"/><rect x="3.5" y="2" width="5" height="8" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/></svg>`;
    if (t.includes('handrail') || t.includes('railing') || t.includes('balustrade'))
        return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3.5h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="2.5" y1="3.5" x2="2.5" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="6" y1="3.5" x2="6" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="9.5" y1="3.5" x2="9.5" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="1" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
    if (t.includes('plumb') || t.includes('sink') || t.includes('toilet') || t.includes('bath') || t.includes('shower') || t.includes('basin'))
        return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="7" r="2.8" stroke="currentColor" stroke-width="1.1"/><line x1="6" y1="1" x2="6" y2="4.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><line x1="3.5" y1="1" x2="8.5" y2="1" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
    if (t.includes('room'))      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 5.5h5v5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
    return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.1"/></svg>`;
}
