import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * DiningTableBuilder (LOD 350)
 * §DINING-DETAIL (founder 2026-06-18) — a highly detailed warm-timber dining set:
 * a stadium/boat-shaped SLATTED top on solid plank-pedestal legs, surrounded by
 * wood-frame armchairs with beige cushioned seats + backs. Replaces the old flat
 * box-top + 4 thin legs + bare box chairs. Pure + deterministic (no randomness),
 * so command snapshots round-trip byte-identically.
 * Follows BIM-ENGINE-ARCHITECTURAL-CONTRACT.
 */
export class DiningTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { width, length, height } = data;

        // Warm light-oak timber (founder refs); cushions in soft warm cream.
        const woodColor = data.color ? parseInt(data.color.replace('#', '0x')) : 0xc8a878;
        const woodDark  = 0xab8c5c;  // slat grooves / leg shadow tone
        const cushion   = 0xe7ddc8;  // warm cream cushion
        const tableMat   = this.materialService.getMaterial(woodColor, 'standard') as THREE.MeshStandardMaterial;
        const grooveMat  = this.materialService.getMaterial(woodDark, 'standard') as THREE.MeshStandardMaterial;
        const legMat     = this.materialService.getMaterial(woodColor, 'standard') as THREE.MeshStandardMaterial;
        const cushionMat = this.materialService.getMaterial(cushion, 'standard') as THREE.MeshStandardMaterial;

        const topThk = 0.05;
        const topY = height - topThk / 2;

        // ── 1. Stadium / boat-shaped top: central plank + two rounded end caps ──
        const capR = Math.min(width / 2, length * 0.32);   // rounded-end radius
        const midLen = Math.max(0.01, length - capR * 2);
        const topMid = new THREE.Mesh(new THREE.BoxGeometry(width, topThk, midLen), tableMat);
        topMid.position.set(0, topY, 0);
        group.add(topMid);
        for (const sign of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, topThk, 28, 1, false, 0, Math.PI), tableMat);
            // half-disc cap rounding each end (axis up, flat in XZ)
            cap.position.set(0, topY, sign * (midLen / 2));
            cap.rotation.y = sign > 0 ? 0 : Math.PI;
            // widen the cap to the full table width if the radius is smaller than half-width
            const sx = (width / 2) / capR;
            cap.scale.set(sx, 1, 1);
            group.add(cap);
        }

        // ── 2. SLAT grooves — thin recessed lines running lengthwise (the plank look) ──
        const SLATS = 4;
        for (let s = 1; s <= SLATS; s++) {
            const gx = -width / 2 + (width / (SLATS + 1)) * s;
            const groove = new THREE.Mesh(new THREE.BoxGeometry(0.008, topThk * 0.5, length * 0.86), grooveMat);
            groove.position.set(gx, topY + topThk * 0.26, 0);
            group.add(groove);
        }

        // ── 3. Solid PLANK-PEDESTAL legs (two cross-planks + a low stretcher) ──
        const legH = height - topThk;
        const plankThk = 0.07;
        const plankW = width * 0.6;
        const legZ = length * 0.30;
        for (const sign of [-1, 1]) {
            const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW, legH, plankThk), legMat);
            plank.position.set(0, legH / 2, sign * legZ);
            group.add(plank);
            // small foot under each plank for a grounded base
            const foot = new THREE.Mesh(new THREE.BoxGeometry(plankW * 1.05, 0.04, plankThk * 1.8), legMat);
            foot.position.set(0, 0.02, sign * legZ);
            group.add(foot);
        }
        // central stretcher beam joining the two pedestals (low, classic refectory look)
        const stretcher = new THREE.Mesh(new THREE.BoxGeometry(plankThk, plankThk, legZ * 2), legMat);
        stretcher.position.set(0, legH * 0.28, 0);
        group.add(stretcher);

        // ── 4. Wood-frame armchairs with cushions, all the way around ──
        const chairClear = 0.32;     // gap between table edge and chair
        const chairW = 0.52;
        const chairPad = 0.12;
        // Long sides
        const perSide = Math.max(1, Math.floor(length / (chairW + chairPad)));
        const sideSpacing = length / (perSide + 1);
        for (let i = 1; i <= perSide; i++) {
            const z = -length / 2 + i * sideSpacing;
            const left = this.buildChair(legMat, cushionMat);
            left.position.set(-width / 2 - chairClear, 0, z);
            left.rotation.y = Math.PI / 2;
            group.add(left);
            const right = this.buildChair(legMat, cushionMat);
            right.position.set(width / 2 + chairClear, 0, z);
            right.rotation.y = -Math.PI / 2;
            group.add(right);
        }
        // End chairs (one at each short end) when the table is wide enough
        if (width >= 0.9) {
            const head = this.buildChair(legMat, cushionMat);
            head.position.set(0, 0, length / 2 + chairClear);
            head.rotation.y = Math.PI;
            group.add(head);
            const foot = this.buildChair(legMat, cushionMat);
            foot.position.set(0, 0, -length / 2 - chairClear);
            group.add(foot);
        }

        return group;
    }

    /** A detailed wood-frame dining armchair: tapered legs, a wood seat frame with a
     *  thick cream cushion, two back posts with a curved back cushion, and armrests. */
    private buildChair(woodMat: THREE.Material, cushionMat: THREE.Material): THREE.Group {
        const g = new THREE.Group();
        const seatH = 0.46, seatW = 0.48, seatD = 0.48;

        // Tapered legs (square section).
        const legGeo = new THREE.CylinderGeometry(0.022, 0.016, seatH, 4);
        legGeo.rotateY(Math.PI / 4);
        const lo = seatW / 2 - 0.05;
        for (const [x, z] of [[lo, lo], [-lo, lo], [lo, -lo], [-lo, -lo]] as const) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(x, seatH / 2, z);
            g.add(leg);
        }

        // Wood seat frame (thin) + thick cream cushion on top.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.04, seatD), woodMat);
        frame.position.set(0, seatH, 0);
        g.add(frame);
        const cush = new THREE.Mesh(new THREE.BoxGeometry(seatW * 0.92, 0.07, seatD * 0.92), cushionMat);
        cush.position.set(0, seatH + 0.055, 0);
        g.add(cush);

        // Two back posts + a top rail (wood frame), with a curved cream back cushion.
        const postGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
        const backZ = -seatD / 2 + 0.03;
        for (const x of [-seatW / 2 + 0.04, seatW / 2 - 0.04]) {
            const post = new THREE.Mesh(postGeo, woodMat);
            post.position.set(x, seatH + 0.27, backZ);
            post.rotation.x = -0.08;
            g.add(post);
        }
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, seatW, 8), woodMat);
        rail.rotateZ(Math.PI / 2);
        rail.position.set(0, seatH + 0.5, backZ - 0.02);
        g.add(rail);
        const backCush = new THREE.Mesh(new THREE.BoxGeometry(seatW * 0.8, 0.3, 0.06), cushionMat);
        backCush.position.set(0, seatH + 0.3, backZ + 0.02);
        backCush.rotation.x = -0.08;
        g.add(backCush);

        // Armrests: a horizontal wood bar each side + a front support post.
        for (const sign of [-1, 1]) {
            const armX = sign * (seatW / 2 - 0.01);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, seatD * 0.72), woodMat);
            arm.position.set(armX, seatH + 0.20, -0.02);
            g.add(arm);
            const front = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), woodMat);
            front.position.set(armX, seatH + 0.10, seatD / 2 - 0.08);
            g.add(front);
        }

        return g;
    }
}
