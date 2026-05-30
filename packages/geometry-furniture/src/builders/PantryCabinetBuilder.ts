// F1.14 (2026-05-30) — Pantry cabinet builder.
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.14)
//
// Tall narrow kitchen cabinet (0.6 × 0.45 × 2.10 m) for dry-goods
// storage. Two-door upper + two-door lower with a narrow countertop
// drawer between for utensils. Anchors on a kitchen wall
// perpendicular to the kitchen run so the working stretch stays
// uninterrupted.

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

export class PantryCabinetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;

        let bodyColor = 0xe4d5b8;
        if (data.material === 'metal') bodyColor = 0xa9a9a9;
        if (data.material === 'fabric') bodyColor = 0xece4d3;
        const bodyMat = this.materialService.getMaterial(bodyColor, 'standard') as THREE.MeshStandardMaterial;
        const frontMat = this.materialService.getMaterial(
            Math.max(0, bodyColor - 0x101010), 'standard',
        ) as THREE.MeshStandardMaterial;
        const pullMat = this.materialService.getMaterial(0x404040, 'standard') as THREE.MeshStandardMaterial;

        // Body
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, H / 2, 0);
        group.add(body);

        // Three tiers: upper double doors / centre drawer / lower double doors.
        const REVEAL = 0.012;
        const DRAW_H = 0.12;
        const totalH = H - REVEAL * 4 - DRAW_H;
        const upperH = totalH * 0.6;
        const lowerH = totalH * 0.4;

        const doorW = (W - REVEAL * 3) / 2;
        const upperGeo = new THREE.BoxGeometry(doorW, upperH, REVEAL);
        const lowerGeo = new THREE.BoxGeometry(doorW, lowerH, REVEAL);

        const lowerY = REVEAL + lowerH / 2;
        const drawerY = REVEAL * 2 + lowerH + DRAW_H / 2;
        const upperY = REVEAL * 3 + lowerH + DRAW_H + upperH / 2;

        // Lower two doors
        for (const sx of [-1, 1]) {
            const door = new THREE.Mesh(lowerGeo, frontMat);
            door.position.set(sx * (doorW / 2 + REVEAL / 2), lowerY, L / 2 + REVEAL / 2);
            group.add(door);
            const pull = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.10, 0.02), pullMat);
            pull.position.set(sx * (REVEAL), lowerY, L / 2 + REVEAL + 0.008);
            group.add(pull);
        }
        // Centre drawer (full width)
        const drawerGeo = new THREE.BoxGeometry(W - REVEAL * 2, DRAW_H, REVEAL);
        const drawer = new THREE.Mesh(drawerGeo, frontMat);
        drawer.position.set(0, drawerY, L / 2 + REVEAL / 2);
        group.add(drawer);
        const dPull = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, 0.018, 0.02), pullMat);
        dPull.position.set(0, drawerY, L / 2 + REVEAL + 0.008);
        group.add(dPull);
        // Upper two doors
        for (const sx of [-1, 1]) {
            const door = new THREE.Mesh(upperGeo, frontMat);
            door.position.set(sx * (doorW / 2 + REVEAL / 2), upperY, L / 2 + REVEAL / 2);
            group.add(door);
            const pull = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.10, 0.02), pullMat);
            pull.position.set(sx * (REVEAL), upperY, L / 2 + REVEAL + 0.008);
            group.add(pull);
        }

        tagEdge30(group);
        return group;
    }
}
