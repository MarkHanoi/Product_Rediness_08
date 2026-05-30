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
    // F1.15 (2026-05-30) — dining rooms ≥ 10 m² get a pendant_cluster
    // centerpiece (typically above the dining table); smaller rooms drop
    // back to a single pendant; tiny ones get a downlight.
    'dining-room':    A('dining-room', [
        { kind: 'pendant_cluster',      minAreaM2: 10 },
        { kind: 'pendant',              minAreaM2: 6 },
        { kind: 'downlight',            minAreaM2: 0 },
    ]),
    // F1.15 (2026-05-30) — kitchens ≥ 12 m² get a pendant_cluster (above
    // the island when present); smaller kitchens stay on linear_led which
    // is the task-light staple over a single run; tiny ones get a
    // downlight.
    'kitchen':        A('kitchen', [
        { kind: 'pendant_cluster',      minAreaM2: 12 },
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
    // Bathroom: ambient ceiling downlight + vanity mirror task light (F1.5',
    // 2026-05-30). The mirror_light is mount: 'wall' — emitted IN ADDITION
    // to the first-fit ceiling pick rather than instead of it (see types.ts
    // §LightingArchetype contract).
    'bathroom':       A('bathroom',       [
        { kind: 'downlight',    minAreaM2: 0 },
        { kind: 'mirror_light', minAreaM2: 0, mount: 'wall' },
    ]),
    'utility-room':   A('utility-room',   [{ kind: 'downlight', minAreaM2: 0 }]),
    // F3.9 (2026-05-30) — corridors of any usable length read better with a
    // continuous linear_led ceiling strip than a centroid downlight; the
    // strip suggests circulation directionally. ≥ 3 m² is a soft threshold
    // (a 0.8 m × 4 m corridor = 3.2 m²); below that the room is too tight
    // for a strip and a downlight does the job.
    'corridor':       A('corridor',       [
        { kind: 'linear_led', minAreaM2: 3 },
        { kind: 'downlight',  minAreaM2: 0 },
    ]),

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
