/**
 * @file FurnitureMaterialIntent.ts
 *
 * F8.3 (2026-05-31) — Material-intent labels per `FurnitureType`.
 *
 * The substrate that future material-intelligence layers consume:
 *   • Cognition Layer 4 §3.A — material harmony scoring (multi-room
 *     material-palette consistency).
 *   • Cognition Layer 4 §3.D — typology-driven variant selection
 *     (Nordic typology biases timber-warm toward LIGHT timber;
 *     Mediterranean biases it toward WARM TERRACOTTA + stone; etc.).
 *   • The future material-resolver pass that maps a furniture instance
 *     to a concrete MaterialId based on its intent + the apartment's
 *     declared typology.
 *
 * Today's renderers consume materialId directly from FurnitureMaterialResolver.
 * This file is the SEMANTIC layer above that — "what does this object WANT
 * to look like, materially?" — so the resolver can pick the right concrete
 * material per typology / room program.
 *
 * Design rules (contracts enforced):
 *  - Pure data module — no imports from Three.js, engine, or store layers.
 *  - No `any` types. Closed-world `FurnitureMaterialIntent` enum.
 *  - Lookup table is Readonly<Record<FurnitureType, FurnitureMaterialIntent>>.
 *  - Every FurnitureType MUST appear exactly once — TypeScript's mapped type
 *    enforces exhaustiveness at compile time.
 *  - deriveMaterialIntent() throws explicitly on unknown type — never falls
 *    back silently.
 *
 * Usage:
 *   import { deriveMaterialIntent } from './FurnitureMaterialIntent';
 *   const intent = deriveMaterialIntent(data.furnitureType);
 *   const materialId = resolver.pickFor(intent, typology);
 */

import { FurnitureType } from './FurnitureTypes';

/**
 * Closed-world material-intent enum. Eight categories covering the
 * material vocabulary every domestic interior uses:
 *
 *  - **timber-warm**     — solid wood, stained / oiled. Beds, wardrobes,
 *                          dining tables, bookshelves, dressers. The
 *                          residential default.
 *  - **timber-light**    — pale / unfinished wood. Nordic typology bias;
 *                          desk chairs, study furniture.
 *  - **metal-cool**      — chrome / brushed steel / aluminium. Tripod
 *                          lamps, kitchen rails, tap fittings.
 *  - **metal-warm**      — brass / bronze. Floor-arc lamps, terracotta
 *                          table lamp bases, vintage fittings.
 *  - **fabric-soft**     — upholstery + textile. Sofas, ottomans,
 *                          armchairs, curtain panels, pillows, rugs.
 *  - **ceramic-clean**   — glazed ceramic / porcelain. Wet fixtures
 *                          (bath, washbasin, toilet body).
 *  - **glass-translucent** — clear or frosted glass. Shower panel,
 *                          glass-front bookshelf, mirror panels, wardrobe
 *                          glass door.
 *  - **plastic-utility** — white plastic / appliance finish. Washing
 *                          machine, tumble dryer, fridge body.
 *  - **mixed-kitchen**   — kitchen runs that combine timber carcass +
 *                          stone worktop + metal hardware + ceramic
 *                          appliances. Resolved by the kitchen system-type.
 */
export type FurnitureMaterialIntent =
    | 'timber-warm'
    | 'timber-light'
    | 'metal-cool'
    | 'metal-warm'
    | 'fabric-soft'
    | 'ceramic-clean'
    | 'glass-translucent'
    | 'plastic-utility'
    | 'mixed-kitchen'
    | 'plant-natural'      // foliage / wood-and-leaf reads — indoor plants + outdoor trees
    | 'mixed-unknown';     // ai_element / glb_import — content-defined, can't determine ahead

/** Every material-intent value, stable order — for tests + future
 *  typology-resolver iteration. */
export const FURNITURE_MATERIAL_INTENTS: readonly FurnitureMaterialIntent[] = [
    'timber-warm',
    'timber-light',
    'metal-cool',
    'metal-warm',
    'fabric-soft',
    'ceramic-clean',
    'glass-translucent',
    'plastic-utility',
    'mixed-kitchen',
    'plant-natural',
    'mixed-unknown',
] as const;

/**
 * Exhaustive map of FurnitureType → FurnitureMaterialIntent. TypeScript
 * enforces every FurnitureType value appears exactly once.
 *
 * Where a piece blends materials (e.g. a wooden sofa with fabric
 * upholstery) the intent picks the DOMINANT visual reading. Sofas →
 * fabric-soft (upholstery dominates the silhouette); dining tables →
 * timber-warm (the surface dominates).
 */
export const FURNITURE_TYPE_TO_MATERIAL_INTENT: Readonly<Record<FurnitureType, FurnitureMaterialIntent>> = {
    // ── Sofas & Seating ────────────────────────────────────────────────
    // Sofas read as fabric — the upholstery dominates the silhouette.
    'corner_sofa':                  'fabric-soft',
    'white_corner_sofa':            'fabric-soft',
    'white_sofa_1seat':             'fabric-soft',
    'white_sofa_2seat':             'fabric-soft',
    'white_sofa_3seat':             'fabric-soft',
    'sofa':                         'fabric-soft',
    'sofa_1seat':                   'fabric-soft',
    'sofa_2seat':                   'fabric-soft',
    'sofa_3seat':                   'fabric-soft',
    'barcelona_sofa_1seat':         'fabric-soft',
    'barcelona_sofa_2seat':         'fabric-soft',
    'barcelona_sofa_3seat':         'fabric-soft',
    'barcelona_corner_sofa':        'fabric-soft',

    // ── Chairs ────────────────────────────────────────────────────────
    'chair':                        'timber-warm',
    'dining_chair':                 'timber-warm',
    'chair_oak_solid':              'timber-warm',
    'chair_oak_slim':               'timber-warm',
    'chair_oak_curved_uph':         'fabric-soft',     // upholstered seat reads soft
    'chair_3leg_terracotta':        'timber-warm',
    'chair_3leg_obejita_black':     'timber-warm',
    'chair_4leg_obejita_wood':      'timber-warm',
    'chair_barcelona_black':        'fabric-soft',     // leather upholstery
    'chair_barcelona_ottoman_black':'fabric-soft',
    'chair_cesca_tan':              'fabric-soft',     // cane-back + leather seat reads soft
    'chair_textile_wood_arm':       'fabric-soft',
    'desk_chair':                   'fabric-soft',     // office swivel — mesh/fabric
    'lounge_chair':                 'fabric-soft',     // alias resolves to Barcelona-black

    // ── Tables (extra variants) ───────────────────────────────────────
    'table_wood_double_conic':      'timber-warm',
    'table_wood_4leg':              'timber-warm',
    'table_ceramic_curve':          'ceramic-clean',

    // ── Beds (parametric BedEngine variants) ──────────────────────────
    'japanese_platform_bed':        'timber-warm',
    'japanese_float_bed':           'timber-warm',
    'japanese_walnut_bed':          'timber-warm',
    'nordic_bed':                   'timber-light',     // Nordic typology bias
    'solid_wood_bed':               'timber-warm',

    // ── Parametric kitchen variants (tall worktops + plinths) ─────────
    'kitchen_straight_tall':        'mixed-kitchen',
    'kitchen_l_shape_tall':         'mixed-kitchen',
    'kitchen_u_shape_tall':         'mixed-kitchen',

    // ── Parametric wardrobe layouts ──────────────────────────────────
    'wardrobe_straight':            'timber-warm',
    'wardrobe_l_shape':             'timber-warm',
    'wardrobe_u_shape':             'timber-warm',
    'wardrobe_straight_tall':       'timber-warm',
    'wardrobe_l_shape_tall':        'timber-warm',
    'wardrobe_u_shape_tall':        'timber-warm',

    // ── Plants (indoor potted) ────────────────────────────────────────
    'plant_01':                     'plant-natural',
    'plant_02':                     'plant-natural',
    'plant_03':                     'plant-natural',
    'plant_04':                     'plant-natural',
    'plant_05':                     'plant-natural',
    'plant_06':                     'plant-natural',
    'plant_07':                     'plant-natural',
    'plant_08':                     'plant-natural',

    // ── Outdoor trees (25 species, parametric Arbol library) ─────────
    'arbol_t_01': 'plant-natural', 'arbol_t_02': 'plant-natural',
    'arbol_t_03': 'plant-natural', 'arbol_t_04': 'plant-natural',
    'arbol_t_05': 'plant-natural', 'arbol_t_06': 'plant-natural',
    'arbol_t_07': 'plant-natural', 'arbol_t_08': 'plant-natural',
    'arbol_t_09': 'plant-natural', 'arbol_t_10': 'plant-natural',
    'arbol_t_11': 'plant-natural', 'arbol_t_12': 'plant-natural',
    'arbol_t_13': 'plant-natural', 'arbol_t_14': 'plant-natural',
    'arbol_t_15': 'plant-natural', 'arbol_t_16': 'plant-natural',
    'arbol_t_17': 'plant-natural', 'arbol_t_18': 'plant-natural',
    'arbol_t_19': 'plant-natural', 'arbol_t_20': 'plant-natural',
    'arbol_t_21': 'plant-natural', 'arbol_t_22': 'plant-natural',
    'arbol_t_23': 'plant-natural', 'arbol_t_24': 'plant-natural',
    'arbol_t_25': 'plant-natural',

    // ── AI / GLB imports — content-defined, can't determine ahead ─────
    'ai_element':                   'mixed-unknown',
    'glb_import':                   'mixed-unknown',

    // ── Tables ────────────────────────────────────────────────────────
    'table':                        'timber-warm',
    'table_marble_cone':            'ceramic-clean',   // marble reads as clean stone
    'table_glass_wood_cylinder':    'glass-translucent',
    'dining_table':                 'timber-warm',
    'dining_table_marble_brass':    'ceramic-clean',
    'coffee_table':                 'timber-warm',
    'entrance_table':               'timber-warm',
    'console_table':                'timber-warm',
    'desk':                         'timber-warm',
    'vanity_table':                 'timber-warm',
    'buffet':                       'timber-warm',
    'sideboard':                    'timber-warm',

    // ── Beds + Bedroom ────────────────────────────────────────────────
    'bed':                          'timber-warm',
    'bedside_table':                'timber-warm',
    'dresser':                      'timber-warm',

    // ── Storage ───────────────────────────────────────────────────────
    'wardrobe':                     'timber-warm',
    'wardrobe_glass_door':          'glass-translucent',
    'corner_wardrobe':              'timber-warm',
    'bookshelf':                    'timber-warm',
    'bookshelf_glass':              'glass-translucent',
    'shoe_cabinet':                 'timber-warm',
    'entry_bench':                  'timber-warm',
    'pantry_cabinet':               'timber-warm',
    'coat_rack':                    'metal-cool',

    // ── Bathroom (wet fixtures + accessories) ─────────────────────────
    'shower_glass_panel':           'glass-translucent',
    'toilet_radiator':              'ceramic-clean',
    'vanity_unit':                  'timber-warm',     // cabinet dominates the read
    'bathroom_mirror':              'glass-translucent',
    'towel_rail':                   'metal-cool',
    'bath':                         'ceramic-clean',
    'wc_washbasin':                 'ceramic-clean',
    'wc_mirror':                    'glass-translucent',

    // ── Decor ─────────────────────────────────────────────────────────
    'wall_art':                     'fabric-soft',     // canvas reads soft
    'wall_mirror':                  'glass-translucent',
    'chimney':                      'ceramic-clean',   // stone / brick / tile

    // ── Lighting (free-standing only — pendants/ceiling live in geometry-lighting) ──
    'lamp':                         'metal-warm',      // generic floor / table lamp

    // ── Soft furnishings (parametric carpets) ─────────────────────────
    'parametric_chevron_carpet':    'fabric-soft',
    'parametric_patchwork_carpet':  'fabric-soft',
    'parametric_stripe_carpet':     'fabric-soft',
    'rug':                          'fabric-soft', // §67.1 — auto-furnish rug

    // ── Curtains + window dressing ────────────────────────────────────
    'curtain_rod':                  'metal-cool',
    'curtain_panel':                'fabric-soft',

    // ── Kitchen runs (parametric — own composite material) ────────────
    'kitchen_straight':             'mixed-kitchen',
    'kitchen_l_shape':              'mixed-kitchen',
    'kitchen_u_shape':              'mixed-kitchen',
    'kitchen_island':               'mixed-kitchen',

    // ── Utility (F1.8) — appliance finishes + utility metalwork ───────
    'washing_machine_standalone':   'plastic-utility',
    'tumble_dryer':                 'plastic-utility',
    'utility_cabinet':              'timber-warm',
    'utility_sink':                 'metal-cool',
    'drying_rack':                  'metal-cool',

    // ── Display (F1.3 TV media) ───────────────────────────────────────
    'tv':                           'plastic-utility',
    'tv_unit':                      'timber-warm',

    // ── A.21.D20 (2026-06-06) — kitchen appliances + cabinet modules ──
    // Appliances read as plastic/steel utility finish; cabinet modules as
    // mixed-kitchen (timber carcass + stone worktop + metal hardware).
    'fridge':                       'plastic-utility',
    'oven':                         'metal-cool',
    'hob':                          'metal-cool',
    'dishwasher':                   'plastic-utility',
    'washing_machine':              'plastic-utility',
    'sink':                         'metal-cool',
    'extractor':                    'metal-cool',
    'base_unit':                    'mixed-kitchen',
    'wall_unit':                    'mixed-kitchen',
};

/**
 * Lookup the material intent for a `FurnitureType`. Throws on unknown
 * type — matches the `deriveCategoryFromType` contract (fail explicit,
 * no silent fallback per 07-BIM-SECURITY §7.2).
 */
export function deriveMaterialIntent(type: FurnitureType): FurnitureMaterialIntent {
    const intent = FURNITURE_TYPE_TO_MATERIAL_INTENT[type];
    if (intent === undefined) {
        throw new Error(`[FurnitureMaterialIntent] Unknown FurnitureType: ${type}`);
    }
    return intent;
}
