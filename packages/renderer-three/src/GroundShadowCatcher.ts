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

    /**
     * ── §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) ───────────────────────────
     *
     * The plane's geometry edge length in metres (what the constructor built). The
     * LIVE footprint is `_size` (≤ `_baseSize`), reached by scaling the mesh — never
     * by rebuilding geometry, so this stays a pure transform write with no GPU
     * allocation and no ADR-0111 dispose.
     *
     * WHY A LIVE FOOTPRINT EXISTS AT ALL. This plane's alpha is not a constant: on
     * three's node renderer (r183, used by BOTH the 'webgpu' and 'webgl-fallback'
     * backends) `THREE.ShadowMaterial` compiles to `ShadowNodeMaterial` →
     * `ShadowMaskModel`, whose entire body is
     *
     *     shadowMask = 1 ; direct(): shadowMask *= lightNode.shadowNode
     *     finish():  diffuseColor.a *= shadowMask.oneMinus()
     *
     * (`three/src/nodes/functions/ShadowMaskModel.js`, read 2026-08-21) — so the
     * plane paints `opacity` worth of BLACK wherever the shadow mask reads 0, and
     * `ShadowNode.setupShadowFilter` returns a mask of **1 (lit)** only OUTSIDE the
     * shadow camera's frustum. Inside it, the mask is a texture compare: a shadow map
     * that was never written, written by a foreign renderer, or written with a
     * mismatched compare function reads exactly the same as "totally in shadow".
     * **A failure of the shadow pipeline and a real shadow are the SAME VALUE**, and
     * a 4 km plane renders that failure as a viewport-wide grey field over a
     * background stack that measures pure white.
     *
     * A plane sized to the geometry that can actually shadow it cannot do that. It
     * still receives every real shadow (the throw is added by the caller), but it can
     * no longer paint anything that reads as a BACKGROUND. This is a containment
     * bound on a known failure mode, not a claim about which failure fired.
     */
    private readonly _baseSize: number;
    /** Live footprint edge length in metres (≤ {@link _baseSize}). */
    private _size: number;
    /** Live footprint centre, world X (metres). */
    private _centreX = 0;
    /** Live footprint centre, world Z (metres). */
    private _centreZ = 0;
    /** Ground datum the plane is seated on (metres); the depth bias is applied below it. */
    private _elevation = 0;

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
            // §CAM-CATCHER-NOT-MODEL (L-931) — this plane is 4 km across and centred on
            // the origin. Left in the camera-framing bounds population it does not merely
            // widen the fit, it BECOMES the subject: the founder's 3D view opened at
            // 6 505 m (a correct fit of this plane) on a parcel a few tens of metres
            // across, and §CAM-FRAME-INVARIANT verified it, because the plane really was
            // framed. Declared here, at the producer, so the ONE bounds classifier
            // (`SceneObjectClassifier.isSceneInfrastructure`) excludes it everywhere
            // rather than each framer re-discovering it. Deliberately NOT `isHelper`:
            // fifteen unrelated culling / view-range / panorama passes read that flag and
            // the catcher must keep rendering and keep receiving the shadow (L-112/L-205).
            isSceneInfrastructure: true,
        };
        // Belt-and-braces: make the invisible plane transparent to every raycast so
        // it can never intercept a pick / snap / hover ray.
        mesh.raycast = () => { /* not raycastable */ };

        this._mesh = mesh;
        this._baseSize = size;
        this._size = size;
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

    /** Move the catcher to the given ground elevation (metres). Keeps the XZ footprint. */
    setElevation(y: number): void {
        this._elevation = y;
        this._applyTransform();
    }

    /**
     * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — seat the plane over `centre` with a
     * live edge length of `size` metres.
     *
     * `size` is clamped to `(0, baseSize]`: the footprint may only ever SHRINK from
     * what the constructor built, so this can never enlarge the surface a previous
     * revision was already painting. Pure transform write — position + scale +
     * `updateMatrix()`. No geometry rebuild, no material change, no GPU allocation and
     * no dispose (ADR-0111 / §SHADOW-DEVICE-LOSS-FIX safe), and `matrixAutoUpdate`
     * stays false.
     */
    setFootprint(centreX: number, centreZ: number, size: number): void {
        if (!Number.isFinite(centreX) || !Number.isFinite(centreZ) || !Number.isFinite(size)) return;
        this._centreX = centreX;
        this._centreZ = centreZ;
        this._size = Math.min(this._baseSize, Math.max(1e-3, size));
        this._applyTransform();
    }

    /** The catcher's live world footprint (diagnostics / tests). */
    get footprint(): { centreX: number; centreZ: number; size: number; baseSize: number } {
        return { centreX: this._centreX, centreZ: this._centreZ, size: this._size, baseSize: this._baseSize };
    }

    /** Seat the plane from the current centre / size / elevation. */
    private _applyTransform(): void {
        const s = this._size / this._baseSize;
        this._mesh.scale.set(s, 1, s);
        this._mesh.position.set(
            this._centreX,
            this._elevation - GroundShadowCatcher._DEPTH_BIAS_M,
            this._centreZ,
        );
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
