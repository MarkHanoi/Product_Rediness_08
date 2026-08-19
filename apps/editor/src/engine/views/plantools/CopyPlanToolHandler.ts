/**
 * CopyPlanToolHandler — Contract 35 / Contract 21
 *
 * Revit-style two-click COPY operation for the 2D plan view (and elevation /
 * section views). Creates a semantically-unique new BIM element at the
 * destination, following all Contracts 00–06.
 *
 * Workflow:
 *   1. Tool activates via Ctrl+C (plan view) or the Copy button.
 *   2. State: AWAITING_FIRST  — user clicks the origin (reference) point.
 *   3. State: AWAITING_SECOND — user clicks the destination point.
 *   4. Delta = dest − origin.  A NEW element (new crypto.randomUUID()) is created
 *      at the source position + delta via the appropriate Create command. All
 *      create commands handle semantic registration, elementRegistry, bimManager,
 *      undo/redo, and store notification automatically.
 *
 * Hosted elements (doors/windows):
 *   The delta is projected onto the host wall direction and the new opening is
 *   created on the SAME host wall at (original_offset + delta_along_wall).
 *
 * All other elements: free XZ copy, new element placed at source + delta.
 *
 * Architecture rules (Contract 21 §4 — updated §P3.1):
 *   - All create commands dispatched via runtime.bus (bus-only, no commandManager dual-write)
 *   - Store reads via window.*Store (to be replaced in Phase 4 via PlanToolDrawContext DI)
 *   - No direct DOM event listeners
 *   - No imports from PlanViewToolOverlay
 */

import { createId } from '@pryzm/schemas';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
// §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) — the legacy-record → bus-payload mapping
// for every element this tool copies, extracted so a test can EXECUTE it. Every
// dispatch below sits behind a two-click canvas gesture and a `window.*Store`
// read, so no suite could build one of these payloads — which is how FOUR wrong
// curtain-wall field names, a dropped baseLine `y`, a zero-area slab boundary and
// an object-shaped furniture rotation all survived unmeasured.
import {
    curtainWallCopyPayload,
    wallCopyPayload,
    slabCopyPayload,
    columnCopyPayload,
    beamCopyPayload,
    furnitureCopyPayload,
    type LegacyCurtainWallLike,
    type LegacyWallLike,
    type LegacySlabLike,
    type LegacyColumnLike,
    type LegacyBeamLike,
    type LegacyFurnitureLike,
} from './copyPayloads';
// §P3.1 (IMPL-PLAN-2026-05-17): CreateWallCommand, CreateCurtainWallCommand, window.commandManager (P4.4).
// All copy dispatches are now bus-only (wall.create / curtain-wall.create /
// wall.opening.create — §FIX-COPY-HOSTED-OPENING-PAYLOAD (L-128) corrected the
// hosted path from the wrong `wall.createOpening` command to `wall.opening.create`).
// Mesh rebuild for walls is driven by the initTools.ts §P2.1 wall.created bridge;
// for curtain walls by the initBusHandlers.ts §E.5.4 bridge.

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_SNAP_M  = 0.05; // 50 mm grid snap
const COPY_COLOR   = '#22c55e'; // green accent for copy operations
const COPY_COLOR_2 = '#16a34a';

// ── Helpers ───────────────────────────────────────────────────────────────────

function snap(v: number): number {
    return Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;
}

function formatDist(m: number): string {
    if (Math.abs(m) < 0.01) return `${Math.round(m * 1000)} mm`;
    return `${m.toFixed(3)} m`;
}

type CopyPhase = 'awaiting-first' | 'awaiting-second';

// ── Handler ───────────────────────────────────────────────────────────────────

export class CopyPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _phase: CopyPhase = 'awaiting-first';
    private _firstPt: WorldPoint | null = null;
    private _cursorPt: WorldPoint | null = null;

    private _targetId: string | null = null;
    private _targetType: string | null = null;

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx      = ctx;
        this._phase    = 'awaiting-first';
        this._firstPt  = null;
        this._cursorPt = null;
        this._readSelection();
        this.redraw();
        console.log('[CopyTool] Activated — target:', this._targetId, this._targetType);
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
        this._phase   = 'awaiting-first';
        this._firstPt = null;
        this.redraw();
        console.log('[CopyTool] Cancelled — reset to awaiting first point');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        this.redraw();
    }

    onClick(pt: WorldPoint): void {
        if (!this._targetId) this._readSelection();
        if (!this._targetId) {
            console.warn('[CopyTool] onClick: no element selected');
            return;
        }

        if (this._phase === 'awaiting-first') {
            this._firstPt = pt;
            this._phase   = 'awaiting-second';
            this.redraw();
            console.log('[CopyTool] Origin set:', pt.worldX.toFixed(3), pt.worldZ.toFixed(3));
        } else if (this._phase === 'awaiting-second' && this._firstPt) {
            const dx = snap(pt.worldX - this._firstPt.worldX);
            const dz = snap(pt.worldZ - this._firstPt.worldZ);
            console.log('[CopyTool] Destination set — delta:', dx.toFixed(3), dz.toFixed(3));
            this._commitCopy(dx, dz);

            // Reset: allow user to place multiple copies without re-activating
            this._phase   = 'awaiting-first';
            this._firstPt = null;
            this.redraw();

            // Exit after one copy (same UX as Move)
            const tm = window.toolManager;
            if (tm?.setActiveTool) {
                setTimeout(() => tm.setActiveTool('none'), 0);
            } else {
                // §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — deactivate on whichever plan
                // surface is active (main plan view OR split-view plan pane), not only
                // the main overlay, so the SVP copy tool exits after one copy too.
                setTimeout(() => {
                    for (const ov of [window.planViewToolOverlay, window.svpPlanToolOverlay]) {
                        if (ov?.isAttached?.() && ov.setActiveTool) ov.setActiveTool('none');
                    }
                }, 0);
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
            this._drawCrosshair(ctx, curSc.sx, curSc.sy);
            this._drawHUDLabel(ctx, curSc.sx + 16, curSc.sy - 10, '+ Pick origin point', COPY_COLOR);
            if (this._targetId) this._drawElementLabel(ctx, curSc.sx, curSc.sy);

        } else if (this._phase === 'awaiting-second' && this._firstPt) {
            const origSc = planCanvas.worldToScreen(this._firstPt.worldX, this._firstPt.worldZ);

            // Origin marker
            ctx.beginPath();
            ctx.arc(origSc.sx, origSc.sy, 6, 0, Math.PI * 2);
            ctx.fillStyle = COPY_COLOR;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(origSc.sx, origSc.sy, 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Rubber-band dashed line
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(origSc.sx, origSc.sy);
            ctx.lineTo(curSc.sx, curSc.sy);
            ctx.strokeStyle = `rgba(34, 197, 94, 0.85)`;
            ctx.lineWidth   = 2;
            ctx.setLineDash([8, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            const dx   = snap(cursor.worldX - this._firstPt.worldX);
            const dz   = snap(cursor.worldZ - this._firstPt.worldZ);
            const dist = Math.hypot(dx, dz);
            if (dist > 0.005) {
                const midSx = (origSc.sx + curSc.sx) / 2;
                const midSy = (origSc.sy + curSc.sy) / 2;
                this._drawBubbleLabel(ctx, midSx, midSy - 14, formatDist(dist),    COPY_COLOR);
                this._drawBubbleLabel(ctx, midSx, midSy + 14,
                    `Δx ${formatDist(dx)}  Δz ${formatDist(dz)}`, COPY_COLOR_2);
            }

            // Ghost element at destination (copy preview)
            this._drawGhostAt(ctx, planCanvas, cursor, dx, dz);

            this._drawCrosshair(ctx, curSc.sx, curSc.sy);
            this._drawHUDLabel(ctx, curSc.sx + 16, curSc.sy - 10, '+ Pick destination point', COPY_COLOR);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Copy commit — creates a semantically-unique NEW element
    // ──────────────────────────────────────────────────────────────────────────

    private _commitCopy(dx: number, dz: number): void {
        if (Math.hypot(dx, dz) < 0.001) {
            console.log('[CopyTool] Delta too small — no-op');
            return;
        }
        const id   = this._targetId!;
        const type = this._targetType!;
        switch (type) {
            case 'wall':            this._copyWall(id, dx, dz);            break;
            case 'curtain-wall':
            case 'curtainwall':     this._copyCurtainWall(id, dx, dz);     break;
            case 'door':            this._copyHosted(id, 'door',   dx, dz); break;
            case 'window':          this._copyHosted(id, 'window', dx, dz); break;
            case 'column':          this._copyColumn(id, dx, dz);           break;
            case 'slab':            this._copySlab(id, dx, dz);             break;
            case 'beam':            this._copyBeam(id, dx, dz);             break;
            case 'furniture':       this._copyFurniture(id, dx, dz);        break;
            default:
                console.warn('[CopyTool] No copy implementation for element type:', type);
                break;
        }
    }

    // ── Wall ─────────────────────────────────────────────────────────────────

    private async _copyWall(id: string, dx: number, dz: number): Promise<void> {
        const ws = window.wallStore; // TODO(TASK-08)
        if (!ws) return;
        const wall = ws.getById(id);
        if (!wall) { console.warn('[CopyTool] Wall not found:', id); return; }

        const newId = createId('wall');

        // §P3.1 (IMPL-PLAN-2026-05-17): bus-only dispatch — single pipeline.
        // The §P2.1 wall.created bridge in initTools.ts mirrors the wall into the
        // legacy WallStore → WallRebuildCoordinator → mesh rebuild. No dual-write.
        // §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) — payload built by `wallCopyPayload`,
        // which restores the baseLine `y` this call used to drop (`Vec3` requires it,
        // so `Wall.parse` threw into the catch below and no wall was ever created)
        // and carries the `curve` + `layers` a copied wall used to lose.
        window.runtime?.bus?.executeCommand(
            'wall.create',
            wallCopyPayload(wall as unknown as LegacyWallLike, dx, dz, newId),
        )?.catch((e: unknown) => console.error('[CopyTool] wall.create bus failed:', e));
        console.log('[CopyTool] Wall copied → new ID:', newId);
    }

    // ── Curtain wall ──────────────────────────────────────────────────────────

    private async _copyCurtainWall(id: string, dx: number, dz: number): Promise<void> {
        const cs = window.curtainWallStore; // TODO(TASK-08)
        if (!cs) return;
        const cw = cs.getById?.(id) ?? cs.get?.(id);
        if (!cw) { console.warn('[CopyTool] CurtainWall not found:', id); return; }

        const newId = createId('curtainwall');

        // §P3.1 (IMPL-PLAN-2026-05-17): bus-only dispatch — single pipeline. The
        // `curtain-wall.created` bridge in initTools.ts mirrors the wall into the
        // legacy CurtainWallStore → CurtainWallBuilder. No dual-write needed here.
        //
        // §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) — this used to send `start`, `end`,
        // `gridXSpacing` and `gridYSpacing`. `CreateCurtainWallPayload` accepts NONE
        // of the four, so every copied curtain wall was minted at the L0 schema's
        // DEFAULT baseLine (0,0,0)→(4,0,0) with default bays, silently. The
        // translation between the two vocabularies now lives in `copyPayloads.ts`,
        // where a test can execute it.
        window.runtime?.bus?.executeCommand(
            'curtain-wall.create',
            curtainWallCopyPayload(cw as unknown as LegacyCurtainWallLike, dx, dz, newId),
        )?.catch((e: unknown) => console.error('[CopyTool] curtain-wall.create bus failed:', e));
        console.log('[CopyTool] CurtainWall copied → new ID:', newId);
    }

    // ── Hosted elements (door / window) ───────────────────────────────────────
    //
    // Copied along the same host wall. Delta is projected onto the wall
    // direction to produce a new offset, clamped inside the wall extent.

    private async _copyHosted(
        id: string, kind: 'door' | 'window',
        dx: number, dz: number,
    ): Promise<void> {
        const ws = window.wallStore; // TODO(TASK-08)
        if (!ws) return;

        const el   = kind === 'door' ? ws.getDoor(id) : ws.getWindow(id);
        if (!el)   { console.warn('[CopyTool] Hosted element not found:', id); return; }
        const wall = ws.getById(el.wallId);
        if (!wall) { console.warn('[CopyTool] Host wall not found:', el.wallId); return; }

        const a = wall.baseLine[0] as { x: number; z: number };
        const b = wall.baseLine[1] as { x: number; z: number };
        const wallLen = Math.hypot(b.x - a.x, b.z - a.z);
        const dirX    = (b.x - a.x) / wallLen;
        const dirZ    = (b.z - a.z) / wallLen;
        const deltaAlong = dx * dirX + dz * dirZ;

        const halfW    = (el.width ?? 0.9) / 2;
        const newOffset = Math.max(halfW, Math.min(
            (el.offset ?? 0) + deltaAlong,
            wallLen - halfW,
        ));

        const newOpeningId = crypto.randomUUID();
        const newElementId = crypto.randomUUID();

        // §FIX-COPY-HOSTED-OPENING-PAYLOAD (L-128): build the opening payload the
        // SAME way the working placement path does (DoorPlanToolHandler /
        // WindowPlanToolHandler) — the copy MUST reuse the normal creation command,
        // not a parallel copy-only path. Source `el` is a DoorData/WindowData record
        // (WallTypes.ts) that already carries `type`, `offset`, `width`, `height`,
        // `sillHeight` plus type-specific props (doorType/windowType/systemTypeId/
        // frame*), so spreading it preserves a faithful copy; we only re-stamp the
        // IDs and the along-wall offset. Unknown keys are stripped by OpeningSchema.
        const newOpeningData: Record<string, any> = {
            ...el,
            id:        newOpeningId,
            elementId: newElementId,
            type:      kind,          // guarantee the schema-required discriminant
            offset:    newOffset,
        };
        // Remove mark so MarkGenerator assigns a new one
        delete newOpeningData.mark;

        // §FIX-COPY-HOSTED-OPENING-PAYLOAD (L-128): dispatch `wall.opening.create`
        // (WallOpeningLegacyAdapterHandler, payload `{ wallId, openingData }`), NOT
        // `wall.createOpening` (CreateWallOpeningHandler, payload `{ wallId, opening }`).
        // The old call passed `openingData` to a command whose canExecute reads
        // `cmd.opening` → "opening must be an object" rejection, so no copy was ever
        // created. `wall.opening.create` is the proven placement path: it drives the
        // initTools.ts §P2.3 `wall.opening.created` bridge → legacy WallStore.addOpening
        // → WallRebuildCoordinator mesh rebuild, and persists across save/reload (P6).
        window.runtime?.bus?.executeCommand('wall.opening.create', { wallId: el.wallId, openingData: newOpeningData })
            ?.catch((e: unknown) => console.error('[CopyTool] wall.opening.create failed:', e));
        console.log('[CopyTool]', kind, 'copied → new IDs:', newOpeningId, newElementId,
            '| offset:', newOffset.toFixed(3));
    }

    // ── Column ───────────────────────────────────────────────────────────────

    private async _copyColumn(id: string, dx: number, dz: number): Promise<void> {
        const cs = window.columnStore; // TODO(TASK-08)
        if (!cs) return;
        const col = cs.get?.(id) ?? cs.getById?.(id);
        if (!col) { console.warn('[CopyTool] Column not found:', id); return; }

        const newId = createId('column');

        // §P3.3-CO: aligned with CreateColumnPayload — `position` → `origin`, `profile` → `shape`.
        // ⚠ The `shape: profile` hop is LEFT AS IT WAS on purpose (C84 EI-3): a steel
        // 'UC'/'UB' is outside the L0 ColumnShape vocabulary, so `Column.parse` throws
        // and the copy refuses LOUDLY, which is the correct behaviour of the two.
        // See the header of `columnCopyPayload` in `copyPayloads.ts`.
        window.runtime?.bus?.executeCommand(
            'column.create',
            columnCopyPayload(col as unknown as LegacyColumnLike, dx, dz, newId),
        )?.catch((e: unknown) => console.error('[CopyTool] §P3.3-CO: column.create failed:', e));
        console.log('[CopyTool] Column copied → new ID:', newId);
    }

    // ── Slab ─────────────────────────────────────────────────────────────────

    private async _copySlab(id: string, dx: number, dz: number): Promise<void> {
        const ss = window.slabStore; // TODO(TASK-08)
        if (!ss) return;
        const slab = ss.getById?.(id) ?? ss.get?.(id);
        if (!slab) { console.warn('[CopyTool] Slab not found:', id); return; }

        const newId    = createId('slab');
        const ifcGuid  = crypto.randomUUID();

        // §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) — the polygon now carries worldZ in
        // BOTH `y` and `z` (§FIX-SLAB-ZERO-AREA, C11 §7.0: without `z` the handler's
        // `signedAreaXZ` read zero area and REFUSED every copied slab, the rejection
        // dying in the catch below), `position` is no longer translated a SECOND time
        // on top of the polygon, and the slab's material + type ride along.
        window.runtime?.bus?.executeCommand(
            'slab.create',
            slabCopyPayload(slab as unknown as LegacySlabLike, dx, dz, newId, ifcGuid),
        )?.catch((e: unknown) => console.error('[CopyTool] slab.create failed:', e));
        console.log('[CopyTool] Slab copied → new ID:', newId);
    }

    // ── Beam ──────────────────────────────────────────────────────────────────

    private async _copyBeam(id: string, dx: number, dz: number): Promise<void> {
        const bs = window.beamStore; // TODO(TASK-08)
        if (!bs) return;
        const beam = bs.get?.(id) ?? bs.getById?.(id);
        if (!beam) { console.warn('[CopyTool] Beam not found:', id); return; }

        // §L-1032 — this object literal moved to `beamCopyPayload` in
        // `copyPayloads.ts`, VERBATIM (no id ⇒ byte-identical to what stood here),
        // for the reason that module exists: a payload built inside this closure is
        // a payload no test can reach, and the duplicate-to-level route needs the
        // SAME mapping rather than a second one (C84 EI-9 · L-978).
        window.runtime?.bus?.executeCommand(
            'beam.create',
            beamCopyPayload(beam as unknown as LegacyBeamLike, dx, dz),
        )?.catch((e: unknown) => console.error('[CopyTool] beam.create failed:', e));
        console.log('[CopyTool] Beam copied');
    }

    // ── Furniture ─────────────────────────────────────────────────────────────

    private async _copyFurniture(id: string, dx: number, dz: number): Promise<void> {
        const fs = window.furnitureStore; // TODO(TASK-08)
        if (!fs) return;
        const item = fs.get?.(id) ?? fs.getById?.(id);
        if (!item) { console.warn('[CopyTool] Furniture not found:', id); return; }

        const newId = createId('furniture');

        // §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) — `rotation` used to be sent as the
        // legacy EulerDTO OBJECT. Both receivers want a SCALAR yaw: L0
        // `Furniture.rotation` is `z.number()`, and the §FT-FURNITURE bridge in
        // initTools.ts writes `{ x: 0, y: ev.rotation ?? 0, z: 0 }` — an object is
        // non-nullish, so it survived the `??` and the legacy record ended up with an
        // OBJECT nested inside its `y`. Every copied ROTATED item was mirrored with a
        // rotation the builder cannot read. The yaw is lifted in `copyPayloads.ts`,
        // which also NAMES the anchor-point / branch-dimension fields this call used
        // to send to no receiver at all (the L-shaped-sofa arm geometry), instead of
        // dropping them in silence.
        window.runtime?.bus?.executeCommand(
            'furniture.create',
            furnitureCopyPayload(item as unknown as LegacyFurnitureLike, dx, dz, newId),
        )?.catch((e: unknown) => console.error('[CopyTool] furniture.create failed:', e));
        console.log('[CopyTool] Furniture copied → new ID:', newId);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overlay drawing helpers
    // ──────────────────────────────────────────────────────────────────────────

    private _drawCrosshair(ctx: CanvasRenderingContext2D, sx: number, sy: number, size = 10): void {
        ctx.save();
        ctx.strokeStyle = COPY_COLOR;
        ctx.lineWidth   = 2;
        ctx.setLineDash([]);

        // "+" crosshair (no diagonal, signals copy not move)
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        const h = size + 4;
        ctx.beginPath();
        ctx.moveTo(sx - h, sy); ctx.lineTo(sx + h, sy);
        ctx.moveTo(sx, sy - h); ctx.lineTo(sx, sy + h);
        ctx.stroke();

        // Small + symbol in center
        ctx.font      = '700 10px system-ui';
        ctx.fillStyle = COPY_COLOR;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.restore();
    }

    private _drawHUDLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string, color: string): void {
        ctx.save();
        ctx.font      = '600 12px system-ui, sans-serif';
        const w       = ctx.measureText(text).width + 14;
        ctx.fillStyle = 'rgba(10, 15, 25, 0.82)';
        ctx.beginPath();
        ctx.roundRect?.(sx - 2, sy - 14, w, 20, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(text, sx + 5, sy);
        ctx.restore();
    }

    private _drawBubbleLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string, color: string): void {
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

    private _drawElementLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
        if (!this._targetType) return;
        const type = this._targetType.charAt(0).toUpperCase() + this._targetType.slice(1);
        ctx.save();
        ctx.font         = '500 11px system-ui, sans-serif';
        const text       = `Copying: ${type}`;
        const w          = ctx.measureText(text).width + 12;
        ctx.fillStyle    = 'rgba(10, 15, 25, 0.65)';
        ctx.beginPath();
        ctx.roundRect?.(sx - 2, sy + 14, w, 18, 4);
        ctx.fill();
        ctx.fillStyle    = '#86efac';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx + 4, sy + 23);
        ctx.restore();
    }

    /** Ghost outline at copy destination. Same logic as MovePlanToolHandler._drawGhostAt. */
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
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
        ctx.lineWidth   = 2;
        ctx.setLineDash([6, 4]);

        if (type === 'wall') {
            const wall = window.wallStore?.getById?.(this._targetId); // TODO(TASK-08)
            if (wall?.baseLine) {
                const bl = wall.baseLine as [{ x: number; z: number }, { x: number; z: number }];
                const a  = planCanvas.worldToScreen(bl[0].x + dx, bl[0].z + dz);
                const b  = planCanvas.worldToScreen(bl[1].x + dx, bl[1].z + dz);
                ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
            }
        } else if (type === 'beam') {
            const beam = window.beamStore?.get?.(this._targetId) // TODO(TASK-08)
                      ?? window.beamStore?.getById?.(this._targetId); // TODO(TASK-08)
            if (beam?.startPoint && beam?.endPoint) {
                const a = planCanvas.worldToScreen(beam.startPoint.x + dx, beam.startPoint.z + dz);
                const b = planCanvas.worldToScreen(beam.endPoint.x   + dx, beam.endPoint.z   + dz);
                ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
            }
        } else if (type === 'curtain-wall' || type === 'curtainwall') {
            const cw = window.curtainWallStore?.getById?.(this._targetId) // TODO(TASK-08)
                    ?? window.curtainWallStore?.get?.(this._targetId); // TODO(TASK-08)
            if (cw?.baseLine) {
                const bl = cw.baseLine as [{ x: number; z: number }, { x: number; z: number }];
                const a  = planCanvas.worldToScreen(bl[0].x + dx, bl[0].z + dz);
                const b  = planCanvas.worldToScreen(bl[1].x + dx, bl[1].z + dz);
                ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
            }
        } else if (type === 'column' || type === 'furniture') {
            const store = type === 'column' ? window.columnStore : window.furnitureStore; // TODO(TASK-08)
            const el    = store?.get?.(this._targetId) ?? store?.getById?.(this._targetId);
            const pos   = el?.position;
            if (pos) {
                ctx.setLineDash([]);
                const sc = planCanvas.worldToScreen(pos.x + dx, pos.z + dz);
                ctx.beginPath(); ctx.arc(sc.sx, sc.sy, 8, 0, Math.PI * 2); ctx.stroke();
                // "+" copy indicator
                ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                ctx.font = '700 14px system-ui';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', sc.sx + 10, sc.sy - 10);
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

    private _readSelection(): void {
        const sm  = window.selectionManager;
        const obj = sm?.selectedObject ?? null;
        this._targetId   = obj?.userData?.id ?? null;
        this._targetType = obj
            ? ((obj.userData?.elementType ?? obj.userData?.type ?? '') as string).toLowerCase()
            : null;
    }
}
