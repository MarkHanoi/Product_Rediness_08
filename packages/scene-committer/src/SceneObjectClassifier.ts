import * as THREE from '@pryzm/renderer-three/three';

/**
 * SceneObjectClassifier
 *
 * Shared, stateless utility for classifying scene objects.
 * Replaces duplicate _isGridObject / _isHelperObject implementations
 * that previously existed in both ViewController and PlanViewService.
 *
 * Contract: 01-BIM-ENGINE-CORE §5 (No Side Effects — pure functions only)
 * C04 §2 — Scene committer scope.
 *
 * Migrated: Wave A16-T3 (S122) — extracted from src/engine/subsystems/core/scene/
 */
export class SceneObjectClassifier {
    /**
     * Returns true if `obj` is part of the OBC SimpleGrid subtree.
     * Walks the parent chain from `obj` up to gridRoot.
     * O(depth) — typically 1-3 steps for grid children.
     */
    static isGridObject(obj: THREE.Object3D, gridRoot: THREE.Object3D | null | undefined): boolean {
        if (!gridRoot) return false;
        let current: THREE.Object3D | null = obj;
        while (current) {
            if (current === gridRoot) return true;
            current = current.parent;
        }
        return false;
    }

    /**
     * Returns true if `obj` is a Three.js helper, transform control plane/gizmo,
     * or any object explicitly tagged userData.isHelper = true.
     */
    static isHelperObject(obj: THREE.Object3D): boolean {
        return obj instanceof THREE.AxesHelper ||
               obj instanceof THREE.GridHelper ||
               obj instanceof THREE.CameraHelper ||
               obj instanceof THREE.DirectionalLightHelper ||
               obj instanceof THREE.PointLightHelper ||
               obj instanceof THREE.SpotLightHelper ||
               obj.type === 'TransformControlsPlane' ||
               obj.type === 'TransformControlsGizmo' ||
               obj.userData?.isHelper === true;
    }

    /**
     * Returns true if this object is a preview/cursor/ghost mesh that
     * tools place temporarily during interactive placement.
     */
    static isPreviewObject(obj: THREE.Object3D): boolean {
        return obj.userData?.isPreview === true;
    }

    /**
     * Returns true if this object represents a BimLevel (level plane).
     * Level planes should be excluded from camera framing bounds.
     */
    static isBimLevelObject(obj: THREE.Object3D): boolean {
        return obj.userData?.elementType === 'BimLevel';
    }

    /**
     * Returns true if this object represents a BimGrid (structural grid line).
     * Grid elements should be excluded from camera framing bounds.
     */
    static isBimGridElement(obj: THREE.Object3D): boolean {
        return obj.userData?.elementType === 'BimGrid';
    }

    /**
     * Returns true if this object should be excluded from scene bounds computation.
     * Consolidates all exclusion checks into one call.
     */
    static shouldExcludeFromBounds(
        obj: THREE.Object3D,
        gridRoot: THREE.Object3D | null | undefined
    ): boolean {
        return SceneObjectClassifier.isGridObject(obj, gridRoot) ||
               SceneObjectClassifier.isHelperObject(obj) ||
               SceneObjectClassifier.isPreviewObject(obj) ||
               SceneObjectClassifier.isBimLevelObject(obj) ||
               SceneObjectClassifier.isBimGridElement(obj);
    }
}
