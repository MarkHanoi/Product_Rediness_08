import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant08Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 1.0;
        const potColor = data.color ? (typeof data.color === 'string' ? parseInt(data.color.replace('#', '0x')) : data.color) : 0x555555;
        const potMat = this.materialService.getMaterial(potColor);

        // Pot
        const potHeight = 0.45;
        const potRadius = 0.26;
        const potGeo = new THREE.CylinderGeometry(potRadius, potRadius * 0.8, potHeight, 32);
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

        const trunkMat = this.materialService.getMaterial(0x5d4037);
        const leafMat = this.materialService.getMaterial(0x1b5e20);

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.04, 0.05, height * 0.4, 12);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = potHeight + height * 0.2;
        group.add(trunk);

        // Detailed Yucca/Dracaena spiky leaves (LOD 400)
        const leafHeadCount = 2;
        for (let h = 0; h < leafHeadCount; h++) {
            const headY = potHeight + height * (0.3 + h * 0.2);
            for (let i = 0; i < 60; i++) {
                const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.5;
                const elevation = 0.2 + Math.random() * Math.PI * 0.5;
                const length = 0.4 + Math.random() * 0.3;
                
                const leafShape = new THREE.Shape();
                leafShape.moveTo(0, 0);
                leafShape.lineTo(0.015, length * 0.5);
                leafShape.lineTo(0, length);
                leafShape.lineTo(-0.015, length * 0.5);
                leafShape.lineTo(0, 0);
                
                const leafGeo = new THREE.ShapeGeometry(leafShape);
                const leaf = new THREE.Mesh(leafGeo, leafMat);
                leaf.position.y = headY;
                leaf.rotation.z = Math.PI / 2 - elevation;
                leaf.rotation.y = angle;
                group.add(leaf);
            }
        }

        return group;
    }
}
