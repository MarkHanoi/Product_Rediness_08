/**
 * PlanView2DCreationMode — DOC-5.3
 *
 * Unified 2D coordinate resolver for element creation tools in plan view.
 *
 * **Problem DOC-5.3 solves:**
 * All creation tools (WallTool, SlabTool, RoomTool) resolve pointer events by
 * raycasting against the 3D ground plane. In plan view this is inherently imprecise:
 * it uses the raw OrthographicCamera projection rather than the projected
 * TechnicalDrawing edges that the user is visually aligning to.
 *
 * **What this module adds:**
 * `planView2DCreationMode.resolvePoint()` unifies the resolution logic:
 *   1. If in plan view (OrthographicCamera + TechnicalDrawing mounted):
 *      a. Try `planView2DSnapService.querySnap()` — returns the nearest snap
 *         candidate (endpoint / midpoint / perpendicular) on projected edges.
 *      b. Fall back to ground-plane raycast at `levelElevation` if no snap found.
 *   2. If in 3D view (PerspectiveCamera or no drawing mounted):
 *      → Returns null; tools fall back to their existing 3D resolution path.
 *
 * **Architecture rules (§01 §1.1, §02 §6.1):**
 * - This is a rendering-layer coordinator — it reads `activePlanDrawingRef` and
 *   calls `planView2DSnapService`; it does NOT write to any PRYZM store.
 * - Tools use the resolved THREE.Vector3 to build previews or call commands.
 *   No command execution or store mutation happens here.
 * - The singleton `planView2DCreationMode` is module-level state (not a store).
 *
 * **Integration points:**
 *   WallTool    — getWorldPoint() uses resolvePoint() as primary resolver in plan view.
 *   SlabTool    — getPlanPoint() uses resolvePoint() when isInPlanView() is true.
 *   RoomTool    — _canvasToWorld() uses resolvePoint() for all modes.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { activePlanDrawingRef } from './ActivePlanDrawingRef';
import { planView2DSnapService } from './PlanView2DSnapService';

export class PlanView2DCreationMode {
    /**
     * Returns true when the camera is orthographic AND a TechnicalDrawing is
     * currently mounted in the plan view.
     *
     * Use this guard before calling resolvePoint() to decide whether 2D mode
     * is active. When false, tools should fall through to their 3D resolution.
     */
    isInPlanView(camera: THREE.Camera): boolean {
        return camera instanceof THREE.OrthographicCamera &&
               activePlanDrawingRef.drawing !== null;
    }

    /**
     * Resolve a pointer event to a world-space THREE.Vector3.
     *
     * Resolution priority:
     *   1. 2D snap on TechnicalDrawing projected edges (plan view only)
     *   2. Ground-plane raycast at `levelElevation` (both view modes)
     *   3. null — ray misses the ground plane
     *
     * @param clientX         Pointer event clientX (viewport pixels)
     * @param clientY         Pointer event clientY (viewport pixels)
     * @param camera          The active THREE.Camera (OrthographicCamera or PerspectiveCamera)
     * @param canvas          The renderer DOM element (used for rect + snap radius conversion)
     * @param levelElevation  World-space Y of the active level (sourced from BimManager)
     *
     * @returns Resolved THREE.Vector3, or null if the ray misses the ground plane.
     */
    resolvePoint(
        clientX: number,
        clientY: number,
        camera: THREE.Camera,
        canvas: HTMLCanvasElement,
        levelElevation: number,
    ): THREE.Vector3 | null {
        // ── Step 1: 2D snap on projected TechnicalDrawing edges (plan view) ──
        const drawing2D = activePlanDrawingRef.drawing;
        if (drawing2D && camera instanceof THREE.OrthographicCamera) {
            const snap2D = planView2DSnapService.querySnap(
                clientX, clientY,
                drawing2D, camera, canvas,
                levelElevation,
            );
            if (snap2D) {
                console.log(
                    `[PlanView2DCreationMode] DOC-5.3 snap: ${snap2D.snapType}`,
                    snap2D.worldPos,
                );
                return snap2D.worldPos;
            }
        }

        // ── Step 2: Ground-plane raycast at level elevation (fallback) ────────
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        // THREE.Plane normal=(0,1,0), constant=-elevation → plane at Y=levelElevation
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelElevation);
        const intersection = new THREE.Vector3();

        return raycaster.ray.intersectPlane(groundPlane, intersection) ? intersection : null;
    }
}

/**
 * Module-level singleton — import and call directly from tool files.
 * Not registered in StoreRegistry (rendering-layer coordinator, not a store).
 */
export const planView2DCreationMode = new PlanView2DCreationMode();
