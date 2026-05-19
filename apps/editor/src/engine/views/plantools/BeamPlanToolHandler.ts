import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE   = '#6366f1';
const FILL_A   = 'rgba(99,102,241,0.10)';
const BEAM_W   = 0.2;   // metres
const BEAM_D   = 0.3;   // metres

export class BeamPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _startPt: WorldPoint | null = null;
    private _cursorPt: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx      = ctx;
        this._startPt  = null;
        this._cursorPt = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._startPt  = null;
        this._cursorPt = null;
        this._ctx      = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        if (this._startPt) this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        if (!this._startPt) {
            this._startPt = pt;
            console.log('[BeamPlanToolHandler] Start point set', pt);
            return;
        }
        this._commitBeam(pt);
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            this.cancel();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._startPt  = null;
        this._cursorPt = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._startPt && this._cursorPt) this._drawPreview();
    }

    /**
     * Compute the beam centreline Y for a plan-view level so beams are created
     * near the ceiling (under the slab above) rather than at Y=0.
     * Mirrors BeamTool.computeBeamY() but uses the view's levelId directly.
     */
    private _beamElevation(levelId: string): number {
        const SLAB_THICKNESS = 0.2;
        const FALLBACK_HEIGHT = 3.0;
        const wallStore: any = window.wallStore; // TODO(TASK-08)
        const levels: any[] = wallStore?.getLevels?.() ?? [];
        const activeLevel = levels.find((l: any) => l.id === levelId);
        const elevation: number = activeLevel?.elevation ?? 0;
        const sorted = [...levels].sort((a: any, b: any) => a.elevation - b.elevation);
        const idx = sorted.findIndex((l: any) => l.id === levelId);
        // Guard against idx=-1: only look for the next level when the current one
        // was actually found in the sorted list.
        const nextLevel = idx >= 0 ? sorted[idx + 1] : undefined;
        const levelHeight: number = nextLevel ? nextLevel.elevation - elevation : FALLBACK_HEIGHT;
        return elevation + levelHeight - SLAB_THICKNESS - BEAM_D / 2;
    }

    private _commitBeam(endPt: WorldPoint): void {
        const c = this._ctx;
        const sp = this._startPt;
        if (!c || !sp) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[BeamPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const beamY = this._beamElevation(levelId);
        window.runtime?.bus?.executeCommand('beam.create', {
            startPoint: { x: sp.worldX,    y: beamY, z: sp.worldZ },
            endPoint:   { x: endPt.worldX, y: beamY, z: endPt.worldZ },
            width:   BEAM_W,
            depth:   BEAM_D,
            levelId,
        })?.catch((e: unknown) => console.error('[BeamPlanToolHandler] beam.create failed:', e));
        console.log('[BeamPlanToolHandler] Beam created');

        this._startPt  = null;
        this._cursorPt = null;
        this._clearOverlay();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        const sp = this._startPt;
        if (!c || !sp) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const sSt = planCanvas.worldToScreen(sp.worldX, sp.worldZ);
        const cp  = this._cursorPt ?? sp;
        const sEn = planCanvas.worldToScreen(cp.worldX, cp.worldZ);

        ctx.save();

        // Beam centreline
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sSt.sx, sSt.sy);
        ctx.lineTo(sEn.sx, sEn.sy);
        ctx.stroke();

        // Start dot
        ctx.fillStyle = STROKE;
        ctx.beginPath();
        ctx.arc(sSt.sx, sSt.sy, 4, 0, Math.PI * 2);
        ctx.fill();

        // Filled end dot
        ctx.beginPath();
        ctx.arc(sEn.sx, sEn.sy, 4, 0, Math.PI * 2);
        ctx.fill();

        // Visual width offset lines (BEAM_W perpendicular in screen space)
        const dx = sEn.sx - sSt.sx;
        const dy = sEn.sy - sSt.sy;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
            const perpW = 4;  // half-width in px (just for visual)
            const px = (-dy / len) * perpW;
            const py = ( dx / len) * perpW;

            ctx.globalAlpha = 0.6;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(sSt.sx + px, sSt.sy + py);
            ctx.lineTo(sEn.sx + px, sEn.sy + py);
            ctx.lineTo(sEn.sx - px, sEn.sy - py);
            ctx.lineTo(sSt.sx - px, sSt.sy - py);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.strokeStyle = STROKE;
            ctx.lineWidth   = 0.75;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Hint label
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(99,102,241,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Click end point to place beam', 12, cssH - 12);

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
