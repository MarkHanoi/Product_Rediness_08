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
