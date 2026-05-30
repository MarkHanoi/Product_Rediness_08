// D-LE (Deterministic Lighting Engine) — shared types.
//
// ZERO imports by design — the engine unit-tests in plain Node. Coords in
// metres, world plan frame { x, z }; Y is computed from levelElevation +
// (ceiling-height) at the wiring layer.
//
// Architecturally aligned with D-FLE (the furniture engine): one archetype
// per room occupancy, deterministic placement, pure projection at emit.

/** Lighting fixture kind — matches `@pryzm/geometry-lighting` LightingFixtureType
 *  AND the schema's LightingKind (both share the same value space, default
 *  'downlight' — see §FIX-LIGHTING-PAYLOAD note in LightingPlanToolHandler). */
export type LightKind =
    | 'downlight'
    | 'pendant'
    | 'linear_led'
    | 'pendant_pebble'
    | 'pendant_ceramic_bell'
    | 'pendant_conical'
    | 'floor_wood_post'
    | 'floor_arc_brass'
    | 'table_terracotta'
    | 'floor_tripod_black'
    | 'mirror_light'
    | 'pendant_cluster';

/** Editor RoomOccupancyType values the engine has archetypes for. */
export type LightableOccupancy =
    | 'bedroom' | 'living-room' | 'kitchen' | 'dining-room' | 'bathroom'
    | 'entrance-lobby' | 'corridor' | 'private-office' | 'utility-room';

export interface Pt { readonly x: number; readonly z: number }

/** Everything the engine needs about one room. Assembled by the editor
 *  trigger from the live room store. */
export interface LightRoomInput {
    readonly roomId: string;
    readonly levelId: string;
    readonly occupancy: string;
    readonly polygon: readonly Pt[];
    readonly centroid: Pt;
    readonly areaM2: number;
    /** World Y of the level's floor (m). The engine returns positions at this
     *  Y; the executor adds the wall height to lift the fixture to the ceiling. */
    readonly levelElevation: number;
    /** World Y of the ceiling (m); fallback to `levelElevation + 2.7` at the
     *  wiring layer when absent. */
    readonly ceilingY?: number;
}

/** A placed lighting fixture (world XYZ + a tiny grab-bag of properties so
 *  downstream bridge codecs don't need a second lookup). */
export interface PlacedLight {
    readonly kind: LightKind;
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    readonly roomId: string;
    /** Whether the fixture's natural "down" axis aligns with world −Y at this
     *  position (true for ceiling-mounted; false for floor/table lamps). */
    readonly ceilingMounted: boolean;
}

/** Per-occupancy lighting archetype — minimal MVP: one ceiling fixture per
 *  room sized loosely by area. The list is intentionally ordered: the engine
 *  picks the first ceiling item that fits, so finer-grained area buckets sit
 *  ahead of coarse defaults. Wall-mount items (mount === 'wall') are
 *  evaluated independently — they are emitted IN ADDITION to the ceiling
 *  pick, not as alternatives to it (e.g. a bathroom gets BOTH a downlight
 *  AND a mirror_light). */
export interface LightingArchetype {
    readonly occupancy: LightableOccupancy;
    readonly items: ReadonlyArray<{
        readonly kind: LightKind;
        /** Minimum room area (m²) to use this fixture. 0 = always eligible. */
        readonly minAreaM2: number;
        /** Mount strategy — 'ceiling' (default) participates in first-fit;
         *  'wall' is always emitted when the area threshold is met. */
        readonly mount?: 'ceiling' | 'wall';
    }>;
}
