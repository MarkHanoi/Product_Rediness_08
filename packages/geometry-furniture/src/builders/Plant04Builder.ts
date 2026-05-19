import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant04Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(_data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const potColor = _data.color ? (typeof _data.color === 'string' ? parseInt(_data.color.replace('#', '0x')) : _data.color) : 0xefefef;
        const potMat = this.materialService.getMaterial(potColor);

        const potHeight = 0.5;
        const potRadius = 0.25;
        const potGeo = new THREE.CylinderGeometry(potRadius, potRadius * 0.9, potHeight, 32);
        const pot = new THREE.Mesh(potGeo, potMat);
        pot.position.y = potHeight / 2;
        group.add(pot);

        // Soil
        const soilGeo = new THREE.CircleGeometry(potRadius - 0.02, 32);
        const soilMat = this.materialService.getMaterial(0x3d2b1f);
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = potHeight - 0.02;
        group.add(soil);

        const leafMat = this.materialService.getMaterial(0x2e7d32);
        
        // Detailed Snake Plant (Sansevieria)
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
            const dist = 0.05 + Math.random() * 0.1;
            const leafGroup = new THREE.Group();
            leafGroup.rotation.y = angle;
            leafGroup.position.set(Math.cos(angle) * dist, potHeight - 0.05, Math.sin(angle) * dist);

            const leafHeight = 0.6 + Math.random() * 0.4;
            const leafWidth = 0.1 + Math.random() * 0.05;

            const leafShape = new THREE.Shape();
            leafShape.moveTo(0, 0);
            leafShape.quadraticCurveTo(leafWidth, leafHeight * 0.4, 0, leafHeight);
            leafShape.quadraticCurveTo(-leafWidth, leafHeight * 0.4, 0, 0);
            
            const leafGeo = new THREE.ShapeGeometry(leafShape);
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.rotation.x = (Math.random() - 0.5) * 0.1;
            leaf.rotation.y = (Math.random() - 0.5) * 0.2;
            leafGroup.add(leaf);
            group.add(leafGroup);
        }

        return group;
    }
}
