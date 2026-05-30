/**
 * @file FurnitureCategoryMap.ts
 *
 * Phase F1 — Furniture Subcategory Taxonomy Foundation.
 *
 * Authoritative lookup table: FurnitureType → FurnitureCategory.
 *
 * Design rules (contracts enforced):
 *  - Pure data module — no imports from Three.js, engine, or store layers.
 *    (01-BIM §1.1: no cross-layer leakage; this file has zero side effects)
 *  - No `any` types. (03-BIM §1.1)
 *  - deriveCategoryFromType() throws explicitly on unknown type — never falls
 *    back silently. (07-BIM-SECURITY §7.2: "fail explicitly, no silent fallback")
 *  - Lookup table is Readonly<Record<...>> — immutable at type level.
 *  - Every FurnitureType value must appear exactly once. TypeScript's mapped
 *    type Record<FurnitureType, FurnitureCategory> enforces exhaustiveness.
 *
 * Usage:
 *  import { deriveCategoryFromType } from './FurnitureCategoryMap';
 *  const cat = deriveCategoryFromType(data.furnitureType);
 *
 * See docs/furniture/01-FURNITURE-TAXONOMY.md §2 for the full mapping table.
 */

import { FurnitureCategory, FurnitureType } from './FurnitureTypes';

/**
 * Exhaustive, immutable map of every FurnitureType value to its FurnitureCategory.
 * TypeScript enforces that every member of the FurnitureType union is present —
 * missing a type is a compile-time error.
 */
export const FURNITURE_TYPE_TO_CATEGORY: Readonly<Record<FurnitureType, FurnitureCategory>> = {
    // ── Sofas & Seating ────────────────────────────────────────────────────────
    'corner_sofa':          'sofas',
    'white_corner_sofa':    'sofas',
    'white_sofa_1seat':     'sofas',
    'white_sofa_2seat':     'sofas',
    'white_sofa_3seat':     'sofas',
    'sofa':                 'sofas',
    'sofa_1seat':           'sofas',
    'sofa_2seat':           'sofas',
    'sofa_3seat':           'sofas',

    // ── Chairs ────────────────────────────────────────────────────────────────
    'chair':                'chairs',
    'dining_chair':         'chairs',
    'chair_oak_solid':      'chairs',
    'chair_oak_slim':       'chairs',
    'chair_oak_curved_uph': 'chairs',
    'chair_3leg_terracotta': 'chairs',
    'chair_3leg_obejita_black': 'chairs',
    'chair_4leg_obejita_wood': 'chairs',
    'chair_barcelona_black': 'chairs',
    'chair_barcelona_ottoman_black': 'chairs',
    'barcelona_sofa_1seat':  'sofas',
    'barcelona_sofa_2seat':  'sofas',
    'barcelona_sofa_3seat':  'sofas',
    'barcelona_corner_sofa': 'sofas',
    'chair_cesca_tan':       'chairs',
    'chair_textile_wood_arm': 'chairs',
    'desk_chair':            'chairs', // F1.1 — swivel task chair

    // ── Tables ────────────────────────────────────────────────────────────────
    'table':                'tables',
    'dining_table':                  'tables',
    'dining_table_marble_brass':     'tables',
    'coffee_table':         'tables',
    'entrance_table':       'tables',
    'bedside_table':        'tables',
    'desk':                 'tables', // F1.1 — study workstation surface
    'console_table':        'tables', // F1.4 — narrow tall entry console
    'table_marble_cone':    'tables',
    'table_glass_wood_cylinder': 'tables',
    'table_wood_double_conic': 'tables',
    'table_wood_4leg':      'tables',
    'table_ceramic_curve':  'tables',

    // ── Storage (incl. bookshelves) ───────────────────────────────────────────
    'bookshelf':            'storage', // F1.2 — open-shelf bookcase
    'bookshelf_glass':      'storage', // F1.2 — glass-front bookcase
    'tv_unit':              'storage', // F1.3 — low TV / media console
    'shoe_cabinet':         'storage', // F1.4 — entry-zone shoe storage
    'coat_rack':            'storage', // F1.4 — wall coat rack
    'entry_bench':          'storage', // F1.4 — entry sitting bench (often with shoe shelves below)

    // ── Technical (electronics) ───────────────────────────────────────────────
    'tv':                   'technical', // F1.3 — wall-mounted TV panel

    // ── Bedroom Furniture ─────────────────────────────────────────────────────
    'bed':                  'bedroom',
    'wardrobe':             'bedroom',
    'corner_wardrobe':      'bedroom',
    'wardrobe_glass_door':  'bedroom',
    'kitchen_straight':     'kitchen',
    'kitchen_l_shape':      'kitchen',
    'kitchen_u_shape':      'kitchen',
    'kitchen_island':       'kitchen',
    'kitchen_straight_tall':'kitchen',
    'kitchen_l_shape_tall': 'kitchen',
    'kitchen_u_shape_tall': 'kitchen',

    // ── Parametric wardrobe cabinet layouts ───────────────────────────────────
    'wardrobe_straight':       'bedroom',
    'wardrobe_l_shape':        'bedroom',
    'wardrobe_u_shape':        'bedroom',
    'wardrobe_straight_tall':  'bedroom',
    'wardrobe_l_shape_tall':   'bedroom',
    'wardrobe_u_shape_tall':   'bedroom',

    // ── Lighting ──────────────────────────────────────────────────────────────
    'lamp':                 'lighting',

    // ── Decor ─────────────────────────────────────────────────────────────────
    'chimney':              'decor',
    'plant_01':             'decor',
    'plant_02':             'decor',
    'plant_03':             'decor',
    'plant_04':             'decor',
    'plant_05':             'decor',
    'plant_06':             'decor',
    'plant_07':             'decor',
    'plant_08':             'decor',

    // ── Soft Furnishings (parametric) ─────────────────────────────────────────
    'parametric_chevron_carpet': 'decor',
    'parametric_patchwork_carpet': 'decor',
    'parametric_stripe_carpet': 'decor',

    // ── Beds (Japanese parametric collection) ────────────────────────────────
    'japanese_platform_bed': 'beds',
    'japanese_float_bed':    'beds',
    'japanese_walnut_bed':   'beds',
    'nordic_bed':            'beds',
    'solid_wood_bed':        'beds',

    // ── Bathroom ──────────────────────────────────────────────────────────────
    'shower_glass_panel':   'bathroom',
    'toilet_radiator':      'bathroom',
    'vanity_unit':          'bathroom', // F1.5 — countertop + integrated basin + drawers
    'bathroom_mirror':      'bathroom', // F1.5 — wall-mounted mirror over the vanity
    'towel_rail':           'bathroom', // F1.5 — wall-mounted towel rail/heater
    // Bathroom Collection — REMOVED (Services consolidation): sourced from
    // Services/Plumbing via the `"plumbing:<family>:<variant>"` sentinel in
    // FurnitureCategoryRegistry.

    // ── AI Element ────────────────────────────────────────────────────────────
    // ai_element is cross-category: the creating command sets furnitureCategory
    // directly on the element. This lookup is the fallback default only.
    'ai_element':           'sofas',

    // ── GLB Catalog Import ────────────────────────────────────────────────────
    // glb_import items carry the category from the carousel registry descriptor.
    // This entry satisfies the exhaustive Record type; runtime uses descriptor.
    'glb_import':           'sofas',

    // ── Outdoor — Parametric Tree Library (25 species, Arbol T-01..T-25) ─────
    'arbol_t_01': 'outdoor', 'arbol_t_02': 'outdoor', 'arbol_t_03': 'outdoor',
    'arbol_t_04': 'outdoor', 'arbol_t_05': 'outdoor', 'arbol_t_06': 'outdoor',
    'arbol_t_07': 'outdoor', 'arbol_t_08': 'outdoor', 'arbol_t_09': 'outdoor',
    'arbol_t_10': 'outdoor', 'arbol_t_11': 'outdoor', 'arbol_t_12': 'outdoor',
    'arbol_t_13': 'outdoor', 'arbol_t_14': 'outdoor', 'arbol_t_15': 'outdoor',
    'arbol_t_16': 'outdoor', 'arbol_t_17': 'outdoor', 'arbol_t_18': 'outdoor',
    'arbol_t_19': 'outdoor', 'arbol_t_20': 'outdoor', 'arbol_t_21': 'outdoor',
    'arbol_t_22': 'outdoor', 'arbol_t_23': 'outdoor', 'arbol_t_24': 'outdoor',
    'arbol_t_25': 'outdoor',
} as const;

/**
 * Returns the FurnitureCategory for a given FurnitureType.
 *
 * Throws an explicit error if the type is unknown rather than silently
 * falling back — per 07-BIM-SECURITY §7.2 and 01-BIM §7.1 Hard Failure Policy.
 *
 * This function is the single source of truth for type→category resolution.
 * Call this whenever furnitureCategory is absent on a loaded FurnitureData
 * (i.e. data saved before Phase F1 was deployed).
 */
export function deriveCategoryFromType(type: FurnitureType): FurnitureCategory {
    const category = FURNITURE_TYPE_TO_CATEGORY[type];
    if (category === undefined) {
        // Hard failure — 07-BIM-SECURITY §7.2 forbids silent fallbacks.
        // If this throws, add the new FurnitureType to FURNITURE_TYPE_TO_CATEGORY.
        throw new Error(
            `FurnitureCategoryMap: Unknown FurnitureType "${type}". ` +
            `Add it to FURNITURE_TYPE_TO_CATEGORY in FurnitureCategoryMap.ts.`
        );
    }
    return category;
}

/**
 * Resolves the category for a FurnitureData record.
 * If furnitureCategory is already present (new data), returns it directly.
 * If absent (legacy data saved before Phase F1), derives it from the type.
 * This is the correct call site for all consumer code.
 */
export function resolveCategory(
    furnitureType: FurnitureType,
    furnitureCategory: FurnitureCategory | undefined
): FurnitureCategory {
    if (furnitureCategory !== undefined) return furnitureCategory;
    return deriveCategoryFromType(furnitureType);
}
