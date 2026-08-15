import { CoreElement } from '@pryzm/core-app-model';

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

    /**
     * §ROOF-BOUNDING-WALLS — the walls whose centrelines produced this roof's
     * footprint, when it was created BY REGION. Closes the DATA-MODEL half of
     * the C79 §6.3 named storage gap (owner `@pryzm/geometry-roof`); the L0 half
     * is `boundingWallIds` on `packages/schemas/src/elements/Roof.ts`, added in
     * the same change so a reference can actually TRANSIT the bus rather than
     * being stripped by Zod in flight.
     *
     * The attribution has always existed: `traceRoofRegionAtPoint` returns
     * `attribution.hostWallIds` ("distinct wall ids the resulting sketch depends
     * on"), attributed BY CONSTRUCTION from each wall's own centreline, never by
     * proximity. Until this field there was nowhere to put it, so it was measured,
     * reported, and thrown away — see `RoofRegionTrace.ts`.
     *
     * SHAPE mirrors `FloorData.boundingWallIds` (`core-app-model/src/stores/
     * FloorTypes.ts`), the proven twin — deliberately NOT a `RoofSketch` /
     * `RoofHostReferenceEdge` triple copied from the slab and floor sketches. A
     * per-edge sketch would be a field the model cannot honour (C79 §7.1): the
     * roof tracer reports `hostEdges` as a COUNT and exposes host identity only
     * as a distinct wall-id LIST, so there is no per-edge host mapping in hand to
     * populate one with. A wall-id list is the strongest reference the available
     * data honestly supports; the full parametric sketch is a later step that
     * needs the tracer to surface per-edge identity first.
     *
     * OPTIONAL, and the absence is meaningful — the same `absent ≠ empty` rule
     * the L0 field carries (ADR-0299 / §CONTEXT-DATA-HONESTY):
     *
     *   `undefined` → never attributed (drawn by rectangle/polyline, or predates the field)
     *   `[]`        → region-traced, and attributed to no wall
     *
     * ⚠ NOT YET POPULATED AT CREATION — stated here rather than discovered later.
     * This field makes a roof reference-CAPABLE; it does not yet make one FOLLOW.
     * Both creation paths must be wired in ONE change, because populating only
     * one is C79 §7.4 per-path divergence, which the contract rates WORSE than
     * uniform absence. The two sites are `RoofTool._handleRegionClick` (3D, which
     * currently keeps `traced.polygon` and drops `traced.attribution`) and
     * `apps/editor/.../RoofPlanToolHandler` (plan) — and both reach the store
     * through `CreateRoofCommand`, whose payload must carry the ids first.
     * Consuming them on a wall move then needs a roof dependency tracker
     * modelled on `SlabDependencyTracker`.
     */
    boundingWallIds?: string[];

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
