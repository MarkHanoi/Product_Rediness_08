// D-FLE (Deterministic Furniture Layout Engine) — shared types (SPEC-FURNITURE-LAYOUT-ENGINE).
//
// ZERO imports by design — the foundations (footprints, archetypes, collision)
// unit-test in plain Node. Metres, world plan frame { x, z } (z = world Z = plan
// "up"); the editor converts to the furniture.create payload at the wiring layer.

/** Furniture type string — matches @pryzm/geometry-furniture FurnitureType values
 *  (kept as a plain string so the pure engine carries no geometry dependency). */
export type FurnitureKind =
    | 'bed' | 'bedside_table' | 'wardrobe' | 'sofa' | 'coffee_table'
    | 'dining_table' | 'dining_chair' | 'entrance_table'
    | 'toilet_radiator' | 'shower_glass_panel'
    | 'kitchen_l_shape' | 'kitchen_straight' | 'kitchen_u_shape';

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
}

export interface FurnitureArchetype {
    readonly occupancy: FurnishableOccupancy;
    readonly minAreaM2: number;
    readonly items: readonly FurnitureItemSpec[];
}
