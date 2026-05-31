// seedCoreFamilies — P0.3 slice B (Family Platform).
//
// Pure function returning the initial `RegisteredFamily[]` synthesised from the
// existing hardcoded element-type universe (the FurnitureType union currently
// driving auto-furnish). The composition root (composeRuntime) walks the
// returned array and calls `familyRegistryStore.register(seed)` for each one.
//
// Slice B scope — kept deliberately small:
//   • 6 representative core families covering 3 mount classes (floor + wall +
//     ceiling) and 4 occupancies (bedroom, living, kitchen, bathroom).
//   • Each entry has `origin: 'core'` (the substrate's tier-1 trust marker).
//   • Each entry carries a stable schema hash keyed off `<origin>:<kind>:<ver>`
//     so a later slice can detect "same id, new version" without re-parsing.
//
// Out of scope (deferred to a later slice):
//   • The full 50+ FurnitureType seed (kitchen islands, fridges, dining
//     tables, chairs, lamps, plants, ...). This slice proves the seed
//     pipeline works end-to-end; expansion is mechanical.
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
 * The 6 entries chosen for slice B:
 *   1. bed           — floor, bedroom            (sleep zone)
 *   2. sofa          — floor, living             (social zone)
 *   3. wardrobe      — floor, bedroom            (storage)
 *   4. dining_table  — floor, kitchen/living     (eat zone — multi-occupancy)
 *   5. kitchen       — floor, kitchen            (wet zone)
 *   6. mirror        — WALL, bathroom            (exercises non-floor mount)
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
    ];
}
