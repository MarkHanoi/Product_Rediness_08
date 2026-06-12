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

        // §63.4 (2026-06-11) — REAL recessed basin BOWL. The pre-fix vanity had a
        // single open-ended cylinder flush with the counter top — it read as just a
        // "faint flat circle" (founder defect: "the sink has no basin bowl"). We now
        // build a genuine inset bowl: a wider rim ring + an inner bowl wall (a
        // truncated cone tapering DOWN into the counter) + a bowl floor BELOW the
        // counter surface + a drain. The cavity is recessed ~90 mm below the top, so
        // it reads as a proper washbasin you can see into.
        // §63.7 (2026-06-12) — DEEPER, WIDER basin bowl. The §63.4 recess was real
        // but too small/shallow (rim radius ≈ 0.11 m, 90 mm deep) so it still read
        // as a "flat disk" in the 3D view (founder #10c). We widen the bowl to fill
        // the counter, deepen the recess, and add a COUNTERTOP RING that sits flush
        // around the bowl so the cavity reads as a subtracted hole in the worktop.
        const basinMat = this.materialService.getMaterial(0xffffff, 'standard') as THREE.MeshStandardMaterial;
        const counterTopY = bodyH + COUNTER_THK;                 // counter top surface
        const basinR = Math.min(W * 0.30, L * 0.36);             // wider bowl rim radius
        const BOWL_DEPTH = 0.13;                                  // deeper recess below the top
        const bowlFloorR = basinR * 0.5;                         // narrower at the bottom (concave)
        const bowlFloorY = counterTopY - BOWL_DEPTH;             // recessed floor height

        // Counter RING — a flush annulus around the bowl so the worktop visibly
        // wraps the recess (the "hole in the countertop" read). A flat ring disc
        // sitting on the counter top, with the bowl opening cut conceptually inside.
        const ringGeo = new THREE.RingGeometry(basinR, basinR + 0.10, 36);
        const ringMat = stoneMat;
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, counterTopY + 0.002, 0);
        group.add(ring);

        // Rim ring — a low raised lip at the top edge of the bowl (frames the recess).
        const RIM_RING = 0.015;
        const rimGeo = new THREE.CylinderGeometry(basinR + RIM_RING, basinR + RIM_RING, 0.01, 32, 1, false);
        const rim = new THREE.Mesh(rimGeo, basinMat);
        rim.position.set(0, counterTopY + 0.005, 0);
        group.add(rim);

        // Inner bowl WALL — open-ended truncated cone tapering inward+down (the
        // visible concave inside surface). Open-ended so you see into the hole.
        const bowlWallGeo = new THREE.CylinderGeometry(basinR, bowlFloorR, BOWL_DEPTH, 32, 1, true);
        const bowlWall = new THREE.Mesh(bowlWallGeo, basinMat);
        bowlWall.position.set(0, counterTopY - BOWL_DEPTH / 2, 0);
        group.add(bowlWall);

        // Bowl FLOOR — a small disc at the bottom of the recess (slightly darker so
        // the cavity reads as depth) with a drain hole hint at the centre.
        const bowlFloorMat = basinMat.clone();
        bowlFloorMat.color = new THREE.Color(0xeae9e2);
        bowlFloorMat.roughness = 0.5;
        const bowlFloorGeo = new THREE.CylinderGeometry(bowlFloorR, bowlFloorR, 0.01, 28);
        const bowlFloor = new THREE.Mesh(bowlFloorGeo, bowlFloorMat);
        bowlFloor.position.set(0, bowlFloorY + 0.005, 0);
        group.add(bowlFloor);

        // Chrome drain at the bowl floor centre.
        const drainMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;
        const drainGeo = new THREE.CylinderGeometry(bowlFloorR * 0.18, bowlFloorR * 0.18, 0.008, 14);
        const drain = new THREE.Mesh(drainGeo, drainMat);
        drain.position.set(0, bowlFloorY + 0.011, 0);
        group.add(drain);

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

        // §63.6 (2026-06-12) — brushed-metal frame (was near-black 0x303030, which
        // made the whole mirror read dark even with the reflective glass). A light
        // satin-chrome frame + a slim profile so the reflective glass dominates.
        const frameMat = this.materialService.getMaterial(0x9aa0a6, 'standard') as THREE.MeshStandardMaterial;
        // §63.1 — reflective mirror glass (was a dark-emissive slab → rendered BLACK).
        const glassMat = makeMirrorMaterial();

        // Outer frame
        const frameGeo = new THREE.BoxGeometry(W, H, L);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(0, BASE + H / 2, 0);
        group.add(frame);

        // Glass face — proud of the front, thin frame reveal so the mirror fills
        // most of the panel (reads as a mirror, not a framed dark board).
        const FRAME_THK = 0.018;
        const glassW = W - FRAME_THK * 2;
        const glassH = H - FRAME_THK * 2;
        const glassGeo = new THREE.BoxGeometry(glassW, glassH, Math.max(0.01, L * 0.6));
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0, BASE + H / 2, L / 2 + 0.002);
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
