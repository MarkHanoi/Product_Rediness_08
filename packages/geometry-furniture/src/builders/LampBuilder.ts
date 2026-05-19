import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * LampBuilder
 * Creates a detailed floor lamp with tripod wooden legs and a cylindrical shade.
 * Follows BIM-ENGINE-ARCHITECTURAL-CONTRACT.
 */
export class LampBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const height = data.height || 1.6;
        
        const woodColor = 0x8b4513;
        const shadeColor = 0xf5f5dc; // Beige/Cream

        const woodMat = this.materialService.getMaterial(woodColor, 'standard');
        const shadeMat = this.materialService.getMaterial(shadeColor, 'standard');

        // 1. Tripod Legs (Crossed look)
        const legRadius = 0.015;
        const legHeight = height * 0.75;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
        
        const spread = 0.3;
        const angle = Math.PI * 2 / 3;
        
        for (let i = 0; i < 3; i++) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            const currentAngle = i * angle;
            
            // Position at bottom
            const x = Math.cos(currentAngle) * spread;
            const z = Math.sin(currentAngle) * spread;
            
            leg.position.set(x / 2, legHeight / 2, z / 2);
            
            // Tilt leg towards center
            leg.lookAt(new THREE.Vector3(0, height * 0.7, 0));
            leg.rotateX(Math.PI / 2); // Cylinder is Y-aligned, lookAt makes it Z-aligned
            
            group.add(leg);
        }

        // 2. Shade
        const shadeRadius = 0.25;
        const shadeHeight = 0.4;
        const shadeGeo = new THREE.CylinderGeometry(shadeRadius, shadeRadius, shadeHeight, 32);
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.set(0, height - shadeHeight / 2, 0);
        group.add(shade);

        // 3. Central Pole (Top part connecting legs to shade)
        const poleGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8);
        const pole = new THREE.Mesh(poleGeo, woodMat);
        pole.position.set(0, height - shadeHeight - 0.1, 0);
        group.add(pole);

        return group;
    }
}
