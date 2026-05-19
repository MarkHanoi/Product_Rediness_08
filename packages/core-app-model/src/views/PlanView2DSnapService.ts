/**
 * PlanView2DSnapService — DOC-5.2
 *
 * Native 2D snap system on projected TechnicalDrawing edges.
 *
 * In plan view, wall placement and door placement tools snap to the projected
 * 2D edges of the TechnicalDrawing (layer 5, DOCUMENTATION_LAYER) rather than
 * raycasting against 3D mesh geometry (layer 0).
 *
 * Snap candidate priority:
 *   1. Endpoint       — closest end of any projected line segment
 *   2. Midpoint       — midpoint of any projected line segment
 *   3. Perpendicular  — foot of perpendicular from cursor to any segment
 *
 * Falls back to null when:
 *   - No TechnicalDrawing is mounted (activePlanDrawingRef.drawing is null)
 *   - The camera is not an OrthographicCamera (3D view is active)
 *   - No projected edges are within the snap radius
 *
 * Contract compliance:
 *   §01 §1.1 — Tool layer service; no store reads/writes.
 *   §01 §5   — Reads TechnicalDrawing geometry only; does not add/remove scene objects.
 *   §02 §6.1 — Tools read from this service; they may NOT mutate the drawing.
 *   §02 §6.2 — No final elements are added to scene; snap indicators are preview-only.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type * as OBC from '@thatopen/components';
import { getWorldToleranceForPixels } from './CameraToleranceService';

export interface SnapResult {
    /** Snap target in world space (Y = level elevation). */
    worldPos: THREE.Vector3;

    /** Snap type for UI indicator and logging. */
    snapType: 'endpoint' | 'midpoint' | 'perpendicular' | 'on-edge';

    /** Position in drawing-plane XZ space (for debug / indicator overlay). */
    drawingSpacePos: { x: number; y: number };
}

export class PlanView2DSnapService {

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Queries the TechnicalDrawing edge geometry for snap candidates near the
     * given screen point. Returns a world-space SnapResult or null.
     *
     * @param screenX         - clientX from the pointer event (pixels).
     * @param screenY         - clientY from the pointer event (pixels).
     * @param drawing         - The mounted OBC.TechnicalDrawing (from activePlanDrawingRef).
     * @param camera          - The active OrthographicCamera (plan view camera).
     * @param canvas          - The Three.js renderer canvas element.
     * @param levelElevation  - World Y of the active level's floor (from BimManager).
     * @param snapRadiusPx    - Pixel snap radius (default: 18px ≈ sub-pixel accuracy at 1:100).
     */
    querySnap(
        screenX: number,
        screenY: number,
        drawing: OBC.TechnicalDrawing,
        camera: THREE.Camera,
        canvas: HTMLCanvasElement,
        levelElevation: number,
        snapRadiusPx: number = 18,
    ): SnapResult | null {
        // Guard: only active in plan view (OrthographicCamera)
        if (!(camera instanceof THREE.OrthographicCamera)) return null;

        // Resolve cursor world position on the level floor plane
        const cursorWorld = this._screenToWorldXZ(screenX, screenY, camera, canvas, levelElevation);
        if (!cursorWorld) return null;

        // Convert pixel snap radius to world-space radius for the current zoom
        const worldRadius = this._pixelsToWorldRadius(snapRadiusPx, camera, canvas);
        if (worldRadius <= 0) return null;

        let bestResult: SnapResult | null = null;
        let bestDist = worldRadius;

        // Traverse all LineSegments in the TechnicalDrawing
        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const geo = child.geometry;
            if (!geo) return;

            const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;
            const count = posAttr.count;

            for (let i = 0; i < count - 1; i += 2) {
                // World-space endpoints A and B
                const a = new THREE.Vector3(
                    posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i),
                ).applyMatrix4(mat);
                const b = new THREE.Vector3(
                    posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1),
                ).applyMatrix4(mat);

                // ── 1. Endpoint A ───────────────────────────────────────────
                const dA = this._xzDist(cursorWorld, a);
                if (dA < bestDist) {
                    bestDist = dA;
                    bestResult = {
                        worldPos: new THREE.Vector3(a.x, levelElevation, a.z),
                        snapType: 'endpoint',
                        drawingSpacePos: { x: a.x, y: a.z },
                    };
                }

                // ── 2. Endpoint B ───────────────────────────────────────────
                const dB = this._xzDist(cursorWorld, b);
                if (dB < bestDist) {
                    bestDist = dB;
                    bestResult = {
                        worldPos: new THREE.Vector3(b.x, levelElevation, b.z),
                        snapType: 'endpoint',
                        drawingSpacePos: { x: b.x, y: b.z },
                    };
                }

                // ── 3. Midpoint ─────────────────────────────────────────────
                const mx = (a.x + b.x) * 0.5;
                const mz = (a.z + b.z) * 0.5;
                const mid = new THREE.Vector3(mx, 0, mz);
                const dMid = this._xzDist(cursorWorld, mid);
                if (dMid < bestDist) {
                    bestDist = dMid;
                    bestResult = {
                        worldPos: new THREE.Vector3(mx, levelElevation, mz),
                        snapType: 'midpoint',
                        drawingSpacePos: { x: mx, y: mz },
                    };
                }

                // ── 4. Perpendicular foot on segment (on-edge / perpendicular) ─
                const foot = this._closestPointOnSegment(cursorWorld, a, b);
                if (foot !== null) {
                    const dFoot = this._xzDist(cursorWorld, foot);
                    if (dFoot < bestDist) {
                        bestDist = dFoot;
                        bestResult = {
                            worldPos: new THREE.Vector3(foot.x, levelElevation, foot.z),
                            snapType: 'perpendicular',
                            drawingSpacePos: { x: foot.x, y: foot.z },
                        };
                    }
                }
            }
        });

        // Snap debug logging intentionally omitted — fires on every mousemove.

        return bestResult;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Converts screen coordinates (clientX, clientY) to world XZ by ray-plane
     * intersection at the given level elevation.
     * §02 §1.2 — elevation always provided by the caller from BimManager.
     */
    private _screenToWorldXZ(
        screenX: number,
        screenY: number,
        camera: THREE.Camera,
        canvas: HTMLCanvasElement,
        levelElevation: number,
    ): THREE.Vector3 | null {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

        // Intersect with horizontal plane at level elevation
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelElevation);
        const intersection = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, intersection)) return null;
        return intersection;
    }

    /**
     * Converts a pixel-space snap radius to a world-space radius for the
     * active OrthographicCamera. Used to make snap distance camera-zoom-invariant.
     *
     * §WALL-AUDIT-2026-W5: Delegates to the shared CameraToleranceService so
     * the pre-creation snap pipeline and post-creation join pass agree on the
     * tolerance computed for the same camera/canvas/zoom triple.
     */
    private _pixelsToWorldRadius(
        pixelRadius: number,
        camera: THREE.OrthographicCamera,
        canvas: HTMLCanvasElement,
    ): number {
        // Local snap math wants the raw computed radius without aggressive
        // upper clamping (TechnicalDrawing edges can be very close), so we
        // widen the upper bound slightly. Lower bound matches contract.
        return getWorldToleranceForPixels(pixelRadius, camera, canvas, {
            min: 1e-6,
            max: 100,
        });
    }

    /**
     * XZ-plane Euclidean distance between two world-space points (ignores Y).
     */
    private _xzDist(a: THREE.Vector3, b: THREE.Vector3): number {
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Closest point on segment AB to cursor P (XZ plane only).
     * Returns null when the segment is degenerate or when the closest point
     * is an endpoint (handled separately above, avoids double-counting).
     *
     * t ∈ [0.05, 0.95] ensures the foot is a genuine interior point, not
     * an endpoint (those are snapped above with a smaller bestDist already).
     */
    private _closestPointOnSegment(
        p: THREE.Vector3,
        a: THREE.Vector3,
        b: THREE.Vector3,
    ): THREE.Vector3 | null {
        const abX = b.x - a.x;
        const abZ = b.z - a.z;
        const lenSq = abX * abX + abZ * abZ;
        if (lenSq < 1e-10) return null; // degenerate segment

        const t = ((p.x - a.x) * abX + (p.z - a.z) * abZ) / lenSq;
        if (t < 0.05 || t > 0.95) return null; // too close to endpoint — handled above

        return new THREE.Vector3(a.x + t * abX, 0, a.z + t * abZ);
    }
}

/** Singleton — never registered in StoreRegistry. §01 §5. */
export const planView2DSnapService = new PlanView2DSnapService();
