// ------------------------------------------------------------------
// FIX 1: Element type registry extended with missing structural and
// MEP types that are already used throughout the codebase (beams,
// stairs, roofs, plumbing, openings, handrails) but were absent from
// the union type, causing implicit `any` in type-checked paths.
// ------------------------------------------------------------------
export type ElementType =
    | 'wall'
    | 'slab'
    | 'ceiling'
    | 'floor'
    | 'column'
    | 'beam'
    | 'window'
    | 'door'
    | 'curtain-wall'
    | 'curtain-panel'
    | 'furniture'
    | 'roof'
    | 'stair'
    | 'plumbing'
    | 'opening'
    | 'handrail'
    | 'grid'
    | 'level'
    | 'room';

export interface IFCMetadata {
    guid: string;
    ifcClass: string;
    predefinedType?: string;
    psetCommon?: { [key: string]: any };
    // FIX 2: Add structured Pset support for export validation
    psets?: IFCPset[] | Record<string, Record<string, string | number | boolean>>;
}

// FIX 2: Typed Pset structure matching IFC schema conventions
export interface IFCPset {
    name: string;
    properties: Record<string, string | number | boolean>;
}

// Flexible pset map used by some element types (e.g. floors, ceilings)
export type PsetMap = Record<string, Record<string, string | number | boolean>>;

// FIX 3: Explicit spatial relationship structure that mirrors BimManager's
// Level.childrenIds contract. Keeps CoreElement self-describing for IFC export.
export interface SpatialRelationship {
    levelId: string;
    buildingId?: string;
    siteId?: string;
}

export interface CoreElement {
    id: string;
    type: ElementType;
    levelId: string;
    properties: {
        mark?: string;
        phase?: 'Existing' | 'Demolition' | 'New Construction' | 'Future';
        [key: string]: any;
    };
    ifcData?: IFCMetadata;
    // FIX 3: Replace loose optional fields with a structured spatial relationship
    spatialRelationship?: SpatialRelationship;
    // Legacy spatial fields kept for backward-compatibility with existing stores
    parentId?: string;
    childrenIds?: string[];
    // FIX 4: Optional audit field written by BimManager.reconcileSpatialContainment
    spatialStatus?: 'Verified' | 'Orphaned';
}

// ------------------------------------------------------------------
// FIX 5: Type-safe factory for generating IFC metadata so all callers
// produce consistent GUIDs and class names without copy-pasting logic.
// ------------------------------------------------------------------
const ELEMENT_TYPE_TO_IFC_CLASS: Record<ElementType, string> = {
    wall:             'IfcWall',
    slab:             'IfcSlab',
    ceiling:          'IfcCovering',
    floor:            'IfcCovering',
    column:           'IfcColumn',
    beam:             'IfcBeam',
    window:           'IfcWindow',
    door:             'IfcDoor',
    'curtain-wall':   'IfcCurtainWall',
    'curtain-panel':  'IfcMember',
    furniture:        'IfcFurnishingElement',
    roof:             'IfcRoof',
    stair:            'IfcStair',
    plumbing:         'IfcFlowTerminal',
    opening:          'IfcOpeningElement',
    handrail:         'IfcRailing',
    grid:             'IfcGrid',
    level:            'IfcBuildingStorey',
    room:             'IfcSpace',
};

export function createIfcMetadata(type: ElementType, predefinedType?: string): IFCMetadata {
    return {
        guid: crypto.randomUUID(),
        ifcClass: ELEMENT_TYPE_TO_IFC_CLASS[type] ?? 'IfcBuildingElementProxy',
        predefinedType,
    };
}
