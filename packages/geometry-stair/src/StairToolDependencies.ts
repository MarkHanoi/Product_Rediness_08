import * as THREE from '@pryzm/renderer-three/three';
import { StairStore } from './StairStore';
import { StairMeshBuilder } from './StairMeshBuilder';

export interface SnapPoint {
    position: THREE.Vector3;
    type: 'endpoint' | 'midpoint' | 'grid' | 'intersection';
    elementId?: string;
}

export interface SnapManager {
    findSnap(worldPos: THREE.Vector3, pointerEvent?: PointerEvent): SnapPoint | null;
    setEnabled(enabled: boolean): void;
}

export interface StairToolDependencies {
    camera: THREE.Camera;
    scene: THREE.Scene;
    commandManager: {
        execute(command: any, meta?: any): any;
    };
    stairStore?: StairStore;
    stairMeshBuilder?: StairMeshBuilder;
    snapManager?: SnapManager;
    bimManager?: {
        getActiveLevel(): { id: string; elevation: number; name: string } | null;
        registerElement(elementId: string, levelId: string): void;
        unregisterElement(elementId: string): void;
        /**
         * §STAIR-AUDIT-2026 F8 fix (FIXED 2026-04-25): exposed so the
         * StairCreationController can re-fetch level elevations on every
         * preview tick instead of using stale primitives captured at
         * activation-time.
         */
        getLevelById?: (id: string) => { id: string; elevation: number; name: string } | undefined;
    };
    getActiveLevelId?: () => string | null;
}
