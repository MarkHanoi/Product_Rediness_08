// F1.3 (2026-05-30) — Media wall builders: tv + tv_unit
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.3)
//
// Architectural intent:
//   • tv: wall-mounted flat panel — 1400 × 80 × 800 mm bezel-thin slab
//     hovering 1.2 m above the floor (eye level when seated on a 450 mm
//     sofa cushion ~1 m back).
//   • tv_unit: low media console — 1600 × 400 × 500 mm with two cabinet
//     bays + a centred AV shelf. Sits under the TV; the unit's TOP face
//     supports decor like the TV remote, a console gaming machine, etc.
//
// One builder file, two variants discriminated on data.furnitureType
// (mirrors the F1.2 BookshelfBuilder pattern).

import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class TvBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;     // panel width along the wall
        const length = data.length;   // panel depth (thin)
        const height = data.height;   // panel vertical extent
        const PANEL_BOTTOM = 1.20;    // wall-mount eye level above floor

        // Bezel + screen materials.
        const bezelMat = this.materialService.getMaterial(0x0a0a0a, 'standard') as THREE.MeshStandardMaterial;
        const screenMat = new THREE.MeshStandardMaterial({
            color: 0x0e1a26,
            emissive: 0x0a141e,
            emissiveIntensity: 0.05,
            roughness: 0.12,
            metalness: 0.55,
        });

        // Bezel slab.
        const bezelGeo = new THREE.BoxGeometry(width, height, length);
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.set(0, PANEL_BOTTOM + height / 2, 0);
        group.add(bezel);

        // Inset screen slightly proud of the bezel front face.
        const SCREEN_INSET = 0.04;
        const screenW = width - SCREEN_INSET * 2;
        const screenH = height - SCREEN_INSET * 2;
        const screenGeo = new THREE.BoxGeometry(screenW, screenH, length * 0.4);
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, PANEL_BOTTOM + height / 2, length / 2 + length * 0.05);
        group.add(screen);

        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}

export class TvUnitBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;     // along the wall, e.g. 1.6 m
        const length = data.length;   // depth into the room, e.g. 0.4 m
        const height = data.height;   // unit top above floor, e.g. 0.5 m

        let frameColor = 0x5a3a1d;
        if (data.material === 'metal') frameColor = 0x404040;
        if (data.material === 'fabric') frameColor = 0x3a3a3a;
        const frameMat = this.materialService.getMaterial(frameColor, 'standard') as THREE.MeshStandardMaterial;
        const knobMat = this.materialService.getMaterial(0x9c8b6a, 'standard') as THREE.MeshStandardMaterial;

        const PANEL_THK = 0.02;

        // Main body — solid box, then knobs + a centre vertical divider painted
        // on the front face define the two cabinet bays.
        const bodyGeo = new THREE.BoxGeometry(width, height, length);
        const body = new THREE.Mesh(bodyGeo, frameMat);
        body.position.set(0, height / 2, 0);
        group.add(body);

        // Door reveals — thin recessed plates on the front face that read as
        // cabinet doors. Two bays split by a centred vertical divider.
        const doorH = height * 0.85;
        const doorW = (width - PANEL_THK * 3) / 2;
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, PANEL_THK);
        // Slightly darker than the body for subtle visual division.
        const doorMat = this.materialService.getMaterial(
            Math.max(0, frameColor - 0x101010), 'standard',
        ) as THREE.MeshStandardMaterial;
        for (const sx of [-1, 1]) {
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(
                sx * (doorW / 2 + PANEL_THK / 2),
                height / 2,
                length / 2 + PANEL_THK / 2,
            );
            group.add(door);
        }

        // Two small round knobs centred on the doors.
        const knobGeo = new THREE.SphereGeometry(0.018, 12, 10);
        for (const sx of [-1, 1]) {
            const knob = new THREE.Mesh(knobGeo, knobMat);
            knob.position.set(
                sx * (doorW * 0.35),
                height / 2,
                length / 2 + PANEL_THK + 0.01,
            );
            group.add(knob);
        }

        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}
