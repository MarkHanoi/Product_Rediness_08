import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class CoffeeTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width || 1.0;
        const length = data.length || 0.6;
        const height = data.height || 0.45;

        const woodColor = 0x8b4513;
        const woodMat = this.materialService.getMaterial(woodColor, 'standard') as THREE.MeshStandardMaterial;

        // Elliptical Top
        // We use a CylinderGeometry with radiusTop/Bottom and scale it to make it elliptical
        const topThickness = 0.05;
        const topGeo = new THREE.CylinderGeometry(0.5, 0.5, topThickness, 32);
        const top = new THREE.Mesh(topGeo, woodMat);
        
        // Scale to match width and length
        top.scale.set(width, 1, length);
        top.position.set(0, height - topThickness / 2, 0);
        group.add(top);

        // 4 Legs
        const legRadius = 0.02;
        const legHeight = height - topThickness;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
        
        const insetX = width * 0.25;
        const insetZ = length * 0.25;
        
        const legPositions = [
            [insetX, insetZ],
            [-insetX, insetZ],
            [insetX, -insetZ],
            [-insetX, -insetZ]
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(pos[0], legHeight / 2, pos[1]);
            group.add(leg);
        });

        return group;
    }
}
