// D-LE — per-occupancy lighting archetypes.
//
// MVP rule: ONE ceiling fixture per room, centered on the room polygon's
// centroid. Fixture kind is chosen by occupancy and a coarse area bucket.
// Floor / table lamps are NOT placed by this engine (they belong to D-FLE's
// optionalFurniture set — `floor_wood_post` etc. are already in the D-FLE
// archetypes for living rooms / bedrooms).
//
// This is intentionally simple — the architectural value of the engine is
// in the COORDINATION + COMMAND DISPATCH (auto-fire after the apartment
// generator + furnish), not in lighting design fidelity. The architect can
// edit individual fixtures after generation; the engine guarantees every
// room has AT LEAST one ceiling light when furnished.

import type { LightableOccupancy, LightingArchetype } from './types.js';

const A = (occupancy: LightableOccupancy, items: LightingArchetype['items']): LightingArchetype =>
    ({ occupancy, items });

export const LIGHTING_ARCHETYPES: Readonly<Record<LightableOccupancy, LightingArchetype>> = {
    // Large social spaces — pendant for character, downlight for compact ones.
    'living-room':    A('living-room', [
        { kind: 'pendant_ceramic_bell', minAreaM2: 25 },
        { kind: 'pendant',              minAreaM2: 12 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),
    'dining-room':    A('dining-room', [
        { kind: 'pendant',              minAreaM2: 10 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),
    'kitchen':        A('kitchen', [
        { kind: 'linear_led',           minAreaM2: 8 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),

    // Private / bedroom — softer pendant.
    'bedroom':        A('bedroom', [
        { kind: 'pendant_conical',      minAreaM2: 14 },
        { kind: 'pendant',              minAreaM2: 9 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),

    // Service rooms — utilitarian downlight only.
    'bathroom':       A('bathroom',       [{ kind: 'downlight', minAreaM2: 0 }]),
    'utility-room':   A('utility-room',   [{ kind: 'downlight', minAreaM2: 0 }]),
    'corridor':       A('corridor',       [{ kind: 'downlight', minAreaM2: 0 }]),

    // Reception + office.
    'entrance-lobby': A('entrance-lobby', [
        { kind: 'pendant_pebble',       minAreaM2: 6 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),
    'private-office': A('private-office', [
        { kind: 'pendant',              minAreaM2: 12 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),
};

/** Returns the archetype for a room occupancy (any string). `undefined` for
 *  rooms the engine doesn't furnish (e.g. 'unknown'). */
export function archetypeForLighting(occupancy: string): LightingArchetype | undefined {
    return LIGHTING_ARCHETYPES[occupancy as LightableOccupancy];
}
