// D-CE (Deterministic Ceiling Engine) — shared types.
//
// ZERO imports — the engine unit-tests in plain Node. Coords in metres, world
// plan frame { x, z }; Y is computed from `levelElevation + ceilingHeight` at
// emit time (boundary points are in 3-D Vec3 to match the ceiling.batch.create
// handler shape).
//
// Architecturally aligned with D-FLE / D-LE: one archetype per room
// occupancy, deterministic per-room placement, pure projection at emit.

export type CeilableOccupancy =
    | 'bedroom' | 'living-room' | 'kitchen' | 'dining-room' | 'bathroom'
    | 'entrance-lobby' | 'corridor' | 'private-office' | 'utility-room';

export interface Pt { readonly x: number; readonly z: number }
export interface Vec3m { readonly x: number; readonly y: number; readonly z: number }

/** Per-occupancy ceiling defaults — picked by the engine. */
export interface CeilingArchetype {
    readonly occupancy: CeilableOccupancy;
    /** Slab thickness (m); 0.05 m default for residential plasterboard. */
    readonly thicknessM: number;
    /** Floor-to-ceiling clear height (m); typical residential = 2.7 m. */
    readonly ceilingHeightM: number;
    /** Display colour (hex, e.g. '#f5f5f0'); the renderer uses this when no
     *  `materialId` is supplied. */
    readonly materialColor: string;
    /** Optional catalogue material id — overrides materialColor when known to
     *  the editor's material library. Leave undefined for the MVP. */
    readonly materialId?: string;
}

/** Input the engine needs about one room (world XZ + level elevation). */
export interface CeilingRoomInput {
    readonly roomId: string;
    readonly levelId: string;
    readonly occupancy: string;
    /** Room polygon in world XZ (CCW or CW — the engine doesn't reorder). */
    readonly polygon: readonly Pt[];
    /** World Y of the level's floor (m). */
    readonly levelElevation: number;
    /** Override the archetype's ceilingHeight (m). Optional. */
    readonly ceilingHeightM?: number;
    /** Override the archetype's thickness (m). Optional. */
    readonly thicknessM?: number;
}

/** A placed ceiling (one per room) — projected to the ceiling.create payload
 *  shape at emit time. */
export interface PlacedCeiling {
    readonly roomId: string;
    readonly levelId: string;
    /** Boundary in 3-D Vec3 at the ceiling Y (level.elevation + ceilingHeight).
     *  Carried as Vec3 to match `validateCeilingBoundary`'s expected shape. */
    readonly boundary: readonly Vec3m[];
    readonly ceilingHeightM: number;
    readonly thicknessM: number;
    readonly materialColor: string;
    readonly materialId?: string;
}
