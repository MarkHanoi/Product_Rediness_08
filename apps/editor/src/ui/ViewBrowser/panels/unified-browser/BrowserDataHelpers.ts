/**
 * BrowserDataHelpers — data-access and utility functions for UnifiedBrowserPanel.
 *
 * Also defines UBPBag (shared state + callback bag) to avoid circular imports.
 * Shell creates one bag instance per UnifiedBrowserPanel; zone files receive it
 * as their first parameter.
 *
 * Window globals (all Phase D/E/C scope — unchanged from original file):
 *   window.bimManager        TODO(D.4)
 *   window.wallStore         TODO(E.wall.S) // TODO(TASK-08)
 *   window.curtainWallStore  TODO(E.curtain-wall.S) // TODO(TASK-08)
 *   window.slabStore         TODO(E.slab.S) // TODO(TASK-08)
 *   window.floorStore        TODO(E.floor.S) // TODO(TASK-08)
 *   window.ceilingStore      TODO(E.ceiling.S) // TODO(TASK-08)
 *   window.doorStore         TODO(E.door.S) // TODO(TASK-08)
 *   window.windowStore       TODO(E.window.S) // TODO(TASK-08)
 *   window.openingStore      TODO(E.14) // TODO(TASK-08)
 *   window.furnitureStore    TODO(E.furniture.S) // TODO(TASK-08)
 *   window.lightingStore     TODO(E.lighting.S) // TODO(TASK-08)
 *   window.stairStore        TODO(E.stair.S) // TODO(TASK-08)
 *   window.handrailStore     TODO(E.handrail.S) // TODO(TASK-08)
 *   window.columnStore       TODO(E.column.S) // TODO(TASK-08)
 *   window.beamStore         TODO(E.beam.S) // TODO(TASK-08)
 *   window.plumbingStore     TODO(E.plumbing.S) // TODO(TASK-08)
 *   window.roomStore         TODO(E.18-R.S) // TODO(TASK-08)
 *   window.ifcModelStore     TODO(E.ifc.S) // TODO(TASK-08)
 *   window.projectStore      TODO(C.3.x) // TODO(TASK-08)
 *   window.projectContext    TODO(C.3.x)
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
    const store = window.ifcModelStore; // TODO(E.ifc.S): legacy ifcModelStore — replace with runtime.stores.ifcModel
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
        window.wallStore,         // TODO(E.wall.S)
        window.curtainWallStore,  // TODO(E.curtain-wall.S)
        window.slabStore,         // TODO(E.slab.S)
        window.floorStore,        // TODO(E.floor.S)
        window.ceilingStore,      // TODO(E.ceiling.S)
        bag.roofStore,
        window.doorStore,         // TODO(E.door.S)
        window.windowStore,       // TODO(E.window.S)
        window.openingStore,      // TODO(E.14)
        window.furnitureStore,    // TODO(E.furniture.S)
        window.lightingStore,     // TODO(E.lighting.S)
        window.stairStore,        // TODO(E.stair.S)
        window.handrailStore,     // TODO(E.handrail.S)
        window.columnStore,       // TODO(E.column.S)
        window.beamStore,         // TODO(E.beam.S)
        window.plumbingStore,     // TODO(E.plumbing.S)
        window.roomStore,         // TODO(E.18-R.S)
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

export function groupByType(elements: any[], _levelId: string): Map<string, any[]> {
    const map = new Map<string, any[]>();
    for (const el of elements) {
        const typeName = String(el.type ?? el.elementType ?? 'Unknown');
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
    return getElementsForLevel(bag, levelId)
        .filter(el => String(el.type ?? el.elementType ?? 'Unknown') === typeName)
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
        default:                  return null;
    }
}

export function getCategoryElements(bag: UBPBag, catLabel: string): any[] {
    try {
        // TASK-10 T3: warn once per category when the backing store is not yet available so
        // developers can observe premature access before engine init completes.
        const storeKey = _categoryStoreKey(catLabel);
        if (storeKey && !(window as any)[storeKey]) {
            console.warn(`[BrowserDataHelpers] getCategoryElements: ${storeKey} not yet available for category "${catLabel}" — returning []`);
        }
        switch (catLabel) {
            case 'Walls':             return window.wallStore?.getAll?.()         ?? []; // TODO(TASK-08)
            case 'Curtain Walls':     return window.curtainWallStore?.getAll?.()  ?? []; // TODO(TASK-08)
            case 'Slabs':             return window.slabStore?.getAll?.()         ?? []; // TODO(TASK-08)
            case 'Floors':            return window.floorStore?.getAll?.()        ?? []; // TODO(TASK-08)
            case 'Ceilings':          return window.ceilingStore?.getAll?.()      ?? []; // TODO(TASK-08)
            case 'Roofs':             return bag.roofStore?.getAll?.()            ?? [];
            case 'Doors':             return window.doorStore?.getAll?.()         ?? window.wallStore?.getAllDoors?.()    ?? []; // TODO(TASK-08)
            case 'Windows':           return window.windowStore?.getAll?.()       ?? window.wallStore?.getAllWindows?.()  ?? []; // TODO(TASK-08)
            case 'Openings':          return window.openingStore?.getAll?.()      ?? []; // TODO(TASK-08)
            case 'Furniture':         return window.furnitureStore?.getAll?.()    ?? []; // TODO(TASK-08)
            case 'Lighting Fixtures': return window.lightingStore?.getAll?.()     ?? []; // TODO(TASK-08)
            case 'Stairs':            return window.stairStore?.getAll?.()        ?? []; // TODO(TASK-08)
            case 'Handrails':         return window.handrailStore?.getAll?.()     ?? []; // TODO(TASK-08)
            case 'Columns':           return window.columnStore?.getAll?.()       ?? []; // TODO(TASK-08)
            case 'Beams':             return window.beamStore?.getAll?.()         ?? []; // TODO(TASK-08)
            case 'Plumbing':          return window.plumbingStore?.getAll?.()     ?? []; // TODO(TASK-08)
            case 'Rooms':             return window.roomStore?.getAll?.()         ?? []; // TODO(TASK-08)
            default: return [];
        }
    } catch { return []; }
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
        default: return el.type || 'Standard';
    }
}

// ── Project metadata helpers ──────────────────────────────────────────────────

export function getProjectName(): string {
    try {
        const ps = window.projectStore; // TODO(C.3.x): legacy projectStore — replace with runtime.projectContext
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
