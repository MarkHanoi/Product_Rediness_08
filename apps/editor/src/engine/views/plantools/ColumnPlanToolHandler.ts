import { createId } from '@pryzm/schemas';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const COLUMN_DEFAULT_HEIGHT = 3.0;
const COLUMN_DEFAULT_WIDTH  = 0.3;
const COLUMN_DEFAULT_DEPTH  = 0.3;

export class ColumnPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _columnCursorPoint: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._columnCursorPoint = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._columnCursorPoint = null;
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._columnCursorPoint = pt;
        this._drawColumnPreview();
    }

    onClick(pt: WorldPoint): void {
        this._commitColumn(pt);
    }

    cancel(): void {
        this._columnCursorPoint = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._columnCursorPoint) this._drawColumnPreview();
    }

    private _commitColumn(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[ColumnPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        // §P3.3-CO (IMPL-PLAN-2026-05-17): bus-primary dispatch with CreateColumnPayload schema.
        // Field mapping: `position` → `origin` (Vec3); `profile` → `shape` (ColumnData.shape).
        // The §P3.3-CO legacy bridge in initTools.ts remaps back to {position, profile} for
        // legacy ColumnStore → ColumnFragmentBuilder mesh rendering.
        window.runtime?.bus?.executeCommand('column.create', {
            id:         createId('column'),
            origin:     { x: pt.worldX, y: 0, z: pt.worldZ },
            height:     COLUMN_DEFAULT_HEIGHT,
            rotation:   0,
            shape:      'rectangular',
            width:      COLUMN_DEFAULT_WIDTH,
            depth:      COLUMN_DEFAULT_DEPTH,
            baseOffset: 0,
            levelId,
        })?.catch((e: unknown) => console.error('[ColumnPlanToolHandler] §P3.3-CO: column.create failed:', e));
        console.log('[ColumnPlanToolHandler] Column created at', pt);

        this._columnCursorPoint = null;
        this._clearOverlay();
    }

    private _drawColumnPreview(): void {
        const c = this._ctx;
        if (!c || !this._columnCursorPoint) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const { sx, sy } = planCanvas.worldToScreen(this._columnCursorPoint.worldX, this._columnCursorPoint.worldZ);
        const ppu = planCanvas.getPixelsPerUnit();
        const hw = (COLUMN_DEFAULT_WIDTH / 2) * ppu;
        const hd = (COLUMN_DEFAULT_DEPTH / 2) * ppu;

        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#6600ff';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(102,0,255,0.14)';
        ctx.beginPath();
        ctx.rect(sx - hw, sy - hd, hw * 2, hd * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#6600ff';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(sx - hw - 4, sy); ctx.lineTo(sx + hw + 4, sy);
        ctx.moveTo(sx, sy - hd - 4); ctx.lineTo(sx, sy + hd + 4);
        ctx.stroke();
        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
