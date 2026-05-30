// F1.9 (2026-05-30) — Dining-room storage primitives.
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.9)
//
// Two builders for buffet + sideboard. Both share the same "box with
// reveals + pulls" pattern as the F1.4 shoe_cabinet / F1.5 vanity_unit,
// tuned for dining-room proportions:
//
//   • BuffetBuilder — taller (≈ 0.90 m), four-bay front: top row of
//     drawers + bottom row of cabinet doors.
//   • SideboardBuilder — lower (≈ 0.75 m), longer (1.8 m default),
//     three cabinet bays + a centred top tier of three small drawers.

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
    return 0x6b4a26;     // mid-walnut by default
};

export class BuffetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const bodyMat = this.materialService.getMaterial(colorFor(data.material), 'standard') as THREE.MeshStandardMaterial;
        const frontMat = this.materialService.getMaterial(
            Math.max(0, colorFor(data.material) - 0x141414), 'standard',
        ) as THREE.MeshStandardMaterial;
        const pullMat = this.materialService.getMaterial(0x9c8b6a, 'standard') as THREE.MeshStandardMaterial;

        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        group.add(body);

        // 4 bays across the width, split into top drawers + bottom cabinets.
        const BAYS = 4;
        const REVEAL = 0.012;
        const bayW = (W - REVEAL * (BAYS + 1)) / BAYS;
        const TOP_FRAC = 0.30;
        const topH = (H - REVEAL * 3) * TOP_FRAC;
        const botH = (H - REVEAL * 3) * (1 - TOP_FRAC);
        const topGeo = new THREE.BoxGeometry(bayW, topH, REVEAL);
        const botGeo = new THREE.BoxGeometry(bayW, botH, REVEAL);
        const pullGeo = new THREE.BoxGeometry(bayW * 0.45, 0.018, 0.02);

        for (let i = 0; i < BAYS; i++) {
            const x = -W / 2 + REVEAL + bayW / 2 + i * (bayW + REVEAL);
            // Top drawer
            const td = new THREE.Mesh(topGeo, frontMat);
            td.position.set(x, REVEAL + botH + REVEAL + topH / 2, L / 2 + REVEAL / 2);
            group.add(td);
            // Bottom cabinet door
            const bd = new THREE.Mesh(botGeo, frontMat);
            bd.position.set(x, REVEAL + botH / 2, L / 2 + REVEAL / 2);
            group.add(bd);
            // Two pulls (one each)
            const tp = new THREE.Mesh(pullGeo, pullMat);
            tp.position.set(x, REVEAL + botH + REVEAL + topH * 0.65, L / 2 + REVEAL + 0.008);
            group.add(tp);
            const bp = new THREE.Mesh(pullGeo, pullMat);
            bp.position.set(x, REVEAL + botH * 0.9, L / 2 + REVEAL + 0.008);
            group.add(bp);
        }

        tagEdge30(group);
        return group;
    }
}

export class SideboardBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const bodyMat = this.materialService.getMaterial(colorFor(data.material), 'standard') as THREE.MeshStandardMaterial;
        const frontMat = this.materialService.getMaterial(
            Math.max(0, colorFor(data.material) - 0x141414), 'standard',
        ) as THREE.MeshStandardMaterial;
        const pullMat = this.materialService.getMaterial(0x9c8b6a, 'standard') as THREE.MeshStandardMaterial;

        // Body
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        group.add(body);

        // Top tier — 3 small centred drawers
        const REVEAL = 0.012;
        const DRAW_H = 0.10;
        const drawW = (W * 0.7 - REVEAL * 2) / 3;
        const drawGeo = new THREE.BoxGeometry(drawW, DRAW_H, REVEAL);
        const knobGeo = new THREE.SphereGeometry(0.015, 10, 8);
        for (let i = 0; i < 3; i++) {
            const x = -(W * 0.7) / 2 + drawW / 2 + REVEAL + i * (drawW + REVEAL);
            const dr = new THREE.Mesh(drawGeo, frontMat);
            dr.position.set(x, H - REVEAL - DRAW_H / 2, L / 2 + REVEAL / 2);
            group.add(dr);
            const knob = new THREE.Mesh(knobGeo, pullMat);
            knob.position.set(x, H - REVEAL - DRAW_H / 2, L / 2 + REVEAL + 0.008);
            group.add(knob);
        }

        // Bottom — 3 cabinet doors across the FULL width
        const BAYS = 3;
        const botBayW = (W - REVEAL * (BAYS + 1)) / BAYS;
        const botH = H - DRAW_H - REVEAL * 3;
        const botGeo = new THREE.BoxGeometry(botBayW, botH, REVEAL);
        const pullGeo = new THREE.BoxGeometry(botBayW * 0.4, 0.018, 0.02);
        for (let i = 0; i < BAYS; i++) {
            const x = -W / 2 + REVEAL + botBayW / 2 + i * (botBayW + REVEAL);
            const door = new THREE.Mesh(botGeo, frontMat);
            door.position.set(x, REVEAL + botH / 2, L / 2 + REVEAL / 2);
            group.add(door);
            const p = new THREE.Mesh(pullGeo, pullMat);
            p.position.set(x, REVEAL + botH * 0.9, L / 2 + REVEAL + 0.008);
            group.add(p);
        }

        // Four tapered legs (mid-century-style)
        const legW = 0.04;
        const legH = 0.10;
        const legGeo = new THREE.CylinderGeometry(legW / 2, legW * 0.7, legH, 8);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(sx * (W / 2 - legW), -legH / 2, sz * (L / 2 - legW));
            group.add(leg);
        }

        tagEdge30(group);
        return group;
    }
}
