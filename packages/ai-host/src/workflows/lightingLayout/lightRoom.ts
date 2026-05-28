// D-LE — per-room lighting placement (MVP: one ceiling fixture, centroid-mounted).
//
// Pure + deterministic. Picks the first archetype item whose `minAreaM2`
// threshold the room meets, and places ONE fixture at the room centroid at
// the ceiling Y. Rooms with no archetype (e.g. 'unknown') return [].
//
// Future extensions (not in MVP):
//   - Multiple downlights laid out on a regular grid for rooms > 30 m².
//   - Wall sconces beside bedroom doors / living-room mirrors.
//   - Skip rooms with mandatory daylight (already lit by windows) at
//     specific times of day — design rule, not a geometric one.

import { archetypeForLighting } from './archetypes.js';
import type { LightRoomInput, PlacedLight } from './types.js';

const DEFAULT_CEILING_H = 2.7;

export function lightRoom(input: LightRoomInput): readonly PlacedLight[] {
    const arch = archetypeForLighting(input.occupancy);
    if (!arch || arch.items.length === 0) return [];

    // Pick the first item whose minimum-area threshold the room meets.
    const item = arch.items.find(it => input.areaM2 >= it.minAreaM2);
    if (!item) return [];

    const ceilY = typeof input.ceilingY === 'number'
        ? input.ceilingY
        : input.levelElevation + DEFAULT_CEILING_H;

    return [{
        kind: item.kind,
        origin: { x: input.centroid.x, y: ceilY, z: input.centroid.z },
        roomId: input.roomId,
        ceilingMounted: true,
    }];
}
