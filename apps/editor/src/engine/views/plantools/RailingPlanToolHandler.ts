/**
 * RailingPlanToolHandler — Phase 12 (Contract 19)
 *
 * Two-click line tool for placing railings/handrails in plan view.
 * First click sets the start; second click sets the end and commits.
 *
 * Fires CreateHandrailCommand with start/end/height/thickness/levelId.
 */

import { createId } from '@pryzm/schemas';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE          = '#f59e0b';
const FILL_A          = 'rgba(245,158,11,0.10)';
const DEFAULT_HEIGHT  = 1.1;
const DEFAULT_THICK   = 0.05;

export class RailingPlanToolHandler implements PlanToolHandler {
    private _ctx:     PlanToolDrawContext | null = null;
    private _startPt: WorldPoint | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx     = ctx;
        this._startPt = null;
        this._cursor  = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._startPt = null;
        this._cursor  = null;
        this._ctx     = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        if (this._startPt) this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        if (!this._startPt) {
            this._startPt = pt;
            console.log('[RailingPlanToolHandler] Start point set', pt);
            return;
        }
        this._commit(pt);
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        return false;
    }

    cancel(): void {
        this._startPt = null;
        this._cursor  = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._startPt && this._cursor) this._drawPreview();
    }

    private _commit(endPt: WorldPoint): void {
        const c  = this._ctx;
        const sp = this._startPt;
        if (!c || !sp) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[RailingPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const dx = endPt.worldX - sp.worldX;
        const dz = endPt.worldZ - sp.worldZ;
        const len = Math.hypot(dx, dz);
        if (len < 0.1) {
            console.warn('[RailingPlanToolHandler] Railing too short — ignored');
            this.cancel();
            return;
        }

        const id = createId('handrail');
        window.runtime?.bus?.executeCommand('handrail.create', {
            id,
            start:     { x: sp.worldX,    z: sp.worldZ },
            end:       { x: endPt.worldX, z: endPt.worldZ },
            height:    DEFAULT_HEIGHT,
            thickness: DEFAULT_THICK,
            levelId,
        })?.catch((e: unknown) => console.error('[RailingPlanToolHandler] handrail.create failed:', e));
        console.log('[RailingPlanToolHandler] Railing created', id);

        this._startPt = null;
        this._cursor  = null;
        this._clearOverlay();
    }

    private _drawPreview(): void {
        const c  = this._ctx;
        const sp = this._startPt;
        if (!c || !sp) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        const sA = planCanvas.worldToScreen(sp.worldX, sp.worldZ);
        const cp = this._cursor ?? sp;
        const sB = planCanvas.worldToScreen(cp.worldX, cp.worldZ);

        const ppu = planCanvas.getPixelsPerUnit();
        const thickPx = Math.max(2, DEFAULT_THICK * ppu);
        const dx = sB.sx - sA.sx;
        const dy = sB.sy - sA.sy;
        const len = Math.hypot(dx, dy);

        if (len > 1) {
            const nx = -dy / len;
            const ny =  dx / len;
            const hw = thickPx / 2;

            ctx.globalAlpha = 0.18;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(sA.sx + nx * hw, sA.sy + ny * hw);
            ctx.lineTo(sB.sx + nx * hw, sB.sy + ny * hw);
            ctx.lineTo(sB.sx - nx * hw, sB.sy - ny * hw);
            ctx.lineTo(sA.sx - nx * hw, sA.sy - ny * hw);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = STROKE;
        ctx.beginPath(); ctx.arc(sA.sx, sA.sy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sB.sx, sB.sy, 4, 0, Math.PI * 2); ctx.fill();

        const distM = Math.hypot(cp.worldX - sp.worldX, cp.worldZ - sp.worldZ);
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(245,158,11,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
            `Railing: ${distM.toFixed(2)} m — click end point`,
            12, cssH - 12,
        );

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
