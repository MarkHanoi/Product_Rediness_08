// D-FLE F7 — per-room furnishing entry (SPEC-FURNITURE-LAYOUT-ENGINE §2).
// Picks the archetype for the room's occupancy and runs the placement solver.
// Pure; rooms with no archetype (corridor/unknown) furnish to [].

import { archetypeFor } from './archetypes.js';
import { placeRoom, placeRoomMulti } from './placeSolver.js';
import type { FurnishRoomInput, PlacedFurniture } from './types.js';

export function furnishRoom(input: FurnishRoomInput): PlacedFurniture[] {
    const archetype = archetypeFor(input.occupancy);
    if (!archetype || archetype.items.length === 0) return [];
    return placeRoom(input, archetype);
}

/**
 * Furnish a single room polygon with MULTIPLE archetypes in sequence — the
 * apartment-layout open-plan case: hall + living + kitchen + dining merge into
 * ONE detected room, but each sub-program still needs its own furniture. The
 * archetypes share an obstacle set so placements don't collide; archetypes are
 * placed in the given order (living-room first → sofa claims the longest wall →
 * kitchen run yields to a different wall, etc.). Skips unknown occupancies.
 */
export function furnishRoomCompound(
    input: FurnishRoomInput, occupancies: readonly string[],
): PlacedFurniture[] {
    const archetypes = occupancies
        .map(o => archetypeFor(o))
        .filter((a): a is NonNullable<typeof a> => a !== null && a.items.length > 0);
    if (archetypes.length === 0) return [];
    return placeRoomMulti(input, archetypes);
}
