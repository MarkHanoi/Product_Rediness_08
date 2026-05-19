/**
 * PlanElementDragController — 2D Plan View Element Movement
 *
 * Implements Revit-style drag movement for walls, doors, and windows in the
 * 2D plan view canvas. Architecture matches the annotation-drag pattern in
 * PlanViewInteraction: live store preview → CommandManager commit on mouseup.
 *
 * Supported workflows
 * ───────────────────
 *   • Wall drag     — translates both endpoints by (ΔX, ΔZ); 100 mm grid snap
 *   • Door drag     — constrained 1D movement along host wall; live offset
 *   • Window drag   — same as door
 *
 * Overlay rendering
 * ─────────────────
 * The controller owns a transparent <canvas> element overlaid on the plan view
 * canvas. It clears and redraws this overlay on every rAF tick while a drag is
 * active, then removes it on end/cancel. This avoids any coupling back into the
 * PlanViewCanvas render pipeline.
 */

import { UpdateWallBaselineCommand, SetDoorOffsetCommand, SetWindowOffsetCommand } from '@pryzm/command-registry';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { Point3D } from '../types/GeometryDTO';
import type { PlanViewCanvas } from './PlanViewCanvas';

const GRID_SNAP_M    = 0.1;   // 100 mm grid
const DRAG_THRESHOLD = 4;     // px before drag activates

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function clonePt(p: Point3D): Point3D { return { x: p.x, y: p.y, z: p.z }; }

function gridSnap(v: number): number {
    return Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;
}

/** Project point P onto segment AB, returns t ∈ [0,1]. */
function projectOntoSegment(
    px: number, pz: number,
    ax: number, az: number,
    bx: number, bz: number,
): number {
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-10) return 0;
    return Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
}

function formatM(m: number): string {
    return m < 0.01 ? `${Math.round(m * 1000)} mm` : `${m.toFixed(2)} m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag state
// ─────────────────────────────────────────────────────────────────────────────

type DragState =
    | {
          kind: 'wall';
          elementId:      string;
          prevBaseLine:   [Point3D, Point3D];
          currentBaseLine:[Point3D, Point3D];
          startWorldX:    number; startWorldZ: number;
          startSx:        number; startSy: number;
          activated:      boolean;
      }
    | {
          kind: 'door' | 'window';
          elementId:    string;
          wallId:       string;
          prevOffset:   number;
          currentOffset:number;
          wallA:        Point3D; wallB: Point3D;
          wallLength:   number;
          startSx:      number; startSy: number;
          activated:    boolean;
      };

// ─────────────────────────────────────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────────────────────────────────────

export class PlanElementDragController {
    private _state:       DragState | null     = null;
    private _planCanvas:  PlanViewCanvas | null = null;
    private _domCanvas:   HTMLCanvasElement | null = null;

    /** Overlay canvas for drag ghost + dimension labels. */
    private _overlay:     HTMLCanvasElement | null = null;
    private _rafPending   = false;

    get isDragging():  boolean { return this._state !== null; }
    get isActivated(): boolean { return this._state?.activated ?? false; }

    // ──────────────────────────────────────────────────────────────────────
    // Hit-test
    // ──────────────────────────────────────────────────────────────────────

    hitTestDraggable(
        sx: number,
        sy: number,
        planCanvas: PlanViewCanvas,
    ): { elementId: string; kind: 'wall' | 'door' | 'window' } | null {
        const elementId = planCanvas.hitTest(sx, sy, 10);
        if (!elementId) return null;
        const ws = this._ws();
        if (!ws) return null;
        if (ws.getDoor(elementId))   return { elementId, kind: 'door' };
        if (ws.getWindow(elementId)) return { elementId, kind: 'window' };
        if (ws.getById(elementId))   return { elementId, kind: 'wall' };
        return null;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Start
    // ──────────────────────────────────────────────────────────────────────

    startDrag(
        hit:       { elementId: string; kind: 'wall' | 'door' | 'window' },
        sx:        number,
        sy:        number,
        planCanvas:PlanViewCanvas,
        domCanvas: HTMLCanvasElement,
    ): boolean {
        this.cancel();
        this._planCanvas = planCanvas;
        this._domCanvas  = domCanvas;

        const ws = this._ws();
        if (!ws) return false;

        const { worldX, worldZ } = planCanvas.screenToWorld(sx, sy);

        if (hit.kind === 'wall') {
            const wall = ws.getById(hit.elementId);
            if (!wall) return false;
            this._state = {
                kind:           'wall',
                elementId:      hit.elementId,
                prevBaseLine:   [clonePt(wall.baseLine[0]), clonePt(wall.baseLine[1])],
                currentBaseLine:[clonePt(wall.baseLine[0]), clonePt(wall.baseLine[1])],
                startWorldX:    worldX, startWorldZ: worldZ,
                startSx:        sx,     startSy:     sy,
                activated:      false,
            };
        } else {
            const opening = hit.kind === 'door' ? ws.getDoor(hit.elementId) : ws.getWindow(hit.elementId);
            if (!opening) return false;
            const wall = ws.getById(opening.wallId);
            if (!wall)    return false;
            const wLen = Math.hypot(
                wall.baseLine[1].x - wall.baseLine[0].x,
                wall.baseLine[1].z - wall.baseLine[0].z,
            );
            this._state = {
                kind:          hit.kind,
                elementId:     hit.elementId,
                wallId:        opening.wallId,
                prevOffset:    opening.offset,
                currentOffset: opening.offset,
                wallA:         clonePt(wall.baseLine[0]),
                wallB:         clonePt(wall.baseLine[1]),
                wallLength:    wLen,
                startSx:       sx, startSy: sy,
                activated:     false,
            };
        }

        this._ensureOverlay(domCanvas);
        console.log(`[PlanDrag] ${hit.kind} drag started:`, hit.elementId);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Move
    // ──────────────────────────────────────────────────────────────────────

    onMove(sx: number, sy: number): void {
        const state = this._state;
        if (!state || !this._planCanvas) return;

        if (!state.activated) {
            if (Math.hypot(sx - state.startSx, sy - state.startSy) < DRAG_THRESHOLD) return;
            state.activated = true;
        }

        const { worldX, worldZ } = this._planCanvas.screenToWorld(sx, sy);
        const ws = this._ws();
        if (!ws) return;

        if (state.kind === 'wall') {
            this._moveWall(state, worldX, worldZ, ws);
        } else {
            this._moveDoorWindow(state, worldX, worldZ, ws);
        }

        this._scheduleOverlayRender();
    }

    private _moveWall(
        state:   Extract<DragState, { kind: 'wall' }>,
        worldX:  number,
        worldZ:  number,
        ws:      any,
    ): void {
        const deltaX = gridSnap(worldX - state.startWorldX);
        const deltaZ = gridSnap(worldZ - state.startWorldZ);
        const newA: Point3D = { x: state.prevBaseLine[0].x + deltaX, y: state.prevBaseLine[0].y, z: state.prevBaseLine[0].z + deltaZ };
        const newB: Point3D = { x: state.prevBaseLine[1].x + deltaX, y: state.prevBaseLine[1].y, z: state.prevBaseLine[1].z + deltaZ };
        state.currentBaseLine = [newA, newB];

        // Live store update — triggers 3D rebuild and plan re-projection
        const wall = ws.getById(state.elementId);
        ws.update(state.elementId, {
            baseLine: [newA, newB],
            _renderVersion: (wall?._renderVersion ?? 0) + 1,
        });
    }

    private _moveDoorWindow(
        state:  Extract<DragState, { kind: 'door' | 'window' }>,
        worldX: number,
        worldZ: number,
        ws:     any,
    ): void {
        const t = projectOntoSegment(worldX, worldZ, state.wallA.x, state.wallA.z, state.wallB.x, state.wallB.z);
        const rawOffset  = t * state.wallLength;
        const snapped    = gridSnap(rawOffset);

        const el = state.kind === 'door' ? ws.getDoor(state.elementId) : ws.getWindow(state.elementId);
        if (!el) return;

        const halfW  = el.width / 2;
        const clamped = Math.max(halfW, Math.min(snapped, state.wallLength - halfW));
        state.currentOffset = clamped;

        if (state.kind === 'door')   ws.updateDoor(state.elementId,   { offset: clamped });
        else                         ws.updateWindow(state.elementId, { offset: clamped });
    }

    // ──────────────────────────────────────────────────────────────────────
    // End
    // ──────────────────────────────────────────────────────────────────────

    async onEnd(): Promise<void> {
        const state = this._state;
        this._state = null;
        this._removeOverlay();
        this._planCanvas = null;
        this._domCanvas  = null;

        if (!state || !state.activated) return;

        const cmdMgr = window.commandManager; // TODO(TASK-06)
        if (!cmdMgr) { console.warn('[PlanDrag] No commandManager — drag has no undo'); return; }

        if (state.kind === 'wall') {
            cmdMgr.execute( // TODO(TASK-06)
                new UpdateWallBaselineCommand({
                    wallId:      state.elementId,
                    newBaseLine: state.currentBaseLine,
                    prevBaseLine: state.prevBaseLine,
                }),
                { source: 'HUMAN_DIRECT' },
            );
            console.log('[PlanDrag] Wall committed Δ(',
                (state.currentBaseLine[0].x - state.prevBaseLine[0].x).toFixed(3), ',',
                (state.currentBaseLine[0].z - state.prevBaseLine[0].z).toFixed(3), ')');
        } else if (state.kind === 'door') {
            cmdMgr.execute( // TODO(TASK-06)
                new SetDoorOffsetCommand(state.elementId, state.currentOffset, state.prevOffset),
                { source: 'HUMAN_DIRECT' },
            );
            console.log('[PlanDrag] Door offset committed', state.prevOffset.toFixed(3), '→', state.currentOffset.toFixed(3));
        } else {
            cmdMgr.execute( // TODO(TASK-06)
                new SetWindowOffsetCommand(state.elementId, state.currentOffset, state.prevOffset),
                { source: 'HUMAN_DIRECT' },
            );
            console.log('[PlanDrag] Window offset committed', state.prevOffset.toFixed(3), '→', state.currentOffset.toFixed(3));
        }
    }

    /** Escape / cancel — restore original position. */
    cancel(): void {
        const state = this._state;
        if (!state) return;
        this._state = null;
        this._removeOverlay();
        this._planCanvas = null;
        this._domCanvas  = null;

        if (!state.activated) return;

        const ws = this._ws();
        if (!ws) return;
        if (state.kind === 'wall') {
            ws.update(state.elementId, { baseLine: state.prevBaseLine });
        } else if (state.kind === 'door') {
            ws.updateDoor(state.elementId, { offset: state.prevOffset });
        } else {
            ws.updateWindow(state.elementId, { offset: state.prevOffset });
        }
        console.log('[PlanDrag] Cancelled — position restored');
    }

    // ──────────────────────────────────────────────────────────────────────
    // Overlay canvas
    // ──────────────────────────────────────────────────────────────────────

    private _ensureOverlay(domCanvas: HTMLCanvasElement): void {
        this._removeOverlay();

        const ov = document.createElement('canvas');
        ov.style.cssText = [
            'position:absolute',
            'inset:0',
            'pointer-events:none',
            'z-index:10',
        ].join(';');
        ov.width  = domCanvas.width;
        ov.height = domCanvas.height;

        const container = domCanvas.parentElement;
        if (container) {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            container.appendChild(ov);
        } else {
            // Fallback: position over domCanvas via fixed coords
            ov.style.position = 'fixed';
            const r = domCanvas.getBoundingClientRect();
            ov.style.left   = `${r.left}px`;
            ov.style.top    = `${r.top}px`;
            ov.style.width  = `${r.width}px`;
            ov.style.height = `${r.height}px`;
            document.body.appendChild(ov);
        }

        this._overlay = ov;
    }

    private _removeOverlay(): void {
        this._overlay?.remove();
        this._overlay = null;
        this._rafPending = false;
    }

    /**
     * S85.D-finish.3: coalesce overlay re-renders to one per frame via the
     * canonical `getFrameScheduler().scheduleOnce()` API (architectural
     * replacement for `rAF(cb)`).  The `_rafPending`
     * flag is preserved as the coalescing latch — same semantics: while a
     * render is queued, additional `_scheduleOverlayRender()` calls are
     * dropped.  Drag flushes use `'overlay'` priority so they paint
     * after the main render pass.
     */
    private _scheduleOverlayRender(): void {
        if (this._rafPending || !this._overlay) return;
        this._rafPending = true;
        getFrameScheduler().scheduleOnce('plan-element-drag-overlay', () => {
            this._rafPending = false;
            this._renderOverlay();
        }, 'overlay');
    }

    private _renderOverlay(): void {
        const ov = this._overlay;
        const state = this._state;
        const planCanvas = this._planCanvas;
        if (!ov || !state || !state.activated || !planCanvas) return;

        // Sync size with parent canvas
        const domCanvas = this._domCanvas;
        if (domCanvas && (ov.width !== domCanvas.width || ov.height !== domCanvas.height)) {
            ov.width  = domCanvas.width;
            ov.height = domCanvas.height;
        }

        const ctx = ov.getContext('2d');
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio, 4);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = ov.width  / dpr;
        const cssH = ov.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        if (state.kind === 'wall') {
            this._renderWallOverlay(ctx, state, planCanvas);
        } else {
            this._renderDoorWindowOverlay(ctx, state, planCanvas);
        }
    }

    private _renderWallOverlay(
        ctx:       CanvasRenderingContext2D,
        state:     Extract<DragState, { kind: 'wall' }>,
        planCanvas:PlanViewCanvas,
    ): void {
        const { currentBaseLine: cur, prevBaseLine: prev } = state;

        const aSc = planCanvas.worldToScreen(cur[0].x, cur[0].z);
        const bSc = planCanvas.worldToScreen(cur[1].x, cur[1].z);
        const oldA = planCanvas.worldToScreen(prev[0].x, prev[0].z);
        const oldB = planCanvas.worldToScreen(prev[1].x, prev[1].z);

        // Ghost wall — solid blue stroke
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(aSc.sx, aSc.sy);
        ctx.lineTo(bSc.sx, bSc.sy);
        ctx.strokeStyle = 'rgba(30, 144, 255, 0.85)';
        ctx.lineWidth   = 3;
        ctx.setLineDash([10, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Ghost endpoints (filled circles)
        for (const pt of [aSc, bSc]) {
            ctx.beginPath();
            ctx.arc(pt.sx, pt.sy, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#1E90FF';
            ctx.fill();
        }

        // Movement delta dimension
        const deltaX = cur[0].x - prev[0].x;
        const deltaZ = cur[0].z - prev[0].z;
        const dist   = Math.hypot(deltaX, deltaZ);
        if (dist > 0.005) {
            const midOldSx = (oldA.sx + oldB.sx) / 2;
            const midOldSy = (oldA.sy + oldB.sy) / 2;
            const midNewSx = (aSc.sx + bSc.sx) / 2;
            const midNewSy = (aSc.sy + bSc.sy) / 2;
            this._drawDimensionLine(ctx, midOldSx, midOldSy, midNewSx, midNewSy, formatM(dist));
        }

        // Wall length label
        const wallDist = Math.hypot(cur[1].x - cur[0].x, cur[1].z - cur[0].z);
        if (wallDist > 0.1) {
            const midSx = (aSc.sx + bSc.sx) / 2;
            const midSy = (aSc.sy + bSc.sy) / 2;
            this._drawLabel(ctx, midSx, midSy - 14, formatM(wallDist), '#0A5DCC');
        }
    }

    private _renderDoorWindowOverlay(
        ctx:       CanvasRenderingContext2D,
        state:     Extract<DragState, { kind: 'door' | 'window' }>,
        planCanvas:PlanViewCanvas,
    ): void {
        const aSc = planCanvas.worldToScreen(state.wallA.x, state.wallA.z);
        const bSc = planCanvas.worldToScreen(state.wallB.x, state.wallB.z);

        // Constraint rail — amber dashed line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(aSc.sx, aSc.sy);
        ctx.lineTo(bSc.sx, bSc.sy);
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.65)';
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Wall endpoints
        for (const pt of [aSc, bSc]) {
            ctx.beginPath();
            ctx.arc(pt.sx, pt.sy, 4, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,165,0,0.8)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Door/window ghost position
        const ratio  = state.currentOffset / state.wallLength;
        const doorSx = aSc.sx + (bSc.sx - aSc.sx) * ratio;
        const doorSy = aSc.sy + (bSc.sy - aSc.sy) * ratio;

        const wallPxLen   = Math.hypot(bSc.sx - aSc.sx, bSc.sy - aSc.sy);
        const doorWidthPx = (state.wallLength > 0)
            ? Math.max(6, (state.prevOffset > 0
                ? ((this._ws()?.getDoor(state.elementId) ?? this._ws()?.getWindow(state.elementId))?.width ?? 0.9) / state.wallLength * wallPxLen
                : 20))
            : 20;

        ctx.beginPath();
        ctx.arc(doorSx, doorSy, doorWidthPx / 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(30, 144, 255, 0.9)';
        ctx.lineWidth   = 2.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(30, 144, 255, 0.12)';
        ctx.fill();

        // Dimensions: distance from wall start and wall end
        const ws   = this._ws();
        const el   = ws?.getDoor(state.elementId) ?? ws?.getWindow(state.elementId);
        const halfW = (el?.width ?? 0) / 2;

        const tLeft  = Math.max(0, (state.currentOffset - halfW) / state.wallLength);
        const tRight = Math.min(1, (state.currentOffset + halfW) / state.wallLength);

        const leftSx  = aSc.sx + (bSc.sx - aSc.sx) * tLeft;
        const leftSy  = aSc.sy + (bSc.sy - aSc.sy) * tLeft;
        const rightSx = aSc.sx + (bSc.sx - aSc.sx) * tRight;
        const rightSy = aSc.sy + (bSc.sy - aSc.sy) * tRight;

        const distStart = state.currentOffset - halfW;
        const distEnd   = state.wallLength - state.currentOffset - halfW;

        if (distStart > 0.02) this._drawDimensionLine(ctx, aSc.sx, aSc.sy, leftSx,  leftSy,  formatM(distStart));
        if (distEnd   > 0.02) this._drawDimensionLine(ctx, rightSx, rightSy, bSc.sx, bSc.sy,  formatM(distEnd));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Drawing primitives
    // ──────────────────────────────────────────────────────────────────────

    private _drawDimensionLine(
        ctx:  CanvasRenderingContext2D,
        x1:   number, y1: number,
        x2:   number, y2: number,
        label:string,
    ): void {
        ctx.save();

        // Line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#1E90FF';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tick marks
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const perp  = angle + Math.PI / 2;
        for (const [tx, ty] of [[x1, y1], [x2, y2]]) {
            ctx.beginPath();
            ctx.moveTo(tx + Math.cos(perp) * 5, ty + Math.sin(perp) * 5);
            ctx.lineTo(tx - Math.cos(perp) * 5, ty - Math.sin(perp) * 5);
            ctx.strokeStyle = '#1E90FF';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Label
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        this._drawLabel(ctx, midX, midY, label, '#1E90FF');

        ctx.restore();
    }

    private _drawLabel(
        ctx:   CanvasRenderingContext2D,
        sx:    number, sy: number,
        text:  string,
        color: string,
    ): void {
        ctx.save();
        ctx.font         = 'bold 11px system-ui,sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(text);
        const padX = 4, padY = 3;
        const bW = metrics.width + padX * 2;
        const bH = 14 + padY * 2;

        // Background
        ctx.fillStyle    = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        const bx = sx - bW / 2, by = sy - bH / 2;
        if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(bx, by, bW, bH, 3);
        } else {
            ctx.rect(bx, by, bW, bH);
        }
        ctx.fill();

        // Border
        ctx.strokeStyle  = color;
        ctx.lineWidth    = 1;
        ctx.stroke();

        // Text
        ctx.fillStyle    = color;
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    // ──────────────────────────────────────────────────────────────────────
    // WallStore accessor
    // ──────────────────────────────────────────────────────────────────────

    private _ws(): any {
        return window.wallStore // TODO(TASK-08)
            ?? window.bimManager?.wallStore
            ?? null;
    }
}

/** Singleton — one active drag at a time across all plan views. */
export const planElementDragController = new PlanElementDragController();
