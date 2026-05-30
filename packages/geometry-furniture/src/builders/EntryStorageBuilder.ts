// F1.4 (2026-05-30) — Entry storage primitives
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.4)
//
// Four small builders for the hall S2 activity system. Each kept short
// (the entry zone is small; over-detailed geometry would clutter the
// plan view). All four share the same wood-default + skipInPlan=false
// pattern as the other F1 builders.
//
// Members:
//   • ShoeCabinetBuilder — low (≈ 0.9 m) closed cabinet, two stacked
//     drawer fronts.
//   • CoatRackBuilder — vertical post with five outward-facing hooks.
//   • ConsoleTableBuilder — narrow tall accent table (deeper than the
//     existing entrance_table). Two-leg trestle on a centre stretcher.
//   • EntryBenchBuilder — flat-topped low bench with two front legs
//     and a kick-panel skirt at the rear (so it pushes back against
//     the wall cleanly).

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
    return 0x8b5a2b;
};

export class ShoeCabinetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const mat = this.materialService.getMaterial(colorFor(data.material), 'standard') as THREE.MeshStandardMaterial;
        const drawerMat = this.materialService.getMaterial(
            Math.max(0, colorFor(data.material) - 0x101010), 'standard',
        ) as THREE.MeshStandardMaterial;

        // Main body
        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const body = new THREE.Mesh(bodyGeo, mat);
        body.position.set(0, H / 2, 0);
        group.add(body);

        // Two stacked drawer reveals on the front face
        const REVEAL = 0.015;
        const drawerH = (H - REVEAL * 3) / 2;
        const drawerW = W - REVEAL * 2;
        const drawerGeo = new THREE.BoxGeometry(drawerW, drawerH, REVEAL);
        for (let i = 0; i < 2; i++) {
            const y = REVEAL + drawerH / 2 + i * (drawerH + REVEAL);
            const drawer = new THREE.Mesh(drawerGeo, drawerMat);
            drawer.position.set(0, y, L / 2 + REVEAL / 2);
            group.add(drawer);
        }

        // Slim metal pulls (one per drawer)
        const pullMat = this.materialService.getMaterial(0x404040, 'standard') as THREE.MeshStandardMaterial;
        const pullGeo = new THREE.BoxGeometry(W * 0.6, 0.02, 0.025);
        for (let i = 0; i < 2; i++) {
            const y = REVEAL + drawerH * (0.9 + 0.1) + i * (drawerH + REVEAL);
            const p = new THREE.Mesh(pullGeo, pullMat);
            p.position.set(0, y, L / 2 + REVEAL + 0.01);
            group.add(p);
        }

        tagEdge30(group);
        return group;
    }
}

export class CoatRackBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const wood = this.materialService.getMaterial(colorFor(data.material), 'standard') as THREE.MeshStandardMaterial;
        const metal = this.materialService.getMaterial(0x303030, 'standard') as THREE.MeshStandardMaterial;

        // Central vertical post
        const POST_R = Math.min(W, L) * 0.06;
        const postGeo = new THREE.CylinderGeometry(POST_R * 0.85, POST_R, H, 14);
        const post = new THREE.Mesh(postGeo, wood);
        post.position.set(0, H / 2, 0);
        group.add(post);

        // 5 horizontal hooks at the upper third — short cylinders sticking out
        // in 5 evenly-spaced radial directions (so a coat hangs off each).
        const hookCount = 5;
        const hookH = H * 0.7;
        const hookLen = Math.min(W, L) * 0.3;
        const hookR = POST_R * 0.4;
        const hookGeo = new THREE.CylinderGeometry(hookR, hookR, hookLen, 8);
        hookGeo.rotateZ(Math.PI / 2);                // lay flat
        for (let i = 0; i < hookCount; i++) {
            const angle = (i / hookCount) * Math.PI * 2;
            const hook = new THREE.Mesh(hookGeo, metal);
            hook.position.set(
                Math.cos(angle) * (POST_R + hookLen / 2),
                hookH,
                Math.sin(angle) * (POST_R + hookLen / 2),
            );
            hook.rotation.y = -angle;
            group.add(hook);
        }

        // Stable cross-foot at the base
        const FOOT_LEN = Math.max(W, L) * 0.6;
        const footGeo = new THREE.BoxGeometry(FOOT_LEN, 0.04, 0.04);
        const foot1 = new THREE.Mesh(footGeo, metal);
        foot1.position.set(0, 0.02, 0);
        group.add(foot1);
        const foot2 = new THREE.Mesh(footGeo, metal);
        foot2.rotation.y = Math.PI / 2;
        foot2.position.set(0, 0.02, 0);
        group.add(foot2);

        tagEdge30(group);
        return group;
    }
}

export class ConsoleTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const wood = this.materialService.getMaterial(colorFor(data.material), 'standard') as THREE.MeshStandardMaterial;

        // Top slab
        const TOP_THK = 0.04;
        const topGeo = new THREE.BoxGeometry(W, TOP_THK, L);
        const top = new THREE.Mesh(topGeo, wood);
        top.position.set(0, H - TOP_THK / 2, 0);
        group.add(top);

        // Two trestle legs at each short end
        const LEG_W = 0.04;
        const legH = H - TOP_THK;
        const legGeo = new THREE.BoxGeometry(LEG_W, legH, L * 0.85);
        for (const sx of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, wood);
            leg.position.set(sx * (W / 2 - LEG_W / 2 - 0.02), legH / 2, 0);
            group.add(leg);
        }

        // Centre stretcher
        const stretchGeo = new THREE.BoxGeometry(W * 0.85, LEG_W * 0.7, LEG_W);
        const stretch = new THREE.Mesh(stretchGeo, wood);
        stretch.position.set(0, legH * 0.25, 0);
        group.add(stretch);

        tagEdge30(group);
        return group;
    }
}

export class EntryBenchBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        const wood = this.materialService.getMaterial(colorFor(data.material), 'standard') as THREE.MeshStandardMaterial;
        const cushionMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb0, roughness: 0.9 });

        // Bench seat — wood plank + light fabric cushion on top
        const SEAT_THK = 0.04;
        const seatGeo = new THREE.BoxGeometry(W, SEAT_THK, L);
        const seat = new THREE.Mesh(seatGeo, wood);
        seat.position.set(0, H - SEAT_THK / 2, 0);
        group.add(seat);

        const cushGeo = new THREE.BoxGeometry(W * 0.96, 0.045, L * 0.94);
        const cush = new THREE.Mesh(cushGeo, cushionMat);
        cush.position.set(0, H + 0.022, 0);
        group.add(cush);

        // Two front legs + one rear kick-panel skirt
        const LEG_W = 0.05;
        const legH = H - SEAT_THK;
        const legGeo = new THREE.BoxGeometry(LEG_W, legH, LEG_W);
        for (const sx of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, wood);
            leg.position.set(sx * (W / 2 - LEG_W / 2 - 0.02), legH / 2, L / 2 - LEG_W / 2 - 0.02);
            group.add(leg);
        }
        // Rear kick-panel skirt
        const skirtGeo = new THREE.BoxGeometry(W - LEG_W * 2, legH, LEG_W);
        const skirt = new THREE.Mesh(skirtGeo, wood);
        skirt.position.set(0, legH / 2, -L / 2 + LEG_W / 2);
        group.add(skirt);

        tagEdge30(group);
        return group;
    }
}
