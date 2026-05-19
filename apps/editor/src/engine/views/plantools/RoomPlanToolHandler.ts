import { createId } from '@pryzm/schemas';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

export class RoomPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _roomPoints: WorldPoint[] = [];
    private _roomCursorPoint: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._roomPoints      = [];
        this._roomCursorPoint = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._roomPoints      = [];
        this._roomCursorPoint = null;
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        if (this._roomPoints.length > 0) {
            this._roomCursorPoint = pt;
            this._drawRoomPreview();
        }
    }

    onClick(pt: WorldPoint): void {
        this._roomPoints.push(pt);
        this._drawRoomPreview();
        console.log('[RoomPlanToolHandler] Room point added', pt, `total: ${this._roomPoints.length}`);
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (this._roomPoints.length >= 3) this._commitRoom();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Enter' && this._roomPoints.length >= 3) {
            this._commitRoom();
            return true;
        }
        if (e.key === 'Backspace' && this._roomPoints.length > 0) {
            this._roomPoints.pop();
            this._drawRoomPreview();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._roomPoints      = [];
        this._roomCursorPoint = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._roomPoints.length > 0) this._drawRoomPreview();
    }

    private _commitRoom(): void {
        const c = this._ctx;
        if (!c || this._roomPoints.length < 3) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[RoomPlanToolHandler] ViewDefinition.spatial.levelId is missing', c.viewDef.id);
            return;
        }

        let area = 0;
        const poly = this._roomPoints;
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            area += poly[i].worldX * poly[j].worldZ;
            area -= poly[j].worldX * poly[i].worldZ;
        }
        area = Math.abs(area) / 2;

        const roomId = createId('room');
        let perimeter = 0;
        let centroidX = 0;
        let centroidZ = 0;
        let signedArea2 = 0;
        let minX = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxZ = -Infinity;

        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const cross = a.worldX * b.worldZ - b.worldX * a.worldZ;
            signedArea2 += cross;
            centroidX += (a.worldX + b.worldX) * cross;
            centroidZ += (a.worldZ + b.worldZ) * cross;
            perimeter += Math.hypot(b.worldX - a.worldX, b.worldZ - a.worldZ);
            minX = Math.min(minX, a.worldX);
            minZ = Math.min(minZ, a.worldZ);
            maxX = Math.max(maxX, a.worldX);
            maxZ = Math.max(maxZ, a.worldZ);
        }

        if (Math.abs(signedArea2) > 0.000001) {
            centroidX /= 3 * signedArea2;
            centroidZ /= 3 * signedArea2;
        } else {
            centroidX = poly.reduce((sum, p) => sum + p.worldX, 0) / poly.length;
            centroidZ = poly.reduce((sum, p) => sum + p.worldZ, 0) / poly.length;
        }

        const height = 3.0;
        window.runtime?.bus?.executeCommand('room.create', {
            id: roomId,
            type: 'room',
            name: '',
            roomNumber: '',
            levelId,
            parentId: levelId,
            boundary: {
                polygon: poly.map(p => ({ x: p.worldX, z: p.worldZ })),
                baseOffset: 0,
                height,
                detectionMethod: 'manual-boundary',
            },
            boundingWallIds: [],
            boundingSlabIds: [],
            boundingColumnIds: [],
            occupancyType: 'unclassified',
            finishes: {},
            computed: {
                area,
                grossArea: area,
                perimeter,
                volume: area * height,
                centroid: { x: centroidX, z: centroidZ },
                boundingBox: { minX, minZ, maxX, maxZ },
            },
            colour: '#a5b4fc',
            opacity: 0.35,
            properties: {},
            metadata: {
                createdAt: Date.now(),
                modifiedAt: Date.now(),
                createdBy: 'system',
                version: 1,
            },
        })?.catch((e: unknown) => console.error('[RoomPlanToolHandler] room.create failed:', e));
        console.log('[RoomPlanToolHandler] Room created', roomId);

        this._roomPoints      = [];
        this._roomCursorPoint = null;
        this._clearOverlay();
    }

    private _drawRoomPreview(): void {
        const c = this._ctx;
        if (!c || this._roomPoints.length === 0) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        const screenPts = this._roomPoints.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#6366f1';
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            if (this._roomCursorPoint) {
                const cur = planCanvas.worldToScreen(this._roomCursorPoint.worldX, this._roomCursorPoint.worldZ);
                ctx.lineTo(cur.sx, cur.sy);
            }
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.setLineDash([5, 3]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = '#6366f1';
        ctx.beginPath();
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
        if (this._roomCursorPoint) {
            const cur = planCanvas.worldToScreen(this._roomCursorPoint.worldX, this._roomCursorPoint.worldZ);
            ctx.lineTo(cur.sx, cur.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#6366f1';
        for (const p of screenPts) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        if (screenPts.length >= 3 && this._roomCursorPoint) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(99,102,241,0.4)';
            ctx.lineWidth = 1;
            const cur = planCanvas.worldToScreen(this._roomCursorPoint.worldX, this._roomCursorPoint.worldZ);
            ctx.beginPath();
            ctx.moveTo(cur.sx, cur.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const hint = this._roomPoints.length >= 3
            ? 'Dbl-click or Enter to close'
            : `${3 - this._roomPoints.length} more point${3 - this._roomPoints.length !== 1 ? 's' : ''} needed`;
        ctx.font = 'bold 11px sans-serif';
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
