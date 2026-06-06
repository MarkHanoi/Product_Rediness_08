// D-FLE F7 — per-room furnishing entry (SPEC-FURNITURE-LAYOUT-ENGINE §2).
// Picks the archetype for the room's occupancy and runs the placement solver.
// Pure; rooms with no archetype (corridor/unknown) furnish to [].
//
// A.21.D20 (2026-06-06) — kitchen rooms now route to the dedicated I/L/U run
// planner (`planKitchen`) which lays base units + appliances IN the run
// honouring the work-triangle; bedrooms route the wardrobe through the I/L/U
// `planWardrobe` planner. Both are gated by the optional `FurnishOptions`
// (the `kitchenLayout` / `wardrobeLayout` brief fields); default 'auto'.

import { archetypeFor } from './archetypes.js';
import { placeRoom, placeRoomMulti } from './placeSolver.js';
import { planKitchen, normaliseKitchenLayout, type KitchenLayout } from './kitchenLayout.js';
import { planWardrobe, normaliseWardrobeLayout, type WardrobeLayout } from './wardrobeLayout.js';
import type { FurnishRoomInput, PlacedFurniture } from './types.js';

/** A.21.D20 — per-run furnishing options (sourced from the typology brief).
 *  All optional; absent fields default to 'auto'. */
export interface FurnishOptions {
    /** Kitchen run shape — 'auto' (engine picks by aspect) | 'I' | 'L' | 'U'. */
    readonly kitchenLayout?: KitchenLayout | string;
    /** Wardrobe run shape — 'auto' | 'I' | 'L' | 'U'. */
    readonly wardrobeLayout?: WardrobeLayout | string;
    /** When true, the kitchen run includes a washing machine (no utility room). */
    readonly kitchenWashingMachine?: boolean;
}

export function furnishRoom(input: FurnishRoomInput, options: FurnishOptions = {}): PlacedFurniture[] {
    if (input.occupancy === 'kitchen') {
        return planKitchen(
            input,
            normaliseKitchenLayout(options.kitchenLayout),
            { washingMachine: !!options.kitchenWashingMachine },
        );
    }
    const archetype = archetypeFor(input.occupancy);
    if (!archetype || archetype.items.length === 0) return [];
    const placed = placeRoom(input, archetype);
    if (input.occupancy === 'bedroom') {
        return withWardrobePlan(input, placed, normaliseWardrobeLayout(options.wardrobeLayout));
    }
    return placed;
}

/**
 * Furnish a single room polygon with MULTIPLE archetypes in sequence — the
 * apartment-layout open-plan case: hall + living + kitchen + dining merge into
 * ONE detected room, but each sub-program still needs its own furniture. The
 * archetypes share an obstacle set so placements don't collide; archetypes are
 * placed in the given order (living-room first → sofa claims the longest wall →
 * kitchen run yields to a different wall, etc.). Skips unknown occupancies.
 *
 * A.21.D20 — when the compound includes 'kitchen', the kitchen sub-program is
 * served by `planKitchen` (run + appliances) AFTER the other archetypes have
 * claimed their walls, so the run lands clear of the sofa / dining table.
 */
export function furnishRoomCompound(
    input: FurnishRoomInput, occupancies: readonly string[], options: FurnishOptions = {},
): PlacedFurniture[] {
    const nonKitchen = occupancies.filter(o => o !== 'kitchen');
    const hasKitchen = occupancies.includes('kitchen');
    const archetypes = nonKitchen
        .map(o => archetypeFor(o))
        .filter((a): a is NonNullable<ReturnType<typeof archetypeFor>> => a !== null && a.items.length > 0);

    const placed: PlacedFurniture[] = [];
    if (archetypes.length > 0) placed.push(...placeRoomMulti(input, archetypes));
    if (hasKitchen) {
        // Run the kitchen planner in a fresh pass; it re-derives its run walls.
        // (The open-plan polygon is large; the kitchen claims the longest clear
        //  wall, which the sofa/dining archetypes left for it via wall-longest
        //  yielding — close enough for the demo open-plan case.)
        placed.push(...planKitchen(
            input,
            normaliseKitchenLayout(options.kitchenLayout),
            { washingMachine: !!options.kitchenWashingMachine },
        ));
    }
    return placed;
}

/** Replace the generic single `wardrobe` placement with the I/L/U wardrobe run
 *  when the planner can build one; otherwise keep the archetype's wardrobe. */
function withWardrobePlan(
    input: FurnishRoomInput, placed: PlacedFurniture[], layout: WardrobeLayout,
): PlacedFurniture[] {
    const wardrobeIdx = placed.findIndex(p => p.kind === 'wardrobe');
    if (wardrobeIdx < 0) return placed;
    const run = planWardrobe(input, placed, layout);
    if (run.length === 0) return placed;                 // planner couldn't fit → keep original
    const out = placed.filter(p => p.kind !== 'wardrobe');
    out.push(...run);
    return out;
}
