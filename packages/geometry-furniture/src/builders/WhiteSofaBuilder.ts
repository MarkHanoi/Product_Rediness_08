/**
 * @file WhiteSofaBuilder.ts
 *
 * WhiteSofaBuilder — straight sofas. Handles seat-count variants for both
 * the legacy white_* family and the generic sofa_* family. The colour
 * comes from data.color (set by the registry's defaultColor per card),
 * with a cream fallback for the white_* variants and a neutral charcoal
 * fallback for the generic sofa_* variants.
 *
 * Variants:
 *   'white_sofa_1seat' / 'sofa_1seat'  ~1.00 m wide  (single-seat with two arms)
 *   'white_sofa_2seat' / 'sofa_2seat'  ~1.85 m wide  (two-seat)
 *   'white_sofa_3seat' / 'sofa_3seat'  ~2.55 m wide  (three-seat)
 *   'sofa'                              alias → 2-seat default
 *
 * Geometry mirrors CornerSofaBuilder quality:
 *   - roundedBox / plumpCushion helpers for soft, organic edges.
 *   - MeshPhysicalMaterial with clearcoat (frame) and sheen (cushions).
 *   - Cream / off-white palette (#e8e2d5) matching white_corner_sofa.
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
/*  Geometry helpers (shared with CornerSofaBuilder pattern)                  */
/* ────────────────────────────────────────────────────────────────────────── */

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

function plumpCushion(w: number, h: number, d: number): THREE.BufferGeometry {
    const r = Math.min(w, h, d) * 0.30;
    return roundedBox(w, h, d, r, 5);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Default widths per seat count                                              */
/* ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_WIDTHS: Record<string, number> = {
    white_sofa_1seat: 1.05,
    white_sofa_2seat: 1.85,
    white_sofa_3seat: 2.55,
    sofa_1seat:       1.05,
    sofa_2seat:       1.85,
    sofa_3seat:       2.55,
    sofa:             1.85,
};

/** Whether the type belongs to the white/cream palette family. */
function isWhiteFamily(t: string): boolean {
    return t === 'white_sofa_1seat' || t === 'white_sofa_2seat' || t === 'white_sofa_3seat';
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Builder                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export class WhiteSofaBuilder implements IFurnitureBuilder {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        // ── Dimensions ────────────────────────────────────────────────────
        const totalWidth = data.width  ?? DEFAULT_WIDTHS[data.furnitureType] ?? 1.85;
        const seatDepth  = data.length ?? 0.95;
        const height     = data.height ?? 0.85;

        // Tuned so the silhouette reads as a proper sofa (wide, plump cushions
        // sitting on a low base, arms a touch lower than the back) rather than
        // a near-cubic stool with two arms.
        const legH        = 0.10;   // short dark feet
        const plinthH     = 0.16;   // low base — keeps cushions visually dominant
        const armW        = 0.20;   // chunkier, more pronounced arms
        const backThk     = 0.14;   // structural back panel depth
        const cushThk     = 0.24;   // plumper seat cushion
        const backCushThk = 0.24;   // plumper back cushion
        const armH        = (height - legH) * 0.78;   // arms ~22% lower than back top
        const backCushH   = (height - legH - plinthH - cushThk) * 1.05;

        // ── Materials ─────────────────────────────────────────────────────
        // White-family variants default to cream (#e8e2d5); the generic sofa_*
        // family defaults to a neutral charcoal so a colourless instance still
        // reads as a real sofa rather than a white blob.
        const fallbackColor = isWhiteFamily(data.furnitureType) ? 0xe8e2d5 : 0x4a4a4a;
        const rawColor = data.color
            ? parseInt(data.color.replace('#', '0x'), 16)
            : fallbackColor;

        // Material finish: 'fabric' (default) | 'wood' | 'metal' | 'glass'.
        // The property panel exposes this enum; builders are responsible for
        // mapping it onto PBR parameters so the user's choice is visible.
        const finish = data.material ?? 'fabric';

        const frameSpec = (() => {
            switch (finish) {
                case 'wood':
                    return { roughness: 0.55, metalness: 0.05, clearcoat: 0.30, clearcoatRoughness: 0.45, sheen: 0.0 };
                case 'metal':
                    return { roughness: 0.30, metalness: 0.85, clearcoat: 0.50, clearcoatRoughness: 0.20, sheen: 0.0 };
                case 'glass':
                    return { roughness: 0.10, metalness: 0.10, clearcoat: 1.00, clearcoatRoughness: 0.05, sheen: 0.0 };
                case 'fabric':
                default:
                    return { roughness: 0.72, metalness: 0.02, clearcoat: 0.20, clearcoatRoughness: 0.60, sheen: 0.0 };
            }
        })();
        const frameMat = new THREE.MeshPhysicalMaterial({
            color:              rawColor,
            roughness:          frameSpec.roughness,
            metalness:          frameSpec.metalness,
            clearcoat:          frameSpec.clearcoat,
            clearcoatRoughness: frameSpec.clearcoatRoughness,
            transparent:        finish === 'glass',
            opacity:            finish === 'glass' ? 0.55 : 1.0,
        });

        const cushC = new THREE.Color(rawColor).multiplyScalar(1.18).getHex();
        const cushionSpec = (() => {
            switch (finish) {
                case 'wood':
                    return { roughness: 0.60, metalness: 0.05, sheen: 0.0,  sheenRoughness: 1.0 };
                case 'metal':
                    return { roughness: 0.35, metalness: 0.80, sheen: 0.0,  sheenRoughness: 1.0 };
                case 'glass':
                    return { roughness: 0.15, metalness: 0.10, sheen: 0.0,  sheenRoughness: 1.0 };
                case 'fabric':
                default:
                    return { roughness: 0.88, metalness: 0.00, sheen: 0.9,  sheenRoughness: 0.55 };
            }
        })();
        const cushionMat = new THREE.MeshPhysicalMaterial({
            color:          cushC,
            roughness:      cushionSpec.roughness,
            metalness:      cushionSpec.metalness,
            sheen:          cushionSpec.sheen,
            sheenColor:     new THREE.Color(cushC).multiplyScalar(1.08),
            sheenRoughness: cushionSpec.sheenRoughness,
            transparent:    finish === 'glass',
            opacity:        finish === 'glass' ? 0.55 : 1.0,
        });

        const legMat = new THREE.MeshPhysicalMaterial({
            color:     0x1a1008,
            roughness: 0.50,
            metalness: 0.15,
        });

        // ── Base plinth ───────────────────────────────────────────────────
        // Per Contract 48 §3.4 / §3.5: structural shells skip the plan-view
        // edge projection (SofaPlanSymbolBuilder draws a clean 2D symbol
        // instead), and tag a 30° edge-angle threshold so the rounded-box
        // bevels collapse to clean silhouettes in elevation.
        const plinthGeo = roundedBox(totalWidth, plinthH, seatDepth, 0.05, 3);
        plinthGeo.translate(totalWidth / 2, legH + plinthH / 2, seatDepth / 2);
        const plinthMesh = new THREE.Mesh(plinthGeo, frameMat);
        plinthMesh.userData.skipInPlan = true;
        plinthMesh.userData.edgeAngleDeg = 30;
        group.add(plinthMesh);

        // ── Structural back panel (at Z = 0) ──────────────────────────────
        const backH   = height - legH - plinthH;
        const backGeo = roundedBox(totalWidth, backH, backThk, 0.05, 3);
        backGeo.translate(totalWidth / 2, legH + plinthH + backH / 2, backThk / 2);
        const backMesh = new THREE.Mesh(backGeo, frameMat);
        backMesh.userData.skipInPlan = true;
        backMesh.userData.edgeAngleDeg = 30;
        group.add(backMesh);

        // ── Left arm (at X = 0) — chunky, well rounded, slightly lower
        // than the back panel so the back cushion peeks above ───────────────
        const armBevel = 0.10;
        const armGeo = roundedBox(armW, armH, seatDepth, armBevel, 5);
        armGeo.translate(armW / 2, legH + armH / 2, seatDepth / 2);
        const armMeshL = new THREE.Mesh(armGeo, frameMat);
        armMeshL.userData.skipInPlan = true;
        armMeshL.userData.edgeAngleDeg = 30;
        group.add(armMeshL);

        // ── Right arm (at X = totalWidth - armW) ──────────────────────────
        const armGeoR = roundedBox(armW, armH, seatDepth, armBevel, 5);
        armGeoR.translate(totalWidth - armW / 2, legH + armH / 2, seatDepth / 2);
        const armMeshR = new THREE.Mesh(armGeoR, frameMat);
        armMeshR.userData.skipInPlan = true;
        armMeshR.userData.edgeAngleDeg = 30;
        group.add(armMeshR);

        // ── Seat cushions ─────────────────────────────────────────────────
        const innerWidth    = totalWidth - armW * 2;
        const cushCount     = Math.max(1, Math.round(innerWidth / 0.80));
        const cushWidth     = innerWidth / cushCount;
        const seatY         = legH + plinthH + cushThk / 2;
        const seatZ         = backThk + (seatDepth - backThk) / 2;
        const seatD         = seatDepth - backThk - 0.03;

        for (let i = 0; i < cushCount; i++) {
            const cx  = armW + cushWidth * i + cushWidth / 2;
            const geo = plumpCushion(cushWidth * 0.93, cushThk, seatD);
            geo.translate(cx, seatY, seatZ);
            const m = new THREE.Mesh(geo, cushionMat);
            m.userData.skipInPlan = true;
            m.userData.edgeAngleDeg = 30;
            group.add(m);
        }

        // ── Back cushions ─────────────────────────────────────────────────
        const backCushBaseY = legH + plinthH + cushThk + backCushH / 2 + 0.02;
        const backCushCZ    = backThk + 0.08 + backCushThk / 2;

        // Seams aligned to seat-cushion grid
        const seatSeams: number[] = [];
        for (let i = 1; i <= cushCount; i++) seatSeams.push(armW + cushWidth * i);

        const backSeams: number[] = [armW];
        for (const s of seatSeams) {
            if (s > armW + 0.05 && s < totalWidth - armW - 0.05) backSeams.push(s);
        }
        backSeams.push(totalWidth - armW);

        for (let i = 0; i < backSeams.length - 1; i++) {
            const x0 = backSeams[i];
            const x1 = backSeams[i + 1];
            const w  = x1 - x0;
            if (w < 0.2) continue;
            const cx      = (x0 + x1) / 2;
            const cushGeo = plumpCushion(w * 0.94, backCushH, backCushThk);
            const mesh    = new THREE.Mesh(cushGeo, cushionMat);
            mesh.position.set(cx, backCushBaseY, backCushCZ);
            mesh.rotation.x = -0.08;
            mesh.userData.skipInPlan = true;
            mesh.userData.edgeAngleDeg = 30;
            group.add(mesh);
        }

        // ── Legs ──────────────────────────────────────────────────────────
        const legSz = 0.07;
        const lInset = 0.07;
        const legPositions: [number, number][] = [
            [lInset,              lInset],
            [totalWidth - lInset, lInset],
            [totalWidth - lInset, seatDepth - lInset],
            [lInset,              seatDepth - lInset],
        ];
        for (const [lx, lz] of legPositions) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(legSz, legH, legSz), legMat);
            leg.position.set(lx, legH / 2, lz);
            leg.userData.skipInPlan = true;
            leg.userData.edgeAngleDeg = 30;
            group.add(leg);
        }

        // ── userData (§27 §3.1) ───────────────────────────────────────────
        group.userData.id            = data.id;
        group.userData.elementType   = 'furniture';
        group.userData.furnitureType = data.furnitureType;
        group.userData.width         = totalWidth;
        group.userData.length        = seatDepth;
        group.userData.height        = height;

        return group;
    }
}
