// F1.1 (2026-05-30) — Desk chair builder. Swivel-base task chair.
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.1)
//
// Architectural intent:
//   • 550 × 600 × 900 mm task chair on a 5-spoke star base with castor wheels.
//   • Padded round seat + tall padded backrest; the seat sits at ~46 cm and
//     the back rises to ~90 cm — sized to pull up to a 75 cm-high DESK
//     (matches the F1.1 desk builder's `data.height` 0.75 m).
//   • Lives in the study archetype paired with `desk` via the `work-station`
//     furniture group — see archetypes.ts.
//
// Pattern mirrors the generic fallback in ChairBuilder._buildInner (the
// production chair types are 100s-of-lines stylised pieces; the desk chair
// is intentionally simple geometry so the SHIP closes the contract ladder
// at minimum cost. A stylised office-chair variant can replace this body
// later without touching any consumer).

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class DeskChairBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;     // shoulder-width seat (≈ 0.55 m)
        const length = data.length;   // front-to-back (≈ 0.55 m)
        const height = data.height;   // top of backrest (≈ 0.9 m)

        // Materials — black fabric pads + dark metal frame is the office default.
        let padColor = 0x2a2a2a;
        if (data.material === 'fabric') padColor = 0x3a3a3a;
        if (data.material === 'wood')   padColor = 0x8b5a2b;

        const padMat = this.materialService.getMaterial(padColor, 'standard') as THREE.MeshStandardMaterial;
        const baseMat = this.materialService.getMaterial(0x4a4a4a, 'standard') as THREE.MeshStandardMaterial;

        const SEAT_Y = 0.46;            // top of seat pad
        const SEAT_THK = 0.08;
        const SEAT_RAD = Math.min(width, length) * 0.45;
        const BACK_THK = 0.07;

        // ── Padded round seat ────────────────────────────────────────────────
        const seatGeo = new THREE.CylinderGeometry(SEAT_RAD, SEAT_RAD, SEAT_THK, 24);
        const seat = new THREE.Mesh(seatGeo, padMat);
        seat.position.set(0, SEAT_Y - SEAT_THK / 2, 0);
        group.add(seat);

        // ── Tall padded backrest ─────────────────────────────────────────────
        const backH = height - SEAT_Y - 0.02;
        const backW = width * 0.85;
        const backGeo = new THREE.BoxGeometry(backW, backH, BACK_THK);
        const back = new THREE.Mesh(backGeo, padMat);
        back.position.set(0, SEAT_Y + backH / 2, -length * 0.35 + BACK_THK / 2);
        group.add(back);

        // ── Central swivel column from base to seat ──────────────────────────
        const COL_R = 0.025;
        const colH = SEAT_Y - SEAT_THK;
        const colGeo = new THREE.CylinderGeometry(COL_R, COL_R * 1.1, colH, 12);
        const col = new THREE.Mesh(colGeo, baseMat);
        col.position.set(0, colH / 2, 0);
        group.add(col);

        // ── 5-spoke star base + castors ──────────────────────────────────────
        const ARM_LEN = Math.min(width, length) * 0.50;
        const ARM_R = 0.020;
        const armGeo = new THREE.CylinderGeometry(ARM_R, ARM_R, ARM_LEN, 10);
        armGeo.translate(0, ARM_LEN / 2, 0);           // pivot at base of arm
        const CASTOR_R = 0.025;
        const castorGeo = new THREE.SphereGeometry(CASTOR_R, 10, 8);
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const arm = new THREE.Mesh(armGeo, baseMat);
            arm.position.set(0, CASTOR_R, 0);
            arm.rotation.z = Math.PI / 2;              // lay flat (cylinder lies horizontally)
            arm.rotation.y = angle;
            group.add(arm);
            const castor = new THREE.Mesh(castorGeo, baseMat);
            castor.position.set(
                Math.sin(angle) * ARM_LEN,
                CASTOR_R,
                Math.cos(angle) * ARM_LEN,
            );
            group.add(castor);
        }

        // Default plan-view path: top-down silhouette of the round seat reads
        // naturally as a chair circle. edgeAngleDeg 30 keeps the silhouette
        // crisp without exposing the inner bevel edges.
        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}
