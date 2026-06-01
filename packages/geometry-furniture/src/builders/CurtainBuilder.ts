// F1.11 (2026-05-30) — Curtain primitives (S7 activity-system precursor).
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.11)
//
// Two builders covering the window-dressing program. Cross-room: every
// room with an exterior window gets a curtain_rod + two curtain_panels.
//
// Members:
//   • CurtainRodBuilder — slim metal rod with two finial caps. 2.0 m
//     default width (sized at runtime to bridge the window). Mounted
//     near the ceiling (baseOffset 2.40 m default).
//   • CurtainPanelBuilder — single fabric panel with subtle vertical
//     pleats. 1.0 m wide × 0.05 m deep × 2.40 m tall by default. The
//     archetype places TWO per rod (left + right) via count: 2.
//
// Both kept as thin slabs so plan-view edge projection produces a
// clean linework symbol; an architectural drape-arc plan symbol can
// be added later as a polish slice.

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

export class CurtainRodBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const BASE = data.baseOffset ?? 2.40;

        const rodMat = this.materialService.getMaterial(0x3a3a3a, 'standard') as THREE.MeshStandardMaterial;
        const finialMat = this.materialService.getMaterial(0x6a6a6a, 'standard') as THREE.MeshStandardMaterial;

        // Main rod — thin horizontal cylinder spanning the width.
        const ROD_R = 0.014;
        const rodGeo = new THREE.CylinderGeometry(ROD_R, ROD_R, W * 0.96, 12);
        rodGeo.rotateZ(Math.PI / 2);
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(0, BASE, 0);
        group.add(rod);

        // Two finial caps (small spheres at each end)
        const finGeo = new THREE.SphereGeometry(ROD_R * 1.7, 12, 10);
        for (const sx of [-1, 1]) {
            const fin = new THREE.Mesh(finGeo, finialMat);
            fin.position.set(sx * (W / 2 - 0.01), BASE, 0);
            group.add(fin);
        }

        tagEdge30(group);
        return group;
    }
}

export class CurtainPanelBuilder implements IFurnitureBuilder {
    // Accept the MaterialService for constructor parity with the other
    // builders (FurnitureFactory passes one in) — currently unused
    // because fabric uses a plain MeshStandardMaterial below. Underscore
    // prefix suppresses TS6138 unused-var; the parameter slot still
    // exists for call-site parity.
    constructor(_materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;
        const BASE = data.baseOffset ?? 0;

        // Soft neutral fabric — cream-grey blend.
        const fabricColor = data.color ? parseInt(data.color.replace('#', '0x')) : 0xeae2cf;
        const fabricMat = new THREE.MeshStandardMaterial({
            color: fabricColor,
            roughness: 0.95,
            metalness: 0.0,
        });

        // Main fabric slab.
        const slabGeo = new THREE.BoxGeometry(W, H, L);
        const slab = new THREE.Mesh(slabGeo, fabricMat);
        slab.position.set(0, BASE + H / 2, 0);
        group.add(slab);

        // Subtle vertical pleats — three thin vertical strips proud of the
        // front face, slightly darker. Reads as a pleated curtain in close-up.
        const pleatMat = new THREE.MeshStandardMaterial({
            color: Math.max(0, fabricColor - 0x101010),
            roughness: 0.95,
        });
        const PLEAT_W = 0.015;
        const PLEAT_THK = 0.008;
        const PLEAT_H = H * 0.95;
        const pleatGeo = new THREE.BoxGeometry(PLEAT_W, PLEAT_H, PLEAT_THK);
        for (let i = 0; i < 3; i++) {
            const x = -W / 2 + (W * (i + 1)) / 4;
            const p = new THREE.Mesh(pleatGeo, pleatMat);
            p.position.set(x, BASE + H / 2, L / 2 + PLEAT_THK / 2);
            group.add(p);
        }

        tagEdge30(group);
        return group;
    }
}
