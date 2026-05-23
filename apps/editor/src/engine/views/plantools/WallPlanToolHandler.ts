/**
 * WallPlanToolHandler — Sprint 2 Phase 5 (Contract 19)
 *
 * Wall creation tool for plan view. Supports four drawing modes, read live from
 * window.wallModePicker.getActiveMode() on every mouse move:
 *
 *   linear   — Free-angle straight polyline (original behaviour, unchanged)
 *   ortho    — Snaps end point to nearest 90° cardinal axis from start
 *   curved   — 3-click arc: start → arc midpoint → end; commits a WallCurve (quadratic Bézier)
 *   byslab   — Not applicable in plan view; falls back to linear
 *
 * Any-angle mode (configurable degree snap) is applied when mode === 'ortho' with
 * a step from wallModePicker.getAngleStep() (falls back to 90°). This matches the
 * contract spec which uses 'ortho' as the primary constrained mode.
 *
 * State machine:
 *   State 0: _wallFirstPoint === null — idle
 *   State 1: _wallFirstPoint set, _arcMidPt === null — awaiting next point
 *            • linear/ortho: click → commit + chain (remains in state 1)
 *            • curved: click → save _arcMidPt → state 2
 *   State 2: _arcMidPt set — awaiting end point (curved only)
 *            • click → commit arc + chain → back to state 1
 */


import { WallDimensionInput } from '@pryzm/geometry-wall';
import { createId } from '@pryzm/schemas';
import { isStrongSnap, type PlanToolHandler, type PlanToolDrawContext, type WorldPoint } from './PlanToolHandler';
// §P2.1 (IMPL-PLAN-2026-05-17): CreateWallCommand + window.commandManager bridge (P4.4).
// Wall creation is now bus-only; no @pryzm/command-registry import needed here.

const WALL_DEFAULT_HEIGHT    = 2.7;
const WALL_DEFAULT_THICKNESS = 0.2;
const ARC_SEGMENTS           = 16;
const DEG                    = Math.PI / 180;

function _getMode(): string {
    return window.wallModePicker?.getActiveMode?.() ?? 'linear';
}

function _snapOrtho(start: WorldPoint, raw: WorldPoint): WorldPoint {
    const dx    = raw.worldX - start.worldX;
    const dz    = raw.worldZ - start.worldZ;
    const angle   = Math.atan2(dz, dx);
    const step    = Math.PI / 2;
    const snapped = Math.round(angle / step) * step;
    const dist    = Math.hypot(dx, dz);
    return {
        worldX: start.worldX + Math.cos(snapped) * dist,
        worldZ: start.worldZ + Math.sin(snapped) * dist,
    };
}

function _snapAngle(start: WorldPoint, raw: WorldPoint, stepDeg: number): WorldPoint {
    const dx    = raw.worldX - start.worldX;
    const dz    = raw.worldZ - start.worldZ;
    const angle   = Math.atan2(dz, dx);
    const step    = stepDeg * DEG;
    const snapped = Math.round(angle / step) * step;
    const dist    = Math.hypot(dx, dz);
    return {
        worldX: start.worldX + Math.cos(snapped) * dist,
        worldZ: start.worldZ + Math.sin(snapped) * dist,
    };
}

/**
 * Compute a Canvas2D quadratic Bézier control point from three world points.
 * The control point ensures the Bézier curve passes through `midThrough` at t=0.5.
 *   P(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2 = midThrough
 *   ⟹ P1 = 2·midThrough − 0.5·(P0 + P2)
 */
function _bezierControl(
    start: WorldPoint,
    midThrough: WorldPoint,
    end: WorldPoint,
): { x: number; z: number } {
    return {
        x: 2 * midThrough.worldX - 0.5 * (start.worldX + end.worldX),
        z: 2 * midThrough.worldZ - 0.5 * (start.worldZ + end.worldZ),
    };
}

export class WallPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;

    private _wallFirstPoint: WorldPoint | null     = null;
    private _polylineFirstPoint: WorldPoint | null = null;
    private _arcMidPt: WorldPoint | null           = null;   // Phase 5: curved mode mid-click
    private _wallSegmentCount = 0;

    // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per
    // PlanToolHandler.hasActiveStroke?(). The wall tool's chained-polyline mode
    // accumulates segments via _wallFirstPoint + _polylineFirstPoint + arc-mode
    // _arcMidPt. While ANY of these is non-null the user has uncommitted state
    // and a temporary cursor excursion to the toolbar (e.g. picking a system
    // type) must NOT wipe the stroke.
    hasActiveStroke(): boolean {
        return this._wallFirstPoint !== null
            || this._polylineFirstPoint !== null
            || this._arcMidPt !== null;
    }
    private _wallCursorPoint: WorldPoint | null    = null;
    private _wallStatusOverlay: HTMLElement | null = null;
    private _dimInput: WallDimensionInput | null   = null;   // §04-12: typed dimension input

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._dimInput           = new WallDimensionInput(ctx.overlayCanvas);
        this._syncCreationHud();
    }

    deactivate(): void {
        this._removeWallStatusOverlay();
        this._clearOverlay();
        this._dimInput?.dispose();
        this._dimInput           = null;
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        const mode = _getMode();
        let resolved = pt;
        // §STRICT-ORTHO (Apr 2026):
        //   Ortho mode is now an unconditional constraint — when active, every
        //   point is projected onto the nearest 90° axis from the start point,
        //   even if the raw cursor landed on an explicit object snap (endpoint,
        //   midpoint, intersection, etc.).  Object snaps still contribute their
        //   precision (the snapped point is what gets projected), but the wall
        //   direction is GUARANTEED orthogonal.
        //
        //   The previous behaviour followed Revit/AutoCAD convention where
        //   object snaps override ortho.  Users found this confusing — clicking
        //   "Perpendicular" mode and ending up with a diagonal wall (because the
        //   cursor happened to be on a snap point) is unacceptable.
        //
        //   Angle-step mode (any non-linear/curved/byslab) keeps the original
        //   "snap wins" behaviour because it is a soft hint, not a strict lock.
        if (this._wallFirstPoint) {
            if (mode === 'ortho') {
                resolved = _snapOrtho(this._wallFirstPoint, pt);
            } else if (mode !== 'linear' && mode !== 'curved' && mode !== 'byslab' && !isStrongSnap(pt)) {
                const step = window.wallModePicker?.getAngleStep?.() ?? 15;
                resolved = _snapAngle(this._wallFirstPoint, pt, step);
            }
            // For curved in state 2 (arc mid set), snap to end from arc mid is not constrained
        }
        // §04-12: if the user has typed a length, lock the cursor to that distance
        // Typed dimension overrides geometric snap because it is even more explicit.
        if (this._dimInput?.isActive && this._wallFirstPoint && mode !== 'curved') {
            const locked = this._computeLockedEndPoint(this._wallFirstPoint, resolved);
            if (locked) resolved = locked;
        }
        this._wallCursorPoint = resolved;
        if (this._wallFirstPoint) this._drawWallPreview();
    }

    onClick(pt: WorldPoint): void {
        const mode = _getMode();
        let resolved = pt;
        // §STRICT-ORTHO (Apr 2026): mirrors the onMouseMove rule — ortho is an
        // unconditional 90° lock, even when the cursor lands on a strong snap.
        // Without this, the preview would look orthogonal but the committed
        // wall could end at a snap point that broke the ortho axis.
        if (this._wallFirstPoint) {
            if (mode === 'ortho') {
                resolved = _snapOrtho(this._wallFirstPoint, pt);
            } else if (mode !== 'linear' && mode !== 'curved' && mode !== 'byslab' && !isStrongSnap(pt)) {
                const step = window.wallModePicker?.getAngleStep?.() ?? 15;
                resolved = _snapAngle(this._wallFirstPoint, pt, step);
            }
        }

        if (!this._wallFirstPoint) {
            this._wallFirstPoint     = resolved;
            this._polylineFirstPoint = resolved;
            this._arcMidPt           = null;
            this._wallSegmentCount   = 0;
            this._syncCreationHud();
            console.log('[WallPlanToolHandler] Polyline start point set', resolved, 'mode:', mode);
            return;
        }

        if (mode === 'curved' && !this._arcMidPt) {
            // State 1 → State 2: store arc midpoint
            this._arcMidPt = pt; // no snap for midpoint — free placement
            this._wallCursorPoint = null;
            this._syncCreationHud();
            console.log('[WallPlanToolHandler] Arc midpoint set', pt);
            return;
        }

        this._commitWall(resolved);
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (this._wallFirstPoint) this._closePolyline();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        const mode = _getMode();

        // §04-12: typed dimension input — capture digits/period/backspace/Escape
        // Only active in drawing state (first point set) and not in curved mode
        if (this._wallFirstPoint && this._dimInput && mode !== 'curved') {
            const consumed = this._dimInput.handleKey(e.key);
            if (consumed) {
                e.preventDefault();
                // Update preview with the locked end point
                if (this._wallCursorPoint) {
                    const locked = this._computeLockedEndPoint(this._wallFirstPoint, this._wallCursorPoint);
                    if (locked) {
                        this._wallCursorPoint = locked;
                        this._drawWallPreview();
                    }
                }
                return true;
            }
        }

        if (e.key === 'Enter') {
            // §04-12: if a length is typed, commit at the locked end point
            if (this._dimInput?.isActive && this._wallFirstPoint && this._wallCursorPoint) {
                const locked = this._computeLockedEndPoint(this._wallFirstPoint, this._wallCursorPoint);
                if (locked) {
                    e.preventDefault();
                    this._dimInput.reset();
                    this._commitWall(locked);
                    return true;
                }
            }

            const canClose = this._wallSegmentCount >= 2
                && !!this._polylineFirstPoint
                && !!this._wallFirstPoint;
            if (canClose) {
                e.preventDefault();
                this._closePolyline();
                return true;
            } else if (this._wallFirstPoint && this._wallCursorPoint) {
                this._commitWall(this._wallCursorPoint);
                return true;
            }
        }
        if (e.key === 'Escape') {
            if (this._arcMidPt) {
                // Back from state 2 to state 1
                this._arcMidPt = null;
                this._clearOverlay();
                return true;
            }
        }
        return false;
    }

    cancel(): void {
        this._dimInput?.reset();
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._syncCreationHud();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._wallFirstPoint && this._wallCursorPoint) this._drawWallPreview();
    }

    private _commitWall(endPt: WorldPoint): void {
        const startPt = this._wallFirstPoint;
        if (!startPt || !this._ctx) return;

        const dx = endPt.worldX - startPt.worldX;
        const dz = endPt.worldZ - startPt.worldZ;
        if (Math.hypot(dx, dz) < 0.01) {
            console.warn('[WallPlanToolHandler] Wall too short — skipped');
            this._arcMidPt = null;
            return;
        }

        const levelId = this._ctx.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[WallPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const systemTypeId = window.wallTool?.getSystemTypeId?.() ?? undefined;
        const mode         = _getMode();

        let isCurved = false;
        let curvePayload: { control: { x: number; y: number; z: number }; segments: number } | undefined;
        if (mode === 'curved' && this._arcMidPt) {
            const ctrl = _bezierControl(startPt, this._arcMidPt, endPt);
            curvePayload = { control: { x: ctrl.x, y: 0, z: ctrl.z }, segments: ARC_SEGMENTS };
            isCurved = true;
        }

        // §P2.1 / C11 §2 — bus-only single-pipeline dispatch.
        //
        // CONTRACT (C11 §3.2 + C11 §7.0 FIX-WALL-ID):
        //   • `id` MUST be pre-generated here using createId('wall') from @pryzm/schemas.
        //     The CEB extracts id from record.payload → emits wallId on 'wall.created'.
        //     The initTools §P2.1 bridge guards on !ev.wallId — if id is omitted from
        //     the payload, wallId is undefined, the guard silently drops every event,
        //     the legacy WallStore is never updated → no 3D mesh, no plan view projection.
        //   • createId('wall') generates `wall_<ulid>` format which passes the
        //     CreateWallHandler.WALL_ID_RE regex.  crypto.randomUUID() must NOT be used.
        //   • baseLine points MUST be full Vec3 `{ x, y, z }`.  The `y` component
        //     carries the level elevation (0 in plan view = ground level).
        //
        // The handler (plugins/wall/src/handlers/CreateWall.ts) writes to the PRYZM3
        // Immer store; CommandEventBridge emits `wall.created`; the bridge in
        // initTools.ts §P2.1 mirrors into the legacy WallStore → WallRebuildCoordinator
        // → 3D mesh.  Plan view: WallStore.add() emits storeEventBus →
        // ViewTechnicalDrawingCache._onStoreChange → vd:projection-stale → Canvas2D.
        const wallId = createId('wall');
        window.runtime?.bus?.executeCommand('wall.create', {
            id:       wallId,
            baseLine:  [
                { x: startPt.worldX, y: 0, z: startPt.worldZ },
                { x: endPt.worldX,   y: 0, z: endPt.worldZ   },
            ],
            height:    WALL_DEFAULT_HEIGHT,
            thickness: WALL_DEFAULT_THICKNESS,
            levelId,
            ...(systemTypeId  ? { systemTypeId }  : {}),
            ...(curvePayload  ? { curve: curvePayload } : {}),
        })?.catch((e: unknown) => console.error('[WallPlanToolHandler] wall.create bus failed:', e));
        console.log('[WallPlanToolHandler] Wall dispatched — mode:', mode, isCurved ? '(curved)' : '(straight)');
        this._wallSegmentCount++;

        // Chain: endpoint becomes new start; clear arc state and dim input
        this._dimInput?.reset();
        this._wallFirstPoint  = endPt;
        this._arcMidPt        = null;
        this._wallCursorPoint = null;
        this._syncCreationHud();
        this._clearOverlay();
    }

    /**
     * §04-12: Returns a WorldPoint at the typed distance from start in the
     * direction of cursor, or null if dim input has no valid length or the
     * cursor is coincident with start.
     */
    private _computeLockedEndPoint(start: WorldPoint, cursor: WorldPoint): WorldPoint | null {
        const length = this._dimInput?.getLengthMeters();
        if (!length || length <= 0) return null;
        const dx   = cursor.worldX - start.worldX;
        const dz   = cursor.worldZ - start.worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return null;
        return {
            worldX: start.worldX + (dx / dist) * length,
            worldZ: start.worldZ + (dz / dist) * length,
        };
    }

    private _closePolyline(): void {
        const start = this._wallFirstPoint;
        const end   = this._polylineFirstPoint;
        if (!start || !end) return;

        if (Math.hypot(end.worldX - start.worldX, end.worldZ - start.worldZ) >= 0.1) {
            this._arcMidPt = null; // force straight closing segment
            this._commitWall(end);
        }

        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._syncCreationHud();
        this._clearOverlay();
        console.log('[WallPlanToolHandler] Polyline closed');
    }

    private _drawWallPreview(): void {
        const c = this._ctx;
        if (!c || !this._wallFirstPoint || !this._wallCursorPoint) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const s = planCanvas.worldToScreen(this._wallFirstPoint.worldX,  this._wallFirstPoint.worldZ);
        const e = planCanvas.worldToScreen(this._wallCursorPoint.worldX, this._wallCursorPoint.worldZ);

        ctx.save();

        const mode = _getMode();

        if (mode === 'curved' && this._arcMidPt) {
            // ── Curved mode state 2: draw arc from start through arcMidPt to cursor ──
            const sm = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            const ctrl = _bezierControl(this._wallFirstPoint, this._arcMidPt, this._wallCursorPoint);
            const sc   = planCanvas.worldToScreen(ctrl.x, ctrl.z);

            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.quadraticCurveTo(sc.sx, sc.sy, e.sx, e.sy);
            ctx.stroke();

            // Arc midpoint indicator
            ctx.fillStyle = '#6600ff';
            ctx.beginPath(); ctx.arc(sm.sx, sm.sy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.stroke();

            // Length hint — approximate chord
            const distM = Math.hypot(
                this._wallCursorPoint.worldX - this._wallFirstPoint.worldX,
                this._wallCursorPoint.worldZ - this._wallFirstPoint.worldZ,
            );
            const midX = (s.sx + e.sx) / 2, midY = (s.sy + e.sy) / 2;
            const label = `~${Math.round(distM * 1000)} mm (arc)`;
            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.90)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle = '#6600ff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);

        } else if (mode === 'curved' && !this._arcMidPt) {
            // ── Curved mode state 1: awaiting arc midpoint — draw dashed preview line ──
            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth   = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.lineTo(e.sx, e.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(30,58,138,0.85)';
            ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
            ctx.fillText('Click to set arc midpoint', 12, cssH - 12);

        } else {
            // ── Linear / Ortho / Any-angle: solid thickness band (unchanged) ──────────
            const segDx = e.sx - s.sx;
            const segDy = e.sy - s.sy;
            const screenLen = Math.hypot(segDx, segDy);
            if (screenLen >= 0.5) {
                const thicknessPx = Math.max(2, planCanvas.getPixelsPerUnit() * this._getSelectedWallThickness());
                const halfWidth = thicknessPx / 2;
                const perpX = -segDy / screenLen;
                const perpY =  segDx / screenLen;
                const corners = [
                    { x: s.sx + perpX * halfWidth, y: s.sy + perpY * halfWidth },
                    { x: s.sx - perpX * halfWidth, y: s.sy - perpY * halfWidth },
                    { x: e.sx - perpX * halfWidth, y: e.sy - perpY * halfWidth },
                    { x: e.sx + perpX * halfWidth, y: e.sy + perpY * halfWidth },
                ];
                ctx.fillStyle = 'rgba(102,0,255,0.35)';
                ctx.strokeStyle = '#6600ff';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                ctx.lineTo(corners[1].x, corners[1].y);
                ctx.lineTo(corners[2].x, corners[2].y);
                ctx.lineTo(corners[3].x, corners[3].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            const dx    = this._wallCursorPoint.worldX - this._wallFirstPoint.worldX;
            const dz    = this._wallCursorPoint.worldZ - this._wallFirstPoint.worldZ;
            const lenMm = Math.round(Math.hypot(dx, dz) * 1000);
            const label = `${lenMm} mm`;
            const midX  = (s.sx + e.sx) / 2;
            const midY  = (s.sy + e.sy) / 2;

            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.90)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle = '#1e40af';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);
        }

        const canClose = this._wallSegmentCount >= 2 && this._polylineFirstPoint;
        if (canClose && mode !== 'curved') {
            const origin = planCanvas.worldToScreen(
                this._polylineFirstPoint!.worldX, this._polylineFirstPoint!.worldZ
            );
            ctx.setLineDash([4, 5]);
            ctx.lineWidth   = 1;
            ctx.strokeStyle = 'rgba(22,163,74,0.55)';
            ctx.beginPath();
            ctx.moveTo(e.sx, e.sy);
            ctx.lineTo(origin.sx, origin.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#16a34a';
            ctx.beginPath();
            ctx.arc(origin.sx, origin.sy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = 'rgba(22,163,74,0.95)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText('↵ Enter or click button to close polyline', 12, cssH - 12);
        }

        ctx.restore();
    }

    private _getSelectedWallThickness(): number {
        const systemTypeId = window.wallTool?.getSystemTypeId?.();
        if (!systemTypeId) return WALL_DEFAULT_THICKNESS;
        const total = window.wallSystemTypeStore?.getTotalThickness?.(systemTypeId); // TODO(TASK-08)
        return typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : WALL_DEFAULT_THICKNESS;
    }

    private _ensureWallStatusOverlay(): HTMLElement {
        if (!this._wallStatusOverlay) {
            const overlay = document.createElement('div');
            overlay.className = 'th-overlay';

            const text = document.createElement('span');
            text.id = 'pvt-wall-tool-status-text';
            text.className = 'th-text';
            overlay.appendChild(text);

            const sep = document.createElement('span');
            sep.id = 'pvt-wall-tool-sep';
            sep.className = 'th-sep';
            sep.style.display = 'none';
            overlay.appendChild(sep);

            const closeBtn = document.createElement('button');
            closeBtn.id = 'pvt-close-polyline-btn';
            closeBtn.className = 'th-close-btn';
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = `<span class="th-key">↵</span><span>Close Polyline</span>`;
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closePolyline();
            });
            overlay.appendChild(closeBtn);

            document.body.appendChild(overlay);
            this._wallStatusOverlay = overlay;
        }
        return this._wallStatusOverlay;
    }

    private _removeWallStatusOverlay(): void {
        this._wallStatusOverlay?.remove();
        this._wallStatusOverlay = null;
    }

    private _syncCreationHud(): void {
        if (!this._ctx) {
            this._removeWallStatusOverlay();
            return;
        }
        const mode    = _getMode();
        const overlay = this._ensureWallStatusOverlay();
        const textEl  = overlay.querySelector('#pvt-wall-tool-status-text');
        const closeBtn = overlay.querySelector('#pvt-close-polyline-btn') as HTMLButtonElement | null;
        const sep = overlay.querySelector('#pvt-wall-tool-sep') as HTMLElement | null;
        const canClose = this._wallSegmentCount >= 2 && !!this._polylineFirstPoint && !!this._wallFirstPoint;

        if (textEl) {
            if (!this._wallFirstPoint) {
                textEl.textContent = 'Click to set start point';
            } else if (mode === 'curved' && !this._arcMidPt) {
                textEl.textContent = 'Click arc midpoint · Esc to cancel arc';
            } else if (mode === 'curved' && this._arcMidPt) {
                textEl.textContent = 'Click end point to commit arc wall';
            } else {
                textEl.textContent = 'Click to set next point · or type length + ↵';
            }
        }
        if (closeBtn) closeBtn.style.display = canClose ? '' : 'none';
        if (sep) sep.style.display = canClose ? '' : 'none';
        overlay.style.display = 'flex';
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
