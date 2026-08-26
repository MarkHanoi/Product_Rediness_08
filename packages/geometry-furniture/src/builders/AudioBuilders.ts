/**
 * §MEDIA111 (founder, 2026-08-26) — audio-system builders: soundbar + a pair
 * of floor-standing speakers. The founder's Electronics request: *"an AUDIO
 * system (with speakers)"*.
 *
 * Both are LOD 300 in the §DESK108 sense — real member sizes and correct
 * positions, not photoreal drivers — and both honour the §DESK108 mesh
 * discipline: ONE mesh per MATERIAL GROUP via `mergedPartKit`:
 *
 *   soundbar           — 2 meshes (dark body+caps / fabric grille),  48 tris
 *   speaker_floor_pair — 3 meshes (cabinets+plinths / grilles / top trims), 96 tris
 *
 * THE PARAMETRIC RULE (the one the desks, carpets and kitchens follow):
 * resizing scales the LAYOUT, never the MEMBERS.
 *   • soundbar: `data.width` stretches the bar; the 25 mm end caps and the
 *     8 mm grille panel thickness are constant at every width.
 *   • speaker_floor_pair: this is ONE element containing BOTH towers (the
 *     §DESK108 dining-set precedent — chairs built into the set). `data.width`
 *     is the STEREO SPAN: resizing moves the towers apart; the tower stays
 *     220 mm wide with its 8 mm grille and 45 mm plinth at every span. The
 *     plinth outer edges land exactly on ±width/2, so the element's bounding
 *     width IS the requested width.
 *
 * The pair-as-one-element decision: a stereo pair is placed as a unit flanking
 * a TV — one drag, one undo entry, symmetric by construction — exactly the
 * argument that shipped `dining_set_*` as single elements with built-in chairs.
 *
 * Materials are NEVER minted here — MaterialService-cached only (C100 §2.1;
 * the L-11384/L-11421 per-instance-material leak class). Electronics keep an
 * appliance finish at every typology (see FurnitureMaterialIntent — both types
 * read 'plastic-utility' so the typology resolver never restyles them in oak).
 *
 * Deterministic: no randomness; two builds are geometry-identical.
 * Floor-relative: lowest point on y = 0; any wall/furniture mounting height is
 * the payload's `baseOffset`, applied once on the group root by
 * FurnitureFragmentBuilder (the A.21.D15 rule TvBuilder documents).
 */
import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { boxAt, mergePartsToMesh } from './mergedPartKit';

// ── Member sizes (metres) — CONSTANT under resize ────────────────────────────
const CAP_W     = 0.025;  // soundbar end caps
const GRILLE_T  = 0.008;  // fabric grille panel thickness (both builders)
const TOWER_W   = 0.220;  // floor-speaker cabinet width
const PLINTH_H  = 0.045;  // floor-speaker plinth height
const PLINTH_O  = 0.010;  // plinth overhang beyond the cabinet, each side
const TRIM_T    = 0.008;  // brushed top plate on each tower

// ── Part-family colours (MaterialService keys — shared, cached) ──────────────
const COL_BODY   = 0x1b1b1b;  // matte dark housing
const COL_FABRIC = 0x33312e;  // warm-grey acoustic fabric
const COL_TRIM   = 0x8f8f8f;  // brushed-aluminium accent

/** Guard degenerate store values; NOT a resize clamp — defaults per card. */
function dims(data: FurnitureData, minW: number, minL: number, minH: number) {
    return {
        W: Math.max(data.width,  minW),
        L: Math.max(data.length, minL),
        H: Math.max(data.height, minH),
    };
}

/**
 * Soundbar (`soundbar`), default 0.90 × 0.10 × 0.12 m. A low wide bar: dark
 * housing with two slightly-proud end caps, and a full-width acoustic-fabric
 * grille panel across the front face. Card default `baseOffset` 0.50 m sets it
 * on a 0.50 m media unit top; on a wall it goes wherever the user offsets it.
 */
export class SoundbarBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = dims(data, 0.30, 0.06, 0.06);
        const bodyMat   = this.materialService.getMaterial(COL_BODY, 'standard');
        const fabricMat = this.materialService.getMaterial(COL_FABRIC, 'standard');

        // Body + end caps — one dark mesh. Caps are 3 mm proud of the top and
        // 6 mm proud in Z so the bar reads as capped, not extruded; the cap
        // BOTTOM stays on y = 0 (floor-relative rule — nothing dips below).
        group.add(mergePartsToMesh([
            boxAt(W, H, L, 0, H / 2, 0),
            boxAt(CAP_W, H + 0.003, L + 0.006, -(W / 2 - CAP_W / 2), (H + 0.003) / 2, 0),
            boxAt(CAP_W, H + 0.003, L + 0.006,  (W / 2 - CAP_W / 2), (H + 0.003) / 2, 0),
        ], bodyMat, 'body'));

        // Fabric grille — a single front panel between the caps, 8 mm proud.
        group.add(mergePartsToMesh([
            boxAt(W - 2 * CAP_W - 0.004, H - 0.014, GRILLE_T,
                0, H / 2, L / 2 + GRILLE_T / 2 - 0.002),
        ], fabricMat, 'grille'));

        group.userData = { role: 'audio', variant: 'soundbar' };
        return group;
    }
}

/**
 * Floor-standing speaker pair (`speaker_floor_pair`), default
 * 2.40 × 0.32 × 1.05 m. `data.width` is the stereo span: two identical towers
 * whose plinth outer edges land exactly on ±width/2. Each tower: cabinet on a
 * slightly wider plinth, fabric grille over the upper ~⅔ of the front face,
 * brushed top plate.
 */
export class FloorSpeakerPairBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = dims(data, 2 * (TOWER_W + 2 * PLINTH_O), 0.20, 0.60);
        const bodyMat   = this.materialService.getMaterial(COL_BODY, 'standard');
        const fabricMat = this.materialService.getMaterial(COL_FABRIC, 'standard');
        const trimMat   = this.materialService.getMaterial(COL_TRIM, 'standard');

        // Tower centre: plinth outer edge exactly at ±W/2.
        const cx = W / 2 - TOWER_W / 2 - PLINTH_O;
        const cabH = H - PLINTH_H - TRIM_T;

        const cabinets: THREE.BufferGeometry[] = [];
        const grilles:  THREE.BufferGeometry[] = [];
        const trims:    THREE.BufferGeometry[] = [];
        for (const sx of [-1, 1]) {
            const x = sx * cx;
            // Plinth (overhung) + cabinet — the dark casework group.
            cabinets.push(
                boxAt(TOWER_W + 2 * PLINTH_O, PLINTH_H, L + 2 * PLINTH_O, x, PLINTH_H / 2, 0),
                boxAt(TOWER_W, cabH, L, x, PLINTH_H + cabH / 2, 0),
            );
            // Fabric grille — upper ~⅔ of the front face, 8 mm proud.
            const gH = cabH * 0.66;
            grilles.push(
                boxAt(TOWER_W - 0.030, gH, GRILLE_T,
                    x, PLINTH_H + cabH - 0.030 - gH / 2, L / 2 + GRILLE_T / 2 - 0.002),
            );
            // Brushed top plate.
            trims.push(
                boxAt(TOWER_W - 0.020, TRIM_T, L - 0.020, x, H - TRIM_T / 2, 0),
            );
        }
        group.add(mergePartsToMesh(cabinets, bodyMat, 'cabinets'));
        group.add(mergePartsToMesh(grilles,  fabricMat, 'grilles'));
        group.add(mergePartsToMesh(trims,    trimMat, 'trims'));

        group.userData = { role: 'audio', variant: 'speaker_pair' };
        return group;
    }
}
