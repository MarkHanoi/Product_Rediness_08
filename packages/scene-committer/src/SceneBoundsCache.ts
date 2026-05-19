import * as THREE from '@pryzm/renderer-three/three';
import { SceneObjectClassifier } from './SceneObjectClassifier.js';

/**
 * SceneBoundsCache
 *
 * Maintains a lazy, invalidation-driven cache of the scene's world-space
 * bounding box for all BIM geometry, excluding helpers, previews, level
 * planes, and the OBC grid.
 *
 * ## Why this exists
 * Before this cache, every view switch triggered 3–6 full scene.traverse()
 * calls to compute essentially the same bounding box:
 *   - ViewController.computeSceneBounds()         → traversal #1
 *   - ViewController._computeCameraTarget()         → getFragmentBounds() → traversal #2
 *   - ViewController._computeCameraDistance()       → getFragmentBounds() → traversal #3
 *   - PlanViewService._computeSceneBoundsExcluding → traversal #4
 *   - _activateSectionView Box3.setFromObject()    → traversal #5
 *
 * With the cache, at most ONE traversal occurs per view switch cycle.
 * Subsequent calls within the same cycle return the cached result immediately.
 *
 * ## Invalidation
 * The cache is invalidated:
 *   1. Explicitly via invalidate() — called by consumers when they know
 *      geometry has changed (e.g., after element creation or project load).
 *   2. Automatically via DOM events: 'model-updated', 'ai-model-update',
 *      'bim-project-cleared', 'bim-level-added', 'bim-level-removed'.
 *
 * The cache exposes itself on window.__sceneBoundsCache so any command or
 * builder can call window.__sceneBoundsCache?.invalidate() after mutating
 * geometry without needing a direct import reference.
 *
 * Contract: 01-BIM-ENGINE-CORE §5 — no side effects, read-only scene access.
 *           02-BIM-SPATIAL-PROJECTION §2 — scene bounds authority.
 *           C04 §2 — Scene committer scope.
 *
 * Migrated: Wave A16-T3 (S122) — extracted from src/engine/subsystems/core/scene/
 */
export class SceneBoundsCache {
    private _cachedBounds: THREE.Box3 = new THREE.Box3();
    private _dirty = true;
    private _scene: THREE.Scene | null = null;
    private _gridRoot: THREE.Object3D | null = null;

    /** Events that signal geometry has changed and the cache must be rebuilt. */
    private static readonly INVALIDATING_EVENTS = [
        'model-updated',
        'ai-model-update',
        'bim-project-cleared',
        'bim-level-added',
        'bim-level-removed',
        'clear-project',
        'project-loaded',
    ] as const;

    constructor(scene: THREE.Scene, gridRoot: THREE.Object3D | null = null) {
        this._scene = scene;
        this._gridRoot = gridRoot;

        const handler = () => { this._dirty = true; };
        for (const eventName of SceneBoundsCache.INVALIDATING_EVENTS) {
            window.addEventListener(eventName, handler);
        }

        // Cast to avoid augmenting Window here (already declared in src/global-window.d.ts).
        (window as unknown as Record<string, unknown>).__sceneBoundsCache = this;
    }

    /**
     * Update the scene reference (e.g., after a project reload).
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
        this._dirty = true;
    }

    /**
     * Update the grid root reference so grid children are excluded from bounds.
     */
    setGridRoot(gridRoot: THREE.Object3D | null): void {
        this._gridRoot = gridRoot;
    }

    /**
     * Mark the cache as stale. The next call to getBounds() will recompute.
     * Call this whenever geometry-affecting operations complete.
     */
    invalidate(): void {
        this._dirty = true;
    }

    /**
     * Returns the cached bounding box, recomputing from a single scene traversal
     * only when the cache is dirty. Excludes helpers, previews, level planes,
     * BimGrid elements, and the OBC grid subtree.
     *
     * Always returns a valid THREE.Box3. When the scene is empty the box will
     * be empty (isEmpty() === true) — callers should check before using size/center.
     */
    getBounds(): THREE.Box3 {
        if (!this._dirty) {
            return this._cachedBounds;
        }
        this._rebuild();
        return this._cachedBounds;
    }

    /**
     * Returns true if the scene contains BIM geometry (i.e., the bounds are
     * not empty). Convenience method used by PlanViewService.hasFragments().
     */
    hasGeometry(): boolean {
        return !this.getBounds().isEmpty();
    }

    /**
     * Rebuilds the cache from a single scene traversal.
     * This is the ONLY place in the codebase that should traverse the full scene
     * for bounds computation purposes.
     */
    private _rebuild(): void {
        const box = new THREE.Box3();
        const scene = this._scene;

        if (!scene) {
            this._cachedBounds = box;
            this._dirty = false;
            return;
        }

        scene.traverse((obj: THREE.Object3D) => {
            if (!obj.visible) return;
            if (SceneObjectClassifier.shouldExcludeFromBounds(obj, this._gridRoot)) return;

            if (obj instanceof THREE.Mesh && obj.geometry) {
                const objBox = new THREE.Box3().setFromObject(obj);
                if (!objBox.isEmpty()) {
                    box.union(objBox);
                }
            }
        });

        this._cachedBounds = box;
        this._dirty = false;
    }
}
