/**
 * @file packages/renderer-three/src/ProjectOriginMarker.ts
 * @description §FEAT-PROJECT-ORIGIN (L-109) — the always-on BLUE SPHERE that marks
 *   the project origin / base point. A Revit-style **Project Base Point**: it marks
 *   the model-coordination / collaboration centre and the shared-coordinate origin
 *   (C19 §1.3 LTP-ENU / ADR-0115 project base point). Its position is driven by the
 *   L3 `ProjectOriginStore` singleton (the datum); this class only renders it.
 *
 * CONTRACT (C04 §1.1 / P2 — single THREE owner):
 *  - THREE is imported only through the sanctioned `./three-re-export` barrel that
 *    every renderer-three module uses; no `import * as THREE from 'three'` outside
 *    this package.
 *
 * Design (mirrors GroundShadowCatcher — a scene-owned always-on helper):
 *  - A small emissive-blue sphere at the datum. `castShadow = false`,
 *    `receiveShadow = false`, `renderOrder` high so it reads on top of geometry.
 *  - It is a COORDINATION DATUM GIZMO, not a normal selectable/deletable geometry
 *    element: `raycast` is disabled so it never intercepts a pick / snap / hover
 *    ray, and it is never a delete target. Repositioning the datum is done through
 *    the `projectOrigin.setPosition` command (P6), not free 3D drag — matching how
 *    Revit's Project Base Point is moved by coordinate entry, not by dragging.
 *  - `userData` carries `{ id, type, category, isProjectOrigin, selectable:false }`
 *    so the View-Intent panel's scene-traversal visibility path can toggle it by id
 *    exactly like any element (P7), and so aggregate traversals can skip it.
 *
 * Reversible: `setEnabled(false)` hides the sphere (no GPU dispose — respects the
 * ADR-0111 shadow-freeze / device-loss discipline: nothing destroyed mid-submit);
 * `detach()` removes it from the scene and `dispose()` frees its geometry + material.
 */

import * as THREE from './three-re-export';

/** userData id / name tag shared with the store singleton + View-Intent panel. */
export const PROJECT_ORIGIN_MARKER_NAME = '__pryzm_project_origin_marker__';

/** PRYZM origin blue (distinct from the #6600FF preview purple). */
const PROJECT_ORIGIN_BLUE = 0x1e6bff;

export interface ProjectOriginMarkerOptions {
    /** Sphere radius in metres. Default 0.35. */
    radius?: number;
    /** Marker colour (hex). Default PRYZM origin blue. */
    color?: number;
    /**
     * The stable element id — MUST equal the store singleton id so the
     * View-Intent panel toggles this exact mesh by `userData.id`.
     */
    id?: string;
}

/**
 * An always-on blue-sphere marker for the project origin / base point.
 * One instance per scene; owned by the editor's `initProjectOrigin` wiring.
 */
export class ProjectOriginMarker {
    private readonly _mesh: THREE.Mesh;
    private _scene: THREE.Scene | null = null;
    private _enabled = true;

    constructor(opts: ProjectOriginMarkerOptions = {}) {
        const radius = opts.radius ?? 0.35;
        const color = opts.color ?? PROJECT_ORIGIN_BLUE;
        const id = opts.id ?? PROJECT_ORIGIN_MARKER_NAME;

        const geometry = new THREE.SphereGeometry(radius, 24, 16);
        const material = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.6,
            metalness: 0.1,
            roughness: 0.35,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = PROJECT_ORIGIN_MARKER_NAME;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.renderOrder = 999; // draw on top of geometry so the datum is always legible
        // Mark as a non-selectable coordination gizmo so downstream systems treat it
        // as a toggleable View-Intent category element (by id) but never a pick /
        // delete target.
        mesh.userData = {
            id,
            type: 'project-origin',
            category: 'project-origin',
            isProjectOrigin: true,
            selectable: false,
            pickable: false,
        };
        // Belt-and-braces: transparent to every raycast (no pick / snap / hover).
        mesh.raycast = () => { /* not raycastable */ };

        this._mesh = mesh;
    }

    /** The underlying THREE mesh (read-only handle for tests / diagnostics). */
    get mesh(): THREE.Mesh { return this._mesh; }

    /** True while the marker is in the scene AND visible. */
    get enabled(): boolean { return this._enabled; }

    /** Add the marker to a scene. Idempotent per scene. */
    attach(scene: THREE.Scene): void {
        if (this._scene === scene) return;
        this.detach();
        this._scene = scene;
        scene.add(this._mesh);
    }

    /** Remove the marker from its scene (kept alive; re-attachable). */
    detach(): void {
        if (this._scene) {
            this._scene.remove(this._mesh);
            this._scene = null;
        }
    }

    /** Move the marker to the datum position (metres, world space). */
    setPosition(x: number, y: number, z: number): void {
        this._mesh.position.set(x, y, z);
    }

    /**
     * Show / hide the marker (View-Intent toggle) without destroying any GPU
     * resource (no mid-submit dispose — respects ADR-0111 discipline).
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