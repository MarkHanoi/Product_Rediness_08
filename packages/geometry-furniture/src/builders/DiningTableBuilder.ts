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

        // ── 1. Rounded (boat/stadium) timber top — ONE SOLID extruded mesh ──────────
        // The old build was a central BoxGeometry + two half-cylinder end caps; the
        // box↔cap seam left a visible GAP down the middle of the top (the founder's
        // "dining table missing some areas"). A single rounded-rectangle ExtrudeGeometry
        // can't seam — it's one continuous surface — and keeps the warm boat-shaped
        // outline. Built in the local XZ plane (top up), centred on the table origin.
        const hw = width / 2, hl = length / 2;
        const rEnd = Math.max(0.04, Math.min(hw, length * 0.28));   // corner/end radius
        const shape = new THREE.Shape();
        shape.moveTo(-hw + rEnd, -hl);
        shape.lineTo(hw - rEnd, -hl);
        shape.quadraticCurveTo(hw, -hl, hw, -hl + rEnd);
        shape.lineTo(hw, hl - rEnd);
        shape.quadraticCurveTo(hw, hl, hw - rEnd, hl);
        shape.lineTo(-hw + rEnd, hl);
        shape.quadraticCurveTo(-hw, hl, -hw, hl - rEnd);
        shape.lineTo(-hw, -hl + rEnd);
        shape.quadraticCurveTo(-hw, -hl, -hw + rEnd, -hl);
        const topGeo = new THREE.ExtrudeGeometry(shape, { depth: topThk, bevelEnabled: false, curveSegments: 24 });
        topGeo.rotateX(-Math.PI / 2);                 // shape's XY plane → world XZ (top horizontal)
        // After the rotate the slab spans Y∈[0, topThk]; centre it on topY so its top
        // face sits at `height` (= topY + topThk/2), matching the old box top.
        topGeo.translate(0, topY - topThk / 2, 0);
        const topMesh = new THREE.Mesh(topGeo, tableMat);
        group.add(topMesh);

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
