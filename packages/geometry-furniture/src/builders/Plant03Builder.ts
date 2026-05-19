import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant03Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 0.9;
        const potColor = data.color ? (typeof data.color === 'string' ? parseInt(data.color.replace('#', '0x')) : data.color) : 0x444444;
        const potMat = this.materialService.getMaterial(potColor);
        
        // Pot
        const potHeight = 0.45;
        const potRadius = 0.3;
        const potGeo = new THREE.CylinderGeometry(potRadius, potRadius * 0.8, potHeight, 32);
        const pot = new THREE.Mesh(potGeo, potMat);
        pot.position.y = potHeight / 2;
        group.add(pot);

        // Soil
        const soilGeo = new THREE.CircleGeometry(potRadius - 0.02, 32);
        const soilMat = this.materialService.getMaterial(0x2b1d12);
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = potHeight - 0.02;
        group.add(soil);

        // Monstera deliciosa (LOD 400)
        const leafMat = this.materialService.getMaterial(0x1b4d3e);
        const stemCount = 8;
        
        for (let i = 0; i < stemCount; i++) {
            const angle = (i / stemCount) * Math.PI * 2;
            const stemGroup = new THREE.Group();
            stemGroup.rotation.y = angle + (Math.random() - 0.5) * 0.2;
            stemGroup.position.y = potHeight * 0.7;

            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0.15, height * 0.4, 0),
                new THREE.Vector3(0.4, height * 0.8, 0)
            );
            const stemGeo = new THREE.TubeGeometry(curve, 16, 0.015, 8, false);
            const stem = new THREE.Mesh(stemGeo, leafMat);
            stemGroup.add(stem);

            // Detailed Monstera Leaf
            const leafShape = new THREE.Shape();
            leafShape.moveTo(0, 0);
            leafShape.bezierCurveTo(0.2, 0.1, 0.4, 0.4, 0.3, 0.7);
            leafShape.bezierCurveTo(0.1, 0.9, -0.1, 0.9, -0.3, 0.7);
            leafShape.bezierCurveTo(-0.4, 0.4, -0.2, 0.1, 0, 0);

            // Add holes (fenestrations)
            const hole1 = new THREE.Path();
            hole1.absellipse(0.1, 0.5, 0.03, 0.06, 0, Math.PI * 2, true, 0);
            leafShape.holes.push(hole1);

            const hole2 = new THREE.Path();
            hole2.absellipse(-0.1, 0.4, 0.03, 0.05, 0, Math.PI * 2, true, 0);
            leafShape.holes.push(hole2);

            const hole3 = new THREE.Path();
            hole3.absellipse(0.0, 0.3, 0.02, 0.04, 0, Math.PI * 2, true, 0);
            leafShape.holes.push(hole3);
            
            const leafGeo = new THREE.ShapeGeometry(leafShape);
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            const leafPos = curve.getPoint(1);
            leaf.position.copy(leafPos);
            leaf.rotation.z = -Math.PI / 3;
            leaf.rotation.x = Math.PI / 4;
            stemGroup.add(leaf);
            
            group.add(stemGroup);
        }

        return group;
    }
}
