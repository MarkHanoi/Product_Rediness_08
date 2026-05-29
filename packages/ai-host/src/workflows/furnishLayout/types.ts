// D-FLE (Deterministic Furniture Layout Engine) — shared types (SPEC-FURNITURE-LAYOUT-ENGINE).
//
// ZERO imports by design — the foundations (footprints, archetypes, collision)
// unit-test in plain Node. Metres, world plan frame { x, z } (z = world Z = plan
// "up"); the editor converts to the furniture.create payload at the wiring layer.

/** Furniture type string — matches @pryzm/geometry-furniture FurnitureType values
 *  (kept as a plain string so the pure engine carries no geometry dependency). */
export type FurnitureKind =
    | 'bed' | 'bedside_table' | 'wardrobe' | 'sofa' | 'coffee_table'
    | 'dining_table' | 'dining_chair' | 'entrance_table' | 'lamp'
    | 'toilet_radiator' | 'shower_glass_panel'
    | 'kitchen_l_shape' | 'kitchen_straight' | 'kitchen_u_shape' | 'kitchen_island';
// §STUDY-FURNITURE — `desk` + `desk_chair` are deliberately NOT in this union
// today; admitting them while the geometry-furniture `FurnitureType` union +
// builder + plan symbol + factory + IFC export entries are pending would
// produce a half-contract-compliant element (C03 / C11 / C15 violations).
// See APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.1 for the
// contract-exhaustive subphase ladder that must complete before the union
// extends. The study archetype uses dining_table / dining_chair as the
// renderable + the pure-engine kind until then — explicit-workaround discipline.

/** Editor RoomOccupancyType values this engine furnishes (subset). */
export type FurnishableOccupancy =
    | 'bedroom' | 'living-room' | 'kitchen' | 'dining-room' | 'bathroom'
    | 'entrance-lobby' | 'corridor' | 'private-office' | 'utility-room';

export interface Pt { readonly x: number; readonly z: number }
/** Axis-aligned rectangle, metres, x0<x1 and z0<z1. */
export interface Rect { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number }

/** Furniture footprint + clearances (metres). `w` runs ALONG the anchor wall;
 *  `l` is the depth from the wall INTO the room; `h` is height. */
export interface Footprint {
    readonly w: number;
    readonly l: number;
    readonly h: number;
    readonly baseOffset: number;   // floor offset (0 = on the floor)
    readonly clearFront: number;   // keep-clear depth in front (m)
    readonly clearSides: number;   // keep-clear each side (m)
}

/** Where an item is anchored within a room. */
export type Anchor =
    | 'wall-longest'         // longest free wall segment
    | 'wall-opposite-door'   // wall most opposite the primary door
    | 'wall-window'          // wall carrying a window (prefer S-facing)
    | 'corner' | 'center' | 'beside';

/** One item in an archetype (placed in order; later items yield to earlier). */
export interface FurnitureItemSpec {
    readonly kind: FurnitureKind;
    readonly anchor: Anchor;
    readonly facing: 'into-room' | 'to-wall';
    readonly required: boolean;
    /** group leader id (e.g. the bed) for relative placement (bedside tables). */
    readonly group?: string;
    /** how many to place (default 1) — e.g. 2 bedside tables, N dining chairs. */
    readonly count?: number;
    /** §FURNITURE-SPEC: when true, the item may NOT anchor on a wall carrying a
     *  window. Tall/wide pieces (bed head, wardrobe) block daylight and break
     *  the privacy + thermal envelope. The solver falls back to the next-best
     *  wall (longest non-window) when the anchor resolves to a window wall. */
    readonly excludeWindowWall?: boolean;
    /** §FURNITURE-SPEC: when true, the item may NOT anchor on a wall carrying a
     *  door. A toilet / bed / wardrobe / sofa / kitchen run slid past the door
     *  on the SAME wall is awkward to use; the solver prefers a perpendicular
     *  wall, falling back through the rest if no other wall fits. The door's
     *  swing-area keep-clear rect still applies to every item. */
    readonly excludeDoorSwing?: boolean;
}

export interface FurnitureArchetype {
    readonly occupancy: FurnishableOccupancy;
    readonly minAreaM2: number;
    readonly items: readonly FurnitureItemSpec[];
}

// ── F1/F4 — room input (assembled by the editor; consumed by the pure solver) ──

/** An opening (door/window) with a world pose. `normal` points INTO the room. */
export interface OpeningPose {
    readonly type: 'door' | 'window';
    readonly center: Pt;
    readonly normal: Pt;       // unit, into the room
    readonly width: number;
}

/** A room boundary wall segment with the openings on it and its inward normal. */
export interface RoomWallSeg {
    readonly a: Pt;
    readonly b: Pt;
    readonly inwardNormal: Pt;  // unit, into the room
    readonly length: number;
    readonly isExterior: boolean;
}

/** Everything the solver needs about one room (world XZ, metres). */
export interface FurnishRoomInput {
    readonly roomId: string;
    readonly levelId: string;
    readonly occupancy: string;
    readonly polygon: readonly Pt[];
    readonly centroid: Pt;
    readonly areaM2: number;
    readonly walls: readonly RoomWallSeg[];
    readonly doors: readonly OpeningPose[];
    readonly windows: readonly OpeningPose[];
    readonly levelElevation: number;
}

/** A placed furniture instance (world position + yaw). */
export interface PlacedFurniture {
    readonly kind: FurnitureKind;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotationY: number;     // radians
    readonly footprint: Footprint;
    readonly hostedSpaceId: string;
}
