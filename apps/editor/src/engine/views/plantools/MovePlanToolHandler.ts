/**
 * MovePlanToolHandler — Contract 34 / Contract 21
 *
 * Revit-style two-click MOVE operation for the 2D plan, elevation, and section
 * views. Works on any selected BIM element.
 *
 * Workflow:
 *   1. Tool activates (via 'MV' shortcut or Move button).
 *   2. State: AWAITING_FIRST — user clicks the origin (reference) point.
 *   3. State: AWAITING_SECOND — user clicks the destination point.
 *   4. Delta = (dest − origin) is applied to the element and committed via
 *      the appropriate command. Tool resets to AWAITING_FIRST so the user
 *      can immediately move again or press Escape to exit.
 *
 * Hosted elements (doors/windows): delta is projected onto the host wall
 *   direction; the offset is clamped to keep the opening inside the wall.
 *
 * All other elements: free XZ translation.
 *
 * Architecture rules (Contract 21 §4):
 *   - All commands fired via commandManager
 *   - Store access via window.*Store
 *   - No direct DOM event listeners — all events routed by coordinator
 *   - No imports from PlanViewToolOverlay
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
// [F-1.2] R2/R3 dual-write — commandManager is authoritative for WallRebuildCoordinator.

const GRID_SNAP_M = 0.05; // 50 mm grid snap

function snap(v: number): number {
    return Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;
}

function formatDist(m: number): string {
    if (Math.abs(m) < 0.01) return `${Math.round(m * 1000)} mm`;
    return `${m.toFixed(3)} m`;
}

type MovePhase = 'awaiting-first' | 'awaiting-second';

export class MovePlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _phase: MovePhase = 'awaiting-first';
    private _firstPt: WorldPoint | null = null;
    private _cursorPt: WorldPoint | null = null;

    /** ID + type of the element being moved. Re-read from selectionManager on activate. */
    private _targetId: string | null = null;
    private _targetType: string | null = null;

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx       = ctx;
        this._phase     = 'awaiting-first';
        this._firstPt   = null;
        this._cursorPt  = null;
        this._readSelection();
        this.redraw();
        console.log('[MoveTool] Activated — target:', this._targetId, this._targetType);
    }

    deactivate(): void {
        this._clearOverlay();
        this._ctx        = null;
        this._phase      = 'awaiting-first';
        this._firstPt    = null;
        this._cursorPt   = null;
        this._targetId   = null;
        this._targetType = null;
    }

    cancel(): void {
        this._phase    = 'awaiting-first';
        this._firstPt  = null;
        this.redraw();
        console.log('[MoveTool] Cancelled — reset to awaiting first point');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        this.redraw();
    }

    onClick(pt: WorldPoint): void {
        // Try to pick up selection if we don't have a target yet
        if (!this._targetId) this._readSelection();
        if (!this._targetId) {
            console.warn('[MoveTool] onClick: no element selected');
            return;
        }

        if (this._phase === 'awaiting-first') {
            this._firstPt = pt;
            this._phase   = 'awaiting-second';
            this.redraw();
            console.log('[MoveTool] Origin set:', pt.worldX.toFixed(3), pt.worldZ.toFixed(3));
        } else if (this._phase === 'awaiting-second' && this._firstPt) {
            const dx = snap(pt.worldX - this._firstPt.worldX);
            const dz = snap(pt.worldZ - this._firstPt.worldZ);
            console.log('[MoveTool] Destination set — delta:', dx.toFixed(3), dz.toFixed(3));
            this._commitMove(dx, dz);

            // Reset so user can move again immediately, or let the coordinator
            // deactivate when tool changes back to 'none'
            this._phase   = 'awaiting-first';
            this._firstPt = null;
            this.redraw();

            // Return to select mode after commit (UX: like Revit exits move after one operation)
            const tm = window.toolManager;
            if (tm?.setActiveTool) {
                setTimeout(() => tm.setActiveTool('none'), 0);
            }
        }
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            this.cancel();
            return true;
        }
        return false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overlay rendering
    // ──────────────────────────────────────────────────────────────────────────

    redraw(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const cursor = this._cursorPt;
        if (!cursor) return;

        const curSc = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);

        if (this._phase === 'awaiting-first') {
            this._drawCrosshair(ctx, curSc.sx, curSc.sy, '#1E90FF');
            this._drawHUDLabel(ctx, curSc.sx + 16, curSc.sy - 10, 'Pick origin point', '#1E90FF');
            if (this._targetId) {
                this._drawElementLabel(ctx, curSc.sx, curSc.sy);
            }
        } else if (this._phase === 'awaiting-second' && this._firstPt) {
            const origSc = planCanvas.worldToScreen(this._firstPt.worldX, this._firstPt.worldZ);

            // Origin marker (filled blue circle)
            ctx.beginPath();
            ctx.arc(origSc.sx, origSc.sy, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#1E90FF';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(origSc.sx, origSc.sy, 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Rubber-band dashed line
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(origSc.sx, origSc.sy);
            ctx.lineTo(curSc.sx, curSc.sy);
            ctx.strokeStyle = 'rgba(30, 144, 255, 0.85)';
            ctx.lineWidth   = 2;
            ctx.setLineDash([8, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // Distance label on the line midpoint
            const dx = snap(cursor.worldX - this._firstPt.worldX);
            const dz = snap(cursor.worldZ - this._firstPt.worldZ);
            const dist = Math.hypot(dx, dz);
            if (dist > 0.005) {
                const midSx = (origSc.sx + curSc.sx) / 2;
                const midSy = (origSc.sy + curSc.sy) / 2;
                this._drawBubbleLabel(ctx, midSx, midSy - 14, formatDist(dist), '#1E90FF');
                // Delta coords
                const deltaStr = `Δx ${formatDist(dx)}  Δz ${formatDist(dz)}`;
                this._drawBubbleLabel(ctx, midSx, midSy + 14, deltaStr, '#0A5DCC');
            }

            // Cursor crosshair + instruction
            this._drawCrosshair(ctx, curSc.sx, curSc.sy, '#1E90FF');
            this._drawHUDLabel(ctx, curSc.sx + 16, curSc.sy - 10, 'Pick destination point', '#1E90FF');

            // Ghost element preview at destination
            this._drawGhostAt(ctx, planCanvas, cursor, dx, dz);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Move commit — dispatches element-type-specific command
    // ──────────────────────────────────────────────────────────────────────────

    private _commitMove(dx: number, dz: number): void {
        if (Math.hypot(dx, dz) < 0.001) {
            console.log('[MoveTool] Delta too small — no-op');
            return;
        }
        const id   = this._targetId!;
        const type = this._targetType!;
        switch (type) {
            case 'wall':        this._moveWall(id, dx, dz);         break;
            case 'curtain-wall':
            case 'curtainwall': this._moveCurtainWall(id, dx, dz);  break;
            case 'door':        this._moveHosted(id, 'door',   dx, dz); break;
            case 'window':      this._moveHosted(id, 'window', dx, dz); break;
            case 'column':      this._moveColumn(id, dx, dz);       break;
            case 'slab':        this._moveSlab(id, dx, dz);         break;
            case 'floor':       this._moveFloor(id, dx, dz);        break;
            case 'ceiling':     this._moveCeiling(id, dx, dz);      break;
            case 'beam':        this._moveBeam(id, dx, dz);         break;
            case 'furniture':   this._moveFurniture(id, dx, dz);    break;
            case 'room':        this._moveRoom(id, dx, dz);         break;
            case 'roof':        this._moveRoof(id, dx, dz);         break;
            default:
                console.warn('[MoveTool] No move implementation for element type:', type);
                break;
        }
    }

    // ── Wall ─────────────────────────────────────────────────────────────────

    private async _moveWall(id: string, dx: number, dz: number): Promise<void> {
        if (!(window as any).__pryzmInitComplete) {
            console.warn('[MoveTool] Engine not yet initialised — wall move ignored (TASK-10 Tier-2 guard)');
            return;
        }
        const ws = window.wallStore; // TODO(TASK-08)
        if (!ws) { console.warn('[MoveTool] No wallStore'); return; }
        const wall = ws.getById(id);
        if (!wall) { console.warn('[MoveTool] Wall not found:', id); return; }

        type Pt = { x: number; y: number; z: number };
        const prev = wall.baseLine as [Pt, Pt];
        const next: [Pt, Pt] = [
            { x: prev[0].x + dx, y: prev[0].y, z: prev[0].z + dz },
            { x: prev[1].x + dx, y: prev[1].y, z: prev[1].z + dz },
        ];

        // §WALL-MOVE-CARRY-NEIGHBOURS (Apr 2026)
        //
        // Why we cascade neighbour endpoints with the move:
        //   WallJoinResolver detects corner joins whenever two wall endpoints
        //   sit within DEFAULT_SNAP_RADIUS (0.5 m) of each other. If the user
        //   translates a corner-joined wall by less than 0.5 m perpendicular
        //   to its neighbour, the resolver re-detects that pair as a corner on
        //   the next flush and snaps the moved wall's endpoint back to the
        //   intersection with the unmoved neighbour — visually "reverting" the
        //   move. Even for moves > 0.5 m, the wall is left dangling with a
        //   visible gap at the old corner because the neighbour did not follow.
        //
        // Revit-style fix: when the user grabs a whole wall and moves it, any
        // neighbouring wall that shared an endpoint with it (within snap radius
        // of EITHER pre-move endpoint) gets its matching endpoint translated by
        // the SAME delta, so the corner travels with the moved wall instead of
        // being torn apart. The neighbour stretches/shrinks; its far endpoint
        // stays put. Only endpoint-coincident neighbours follow — T-joined walls
        // (whose endpoint touches the moved wall's BODY, not its endpoint) stay
        // in place, which matches user expectations.
        //
        // The whole batch is dispatched as ONE CascadeWallBaselineCommand so
        // Ctrl-Z reverts the move + neighbour stretches in a single step.
        const SNAP_RADIUS = 0.5;
        const SNAP_RADIUS_SQ = SNAP_RADIUS * SNAP_RADIUS;

        type Entry = { wallId: string; newBaseLine: [Pt, Pt]; prevBaseLine: [Pt, Pt] };
        const entries: Entry[] = [{
            wallId:       id,
            newBaseLine:  next,
            prevBaseLine: [{ ...prev[0] }, { ...prev[1] }],
        }];

        const sameLevel: any[] =
            typeof ws.getByLevel === 'function'
                ? ws.getByLevel(wall.levelId)
                : (typeof ws.getAll === 'function' ? ws.getAll().filter((w: any) => w.levelId === wall.levelId) : []);

        const within = (ax: number, az: number, bx: number, bz: number): boolean => {
            const ddx = ax - bx, ddz = az - bz;
            return ddx * ddx + ddz * ddz <= SNAP_RADIUS_SQ;
        };

        for (const w of sameLevel) {
            if (!w || w.id === id) continue;
            const wbl = w.baseLine as [Pt, Pt] | undefined;
            if (!wbl || !wbl[0] || !wbl[1]) continue;

            // Determine which endpoint(s) of `w` coincide with which endpoint(s)
            // of the moved wall (in PRE-move space). A connected endpoint of `w`
            // gets translated by the same (dx, dz) as the moved wall.
            const carryStart =
                within(wbl[0].x, wbl[0].z, prev[0].x, prev[0].z) ||
                within(wbl[0].x, wbl[0].z, prev[1].x, prev[1].z);
            const carryEnd =
                within(wbl[1].x, wbl[1].z, prev[0].x, prev[0].z) ||
                within(wbl[1].x, wbl[1].z, prev[1].x, prev[1].z);

            if (!carryStart && !carryEnd) continue;

            const wNext: [Pt, Pt] = [
                carryStart ? { x: wbl[0].x + dx, y: wbl[0].y, z: wbl[0].z + dz } : { ...wbl[0] },
                carryEnd   ? { x: wbl[1].x + dx, y: wbl[1].y, z: wbl[1].z + dz } : { ...wbl[1] },
            ];

            // Skip degenerate stretches that would collapse the neighbour below
            // the resolver's MIN_WALL_LENGTH (Cascade.canExecute also guards
            // this with a 0.1 m floor — checking here lets us emit a clear log).
            const ndx = wNext[1].x - wNext[0].x;
            const ndz = wNext[1].z - wNext[0].z;
            const ndy = wNext[1].y - wNext[0].y;
            if (Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz) < 0.1) {
                console.warn(`[MoveTool] Skipping neighbour ${w.id} — carrying endpoint would collapse it (<0.1 m).`);
                continue;
            }

            entries.push({
                wallId:       w.id,
                newBaseLine:  wNext,
                prevBaseLine: [{ ...wbl[0] }, { ...wbl[1] }],
            });
        }

        if (entries.length === 1) {
            // [F-1.2 R2/R3 §E.5.x] BUS-PRIMARY — bus handler bridges to commandManager.
            // Direct window.commandManager call removed; bus fires UpdateWallBaselineHandler
            // which calls initBusHandlers bridge → commandManager.execute() (undo-stack entry).
            window.runtime?.bus?.executeCommand('wall.updateBaseline', {
                wallId:       id,
                newBaseLine:  next,
                prevBaseLine: prev,
            })?.catch((e: unknown) => console.error('[MoveTool] wall.updateBaseline failed:', e));
            console.log('[MoveTool] Wall moved:', id, `Δ(${dx.toFixed(3)}, ${dz.toFixed(3)})`);
        } else {
            // [F-1.2 R2/R3 §E.5.x] BUS-PRIMARY — bus handler bridges to commandManager.
            // CascadeWallBaselineHandler dispatches ONE undo-stack entry for the whole batch.
            window.runtime?.bus?.executeCommand('wall.cascadeBaseline', {
                entries,
                cause:       'wall-move-carry-neighbours',
            })?.catch((e: unknown) => console.error('[MoveTool] wall.cascadeBaseline failed:', e));
            console.log(
                '[MoveTool] Wall moved (with neighbours):',
                id,
                `Δ(${dx.toFixed(3)}, ${dz.toFixed(3)}) — ${entries.length - 1} neighbour endpoint(s) carried`,
            );
        }
    }

    // ── Curtain wall ──────────────────────────────────────────────────────────

    private async _moveCurtainWall(id: string, dx: number, dz: number): Promise<void> {
        const cs = window.curtainWallStore; // TODO(TASK-08)
        if (!cs) { console.warn('[MoveTool] No curtainWallStore'); return; }
        const cw = cs.getById?.(id) ?? cs.get?.(id);
        if (!cw) { console.warn('[MoveTool] CurtainWall not found:', id); return; }

        const prev = cw.baseLine as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
        const next: [typeof prev[0], typeof prev[1]] = [
            { x: prev[0].x + dx, y: prev[0].y, z: prev[0].z + dz },
            { x: prev[1].x + dx, y: prev[1].y, z: prev[1].z + dz },
        ];

        window.runtime?.bus?.executeCommand('wall.updateCurtainWall', { id, updates: { baseLine: next } })?.catch((e: unknown) => console.error('[MoveTool] wall.updateCurtainWall failed:', e));
        console.log('[MoveTool] CurtainWall moved:', id);
    }

    // ── Hosted elements (door / window) ───────────────────────────────────────

    private async _moveHosted(
        id: string, kind: 'door' | 'window',
        dx: number, dz: number,
    ): Promise<void> {
        const ws = window.wallStore; // TODO(TASK-08)
        if (!ws) { console.warn('[MoveTool] No wallStore for hosted element'); return; }

        const el   = kind === 'door' ? ws.getDoor(id) : ws.getWindow(id);
        if (!el)   { console.warn('[MoveTool] Hosted element not found:', id); return; }
        const wall = ws.getById(el.wallId);
        if (!wall) { console.warn('[MoveTool] Host wall not found:', el.wallId); return; }

        const a = wall.baseLine[0] as { x: number; y: number; z: number };
        const b = wall.baseLine[1] as { x: number; y: number; z: number };
        const wallLen = Math.hypot(b.x - a.x, b.z - a.z);

        // Project the desired delta onto the wall direction to maintain wall constraint
        const dirX = (b.x - a.x) / wallLen;
        const dirZ = (b.z - a.z) / wallLen;
        const deltaAlongWall = dx * dirX + dz * dirZ;

        const halfW  = (el.width ?? 0.9) / 2;
        const newOffset = Math.max(halfW, Math.min(el.offset + deltaAlongWall, wallLen - halfW));
        const prevOffset = el.offset;

        if (Math.abs(newOffset - prevOffset) < 0.001) {
            console.log('[MoveTool] Hosted element: delta projects to negligible movement along wall');
            return;
        }

        if (kind === 'door') {
            window.runtime?.bus?.executeCommand('door.setOffset', { doorId: id, newOffset, prevOffset })?.catch((e: unknown) => console.error('[MoveTool] door.setOffset failed:', e));
        } else {
            window.runtime?.bus?.executeCommand('window.setOffset', { windowId: id, newOffset, prevOffset })?.catch((e: unknown) => console.error('[MoveTool] window.setOffset failed:', e));
        }
        console.log('[MoveTool]', kind, 'moved — offset', prevOffset.toFixed(3), '→', newOffset.toFixed(3));
    }

    // ── Column ───────────────────────────────────────────────────────────────

    private async _moveColumn(id: string, dx: number, dz: number): Promise<void> {
        const cs = window.columnStore; // TODO(TASK-08)
        if (!cs) { console.warn('[MoveTool] No columnStore'); return; }
        const col = cs.get?.(id) ?? cs.getById?.(id);
        if (!col) { console.warn('[MoveTool] Column not found:', id); return; }

        const pos = col.position as { x: number; y: number; z: number };
        window.runtime?.bus?.executeCommand('column.update', { id, updates: { position: { x: pos.x + dx, y: pos.y, z: pos.z + dz } } })?.catch((e: unknown) => console.error('[MoveTool] column.update failed:', e));
        console.log('[MoveTool] Column moved:', id);
    }

    // ── Slab ─────────────────────────────────────────────────────────────────

    private async _moveSlab(id: string, dx: number, dz: number): Promise<void> {
        const ss = window.slabStore; // TODO(TASK-08)
        if (!ss) { console.warn('[MoveTool] No slabStore'); return; }
        const slab = ss.getById?.(id) ?? ss.get?.(id);
        if (!slab) { console.warn('[MoveTool] Slab not found:', id); return; }

        // Slab polygon uses {x, y} where y = world Z
        const poly = (slab.polygon as { x: number; y: number }[]);
        const newPoly = poly.map(pt => ({ x: pt.x + dx, y: pt.y + dz }));

        window.runtime?.bus?.executeCommand('slab.updatePolygon', { slabId: id, polygon: newPoly, holes: slab.holes })?.catch((e: unknown) => console.error('[MoveTool] slab.updatePolygon failed:', e));
        console.log('[MoveTool] Slab moved:', id);
    }

    // ── Floor ─────────────────────────────────────────────────────────────────

    private async _moveFloor(id: string, dx: number, dz: number): Promise<void> {
        const fs = window.floorStore; // TODO(TASK-08)
        if (!fs) { console.warn('[MoveTool] No floorStore'); return; }
        const floor = fs.getById?.(id) ?? fs.get?.(id);
        if (!floor) { console.warn('[MoveTool] Floor not found:', id); return; }

        const poly = (floor.boundary?.polygon ?? floor.polygon ?? floor.points ?? []) as { x: number; y?: number; z?: number }[];
        const newPoly = poly.map((pt: { x: number; y?: number; z?: number }) => ({ x: pt.x + dx, z: (pt.z ?? pt.y ?? 0) + dz }));
        window.runtime?.bus?.executeCommand('floor.update', { floorId: id, updates: { boundary: { ...floor.boundary, polygon: newPoly } } })?.catch((e: unknown) => console.error('[MoveTool] floor.update failed:', e));
        console.log('[MoveTool] Floor moved:', id);
    }

    // ── Ceiling ───────────────────────────────────────────────────────────────

    private async _moveCeiling(id: string, dx: number, dz: number): Promise<void> {
        const cs = window.ceilingStore; // TODO(TASK-08)
        if (!cs) { console.warn('[MoveTool] No ceilingStore'); return; }
        const ceiling = cs.getById?.(id) ?? cs.get?.(id);
        if (!ceiling) { console.warn('[MoveTool] Ceiling not found:', id); return; }

        const poly = (ceiling.boundary?.polygon ?? ceiling.polygon ?? ceiling.points ?? []) as { x: number; y?: number; z?: number }[];
        const newPoly = poly.map((pt: { x: number; y?: number; z?: number }) => ({ x: pt.x + dx, z: (pt.z ?? pt.y ?? 0) + dz }));

        window.runtime?.bus?.executeCommand('ceiling.update', { ceilingId: id, updates: { boundary: { ...ceiling.boundary, polygon: newPoly } } })?.catch((e: unknown) => console.error('[MoveTool] ceiling.update failed:', e));
        console.log('[MoveTool] Ceiling moved:', id);
    }

    // ── Beam ──────────────────────────────────────────────────────────────────

    private async _moveBeam(id: string, dx: number, dz: number): Promise<void> {
        const bs = window.beamStore; // TODO(TASK-08)
        if (!bs) { console.warn('[MoveTool] No beamStore'); return; }
        const beam = bs.get?.(id) ?? bs.getById?.(id);
        if (!beam) { console.warn('[MoveTool] Beam not found:', id); return; }

        const sp = beam.startPoint as { x: number; y: number; z: number };
        const ep = beam.endPoint   as { x: number; y: number; z: number };

        window.runtime?.bus?.executeCommand('beam.update', {
            beamId: id,
            updates: {
                startPoint: { x: sp.x + dx, y: sp.y, z: sp.z + dz },
                endPoint:   { x: ep.x + dx, y: ep.y, z: ep.z + dz },
            },
        })?.catch((e: unknown) => console.error('[MoveTool] beam.update failed:', e));
        console.log('[MoveTool] Beam moved:', id);
    }

    // ── Furniture ─────────────────────────────────────────────────────────────

    private async _moveFurniture(id: string, dx: number, dz: number): Promise<void> {
        const fs = window.furnitureStore; // TODO(TASK-08)
        if (!fs) { console.warn('[MoveTool] No furnitureStore'); return; }
        const item = fs.get?.(id) ?? fs.getById?.(id);
        if (!item) { console.warn('[MoveTool] Furniture not found:', id); return; }

        const pos = item.position as { x: number; y: number; z: number };
        window.runtime?.bus?.executeCommand('furniture.updateParameters', { id, position: { x: pos.x + dx, y: pos.y, z: pos.z + dz } })?.catch((e: unknown) => console.error('[MoveTool] furniture.updateParameters failed:', e));
        console.log('[MoveTool] Furniture moved:', id);
    }

    // ── Room ──────────────────────────────────────────────────────────────────

    private async _moveRoom(id: string, dx: number, dz: number): Promise<void> {
        const rs = window.roomStore; // TODO(TASK-08)
        if (!rs) { console.warn('[MoveTool] No roomStore'); return; }
        const room = rs.getById?.(id) ?? rs.get?.(id);
        if (!room) { console.warn('[MoveTool] Room not found:', id); return; }

        const boundary = room.boundary;
        if (!boundary?.polygon?.length) { console.warn('[MoveTool] Room has no boundary polygon'); return; }

        const newPoly = boundary.polygon.map((v: { x: number; z: number }) => ({
            x: v.x + dx,
            z: v.z + dz,
        }));

        const newBoundary = {
            ...boundary,
            polygon: newPoly,
            centroid: {
                x: (boundary.centroid?.x ?? 0) + dx,
                z: (boundary.centroid?.z ?? 0) + dz,
            },
        };

        window.runtime?.bus?.executeCommand('room.updateBoundary', { id, boundary: newBoundary, boundingWallIds: room.boundingWallIds ?? [] })?.catch((e: unknown) => console.error('[MoveTool] room.updateBoundary failed:', e));
        console.log('[MoveTool] Room moved:', id);
    }

    // ── Roof ──────────────────────────────────────────────────────────────────
    // RoofFootprint uses [number, number] pairs (NOT {x, z} objects), so we
    // translate the polygon vertices and centroid in tuple form before
    // dispatching UpdateRoofCommand.
    private async _moveRoof(id: string, dx: number, dz: number): Promise<void> {
        const rs = window.roofStore; // TODO(TASK-08)
        if (!rs) { console.warn('[MoveTool] No roofStore'); return; }
        const roof = rs.getById?.(id) ?? rs.get?.(id);
        if (!roof) { console.warn('[MoveTool] Roof not found:', id); return; }

        const fp = roof.footprint;
        if (!fp?.polygon?.length) { console.warn('[MoveTool] Roof has no footprint polygon'); return; }

        const newPolygon: [number, number][] = fp.polygon.map(
            (pt: [number, number]) => [pt[0] + dx, pt[1] + dz] as [number, number]
        );
        const newCentroid: [number, number] = [
            (fp.centroid?.[0] ?? 0) + dx,
            (fp.centroid?.[1] ?? 0) + dz,
        ];

        window.runtime?.bus?.executeCommand('roof.update', { id, updates: { footprint: { polygon: newPolygon, centroid: newCentroid } } })?.catch((e: unknown) => console.error('[MoveTool] roof.update failed:', e));
        console.log('[MoveTool] Roof moved:', id, `Δ(${dx.toFixed(3)}, ${dz.toFixed(3)})`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overlay drawing primitives
    // ──────────────────────────────────────────────────────────────────────────

    private _drawCrosshair(
        ctx:   CanvasRenderingContext2D,
        sx:    number,
        sy:    number,
        color: string,
        size = 10,
    ): void {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.setLineDash([]);

        // Outer circle
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair lines
        const h = size + 4;
        ctx.beginPath();
        ctx.moveTo(sx - h, sy); ctx.lineTo(sx + h, sy);
        ctx.moveTo(sx, sy - h); ctx.lineTo(sx, sy + h);
        ctx.stroke();
        ctx.restore();
    }

    private _drawHUDLabel(
        ctx:   CanvasRenderingContext2D,
        sx:    number,
        sy:    number,
        text:  string,
        color: string,
    ): void {
        ctx.save();
        ctx.font         = '600 12px system-ui, sans-serif';
        ctx.fillStyle    = 'rgba(10, 15, 25, 0.82)';
        const w = ctx.measureText(text).width + 14;
        ctx.beginPath();
        ctx.roundRect?.(sx - 2, sy - 14, w, 20, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(text, sx + 5, sy);
        ctx.restore();
    }

    private _drawBubbleLabel(
        ctx:   CanvasRenderingContext2D,
        sx:    number,
        sy:    number,
        text:  string,
        color: string,
    ): void {
        ctx.save();
        ctx.font      = '600 11px system-ui, sans-serif';
        const w       = ctx.measureText(text).width + 12;
        const h       = 18;
        ctx.fillStyle = 'rgba(10, 15, 25, 0.78)';
        ctx.beginPath();
        ctx.roundRect?.(sx - w / 2, sy - h / 2, w, h, 4);
        ctx.fill();
        ctx.fillStyle    = color;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    private _drawElementLabel(
        ctx: CanvasRenderingContext2D,
        sx:  number,
        sy:  number,
    ): void {
        if (!this._targetType) return;
        const type = this._targetType.charAt(0).toUpperCase() + this._targetType.slice(1);
        ctx.save();
        ctx.font         = '500 11px system-ui, sans-serif';
        const text       = `Moving: ${type}`;
        const w          = ctx.measureText(text).width + 12;
        ctx.fillStyle    = 'rgba(10, 15, 25, 0.65)';
        ctx.beginPath();
        ctx.roundRect?.(sx - 2, sy + 14, w, 18, 4);
        ctx.fill();
        ctx.fillStyle    = '#94a3b8';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx + 4, sy + 23);
        ctx.restore();
    }

    /**
     * Draws a ghost outline of where the element will land at (cursor + delta).
     * Only implemented for wall geometry to keep the initial implementation lean.
     */
    private _drawGhostAt(
        ctx:        CanvasRenderingContext2D,
        planCanvas: any,
        _cursor:    WorldPoint,
        dx:         number,
        dz:         number,
    ): void {
        if (!this._targetId || !this._targetType) return;
        const type = this._targetType;

        ctx.save();
        ctx.strokeStyle = 'rgba(30, 144, 255, 0.5)';
        ctx.lineWidth   = 2;
        ctx.setLineDash([6, 4]);

        if (type === 'wall') {
            const ws = window.wallStore; // TODO(TASK-08)
            const wall = ws?.getById?.(this._targetId);
            if (wall?.baseLine) {
                const bl = wall.baseLine as [{ x: number; z: number }, { x: number; z: number }];
                const a = planCanvas.worldToScreen(bl[0].x + dx, bl[0].z + dz);
                const b = planCanvas.worldToScreen(bl[1].x + dx, bl[1].z + dz);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }
        } else if (type === 'beam') {
            const bs = window.beamStore; // TODO(TASK-08)
            const beam = bs?.get?.(this._targetId) ?? bs?.getById?.(this._targetId);
            if (beam?.startPoint && beam?.endPoint) {
                const a = planCanvas.worldToScreen(beam.startPoint.x + dx, beam.startPoint.z + dz);
                const b = planCanvas.worldToScreen(beam.endPoint.x   + dx, beam.endPoint.z   + dz);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }
        } else if (type === 'curtain-wall' || type === 'curtainwall') {
            const cs = window.curtainWallStore; // TODO(TASK-08)
            const cw = cs?.getById?.(this._targetId) ?? cs?.get?.(this._targetId);
            if (cw?.baseLine) {
                const bl = cw.baseLine as [{ x: number; z: number }, { x: number; z: number }];
                const a = planCanvas.worldToScreen(bl[0].x + dx, bl[0].z + dz);
                const b = planCanvas.worldToScreen(bl[1].x + dx, bl[1].z + dz);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }
        } else if (type === 'column' || type === 'furniture') {
            // Ghost dot at new position
            const store  = type === 'column' ? window.columnStore : window.furnitureStore; // TODO(TASK-08)
            const el     = store?.get?.(this._targetId) ?? store?.getById?.(this._targetId);
            const pos    = el?.position;
            if (pos) {
                const sc = planCanvas.worldToScreen(pos.x + dx, pos.z + dz);
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(sc.sx, sc.sy, 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private _clearOverlay(): void {
        if (!this._ctx) return;
        const { ctx, overlayCanvas, dpr } = this._ctx;
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
    }

    /**
     * §ROOF-SYSTEM-AUDIT-2026 §4.2  AND  §BUG-2: roof not movable on plan.
     *
     * Selection often lands on a child mesh (e.g. an individual RoofPart slope
     * face, a CurtainPanel, or a window/door sash) — not on the BIM-element
     * root that carries `userData.elementType` + `userData.id`. Reading
     * userData off the leaf node yields the wrong type (or nothing) and the
     * tool either rejects the move or routes it to the wrong handler.
     *
     * Mirrors OpeningPlanToolHandler._readSelection (which has always done
     * this traversal) so plan-view move semantics are uniform across all
     * element types.
     */
    private _readSelection(): void {
        const sm  = window.selectionManager;
        const obj = sm?.selectedObject ?? null;
        if (!obj) {
            this._targetId   = null;
            this._targetType = null;
            return;
        }

        // Walk up to the first ancestor carrying both id + elementType.
        let node: any = obj;
        while (node && !(node.userData?.id && (node.userData?.elementType || node.userData?.type))) {
            node = node.parent;
        }

        if (node && node.userData?.id) {
            this._targetId   = node.userData.id as string;
            this._targetType = ((node.userData.elementType ?? node.userData.type ?? '') as string).toLowerCase();
        } else {
            // Fallback to leaf-node behaviour for non-BIM selections.
            this._targetId   = obj.userData?.id ?? null;
            this._targetType = ((obj.userData?.elementType ?? obj.userData?.type ?? '') as string).toLowerCase() || null;
        }
    }
}
