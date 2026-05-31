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
 * Mount-class coverage: floor (23), wall (2: bathroom_mirror + towel_rail).
 * IFC-entity coverage: IfcFurniture (default), IfcSanitaryTerminal (wet
 * fixtures), IfcElectricAppliance (washing machine), IfcLightFixture (lamp).
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
    ];
}
