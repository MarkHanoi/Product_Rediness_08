/**
 * §DESK108 (founder, 2026-08-26) — four LOD 300 working desks, built from the
 * founder's four reference images, on the blessed DeskBuilder template
 * (constructor(materialService), build(data) → THREE.Group, bottom on y = 0,
 * deterministic, MaterialService-cached materials — C100 §2.1).
 *
 * LOD 300 here means real member sizes and correct joinery positions, not a
 * textured box: 40 mm steel tube, 30–35 mm tops, 18–22 mm carcase panels,
 * distinct cached materials per part family. It does NOT mean mesh count —
 * every desk emits ONE mesh per MATERIAL GROUP via `mergedPartKit`
 * (a sled loop is one merged tube geometry, not four boxes):
 *
 *   desk_zen      — 3 meshes (travertine top / black sled / dark pedestal), 120 tris
 *   desk_skeleton — 3 meshes (oak top / black frames / oak shelf),          120 tris
 *   desk_vertex   — 3 meshes (oak waterfall / black frame / oak return),    144 tris
 *   desk_panel    — 2 meshes (oak carcase / dark drawer band),               72 tris
 *
 * THE PARAMETRIC RULE (the one the carpets and kitchens follow): resizing
 * scales the LAYOUT, never the MEMBERS. `data.width/length/height` move leg
 * positions, spans and the worktop plane; the tube stays 40 mm, the top stays
 * 35 mm, the carcase panel stays 18 mm at every size. The tests measure this
 * on built geometry (top-slab thickness and sled tube cross-section are
 * invariant under a 1.5× resize).
 *
 * Plan view: same convention as the existing DeskBuilder — no skipInPlan, the
 * EdgeProjector silhouette (top + supports) reads cleanly as a desk;
 * `edgeAngleDeg: 30` on every mesh (set by mergedPartKit).
 */
import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { boxAt, mergePartsToMesh } from './mergedPartKit';

// ── Member sizes (metres) — CONSTANT under resize ────────────────────────────
const TUBE       = 0.040;  // 40 mm square steel tube (zen sled, skeleton frames)
const TUBE_SIDE  = 0.030;  // 30 mm tube — vertex side-table frame (lighter unit)
const TOP_STONE  = 0.035;  // zen travertine slab
const TOP_OAK    = 0.030;  // skeleton / panel oak tops
const TOP_WFALL  = 0.035;  // vertex waterfall slab + fold panel
const PED_PANEL  = 0.018;  // zen pedestal carcase panel
const CAR_PANEL  = 0.022;  // panel-desk side panels
const SHELF_T    = 0.025;  // skeleton / vertex shelves

// ── Part-family colours (MaterialService keys — shared, cached) ──────────────
const COL_TRAVERTINE = 0xe6ddcc;
const COL_OAK        = 0xb08a5a;
const COL_STEEL      = 0x1f1f1f;
const COL_DARK_WOOD  = 0x4a3626;
const COL_DRAWER     = 0x35281c;

/** Guard degenerate store values; NOT a resize clamp — defaults per card. */
function deskDims(data: FurnitureData): { W: number; L: number; H: number } {
    return {
        W: Math.max(data.width, 0.80),
        L: Math.max(data.length, 0.45),
        H: Math.max(data.height, 0.55),
    };
}

/**
 * Desk 1 — "Zen Working Desk" (`desk_zen`), default 1.8 × 0.8 × 0.75 m.
 * Travertine/cream rectangular top; LEFT support a black steel SLED loop
 * (floor runner + front upright + top rail — deliberately no rear leg, the
 * cantilever read of the reference); RIGHT support a closed dark-wood
 * PEDESTAL whose two shelf bays face the desk END (side-facing). Asymmetric.
 */
export class ZenDeskBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = deskDims(data);
        const stoneMat = this.materialService.getMaterial(COL_TRAVERTINE, 'standard');
        const steelMat = this.materialService.getMaterial(COL_STEEL, 'standard');
        const woodMat  = this.materialService.getMaterial(COL_DARK_WOOD, 'standard');

        // Top slab — travertine, 35 mm.
        group.add(mergePartsToMesh(
            [boxAt(W, TOP_STONE, L, 0, H - TOP_STONE / 2, 0)],
            stoneMat, 'top',
        ));

        // Sled loop — ONE merged tube geometry (runner + upright + top rail).
        const sledX     = -W / 2 + 0.10;
        const runnerLen = L * 0.92;
        const frontZ    = runnerLen / 2 - TUBE / 2;
        const uprightH  = H - TOP_STONE - 2 * TUBE;
        group.add(mergePartsToMesh([
            boxAt(TUBE, TUBE, runnerLen, sledX, TUBE / 2, 0),
            boxAt(TUBE, uprightH, TUBE, sledX, TUBE + uprightH / 2, frontZ),
            boxAt(TUBE, TUBE, runnerLen, sledX, H - TOP_STONE - TUBE / 2, 0),
        ], steelMat, 'sled'));

        // Pedestal — closed carcase, mid shelf, bays OPEN toward +x (the end).
        const PW = 0.42;                    // carcase width — a cabinet member
        const PD = L - 0.06;
        const PH = H - TOP_STONE;
        const px = W / 2 - 0.02 - PW / 2;
        group.add(mergePartsToMesh([
            boxAt(PW, PED_PANEL, PD, px, PH - PED_PANEL / 2, 0),                        // top
            boxAt(PW, PED_PANEL, PD, px, PED_PANEL / 2, 0),                             // bottom
            boxAt(PED_PANEL, PH - 2 * PED_PANEL, PD, px - PW / 2 + PED_PANEL / 2, PH / 2, 0), // closed inner side
            boxAt(PW - PED_PANEL, PH - 2 * PED_PANEL, PED_PANEL, px + PED_PANEL / 2, PH / 2,  (PD - PED_PANEL) / 2), // front
            boxAt(PW - PED_PANEL, PH - 2 * PED_PANEL, PED_PANEL, px + PED_PANEL / 2, PH / 2, -(PD - PED_PANEL) / 2), // back
            boxAt(PW - PED_PANEL, PED_PANEL, PD - 2 * PED_PANEL, px + PED_PANEL / 2, PH / 2, 0), // mid shelf → two bays
        ], woodMat, 'pedestal'));

        group.userData = { role: 'desk', variant: 'zen' };
        return group;
    }
}

/**
 * Desk 2 — "Skeleton Working Desk" (`desk_skeleton`), default 1.6 × 0.7 × 0.75 m.
 * Oak top with a visible 30 mm edge; four black square-tube legs joined as two
 * rectangular SIDE FRAMES (leg + leg + top rail + lower rail each); the RIGHT
 * frame carries an oak LOWER SHELF at ~45% height resting on its lower rail.
 */
export class SkeletonDeskBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = deskDims(data);
        const oakMat   = this.materialService.getMaterial(COL_OAK, 'standard');
        const steelMat = this.materialService.getMaterial(COL_STEEL, 'standard');

        group.add(mergePartsToMesh(
            [boxAt(W, TOP_OAK, L, 0, H - TOP_OAK / 2, 0)],
            oakMat, 'top',
        ));

        const legH    = H - TOP_OAK;
        const frameX  = W / 2 - 0.06 - TUBE / 2;
        const legZ    = L / 2 - 0.04 - TUBE / 2;
        const railLen = 2 * legZ + TUBE;              // outer face to outer face
        const shelfCY = H * 0.45;                     // shelf centre (~half height)
        const lowRailY = shelfCY - SHELF_T / 2 - TUBE / 2;

        const frames: THREE.BufferGeometry[] = [];
        for (const fx of [-frameX, frameX]) {
            for (const lz of [-legZ, legZ]) {
                frames.push(boxAt(TUBE, legH, TUBE, fx, legH / 2, lz));
            }
            frames.push(boxAt(TUBE, TUBE, railLen, fx, legH - TUBE / 2, 0));  // top rail
            frames.push(boxAt(TUBE, TUBE, railLen, fx, lowRailY, 0));          // lower rail
        }
        group.add(mergePartsToMesh(frames, steelMat, 'frame'));

        // Right-hand lower shelf — spans the right frame bay, ~28% of width.
        const shelfW = Math.max(0.30, W * 0.28);
        group.add(mergePartsToMesh(
            [boxAt(shelfW, SHELF_T, railLen, W / 2 - 0.06 - shelfW / 2, shelfCY, 0)],
            oakMat, 'shelf',
        ));

        group.userData = { role: 'desk', variant: 'skeleton' };
        return group;
    }
}

/**
 * Desk 3 — "Vertex Desk" (`desk_vertex`), default 1.7 × 0.75 × 0.75 m.
 * Oak WATERFALL top: the work surface folds into an angled solid panel leg at
 * the RIGHT end (12° lean, foot toward the centre, reaching the floor). The
 * LEFT end is carried by a black-framed SIDE-TABLE unit with its own oak top
 * and lower shelf, 200 mm TALLER than the desk surface — the raised return.
 */
export class VertexDeskBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = deskDims(data);
        const RH = H + 0.20;                  // return height — fixed offset above worktop
        const oakMat   = this.materialService.getMaterial(COL_OAK, 'standard');
        const steelMat = this.materialService.getMaterial(COL_STEEL, 'standard');

        // Waterfall: slab + angled fold panel, merged — one continuous oak read.
        const RTW   = 0.45;                                  // side-table unit width
        const xA    = -W / 2 + RTW - 0.02;                   // slab starts on the unit (20 mm bearing)
        const slabW = W / 2 - xA;
        const theta = 0.21;                                  // ~12° lean, foot inward
        // Length chosen so the panel's LOWEST corner lands exactly on y = 0
        // (a naive (H − t/2)/cosθ sinks the tilted foot ~3.6 mm into the floor).
        const panelLen = (H - (TOP_WFALL / 2) * (1 + Math.sin(theta))) / Math.cos(theta);
        // Fold line: panel top-end centre meets the slab end underside.
        const topEndX = W / 2 - TOP_WFALL / 2;
        const topEndY = H - TOP_WFALL / 2;
        group.add(mergePartsToMesh([
            boxAt(slabW, TOP_WFALL, L, xA + slabW / 2, H - TOP_WFALL / 2, 0),
            boxAt(TOP_WFALL, panelLen, L,
                topEndX - (panelLen / 2) * Math.sin(theta),
                topEndY - (panelLen / 2) * Math.cos(theta),
                0,
                { z: -theta }),
        ], oakMat, 'waterfall'));

        // Side-table black frame — 4 legs + 2 top rails + 2 shelf rails, merged.
        const legH2   = RH - 0.028;
        const shelfCY = RH * 0.42;
        const legXs   = [-W / 2 + TUBE_SIDE / 2 + 0.005, -W / 2 + RTW - TUBE_SIDE / 2 - 0.005];
        const legZ2   = L / 2 - TUBE_SIDE / 2 - 0.01;
        const railLen = 2 * legZ2 + TUBE_SIDE;
        const frame: THREE.BufferGeometry[] = [];
        for (const lx of legXs) {
            for (const lz of [-legZ2, legZ2]) {
                frame.push(boxAt(TUBE_SIDE, legH2, TUBE_SIDE, lx, legH2 / 2, lz));
            }
            frame.push(boxAt(TUBE_SIDE, TUBE_SIDE, railLen, lx, legH2 - TUBE_SIDE / 2, 0));
            frame.push(boxAt(TUBE_SIDE, TUBE_SIDE, railLen, lx, shelfCY - 0.011 - TUBE_SIDE / 2, 0));
        }
        group.add(mergePartsToMesh(frame, steelMat, 'frame'));

        // Return oak — raised top + lower shelf, merged.
        const rx = -W / 2 + RTW / 2;
        group.add(mergePartsToMesh([
            boxAt(RTW, 0.028, L, rx, RH - 0.014, 0),
            boxAt(RTW - 0.02, SHELF_T, L - 0.05, rx, shelfCY, 0),
        ], oakMat, 'return'));

        group.userData = { role: 'desk', variant: 'vertex' };
        return group;
    }
}

/**
 * Desk 4 — the panel desk (`desk_panel`), default 1.5 × 0.7 × 0.75 m.
 * All-panel oak construction (the founder's Revit-style family): two
 * full-height SIDE PANELS as legs, a flush oak top overhanging 30 mm each
 * end, and a recessed dark apron band carrying two drawer fronts (fronts
 * 10 mm proud of the band, both recessed behind the top edge). No steel.
 */
export class PanelDeskBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = deskDims(data);
        const oakMat  = this.materialService.getMaterial(COL_OAK, 'standard');
        const darkMat = this.materialService.getMaterial(COL_DRAWER, 'standard');

        const OV   = 0.03;                       // top overhang past each panel
        const legH = H - TOP_OAK;
        const panelX = W / 2 - OV - CAR_PANEL / 2;
        group.add(mergePartsToMesh([
            boxAt(W, TOP_OAK, L, 0, H - TOP_OAK / 2, 0),
            boxAt(CAR_PANEL, legH, L - 0.02,  panelX, legH / 2, 0),
            boxAt(CAR_PANEL, legH, L - 0.02, -panelX, legH / 2, 0),
        ], oakMat, 'carcass'));

        const IW   = W - 2 * OV - 2 * CAR_PANEL; // clear span between panels
        const bandH = 0.13;
        const bandY = H - TOP_OAK - bandH / 2;
        const drawerW = IW / 2 - 0.015;
        group.add(mergePartsToMesh([
            boxAt(IW, bandH, 0.020, 0, bandY, L / 2 - 0.055),                              // recessed apron
            boxAt(drawerW, bandH - 0.02, 0.018,  (IW / 4 + 0.0075), bandY, L / 2 - 0.045), // drawer front R
            boxAt(drawerW, bandH - 0.02, 0.018, -(IW / 4 + 0.0075), bandY, L / 2 - 0.045), // drawer front L
        ], darkMat, 'drawers'));

        group.userData = { role: 'desk', variant: 'panel' };
        return group;
    }
}
