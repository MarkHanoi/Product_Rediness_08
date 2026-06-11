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
            // §FURNITURE-SPEC: bed + wardrobe NEVER on the window wall (privacy +
            // thermal envelope + the wardrobe would block daylight) and prefer a
            // wall WITHOUT the door (you don't sleep next to the door swing).
            { kind: 'bed', anchor: 'wall-opposite-door', facing: 'to-wall', required: true, group: 'bed', excludeWindowWall: true, excludeDoorSwing: true },
            { kind: 'bedside_table', anchor: 'beside', facing: 'to-wall', required: true, group: 'bed', count: 2 },
            // §67.1 (2026-06-11) — a rug in FRONT OF / under the bed (centred on
            // the bed via the 'under' anchor). Collision-EXEMPT: it underlaps the
            // bed + bedside tables. Placed after the bed so it reads the bed pose.
            { kind: 'rug', anchor: 'under', facing: 'to-wall', required: false, group: 'bed' },
            { kind: 'wardrobe', anchor: 'wall-longest', facing: 'to-wall', required: true, excludeWindowWall: true, excludeDoorSwing: true },
            // F1.12 (2026-05-30) — Bedroom dressing. Dresser on longest free
            // wall (yields to the wardrobe); vanity_table beside the window
            // for natural light when applying makeup.
            // F4 follow-up (2026-05-31) — both tagged with the 'dressing'
            // activity group so they read as a coherent dressing zone
            // (architect's semantic grouping; the solver's leader/beside
            // pairing keeps each item at its own anchor since neither uses
            // `anchor: 'beside'`).
            { kind: 'dresser',      anchor: 'wall-longest', facing: 'to-wall',   required: false, group: 'dressing', excludeWindowWall: true, excludeDoorSwing: true },
            { kind: 'vanity_table', anchor: 'wall-window',  facing: 'to-wall',   required: false, group: 'dressing', excludeDoorSwing: true },
            // F1.10 (2026-05-30) — Wall mirror above the bed wall (paired
            // with the bed group — the mirror reads as a headboard accent).
            { kind: 'wall_mirror', anchor: 'beside', facing: 'into-room', required: false, group: 'bed' },
            // F1.11 (2026-05-30) — Curtain rod on the window wall (S7 precursor).
            // §bedroom-mirror (2026-06-11) — the founder asked for the bedroom's
            // curtain PANEL to be swapped for a MIRROR. The two flanking
            // curtain_panel slabs become two wall_mirror panels (reflective
            // mirror material — see styleFinish MIRROR_KINDS + MirrorMaterial.ts).
            // The rod stays; the LIVING-ROOM curtain_panel is untouched.
            { kind: 'curtain_rod', anchor: 'wall-window', facing: 'to-wall', required: false, group: 'curtains' },
            { kind: 'wall_mirror', anchor: 'beside',      facing: 'to-wall', required: false, group: 'curtains', count: 2 },
            // F3.3 (2026-05-30) — Optional reading chair in a corner of
            // larger bedrooms (the classic primary-bedroom reading nook).
            { kind: 'lounge_chair', anchor: 'corner', facing: 'into-room', required: false },
            { kind: 'lamp', anchor: 'corner', facing: 'into-room', required: true },   // lighting
        ],
    },
    'living-room': {
        occupancy: 'living-room', minAreaM2: 9,
        // F4.1 / S1 (2026-06-01) — the living-room hosts the Media Wall
        // activity system. The existing tv + tv_unit items (F1.3, group:
        // 'media') already produce the build; the annotation surfaces the
        // composition by name for downstream tooling (Family Platform P0,
        // AI hints, schedules, IFC-α exports). See ./activityArchetypes.ts.
        activitySystems: ['media-wall'],
        items: [
            // §FURNITURE-SPEC: sofa prefers a wall WITHOUT the door — the door wall
            // is the entry path; the sofa anchors on the opposite/long wall.
            { kind: 'sofa', anchor: 'wall-longest', facing: 'into-room', required: true, group: 'sofa', excludeDoorSwing: true },
            { kind: 'coffee_table', anchor: 'beside', facing: 'into-room', required: false, group: 'sofa' },
            // §67.1 (2026-06-11) — a rug in FRONT OF the sofa / under the coffee
            // table (centred on the sofa group via the 'under' anchor). Collision-
            // EXEMPT — it underlaps the sofa + coffee table.
            { kind: 'rug', anchor: 'under', facing: 'into-room', required: false, group: 'sofa' },
            // F1.3 (2026-05-30) — Media wall (S1 activity system anchor).
            // The TV unit anchors on the wall opposite the sofa (the "media
            // wall"), excluding the window wall (no daylight glare on the
            // screen) and the door wall. The wall-mounted TV sits in the
            // same group above the unit — the engine pairs them via the
            // 'media' group and yields the TV to the unit's chosen wall.
            { kind: 'tv_unit', anchor: 'wall-opposite-door', facing: 'into-room', required: false, group: 'media', excludeWindowWall: true, excludeDoorSwing: true },
            { kind: 'tv',      anchor: 'beside',             facing: 'into-room', required: false, group: 'media' },
            // F1.2 (2026-05-30) — Glass-front bookshelf as optional living-room
            // storage. Anchors on the longest free wall, excludes window wall
            // (tall piece blocks daylight) and the door wall.
            { kind: 'bookshelf_glass', anchor: 'wall-longest', facing: 'to-wall', required: false, excludeWindowWall: true, excludeDoorSwing: true },
            // F1.10 (2026-05-30) — Wall art above the sofa (paired group).
            { kind: 'wall_art', anchor: 'beside', facing: 'into-room', required: false, group: 'sofa', excludeWindowWall: true },
            // F1.11 (2026-05-30) — Curtains on the living-room window wall.
            { kind: 'curtain_rod',   anchor: 'wall-window', facing: 'to-wall', required: false, group: 'curtains' },
            { kind: 'curtain_panel', anchor: 'beside',      facing: 'to-wall', required: false, group: 'curtains', count: 2 },
            // F3.2 (2026-05-30) — Optional second seat for larger living rooms.
            // Anchored at a corner so it pairs with the sofa as the secondary
            // conversation seat without disturbing the sofa-coffee axis.
            { kind: 'lounge_chair', anchor: 'corner', facing: 'into-room', required: false },
            { kind: 'lamp', anchor: 'corner', facing: 'into-room', required: false },   // lighting
        ],
    },
    'kitchen': {
        occupancy: 'kitchen', minAreaM2: 5,
        items: [
            // §FURNITURE-SPEC: the L-shape kitchen wraps TWO adjacent walls — emitted
            // as two perpendicular straight runs. Both anchor `wall-longest` with
            // excludeDoorSwing; the cascading anchor-wall resolver puts the second
            // on a perpendicular wall once the first claims the primary (longest)
            // wall, naturally forming an L at the corner. The second run is optional
            // — small kitchens that can't fit two runs gracefully degrade to one.
            { kind: 'kitchen_straight', anchor: 'wall-longest', facing: 'to-wall', required: true,  excludeDoorSwing: true },
            { kind: 'kitchen_straight', anchor: 'wall-longest', facing: 'to-wall', required: false, excludeDoorSwing: true },
            // F1.14 (2026-05-30) — Tall pantry on a wall PERPENDICULAR to the
            // main kitchen run (so the run keeps its working stretch). Anchor
            // 'wall-longest' yields to the kitchen runs that claimed it first,
            // landing on the next-longest free wall.
            { kind: 'pantry_cabinet', anchor: 'wall-longest', facing: 'to-wall', required: false, excludeWindowWall: true, excludeDoorSwing: true },
            // F-FRIDGE (2026-06-05) — the kitchen tall appliance. Anchors on the
            // longest free wall (yields to the counter runs + pantry that claimed
            // it first → lands on the next free wall, typically the end of a run),
            // excludeWindowWall (a 1.8 m tall box would block daylight) +
            // excludeDoorSwing. Optional so a tiny galley kitchen ships clean.
            { kind: 'fridge', anchor: 'wall-longest', facing: 'into-room', required: false, excludeWindowWall: true, excludeDoorSwing: true },
            // §KITCHEN-ISLAND (2026-05-29) — optional centre island for open-plan
            // kitchens. Placed AFTER the wall runs so the island only lands when
            // the room still has clear centroid space (smaller kitchens have the
            // run's clearFront covering the centroid → island drops cleanly).
            // facing 'into-room' rotates the cabinet doors to face the cook side.
            { kind: 'kitchen_island', anchor: 'center', facing: 'into-room', required: false },
            // F4 follow-up (2026-05-31) — kitchens have windows (programRules
            // .kitchen.needsWindow = true; the sink wants natural light). Mirror
            // the bedroom/living-room curtain pattern: rod on the window wall +
            // two panels flanking.
            { kind: 'curtain_rod',   anchor: 'wall-window', facing: 'to-wall', required: false, group: 'curtains' },
            { kind: 'curtain_panel', anchor: 'beside',      facing: 'to-wall', required: false, group: 'curtains', count: 2 },
        ],
    },
    'dining-room': {
        occupancy: 'dining-room', minAreaM2: 7,
        items: [
            { kind: 'dining_table', anchor: 'center', facing: 'into-room', required: true, group: 'dining' },
            { kind: 'dining_chair', anchor: 'beside', facing: 'into-room', required: false, group: 'dining', count: 4 },
            // §67.1 (2026-06-11) — a rug UNDER the dining table (centred on the
            // table via the 'under' anchor). Collision-EXEMPT — it underlaps the
            // table + chairs (the classic "anchor the dining zone" rug).
            { kind: 'rug', anchor: 'under', facing: 'into-room', required: false, group: 'dining' },
            // F1.9 (2026-05-30) — Dining-room storage. Sideboard preferred
            // over buffet (lower profile reads better against the dining
            // table's silhouette). Both anchor on the longest free wall.
            { kind: 'sideboard', anchor: 'wall-longest', facing: 'to-wall', required: false, excludeWindowWall: true, excludeDoorSwing: true },
            { kind: 'buffet',    anchor: 'wall-longest', facing: 'to-wall', required: false, excludeWindowWall: true, excludeDoorSwing: true },
            // F4 follow-up (2026-05-31) — dining rooms have windows
            // (programRules.dining.needsWindow = true). Curtains on the
            // window wall, mirroring the bedroom/living-room pattern.
            { kind: 'curtain_rod',   anchor: 'wall-window', facing: 'to-wall', required: false, group: 'curtains' },
            { kind: 'curtain_panel', anchor: 'beside',      facing: 'to-wall', required: false, group: 'curtains', count: 2 },
        ],
    },
    'bathroom': {
        occupancy: 'bathroom', minAreaM2: 2.5,
        // Rules: a bathroom requires a toilet, a washbasin and a shower/bath. The
        // washbasin is a Plumbing-system fixture (no plain furniture kind yet); it is
        // listed as a requiredFixture in the rules DB and sourced from the plumbing
        // catalogue at the wiring layer. The renderable furniture kinds are placed here.
        // §FURNITURE-SPEC: the toilet is NOT on the door wall — you face it side-on
        // as you open the door, and the door swing collides with the toilet zone.
        items: [
            { kind: 'toilet_radiator', anchor: 'wall-longest', facing: 'into-room', required: true, excludeDoorSwing: true },
            { kind: 'shower_glass_panel', anchor: 'corner', facing: 'into-room', required: true },
            // F1.5 (2026-05-30) — S4 bathroom vanity system. Vanity anchors
            // on the wall opposite the door (the user faces it on entry to
            // wash hands). Mirror sits above the vanity (shares 'vanity'
            // group). Towel rail mounts beside.
            // F4 follow-up (2026-05-31) — towel_rail joins the 'vanity' group
            // so it lands next to the basin (the architect's expectation —
            // towel reach is from the basin, not a random free wall).
            { kind: 'vanity_unit',     anchor: 'wall-opposite-door', facing: 'into-room', required: false, group: 'vanity', excludeDoorSwing: true },
            { kind: 'bathroom_mirror', anchor: 'beside',             facing: 'into-room', required: false, group: 'vanity' },
            { kind: 'towel_rail',      anchor: 'beside',             facing: 'to-wall',   required: false, group: 'vanity', excludeDoorSwing: true },
            // F1.6' (2026-05-30) — drop-in bath on the longest free wall.
            // Optional (required: false) so tight bathrooms — where the
            // 1.7 m × 0.7 m footprint won't fit after the toilet, shower,
            // and vanity have claimed walls — ship clean with shower-only.
            // excludeDoorSwing + excludeWindowWall so the bath doesn't
            // foul the door or block the window's daylight axis.
            { kind: 'bath', anchor: 'wall-longest', facing: 'into-room', required: false, excludeDoorSwing: true, excludeWindowWall: true },
        ],
    },
    // F3.5 (2026-05-31) — WC archetype. The cloakroom-toilet variant of the
    // bathroom (no shower, no full vanity). Uses the F1.7 compact primitives
    // — wc_washbasin (wall-hung small basin) + wc_mirror (compact mirror).
    // Programme rule (programRules.wc) caps doors to 1 and forbids access
    // from bedroom / kitchen / living. Access only from corridor or hall.
    //
    // §FURNITURE-SPEC: tight footprint — typical UK cloakroom WC is 1.2 m²
    // with a 0.9 m short side. Toilet on the plumbing wall (wet_wall);
    // washbasin perpendicular OR opposite; mirror above the washbasin in
    // the 'wc-basin' group for relative placement.
    'wc': {
        occupancy: 'wc', minAreaM2: 1.2,
        items: [
            { kind: 'toilet_radiator', anchor: 'wall-longest',       facing: 'into-room', required: true,  excludeDoorSwing: true },
            { kind: 'wc_washbasin',    anchor: 'wall-opposite-door', facing: 'into-room', required: true,  group: 'wc-basin', excludeDoorSwing: true },
            { kind: 'wc_mirror',       anchor: 'beside',             facing: 'into-room', required: false, group: 'wc-basin' },
        ],
    },
    'entrance-lobby': {
        occupancy: 'entrance-lobby', minAreaM2: 3,
        // F4.2 / S2 (2026-06-01) — the entrance-lobby hosts the Entry Storage
        // activity system. The existing shoe_cabinet + console_table +
        // coat_rack + entry_bench + wall_mirror items (F1.4 / F3.8, group:
        // 'entry') already produce the build; this annotation names the
        // composition for downstream tooling (Family Platform P0, AI hints,
        // schedules, IFC-α exports). See ./activityArchetypes.ts.
        activitySystems: ['entry-storage'],
        items: [
            // §FURNITURE-SPEC: the entrance table is on a wall perpendicular to the
            // front door (the door wall is the swing zone — it must stay clear).
            { kind: 'entrance_table', anchor: 'wall-longest', facing: 'into-room', required: false, excludeDoorSwing: true },
            // F1.4 (2026-05-30) — S2 entry storage activity system.
            //   • shoe_cabinet anchors on the longest free wall (often the
            //     same wall as the console — solver yields).
            //   • coat_rack stands in a corner; small footprint, no wall claim.
            //   • console_table prefers the wall opposite the front door
            //     (the "lobby" wall the user faces on entry — keys/mail
            //     drop landing zone).
            //   • entry_bench is the smallest item; placed last, beside the
            //     shoe_cabinet if room remains.
            { kind: 'shoe_cabinet',  anchor: 'wall-longest',       facing: 'to-wall',   required: false, group: 'entry', excludeDoorSwing: true },
            { kind: 'console_table', anchor: 'wall-opposite-door', facing: 'into-room', required: false, group: 'entry', excludeDoorSwing: true },
            { kind: 'coat_rack',     anchor: 'corner',              facing: 'into-room', required: false },
            { kind: 'entry_bench',   anchor: 'beside',              facing: 'into-room', required: false, group: 'entry' },
            // F3.8 (2026-05-30) — wall_mirror above the console_table (the
            // classic "lobby mirror" — quick glance on the way out). Pairs
            // with the 'entry' group and yields to the console's chosen wall.
            { kind: 'wall_mirror',   anchor: 'beside',              facing: 'into-room', required: false, group: 'entry' },
        ],
    },
    'private-office': {
        occupancy: 'private-office', minAreaM2: 5,
        items: [
            // F1.1 (2026-05-30) — Study workstation proper. The dining-table-
            // as-desk workaround is retired now that desk + desk_chair ship
            // contract-complete (FurnitureType union, FurnitureCategoryMap,
            // DeskBuilder, DeskChairBuilder, FurnitureFactory arms, ai-host
            // FurnitureKind, footprints, programRules.study furnitureSpec).
            //   • desk anchors on the WINDOW WALL so natural light falls
            //     across the worktop from the side (no glare on a monitor).
            //   • desk_chair sits BESIDE the desk in the same group, facing
            //     the wall (i.e. the user faces the wall to work).
            { kind: 'desk',       anchor: 'wall-window', facing: 'into-room', required: true,  group: 'desk' },
            { kind: 'desk_chair', anchor: 'beside',      facing: 'to-wall',   required: false, group: 'desk', count: 1 },
            // F1.2 (2026-05-30) — Open bookshelf as the canonical study
            // companion to the desk. Anchors on the longest free wall (not
            // the window wall — tall piece blocks daylight) and yields to
            // the desk's window-wall claim.
            { kind: 'bookshelf', anchor: 'wall-longest', facing: 'to-wall', required: false, excludeWindowWall: true, excludeDoorSwing: true },
            // F4 follow-up (2026-05-31) — studies have windows
            // (programRules.study.needsWindow = true; the desk anchors on the
            // window wall). Curtains soften the daylight on the worktop.
            { kind: 'curtain_rod',   anchor: 'wall-window', facing: 'to-wall', required: false, group: 'curtains' },
            { kind: 'curtain_panel', anchor: 'beside',      facing: 'to-wall', required: false, group: 'curtains', count: 2 },
        ],
    },
    // Circulation / utility — intentionally unfurnished (keep clear).
    'corridor': { occupancy: 'corridor', minAreaM2: 0, items: [] },
    // F1.8 (2026-05-30) — Utility / laundry archetype. Closes F3.6.
    // S5 activity system: plumbing wall carries the washer + dryer side-
    // by-side (or stacked when the run is short), utility cabinet on
    // longest free wall for storage, utility sink optional (medium-large
    // rooms only), drying rack wall-mounted above the washer/dryer line.
    // Door swing kept clear from every appliance.
    'utility-room': {
        occupancy: 'utility-room', minAreaM2: 2,
        items: [
            { kind: 'washing_machine_standalone', anchor: 'wall-longest', facing: 'into-room', required: true,  group: 'laundry', excludeDoorSwing: true },
            { kind: 'tumble_dryer',                anchor: 'beside',        facing: 'into-room', required: false, group: 'laundry' },
            { kind: 'utility_cabinet',             anchor: 'wall-longest',  facing: 'to-wall',   required: false, excludeDoorSwing: true },
            { kind: 'utility_sink',                anchor: 'wall-longest',  facing: 'into-room', required: false, excludeDoorSwing: true },
            { kind: 'drying_rack',                 anchor: 'beside',        facing: 'to-wall',   required: false, group: 'laundry' },
        ],
    },
};

/** Archetype for an occupancy, or null when that type isn't furnished. */
export function archetypeFor(occupancy: string): FurnitureArchetype | null {
    return (ARCHETYPES as Record<string, FurnitureArchetype>)[occupancy] ?? null;
}

export const FURNISHABLE_OCCUPANCIES: readonly FurnishableOccupancy[] =
    Object.keys(ARCHETYPES) as FurnishableOccupancy[];
