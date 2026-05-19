/**
 * @file src/core/rendering/AutoOrbitGenerator.ts
 * @description Generates a circular orbit camera path around the scene centroid.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - Read-only: reads the scene's bounding box but does NOT mutate any store.
 *  - Output: injects synthetic camera keyframes into a CameraPathAnimator instance.
 *  - The live viewport camera is NOT moved during generation; positions are computed
 *    synthetically and passed to CameraPathAnimator.addKeyframe().
 *
 * Usage:
 *   const count = generateAutoOrbit(animator, scene, camera);
 *   // animator now has `count` keyframes; call animator.recordVideo() to record.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { CameraPathAnimator } from './CameraPathAnimator';

export interface OrbitOptions {
    /** Number of orbit keyframes (default 8). */
    keyframeCount?: number;
    /** Orbit radius in scene units. Auto-derived from scene bounds when omitted. */
    radius?:        number;
    /** Camera height in scene units above centroid Y. Auto-derived when omitted. */
    height?:        number;
    /** Camera vertical tilt angle in degrees (0 = horizontal). Default 25. */
    tiltDeg?:       number;
    /** Camera field-of-view in degrees. Default 55. */
    fov?:           number;
}

// ── Scene centroid helper ──────────────────────────────────────────────────────

/**
 * Computes the bounding box centroid of renderable mesh geometry in the scene,
 * ignoring lights, cameras, and helper objects.
 */
function computeSceneCentroid(scene: THREE.Object3D): { centroid: THREE.Vector3; radius: number } {
    const box = new THREE.Box3();
    let hasGeometry = false;

    scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            if (mesh.geometry) {
                mesh.geometry.computeBoundingBox();
                const local = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
                box.union(local);
                hasGeometry = true;
            }
        }
    });

    const centroid = new THREE.Vector3();
    if (hasGeometry) {
        box.getCenter(centroid);
    }

    const size = new THREE.Vector3();
    if (hasGeometry) box.getSize(size);
    const autoRadius = Math.max(size.x, size.z) * 0.75 + 5;

    return { centroid, radius: autoRadius };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates a circular orbit path around the scene centroid and injects
 * keyframes into the given CameraPathAnimator, clearing any existing ones first.
 *
 * @param animator - CameraPathAnimator instance to populate.
 * @param scene    - THREE.js scene (or its parent Object3D) to orbit around.
 * @param options  - Optional tuning parameters.
 * @returns The number of keyframes generated.
 */
export function generateAutoOrbit(
    animator: CameraPathAnimator,
    scene:    THREE.Object3D,
    options?: OrbitOptions,
): number {
    const {
        keyframeCount = 8,
        tiltDeg       = 25,
        fov           = 55,
    } = options ?? {};

    const { centroid, radius: autoRadius } = computeSceneCentroid(scene);
    const radius = options?.radius ?? autoRadius;
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const height  = options?.height ?? (centroid.y + radius * Math.sin(tiltRad));

    // Replace any existing manual keyframes with the generated orbit path.
    animator.clearKeyframes();

    for (let i = 0; i < keyframeCount; i++) {
        const angle    = (i / keyframeCount) * Math.PI * 2;
        const x        = centroid.x + radius * Math.cos(angle);
        const z        = centroid.z + radius * Math.sin(angle);
        const position = new THREE.Vector3(x, height, z);

        // Build a synthetic camera that faces the centroid from this orbit position.
        const cam = new THREE.PerspectiveCamera(fov);
        cam.position.copy(position);
        cam.lookAt(centroid);
        cam.updateMatrixWorld(true);

        animator.addKeyframe(cam, `Orbit ${i + 1}`);
    }

    return keyframeCount;
}
