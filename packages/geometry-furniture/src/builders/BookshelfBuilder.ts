// F1.2 (2026-05-30) — Bookshelf builder (open + glass-front variants).
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.2)
//
// Architectural intent:
//   • Cross-room storage (living / study / bedroom / hall).
//   • Default 800 × 350 × 1800 mm (W × D × H) — narrow profile so it
//     anchors on the longest free wall without dominating the room.
//   • Open variant ('bookshelf'): visible shelf reveals — five evenly
//     spaced horizontal slabs with a back panel.
//   • Glass-front variant ('bookshelf_glass'): the same body with two
//     translucent glass doors covering the front face.
//
// Pattern mirrors WardrobeGlassBuilder (one class handles both variants
// via `data.furnitureType` discrimination) and ships skipInPlan=false
// so the default EdgeProjector path produces the plan symbol — a clean
// rectangle outline reads correctly as bookshelf signage.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class BookshelfBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;   // depth into room
        const height = data.height;
        const isGlass = data.furnitureType === 'bookshelf_glass';

        // Frame colour — wood by default, metal fallback.
        let frameColor = 0x8b5a2b;
        if (data.material === 'metal') frameColor = 0x707070;
        if (data.material === 'fabric') frameColor = 0x4a4a4a;
        const frameMat = this.materialService.getMaterial(frameColor, 'standard') as THREE.MeshStandardMaterial;

        const PANEL_THK = 0.018;       // 18 mm typical shelf board
        const SHELVES = 5;             // 4 internal divisions + top + bottom

        // ── Outer frame: two side panels + top + bottom ─────────────────────
        const sideGeo = new THREE.BoxGeometry(PANEL_THK, height, length);
        for (const sx of [-1, 1]) {
            const side = new THREE.Mesh(sideGeo, frameMat);
            side.position.set(sx * (width / 2 - PANEL_THK / 2), height / 2, 0);
            group.add(side);
        }
        const horizGeo = new THREE.BoxGeometry(width - PANEL_THK * 2, PANEL_THK, length);
        // Top
        const top = new THREE.Mesh(horizGeo, frameMat);
        top.position.set(0, height - PANEL_THK / 2, 0);
        group.add(top);
        // Bottom
        const bot = new THREE.Mesh(horizGeo, frameMat);
        bot.position.set(0, PANEL_THK / 2, 0);
        group.add(bot);

        // ── Internal shelves (evenly spaced) ────────────────────────────────
        const innerH = height - PANEL_THK * 2;
        for (let i = 1; i < SHELVES; i++) {
            const y = PANEL_THK + (innerH * i) / SHELVES;
            const shelf = new THREE.Mesh(horizGeo, frameMat);
            shelf.position.set(0, y, 0);
            group.add(shelf);
        }

        // ── Back panel ──────────────────────────────────────────────────────
        const backGeo = new THREE.BoxGeometry(width - PANEL_THK * 2, height - PANEL_THK * 2, PANEL_THK / 2);
        const back = new THREE.Mesh(backGeo, frameMat);
        back.position.set(0, height / 2, -length / 2 + PANEL_THK / 4);
        group.add(back);

        // ── Glass-front variant: two translucent doors ──────────────────────
        if (isGlass) {
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0xcfe2e6,
                transparent: true,
                opacity: 0.32,
                roughness: 0.05,
                metalness: 0.1,
            });
            const innerW = width - PANEL_THK * 2;
            const doorW = innerW / 2 - 0.005; // 5 mm reveal between doors
            const doorH = innerH - 0.02;
            const doorGeo = new THREE.BoxGeometry(doorW, doorH, PANEL_THK / 2);
            for (const sx of [-1, 1]) {
                const door = new THREE.Mesh(doorGeo, glassMat);
                door.position.set(
                    sx * (doorW / 2 + 0.005),
                    PANEL_THK + doorH / 2 + 0.01,
                    length / 2 - PANEL_THK / 4,
                );
                group.add(door);
            }
            // Two slim metal handles
            const handleMat = this.materialService.getMaterial(0x404040, 'standard') as THREE.MeshStandardMaterial;
            const handleGeo = new THREE.BoxGeometry(0.02, 0.16, 0.02);
            for (const sx of [-1, 1]) {
                const h = new THREE.Mesh(handleGeo, handleMat);
                h.position.set(sx * 0.01, height / 2, length / 2 + 0.01);
                group.add(h);
            }
        }

        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}
