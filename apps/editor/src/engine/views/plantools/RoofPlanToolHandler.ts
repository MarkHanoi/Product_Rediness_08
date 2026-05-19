import { createId } from '@pryzm/schemas';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE = '#6366f1';

/**
 * Plan-view roof creation handler — supports RECTANGLE (2-point) and
 * POLYLINE modes, reading the active mode from the 3D RoofTool so the
 * mode selector in the tools panel works for both view types.
 *
 * Coordinate contract:
 *   WorldPoint.worldX / worldZ are WORLD-SPACE coordinates as returned by
 *   PlanViewCanvas.screenToWorld().  Before passing to CreateRoofCommand,
 *   the polygon is converted to LOCAL space (centroid-relative) to match
 *   the convention used by RoofTool._normalisePolygon() and expected by
 *   RoofFragmentBuilder — which positions root at centroid and expects
 *   polygon vertices as offsets from that centroid.
 */
export class RoofPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _pts: WorldPoint[] = [];
    private _cursor: WorldPoint | null = null;
    /** RECTANGLE = 2-point, POLYLINE = multi-point click-by-click */
    private _mode: 'RECTANGLE' | 'POLYLINE' = 'RECTANGLE';

    activate(ctx: PlanToolDrawContext): void {
        this._ctx    = ctx;
        this._pts    = [];
        this._cursor = null;
        // Read the mode currently active on the 3D RoofTool so the mode selector
        // in the Create panel affects both the 3D and plan-view handlers.
        const rt = window.roofTool;
        const at: string = rt?.activeTool ?? 'RECTANGLE';
        this._mode = (at === 'POLYLINE') ? 'POLYLINE' : 'RECTANGLE';
        console.log('[RoofPlanToolHandler] Activated, mode:', this._mode);
    }

    deactivate(): void {
        this._clearOverlay();
        this._pts    = [];
        this._cursor = null;
        this._ctx    = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        if (this._mode === 'RECTANGLE' && this._pts.length > 0) {
            this._drawPreview();
        } else if (this._mode === 'POLYLINE' && this._pts.length > 0) {
            this._drawPreview();
        }
    }

    onClick(pt: WorldPoint): void {
        if (this._mode === 'RECTANGLE') {
            this._pts.push(pt);
            console.log('[RoofPlanToolHandler] Rectangle point', this._pts.length, pt);
            if (this._pts.length === 1) {
                this._drawPreview();
            } else if (this._pts.length >= 2) {
                this._commitRectangle();
            }
        } else {
            this._pts.push(pt);
            this._drawPreview();
            console.log('[RoofPlanToolHandler] Polyline point added', pt, `total: ${this._pts.length}`);
        }
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (this._mode === 'POLYLINE' && this._pts.length >= 3) {
            this._commitPolyline();
        }
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (this._mode === 'POLYLINE') {
            if (e.key === 'Enter' && this._pts.length >= 3) {
                e.preventDefault();
                this._commitPolyline();
                return true;
            }
            if (e.key === 'Backspace' && this._pts.length > 0) {
                this._pts.pop();
                this._drawPreview();
                return true;
            }
        }
        return false;
    }

    cancel(): void {
        this._pts    = [];
        this._cursor = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._pts.length > 0) this._drawPreview();
    }

    // ── Rectangle (2-point) commit ────────────────────────────────────────────

    private _commitRectangle(): void {
        const c  = this._ctx;
        const p1 = this._pts[0];
        const p2 = this._pts[1];
        if (!c || !p1 || !p2) return;

        // Build a rectangle from two diagonal corners in world space
        const x1 = p1.worldX, z1 = p1.worldZ;
        const x2 = p2.worldX, z2 = p2.worldZ;
        if (Math.abs(x2 - x1) < 0.01 || Math.abs(z2 - z1) < 0.01) {
            console.warn('[RoofPlanToolHandler] Rectangle too small — ignored');
            this.cancel();
            return;
        }
        const worldPolygon: [number, number][] = [
            [x1, z1], [x2, z1], [x2, z2], [x1, z2],
        ];
        this._commit(c, worldPolygon);
    }

    // ── Polyline commit ───────────────────────────────────────────────────────

    private _commitPolyline(): void {
        const c = this._ctx;
        if (!c || this._pts.length < 3) return;
        const worldPolygon: [number, number][] = this._pts.map(p => [p.worldX, p.worldZ]);
        this._commit(c, worldPolygon);
    }

    // ── Shared commit logic ───────────────────────────────────────────────────

    /**
     * Convert a world-space polygon to local (centroid-relative) coordinates
     * and dispatch CreateRoofCommand.
     *
     * RoofFragmentBuilder positions the THREE.Group at `centroid` and adds a
     * mesh whose vertices are the local polygon offsets.  Passing world-space
     * coordinates as local offsets shifts the roof by the centroid distance —
     * hence the normalisation step here (mirrors RoofTool._normalisePolygon).
     */
    private _commit(c: PlanToolDrawContext, worldPolygon: [number, number][]): void {
        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[RoofPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            this.cancel();
            return;
        }

        // Compute centroid in world space
        const cx = worldPolygon.reduce((s, p) => s + p[0], 0) / worldPolygon.length;
        const cz = worldPolygon.reduce((s, p) => s + p[1], 0) / worldPolygon.length;

        // Note: centroid-local polygon is no longer computed here — the §P3.2-RF legacy bridge
        // in initTools.ts recomputes it from world-space Vec3[] boundary after the command lands.
        // (Old localPolygon removal: noUnusedLocals gate — see IMPL-PLAN-2026-05-17 §P3.2-RF.)

        const roofId = createId('roof');
        // §P3.2-RF (IMPL-PLAN-2026-05-17): bus-primary dispatch with new CreateRoofPayload schema.
        // `boundary` is world-space Vec3[] (y=0 plane); the §P3.2-RF legacy bridge in initTools.ts
        // recomputes the centroid and local offsets for RoofFragmentBuilder → RoofStore.
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('roof.create', {
            id:       roofId,
            levelId,
            boundary: worldPolygon.map(([x, z]) => ({ x, y: 0, z })),
            shape:    'flat',
            overhang: 0.3,
            thickness: 0.2,
        })?.catch((e: Error) => console.error('[RoofPlanToolHandler] §P3.2-RF: roof.create failed:', e));
        console.log('[RoofPlanToolHandler] §P3.2-RF: Roof dispatched', roofId, 'centroid:', [cx, cz]);

        this._pts    = [];
        this._cursor = null;
        this._clearOverlay();
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || this._pts.length === 0) return;
        if (this._mode === 'RECTANGLE') {
            this._drawRectanglePreview(c);
        } else {
            this._drawPolylinePreview(c);
        }
    }

    private _drawRectanglePreview(c: PlanToolDrawContext): void {
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        const p1w = planCanvas.worldToScreen(this._pts[0].worldX, this._pts[0].worldZ);

        if (this._cursor) {
            const p2w = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
            const rx = Math.min(p1w.sx, p2w.sx);
            const ry = Math.min(p1w.sy, p2w.sy);
            const rw = Math.abs(p2w.sx - p1w.sx);
            const rh = Math.abs(p2w.sy - p1w.sy);

            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = '#6366f1';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.globalAlpha = 1;

            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = STROKE;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);
        }

        // First corner dot
        ctx.fillStyle = STROKE;
        ctx.beginPath();
        ctx.arc(p1w.sx, p1w.sy, 4, 0, Math.PI * 2);
        ctx.fill();

        // Hint text
        const hint = 'Click second corner to place roof';
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(99,102,241,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(hint, 12, cssH - 12);

        ctx.restore();
    }

    private _drawPolylinePreview(c: PlanToolDrawContext): void {
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        const sPts = this._pts.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        if (sPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = '#6366f1';
            ctx.beginPath();
            ctx.moveTo(sPts[0].sx, sPts[0].sy);
            for (let i = 1; i < sPts.length; i++) ctx.lineTo(sPts[i].sx, sPts[i].sy);
            if (this._cursor) {
                const cur = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
                ctx.lineTo(cur.sx, cur.sy);
            }
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.setLineDash([6, 3]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = STROKE;
        ctx.beginPath();
        ctx.moveTo(sPts[0].sx, sPts[0].sy);
        for (let i = 1; i < sPts.length; i++) ctx.lineTo(sPts[i].sx, sPts[i].sy);
        if (this._cursor) {
            const cur = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
            ctx.lineTo(cur.sx, cur.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = STROKE;
        for (const p of sPts) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        if (sPts.length >= 3 && this._cursor) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(99,102,241,0.4)';
            ctx.lineWidth   = 1;
            const cur = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
            ctx.beginPath();
            ctx.moveTo(cur.sx, cur.sy);
            ctx.lineTo(sPts[0].sx, sPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const need = Math.max(0, 3 - this._pts.length);
        const hint = this._pts.length >= 3
            ? 'Dbl-click or Enter to close roof'
            : `${need} more point${need !== 1 ? 's' : ''} needed`;
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(99,102,241,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(hint, 12, cssH - 12);

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
