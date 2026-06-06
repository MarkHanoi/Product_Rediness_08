// D-FLE F3 — canonical furniture footprint catalogue (SPEC-FURNITURE-LAYOUT-ENGINE §6).
//
// ONE source of truth for placement dimensions + clearances (metres). Mirrors the
// real defaults in geometry-furniture but kept here as plain data so the pure solver
// has no geometry dependency. `w` = extent along the anchor wall, `l` = depth into
// the room, `h` = height. Kitchen/wardrobe RUNS are parametric (their footprint is
// derived from the resolved config arm lengths, not a fixed cell) — not in this table.

import type { Footprint, FurnitureKind } from './types.js';

const FP: Readonly<Record<FurnitureKind, Footprint>> = {
    // Bedroom
    // §FURNITURE-SPEC (2026-05-28): UK double 1.35 × 1.90 m + 0.60 m circulation
    // each side + 0.80 m clearance at the foot. Mirrors programRules.bedroom
    // furnitureSpec[bed]; pinned by the furnishRules.test.ts consistency check.
    bed:            { w: 1.35, l: 1.90, h: 0.50, baseOffset: 0, clearFront: 0.80, clearSides: 0.60 },
    bedside_table:  { w: 0.45, l: 0.40, h: 0.50, baseOffset: 0, clearFront: 0.00, clearSides: 0.00 },
    wardrobe:       { w: 1.20, l: 0.60, h: 2.00, baseOffset: 0, clearFront: 0.90, clearSides: 0.00 },
    // Living
    sofa:           { w: 2.00, l: 0.90, h: 0.80, baseOffset: 0, clearFront: 0.45, clearSides: 0.10 },
    coffee_table:   { w: 1.10, l: 0.60, h: 0.40, baseOffset: 0, clearFront: 0.30, clearSides: 0.10 },
    // Dining
    dining_table:   { w: 1.40, l: 0.90, h: 0.75, baseOffset: 0, clearFront: 0.90, clearSides: 0.90 },
    dining_chair:   { w: 0.50, l: 0.50, h: 0.90, baseOffset: 0, clearFront: 0.00, clearSides: 0.00 },
    // Entrance
    entrance_table: { w: 1.00, l: 0.40, h: 0.80, baseOffset: 0, clearFront: 0.30, clearSides: 0.00 },
    // Lighting (floor / corner lamp) — small footprint, kept out of circulation.
    lamp:           { w: 0.35, l: 0.35, h: 1.50, baseOffset: 0, clearFront: 0.10, clearSides: 0.00 },
    // Bathroom fixtures
    toilet_radiator:    { w: 0.40, l: 0.70, h: 0.80, baseOffset: 0, clearFront: 0.60, clearSides: 0.10 },
    shower_glass_panel: { w: 0.90, l: 0.90, h: 2.00, baseOffset: 0, clearFront: 0.20, clearSides: 0.00 },
    // F1.6' (2026-05-30) — drop-in residential bath (UK standard
    // 1700×700×500 mm). clearFront 0.45 leaves stepping-over room at
    // the long edge; clearSides 0.05 since baths typically butt tight
    // against adjacent walls + the toilet/vanity. Required: false in
    // the bathroom archetype so tight rooms ship clean.
    bath:               { w: 1.70, l: 0.70, h: 0.50, baseOffset: 0, clearFront: 0.45, clearSides: 0.05 },
    // F1.7 (2026-05-30) — WC primitives.
    //   wc_washbasin: wall-hung, 450 × 300 mm projection at 0.85 m rim.
    //     clearFront 0.55 leaves elbow room; clearSides 0.05 since the WC
    //     archetype packs them tight against the toilet.
    //   wc_mirror:    wall-mounted, 400 × 30 × 600 mm at 1.20 m baseOffset.
    //     No clearance — flat panel on the wall.
    wc_washbasin:       { w: 0.45, l: 0.30, h: 0.15, baseOffset: 0.85, clearFront: 0.55, clearSides: 0.05 },
    wc_mirror:          { w: 0.40, l: 0.03, h: 0.60, baseOffset: 1.20, clearFront: 0.00, clearSides: 0.00 },
    // F1.8 (2026-05-30) — Utility / laundry primitives.
    //   washing_machine_standalone + tumble_dryer: 600×600×850 mm (UK
    //     standard front-loader cabinet). clearFront 0.70 leaves loading
    //     room; clearSides 0.00 since they typically butt up against each
    //     other side-by-side OR stack vertically (the stacked variant
    //     handled by the archetype, not the footprint).
    //   utility_cabinet: tall 600×400×2000 mm storage tower. clearFront
    //     0.60 leaves door-swing room.
    //   utility_sink: deep stainless 500×350×850 mm sink. clearFront 0.60.
    //   drying_rack: wall-mounted at 1.60 m baseOffset, projects 0.40 m
    //     into the room. clearFront 0.00 (it's above head height) but
    //     small clearSides for the brackets.
    washing_machine_standalone: { w: 0.60, l: 0.60, h: 0.85, baseOffset: 0,    clearFront: 0.70, clearSides: 0.00 },
    tumble_dryer:               { w: 0.60, l: 0.60, h: 0.85, baseOffset: 0,    clearFront: 0.70, clearSides: 0.00 },
    utility_cabinet:            { w: 0.60, l: 0.40, h: 2.00, baseOffset: 0,    clearFront: 0.60, clearSides: 0.05 },
    utility_sink:               { w: 0.50, l: 0.35, h: 0.85, baseOffset: 0,    clearFront: 0.60, clearSides: 0.05 },
    drying_rack:                { w: 0.80, l: 0.40, h: 0.05, baseOffset: 1.60, clearFront: 0.00, clearSides: 0.10 },
    // Kitchen runs — parametric placeholders (resolved from config arm lengths).
    kitchen_straight:   { w: 3.00, l: 0.60, h: 0.90, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    kitchen_l_shape:    { w: 3.00, l: 0.60, h: 0.90, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    kitchen_u_shape:    { w: 3.00, l: 0.60, h: 0.90, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    // §KITCHEN-ISLAND (2026-05-29) — standard centre island: 2.0 × 0.9 m
    // counter, 0.9 m kitchen-side circulation each side. Required: false in
    // the archetype, so small kitchens with the run's clearFront blocking
    // the centroid drop the island automatically — only large open-plan
    // kitchens get one.
    kitchen_island:     { w: 2.00, l: 0.90, h: 0.90, baseOffset: 0, clearFront: 0.90, clearSides: 0.90 },
    // F-FRIDGE (2026-06-05) — standard free-standing fridge/freezer: 0.60 m wide
    // × 0.65 m deep × 1.80 m tall, ~1.0 m door-open + standing clearance in front.
    fridge:             { w: 0.60, l: 0.65, h: 1.80, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    // A.21.D20 (2026-06-06) — kitchen appliances + cabinet modules. All sized
    // to the standard 600 mm module so they sit flush IN the worktop run (depth
    // 0.60 m, worktop height 0.90 m). `clearFront` reserves the working/standing
    // zone in front; sides 0 so modules butt flush along the run.
    //   sink:       under-mount in the worktop — modelled as a 600 module.
    //   hob:        cooktop in the worktop; extractor mounts above it.
    //   oven:       under-counter built-in oven (0.90 m cabinet height).
    //   dishwasher: integrated 600 appliance (worktop height).
    //   washing_machine: front-loader 600 module (kitchen/utility run).
    //   extractor:  wall-mounted hood over the hob at 1.50 m baseOffset.
    //   base_unit:  the generic 600 base cabinet the run is composed from.
    //   wall_unit:  600 wall cabinet at 1.45 m baseOffset (above the worktop).
    sink:           { w: 0.60, l: 0.60, h: 0.90, baseOffset: 0,    clearFront: 0.90, clearSides: 0.00 },
    hob:            { w: 0.60, l: 0.60, h: 0.90, baseOffset: 0,    clearFront: 0.90, clearSides: 0.00 },
    oven:           { w: 0.60, l: 0.60, h: 0.90, baseOffset: 0,    clearFront: 0.90, clearSides: 0.00 },
    dishwasher:     { w: 0.60, l: 0.60, h: 0.90, baseOffset: 0,    clearFront: 0.90, clearSides: 0.00 },
    washing_machine:{ w: 0.60, l: 0.60, h: 0.90, baseOffset: 0,    clearFront: 0.90, clearSides: 0.00 },
    extractor:      { w: 0.60, l: 0.45, h: 0.45, baseOffset: 1.50, clearFront: 0.00, clearSides: 0.00 },
    base_unit:      { w: 0.60, l: 0.60, h: 0.90, baseOffset: 0,    clearFront: 0.90, clearSides: 0.00 },
    wall_unit:      { w: 0.60, l: 0.35, h: 0.70, baseOffset: 1.45, clearFront: 0.00, clearSides: 0.00 },
    // F1.1 (2026-05-30) — Study workstation.
    //   desk: 1.40 m wide × 0.70 m deep × 0.75 m worktop height. 0.90 m
    //         front clearance so the user can roll the chair back without
    //         hitting an opposite wall; 0.45 m side clearance for the chair
    //         tucked under one end.
    //   desk_chair: 0.55 × 0.55 footprint, 0.90 m tall. No additional
    //         clearance — its movement zone is covered by the desk's
    //         clearFront.
    desk:           { w: 1.40, l: 0.70, h: 0.75, baseOffset: 0, clearFront: 0.90, clearSides: 0.45 },
    desk_chair:     { w: 0.55, l: 0.55, h: 0.90, baseOffset: 0, clearFront: 0.00, clearSides: 0.00 },
    // F1.2 (2026-05-30) — Bookshelf (open + glass-front variants).
    //   0.80 m wide × 0.35 m deep × 1.80 m tall. 0.60 m front clearance
    //   so the user can stand back to read titles + retrieve books
    //   without bumping the wall behind them. No side clearance — the
    //   solver may pack two side-by-side along a long wall.
    bookshelf:        { w: 0.80, l: 0.35, h: 1.80, baseOffset: 0, clearFront: 0.60, clearSides: 0.00 },
    bookshelf_glass:  { w: 0.80, l: 0.35, h: 1.80, baseOffset: 0, clearFront: 0.60, clearSides: 0.00 },
    // F1.3 (2026-05-30) — Media wall.
    //   tv: 1.40 m wide × 0.08 m deep × 0.80 m tall. Wall-mounted —
    //       baseOffset 1.2 m so the panel hangs at eye level. No floor
    //       clearance (the unit below sits beneath the panel).
    //   tv_unit: 1.60 m wide × 0.40 m deep × 0.50 m tall. Sits on the
    //       floor under the TV. 0.60 m front clearance so the sofa
    //       doesn't crowd the front of the unit.
    tv:               { w: 1.40, l: 0.08, h: 0.80, baseOffset: 1.20, clearFront: 0.00, clearSides: 0.00 },
    tv_unit:          { w: 1.60, l: 0.40, h: 0.50, baseOffset: 0,    clearFront: 0.60, clearSides: 0.00 },
    // F1.4 (2026-05-30) — Entry storage. All anchored on hall walls; the
    // shoe cabinet + console need step-back clearance; the coat rack +
    // entry bench take floor-only space.
    shoe_cabinet:     { w: 0.90, l: 0.35, h: 0.90, baseOffset: 0, clearFront: 0.50, clearSides: 0.00 },
    coat_rack:        { w: 0.45, l: 0.45, h: 1.80, baseOffset: 0, clearFront: 0.30, clearSides: 0.00 },
    console_table:    { w: 1.00, l: 0.30, h: 0.85, baseOffset: 0, clearFront: 0.40, clearSides: 0.00 },
    entry_bench:      { w: 1.20, l: 0.40, h: 0.45, baseOffset: 0, clearFront: 0.50, clearSides: 0.00 },
    // F1.5 (2026-05-30) — Bathroom vanity system (S4).
    //   vanity_unit floor-anchored cabinet 1.0 × 0.5 × 0.85 m.
    //   bathroom_mirror wall-hung 0.8 × 0.04 × 0.7 m, baseOffset 1.10 m
    //     (above the vanity countertop).
    //   towel_rail wall-hung 0.5 × 0.10 × 0.8 m, baseOffset 0.40 m.
    vanity_unit:      { w: 1.00, l: 0.50, h: 0.85, baseOffset: 0,    clearFront: 0.70, clearSides: 0.05 },
    bathroom_mirror:  { w: 0.80, l: 0.04, h: 0.70, baseOffset: 1.10, clearFront: 0.00, clearSides: 0.00 },
    towel_rail:       { w: 0.50, l: 0.10, h: 0.80, baseOffset: 0.40, clearFront: 0.00, clearSides: 0.00 },
    // F1.9 (2026-05-30) — Dining-room storage.
    //   buffet (tall): 1.50 m × 0.45 m × 0.90 m, 0.70 m front clearance
    //   sideboard (low): 1.80 m × 0.45 m × 0.75 m, 0.70 m front clearance
    buffet:           { w: 1.50, l: 0.45, h: 0.90, baseOffset: 0, clearFront: 0.70, clearSides: 0.00 },
    sideboard:        { w: 1.80, l: 0.45, h: 0.75, baseOffset: 0, clearFront: 0.70, clearSides: 0.00 },
    // F1.10 (2026-05-30) — Wall decor (both wall-mounted, no floor footprint
    // — clearFront 0 because they don't extrude meaningfully into the room).
    //   wall_art: 0.6 × 0.04 × 0.9 m, baseOffset 1.20 m (centre at eye level).
    //   wall_mirror: 0.5 × 0.04 × 0.8 m, baseOffset 1.20 m.
    wall_art:         { w: 0.60, l: 0.04, h: 0.90, baseOffset: 1.20, clearFront: 0.00, clearSides: 0.00 },
    wall_mirror:      { w: 0.50, l: 0.04, h: 0.80, baseOffset: 1.20, clearFront: 0.00, clearSides: 0.00 },
    // F1.13 (2026-05-30) — Lounge chair semantic alias (Barcelona silhouette).
    //   0.85 m × 0.85 m × 0.95 m, generous footprint typical of a lounge chair.
    lounge_chair:     { w: 0.85, l: 0.85, h: 0.95, baseOffset: 0, clearFront: 0.20, clearSides: 0.10 },
    // F1.14 (2026-05-30) — Tall narrow kitchen pantry.
    //   0.60 m × 0.45 m × 2.10 m, 1.0 m front clearance (door swing + user reach).
    pantry_cabinet:   { w: 0.60, l: 0.45, h: 2.10, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    // F1.12 (2026-05-30) — Bedroom dressing.
    //   dresser 1.20 × 0.50 × 0.85 m, 0.80 m front clearance (drawer pull-out).
    //   vanity_table 0.90 × 0.45 × 0.75 m, 0.85 m front clearance (chair pull-out).
    dresser:          { w: 1.20, l: 0.50, h: 0.85, baseOffset: 0, clearFront: 0.80, clearSides: 0.00 },
    vanity_table:     { w: 0.90, l: 0.45, h: 0.75, baseOffset: 0, clearFront: 0.85, clearSides: 0.10 },
    // F1.11 (2026-05-30) — Curtains.
    //   curtain_rod: 2.0 m wide (sized at runtime to bridge window), 0.04 m deep,
    //     0.04 m tall envelope; mounted at baseOffset 2.40 m (ceiling-adjacent).
    //   curtain_panel: 1.0 m wide × 0.05 m deep × 2.40 m tall fabric panel.
    //     Cross-room; archetype places TWO per rod (left + right) via count: 2.
    curtain_rod:      { w: 2.00, l: 0.04, h: 0.04, baseOffset: 2.40, clearFront: 0.00, clearSides: 0.00 },
    curtain_panel:    { w: 1.00, l: 0.05, h: 2.40, baseOffset: 0,    clearFront: 0.00, clearSides: 0.00 },
};

/** Footprint for a furniture kind (always defined for supported kinds). */
export function footprintOf(kind: FurnitureKind): Footprint {
    return FP[kind];
}

/** Footprint area (m²) excluding clearances. */
export function footprintArea(kind: FurnitureKind): number {
    const f = FP[kind];
    return f.w * f.l;
}

/** All catalogued kinds (for tests / completeness checks). */
export const FURNITURE_KINDS: readonly FurnitureKind[] = Object.keys(FP) as FurnitureKind[];
