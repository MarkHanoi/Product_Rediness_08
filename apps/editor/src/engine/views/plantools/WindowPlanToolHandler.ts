import type { WallData, WallStore } from '@pryzm/geometry-wall';
// §FEAT-HOSTED-ON-CURVED-WALL — arc-length parameterisation of the host wall
// centreline (C15 §2 generalised); straight walls are unaffected.
import { isArcHost, wallCentrelineLength, arcLengthAtPointXZ } from '@pryzm/geometry-wall';
// §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the two chokepoints this file
// must resolve through, and the ONLY legitimate source of a window's type or size:
//   getWindowToolConfig()      — WHICH window the architect chose (WindowTool reads it too)
//   resolveWindowDimensions()  — that window's REAL dimensions (serves the pre-creation
//                                case: pass {systemTypeId, windowType}, no width needed)
import { getWindowToolConfig, resolveWindowDimensions } from '@pryzm/geometry-window';
import { canvasHitToWorld3D } from '@pryzm/core-app-model';
// §P2.3 (IMPL-PLAN-2026-05-17): CreateWallOpeningCommand + window.commandManager bridge (P4.4).
// Window placement is now bus-only via WallOpeningLegacyAdapterHandler (plugins/wall).
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const PRYZM_PREVIEW_PURPLE = '#6600ff';
const PRYZM_PREVIEW_PURPLE_FILL = 'rgba(102,0,255,0.16)';

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
        // §FIX-DOOR-SLAB-HOST (L-56): PlanViewCanvas.hitTest resolves the id of the
        // nearest projected element of ANY type (walls, slabs, IFC edges…). Windows
        // host ONLY on walls (C15 — hosted elements anchor to a wall). Passing a raw
        // hitTest id straight through let a slab edge under the cursor become the
        // window's host → orphaned "Wall not found (wallId=slab_…)" opening. Accept
        // the hit only when it resolves to a wall in the wallStore; otherwise fall
        // back to the geometric nearest-WALL search (which iterates walls only), and
        // reject when no wall is in reach rather than hosting on a slab/floor.
        const rawHitId = c.planCanvas.hitTest(sx, sy, 16);
        const hitWallId = rawHitId && wallStore.getById(rawHitId) ? rawHitId : null;
        const wallId = hitWallId ?? (
            c.viewPlane.isVertical
                ? this._findNearestWallIdInVerticalView(pt, c, 2.0)
                : this._findNearestWallId(world3D.x, world3D.z, 1.5)
        );

        if (!wallId) {
            console.warn('[WindowPlanToolHandler] No wall found near cursor — click closer to a wall');
            return;
        }

        // §FIX-DOOR-SLAB-HOST (L-56): require a real wall host at commit. wallId is
        // wall-validated above, but guard defensively so an opening is never
        // dispatched against a non-wall id (C15 hosted-element invariant).
        const targetWall = wallStore.getById(wallId);
        if (!targetWall) {
            console.warn(`[WindowPlanToolHandler] Resolved host ${wallId} is not a wall — refusing to place a window on a non-wall element.`);
            return;
        }

        // §FEAT-HOSTED-ON-CURVED-WALL — the block that used to live here refused
        // curved hosts because the builder assumed a straight baseline. It no longer
        // does: the opening `offset` is an ARC LENGTH along the wall centreline and
        // the carve follows the arc radially (see WallArcParam +
        // CurvedWallOpeningBuilder). Only the disabled escape-hatch mode refuses.
        if ((targetWall as any).curve && !isArcHost(targetWall as any)) {
            console.warn('[WindowPlanToolHandler] Curved-wall hosting is disabled (__pryzmHostedOnCurvedWall = false).');
            return;
        }

        // ── §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) ────────────────────
        //
        // THIS BLOCK USED TO BE THE BUG. It read the window type off a `window.*`
        // global (P4) with its own fallback chain, and then INVENTED the dimensions:
        //
        //     const WINDOW_WIDTH = windowType === 'double' ? 2.4 : 1.2;   // ← literals
        //     width: WINDOW_WIDTH, height: 1.2, sillHeight: 1.0,          // ← literals
        //
        // Meanwhile `WindowTool` (3D) resolved the SAME window from its own defaults
        // and a DIFFERENT systemTypeId. So a window drawn in 3D was a TIMBER CASEMENT
        // and the "same" window drawn in plan was a SINGLE PANE — a different type,
        // therefore different column/row ratios (a mullion, or none), a different
        // frame finish, and a different plan symbol. THAT is the founder's "window
        // parity not correct", and it is C11's signature failure for the EIGHTH time
        // (L-239 / 240 / 243 / 246 / 251 / 255 / 260A): ONE ELEMENT, TWO CREATION
        // PATHS, AND THE PLAN PATH SILENTLY DROPS WHAT THE 3D PATH RESOLVES.
        //
        // THE CURE IS L-243's, APPLIED AGAIN — and it is deliberately NOT "teach the
        // plan tool to imitate the 3D tool", because that leaves two paths that must
        // be kept in step BY HAND, and they never are. Instead:
        //
        //   1. WHICH window did the architect choose?  → `getWindowToolConfig()`, the
        //      ONE chokepoint (WindowToolConfigStore), which `WindowTool` also reads.
        //      Both paths therefore agree on the TYPE by construction.
        //   2. What are that window's real dimensions? → `resolveWindowDimensions()`,
        //      the ONE resolver, which serves the PRE-CREATION case explicitly: pass
        //      `{ systemTypeId, windowType }` with no width, and it falls through to
        //      the TYPE's standard opening, then to DEFAULT_WINDOW_DIMENSIONS.
        //
        // Parity BY CONSTRUCTION, not by convention (C11 §3). NO LITERAL DIMENSION
        // MAY APPEAR IN THIS FILE — if you find yourself typing a number here, you
        // are re-introducing the bug at a new site.
        const _toolCfg     = getWindowToolConfig();
        const windowType   = _toolCfg.windowType;
        const systemTypeId = _toolCfg.systemTypeId;
        const _dims        = resolveWindowDimensions({ systemTypeId, windowType });
        const WINDOW_WIDTH = _dims.width;

        console.log(`[WindowPlanToolHandler] §MAT systemTypeId=${systemTypeId} (resolved via WindowToolConfigStore — the same chokepoint WindowTool reads)`);

        const offset = c.viewPlane.isVertical
            ? this._computeWallOffsetInVerticalView(pt.worldX, wallId, WINDOW_WIDTH, c, wallStore)
            : this._computeWallOffset(world3D.x, world3D.z, wallId, WINDOW_WIDTH, wallStore);

        console.log(`[WindowPlanToolHandler] Window placement — wallId=${wallId} type=${windowType} width=${WINDOW_WIDTH.toFixed(3)}m height=${_dims.height.toFixed(3)}m sill=${_dims.sillHeight.toFixed(3)}m offset=${offset.toFixed(3)}m (all RESOLVED — no literals)`);

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
            height:       _dims.height,      // §L-266 was a literal 1.2 — now resolved from the TYPE
            sillHeight:   _dims.sillHeight,  // §L-266 was a literal 1.0 — now resolved from the TYPE
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

        // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — THE PREVIEW MUST RESOLVE
        // FROM THE SAME CHOKEPOINT AS THE COMMIT, OR IT LIES TO THE USER.
        //
        // This block used to re-derive the geometry from its OWN literals (2.4 / 1.2 /
        // 1.0), independently of both the commit path AND the 3D tool — a THIRD source
        // of truth for one window. "Preview ≠ build" is a defect this project has
        // already paid for; the dashed rectangle must be the window the click produces.
        // Same two calls as the commit path, in the same order. NO LITERALS.
        const _cfg         = getWindowToolConfig();
        const windowType   = _cfg.windowType;
        const _pdims       = resolveWindowDimensions({ systemTypeId: _cfg.systemTypeId, windowType });
        const winWidthPx   = _pdims.width * ppu;
        const wallThickPx  = Math.max(4, 0.2 * ppu);
        const hw = winWidthPx / 2;

        if (c.viewPlane.isVertical) {
            const sillPx = _pdims.sillHeight * ppu;
            const heightPx = _pdims.height * ppu;
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

    // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): returns the LEFT EDGE of the opening
    // span [offset, offset+width] (the convention used by occupancy + C15 §2 voidStart).
    // The click projects to the opening CENTRE, so subtract width/2 and clamp the SPAN
    // inside [0, wallLen]. (Previously returned the centre, which the geometry builders
    // then mis-rendered against every left-edge producer.)
    private _computeWallOffset(worldX: number, worldZ: number, wallId: string, openingWidth: number, ws: WallStore): number {
        const wall = ws.getById(wallId) as WallData | undefined;
        if (!wall?.baseLine || wall.baseLine.length < 2) return 0;

        // §FEAT-HOSTED-ON-CURVED-WALL — measure along the wall CENTRELINE: the ARC
        // for a curved host, the chord for a straight one. `arcLengthAtPointXZ`
        // reduces to the old dot-product projection when the wall is straight, so
        // straight-wall placement is bit-for-bit unchanged.
        const wallLen = wallCentrelineLength(wall);
        if (wallLen < 0.001) return 0;

        const rawCentre = arcLengthAtPointXZ(wall, worldX, worldZ).s;
        const left = rawCentre - openingWidth / 2;
        return Math.max(0, Math.min(wallLen - openingWidth, left));
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

    // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): returns the LEFT EDGE of the opening
    // span — see _computeWallOffset. Centre (t·wallLen) → left edge − width/2, span clamped.
    private _computeWallOffsetInVerticalView(worldH: number, wallId: string, openingWidth: number, c: PlanToolDrawContext, ws: WallStore): number {
        const wall = ws.getById(wallId) as WallData | undefined;
        if (!wall?.baseLine || wall.baseLine.length < 2) return 0;

        const a = wall.baseLine[0];
        const b = wall.baseLine[1];
        // §FEAT-HOSTED-ON-CURVED-WALL — `wallLen` is the CENTRELINE length (arc for a
        // curved host). An elevation/section view shows the wall UNROLLED along its
        // centreline, so the normalised horizontal parameter `t` maps to arc length.
        const wallLen = wallCentrelineLength(wall);
        if (wallLen < 0.001) return 0;

        const aH = c.viewPlane.hWorldAxis === 'x' ? a.x : a.z;
        const bH = c.viewPlane.hWorldAxis === 'x' ? b.x : b.z;
        const dH = bH - aH;
        const t = Math.abs(dH) > 1e-6 ? Math.max(0, Math.min(1, (worldH - aH) / dH)) : 0.5;
        const left = t * wallLen - openingWidth / 2;
        return Math.max(0, Math.min(wallLen - openingWidth, left));
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
