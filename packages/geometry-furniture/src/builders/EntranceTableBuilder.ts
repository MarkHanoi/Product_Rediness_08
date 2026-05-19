import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * EntranceTableBuilder
 * Creates a minimalist glass entrance table (console table) with a middle shelf.
 * Based on the reference image: All-glass construction with rounded top corners.
 */
export class EntranceTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        
        // Default dimensions for a console/entrance table
        const width = data.width || 1.2;
        const length = data.length || 0.4;
        const height = data.height || 0.75;
        const thickness = 0.012; // 12mm glass
        const cornerRadius = 0.05;

        // Glass material from MaterialService
        const glassMat = this.materialService.getMaterial(0xffffff, 'standard') as THREE.MeshStandardMaterial;
        glassMat.transparent = true;
        glassMat.opacity = 0.4;
        glassMat.metalness = 0.1;
        glassMat.roughness = 0.05;

        // 1. Create the U-shape (Top and 2 Sides)
        // We'll build this using a Shape and ExtrudeGeometry to get the rounded corners
        const shape = new THREE.Shape();
        
        // Start from bottom left
        shape.moveTo(-width / 2, 0);
        // Up to top left (with radius)
        shape.lineTo(-width / 2, height - cornerRadius);
        shape.absarc(-width / 2 + cornerRadius, height - cornerRadius, cornerRadius, Math.PI, Math.PI / 2, true);
        // To top right (with radius)
        shape.lineTo(width / 2 - cornerRadius, height);
        shape.absarc(width / 2 - cornerRadius, height - cornerRadius, cornerRadius, Math.PI / 2, 0, true);
        // Down to bottom right
        shape.lineTo(width / 2, 0);
        
        // Now the inner path to give it thickness
        const innerShape = new THREE.Path();
        innerShape.moveTo(width / 2 - thickness, 0);
        innerShape.lineTo(width / 2 - thickness, height - cornerRadius);
        innerShape.absarc(width / 2 - cornerRadius, height - cornerRadius, cornerRadius - thickness, 0, Math.PI / 2, false);
        innerShape.lineTo(-width / 2 + cornerRadius, height - thickness);
        innerShape.absarc(-width / 2 + cornerRadius, height - cornerRadius, cornerRadius - thickness, Math.PI / 2, Math.PI, false);
        innerShape.lineTo(-width / 2 + thickness, 0);
        
        shape.holes.push(innerShape);

        const extrudeSettings = {
            steps: 1,
            depth: length,
            bevelEnabled: false
        };

        const mainGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const mainMesh = new THREE.Mesh(mainGeo, glassMat);
        // Center the extrusion on Z axis
        mainMesh.position.z = -length / 2;
        group.add(mainMesh);

        // 2. Middle Shelf
        const shelfHeight = height * 0.45;
        const shelfWidth = width - (thickness * 2);
        const shelfGeo = new THREE.BoxGeometry(shelfWidth, thickness, length - 0.02);
        const shelf = new THREE.Mesh(shelfGeo, glassMat);
        shelf.position.set(0, shelfHeight, 0);
        group.add(shelf);

        // 3. Small Metal Brackets for the shelf (as seen in image)
        const bracketColor = 0xcccccc;
        const bracketMat = this.materialService.getMaterial(bracketColor, 'standard');
        const bracketGeo = new THREE.BoxGeometry(0.03, 0.01, 0.04);
        
        const bracketPositions = [
            [shelfWidth / 2, shelfHeight, length / 2 - 0.05],
            [shelfWidth / 2, shelfHeight, -length / 2 + 0.05],
            [-shelfWidth / 2, shelfHeight, length / 2 - 0.05],
            [-shelfWidth / 2, shelfHeight, -length / 2 + 0.05],
        ];

        bracketPositions.forEach(pos => {
            const bracket = new THREE.Mesh(bracketGeo, bracketMat);
            bracket.position.set(pos[0], pos[1], pos[2]);
            group.add(bracket);
        });

        return group;
    }
}
