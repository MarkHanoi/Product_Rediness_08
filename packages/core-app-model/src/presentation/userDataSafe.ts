/**
 * userDataSafe — sealed-userData-safe write/delete helpers for THREE.Object3D.
 * packages/core-app-model/src/presentation/userDataSafe.ts
 *
 * Why this module exists
 * ----------------------
 * Several scene objects in this codebase carry a non-extensible `userData`
 * map at runtime. The most common source is `@thatopen/fragments`: every
 * Mesh, Group, and Line produced by the IFC-fragment loader has its
 * `userData` object passed through `Object.preventExtensions` (or a deep
 * `Object.freeze` / `Object.seal` in some load paths) so the loader can keep
 * its own internal invariants stable.
 *
 * A direct assignment like
 *
 *     obj.userData[MY_KEY] = value;
 *
 * silently no-ops on a non-extensible object in non-strict mode but throws
 *
 *     TypeError: Cannot add property MY_KEY, object is not extensible
 *
 * in strict mode (the default for ES modules and TypeScript output). When
 * the assignment lives inside a `scene.traverse()` callback, the throw
 * aborts the whole traversal — visual services such as VG style application,
 * view-range zoning, underlay rendering, ghost overlay, crop-region
 * filtering and physics overlay all silently break for every element after
 * the first sealed fragment.
 *
 * Strategy used by these helpers
 * ------------------------------
 * `setUD(obj, key, value)`:
 *   1. If the key already exists on `userData`, assign in place — allowed
 *      even when the object is sealed.
 *   2. Else if `userData` is extensible, assign directly (the fast path for
 *      regular Three.js objects).
 *   3. Else replace `userData` with a fresh extensible copy that contains
 *      the existing keys plus the new one. This works as long as the host
 *      object itself is extensible, which is true for normal Mesh / Line /
 *      Group instances in this app.
 *   4. If even the host object is frozen, swallow silently — the visual
 *      feature is degraded for that single object but the surrounding
 *      `scene.traverse()` walk must keep going for everything else.
 *
 * `deleteUD(obj, key)`:
 *   `delete` on a non-extensible (but not sealed) object actually succeeds.
 *   `delete` on a sealed/frozen object throws in strict mode. Wrap with
 *   try/catch so a single locked object can never abort a cleanup pass.
 *
 * Contract compliance
 * -------------------
 * - Pure utility module — no DOM, no stores, no Commands, no events.
 * - All scene-graph mutation is restricted to the `userData` map of the
 *   passed object, never to the object's transform, geometry or material.
 * - Safe to import from any subscriber/builder/service in `core/presentation`,
 *   `render/`, or `ui/`.
 */

import type * as THREE from '@pryzm/renderer-three/three';

/**
 * Safely write `value` to `obj.userData[key]`.
 *
 * See module-level doc comment for the four-step extensibility strategy.
 *
 * @param obj   Any THREE.Object3D (Mesh, Line, LineSegments, Group, …).
 * @param key   String key on `userData`.
 * @param value Value to store. Use `undefined` to mark a key as cleared
 *              while leaving it present (use {@link deleteUD} for removal).
 */
export function setUD(obj: THREE.Object3D, key: string, value: unknown): void {
    const ud = obj.userData as Record<string, unknown>;
    if (key in ud || Object.isExtensible(ud)) {
        ud[key] = value;
        return;
    }
    try {
        obj.userData = { ...ud, [key]: value };
    } catch {
        // host object frozen — cannot persist. Skip silently so the caller's
        // scene traversal is not aborted for one locked element.
    }
}

/**
 * Safely delete `obj.userData[key]`.
 *
 * `delete` on a sealed/frozen `userData` object throws in strict mode. Wrap
 * with try/catch so a single locked object never aborts a cleanup pass.
 *
 * @param obj THREE.Object3D whose userData should be cleared.
 * @param key Key to remove.
 */
export function deleteUD(obj: THREE.Object3D, key: string): void {
    try {
        delete (obj.userData as Record<string, unknown>)[key];
    } catch {
        // sealed/frozen userData — leave the stale key in place. The flag
        // will simply stay `true` until the underlying object is disposed.
    }
}
