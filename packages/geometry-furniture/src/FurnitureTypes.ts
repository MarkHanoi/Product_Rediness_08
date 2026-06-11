/**
 * @file FurnitureTypes.ts
 *
 * CHANGE LOG — AI Element Generation Phase 0:
 *  - Added 'ai_element' to FurnitureType union.
 *  - Added optional aiElementConfig?: AIElementConfig to FurnitureData.
 *  - Tightened properties type: Record<string, string|number|boolean|null>
 *    (was Record<string,any> — 03-BIM §1.1 forbids `any`).
 *
 * CHANGE LOG — Furniture Subcategory Taxonomy Phase F1:
 *  - Added FurnitureCategory type (13 subcategories per docs/furniture/01-FURNITURE-TAXONOMY.md).
 *  - Added optional furnitureCategory?: FurnitureCategory to FurnitureData.
 *    Optional for backward compatibility with saved projects — resolved at runtime
 *    via FurnitureCategoryMap.deriveCategoryFromType() when absent.
 *    Compliant with 03-BIM §1.4 (additive-only schema change, no migration required).
 */
import { Point3D, EulerDTO } from '@pryzm/core-app-model';
import { WardrobeConfig } from './WardrobeTypes';
import { AIElementConfig } from './AIElementConfig';
import { KitchenCabinetConfig } from './KitchenTypes';
import { WardrobeCabinetConfig } from './WardrobeCabinetTypes';

/**
 * The 13 furniture subcategories used by the Orbital Carousel and category registry.
 * Mirrors industry-standard furniture catalogues (Kave, IKEA, Arper).
 * Defined here — above FurnitureType — because FurnitureData references it.
 * See docs/furniture/01-FURNITURE-TAXONOMY.md for the full mapping.
 */
export type FurnitureCategory =
    | 'sofas'
    | 'chairs'
    | 'tables'
    | 'beds'
    | 'wardrobes'
    | 'bedroom'
    | 'outdoor'
    | 'decor'
    | 'soft_furnishings'
    | 'lighting'
    | 'kitchen'
    | 'bathroom'
    | 'utility'        // F1.8 (2026-05-30) — utility/laundry primitives: washing_machine_standalone, tumble_dryer, utility_cabinet, utility_sink, drying_rack.
    | 'storage'
    | 'kids'
    | 'teens'
    | 'pets'
    | 'technical';

export type FurnitureType =
    | 'bed'
    | 'chair'
    | 'table'
    | 'table_marble_cone'
    | 'table_glass_wood_cylinder'
    | 'table_wood_double_conic'
    | 'table_wood_4leg'
    | 'table_ceramic_curve'
    | 'chair_oak_solid'
    | 'chair_oak_slim'
    | 'chair_oak_curved_uph'
    | 'chair_3leg_terracotta'
    | 'chair_3leg_obejita_black'
    | 'chair_4leg_obejita_wood'
    | 'chair_barcelona_black'
    | 'chair_barcelona_ottoman_black'
    | 'barcelona_sofa_1seat'
    | 'barcelona_sofa_2seat'
    | 'barcelona_sofa_3seat'
    | 'barcelona_corner_sofa'
    | 'chair_cesca_tan'
    | 'chair_textile_wood_arm'
    | 'bedside_table'
    | 'dining_table'
    | 'dining_table_marble_brass'
    | 'dining_chair'
    | 'corner_sofa'
    | 'white_corner_sofa'
    | 'white_sofa_1seat'
    | 'white_sofa_2seat'
    | 'white_sofa_3seat'
    | 'sofa'
    | 'sofa_1seat'
    | 'sofa_2seat'
    | 'sofa_3seat'
    | 'coffee_table'
    | 'wardrobe'
    | 'wardrobe_glass_door'
    | 'corner_wardrobe'
    | 'shower_glass_panel'
    | 'lamp'
    | 'entrance_table'
    | 'toilet_radiator'
    | 'bath'                              // F1.6' (2026-05-30) — drop-in residential bath, D-FLE furniture-shaped projection of the plumbing fixture
    | 'wc_washbasin'                      // F1.7  (2026-05-30) — wall-hung washbasin for the WC archetype (compact cloakroom-scale, distinct from full vanity_unit)
    | 'wc_mirror'                         // F1.7  (2026-05-30) — small wall-mounted mirror above the wc_washbasin
    // F1.8 (2026-05-30) — Utility / laundry primitives. The S5 activity
    // system. The KitchenApplianceType has kitchen-mounted washing_machine_*
    // variants; these are the STANDALONE utility-room versions.
    | 'washing_machine_standalone'
    | 'tumble_dryer'
    | 'utility_cabinet'
    | 'utility_sink'
    | 'drying_rack'
    | 'chimney'
    // ── F1.1 (2026-05-30) — Study workstation primitives (closes the
    // dining-table-as-desk workaround in `furnishLayout/archetypes.ts`)
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.1) ──────────
    | 'desk'
    | 'desk_chair'
    // ── F1.2 (2026-05-30) — Bookshelf primitives. Cross-room storage
    // — anchors on `wall-longest`, excludes window wall (tall piece blocks
    // daylight). Two variants: open shelves + glass-front.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.2) ──────────
    | 'bookshelf'
    | 'bookshelf_glass'
    // ── F1.3 (2026-05-30) — Media wall primitives. Living-room S1 activity
    // system anchor: wall-mounted TV + low TV unit cabinet beneath.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.3) ──────────
    | 'tv'
    | 'tv_unit'
    // ── F1.4 (2026-05-30) — Entry storage primitives. Hall S2 activity
    // system: shoe cabinet + coat rack + console table (taller/narrower than
    // entrance_table) + entry bench. Anchored on hall walls perpendicular to
    // the front-door swing.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.4) ──────────
    | 'shoe_cabinet'
    | 'coat_rack'
    | 'console_table'
    | 'entry_bench'
    // ── F1.5 (2026-05-30) — Bathroom vanity primitives (furniture-side).
    // The fourth member of the S4 vanity system, `mirror_light`, ships in
    // geometry-lighting (it is a LightingFixtureType, not a FurnitureType
    // — IFC classifies it as a fixture and the plan-symbol/emission goes
    // through the lighting pipeline). Queued separately; the three pieces
    // below ship contract-complete on their own ladder.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.5) ──────────
    | 'vanity_unit'
    | 'bathroom_mirror'
    | 'towel_rail'
    // ── F1.9 (2026-05-30) — Dining-room storage. Buffet (sideboard with
    // drawers + cabinets) + sideboard (lower, longer counter style).
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.9) ──────────
    | 'buffet'
    | 'sideboard'
    // ── F1.10 (2026-05-30) — Wall art + wall mirror. Cross-room
    // personalisation pieces; wall-mounted, optional in living / master /
    // bedroom / dining / hall.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.10) ─────────
    | 'wall_art'
    | 'wall_mirror'
    // ── F1.13 (2026-05-30) — Lounge chair semantic alias. Routes to the
    // existing Barcelona-black builder under the hood (matches the same
    // chunky leather + chrome lounge silhouette); admitted as its own
    // FurnitureType so archetypes can request it semantically rather than
    // by stylistic name.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.13) ─────────
    | 'lounge_chair'
    // ── F1.14 (2026-05-30) — Pantry cabinet. Tall narrow kitchen storage
    // for dry goods. Anchors on a kitchen wall PERPENDICULAR to the kitchen
    // run so the run keeps its own working stretch.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.14) ─────────
    | 'pantry_cabinet'
    // ── F1.12 (2026-05-30) — Bedroom dressing primitives. Dresser (low
    // chest of drawers) + vanity_table (small dressing table with mirror).
    // Anchored on a master/bedroom wall opposite the wardrobe.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.12) ─────────
    | 'dresser'
    | 'vanity_table'
    // ── F1.11 (2026-05-30) — Curtain primitives. Cross-room (every
    // room with an exterior window): curtain_rod + paired curtain_panel.
    // The S7 activity-system precursor (one rod per window, two panels
    // per rod). Wall-mounted at ceiling-adjacent baseOffset.
    // (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.11) ─────────
    | 'curtain_rod'
    | 'curtain_panel'
    | 'plant_01'
    | 'plant_02'
    | 'plant_03'
    | 'plant_04'
    | 'plant_05'
    | 'plant_06'
    | 'plant_07'
    | 'plant_08'
    // ── Soft Furnishings (parametric procedural builders) ─────────────────────
    | 'parametric_chevron_carpet'
    | 'parametric_patchwork_carpet'
    | 'parametric_stripe_carpet'
    // ── Japanese Bed Collection (parametric — BedEngine) ──────────────────────
    | 'japanese_platform_bed'
    | 'japanese_float_bed'
    | 'japanese_walnut_bed'
    | 'nordic_bed'
    | 'solid_wood_bed'
    // ── Bathroom Collection — REMOVED (Services consolidation) ────────────────
    // The 13 `bathroom_*` types previously here were duplicates of the
    // Plumbing system fixtures. They are now sourced from
    // `src/elements/plumbing/` (toilet/sink/bath/shower families) plus the
    // new `accessory` family (washing_machine, toilet_brush, toilet_paper,
    // laundry_bag, iron, ironing_board). The carousel routes through the
    // `"plumbing:<family>:<variant>"` sentinel in FurnitureCategoryRegistry.
    // See docs/01_ELEMENTS/11_Bathroom_Contract/BATHROOM-FILE-INVENTORY.md.
    // ── AI-generated elements ──────────────────────────────────────────────────
    | 'ai_element'
    // ── GLB catalog imports (Kave Home drag-and-drop) ──────────────────────────
    | 'glb_import'
    // ── Parametric kitchen cabinet layouts ─────────────────────────────────────
    | 'kitchen_straight'
    | 'kitchen_l_shape'
    | 'kitchen_u_shape'
    | 'kitchen_island'
    | 'kitchen_straight_tall'
    | 'kitchen_l_shape_tall'
    | 'kitchen_u_shape_tall'
    // ── A.21.D20 (2026-06-06) — first-class kitchen appliances + cabinet
    // modules. The D-FLE kitchen archetype places these IN the worktop run
    // (sink + hob + oven + dishwasher + washing machine, extractor over the
    // hob), honouring the sink↔hob↔fridge work-triangle. `base_unit` /
    // `wall_unit` are the parametric 600 mm cabinet modules the run is
    // composed from. `fridge` already exists above (F-FRIDGE).
    // (SPEC-KITCHEN-WARDROBE-APPLIANCES) ────────────────────────────────────
    | 'fridge'
    | 'oven'
    | 'hob'
    | 'dishwasher'
    | 'washing_machine'
    | 'sink'
    | 'extractor'
    | 'base_unit'
    | 'wall_unit'
    // ── Parametric wardrobe cabinet layouts ────────────────────────────────────
    | 'wardrobe_straight'
    | 'wardrobe_l_shape'
    | 'wardrobe_u_shape'
    | 'wardrobe_straight_tall'
    | 'wardrobe_l_shape_tall'
    | 'wardrobe_u_shape_tall'
    // ── Parametric outdoor tree library — 25 species (Arbol T-01 … T-25) ──────
    | 'arbol_t_01' | 'arbol_t_02' | 'arbol_t_03' | 'arbol_t_04' | 'arbol_t_05'
    | 'arbol_t_06' | 'arbol_t_07' | 'arbol_t_08' | 'arbol_t_09' | 'arbol_t_10'
    | 'arbol_t_11' | 'arbol_t_12' | 'arbol_t_13' | 'arbol_t_14' | 'arbol_t_15'
    | 'arbol_t_16' | 'arbol_t_17' | 'arbol_t_18' | 'arbol_t_19' | 'arbol_t_20'
    | 'arbol_t_21' | 'arbol_t_22' | 'arbol_t_23' | 'arbol_t_24' | 'arbol_t_25';

export type FurnitureMaterial =
    | 'wood'
    | 'metal'
    | 'fabric'
    | 'glass'
    // §63.1 / bedroom-mirror (2026-06-11) — reflective mirror finish. Routed by
    // furnishLayout/styleFinish.ts for the mirror kinds (wall_mirror,
    // bathroom_mirror, wc_mirror); the mirror builders render the glass plane as a
    // high-metalness / low-roughness polished surface that reads as a mirror.
    | 'mirror';

export interface FurnitureData {
    id: string;
    type: 'furniture';
    furnitureType: FurnitureType;

    // Transform — plain DTO, no THREE class instances in store (P0.5 DTO Migration §01 §3.4 v2.0).
    // Builder layer reconstructs THREE.Vector3/Euler at projection time.
    position: Point3D;
    rotation: EulerDTO;

    // Level info
    levelId: string;
    levelName: string;
    levelElevation: number;
    baseOffset: number;

    // Generic dimensions (used by most furniture and by ai_element bounding-box)
    width: number;
    length: number;
    height: number;

    // Corner Sofa Specific
    widthMain?: number;
    lengthSide?: number;
    seatDepthMain?: number;
    seatDepthSide?: number;

    // Wardrobe Specific — plain DTO (P0.5 DTO Migration)
    startPoint?: Point3D;
    cornerPoint?: Point3D;
    endPoint?: Point3D;

    lo3?: number;
    widthBranchTwo?: number;
    lengthBranchTwo?: number;

    // Appearance
    material: FurnitureMaterial;
    color?: string;
    hasHeadboard?: boolean;

    // §03 §1.7: Element mark — pattern FU-FF-NNN (e.g., "FU-FF-001").
    // Optional for backward compatibility with snapshots saved before the
    // mark contract; new instances always receive one in CreateFurnitureCommand.
    mark?: string;

    // §28: Spatial relationship — IfcRelContainedInSpatialStructure round-trip.
    // The IFC space (room / zone) that hosts this furniture, when known.
    hostedSpaceId?: string;

    // Extra dynamic properties — no `any` (03-BIM §1.1)
    properties: Record<string, string | number | boolean | null>;
    wardrobeConfig?: WardrobeConfig;

    // ── Kitchen Cabinet Configuration (Phase KC) ───────────────────────────────
    /**
     * Present when furnitureType is one of the kitchen_* types.
     * Pure JSON DTO — survives structuredClone for command snapshots (§3.4).
     */
    kitchenConfig?: KitchenCabinetConfig;

    // ── Wardrobe Cabinet Configuration (Phase WC) ──────────────────────────────
    /**
     * Present when furnitureType is one of the wardrobe_straight / wardrobe_l_shape /
     * wardrobe_u_shape types.  Pure JSON DTO — survives structuredClone (§3.4).
     */
    wardrobeCabinetConfig?: WardrobeCabinetConfig;

    // ── AI Element Configuration ───────────────────────────────────────────────
    /**
     * Present when furnitureType === 'ai_element'.
     * Pure JSON — survives structuredClone for command snapshots (04-BIM §5.1).
     * Validated by AIElementValidator before CreateAIElementCommand.execute().
     */
    aiElementConfig?: AIElementConfig;

    // ── Subcategory Classification (Phase F1) ──────────────────────────────────
    /**
     * The Orbital Carousel subcategory this furniture item belongs to.
     * Optional for backward compatibility: existing saved data without this field
     * is resolved at runtime via FurnitureCategoryMap.deriveCategoryFromType().
     * Compliant with 03-BIM §1.4 — additive-only, no migration required.
     */
    furnitureCategory?: FurnitureCategory;
}