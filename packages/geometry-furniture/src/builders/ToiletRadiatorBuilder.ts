import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import type { IFurnitureBuilder } from './IFurnitureBuilder';
import { MaterialService } from '../MaterialService';

// §04 §3.8 — IFurnitureBuilder requires an instance build(data); converted from the
// previous static API so FurnitureFactory no longer needs an adapter wrapper.
export class ToiletRadiatorBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        // §01 §3.4 — pull from MaterialService (cached) instead of new'ing per build.
        // Use a hex key so two radiators of the same color reuse one GPU material.
        const colorHex = this._toHex(data.color || '#e8e8e8');
        const baseMat = this.materialService.getMaterial(colorHex, 'standard') as THREE.MeshStandardMaterial;
        // Tune chrome look without leaking onto other consumers of this cached material.
        const metalMaterial = baseMat.clone();
        metalMaterial.metalness = 0.8;
        metalMaterial.roughness = 0.2;

        const width = data.width || 0.5;
        const height = data.height || 1.2;

        // Vertical side bars
        const sideBarGeo = new THREE.CylinderGeometry(0.015, 0.015, height, 16);

        const leftBar = new THREE.Mesh(sideBarGeo, metalMaterial);
        leftBar.position.set(-width / 2 + 0.015, height / 2, 0);
        group.add(leftBar);

        const rightBar = new THREE.Mesh(sideBarGeo, metalMaterial);
        rightBar.position.set(width / 2 - 0.015, height / 2, 0);
        group.add(rightBar);

        // Horizontal rails (ladder style)
        const railCount = 12;
        const railSpacing = (height - 0.1) / (railCount - 1);
        const railGeo = new THREE.BoxGeometry(width - 0.03, 0.04, 0.01);

        for (let i = 0; i < railCount; i++) {
            const rail = new THREE.Mesh(railGeo, metalMaterial);
            rail.position.set(0, 0.05 + i * railSpacing, 0);
            group.add(rail);
        }

        // Wall connectors
        const connectorGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.05, 12);
        const connectorPositions: Array<[number, number, number]> = [
            [-width / 2 + 0.015, height * 0.2, -0.025],
            [ width / 2 - 0.015, height * 0.2, -0.025],
            [-width / 2 + 0.015, height * 0.8, -0.025],
            [ width / 2 - 0.015, height * 0.8, -0.025],
        ];

        connectorPositions.forEach(pos => {
            const connector = new THREE.Mesh(connectorGeo, metalMaterial);
            connector.rotation.x = Math.PI / 2;
            connector.position.set(pos[0], pos[1], pos[2]);
            group.add(connector);
        });

        // Heating element / valve at bottom (LOD 350 detail)
        const valveGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const valve = new THREE.Mesh(valveGeo, metalMaterial);
        valve.position.set(width / 2 - 0.015, -0.025, 0);
        group.add(valve);

        return group;
    }

    private _toHex(color: string | number): number {
        if (typeof color === 'number') return color;
        const c = color.startsWith('#') ? color.slice(1) : color;
        const n = parseInt(c, 16);
        return Number.isFinite(n) ? n : 0xe8e8e8;
    }
}
