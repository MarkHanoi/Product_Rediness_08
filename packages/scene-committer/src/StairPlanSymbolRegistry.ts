import * as THREE from '@pryzm/renderer-three/three';

/**
 * StairPlanSymbolRegistry — O(1) tracking of stair plan-representation objects.
 *
 * PROBLEM SOLVED:
 * The `view-activated` listener in initScene.ts ran `scene.traverse()` on every
 * single view switch to find and toggle stair representation objects
 * (walking-line, break-line, direction-arrow). For large buildings this
 * visits thousands of nodes per event.
 *
 * SOLUTION:
 * Stair builders register their plan-representation meshes here at creation time.
 * The view-activated handler calls `showPlanSymbols()` / `hidePlanSymbols()` —
 * O(k) where k = number of stair objects (typically 3–15 per building).
 *
 * TYPES TRACKED:
 *   'stair-walking-line', 'stair-break-line', 'stair-direction-arrow'
 *
 * CONTRACT:
 *   §01-BIM-ENGINE-CORE §5 — no store mutations, no side effects.
 *   §05-BIM-UI-ARCHITECTURE — no UI concerns; pure scene-graph management.
 *   C04 §2 — Scene committer scope.
 *
 * Migrated: Wave A16-T3 (S122) — extracted from src/engine/subsystems/core/scene/
 */
export class StairPlanSymbolRegistry {
    private _objects: Set<THREE.Object3D> = new Set();

    /**
     * Register a stair plan-representation object.
     * Call from the stair builder immediately after adding the object to the scene.
     * The object must have `userData.type` set to one of the tracked types.
     */
    register(obj: THREE.Object3D): void {
        this._objects.add(obj);
    }

    /**
     * Unregister an object when the stair is removed from the scene.
     */
    unregister(obj: THREE.Object3D): void {
        this._objects.delete(obj);
    }

    /**
     * Show all stair plan-representation objects (plan views).
     * Replaces the scene.traverse() call in the view-activated listener.
     */
    showPlanSymbols(): void {
        for (const obj of this._objects) {
            obj.visible = true;
        }
    }

    /**
     * Hide all stair plan-representation objects (3D/elevation views).
     * Replaces the scene.traverse() call in the view-activated listener.
     */
    hidePlanSymbols(): void {
        for (const obj of this._objects) {
            obj.visible = false;
        }
    }

    /**
     * Iterate all registered plan-representation objects.
     * Used by StairSymbolTechnicalDrawingBridge (DOC-2.5c) to inject stair
     * geometry into a TechnicalDrawing without scene.traverse().
     */
    forEach(callback: (obj: THREE.Object3D) => void): void {
        this._objects.forEach(callback);
    }

    get size(): number {
        return this._objects.size;
    }
}

/**
 * Singleton instance shared across the engine.
 */
export const stairPlanSymbolRegistry = new StairPlanSymbolRegistry();
