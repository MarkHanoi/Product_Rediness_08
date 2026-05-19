import * as THREE from '@pryzm/renderer-three/three';
import { lookupElementUUID } from '@pryzm/core-app-model';
import { renderLightingSymbols } from '@pryzm/core-app-model';

type WorldToScreen = (h: number, v: number) => { sx: number; sy: number };
type VertexToHV = (v: THREE.Vector3) => { h: number; vert: number };

export class PlanViewSymbolRenderer {
    renderLightingPlanSymbols(
        ctx: CanvasRenderingContext2D,
        worldToScreen: WorldToScreen,
        ppu: number,
        viewType: string,
        levelId: string | null,
    ): void {
        if (viewType !== 'plan' && viewType !== 'ceiling-plan' && viewType !== 'structural-plan') return;
        // window.selectionManager typed in src/global-window.d.ts (P4-compliant).
        const selectedId = window.selectionManager?.selectedObject?.userData?.id
                       ?? window.selectionManager?.selectedObject?.userData?.elementUUID
                       ?? null;
        renderLightingSymbols(
            ctx, ppu,
            (wx, wz) => worldToScreen(wx, wz),
            { levelId, selectedId },
        );
    }

    renderSelectionHighlights(
        ctx: CanvasRenderingContext2D,
        drawing: object,
        worldToScreen: WorldToScreen,
        vertexToHV: VertexToHV,
        sectionFlipV: boolean,
        selectedId: string | null | undefined,
        hoveredId: string | null | undefined,
    ): void {
        if (!selectedId && !hoveredId) return;

        interface Seg { x1: number; y1: number; x2: number; y2: number }
        const selectedSegs: Seg[] = [];
        const hoveredSegs:  Seg[] = [];

        const _tv1 = new THREE.Vector3();
        const _tv2 = new THREE.Vector3();

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            const uuid = (
                lookupElementUUID(drawing, child)
                ?? child.userData?.elementUUID
                ?? child.userData?.elementId
                ?? child.parent?.userData?.elementUUID
                ?? child.parent?.userData?.elementId
            ) as string | undefined;
            if (!uuid) return;

            const isSelected = uuid === selectedId;
            const isHovered  = uuid === hoveredId && uuid !== selectedId;
            if (!isSelected && !isHovered) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;
            const count = posAttr.count;

            for (let i = 0; i < count - 1; i += 2) {
                let hv1: { h: number; vert: number };
                let hv2: { h: number; vert: number };
                if (sectionFlipV) {
                    hv1 = { h: posAttr.getX(i),     vert: -posAttr.getZ(i)     };
                    hv2 = { h: posAttr.getX(i + 1), vert: -posAttr.getZ(i + 1) };
                } else {
                    const v1 = _tv1.set(posAttr.getX(i),     posAttr.getY(i),     posAttr.getZ(i)).applyMatrix4(mat);
                    const v2 = _tv2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                    hv1 = vertexToHV(v1);
                    hv2 = vertexToHV(v2);
                }
                const p1 = worldToScreen(hv1.h, hv1.vert);
                const p2 = worldToScreen(hv2.h, hv2.vert);
                const seg: Seg = { x1: p1.sx, y1: p1.sy, x2: p2.sx, y2: p2.sy };
                if (isSelected) selectedSegs.push(seg);
                else            hoveredSegs.push(seg);
            }
        });

        if (hoveredSegs.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)';
            ctx.lineWidth   = 4;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of hoveredSegs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
            ctx.stroke();
            ctx.restore();
        }

        if (selectedSegs.length > 0) {
            ctx.save();
            ctx.shadowColor  = 'rgba(139, 92, 246, 0.9)';
            ctx.shadowBlur   = 18;
            ctx.strokeStyle  = 'rgba(102, 0, 255, 0.18)';
            ctx.lineWidth    = 14;
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of selectedSegs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.shadowColor  = 'rgba(102, 0, 255, 0.85)';
            ctx.shadowBlur   = 10;
            ctx.strokeStyle  = 'rgba(102, 0, 255, 0.45)';
            ctx.lineWidth    = 6;
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of selectedSegs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.shadowColor  = 'rgba(167, 139, 250, 0.7)';
            ctx.shadowBlur   = 4;
            ctx.strokeStyle  = 'rgba(102, 0, 255, 0.95)';
            ctx.lineWidth    = 2;
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of selectedSegs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
            ctx.stroke();
            ctx.restore();
        }
    }
}

export const planViewSymbolRenderer = new PlanViewSymbolRenderer();
