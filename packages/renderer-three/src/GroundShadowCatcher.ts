/**
 * @file packages/renderer-three/src/GroundShadowCatcher.ts
 * @description §FEAT-GROUND-SHADOW-CATCHER (ADR-0106) — an INVISIBLE ground plane
 *   that receives (but never casts) shadows, so every element in the scene reads
 *   as grounded even when there is no floor slab beneath it.
 *
 * CONTRACT (C04 §1.1 / P2 — single THREE owner):
 *  - THREE is imported only through the sanctioned `./three-re-export` barrel that
 *    every renderer-three module uses; no `import * as THREE from 'three'` outside
 *    this package.
 *
 * Design (coordinated with the scene's shadow subsystem):
 *  - The catcher uses `THREE.ShadowMaterial`, which is fully transparent EXCEPT
 *    where a shadow falls on it — so the ground itself is invisible and only the
 *    contact shadow shows. `opacity < 0.5` also means `PascalSceneLighting`'s
 *    shadow-flag traversal skips it (its transparent-mesh guard), so the catcher
 *    is never turned into a shadow CASTER — it adds ZERO casters to the shadow
 *    pass and cannot regress §PERF-HEAVY-SHADOW-OFF (which gates the ONE real
 *    caster, the key light) or the ADR-0111 shadow-freeze paths.
 *  - `castShadow = false`, `receiveShadow = true`.
 *  - `raycast` is disabled so the invisible plane can never intercept a pick /
 *    snap / hover ray — clicking empty ground behaves exactly as before.
 *  - It sits a hair BELOW the ground datum so a real floor slab at the same
 *    elevation always wins the depth test (no z-fighting); the catcher only shows
 *    through where there is no slab.
 *
 * Reversible: `setEnabled(false)` hides the plane (no GPU dispose — respects
 * §SHADOW-DEVICE-LOSS-FIX / ADR-0111: nothing is destroyed mid-submit); `detach()`
 * removes it from the scene and `dispose()` frees its geometry + material.
 */

import * as THREE from './three-re-export';

/** userData role + name tag used to identify (and skip) the catcher mesh. */
export const GROUND_SHADOW_CATCHER_NAME = '__pryzm_ground_shadow_catcher__';

export interface GroundShadowCatcherOptions {
    /** Edge length of the (square) catcher plane in metres. Default 4000. */
    size?: number;
    /** Shadow darkness where a shadow falls (0 = none, 1 = black). Default 0.32. */
    opacity?: number;
    /** World-space Y of the ground datum (L0 elevation). Default 0. */
    elevation?: number;
}

/**
 * An invisible, shadow-receiving ground plane. One instance per scene; owned by
 * the RealEnvironmentService.
 */
export class GroundShadowCatcher {
    private readonly _mesh: THREE.Mesh;
    private _scene: THREE.Scene | null = null;
    private _enabled = true;
    /** Tiny downward bias so a coincident floor slab always wins the depth test. */
    private static readonly _DEPTH_BIAS_M = 0.01;

    constructor(opts: GroundShadowCatcherOptions = {}) {
        const size = opts.size ?? 4000;
        const opacity = opts.opacity ?? 0.32;

        const geometry = new THREE.PlaneGeometry(size, size);
        // Lay the plane flat in the XZ ground plane (default PlaneGeometry is XY).
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.ShadowMaterial({ opacity });
        material.transparent = true;
        material.depthWrite = false; // never occlude — it is a receive-only surface

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = GROUND_SHADOW_CATCHER_NAME;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.renderOrder = -1; // draw before opaque geometry
        mesh.matrixAutoUpdate = false;
        // Mark as a non-selectable helper so downstream systems ignore it.
        mesh.userData = {
            role: 'ground-shadow-catcher',
            pickable: false,
            isGroundShadowCatcher: true,
        };
        // Belt-and-braces: make the invisible plane transparent to every raycast so
        // it can never intercept a pick / snap / hover ray.
        mesh.raycast = () => { /* not raycastable */ };

        this._mesh = mesh;
        this.setElevation(opts.elevation ?? 0);
    }

    /** The underlying THREE mesh (read-only handle for tests / diagnostics). */
    get mesh(): THREE.Mesh { return this._mesh; }

    /** True while the catcher is in the scene AND visible. */
    get enabled(): boolean { return this._enabled; }

    /** Add the catcher to a scene. Idempotent per scene. */
    attach(scene: THREE.Scene): void {
        if (this._scene === scene) return;
        this.detach();
        this._scene = scene;
        scene.add(this._mesh);
    }

    /** Remove the catcher from its scene (kept alive; re-attachable). */
    detach(): void {
        if (this._scene) {
            this._scene.remove(this._mesh);
            this._scene = null;
        }
    }

    /** Move the catcher to the given ground elevation (metres). */
    setElevation(y: number): void {
        this._mesh.position.set(0, y - GroundShadowCatcher._DEPTH_BIAS_M, 0);
        this._mesh.updateMatrix();
    }

    /**
     * Show / hide the catcher without destroying any GPU resource (no mid-submit
     * dispose — respects ADR-0111 / §SHADOW-DEVICE-LOSS-FIX).
     */
    setEnabled(enabled: boolean): void {
        this._enabled = enabled;
        this._mesh.visible = enabled;
    }

    /** Free the geometry + material. Detaches first. */
    dispose(): void {
        this.detach();
        this._mesh.geometry.dispose();
        (this._mesh.material as THREE.Material).dispose();
    }
}
