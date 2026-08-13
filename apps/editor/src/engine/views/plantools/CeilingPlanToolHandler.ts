/**
 * CeilingPlanToolHandler — Phase 10 (Contract 19) · Sprint §49 (Drawing-mode parity)
 *
 * Polygon tool for placing ceilings in plan view, with the same drawing-mode
 * UX as the wall plan tool:
 *   • LINEAR    — freeform polygon, click to add vertex
 *   • ORTHO     — 90°-constrained polygon (axis-only segments)
 *   • CURVED    — arc segments (currently routes to LINEAR)
 *   • RECTANGLE — 2-click axis-aligned rectangle, commits immediately
 *   • AUTO      — single click inside a room → uses room boundary
 *
 * Mode is read on every interaction from `window.ceilingModePicker.getActiveMode()`
 * so the user can switch via the CeilingDrawingHUD mid-session.
 *
 * Continuous creation: after each commit the polygon resets but the handler
 * stays active.  Only ESC / explicit deactivate tears down.
 */

import { createId } from '@pryzm/schemas';
// §FIX-CEILING-INNER-FACE-PARITY (2026-08-06) — the SAME canonical inner-face derivation
// the floor plan tool (L-213) and the floor/ceiling command chokepoints use, so an
// AUTO-from-room ceiling sits inside the walls (not on their centreline) regardless of
// entry point (C11: one pipeline). This dispatch targets the PLUGIN `ceiling.create`
// bus handler, which has no host-room concept, so the derivation happens here — exactly
// as `FloorPlanToolHandler._innerFacePolygon` does for `floor.create`.
import { resolveRoomFinishBoundary, type RoomFinishWall } from '@pryzm/room-topology';
// §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4 · C71 §4.4 · C79 §5.2.0).
import { boundingWallIdsOrUnknown } from '@pryzm/core-app-model';
// §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06) — the ONE arc model for curved boundary
// segments (wall-tool midpoint-Bézier semantics), shared with the 3D tools.
// §FEAT-SLAB-DRAW-MODES (2026-08-06) — `orthoConstrain` is the WALL tool's
// `_snapOrtho`, shared by slab / floor / ceiling. Replaces the private
// dominant-axis projection this handler used to carry.
import { arcSegmentThroughMidpoint, orthoConstrain } from '@pryzm/geometry-slab';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import type { CeilingPickerMode } from '@app/ui/CeilingModePicker';

const STROKE = '#6600ff';
const FILL_A = 'rgba(102,0,255,0.10)';

export class CeilingPlanToolHandler implements PlanToolHandler {
    private _ctx:         PlanToolDrawContext | null = null;
    private _points:      WorldPoint[] = [];
    private _cursorPoint: WorldPoint | null = null;
    private _rectAnchor:  WorldPoint | null = null;
    // §FEAT-BOUNDARY-CURVE-DRAW — CURVED mode pending arc midpoint (wall 3-click pattern).
    private _arcMidPt:    WorldPoint | null = null;

    // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per the
    // PlanToolHandler.hasActiveStroke?() contract. Mirrors the FloorPlanToolHandler
    // pattern so multi-step polygon/rectangle drawing survives temporary
    // off-canvas excursions (e.g. reading a dimension on the toolbar).
    hasActiveStroke(): boolean { return this._points.length > 0 || this._rectAnchor !== null || this._arcMidPt !== null; }

    activate(ctx: PlanToolDrawContext): void {
        this._ctx         = ctx;
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._arcMidPt    = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._arcMidPt    = null;
        this._ctx         = null;
    }

    onMouseMove(pt: WorldPoint): void {
        const mode = this._currentMode();
        if (mode === 'rectangle' && this._rectAnchor) {
            this._cursorPoint = pt;
            this._drawPreview();
            return;
        }
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

        if (mode === 'auto') {
            this._commitFromRoomAt(pt);
            return;
        }

        if (mode === 'rectangle') {
            if (!this._rectAnchor) {
                this._rectAnchor = pt;
                this._points     = [pt];
                this._cursorPoint = pt;
                this._drawPreview();
                console.log('[CeilingPlanToolHandler] Rectangle anchor set', pt);
                return;
            }
            const a = this._rectAnchor;
            const b = pt;
            const minX = Math.min(a.worldX, b.worldX);
            const maxX = Math.max(a.worldX, b.worldX);
            const minZ = Math.min(a.worldZ, b.worldZ);
            const maxZ = Math.max(a.worldZ, b.worldZ);
            if (maxX - minX < 0.01 || maxZ - minZ < 0.01) {
                console.warn('[CeilingPlanToolHandler] Rectangle too small — ignoring');
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

        // ── CURVED — §FEAT-BOUNDARY-CURVE-DRAW: vertex → arc MIDPOINT → arc END
        // (the wall tool's 3-click pattern); mirrors FloorPlanToolHandler. ───────
        if (mode === 'curved' && this._points.length > 0) {
            if (!this._arcMidPt) {
                this._arcMidPt = pt;
                this._cursorPoint = pt;
                this._drawPreview();
                console.log('[CeilingPlanToolHandler] Arc midpoint set', pt);
                return;
            }
            const last = this._points[this._points.length - 1];
            const run = arcSegmentThroughMidpoint(
                { x: last.worldX, z: last.worldZ },
                { x: this._arcMidPt.worldX, z: this._arcMidPt.worldZ },
                { x: pt.worldX, z: pt.worldZ },
            );
            for (const v of run) this._points.push({ worldX: v.x, worldZ: v.z } as WorldPoint);
            this._arcMidPt = null;
            this._drawPreview();
            console.log(`[CeilingPlanToolHandler] Arc segment committed (${run.length} tessellated verts). total: ${this._points.length}`);
            return;
        }

        const vertex = (mode === 'ortho' && this._points.length > 0)
            ? this._orthoSnap(this._points[this._points.length - 1], pt)
            : pt;
        this._points.push(vertex);
        this._drawPreview();
        console.log('[CeilingPlanToolHandler] Point added', vertex, `total: ${this._points.length} mode: ${mode}`);
    }

    onDoubleClick(_pt: WorldPoint): void {
        const mode = this._currentMode();
        if (mode === 'rectangle' || mode === 'auto') return;
        if (this._arcMidPt) return; // arc midpoint pending — dbl-click must not eat the end click
        if (this._points.length >= 3) this._commit();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Enter' && this._points.length >= 3 && this._currentMode() !== 'rectangle' && !this._arcMidPt) {
            e.preventDefault();
            this._commit();
            return true;
        }
        if (e.key === 'Backspace' && this._arcMidPt) {
            // §FEAT-BOUNDARY-CURVE-DRAW — re-pick the pending arc midpoint first.
            this._arcMidPt = null;
            this._drawPreview();
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
        this._arcMidPt    = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._points.length > 0) this._drawPreview();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private _currentMode(): CeilingPickerMode {
        const picker = window.ceilingModePicker;
        return (picker?.getActiveMode?.() as CeilingPickerMode) ?? 'linear';
    }

    /** §FEAT-SLAB-DRAW-MODES — the ONE ortho constraint (the wall tool's, verbatim). */
    private _orthoSnap(from: WorldPoint, to: WorldPoint): WorldPoint {
        const v = orthoConstrain(
            { x: from.worldX, z: from.worldZ },
            { x: to.worldX,   z: to.worldZ   },
        );
        return { worldX: v.x, worldZ: v.z } as WorldPoint;
    }

    private _commitFromRoomAt(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[CeilingPlanToolHandler] AUTO: ViewDefinition.spatial.levelId is missing');
            return;
        }

        const roomStore = window.roomStore; // TODO(TASK-08)
        if (!roomStore) {
            console.warn('[CeilingPlanToolHandler] AUTO: roomStore not available on window');
            return;
        }

        const rooms: any[] = roomStore.getAll().filter((r: any) => r.levelId === levelId);
        const room = rooms.find(r => {
            const poly = r.boundary?.polygon;
            return poly && this._pointInPolygon({ x: pt.worldX, z: pt.worldZ }, poly);
        });
        if (!room) {
            console.warn('[CeilingPlanToolHandler] AUTO: no room found at clicked point');
            return;
        }

        // §FIX-CEILING-INNER-FACE-PARITY — the room ring runs along the wall CENTRELINES;
        // a finish built on it overshoots into every wall by half its thickness. Derive the
        // INNER-FACE polygon with the SAME canonical helper the floor paths use, so a
        // room's ceiling and floor boundaries are identical (fail-safe → centreline).
        const centreline = room.boundary.polygon.map((v: any) => ({ x: v.x, z: v.z }));
        const polygon = this._innerFacePolygon(room, levelId, centreline);
        const ceilingId = createId('ceiling');
        // §P3.2-CL (IMPL-PLAN-2026-05-17): dispatch payload matches CreateCeilingPayload
        // (new schema: id, boundary as Vec3[], ceilingHeight). Legacy ifcGuid/polygon removed.
        window.runtime?.bus?.executeCommand('ceiling.create', {
            id:           ceilingId,
            levelId,
            boundary:     polygon.map((p: { x: number; z: number }) => ({ x: p.x, y: 0, z: p.z })),
            ceilingHeight: 2.7,
        })?.catch((e: unknown) => console.error('[CeilingPlanToolHandler] ceiling.create (auto) failed:', e));
        console.log('[CeilingPlanToolHandler] Ceiling created from room', { ceilingId, roomId: room.id });
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._clearOverlay();
    }

    /**
     * §FIX-CEILING-INNER-FACE-PARITY — the clicked room's INNER-FACE ceiling boundary,
     * via the ONE canonical, store-injected `resolveRoomFinishBoundary`. Verbatim mirror
     * of `FloorPlanToolHandler._innerFacePolygon` (L-213/L-240): a single definition of
     * "which walls bound this room's finish" in the codebase.
     */
    private _innerFacePolygon(
        room: any,
        levelId: string,
        centreline: Array<{ x: number; z: number }>,
    ): Array<{ x: number; z: number }> {
        const wallStore = window.wallStore as {
            getById?: (id: string) => RoomFinishWall | undefined;
            getByLevel?: (levelId: string) => RoomFinishWall[];
        } | undefined; // TODO(TASK-08)
        if (!wallStore) return centreline;
        return resolveRoomFinishBoundary(centreline, {
            roomId: room.id,
            levelId,
            lookup: {
                // The plan tool already holds the full room record from the pick.
                // §FIX-BOUNDING-WALLS-UNDETERMINED — see the identical site and
                // the HONESTY NOTE in FloorPlanToolHandler._innerFacePolygon.
                // The caller stops forging a determined empty set; the callee's
                // own `?? []` fallback is a room-topology change out of lane, so
                // this ledger row is NOT struck.
                getRoomById:     () => ({ boundingWallIds: boundingWallIdsOrUnknown(room) as string[] | undefined }),
                getWallById:     (id) => wallStore.getById?.(id),
                getWallsByLevel: (lid) => wallStore.getByLevel?.(lid) ?? [],
            },
        });
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
            console.error('[CeilingPlanToolHandler] ViewDefinition.spatial.levelId is missing', c.viewDef.id);
            return;
        }

        const ceilingId = createId('ceiling');
        // §P3.2-CL (IMPL-PLAN-2026-05-17): dispatch payload matches CreateCeilingPayload
        // (new schema: id, boundary as Vec3[], ceilingHeight). Legacy ifcGuid/polygon removed.
        window.runtime?.bus?.executeCommand('ceiling.create', {
            id:           ceilingId,
            levelId,
            boundary:     this._points.map(p => ({ x: p.worldX, y: 0, z: p.worldZ })),
            ceilingHeight: 2.7,
        })?.catch((e: unknown) => console.error('[CeilingPlanToolHandler] ceiling.create failed:', e));
        console.log('[CeilingPlanToolHandler] Ceiling created', ceilingId);

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

        const screenPts = this._points.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        // §FEAT-BOUNDARY-CURVE-DRAW — the trailing cursor segment: a straight line,
        // or (curved mode with a pending midpoint) the tessellated Bézier through it.
        const trailingPts: Array<{ sx: number; sy: number }> = [];
        if (this._cursorPoint) {
            if (mode === 'curved' && this._arcMidPt && this._points.length > 0) {
                const last = this._points[this._points.length - 1];
                for (const v of arcSegmentThroughMidpoint(
                    { x: last.worldX, z: last.worldZ },
                    { x: this._arcMidPt.worldX, z: this._arcMidPt.worldZ },
                    { x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ },
                )) {
                    trailingPts.push(planCanvas.worldToScreen(v.x, v.z));
                }
            } else {
                trailingPts.push(planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ));
            }
        }

        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            for (const p of trailingPts) ctx.lineTo(p.sx, p.sy);
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
        for (const p of trailingPts) ctx.lineTo(p.sx, p.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arc midpoint indicator (mirrors WallPlanToolHandler's curved-mode marker).
        if (mode === 'curved' && this._arcMidPt) {
            const m = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            ctx.fillStyle = STROKE;
            ctx.beginPath(); ctx.arc(m.sx, m.sy, 5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = STROKE;
        for (const p of screenPts) {
            ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill();
        }

        if (screenPts.length >= 3 && this._cursorPoint) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(102,0,255,0.4)';
            ctx.lineWidth   = 1;
            const cur = planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ);
            ctx.beginPath();
            ctx.moveTo(cur.sx, cur.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const modeLabel = mode === 'ortho' ? 'Orthogonal' : (mode === 'curved' ? 'Curved' : 'Linear');
        const hint = (mode === 'curved' && this._points.length > 0)
            ? (this._arcMidPt
                ? 'Curved · Click the arc END point · Backspace to re-pick midpoint'
                : `Curved · Click the arc MIDPOINT${this._points.length >= 3 ? ' · Enter to close ceiling' : ''}`)
            : this._points.length >= 3
                ? `${modeLabel} · Dbl-click or Enter to close ceiling`
                : `${modeLabel} · ${3 - this._points.length} more point${3 - this._points.length !== 1 ? 's' : ''} needed`;
        this._drawHint(ctx, cssH, hint);
        ctx.restore();
    }

    private _drawHint(ctx: CanvasRenderingContext2D, cssH: number, text: string): void {
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(102,0,255,0.9)';
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
