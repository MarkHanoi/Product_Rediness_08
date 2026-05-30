// F1.1 (2026-05-30) — Desk builder. Study workstation surface.
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.1)
//
// Architectural intent (per architect's interactive plan database):
//   • Parametric width — default 1400 mm × 700 mm × 750 mm.
//   • Solid wood top slab (40 mm) on four square legs (60 × 60 mm) at
//     the corners, set in by 50 mm so the user's knees clear.
//   • Anchored on the WINDOW WALL (per programRules.study furnitureSpec)
//     so natural light falls across the work surface from the side.
//
// Pattern mirrors BedBuilder: pure THREE.Group assembly + MaterialService
// material lookup + userData.skipInPlan so the plan-view path uses the
// dedicated DeskPlanSymbolBuilder rather than projecting 3D edges.

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class DeskBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;     // along the anchor wall
        const length = data.length;   // depth into the room
        const height = data.height;   // worktop height (default 0.75 m)

        // Top slab + leg colour — wood default, metal/fabric fall back to dark grey.
        let frameColor = 0x8b5a2b;
        if (data.material === 'metal') frameColor = 0x707070;
        if (data.material === 'fabric') frameColor = 0x4a4a4a;

        const topMat = this.materialService.getMaterial(frameColor, 'standard') as THREE.MeshStandardMaterial;
        const legMat = topMat;

        const TOP_THICK = 0.04;     // 40 mm top
        const LEG_W = 0.06;         // 60 × 60 mm legs
        const LEG_INSET = 0.05;     // 50 mm from each corner so knees clear

        // Top slab.
        const topGeo = new THREE.BoxGeometry(width, TOP_THICK, length);
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.set(0, height - TOP_THICK / 2, 0);
        group.add(top);

        // Four legs at the corners (inset).
        const legLen = height - TOP_THICK;
        const legGeo = new THREE.BoxGeometry(LEG_W, legLen, LEG_W);
        const xPos = width / 2 - LEG_INSET - LEG_W / 2;
        const zPos = length / 2 - LEG_INSET - LEG_W / 2;
        const legPositions: ReadonlyArray<readonly [number, number]> = [
            [xPos,  zPos],
            [-xPos, zPos],
            [xPos,  -zPos],
            [-xPos, -zPos],
        ];
        for (const [x, z] of legPositions) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(x, legLen / 2, z);
            group.add(leg);
        }

        // F1.1 initial ship: use default EdgeProjector path for plan view
        // (top-down silhouette of the slab + 4 legs reads cleanly as a desk
        // symbol). A dedicated DeskPlanSymbolBuilder is queued for the
        // follow-up if architects request the conventional "rectangle + chair
        // arc" symbol. Mirrors how ENTRANCE_TABLE / BEDSIDE_TABLE ship today.
        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}
