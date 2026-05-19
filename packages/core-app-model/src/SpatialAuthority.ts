import * as THREE from '@pryzm/renderer-three/three';
import { BimManager, Level } from './BimKernel';

export interface WorldTransform {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
}

/**
 * §13 CONTRACT: Thrown when resolveWorldTransform() cannot determine the correct
 * elevation for an element. The forbidden L0 fallback has been removed; callers
 * must ensure every element is registered in a BIM level before requesting its
 * world transform.
 */
export class SpatialAuthorityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SpatialAuthorityError';
    }
}

/**
 * Phase 1 — Spatial & Identity Hardening
 * Single Spatial Authority Resolver
 *
 * This resolver is the ONLY authoritative way to compute an element's world transform.
 * It eliminates decentralized elevation logic and direct scene traversal dependencies.
 */
export class SpatialAuthority {
    private static instance: SpatialAuthority;
    private bimManager: BimManager | null = null;

    // FIX 1: Track registered reconciliation listener to avoid stacking multiple
    // window event listeners when resolveWorldTransform is called repeatedly.
    private _reconciliationListenerRegistered = false;

    // ✅ FIX §2.1 §4: Callback registered by the owner layer (EngineBootstrap) so
    // the reconciliation listener never touches scene objects directly.
    // The callback receives (levelId, elementIds[]) and is responsible for triggering
    // the correct store → event bus → builder rebuild pipeline.
    private _levelRebuildCallback: ((levelId: string, elementIds: string[]) => void) | null = null;

    // Injected store reference — eliminates window global read in getSemanticData
    private _roofStore: any = null;

    setRoofStore(store: { getAll?(): any[]; get?(id: string): any; getById?(id: string): any }): void {
        this._roofStore = store;
    }

    private constructor() {}

    static getInstance(): SpatialAuthority {
        if (!SpatialAuthority.instance) {
            SpatialAuthority.instance = new SpatialAuthority();
        }
        return SpatialAuthority.instance;
    }

    setBimManager(manager: BimManager) {
        this.bimManager = manager;
    }

    /**
     * ✅ FIX §2.1 §4: Register the callback that EngineBootstrap provides so the
     * reconciliation listener can trigger rebuilds through the proper pipeline
     * (store → event bus → builder) instead of mutating scene objects directly.
     *
     * Only one callback is supported; a second call replaces the previous one.
     */
    registerLevelRebuildCallback(fn: (levelId: string, elementIds: string[]) => void): void {
        this._levelRebuildCallback = fn;
    }

    /**
     * Authority: Semantic state is source of truth.
     * Resolves the world transform of an element based on its level and semantic properties.
     */
    resolveWorldTransform(elementId: string): WorldTransform {
        if (!this.bimManager) {
            throw new SpatialAuthorityError("SpatialAuthority: BimManager not initialized.");
        }

        const semanticData = this.getSemanticData(elementId);

        // Handle hosted elements (Windows/Doors)
        if (semanticData && (semanticData.type === 'window' || semanticData.type === 'door') && semanticData.wallId) {
            const wall = this.getSemanticData(semanticData.wallId);
            if (wall && wall.baseLine) {
                const [start, end] = wall.baseLine;
                const baselineVec = new THREE.Vector3().subVectors(end, start);
                const dir = baselineVec.clone().normalize();

                const pos = start.clone().add(dir.multiplyScalar(semanticData.offset));

                const wallTransform = this.resolveWorldTransform(semanticData.wallId);
                const sillHeight = semanticData.sillHeight ?? 0;
                const worldY = wallTransform.position.y + sillHeight + (semanticData.height / 2);

                return {
                    position: new THREE.Vector3(pos.x, worldY, pos.z),
                    rotation: new THREE.Euler(0, -Math.atan2(dir.z, dir.x), 0),
                    scale: new THREE.Vector3(1, 1, 1)
                };
            }
        }

        // 1. Locate element in spatial structure
        const levels = this.bimManager.getLevels();
        let targetLevel: Level | null = null;
        let lookupSucceeded = false;
        let semanticFallbackUsed = false;

        for (const level of levels) {
            if (level.childrenIds.includes(elementId)) {
                targetLevel = level;
                lookupSucceeded = true;
                break;
            }
        }

        // Authority Fallback: If element is not registered in any level, check its levelId property
        if (!targetLevel && semanticData?.levelId) {
            targetLevel = this.bimManager.getLevelById(semanticData.levelId) || null;
            if (targetLevel) semanticFallbackUsed = true;
        }

        // ✅ FIX §13: The forbidden L0 fallback has been removed.
        // Per §13, when an element cannot be located in any BIM level, we MUST throw
        // rather than silently misplace it at the fallback level's elevation.
        // The calling command is responsible for calling bimManager.registerElement()
        // before invoking resolveWorldTransform().
        if (!targetLevel) {
            throw new SpatialAuthorityError(
                `[SpatialAuthority] §13 CONTRACT VIOLATION: Element "${elementId}" is not ` +
                `registered in any BIM level and carries no valid levelId semantic data. ` +
                `A forbidden elevation fallback to L0 is prohibited per §13. ` +
                `Ensure bimManager.registerElement() is called in the responsible Command ` +
                `before resolveWorldTransform() is invoked.`
            );
        }

        const elevation = targetLevel.elevation;
        const baseOffset = semanticData?.baseOffset || 0;
        const verticalPosition = semanticData?.verticalPosition || 0;

        const worldY = elevation + baseOffset + verticalPosition;

        console.debug(`[SpatialAuthority] Resolved transform for ${elementId}:`, {
            levelId: semanticData?.levelId,
            elevation,
            lookupSucceeded,
            semanticFallbackUsed,
            worldY,
            timestamp: Date.now()
        });

        // FIX 1: Register the reconciliation listener only once.
        this.ensureReconciliationListener();

        return {
            position: new THREE.Vector3(semanticData?.x || 0, worldY, semanticData?.z || 0),
            rotation: new THREE.Euler(0, semanticData?.rotationY || 0, 0),
            scale: new THREE.Vector3(1, 1, 1)
        };
    }

    /**
     * FIX 1: Extracted to a dedicated method that guards against multiple registrations.
     *
     * ✅ FIX §2.1 §4: The reconciliation listener no longer directly mutates scene
     * objects (obj.position, obj.rotation). Instead it delegates to the registered
     * level rebuild callback, which triggers the proper store → event bus → builder
     * rebuild pipeline. If no callback is registered, a warning is logged and the
     * listener exits without touching the scene.
     */
    private ensureReconciliationListener() {
        if (this._reconciliationListenerRegistered) return;
        this._reconciliationListenerRegistered = true;

        window.addEventListener('spatial-authority-reconcile', (e: any) => {
            const { levelId } = e.detail;

            const level = this.bimManager?.getLevelById(levelId);
            if (!level) return;

            const affectedIds = Array.from(level.childrenIds as string[]);
            if (affectedIds.length === 0) return;

            if (this._levelRebuildCallback) {
                // ✅ §2.1 §4 COMPLIANT: delegate to the owner layer for rebuilds.
                this._levelRebuildCallback(levelId, affectedIds);
            } else {
                // No callback registered — warn and exit without touching the scene.
                console.warn(
                    `[SpatialAuthority] §2.1 §4: No level rebuild callback registered. ` +
                    `Skipping reconciliation for level "${levelId}". ` +
                    `Call spatialAuthority.registerLevelRebuildCallback() during engine bootstrap.`
                );
            }
        });
    }

    private getSemanticData(elementId: string): any {
        const w = window as any;
        const stores = [
            w.wallStore,
            w.slabStore,
            w.columnStore,
            w.beamStore,
            w.stairStore,
            w.curtainWallStore,
            // FIX 3: Also search roofStore and furnitureStore for completeness
            this._roofStore,
            w.furnitureStore,
        ];

        for (const store of stores) {
            if (!store) continue;
            const el = store.get ? store.get(elementId) : store.getById ? store.getById(elementId) : null;
            if (el) return el;

            // Handle sub-elements if stored in parents
            if (store.getWindow) {
                const win = store.getWindow(elementId);
                if (win) return win;
            }
            if (store.getDoor) {
                const door = store.getDoor(elementId);
                if (door) return door;
            }
        }
        return null;
    }
}

// FIX 2: Whitelist of element types eligible for spatial reconciliation,
// defined outside the listener so it's not recreated on every event.
const RECONCILABLE_TYPES = new Set([
    'Wall', 'window', 'door', 'Window', 'Door',
    'Slab', 'Column', 'Beam', 'Roof', 'Furniture',
    'CurtainWall', 'Stair', 'Handrail'
]);

export { RECONCILABLE_TYPES };

export const spatialAuthority = SpatialAuthority.getInstance();
