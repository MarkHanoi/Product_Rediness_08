import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * DiningTableBuilder (LOD 350)
 * Creates a detailed dining table with surrounding chairs.
 * Follows BIM-ENGINE-ARCHITECTURAL-CONTRACT.
 */
export class DiningTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { width, length, height } = data;

        // Colors
        const tableColor = data.color ? parseInt(data.color.replace('#', '0x')) : 0x8b4513;
        const chairLegColor = 0x8b4513;
        const chairFabricColor = 0xe0e0e0;

        const tableMat = this.materialService.getMaterial(tableColor, 'standard');
        const chairLegMat = this.materialService.getMaterial(chairLegColor, 'standard');
        const chairFabricMat = this.materialService.getMaterial(chairFabricColor, 'standard');

        // 1. Table Top (Chamfered look with two boxes)
        const topThickness = 0.04;
        const topMainGeo = new THREE.BoxGeometry(width, topThickness, length);
        const topMain = new THREE.Mesh(topMainGeo, tableMat);
        topMain.position.set(0, height - topThickness / 2, 0);
        group.add(topMain);

        const topSubGeo = new THREE.BoxGeometry(width * 0.98, 0.02, length * 0.98);
        const topSub = new THREE.Mesh(topSubGeo, tableMat);
        topSub.position.set(0, height - topThickness - 0.01, 0);
        group.add(topSub);

        // 2. Table Legs (Tapered look)
        const legTopSize = 0.06;
        const legBottomSize = 0.03;
        const legHeight = height - topThickness;
        
        const legGeo = new THREE.CylinderGeometry(legTopSize / 2, legBottomSize / 2, legHeight, 4);
        legGeo.rotateY(Math.PI / 4); // Align square faces

        const legOffsetX = width / 2 - 0.1;
        const legOffsetZ = length / 2 - 0.1;
        const legPositions = [
            [legOffsetX, legHeight / 2, legOffsetZ],
            [-legOffsetX, legHeight / 2, legOffsetZ],
            [legOffsetX, legHeight / 2, -legOffsetZ],
            [-legOffsetX, legHeight / 2, -legOffsetZ]
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, tableMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });

        // 3. Chairs (Distributed around the table)
        const chairWidth = 0.45;
        const chairPadding = 0.1;

        // Long sides
        const numChairsPerSide = Math.max(1, Math.floor(length / (chairWidth + chairPadding)));
        const sideSpacing = length / (numChairsPerSide + 1);

        for (let i = 1; i <= numChairsPerSide; i++) {
            const z = -length / 2 + i * sideSpacing;
            
            // Left Side
            const leftChair = this.buildDetailedChair(chairLegMat, chairFabricMat);
            leftChair.position.set(-width / 2 - 0.3, 0, z);
            leftChair.rotation.y = Math.PI / 2;
            group.add(leftChair);

            // Right Side
            const rightChair = this.buildDetailedChair(chairLegMat, chairFabricMat);
            rightChair.position.set(width / 2 + 0.3, 0, z);
            rightChair.rotation.y = -Math.PI / 2;
            group.add(rightChair);
        }

        return group;
    }

    private buildDetailedChair(legMat: THREE.Material, fabricMat: THREE.Material): THREE.Group {
        const chairGroup = new THREE.Group();
        const seatHeight = 0.45;
        const seatWidth = 0.45;
        const seatDepth = 0.45;

        // Legs (Tapered)
        const legGeo = new THREE.CylinderGeometry(0.02, 0.015, seatHeight, 4);
        legGeo.rotateY(Math.PI / 4);
        const legOffset = seatWidth / 2 - 0.04;
        const legPos = [
            [legOffset, seatHeight / 2, legOffset],
            [-legOffset, seatHeight / 2, legOffset],
            [legOffset, seatHeight / 2, -legOffset],
            [-legOffset, seatHeight / 2, -legOffset]
        ];
        legPos.forEach(p => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(p[0], p[1], p[2]);
            chairGroup.add(leg);
        });

        // Seat (Cushioned)
        const seatGeo = new THREE.BoxGeometry(seatWidth, 0.08, seatDepth);
        const seat = new THREE.Mesh(seatGeo, fabricMat);
        seat.position.set(0, seatHeight + 0.04, 0);
        chairGroup.add(seat);

        // Backrest (Full height, slightly curved look)
        const backHeight = 0.5;
        const backGeo = new THREE.BoxGeometry(seatWidth, backHeight, 0.06);
        const back = new THREE.Mesh(backGeo, fabricMat);
        back.position.set(0, seatHeight + 0.08 + backHeight / 2, -seatDepth / 2 + 0.03);
        back.rotation.x = -0.05; // Slight tilt
        chairGroup.add(back);

        return chairGroup;
    }
}
