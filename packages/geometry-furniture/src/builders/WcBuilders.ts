// F1.7 (2026-05-30) — WC primitives.
//
// Two compact wet-room elements for the wc archetype:
//
//   • WcWashbasinBuilder — small wall-hung washbasin (typ. 450 × 300 ×
//     150 mm) with a stainless tap. Sits ~850 mm above finished floor
//     (typical UK rim height). Distinct from the full vanity_unit:
//     wall-hung (no cabinet beneath), no countertop, smaller footprint
//     — sized for the cloakroom WC where every square cm matters.
//
//   • WcMirrorBuilder — small wall-mounted mirror panel above the
//     washbasin. Same frame+glass pattern as BathroomMirrorBuilder but
//     compact (typ. 400 × 600 mm vs the vanity mirror's full-width).
//     baseOffset defaults to 1.20 m (mirror centre at ~1.50 m AFL —
//     standard washbasin-mirror eye level).
//
// Both builders mirror the BathroomVanity pattern: cloned cached
// materials (no mutation leak), simple primitive geometry, edge tag
// for plan rendering.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { makeMirrorMaterial } from './MirrorMaterial';

// Per-builder edge-angle tag for plan-rendering crease detection
// (mirrors the BathroomVanityBuilder helper of the same name).
const tagEdge30 = (g: THREE.Group): void => {
    g.traverse(o => {
        if ((o as THREE.Mesh).isMesh) {
            o.userData = { ...o.userData, edgeAngleDeg: 30 };
        }
    });
};

export class WcWashbasinBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.45;           // wall-facing width
        const L = data.length || 0.30;           // projection out from wall
        const H = data.height || 0.15;           // basin body thickness
        // A.21.D15 — FLOOR-RELATIVE; the rim-height mount (baseOffset, ~0.85 m)
        // is applied once on the group root by FurnitureFragmentBuilder.
        const BASE = 0;

        // White ceramic body — cloned so opacity/roughness tweaks don't leak.
        const baseMat = this.materialService.getMaterial(0xfafaf6, 'standard') as THREE.MeshStandardMaterial;
        const bodyMat = baseMat.clone();
        bodyMat.roughness = 0.25;
        bodyMat.metalness = 0.05;

        // Outer basin (rounded-rect approximation: box with chamfered top).
        const outerGeo = new THREE.BoxGeometry(W, H, L);
        const outer = new THREE.Mesh(outerGeo, bodyMat);
        outer.position.set(0, BASE + H / 2, 0);
        outer.castShadow = true;
        outer.receiveShadow = true;
        group.add(outer);

        // Inner bowl — recessed top face (40 mm rim, 20 mm depth from rim).
        const RIM = 0.04, BOWL_DEPTH = 0.06;
        const bowlW = Math.max(0.1, W - 2 * RIM);
        const bowlL = Math.max(0.1, L - 2 * RIM);
        const bowlGeo = new THREE.BoxGeometry(bowlW, BOWL_DEPTH, bowlL);
        const bowlMat = baseMat.clone();
        bowlMat.color = new THREE.Color(0xe8e6dc);
        bowlMat.roughness = 0.45;
        const bowl = new THREE.Mesh(bowlGeo, bowlMat);
        bowl.position.set(0, BASE + H - BOWL_DEPTH / 2 - 0.005, 0);
        group.add(bowl);

        // Stainless single-lever tap — short cylinder + horizontal spout,
        // at the back centre of the basin.
        const tapMat = this.materialService.getMaterial(0xb8c0c8, 'standard') as THREE.MeshStandardMaterial;
        const tapBaseGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12);
        const tapBase = new THREE.Mesh(tapBaseGeo, tapMat);
        tapBase.position.set(0, BASE + H + 0.03, -L / 2 + 0.06);
        group.add(tapBase);

        const spoutGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 10);
        const spout = new THREE.Mesh(spoutGeo, tapMat);
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, BASE + H + 0.06, -L / 2 + 0.10);
        group.add(spout);

        tagEdge30(group);
        return group;
    }
}

export class WcMirrorBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width  || 0.40;
        const L = data.length || 0.03;
        const H = data.height || 0.60;
        // A.21.D15 — FLOOR-RELATIVE; the ~1.20 m mount is applied once on the
        // group root by FurnitureFragmentBuilder (baseOffset).
        const BASE = 0;

        // §63.6 (2026-06-12) — brushed-metal frame (was near-black 0x303030 → the
        // whole mirror read dark). Light satin-chrome + slim reveal so the
        // reflective glass dominates.
        const frameMat = this.materialService.getMaterial(0x9aa0a6, 'standard') as THREE.MeshStandardMaterial;
        // §63.1 — reflective mirror glass (was a dark-emissive slab → rendered BLACK).
        const glassMat = makeMirrorMaterial();

        // Outer frame
        const frameGeo = new THREE.BoxGeometry(W, H, L);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(0, BASE + H / 2, 0);
        group.add(frame);

        // Glass face — proud of the front, thin reveal so the mirror fills the panel.
        const FRAME_THK = 0.015;
        const glassW = Math.max(0.1, W - FRAME_THK * 2);
        const glassH = Math.max(0.1, H - FRAME_THK * 2);
        const glassGeo = new THREE.BoxGeometry(glassW, glassH, Math.max(0.01, L * 0.6));
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0, BASE + H / 2, L / 2 + 0.002);
        group.add(glass);

        tagEdge30(group);
        return group;
    }
}
