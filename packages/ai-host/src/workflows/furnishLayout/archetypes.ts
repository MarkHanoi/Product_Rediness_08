// D-FLE F2 — per-room furniture archetypes (SPEC-FURNITURE-LAYOUT-ENGINE §4).
//
// The design knowledge: what furniture goes in each room type and how it anchors.
// Items are ORDERED — the solver places them in order, later items yielding to
// earlier (the bed before its bedside tables; the sofa before the coffee table).
// `minAreaM2` lets the solver skip non-required items that don't fit (a tiny
// bedroom gets bed + 1 bedside table, no wardrobe). Pure data; ZERO imports but types.

import type { FurnishableOccupancy, FurnitureArchetype } from './types.js';

const ARCHETYPES: Readonly<Record<FurnishableOccupancy, FurnitureArchetype>> = {
    'bedroom': {
        occupancy: 'bedroom', minAreaM2: 6,
        items: [
            // Rules: every bedroom requires a bed, 2 bedside tables, lighting, a wardrobe.
            { kind: 'bed', anchor: 'wall-opposite-door', facing: 'to-wall', required: true, group: 'bed' },
            { kind: 'bedside_table', anchor: 'beside', facing: 'to-wall', required: true, group: 'bed', count: 2 },
            { kind: 'wardrobe', anchor: 'wall-longest', facing: 'to-wall', required: true },
            { kind: 'lamp', anchor: 'corner', facing: 'into-room', required: true },   // lighting
        ],
    },
    'living-room': {
        occupancy: 'living-room', minAreaM2: 9,
        items: [
            { kind: 'sofa', anchor: 'wall-longest', facing: 'into-room', required: true, group: 'sofa' },
            { kind: 'coffee_table', anchor: 'beside', facing: 'into-room', required: false, group: 'sofa' },
            { kind: 'lamp', anchor: 'corner', facing: 'into-room', required: false },   // lighting
        ],
    },
    'kitchen': {
        occupancy: 'kitchen', minAreaM2: 5,
        items: [
            { kind: 'kitchen_l_shape', anchor: 'wall-longest', facing: 'to-wall', required: true },
        ],
    },
    'dining-room': {
        occupancy: 'dining-room', minAreaM2: 7,
        items: [
            { kind: 'dining_table', anchor: 'center', facing: 'into-room', required: true, group: 'dining' },
            { kind: 'dining_chair', anchor: 'beside', facing: 'into-room', required: false, group: 'dining', count: 4 },
        ],
    },
    'bathroom': {
        occupancy: 'bathroom', minAreaM2: 2.5,
        // Rules: a bathroom requires a toilet, a washbasin and a shower/bath. The
        // washbasin is a Plumbing-system fixture (no plain furniture kind yet); it is
        // listed as a requiredFixture in the rules DB and sourced from the plumbing
        // catalogue at the wiring layer. The renderable furniture kinds are placed here.
        items: [
            { kind: 'toilet_radiator', anchor: 'wall-longest', facing: 'into-room', required: true },
            { kind: 'shower_glass_panel', anchor: 'corner', facing: 'into-room', required: true },
        ],
    },
    'entrance-lobby': {
        occupancy: 'entrance-lobby', minAreaM2: 3,
        items: [
            { kind: 'entrance_table', anchor: 'wall-longest', facing: 'into-room', required: false },
        ],
    },
    'private-office': {
        occupancy: 'private-office', minAreaM2: 5,
        items: [
            { kind: 'dining_table', anchor: 'wall-window', facing: 'into-room', required: true, group: 'desk' },
            { kind: 'dining_chair', anchor: 'beside', facing: 'to-wall', required: false, group: 'desk', count: 1 },
        ],
    },
    // Circulation / utility — intentionally unfurnished (keep clear).
    'corridor': { occupancy: 'corridor', minAreaM2: 0, items: [] },
    'utility-room': { occupancy: 'utility-room', minAreaM2: 0, items: [] },
};

/** Archetype for an occupancy, or null when that type isn't furnished. */
export function archetypeFor(occupancy: string): FurnitureArchetype | null {
    return (ARCHETYPES as Record<string, FurnitureArchetype>)[occupancy] ?? null;
}

export const FURNISHABLE_OCCUPANCIES: readonly FurnishableOccupancy[] =
    Object.keys(ARCHETYPES) as FurnishableOccupancy[];
