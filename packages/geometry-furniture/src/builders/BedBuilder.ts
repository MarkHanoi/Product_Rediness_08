import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class BedBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;
        const height = data.height;

        let frameColor = 0x8b4513; 
        if (data.material === 'metal') frameColor = 0x707070;
        if (data.material === 'fabric') frameColor = 0x4a4a4a;

        const frameMat = this.materialService.getMaterial(frameColor, 'standard') as THREE.MeshStandardMaterial;

        const mattressMat = new THREE.MeshStandardMaterial({ color: 0xfffffa, roughness: 0.8 });

        const frameGeo = new THREE.BoxGeometry(width, 0.15, length);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(0, 0.075, 0);
        group.add(frame);

        const mattressGeo = new THREE.BoxGeometry(width * 0.95, 0.2, length * 0.95);
        const mattress = new THREE.Mesh(mattressGeo, mattressMat);
        mattress.position.set(0, 0.2 + 0.1, 0);
        group.add(mattress);

        const legGeo = new THREE.BoxGeometry(0.1, 0.2, 0.1);
        const legPositions = [
            [width/2 - 0.1, 0.1, length/2 - 0.1],
            [-width/2 + 0.1, 0.1, length/2 - 0.1],
            [width/2 - 0.1, 0.1, -length/2 + 0.1],
            [-width/2 + 0.1, 0.1, -length/2 + 0.1],
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, frameMat);
            leg.position.set(pos[0], 0.1, pos[2]);
            group.add(leg);
        });

        if (data.hasHeadboard) {
            const hbGeo = new THREE.BoxGeometry(width, height * 0.8, 0.1);
            const hb = new THREE.Mesh(hbGeo, frameMat);
            hb.position.set(0, (height * 0.8)/2, -length/2 + 0.05);
            group.add(hb);
        }

        // Contract 48 §5 (extended for beds): every bed-part mesh is excluded
        // from the plan-view 3D-edge projection — BedPlanSymbolBuilder injects
        // a clean architectural plan symbol instead.  edgeAngleDeg = 30
        // collapses bevels in elevation so silhouettes stay crisp.
        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, skipInPlan: true, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}
