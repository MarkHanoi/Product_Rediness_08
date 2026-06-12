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
import type { LightRoomInput, PlacedLight, Pt } from './types.js';

const DEFAULT_CEILING_H = 2.7;
/** Standard vanity / mirror-light mounting height above finished floor (m). */
const WALL_FIXTURE_Y    = 1.8;
/** §MORE-LIGHTING (#11) — how far a corner floor lamp insets from the room
 *  bounding-box corner so its body sits clear of the walls (m). */
const FLOOR_LAMP_INSET  = 0.45;

/**
 * §MORE-LIGHTING (#11) — the room's bounding-box corners, inset by FLOOR_LAMP_INSET,
 * ordered by distance from the centroid DESCENDING (the most "corner-y" first) then
 * by lower x, then z — fully deterministic. A floor lamp seats in one of these.
 */
function cornerSeats(input: LightRoomInput): Pt[] {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of input.polygon) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const i = FLOOR_LAMP_INSET;
    const corners: Pt[] = [
        { x: x0 + i, z: z0 + i }, { x: x1 - i, z: z0 + i },
        { x: x1 - i, z: z1 - i }, { x: x0 + i, z: z1 - i },
    ];
    const cx = input.centroid.x, cz = input.centroid.z;
    const d2 = (p: Pt): number => (p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz);
    return [...corners].sort((a, b) => (d2(b) - d2(a)) || (a.x - b.x) || (a.z - b.z));
}

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

    // §MORE-LIGHTING (#11) — FLOOR lamps seated in the room's far corners (at floor
    // level), emitted IN ADDITION to the ceiling + wall picks. `count` lamps (default
    // 1) are spread across the corners FARTHEST from the centroid, deterministically.
    // Each successive floor item takes the next-farthest free corner so two living-
    // room lamps land in DIFFERENT corners. Pure — no RNG, no collision (floor lamps
    // are small accents; the furniture engine owns floor circulation).
    const seats = cornerSeats(input);
    let seatIx = 0;
    for (const it of arch.items) {
        if (it.mount !== 'floor') continue;
        if (input.areaM2 < it.minAreaM2) continue;
        const n = it.count ?? 1;
        for (let k = 0; k < n; k++) {
            const seat = seats[seatIx % Math.max(1, seats.length)] ?? input.centroid;
            seatIx++;
            out.push({
                kind: it.kind,
                origin: { x: seat.x, y: input.levelElevation, z: seat.z },
                roomId: input.roomId,
                ceilingMounted: false,
            });
        }
    }

    return out;
}
