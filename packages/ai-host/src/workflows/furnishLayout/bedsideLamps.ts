// D-FLE — bedside lamp placement (furnish realism).
//
// The bedroom lighting chain places a CEILING fixture (D-LE) but no task light
// at the bed. A bedside lamp on each nightstand is the single biggest "this
// looks furnished" win for a generated bedroom. We place it HERE, in the
// furniture engine, because only the furniture pass knows where the bedside
// tables actually landed — the lighting engine only has the room centroid.
//
// Design: one `lamp` (the only lamp FurnitureKind in the union) sits centred ON
// each placed `bedside_table`, lifted to the table's top surface. Because it
// rides an existing piece's footprint, it never touches the floor → zero impact
// on circulation, the F-Sprint-5 gate, the central-blob, or any collision set.
//
// PURE + deterministic. Metres, world XZ. Same PlacedFurniture[] output.

import type { FurnishRoomInput, PlacedFurniture, Footprint, FurnitureKind } from './types.js';

const LAMP: FurnitureKind = 'lamp';

/** A compact table-lamp footprint (distinct from the floor `lamp` in the
 *  footprint catalogue, which is a 1.5 m corner standard lamp). 0.25 m square,
 *  0.45 m tall — a bedside reading lamp. No clearances: it sits on the table. */
const BEDSIDE_LAMP_FP: Footprint = {
    w: 0.25, l: 0.25, h: 0.45, baseOffset: 0, clearFront: 0, clearSides: 0,
};

/**
 * Place a bedside lamp on each bedside table already placed in the bedroom.
 * `placed` is the room's finished furniture set; we read the `bedside_table`
 * positions from it. Returns the lamp placements (0–2). The lamp's `y` is the
 * table's top surface (table base Y + table height) so it rests on the
 * nightstand; its yaw matches the table so it faces the room consistently.
 *
 * Pure + deterministic.
 */
export function placeBedsideLamps(
    input: FurnishRoomInput,
    placed: readonly PlacedFurniture[],
): PlacedFurniture[] {
    const tables = placed.filter(p => p.kind === 'bedside_table');
    const out: PlacedFurniture[] = [];
    for (const t of tables) {
        const surfaceY = t.position.y + t.footprint.h;   // sit on the table top
        out.push({
            kind: LAMP,
            position: { x: t.position.x, y: surfaceY, z: t.position.z },
            rotationY: t.rotationY,
            footprint: BEDSIDE_LAMP_FP,
            hostedSpaceId: input.roomId,
        });
    }
    return out;
}
