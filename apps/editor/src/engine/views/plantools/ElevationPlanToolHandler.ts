/**
 * Sprint 4.B — ElevationPlanToolHandler
 *
 * Canvas2D plan view tool for placing interior elevation marks — mirrors the
 * Revit "Elevation" workflow where a single click on a room produces four
 * linked elevation views (North, South, East, West), each looking inward.
 *
 * Interaction:
 *   Hover   → 4-arrow interior elevation symbol follows the cursor
 *   Click   → fires 4 × CreateElevationMarkCommand (N / S / E / W)
 *   Escape  → exits the tool
 *   Multi-placement stays active after each commit
 *
 * Each fired command creates:
 *   - One elevation ViewDefinition  ("Interior Elevation 1 N", "…1 S", …)
 *   - One elevation-mark AnnotationElement in the host plan view
 *
 * Architecture: implements PlanToolHandler — registered in PlanViewToolOverlay
 * as key 'elevation-mark'.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

// ── Styling constants ─────────────────────────────────────────────────────────
const INK    = '#1a4731';                 // dark green — classic elevation mark colour
const FILL   = 'rgba(255,255,255,0.92)';
const R_ELEV = 17;                        // radius of elevation "cheese" circle (px)

// ── Cardinal directions ───────────────────────────────────────────────────────
const CARDINALS: { label: string; facing: { x: number; z: number } }[] = [
    { label: 'N', facing: { x:  0, z: -1 } },
    { label: 'S', facing: { x:  0, z:  1 } },
    { label: 'E', facing: { x:  1, z:  0 } },
    { label: 'W', facing: { x: -1, z:  0 } },
];

// ── Name counter ──────────────────────────────────────────────────────────────
let _elevCounter = 1;
function nextElevationGroupName(): string {
    return `Interior Elevation ${_elevCounter++}`;
}


// ── Handler ───────────────────────────────────────────────────────────────────
export class ElevationPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null       = null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx    = ctx;
        this._cursor = null;
        ctx.overlayCanvas.style.cursor = 'crosshair';
        console.log('[ElevationPlanToolHandler] activated — click to place 4-direction elevation mark');
    }

    deactivate(): void {
        this._clearOverlay();
        if (this._ctx) this._ctx.overlayCanvas.style.cursor = 'default';
        this._ctx    = null;
        this._cursor = null;
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this.redraw();
    }

    onClick(pt: WorldPoint): void {
        this._commit(pt);
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
        this._cursor = null;
        this._clearOverlay();
    }

    redraw(): void {
        this._drawPreview();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _commit(pos: WorldPoint): void {
        if (!this._ctx) return;
        const viewDef   = this._ctx.viewDef as any;
        const floorY    = viewDef.elevation ?? viewDef.spatial?.levelElevation ?? 0;
        // Pass levelId so CreateElevationMarkCommand can do room polygon detection
        // to auto-size the elevation scope to the containing room.
        const levelId   = viewDef.spatial?.levelId ?? viewDef.levelId ?? null;
        const groupName = nextElevationGroupName();
        const hostViewId = this._ctx.viewDef.id;

        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary (one call per cardinal)
        for (const { label, facing } of CARDINALS) {
            window.runtime?.bus?.executeCommand('elevation.create', {
                elevationViewId:   crypto.randomUUID(),
                elevationViewName: `${groupName} ${label}`,
                annotationId:      crypto.randomUUID(),
                hostViewId,
                position:          { x: pos.worldX, y: floorY, z: pos.worldZ },
                facingDirection:   facing,
                // DOC-19B: store projectionDirection + levelId in the ViewDefinition
                // spatial so PlanViewManager._ensureProjection() uses the correct
                // angle, and CreateElevationMarkCommand can look up the containing room
                // to auto-set the elevation scope to the room's wall extents.
                elevationSpatial: {
                    projectionDirection: { x: facing.x, y: 0, z: facing.z },
                    ...(levelId ? { levelId } : {}),
                },
            })?.catch((e: Error) => console.error('[ElevationPlanToolHandler] elevation.create failed for', label, e));
        }

        console.log('[ElevationPlanToolHandler] 4-direction elevation marks created at', pos);

        // Stay active for multi-placement — only clear cursor momentarily
        this._cursor = null;
        this.redraw();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        if (!this._cursor) return;

        ctx.save();

        const { sx, sy } = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
        this._drawElevSymbol(ctx, sx, sy);
        this._drawHint(ctx, cssW, cssH, 'Click to place 4-direction interior elevation  |  Esc = cancel');

        ctx.restore();
    }

    /**
     * Draws the Revit-style "cheese" interior elevation symbol:
     * - Circle divided into 4 quadrant sectors
     * - Solid arrowhead triangle in each sector pointing outward
     * - Sector divider lines at 45° between cardinal directions
     * - Centre dot
     */
    private _drawElevSymbol(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
        const R   = R_ELEV;
        const cx  = sx;
        const cy  = sy;

        // Cardinal facing angles in screen space:
        // N (world z=-1) → screen dy=-1 → angle=-π/2
        // E (world x=+1) → screen dx=+1 → angle=0
        // S (world z=+1) → screen dy=+1 → angle=+π/2
        // W (world x=-1) → screen dx=-1 → angle=π
        const cardinalAngles: number[] = [
            -Math.PI / 2,   // N
             Math.PI / 2,   // S
             0,             // E
             Math.PI,       // W
        ];
        const halfSector = Math.PI / 4; // 45° — 360°/4 dirs / 2

        // ── 1. Sector fills ─────────────────────────────────────────────────────
        ctx.save();
        for (const angle of cardinalAngles) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, angle - halfSector, angle + halfSector);
            ctx.closePath();
            ctx.fillStyle = FILL;
            ctx.fill();

            // Arrowhead triangle pointing outward within the sector
            const tipX  = cx + Math.cos(angle) * R;
            const tipY  = cy + Math.sin(angle) * R;
            const baseR = R * 0.52;
            const hw    = R * 0.30;
            const perpA = angle + Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(cx + Math.cos(angle) * baseR + Math.cos(perpA) * hw,
                       cy + Math.sin(angle) * baseR + Math.sin(perpA) * hw);
            ctx.lineTo(cx + Math.cos(angle) * baseR - Math.cos(perpA) * hw,
                       cy + Math.sin(angle) * baseR - Math.sin(perpA) * hw);
            ctx.closePath();
            ctx.fillStyle = INK;
            ctx.fill();
        }

        // ── 2. Sector divider lines ─────────────────────────────────────────────
        ctx.strokeStyle = `${INK}88`;
        ctx.lineWidth   = 0.8;
        for (let i = 0; i < 4; i++) {
            const divAngle = (i + 0.5) * (Math.PI / 2) - Math.PI / 2; // 45°, 135°, 225°, 315°
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(divAngle) * R, cy + Math.sin(divAngle) * R);
            ctx.stroke();
        }

        // ── 3. Outer circle ─────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = INK;
        ctx.lineWidth   = 1.2;
        ctx.stroke();

        // ── 4. Centre dot ───────────────────────────────────────────────────────
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    private _drawHint(ctx: CanvasRenderingContext2D, _w: number, h: number, text: string): void {
        const PAD = 6;
        ctx.font         = '11px sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(8, h - PAD - 16, tw + PAD * 2, 18);
        ctx.fillStyle = INK;
        ctx.fillText(text, 8 + PAD, h - PAD);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
    }
}
