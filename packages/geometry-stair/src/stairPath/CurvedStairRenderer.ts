/**
 * CurvedStairRenderer — 2D canvas renderer for the curved "C" stair type.
 *
 * Renders onto the same overlay <canvas> as StairPreviewRenderer, but draws:
 *   • Inner and outer arcs
 *   • Radial step ticks (pie-wedge lines)
 *   • Solid radial caps at start and end
 *   • Walking arc (dashed, at mid radius)
 *   • Direction arrow along the arc
 *   • Step count / riser label near cursor
 *   • Ghost preview while placing center / radius / sweep
 *
 * No Three.js, no DOM mutations.
 */

import type { Point2D } from './PolylineModel';
import type { CurvedSolverResult } from './CurvedStairSolver';

export type ToScreen = (x: number, z: number) => { sx: number; sy: number };

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
    fill:       'rgba(59,130,246,0.09)',
    fillErr:    'rgba(239,68,68,0.07)',
    boundary:   '#1e40af',
    boundaryErr:'#b91c1c',
    tick:       '#2563eb',
    tickErr:    '#ef4444',
    walkArc:    '#3b82f6',
    arrow:      '#1e3a8a',
    label:      '#1e40af',
    labelBg:    'rgba(239,246,255,0.94)',
    labelErrBg: 'rgba(254,242,242,0.94)',
    dot:        '#1d4ed8',
    dotCenter:  '#7c3aed',
    ghost:      'rgba(100,116,139,0.40)',
} as const;

// ── Renderer ──────────────────────────────────────────────────────────────────

export class CurvedStairRenderer {
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;
    private _dpr: number;

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('[CurvedStairRenderer] Failed to get Canvas2D context');
        this._canvas = canvas;
        this._ctx    = ctx;
        this._dpr    = Math.min(window.devicePixelRatio || 1, 2);
    }

    resize(cssW: number, cssH: number): void {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this._dpr = dpr;
        this._canvas.width  = Math.round(cssW * dpr);
        this._canvas.height = Math.round(cssH * dpr);
    }

    clear(): void {
        this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    // ── Phase: user placed center, dragging to set radius ─────────────────────

    renderCenterPhase(
        center: Point2D,
        cursor: Point2D | null,
        toScreen: ToScreen,
    ): void {
        const ctx = this._ctx;
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        const cs = toScreen(center.x, center.z);
        this._drawDot(ctx, cs.sx, cs.sy, 6, C.dotCenter);

        if (cursor) {
            const cu = toScreen(cursor.x, cursor.z);
            // Ghost radius line
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = C.ghost;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(cs.sx, cs.sy);
            ctx.lineTo(cu.sx, cu.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            // Ghost circle
            const dx = cursor.x - center.x;
            const dz = cursor.z - center.z;
            const rWorld = Math.sqrt(dx * dx + dz * dz);
            if (rWorld > 0.01) {
                // Estimate screen radius by comparing two screen points
                const edge = toScreen(center.x + rWorld, center.z);
                const rScreen = Math.hypot(edge.sx - cs.sx, edge.sy - cs.sy);
                ctx.beginPath();
                ctx.arc(cs.sx, cs.sy, rScreen, 0, Math.PI * 2);
                ctx.strokeStyle = C.ghost;
                ctx.lineWidth   = 1;
                ctx.stroke();
            }
            ctx.restore();
        }

        this._drawLabel(ctx, cs.sx, cs.sy - 18, 'Click to set inner radius & start', false);
    }

    // ── Phase: radius fixed, dragging to set sweep ────────────────────────────

    renderSweepPhase(
        result: CurvedSolverResult,
        toScreen: ToScreen,
    ): void {
        const ctx = this._ctx;
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._drawResult(ctx, result, toScreen, true);
    }

    // ── Full committed result ─────────────────────────────────────────────────

    render(
        result: CurvedSolverResult,
        toScreen: ToScreen,
        isLive: boolean,
    ): void {
        const ctx = this._ctx;
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._drawResult(ctx, result, toScreen, isLive);
    }

    // ── Core drawing ──────────────────────────────────────────────────────────

    private _drawResult(
        ctx: CanvasRenderingContext2D,
        r: CurvedSolverResult,
        toScreen: ToScreen,
        isLive: boolean,
    ): void {
        const { center, startAngle, sweepAngle, innerRadius, outerRadius } = r;
        const cs = toScreen(center.x, center.z);
        const valid = r.isValid;

        // Compute screen radii using a reference point offset in X direction
        const refInner = toScreen(center.x + innerRadius, center.z);
        const refOuter = toScreen(center.x + outerRadius, center.z);
        const rInner   = Math.hypot(refInner.sx - cs.sx, refInner.sy - cs.sy);
        const rOuter   = Math.hypot(refOuter.sx - cs.sx, refOuter.sy - cs.sy);

        if (rInner < 1 || rOuter < 1) return;

        const endAngle    = startAngle + sweepAngle;
        const ccw         = sweepAngle < 0;

        // 1. Filled sector
        ctx.save();
        ctx.beginPath();
        ctx.arc(cs.sx, cs.sy, rOuter, startAngle, endAngle, ccw);
        ctx.arc(cs.sx, cs.sy, rInner, endAngle, startAngle, !ccw);
        ctx.closePath();
        ctx.fillStyle = valid ? C.fill : C.fillErr;
        ctx.fill();
        ctx.restore();

        // 2. Boundary arcs
        ctx.save();
        ctx.strokeStyle = valid ? C.boundary : C.boundaryErr;
        ctx.lineWidth   = 1.5;
        // Outer arc
        ctx.beginPath();
        ctx.arc(cs.sx, cs.sy, rOuter, startAngle, endAngle, ccw);
        ctx.stroke();
        // Inner arc
        ctx.beginPath();
        ctx.arc(cs.sx, cs.sy, rInner, startAngle, endAngle, ccw);
        ctx.stroke();
        // Start cap
        const sc = this._arcPoint(cs, rInner, startAngle);
        const sc2 = this._arcPoint(cs, rOuter, startAngle);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sc.x, sc.y);
        ctx.lineTo(sc2.x, sc2.y);
        ctx.stroke();
        // End cap
        const ec = this._arcPoint(cs, rInner, endAngle);
        const ec2 = this._arcPoint(cs, rOuter, endAngle);
        ctx.beginPath();
        ctx.moveTo(ec.x, ec.y);
        ctx.lineTo(ec2.x, ec2.y);
        ctx.stroke();
        ctx.restore();

        // 3. Step ticks (radial lines at each step boundary)
        if (r.slices.length > 0) {
            ctx.save();
            ctx.strokeStyle = valid ? C.tick : C.tickErr;
            ctx.lineWidth   = 0.85;
            ctx.globalAlpha = 0.75;
            for (let i = 1; i < r.slices.length; i++) {
                const angle = r.slices[i].startAngle;
                const tp = this._arcPoint(cs, rInner, angle);
                const tp2 = this._arcPoint(cs, rOuter, angle);
                ctx.beginPath();
                ctx.moveTo(tp.x, tp.y);
                ctx.lineTo(tp2.x, tp2.y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // 4. Walking arc (dashed, at mid radius)
        const rWalk = (rInner + rOuter) / 2;
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = C.walkArc;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(cs.sx, cs.sy, rWalk, startAngle, endAngle, ccw);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();

        // 5. Direction arrow at 30% along walking arc
        this._drawDirectionArrow(ctx, cs, rWalk, startAngle, sweepAngle);

        // 6. Center dot
        this._drawDot(ctx, cs.sx, cs.sy, 4, C.dotCenter);

        // 7. Cursor / live label
        if (isLive) {
            const labelPt = this._arcPoint(cs, rOuter + 14, startAngle + sweepAngle * 0.8);
            this._drawLabel(ctx, labelPt.x, labelPt.y - 10, r.validationMessage, valid);
        }

        // 8. Diagonal break on first step
        if (r.slices.length > 0) {
            const s = r.slices[0];
            const p1 = this._arcPoint(cs, rInner, s.startAngle);
            const p2 = this._arcPoint(cs, rOuter, s.endAngle);
            ctx.save();
            ctx.strokeStyle = valid ? '#1e40af' : '#b91c1c';
            ctx.globalAlpha = 0.5;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    private _drawDirectionArrow(
        ctx: CanvasRenderingContext2D,
        center: { sx: number; sy: number },
        rScreen: number,
        startAngle: number,
        sweepAngle: number,
    ): void {
        const t = 0.25;
        const angle0 = startAngle + sweepAngle * t;
        const angle1 = startAngle + sweepAngle * (t + 0.10);

        const p0 = this._arcPoint(center, rScreen, angle0);
        const p1 = this._arcPoint(center, rScreen, angle1);

        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (len < 6) return;

        const arrowAngle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(p0.x, p0.y);
        ctx.rotate(arrowAngle);
        ctx.strokeStyle = C.arrow;
        ctx.fillStyle   = C.arrow;

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(len,      0);
        ctx.lineTo(len - 8, -4.5);
        ctx.lineTo(len - 8,  4.5);
        ctx.closePath();
        ctx.fill();

        ctx.rotate(-arrowAngle);
        ctx.font         = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle    = '#1e3a8a';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('▲ UP', 0, -5);
        ctx.restore();
    }

    private _drawDot(
        ctx: CanvasRenderingContext2D,
        sx: number, sy: number,
        r: number,
        fill: string,
    ): void {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle   = fill;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    private _drawLabel(
        ctx: CanvasRenderingContext2D,
        x: number, y: number,
        text: string,
        valid: boolean,
    ): void {
        ctx.save();
        ctx.font         = '11px system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.textAlign    = 'left';
        const tw = ctx.measureText(text).width;
        const th = 14;
        const px = 8, py = 4;
        ctx.fillStyle   = valid ? C.labelBg : C.labelErrBg;
        ctx.strokeStyle = valid ? C.boundary : C.boundaryErr;
        ctx.lineWidth   = 1;
        this._roundRect(ctx, x - px, y - py, tw + px * 2, th + py * 2, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = valid ? C.label : C.boundaryErr;
        ctx.fillText(text, x, y + th);
        ctx.restore();
    }

    // ── Geometry helpers ──────────────────────────────────────────────────────

    private _arcPoint(
        center: { sx: number; sy: number },
        r: number,
        angle: number,
    ): { x: number; y: number } {
        return {
            x: center.sx + Math.cos(angle) * r,
            y: center.sy + Math.sin(angle) * r,
        };
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
}
