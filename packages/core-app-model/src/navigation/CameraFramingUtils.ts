import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

// Pre-allocated reusable objects to avoid per-call allocations
const _box    = new THREE.Box3();
const _center = new THREE.Vector3();
const _size   = new THREE.Vector3();

/**
 * Frames the camera to show a specific Object3D without clipping.
 *
 * PRYZM is in real metres. The defaults below are tuned for **double-click
 * focus** so the element fills most of the viewport — see Contract §43
 * (`docs/02-decisions/contracts/43-CAMERA-FRAMING-CONTRACT.md`).
 *
 *   distance = max(maxDim * dimMult, minDist)
 *   camera   = center + (0.7, 0.5, 0.7) * distance     (≈ 1.108 * distance radial)
 *
 * Defaults (Contract §43 §2):
 *   minDist = 2.5 m   — half a typical room — close enough for a door / window,
 *                       still safely outside a 0.20 m wall.
 *   dimMult = 1.5     — gives ~40 % padding around the bounding box on a
 *                       50° vertical-FOV perspective camera.
 *
 * Callers that need a wider frame (e.g. "Zoom Extents", multi-element
 * selection) should pass larger values explicitly rather than changing the
 * defaults — those defaults are the double-click contract.
 *
 * @param object3D - The Three.js object to frame
 * @param controls - The camera-controls instance (world.camera.controls)
 * @param minDist  - Minimum safe framing distance in metres (default 2.5)
 * @param dimMult  - Multiplier on the largest dimension (default 1.5)
 */
export async function frameObject(
    object3D: THREE.Object3D,
    controls: OBC.OrthoPerspectiveCamera['controls'],
    minDist  = 2.5,
    dimMult  = 1.5,
): Promise<void> {
    _box.setFromObject(object3D);

    if (_box.isEmpty()) return;

    _box.getCenter(_center);
    _box.getSize(_size);

    const maxDim   = Math.max(_size.x, _size.y, _size.z);
    const distance = Math.max(maxDim * dimMult, minDist);

    // Offset camera to a 45-degree isometric position above and to the side.
    // Matches Pascal's [distance * 0.7, distance * 0.5, distance * 0.7] offset.
    await controls.setLookAt(
        _center.x + distance * 0.7,
        _center.y + distance * 0.5,
        _center.z + distance * 0.7,
        _center.x,
        _center.y,
        _center.z,
        true,   // animate transition
    );
}

/**
 * Frames the camera to show an arbitrary list of Three.js objects.
 * Computes the union bounding box of all provided objects.
 * Useful for framing a selection set.
 *
 * @param objects - Array of Three.js objects to frame
 * @param controls - The camera-controls instance (world.camera.controls)
 * Defaults match `frameObject` (see Contract §43 §2). Callers framing a large
 * selection set are encouraged to pass a larger `dimMult` for breathing room.
 *
 * @param minDist  - Minimum safe framing distance in metres (default 2.5)
 * @param dimMult  - Multiplier on the largest dimension (default 1.5)
 */
export async function frameObjects(
    objects: THREE.Object3D[],
    controls: OBC.OrthoPerspectiveCamera['controls'],
    minDist  = 2.5,
    dimMult  = 1.5,
): Promise<void> {
    if (objects.length === 0) return;

    const unionBox = new THREE.Box3();
    for (const obj of objects) {
        _box.setFromObject(obj);
        if (!_box.isEmpty()) unionBox.union(_box);
    }

    if (unionBox.isEmpty()) return;

    unionBox.getCenter(_center);
    unionBox.getSize(_size);

    const maxDim   = Math.max(_size.x, _size.y, _size.z);
    const distance = Math.max(maxDim * dimMult, minDist);

    await controls.setLookAt(
        _center.x + distance * 0.7,
        _center.y + distance * 0.5,
        _center.z + distance * 0.7,
        _center.x,
        _center.y,
        _center.z,
        true,
    );
}
