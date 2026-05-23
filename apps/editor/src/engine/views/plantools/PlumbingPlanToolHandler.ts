/**
 * PlumbingPlanToolHandler — Sprint 3 Section B (Contract 19)
 *
 * Single-click placement tool for plumbing fixtures in plan view.
 *
 * Interaction model:
 *   • Moving the mouse shows a 2D AEC plan symbol centred at the cursor with a
 *     type label — matching the visual language used by FurniturePlanToolHandler.
 *   • One click commits the fixture at the cursor world position with 0 rotation.
 *   • Multi-placement remains active after each commit (Escape to cancel).
 *
 * Reads the active fixture type from:
 *   window._pryzmActivePlumbingType   — set by ToolManager.activatePlumbing()
 * Falls back to 'toilet' if not set.
 *
 * Fires CreatePlumbingFixtureCommand for every placed fixture.
 */

import { createId } from '@pryzm/schemas';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import type { PlumbingFixtureType } from '@pryzm/geometry-plumbing';
import { DEFAULT_TOILET_VARIANT, ToiletVariant } from '@pryzm/geometry-plumbing';
import { DEFAULT_SHOWER_VARIANT, SHOWER_FOOTPRINTS, ShowerVariant } from '@pryzm/geometry-plumbing';
import type { WallData } from '@pryzm/geometry-wall';

// ── Plan-view footprint dimensions per fixture type (metres) ─────────────────
const FOOTPRINTS: Record<PlumbingFixtureType, { w: number; l: number; h: number }> = {
    toilet: { w: 0.38, l: 0.65, h: 0.40 },
    sink:   { w: 0.55, l: 0.48, h: 0.85 },
    urinal: { w: 0.35, l: 0.30, h: 0.60 },
    bidet:  { w: 0.38, l: 0.56, h: 0.40 },
    bath:   { w: 0.75, l: 1.70, h: 0.55 },
    // Shower default footprint — overridden by `_footprint()` when a specific
    // ShowerVariant is active so plan symbol matches the 3D mesh.
    shower: { w: 0.90, l: 0.90, h: 2.00 },
    // Accessory family — single representative footprint; the actual variant
    // overrides via PlumbingFragmentBuilder.createAccessoryMesh + the registry
    // dimensions in FurnitureCategoryRegistry. The plan tool itself does not
    // place accessories (they are carousel-only), so this is a fallback.
    accessory: { w: 0.40, l: 0.40, h: 0.60 },
};
const DEFAULT_FOOTPRINT: { w: number; l: number; h: number } = { w: 0.40, l: 0.60, h: 0.40 };

// PRYZM brand purple (Contract 05/06 + ColourPalette) for valid placement;
// red for invalid (no nearby wall — required for wall-hosted fixtures).
const PRYZM_PURPLE        = '#6600ff';
const PRYZM_PURPLE_FILL   = 'rgba(102,0,255,0.16)';
const PRYZM_PURPLE_SYMBOL = '#6D28D9';
const INVALID_RED         = '#EF4444';
const INVALID_RED_FILL    = 'rgba(239,68,68,0.16)';
const INVALID_RED_SYMBOL  = '#B91C1C';

const WALL_SNAP_M = 1.0; // metres — same range as 3D PlumbingTool.getNearestWall

function _getActiveType(): PlumbingFixtureType {
    return (window._pryzmActivePlumbingType ?? 'toilet') as PlumbingFixtureType;
}

function _getActiveToiletVariant(): ToiletVariant {
    return (window._pryzmActiveToiletVariant ?? DEFAULT_TOILET_VARIANT) as ToiletVariant;
}

function _getActiveShowerVariant(): ShowerVariant {
    return (window._pryzmActiveShowerVariant ?? DEFAULT_SHOWER_VARIANT) as ShowerVariant;
}

function _footprint(type: PlumbingFixtureType): { w: number; l: number; h: number } {
    if (type === 'shower') {
        // Shower footprint is variant-driven so the plan symbol stays in
        // sync with the 3D mesh (Contracts 36 §5 / 39 §5).
        const fp = SHOWER_FOOTPRINTS[_getActiveShowerVariant()];
        return { w: fp.width, l: fp.length, h: fp.height };
    }
    return FOOTPRINTS[type] ?? DEFAULT_FOOTPRINT;
}

function _label(type: PlumbingFixtureType): string {
    return type.replace(/_/g, ' ');
}

interface WallSnap {
    /** Angle (radians) along the wall in screen-space — for rotating the symbol. */
    angle: number;
    /** Wall-aligned unit vector in world space (along baseLine). */
    tangent: { x: number; z: number };
    /** Outward (room-side) wall normal in world space. */
    normal: { x: number; z: number };
}

export class PlumbingPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null       = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx    = ctx;
        this._cursor = null;
        console.log('[PlumbingPlanToolHandler] Activated, type:', _getActiveType());
    }

    deactivate(): void {
        this._clearOverlay();
        this._cursor = null;
        this._ctx    = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        const type = _getActiveType();
        // Wall-hosted fixtures must snap to a wall, mirroring 3D PlumbingTool.
        // Bath is free-place (drag-to-size in 3D — single-click footprint here).
        if (type !== 'bath') {
            const snap = this._findWallSnap(pt.worldX, pt.worldZ);
            if (!snap) {
                console.warn('[PlumbingPlanToolHandler] No wall within snap range — move closer to a wall to place');
                return;
            }
        }
        this._commit(pt);
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        return false;
    }

    cancel(): void {
        this._cursor = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._cursor) this._drawPreview();
    }

    private _commit(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[PlumbingPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const type = _getActiveType();
        const fp   = _footprint(type);
        const id   = createId('plumbing');

        // Wall-hosted fixtures: orient so the back of the fixture faces the
        // wall (matches 3D PlumbingTool semantics). World-Y rotation = atan2
        // of the outward normal.
        let yaw = 0;
        if (type !== 'bath') {
            const snap = this._findWallSnap(pt.worldX, pt.worldZ);
            if (snap) {
                yaw = Math.atan2(snap.normal.x, snap.normal.z);
            }
        }

        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary.
        // §FIX-PLUMBING-FIXTURE-CMD (C11 §11.11): this tool creates a *fixture*
        // (toilet/shower/bath/sink), so it MUST dispatch `plumbing.createFixture`
        // — routed by CreatePlumbingFixtureHandler → legacy CreatePlumbingFixture-
        // Command → fixture PlumbingStore → PlumbingFragmentBuilder mesh. The old
        // `plumbing.create` target is the *pipe* handler (CreatePlumbingHandler
        // models a pipe: kind/diameter/bendRadius) — it silently dropped every
        // fixture field (fixtureType, position, variants). The payload below
        // already matches CreatePlumbingFixturePayload (commands.ts:672) verbatim.
        window.runtime?.bus?.executeCommand('plumbing.createFixture', {
            id,
            fixtureType:  type as any,
            toiletVariant: type === 'toilet' ? _getActiveToiletVariant() : undefined,
            showerVariant: type === 'shower' ? _getActiveShowerVariant() : undefined,
            position:     { x: pt.worldX, y: 0, z: pt.worldZ },
            rotation:     { x: 0, y: yaw, z: 0 },
            levelId,
            baseOffset:   0,
            width:        fp.w,
            height:       fp.h,
            length:       fp.l,
        })?.catch((e: Error) => console.error('[PlumbingPlanToolHandler] plumbing.createFixture failed:', e));
        console.log('[PlumbingPlanToolHandler] Fixture created', id, type, 'at', pt);

        // Stay active for multi-placement
        this._clearOverlay();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || !this._cursor) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const type = _getActiveType();
        const fp   = _footprint(type);
        const ppu  = planCanvas.getPixelsPerUnit();
        const hw   = (fp.w / 2) * ppu;
        const hl   = (fp.l / 2) * ppu;
        const { sx, sy } = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);

        // Bath is free-place; everything else must hug a wall.
        const requiresWall = type !== 'bath';
        const snap   = requiresWall ? this._findWallSnap(this._cursor.worldX, this._cursor.worldZ) : null;
        const valid  = !requiresWall || snap !== null;

        const stroke  = valid ? PRYZM_PURPLE        : INVALID_RED;
        const fill    = valid ? PRYZM_PURPLE_FILL   : INVALID_RED_FILL;
        const symbol  = valid ? PRYZM_PURPLE_SYMBOL : INVALID_RED_SYMBOL;

        // Symbol orientation:
        //   • The symbol's local +Y in this draw routine points to the BACK
        //     (tank side for toilets / basin back). When valid, rotate so that
        //     local -Y aligns with the room-side wall normal — i.e. tank
        //     against wall, bowl pointing into the room.
        //   • When invalid, draw axis-aligned (no snap reference yet).
        let symbolAngle = 0;
        if (snap) {
            // Convert the world-space outward normal into screen radians.
            const o = planCanvas.worldToScreen(0, 0);
            const t = planCanvas.worldToScreen(snap.normal.x, snap.normal.z);
            const normalScreen = Math.atan2(t.sy - o.sy, t.sx - o.sx);
            // The 2D symbols are drawn with their BACK (tank/wall side) at
            // local -Y and FRONT (bowl/room side) at local +Y. We need local
            // +Y to point along the outward (room-side) normal so the back of
            // the fixture sits flush with the wall. With ctx.rotate(angle),
            // local +Y ends up at screen-space angle (PI/2 + angle), so we
            // need angle = normalScreen − PI/2.
            symbolAngle = normalScreen - Math.PI / 2;
        }

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(symbolAngle);

        // Outer bounding box (dashed)
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = 1.5;
        ctx.fillStyle   = fill;
        ctx.beginPath();
        ctx.rect(-hw, -hl, hw * 2, hl * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Interior 2D plan symbol per fixture type
        ctx.strokeStyle = symbol;
        ctx.lineWidth   = 1;
        this._drawSymbol(ctx, 0, 0, hw, hl, type);

        ctx.restore();

        ctx.save();
        // Crosshair (axis-aligned, in screen space)
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = 0.75;
        const ext = Math.max(hw, hl) + 4;
        ctx.beginPath();
        ctx.moveTo(sx - ext, sy); ctx.lineTo(sx + ext, sy);
        ctx.moveTo(sx, sy - ext); ctx.lineTo(sx, sy + ext);
        ctx.stroke();

        // Type label with white pill background
        const labelText = _label(type) + (valid ? '' : '  · move closer to a wall');
        ctx.font = 'bold 10px sans-serif';
        const tw = ctx.measureText(labelText).width;
        const ly = sy + ext + 12;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(sx - tw / 2 - 4, ly - 8, tw + 8, 15);
        ctx.fillStyle    = valid ? '#6600ff' : '#7F1D1D';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, sx, ly);

        // Hint at bottom-left
        ctx.font         = '11px sans-serif';
        ctx.fillStyle    = 'rgba(102,0,255,0.85)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Click to place · Esc to cancel', 12, cssH - 12);

        ctx.restore();
    }

    /**
     * Finds the nearest wall in plan to the given world point and returns
     * the wall tangent + outward (room-side) normal. Mirrors
     * `PlumbingTool.getNearestWall()` semantics for plan-view parity.
     */
    private _findWallSnap(worldX: number, worldZ: number): WallSnap | null {
        const c = this._ctx;
        if (!c) return null;
        const ws = window.wallStore; // TODO(TASK-08)
        if (!ws?.getAll) return null;

        const levelId = c.viewDef.spatial?.levelId;

        let bestWall: WallData | null = null;
        let bestDist = WALL_SNAP_M;
        let bestNormal: { x: number; z: number } = { x: 0, z: 0 };

        for (const wall of ws.getAll() as WallData[]) {
            if (levelId && wall.levelId !== levelId) continue;
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;
            const ax = bl[0].x, az = bl[0].z;
            const bx = bl[1].x, bz = bl[1].z;
            const dx = bx - ax, dz = bz - az;
            const lenSq = dx * dx + dz * dz;
            if (lenSq < 1e-10) continue;

            const t = Math.max(0, Math.min(1, ((worldX - ax) * dx + (worldZ - az) * dz) / lenSq));
            const cx = ax + t * dx, cz = az + t * dz;
            const dist = Math.hypot(worldX - cx, worldZ - cz);

            if (dist < bestDist) {
                bestDist = dist;
                bestWall = wall;
                // Outward normal — perpendicular to baseLine on the side facing
                // the cursor (room side).
                const len = Math.sqrt(lenSq);
                const nx =  dz / len;
                const nz = -dx / len;
                const dot = (worldX - cx) * nx + (worldZ - cz) * nz;
                bestNormal = dot >= 0 ? { x: nx, z: nz } : { x: -nx, z: -nz };
            }
        }

        if (!bestWall) return null;

        const bl = bestWall.baseLine;
        const wx = bl[1].x - bl[0].x;
        const wz = bl[1].z - bl[0].z;
        const wlen = Math.hypot(wx, wz) || 1;
        const tangent = { x: wx / wlen, z: wz / wlen };

        // Screen-space angle of the wall tangent (used for cross-checks).
        const o = c.planCanvas.worldToScreen(0, 0);
        const t = c.planCanvas.worldToScreen(wx, wz);
        const angle = Math.atan2(t.sy - o.sy, t.sx - o.sx);

        return { angle, tangent, normal: bestNormal };
    }

    /**
     * Draws a simplified 2D AEC plan symbol for the fixture type.
     * All coordinates are in screen pixels relative to (sx, sy) centre.
     */
    private _drawSymbol(
        ctx: CanvasRenderingContext2D,
        sx: number, sy: number,
        hw: number, hl: number,
        type: PlumbingFixtureType,
    ): void {
        ctx.save();
        ctx.translate(sx, sy);

        switch (type) {
            case 'toilet': {
                // Tank rectangle at back, bowl oval at front
                const tankH = hl * 0.40;
                ctx.strokeRect(-hw * 0.8, -hl, hw * 1.6, tankH);
                // Bowl oval
                ctx.beginPath();
                ctx.ellipse(0, hl * 0.10, hw * 0.70, hl * 0.55, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'sink': {
                // Round basin
                ctx.beginPath();
                ctx.ellipse(0, 0, hw * 0.72, hl * 0.72, 0, 0, Math.PI * 2);
                ctx.stroke();
                // Drain dot
                ctx.beginPath();
                ctx.arc(0, 0, Math.min(hw, hl) * 0.15, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'urinal': {
                // U-shape
                ctx.beginPath();
                ctx.moveTo(-hw * 0.7, -hl * 0.7);
                ctx.lineTo(-hw * 0.7,  hl * 0.5);
                ctx.arc(0, hl * 0.5, hw * 0.7, Math.PI, 0);
                ctx.lineTo( hw * 0.7, -hl * 0.7);
                ctx.stroke();
                break;
            }
            case 'bidet': {
                // Oval with open top
                ctx.beginPath();
                ctx.ellipse(0, hl * 0.1, hw * 0.65, hl * 0.55, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-hw * 0.5, -hl * 0.7);
                ctx.lineTo( hw * 0.5, -hl * 0.7);
                ctx.stroke();
                break;
            }
            case 'bath': {
                // Rectangle with inner offset and drain circle
                ctx.strokeRect(-hw * 0.85, -hl * 0.85, hw * 1.70, hl * 1.70);
                ctx.beginPath();
                ctx.arc(0, hl * 0.55, Math.min(hw, hl) * 0.20, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'shower': {
                // Tray rectangle, diagonal cross to indicate shower drain.
                ctx.strokeRect(-hw * 0.9, -hl * 0.9, hw * 1.8, hl * 1.8);
                ctx.beginPath();
                ctx.moveTo(-hw * 0.9, -hl * 0.9);
                ctx.lineTo( hw * 0.9,  hl * 0.9);
                ctx.moveTo( hw * 0.9, -hl * 0.9);
                ctx.lineTo(-hw * 0.9,  hl * 0.9);
                ctx.stroke();
                // Centre drain dot
                ctx.beginPath();
                ctx.arc(0, 0, Math.min(hw, hl) * 0.12, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
        }

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
