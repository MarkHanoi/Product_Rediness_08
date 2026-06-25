// D-CE — per-occupancy ceiling archetypes (MVP).
//
// Every room gets ONE ceiling at standard residential height (2.7 m). The
// archetype only varies on thickness + colour:
//
//   • Living / dining / bedroom / office / lobby — 50 mm warm-white plaster
//     (the architect can override the colour per-room via the property panel
//     once selected).
//   • Bathroom / utility — 50 mm cool-white moisture-tolerant tint.
//   • Kitchen — 50 mm warm-white (range-hood ducts are handled separately by
//     the plumbing/MEP pass, not the ceiling slab).
//   • Corridor — 50 mm matching the living-room finish so flow is continuous.
//   • §RESI-CEILING-SERVICE-ROOMS — WC / shower-room / storage — 50 mm cool-white
//     moisture-tolerant tint (same as bathroom). These small service rooms WERE
//     skipped (no archetype → no ceiling), leaving them open to the slab above.
//
// Future iterations: tray ceilings in master bedrooms (+50 mm drop with a
// cove), acoustic tile grid in offices > 12 m², integrated downlight tracks
// in long corridors. None blocks the MVP.

import type { CeilableOccupancy, CeilingArchetype } from './types.js';

const STD_HEIGHT = 2.7;
const STD_THICKNESS = 0.05;

const make = (
    occupancy: CeilableOccupancy,
    materialColor: string,
    over: Partial<Omit<CeilingArchetype, 'occupancy' | 'materialColor'>> = {},
): CeilingArchetype => ({
    occupancy,
    thicknessM: over.thicknessM ?? STD_THICKNESS,
    ceilingHeightM: over.ceilingHeightM ?? STD_HEIGHT,
    materialColor,
    ...(over.materialId ? { materialId: over.materialId } : {}),
});

export const CEILING_ARCHETYPES: Readonly<Record<CeilableOccupancy, CeilingArchetype>> = {
    'living-room':    make('living-room',    '#f5f5f0'),   // warm white
    'dining-room':    make('dining-room',    '#f5f5f0'),
    'kitchen':        make('kitchen',        '#f5f5f0'),
    'bedroom':        make('bedroom',        '#f5f5f0'),
    'entrance-lobby': make('entrance-lobby', '#f5f5f0'),
    'corridor':       make('corridor',       '#f5f5f0'),
    'private-office': make('private-office', '#f5f5f0'),
    'bathroom':       make('bathroom',       '#eef2f3'),   // cool white
    'utility-room':   make('utility-room',   '#eef2f3'),
    // §RESI-CEILING-SERVICE-ROOMS (2026-06-25) — small enclosed service rooms. Same
    // moisture-tolerant cool-white finish as bathroom/utility. Previously unmapped, so the
    // ceiling pass skipped them and they sat open to the slab above.
    'wc':                  make('wc',                  '#eef2f3'),
    'accessible-wc':       make('accessible-wc',       '#eef2f3'),
    'shower-room':         make('shower-room',         '#eef2f3'),
    'storage-residential': make('storage-residential', '#eef2f3'),
};

/** Returns the archetype for a room occupancy. `undefined` for rooms the
 *  engine doesn't ceiling (anything outside `CeilableOccupancy`). */
export function archetypeForCeiling(occupancy: string): CeilingArchetype | undefined {
    return CEILING_ARCHETYPES[occupancy as CeilableOccupancy];
}
