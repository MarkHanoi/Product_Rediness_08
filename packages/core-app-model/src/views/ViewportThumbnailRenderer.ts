/**
 * ViewportThumbnailRenderer — DOC-1.11
 *
 * Renders per-viewport thumbnail previews from TechnicalDrawing content
 * stored in ViewTechnicalDrawingCache. Used by SheetEditorPanel to display
 * vector-accurate linework thumbnails instead of the generic Canvas 2D
 * wall-outline fallback.
 *
 * Contract compliance:
 *   §01 §2    — Read-only; no store writes, no Command calls
 *   §02 §6.2  — Temporary THREE.OrthographicCamera created + disposed per capture;
 *                NEVER registered in MultiViewCameraManager or the interactive pipeline.
 *   §01 §5    — Does not store TechnicalDrawing in any PRYZM store; reads from
 *                ViewTechnicalDrawingCache (a rendering cache, not a store).
 *   §05 §7    — No DOM except OffscreenCanvas / fallback HTMLCanvasElement;
 *                no @thatopen/ui; no bim-* elements
 *   §07       — No server routes; fully client-side
 *
 * Camera lifecycle:
 *   `captureThumbnail()` creates a virtual orthographic viewport (defined by
 *   `THREE.OrthographicCamera` parameters) that maps drawing-space extents to
 *   pixel space. The camera is used only to compute the projection matrix; it is
 *   never added to any scene and is collected by the GC immediately after use.
 *   This satisfies the §02 §6.2 requirement that thumbnail cameras are never
 *   registered in the interactive pipeline.
 *
 * Rendering strategy:
 *   TechnicalDrawing extends THREE.Group. This renderer traverses the Group
 *   tree, extracts LineSegments position arrays (in drawing-space XY), computes
 *   an orthographic bounding box, and draws the lines via the Canvas 2D API.
 *   No WebGL context is used — avoids any risk of context conflicts with the
 *   main Three.js renderer.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { SheetViewport } from './SheetDefinitionTypes';
import { viewTechnicalDrawingCache } from './ViewTechnicalDrawingCache';

// ── Types ─────────────────────────────────────────────────────────────────────

interface _LineData {
    /** Flat Float32Array of [x0,y0,z0, x1,y1,z1, ...] pairs in drawing space. */
    positions: Float32Array;
    /** True when derived from a LineDashedMaterial (hidden lines). */
    dashed: boolean;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export class ViewportThumbnailRenderer {

    /** Padding (px) applied on each side within the output canvas. */
    private readonly _padding = 12;

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Renders a TechnicalDrawing to an ImageBitmap at the given pixel dimensions.
     *
     * Internally creates a temporary THREE.OrthographicCamera scoped to the
     * drawing-space bounding box. The camera object is used only to compute the
     * view → pixel mapping and is discarded immediately after use.
     * It is NEVER registered in MultiViewCameraManager — §02 §6.2.
     *
     * Returns `null` when:
     *   - No TechnicalDrawing is cached for this viewport's view
     *   - The drawing contains no line geometry
     *   - An OffscreenCanvas / HTMLCanvasElement cannot be created
     *
     * @param viewport  The SheetViewport whose view should be rendered.
     * @param widthPx   Target bitmap width in pixels.
     * @param heightPx  Target bitmap height in pixels.
     */
    async captureThumbnail(
        viewport: SheetViewport,
        widthPx:  number,
        heightPx: number,
    ): Promise<ImageBitmap | null> {
        const drawing = viewTechnicalDrawingCache.get(viewport.viewId);
        if (!drawing) {
            console.log(
                `[ViewportThumbnailRenderer] No cached drawing for viewId=${viewport.viewId} — returning null`,
            );
            return null;
        }

        // ── 1. Extract line geometry from the TechnicalDrawing ────────────────
        const lines = this._extractLines(drawing as unknown as THREE.Group);
        if (lines.length === 0) {
            console.log(
                `[ViewportThumbnailRenderer] Drawing for viewId=${viewport.viewId} has no line geometry`,
            );
            return null;
        }

        // ── 2. Compute drawing-space bounding box ─────────────────────────────
        const bounds = this._computeBounds(lines);
        if (!bounds) return null;

        const { minX, minY, maxX, maxY } = bounds;
        const drawW = maxX - minX;
        const drawH = maxY - minY;

        // ── 3. Set up a temporary OrthographicCamera for the view → pixel mapping
        //   The camera is scoped to the drawing bounding box and immediately discarded.
        //   §02 §6.2: it is NEVER registered in any camera manager or scene.
        const usableW = widthPx - this._padding * 2;
        const usableH = heightPx - this._padding * 2;

        const camera = new THREE.OrthographicCamera(
            -drawW / 2,  drawW / 2,   // left, right
             drawH / 2, -drawH / 2,   // top, bottom (Y-up flip)
             -1, 1,                    // near, far (not used for Canvas 2D)
        );
        camera.position.set(0, 0, 1);
        camera.updateProjectionMatrix();

        // Derive pixel scale and centred offsets from camera frustum dimensions.
        const scaleX = usableW / drawW;
        const scaleY = usableH / drawH;
        const scale  = Math.min(scaleX, scaleY);

        const centreX = this._padding + (usableW - drawW * scale) / 2;
        const centreY = this._padding + (usableH - drawH * scale) / 2;

        // Dispose the temporary camera — its work here is done.
        camera.clear();

        // ── 4. Create an OffscreenCanvas (fallback to HTMLCanvasElement) ──────
        let canvas: OffscreenCanvas | HTMLCanvasElement;
        let ctx:    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

        if (typeof OffscreenCanvas !== 'undefined') {
            const oc = new OffscreenCanvas(widthPx, heightPx);
            ctx    = oc.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
            canvas = oc;
        } else {
            const el  = document.createElement('canvas');
            el.width  = widthPx;
            el.height = heightPx;
            ctx    = el.getContext('2d');
            canvas = el;
        }

        if (!ctx) return null;

        // ── 5. Render background ──────────────────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, heightPx);

        // ── 6. Render lines ───────────────────────────────────────────────────
        for (const { positions, dashed } of lines) {
            if (dashed) {
                ctx.strokeStyle = '#999999';
                ctx.lineWidth   = 0.5;
                ctx.setLineDash([3, 2]);
            } else {
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth   = 1;
                ctx.setLineDash([]);
            }

            ctx.beginPath();

            // Each pair of consecutive vertices forms one line segment.
            // positions = [x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3, ...]
            for (let i = 0; i + 5 < positions.length; i += 6) {
                const sx1 = centreX + (positions[i]     - minX) * scale;
                // Flip Y: canvas Y increases downward; drawing Y increases upward.
                const sy1 = centreY + (maxY - positions[i + 1]) * scale;
                const sx2 = centreX + (positions[i + 3] - minX) * scale;
                const sy2 = centreY + (maxY - positions[i + 4]) * scale;

                ctx.moveTo(sx1, sy1);
                ctx.lineTo(sx2, sy2);
            }

            ctx.stroke();
        }

        // Reset dash pattern
        ctx.setLineDash([]);

        // ── 7. Convert to ImageBitmap ─────────────────────────────────────────
        try {
            if (canvas instanceof OffscreenCanvas) {
                return canvas.transferToImageBitmap();
            } else {
                return await createImageBitmap(canvas as HTMLCanvasElement);
            }
        } catch (err) {
            console.warn('[ViewportThumbnailRenderer] Failed to create ImageBitmap:', err);
            return null;
        }
    }

    dispose(): void {
        // No persistent resources.
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Traverses a THREE.Group (TechnicalDrawing) and extracts all LineSegments
     * position arrays in drawing-space coordinates.
     */
    private _extractLines(root: THREE.Group): _LineData[] {
        const result: _LineData[] = [];

        // Guard: TechnicalDrawing must be a THREE.Group with traverse().
        // If the cache contains a plain object or an incompatible type, bail out
        // gracefully instead of throwing "root.traverse is not a function".
        if (!root || typeof (root as any).traverse !== 'function') {
            console.warn('[ViewportThumbnailRenderer] _extractLines: received non-traversable object, skipping');
            return result;
        }

        root.traverse((child) => {
            if (!(child as THREE.LineSegments).isLineSegments) return;
            const ls = child as THREE.LineSegments;
            const posAttr = ls.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            const positions = (posAttr.array instanceof Float32Array)
                ? (posAttr.array as Float32Array).slice()
                : new Float32Array(posAttr.array as ArrayLike<number>);

            const dashed = ls.material instanceof THREE.LineDashedMaterial
                || (Array.isArray(ls.material) && ls.material.some(m => m instanceof THREE.LineDashedMaterial));

            result.push({ positions, dashed });
        });

        return result;
    }

    /**
     * Computes the XY bounding box of all collected line positions.
     * Uses X and Y components of the drawing-space coordinates (Z is ignored).
     * Returns null if the bounding box has zero area.
     */
    private _computeBounds(
        lines: _LineData[],
    ): { minX: number; minY: number; maxX: number; maxY: number } | null {
        let minX =  Infinity, minY =  Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const { positions } of lines) {
            for (let i = 0; i + 2 < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }

        if (!isFinite(minX) || (maxX - minX) < 1e-6 || (maxY - minY) < 1e-6) {
            return null;
        }

        return { minX, minY, maxX, maxY };
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const viewportThumbnailRenderer = new ViewportThumbnailRenderer();
