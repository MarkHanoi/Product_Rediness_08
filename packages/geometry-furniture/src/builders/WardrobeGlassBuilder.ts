import * as THREE from '@pryzm/renderer-three/three';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

export class WardrobeGlassBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        let width = data.width;
        let length = data.length; 
        const height = data.height;

        if (data.startPoint && data.endPoint) {
            const start = new THREE.Vector3(data.startPoint.x, 0, data.startPoint.z);
            const end = new THREE.Vector3(data.endPoint.x, 0, data.endPoint.z);
            width = start.distanceTo(end);
        }

        let color = data.color ? parseInt(data.color.replace('#', '0x')) : 0xf5f5dc; 
        if (!data.color && data.material === 'wood') color = 0x8b4513;

        const mat = this.materialService.getMaterial(color, 'standard') as THREE.MeshStandardMaterial;
        const doorFrameMat = this.materialService.getMaterial(color, 'door') as THREE.MeshStandardMaterial;
        const handleMat = this.materialService.getMaterial(0xaaaaaa, 'handle') as THREE.MeshStandardMaterial;

        // Unique material for glass - will be properly disposed by traversal logic
        const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0xadd8e6, 
            opacity: 0.4, 
            transparent: true, 
            roughness: 0.1, 
            metalness: 0.5 
        });

        const MIN_DOOR_WIDTH = 0.6;
        const MAX_DOOR_WIDTH = 1.0;
        const DOOR_THICKNESS = 0.025;
        const CARCASS_THICKNESS = 0.018;
        const SHELF_THICKNESS = 0.018;
        const DOOR_FRAME_WIDTH = 0.06; // 6cms as requested

        const GAP_MM = 0.004;
        const SHELF_CLEARANCE = 0.002;

        const HANDLE_LENGTH = 0.18;
        const HANDLE_THICKNESS = 0.015;
        const HANDLE_EDGE_OFFSET = 0.08;

        let doorCount = Math.max(1, Math.floor(width / MIN_DOOR_WIDTH));
        let doorWidth = width / doorCount;

        if (doorWidth > MAX_DOOR_WIDTH) {
            doorCount = Math.ceil(width / MAX_DOOR_WIDTH);
            doorWidth = width / doorCount;
        }

        // Handle extremely small wardrobes with compact logic
        if (doorWidth < 0.4) {
            // For very narrow wardrobes, use single door with centered handle
            doorCount = 1;
            doorWidth = width;

            // Use smaller handle for compact wardrobe
            const compactHandleLength = HANDLE_LENGTH * 0.7;

            // Create single door group with glass
            const doorGroup = new THREE.Group();
            const dW = doorWidth - GAP_MM * 2;
            const dH = height - CARCASS_THICKNESS * 2 - GAP_MM * 2;

            // Door Frame
            const topFrame = new THREE.Mesh(new THREE.BoxGeometry(dW, DOOR_FRAME_WIDTH, DOOR_THICKNESS), doorFrameMat);
            topFrame.position.set(0, dH / 2 - DOOR_FRAME_WIDTH / 2, 0);
            doorGroup.add(topFrame);

            const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(dW, DOOR_FRAME_WIDTH, DOOR_THICKNESS), doorFrameMat);
            bottomFrame.position.set(0, -dH / 2 + DOOR_FRAME_WIDTH / 2, 0);
            doorGroup.add(bottomFrame);

            const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(DOOR_FRAME_WIDTH, dH - DOOR_FRAME_WIDTH * 2, DOOR_THICKNESS), doorFrameMat);
            leftFrame.position.set(-dW / 2 + DOOR_FRAME_WIDTH / 2, 0, 0);
            doorGroup.add(leftFrame);

            const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(DOOR_FRAME_WIDTH, dH - DOOR_FRAME_WIDTH * 2, DOOR_THICKNESS), doorFrameMat);
            rightFrame.position.set(dW / 2 - DOOR_FRAME_WIDTH / 2, 0, 0);
            doorGroup.add(rightFrame);

            // Glass Panel
            const glassGeo = new THREE.BoxGeometry(dW - DOOR_FRAME_WIDTH * 2, dH - DOOR_FRAME_WIDTH * 2, 0.005);
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.z = -DOOR_THICKNESS / 4;
            glass.castShadow = false;
            glass.receiveShadow = false;
            doorGroup.add(glass);

            doorGroup.position.set(0, height / 2, length / 2 + DOOR_THICKNESS / 2);
            group.add(doorGroup);

            // Center handle for compact wardrobe
            const handleGeo = new THREE.BoxGeometry(HANDLE_THICKNESS, compactHandleLength, HANDLE_THICKNESS);
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(0, height / 2, length / 2 + DOOR_THICKNESS + 0.01);
            group.add(handle);

            this._tagForViews(group);
            return group;
        }

        // Carcass
        const bottomGeo = new THREE.BoxGeometry(width, CARCASS_THICKNESS, length);
        const bottom = new THREE.Mesh(bottomGeo, mat);
        bottom.position.set(0, CARCASS_THICKNESS / 2, 0);
        group.add(bottom);

        const topGeo = new THREE.BoxGeometry(width, CARCASS_THICKNESS, length);
        const top = new THREE.Mesh(topGeo, mat);
        top.position.set(0, height - CARCASS_THICKNESS / 2, 0);
        group.add(top);

        const leftSideGeo = new THREE.BoxGeometry(CARCASS_THICKNESS, height - CARCASS_THICKNESS * 2, length);
        const leftSide = new THREE.Mesh(leftSideGeo, mat);
        leftSide.position.set(-width / 2 + CARCASS_THICKNESS / 2, height / 2, 0);
        group.add(leftSide);

        const rightSideGeo = new THREE.BoxGeometry(CARCASS_THICKNESS, height - CARCASS_THICKNESS * 2, length);
        const rightSide = new THREE.Mesh(rightSideGeo, mat);
        rightSide.position.set(width / 2 - CARCASS_THICKNESS / 2, height / 2, 0);
        group.add(rightSide);

        const backGeo = new THREE.BoxGeometry(width - CARCASS_THICKNESS * 2, height - CARCASS_THICKNESS * 2, 0.012);
        const back = new THREE.Mesh(backGeo, mat);
        back.position.set(0, height / 2, -length / 2 + 0.006);
        group.add(back);

        if (height > 1.8) {
            const shelfGeo = new THREE.BoxGeometry(width - CARCASS_THICKNESS * 2 - SHELF_CLEARANCE * 2, SHELF_THICKNESS, length - SHELF_CLEARANCE * 2);
            const shelf = new THREE.Mesh(shelfGeo, mat);
            shelf.position.set(0, height * 0.6, 0);
            group.add(shelf);
        }

        // Glass Doors
        for (let i = 0; i < doorCount; i++) {
            const doorGroup = new THREE.Group();
            const dW = doorWidth - GAP_MM * 2;
            const dH = height - CARCASS_THICKNESS * 2 - GAP_MM * 2;

            // Door Frame
            const topFrame = new THREE.Mesh(new THREE.BoxGeometry(dW, DOOR_FRAME_WIDTH, DOOR_THICKNESS), doorFrameMat);
            topFrame.position.set(0, dH / 2 - DOOR_FRAME_WIDTH / 2, 0);
            doorGroup.add(topFrame);

            const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(dW, DOOR_FRAME_WIDTH, DOOR_THICKNESS), doorFrameMat);
            bottomFrame.position.set(0, -dH / 2 + DOOR_FRAME_WIDTH / 2, 0);
            doorGroup.add(bottomFrame);

            const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(DOOR_FRAME_WIDTH, dH - DOOR_FRAME_WIDTH * 2, DOOR_THICKNESS), doorFrameMat);
            leftFrame.position.set(-dW / 2 + DOOR_FRAME_WIDTH / 2, 0, 0);
            doorGroup.add(leftFrame);

            const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(DOOR_FRAME_WIDTH, dH - DOOR_FRAME_WIDTH * 2, DOOR_THICKNESS), doorFrameMat);
            rightFrame.position.set(dW / 2 - DOOR_FRAME_WIDTH / 2, 0, 0);
            doorGroup.add(rightFrame);

            // Glass Panel - offset slightly backward to avoid z-fighting with frame
            const glassGeo = new THREE.BoxGeometry(dW - DOOR_FRAME_WIDTH * 2, dH - DOOR_FRAME_WIDTH * 2, 0.005);
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.z = -DOOR_THICKNESS / 4; // Offset backward to avoid z-fighting
            glass.castShadow = false; // Glass shouldn't cast shadows
            glass.receiveShadow = false; // Glass shouldn't receive shadows (looks better)
            doorGroup.add(glass);

            doorGroup.position.set(
                -width / 2 + doorWidth * (i + 0.5),
                height / 2,
                length / 2 + DOOR_THICKNESS / 2
            );
            group.add(doorGroup);

            // Handle
            const handleGeo = new THREE.BoxGeometry(HANDLE_THICKNESS, HANDLE_LENGTH, HANDLE_THICKNESS);
            const handle = new THREE.Mesh(handleGeo, handleMat);
            const handleOffset = (i % 2 === 0) ? doorWidth / 2 - HANDLE_EDGE_OFFSET : -doorWidth / 2 + HANDLE_EDGE_OFFSET;
            handle.position.set(
                -width / 2 + doorWidth * (i + 0.5) + handleOffset,
                height / 2,
                length / 2 + DOOR_THICKNESS + 0.01
            );
            group.add(handle);
        }

        this._tagForViews(group);
        return group;
    }

    /**
     * §07-WARDROBE-VIEW-CONTRACT §5 — tag every Mesh under `group`:
     *   - skipInPlan: true   → plan-view projector skips the 3D edge dump.
     *     WardrobePlanSymbolBuilder draws the architectural footprint instead.
     *   - edgeAngleDeg: 30   → elevation/section collapses soft creases below
     *     30° so flat carcass / door panel seams don't render as ladders.
     */
    private _tagForViews(group: THREE.Group): void {
        group.traverse(o => {
            if (o instanceof THREE.Mesh) {
                o.userData = { ...o.userData, skipInPlan: true, edgeAngleDeg: 30 };
            }
        });
    }
}