import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

export class Plant07Builder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(_data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const potColor = _data.color ? (typeof _data.color === 'string' ? parseInt(_data.color.replace('#', '0x')) : _data.color) : 0x333333;
        const potMat = this.materialService.getMaterial(potColor);
        
        // Hanging Pot
        const potHeight = 0.25;
        const potRadius = 0.22;
        const potGeo = new THREE.CylinderGeometry(potRadius, potRadius * 0.7, potHeight, 32);
        const pot = new THREE.Mesh(potGeo, potMat);
        pot.position.y = potHeight / 2;
        group.add(pot);

        // Soil
        const soilGeo = new THREE.CircleGeometry(potRadius - 0.01, 32);
        const soilMat = this.materialService.getMaterial(0x2b1d12);
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = potHeight - 0.01;
        group.add(soil);

        const leafMat = this.materialService.getMaterial(0x2e7d32);

        // Detailed Hanging vines (LOD 400)
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const vinePoints = [];
            const segments = 15;
            const length = 0.8 + Math.random() * 0.6;
            
            for (let j = 0; j < segments; j++) {
                const t = j / (segments - 1);
                vinePoints.push(new THREE.Vector3(
                    Math.cos(angle) * 0.22 + Math.sin(j * 0.6) * 0.04,
                    potHeight - t * length,
                    Math.sin(angle) * 0.22 + Math.cos(j * 0.6) * 0.04
                ));
            }
            const curve = new THREE.CatmullRomCurve3(vinePoints);
            const vineGeo = new THREE.TubeGeometry(curve, 32, 0.008, 8, false);
            const vine = new THREE.Mesh(vineGeo, leafMat);
            group.add(vine);

            // Detailed heart-shaped leaves
            vinePoints.forEach((p, idx) => {
                if (idx > 1 && idx % 2 === 0) {
                    const leafGroup = new THREE.Group();
                    leafGroup.position.copy(p);
                    leafGroup.rotation.y = Math.random() * Math.PI * 2;
                    
                    const leafShape = new THREE.Shape();
                    leafShape.moveTo(0, 0);
                    leafShape.bezierCurveTo(0.04, 0.02, 0.05, 0.08, 0, 0.1);
                    leafShape.bezierCurveTo(-0.05, 0.08, -0.04, 0.02, 0, 0);
                    
                    const leafGeo = new THREE.ShapeGeometry(leafShape);
                    const leaf = new THREE.Mesh(leafGeo, leafMat);
                    leaf.rotation.x = Math.random() * Math.PI;
                    leafGroup.add(leaf);
                    group.add(leafGroup);
                }
            });
        }

        return group;
    }
}
