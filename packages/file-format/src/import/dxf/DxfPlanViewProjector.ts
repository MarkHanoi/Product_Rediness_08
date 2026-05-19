/**
 * DxfPlanViewProjector.ts — Phase 2, §31
 *
 * Projects DXF overlay geometry onto the Canvas2D plan view.
 * Called by the plan view rendering pipeline when a DXF overlay is active.
 *
 * CONTRACT (§31 §5.2):
 *   - Pure rendering helper — no store mutations.
 *   - Reads the DxfOverlayStore and the active group world transform.
 *   - Draws onto a supplied CanvasRenderingContext2D.
 *
 * Coordinate mapping:
 *   Plan view Canvas2D uses world XZ at the active level elevation.
 *   The projector receives a worldToCanvas transform function from the plan view.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { dxfOverlayStore } from './DxfOverlayStore';

export type WorldToCanvasFn = (worldX: number, worldZ: number) => { cx: number; cy: number };

export interface DxfPlanViewProjectorOptions {
    ctx: CanvasRenderingContext2D;
    worldToCanvas: WorldToCanvasFn;
    /** Active level elevation — only render DXF overlays at or near this elevation */
    levelElevation: number;
    /** Scale factor (canvas pixels per metre) — for line width scaling */
    pixelsPerMetre: number;
}

/**
 * Draw all active DXF overlays onto the Canvas2D plan view.
 *
 * @param overlayGroups  Map from overlayId → THREE.Group (live scene objects)
 */
export function renderDxfOnPlanView(
    opts: DxfPlanViewProjectorOptions,
    overlayGroups: Map<string, THREE.Group>,
): void {
    const { ctx, worldToCanvas, pixelsPerMetre } = opts;

    for (const record of dxfOverlayStore.getAll()) {
        const group = overlayGroups.get(record.overlayId);
        if (!group) continue;

        ctx.save();
        ctx.globalAlpha = record.opacity;

        // Walk the group children (one LineSegments per layer)
        for (const child of group.children) {
            if (!child.visible) continue;
            const layerName = child.userData?.layerName as string | undefined;
            if (!layerName) continue;

            const layerRecord = record.layers.find(l => l.name === layerName);
            if (layerRecord && !layerRecord.visible) continue;

            const ls = child as THREE.LineSegments;
            const geo = ls.geometry;
            const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
            if (!posAttr) continue;

            const mat = ls.material as THREE.LineBasicMaterial;
            ctx.strokeStyle = '#' + mat.color.getHexString();
            ctx.lineWidth = Math.max(0.5, 1 / pixelsPerMetre * 100);
            ctx.beginPath();

            // posAttr has pairs of points (start/end of each segment)
            for (let i = 0; i < posAttr.count; i += 2) {
                // Local positions within the group
                const lx0 = posAttr.getX(i);
                const lz0 = posAttr.getZ(i);
                const lx1 = posAttr.getX(i + 1);
                const lz1 = posAttr.getZ(i + 1);

                // Apply group world transform (position offset from drag)
                const wx0 = lx0 + group.position.x;
                const wz0 = lz0 + group.position.z;
                const wx1 = lx1 + group.position.x;
                const wz1 = lz1 + group.position.z;

                const { cx: cx0, cy: cy0 } = worldToCanvas(wx0, wz0);
                const { cx: cx1, cy: cy1 } = worldToCanvas(wx1, wz1);

                ctx.moveTo(cx0, cy0);
                ctx.lineTo(cx1, cy1);
            }

            ctx.stroke();
        }

        ctx.restore();
    }
}
