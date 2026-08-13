// @pryzm/geometry-lift — domain types for the vertical-circulation (lift) element.
//
// Residential-building (multi-family) — Slice A / plan §4. The lift is a peer of
// the stair (`@pryzm/geometry-stair`), mirroring its `*Data` / `*Event*` shapes so
// the store/mesh/command stack is a 1:1 mirror of the stair stack.
//
// PURE TYPES: no THREE, no DOM, plain `{x,y,z}` Vec3 (mirrors StairTypes.Vec3) so
// the data layer stays renderer-agnostic; THREE is touched ONLY in LiftMeshBuilder
// via the `@pryzm/renderer-three/three` boundary (P2 single-THREE-owner).
//
// Contract anchors:
//   - C11 §element-creation (the create command registers + projects this type)
//   - C15 §12 (the lift's LANDING DOORS are hosted openings; the lift BODY is free)
//   - L0 schema mirror: `@pryzm/schemas` VerticalCirculation.ts (Slice 0 / P1.B)

/** Plain plan/world coordinate, mirrors `StairTypes.Vec3`. No THREE. */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** Lift kind — mirrors the L0 schema `LiftKind` enum. */
export type LiftKind = 'passenger' | 'accessible' | 'goods';

/** IFC class for a lift car/shaft — mirrors stair's `ifcData.ifcClass`. */
export interface LiftIfcData {
    guid: string;
    ifcClass: 'IfcTransportElement';
}

export interface LiftProperties {
    /** Schedule mark, e.g. `LF001` (mirrors stair `SR001`). */
    mark?: string;
    material?: string;
    description?: string;
    tags?: string[];
}

export const DEFAULT_LIFT_PROPERTIES: LiftProperties = {
    material: 'steel',
    tags: [],
};

/**
 * LiftData — the canonical runtime record for one lift (vertical-circulation
 * element). Mirrors `StairData`: `id`/`type`/`levelId` + a base→top level span,
 * a plan origin + rotation, a shaft footprint, and metadata/properties/ifcData.
 */
export interface LiftData {
    id: string;
    type: 'verticalCirculation';
    /** Base level (where the shaft starts). Mirrors stair `baseLevelId`. */
    levelId: string;
    baseLevelId: string;
    /** Top level the shaft reaches (shaft spans base..top; must differ). */
    topLevelId: string;
    kind: LiftKind;
    /** Shaft base origin in world coords (the shaft footprint origin). */
    origin: Vec3;
    /** Plan-direction angle in radians (about world Y). */
    rotation: number;
    /** Total shaft width in metres (car + structure). */
    shaftWidth: number;
    /** Total shaft depth in metres (car + structure). */
    shaftDepth: number;
    /** Rated car capacity in persons. */
    carCapacityPersons: number;
    /** Landing-door clear width in metres (a C15-hosted opening per level). */
    doorWidth: number;
    typeId?: string;
    properties: LiftProperties;
    ifcData?: LiftIfcData;
    metadata: {
        createdAt: string;
        modifiedAt: string;
        version: number;
        source: 'user' | 'import' | 'ai';
    };
}

export type LiftEventType = 'add' | 'update' | 'remove';
// §STEP7 (C72 §3.1, gap PR-03): 'update' emissions carry the PRE-MUTATION
// lift as an optional third argument, captured before the clone/merge —
// never re-read after the write (C72 §3.5). Absent on 'add'/'remove', and
// absent on a restoreSnapshot for an id with no stored prior.
export type LiftEventListener = (event: LiftEventType, lift: LiftData, prevState?: LiftData) => void;
