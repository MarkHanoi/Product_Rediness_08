import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant01Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 0.8;
        const width = data.width || 0.6;

        // Pot
        const potHeight = height * 0.3;
        const potRadiusTop = width * 0.3;
        const potRadiusBottom = width * 0.25;
        const potColor = data.color ? (typeof data.color === 'string' ? parseInt(data.color.replace('#', '0x')) : data.color) : 0xcccccc;
        const potMat = this.materialService.getMaterial(potColor);
        
        const potGeo = new THREE.CylinderGeometry(potRadiusTop, potRadiusBottom, potHeight, 32);
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
        const soilMat = this.materialService.getMaterial(0x3d2b1f); // Dark Brown Soil
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = potHeight - 0.02;
        group.add(soil);

        // Stems and Leaves (LOD 400)
        const stemCount = 8;
        const leafMat = this.materialService.getMaterial(0x2d5a27);
        
        for (let i = 0; i < stemCount; i++) {
            const angle = (i / stemCount) * Math.PI * 2 + Math.random() * 0.2;
            const stemGroup = new THREE.Group();
            stemGroup.rotation.y = angle;
            
            // Curved Stem
            const stemHeight = height * (0.6 + Math.random() * 0.2);
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(width * 0.15, stemHeight * 0.4, 0),
                new THREE.Vector3(width * 0.3, stemHeight, 0)
            );
            const stemGeo = new THREE.TubeGeometry(curve, 16, 0.015, 8, false);
            const stem = new THREE.Mesh(stemGeo, leafMat);
            stem.position.y = potHeight * 0.8;
            stemGroup.add(stem);

            // Detailed Leaf
            const leafShape = new THREE.Shape();
            leafShape.moveTo(0, 0);
            leafShape.quadraticCurveTo(0.12, 0.2, 0, 0.6);
            leafShape.quadraticCurveTo(-0.12, 0.2, 0, 0);
            
            const leafGeo = new THREE.ShapeGeometry(leafShape);
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.scale.set(width * 0.5, width * 0.7, 1);
            const leafPos = curve.getPoint(1);
            leaf.position.set(leafPos.x, leafPos.y + potHeight * 0.8, leafPos.z);
            leaf.rotation.z = Math.PI / 6;
            leaf.rotation.x = (Math.random() - 0.5) * 0.5;
            stemGroup.add(leaf);

            group.add(stemGroup);
        }

        return group;
    }
}
