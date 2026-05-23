/**
 * StairSketchCoordinateProvider — the coordinate-transform seam that lets the
 * StairPathToolController sketch in EITHER the 2D plan view or the 3D view.
 *
 * SPEC-STAIR-3D-CREATION (2026-05-22) §3 S1. The controller's only coupling to a
 * view was `PlanViewCanvas.worldToScreen()` (used to draw the overlay polyline).
 * Abstracting that single call behind this interface makes the controller
 * view-agnostic:
 *
 *   • Plan provider — forwards to `PlanViewCanvas.worldToScreen` (today's
 *     behaviour, byte-for-byte; see `planViewSketchProvider`).
 *   • 3D provider   — projects the world XZ point (on the base-level ground
 *     plane) through the active perspective camera (see the editor's
 *     StairPath3DToolHandler).
 *
 * `screenToWorld` is intentionally NOT part of this interface: the controller
 * never converts screen→world itself — the host handler does that (the plan
 * handler via `PlanToolHandler` world points, the 3D handler via a ground-plane
 * raycast) and feeds the controller world coordinates through
 * `feedClick/feedMove`. Keeping the interface to the one method the controller
 * actually uses preserves the existing contract and avoids a leaky abstraction.
 */
export interface StairSketchCoordinateProvider {
    /** World XZ → screen position (canvas-local px) for overlay drawing. */
    worldToScreen(x: number, z: number): { sx: number; sy: number };
}

/** Minimal shape of a PlanViewCanvas that this seam needs. */
interface WorldToScreenSource {
    worldToScreen(x: number, z: number): { sx: number; sy: number };
}

/**
 * Wrap a PlanViewCanvas (or anything exposing `worldToScreen`) as a provider.
 * This is the default the controller uses when no explicit provider is supplied,
 * so the plan-view path is unchanged.
 */
export function planViewSketchProvider(canvas: WorldToScreenSource): StairSketchCoordinateProvider {
    return {
        worldToScreen: (x: number, z: number) => canvas.worldToScreen(x, z),
    };
}
