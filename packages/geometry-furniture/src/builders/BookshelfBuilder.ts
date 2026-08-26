// F1.2 (2026-05-30) — Bookshelf builder (open + glass-front variants).
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.2)
//
// Architectural intent:
//   • Cross-room storage (living / study / bedroom / hall).
//   • Default 800 × 350 × 1800 mm (W × D × H) — narrow profile so it
//     anchors on the longest free wall without dominating the room.
//   • Open variant ('bookshelf'): visible shelf reveals — a back panel with
//     evenly spaced horizontal boards.
//   • Glass-front variant ('bookshelf_glass'): the same body with two
//     translucent glass doors covering the front face.
//
// Pattern mirrors WardrobeGlassBuilder (one class handles both variants
// via `data.furnitureType` discrimination) and ships skipInPlan=false
// so the default EdgeProjector path produces the plan symbol — a clean
// rectangle outline reads correctly as bookshelf signage.
//
// §FURN123 (founder, 2026-08-26) — AUDIT found this builder registered
// (FurnitureFactory / FurnitureTypes / FurnitureCategoryMap / seedCoreFamilies)
// but ABSENT from the carousel data (FurnitureCategoryDataA/B) — the L-11382
// unreachable-but-registered pattern — and carrying TWO defects the founder's
// "shelves" ask names directly:
//   1. Shelf count was a HARD-CODED 5 regardless of `height` — a resize
//      STRETCHED the same 5 shelves to fill the new height instead of adding
//      shelves at a constant pitch (violates the §CARPET97/§WARD118
//      discipline; mirrors `wardrobeShelfCount`/`wardrobeShelfYs`).
//   2. One mesh PER PANEL (up to 6 for the open variant, 8 for glass) —
//      against this fleet's one-mesh-per-material-group budget.
// Both are fixed here (parametric count via bookshelfShelfCount/Ys, merged
// via mergedPartKit), and the carousel entries are added in this same lane —
// see FurnitureCategoryDataB.ts 'storage'.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { boxAt, mergePartsToMesh } from './mergedPartKit';

/** 18 mm typical shelf/panel board — shared by the carcass and the shelves. */
const PANEL_THK = 0.018;
/** Typical open-shelf spacing (m) — the constant PITCH a resize preserves. */
const SHELF_PITCH = 0.32;
/** Minimum shelf bay before shelves would read as crowded — caps an explicit
 *  `properties.shelfCount` override, never the derived default. */
const SHELF_PITCH_MIN = 0.22;

/**
 * Internal shelf count for a bookcase CARCASS of `height`: the user's
 * explicit `requested` count (capped to what fits at the minimum pitch) when
 * given, else derived at the constant pitch. §CARPET97/§WARD118 discipline —
 * a resize ADDS shelves, it never stretches a fixed set to fill the new
 * height. Mirrors `wardrobeShelfCount` (WardrobeCabinetTypes.ts).
 */
export function bookshelfShelfCount(height: number, requested?: number): number {
    const usable = height - 2 * PANEL_THK;
    if (!(usable > 0)) return 0;
    const maxFit  = Math.max(0, Math.floor(usable / SHELF_PITCH_MIN + 1e-9) - 1);
    const derived = Math.max(1, Math.round(usable / SHELF_PITCH)) - 1;
    if (requested === undefined || !Number.isFinite(requested)) return Math.min(derived, maxFit);
    return Math.min(Math.max(0, Math.round(requested)), maxFit);
}

/** Y positions (from the carcass base) of `count` internal shelves, evenly
 *  pitched through the usable height between the top and bottom panels. */
export function bookshelfShelfYs(height: number, count: number): number[] {
    const usable  = height - 2 * PANEL_THK;
    const spacing = usable / (count + 1);
    const ys: number[] = [];
    for (let i = 1; i <= count; i++) ys.push(PANEL_THK + i * spacing);
    return ys;
}

/**
 * Board count for a FLOATING-shelf cluster spanning `height`: same
 * constant-pitch discipline as `bookshelfShelfCount`, minus the carcass
 * top/bottom-panel allowance (there is no carcass — every board is its own
 * cantilevered shelf).
 */
export function floatingShelfCount(height: number, requested?: number): number {
    const maxFit  = Math.max(1, Math.floor(height / SHELF_PITCH_MIN + 1e-9));
    const derived = Math.max(1, Math.round(height / SHELF_PITCH));
    if (requested === undefined || !Number.isFinite(requested)) return Math.min(derived, maxFit);
    return Math.min(Math.max(1, Math.round(requested)), maxFit);
}

/** Y positions (board centres, from the floor) of `count` floating boards,
 *  evenly spaced through `height`. A single board centres on the height. */
export function floatingShelfYs(height: number, count: number, boardThk: number): number[] {
    if (count <= 1) return [height / 2];
    const span = Math.max(height - boardThk, 0);
    const ys: number[] = [];
    for (let i = 0; i < count; i++) ys.push(boardThk / 2 + span * (i / (count - 1)));
    return ys;
}

export class BookshelfBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;   // depth into room
        const height = data.height;
        const isGlass = data.furnitureType === 'bookshelf_glass';

        // Frame colour — wood by default, metal fallback.
        let frameColor = 0x8b5a2b;
        if (data.material === 'metal') frameColor = 0x707070;
        if (data.material === 'fabric') frameColor = 0x4a4a4a;
        const frameMat = this.materialService.getMaterial(frameColor, 'standard');

        // ── Shelf count is PARAMETRIC (height-derived, or explicit override
        // via properties.shelfCount) — never a fixed 5 stretched to fit ────
        const rawShelfCount = data.properties?.['shelfCount'];
        const requested = typeof rawShelfCount === 'number' ? rawShelfCount : undefined;
        const shelfCount = bookshelfShelfCount(height, requested);
        const shelfYs = bookshelfShelfYs(height, shelfCount);

        // ── Carcass: two sides + top + bottom + N shelves + back — ONE
        // merged mesh (single material group, §DESK108 budget) ─────────────
        const frame: THREE.BufferGeometry[] = [];
        for (const sx of [-1, 1]) {
            frame.push(boxAt(PANEL_THK, height, length, sx * (width / 2 - PANEL_THK / 2), height / 2, 0));
        }
        const horizW = width - PANEL_THK * 2;
        frame.push(boxAt(horizW, PANEL_THK, length, 0, height - PANEL_THK / 2, 0));  // top
        frame.push(boxAt(horizW, PANEL_THK, length, 0, PANEL_THK / 2, 0));            // bottom
        for (const y of shelfYs) {
            frame.push(boxAt(horizW, PANEL_THK, length, 0, y, 0));                    // internal shelves
        }
        frame.push(boxAt(horizW, height - PANEL_THK * 2, PANEL_THK / 2,
            0, height / 2, -length / 2 + PANEL_THK / 4));                             // back panel
        group.add(mergePartsToMesh(frame, frameMat, 'frame'));

        // ── Glass-front variant: two translucent doors + two handles,
        // each its own merged mesh (distinct material groups) ──────────────
        if (isGlass) {
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0xcfe2e6,
                transparent: true,
                opacity: 0.32,
                roughness: 0.05,
                metalness: 0.1,
            });
            const innerH = height - PANEL_THK * 2;
            const doorW = horizW / 2 - 0.005; // 5 mm reveal between doors
            const doorH = innerH - 0.02;
            const doors: THREE.BufferGeometry[] = [];
            for (const sx of [-1, 1]) {
                doors.push(boxAt(doorW, doorH, PANEL_THK / 2,
                    sx * (doorW / 2 + 0.005), PANEL_THK + doorH / 2 + 0.01, length / 2 - PANEL_THK / 4));
            }
            group.add(mergePartsToMesh(doors, glassMat, 'doors'));

            const handleMat = this.materialService.getMaterial(0x404040, 'standard');
            const handles: THREE.BufferGeometry[] = [];
            for (const sx of [-1, 1]) {
                handles.push(boxAt(0.02, 0.16, 0.02, sx * 0.01, height / 2, length / 2 + 0.01));
            }
            group.add(mergePartsToMesh(handles, handleMat, 'handles'));
        }

        group.userData.role = isGlass ? 'bookshelf_glass' : 'bookshelf';
        group.userData.shelfCount = shelfCount;

        return group;
    }
}

/**
 * §FURN123 (founder, 2026-08-26) — "shelves" (wall-mounted floating shelves).
 * AUDIT found `BookshelfBuilder` (the freestanding bookcase, above) but
 * nothing for cantilevered wall-mounted shelving — genuinely new, added HERE
 * because it shares this file's shelf-count-from-height discipline
 * (`floatingShelfCount`/`floatingShelfYs`, derived above) rather than forking
 * a rival one (C84 EI-9).
 *
 * `shelf_floating` — N thin timber boards, no visible brackets (the "floating"
 * look), stacked through the element's height at the SAME constant-pitch rule
 * as the bookcase: a resize adds/removes boards, it never stretches them.
 * Wall-mounted (`mountClass: 'wall'`): geometry is FLOOR-RELATIVE (group
 * origin = the bottom of the cluster's own local span) exactly like
 * WallArtBuilder/WallMirrorBuilder — the wall-mount height is `data.baseOffset`,
 * applied once by FurnitureFragmentBuilder on the root, never re-added here.
 *
 * ONE merged mesh (every board, same material) — mesh budget 1.
 */
export class FloatingShelfBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width  = data.width;
        const depth  = data.length;
        const height = data.height;
        const BOARD_T = 0.035; // 35 mm floating-shelf board

        let color = 0x8b5a2b;
        if (data.material === 'metal') color = 0x707070;
        if (data.material === 'fabric') color = 0x4a4a4a;
        const mat = this.materialService.getMaterial(color, 'standard');

        const rawCount = data.properties?.['shelfCount'];
        const requested = typeof rawCount === 'number' ? rawCount : undefined;
        const count = floatingShelfCount(height, requested);
        const ys = floatingShelfYs(height, count, BOARD_T);

        const boards = ys.map((y) => boxAt(width, BOARD_T, depth, 0, y, 0));
        group.add(mergePartsToMesh(boards, mat, 'shelves'));

        group.userData.id            = data.id;
        group.userData.elementType   = 'furniture';
        group.userData.furnitureType = data.furnitureType;
        group.userData.width         = width;
        group.userData.length        = depth;
        group.userData.height        = height;
        group.userData.role          = 'shelf_floating';
        group.userData.shelfCount    = count;

        return group;
    }
}
