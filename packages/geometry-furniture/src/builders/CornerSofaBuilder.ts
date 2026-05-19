/**
 * @file CornerSofaBuilder.ts
 *
 * CornerSofaBuilder — L-shaped corner sofa.
 *
 * Realism revision (image-reference fidelity):
 *   - All upholstered volumes use roundedBox / plumpCushion for soft, organic edges.
 *   - Plump seat & back cushions with bull-nose front cap and piping stripe.
 *   - Arms built from a rounded body + horizontal capsule roll on top.
 *   - Frame (bases, arms, backs) uses MeshPhysicalMaterial with clearcoat.
 *   - Cushions use MeshPhysicalMaterial with sheen for a fabric appearance.
 *   - Slim dark feet inset under the L-shape corners.
 *
 * Contract (04-BIM §3.8 Builder Layer):
 *   - Pure scene-graph output: returns a THREE.Group, no store / UI access.
 *   - Idempotent for identical FurnitureData.
 *   - Reads color & dimensions from data; never mutates the input.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import type { IFurnitureBuilder } from './IFurnitureBuilder';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Geometry helpers                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Box with all 12 edges rounded — ExtrudeGeometry of a rounded-rectangle
 * shape with matching bevels.  Geometry is centred at origin.
 */
function roundedBox(w: number, h: number, d: number, r: number, segs: number): THREE.BufferGeometry {
    const radius = Math.min(r, Math.min(w, h, d) * 0.49);
    const shape  = new THREE.Shape();
    const wH = w / 2, hH = h / 2;
    shape.moveTo(-wH + radius, -hH);
    shape.lineTo( wH - radius, -hH);
    shape.quadraticCurveTo( wH, -hH,  wH, -hH + radius);
    shape.lineTo( wH,  hH - radius);
    shape.quadraticCurveTo( wH,  hH,  wH - radius,  hH);
    shape.lineTo(-wH + radius,  hH);
    shape.quadraticCurveTo(-wH,  hH, -wH,  hH - radius);
    shape.lineTo(-wH, -hH + radius);
    shape.quadraticCurveTo(-wH, -hH, -wH + radius, -hH);

    const bevel = Math.min(radius * 0.9, d * 0.45);
    const geo   = new THREE.ExtrudeGeometry(shape, {
        depth:          Math.max(d - bevel * 2, 0.001),
        bevelEnabled:   true,
        bevelSegments:  segs,
        bevelSize:      bevel,
        bevelThickness: bevel,
        curveSegments:  segs * 2,
    });
    geo.translate(0, 0, -(d / 2 - bevel));
    geo.computeVertexNormals();
    return geo;
}

/** Puffier cushion — larger relative bevel gives a plump, filled look. */
function plumpCushion(w: number, h: number, d: number): THREE.BufferGeometry {
    const r = Math.min(w, h, d) * 0.30;
    return roundedBox(w, h, d, r, 5);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Builder                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export class CornerSofaBuilder implements IFurnitureBuilder {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        // ── Dimensions ────────────────────────────────────────────────────
        const widthMain   = data.width  ?? 3.0;
        const lengthSide  = data.length ?? 2.0;
        const height      = data.height ?? 1.0;

        // Seat depths
        const seatDepthMain = data.seatDepthMain ?? 0.90;
        const seatDepthSide = data.seatDepthSide ?? 0.90;

        // Structural proportions
        const legH          = 0.12;
        const plinthH       = 0.20;            // visible base frame
        const armW          = 0.18;            // arm panel thickness
        const backThk       = 0.14;            // back panel depth
        const cushThk       = 0.20;            // seat cushion height
        const backCushThk   = 0.22;            // back cushion front-to-back depth
        const backCushH     = height * 0.46;   // back cushion height

        // ── Materials ─────────────────────────────────────────────────────
        const defaultColor = data.furnitureType === 'white_corner_sofa'
            ? 0xe8e2d5   // cream / off-white upholstery for the white variant
            : 0x7a5c3e;  // brown leather for the standard corner sofa
        const rawColor = data.color
            ? parseInt(data.color.replace('#', '0x'), 16)
            : defaultColor;

        const frameMat = new THREE.MeshPhysicalMaterial({
            color:              rawColor,
            roughness:          0.72,
            metalness:          0.02,
            clearcoat:          0.20,
            clearcoatRoughness: 0.60,
        });

        // Cushions — slightly lighter than the frame for natural shading depth
        const cushC = new THREE.Color(rawColor).multiplyScalar(1.18).getHex();
        const cushionMat = new THREE.MeshPhysicalMaterial({
            color:          cushC,
            roughness:      0.88,
            metalness:      0.0,
            sheen:          0.9,
            sheenColor:     new THREE.Color(cushC).multiplyScalar(1.08),
            sheenRoughness: 0.55,
        });

        const legMat = new THREE.MeshPhysicalMaterial({
            color:     0x1a1008,
            roughness: 0.50,
            metalness: 0.15,
        });

        // ── Base plinth — main run ─────────────────────────────────────────
        // Per Contract 48 §3.4: structural shells are skipped in plan view
        // because SofaPlanSymbolBuilder injects a clean 2D symbol instead.
        // edgeAngleDeg = 30 collapses the rounded-box bevels to a clean
        // silhouette in elevation projections (Contract 48 §3.5).
        const plinthMainGeo = roundedBox(widthMain, plinthH, seatDepthMain, 0.05, 3);
        plinthMainGeo.translate(widthMain / 2, legH + plinthH / 2, seatDepthMain / 2);
        const plinthMainMesh = new THREE.Mesh(plinthMainGeo, frameMat);
        plinthMainMesh.userData.skipInPlan = true;
        plinthMainMesh.userData.edgeAngleDeg = 30;
        group.add(plinthMainMesh);

        // ── Base plinth — side run ─────────────────────────────────────────
        const plinthSideGeo = roundedBox(seatDepthSide, plinthH, lengthSide, 0.05, 3);
        plinthSideGeo.translate(seatDepthSide / 2, legH + plinthH / 2, lengthSide / 2);
        const plinthSideMesh = new THREE.Mesh(plinthSideGeo, frameMat);
        plinthSideMesh.userData.skipInPlan = true;
        plinthSideMesh.userData.edgeAngleDeg = 30;
        group.add(plinthSideMesh);

        // ── Structural back — main (along +X, at Z = 0) ──────────────────
        const backH       = height - legH - plinthH;
        const backMainGeo = roundedBox(widthMain, backH, backThk, 0.05, 3);
        backMainGeo.translate(widthMain / 2, legH + plinthH + backH / 2, backThk / 2);
        const backMainMesh = new THREE.Mesh(backMainGeo, frameMat);
        backMainMesh.userData.skipInPlan = true;
        backMainMesh.userData.edgeAngleDeg = 30;
        group.add(backMainMesh);

        // ── Structural back — side (along +Z, at X = 0) ───────────────────
        const backSideGeo = roundedBox(backThk, backH, lengthSide, 0.05, 3);
        backSideGeo.translate(backThk / 2, legH + plinthH + backH / 2, lengthSide / 2);
        const backSideMesh = new THREE.Mesh(backSideGeo, frameMat);
        backSideMesh.userData.skipInPlan = true;
        backSideMesh.userData.edgeAngleDeg = 30;
        group.add(backSideMesh);

        // ── Arm — right end of main run ────────────────────────────────────
        this.addArm(group, frameMat, {
            cx:     widthMain - armW / 2,
            cz:     seatDepthMain / 2,
            width:  armW,
            depth:  seatDepthMain,
            height: height - legH,
            baseY:  legH,
        });

        // ── Arm — far end of side run ──────────────────────────────────────
        this.addArm(group, frameMat, {
            cx:     seatDepthSide / 2,
            cz:     lengthSide - armW / 2,
            width:  seatDepthSide,
            depth:  armW,
            height: height - legH,
            baseY:  legH,
            rotateY: true,   // arm runs along X so we rotate the roll
        });

        // ── Seat cushions — main run ───────────────────────────────────────
        const cushCountMain  = Math.max(2, Math.floor(widthMain / 0.85));
        const cushWidthMain  = widthMain / cushCountMain;
        const seatYMain      = legH + plinthH + cushThk / 2;
        const seatZMain      = backThk + (seatDepthMain - backThk) / 2;
        const seatDMain      = seatDepthMain - backThk - 0.03;

        for (let i = 0; i < cushCountMain; i++) {
            const cx = cushWidthMain * i + cushWidthMain / 2;

            // Body
            const body = plumpCushion(cushWidthMain * 0.93, cushThk, seatDMain);
            body.translate(cx, seatYMain, seatZMain);
            const m = new THREE.Mesh(body, cushionMat);
            m.userData.skipInPlan = true;
            m.userData.edgeAngleDeg = 30;
            group.add(m);
        }

        // ── Seat cushions — side run ───────────────────────────────────────
        // Built in natural orientation: seatDSide in X, cushThk in Y, cushLenSide in Z.
        // No mesh rotation — eliminates the diagonal tilt seen when rotation.y was used.
        const cushCountSide  = Math.max(1, Math.floor(lengthSide / 0.85));
        const cushLenSide    = lengthSide / cushCountSide;
        const seatYSide      = legH + plinthH + cushThk / 2;
        const seatXSide      = backThk + (seatDepthSide - backThk) / 2;
        const seatDSide      = seatDepthSide - backThk - 0.03;

        for (let i = 0; i < cushCountSide; i++) {
            const cz = cushLenSide * i + cushLenSide / 2;

            // Body: depth (X) × height (Y) × length (Z) — no rotation needed.
            // plumpCushion's 30% bevel radius already rounds the front (+X) edge.
            const body = plumpCushion(seatDSide * 0.93, cushThk, cushLenSide * 0.92);
            body.translate(seatXSide, seatYSide, cz);
            const m = new THREE.Mesh(body, cushionMat);
            m.userData.skipInPlan = true;
            m.userData.edgeAngleDeg = 30;
            group.add(m);
        }

        // ── Back cushions — main run ───────────────────────────────────────
        // Seams aligned to the seat-cushion grid below: each back-cushion seam
        // coincides with a seat-cushion seam so the top run reads as a direct
        // continuation of the bottom run when viewed in plan.
        // The first back cushion starts at mainBackStartX (clear of the side
        // back cushion / corner cushion) and runs to the first seat seam past
        // that point; subsequent cushions span one full seat segment each.
        const backCushBaseY  = legH + plinthH + cushThk + backCushH / 2 + 0.02;
        const backCushCZMain = backThk + 0.08 + backCushThk / 2;

        const mainBackStartX = backThk + 0.08 + backCushThk; // clear of side back cushion
        const seatSeamsMain: number[] = [];
        for (let i = 1; i <= cushCountMain; i++) seatSeamsMain.push(cushWidthMain * i);

        const backSeamsMain: number[] = [mainBackStartX];
        for (const s of seatSeamsMain) {
            if (s > mainBackStartX + 0.05 && s < widthMain - 0.05) backSeamsMain.push(s);
        }
        backSeamsMain.push(widthMain);

        for (let i = 0; i < backSeamsMain.length - 1; i++) {
            const x0 = backSeamsMain[i];
            const x1 = backSeamsMain[i + 1];
            const w  = x1 - x0;
            if (w < 0.2) continue;
            const cx      = (x0 + x1) / 2;
            const cushGeo = plumpCushion(w * 0.94, backCushH, backCushThk);
            const mesh    = new THREE.Mesh(cushGeo, cushionMat);
            mesh.position.set(cx, backCushBaseY, backCushCZMain);
            mesh.rotation.x = -0.08;
            mesh.userData.skipInPlan = true;
            mesh.userData.edgeAngleDeg = 30;
            group.add(mesh);
        }

        // ── Back cushions — side run ───────────────────────────────────────
        // Natural orientation: backCushThk in X, backCushH in Y, length in Z.
        // No rotation.y — eliminates the diagonal twist.
        // rotation.z = +0.08 tilts the top toward −X (leaning into the back panel at X=0).
        // Starts at Z = seatDepthMain so it doesn't conflict with the first main-run
        // back cushion that already fills the corner zone.
        // Shifted closer to the side back panel (smaller padding) so the
        // vertical cushions visually align with the main run's horizontal
        // cushions at the inside L-corner.
        const backCushCXSide = backThk + 0.04 + backCushThk / 2;
        const sideBackStartZ = seatDepthMain - 0.18;

        // Side back cushion seams aligned to the side seat-cushion grid.
        // First cushion starts at sideBackStartZ; subsequent seams snap to
        // seat seams. Last cushion ends at lengthSide.
        const seatSeamsSide: number[] = [];
        for (let i = 1; i <= cushCountSide; i++) seatSeamsSide.push(cushLenSide * i);

        const backSeamsSide: number[] = [sideBackStartZ];
        for (const s of seatSeamsSide) {
            if (s > sideBackStartZ + 0.05 && s < lengthSide - 0.05) backSeamsSide.push(s);
        }
        backSeamsSide.push(lengthSide);

        // ── Side back cushions — first cushion absorbs the corner zone ─────
        // The first side back cushion is extended back to the side back panel
        // face so the corner zone and the first side back cushion read as a
        // single continuous piece (no visible seam at the L-junction).
        const cornerStartZ = backThk + 0.02;
        backSeamsSide[0] = cornerStartZ;

        for (let i = 0; i < backSeamsSide.length - 1; i++) {
            const z0 = backSeamsSide[i];
            const z1 = backSeamsSide[i + 1];
            const len = z1 - z0;
            if (len < 0.2) continue;
            const cz      = (z0 + z1) / 2;
            const cushGeo = plumpCushion(backCushThk, backCushH, len * 0.92);
            const mesh    = new THREE.Mesh(cushGeo, cushionMat);
            mesh.position.set(backCushCXSide, backCushBaseY, cz);
            mesh.rotation.z = 0.08;
            mesh.userData.skipInPlan = true;
            mesh.userData.edgeAngleDeg = 30;
            group.add(mesh);
        }

        // ── Legs ──────────────────────────────────────────────────────────
        const legSz = 0.07;
        const lInset = 0.07;
        const legPositions: [number, number][] = [
            [lInset,               lInset],
            [widthMain - lInset,   lInset],
            [widthMain - lInset,   seatDepthMain - lInset],
            [lInset,               lengthSide - lInset],
            [seatDepthSide - lInset, lengthSide - lInset],
            [seatDepthSide - lInset, seatDepthMain - lInset],
        ];
        for (const [lx, lz] of legPositions) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(legSz, legH, legSz), legMat);
            leg.position.set(lx, legH / 2, lz);
            leg.userData.skipInPlan = true;
            leg.userData.edgeAngleDeg = 30;
            group.add(leg);
        }

        // ── userData ──────────────────────────────────────────────────────
        group.userData.id            = data.id;
        group.userData.elementType   = 'furniture';
        group.userData.furnitureType = data.furnitureType;
        group.userData.width         = widthMain;
        group.userData.length        = lengthSide;
        group.userData.height        = height;

        return group;
    }

    /**
     * Padded arm — rounded body slab + capsule top-roll.
     * rotateY = true  → arm slab runs along X axis (for side-run end arm).
     */
    private addArm(
        parent:  THREE.Group,
        mat:     THREE.MeshPhysicalMaterial,
        a:       { cx: number; cz: number; width: number; depth: number; height: number; baseY: number; rotateY?: boolean },
    ): void {
        const bodyGeo = roundedBox(a.width, a.height, a.depth, 0.06, 4);
        bodyGeo.translate(a.cx, a.baseY + a.height / 2, a.cz);
        const armMesh = new THREE.Mesh(bodyGeo, mat);
        // Contract 48 §3.4 / §3.5: skip in plan (symbol drawn by SofaPlanSymbolBuilder),
        // collapse bevels in elevation projection.
        armMesh.userData.skipInPlan = true;
        armMesh.userData.edgeAngleDeg = 30;
        parent.add(armMesh);
    }
}
