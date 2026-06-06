// F1.10 (2026-05-30) — Wall decor primitives.
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.10)
//
// Both pieces are wall-mounted "thin slab" geometries — a framed front
// face on a shallow body, attached to the wall at an eye-level
// baseOffset (default 1.45 m for the centre of an art piece).
//
// Members:
//   • WallArtBuilder — picture frame (dark border + abstract painted
//     canvas). 0.6 × 0.04 × 0.9 m.
//   • WallMirrorBuilder — decorative mirror panel (thin gold frame +
//     emissive reflective glass). 0.5 × 0.04 × 0.8 m.

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

export class WallArtBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        // A.21.D15 — FLOOR-RELATIVE geometry. The wall-mount height (baseOffset)
        // is applied ONCE by FurnitureFragmentBuilder on the group root; adding
        // it again here floats the piece. BASE is the in-group floor (0).
        const BASE = 0;

        const frameMat = this.materialService.getMaterial(0x202020, 'standard') as THREE.MeshStandardMaterial;
        // Canvas — abstract muted earthy palette (cream + terracotta tint).
        const canvasMat = new THREE.MeshStandardMaterial({
            color: 0xe2c7a4,
            roughness: 0.85,
            metalness: 0.0,
        });

        const FRAME_THK = 0.025;
        const frameGeo = new THREE.BoxGeometry(W, H, L);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(0, BASE + H / 2, 0);
        group.add(frame);

        const canvasW = W - FRAME_THK * 2;
        const canvasH = H - FRAME_THK * 2;
        const canvasGeo = new THREE.BoxGeometry(canvasW, canvasH, L * 0.6);
        const canvas = new THREE.Mesh(canvasGeo, canvasMat);
        canvas.position.set(0, BASE + H / 2, L / 2 + 0.002);
        group.add(canvas);

        tagEdge30(group);
        return group;
    }
}

export class WallMirrorBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        // A.21.D15 — FLOOR-RELATIVE (mount applied once on the group root).
        const BASE = 0;

        const frameMat = this.materialService.getMaterial(0xb59563, 'standard') as THREE.MeshStandardMaterial;
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xe8eef0,
            emissive: 0x202020,
            emissiveIntensity: 0.05,
            roughness: 0.05,
            metalness: 0.95,
        });

        const FRAME_THK = 0.02;
        const frameGeo = new THREE.BoxGeometry(W, H, L);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(0, BASE + H / 2, 0);
        group.add(frame);

        const glassW = W - FRAME_THK * 2;
        const glassH = H - FRAME_THK * 2;
        const glassGeo = new THREE.BoxGeometry(glassW, glassH, L * 0.5);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0, BASE + H / 2, L / 2 + 0.001);
        group.add(glass);

        tagEdge30(group);
        return group;
    }
}
