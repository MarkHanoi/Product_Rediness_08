// D-FLE F7 — per-room furnishing entry (SPEC-FURNITURE-LAYOUT-ENGINE §2).
// Picks the archetype for the room's occupancy and runs the placement solver.
// Pure; rooms with no archetype (corridor/unknown) furnish to [].

import { archetypeFor } from './archetypes.js';
import { placeRoom } from './placeSolver.js';
import type { FurnishRoomInput, PlacedFurniture } from './types.js';

export function furnishRoom(input: FurnishRoomInput): PlacedFurniture[] {
    const archetype = archetypeFor(input.occupancy);
    if (!archetype || archetype.items.length === 0) return [];
    return placeRoom(input, archetype);
}
