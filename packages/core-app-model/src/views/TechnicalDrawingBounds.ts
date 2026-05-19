/**
 * TechnicalDrawingBounds — computes the axis-aligned content bounding box
 * of a TechnicalDrawing by inspecting all line-segment geometry in all layers.
 *
 * The bounding box is in drawing space (X = horizontal, Z = vertical/depth).
 * Y is always 0 in drawing space (the drawing plane).
 *
 * This is used by PdfExportService and DxfExportService to:
 *   1. Size viewports correctly based on actual content, not hardcoded defaults.
 *   2. Create DrawingViewport instances with correct bounds for DxfExporter.
 *
 * Usage:
 *   const bounds = TechnicalDrawingBounds.compute(drawing);
 *   if (bounds) {
 *       const { minX, maxX, minZ, maxZ, widthM, heightM } = bounds;
 *   }
 *
 * Contract compliance:
 *   §01 §5  — Read-only; no scene or store mutation.
 *   §05     — No DOM side-effects; pure geometric utility.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

export interface DrawingBounds {
    /** Drawing-space X range (horizontal axis). */
    minX: number;
    maxX: number;
    /** Drawing-space Z range (vertical axis; up = more negative Z in OBC convention). */
    minZ: number;
    maxZ: number;
    /** Width in drawing-space metres. */
    widthM: number;
    /** Height in drawing-space metres. */
    heightM: number;
    /** Centre point in drawing space. */
    centre: THREE.Vector2;
}

export namespace TechnicalDrawingBounds {

    /**
     * Compute the bounding box of all line geometry in `drawing`.
     * Returns `null` when the drawing is empty (no vertices found).
     *
     * The drawing uses the OBC convention: visible area is Y = 0 plane,
     * horizontal = X axis, depth = Z axis.
     */
    export function compute(drawing: OBC.TechnicalDrawing): DrawingBounds | null {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let found = false;

        // Access layers via the duck-typed internal map (OBC does not expose
        // a typed public iterator but the DataMap is always iterable).
        const anyDrawing = drawing as any;

        // Primary path: drawing.viewports (OBC DrawingViewports DataMap).
        // Each viewport's camera frustum bounds give us the viewport extents.
        if (anyDrawing.viewports && typeof anyDrawing.viewports.entries === 'function') {
            for (const [, vp] of anyDrawing.viewports.entries()) {
                if (typeof vp.bbox?.min?.x === 'number') {
                    const b: THREE.Box3 = vp.bbox;
                    minX = Math.min(minX, b.min.x);
                    maxX = Math.max(maxX, b.max.x);
                    minZ = Math.min(minZ, b.min.z);
                    maxZ = Math.max(maxZ, b.max.z);
                    found = true;
                }
            }
        }

        if (found) return _buildResult(minX, maxX, minZ, maxZ);

        // Fallback path: walk all THREE.Object3D children and collect
        // LineSegments position attributes.
        const container: THREE.Object3D | undefined =
            anyDrawing.three ??
            anyDrawing._container ??
            anyDrawing.container ??
            anyDrawing.mesh;

        if (container) {
            container.traverse((obj: THREE.Object3D) => {
                if (!(obj instanceof THREE.LineSegments)) return;
                const pos = obj.geometry?.getAttribute?.('position') as
                    THREE.BufferAttribute | undefined;
                if (!pos || pos.count === 0) return;
                found = true;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    const z = pos.getZ(i);
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                }
            });
        }

        if (!found) return null;
        return _buildResult(minX, maxX, minZ, maxZ);
    }

    /**
     * Convert DrawingBounds to mm dimensions at a given drawing scale.
     * @param bounds    - Result of `compute()`.
     * @param scale     - Drawing scale denominator (e.g. 100 = 1:100).
     * @param paddingM  - Optional padding in metres on each side (default 0.5 m).
     */
    export function toMm(
        bounds: DrawingBounds,
        scale: number,
        paddingM = 0.5,
    ): { widthMm: number; heightMm: number; padX: number; padZ: number } {
        const padX = paddingM;
        const padZ = paddingM;
        const mmPerM = 1000;

        const wM = (bounds.widthM + 2 * padX);
        const hM = (bounds.heightM + 2 * padZ);

        return {
            widthMm:  wM  * mmPerM / scale,
            heightMm: hM  * mmPerM / scale,
            padX,
            padZ,
        };
    }

    /**
     * Build a `DrawingViewportConfig`-compatible bounds object from DrawingBounds.
     * Adds optional padding in drawing-space metres.
     */
    export function toViewportConfig(
        bounds: DrawingBounds,
        scale = 100,
        paddingM = 0.5,
    ): { left: number; right: number; top: number; bottom: number; scale: number } {
        return {
            left:   bounds.minX - paddingM,
            right:  bounds.maxX + paddingM,
            top:    bounds.minZ - paddingM,
            bottom: bounds.maxZ + paddingM,
            scale,
        };
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildResult(
    minX: number, maxX: number,
    minZ: number, maxZ: number,
): DrawingBounds {
    const widthM  = Math.max(0.1, maxX - minX);
    const heightM = Math.max(0.1, maxZ - minZ);
    return {
        minX, maxX, minZ, maxZ,
        widthM, heightM,
        centre: new THREE.Vector2(
            (minX + maxX) / 2,
            (minZ + maxZ) / 2,
        ),
    };
}
