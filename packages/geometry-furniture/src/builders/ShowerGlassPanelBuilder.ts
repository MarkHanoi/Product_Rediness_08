import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class ShowerGlassPanelBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width || 0.9;
        const height = data.height || 2.0;
        const thickness = Number(data.properties?.thickness) || 0.01;

        // §01 §3.4 — Materials returned by MaterialService are CACHED and SHARED
        // across elements. Mutating them here used to bleed transparency / opacity
        // changes onto every other 0xffffff/standard consumer. Clone first so
        // edits stay local to this panel.
        const baseMat = this.materialService.getMaterial(0xffffff, 'standard') as THREE.MeshStandardMaterial;
        const glassMat = baseMat.clone();
        glassMat.transparent = true;
        glassMat.opacity = 0.5;
        glassMat.roughness = 0.1;
        glassMat.metalness = 0.1;

        // Simple rectangular vertical panel
        const geometry = new THREE.BoxGeometry(width, height, thickness);
        const mesh = new THREE.Mesh(geometry, glassMat);

        // Position: Bottom at 0, centered horizontally
        mesh.position.set(0, height / 2, 0);
        group.add(mesh);

        return group;
    }
}