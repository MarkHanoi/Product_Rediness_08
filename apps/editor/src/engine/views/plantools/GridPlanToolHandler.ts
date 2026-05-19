/**
 * GridPlanToolHandler — Sprint 3 Section D (Contract 19)
 *
 * Interactive Revit-like grid line creation in plan view.
 *
 * Interaction model:
 *   • Press/click 1 — define the bubble/start endpoint.
 *   • Drag/move — preview an orthogonal datum snapped horizontal or vertical.
 *   • Release or click 2 — confirm endpoint, fires AddGridCommand.
 *   • Escape — cancel.
 *
 * Axis / position convention (from GridBubbleTool._computeEndpoints):
 *   axis 'X' → line at x=position, running along Z  (vertical line in plan)
 *   axis 'Y' → line at z=position, running along X  (horizontal line in plan)
 *
 * The axis is derived from the angle between start and endpoint:
 *   |dx| ≥ |dz| → horizontal stroke → axis='Y', line at start.z
 *   |dz| >  |dx| → vertical stroke  → axis='X', line at start.x
 *
 * A single-click (click 1 == click 2 within 2 world units) immediately places
 * a grid line at the clicked point, inferring the axis from the existing grid
 * count (alternates X/Y) for a fast placement workflow.
 */

import { makeAnnotationElement } from '@pryzm/plugin-annotations';
import { makePointRef } from '@pryzm/plugin-annotations';
import { gridModePicker } from '@app/ui/GridModePicker';
import { gridDrawingHUD } from '@app/ui/GridDrawingHUD';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE   = '#7c3aed';   // violet-700
const DASHED   = 'rgba(124,58,237,0.6)';
const BUBBLE_R = 10;          // px — grid bubble radius
// §40 §6 — Adjacency preview styling.
const ADJ_DIM_COLOR = '#0f766e'; // teal-700 — distance dimension line / text
const ADJ_DIM_BG    = 'rgba(255,255,255,0.92)';
const ADJ_TICK_PX   = 5;         // half-length of the end ticks
// §40 §6.7 — Active anchor (numeric input target) styling.
const ADJ_ACTIVE_COLOR = '#b45309'; // amber-700 — the anchor a typed distance pins to
const ADJ_ACTIVE_BG    = 'rgba(254,243,199,0.95)'; // amber-100

/** §40 §6.7 — One adjacency edge: an existing grid + which side of the cursor. */
interface AdjacencyAnchor {
    axis:     'X' | 'Y';
    side:     'left' | 'right' | 'above' | 'below';
    /** World coordinate of the adjacent grid (worldX for axis 'X', worldZ for 'Y'). */
    position: number;
    /** +1 if the cursor is on the positive side of the anchor, -1 otherwise. */
    sign:     1 | -1;
}

/** Stable identity for an anchor across mouse moves — based on (axis, side). */
function anchorKey(a: AdjacencyAnchor): string {
    return `${a.axis}:${a.side}`;
}

export class GridPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null  = null;
    private _startPt: WorldPoint | null       = null;
    private _cursorPt: WorldPoint | null      = null;
    // §40 §6.7 — Numeric distance input state. Active only pre-first-click.
    private _anchors: AdjacencyAnchor[]       = [];
    private _activeAnchorKey: string | null   = null; // identity-stable across mouse moves
    private _typedBuffer: string              = '';   // digits + at most one '.'

    activate(ctx: PlanToolDrawContext): void {
        this._ctx      = ctx;
        this._startPt  = null;
        this._cursorPt = null;
        this._resetNumericInput();
        // §40 §2.1 — every fresh activation resets to Orthogonal mode.
        gridModePicker.setMode('orthogonal');
        // §40 §2.3 — show the mode HUD.
        gridDrawingHUD.show({
            onSwitchOrthogonal: () => { gridModePicker.setMode('orthogonal'); this._drawPreview(); },
            onSwitchLinear:     () => { gridModePicker.setMode('linear');     this._drawPreview(); },
            onTogglePinNext:    (_pinNext) => {/* state read at commit time */},
        });
        console.log('[GridPlanToolHandler] activated');
    }

    deactivate(): void {
        this._clearOverlay();
        this._startPt  = null;
        this._cursorPt = null;
        this._resetNumericInput();
        this._ctx      = null;
        gridDrawingHUD.dismiss();
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        // §40 §6.7 — keep the anchor list current so Tab cycles over the
        // neighbours actually visible on the screen at this cursor position.
        if (!this._startPt) this._refreshAnchors();
        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        if (!this._startPt) {
            // §40 §6.7 — If the user has typed a distance and an anchor is
            // active, commit the grid at the typed offset from the anchor and
            // skip the two-click flow entirely.
            if (this._typedBuffer.length > 0) {
                if (this._commitNumericGrid()) return;
            }

            // First click — anchor the start point and wait for second click
            this._startPt  = pt;
            this._cursorPt = pt;
            this._resetNumericInput();
            console.log('[GridPlanToolHandler] first point set', pt);
            this._drawPreview();
            return;
        }

        // Second click — commit
        this._commitGrid(pt);
    }

    // onMouseUp intentionally does NOT commit the grid.
    // Grid creation is purely click-based (click-1 → anchor, click-2 → place),
    // matching Revit's interaction model.  A drag-based commit would fire on
    // the mouseup of the very first click due to sub-pixel mouse jitter,
    // which would prevent the two-click preview workflow from ever working.
    onMouseUp(_pt: WorldPoint): void {}

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            // Two-stage Escape: first clears the typed buffer, second cancels
            // the tool — matches AutoCAD/Revit numeric-input convention.
            if (!this._startPt && this._typedBuffer.length > 0) {
                this._resetNumericInput();
                this._drawPreview();
                return true;
            }
            this.cancel();
            return true;
        }

        // §40 §6.7 — Numeric distance input is only meaningful pre-first-click
        // (the second-point flow already has free-form geometric placement).
        if (this._startPt) return false;

        // Tab cycles through the available adjacency anchors.
        if (e.key === 'Tab') {
            this._refreshAnchors();
            if (this._anchors.length === 0) return false;
            e.preventDefault();
            this._cycleAnchor(e.shiftKey ? -1 : +1);
            this._drawPreview();
            return true;
        }

        // Digits & decimal point append to the buffer.
        if (/^[0-9]$/.test(e.key)) {
            this._refreshAnchors();
            if (this._anchors.length === 0) return false;
            e.preventDefault();
            this._typedBuffer += e.key;
            this._drawPreview();
            return true;
        }
        if ((e.key === '.' || e.key === ',') && !this._typedBuffer.includes('.')) {
            this._refreshAnchors();
            if (this._anchors.length === 0) return false;
            e.preventDefault();
            this._typedBuffer += '.';
            this._drawPreview();
            return true;
        }

        // Backspace edits the buffer.
        if (e.key === 'Backspace' && this._typedBuffer.length > 0) {
            e.preventDefault();
            this._typedBuffer = this._typedBuffer.slice(0, -1);
            this._drawPreview();
            return true;
        }

        // Enter commits the typed distance.
        if ((e.key === 'Enter' || e.key === 'Return') && this._typedBuffer.length > 0) {
            e.preventDefault();
            this._commitNumericGrid();
            return true;
        }

        return false;
    }

    cancel(): void {
        this._startPt  = null;
        this._cursorPt = null;
        this._resetNumericInput();
        this._clearOverlay();
    }

    redraw(): void {
        this._drawPreview();
    }

    // ── Commit ────────────────────────────────────────────────────────────────

    private _commitGrid(endPt: WorldPoint): void {
        const sp = this._startPt!;

        const mode    = gridModePicker.getMode();
        const pinNext = gridDrawingHUD.isPinNextEnabled();

        if (mode === 'linear') {
            // §40 §2.2 — Linear-mode commit. Endpoints come straight from
            // the two clicks; no axis inference, no orthogonal snapping.
            const dx = endPt.worldX - sp.worldX;
            const dz = endPt.worldZ - sp.worldZ;
            if (dx*dx + dz*dz < 1e-4) {
                console.warn('[GridPlanToolHandler] linear-mode endpoints coincide — ignored.');
                this._startPt = null; this._cursorPt = null; this._clearOverlay();
                return;
            }
            // Linear grids still get an axis tag (closer of X/Y) for downstream
            // categorization / numbering, but rendering uses startX..endZ only.
            const orientation: 'X' | 'Y' = Math.abs(dx) >= Math.abs(dz) ? 'Y' : 'X';
            const name = this._nextGridName(orientation);
            const position = orientation === 'X' ? sp.worldX : sp.worldZ;
            const extentMin = Math.min(orientation === 'X' ? sp.worldZ : sp.worldX,
                                       orientation === 'X' ? endPt.worldZ : endPt.worldX);
            const extentMax = Math.max(orientation === 'X' ? sp.worldZ : sp.worldX,
                                       orientation === 'X' ? endPt.worldZ : endPt.worldX);

            // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary; pre-generate gridId
            const gridId = crypto.randomUUID();
            window.runtime?.bus?.executeCommand('grid.add', {
                gridId, orientation, position, name, extentMin, extentMax,
                mode: 'linear',
                startX: sp.worldX,    startZ: sp.worldZ,
                endX:   endPt.worldX, endZ:   endPt.worldZ,
                isPinned: pinNext,
            })?.catch((e: Error) => console.error('[GridPlanToolHandler] grid.add (linear) failed:', e));
            console.log('[GridPlanToolHandler] Linear grid added — name:', name,
                `(${sp.worldX.toFixed(2)},${sp.worldZ.toFixed(2)}) → (${endPt.worldX.toFixed(2)},${endPt.worldZ.toFixed(2)})`,
                'pinned:', pinNext);
            this._createPlanBubble(name, orientation, position,
                { worldX: endPt.worldX, worldZ: endPt.worldZ }, gridId);
        } else {
            const { orientation, position, extentMin, extentMax, bubblePoint } = this._inferGrid(sp, endPt);
            const name = this._nextGridName(orientation);

            // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary; pre-generate gridId
            const gridId = crypto.randomUUID();
            window.runtime?.bus?.executeCommand('grid.add', {
                gridId, orientation, position, name, extentMin, extentMax,
                mode: 'orthogonal',
                isPinned: pinNext,
            })?.catch((e: Error) => console.error('[GridPlanToolHandler] grid.add (orthogonal) failed:', e));
            console.log('[GridPlanToolHandler] Grid added — axis:', orientation, 'position:', position, 'name:', name, 'pinned:', pinNext);
            this._createPlanBubble(name, orientation, position, bubblePoint, gridId);
        }

        // Reset for next grid line
        this._startPt  = null;
        this._cursorPt = null;
        this._clearOverlay();
    }

    /**
     * Determines the grid orientation and position from the two clicked points.
     * Also handles the degenerate single-click case (start ≈ end).
     */
    private _inferGrid(
        sp: WorldPoint,
        ep: WorldPoint,
    ): { orientation: 'X' | 'Y'; position: number; extentMin: number; extentMax: number; bubblePoint: WorldPoint } {
        const dx = Math.abs(ep.worldX - sp.worldX);
        const dz = Math.abs(ep.worldZ - sp.worldZ);

        if (dx < 0.05 && dz < 0.05) {
            // Near-single-click — auto-assign based on existing grid balance
            const orientation = this._autoAxis();
            const position    = orientation === 'X' ? sp.worldX : sp.worldZ;
            return {
                orientation,
                position,
                extentMin: -100,
                extentMax: 100,
                bubblePoint: orientation === 'X'
                    ? { worldX: sp.worldX, worldZ: 100 }
                    : { worldX: 100, worldZ: sp.worldZ },
            };
        }

        if (dx >= dz) {
            // Horizontal stroke → Y-axis grid (horizontal line at the start point's z)
            return {
                orientation: 'Y',
                position: sp.worldZ,
                extentMin: Math.min(sp.worldX, ep.worldX),
                extentMax: Math.max(sp.worldX, ep.worldX),
                bubblePoint: ep.worldX >= sp.worldX
                    ? { worldX: ep.worldX, worldZ: sp.worldZ }
                    : { worldX: sp.worldX, worldZ: sp.worldZ },
            };
        } else {
            // Vertical stroke → X-axis grid (vertical line at the start point's x)
            return {
                orientation: 'X',
                position: sp.worldX,
                extentMin: Math.min(sp.worldZ, ep.worldZ),
                extentMax: Math.max(sp.worldZ, ep.worldZ),
                bubblePoint: ep.worldZ >= sp.worldZ
                    ? { worldX: sp.worldX, worldZ: ep.worldZ }
                    : { worldX: sp.worldX, worldZ: sp.worldZ },
            };
        }
    }

    private _createPlanBubble(
        name: string,
        orientation: 'X' | 'Y',
        position: number,
        bubblePoint: WorldPoint,
        gridId?: string,
    ): void {
        const c = this._ctx;
        if (!c) return;

        const cachedPosition = { x: bubblePoint.worldX, y: c.viewPlane.origin.y, z: bubblePoint.worldZ };
        const ref = makePointRef(cachedPosition as any);
        const ann = makeAnnotationElement(
            crypto.randomUUID(),
            'grid-bubble',
            c.viewDef.id,
            [{ ...ref, cachedPosition }],
            { modelPoints: [cachedPosition], offset: 0 },
            {
                gridId,
                gridName: name,
                axis: orientation,
                position,
                endIndex: 1,
                cachedLabel: name,
            },
            {
                lineColor: '#4b5563',
                textColor: '#374151',
                lineWeight: 0.25,
            },
        );
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('annotation.create', ann)
            ?.catch((e: Error) => console.warn('[GridPlanToolHandler] grid bubble annotation failed:', e));
    }

    /**
     * Falls back to the axis that has fewer existing grid lines.
     */
    private _autoAxis(): 'X' | 'Y' {
        const gridStore = window.gridStore ?? window.commandManager?.context?.stores?.gridStore; // TODO(TASK-05)
        if (!gridStore) return 'X';
        const all: any[] = gridStore.getAll?.() ?? [];
        const xCount = all.filter(g => g.axis === 'X').length;
        const yCount = all.filter(g => g.axis === 'Y').length;
        return xCount <= yCount ? 'X' : 'Y';
    }

    /**
     * Auto-generates the next grid name (1, 2, 3… for X; A, B, C… for Y).
     */
    private _nextGridName(orientation: 'X' | 'Y'): string {
        const gridStore = window.gridStore ?? window.commandManager?.context?.stores?.gridStore; // TODO(TASK-05)
        const all: any[] = gridStore?.getAll?.() ?? [];
        const same = all.filter(g => g.axis === orientation);

        if (orientation === 'X') {
            // Numbered: 1, 2, 3…
            return String(same.length + 1);
        } else {
            // Alphabetic: A, B, C…
            const idx = same.length;
            const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            if (idx < alpha.length) return alpha[idx];
            return `${alpha[Math.floor(idx / alpha.length) - 1]}${alpha[idx % alpha.length]}`;
        }
    }

    // ── Preview rendering ─────────────────────────────────────────────────────

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        const cursor = this._cursorPt;

        if (!this._startPt) {
            // §40 §6.7 — When a numeric distance has been typed and an anchor
            // is active, the preview "snaps" to anchor.position ± typedDist
            // so the ghost lines and crosshair show the committed location.
            const effective = this._effectiveCursor() ?? cursor;
            if (effective) {
                const { sx, sy } = planCanvas.worldToScreen(effective.worldX, effective.worldZ);
                this._drawCrosshair(ctx, sx, sy);

                // Hint: show both possible axes as thin ghost lines
                ctx.globalAlpha = 0.25;
                ctx.strokeStyle = STROKE;
                ctx.lineWidth   = 1;
                ctx.setLineDash([6, 4]);
                // Horizontal ghost
                ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(cssW, sy); ctx.stroke();
                // Vertical ghost
                ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, cssH); ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;

                // §40 §6 — Adjacency distance preview from cursor to nearest
                // existing grids (both X- and Y-axis), so the user can place
                // the next grid with awareness of bay spacing before click 1.
                this._drawAdjacencyDistances(ctx, effective, planCanvas, /*both*/ null);
            }
            this._drawHint(ctx, cssW, cssH, this._buildPreFirstClickHint());
            ctx.restore();
            return;
        }

        const sp = this._startPt;
        const ep = cursor ?? sp;
        const mode = gridModePicker.getMode();

        let lineA: { sx: number; sy: number };
        let lineB: { sx: number; sy: number };
        let name: string;
        let hintCore: string;

        if (mode === 'linear') {
            // §40 §2.2 — Linear preview: free-angle segment between sp and cursor.
            const dx = ep.worldX - sp.worldX, dz = ep.worldZ - sp.worldZ;
            const orientation: 'X' | 'Y' = Math.abs(dx) >= Math.abs(dz) ? 'Y' : 'X';
            name = this._nextGridName(orientation);
            lineA = planCanvas.worldToScreen(sp.worldX, sp.worldZ);
            lineB = planCanvas.worldToScreen(ep.worldX, ep.worldZ);
            const len = Math.hypot(dx, dz);
            hintCore = `LINEAR grid · length ${len.toFixed(2)} m — click to place "${name}"`;
        } else {
            const { orientation, position, extentMin, extentMax } = this._inferGrid(sp, ep);
            name = this._nextGridName(orientation);
            const pts = this._computeLineScreenPoints(orientation, position, extentMin, extentMax, planCanvas);
            lineA = pts.lineA; lineB = pts.lineB;
            hintCore = `${orientation}-axis grid at ${position.toFixed(2)} m — click to place "${name}"`;
        }

        // Dashed grid line preview
        ctx.strokeStyle = DASHED;
        ctx.lineWidth   = 1.25;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(lineA.sx, lineA.sy);
        ctx.lineTo(lineB.sx, lineB.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bubble preview at the far endpoint
        this._drawBubble(ctx, lineB.sx, lineB.sy, name);

        // Anchor marker at start point — confirms first click was registered
        const { sx: spSx, sy: spSy } = planCanvas.worldToScreen(sp.worldX, sp.worldZ);
        ctx.fillStyle   = STROKE;
        ctx.strokeStyle = 'white';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(spSx, spSy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // §40 §6 — While dragging out the second point, show distances from
        // the inferred grid position to its nearest neighbours on the same axis.
        if (cursor) {
            const inferredAxis: 'X' | 'Y' | null = mode === 'linear'
                ? null
                : this._inferGrid(sp, ep).orientation;
            this._drawAdjacencyDistances(ctx, cursor, planCanvas, inferredAxis);
        }

        // Position coordinate label near cursor
        if (cursor) {
            const { sx: cx, sy: cy } = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);
            const posLabel = mode === 'linear'
                ? `(${cursor.worldX.toFixed(2)}, ${cursor.worldZ.toFixed(2)})`
                : (() => {
                    const inferred = this._inferGrid(sp, ep);
                    return `${inferred.orientation}=${inferred.position.toFixed(2)}m`;
                })();
            ctx.font      = 'bold 10px sans-serif';
            const tw = ctx.measureText(posLabel).width;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(cx + 10, cy - 9, tw + 8, 16);
            ctx.fillStyle    = '#4c1d95';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(posLabel, cx + 14, cy);
        }

        this._drawHint(ctx, cssW, cssH, `${hintCore} · Esc to cancel`);

        ctx.restore();
    }

    /**
     * Computes the screen endpoints of a full-extent grid line.
     * Extends slightly beyond canvas edges for visual continuity.
     */
    private _computeLineScreenPoints(
        orientation: 'X' | 'Y',
        position: number,
        extentMin: number,
        extentMax: number,
        planCanvas: any,
    ): { lineA: { sx: number; sy: number }; lineB: { sx: number; sy: number } } {
        if (orientation === 'X') {
            // Vertical line at worldX=position, using stored Z extents.
            const a = planCanvas.worldToScreen(position, extentMin);
            const b = planCanvas.worldToScreen(position, extentMax);
            return {
                lineA: a,
                lineB: b,
            };
        } else {
            // Horizontal line at worldZ=position, using stored X extents.
            const a = planCanvas.worldToScreen(extentMin, position);
            const b = planCanvas.worldToScreen(extentMax, position);
            return {
                lineA: a,
                lineB: b,
            };
        }
    }

    private _drawCrosshair(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy);
        ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy + 10);
        ctx.stroke();
    }

    private _drawBubble(ctx: CanvasRenderingContext2D, sx: number, sy: number, label: string): void {
        ctx.fillStyle   = 'white';
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, BUBBLE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle    = '#4c1d95';
        ctx.font         = `bold ${Math.min(9, Math.floor(BUBBLE_R * 1.3))}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy);
    }

    private _drawHint(ctx: CanvasRenderingContext2D, _w: number, h: number, text: string): void {
        ctx.font         = '11px sans-serif';
        ctx.fillStyle    = 'rgba(76,29,149,0.85)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, 12, h - 12);
    }

    /**
     * §40 §6 — Adjacency distance preview.
     *
     * Draws a thin teal dimension line from the cursor to the nearest existing
     * orthogonal grid on each side of the relevant axis (or both axes if no
     * axis has been inferred yet), labelled with the metric distance.
     *
     * Linear-mode grids are intentionally excluded — bay-spacing dimensions
     * are only meaningful between parallel orthogonal datums.
     *
     * @param axisFilter  When 'X' / 'Y' only that axis's neighbours are
     *                    drawn (used post-first-click once orientation is
     *                    known). When null, both axes are shown (used
     *                    pre-first-click).
     */
    private _drawAdjacencyDistances(
        ctx: CanvasRenderingContext2D,
        cursor: WorldPoint,
        planCanvas: any,
        axisFilter: 'X' | 'Y' | null,
    ): void {
        // Pre-first-click: render directly from the cached anchor list so the
        // active highlight follows what Tab cycles through.
        if (!this._startPt) {
            if (this._anchors.length === 0) return;
            const { sx: cx, sy: cy } = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);
            const activeKey = this._activeAnchorKey;
            for (const a of this._anchors) {
                const isActive = anchorKey(a) === activeKey;
                if (a.axis === 'X') {
                    this._drawHorizontalDimension(
                        ctx, planCanvas, cursor, a.position, cx, cy,
                        isActive,
                        isActive && this._typedBuffer.length > 0
                            ? `${this._typedBuffer || '0'} m`
                            : null,
                    );
                } else {
                    this._drawVerticalDimension(
                        ctx, planCanvas, cursor, a.position, cx, cy,
                        isActive,
                        isActive && this._typedBuffer.length > 0
                            ? `${this._typedBuffer || '0'} m`
                            : null,
                    );
                }
            }
            return;
        }

        // Post-first-click path: original behaviour, recomputed live.
        const orthogonal = this._collectOrthogonalGrids();
        if (orthogonal.length === 0) return;
        const { sx: cx, sy: cy } = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);

        if (axisFilter !== 'Y') {
            const xs = orthogonal.filter(g => g.axis === 'X');
            const left  = this._nearestOnSide(xs, cursor.worldX, /*lessThan*/ true);
            const right = this._nearestOnSide(xs, cursor.worldX, /*lessThan*/ false);
            if (left)  this._drawHorizontalDimension(ctx, planCanvas, cursor, left.position,  cx, cy, false, null);
            if (right) this._drawHorizontalDimension(ctx, planCanvas, cursor, right.position, cx, cy, false, null);
        }

        if (axisFilter !== 'X') {
            const ys = orthogonal.filter(g => g.axis === 'Y');
            const above = this._nearestOnSide(ys, cursor.worldZ, /*lessThan*/ true);
            const below = this._nearestOnSide(ys, cursor.worldZ, /*lessThan*/ false);
            if (above) this._drawVerticalDimension(ctx, planCanvas, cursor, above.position, cx, cy, false, null);
            if (below) this._drawVerticalDimension(ctx, planCanvas, cursor, below.position, cx, cy, false, null);
        }
    }

    /** Reads orthogonal, visible grids from the store. */
    private _collectOrthogonalGrids(): any[] {
        const gridStore =
            window.gridStore ?? // TODO(TASK-08)
            window.commandManager?.context?.stores?.gridStore; // TODO(TASK-05)
        if (!gridStore?.getAll) return [];
        const all: any[] = gridStore.getAll() ?? [];
        return all.filter(
            g => g.isVisible !== false && (g.mode ?? 'orthogonal') === 'orthogonal',
        );
    }

    /** Picks the closest grid whose `position` is strictly less/greater than `value`. */
    private _nearestOnSide(
        grids: any[],
        value: number,
        lessThan: boolean,
    ): { position: number } | null {
        let best: any = null;
        let bestDelta = Infinity;
        for (const g of grids) {
            const delta = value - g.position; // >0 → grid is to the "left"/"above"
            if (lessThan ? delta <= 1e-6 : delta >= -1e-6) continue;
            const abs = Math.abs(delta);
            if (abs < bestDelta) { bestDelta = abs; best = g; }
        }
        return best;
    }

    /** Dimension line laid out horizontally between cursor and an X-axis grid. */
    private _drawHorizontalDimension(
        ctx: CanvasRenderingContext2D,
        planCanvas: any,
        cursor: WorldPoint,
        gridX: number,
        cx: number,
        cy: number,
        isActive: boolean,
        overrideLabel: string | null,
    ): void {
        const { sx: gsx } = planCanvas.worldToScreen(gridX, cursor.worldZ);
        const distance   = Math.abs(cursor.worldX - gridX);
        if (distance < 1e-4 && !overrideLabel) return;
        this._strokeDimensionLine(ctx, gsx, cy, cx, cy, /*horizontal*/ true, isActive);
        const midSx = (gsx + cx) / 2;
        const label = overrideLabel ?? `${distance.toFixed(2)} m`;
        this._fillDimensionLabel(ctx, midSx, cy - 6, label, /*anchorLeft*/ false, isActive);
    }

    /** Dimension line laid out vertically between cursor and a Y-axis grid. */
    private _drawVerticalDimension(
        ctx: CanvasRenderingContext2D,
        planCanvas: any,
        cursor: WorldPoint,
        gridZ: number,
        cx: number,
        cy: number,
        isActive: boolean,
        overrideLabel: string | null,
    ): void {
        const { sy: gsy } = planCanvas.worldToScreen(cursor.worldX, gridZ);
        const distance   = Math.abs(cursor.worldZ - gridZ);
        if (distance < 1e-4 && !overrideLabel) return;
        this._strokeDimensionLine(ctx, cx, gsy, cx, cy, /*horizontal*/ false, isActive);
        const midSy = (gsy + cy) / 2;
        const label = overrideLabel ?? `${distance.toFixed(2)} m`;
        this._fillDimensionLabel(ctx, cx + 6, midSy, label, /*anchorLeft*/ true, isActive);
    }

    private _strokeDimensionLine(
        ctx: CanvasRenderingContext2D,
        ax: number, ay: number,
        bx: number, by: number,
        horizontal: boolean,
        isActive: boolean,
    ): void {
        ctx.save();
        ctx.strokeStyle = isActive ? ADJ_ACTIVE_COLOR : ADJ_DIM_COLOR;
        ctx.lineWidth   = isActive ? 1.5 : 1;
        ctx.setLineDash(isActive ? [] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        // End ticks perpendicular to the line.
        ctx.beginPath();
        if (horizontal) {
            ctx.moveTo(ax, ay - ADJ_TICK_PX); ctx.lineTo(ax, ay + ADJ_TICK_PX);
            ctx.moveTo(bx, by - ADJ_TICK_PX); ctx.lineTo(bx, by + ADJ_TICK_PX);
        } else {
            ctx.moveTo(ax - ADJ_TICK_PX, ay); ctx.lineTo(ax + ADJ_TICK_PX, ay);
            ctx.moveTo(bx - ADJ_TICK_PX, by); ctx.lineTo(bx + ADJ_TICK_PX, by);
        }
        ctx.stroke();
        ctx.restore();
    }

    private _fillDimensionLabel(
        ctx: CanvasRenderingContext2D,
        sx: number, sy: number,
        text: string,
        anchorLeft = false,
        isActive = false,
    ): void {
        ctx.save();
        ctx.font         = isActive ? 'bold 11px sans-serif' : 'bold 10px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign    = anchorLeft ? 'left' : 'center';
        const tw = ctx.measureText(text).width;
        const padX = 4;
        const boxW = tw + padX * 2, boxH = isActive ? 16 : 14;
        const boxX = anchorLeft ? sx - padX : sx - boxW / 2;
        const boxY = sy - boxH / 2;
        ctx.fillStyle   = isActive ? ADJ_ACTIVE_BG    : ADJ_DIM_BG;
        ctx.strokeStyle = isActive ? ADJ_ACTIVE_COLOR : ADJ_DIM_COLOR;
        ctx.lineWidth   = isActive ? 1.25 : 0.75;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = isActive ? ADJ_ACTIVE_COLOR : ADJ_DIM_COLOR;
        ctx.fillText(text, anchorLeft ? sx + padX : sx, sy + 0.5);
        ctx.restore();
    }

    // ── §40 §6.7 — Numeric distance input ─────────────────────────────────────

    private _resetNumericInput(): void {
        this._anchors          = [];
        this._activeAnchorKey  = null;
        this._typedBuffer      = '';
    }

    /**
     * Recomputes the available adjacency anchors for the current cursor and
     * preserves the active selection by key when possible.
     */
    private _refreshAnchors(): void {
        const cursor = this._cursorPt;
        if (!cursor) { this._anchors = []; this._activeAnchorKey = null; return; }
        const orthogonal = this._collectOrthogonalGrids();
        const next: AdjacencyAnchor[] = [];

        const xs = orthogonal.filter(g => g.axis === 'X');
        const left  = this._nearestOnSide(xs, cursor.worldX, true);
        const right = this._nearestOnSide(xs, cursor.worldX, false);
        if (left)  next.push({ axis: 'X', side: 'left',  position: left.position,  sign: +1 });
        if (right) next.push({ axis: 'X', side: 'right', position: right.position, sign: -1 });

        const ys = orthogonal.filter(g => g.axis === 'Y');
        const above = this._nearestOnSide(ys, cursor.worldZ, true);
        const below = this._nearestOnSide(ys, cursor.worldZ, false);
        if (above) next.push({ axis: 'Y', side: 'above', position: above.position, sign: +1 });
        if (below) next.push({ axis: 'Y', side: 'below', position: below.position, sign: -1 });

        this._anchors = next;

        // Preserve the previous active anchor by (axis, side) identity.
        if (this._activeAnchorKey) {
            const stillThere = next.some(a => anchorKey(a) === this._activeAnchorKey);
            if (!stillThere) this._activeAnchorKey = null;
        }
        // Default selection: the nearest neighbour overall.
        if (!this._activeAnchorKey && next.length > 0) {
            let best = next[0];
            let bestDist = Math.abs(this._signedDelta(cursor, best));
            for (const a of next) {
                const d = Math.abs(this._signedDelta(cursor, a));
                if (d < bestDist) { bestDist = d; best = a; }
            }
            this._activeAnchorKey = anchorKey(best);
        }
    }

    private _signedDelta(cursor: WorldPoint, a: AdjacencyAnchor): number {
        return a.axis === 'X' ? cursor.worldX - a.position : cursor.worldZ - a.position;
    }

    private _cycleAnchor(direction: 1 | -1): void {
        if (this._anchors.length === 0) { this._activeAnchorKey = null; return; }
        const idx = Math.max(0, this._anchors.findIndex(a => anchorKey(a) === this._activeAnchorKey));
        const next = (idx + direction + this._anchors.length) % this._anchors.length;
        this._activeAnchorKey = anchorKey(this._anchors[next]);
    }

    private _activeAnchor(): AdjacencyAnchor | null {
        if (!this._activeAnchorKey) return null;
        return this._anchors.find(a => anchorKey(a) === this._activeAnchorKey) ?? null;
    }

    /**
     * Returns a virtual cursor whose position has been overridden by the
     * typed numeric distance from the active anchor. Returns null when no
     * override applies (no buffer or no anchor).
     */
    private _effectiveCursor(): WorldPoint | null {
        if (this._typedBuffer.length === 0) return null;
        const a = this._activeAnchor();
        if (!a) return null;
        const dist = parseFloat(this._typedBuffer);
        if (!Number.isFinite(dist)) return null;
        const cursor = this._cursorPt;
        if (!cursor) return null;
        if (a.axis === 'X') {
            return { worldX: a.position + a.sign * dist, worldZ: cursor.worldZ };
        }
        return { worldX: cursor.worldX, worldZ: a.position + a.sign * dist };
    }

    private _buildPreFirstClickHint(): string {
        if (this._anchors.length === 0) {
            return 'Click to set grid position · Esc to cancel';
        }
        const active = this._activeAnchor();
        const sideLabel = active ? `${active.axis}/${active.side}` : '—';
        if (this._typedBuffer.length > 0) {
            return `Distance ${this._typedBuffer || '0'} m from ${sideLabel} · Enter to place · Tab to switch · Backspace to edit · Esc to clear`;
        }
        return `Type distance to place from ${sideLabel} · Tab to switch anchor · Click to set grid position · Esc to cancel`;
    }

    /**
     * Commits a new orthogonal grid at the typed offset from the active anchor.
     * Returns true when a grid was placed, false when no commit happened.
     */
    private _commitNumericGrid(): boolean {
        const a = this._activeAnchor();
        if (!a) return false;
        const dist = parseFloat(this._typedBuffer);
        if (!Number.isFinite(dist) || dist <= 0) {
            console.warn('[GridPlanToolHandler] numeric input rejected — non-positive distance');
            return false;
        }

        // Inferred grid orientation matches the anchor axis (parallel datums).
        const orientation: 'X' | 'Y' = a.axis;
        const position = a.position + a.sign * dist;
        const name = this._nextGridName(orientation);
        const pinNext = gridDrawingHUD.isPinNextEnabled();

        // Default extents — same convention as the single-click path so the
        // bubble is visible without needing a manual second drag.
        const extentMin = -100;
        const extentMax = 100;

        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary; pre-generate gridId
        const gridId = crypto.randomUUID();
        window.runtime?.bus?.executeCommand('grid.add', {
            gridId,
            orientation,
            position,
            name,
            extentMin,
            extentMax,
            mode: 'orthogonal',
            isPinned: pinNext,
        })?.catch((e: Error) => console.error('[GridPlanToolHandler] grid.add (numeric) failed:', e));
        console.log(
            '[GridPlanToolHandler] Numeric grid added — axis:', orientation,
            'position:', position, '(', dist, 'm from', a.axis + '/' + a.side + ')',
            'name:', name, 'pinned:', pinNext,
        );
        const bubblePoint: WorldPoint = orientation === 'X'
            ? { worldX: position, worldZ: extentMax }
            : { worldX: extentMax, worldZ: position };
        this._createPlanBubble(name, orientation, position, bubblePoint, gridId);

        // Reset for the next grid line — keep the tool active.
        this._resetNumericInput();
        this._refreshAnchors();
        this._clearOverlay();
        this._drawPreview();
        return true;
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
