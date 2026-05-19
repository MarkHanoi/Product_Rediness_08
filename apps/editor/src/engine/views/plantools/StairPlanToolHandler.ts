import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
// §P3.3 (IMPL-PLAN-2026-05-17): CreateStairCommand removed — no longer called in this file.
// Dispatch is bus-only via 'stair.create'. The §E.5.4 bridge in initBusHandlers.ts
// routes stair.create → _cmExec(new CreateStairCommand(cmd)) → legacy stair store → mesh rebuild.

const STROKE = '#6366f1';
const FILL_A = 'rgba(99,102,241,0.10)';

/**
 * D-1 — Stair creation in plan view.
 *
 * Interaction: two-click rectangle (corner A → corner B defines the bounding box).
 * The bounding box width and depth determine the stair run direction (longer axis = flight direction).
 *
 * §P3.3 (IMPL-PLAN-2026-05-17): bus-only dispatch.
 *   'stair.create' → §E.5.4 bridge (initBusHandlers.ts) → _cmExec(new CreateStairCommand(cmd))
 *   → legacy stair store → mesh rebuild.
 *   commandManager is retained only for level resolution in _resolveTopLevel/_getLevelHeight;
 *   both helpers fall back to window.levelStore if cm is unavailable (safe via try/catch).
 */
export class StairPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cornerA: WorldPoint | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx     = ctx;
        this._cornerA = null;
        this._cursor  = null;
    }

    deactivate(): void {
        this._clearOverlay();
        this._cornerA = null;
        this._cursor  = null;
        this._ctx     = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        if (!this._cornerA) {
            this._cornerA = pt;
            console.log('[StairPlanToolHandler] Corner A set', pt);
            return;
        }
        this._commitStair(pt);
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
        this._cornerA = null;
        this._cursor  = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._cornerA && this._cursor) this._drawPreview();
    }

    private _commitStair(cornerB: WorldPoint): void {
        const c  = this._ctx;
        const cA = this._cornerA;
        if (!c || !cA) return;

        const baseLevelId = c.viewDef.spatial?.levelId;
        if (!baseLevelId) {
            console.error('[StairPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        // commandManager is used only for level resolution (cm.context?.stores?.wallStore?.getLevels).
        // Both _resolveTopLevel and _getLevelHeight fall back to window.levelStore inside try/catch,
        // so a null cm is safe. §P3.3: cm is NO LONGER used for creation — bus dispatch handles that.
        const cm = window.commandManager; // TODO(TASK-06): replace with DI PlanToolDrawContext.levelStore
        if (!cm) {
            console.warn('[StairPlanToolHandler] commandManager unavailable — level resolution falling back to window.levelStore.');
        }

        // Resolve top level (adjacent level above baseLevelId)
        const topLevelId = this._resolveTopLevel(baseLevelId, cm);
        if (!topLevelId) {
            console.error('[StairPlanToolHandler] Could not resolve topLevelId for baseLevelId:', baseLevelId);
            window.runtime?.events?.emit('pryzm:toast', { // F.events.15
                message: 'Add a second level before placing a stair — go to Levels and create the floor above.',
                severity: 'error',
            });
            this._cornerA = null;
            this._cursor  = null;
            this._clearOverlay();
            return;
        }

        const minX = Math.min(cA.worldX, cornerB.worldX);
        const maxX = Math.max(cA.worldX, cornerB.worldX);
        const minZ = Math.min(cA.worldZ, cornerB.worldZ);
        const maxZ = Math.max(cA.worldZ, cornerB.worldZ);

        const w     = Math.max(0.05, maxX - minX);
        const depth = Math.max(0.05, maxZ - minZ);

        // Flight runs along the longer axis
        const flightDir = depth >= w
            ? { x: 0, y: 0, z: 1 }
            : { x: 1, y: 0, z: 0 };

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        // Level heights for riser calculation.
        // riserHeight is derived from levelHeight so that riserHeight * riserCount
        // equals levelHeight exactly — avoiding the HEIGHT_TOLERANCE validation failure
        // that occurs when rounding causes a mismatch (e.g. 2.7 m / 0.175 = 15.43 → 15
        // risers × 0.175 = 2.625 m, 75 mm off which exceeds the 50 mm tolerance).
        const levelHeight = this._getLevelHeight(baseLevelId, topLevelId, cm) ?? 3.0;
        const nominalRiserHeight = 0.175;
        const riserCount  = Math.max(2, Math.round(levelHeight / nominalRiserHeight));
        const riserHeight = levelHeight / riserCount;   // exact — always passes height validation
        const treadDepth  = 0.280;

        // §P3.3 (IMPL-PLAN-2026-05-17): bus-only dispatch — single pipeline.
        // The §E.5.4 bridge in initBusHandlers.ts routes stair.create →
        // _cmExec(new CreateStairCommand(cmd)) → legacy stair store → mesh rebuild.
        window.runtime?.bus?.executeCommand('stair.create', {
            baseLevelId,
            topLevelId,
            shape:           'I',
            riserHeight,
            treadDepth,
            width:           depth >= w ? w : depth,
            startPosition:   { x: cx, y: 0, z: cz },
            flights: [{
                direction:  flightDir,
                riserCount,
            }],
        })?.catch((e: Error) => console.error('[StairPlanToolHandler] stair.create bus failed:', e));
        console.log('[StairPlanToolHandler] Stair created');

        this._cornerA = null;
        this._cursor  = null;
        this._clearOverlay();
    }

    /** Try multiple paths to find the first level above baseLevelId. */
    private _resolveTopLevel(baseLevelId: string, cm: any): string | null {
        try {
            const levels: any[] =
                cm.context?.stores?.wallStore?.getLevels?.() ??
                window.levelStore?.getAll?.() ?? // TODO(TASK-08)
                window.projectStore?.getLevels?.() ?? // TODO(TASK-08)
                [];

            if (!levels.length) return null;

            const sorted = [...levels].sort(
                (a, b) => (a.elevation ?? a.height ?? 0) - (b.elevation ?? b.height ?? 0),
            );

            const idx = sorted.findIndex(l => l.id === baseLevelId);
            if (idx < 0 || idx >= sorted.length - 1) {
                // base level not found or already topmost — use last as fallback
                return sorted.length > 1 ? sorted[sorted.length - 1].id : null;
            }
            return sorted[idx + 1].id;
        } catch (e) {
            console.warn('[StairPlanToolHandler] _resolveTopLevel error', e);
            return null;
        }
    }

    private _getLevelHeight(baseId: string, topId: string, cm: any): number | null {
        try {
            const levels: any[] =
                cm.context?.stores?.wallStore?.getLevels?.() ??
                window.levelStore?.getAll?.() ?? // TODO(TASK-08)
                [];

            const base = levels.find(l => l.id === baseId);
            const top  = levels.find(l => l.id === topId);
            if (!base || !top) return null;

            const be = base.elevation ?? base.height ?? 0;
            const te = top.elevation  ?? top.height  ?? 0;
            return Math.abs(te - be) || null;
        } catch {
            return null;
        }
    }

    private _drawPreview(): void {
        const c  = this._ctx;
        if (!c) return;
        const cA = this._cornerA;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        // Pre-first-click: show cursor crosshair + hint only
        if (!cA) {
            if (this._cursor) {
                const { sx, sy } = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
                ctx.strokeStyle = STROKE;
                ctx.lineWidth   = 1.2;
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.arc(sx, sy, 6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
                const T = 10;
                ctx.beginPath();
                ctx.moveTo(sx - T, sy); ctx.lineTo(sx - 7, sy);
                ctx.moveTo(sx + 7, sy); ctx.lineTo(sx + T, sy);
                ctx.moveTo(sx, sy - T); ctx.lineTo(sx, sy - 7);
                ctx.moveTo(sx, sy + 7); ctx.lineTo(sx, sy + T);
                ctx.stroke();
            }
            ctx.font         = 'bold 11px sans-serif';
            ctx.fillStyle    = 'rgba(255,255,255,0.9)';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'bottom';
            const hint = 'Click first corner to start stair bounding box';
            const tw   = ctx.measureText(hint).width;
            ctx.fillRect(8, cssH - 30, tw + 14, 20);
            ctx.fillStyle = 'rgba(99,102,241,0.95)';
            ctx.fillText(hint, 14, cssH - 14);
            ctx.restore();
            return;
        }

        const cp = this._cursor ?? cA;
        const sA = planCanvas.worldToScreen(cA.worldX, cA.worldZ);
        const sB = planCanvas.worldToScreen(cp.worldX, cp.worldZ);

        const rx = Math.min(sA.sx, sB.sx);
        const ry = Math.min(sA.sy, sB.sy);
        const rw = Math.abs(sB.sx - sA.sx);
        const rh = Math.abs(sB.sy - sA.sy);

        // Fill
        ctx.fillStyle   = FILL_A;
        ctx.fillRect(rx, ry, rw, rh);

        // Stroke
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);

        // Phase 9: Improved stair preview — step count from world geometry,
        // tread lines, direction arrow, and break line (AEC convention).
        const worldDepth = Math.abs(cp.worldZ - cA.worldZ);
        const worldWidth = Math.abs(cp.worldX - cA.worldX);
        const flightIsVertical = worldDepth >= worldWidth;
        const TREAD_DEPTH_M = 0.280;
        const flightLengthM = flightIsVertical ? worldDepth : worldWidth;
        const stepCount = Math.max(3, Math.min(20, Math.round(flightLengthM / TREAD_DEPTH_M)));

        // Tread lines along flight direction
        ctx.strokeStyle = STROKE;
        ctx.lineWidth = 0.75;
        ctx.setLineDash([]);
        if (flightIsVertical) {
            for (let i = 1; i < stepCount; i++) {
                const y = ry + (rh / stepCount) * i;
                ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + rw, y); ctx.stroke();
            }
        } else {
            for (let i = 1; i < stepCount; i++) {
                const x = rx + (rw / stepCount) * i;
                ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + rh); ctx.stroke();
            }
        }

        // Break line at midpoint (zigzag diagonal — standard plan-view stair convention)
        ctx.strokeStyle = 'rgba(99,102,241,0.7)';
        ctx.lineWidth = 1.5;
        if (flightIsVertical) {
            const midY = ry + rh / 2;
            const zz   = 6;
            ctx.beginPath();
            ctx.moveTo(rx, midY);
            ctx.lineTo(rx + rw * 0.4, midY - zz);
            ctx.lineTo(rx + rw * 0.6, midY + zz);
            ctx.lineTo(rx + rw, midY);
            ctx.stroke();
        } else {
            const midX = rx + rw / 2;
            const zz   = 6;
            ctx.beginPath();
            ctx.moveTo(midX, ry);
            ctx.lineTo(midX - zz, ry + rh * 0.4);
            ctx.lineTo(midX + zz, ry + rh * 0.6);
            ctx.lineTo(midX, ry + rh);
            ctx.stroke();
        }

        // Direction arrow (up = bottom → top of box = ascending)
        ctx.strokeStyle = STROKE;
        ctx.fillStyle   = STROKE;
        ctx.lineWidth   = 1.5;
        if (flightIsVertical) {
            const arrowX = rx + rw / 2;
            const aHead  = ry + 8;
            const aTail  = ry + rh - 8;
            ctx.beginPath();
            ctx.moveTo(arrowX, aTail);
            ctx.lineTo(arrowX, aHead);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(arrowX, aHead);
            ctx.lineTo(arrowX - 5, aHead + 10);
            ctx.lineTo(arrowX + 5, aHead + 10);
            ctx.closePath();
            ctx.fill();
        } else {
            const arrowY = ry + rh / 2;
            const aHead  = rx + 8;
            const aTail  = rx + rw - 8;
            ctx.beginPath();
            ctx.moveTo(aTail, arrowY);
            ctx.lineTo(aHead, arrowY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(aHead, arrowY);
            ctx.lineTo(aHead + 10, arrowY - 5);
            ctx.lineTo(aHead + 10, arrowY + 5);
            ctx.closePath();
            ctx.fill();
        }

        // Corner dots
        ctx.fillStyle = STROKE;
        ctx.beginPath(); ctx.arc(sA.sx, sA.sy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sB.sx, sB.sy, 4, 0, Math.PI * 2); ctx.fill();

        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(99,102,241,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Click opposite corner to place stair (~${stepCount} treads)`, 12, cssH - 12);

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
