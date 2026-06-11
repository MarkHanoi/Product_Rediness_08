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
    // F1.6' (2026-05-30) — drop-in residential bath (UK 1700×700×500 mm).
    // Optional in the bathroom archetype, gated on area + free-wall length.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.6)
    | 'bath'
    // F1.7 (2026-05-30) — WC primitives. wc_washbasin = small wall-hung
    // basin (450 × 300 × 150 mm) on the cloakroom scale (distinct from the
    // full vanity_unit). wc_mirror = compact wall mirror (400 × 600 mm)
    // above the basin. Wired into the future F3.5 WC archetype + reusable
    // by tight bathrooms that can't fit a vanity_unit.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.7)
    | 'wc_washbasin' | 'wc_mirror'
    // F1.8 (2026-05-30) — Utility / laundry primitives. The S5 activity
    // system. Standalone variants distinct from the kitchen-mounted
    // washing_machine_* in KitchenApplianceType.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.8)
    | 'washing_machine_standalone' | 'tumble_dryer'
    | 'utility_cabinet' | 'utility_sink' | 'drying_rack'
    | 'kitchen_l_shape' | 'kitchen_straight' | 'kitchen_u_shape' | 'kitchen_island'
    // F-FRIDGE (2026-06-05) — the kitchen tall appliance. A free-standing
    // fridge/freezer placed against a wall, perpendicular to the counter runs.
    | 'fridge'
    // A.21.D20 (2026-06-06) — first-class kitchen appliances + cabinetry
    // modules. Placed IN the kitchen run (sink + hob + oven + dishwasher +
    // washing machine, extractor over the hob) by the I/L/U layout planner,
    // honouring the sink↔hob↔fridge work-triangle. `base_unit`/`wall_unit`
    // are the parametric 600 mm cabinet modules the run is composed from.
    | 'oven' | 'hob' | 'dishwasher' | 'washing_machine' | 'sink' | 'extractor'
    | 'base_unit' | 'wall_unit'
    // F1.1 (2026-05-30) — study workstation primitives. Admitted after the
    // contract-exhaustive subphase ladder closed: FurnitureType union +
    // FurnitureCategoryMap entries + DeskBuilder + DeskChairBuilder +
    // FurnitureFactory switch arms shipped in the same delivery (see
    // APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.1). Closes the
    // dining-table-as-desk workaround in the study archetype.
    | 'desk' | 'desk_chair'
    // F1.2 (2026-05-30) — bookshelf primitives. Cross-room storage shipped
    // contract-complete: FurnitureType union + FurnitureCategoryMap +
    // BookshelfBuilder (handles both variants) + FurnitureFactory arms.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.2)
    | 'bookshelf' | 'bookshelf_glass'
    // F1.3 (2026-05-30) — media wall primitives. Wall-mounted TV + low TV
    // unit cabinet for the S1 living-room media-wall activity system.
    // Shipped contract-complete: FurnitureType union + FurnitureCategoryMap +
    // TvBuilder + TvUnitBuilder + FurnitureFactory arms.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.3)
    | 'tv' | 'tv_unit'
    // F1.4 (2026-05-30) — entry storage primitives. Hall S2 activity
    // system. Shipped contract-complete: FurnitureType union +
    // FurnitureCategoryMap + ShoeCabinet/CoatRack/ConsoleTable/EntryBench
    // builders + FurnitureFactory arms.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.4)
    | 'shoe_cabinet' | 'coat_rack' | 'console_table' | 'entry_bench'
    // F1.5 (2026-05-30) — bathroom vanity primitives (furniture-side).
    // S4 activity system. mirror_light queued separately in geometry-
    // lighting (LightingFixtureType). These three close their own ladder.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.5)
    | 'vanity_unit' | 'bathroom_mirror' | 'towel_rail'
    // F1.9 (2026-05-30) — dining-room storage. Buffet + sideboard.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.9)
    | 'buffet' | 'sideboard'
    // F1.10 (2026-05-30) — wall decor (cross-room personalisation).
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.10)
    | 'wall_art' | 'wall_mirror'
    // F1.13 (2026-05-30) — lounge_chair semantic alias.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.13)
    | 'lounge_chair'
    // F1.14 (2026-05-30) — pantry_cabinet (kitchen storage).
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.14)
    | 'pantry_cabinet'
    // F1.12 (2026-05-30) — bedroom dressing (dresser + vanity table).
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.12)
    | 'dresser' | 'vanity_table'
    // F1.11 (2026-05-30) — curtain primitives. Cross-room; placed on
    // every exterior-window wall by the auto-pipeline.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F1.11)
    | 'curtain_rod' | 'curtain_panel'
    // §67.1 (2026-06-11) — soft-furnishing RUG. A thin flat rug laid UNDER the
    // bed / dining table / sofa+coffee table. Floor z-order, collision-EXEMPT
    // (it underlaps the furniture it sits beneath; it must not block placement
    // or circulation). Routes to a carpet builder in geometry-furniture.
    | 'rug'
    // §67.3 (2026-06-11) — L-shape / corner sofa. The living-room archetype
    // picks this (instead of the straight `sofa`) when the room is large enough
    // to seat an L in a corner. Routes to CornerSofaBuilder.
    | 'corner_sofa'
    // §67.2 (2026-06-11) — bed variety. The integrated bedroom set uses a
    // BedFactory variant bed (these route to JapaneseBedBuilder in the
    // geometry catalogue) instead of the plain `bed`. The choice is per-room
    // deterministic (see bedVariety.ts) so different bedrooms read distinct.
    | 'nordic_bed' | 'solid_wood_bed';

/** Editor RoomOccupancyType values this engine furnishes (subset).
 *  F3.5 (2026-05-30): + 'wc' for the cloakroom-toilet archetype (uses the
 *  F1.7 wc_washbasin + wc_mirror primitives — the compact alternative to
 *  the bathroom vanity trio). */
export type FurnishableOccupancy =
    | 'bedroom' | 'living-room' | 'kitchen' | 'dining-room' | 'bathroom'
    | 'wc'
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
    | 'corner' | 'center' | 'beside'
    // §67.1 (2026-06-11) — RUG anchor: lay the item CENTRED on its group leader
    // (bed / dining_table / sofa), inheriting the leader's yaw. Collision-EXEMPT
    // — the rug underlaps the leader (and its bedside tables / chairs / coffee
    // table), so it is neither tested against obstacles nor added as one.
    | 'under';

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
    /** F4.1 (2026-06-01) — Activity systems hosted by this room archetype.
     *  Forward-compatible annotation; the existing FurnitureItemSpec items
     *  still drive placement in this slice. Downstream tooling (AI hints,
     *  schedules, IFC-α exports) reads this to find named composed systems
     *  inside the room. See ./activityArchetypes.ts.
     *  (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §F4.1) */
    readonly activitySystems?: ReadonlyArray<import('./activityArchetypes.js').ActivitySystemKind>;
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
    /**
     * §KITCHEN-PARAMETRIC-RUN (2026-06-10) — when this placement is a parametric
     * kitchen run (`kind` is `kitchen_straight` | `kitchen_l_shape` |
     * `kitchen_u_shape`), this carries the fully-resolved
     * `@pryzm/geometry-furniture` `KitchenCabinetConfig` so the auto-furnish step
     * renders the GOOD parametric `KitchenCabinetEngine` (swappable cabinet units +
     * appliances + countertop) instead of a concatenation of individual appliance
     * box proxies. `buildFurnishCommands` forwards it onto the `furniture.create`
     * payload (+ `furnitureCategory:'kitchen'`); the editor's `KitchenBuilder`
     * (FurnitureFactory) consumes it. Kept as an optional structural field on the
     * pure type so `furnishLayout` carries no geometry runtime dependency — only
     * an erased `import type`. */
    readonly kitchenConfig?: KitchenCabinetConfigLike;
}

/**
 * Structural mirror of `@pryzm/geometry-furniture` `KitchenCabinetConfig` — kept
 * here (not imported) so the pure D-FLE foundations stay import-free and unit-test
 * in plain Node. The producer (`kitchenLayout.planKitchenRun`) builds this; the
 * editor wiring casts it back to the real `KitchenCabinetConfig` when it reaches
 * `furniture.create`. Field-compatible with the real DTO (excess optional fields
 * on the real type are accepted structurally).
 */
export interface KitchenCabinetConfigLike {
    readonly layoutType: 'kitchen_straight' | 'kitchen_l_shape' | 'kitchen_u_shape'
        | 'kitchen_island' | 'kitchen_straight_tall' | 'kitchen_l_shape_tall' | 'kitchen_u_shape_tall';
    readonly depth: number;
    readonly length: number;
    readonly height: number;
    readonly numUnits: number;
    readonly lengthLeft?: number;
    readonly numUnitsLeft?: number;
    readonly lengthRight?: number;
    readonly numUnitsRight?: number;
    readonly frontMaterialId?: string;
    readonly countertopMaterialId?: string;
    readonly carcassMaterialId?: string;
    readonly units?: ReadonlyArray<{
        readonly index: number;
        readonly arm: 'main' | 'left' | 'right';
        front: 'door' | 'glass_door' | 'framed_glass_door' | 'drawers' | 'shelf' | 'none';
        width?: number;
        label?: string;
        appliance?: string;
    }>;
}
