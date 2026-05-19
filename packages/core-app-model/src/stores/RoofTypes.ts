import { CoreElement } from '../CoreElement';

export type RoofType =
    | 'flat'
    | 'shed'
    | 'gable'
    | 'hip'
    | 'dutch'
    | 'gambrel'
    | 'mansard'
    | 'barrel'
    | 'by_region';

export enum RoofCreationMode {
    RECTANGLE   = 'rectangle',
    POLYLINE    = 'polyline',
    BY_REGION   = 'by_region',
}

export type IfcRoofType =
    | 'FLAT_ROOF'
    | 'SHED_ROOF'
    | 'GABLE_ROOF'
    | 'HIP_ROOF'
    | 'HIPPED_GABLE_ROOF'
    | 'GAMBREL_ROOF'
    | 'MANSARD_ROOF'
    | 'BARREL_ROOF'
    | 'RAINBOW_ROOF'
    | 'BUTTERFLY_ROOF'
    | 'PAVILION_ROOF'
    | 'DOME_ROOF'
    | 'FREEFORM'
    | 'NOTDEFINED';

export interface RoofFootprint {
    polygon: [number, number][];
    centroid: [number, number];
}

export interface RoofMetadata {
    createdAt: number;
    modifiedAt: number;
    createdBy: string;
    version: number;
    tags?: string[];
    description?: string;
}

export type RoofLayerFunction =
    | 'waterproofing'
    | 'insulation'
    | 'deck'
    | 'vapour-barrier'
    | 'substrate'
    | 'finish';

export interface RoofLayer {
    name: string;
    function: RoofLayerFunction;
    thickness: number;
    materialId?: string;
    materialColor?: string;
}

/**
 * P3.5 — Slope Arrow: overrides the slope for a specific eave edge of a hip/gable roof.
 * Enables asymmetric hip roofs where different edges have different rise/run ratios.
 */
export interface SlopeArrow {
    edgeIndex: number;    // 0-indexed edge of footprint.polygon
    slope: number;        // rise/run ratio for this edge
    riseAtTail: number;   // absolute height at the tail of the arrow (informational)
}

/**
 * P3.4 — Segment: a sub-polygon within a compound roof.
 * Enables segment composition for mixed-type roofs (e.g. gable + flat section).
 */
export interface RoofSegmentSpec {
    subPolygon: RoofFootprint;
    roofType:   RoofType;
    slope?:     number;
    overhang?:  number;
    thickness?: number;
}

export interface RoofData extends CoreElement {
    type: 'roof';
    levelId: string;
    parentId?: string;

    footprint: RoofFootprint;

    roofType: RoofType;
    slope?: number;
    ridgeOffset?: number;
    overhang: number;

    baseOffset: number;
    thickness: number;
    fascia?: number;

    /** P3.3 — When true, CreateRoofCommand computes baseOffset from the tallest wall on the level. */
    autoBaseOffset?: boolean;

    materialId?: string;
    materialColor?: string;

    layers?: RoofLayer[];

    /** P3.5 — Per-edge slope overrides for asymmetric hip/gable roofs. */
    slopeArrows?: SlopeArrow[];

    /** P3.4 — Segment composition: sub-polygons for compound roofs. */
    segments?: RoofSegmentSpec[];

    properties: { mark?: string; [key: string]: any };
    ifcData?: {
        guid: string;
        ifcClass: 'IfcRoof';
        predefinedType?: IfcRoofType;
    };

    metadata: RoofMetadata;

    /** @deprecated Use footprint.polygon instead */
    polygon?: Array<[number, number]>;
    /** @deprecated Use footprint instead */
    width?: number;
    /** @deprecated Use footprint instead */
    depth?: number;
    /** @deprecated Use roofType instead */
    mode?: string;
    /** @deprecated Use footprint.centroid + levelId + baseOffset instead */
    position?: { x: number; y: number; z: number };
}

export const ROOF_TYPE_TO_IFC: Record<RoofType, IfcRoofType> = {
    flat:      'FLAT_ROOF',
    shed:      'SHED_ROOF',
    gable:     'GABLE_ROOF',
    hip:       'HIP_ROOF',
    dutch:     'HIPPED_GABLE_ROOF',
    gambrel:   'GAMBREL_ROOF',
    mansard:   'MANSARD_ROOF',
    barrel:    'BARREL_ROOF',
    by_region: 'FREEFORM',
};
