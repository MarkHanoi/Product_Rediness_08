import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant02Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 1.8;
        const potColor = data.color ? (typeof data.color === 'string' ? parseInt(data.color.replace('#', '0x')) : data.color) : 0xaaaaaa;
        const potMat = this.materialService.getMaterial(potColor);

        // Pot
        const potHeight = 0.4;
        const potRadiusTop = 0.25;
        const potGeo = new THREE.CylinderGeometry(potRadiusTop, 0.2, potHeight, 32);
        const pot = new THREE.Mesh(potGeo, potMat);
        pot.position.y = potHeight / 2;
        group.add(pot);

        // Pot Rim
        const rimGeo = new THREE.TorusGeometry(potRadiusTop, 0.02, 16, 32);
        const rim = new THREE.Mesh(rimGeo, potMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = potHeight;
        group.add(rim);

        // Soil
        const soilGeo = new THREE.CircleGeometry(potRadiusTop - 0.01, 32);
        const soilMat = this.materialService.getMaterial(0x2d1b0f);
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = potHeight - 0.01;
        group.add(soil);

        // Trunk (More detailed)
        const trunkPoints = [];
        trunkPoints.push(new THREE.Vector3(0, potHeight, 0));
        trunkPoints.push(new THREE.Vector3(0.08, potHeight + height * 0.3, 0.04));
        trunkPoints.push(new THREE.Vector3(-0.08, potHeight + height * 0.6, -0.04));
        trunkPoints.push(new THREE.Vector3(0.05, potHeight + height * 0.9, 0.02));
        
        const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
        const trunkGeo = new THREE.TubeGeometry(trunkCurve, 32, 0.03, 12, false);
        const trunkMat = this.materialService.getMaterial(0x5d4037);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        group.add(trunk);

        // Detailed Leaves (Ficus style)
        const leafMat = this.materialService.getMaterial(0x1b5e20);
        const leafCount = 15;
        
        for (let i = 0; i < leafCount; i++) {
            const t = 0.3 + (i / leafCount) * 0.7;
            const pos = trunkCurve.getPoint(t);
            const branchGroup = new THREE.Group();
            branchGroup.position.copy(pos);
            branchGroup.rotation.y = i * Math.PI * 1.37; // Golden angle-ish
            branchGroup.rotation.z = Math.PI / 4;
            
            const leafShape = new THREE.Shape();
            leafShape.moveTo(0, 0);
            leafShape.quadraticCurveTo(0.1, 0.05, 0.15, 0.25);
            leafShape.quadraticCurveTo(0.05, 0.35, 0, 0.4);
            leafShape.quadraticCurveTo(-0.05, 0.35, -0.15, 0.25);
            leafShape.quadraticCurveTo(-0.1, 0.05, 0, 0);
            
            const leafGeo = new THREE.ShapeGeometry(leafShape);
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.rotation.x = -Math.PI / 6;
            branchGroup.add(leaf);
            group.add(branchGroup);
        }

        return group;
    }
}
