// F1.12 (2026-05-30) — Bedroom dressing primitives.
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.12)
//
// Two small builders covering the bedroom dressing area (S6 activity
// system precursor):
//
//   • DresserBuilder — low chest of drawers, 1.2 × 0.5 × 0.85 m,
//     six-drawer 2×3 grid with slim metal pulls.
//   • VanityTableBuilder — small dressing table 0.9 × 0.45 × 0.75 m
//     + integrated wall-mirror above (0.7 × 0.04 × 0.8 m at baseOffset
//     0.85 m). Two slender legs + a centred drawer for accessories.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

const tagEdge30 = (g: THREE.Group): void => {
    g.traverse(o => {
        if ((o as THREE.Mesh).isMesh) {
            o.userData = { ...o.userData, edgeAngleDeg: 30 };
        }
    });
};

const colorFor = (mat: FurnitureData['material']): number => {
    if (mat === 'metal') return 0x707070;
    if (mat === 'fabric') return 0x4a4a4a;
    return 0xa17a4c; // warm walnut
};

export class DresserBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const bodyColor = colorFor(data.material);
        const bodyMat = this.materialService.getMaterial(bodyColor, 'standard') as THREE.MeshStandardMaterial;
        const frontMat = this.materialService.getMaterial(
            Math.max(0, bodyColor - 0x141414), 'standard',
        ) as THREE.MeshStandardMaterial;
        const pullMat = this.materialService.getMaterial(0x9c8b6a, 'standard') as THREE.MeshStandardMaterial;

        // Body
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        group.add(body);

        // 6 drawers in a 2 (X) × 3 (Y) grid.
        const COLS = 2;
        const ROWS = 3;
        const REVEAL = 0.012;
        const colW = (W - REVEAL * (COLS + 1)) / COLS;
        const rowH = (H - REVEAL * (ROWS + 1)) / ROWS;
        const drawerGeo = new THREE.BoxGeometry(colW, rowH, REVEAL);
        const pullGeo = new THREE.BoxGeometry(colW * 0.45, 0.018, 0.02);
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const x = -W / 2 + REVEAL + colW / 2 + c * (colW + REVEAL);
                const y = REVEAL + rowH / 2 + r * (rowH + REVEAL);
                const dr = new THREE.Mesh(drawerGeo, frontMat);
                dr.position.set(x, y, L / 2 + REVEAL / 2);
                group.add(dr);
                const p = new THREE.Mesh(pullGeo, pullMat);
                p.position.set(x, y, L / 2 + REVEAL + 0.008);
                group.add(p);
            }
        }

        tagEdge30(group);
        return group;
    }
}

export class VanityTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const bodyColor = colorFor(data.material);
        const bodyMat = this.materialService.getMaterial(bodyColor, 'standard') as THREE.MeshStandardMaterial;
        const pullMat = this.materialService.getMaterial(0x9c8b6a, 'standard') as THREE.MeshStandardMaterial;
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xeef0f2,
            emissive: 0x252525,
            emissiveIntensity: 0.06,
            roughness: 0.05,
            metalness: 0.92,
        });

        // Top slab + slim drawer beneath
        const TOP_THK = 0.03;
        const DRAW_H = 0.10;
        const topY = H - TOP_THK / 2;
        const drawY = H - TOP_THK - DRAW_H / 2;

        const topGeo = new THREE.BoxGeometry(W, TOP_THK, L);
        const top = new THREE.Mesh(topGeo, bodyMat);
        top.position.set(0, topY, 0);
        group.add(top);

        const drawGeo = new THREE.BoxGeometry(W * 0.85, DRAW_H, L);
        const drawer = new THREE.Mesh(drawGeo, bodyMat);
        drawer.position.set(0, drawY, 0);
        group.add(drawer);
        const pullGeo = new THREE.BoxGeometry(W * 0.3, 0.018, 0.02);
        const pull = new THREE.Mesh(pullGeo, pullMat);
        pull.position.set(0, drawY, L / 2 + 0.012);
        group.add(pull);

        // Two slender legs on each long edge
        const legH = drawY - DRAW_H / 2;
        const legGeo = new THREE.CylinderGeometry(0.018, 0.022, legH, 10);
        for (const sx of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(sx * (W / 2 - 0.04), legH / 2, 0);
            group.add(leg);
        }

        // Integrated wall mirror above — baseOffset 0.85 m above the floor
        // (positioned relative to the vanity top: 0.10 m gap then the mirror).
        const mirrorW = W * 0.80;
        const mirrorH = 0.80;
        const mirrorL = 0.04;
        const mirrorY = topY + 0.10 + mirrorH / 2;
        const frameGeo = new THREE.BoxGeometry(mirrorW, mirrorH, mirrorL);
        const frame = new THREE.Mesh(frameGeo, bodyMat);
        frame.position.set(0, mirrorY, -L / 2 + mirrorL / 2);
        group.add(frame);

        const FRAME_THK = 0.02;
        const glassGeo = new THREE.BoxGeometry(mirrorW - FRAME_THK * 2, mirrorH - FRAME_THK * 2, mirrorL * 0.5);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0, mirrorY, -L / 2 + mirrorL + 0.001);
        group.add(glass);

        tagEdge30(group);
        return group;
    }
}
