/**
 * @file src/core/rendering/ReflectionProbeService.ts
 * @description Phase 2 — Real-time reflection probe system for the BIM
 *   authoring viewport (Enscape benchmark target — Section 2.2).
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Creates a CubeCamera + WebGLCubeRenderTarget inside the Three.js
 *    projection layer — no semantic model impact.
 *  - Saves which materials received the probe env map and restores their
 *    original envMap on dispose().
 *  - Does NOT import @thatopen/* packages.
 *
 * Gap addressed (Audit Section 2.2 — Reflections):
 *   "Screen-space reflections only ❌ / Reflection probes ⚠️ / RT ✅"
 *   Three.js does not support screen-space reflections natively. This
 *   service implements reflection probe baking using WebGLCubeRenderTarget,
 *   which captures the scene from an interior vantage point and uses it
 *   as a local reflection environment. This is the standard Enscape approach
 *   for real-time interior visualization.
 *
 * Usage pattern:
 *   1. activate(scene, renderer, position) — bakes probe at given position
 *   2. The probe is periodically refreshed when the scene changes
 *   3. deactivate() — removes probe and restores original material envMaps
 *
 * Performance notes:
 *   - Each bake renders 6 cube faces at probeResolution²
 *   - Default resolution: 256px per face (Enscape equivalent: low quality probe)
 *   - 512px = balanced quality  |  1024px = high quality (perf cost: 4×)
 *   - Baking is async-throttled to avoid frame drops
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Types ──────────────────────────────────────────────────────────────────

export type ProbeStatus = 'inactive' | 'baking' | 'active' | 'stale';

export interface ReflectionProbeOptions {
    /** Cube face resolution in pixels — power of 2 (default: 256). */
    resolution?: number;
    /** World-space position to bake from (default: scene origin). */
    position?: THREE.Vector3;
    /** Near clip for cube camera (default: 0.1). */
    near?: number;
    /** Far clip for cube camera (default: 500). */
    far?: number;
    /** Which material types to assign the probe env map to. */
    targetTypes?: ('metal' | 'glass' | 'polished' | 'all')[];
    /**
     * Interval (ms) between automatic refreshes.
     * 0 = manual bake only (default: 0).
     */
    autoRefreshMs?: number;
}

interface MaterialEnvSnapshot {
    uuid:              string;
    originalEnvMap:    THREE.Texture | null;
    originalEnvIntensity: number;
}

// ── Class ─────────────────────────────────────────────────────────────────

export class ReflectionProbeService {
    private _cubeCamera:    THREE.CubeCamera | null     = null;
    private _cubeTarget:    THREE.WebGLCubeRenderTarget | null = null;
    private _status:        ProbeStatus                 = 'inactive';
    private _scene:         THREE.Scene | null          = null;
    private _renderer:      THREE.WebGLRenderer | null  = null;
    private _snapshots:     MaterialEnvSnapshot[]       = [];
    private _autoTimer:     ReturnType<typeof setInterval> | null = null;
    private _isBaking       = false;

    private _opts: Required<ReflectionProbeOptions> = {
        resolution:    256,
        position:      new THREE.Vector3(0, 1.5, 0), // Eye height
        near:          0.1,
        far:           500,
        targetTypes:   ['metal', 'glass', 'polished'],
        autoRefreshMs: 0,
    };

    // ── Public getters ─────────────────────────────────────────────────────

    get status(): ProbeStatus { return this._status; }
    get active(): boolean     { return this._status !== 'inactive'; }

    /** The baked cubemap texture (null when inactive). */
    get probeTexture(): THREE.CubeTexture | null {
        return this._cubeTarget?.texture ?? null;
    }

    // ── Callbacks ──────────────────────────────────────────────────────────

    onStatusChange?: (status: ProbeStatus) => void;
    onBakeComplete?: () => void;

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Activates the reflection probe at the given position, bakes cube faces,
     * and distributes the resulting env map to eligible materials in the scene.
     *
     * @param scene    - Main THREE.Scene (projection layer)
     * @param renderer - Main WebGLRenderer
     * @param opts     - Override any default options
     */
    async activate(
        scene:    THREE.Scene,
        renderer: THREE.WebGLRenderer,
        opts:     ReflectionProbeOptions = {},
    ): Promise<void> {
        if (this._status !== 'inactive') return;

        this._opts     = { ...this._opts, ...opts };
        this._scene    = scene;
        this._renderer = renderer;

        // Create the cube render target + cube camera
        this._cubeTarget = new THREE.WebGLCubeRenderTarget(this._opts.resolution, {
            type:       THREE.HalfFloatType,
            minFilter:  THREE.LinearMipmapLinearFilter,
            magFilter:  THREE.LinearFilter,
            generateMipmaps: true,
        });

        this._cubeCamera = new THREE.CubeCamera(
            this._opts.near,
            this._opts.far,
            this._cubeTarget,
        );

        this._cubeCamera.position.copy(this._opts.position);
        scene.add(this._cubeCamera);

        // Initial bake
        await this._bake();

        // Set up auto-refresh if requested
        if (this._opts.autoRefreshMs > 0) {
            this._autoTimer = setInterval(() => {
                this._bake().catch(console.warn);
            }, this._opts.autoRefreshMs);
        }
    }

    /**
     * Deactivates the probe, removes the cube camera, and restores all
     * material envMaps to their original state.
     */
    deactivate(): void {
        if (this._status === 'inactive') return;

        // Stop auto-refresh
        if (this._autoTimer !== null) {
            clearInterval(this._autoTimer);
            this._autoTimer = null;
        }

        // Restore material envMaps
        this._restoreMaterials();

        // Remove cube camera from scene
        if (this._cubeCamera && this._scene) {
            this._scene.remove(this._cubeCamera);
        }

        // Dispose GPU resources
        this._cubeTarget?.dispose();
        this._cubeCamera  = null;
        this._cubeTarget  = null;
        this._scene       = null;
        this._renderer    = null;
        this._isBaking    = false;

        this._setStatus('inactive');
        console.log('[ReflectionProbeService] Deactivated.');
    }

    /**
     * Moves the probe to a new position and re-bakes.
     * No-op if not active.
     */
    async setPosition(position: THREE.Vector3): Promise<void> {
        if (!this._cubeCamera || this._status === 'inactive') return;

        this._opts.position.copy(position);
        this._cubeCamera.position.copy(position);
        await this._bake();
    }

    /**
     * Marks the probe as stale. Call when scene geometry changes significantly.
     * If autoRefreshMs > 0 the probe will self-refresh; otherwise call bake() manually.
     */
    markStale(): void {
        if (this._status === 'active') {
            this._setStatus('stale');
        }
    }

    /**
     * Triggers a manual re-bake. Use when markStale() is called and
     * autoRefreshMs === 0.
     */
    async bake(): Promise<void> {
        await this._bake();
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ────────────────────────────────────────────────────────────

    private async _bake(): Promise<void> {
        if (this._isBaking || !this._cubeCamera || !this._scene || !this._renderer) return;
        this._isBaking = true;
        this._setStatus('baking');

        // Yield to ensure we don't block the frame
        await new Promise<void>(r => setTimeout(r, 0));

        try {
            // Temporarily hide the cube camera from its own render
            this._cubeCamera.visible = false;
            this._cubeCamera.update(this._renderer, this._scene);
            this._cubeCamera.visible = true;

            // Apply probe texture to eligible materials
            this._applyToMaterials();

            this._setStatus('active');
            this.onBakeComplete?.();

            console.log(
                `[ReflectionProbeService] Probe baked at ` +
                `(${this._opts.position.x.toFixed(1)}, ${this._opts.position.y.toFixed(1)}, ` +
                `${this._opts.position.z.toFixed(1)}) — ` +
                `${this._opts.resolution}px, applied to ${this._snapshots.length} material(s)`
            );
        } catch (err: any) {
            console.warn('[ReflectionProbeService] Bake error:', err?.message ?? err);
            this._setStatus('stale');
        } finally {
            this._isBaking = false;
        }
    }

    private _applyToMaterials(): void {
        if (!this._scene || !this._cubeTarget) return;

        const targets = this._opts.targetTypes;
        const applyAll = targets.includes('all');

        this._scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

            for (const mat of mats) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

                const alreadyPatched = this._snapshots.some(s => s.uuid === mat.uuid);

                const isMetal    = mat.metalness > 0.6;
                const isGlass    = mat.transparent && mat.opacity < 0.5;
                const isPolished = mat.roughness < 0.25 && !isMetal;

                const eligible = applyAll ||
                    (targets.includes('metal')    && isMetal)    ||
                    (targets.includes('glass')    && isGlass)    ||
                    (targets.includes('polished') && isPolished);

                if (!eligible) continue;

                // Snapshot original envMap (only once)
                if (!alreadyPatched) {
                    this._snapshots.push({
                        uuid:                 mat.uuid,
                        originalEnvMap:       mat.envMap,
                        originalEnvIntensity: mat.envMapIntensity,
                    });
                }

                // Apply probe
                mat.envMap          = this._cubeTarget!.texture;
                mat.envMapIntensity = isMetal ? 1.2 : isGlass ? 1.5 : 0.8;
                mat.needsUpdate     = true;
            }
        });
    }

    private _restoreMaterials(): void {
        if (!this._scene) return;

        const uuidMap = new Map(this._snapshots.map(s => [s.uuid, s]));

        this._scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
                const snap = uuidMap.get(mat.uuid);
                if (!snap) continue;
                mat.envMap          = snap.originalEnvMap;
                mat.envMapIntensity = snap.originalEnvIntensity;
                mat.needsUpdate     = true;
            }
        });

        this._snapshots = [];
    }

    private _setStatus(s: ProbeStatus): void {
        this._status = s;
        this.onStatusChange?.(s);
    }
}
