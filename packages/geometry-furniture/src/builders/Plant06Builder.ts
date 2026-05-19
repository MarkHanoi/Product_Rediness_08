import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant06Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(_data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        
        // Detailed Glass Vase
        const vaseHeight = 0.5;
        const vaseRadius = 0.15;
        const vaseGeo = new THREE.CylinderGeometry(vaseRadius, vaseRadius * 0.8, vaseHeight, 32);
        const vaseMat = new THREE.MeshPhysicalMaterial({ 
            color: '#ffffff', 
            transparent: true, 
            opacity: 0.2, 
            metalness: 0, 
            roughness: 0,
            transmission: 0.9,
            thickness: 0.02
        });
        const vase = new THREE.Mesh(vaseGeo, vaseMat);
        vase.position.y = vaseHeight / 2;
        group.add(vase);

        // Water level
        const waterHeight = vaseHeight * 0.55;
        const waterGeo = new THREE.CylinderGeometry(vaseRadius - 0.01, vaseRadius * 0.8 * 0.9, waterHeight, 32);
        const waterMat = new THREE.MeshStandardMaterial({ color: '#81d4fa', transparent: true, opacity: 0.4 });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.y = waterHeight / 2 + 0.01;
        group.add(water);

        // Eucalyptus stems (LOD 400)
        const stemMat = this.materialService.getMaterial(0x78909c);
        const leafMat = this.materialService.getMaterial(0x90a4ae);

        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const stemGroup = new THREE.Group();
            stemGroup.rotation.y = angle;
            stemGroup.rotation.z = 0.1 + Math.random() * 0.3;

            const stemHeight = 0.8 + Math.random() * 0.3;
            const stemGeo = new THREE.CylinderGeometry(0.006, 0.008, stemHeight, 8);
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.y = stemHeight / 2 + 0.1;
            stemGroup.add(stem);

            // Detailed round leaves
            for (let j = 0; j < 12; j++) {
                const h = 0.2 + j * 0.07;
                if (h > stemHeight) break;
                
                const leafPair = new THREE.Group();
                leafPair.position.y = h;
                leafPair.rotation.y = j * Math.PI * 0.5;

                for (let k = 0; k < 2; k++) {
                    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), leafMat);
                    leaf.rotation.x = -Math.PI / 2;
                    leaf.position.x = (k === 0 ? 1 : -1) * 0.04;
                    leaf.rotation.z = (k === 0 ? 1 : -1) * 0.2;
                    leafPair.add(leaf);
                }
                stemGroup.add(leafPair);
            }
            group.add(stemGroup);
        }

        return group;
    }
}
