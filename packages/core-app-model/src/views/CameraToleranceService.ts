import * as THREE from '@pryzm/renderer-three/three';

/**
 * §WALL-AUDIT-2026-W5 — Camera-Zoom-Aware World Tolerance Service
 *
 * Promoted from `PlanView2DSnapService._pixelsToWorldRadius()` so both the
 * snap pipeline (SnapManager / SnapProviders) and the post-creation join
 * pass (WallJoinResolver) consume an identical per-frame world tolerance.
 *
 * Contract (Audit §17, §18, §02 §6):
 *   • A click at zoom Z computes ONE tolerance value once.
 *   • That tolerance is applied to BOTH live preview snap AND the post-
 *     creation join pass — what the user sees during preview equals what
 *     they get after the wall lands.
 *   • The tolerance must be CLAMPED on both ends:
 *       – min ≥ MIN_WALL_LENGTH (0.05 m) so micro-zoom can't disable joins.
 *       – max ≤ MAX_SNAP_RADIUS (1.0 m) so extreme zoom-out doesn't pull
 *         every wall into a phantom junction.
 *   • Default pixel radius is 8 px, matching the visual snap-marker radius.
 *
 * Usage:
 *   const tol = getWorldToleranceForPixels(8, camera, canvas);
 *   const adjustments = WallJoinResolver.resolveLevel(walls, { snapRadius: tol });
 *   const snap = snapManager.snap(point, screenPos, false, tol);
 *
 * No global state — pure utility module.  Safe to call from any layer.
 */

/** Default pixel-radius the snap visualisation draws around the cursor. */
export const DEFAULT_SNAP_PIXEL_RADIUS = 8;

/** Lower clamp — must be ≥ wall MIN_WALL_LENGTH so joins never disappear. */
export const MIN_WORLD_TOLERANCE = 0.05;

/** Upper clamp — prevents extreme zoom-out from creating phantom junctions. */
export const MAX_WORLD_TOLERANCE = 1.0;

/** Fallback used when no orthographic camera or canvas is available. */
export const LEGACY_FALLBACK_TOLERANCE = 0.5;

export interface ToleranceOptions {
    /** Lower clamp in metres. Default {@link MIN_WORLD_TOLERANCE}. */
    min?: number;
    /** Upper clamp in metres. Default {@link MAX_WORLD_TOLERANCE}. */
    max?: number;
}

/**
 * Converts a pixel radius into a world-space radius for the active
 * OrthographicCamera, applying clamps.
 *
 * Pure mirror of the proven formula from PlanView2DSnapService:
 *
 *   viewWidth = (camera.right − camera.left) / max(camera.zoom, 0.001)
 *   worldRadius = (pixelRadius × |viewWidth|) / canvasWidth
 */
export function getWorldToleranceForPixels(
    pixelRadius: number,
    camera: THREE.OrthographicCamera | null | undefined,
    canvas: HTMLCanvasElement | null | undefined,
    opts?: ToleranceOptions,
): number {
    const min = opts?.min ?? MIN_WORLD_TOLERANCE;
    const max = opts?.max ?? MAX_WORLD_TOLERANCE;

    if (!camera || !canvas) {
        return clamp(LEGACY_FALLBACK_TOLERANCE, min, max);
    }

    const canvasWidth = canvas.clientWidth > 0 ? canvas.clientWidth : canvas.width;
    if (!canvasWidth || canvasWidth <= 0) {
        return clamp(LEGACY_FALLBACK_TOLERANCE, min, max);
    }

    const viewWidth = (camera.right - camera.left) / Math.max(camera.zoom, 0.001);
    if (!Number.isFinite(viewWidth) || viewWidth === 0) {
        return clamp(LEGACY_FALLBACK_TOLERANCE, min, max);
    }

    const worldRadius = (pixelRadius * Math.abs(viewWidth)) / canvasWidth;
    return clamp(worldRadius, min, max);
}

/**
 * Convenience overload accepting a generic THREE.Camera. Falls back to the
 * legacy tolerance when the camera is not orthographic — perspective-camera
 * tolerance is view-dependent and not applicable to plan-view snap math.
 */
export function getWorldToleranceForActiveCamera(
    pixelRadius: number,
    camera: THREE.Camera | null | undefined,
    canvas: HTMLCanvasElement | null | undefined,
    opts?: ToleranceOptions,
): number {
    if (camera instanceof THREE.OrthographicCamera) {
        return getWorldToleranceForPixels(pixelRadius, camera, canvas, opts);
    }
    const min = opts?.min ?? MIN_WORLD_TOLERANCE;
    const max = opts?.max ?? MAX_WORLD_TOLERANCE;
    return clamp(LEGACY_FALLBACK_TOLERANCE, min, max);
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
