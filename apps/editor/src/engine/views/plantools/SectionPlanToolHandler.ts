/**
 * Sprint 4.A — SectionPlanToolHandler
 *
 * Canvas2D plan view tool for creating section marks — mirrors the Revit workflow:
 *   Click 1 → set cut-line start (Point A)
 *   Move    → rubber-band preview: dashed cut line + head circles at each end
 *   Click 2 → set cut-line end (Point B) → fires CreateSectionMarkCommand
 *
 * The tail direction (which side the section looks toward) is the left-hand
 * perpendicular of the A→B vector: tailDir = { x: -dz, z: dx } (normalised).
 *
 * Section names are auto-generated sequentially: Section 1, Section 2, …
 * Multi-placement remains active after each commit (Escape to exit).
 *
 * Architecture: implements PlanToolHandler — registered in PlanViewToolOverlay
 * as key 'section-mark'.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

// ── Styling constants ─────────────────────────────────────────────────────────
const STROKE   = '#1a2035';               // section ink — dark navy
const DASH_COL = 'rgba(26,32,53,0.75)';  // dashed cut line colour
const HEAD_R   = 11;                      // head circle radius (px)

// ── Name counter ──────────────────────────────────────────────────────────────
let _sectionCounter = 1;
function nextSectionName(): string {
    return `Section ${_sectionCounter++}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export class SectionPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _pointA: WorldPoint | null       = null;
    private _cursor: WorldPoint | null       = null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx    = ctx;
        this._pointA = null;
        this._cursor = null;
        ctx.overlayCanvas.style.cursor = 'crosshair';
        console.log('[SectionPlanToolHandler] activated — click two points to define cut line');
    }

    deactivate(): void {
        this._clearOverlay();
        if (this._ctx) this._ctx.overlayCanvas.style.cursor = 'default';
        this._ctx    = null;
        this._pointA = null;
        this._cursor = null;
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this.redraw();
    }

    onClick(pt: WorldPoint): void {
        if (!this._pointA) {
            this._pointA = pt;
            console.log('[SectionPlanToolHandler] Point A set', pt);
            this.redraw();
        } else {
            this._commit(pt);
        }
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            if (this._pointA) {
                this._pointA = null;
                this._cursor = null;
                this.redraw();
            } else {
                this.cancel();
            }
            return true;
        }
        return false;
    }

    cancel(): void {
        this._pointA = null;
        this._cursor = null;
        this._clearOverlay();
    }

    redraw(): void {
        this._drawPreview();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _commit(ptB: WorldPoint): void {
        if (!this._ctx || !this._pointA) return;
        const ptA = this._pointA;
        const dx  = ptB.worldX - ptA.worldX;
        const dz  = ptB.worldZ - ptA.worldZ;
        const len = Math.hypot(dx, dz);
        const tail = len > 0.001
            ? { x: -dz / len, z:  dx / len }
            : { x: 1, z: 0 };

        const floorY = (this._ctx.viewDef as any).elevation ?? 0;

        // DOC-19B: compute section plane from cut line so EdgeProjectorService can
        // project from the correct angle when this section view is opened in Canvas2D.
        // sectionPlane.normal = tailDirection (the direction the section looks toward).
        // sectionPlane.constant = -dot(tailDir, cutPointA) so the plane passes through A.
        const sectionPlaneConstant = -(tail.x * ptA.worldX + tail.z * ptA.worldZ);

        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('section.create', {
            sectionViewId:   crypto.randomUUID(),
            sectionViewName: nextSectionName(),
            annotationId:    crypto.randomUUID(),
            hostViewId:      this._ctx.viewDef.id,
            cutPointA:       { x: ptA.worldX, y: floorY, z: ptA.worldZ },
            cutPointB:       { x: ptB.worldX, y: floorY, z: ptB.worldZ },
            tailDirection:   tail,
            sectionSpatial: {
                sectionPlane: {
                    normal:   [tail.x, 0, tail.z] as [number, number, number],
                    constant: sectionPlaneConstant,
                },
                projectionDirection: { x: tail.x, y: 0, z: tail.z },
            },
        })?.catch((e: Error) => console.error('[SectionPlanToolHandler] section.create failed:', e));
        console.log('[SectionPlanToolHandler] Section mark committed');

        // Reset for multi-placement
        this._pointA = null;
        this._cursor = null;
        this.redraw();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        const cursor = this._cursor;

        if (!this._pointA) {
            // Pre-click: show single head circle + crosshair at cursor
            if (cursor) {
                const { sx, sy } = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);
                this._drawHeadCircle(ctx, sx, sy, 'S');
                this._drawCrosshair(ctx, sx, sy);
            }
            this._drawHint(ctx, cssW, cssH, 'Click to set section cut-line start  |  Esc = cancel');
        } else {
            const ptA = planCanvas.worldToScreen(this._pointA.worldX, this._pointA.worldZ);
            const ptB = cursor
                ? planCanvas.worldToScreen(cursor.worldX, cursor.worldZ)
                : ptA;

            // Dashed cut line
            ctx.strokeStyle = DASH_COL;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(ptA.sx, ptA.sy);
            ctx.lineTo(ptB.sx, ptB.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            // Direction computations in screen space
            const dx = ptB.sx - ptA.sx;
            const dy = ptB.sy - ptA.sy;
            const len = Math.hypot(dx, dy);

            // tailDir = left-hand perpendicular of A→B (screen coords)
            // In screen space, left-hand of (dx, dy) is (-dy, dx).
            const tailNx = len > 1 ? -dy / len : 0;
            const tailNy = len > 1 ?  dx / len : 1;
            const TICK = 14;

            // Perpendicular tick marks at each endpoint (on the viewing side)
            if (len > 1) {
                for (const { sx, sy } of [ptA, ptB]) {
                    ctx.strokeStyle = STROKE;
                    ctx.lineWidth   = 2;
                    ctx.beginPath();
                    ctx.moveTo(sx + tailNx * 4,    sy + tailNy * 4);
                    ctx.lineTo(sx + tailNx * TICK,  sy + tailNy * TICK);
                    ctx.stroke();
                }
            }

            // Viewing-direction arrow — midpoint of cut line, pointing in tailDir
            if (len > 1) {
                const midSx = (ptA.sx + ptB.sx) / 2;
                const midSy = (ptA.sy + ptB.sy) / 2;
                const ARROW_LEN = Math.min(40, len * 0.3);
                const tipX = midSx + tailNx * ARROW_LEN;
                const tipY = midSy + tailNy * ARROW_LEN;
                ctx.strokeStyle = STROKE;
                ctx.fillStyle   = STROKE;
                ctx.lineWidth   = 1.5;
                ctx.beginPath();
                ctx.moveTo(midSx, midSy);
                ctx.lineTo(tipX, tipY);
                ctx.stroke();
                // Arrowhead
                const angle = Math.atan2(tailNy, tailNx);
                const HS = 7;
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX + Math.cos(angle + Math.PI * 0.75) * HS, tipY + Math.sin(angle + Math.PI * 0.75) * HS);
                ctx.lineTo(tipX + Math.cos(angle - Math.PI * 0.75) * HS, tipY + Math.sin(angle - Math.PI * 0.75) * HS);
                ctx.closePath();
                ctx.fill();
            }

            // Head circles at both ends
            this._drawHeadCircle(ctx, ptA.sx, ptA.sy, 'S');
            this._drawHeadCircle(ctx, ptB.sx, ptB.sy, 'S');

            this._drawHint(ctx, cssW, cssH, 'Click to set section cut-line end  |  Esc = restart');
        }

        ctx.restore();
    }

    private _drawHeadCircle(ctx: CanvasRenderingContext2D, sx: number, sy: number, label: string): void {
        ctx.fillStyle   = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, HEAD_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sx - HEAD_R, sy);
        ctx.lineTo(sx + HEAD_R, sy);
        ctx.stroke();

        ctx.font         = `bold 9px 'Inter', sans-serif`;
        ctx.fillStyle    = STROKE;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy - HEAD_R * 0.35);
    }

    private _drawCrosshair(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
        const S = 5;
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(sx - S, sy); ctx.lineTo(sx + S, sy);
        ctx.moveTo(sx, sy - S); ctx.lineTo(sx, sy + S);
        ctx.stroke();
    }

    private _drawHint(ctx: CanvasRenderingContext2D, _w: number, h: number, text: string): void {
        const PAD = 6;
        ctx.font         = '11px sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(8, h - PAD - 16, tw + PAD * 2, 18);
        ctx.fillStyle = STROKE;
        ctx.fillText(text, 8 + PAD, h - PAD);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
    }
}
