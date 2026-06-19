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

        // Warm light-oak timber (founder refs). Chairs are separate elements (see below).
        const woodColor = data.color ? parseInt(data.color.replace('#', '0x')) : 0xc09a6b;  // warmer light oak (founder ref)
        const woodDark  = 0x9c7b4f;  // slat grooves / leg shadow tone (deeper warm oak)
        const tableMat   = this.materialService.getMaterial(woodColor, 'standard') as THREE.MeshStandardMaterial;
        const grooveMat  = this.materialService.getMaterial(woodDark, 'standard') as THREE.MeshStandardMaterial;
        const legMat     = this.materialService.getMaterial(woodColor, 'standard') as THREE.MeshStandardMaterial;

        const topThk = 0.05;
        const topY = height - topThk / 2;

        // ── 1. Stadium / boat-shaped top: central plank + two rounded end caps ──
        const capR = Math.min(width / 2, length * 0.32);   // rounded-end radius
        const midLen = Math.max(0.01, length - capR * 2);
        const topMid = new THREE.Mesh(new THREE.BoxGeometry(width, topThk, midLen), tableMat);
        topMid.position.set(0, topY, 0);
        group.add(topMid);
        for (const sign of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, topThk, 48, 1, false, 0, Math.PI), tableMat);
            // half-disc cap rounding each end (axis up, flat in XZ)
            cap.position.set(0, topY, sign * (midLen / 2));
            cap.rotation.y = sign > 0 ? 0 : Math.PI;
            // widen the cap to the full table width if the radius is smaller than half-width
            const sx = (width / 2) / capR;
            cap.scale.set(sx, 1, 1);
            group.add(cap);
        }

        // ── 2. SLAT grooves — thin recessed lines running lengthwise (the plank look) ──
        const SLATS = 6;
        for (let s = 1; s <= SLATS; s++) {
            const gx = -width / 2 + (width / (SLATS + 1)) * s;
            const groove = new THREE.Mesh(new THREE.BoxGeometry(0.012, topThk * 0.5, length * 0.86), grooveMat);
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

        // §DINING-CHAIRS-ARE-ELEMENTS (founder 2026-06-19) — the dining_table builds
        // ONLY the table. Chairs are SEPARATE `dining_chair` furniture elements placed
        // by the furnish engine (dining-room archetype, count:4) and rendered by
        // ChairBuilder — so they are individually selectable and NOT doubled with
        // builder-drawn chairs (the "doubled chairs within the geometry" the founder
        // saw: the table builder's chairs overlapping the engine's separate chairs).
        return group;
    }
}
