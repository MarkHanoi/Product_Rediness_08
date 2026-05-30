// D-LE — per-room lighting placement.
//
// Pure + deterministic. Emits:
//   - ONE ceiling fixture (the first archetype item with mount === 'ceiling'
//     whose `minAreaM2` threshold the room meets), centred on the centroid
//     at ceiling Y.
//   - ZERO OR MORE wall-mount fixtures (every archetype item with
//     mount === 'wall' whose `minAreaM2` threshold the room meets), each at
//     centroid XZ + vanity Y (levelElevation + WALL_FIXTURE_Y), ceilingMounted
//     false. The centroid XZ is a placeholder — proper vanity-wall snapping
//     comes with the bathroom D-FLE integration (F1.6').
//
// Rooms with no archetype (e.g. 'unknown') return [].
//
// Future extensions (not in MVP):
//   - Multiple downlights laid out on a regular grid for rooms > 30 m².
//   - Wall sconces beside bedroom doors / living-room mirrors.
//   - Vanity-wall detection for mirror_light XZ snapping.

import { archetypeForLighting } from './archetypes.js';
import type { LightRoomInput, PlacedLight } from './types.js';

const DEFAULT_CEILING_H = 2.7;
/** Standard vanity / mirror-light mounting height above finished floor (m). */
const WALL_FIXTURE_Y    = 1.8;

export function lightRoom(input: LightRoomInput): readonly PlacedLight[] {
    const arch = archetypeForLighting(input.occupancy);
    if (!arch || arch.items.length === 0) return [];

    const ceilY = typeof input.ceilingY === 'number'
        ? input.ceilingY
        : input.levelElevation + DEFAULT_CEILING_H;

    const out: PlacedLight[] = [];

    // First-fit ceiling pick (default mount is 'ceiling' when unset).
    const ceilingItem = arch.items.find(it =>
        (it.mount ?? 'ceiling') === 'ceiling' && input.areaM2 >= it.minAreaM2,
    );
    if (ceilingItem) {
        out.push({
            kind: ceilingItem.kind,
            origin: { x: input.centroid.x, y: ceilY, z: input.centroid.z },
            roomId: input.roomId,
            ceilingMounted: true,
        });
    }

    // Every eligible wall-mount item — emitted IN ADDITION to the ceiling pick.
    const wallY = input.levelElevation + WALL_FIXTURE_Y;
    for (const it of arch.items) {
        if (it.mount !== 'wall') continue;
        if (input.areaM2 < it.minAreaM2) continue;
        out.push({
            kind: it.kind,
            origin: { x: input.centroid.x, y: wallY, z: input.centroid.z },
            roomId: input.roomId,
            ceilingMounted: false,
        });
    }

    return out;
}
