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
    // Kitchen runs — parametric placeholders (resolved from config arm lengths).
    kitchen_straight:   { w: 3.00, l: 0.60, h: 0.90, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    kitchen_l_shape:    { w: 3.00, l: 0.60, h: 0.90, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
    kitchen_u_shape:    { w: 3.00, l: 0.60, h: 0.90, baseOffset: 0, clearFront: 1.00, clearSides: 0.00 },
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
