import * as THREE from '@pryzm/renderer-three/three';

/**
 * PreviewRegistry — O(1) tracking of preview/zombie objects in the scene.
 *
 * PROBLEM SOLVED:
 * `_deepSceneCleanup()` in ViewController performed a full `scene.traverse()`
 * on EVERY view switch to find objects with `userData.isPreview === true`.
 * For a 20-level curtain wall building this visits 5,000–20,000+ nodes per switch.
 *
 * SOLUTION:
 * Builders register preview objects here at creation time. Cleanup reads directly
 * from this Set — O(1) per registered object, zero traversal.
 *
 * CONTRACT:
 *   §01-BIM-ENGINE-CORE §5 — no store mutations, no side effects.
 *   §05-BIM-UI-ARCHITECTURE — no UI concerns; pure scene-graph management.
 *   C04 §2 — Scene committer scope.
 *
 * USAGE:
 *   // When a preview mesh is added to the scene:
 *   previewRegistry.register(mesh);
 *
 *   // During view switch cleanup (replaces scene.traverse):
 *   previewRegistry.disposeAll();
 *
 * Migrated: Wave A16-T3 (S122) — extracted from src/engine/subsystems/core/scene/
 */
export class PreviewRegistry {
    private _previews: Set<THREE.Object3D> = new Set();

    /**
     * Register a preview object. Call immediately after adding to scene.
     * The object must have `userData.isPreview = true` set by the caller.
     */
    register(obj: THREE.Object3D): void {
        this._previews.add(obj);
    }

    /**
     * Unregister an object (e.g. if the preview was promoted to a real element).
     */
    unregister(obj: THREE.Object3D): void {
        this._previews.delete(obj);
    }

    /**
     * Remove and dispose all registered preview objects from the scene.
     * Called during view switch deactivation instead of scene.traverse().
     * O(k) where k = number of registered preview objects (typically 0–5).
     */
    disposeAll(): void {
        for (const obj of this._previews) {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            this._disposeObject(obj);
        }
        this._previews.clear();
    }

    /**
     * Return the count of currently tracked preview objects.
     * Useful for diagnostics.
     */
    get size(): number {
        return this._previews.size;
    }

    /**
     * Recursively dispose geometry and materials on a removed object.
     */
    private _disposeObject(obj: THREE.Object3D): void {
        obj.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (mat) mat.dispose();
                }
            }
        });
    }
}

/**
 * Singleton instance shared across the engine.
 * Builders import this directly — no dependency injection needed for a registry.
 */
export const previewRegistry = new PreviewRegistry();
