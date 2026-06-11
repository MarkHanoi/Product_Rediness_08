// F1.5 (2026-05-30) — Bathroom vanity primitives (furniture-side).
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.5)
//
// Three small builders covering the S4 bathroom-vanity activity system.
// `mirror_light` is the fourth member — lives in geometry-lighting
// (LightingFixtureType, not FurnitureType) and ships separately.
//
// Members:
//   • VanityUnitBuilder — wall-anchored cabinet (1.0 × 0.5 × 0.85 m) with
//     a stone-look countertop, integrated round basin recess, and two
//     drawer reveals + slim chrome pulls.
//   • BathroomMirrorBuilder — wall-mounted mirror panel above the vanity
//     (0.8 × 0.04 × 0.7 m, baseOffset 1.10 m). Frame + emissive glass.
//   • TowelRailBuilder — wall-mounted heated rail (0.5 × 0.10 × 0.8 m,
//     baseOffset 0.40 m). Two vertical posts + 6 horizontal cross-bars.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { makeMirrorMaterial } from './MirrorMaterial';

const tagEdge30 = (g: THREE.Group): void => {
    g.traverse(o => {
        if ((o as THREE.Mesh).isMesh) {
            o.userData = { ...o.userData, edgeAngleDeg: 30 };
        }
    });
};

export class VanityUnitBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;

        // Cabinet body — wood/laminate by default.
        let bodyColor = 0xd9c8a6;
        if (data.material === 'metal') bodyColor = 0x707070;
        if (data.material === 'fabric') bodyColor = 0xece6da;
        const bodyMat = this.materialService.getMaterial(bodyColor, 'standard') as THREE.MeshStandardMaterial;
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xf2efe7, roughness: 0.45, metalness: 0.05 });
        const drawerMat = this.materialService.getMaterial(
            Math.max(0, bodyColor - 0x141414), 'standard',
        ) as THREE.MeshStandardMaterial;
        const pullMat = this.materialService.getMaterial(0xb0b0b0, 'standard') as THREE.MeshStandardMaterial;

        // Cabinet body (sits below the countertop)
        const COUNTER_THK = 0.04;
        const bodyH = H - COUNTER_THK;
        const bodyGeo = new THREE.BoxGeometry(W, bodyH, L);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, bodyH / 2, 0);
        group.add(body);

        // Stone countertop
        const counterGeo = new THREE.BoxGeometry(W + 0.02, COUNTER_THK, L + 0.02);
        const counter = new THREE.Mesh(counterGeo, stoneMat);
        counter.position.set(0, bodyH + COUNTER_THK / 2, 0);
        group.add(counter);

        // Recessed round basin in the centre of the countertop
        const basinR = Math.min(W, L) * 0.18;
        const basinGeo = new THREE.CylinderGeometry(basinR, basinR * 0.85, COUNTER_THK + 0.01, 20, 1, true);
        const basinMat = this.materialService.getMaterial(0xffffff, 'standard') as THREE.MeshStandardMaterial;
        const basin = new THREE.Mesh(basinGeo, basinMat);
        basin.position.set(0, bodyH + COUNTER_THK / 2, 0);
        group.add(basin);

        // Small upturned tap behind the basin
        const tapMat = this.materialService.getMaterial(0xc0c0c0, 'standard') as THREE.MeshStandardMaterial;
        const tapBaseGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 10);
        const tap = new THREE.Mesh(tapBaseGeo, tapMat);
        tap.position.set(0, bodyH + COUNTER_THK + 0.09, -L / 2 + 0.06);
        group.add(tap);
        const spoutGeo = new THREE.BoxGeometry(0.02, 0.02, 0.10);
        const spout = new THREE.Mesh(spoutGeo, tapMat);
        spout.position.set(0, bodyH + COUNTER_THK + 0.16, -L / 2 + 0.11);
        group.add(spout);

        // Two drawer reveals on the front face
        const REVEAL = 0.012;
        const dW = W - REVEAL * 3;
        const dH = (bodyH - REVEAL * 3) / 2;
        const dGeo = new THREE.BoxGeometry(dW, dH, REVEAL);
        for (let i = 0; i < 2; i++) {
            const y = REVEAL + dH / 2 + i * (dH + REVEAL);
            const d = new THREE.Mesh(dGeo, drawerMat);
            d.position.set(0, y, L / 2 + REVEAL / 2);
            group.add(d);
        }
        // Slim chrome pulls
        const pullGeo = new THREE.BoxGeometry(dW * 0.4, 0.018, 0.02);
        for (let i = 0; i < 2; i++) {
            const y = REVEAL + dH * 0.9 + i * (dH + REVEAL);
            const p = new THREE.Mesh(pullGeo, pullMat);
            p.position.set(0, y, L / 2 + REVEAL + 0.008);
            group.add(p);
        }

        tagEdge30(group);
        return group;
    }
}

export class BathroomMirrorBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        // A.21.D15 — FLOOR-RELATIVE; the 1.10 m mount is applied once on the
        // group root by FurnitureFragmentBuilder (baseOffset).
        const BASE = 0;

        const frameMat = this.materialService.getMaterial(0x303030, 'standard') as THREE.MeshStandardMaterial;
        // §63.1 — reflective mirror glass (was a dark-emissive slab → rendered BLACK).
        const glassMat = makeMirrorMaterial();

        // Outer frame
        const frameGeo = new THREE.BoxGeometry(W, H, L);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(0, BASE + H / 2, 0);
        group.add(frame);

        // Glass face — slightly proud of the front
        const FRAME_THK = 0.025;
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

export class TowelRailBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        // A.21.D15 — FLOOR-RELATIVE; the 0.40 m mount is applied once on the
        // group root by FurnitureFragmentBuilder (baseOffset).
        const BASE = 0;

        const mat = this.materialService.getMaterial(0xc0c0c0, 'standard') as THREE.MeshStandardMaterial;

        // Two vertical posts
        const POST_R = 0.012;
        const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, H, 12);
        for (const sx of [-1, 1]) {
            const post = new THREE.Mesh(postGeo, mat);
            post.position.set(sx * (W / 2 - POST_R), BASE + H / 2, L / 2 - POST_R);
            group.add(post);
        }

        // 6 horizontal cross-bars
        const BAR_R = 0.010;
        const BAR_LEN = W - POST_R * 2;
        const barGeo = new THREE.CylinderGeometry(BAR_R, BAR_R, BAR_LEN, 10);
        barGeo.rotateZ(Math.PI / 2);
        const bars = 6;
        for (let i = 0; i < bars; i++) {
            const y = BASE + (H * (i + 0.5)) / bars;
            const bar = new THREE.Mesh(barGeo, mat);
            bar.position.set(0, y, L / 2 - POST_R);
            group.add(bar);
        }

        tagEdge30(group);
        return group;
    }
}
