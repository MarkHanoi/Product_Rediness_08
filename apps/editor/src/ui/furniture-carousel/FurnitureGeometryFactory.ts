/**
 * @file FurnitureGeometryFactory.ts
 *
 * Procedural Three.js geometry factory for the FloatingObjectCarousel.
 * Each call returns a new THREE.Group with simple but recognisable furniture
 * silhouettes, using MeshStandardMaterial for realistic PBR lighting.
 *
 * Architecture rules (contracts enforced):
 *  - Pure geometry / material module — no engine, store, or UI imports.
 *  - No @thatopen/components usage (standalone Three.js only).
 *  - No `any` types.
 *  - Each exported function returns a fresh Group so callers may dispose
 *    independently without affecting other instances.
 *
 * Geometry is intentionally minimal — the goal is iconic recognition,
 * not photorealism.  Models are normalised to ~1.0 unit tall so the
 * carousel layout code can scale them uniformly.
 *
 * Split (WS-B S85-WIRE):
 *   FurnitureGeometryHelpers.ts   — shared PBR materials + primitive helpers
 *   FurnitureGeometryBuildersA.ts — sofas, chairs, basic tables
 *   FurnitureGeometryBuildersB.ts — parametric tables, beds, wardrobes, etc.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureType } from '@pryzm/geometry-furniture';
// §DESK108 (founder, 2026-08-26) — the desk/dining cards are drawn by the SAME
// builders that build the placed element (the §CARPET97 no-drift rule: a card
// hand-copied from its builder eventually drifts; one drawn by it cannot).
import {
    MaterialService,
    ZenDeskBuilder, SkeletonDeskBuilder, VertexDeskBuilder, PanelDeskBuilder,
    ExtendingDiningTableBuilder, RusticDiningSetBuilder,
    ModernDiningSetBuilder, ShellDiningSetBuilder,
    SectionalSofaBuilder,
    LowboardBuilder, SlatConsoleBuilder,
} from '@pryzm/geometry-furniture';
import type { FurnitureData, IFurnitureBuilder } from '@pryzm/geometry-furniture';
import { createToiletGeometry, createShowerGeometry, createAccessoryGeometry } from '@pryzm/geometry-plumbing';
import type { ToiletVariant, ShowerVariant, BathroomAccessoryVariant } from '@pryzm/geometry-plumbing';
import { normalise } from './FurnitureGeometryHelpers';
import {
    buildCornerSofa,
    buildDiningChair,
    buildOakChairSlimThumb,
    buildOakChairThumb,
    buildOakCurvedUphThumb,
    buildThreeLegTerracottaThumb,
    buildThreeLegObejitaBlackThumb,
    buildFourLegObejitaWoodThumb,
    buildBarcelonaBlackThumb,
    buildBarcelonaOttomanThumb,
    buildCescaTanThumb,
    buildBarcelonaSofaThumb,
    buildBarcelonaCornerSofaThumb,
    buildTextileWoodArmchairThumb,
    buildCoffeeTable,
    buildDiningTable,
    buildDesk,
} from './FurnitureGeometryBuildersA';
import {
    buildTableMarbleConeThumb,
    buildTableGlassWoodCylinderThumb,
    buildTableWoodDoubleConicThumb,
    buildTableWoodFourLegThumb,
    buildTableCeramicCurveThumb,
    buildBed,
    buildJapanesePlatformBed,
    buildJapaneseFloatBed,
    buildJapaneseWalnutBed,
    buildNordicBed,
    buildSolidWoodBed,
    buildWardrobe,
    buildFloorLamp,
    buildWallSconce,
    buildBookshelf,
    buildMirror,
    buildPlant,
    buildStraightSofa,
    buildDefaultBox,
    buildChevronCarpetThumb,
    buildPatchworkCarpetThumb,
    buildStripeCarpetThumb,
    buildParametricCarpetThumb,
} from './FurnitureGeometryBuildersB';

// ── Plumbing sentinel helpers ─────────────────────────────────────────────────

/**
 * Parse a plumbing-sentinel `type` string of the form
 * `"plumbing:<family>:<variant>"` into its parts. Returns null when the
 * string is not a plumbing sentinel — caller should fall through to
 * normal furniture handling. See FurnitureCategoryRegistry bathroom
 * items for producers of these sentinels.
 */
function parsePlumbingSentinel(type: string): { family: string; variant: string } | null {
    if (!type.startsWith('plumbing:')) return null;
    const parts = type.split(':');
    if (parts.length !== 3) return null;
    return { family: parts[1], variant: parts[2] };
}

/**
 * Build a thumbnail-sized parametric plumbing fixture by delegating to
 * the LOD400 plumbing geometry factories (Services consolidation —
 * Bathroom inventory contract). Returns null when family/variant is
 * not recognised so the caller can fall back to the default box.
 */
function buildPlumbingThumb(g: THREE.Group, family: string, variant: string): boolean {
    if (family === 'toilet') {
        const built = createToiletGeometry(variant as ToiletVariant);
        while (built.children.length > 0) g.add(built.children[0]);
        return true;
    }
    if (family === 'shower') {
        const built = createShowerGeometry(variant as ShowerVariant);
        while (built.children.length > 0) g.add(built.children[0]);
        return true;
    }
    if (family === 'accessory') {
        const built = createAccessoryGeometry(variant as BathroomAccessoryVariant);
        while (built.children.length > 0) g.add(built.children[0]);
        return true;
    }
    if (family === 'sink' || family === 'bath') {
        const dims: Record<string, [number, number, number]> = {
            sink: [0.65, 0.45, 0.85],
            bath: [0.80, 1.70, 0.55],
        };
        const [w, l, h] = dims[family];
        const mat = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.3 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
        mesh.position.y = h / 2;
        g.add(mesh);
        return true;
    }
    return false;
}

// ── §DESK108 thumbnails — real builders at card scale ────────────────────────

/**
 * ONE shared MaterialService for every §DESK108 thumbnail. Its materials are
 * cached + shared exactly like this module's own PBR materials, and
 * disposeFurnitureGeometry deliberately never disposes materials — so the
 * lifecycle matches the file's existing "materials are shared module-level"
 * contract (and no per-thumb material is ever minted — C100 §2.1).
 */
const DESK108_THUMB_MATERIALS = new MaterialService();

function buildDesk108Thumb(
    g: THREE.Group,
    type: FurnitureType,
    make: (ms: MaterialService) => IFurnitureBuilder,
    w: number, l: number, h: number,
): void {
    const data: FurnitureData = {
        id: `thumb-${type}`, type: 'furniture', furnitureType: type,
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        levelId: 'thumb', levelName: 'thumb', levelElevation: 0, baseOffset: 0,
        width: w, length: l, height: h,
        material: 'wood', properties: {},
    };
    const built = make(DESK108_THUMB_MATERIALS).build(data);
    while (built.children.length > 0) g.add(built.children[0]);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildFurnitureGeometry(
    type: FurnitureType | string,
    _opts?: { fabricHex?: number; frameHex?: number },
): THREE.Group {
    const g = new THREE.Group();
    const sofaHex = _opts?.fabricHex ?? 0xd6cdbd;
    const sofaHexDark = _opts?.fabricHex ?? 0x4a4a4a;

    // ── Plumbing sentinel routing (Services consolidation) ──────────────────
    const sentinel = typeof type === 'string' ? parsePlumbingSentinel(type) : null;
    if (sentinel) {
        if (buildPlumbingThumb(g, sentinel.family, sentinel.variant)) {
            normalise(g);
            return g;
        }
    }

    switch (type as FurnitureType) {
        // ── Sofas ───────────────────────────────────────────────────────────
        case 'corner_sofa':         buildCornerSofa(g, _opts?.fabricHex ?? 0xb8956b); break;
        case 'white_corner_sofa':   buildCornerSofa(g, sofaHex);              break;
        case 'white_sofa_1seat':    buildStraightSofa(g, 1, sofaHex);         break;
        case 'white_sofa_2seat':    buildStraightSofa(g, 2, sofaHex);         break;
        case 'white_sofa_3seat':    buildStraightSofa(g, 3, sofaHex);         break;
        case 'sofa':                buildStraightSofa(g, 2, sofaHexDark);     break;
        case 'sofa_1seat':          buildStraightSofa(g, 1, sofaHexDark);     break;
        case 'sofa_2seat':          buildStraightSofa(g, 2, sofaHexDark);     break;
        case 'sofa_3seat':          buildStraightSofa(g, 3, sofaHexDark);     break;
        // §SOFA113 — the sectional cards are drawn by the element's own builder
        // (§CARPET97 no-drift rule), 3-seat + chaise at card scale. The card is
        // keyed by TYPE, so the 2/4-seat cards share the 3-seat thumbnail.
        case 'sofa_sectional_left':
            buildDesk108Thumb(g, 'sofa_sectional_left',  (ms) => new SectionalSofaBuilder(ms), 2.72, 1.70, 0.78); break;
        case 'sofa_sectional_right':
            buildDesk108Thumb(g, 'sofa_sectional_right', (ms) => new SectionalSofaBuilder(ms), 2.72, 1.70, 0.78); break;

        // ── Chairs ──────────────────────────────────────────────────────────
        case 'chair':                  buildDiningChair(g);                  break;
        case 'dining_chair':           buildDiningChair(g);                  break;
        case 'chair_oak_solid':        buildOakChairThumb(g, 'solid');       break;
        case 'chair_oak_slim':         buildOakChairSlimThumb(g);            break;
        case 'chair_oak_curved_uph':   buildOakCurvedUphThumb(g);            break;
        case 'chair_3leg_terracotta':  buildThreeLegTerracottaThumb(g);      break;
        case 'chair_3leg_obejita_black': buildThreeLegObejitaBlackThumb(g);  break;
        case 'chair_4leg_obejita_wood':  buildFourLegObejitaWoodThumb(g);    break;
        case 'chair_barcelona_black':    buildBarcelonaBlackThumb(g);        break;
        case 'chair_barcelona_ottoman_black': buildBarcelonaOttomanThumb(g);  break;
        case 'chair_cesca_tan':          buildCescaTanThumb(g);               break;
        case 'barcelona_sofa_1seat':  buildBarcelonaSofaThumb(g, 1);          break;
        case 'barcelona_sofa_2seat':  buildBarcelonaSofaThumb(g, 2);          break;
        case 'barcelona_sofa_3seat':  buildBarcelonaSofaThumb(g, 3);          break;
        case 'barcelona_corner_sofa': buildBarcelonaCornerSofaThumb(g);       break;
        case 'chair_textile_wood_arm': buildTextileWoodArmchairThumb(g);     break;

        // ── Tables ──────────────────────────────────────────────────────────
        case 'table':                       buildDiningTable(g);                  break;
        case 'dining_table':                buildDiningTable(g);                  break;
        case 'coffee_table':                buildCoffeeTable(g);                  break;
        case 'entrance_table':              buildDesk(g);                         break;
        case 'bedside_table':               buildCoffeeTable(g);                  break;
        case 'table_marble_cone':           buildTableMarbleConeThumb(g);         break;
        case 'table_glass_wood_cylinder':   buildTableGlassWoodCylinderThumb(g);  break;
        case 'table_wood_double_conic':     buildTableWoodDoubleConicThumb(g);    break;
        case 'table_wood_4leg':             buildTableWoodFourLegThumb(g);        break;
        case 'table_ceramic_curve':         buildTableCeramicCurveThumb(g);       break;

        // ── §DESK108 desks + dining — cards drawn by the element's own builder ──
        case 'desk_zen':      buildDesk108Thumb(g, 'desk_zen', (ms) => new ZenDeskBuilder(ms),      1.8, 0.8, 0.75); break;
        case 'desk_skeleton': buildDesk108Thumb(g, 'desk_skeleton', (ms) => new SkeletonDeskBuilder(ms), 1.6, 0.7, 0.75); break;
        case 'desk_vertex':   buildDesk108Thumb(g, 'desk_vertex', (ms) => new VertexDeskBuilder(ms),   1.7, 0.75, 0.75); break;
        case 'desk_panel':    buildDesk108Thumb(g, 'desk_panel', (ms) => new PanelDeskBuilder(ms),    1.5, 0.7, 0.75); break;
        case 'dining_table_extending':
            buildDesk108Thumb(g, 'dining_table_extending', (ms) => new ExtendingDiningTableBuilder(ms), 1.8, 0.9, 0.76); break;
        case 'dining_set_rustic':
            buildDesk108Thumb(g, 'dining_set_rustic', (ms) => new RusticDiningSetBuilder(ms), 2.0, 1.0, 0.75); break;
        case 'dining_set_modern':
            buildDesk108Thumb(g, 'dining_set_modern', (ms) => new ModernDiningSetBuilder(ms), 2.2, 1.0, 0.75); break;
        case 'dining_set_shell':
            buildDesk108Thumb(g, 'dining_set_shell', (ms) => new ShellDiningSetBuilder(ms), 2.6, 1.1, 0.75); break;

        // ── §TVFURN114 TV & Media — cards drawn by the element's own builders ──
        case 'tv_lowboard':     buildDesk108Thumb(g, 'tv_lowboard',     (ms) => new LowboardBuilder(ms),    2.0, 0.42, 0.55); break;
        case 'tv_lowboard_tv':  buildDesk108Thumb(g, 'tv_lowboard_tv',  (ms) => new LowboardBuilder(ms),    2.0, 0.42, 0.55); break;
        case 'tv_console_slat': buildDesk108Thumb(g, 'tv_console_slat', (ms) => new SlatConsoleBuilder(ms), 1.5, 0.40, 0.45); break;

        // ── Bedroom ─────────────────────────────────────────────────────────
        case 'bed':                    buildBed(g, 1.50);             break;
        case 'japanese_platform_bed':  buildJapanesePlatformBed(g);   break;
        case 'japanese_float_bed':     buildJapaneseFloatBed(g);      break;
        case 'japanese_walnut_bed':    buildJapaneseWalnutBed(g);     break;
        case 'nordic_bed':             buildNordicBed(g);             break;
        case 'solid_wood_bed':         buildSolidWoodBed(g);          break;
        case 'wardrobe':               buildWardrobe(g);              break;
        case 'wardrobe_glass_door':    buildWardrobe(g);              break;
        case 'corner_wardrobe':        buildWardrobe(g);              break;

        // ── Lighting ────────────────────────────────────────────────────────
        case 'lamp':                buildFloorLamp(g);          break;

        // ── Decor ────────────────────────────────────────────────────────────
        case 'chimney':             buildBookshelf(g);          break;
        case 'plant_01':
        case 'plant_02':
        case 'plant_03':
        case 'plant_04':
        case 'plant_05':
        case 'plant_06':
        case 'plant_07':
        case 'plant_08':            buildPlant(g);              break;

        // ── Sanitary ────────────────────────────────────────────────────────
        case 'toilet_radiator':     buildWallSconce(g);         break;
        case 'shower_glass_panel':  buildMirror(g);             break;

        // ── Soft Furnishings (parametric carpets) ───────────────────────────
        case 'parametric_chevron_carpet':   buildChevronCarpetThumb(g);   break;
        case 'parametric_patchwork_carpet': buildPatchworkCarpetThumb(g); break;
        case 'parametric_stripe_carpet':    buildStripeCarpetThumb(g);    break;
        // §CARPET97 (founder, 2026-08-25) — the ten new procedural carpets. All
        // ten route through ONE thumbnail builder that calls the same pattern
        // library the placed rug uses, so a card cannot drift from its rug.
        case 'parametric_staggered_stripe_carpet': buildParametricCarpetThumb(g, 'staggered_stripe'); break;
        case 'parametric_checkerboard_carpet':     buildParametricCarpetThumb(g, 'checkerboard');     break;
        case 'parametric_bordered_jute_carpet':    buildParametricCarpetThumb(g, 'bordered_jute');    break;
        case 'parametric_braided_jute_carpet':     buildParametricCarpetThumb(g, 'braided_jute');     break;
        case 'parametric_colour_block_carpet':     buildParametricCarpetThumb(g, 'colour_block');     break;
        case 'parametric_moons_carpet':            buildParametricCarpetThumb(g, 'moons');            break;
        case 'parametric_round_braided_carpet':    buildParametricCarpetThumb(g, 'round_braided');    break;
        case 'parametric_line_art_carpet':         buildParametricCarpetThumb(g, 'line_art');         break;
        case 'parametric_fine_stripe_carpet':      buildParametricCarpetThumb(g, 'fine_stripe');      break;
        case 'parametric_diamond_trellis_carpet':  buildParametricCarpetThumb(g, 'diamond_trellis');  break;

        // ── Fallback ─────────────────────────────────────────────────────────
        default:                    buildDefaultBox(g);
    }

    normalise(g);
    return g;
}

/** Recursively dispose all BufferGeometries in a Group. */
export function disposeFurnitureGeometry(g: THREE.Group): void {
    g.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.geometry?.dispose();
            // Note: materials are shared module-level — do NOT dispose them here.
        }
    });
}
