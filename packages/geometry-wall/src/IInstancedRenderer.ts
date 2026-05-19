/**
 * IInstancedRenderer
 *
 * Minimal interface for the InstancedElementRenderer subset consumed by
 * WallInstanceBridge. The full implementation lives in
 * src/engine/subsystems/core/rendering/InstancedElementRenderer.ts (pending
 * Sprint H extraction).
 *
 * Having the interface here breaks the circular src→packages dependency while
 * keeping WallInstanceBridge fully type-safe.
 *
 * Sprint E P9-W10 (2026-05-10)
 */
import * as THREE from '@pryzm/renderer-three/three';

export interface IInstancedRenderer {
    /** Register (or update) an element as a GPU-instanced mesh. */
    register(
        elementId: string,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        matrix: THREE.Matrix4,
        levelId: string,
    ): void;

    /** Update the world-space transform of an already-registered element. */
    updateTransform(elementId: string, matrix: THREE.Matrix4): void;

    /** Remove an element from instanced rendering. No-op if not registered. */
    unregister(elementId: string): void;

    /** Returns true if elementId is currently registered for instanced rendering. */
    isRegistered(elementId: string): boolean;
}

/**
 * Type alias so that WallInstanceBridge can keep its `InstancedElementRenderer`
 * import name while consuming this interface (avoids touching the bridge's
 * internal constructor signature during Sprint E migration).
 */
export type InstancedElementRenderer = IInstancedRenderer;
