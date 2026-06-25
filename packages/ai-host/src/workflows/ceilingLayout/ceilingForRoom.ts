// D-CE — per-room ceiling placement.
//
// Pure + deterministic. Projects the room's plan polygon into a Vec3 boundary
// at the ceiling Y (level.elevation + ceilingHeightM) and returns ONE
// PlacedCeiling per call. Rooms with no archetype (or fewer than 3 boundary
// points) return null.

import { archetypeForCeiling } from './archetypes.js';
import type { CeilingRoomInput, PlacedCeiling, Vec3m } from './types.js';

/** §RESI-CEILING-DEGENERATE-GUARD-2 (2026-06-25) — shoelace |area| of an XZ ring (m²). A ceiling
 *  built on a zero-area / collinear room polygon persists with < 3 distinct corners → load-fails
 *  `validatePolygon` ("≥ 3 vertices") and freezes project-open. The engine rejects it at source. */
function polyAreaXZ(poly: readonly { x: number; z: number }[]): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return Math.abs(s * 0.5);
}

export function ceilingForRoom(input: CeilingRoomInput): PlacedCeiling | null {
    const arch = archetypeForCeiling(input.occupancy);
    if (!arch) return null;
    if (input.polygon.length < 3) return null;
    // §RESI-CEILING-DEGENERATE-GUARD-2 — reject a degenerate (zero-area / collinear) boundary so no
    // ceiling with < 3 effective corners is ever produced (the 120-ceiling project-open freeze).
    if (polyAreaXZ(input.polygon) < 0.05) return null;

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
