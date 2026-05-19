/**
 * FloorPlanToolHandler — Phase 11 (Contract 19) · Sprint §49 (Drawing-mode parity)
 *
 * Polygon tool for placing floors (floor finishes) in plan view, with the
 * same drawing-mode UX as the wall plan tool:
 *   • LINEAR    — freeform polygon, click to add vertex
 *   • ORTHO     — 90°-constrained polygon (axis-only segments)
 *   • CURVED    — arc segments (currently routes to LINEAR)
 *   • RECTANGLE — 2-click axis-aligned rectangle, commits immediately
 *   • AUTO      — single click inside a room → uses room boundary
 *
 * Mode is read on every interaction from `window.floorModePicker.getActiveMode()`
 * so the user can switch via the FloorDrawingHUD mid-session.
 *
 * Continuous creation: after each commit the polygon resets but the handler
 * stays active.  Only ESC / explicit deactivate tears down.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import type { FloorPickerMode } from '@app/ui/FloorModePicker';

const STROKE = '#10b981';
const FILL_A = 'rgba(16,185,129,0.10)';

export class FloorPlanToolHandler implements PlanToolHandler {
    private _ctx:         PlanToolDrawContext | null = null;
    private _points:      WorldPoint[] = [];
    private _cursorPoint: WorldPoint | null = null;
    private _rectAnchor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx         = ctx;
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._ctx         = null;
    }

    onMouseMove(pt: WorldPoint): void {
        const mode = this._currentMode();
        // RECTANGLE preview kicks in once an anchor is set
        if (mode === 'rectangle' && this._rectAnchor) {
            this._cursorPoint = pt;
            this._drawPreview();
            return;
        }
        // ORTHO snap relative to last vertex
        if (mode === 'ortho' && this._points.length > 0) {
            this._cursorPoint = this._orthoSnap(this._points[this._points.length - 1], pt);
            this._drawPreview();
            return;
        }
        if (this._points.length > 0) {
            this._cursorPoint = pt;
            this._drawPreview();
        }
    }

    onClick(pt: WorldPoint): void {
        const mode = this._currentMode();

        // ── AUTO_FROM_ROOM — single click commits using room boundary ────────
        if (mode === 'auto') {
            this._commitFromRoomAt(pt);
            return;
        }

        // ── RECTANGLE — 2-point axis-aligned commit ──────────────────────────
        if (mode === 'rectangle') {
            if (!this._rectAnchor) {
                this._rectAnchor = pt;
                this._points     = [pt];
                this._cursorPoint = pt;
                this._drawPreview();
                console.log('[FloorPlanToolHandler] Rectangle anchor set', pt);
                return;
            }
            const a = this._rectAnchor;
            const b = pt;
            const minX = Math.min(a.worldX, b.worldX);
            const maxX = Math.max(a.worldX, b.worldX);
            const minZ = Math.min(a.worldZ, b.worldZ);
            const maxZ = Math.max(a.worldZ, b.worldZ);
            if (maxX - minX < 0.01 || maxZ - minZ < 0.01) {
                console.warn('[FloorPlanToolHandler] Rectangle too small — ignoring');
                return;
            }
            const mk = (x: number, z: number): WorldPoint =>
                ({ worldX: x, worldZ: z } as WorldPoint);
            this._points = [
                mk(minX, minZ),
                mk(maxX, minZ),
                mk(maxX, maxZ),
                mk(minX, maxZ),
            ];
            this._commit();
            return;
        }

        // ── LINEAR / ORTHO / CURVED — polygon vertex add ─────────────────────
        const vertex = (mode === 'ortho' && this._points.length > 0)
            ? this._orthoSnap(this._points[this._points.length - 1], pt)
            : pt;
        this._points.push(vertex);
        this._drawPreview();
        console.log('[FloorPlanToolHandler] Point added', vertex, `total: ${this._points.length} mode: ${mode}`);
    }

    onDoubleClick(_pt: WorldPoint): void {
        const mode = this._currentMode();
        if (mode === 'rectangle' || mode === 'auto') return;
        if (this._points.length >= 3) this._commit();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Enter' && this._points.length >= 3 && this._currentMode() !== 'rectangle') {
            e.preventDefault();
            this._commit();
            return true;
        }
        if (e.key === 'Backspace' && this._points.length > 0) {
            this._points.pop();
            if (this._points.length === 0) this._rectAnchor = null;
            this._drawPreview();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._points.length > 0) this._drawPreview();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private _currentMode(): FloorPickerMode {
        const picker = window.floorModePicker;
        return (picker?.getActiveMode?.() as FloorPickerMode) ?? 'linear';
    }

    private _orthoSnap(from: WorldPoint, to: WorldPoint): WorldPoint {
        const dx = Math.abs(to.worldX - from.worldX);
        const dz = Math.abs(to.worldZ - from.worldZ);
        return dx >= dz
            ? ({ worldX: to.worldX,   worldZ: from.worldZ } as WorldPoint)
            : ({ worldX: from.worldX, worldZ: to.worldZ   } as WorldPoint);
    }

    private _commitFromRoomAt(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[FloorPlanToolHandler] AUTO: ViewDefinition.spatial.levelId is missing');
            return;
        }

        const roomStore = window.roomStore; // TODO(TASK-08)
        if (!roomStore) {
            console.warn('[FloorPlanToolHandler] AUTO: roomStore not available on window');
            return;
        }

        const rooms: any[] = roomStore.getAll().filter((r: any) => r.levelId === levelId);
        const room = rooms.find(r => {
            const poly = r.boundary?.polygon;
            return poly && this._pointInPolygon({ x: pt.worldX, z: pt.worldZ }, poly);
        });
        if (!room) {
            console.warn('[FloorPlanToolHandler] AUTO: no room found at clicked point');
            return;
        }

        const polygon = room.boundary.polygon.map((v: any) => ({ x: v.x, z: v.z }));
        const floorId = crypto.randomUUID();
        const ifcGuid = crypto.randomUUID();
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('floor.create', { floorId, ifcGuid, polygon, levelId })
            ?.catch((e: Error) => console.error('[FloorPlanToolHandler] floor.create failed:', e));
        console.log('[FloorPlanToolHandler] Floor created from room', { floorId, roomId: room.id });
        // Continuous-creation: ready for the next click immediately.
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._clearOverlay();
    }

    private _pointInPolygon(pt: { x: number; z: number }, polygon: Array<{ x: number; z: number }>): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, zi = polygon[i].z;
            const xj = polygon[j].x, zj = polygon[j].z;
            const intersect =
                (zi > pt.z) !== (zj > pt.z) &&
                pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private _commit(): void {
        const c = this._ctx;
        if (!c || this._points.length < 3) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[FloorPlanToolHandler] ViewDefinition.spatial.levelId is missing', c.viewDef.id);
            return;
        }

        const floorId = crypto.randomUUID();
        const ifcGuid = crypto.randomUUID();
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('floor.create', {
            floorId,
            ifcGuid,
            polygon: this._points.map(p => ({ x: p.worldX, z: p.worldZ })),
            levelId,
        })?.catch((e: Error) => console.error('[FloorPlanToolHandler] floor.create failed:', e));
        console.log('[FloorPlanToolHandler] Floor created', floorId);

        // Continuous-creation: reset polygon state, stay active.
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._clearOverlay();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || this._points.length === 0) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        const mode = this._currentMode();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        // ── RECTANGLE preview ────────────────────────────────────────────────
        if (mode === 'rectangle' && this._rectAnchor && this._cursorPoint) {
            const a = this._rectAnchor;
            const b = this._cursorPoint;
            const minX = Math.min(a.worldX, b.worldX);
            const maxX = Math.max(a.worldX, b.worldX);
            const minZ = Math.min(a.worldZ, b.worldZ);
            const maxZ = Math.max(a.worldZ, b.worldZ);
            const corners = [
                planCanvas.worldToScreen(minX, minZ),
                planCanvas.worldToScreen(maxX, minZ),
                planCanvas.worldToScreen(maxX, maxZ),
                planCanvas.worldToScreen(minX, maxZ),
            ];
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(corners[0].sx, corners[0].sy);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;

            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = STROKE;
            ctx.beginPath();
            ctx.moveTo(corners[0].sx, corners[0].sy);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
            ctx.closePath(); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = STROKE;
            for (const p of corners) { ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill(); }
            this._drawHint(ctx, cssH, 'Click to set opposite corner · Esc to finish');
            ctx.restore();
            return;
        }

        // ── POLYGON preview (LINEAR / ORTHO / CURVED) ────────────────────────
        const screenPts = this._points.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            if (this._cursorPoint) {
                const cur = planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ);
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
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
        if (this._cursorPoint) {
            const cur = planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ);
            ctx.lineTo(cur.sx, cur.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = STROKE;
        for (const p of screenPts) {
            ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill();
        }

        if (screenPts.length >= 3 && this._cursorPoint) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(16,185,129,0.4)';
            ctx.lineWidth   = 1;
            const cur = planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ);
            ctx.beginPath();
            ctx.moveTo(cur.sx, cur.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const modeLabel = mode === 'ortho' ? 'Orthogonal' : (mode === 'curved' ? 'Curved' : 'Linear');
        const hint = this._points.length >= 3
            ? `${modeLabel} · Dbl-click or Enter to close floor`
            : `${modeLabel} · ${3 - this._points.length} more point${3 - this._points.length !== 1 ? 's' : ''} needed`;
        this._drawHint(ctx, cssH, hint);
        ctx.restore();
    }

    private _drawHint(ctx: CanvasRenderingContext2D, cssH: number, text: string): void {
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(16,185,129,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, 12, cssH - 12);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
