/**
 * DOC-5.1 — Fast-Path Interactive Projection (Sub-50ms)
 *
 * Main-thread, synchronous, simplified projection for INTERACTIVE drag feedback.
 * Uses EdgesGeometry only (no full silhouette — just outline edges).
 *
 * NOT used for documentation output — WebWorker path (EdgeProjectorService)
 * is always used for the final TechnicalDrawing.
 *
 * Contract compliance (§01 §5, §03 §1.1):
 *   - No store writes.
 *   - No Three.js scene mutations.
 *   - Reads camera + geometry only.
 *   - Fully additive: does not modify any existing service.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { ViewDefinition } from './ViewDefinitionTypes';

/**
 * Project a single vertex (at buffer index i) from local geometry space to
 * canvas pixel coordinates.
 *
 * @param positions - BufferAttribute from EdgesGeometry's 'position' attribute.
 * @param i         - Vertex index within the buffer.
 * @param matrixWorld - The mesh's matrixWorld (local → world transform).
 * @param camera    - Active Three.js camera (Perspective or Orthographic).
 * @param canvasWidth  - Canvas pixel width.
 * @param canvasHeight - Canvas pixel height.
 */
function projectWorldToScreen(
    positions: THREE.BufferAttribute,
    i: number,
    matrixWorld: THREE.Matrix4,
    camera: THREE.Camera,
    canvasWidth: number,
    canvasHeight: number,
): { x: number; y: number } {
    const v = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i),
    );
    v.applyMatrix4(matrixWorld);
    v.project(camera);
    const x = (v.x * 0.5 + 0.5) * canvasWidth;
    const y = (1.0 - (v.y * 0.5 + 0.5)) * canvasHeight;
    return { x, y };
}

export class FastPathProjectorService {

    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;

    constructor() {
        this._canvas = document.createElement('canvas');
        this._canvas.id = 'fast-path-overlay';
        this._canvas.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'pointer-events: none',
            'z-index: 9',
        ].join(';');

        document.body.appendChild(this._canvas);

        const ctx = this._canvas.getContext('2d');
        if (!ctx) {
            throw new Error('[FastPathProjectorService] Canvas 2D context unavailable.');
        }
        this._ctx = ctx;

        this._syncCanvasSize();
        window.addEventListener('resize', () => this._syncCanvasSize());
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Spec-compliant interface (DOC-5.1).
     * Main-thread, synchronous, simplified projection for INTERACTIVE drag feedback.
     * Uses EdgesGeometry only (no full silhouette — just outline edges).
     * Target: < 50ms for up to 50 elements.
     *
     * @param element - Any Three.js Object3D (Mesh, Group, etc.) to project.
     * @param viewDef - Active ViewDefinition (reserved for future per-view styling).
     * @param ctx     - 2D canvas rendering context to draw into.
     * @param camera  - The active camera (Perspective or Orthographic).
     */
    projectImmediate(
        element: THREE.Object3D,
        _viewDef: ViewDefinition | null,
        ctx: CanvasRenderingContext2D,
        camera: THREE.Camera,
    ): void {
        const t0 = performance.now();
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;

        if (w === 0 || h === 0) return;

        element.updateWorldMatrix(true, true);

        element.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh || !mesh.geometry) return;

            const edges = new THREE.EdgesGeometry(mesh.geometry, 15);
            const positions = edges.getAttribute('position') as THREE.BufferAttribute;

            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;

            for (let i = 0; i < positions.count; i += 2) {
                const p0 = projectWorldToScreen(positions, i, mesh.matrixWorld, camera, w, h);
                const p1 = projectWorldToScreen(positions, i + 1, mesh.matrixWorld, camera, w, h);
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
            }

            ctx.stroke();
            edges.dispose();
        });

        const elapsed = performance.now() - t0;
        if (elapsed > 50) {
            console.warn(
                `[FastPathProjectorService] Budget exceeded: ${elapsed.toFixed(1)}ms` +
                ` (target < 50ms). Consider reducing preview element count.`,
            );
        } else {
            console.debug(`[FastPathProjectorService] projectImmediate: ${elapsed.toFixed(1)}ms`);
        }
    }

    /**
     * Convenience wrapper: clears the fast-path overlay, then projects using
     * the service's own managed canvas.
     * Only draws when camera is OrthographicCamera (plan view guard).
     *
     * Called by WallTool and SlabTool during pointer-move / preview rebuild.
     */
    project(element: THREE.Object3D, camera: THREE.Camera): void {
        if (!(camera instanceof THREE.OrthographicCamera)) {
            this.clearFastPath();
            return;
        }
        this._syncCanvasSize();
        this.clearFastPath();
        this.projectImmediate(element, null, this._ctx, camera);
    }

    /**
     * Clears the fast-path overlay canvas entirely.
     * Call this when the drag preview is removed / replaced by the full
     * WebWorker projection result.
     */
    clearFastPath(): void {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    /** Expose the managed canvas context (for callers that want to own the ctx). */
    get ctx(): CanvasRenderingContext2D {
        return this._ctx;
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _syncCanvasSize(): void {
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
    }
}
