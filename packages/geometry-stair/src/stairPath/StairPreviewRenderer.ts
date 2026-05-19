/**
 * StairPreviewRenderer — real-time 2D canvas renderer for stair path preview.
 *
 * Renders on an overlay <canvas> that sits above the plan view:
 *   • Stair boundary (width-offset lines along each run, with solid end caps)
 *   • Step ticks (perpendicular lines at each tread)
 *   • Landing rectangles at corners with dimension labels
 *   • Diagonal break line on first step (architectural convention)
 *   • Walking-line path (dashed centre line)
 *   • Direction arrows ("▲ UP") on the first step tick
 *   • Ghost polyline while drawing
 *   • Step-count label near the cursor
 *   • Per-run "Run N · x steps" centre labels
 *
 * Coordinate contract:
 *   - All world points are in XZ (plan view, Y=up).
 *   - `toScreen(worldX, worldZ)` converts to CSS-pixel canvas coords.
 *   - The caller supplies `toScreen` on every frame from PlanViewCanvas.worldToScreen().
 *
 * No Three.js, no DOM mutations beyond drawing on the canvas.
 */

import type { Point2D } from './PolylineModel';
import type { SolverResult2D, SegmentSolution, LandingSolution } from './StairSolver2D';

export type ScreenPoint = { sx: number; sy: number };
export type ToScreen = (x: number, z: number) => ScreenPoint;

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
    // Run colours — alternate between two blues for multi-run stairs
    runFill:      ['rgba(59,130,246,0.08)', 'rgba(37,99,235,0.10)', 'rgba(29,78,216,0.12)'] as string[],
    runBoundary:  ['#1e40af', '#1e3a8a', '#1e3a8a'] as string[],
    runTick:      ['#2563eb', '#1d4ed8', '#1d4ed8'] as string[],

    // Valid stair
    boundary:     '#1e40af',
    boundaryFill: 'rgba(59,130,246,0.07)',
    tick:         '#1e40af',
    walkLine:     '#3b82f6',

    // Landing
    landing:      'rgba(96,165,250,0.16)',
    landingStroke:'#1d4ed8',
    landingLabel: '#3b82f6',

    // Arrow / labels
    arrow:        '#1e3a8a',
    label:        '#1e40af',
    labelBg:      'rgba(239,246,255,0.94)',
    runLabel:     '#2563eb',
    runLabelBg:   'rgba(239,246,255,0.88)',

    // Invalid
    boundaryErr:     '#b91c1c',
    boundaryFillErr: 'rgba(239,68,68,0.07)',
    tickErr:         '#ef4444',
    labelErrBg:      'rgba(254,242,242,0.94)',

    // Ghost / uncommitted segment
    ghost:     'rgba(100,116,139,0.45)',
    ghostDash: [6, 4] as [number, number],

    // Vertex dots
    dot:      '#1d4ed8',
    dotFirst: '#166534',
    dotLast:  '#9333ea',
} as const;

export class StairPreviewRenderer {
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;
    private _dpr: number;

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('[StairPreviewRenderer] Failed to get Canvas2D context');
        this._canvas = canvas;
        this._ctx = ctx;
        this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    }

    /** Resize the backing buffer when the CSS size changes. */
    resize(cssW: number, cssH: number): void {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this._dpr = dpr;
        this._canvas.width  = Math.round(cssW * dpr);
        this._canvas.height = Math.round(cssH * dpr);
    }

    /** Clear the overlay completely. */
    clear(): void {
        this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    /**
     * Full render pass — call inside a requestAnimationFrame loop.
     */
    render(
        result:    SolverResult2D,
        committed: Point2D[],
        cursor:    Point2D | null,
        toScreen:  ToScreen,
        isDrawing: boolean,
    ): void {
        const ctx = this._ctx;
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        if (!isDrawing && result.segments.length === 0) return;

        const valid = result.isValid;
        const nSeg  = result.segments.length;

        // 1. Fill + boundary for every segment
        for (let i = 0; i < nSeg; i++) {
            const seg   = result.segments[i];
            const ghost = (i === nSeg - 1) && cursor !== null;
            const alpha = ghost ? 0.6 : 1.0;
            this._drawSegmentBoundary(ctx, seg, valid, alpha, i, toScreen);
        }

        // 2. Step ticks and diagonal break line
        for (let i = 0; i < nSeg; i++) {
            const seg   = result.segments[i];
            const ghost = (i === nSeg - 1) && cursor !== null;
            const alpha = ghost ? 0.5 : 1.0;
            this._drawStepTicks(ctx, seg, valid, alpha, i, toScreen);
            if (!ghost) this._drawDiagonalBreakLine(ctx, seg, valid, toScreen);
        }

        // 3. Walking line
        if (nSeg > 0) {
            this._drawWalkLine(ctx, result.segments, toScreen);
        }

        // 4. Direction arrow (UP label on first segment — always draw for guidance)
        if (nSeg > 0) {
            this._drawDirectionArrow(ctx, result.segments[0], toScreen);
        }

        // 5. Landings
        for (let i = 0; i < result.landings.length; i++) {
            const landing = result.landings[i];
            const nextSeg = result.segments[i + 1] ?? null;
            this._drawLanding(ctx, landing, result.width, toScreen);
            if (nextSeg) this._drawLandingLabel(ctx, landing, result, i, nextSeg, toScreen);
        }

        // 6. Per-run labels (centre of each run)
        if (nSeg > 1) {
            for (let i = 0; i < nSeg; i++) {
                const ghost = (i === nSeg - 1) && cursor !== null;
                if (!ghost) this._drawRunLabel(ctx, result.segments[i], i, toScreen);
            }
        }

        // 7. Vertex dots
        this._drawVertexDots(ctx, committed, toScreen);

        // 8. Ghost line before first segment exists
        if (committed.length > 0 && cursor && nSeg === 0) {
            this._drawGhostLine(ctx, committed[committed.length - 1], cursor, toScreen);
        }

        // 9. Cursor label
        if (cursor && nSeg > 0) {
            this._drawCursorLabel(ctx, result, cursor, toScreen);
        }
    }

    // ── Segment boundary ──────────────────────────────────────────────────────

    private _drawSegmentBoundary(
        ctx: CanvasRenderingContext2D,
        seg: SegmentSolution,
        valid: boolean,
        alpha: number,
        runIdx: number,
        toScreen: ToScreen,
    ): void {
        const hw = this._getHalfWidth(seg);

        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — draw the boundary around the
        // FLIGHT portion only.  The portion consumed by adjacent landings is
        // covered by `_drawLanding`, so drawing the whole segment here would
        // produce a visible overlap on top of the landing rectangle (which is
        // exactly the bug that prompted this fix).
        const fStart = (seg as any).flightStart ?? seg.start;
        const fEnd   = (seg as any).flightEnd   ?? seg.end;

        const sA_s = this._offset(fStart, seg.perp,  hw);
        const sA_e = this._offset(fEnd,   seg.perp,  hw);
        const sB_s = this._offset(fStart, seg.perp, -hw);
        const sB_e = this._offset(fEnd,   seg.perp, -hw);

        const pAs = toScreen(sA_s.x, sA_s.z);
        const pAe = toScreen(sA_e.x, sA_e.z);
        const pBs = toScreen(sB_s.x, sB_s.z);
        const pBe = toScreen(sB_e.x, sB_e.z);

        ctx.save();
        ctx.globalAlpha = alpha;

        // Fill
        ctx.beginPath();
        ctx.moveTo(pAs.sx, pAs.sy);
        ctx.lineTo(pAe.sx, pAe.sy);
        ctx.lineTo(pBe.sx, pBe.sy);
        ctx.lineTo(pBs.sx, pBs.sy);
        ctx.closePath();
        const fillColor = valid
            ? (C.runFill[runIdx % C.runFill.length])
            : C.boundaryFillErr;
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Boundary stroke
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = valid ? (C.runBoundary[runIdx % C.runBoundary.length]) : C.boundaryErr;
        ctx.stroke();

        ctx.restore();
    }

    private _getHalfWidth(seg: SegmentSolution): number {
        return ((seg as any)._halfWidth as number | undefined) ?? 0.5;
    }

    // ── Step ticks ────────────────────────────────────────────────────────────

    private _drawStepTicks(
        ctx: CanvasRenderingContext2D,
        seg: SegmentSolution,
        valid: boolean,
        alpha: number,
        runIdx: number,
        toScreen: ToScreen,
    ): void {
        if (seg.stepCount <= 0) return;

        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — ticks march along the FLIGHT
        // portion (between flightStart and flightEnd), not the full polyline
        // segment.  Tread depth = flightLength / stepCount so the last tick
        // lands exactly at flightEnd, butting against the landing's edge.
        const fStart      = (seg as any).flightStart  ?? seg.start;
        const fEnd        = (seg as any).flightEnd    ?? seg.end;
        const flightLen   = (seg as any).flightLength ?? seg.length;
        if (flightLen < 0.001) return;

        const hw    = this._getHalfWidth(seg);
        const tread = flightLen / seg.stepCount;
        const col   = valid ? (C.runTick[runIdx % C.runTick.length]) : C.tickErr;

        ctx.save();
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = col;
        ctx.lineWidth   = 0.85;

        for (let i = 1; i < seg.stepCount; i++) {
            const t  = (i * tread) / flightLen;
            const wx = fStart.x + seg.dir.x * flightLen * t;
            const wz = fStart.z + seg.dir.z * flightLen * t;
            const ptA = this._offset({ x: wx, z: wz }, seg.perp,  hw);
            const ptB = this._offset({ x: wx, z: wz }, seg.perp, -hw);
            const sA  = toScreen(ptA.x, ptA.z);
            const sB  = toScreen(ptB.x, ptB.z);
            ctx.beginPath();
            ctx.moveTo(sA.sx, sA.sy);
            ctx.lineTo(sB.sx, sB.sy);
            ctx.stroke();
        }

        // Solid end caps at the FLIGHT endpoints (= landing edges, or
        // segment endpoints when no landing borders this side).
        ctx.globalAlpha = alpha;
        ctx.lineWidth   = 2;
        for (const pt of [fStart, fEnd]) {
            const ptA = this._offset(pt, seg.perp,  hw);
            const ptB = this._offset(pt, seg.perp, -hw);
            ctx.beginPath();
            ctx.moveTo(toScreen(ptA.x, ptA.z).sx, toScreen(ptA.x, ptA.z).sy);
            ctx.lineTo(toScreen(ptB.x, ptB.z).sx, toScreen(ptB.x, ptB.z).sy);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ── Diagonal break line (architectural convention — drawn on first step of each run) ──

    private _drawDiagonalBreakLine(
        ctx: CanvasRenderingContext2D,
        seg: SegmentSolution,
        valid: boolean,
        toScreen: ToScreen,
    ): void {
        if (seg.stepCount < 1) return;
        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — break line diagonal sits on the
        // FIRST tread of the FLIGHT portion, not the polyline-segment start.
        const fStart    = (seg as any).flightStart  ?? seg.start;
        const flightLen = (seg as any).flightLength ?? seg.length;
        if (flightLen < 0.001) return;

        const hw    = this._getHalfWidth(seg);
        const tread = flightLen / seg.stepCount;
        const nextX = fStart.x + seg.dir.x * tread;
        const nextZ = fStart.z + seg.dir.z * tread;

        const sA = toScreen(
            fStart.x + seg.perp.x * hw,
            fStart.z + seg.perp.z * hw,
        );
        const sB = toScreen(
            nextX - seg.perp.x * hw,
            nextZ - seg.perp.z * hw,
        );

        ctx.save();
        ctx.strokeStyle = valid ? '#1e40af' : '#b91c1c';
        ctx.globalAlpha = 0.5;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ── Walking line ──────────────────────────────────────────────────────────

    private _drawWalkLine(
        ctx: CanvasRenderingContext2D,
        segments: SegmentSolution[],
        toScreen: ToScreen,
    ): void {
        if (segments.length === 0) return;

        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = C.walkLine;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.5;

        ctx.beginPath();
        const first = toScreen(segments[0].start.x, segments[0].start.z);
        ctx.moveTo(first.sx, first.sy);
        for (const seg of segments) {
            const e = toScreen(seg.end.x, seg.end.z);
            ctx.lineTo(e.sx, e.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ── Landing rectangles ────────────────────────────────────────────────────

    private _drawLanding(
        ctx: CanvasRenderingContext2D,
        landing: LandingSolution,
        _width: number,
        toScreen: ToScreen,
    ): void {
        const s  = landing.size;
        const hw = s / 2;

        const bisX = landing.inDir.x + landing.outDir.x;
        const bisZ = landing.inDir.z + landing.outDir.z;
        const bisLen = Math.sqrt(bisX * bisX + bisZ * bisZ);
        const bx = bisLen > 0.001 ? bisX / bisLen : landing.inDir.x;
        const bz = bisLen > 0.001 ? bisZ / bisLen : landing.inDir.z;

        const perp = { x: -bz, z: bx };
        const c = landing.corner;
        const corners = [
            this._offset(this._offset(c, { x: bx, z: bz },  hw), perp,  hw),
            this._offset(this._offset(c, { x: bx, z: bz },  hw), perp, -hw),
            this._offset(this._offset(c, { x: bx, z: bz }, -hw), perp, -hw),
            this._offset(this._offset(c, { x: bx, z: bz }, -hw), perp,  hw),
        ];

        ctx.save();
        ctx.beginPath();
        const p0 = toScreen(corners[0].x, corners[0].z);
        ctx.moveTo(p0.sx, p0.sy);
        for (let i = 1; i < 4; i++) {
            const p = toScreen(corners[i].x, corners[i].z);
            ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.fillStyle   = C.landing;
        ctx.strokeStyle = C.landingStroke;
        ctx.lineWidth   = 1.5;
        ctx.fill();
        ctx.stroke();

        // Fine cross-hatch on landing
        ctx.setLineDash([3, 5]);
        ctx.globalAlpha = 0.35;
        ctx.lineWidth   = 0.75;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    private _drawLandingLabel(
        ctx: CanvasRenderingContext2D,
        landing: LandingSolution,
        result: SolverResult2D,
        landingIdx: number,
        nextSeg: SegmentSolution,
        toScreen: ToScreen,
    ): void {
        const screen = toScreen(landing.corner.x, landing.corner.z);
        const sizeM  = (landing.size * 100).toFixed(0);
        const rbl    = result.risersBeforeLanding;

        // e.g. "Landing · 120×120" or "Landing · 120×120 · 8+7"
        const rblPart = rbl > 0
            ? ` · ${rbl}+${nextSeg.stepCount}`
            : '';
        const text = `Landing ${landingIdx + 1} · ${sizeM}×${sizeM} cm${rblPart}`;

        ctx.save();
        ctx.font         = 'bold 9px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';
        const tw = ctx.measureText(text).width;
        const th = 11;
        const px = 6, py = 3;

        const lx = screen.sx;
        const ly = screen.sy + 18;

        ctx.fillStyle   = 'rgba(239,246,255,0.90)';
        ctx.strokeStyle = C.landingStroke;
        ctx.lineWidth   = 0.75;
        this._roundRect(ctx, lx - tw / 2 - px, ly - th / 2 - py, tw + px * 2, th + py * 2, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = C.landingLabel;
        ctx.fillText(text, lx, ly);
        ctx.restore();
    }

    // ── Per-run centre label ──────────────────────────────────────────────────

    private _drawRunLabel(
        ctx: CanvasRenderingContext2D,
        seg: SegmentSolution,
        runIdx: number,
        toScreen: ToScreen,
    ): void {
        if (seg.stepCount === 0) return;

        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — label sits at the centre of the
        // FLIGHT portion (not the polyline segment), so for short L/U flights
        // it doesn't drift off into the landing area.
        const fStart    = (seg as any).flightStart  ?? seg.start;
        const fEnd      = (seg as any).flightEnd    ?? seg.end;
        const flightLen = (seg as any).flightLength ?? seg.length;
        if (flightLen < 0.001) return;

        const cx = (fStart.x + fEnd.x) / 2;
        const cz = (fStart.z + fEnd.z) / 2;
        const { sx, sy } = toScreen(cx, cz);

        const tread = Math.round(seg.treadDepth * 1000);
        const text  = `Run ${runIdx + 1}  ·  ${seg.stepCount} risers  ·  ${tread} mm`;

        ctx.save();
        ctx.font         = 'bold 9px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        const tw = ctx.measureText(text).width;
        const th = 11;
        const px = 5, py = 3;

        ctx.fillStyle   = C.runLabelBg;
        ctx.strokeStyle = C.runBoundary[runIdx % C.runBoundary.length];
        ctx.lineWidth   = 0.75;
        this._roundRect(ctx, sx - tw / 2 - px, sy - th / 2 - py, tw + px * 2, th + py * 2, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = C.runLabel;
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    // ── Direction arrow ───────────────────────────────────────────────────────

    private _drawDirectionArrow(
        ctx: CanvasRenderingContext2D,
        seg: SegmentSolution,
        toScreen: ToScreen,
    ): void {
        if (seg.length < 0.001) return;

        // Position arrow at 30% along the first run
        const t  = Math.min(0.30, 0.8);
        const wx = seg.start.x + seg.dir.x * seg.length * t;
        const wz = seg.start.z + seg.dir.z * seg.length * t;

        const origin = toScreen(wx, wz);
        const tip    = toScreen(
            wx + seg.dir.x * Math.min(0.6, seg.length * 0.18),
            wz + seg.dir.z * Math.min(0.6, seg.length * 0.18),
        );

        const angle    = Math.atan2(tip.sy - origin.sy, tip.sx - origin.sx);
        const arrowLen = Math.hypot(tip.sx - origin.sx, tip.sy - origin.sy);
        if (arrowLen < 6) return;

        ctx.save();
        ctx.translate(origin.sx, origin.sy);
        ctx.rotate(angle);
        ctx.strokeStyle = C.arrow;
        ctx.fillStyle   = C.arrow;

        // Shaft
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(arrowLen, 0);
        ctx.stroke();

        // Filled arrowhead
        ctx.beginPath();
        ctx.moveTo(arrowLen,      0);
        ctx.lineTo(arrowLen - 8, -4.5);
        ctx.lineTo(arrowLen - 8,  4.5);
        ctx.closePath();
        ctx.fill();

        // "UP" label above the shaft
        ctx.rotate(-angle);
        ctx.font         = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle    = '#1e3a8a';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('▲ UP', 0, -5);

        ctx.restore();
    }

    // ── Vertex dots ───────────────────────────────────────────────────────────

    private _drawVertexDots(
        ctx: CanvasRenderingContext2D,
        points: Point2D[],
        toScreen: ToScreen,
    ): void {
        ctx.save();
        for (let i = 0; i < points.length; i++) {
            const { sx, sy } = toScreen(points[i].x, points[i].z);
            const r    = i === 0 ? 5.5 : 4;
            const fill = i === 0 ? C.dotFirst
                       : i === points.length - 1 ? C.dotLast
                       : C.dot;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle   = fill;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.fill();
            ctx.stroke();

            // Label start / end
            if (i === 0 || i === points.length - 1) {
                ctx.font         = 'bold 9px system-ui, sans-serif';
                ctx.fillStyle    = fill;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(i === 0 ? '▼ START' : '■ END', sx, sy - r - 2);
            }
        }
        ctx.restore();
    }

    // ── Ghost line ────────────────────────────────────────────────────────────

    private _drawGhostLine(
        ctx: CanvasRenderingContext2D,
        from: Point2D,
        to: Point2D,
        toScreen: ToScreen,
    ): void {
        const a = toScreen(from.x, from.z);
        const b = toScreen(to.x, to.z);
        ctx.save();
        ctx.setLineDash(C.ghostDash as number[]);
        ctx.strokeStyle = C.ghost;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ── Cursor label ──────────────────────────────────────────────────────────

    private _drawCursorLabel(
        ctx: CanvasRenderingContext2D,
        result: SolverResult2D,
        cursor: Point2D,
        toScreen: ToScreen,
    ): void {
        const { sx, sy } = toScreen(cursor.x, cursor.z);
        const text = result.isValid
            ? result.validationMessage
            : result.validationMessage || 'Invalid stair';

        ctx.save();
        ctx.font         = '11px system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.textAlign    = 'left';

        const metrics = ctx.measureText(text);
        const tw = metrics.width;
        const th = 14;
        const px = 8, py = 4;
        const lx = sx + 16;
        const ly = sy - 16 - th;

        ctx.fillStyle   = result.isValid ? C.labelBg : C.labelErrBg;
        ctx.strokeStyle = result.isValid ? C.boundary : C.boundaryErr;
        ctx.lineWidth   = 1;
        this._roundRect(ctx, lx - px, ly - py, tw + px * 2, th + py * 2, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = result.isValid ? C.label : C.boundaryErr;
        ctx.fillText(text, lx, ly + th);
        ctx.restore();
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private _offset(pt: Point2D, dir: Point2D, dist: number): Point2D {
        return { x: pt.x + dir.x * dist, z: pt.z + dir.z * dist };
    }

    private _roundRect(
        ctx: CanvasRenderingContext2D,
        x: number, y: number, w: number, h: number, r: number,
    ): void {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    /**
     * Inject the stair width into each segment (called by the controller
     * after solving so the renderer knows the half-width).
     */
    static annotateSegmentsWithWidth(result: SolverResult2D, width: number): void {
        const hw = width / 2;
        for (const seg of result.segments) {
            (seg as any)._halfWidth = hw;
        }
    }
}
