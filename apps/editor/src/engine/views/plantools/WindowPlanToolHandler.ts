import type { WallData, WallStore } from '@pryzm/geometry-wall';
import { canvasHitToWorld3D } from '@pryzm/core-app-model';
// §P2.3 (IMPL-PLAN-2026-05-17): CreateWallOpeningCommand + window.commandManager bridge (P4.4).
// Window placement is now bus-only via WallOpeningLegacyAdapterHandler (plugins/wall).
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const PRYZM_PREVIEW_PURPLE = '#8B5CF6';
const PRYZM_PREVIEW_PURPLE_FILL = 'rgba(139,92,246,0.16)';

export class WindowPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _windowCursorPoint: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._windowCursorPoint = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._windowCursorPoint = null;
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._windowCursorPoint = pt;
        this._drawWindowPreview();
    }

    onClick(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        // §WINDOW-AUDIT-2026 (DI cleanup): pull wallStore from injected context.
        // commandManager removed E.5.6 — window placement dispatches via runtime bus.
        const wallStore = c.wallStore;
        if (!wallStore) {
            console.warn('[WindowPlanToolHandler] wallStore not present in PlanToolDrawContext');
            return;
        }

        const world3D = canvasHitToWorld3D(pt, c.viewPlane);
        const { sx, sy } = c.planCanvas.worldToScreen(pt.worldX, pt.worldZ);
        const hitWallId = c.planCanvas.hitTest(sx, sy, 16);
        const wallId = hitWallId ?? (
            c.viewPlane.isVertical
                ? this._findNearestWallIdInVerticalView(pt, c, 2.0)
                : this._findNearestWallId(world3D.x, world3D.z, 1.5)
        );

        if (!wallId) {
            console.warn('[WindowPlanToolHandler] No wall found near cursor — click closer to a wall');
            return;
        }

        // §WINDOW-AUDIT-2026 (WIN-CURVED-WALL-BLOCK): refuse curved walls.
        const targetWall = wallStore.getById(wallId);
        if (targetWall && (targetWall as any).curve) {
            console.warn('[WindowPlanToolHandler] Curved walls are not supported for window placement.');
            return;
        }

        // §WINDOW-AUDIT-2026 (DI cleanup): windowType + system from injected tool.
        const ot           = c.activeOpeningTool ?? {};
        const windowType   = (ot.windowType ?? 'single') as 'single' | 'double';
        const WINDOW_WIDTH = windowType === 'double' ? 2.4 : 1.2;
        const systemTypeId = ot.systemTypeId ?? undefined;

        const offset = c.viewPlane.isVertical
            ? this._computeWallOffsetInVerticalView(pt.worldX, wallId, WINDOW_WIDTH, c, wallStore)
            : this._computeWallOffset(world3D.x, world3D.z, wallId, WINDOW_WIDTH, wallStore);

        console.log(`[WindowPlanToolHandler] Window placement — wallId=${wallId} type=${windowType} width=${WINDOW_WIDTH}m offset=${offset.toFixed(3)}m`);

        // §P2.3 (IMPL-PLAN-2026-05-17): bus-only dispatch — single pipeline path.
        // WallOpeningLegacyAdapterHandler (plugins/wall) handles wall.opening.create:
        //   → PRYZM3 Immer store write (if wall in PRYZM3 store)
        //   → CommandEventBridge emits wall.opening.created
        //   → initTools.ts bridge calls legacyWallStore.addOpening() → mesh rebuild.
        // id + elementId are pre-generated here so PRYZM3 store and legacy store share
        // the same stable IDs (avoids mismatch on undo replay).
        const _openingId  = crypto.randomUUID();
        const _elementId  = crypto.randomUUID();
        const _openingData = {
            id:           _openingId,
            elementId:    _elementId,
            type:         'window',
            offset,
            width:        WINDOW_WIDTH,
            height:       1.2,
            sillHeight:   1.0,
            windowType,
            systemTypeId,
        } as const;

        // §P4.1: ctx.runtime is now typed — no unsafe (window as any) cast needed.
        const _runtime = c.runtime ?? window.runtime;
        _runtime?.bus?.executeCommand('wall.opening.create', { wallId, openingData: _openingData })
            ?.catch((e: unknown) => console.error('[WindowPlanToolHandler] wall.opening.create bus failed:', e));

        this._windowCursorPoint = null;
        this._clearOverlay();
    }

    cancel(): void {
        this._windowCursorPoint = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._windowCursorPoint) this._drawWindowPreview();
    }

    private _drawWindowPreview(): void {
        const c = this._ctx;
        if (!c || !this._windowCursorPoint) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);

        const ppu  = planCanvas.getPixelsPerUnit();
        const { sx, sy } = planCanvas.worldToScreen(this._windowCursorPoint.worldX, this._windowCursorPoint.worldZ);
        const angle = this._getNearestWallScreenAngle(this._windowCursorPoint.worldX, this._windowCursorPoint.worldZ, c);

        // §WINDOW-AUDIT-2026 (DI cleanup): windowType from injected activeOpeningTool.
        const windowType   = (c.activeOpeningTool?.windowType ?? 'single') as 'single' | 'double';
        const winWidthM    = windowType === 'double' ? 2.4 : 1.2;
        const winWidthPx   = winWidthM * ppu;
        const wallThickPx  = Math.max(4, 0.2 * ppu);
        const hw = winWidthPx / 2;

        if (c.viewPlane.isVertical) {
            const sillPx = 1.0 * ppu;
            const heightPx = 1.2 * ppu;
            const yBottom = -sillPx;
            const yTop = yBottom - heightPx;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = PRYZM_PREVIEW_PURPLE;
            ctx.fillStyle = PRYZM_PREVIEW_PURPLE_FILL;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(-hw, yTop, winWidthPx, heightPx);
            ctx.fill();
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(-hw, yTop + heightPx / 2);
            ctx.lineTo(hw, yTop + heightPx / 2);
            ctx.moveTo(0, yTop);
            ctx.lineTo(0, yBottom);
            if (windowType === 'double') {
                ctx.moveTo(-hw / 2, yTop);
                ctx.lineTo(-hw / 2, yBottom);
                ctx.moveTo(hw / 2, yTop);
                ctx.lineTo(hw / 2, yBottom);
            }
            ctx.moveTo(-hw - 5, yBottom + 4);
            ctx.lineTo(hw + 5, yBottom + 4);
            ctx.stroke();
            ctx.restore();

            this._drawCursorMarker(sx, sy);
            return;
        }

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = PRYZM_PREVIEW_PURPLE;
        ctx.lineWidth   = 1.5;

        ctx.beginPath();
        ctx.moveTo(-hw, -wallThickPx / 2); ctx.lineTo(-hw, wallThickPx / 2);
        ctx.moveTo( hw, -wallThickPx / 2); ctx.lineTo( hw, wallThickPx / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0);
        ctx.stroke();

        if (windowType === 'double') {
            ctx.setLineDash([]);
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(0, -wallThickPx / 2); ctx.lineTo(0, wallThickPx / 2);
            ctx.stroke();
        }
        ctx.restore();

        this._drawCursorMarker(sx, sy);
    }

    private _drawCursorMarker(sx: number, sy: number): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx } = c;
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = PRYZM_PREVIEW_PURPLE;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy);
        ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6);
        ctx.stroke();
        ctx.restore();
    }

    private _findNearestWallId(worldX: number, worldZ: number, maxDistM = 1.5): string | null {
        const ws = this._ctx?.wallStore;
        if (!ws?.getAll) return null;

        let bestId: string | null = null;
        let bestDist = maxDistM;

        for (const wall of ws.getAll() as WallData[]) {
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;
            const ax = bl[0].x, az = bl[0].z;
            const bx = bl[1].x, bz = bl[1].z;
            const dx = bx - ax, dz = bz - az;
            const lenSq = dx * dx + dz * dz;
            let dist: number;
            if (lenSq < 1e-10) {
                dist = Math.hypot(worldX - ax, worldZ - az);
            } else {
                const t = Math.max(0, Math.min(1, ((worldX - ax) * dx + (worldZ - az) * dz) / lenSq));
                dist = Math.hypot(worldX - (ax + t * dx), worldZ - (az + t * dz));
            }
            if (dist < bestDist) { bestDist = dist; bestId = wall.id; }
        }
        return bestId;
    }

    private _computeWallOffset(worldX: number, worldZ: number, wallId: string, openingWidth: number, ws: WallStore): number {
        const wall = ws.getById(wallId) as WallData | undefined;
        if (!wall?.baseLine || wall.baseLine.length < 2) return openingWidth / 2;

        const ax = wall.baseLine[0].x, az = wall.baseLine[0].z;
        const bx = wall.baseLine[1].x, bz = wall.baseLine[1].z;
        const dx = bx - ax, dz = bz - az;
        const wallLen = Math.hypot(dx, dz);
        if (wallLen < 0.001) return openingWidth / 2;

        const raw  = ((worldX - ax) * dx + (worldZ - az) * dz) / wallLen;
        const half = openingWidth / 2;
        return Math.max(half, Math.min(wallLen - half, raw));
    }

    private _findNearestWallIdInVerticalView(pt: WorldPoint, c: PlanToolDrawContext, maxDistM = 2.0): string | null {
        const ws = c.wallStore;
        if (!ws?.getAll) return null;

        const levelId = c.viewDef.spatial?.levelId;
        let bestId: string | null = null;
        let bestDist = maxDistM;

        for (const wall of ws.getAll() as WallData[]) {
            if (levelId && wall.levelId !== levelId) continue;
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;
            const aH = c.viewPlane.hWorldAxis === 'x' ? bl[0].x : bl[0].z;
            const bH = c.viewPlane.hWorldAxis === 'x' ? bl[1].x : bl[1].z;
            const minH = Math.min(aH, bH);
            const maxH = Math.max(aH, bH);
            const span = Math.max(maxH - minH, 0);
            const hDist = pt.worldX < minH ? minH - pt.worldX : pt.worldX > maxH ? pt.worldX - maxH : 0;
            const height = Number(wall.height) || 3;
            const baseY = Number((wall as any).baseOffset) || 0;
            const vDist = pt.worldZ < baseY ? baseY - pt.worldZ : pt.worldZ > baseY + height ? pt.worldZ - (baseY + height) : 0;
            const dist = span <= 1e-4 ? Math.hypot(hDist, vDist) + 0.5 : Math.hypot(hDist, vDist);
            if (dist < bestDist) { bestDist = dist; bestId = wall.id; }
        }

        return bestId;
    }

    private _computeWallOffsetInVerticalView(worldH: number, wallId: string, openingWidth: number, c: PlanToolDrawContext, ws: WallStore): number {
        const wall = ws.getById(wallId) as WallData | undefined;
        if (!wall?.baseLine || wall.baseLine.length < 2) return openingWidth / 2;

        const a = wall.baseLine[0];
        const b = wall.baseLine[1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const wallLen = Math.hypot(dx, dz);
        if (wallLen < 0.001) return openingWidth / 2;

        const aH = c.viewPlane.hWorldAxis === 'x' ? a.x : a.z;
        const bH = c.viewPlane.hWorldAxis === 'x' ? b.x : b.z;
        const dH = bH - aH;
        const t = Math.abs(dH) > 1e-6 ? Math.max(0, Math.min(1, (worldH - aH) / dH)) : 0.5;
        const half = openingWidth / 2;
        return Math.max(half, Math.min(wallLen - half, t * wallLen));
    }

    private _getNearestWallScreenAngle(worldX: number, worldZ: number, c: PlanToolDrawContext): number {
        const wallStore = c.wallStore;
        if (!wallStore?.getAll) return 0;

        const levelId = c.viewDef.spatial?.levelId;
        const SNAP_R  = 2.0;

        let bestWall: any = null;
        let bestDist = SNAP_R;

        for (const wall of wallStore.getAll() as WallData[]) {
            if (levelId && wall.levelId !== levelId) continue;
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;
            const ax = bl[0].x, az = bl[0].z;
            const bx = bl[1].x, bz = bl[1].z;
            const dx = bx - ax, dz = bz - az;
            const lenSq = dx * dx + dz * dz;
            let dist: number;
            if (lenSq < 1e-10) {
                dist = Math.hypot(worldX - ax, worldZ - az);
            } else {
                const t = Math.max(0, Math.min(1, ((worldX - ax) * dx + (worldZ - az) * dz) / lenSq));
                dist = Math.hypot(worldX - (ax + t * dx), worldZ - (az + t * dz));
            }
            if (dist < bestDist) { bestDist = dist; bestWall = wall; }
        }

        if (!bestWall) return 0;
        const bl = bestWall.baseLine;
        const wx = bl[1].x - bl[0].x;
        const wz = bl[1].z - bl[0].z;
        const o  = c.planCanvas.worldToScreen(0, 0);
        const t  = c.planCanvas.worldToScreen(wx, wz);
        return Math.atan2(t.sy - o.sy, t.sx - o.sx);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
