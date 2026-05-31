// seedCoreFamilies — P0.3 slice B (Family Platform).
//
// Pure function returning the initial `RegisteredFamily[]` synthesised from the
// existing hardcoded element-type universe (the FurnitureType union currently
// driving auto-furnish). The composition root (composeRuntime) walks the
// returned array and calls `familyRegistryStore.register(seed)` for each one.
//
// Slice B scope — initial 6 representative entries (kept first, unchanged):
//   • 6 representative core families covering 3 mount classes (floor + wall +
//     ceiling) and 4 occupancies (bedroom, living, kitchen, bathroom).
//   • Each entry has `origin: 'core'` (the substrate's tier-1 trust marker).
//   • Each entry carries a stable schema hash keyed off `<origin>:<kind>:<ver>`
//     so a later slice can detect "same id, new version" without re-parsing.
//
// Slice B EXTENSION (2026-05-31) — grow from 6 → 25 entries to cover the bulk
// of the everyday-residential FurnitureType universe (per
// APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §6 + §10
// "the full 50+ FurnitureType seed lands later" — this lands the bulk of it
// without going to the long-tail variants).
//
// Slice B EXTENSION 2 (2026-05-31) — grow from 25 → 40 entries. Adds the
// remaining specialist + variant families spanning private_office / study,
// entrance_hall, wc, utility wet-fixtures, bed variants (Japanese / Nordic),
// plant variants (small / large / parametric tree), and storage variants
// (glass-front bookshelf / glass-door wardrobe). Per
// APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §10 the
// long-tail variants land in successive slices; this lands the second slab.
//
// Slice B EXTENSION 3 (2026-05-31) — grow from 40 → 59 entries. Closes the
// bulk of the "full 50+ FurnitureType seed lands later" promise from
// APARTMENT-FAMILY-PLATFORM doc §6. Adds chair / sofa variants (Cesca,
// textile-wood-arm, Barcelona corner, white sofa), table variants
// (wood-double-conic, wood-4leg, ceramic-curve, dining-marble-brass),
// soft furnishings (3 carpets + 1 curtain panel), more plant variants
// (plant_01 / plant_04 / plant_07 / arbol_t_01), media (TV wall-mount),
// utility (drying_rack), and a second wall mirror variant (wall_mirror).
// After this slice the seed covers all canonical residential FurnitureType
// names; long-tail stylistic variants (every Barcelona-chair colourway,
// every Arbol tree species, every kitchen-cabinet sub-type, …) still land
// mechanically in later slices.
//
// Out of scope (deferred to a later slice):
//   • The full 50+ FurnitureType seed (every Barcelona-chair variant, every
//     plant species, every kitchen-cabinet sub-type, …). This slice already
//     proves the seed pipeline works end-to-end; long-tail expansion is
//     mechanical.
//   • builderRef / planSymbolRef / footprint / uiDescriptor / aiVocabulary /
//     permissions — all deferred by slice A's `RegisteredFamilySchema`.
//
// L3 — imports only from `@pryzm/schemas` (L0). No THREE, no DOM.

import type { RegisteredFamily } from '@pryzm/schemas';

/**
 * Build the initial core-origin `RegisteredFamily` seed array. Pure: no I/O,
 * no random, no globals. Returns a fresh array on every call (callers may
 * mutate the array; entries are plain objects).
 *
 * The 25 entries are grouped by zone:
 *
 *   Bedroom + sleeping (7):
 *     1.  bed              — double bed                 (existing)
 *     3.  wardrobe         — bedroom storage            (existing)
 *     7.  bedside_table    — beside the bed             (NEW)
 *     8.  dresser          — bedroom storage            (NEW)
 *     9.  vanity_table     — dressing table             (NEW)
 *    10.  single_bed       — single bed                 (NEW)
 *    11.  bookshelf        — bedroom / office storage   (NEW)
 *
 *   Living + social (5):
 *     2.  sofa             — 3-seat sofa                (existing)
 *    12.  coffee_table     — beside the sofa            (NEW)
 *    13.  tv_unit          — media wall                 (NEW)
 *    14.  armchair         — accent seating             (NEW)
 *    15.  lamp             — accent lighting            (NEW)
 *
 *   Dining (2):
 *     4.  dining_table     — multi-occupancy            (existing)
 *    16.  dining_chair     — pairs with dining_table    (NEW)
 *
 *   Kitchen (4):
 *     5.  kitchen_straight — straight run               (existing)
 *    17.  kitchen_l_shape  — L-shape corner run         (NEW)
 *    18.  kitchen_u_shape  — U-shape wall-longest       (NEW)
 *    19.  kitchen_island   — centre island              (NEW)
 *
 *   Bathroom + wet (5):
 *     6.  bathroom_mirror  — wall-mounted mirror        (existing)
 *    20.  bath             — drop-in bath               (NEW)
 *    21.  shower_glass_panel — shower enclosure          (NEW)
 *    22.  wc_washbasin     — wall-hung basin            (NEW)
 *    23.  towel_rail       — wall-mounted               (NEW)
 *
 *   Utility + outdoor (2):
 *    24.  washing_machine_standalone — utility room     (NEW)
 *    25.  plant            — living / balcony           (NEW)
 *
 * Slice B EXTENSION 2 (2026-05-31) — entries 26..40 broaden coverage across:
 *
 *   Office / study (3):
 *    26.  desk             — workstation, window-wall   (NEW)
 *    27.  office_chair     — desk pair                  (NEW)
 *    28.  filing_cabinet   — office storage             (NEW)
 *
 *   Entry + circulation (2):
 *    29.  coat_rack        — WALL / entrance_hall       (NEW)
 *    30.  entrance_table   — entrance_hall              (NEW)
 *
 *   More bathroom + wet (3):
 *    31.  toilet_radiator  — WALL / bathroom + wc       (NEW)
 *    32.  wc_mirror        — WALL / wc                  (NEW)
 *    33.  utility_sink     — utility wet-fixture        (NEW)
 *
 *   Bed variants (2):
 *    34.  japanese_bed     — low-profile bedroom        (NEW)
 *    35.  nordic_bed       — light-timber bedroom       (NEW)
 *
 *   Plants + outdoor (3):
 *    36.  plant_large      — living + balcony           (NEW)
 *    37.  plant_small      — living + balcony           (NEW)
 *    38.  parametric_tree  — balcony                    (NEW)
 *
 *   Storage variants (2):
 *    39.  bookshelf_glass        — living + office      (NEW)
 *    40.  wardrobe_glass_door    — bedroom + master     (NEW)
 *
 * Mount-class coverage after slice 2: floor (35), wall (5: bathroom_mirror +
 * towel_rail + coat_rack + toilet_radiator + wc_mirror).
 * IFC-entity coverage: IfcFurniture (default), IfcSanitaryTerminal (wet
 * fixtures incl. utility_sink), IfcElectricAppliance (washing machine),
 * IfcLightFixture (lamp).
 *
 * Slice B EXTENSION 3 (2026-05-31) — entries 41..59 broaden coverage to:
 *
 *   Seating variants (4):
 *    41.  chair_cesca_tan             — kitchen + dining beside
 *    42.  chair_textile_wood_arm      — living + dining beside
 *    43.  barcelona_corner_sofa       — living corner-anchored sofa
 *    44.  white_sofa                  — living wall-longest sofa variant
 *
 *   Table variants (4):
 *    45.  table_wood_double_conic     — kitchen + dining centre
 *    46.  table_wood_4leg             — kitchen + dining centre
 *    47.  table_ceramic_curve         — living centre
 *    48.  dining_table_marble_brass   — dining centre
 *
 *   Soft furnishings (3 carpets + 1 curtain):
 *    49.  parametric_chevron_carpet   — living centre
 *    50.  parametric_patchwork_carpet — bedroom + living centre
 *    51.  parametric_stripe_carpet    — living + bedroom centre
 *    52.  curtain_panel               — WALL / many occupancies (wall-window)
 *
 *   Outdoor + plant variants (4):
 *    53.  plant_01                    — living + balcony corner
 *    54.  plant_04                    — living + balcony corner
 *    55.  plant_07                    — living + balcony corner
 *    56.  arbol_t_01                  — balcony corner (parametric tree)
 *
 *   Media + utility + decor (3):
 *    57.  tv                          — WALL / living + master_bedroom
 *    58.  drying_rack                 — utility wall-longest
 *    59.  wall_mirror                 — WALL / bedroom + master_bedroom
 *
 * Mount-class coverage after slice 3: floor (47), wall (12: bathroom_mirror +
 * towel_rail + coat_rack + toilet_radiator + wc_mirror + curtain_panel + tv +
 * wall_mirror — plus the existing 4). IFC-entity coverage gains
 * IfcElectricAppliance / tv (display unit) and broader IfcFurniture/CHAIR +
 * SOFA + TABLE coverage. New categories: `carpets` (3 entries) +
 * `soft-furnishings` (1 entry — curtain_panel).
 */
export function buildCoreFamilySeeds(): RegisteredFamily[] {
    return [
        // ── 1. Bed (double) — floor / bedroom ───────────────────────────────
        {
            identity: {
                id:      'family/core/bed',
                name:    'Bed (double)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'beds',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'bed' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'BED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:bed:1.0.0',
            tags:       ['bed', 'bedroom', 'sleep'],
        },

        // ── 2. Sofa — floor / living ────────────────────────────────────────
        {
            identity: {
                id:      'family/core/sofa',
                name:    'Sofa (3-seat)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'wall-longest', group: 'lounge' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'SOFA',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:sofa:1.0.0',
            tags:       ['sofa', 'living', 'lounge', 'seating'],
        },

        // ── 3. Wardrobe — floor / bedroom ───────────────────────────────────
        {
            identity: {
                id:      'family/core/wardrobe',
                name:    'Wardrobe',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'bedroom-storage' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'NOTDEFINED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:wardrobe:1.0.0',
            tags:       ['wardrobe', 'storage', 'bedroom'],
        },

        // ── 4. Dining table — floor / kitchen+living (multi-occupancy) ──────
        {
            identity: {
                id:      'family/core/dining_table',
                name:    'Dining table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'center', group: 'dining-set' },
                { occupancy: 'living',  anchor: 'center', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:dining_table:1.0.0',
            tags:       ['table', 'dining', 'kitchen', 'living'],
        },

        // ── 5. Kitchen (straight run) — floor / kitchen ────────────────────
        {
            identity: {
                id:      'family/core/kitchen_straight',
                name:    'Kitchen (straight run)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'kitchens',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'wall-longest', group: 'kitchen-run' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'NOTDEFINED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:kitchen_straight:1.0.0',
            tags:       ['kitchen', 'cabinetry', 'wet-zone'],
        },

        // ── 6. Bathroom mirror — WALL / bathroom ────────────────────────────
        // Exercises the wall mount-class so the seed isn't degenerate to floor.
        {
            identity: {
                id:      'family/core/bathroom_mirror',
                name:    'Bathroom mirror',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'mirrors',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bathroom', anchor: 'wall-window', group: 'bath-vanity' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'NOTDEFINED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:bathroom_mirror:1.0.0',
            tags:       ['mirror', 'bathroom', 'wet-zone'],
        },

        // ═══════════════════════════════════════════════════════════════════
        // SLICE B EXTENSION (2026-05-31) — entries 7..25
        // ═══════════════════════════════════════════════════════════════════

        // ── 7. Bedside table — floor / bedroom ─────────────────────────────
        {
            identity: {
                id:      'family/core/bedside_table',
                name:    'Bedside table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'beside', group: 'bed' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:bedside_table:1.0.0',
            tags:       ['bedside', 'table', 'bedroom', 'sleep'],
        },

        // ── 8. Dresser — floor / bedroom ───────────────────────────────────
        {
            identity: {
                id:      'family/core/dresser',
                name:    'Dresser',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'dressing' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:dresser:1.0.0',
            tags:       ['dresser', 'storage', 'bedroom', 'dressing'],
        },

        // ── 9. Vanity table — floor / bedroom ──────────────────────────────
        {
            identity: {
                id:      'family/core/vanity_table',
                name:    'Vanity table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'dressing' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:vanity_table:1.0.0',
            tags:       ['vanity', 'table', 'bedroom', 'dressing'],
        },

        // ── 10. Single bed — floor / bedroom ───────────────────────────────
        {
            identity: {
                id:      'family/core/single_bed',
                name:    'Bed (single)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'beds',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'bed' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'BED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:single_bed:1.0.0',
            tags:       ['bed', 'single', 'bedroom', 'sleep'],
        },

        // ── 11. Bookshelf — floor / bedroom + office ───────────────────────
        // Multi-occupancy: bedroom reading nook + private-office wall.
        {
            identity: {
                id:      'family/core/bookshelf',
                name:    'Bookshelf',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom',        anchor: 'wall-longest' },
                { occupancy: 'private_office', anchor: 'wall-longest' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:bookshelf:1.0.0',
            tags:       ['bookshelf', 'storage', 'bedroom', 'office'],
        },

        // ── 12. Coffee table — floor / living ──────────────────────────────
        {
            identity: {
                id:      'family/core/coffee_table',
                name:    'Coffee table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'center', group: 'lounge' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:coffee_table:1.0.0',
            tags:       ['coffee', 'table', 'living', 'lounge'],
        },

        // ── 13. TV unit — floor / living ───────────────────────────────────
        {
            identity: {
                id:      'family/core/tv_unit',
                name:    'TV unit',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'media',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'wall-longest', group: 'media' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:tv_unit:1.0.0',
            tags:       ['tv', 'media', 'living'],
        },

        // ── 14. Armchair — floor / living ──────────────────────────────────
        {
            identity: {
                id:      'family/core/armchair',
                name:    'Armchair',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'beside', group: 'lounge' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'CHAIR',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:armchair:1.0.0',
            tags:       ['armchair', 'chair', 'living', 'lounge', 'seating'],
        },

        // ── 15. Lamp — floor / living ──────────────────────────────────────
        // First IfcLightFixture entry — drives Pset_LightFixtureTypeCommon.
        {
            identity: {
                id:      'family/core/lamp',
                name:    'Lamp',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'lighting',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'beside', group: 'lounge' },
            ],
            ifcMapping: {
                entityType: 'IfcLightFixture',
                psets:      ['Pset_LightFixtureTypeCommon'],
            },
            schemaHash: 'core:lamp:1.0.0',
            tags:       ['lamp', 'lighting', 'living'],
        },

        // ── 16. Dining chair — floor / kitchen + living ────────────────────
        // Multi-occupancy peer of the dining_table.
        {
            identity: {
                id:      'family/core/dining_chair',
                name:    'Dining chair',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'beside', group: 'dining-set' },
                { occupancy: 'living',  anchor: 'beside', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'CHAIR',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:dining_chair:1.0.0',
            tags:       ['chair', 'dining', 'kitchen', 'living', 'seating'],
        },

        // ── 17. Kitchen (L-shape) — floor / kitchen ────────────────────────
        {
            identity: {
                id:      'family/core/kitchen_l_shape',
                name:    'Kitchen (L-shape)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'kitchens',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'corner', group: 'kitchen-run' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:kitchen_l_shape:1.0.0',
            tags:       ['kitchen', 'cabinetry', 'l-shape', 'wet-zone'],
        },

        // ── 18. Kitchen (U-shape) — floor / kitchen ────────────────────────
        {
            identity: {
                id:      'family/core/kitchen_u_shape',
                name:    'Kitchen (U-shape)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'kitchens',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'wall-longest', group: 'kitchen-run' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:kitchen_u_shape:1.0.0',
            tags:       ['kitchen', 'cabinetry', 'u-shape', 'wet-zone'],
        },

        // ── 19. Kitchen island — floor / kitchen ───────────────────────────
        {
            identity: {
                id:      'family/core/kitchen_island',
                name:    'Kitchen island',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'kitchens',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'center', group: 'kitchen-run' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:kitchen_island:1.0.0',
            tags:       ['kitchen', 'island', 'cabinetry', 'wet-zone'],
        },

        // ── 20. Bath — floor / bathroom ────────────────────────────────────
        // First IfcSanitaryTerminal — drives Pset_SanitaryTerminalTypeCommon.
        {
            identity: {
                id:      'family/core/bath',
                name:    'Bath',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'wet-fixtures',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bathroom', anchor: 'wall-longest', group: 'wet-cluster' },
            ],
            ifcMapping: {
                entityType:     'IfcSanitaryTerminal',
                predefinedType: 'BATH',
                psets:          ['Pset_SanitaryTerminalTypeCommon'],
            },
            schemaHash: 'core:bath:1.0.0',
            tags:       ['bath', 'bathroom', 'wet-fixtures', 'wet-zone'],
        },

        // ── 21. Shower (glass panel) — floor / bathroom ────────────────────
        {
            identity: {
                id:      'family/core/shower_glass_panel',
                name:    'Shower (glass panel)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'wet-fixtures',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bathroom', anchor: 'wall-longest', group: 'wet-cluster' },
            ],
            ifcMapping: {
                entityType:     'IfcSanitaryTerminal',
                predefinedType: 'SHOWER',
                psets:          ['Pset_SanitaryTerminalTypeCommon'],
            },
            schemaHash: 'core:shower_glass_panel:1.0.0',
            tags:       ['shower', 'bathroom', 'wet-fixtures', 'wet-zone'],
        },

        // ── 22. WC washbasin — floor / bathroom + wc ───────────────────────
        // Multi-occupancy: full bathroom AND cloakroom (wc) archetype.
        {
            identity: {
                id:      'family/core/wc_washbasin',
                name:    'WC washbasin',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'wet-fixtures',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bathroom', anchor: 'wall-longest', group: 'wet-cluster' },
                { occupancy: 'wc',       anchor: 'wall-longest', group: 'wet-cluster' },
            ],
            ifcMapping: {
                entityType:     'IfcSanitaryTerminal',
                predefinedType: 'WASHHANDBASIN',
                psets:          ['Pset_SanitaryTerminalTypeCommon'],
            },
            schemaHash: 'core:wc_washbasin:1.0.0',
            tags:       ['washbasin', 'basin', 'bathroom', 'wc', 'wet-fixtures'],
        },

        // ── 23. Towel rail — WALL / bathroom ───────────────────────────────
        // Second wall-mount entry (alongside bathroom_mirror).
        {
            identity: {
                id:      'family/core/towel_rail',
                name:    'Towel rail',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'wet-fixtures',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bathroom', anchor: 'beside', group: 'wet-cluster' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:towel_rail:1.0.0',
            tags:       ['towel-rail', 'bathroom', 'wet-zone'],
        },

        // ── 24. Washing machine (standalone) — floor / utility ─────────────
        // First IfcElectricAppliance — drives Pset_ElectricApplianceTypeCommon.
        {
            identity: {
                id:      'family/core/washing_machine_standalone',
                name:    'Washing machine (standalone)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'appliances',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'utility', anchor: 'wall-longest', group: 'laundry' },
            ],
            ifcMapping: {
                entityType: 'IfcElectricAppliance',
                psets:      ['Pset_ElectricApplianceTypeCommon'],
            },
            schemaHash: 'core:washing_machine_standalone:1.0.0',
            tags:       ['washing-machine', 'appliance', 'utility', 'laundry'],
        },

        // ── 25. Plant — floor / living + balcony ───────────────────────────
        // Multi-occupancy: indoor accent OR outdoor balcony planting.
        {
            identity: {
                id:      'family/core/plant',
                name:    'Plant',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'corner' },
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:plant:1.0.0',
            tags:       ['plant', 'outdoor', 'living', 'balcony', 'decor'],
        },

        // ═══════════════════════════════════════════════════════════════════
        // SLICE B EXTENSION 2 (2026-05-31) — entries 26..40
        // Specialist + variant families: office / entry / wet / bed variants
        // / plant variants / glass storage. Brings total to 40.
        // ═══════════════════════════════════════════════════════════════════

        // ── 26. Desk — floor / private_office (study) ──────────────────────
        // F1.1 study workstation. Multi-occupancy: private_office + study
        // — the rules DB uses both names depending on programme intent.
        {
            identity: {
                id:      'family/core/desk',
                name:    'Desk',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'private_office', anchor: 'wall-window', group: 'desk' },
                { occupancy: 'study',          anchor: 'wall-window', group: 'desk' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'DESK',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:desk:1.0.0',
            tags:       ['desk', 'office', 'study', 'workstation'],
        },

        // ── 27. Office chair — floor / private_office (study) ──────────────
        // F1.1 study workstation pair — sits beside the desk in the 'desk' group.
        {
            identity: {
                id:      'family/core/office_chair',
                name:    'Office chair',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'private_office', anchor: 'beside', group: 'desk' },
                { occupancy: 'study',          anchor: 'beside', group: 'desk' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'CHAIR',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:office_chair:1.0.0',
            tags:       ['chair', 'office', 'study', 'workstation', 'seating'],
        },

        // ── 28. Filing cabinet — floor / private_office (study) ────────────
        // Office storage. Anchors on the longest free wall (yields to the
        // desk's window-wall claim).
        {
            identity: {
                id:      'family/core/filing_cabinet',
                name:    'Filing cabinet',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'private_office', anchor: 'wall-longest' },
                { occupancy: 'study',          anchor: 'wall-longest' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:filing_cabinet:1.0.0',
            tags:       ['filing-cabinet', 'storage', 'office', 'study'],
        },

        // ── 29. Coat rack — WALL / entrance_hall ───────────────────────────
        // F1.4 entry storage primitive. Wall-mounted; third wall-mount entry
        // (alongside bathroom_mirror + towel_rail).
        {
            identity: {
                id:      'family/core/coat_rack',
                name:    'Coat rack',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'entrance_hall', anchor: 'wall-longest', group: 'entry' },
                { occupancy: 'hall',          anchor: 'wall-longest', group: 'entry' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:coat_rack:1.0.0',
            tags:       ['coat-rack', 'storage', 'entrance', 'hall', 'entry'],
        },

        // ── 30. Entrance table — floor / entrance_hall ─────────────────────
        // Hall S2 entry-system landing-zone table; on a wall perpendicular to
        // the front door (caller resolves; archetype hint just declares fit).
        {
            identity: {
                id:      'family/core/entrance_table',
                name:    'Entrance table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'entrance_hall', anchor: 'beside', group: 'entry' },
                { occupancy: 'hall',          anchor: 'beside', group: 'entry' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:entrance_table:1.0.0',
            tags:       ['entrance-table', 'table', 'entrance', 'hall', 'entry'],
        },

        // ── 31. Toilet radiator — WALL / bathroom + wc ─────────────────────
        // Heated towel rail / radiator combo treated as a wet-fixture in the
        // engine (occupies the wet-cluster). Fourth wall-mount entry. Maps
        // to IfcSanitaryTerminal since it lives in the wet-fixture cluster
        // (the heated radiator + towel rail acts as a sanitary appliance).
        {
            identity: {
                id:      'family/core/toilet_radiator',
                name:    'Toilet radiator',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'wet-fixtures',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bathroom', anchor: 'wall-longest', group: 'wet-cluster' },
                { occupancy: 'wc',       anchor: 'wall-longest', group: 'wet-cluster' },
            ],
            ifcMapping: {
                entityType: 'IfcSanitaryTerminal',
                psets:      ['Pset_SanitaryTerminalTypeCommon'],
            },
            schemaHash: 'core:toilet_radiator:1.0.0',
            tags:       ['toilet-radiator', 'radiator', 'bathroom', 'wc', 'wet-fixtures'],
        },

        // ── 32. WC mirror — WALL / wc ──────────────────────────────────────
        // F1.7 compact wall mirror over the wc_washbasin (pairs in 'wc-basin').
        // Fifth wall-mount entry.
        {
            identity: {
                id:      'family/core/wc_mirror',
                name:    'WC mirror',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'mirrors',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'wc', anchor: 'wall-longest', group: 'wc-basin' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:wc_mirror:1.0.0',
            tags:       ['mirror', 'wc', 'cloakroom', 'wet-zone'],
        },

        // ── 33. Utility sink — floor / utility ─────────────────────────────
        // F1.8 utility wet-fixture (laundry sink). Maps to IfcSanitaryTerminal
        // with predefined SINK.
        {
            identity: {
                id:      'family/core/utility_sink',
                name:    'Utility sink',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'wet-fixtures',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'utility', anchor: 'wall-longest', group: 'laundry' },
            ],
            ifcMapping: {
                entityType:     'IfcSanitaryTerminal',
                predefinedType: 'SINK',
                psets:          ['Pset_SanitaryTerminalTypeCommon'],
            },
            schemaHash: 'core:utility_sink:1.0.0',
            tags:       ['sink', 'utility', 'laundry', 'wet-fixtures'],
        },

        // ── 34. Japanese bed — floor / bedroom (low-profile variant) ───────
        // Parametric BedEngine variant — short rails, exposed timber frame.
        {
            identity: {
                id:      'family/core/japanese_bed',
                name:    'Japanese platform bed',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'beds',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'bed' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'BED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:japanese_bed:1.0.0',
            tags:       ['bed', 'japanese', 'low-profile', 'bedroom', 'sleep'],
        },

        // ── 35. Nordic bed — floor / bedroom (light-timber variant) ────────
        // Parametric BedEngine variant — pale oak, slim frame, slatted headboard.
        {
            identity: {
                id:      'family/core/nordic_bed',
                name:    'Nordic bed',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'beds',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'wall-longest', group: 'bed' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'BED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:nordic_bed:1.0.0',
            tags:       ['bed', 'nordic', 'scandi', 'bedroom', 'sleep'],
        },

        // ── 36. Plant (large) — floor / living + balcony ───────────────────
        // Large potted plant variant (statement piece — corner anchor).
        {
            identity: {
                id:      'family/core/plant_large',
                name:    'Plant (large)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'corner' },
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:plant_large:1.0.0',
            tags:       ['plant', 'plant-large', 'outdoor', 'living', 'balcony', 'decor'],
        },

        // ── 37. Plant (small) — floor / living + balcony ───────────────────
        // Small potted plant variant (table-side accent — beside anchor).
        {
            identity: {
                id:      'family/core/plant_small',
                name:    'Plant (small)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'beside' },
                { occupancy: 'balcony', anchor: 'beside' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:plant_small:1.0.0',
            tags:       ['plant', 'plant-small', 'outdoor', 'living', 'balcony', 'decor'],
        },

        // ── 38. Parametric tree — floor / balcony ──────────────────────────
        // F8 parametric tree (Arbol library — outdoor-only).
        {
            identity: {
                id:      'family/core/parametric_tree',
                name:    'Parametric tree',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:parametric_tree:1.0.0',
            tags:       ['tree', 'parametric-tree', 'arbol', 'outdoor', 'balcony', 'decor'],
        },

        // ── 39. Bookshelf (glass-front) — floor / living + private_office ──
        // F1.2 glass-front variant — living-room accent or office display.
        {
            identity: {
                id:      'family/core/bookshelf_glass',
                name:    'Bookshelf (glass-front)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',         anchor: 'wall-longest' },
                { occupancy: 'private_office', anchor: 'wall-longest' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:bookshelf_glass:1.0.0',
            tags:       ['bookshelf', 'bookshelf-glass', 'storage', 'living', 'office'],
        },

        // ── 40. Wardrobe (glass-door) — floor / bedroom + master_bedroom ───
        // Glass-door wardrobe variant — master-bedroom dressing wall preferred.
        {
            identity: {
                id:      'family/core/wardrobe_glass_door',
                name:    'Wardrobe (glass-door)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'storage',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom',        anchor: 'wall-longest', group: 'bedroom-storage' },
                { occupancy: 'master_bedroom', anchor: 'wall-longest', group: 'bedroom-storage' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'NOTDEFINED',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:wardrobe_glass_door:1.0.0',
            tags:       ['wardrobe', 'wardrobe-glass-door', 'storage', 'bedroom', 'master'],
        },

        // ═══════════════════════════════════════════════════════════════════
        // SLICE B EXTENSION 3 (2026-05-31) — entries 41..59
        // Closes the "full 50+ FurnitureType seed" promise. Chair / sofa /
        // table variants, soft furnishings (carpets + curtain), more plant
        // variants, TV wall-mount, drying_rack, wall_mirror. Brings total
        // to 59.
        // ═══════════════════════════════════════════════════════════════════

        // ── 41. Cesca chair (tan) — floor / kitchen + dining ───────────────
        // Marcel Breuer cantilever-frame chair variant. Pairs with the
        // dining-set group (anchor 'beside').
        {
            identity: {
                id:      'family/core/chair_cesca_tan',
                name:    'Cesca chair (tan)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'beside', group: 'dining-set' },
                { occupancy: 'dining',  anchor: 'beside', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'CHAIR',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:chair_cesca_tan:1.0.0',
            tags:       ['chair', 'cesca', 'dining', 'kitchen', 'seating'],
        },

        // ── 42. Textile-wood-arm chair — floor / living + dining ───────────
        // Upholstered armchair with wood arms — versatile dining or living
        // companion seating.
        {
            identity: {
                id:      'family/core/chair_textile_wood_arm',
                name:    'Textile + wood-arm chair',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'beside', group: 'lounge' },
                { occupancy: 'dining', anchor: 'beside', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'CHAIR',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:chair_textile_wood_arm:1.0.0',
            tags:       ['chair', 'armchair', 'textile', 'wood', 'living', 'dining', 'seating'],
        },

        // ── 43. Barcelona corner sofa — floor / living ─────────────────────
        // Mies-van-der-Rohe Barcelona-style corner sofa configuration.
        // Anchors at a corner so the L-shape fits the room geometry.
        {
            identity: {
                id:      'family/core/barcelona_corner_sofa',
                name:    'Barcelona corner sofa',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'corner', group: 'lounge' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'SOFA',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:barcelona_corner_sofa:1.0.0',
            tags:       ['sofa', 'corner-sofa', 'barcelona', 'living', 'lounge', 'seating'],
        },

        // ── 44. White sofa — floor / living ────────────────────────────────
        // Plain three-seat sofa, white upholstery variant — anchors on the
        // longest wall like the canonical sofa entry.
        {
            identity: {
                id:      'family/core/white_sofa',
                name:    'White sofa (3-seat)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'seating',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'wall-longest', group: 'lounge' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'SOFA',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:white_sofa:1.0.0',
            tags:       ['sofa', 'white', 'living', 'lounge', 'seating'],
        },

        // ── 45. Wood double-conic table — floor / kitchen + dining ─────────
        // Pedestal-foot wood dining table variant (double-cone base).
        {
            identity: {
                id:      'family/core/table_wood_double_conic',
                name:    'Wood double-conic table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'center', group: 'dining-set' },
                { occupancy: 'dining',  anchor: 'center', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:table_wood_double_conic:1.0.0',
            tags:       ['table', 'wood', 'pedestal', 'dining', 'kitchen'],
        },

        // ── 46. Wood 4-leg table — floor / kitchen + dining ────────────────
        // Classic four-leg wood dining table variant.
        {
            identity: {
                id:      'family/core/table_wood_4leg',
                name:    'Wood 4-leg table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'kitchen', anchor: 'center', group: 'dining-set' },
                { occupancy: 'dining',  anchor: 'center', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:table_wood_4leg:1.0.0',
            tags:       ['table', 'wood', '4-leg', 'dining', 'kitchen'],
        },

        // ── 47. Ceramic curve table — floor / living ───────────────────────
        // Sculptural coffee-table variant — ceramic shell, curved profile.
        // Anchors at the living-room centre as a sofa companion.
        {
            identity: {
                id:      'family/core/table_ceramic_curve',
                name:    'Ceramic curve table',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'center', group: 'lounge' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:table_ceramic_curve:1.0.0',
            tags:       ['table', 'ceramic', 'curve', 'living', 'lounge'],
        },

        // ── 48. Dining table (marble + brass) — floor / dining ─────────────
        // Statement dining table — marble top, brass base.
        {
            identity: {
                id:      'family/core/dining_table_marble_brass',
                name:    'Dining table (marble + brass)',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'tables',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'dining', anchor: 'center', group: 'dining-set' },
            ],
            ifcMapping: {
                entityType:     'IfcFurniture',
                predefinedType: 'TABLE',
                psets:          ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:dining_table_marble_brass:1.0.0',
            tags:       ['table', 'marble', 'brass', 'dining'],
        },

        // ── 49. Parametric chevron carpet — floor / living ─────────────────
        // First entry under the new `carpets` category. Parametric procedural
        // carpet — chevron weave.
        {
            identity: {
                id:      'family/core/parametric_chevron_carpet',
                name:    'Parametric chevron carpet',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'carpets',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living', anchor: 'center', group: 'lounge' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:parametric_chevron_carpet:1.0.0',
            tags:       ['carpet', 'rug', 'chevron', 'parametric', 'living', 'soft-furnishings'],
        },

        // ── 50. Parametric patchwork carpet — floor / bedroom + living ─────
        // Patchwork-weave variant. Multi-occupancy: lives equally well as a
        // bedroom rug or a living-room accent.
        {
            identity: {
                id:      'family/core/parametric_patchwork_carpet',
                name:    'Parametric patchwork carpet',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'carpets',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom', anchor: 'center', group: 'bed' },
                { occupancy: 'living',  anchor: 'center', group: 'lounge' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:parametric_patchwork_carpet:1.0.0',
            tags:       ['carpet', 'rug', 'patchwork', 'parametric', 'bedroom', 'living', 'soft-furnishings'],
        },

        // ── 51. Parametric stripe carpet — floor / living + bedroom ────────
        // Stripe-weave variant. Multi-occupancy (mirrors patchwork).
        {
            identity: {
                id:      'family/core/parametric_stripe_carpet',
                name:    'Parametric stripe carpet',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'carpets',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'center', group: 'lounge' },
                { occupancy: 'bedroom', anchor: 'center', group: 'bed' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:parametric_stripe_carpet:1.0.0',
            tags:       ['carpet', 'rug', 'stripe', 'parametric', 'living', 'bedroom', 'soft-furnishings'],
        },

        // ── 52. Curtain panel — WALL / many occupancies ────────────────────
        // First `soft-furnishings` category entry. Wall-mounted (hangs from
        // a rod just below the ceiling); spans every occupancy that has an
        // exterior window — bedroom + living + master_bedroom + kitchen +
        // dining + private_office. Sixth wall-mount entry.
        {
            identity: {
                id:      'family/core/curtain_panel',
                name:    'Curtain panel',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'soft-furnishings',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom',        anchor: 'wall-window', group: 'curtains' },
                { occupancy: 'living',         anchor: 'wall-window', group: 'curtains' },
                { occupancy: 'master_bedroom', anchor: 'wall-window', group: 'curtains' },
                { occupancy: 'kitchen',        anchor: 'wall-window', group: 'curtains' },
                { occupancy: 'dining',         anchor: 'wall-window', group: 'curtains' },
                { occupancy: 'private_office', anchor: 'wall-window', group: 'curtains' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:curtain_panel:1.0.0',
            tags:       ['curtain', 'curtain-panel', 'soft-furnishings', 'window'],
        },

        // ── 53. Plant_01 — floor / living + balcony ────────────────────────
        // Arbol plant-library specific variant 01 (corner anchor).
        {
            identity: {
                id:      'family/core/plant_01',
                name:    'Plant 01',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'corner' },
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:plant_01:1.0.0',
            tags:       ['plant', 'plant-01', 'outdoor', 'living', 'balcony', 'decor'],
        },

        // ── 54. Plant_04 — floor / living + balcony ────────────────────────
        {
            identity: {
                id:      'family/core/plant_04',
                name:    'Plant 04',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'corner' },
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:plant_04:1.0.0',
            tags:       ['plant', 'plant-04', 'outdoor', 'living', 'balcony', 'decor'],
        },

        // ── 55. Plant_07 — floor / living + balcony ────────────────────────
        {
            identity: {
                id:      'family/core/plant_07',
                name:    'Plant 07',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',  anchor: 'corner' },
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:plant_07:1.0.0',
            tags:       ['plant', 'plant-07', 'outdoor', 'living', 'balcony', 'decor'],
        },

        // ── 56. Arbol T-01 — floor / balcony ───────────────────────────────
        // First entry from the 25-species Arbol parametric outdoor tree
        // library. Balcony-only (it's a full outdoor tree, not a houseplant).
        {
            identity: {
                id:      'family/core/arbol_t_01',
                name:    'Arbol T-01',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'outdoor',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'balcony', anchor: 'corner' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:arbol_t_01:1.0.0',
            tags:       ['tree', 'arbol', 'arbol-t-01', 'parametric-tree', 'outdoor', 'balcony', 'decor'],
        },

        // ── 57. TV — WALL / living + master_bedroom ────────────────────────
        // Wall-mounted display. Distinct from tv_unit (the floor-standing
        // cabinet); this is the screen itself. Maps to IfcElectricAppliance.
        // Seventh wall-mount entry.
        {
            identity: {
                id:      'family/core/tv',
                name:    'TV',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'media',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'living',         anchor: 'wall-longest', group: 'media' },
                { occupancy: 'master_bedroom', anchor: 'wall-longest', group: 'media' },
            ],
            ifcMapping: {
                entityType: 'IfcElectricAppliance',
                psets:      ['Pset_ElectricApplianceTypeCommon'],
            },
            schemaHash: 'core:tv:1.0.0',
            tags:       ['tv', 'television', 'media', 'living', 'master-bedroom'],
        },

        // ── 58. Drying rack — floor / utility ──────────────────────────────
        // F1.8 utility laundry primitive. Floor-standing rack — pairs with
        // washing_machine_standalone in the 'laundry' group.
        {
            identity: {
                id:      'family/core/drying_rack',
                name:    'Drying rack',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'appliances',
            mountClass: 'floor',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'utility', anchor: 'wall-longest', group: 'laundry' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:drying_rack:1.0.0',
            tags:       ['drying-rack', 'rack', 'utility', 'laundry', 'appliance'],
        },

        // ── 59. Wall mirror — WALL / bedroom + master_bedroom ──────────────
        // F1.10 wall-mirror primitive — bedroom personalisation piece.
        // Eighth wall-mount entry. Distinct from bathroom_mirror (over the
        // vanity, in the wet-zone) and wc_mirror (compact, over the wc-basin).
        {
            identity: {
                id:      'family/core/wall_mirror',
                name:    'Wall mirror',
                version: '1.0.0',
                author:  'PRYZM',
                license: 'MIT',
            },
            category:   'mirrors',
            mountClass: 'wall',
            origin:     'core',
            archetypeHints: [
                { occupancy: 'bedroom',        anchor: 'wall-longest', group: 'bed' },
                { occupancy: 'master_bedroom', anchor: 'wall-longest', group: 'bed' },
            ],
            ifcMapping: {
                entityType: 'IfcFurniture',
                psets:      ['Pset_FurnitureTypeCommon'],
            },
            schemaHash: 'core:wall_mirror:1.0.0',
            tags:       ['mirror', 'wall-mirror', 'bedroom', 'master-bedroom', 'decor'],
        },
    ];
}
