import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';

export class ChimneyBuilder implements IFurnitureBuilder {
    constructor() {}

    build(data: any): THREE.Group {
        const group = new THREE.Group();
        
        const width = data.width || 0.8;
        const length = data.length || 0.4;
        const height = data.height || 0.6; // Body height
        const color = data.color || '#222222';
        
        const mainMaterial = new THREE.MeshStandardMaterial({ color: color });
        const glassMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.3,
            metalness: 0.1,
            roughness: 0.1
        });
        
        // 1. Rounded Body (Capsule-like shape)
        // We use a combination of a box and two cylinders for the rounded ends
        const bodyGroup = new THREE.Group();
        
        const radius = length / 2;
        const straightWidth = width - length;
        
        const centerGeo = new THREE.BoxGeometry(straightWidth, height, length);
        const center = new THREE.Mesh(centerGeo, mainMaterial);
        bodyGroup.add(center);
        
        const sideGeo = new THREE.CylinderGeometry(radius, radius, height, 32);
        
        const leftSide = new THREE.Mesh(sideGeo, mainMaterial);
        leftSide.position.x = -straightWidth / 2;
        bodyGroup.add(leftSide);
        
        const rightSide = new THREE.Mesh(sideGeo, mainMaterial);
        rightSide.position.x = straightWidth / 2;
        bodyGroup.add(rightSide);
        
        // 2. Inner Firebox (Opening)
        const innerWidth = straightWidth * 0.9;
        const innerHeight = height * 0.7;
        const innerDepth = length * 0.8;
        
        const openingGeo = new THREE.BoxGeometry(innerWidth, innerHeight, innerDepth);
        const openingMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const opening = new THREE.Mesh(openingGeo, openingMat);
        opening.position.z = 0.05; // Slightly forward
        bodyGroup.add(opening);
        
        // 3. Glass Cover (Front)
        const glassGeo = new THREE.BoxGeometry(innerWidth + 0.02, innerHeight + 0.02, 0.01);
        const glass = new THREE.Mesh(glassGeo, glassMaterial);
        glass.position.z = length / 2 + 0.01;
        bodyGroup.add(glass);
        
        bodyGroup.position.y = height / 2;
        group.add(bodyGroup);
        
        // 4. Chimney Pipe (Extending upwards)
        // We assume it goes up to a standard ceiling height or just high enough
        const pipeRadius = 0.1;
        const pipeHeight = 3.0; // Extend significantly upwards
        const pipeGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, pipeHeight, 32);
        const pipe = new THREE.Mesh(pipeGeo, mainMaterial);
        pipe.position.y = height + pipeHeight / 2;
        group.add(pipe);
        
        return group;
    }
}
