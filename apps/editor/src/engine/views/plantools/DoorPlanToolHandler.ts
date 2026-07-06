import type { WallData, WallStore } from '@pryzm/geometry-wall';
import { canvasHitToWorld3D } from '@pryzm/core-app-model';
// §P2.3 (IMPL-PLAN-2026-05-17): CreateWallOpeningCommand + window.commandManager bridge (P4.4).
// Door placement is now bus-only via WallOpeningLegacyAdapterHandler (plugins/wall).
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
// §FEAT-DOOR-FLIP-ON-SPACE (L-92, ADR-0107) — shared SPACE-to-flip state so
// plan-view door placement matches 3D-view (DoorTool). The plan handler drives
// it via the overlay-routed `onKeyDown` (it must NOT attach its own DOM listener —
// PlanToolHandler contract §21 §2), so it constructs the state but does NOT call
// attach(); it advances on the SPACE key inside onKeyDown().
import { DoorPlacementFlip } from '@pryzm/core-app-model';
// §FIX-DOOR-PREVIEW-EXACT (L-127) — the SINGLE SOURCE OF TRUTH for door
// dimensions. Both the preview (`_drawDoorPreview`) and the placement (`onClick`)
// resolve the SELECTED door type's real width/height/frame/leaf here so the
// preview is dimensionally identical to the placed door — never a default 1 m box.
import { resolveDoorDimensions } from '@pryzm/geometry-door';

const PRYZM_PREVIEW_PURPLE = '#6600ff';
const PRYZM_PREVIEW_PURPLE_FILL = 'rgba(102,0,255,0.16)';

export class DoorPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _doorCursorPoint: WorldPoint | null = null;

    // §FEAT-DOOR-FLIP-ON-SPACE — cyclic swing(in/out) × hinge(left/right) flip.
    // Advanced from onKeyDown (overlay-routed SPACE), read on commit into the
    // opening payload and in the swing-arc preview so preview ≡ placed door.
    private readonly _flip = new DoorPlacementFlip();

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._doorCursorPoint = null;
        this._flip.reset(); // §FEAT-DOOR-FLIP-ON-SPACE — fresh session starts at In · Left
    }

    deactivate(): void {
        this._clearOverlay();
        this._doorCursorPoint = null;
        this._flip.reset(); // §FEAT-DOOR-FLIP-ON-SPACE
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._doorCursorPoint = pt;
        this._drawDoorPreview();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        // §FEAT-DOOR-FLIP-ON-SPACE — SPACE advances the door flip (swing in/out ×
        // hinge left/right, 4 states) and re-draws the swing-arc preview at the new
        // configuration. Returning true tells PlanViewToolOverlay._onKeyDown to
        // preventDefault/stopProp so the page never scrolls and no other SPACE
        // shortcut fires.
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
            this._flip.advance();
            this._drawDoorPreview();
            return true;
        }
        return false;
    }

    onClick(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        // §DOOR-AUDIT-2026 (DI cleanup): pull wallStore from injected context.
        // commandManager removed E.5.6 — door placement dispatches via runtime bus.
        const wallStore = c.wallStore;
        if (!wallStore) {
            console.warn('[DoorPlanToolHandler] wallStore not present in PlanToolDrawContext');
            return;
        }

        const world3D = canvasHitToWorld3D(pt, c.viewPlane);
        const { sx, sy } = c.planCanvas.worldToScreen(pt.worldX, pt.worldZ);
        // §FIX-DOOR-SLAB-HOST (L-56): PlanViewCanvas.hitTest resolves the id of the
        // nearest projected element of ANY type (walls, slabs, IFC edges…). Doors
        // host ONLY on walls (C15 — hosted elements anchor to a wall). Passing a raw
        // hitTest id straight through let a slab edge under the cursor become the
        // door's host → `[DoorBuilder] Wall not found (wallId=slab_…)` orphan. Accept
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
            console.warn('[DoorPlanToolHandler] No wall found near cursor — click closer to a wall');
            return;
        }

        // §FIX-DOOR-SLAB-HOST (L-56): require a real wall host at commit. wallId is
        // wall-validated above, but guard defensively so an opening is never
        // dispatched against a non-wall id (C15 hosted-element invariant).
        const targetWall = wallStore.getById(wallId);
        if (!targetWall) {
            console.warn(`[DoorPlanToolHandler] Resolved host ${wallId} is not a wall — refusing to place a door on a non-wall element.`);
            return;
        }

        // §DOOR-AUDIT-2026 (DOOR-CURVED-WALL-BLOCK): refuse curved walls — the door
        // builder geometry assumes a straight baseline; placing a door on a curved
        // wall would silently break the cut/fragment alignment.
        if ((targetWall as any).curve) {
            console.warn('[DoorPlanToolHandler] Curved walls are not supported for door placement.');
            return;
        }

        // §DOOR-AUDIT-2026 (FK-VALIDATE): door type + system type read from the
        // injected active opening tool. Fall back to defaults rather than crashing
        // when the tool object is absent (e.g. plan tool used without 3D pre-arm).
        const ot           = c.activeOpeningTool ?? {};
        const doorType     = (ot.doorType ?? 'single') as 'single' | 'double';
        // §MAT-WINDOW-PLAN-PARITY (2026-05-23) — read the DOOR tool's live systemTypeId
        // directly. Now that window.windowTool is exposed, `activeOpeningTool` resolves
        // via `window.windowTool ?? window.doorTool` (window FIRST), so reading
        // ot.systemTypeId for a door would surface a WINDOW type id. Bind to the door
        // tool here so a plan-placed door keeps its own type/material; the existing
        // 'dt-solid-timber' default still guarantees a valid door type.
        const systemTypeId =
            (window.doorTool as { systemTypeId?: string } | undefined)?.systemTypeId
            ?? 'dt-solid-timber';

        // §FIX-DOOR-PREVIEW-EXACT (L-127) — resolve the SELECTED type's REAL dims via
        // the shared single source of truth (identical to the preview + placed door).
        const dims       = resolveDoorDimensions(systemTypeId, doorType);
        const DOOR_WIDTH = dims.width;

        const offset = c.viewPlane.isVertical
            ? this._computeWallOffsetInVerticalView(pt.worldX, wallId, DOOR_WIDTH, c, wallStore)
            : this._computeWallOffset(world3D.x, world3D.z, wallId, DOOR_WIDTH, wallStore);

        console.log(`[DoorPlanToolHandler] Door placement — wallId=${wallId} type=${doorType} systemTypeId=${systemTypeId} width=${DOOR_WIDTH.toFixed(3)}m height=${dims.height.toFixed(3)}m offset=${offset.toFixed(3)}m`);

        // §P2.3 (IMPL-PLAN-2026-05-17): bus-only dispatch — single pipeline path.
        // WallOpeningLegacyAdapterHandler (plugins/wall) handles wall.opening.create:
        //   → PRYZM3 Immer store write (if wall in PRYZM3 store)
        //   → CommandEventBridge emits wall.opening.created
        //   → initTools.ts bridge calls legacyWallStore.addOpening() → mesh rebuild.
        // id + elementId are pre-generated here so PRYZM3 store and legacy store share
        // the same stable IDs (avoids mismatch on undo replay).
        const _openingId  = crypto.randomUUID();
        const _elementId  = crypto.randomUUID();
        // §FEAT-DOOR-FLIP-ON-SPACE (L-92): carry the SPACE-chosen swing/hand through
        // to the committed door (P6 — configuration flows through the command, not a
        // post-hoc store write). The initTools.ts wall.opening.created bridge threads
        // these into doorStore.add() so DoorPlanSymbolBuilder draws the arc + leaf at
        // the previewed configuration.
        const _openingData = {
            id:           _openingId,
            elementId:    _elementId,
            type:         'door',
            offset,
            width:        DOOR_WIDTH,
            // §FIX-DOOR-PREVIEW-EXACT (L-127) — exact selected-type dims (was 2.1).
            height:       dims.height,
            sillHeight:   0,
            // Carry the resolved frame/leaf dims so the persisted door record and
            // its plan symbol reflect the selected type, not the schema defaults.
            frameThickness: dims.frameThickness,
            frameDepth:     dims.frameDepth,
            leafThickness:  dims.leafThickness,
            doorType,
            systemTypeId,
            hingesSide:     this._flip.hingesSide(),
            swingDirection: this._flip.swingDirection(),
        } as const;

        // §P4.1: ctx.runtime is now typed — no unsafe (window as any) cast needed.
        const _runtime = c.runtime ?? window.runtime;
        _runtime?.bus?.executeCommand('wall.opening.create', { wallId, openingData: _openingData })
            ?.catch((e: unknown) => console.error('[DoorPlanToolHandler] wall.opening.create bus failed:', e));

        this._doorCursorPoint = null;
        this._clearOverlay();
    }

    cancel(): void {
        this._doorCursorPoint = null;
        this._flip.reset(); // §FEAT-DOOR-FLIP-ON-SPACE — Esc resets the flip config
        this._clearOverlay();
    }

    redraw(): void {
        if (this._doorCursorPoint) this._drawDoorPreview();
    }

    private _drawDoorPreview(): void {
        const c = this._ctx;
        if (!c || !this._doorCursorPoint) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);

        const ppu  = planCanvas.getPixelsPerUnit();
        const { sx, sy } = planCanvas.worldToScreen(this._doorCursorPoint.worldX, this._doorCursorPoint.worldZ);
        const angle = this._getNearestWallScreenAngle(this._doorCursorPoint.worldX, this._doorCursorPoint.worldZ, c);

        // §DOOR-AUDIT-2026 (DI cleanup): doorType from injected activeOpeningTool.
        const doorType  = (c.activeOpeningTool?.doorType ?? 'single') as 'single' | 'double';
        // §FIX-DOOR-PREVIEW-EXACT (L-127) — dimension the preview from the SELECTED
        // door type via the shared resolver (identical to what onClick places), so
        // the preview footprint / swing arc / frame equal the placed door exactly.
        const systemTypeId =
            (window.doorTool as { systemTypeId?: string } | undefined)?.systemTypeId
            ?? 'dt-solid-timber';
        const dims = resolveDoorDimensions(systemTypeId, doorType);
        const totalWidthPx = dims.width * ppu;
        const halfPx = totalWidthPx / 2;
        // Frame member face width (px) — used to inset the leaf hinge so the swing
        // arc matches DoorPlanSymbolBuilder (hinge at the inner frame corner).
        const frameThickPx = dims.frameThickness * ppu;

        if (c.viewPlane.isVertical) {
            const heightPx = dims.height * ppu;
            const panelBottom = 0;
            const panelTop = -heightPx;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = PRYZM_PREVIEW_PURPLE;
            ctx.fillStyle = PRYZM_PREVIEW_PURPLE_FILL;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(-halfPx, panelTop, totalWidthPx, heightPx);
            ctx.fill();
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            if (doorType === 'double') {
                ctx.moveTo(0, panelTop);
                ctx.lineTo(0, panelBottom);
                ctx.moveTo(-halfPx * 0.45, panelTop + heightPx * 0.52);
                ctx.lineTo(halfPx * 0.45, panelTop + heightPx * 0.52);
            } else {
                const handleX = halfPx * 0.68;
                const handleY = panelTop + heightPx * 0.52;
                ctx.moveTo(handleX - 3, handleY);
                ctx.lineTo(handleX + 3, handleY);
            }
            ctx.stroke();
            ctx.restore();

            this._drawCursorMarker(sx, sy);
            return;
        }

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.strokeStyle = PRYZM_PREVIEW_PURPLE;
        ctx.lineWidth   = 1.5;

        // §FIX-DOOR-FRAME (L-127) — draw the framed OPENING so the preview reads as
        // a framed reveal exactly like the placed plan symbol (DoorPlanSymbolBuilder),
        // never an open gap. Wall-aligned local frame: X = along wall, Y = across the
        // wall thickness. Two frame face lines (parallel to the wall) close the reveal;
        // two jamb ticks (across the wall) sit on the void edges (±halfWidth).
        const halfThkPx = (this._getNearestWallThickness(this._doorCursorPoint.worldX, this._doorCursorPoint.worldZ, c) / 2) * ppu;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-halfPx, -halfThkPx); ctx.lineTo(halfPx, -halfThkPx); // outer frame face
        ctx.moveTo(-halfPx,  halfThkPx); ctx.lineTo(halfPx,  halfThkPx); // inner frame face
        ctx.moveTo(-halfPx, -halfThkPx); ctx.lineTo(-halfPx, halfThkPx); // left jamb
        ctx.moveTo( halfPx, -halfThkPx); ctx.lineTo( halfPx, halfThkPx); // right jamb
        ctx.stroke();

        // §FEAT-DOOR-FLIP-ON-SPACE (L-92) — the swing arc + leaf now reflect the
        // live 4-state flip: swing INWARD (+y in this wall-aligned frame, the
        // historical §C19-P15 default) vs OUTWARD (−y), and hinge LEFT (−halfPx)
        // vs RIGHT (+halfPx). This matches DoorPlanSymbolBuilder's swingDir /
        // hingesSide math (arc = hinge + r·(cos t·panelDir + sin t·swingDir),
        // t∈[0,π/2]) so the preview reads identically to the placed symbol.
        const swingSign = this._flip.swingDirection() === 'outward' ? -1 : 1;

        // Draw one leaf: dashed quarter-circle swing arc + solid open-position line.
        const drawLeaf = (
            hx: number, hy: number,
            panelDX: number, panelDY: number,
            swingDX: number, swingDY: number,
            radius: number,
        ): void => {
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            const SEG = 24;
            for (let i = 0; i <= SEG; i++) {
                const t = (i / SEG) * (Math.PI / 2);
                const cs = Math.cos(t), sn = Math.sin(t);
                const px = hx + (cs * panelDX + sn * swingDX) * radius;
                const py = hy + (cs * panelDY + sn * swingDY) * radius;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            // Open-position leaf line (hinge → fully-open tip, perpendicular to wall).
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + swingDX * radius, hy + swingDY * radius);
            ctx.stroke();
        };

        // §FIX-DOOR-PREVIEW-EXACT (L-127) — the swing leaf hinges at the INNER FRAME
        // CORNER (inset from the void edge by the frame member) and its radius is the
        // CLEAR leaf length, EXACTLY as DoorPlanSymbolBuilder computes them
        // (single: hinge = ±(halfWidth − frameThick), radius = width − 2·frameThick;
        //  double: hinge = ±(halfWidth − frameThick), radius = (width − 2·frameThick)/2).
        // Consuming `frameThickPx` here is what makes the previewed arc land on the
        // same corner + sweep the same radius as the placed plan symbol.
        const clearHalfPx = Math.max(1, halfPx - frameThickPx);
        if (doorType === 'double') {
            // Two symmetric leaves — each hinged at its inner jamb corner, panels
            // toward the centre, both swinging to swingSign. (Hinge side does not
            // apply to a double door; SPACE flips only the swing side.)
            const leafLenPx = Math.max(2, (totalWidthPx - 2 * frameThickPx) / 2);
            drawLeaf(-clearHalfPx, 0, +1, 0, 0, swingSign, leafLenPx);
            drawLeaf(+clearHalfPx, 0, -1, 0, 0, swingSign, leafLenPx);
        } else {
            // Single leaf — hinge at LEFT (−clearHalfPx, panel toward +x) or RIGHT
            // (+clearHalfPx, panel toward −x). Radius = clear leaf length.
            const hingeLeft = this._flip.hingesSide() !== 'right';
            const leafLenPx = Math.max(2, totalWidthPx - 2 * frameThickPx);
            const hx        = hingeLeft ? -clearHalfPx : +clearHalfPx;
            const panelSign = hingeLeft ? +1 : -1;
            drawLeaf(hx, 0, panelSign, 0, 0, swingSign, leafLenPx);
        }
        ctx.restore();

        this._drawCursorMarker(sx, sy);

        // §FEAT-DOOR-FLIP-ON-SPACE — surface the SPACE-to-flip affordance + the
        // live configuration (upright, bottom-left), mirroring the furniture HUD.
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font         = '11px sans-serif';
        ctx.fillStyle    = 'rgba(30,58,138,0.85)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        const cssH = overlayCanvas.height / dpr;
        ctx.fillText(
            `Click to place · Space to flip (${this._flip.label()}) · Esc to cancel`,
            12, cssH - 12,
        );
        ctx.restore();
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

        const ax = wall.baseLine[0].x, az = wall.baseLine[0].z;
        const bx = wall.baseLine[1].x, bz = wall.baseLine[1].z;
        const dx = bx - ax, dz = bz - az;
        const wallLen = Math.hypot(dx, dz);
        if (wallLen < 0.001) return 0;

        const rawCentre = ((worldX - ax) * dx + (worldZ - az) * dz) / wallLen;
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
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const wallLen = Math.hypot(dx, dz);
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

    /**
     * §FIX-DOOR-FRAME (L-127) — thickness (metres) of the wall nearest the cursor.
     *
     * The framed-reveal preview (`_drawDoorPreview`) draws its two frame face lines
     * at ±(thickness/2) across the wall, exactly matching where DoorPlanSymbolBuilder
     * lays the placed door's frame faces (it reads `wallData.thickness`). Resolving the
     * SAME host wall's thickness here — via the identical nearest-wall search used for
     * the preview angle — keeps preview ≡ placed symbol. Falls back to the canonical
     * 0.2 m default (the same floor DoorPlanSymbolBuilder clamps to) when no wall is in
     * reach, so the preview frame never collapses to a zero-depth line.
     */
    private _getNearestWallThickness(worldX: number, worldZ: number, c: PlanToolDrawContext): number {
        const wallStore = c.wallStore;
        if (!wallStore?.getAll) return 0.2;

        const levelId = c.viewDef.spatial?.levelId;
        const SNAP_R  = 2.0;

        let bestWall: WallData | null = null;
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

        // §FIX-DOOR-FRAME — mirror DoorPlanSymbolBuilder's `Math.max(0.05, thickness ?? 0.2)`.
        return bestWall ? Math.max(0.05, Number(bestWall.thickness ?? 0.2)) : 0.2;
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
