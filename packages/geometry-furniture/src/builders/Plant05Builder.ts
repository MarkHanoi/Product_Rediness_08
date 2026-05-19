import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant05Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 1.2;
        const potColor = data.color ? (typeof data.color === 'string' ? parseInt(data.color.replace('#', '0x')) : data.color) : 0x8d6e63;
        const potMat = this.materialService.getMaterial(potColor);

        // Pot
        const potHeight = 0.45;
        const potRadius = 0.28;
        const potGeo = new THREE.CylinderGeometry(potRadius, potRadius * 0.85, potHeight, 32);
        const pot = new THREE.Mesh(potGeo, potMat);
        pot.position.y = potHeight / 2;
        group.add(pot);

        // Soil
        const soilGeo = new THREE.CircleGeometry(potRadius - 0.02, 32);
        const soilMat = this.materialService.getMaterial(0x3e2723);
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = potHeight - 0.02;
        group.add(soil);

        const trunkMat = this.materialService.getMaterial(0x4e342e);
        const leafMat = this.materialService.getMaterial(0x388e3c);

        // More detailed Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.025, 0.04, height, 12);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = potHeight + height/2;
        group.add(trunk);

        // Detailed Clustered Leaves (Tree style)
        for (let i = 0; i < 25; i++) {
            const h = potHeight + height * (0.5 + Math.random() * 0.5);
            const angle = Math.random() * Math.PI * 2;
            const dist = 0.1 + Math.random() * 0.25;
            
            const leafCluster = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), leafMat);
            leafCluster.scale.set(1.4, 0.8, 1.2);
            leafCluster.position.set(Math.cos(angle) * dist, h, Math.sin(angle) * dist);
            leafCluster.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(leafCluster);
        }

        return group;
    }
}
