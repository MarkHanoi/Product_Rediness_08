import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * BedsideTableBuilder (LOD 350)
 * Creates a modern bedside table with two drawers, minimalist legs, and horizontal handles.
 * Based on the reference image provided.
 */
export class BedsideTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width || 0.42; // ~16.53in
        const length = data.length || 0.40; // ~15.75in
        const height = data.height || 0.55; // ~21.65in
        
        const legHeight = 0.22; // ~8.66in
        const bodyHeight = height - legHeight;

        // Wood color from data or default oak-like color
        const woodColor = data.color ? parseInt(data.color.replace('#', '0x')) : 0xd2b48c; 
        const woodMat = this.materialService.getMaterial(woodColor, 'standard') as THREE.MeshStandardMaterial;
        const handleColor = 0x5d4037; // Dark wood handle
        const handleMat = this.materialService.getMaterial(handleColor, 'standard') as THREE.MeshStandardMaterial;

        // 1. Main Cabinet Body
        const bodyGeo = new THREE.BoxGeometry(width, bodyHeight, length);
        const body = new THREE.Mesh(bodyGeo, woodMat);
        body.position.set(0, legHeight + bodyHeight / 2, 0);
        group.add(body);

        // 2. Drawers (Visual separation)
        const drawerGap = 0.005;
        const drawerHeight = (bodyHeight - drawerGap * 3) / 2;
        const drawerWidth = width - 0.01;
        const drawerDepth = 0.02;
        
        for (let i = 0; i < 2; i++) {
            const yPos = legHeight + drawerGap + drawerHeight / 2 + i * (drawerHeight + drawerGap);
            
            // Drawer Front
            const drawerFrontGeo = new THREE.BoxGeometry(drawerWidth, drawerHeight, drawerDepth);
            const drawerFront = new THREE.Mesh(drawerFrontGeo, woodMat);
            drawerFront.position.set(0, yPos, length / 2 + 0.001);
            group.add(drawerFront);

            // Handle (Horizontal bar as seen in image)
            const handleWidth = 0.12;
            const handleHeight = 0.015;
            const handleDepth = 0.02;
            const handleGeo = new THREE.BoxGeometry(handleWidth, handleHeight, handleDepth);
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(0, yPos + drawerHeight / 4, length / 2 + handleDepth / 2 + 0.001);
            group.add(handle);
        }

        // 3. Legs (Tapered)
        const legRadiusTop = 0.02;
        const legRadiusBottom = 0.015;
        const legGeo = new THREE.CylinderGeometry(legRadiusTop, legRadiusBottom, legHeight, 16);
        
        const inset = 0.05;
        const legPositions = [
            [width / 2 - inset, legHeight / 2, length / 2 - inset],
            [-width / 2 + inset, legHeight / 2, length / 2 - inset],
            [width / 2 - inset, legHeight / 2, -length / 2 + inset],
            [-width / 2 + inset, legHeight / 2, -length / 2 + inset]
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            // Slight tilt outward for modern look
            leg.rotation.x = pos[2] > 0 ? 0.1 : -0.1;
            leg.rotation.z = pos[0] > 0 ? 0.1 : -0.1;
            group.add(leg);
        });

        return group;
    }
}
