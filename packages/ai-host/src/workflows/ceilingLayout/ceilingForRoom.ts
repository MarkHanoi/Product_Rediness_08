// D-CE — per-room ceiling placement.
//
// Pure + deterministic. Projects the room's plan polygon into a Vec3 boundary
// at the ceiling Y (level.elevation + ceilingHeightM) and returns ONE
// PlacedCeiling per call. Rooms with no archetype (or fewer than 3 boundary
// points) return null.

import { archetypeForCeiling } from './archetypes.js';
import type { CeilingRoomInput, PlacedCeiling, Vec3m } from './types.js';

export function ceilingForRoom(input: CeilingRoomInput): PlacedCeiling | null {
    const arch = archetypeForCeiling(input.occupancy);
    if (!arch) return null;
    if (input.polygon.length < 3) return null;

    const ceilingHeightM = input.ceilingHeightM ?? arch.ceilingHeightM;
    const thicknessM     = input.thicknessM     ?? arch.thicknessM;
    const ceilY = input.levelElevation + ceilingHeightM;

    const boundary: Vec3m[] = input.polygon.map(p => ({
        x: p.x,
        y: ceilY,
        z: p.z,
    }));

    return {
        roomId: input.roomId,
        levelId: input.levelId,
        boundary,
        ceilingHeightM,
        thicknessM,
        materialColor: arch.materialColor,
        ...(arch.materialId ? { materialId: arch.materialId } : {}),
    };
}
