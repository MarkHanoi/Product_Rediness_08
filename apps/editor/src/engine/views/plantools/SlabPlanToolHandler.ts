import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const SLAB_FILL_COLOR   = '#64748b';
const SLAB_EDGE_COLOR   = '#475569';
const SLAB_CLOSE_COLOR  = 'rgba(71,85,105,0.4)';
const SLAB_CROSSHAIR_COLOR = '#475569';
const CROSSHAIR_RADIUS  = 6;   // px — radius of the "dot" at cursor before first click
const CROSSHAIR_TICK    = 10;  // px — length of each tick arm

const REGION_FILL_COLOR   = 'rgba(0,120,212,0.18)';
const REGION_STROKE_COLOR = 'rgba(0,120,212,0.8)';
const REGION_NO_STROKE    = 'rgba(200,80,80,0.6)';

type SlabPlanMode = '2point' | 'polyline' | 'region' | 'hollow' | 'pickWalls';

// ── Lightweight 2D point (world XZ plane) ────────────────────────────────────
interface V2 { x: number; y: number; }

export class SlabPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _slabPoints: WorldPoint[] = [];
    private _cursorPt: WorldPoint | null = null;

    /** Region mode: the detected closed-wall polygon (world XZ), or null. */
    private _candidateRegion: V2[] | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        console.log('[SlabPlanToolHandler] activated — overlay ready, waiting for first click');
    }

    deactivate(): void {
        this._clearOverlay();
        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._ctx        = null;
        console.log('[SlabPlanToolHandler] deactivated');
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;

        if (this._getMode() === 'region') {
            this._candidateRegion = this._findRegionAtPoint(pt.worldX, pt.worldZ);
        }

        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        // ── Region mode: single click commits the detected polygon ────────────
        if (this._getMode() === 'region') {
            if (this._candidateRegion && this._candidateRegion.length >= 3) {
                this._slabPoints = this._candidateRegion.map(v => ({
                    worldX: v.x,
                    worldZ: v.y,
                    screenX: 0,
                    screenY: 0,
                }));
                this._commitSlab();
            } else {
                console.log('[SlabPlanToolHandler] region click — no closed wall region detected at cursor');
            }
            return;
        }

        // ── 2-point rectangle mode ────────────────────────────────────────────
        if (this._getMode() === '2point') {
            if (this._slabPoints.length === 0) {
                this._slabPoints = [pt];
                this._cursorPt = pt;
                this._drawPreview();
                console.log('[SlabPlanToolHandler] 2-point slab first corner set',
                    `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`);
                return;
            }

            if (this._slabPoints.length === 1) {
                const first = this._slabPoints[0];
                this._slabPoints = this._rectangleFromCorners(first, pt);
                this._cursorPt = pt;
                this._drawPreview();
                console.log('[SlabPlanToolHandler] 2-point slab second corner set — committing rectangle');
                this._commitSlab();
                return;
            }
        }

        // ── Polyline / hollow modes ───────────────────────────────────────────
        this._slabPoints.push(pt);
        this._cursorPt = pt;
        this._drawPreview();
        console.log(
            `[SlabPlanToolHandler] point ${this._slabPoints.length} added`,
            `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`,
        );
    }

    onDoubleClick(_pt: WorldPoint): void {
        const mode = this._getMode();
        console.log(`[SlabPlanToolHandler] double-click — mode=${mode} points=${this._slabPoints.length}`);
        if (mode === '2point' || mode === 'region') return;
        if (this._slabPoints.length >= 3) this._commitSlab();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        const mode = this._getMode();

        if (mode === '2point' || mode === 'region') {
            if (e.key === 'Backspace' && this._slabPoints.length > 0) {
                this._slabPoints.pop();
                this._drawPreview();
                return true;
            }
            return false;
        }

        if (e.key === 'Enter' && this._slabPoints.length >= 3) {
            e.preventDefault();
            this._commitSlab();
            return true;
        }
        if (e.key === 'Backspace' && this._slabPoints.length > 0) {
            this._slabPoints.pop();
            this._drawPreview();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._clearOverlay();
    }

    redraw(): void {
        this._drawPreview();
    }

    // ─── commit ──────────────────────────────────────────────────────────────

    private _commitSlab(): void {
        const c = this._ctx;
        if (!c || this._slabPoints.length < 3) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[SlabPlanToolHandler] ViewDefinition.spatial.levelId missing', c.viewDef.id);
            return;
        }

        const poly = this._slabPoints;
        const minX = poly.reduce((m, p) => Math.min(m, p.worldX), Infinity);
        const maxX = poly.reduce((m, p) => Math.max(m, p.worldX), -Infinity);
        const minZ = poly.reduce((m, p) => Math.min(m, p.worldZ), Infinity);
        const maxZ = poly.reduce((m, p) => Math.max(m, p.worldZ), -Infinity);

        const systemTypeId = window.slabTool?.getSystemTypeId?.();
        const slabType     = systemTypeId
            ? window.slabSystemTypeStore?.getById?.(systemTypeId) // TODO(TASK-08)
            : null;
        const thickness = slabType?.totalThickness ?? 0.25;
        const slabId    = crypto.randomUUID();

        window.runtime?.bus?.executeCommand('slab.create', {
            id:       slabId,
            ifcGuid:  crypto.randomUUID(),
            width:    Math.max(0.01, maxX - minX),
            depth:    Math.max(0.01, maxZ - minZ),
            thickness,
            // §02 §1.2: position must be {0,0,0}. SlabFragmentBuilder adds the polygon
            // centroid to the position for the pivot — passing the centroid here would
            // double-offset every vertex and misplace the slab.
            position: { x: 0, y: 0, z: 0 },
            levelId,
            polygon:  poly.map(p => ({ x: p.worldX, y: p.worldZ })),
        })?.then(() => {
            console.log('[SlabPlanToolHandler] slab created', slabId);
            if (systemTypeId && slabType && Array.isArray(slabType.layers) && slabType.layers.length > 0) {
                window.runtime?.bus?.executeCommand('slab.update', {
                    slabId,
                    systemTypeId,
                    layers:    structuredClone(slabType.layers),
                    thickness: slabType.totalThickness,
                })?.catch((e: unknown) => console.error('[SlabPlanToolHandler] slab.update (layers) failed:', e));
            }
        })?.catch((e: unknown) => console.error('[SlabPlanToolHandler] slab.create failed:', e));

        this._slabPoints = [];
        this._cursorPt   = null;
        this._candidateRegion = null;
        this._clearOverlay();
    }

    // ─── region detection (ported from SlabTool.ts) ──────────────────────────

    /**
     * Find the minimal closed wall loop containing the point (worldX, worldZ).
     * Returns the loop vertices as V2[] (XZ world coords), or null if none found.
     */
    private _findRegionAtPoint(wx: number, wz: number): V2[] | null {
        const walls: any[] = window.wallStore?.getAll?.() ?? []; // TODO(TASK-08)
        if (walls.length === 0) return null;

        const segments: [V2, V2][] = [];
        for (const w of walls) {
            const bl = w.baseLine;
            if (!bl || bl.length < 2) continue;
            segments.push([
                { x: bl[0].x, y: bl[0].z },
                { x: bl[1].x, y: bl[1].z },
            ]);
        }

        const loops = this._buildClosedLoops(segments);
        const click: V2 = { x: wx, y: wz };

        for (const loop of loops) {
            if (this._isPointInPolygon(click, loop)) return loop;
        }
        return null;
    }

    private _buildClosedLoops(segments: [V2, V2][]): V2[][] {
        const points: V2[] = [];
        const adj = new Map<number, number[]>();
        const tolerance = 0.15;

        const getIdx = (p: V2): number => {
            for (let i = 0; i < points.length; i++) {
                const dx = points[i].x - p.x, dy = points[i].y - p.y;
                if (Math.sqrt(dx * dx + dy * dy) < tolerance) return i;
            }
            points.push({ x: p.x, y: p.y });
            return points.length - 1;
        };

        for (const [a, b] of segments) {
            const u = getIdx(a);
            const v = getIdx(b);
            if (u === v) continue;
            if (!adj.has(u)) adj.set(u, []);
            if (!adj.has(v)) adj.set(v, []);
            adj.get(u)!.push(v);
            adj.get(v)!.push(u);
        }

        const loops: V2[][] = [];
        const visitedEdges = new Set<string>();

        for (let i = 0; i < points.length; i++) {
            for (const neighbor of (adj.get(i) ?? [])) {
                if (visitedEdges.has(`${i}-${neighbor}`)) continue;
                const loop = this._traceLoop(i, neighbor, adj, points, visitedEdges);
                if (loop && loop.length >= 3) loops.push(loop);
            }
        }
        return loops;
    }

    private _traceLoop(
        startIdx: number,
        nextIdx: number,
        adj: Map<number, number[]>,
        points: V2[],
        visitedEdges: Set<string>,
    ): V2[] | null {
        const idxs = [startIdx, nextIdx];
        visitedEdges.add(`${startIdx}-${nextIdx}`);
        visitedEdges.add(`${nextIdx}-${startIdx}`);

        let currIdx = nextIdx;
        let prevIdx = startIdx;

        while (true) {
            const neighbors = adj.get(currIdx) ?? [];
            if (neighbors.length < 2) return null;

            const pCurr = points[currIdx];
            const pPrev = points[prevIdx];
            const vPrevX = pPrev.x - pCurr.x, vPrevY = pPrev.y - pCurr.y;
            const vPrevLen = Math.sqrt(vPrevX * vPrevX + vPrevY * vPrevY) || 1;
            const nvPrevX = vPrevX / vPrevLen, nvPrevY = vPrevY / vPrevLen;

            let bestNeighbor = -1;
            let bestAngle = Infinity;

            for (const n of neighbors) {
                if (n === prevIdx) continue;
                const vNextX = points[n].x - pCurr.x, vNextY = points[n].y - pCurr.y;
                const vNextLen = Math.sqrt(vNextX * vNextX + vNextY * vNextY) || 1;
                const nvNextX = vNextX / vNextLen, nvNextY = vNextY / vNextLen;

                let angle = Math.atan2(nvNextY, nvNextX) - Math.atan2(nvPrevY, nvPrevX);
                if (angle <= 0) angle += Math.PI * 2;

                if (angle < bestAngle) {
                    bestAngle = angle;
                    bestNeighbor = n;
                }
            }

            if (bestNeighbor === -1) return null;
            if (bestNeighbor === startIdx) break;
            if (idxs.includes(bestNeighbor)) return null;

            visitedEdges.add(`${currIdx}-${bestNeighbor}`);
            visitedEdges.add(`${bestNeighbor}-${currIdx}`);
            idxs.push(bestNeighbor);
            prevIdx = currIdx;
            currIdx = bestNeighbor;

            if (idxs.length > 50) return null;
        }

        return idxs.map(i => points[i]);
    }

    private _isPointInPolygon(pt: V2, poly: V2[]): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // ─── drawing ─────────────────────────────────────────────────────────────

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const mode = this._getMode();

        // ── Region mode: draw detected region fill + cursor ───────────────────
        if (mode === 'region') {
            this._drawRegionPreview(ctx, planCanvas, cssW, cssH);
            return;
        }

        if (!this._cursorPt && this._slabPoints.length === 0) return;

        ctx.save();

        const previewPoints = this._getPreviewPoints();
        const screenPts = previewPoints.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));
        const committedScreenPts = this._slabPoints.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));
        const curSc     = this._cursorPt
            ? planCanvas.worldToScreen(this._cursorPt.worldX, this._cursorPt.worldZ)
            : null;

        // ── 1. Translucent polygon fill (3+ points) ───────────────────────
        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = SLAB_FILL_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            if (curSc && mode !== '2point') ctx.lineTo(curSc.sx, curSc.sy);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // ── 2. Polygon edge (placed points) ──────────────────────────────
        if (screenPts.length >= 2) {
            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 3. Rubber-band line: last point → cursor ──────────────────────
        if (curSc && committedScreenPts.length >= 1 && mode !== '2point') {
            const last = committedScreenPts[committedScreenPts.length - 1];
            ctx.setLineDash([5, 4]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.moveTo(last.sx, last.sy);
            ctx.lineTo(curSc.sx, curSc.sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 4. Closing-edge ghost (cursor → first point, 3+ points) ──────
        if (curSc && screenPts.length >= 3 && mode !== '2point') {
            ctx.setLineDash([3, 3]);
            ctx.lineWidth   = 1;
            ctx.strokeStyle = SLAB_CLOSE_COLOR;
            ctx.beginPath();
            ctx.moveTo(curSc.sx, curSc.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 5. Placed-point dots ─────────────────────────────────────────
        ctx.fillStyle = SLAB_EDGE_COLOR;
        for (const p of committedScreenPts) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── 6. Cursor crosshair ──────────────────────────────────────────
        if (curSc) this._drawCrosshair(ctx, curSc.sx, curSc.sy, screenPts.length >= 2);

        // ── 7. Hint text ──────────────────────────────────────────────────
        const twoPoint = mode === '2point';
        const hint = twoPoint
            ? committedScreenPts.length === 0
                ? 'Click first slab corner'
                : 'Click opposite corner to create slab  ·  Backspace to restart'
            : committedScreenPts.length === 0
                ? 'Click to start slab polygon'
                : committedScreenPts.length < 3
                    ? `${3 - committedScreenPts.length} more point${3 - committedScreenPts.length !== 1 ? 's' : ''} needed`
                    : 'Dbl-click or Enter to close slab  ·  Backspace to undo';

        this._drawHint(ctx, hint, cssW, cssH);
        ctx.restore();
    }

    /** Draw the region-mode overlay: detected region fill + cursor crosshair + hint. */
    private _drawRegionPreview(
        ctx: CanvasRenderingContext2D,
        planCanvas: PlanToolDrawContext['planCanvas'],
        cssW: number,
        cssH: number,
    ): void {
        ctx.save();

        const hasRegion = this._candidateRegion && this._candidateRegion.length >= 3;

        // ── Region polygon ────────────────────────────────────────────────────
        if (hasRegion && this._candidateRegion) {
            const screenPts = this._candidateRegion.map(v =>
                planCanvas.worldToScreen(v.x, v.y),
            );

            // Fill
            ctx.fillStyle = REGION_FILL_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.closePath();
            ctx.fill();

            // Stroke
            ctx.strokeStyle = REGION_STROKE_COLOR;
            ctx.lineWidth   = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.closePath();
            ctx.stroke();
        }

        // ── Cursor crosshair ──────────────────────────────────────────────────
        if (this._cursorPt) {
            const { sx, sy } = planCanvas.worldToScreen(this._cursorPt.worldX, this._cursorPt.worldZ);
            const color = hasRegion ? REGION_STROKE_COLOR : REGION_NO_STROKE;
            ctx.strokeStyle = color;
            ctx.fillStyle   = color;
            ctx.lineWidth   = 1.5;

            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(sx, sy, CROSSHAIR_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.moveTo(sx - CROSSHAIR_TICK, sy); ctx.lineTo(sx - CROSSHAIR_RADIUS - 1, sy);
            ctx.moveTo(sx + CROSSHAIR_RADIUS + 1, sy); ctx.lineTo(sx + CROSSHAIR_TICK, sy);
            ctx.moveTo(sx, sy - CROSSHAIR_TICK); ctx.lineTo(sx, sy - CROSSHAIR_RADIUS - 1);
            ctx.moveTo(sx, sy + CROSSHAIR_RADIUS + 1); ctx.lineTo(sx, sy + CROSSHAIR_TICK);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Hint text ─────────────────────────────────────────────────────────
        const hint = hasRegion
            ? 'Click to create slab from detected region'
            : 'Move cursor inside a closed wall region';
        this._drawHint(ctx, hint, cssW, cssH);

        ctx.restore();
    }

    private _drawCrosshair(
        ctx: CanvasRenderingContext2D,
        sx: number,
        sy: number,
        filledDot: boolean,
    ): void {
        ctx.strokeStyle = SLAB_CROSSHAIR_COLOR;
        ctx.lineWidth   = 1.5;

        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, CROSSHAIR_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(sx - CROSSHAIR_TICK, sy);
        ctx.lineTo(sx - CROSSHAIR_RADIUS - 1, sy);
        ctx.moveTo(sx + CROSSHAIR_RADIUS + 1, sy);
        ctx.lineTo(sx + CROSSHAIR_TICK, sy);
        ctx.moveTo(sx, sy - CROSSHAIR_TICK);
        ctx.lineTo(sx, sy - CROSSHAIR_RADIUS - 1);
        ctx.moveTo(sx, sy + CROSSHAIR_RADIUS + 1);
        ctx.lineTo(sx, sy + CROSSHAIR_TICK);
        ctx.stroke();

        if (filledDot) {
            ctx.fillStyle = SLAB_EDGE_COLOR;
            ctx.beginPath();
            ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private _drawHint(
        ctx: CanvasRenderingContext2D,
        hint: string,
        _cssW: number,
        cssH: number,
    ): void {
        ctx.font         = 'bold 11px system-ui, sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';

        const metrics  = ctx.measureText(hint);
        const padX = 6, padY = 4;
        const tx = 12, ty = cssH - 12;

        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = '#ffffff';
        ctx.fillRect(tx - padX, ty - metrics.actualBoundingBoxAscent - padY, metrics.width + padX * 2, metrics.actualBoundingBoxAscent + padY * 2);
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fillText(hint, tx, ty);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }

    private _getMode(): SlabPlanMode {
        const mode = window.slabTool?.toolMode;
        if (mode === 'FLOOR_SKETCH') return '2point';
        if (mode === 'REGION_SLAB') return 'region';
        if (mode === 'HOLLOW_SLAB') return 'hollow';
        if (mode === 'POLYLINE_SLAB') return 'polyline';
        return 'polyline';
    }

    private _getPreviewPoints(): WorldPoint[] {
        if (this._getMode() === '2point' && this._slabPoints.length === 1 && this._cursorPt) {
            return this._rectangleFromCorners(this._slabPoints[0], this._cursorPt);
        }
        return this._slabPoints;
    }

    private _rectangleFromCorners(a: WorldPoint, b: WorldPoint): WorldPoint[] {
        return [
            a,
            { ...a, worldX: b.worldX },
            b,
            { ...a, worldZ: b.worldZ },
        ];
    }
}
