/**
 * @file src/tools/gizmo/BlackGizmo.ts
 *
 * BlackGizmo — Phase 5 (PRYZM Selection Toolbar Tools)
 *
 * Wraps the existing Three.js TransformControls instance and applies the
 * PRYZM black-minimal visual style:
 *
 *   - Axes: near-black (#1c1c1c) with white highlight on hover
 *   - Scale: zoom-adaptive — gizmo apparent size stays constant in the viewport
 *     regardless of camera distance (matches Forma / Qonic / Snaptrude behaviour)
 *   - Plan view: Y axis fades to 20% opacity when orthographic top-down camera
 *     is detected, emphasising XZ operations
 *   - Size: 0.65× baseline (smaller and more precise than default RGB handles)
 *
 * Integration:
 *   1. Instantiate once in EngineBootstrap.ts AFTER transformControls is created.
 *   2. Call `blackGizmo.update(camera)` inside the render loop.
 *   3. The existing gizmo axis recolouring block in EngineBootstrap (violet palette)
 *      is replaced by calling `blackGizmo.applyTheme()` once after construction.
 *
 * CONTRACT §02 §4   — No geometry construction or store access.
 * CONTRACT §01 §2.1 — No store mutations; purely a visual wrapper.
 *
 * Implementation plan reference: Phase A, Step 4
 * docs/SELECTION-TOOLBAR-TOOLS-IMPLEMENTATION-PLAN.md §5
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { TransformControls } from '@pryzm/renderer-three';

/** Minimum and maximum adaptive sizes to prevent extremes. */
const MIN_SIZE = 0.30;
const MAX_SIZE = 1.80;

/** Multiplier applied to camera distance to compute gizmo size. */
const DISTANCE_FACTOR = 0.048;

/** Baseline size multiplier (relative to TransformControls default of 1.0). */
const BASELINE_SCALE = 0.65;

/** Opacity of Y axis in plan view (orthographic top-down). */
const PLAN_VIEW_Y_OPACITY = 0.18;

export class BlackGizmo {
    private _helper:  THREE.Object3D | null = null;
    private _isPlan   = false;

    // Colour used when applying the black minimal theme
    private readonly _BLACK = new THREE.Color(0x1c1c1c);

    constructor(
        private readonly _tc: TransformControls,
    ) {
        // Cache the internal helper reference once
        // TransformControls exposes getHelper() which returns the scene-add-able Object3D
        this._helper = (this._tc as any).getHelper?.() ?? null;
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Apply the black visual theme to all gizmo axis meshes.
     * Call once after TransformControls is created and added to the scene.
     * This replaces the violet axis recolouring block in EngineBootstrap.ts.
     */
    applyTheme(): void {
        if (!this._helper) {
            console.warn('[BlackGizmo] No helper found — cannot apply theme');
            return;
        }

        this._helper.traverse((obj: THREE.Object3D) => {
            const mesh = obj as THREE.Mesh | THREE.Line;
            const hasMaterial = 'material' in mesh && mesh.material;
            if (!hasMaterial) return;

            const mats = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];

            for (const mat of mats) {
                if (!mat || typeof mat !== 'object') continue;
                const m = mat as THREE.MeshBasicMaterial;
                if (m.color) {
                    // Preserve the hover/active material — only override the base colour
                    // TransformControls uses '_colorTag' on each material to store the axis
                    m.color.copy(this._BLACK);
                    m.opacity   = 0.82;
                    m.transparent = true;
                }
            }
        });

        // Set baseline size
        this._tc.setSize(BASELINE_SCALE);

        console.log('[BlackGizmo] Theme applied — black minimal style');
    }

    /**
     * Per-frame update. Call inside the render loop.
     * Handles zoom-adaptive scaling and plan-view Y axis fade.
     *
     * @param camera  The active Three.js camera.
     */
    update(camera: THREE.Camera): void {
        if (!this._tc.object) return;

        // ── Zoom-adaptive size ───────────────────────────────────────────────
        const dist = camera.position.distanceTo(this._tc.object.position);
        const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, dist * DISTANCE_FACTOR));
        this._tc.setSize(size);

        // ── Plan view detection ──────────────────────────────────────────────
        const isPlan = this._detectPlanView(camera);
        if (isPlan !== this._isPlan) {
            this._isPlan = isPlan;
            this._applyPlanViewStyle(isPlan);
        }
    }

    /**
     * Restore default Three.js gizmo style (used when detaching BlackGizmo).
     * Resets to world-space, standard size.
     */
    reset(): void {
        this._tc.setSize(1.0);
        this._isPlan = false;
    }

    dispose(): void {
        this.reset();
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /**
     * Returns true when the camera is orthographic and looking straight down.
     * "Straight down" = polar angle < 10° from top.
     */
    private _detectPlanView(camera: THREE.Camera): boolean {
        if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return false;
        // Camera looking straight down: camera.up is +Y, direction is -Y
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // dot(dir, -Y) > cos(10°) ≈ 0.985 means we are within 10° of top-down
        return dir.dot(new THREE.Vector3(0, -1, 0)) > 0.94;
    }

    /**
     * Fades the Y axis when in plan view so XZ controls are visually dominant.
     */
    private _applyPlanViewStyle(isPlan: boolean): void {
        if (!this._helper) return;
        const targetOpacity = isPlan ? PLAN_VIEW_Y_OPACITY : 0.82;

        this._helper.traverse((obj: THREE.Object3D) => {
            // Y axis objects are named 'Y', 'YZ', 'XY' etc.
            const isYAxis = obj.name.startsWith('Y');
            if (!isYAxis) return;

            const mesh = obj as THREE.Mesh;
            if (!('material' in mesh)) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
                if (mat && typeof mat === 'object') {
                    (mat as THREE.MeshBasicMaterial).opacity = targetOpacity;
                }
            }
        });
    }
}
