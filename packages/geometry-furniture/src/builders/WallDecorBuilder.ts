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
//   • WallTapestryBuilder — §OVERBED-WALL-TAPESTRY (founder, 2026-06-18) —
//     woven multi-colour geometric textile on a slim wood rail with a fringed
//     hem. Replaces the wall_mirror in the bedroom over-bed slot.

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

// §OVERBED-WALL-TAPESTRY (founder, 2026-06-18) — woven decorative wall-hanging.
// Replaces the wall_mirror in the bedroom over-bed slot (same thin wall-mounted
// slab family, re-typed + re-materialled). The look the founder asked for: a
// multi-colour GEOMETRIC textile — navy / rust / cream / ochre / olive /
// charcoal blocks — with a FRINGED bottom hem, hung on a SLIM HORIZONTAL WOOD
// RAIL. A texture map is a follow-up; until then the woven look is built from a
// deterministic grid of coloured fabric quads (no per-instance randomness, so
// command snapshots round-trip byte-identically).
const TAPESTRY_PALETTE = [
    0x2b3a55, // navy
    0xb5552d, // rust / terracotta
    0xe7d8bf, // cream
    0xc8902f, // ochre
    0x6f7244, // olive
    0x3a3530, // charcoal
] as const;

export class WallTapestryBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}
    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width, L = data.length, H = data.height;
        // A.21.D15 — FLOOR-RELATIVE (the wall-mount baseOffset is applied once on
        // the group root by FurnitureFragmentBuilder; BASE is the in-group floor).
        const BASE = 0;

        // Slim horizontal WOOD RAIL the textile hangs from, spanning the full
        // width and sitting just above the woven field.
        const RAIL_H = Math.min(0.05, H * 0.08);
        const RAIL_R = RAIL_H / 2;
        const railMat = this.materialService.getMaterial(0x8a5a33, 'standard') as THREE.MeshStandardMaterial;
        const railGeo = new THREE.CylinderGeometry(RAIL_R, RAIL_R, W * 1.02, 12);
        railGeo.rotateZ(Math.PI / 2); // lie horizontal (along the wall, +X)
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(0, BASE + H - RAIL_R, 0);
        group.add(rail);

        // The woven FIELD — a deterministic grid of coloured fabric blocks. The
        // field hangs below the rail and stops short of the hem so the fringe
        // reads as a separate tasselled edge.
        const FRINGE_H = Math.min(0.10, H * 0.14);
        const fieldTop = BASE + H - RAIL_H;
        const fieldBottom = BASE + FRINGE_H;
        const fieldH = Math.max(0.01, fieldTop - fieldBottom);
        const COLS = 4, ROWS = 5;
        const cellW = W / COLS;
        const cellH = fieldH / ROWS;
        // Matte, low-metalness fabric finish per palette colour.
        const fabricMats = TAPESTRY_PALETTE.map(c => new THREE.MeshStandardMaterial({
            color: c, roughness: 0.95, metalness: 0.0,
        }));
        for (let r = 0; r < ROWS; r++) {
            for (let cIdx = 0; cIdx < COLS; cIdx++) {
                // Deterministic woven pattern: diagonal stagger through the palette.
                const mat = fabricMats[(r * COLS + cIdx + r) % TAPESTRY_PALETTE.length];
                const blockGeo = new THREE.BoxGeometry(cellW * 0.98, cellH * 0.98, L);
                const block = new THREE.Mesh(blockGeo, mat);
                const cx = -W / 2 + cellW * (cIdx + 0.5);
                const cy = fieldBottom + cellH * (r + 0.5);
                block.position.set(cx, cy, L / 2);
                group.add(block);
            }
        }

        // FRINGED bottom hem — a row of slim cream tassels hanging below the field.
        const fringeMat = fabricMats[2]; // cream
        const TASSELS = 14;
        const tasselW = (W / TASSELS) * 0.55;
        for (let t = 0; t < TASSELS; t++) {
            const tasselGeo = new THREE.BoxGeometry(tasselW, FRINGE_H, L * 0.8);
            const tassel = new THREE.Mesh(tasselGeo, fringeMat);
            const tx = -W / 2 + (W / TASSELS) * (t + 0.5);
            tassel.position.set(tx, BASE + FRINGE_H / 2, L / 2);
            group.add(tassel);
        }

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
        // §63.1 — reflective mirror glass (was a dark-emissive slab that read black).
        const glassMat = makeMirrorMaterial();

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
