/**
 * @file SectionalSofaBuilder.ts
 *
 * §SOFA113 (founder, 2026-08-26) — L-shaped SECTIONAL sofa from the founder's
 * sectional reference image: a seat run (2/3/4 seats, parametric) plus a chaise
 * return at one end, loose back + seat cushions with PIPED edges, low metal
 * feet. Built on the EXISTING sofa vocabulary, per the founder's direction
 * ("use the current one since it is sound as a base"):
 *
 *   - The section profile helpers (`roundedBox` / `plumpCushion`) are IMPORTED
 *     from WhiteSofaBuilder — the straight-sofa family — not re-invented
 *     (C84 EI-9: no rival sofa concept, no rival helper set).
 *   - The local frame matches the whole sofa family: origin at the back-left
 *     plinth corner, +X along the run, +Z toward the front, back panel at Z=0.
 *   - Plan view follows Contract 48 §3.4/§3.5: every mesh tags
 *     `skipInPlan = true` + `edgeAngleDeg = 30`, and SofaPlanSymbolBuilder
 *     draws the clean 2D symbol — from THIS file's `sectionalSofaLayout()`,
 *     so the 3D geometry and the plan symbol cannot drift.
 *
 * What is NEW versus the straight/corner sofas is the CONSTRUCTION BUDGET —
 * the §DESK108 pattern (commit 4f1f24f9), not the legacy one-mesh-per-part:
 *
 *   - ONE merged mesh per material group, 4 total (frame / seatCushions /
 *     backCushions / feet), via `mergedPartKit.mergePartsToMesh` — against the
 *     legacy sofas' 12+ meshes each.
 *   - Materials come from the MaterialService CACHE (C100 §2.1 — the
 *     L-11384/L-11421 per-instance-material leak class), never minted here.
 *   - THE PARAMETRIC RULE: resizing scales the LAYOUT, never the MEMBERS.
 *     `data.width/length/height` move module positions and spans; the arm
 *     stays 200 mm, the piping stays 12 mm, the feet stay 80 mm tall at every
 *     size.
 *
 * Vocabulary (registered in FurnitureTypes / FurnitureFactory / CategoryMap /
 * MaterialIntent / SofaPlanSymbolBuilder):
 *
 *   'sofa_sectional_left'   — chaise on the LEFT end  (viewer facing the sofa)
 *   'sofa_sectional_right'  — chaise on the RIGHT end
 *
 * Handedness is a TYPE (the footprint differs; the carousel offers one card
 * per hand); the seat count is a PARAMETER — `data.properties.seatCount`
 * (2 | 3 | 4, default 3), following the §DESK108 `properties.chairCount`
 * precedent for the dining sets.
 *
 * LOD 300 reads, from the reference:
 *   - piped cushion edges: a 12 mm welt tube ring at each seat cushion's top
 *     shoulder and each back cushion's front face — a torus-edge HINT merged
 *     into the cushion mesh, not a fabric sim;
 *   - loose back cushions, one per seat module (chaise module included),
 *     leaning 0.08 rad against the back panel — DISTINCT from the seat
 *     cushions (own mesh role, own count);
 *   - the chaise is a composed RETURN sharing the run's section profile: same
 *     plinth height, same cushion thickness, one module wide, with the end
 *     arm running the chaise's full depth;
 *   - low tapered metal feet (80 mm), 6 of them (7 on a long 4-seat run).
 *
 * Contract (04-BIM §3.8 Builder Layer):
 *   - Pure scene-graph output: returns a THREE.Group, no store / UI access.
 *   - Deterministic + idempotent for identical FurnitureData.
 *   - Reads color & dimensions from data; never mutates the input.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import type { IFurnitureBuilder } from './IFurnitureBuilder';
import { mergePartsToMesh } from './mergedPartKit';
import { roundedBox } from './WhiteSofaBuilder';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Members (metres) — CONSTANT under resize (§DESK108 parametric rule)       */
/* ────────────────────────────────────────────────────────────────────────── */

const LEG_H      = 0.08;   // low metal feet — the reference's visible gap
const PLINTH_H   = 0.15;   // upholstered base frame band
const ARM_W      = 0.20;   // arm panel thickness
const BACK_THK   = 0.15;   // structural back panel depth
const CUSH_T     = 0.17;   // loose seat cushion thickness
const BACK_CUSH_T = 0.20;  // loose back cushion front-to-back depth
const RUN_D      = 0.98;   // straight-run seat depth (chaise depth is layout)
const PIPE_R     = 0.012;  // piping welt radius
const PIPE_INSET = 0.03;   // welt ring inset from the cushion edge
const FOOT_R_TOP = 0.020;  // tapered foot — wider at the frame
const FOOT_R_BOT = 0.015;  //               narrower at the floor
const FOOT_INSET = 0.10;   // foot centre inset from the plinth corner

/** Default fabric when no colour arrives — the generic sofa_* family's
 *  charcoal, so a colourless instance still reads as a real sofa. */
const DEFAULT_FABRIC = 0x4a4a4a;
/** Gunmetal feet — the metal slot (reads as dark steel under the cached
 *  MeshStandardMaterial the whole §DESK108 family uses for steel). */
const FEET_STEEL = 0x2b2b2e;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Layout — the ONE source of truth shared with SofaPlanSymbolBuilder        */
/* ────────────────────────────────────────────────────────────────────────── */

export type SectionalHand = 'left' | 'right';

export interface SectionalSofaLayout {
    hand: SectionalHand;
    /** Seat modules in the run (chaise module included): 2 | 3 | 4. */
    seatCount: number;
    /** Run length along X, arm face to arm face. */
    W: number;
    /** Total chaise depth along Z (the L's long leg). */
    L: number;
    /** Overall height — the back panel tops out exactly here. */
    H: number;
    runD: number;
    armW: number;
    backThk: number;
    legH: number;
    plinthH: number;
    cushT: number;
    /** Width of one seat module: (W − 2·armW) / seatCount. */
    moduleW: number;
    /** CANONICAL (right-hand) chaise inner edge X; feed through mx(). */
    chaiseX0: number;
    /**
     * Mirror map: canonical right-hand X → actual X for this hand.
     * Every part of the sectional is X-symmetric about its own centre, so
     * mirroring part CENTRES (and linework endpoints) is an exact reflection —
     * no negative scale, no flipped normals.
     */
    mx: (x: number) => number;
}

/** Clamp `properties.seatCount` to the supported 2/3/4 run (default 3). */
function resolveSeatCount(data: Pick<FurnitureData, 'properties'>): number {
    const raw = data.properties?.['seatCount'];
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 3;
    return Math.min(4, Math.max(2, n));
}

/**
 * Resolve the sectional's full layout from FurnitureData. Pure — consumed by
 * the 3D builder below AND by SofaPlanSymbolBuilder's 2D symbol, so plan and
 * model are derived from the same arithmetic (the drift the plan builder's
 * PROFILE comment warns about cannot open here).
 */
export function sectionalSofaLayout(
    data: Pick<FurnitureData, 'furnitureType' | 'width' | 'length' | 'height' | 'properties'>,
): SectionalSofaLayout {
    // Cast: written before the union gained the sectional members; harmless
    // after (mirrors the `as FurnitureType` pattern in the §DESK108 tests).
    const hand: SectionalHand =
        (data.furnitureType as string) === 'sofa_sectional_left' ? 'left' : 'right';
    const seatCount = resolveSeatCount(data);

    // Guard degenerate store values; NOT a resize clamp — defaults per card.
    const W = Math.max(data.width  || 2.72, 1.90);
    const L = Math.max(data.length || 1.70, RUN_D + 0.35);
    const H = Math.max(data.height || 0.78, 0.55);

    const moduleW  = (W - 2 * ARM_W) / seatCount;
    const chaiseX0 = ARM_W + moduleW * (seatCount - 1);

    const mx = hand === 'right'
        ? (x: number): number => x
        : (x: number): number => W - x;

    return {
        hand, seatCount, W, L, H,
        runD: RUN_D, armW: ARM_W, backThk: BACK_THK,
        legH: LEG_H, plinthH: PLINTH_H, cushT: CUSH_T,
        moduleW, chaiseX0, mx,
    };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Local geometry helpers                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/** Translate in place and return, so parts read as one-liners. */
function at(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
    g.translate(x, y, z);
    return g;
}

/**
 * EXACT-SIZE rounded box. The family `roundedBox` helper draws its shape at
 * the full w×h and then ADDS the extrude bevel outward, so its output is
 * w+2b × h+2b (depth is already exact) — the legacy sofas quietly overhang
 * their nominal envelope by up to ~9 cm. A BIM element whose geometry is
 * wider than its data.width collides with walls it claims to clear, so the
 * sectional compensates: solve for the bevel the helper WILL choose (damped
 * fixed-point — the bevel depends on the shrunken shape, which depends on
 * the bevel) and pre-shrink the shape so the OUTPUT is exactly w × h × d.
 */
function sizedRoundedBox(w: number, h: number, d: number, r: number, segs: number): THREE.BufferGeometry {
    let b = 0;
    for (let k = 0; k < 12; k++) {
        const radius = Math.min(r, Math.min(w - 2 * b, h - 2 * b, d) * 0.49);
        const target = Math.min(radius * 0.9, d * 0.45);
        b = (b + target) / 2;                    // damped — the raw map oscillates
    }
    return roundedBox(w - 2 * b, h - 2 * b, d, r, segs);
}

/** Exact-size plump cushion — same 30% bevel ratio as the family helper. */
function sizedPlumpCushion(w: number, h: number, d: number): THREE.BufferGeometry {
    const r = Math.min(w, h, d) * 0.30;
    return sizedRoundedBox(w, h, d, r, 5);
}

/**
 * Open-ended welt tube (no caps — both ends die inside the cushion body),
 * non-indexed so it merges with the non-indexed ExtrudeGeometry cushions.
 * `axis` is the tube's long direction.
 */
function pipeTube(len: number, axis: 'x' | 'y' | 'z'): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 8, 1, true).toNonIndexed();
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    else if (axis === 'z') g.rotateX(Math.PI / 2);
    return g;
}

/**
 * Horizontal piping ring on a seat cushion's top shoulder — 4 welt tubes
 * inset from the w×d rectangle at height y, centred on (cx, cz).
 */
function pipeRingXZ(
    w: number, d: number, cx: number, y: number, cz: number,
): THREE.BufferGeometry[] {
    const ix = w / 2 - PIPE_INSET;
    const iz = d / 2 - PIPE_INSET;
    return [
        at(pipeTube(w - 2 * PIPE_INSET, 'x'), cx, y, cz - iz),
        at(pipeTube(w - 2 * PIPE_INSET, 'x'), cx, y, cz + iz),
        at(pipeTube(d - 2 * PIPE_INSET, 'z'), cx - ix, y, cz),
        at(pipeTube(d - 2 * PIPE_INSET, 'z'), cx + ix, y, cz),
    ];
}

/**
 * Vertical piping ring on a back cushion's FRONT face — 4 welt tubes in the
 * local X-Y plane at z-offset `zoff`, for a w×h face. LOCAL space: caller
 * bakes the lean + placement into the returned parts.
 */
function pipeRingXY(w: number, h: number, zoff: number): THREE.BufferGeometry[] {
    const ix = w / 2 - PIPE_INSET;
    const iy = h / 2 - PIPE_INSET;
    return [
        at(pipeTube(w - 2 * PIPE_INSET, 'x'), 0,  iy, zoff),
        at(pipeTube(w - 2 * PIPE_INSET, 'x'), 0, -iy, zoff),
        at(pipeTube(h - 2 * PIPE_INSET, 'y'),  ix, 0, zoff),
        at(pipeTube(h - 2 * PIPE_INSET, 'y'), -ix, 0, zoff),
    ];
}

/** Low tapered metal foot, floor to frame (y = 0 … LEG_H). */
function footAt(x: number, z: number): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(FOOT_R_TOP, FOOT_R_BOT, LEG_H, 10).toNonIndexed();
    g.translate(x, LEG_H / 2, z);
    return g;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Builder                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export class SectionalSofaBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const lay = sectionalSofaLayout(data);
        const { W, L, H, seatCount, moduleW, chaiseX0, mx } = lay;

        // ── Derived spans (layout, not members) ──────────────────────────
        const backH     = H - LEG_H - PLINTH_H;                    // tops at H exactly
        const armH      = (H - LEG_H) * 0.82;                      // arms below back top
        const backCushH = (H - LEG_H - PLINTH_H - CUSH_T) * 0.96;  // below the panel top
        const modCx     = (i: number): number => ARM_W + moduleW * (i + 0.5);

        // ── Materials — ALL from the MaterialService cache (C100 §2.1) ───
        const rawColor = data.color
            ? parseInt(data.color.replace('#', '0x'), 16)
            : DEFAULT_FABRIC;
        // Family convention (WhiteSofa/CornerSofa): cushions a touch lighter
        // than the frame for natural shading depth.
        const cushColor = new THREE.Color(rawColor).multiplyScalar(1.18).getHex();
        const frameMat = this.materialService.getMaterial(rawColor, 'standard');
        const cushMat  = this.materialService.getMaterial(cushColor, 'standard');
        const feetMat  = this.materialService.getMaterial(FEET_STEEL, 'standard');

        // ── FRAME: run plinth + chaise plinth + back panel + both arms ───
        const frameParts: THREE.BufferGeometry[] = [
            // Run plinth — full width, run depth.
            at(sizedRoundedBox(W, PLINTH_H, RUN_D, 0.04, 3),
                mx(W / 2), LEG_H + PLINTH_H / 2, RUN_D / 2),
            // Chaise plinth — the return, one module + arm wide, runD → L.
            at(sizedRoundedBox(W - chaiseX0, PLINTH_H, L - RUN_D, 0.04, 3),
                mx((chaiseX0 + W) / 2), LEG_H + PLINTH_H / 2, (RUN_D + L) / 2),
            // Structural back panel — full width at Z = 0, tops at H.
            at(sizedRoundedBox(W, backH, BACK_THK, 0.04, 3),
                mx(W / 2), LEG_H + PLINTH_H + backH / 2, BACK_THK / 2),
            // Free-end arm — run depth only.
            at(sizedRoundedBox(ARM_W, armH, RUN_D, 0.07, 4),
                mx(ARM_W / 2), LEG_H + armH / 2, RUN_D / 2),
            // Chaise-end arm — runs the FULL chaise depth (the reference read).
            at(sizedRoundedBox(ARM_W, armH, L - 0.02, 0.07, 4),
                mx(W - ARM_W / 2), LEG_H + armH / 2, L / 2),
        ];

        // ── SEAT CUSHIONS: run modules + the long chaise cushion, piped ──
        const seatParts: THREE.BufferGeometry[] = [];
        const seatY  = LEG_H + PLINTH_H + CUSH_T / 2;
        const pipeY  = LEG_H + PLINTH_H + CUSH_T - PIPE_R;
        const seatD  = RUN_D - BACK_THK - 0.04;
        const seatZ  = BACK_THK + (RUN_D - BACK_THK) / 2;
        for (let i = 0; i < seatCount - 1; i++) {
            const w = moduleW * 0.94;
            seatParts.push(at(sizedPlumpCushion(w, CUSH_T, seatD), mx(modCx(i)), seatY, seatZ));
            seatParts.push(...pipeRingXZ(w, seatD, mx(modCx(i)), pipeY, seatZ));
        }
        // Chaise: ONE long cushion sharing the run's section (module width,
        // cushion thickness) — the composed return.
        const chaiseD = L - BACK_THK - 0.06;
        const chaiseZ = BACK_THK + chaiseD / 2;
        const cw = moduleW * 0.94;
        seatParts.push(at(sizedPlumpCushion(cw, CUSH_T, chaiseD), mx(modCx(seatCount - 1)), seatY, chaiseZ));
        seatParts.push(...pipeRingXZ(cw, chaiseD, mx(modCx(seatCount - 1)), pipeY, chaiseZ));

        // ── BACK CUSHIONS: one loose piped cushion per module, leaning ───
        const backParts: THREE.BufferGeometry[] = [];
        const LEAN = -0.08;
        const backY = LEG_H + PLINTH_H + CUSH_T + backCushH / 2;
        const backZ = BACK_THK + BACK_CUSH_T / 2 + 0.02;
        for (let i = 0; i < seatCount; i++) {
            const bw = moduleW * 0.94;
            const local: THREE.BufferGeometry[] = [
                sizedPlumpCushion(bw, backCushH, BACK_CUSH_T),
                ...pipeRingXY(bw, backCushH, BACK_CUSH_T / 2 - PIPE_R),
            ];
            for (const g of local) {
                g.rotateX(LEAN);                       // lean into the back panel
                g.translate(mx(modCx(i)), backY, backZ);
                backParts.push(g);
            }
        }

        // ── FEET: 6 low tapered metal feet (7 on a long 4-seat run) ──────
        const feetParts: THREE.BufferGeometry[] = [
            footAt(mx(FOOT_INSET),            FOOT_INSET),           // rear, free end
            footAt(mx(W - FOOT_INSET),        FOOT_INSET),           // rear, chaise end
            footAt(mx(FOOT_INSET),            RUN_D - FOOT_INSET),   // run front, free end
            footAt(mx(chaiseX0 - FOOT_INSET), RUN_D - FOOT_INSET),   // run front, at the L junction
            footAt(mx(W - FOOT_INSET),        L - FOOT_INSET),       // chaise front, outer
            footAt(mx(chaiseX0 + FOOT_INSET), L - FOOT_INSET),       // chaise front, inner
        ];
        if (chaiseX0 - 2 * FOOT_INSET > 2.0) {
            // 4-seat-class run: a mid-span front foot so the frame never sags.
            feetParts.push(footAt(mx(chaiseX0 / 2), RUN_D - FOOT_INSET));
        }

        // ── Merge — ONE mesh per material group (§DESK108 budget) ────────
        for (const [parts, mat, role] of [
            [frameParts, frameMat, 'frame'],
            [seatParts,  cushMat,  'seatCushions'],
            [backParts,  cushMat,  'backCushions'],
            [feetParts,  feetMat,  'feet'],
        ] as const) {
            const mesh = mergePartsToMesh([...parts], mat, role);
            // Contract 48 §3.4 — SofaPlanSymbolBuilder draws the 2D symbol;
            // the 3D bevel geometry must not wireframe the plan.
            mesh.userData.skipInPlan = true;
            group.add(mesh);
        }

        // ── userData (§27 §3.1 + §DESK108 role/variant convention) ───────
        group.userData.id            = data.id;
        group.userData.elementType   = 'furniture';
        group.userData.furnitureType = data.furnitureType;
        group.userData.width         = W;
        group.userData.length        = L;
        group.userData.height        = H;
        group.userData.role          = 'sofa';
        group.userData.variant       = 'sectional';
        group.userData.hand          = lay.hand;
        group.userData.seatCount     = seatCount;

        return group;
    }
}
