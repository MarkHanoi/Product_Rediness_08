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
 * All other elements: free XZ translation, built by the ONE shared translate
 *   definition — `@app/engine/transforms/elementMove` (§FIX-PLAN-MOVE-PARITY, Gate G7).
 *   That module emits the EXACT command + payload `registerTransformDragHandler` (the
 *   3-D gizmo) dispatches on drag-end, so a plan move and a 3-D move of the same element
 *   produce an identical record mutation AND an identical undo entry (C16). This handler
 *   no longer authors per-type mutations: stair and plumbing moved in 3-D but hit the old
 *   `default:` branch here — Move was enabled and inert for them, the L-267 shape.
 *
 * Architecture rules (Contract 21 §4):
 *   - All commands fired via commandManager
 *   - Store access via window.*Store
 *   - No direct DOM event listeners — all events routed by coordinator
 *   - No imports from PlanViewToolOverlay
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import {
    buildMoveCommand,
    MOVE_UNSUPPORTED_REASON,
} from '@app/engine/transforms/elementMove';
// BIM30 R3 — the consequence-preview overlay's first LIVE caller. As the user drags a
// wall's destination, emit a PreviewCommand for the candidate baseline so the overlay
// renders the READ-ONLY ConsequencePlan (ADR-0322 §3) before the move is committed.
import { triggerConsequencePreview, hideConsequencePreview } from '@app/ui/canvas/ConsequencePreviewOverlay';
// §C83-S1-MOVE (L-885) — the wall-side occupancy gate, MOVE arm.
import { gateWallMove } from '@app/engine/consequence/wallPlacementGate';
// BIM30 R6 — confirmation at CONFIRM time, not at hover time. The R3 preview above is minted
// while the cursor moves and can never be bound (the payload changes on the next frame); this
// import is the OTHER moment — the gesture is finished, the payload is FINAL, and a fresh plan
// over CURRENT state is minted, shown, and bound to by its planHash (ADR-0322 §10).
import {
    requestWallMoveConfirmation,
    proceedWithoutConfirmation,
    // C78 §10.2 — the plan-less fallback still reports a TYPED outcome (see its use below).
    dispatchPlanless,
} from '@app/ui/consequence/confirmationFlowComposition';
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
        hideConsequencePreview(); // BIM30 R3 — dismiss any live consequence preview.
        this._clearOverlay();
        this._ctx        = null;
        this._phase      = 'awaiting-first';
        this._firstPt    = null;
        this._cursorPt   = null;
        this._targetId   = null;
        this._targetType = null;
    }

    cancel(): void {
        hideConsequencePreview(); // BIM30 R3 — no candidate destination while awaiting-first.
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

            // §T-H7 (DAILY-USE-AUDIT) — was `setTimeout(tm.setActiveTool('none'))` which
            // exited Move after a SINGLE operation. The comment said "Revit-style" but
            // Revit keeps Move active until Esc. This doubled clicks for repetitive layout
            // work (move N walls = N × (click button → click pick → click target → click
            // button again)). Removed: tool now stays active until user presses Esc.
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

            // BIM30 R3 — the consequence-preview overlay's first live caller. For a wall
            // being dragged to a new destination, emit the candidate `wall.updateBaseline`
            // so the overlay computes and renders its READ-ONLY ConsequencePlan (opening
            // refit, junctions, violations, undetermined branches) BEFORE the commit. The
            // overlay debounces (300 ms) and positions from its own tracked cursor.
            this._emitWallConsequencePreview(dx, dz);
        }
    }

    /**
     * Emit a PreviewCommand for the candidate wall baseline (prev + Δ). Guarded to wall
     * targets and to a meaningful delta; a no-op otherwise. Read-only — this only asks the
     * overlay "what WOULD this move do?"; nothing is dispatched or mutated here.
     */
    private _emitWallConsequencePreview(dx: number, dz: number): void {
        if (this._targetType !== 'wall' || !this._targetId) return;
        if (Math.hypot(dx, dz) < 0.005) return;
        const ws = window.wallStore; // TODO(TASK-08)
        const wall = ws?.getById?.(this._targetId);
        if (!wall?.baseLine) return;
        type Pt = { x: number; y: number; z: number };
        const prev = wall.baseLine as [Pt, Pt];
        const newBaseLine: [Pt, Pt] = [
            { x: prev[0].x + dx, y: prev[0].y, z: prev[0].z + dz },
            { x: prev[1].x + dx, y: prev[1].y, z: prev[1].z + dz },
        ];
        triggerConsequencePreview({
            type: 'wall.updateBaseline',
            payload: { wallId: this._targetId, newBaseLine, prevBaseLine: prev },
        });
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

        // Wall and the hosted openings keep element-specific paths — but the SAME
        // commands the 3-D gizmo dispatches (see elementMove.ts module header for why):
        //   wall   → needs §WALL-MOVE-CARRY-NEIGHBOURS (a naive translate is re-snapped
        //            back by WallJoinResolver, so the corner must travel with it).
        //   hosted → the delta is PROJECTED onto the host wall and committed as an
        //            `offset` (C15); it needs the HOST record, not just the element.
        switch (type) {
            case 'wall':   this._moveWall(id, dx, dz);               return;
            case 'door':   this._moveHosted(id, 'door',   dx, dz);   return;
            case 'window': this._moveHosted(id, 'window', dx, dz);   return;
        }

        // §FIX-PLAN-MOVE-PARITY (G7) — every other family goes through the ONE shared
        // translate definition, which emits the exact command + payload the 3-D gizmo
        // commits on drag-end. No bespoke mutation is authored here — that is what keeps
        // plan ≡ 3D (and what closes the stair / plumbing plan-move holes: both moved in
        // 3-D and hit `default:` here, so the Move button was enabled and inert).
        const record = this._record(type, id);
        if (!record) {
            console.warn('[MoveTool] Record not found for', type, id);
            return;
        }

        const cmd = buildMoveCommand(type, record, dx, dz);
        if (!cmd) {
            // Be LOUD, never inert. An enabled button that does nothing is worse than a
            // missing one (the L-267 lesson) — say WHY, and say it in the UI.
            const reason = MOVE_UNSUPPORTED_REASON[type];
            console.warn(
                reason
                    ? `[MoveTool] "${type}" cannot be moved yet — ${reason}`
                    : `[MoveTool] No move implementation for element type: ${type}`,
            );
            window.runtime?.events?.emit('pryzm:toast', {
                message: `Move is not available for ${type} yet.`,
                severity: 'info',
            });
            return;
        }

        const bus = this._ctx?.runtime?.bus ?? window.runtime?.bus;
        if (!bus) { console.warn('[MoveTool] No command bus — move dropped'); return; }

        bus.executeCommand(cmd.type, cmd.payload)?.catch((e: unknown) => {
            console.error(`[MoveTool] ${cmd.type} failed:`, e);
            window.runtime?.events?.emit('pryzm:toast', {
                message: `Couldn't move the ${type} — ${e instanceof Error ? e.message : String(e)}`,
                severity: 'error',
            });
        });
        console.log('[MoveTool]', type, 'moved:', id, `Δ(${dx.toFixed(3)}, ${dz.toFixed(3)})`, '→', cmd.type);
    }

    /**
     * The live geometry-store record for `id`. These are the SAME stores the 3-D drag
     * handler reads its pre-move pose from, so the payload the shared builder produces
     * from them is identical on both surfaces.
     */
    private _record(type: string, id: string): unknown | null {
        const stores: Record<string, unknown> = {
            'curtain-wall':  window.curtainWallStore, // TODO(TASK-08)
            curtainwall:     window.curtainWallStore, // TODO(TASK-08)
            column:          window.columnStore,      // TODO(TASK-08)
            beam:            window.beamStore,        // TODO(TASK-08)
            floor:           window.floorStore,       // TODO(TASK-08)
            ceiling:         window.ceilingStore,     // TODO(TASK-08)
            roof:            window.roofStore,        // TODO(TASK-08)
            furniture:       window.furnitureStore,   // TODO(TASK-08)
            plumbing:        window.plumbingStore,    // TODO(TASK-08)
            plumbingfixture: window.plumbingStore,    // TODO(TASK-08)
            stair:           window.stairStore,       // TODO(TASK-08)
            stairs:          window.stairStore,       // TODO(TASK-08)
            room:            window.roomStore,        // TODO(TASK-08)
            // §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — the GEOMETRY stores (the same ones the 3-D
            // drag handler reads its pre-move pose from), NOT the detached plugin DTO stores.
            slab:            window.slabStore,        // TODO(TASK-08)
            handrail:        window.handrailStore,    // TODO(TASK-08)
            railing:         window.handrailStore,    // TODO(TASK-08)
        };
        const s = stores[type] as
            | { get?: (id: string) => unknown; getById?: (id: string) => unknown }
            | undefined;
        const rec = s?.get?.(id) ?? s?.getById?.(id) ?? null;
        // `stair.move` is DELTA-based (§STAIR-3D-MOVE): the 3-D gizmo dispatches it from
        // `userData.id` alone and never reads the store. Mirror that exactly so the plan
        // move cannot be blocked by a store-lookup shape the 3-D path never needed.
        if (!rec && (type === 'stair' || type === 'stairs')) return { id };
        return rec;
    }

    // ── Wall ─────────────────────────────────────────────────────────────────

    private async _moveWall(id: string, dx: number, dz: number): Promise<void> {
        if (!window.__pryzmInitComplete) {
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

        // §C83-S1-MOVE (L-885) — THE PLAN-DRAG SEAM, and the one the founder hit.
        //
        // Their console for the reported sequence reads `[PlanDrag] wall drag started`
        // → `EXECUTE: UPDATE_WALL_BASELINE` → `EXECUTE: CASCADE_WALL_BASELINE` →
        // `§MOVE-REWELD-DISPATCH`, i.e. this handler. The create-side gates shipped in
        // L-882 cannot see a move, which is why the defect survived them.
        //
        // Placed BEFORE both branches so it covers the single-wall move and the
        // carry-neighbours cascade alike, and before the confirmation flow so a plan
        // is never minted for a move that cannot happen — an approvable card offering
        // an IMPOSSIBLE arrangement is worse than no card (C83 §5.4: if it offers a
        // Confirm button, it was never a refusal).
        //
        // Only the DRAGGED wall is gated here; the carried neighbours are gated
        // atomically inside `CascadeWallBaselineCommand.canExecute`. That split is
        // deliberate — the user asked about this wall, so this is the one the message
        // should name.
        const spatialMove = gateWallMove(id, next);
        if (spatialMove.blocked) {
            console.warn(
                '[MoveTool] §C83-S1-MOVE REFUSED wall move —',
                spatialMove.verdict?.reason,
            );
            hideConsequencePreview();
            // Nothing dispatched: the store still holds the pre-drag baseline at this
            // point, so declining here leaves the model exactly as it was. The plan
            // overlay is cleared so no stale preview implies the move landed.
            return;
        }

        if (entries.length === 1) {
            // [F-1.2 R2/R3 §E.5.x] BUS-PRIMARY — bus handler bridges to commandManager.
            // Direct window.commandManager call removed; bus fires UpdateWallBaselineHandler
            // which calls initBusHandlers bridge → commandManager.execute() (undo-stack entry).
            //
            // BIM30 R6 — THE CONFIRM-TIME SEAM. The gesture is finished and this payload is
            // FINAL, so a plan minted now describes exactly what would happen. It is shown,
            // the user's approval binds its planHash, and the executor re-verifies that hash
            // at dispatch (ADR-0322 §10). Below the confirmation threshold the flow answers
            // `autoProceed` and the move runs with NO card — R6 point 5: a plan with no
            // refusals, no new violations and no removals must not nag.
            hideConsequencePreview();
            void this._commitWallMoveThroughConfirmation(id, {
                wallId:       id,
                newBaseLine:  next,
                prevBaseLine: prev,
            });
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

    /**
     * BIM30 R6 — commit a finished single-wall move THROUGH the confirmation flow.
     *
     * The sequence, and why each step is where it is:
     *   1. mint a FRESH plan over CURRENT state for the FINAL payload (`request`). Not the
     *      hover plan — that one is stale by construction the moment the cursor moves again,
     *      which is exactly why R4 shipped its binding wired to nothing.
     *   2. the flow classifies the plan (confirmationPolicy.ts) and, when the requirement is
     *      not `none`, shows the card. The card's Confirm button carries THAT planHash, and
     *      the flow's own handler (composed in confirmationFlowComposition) executes on click.
     *   3. when the requirement IS `none`, nothing is shown and the move proceeds immediately
     *      — still BOUND to the plan, so the report still reconciles predicted-vs-actual.
     *
     * FALLBACK, deliberately loud rather than silent: if no plan can be produced (no planner
     * composed, a payload the normaliser rejects, a bus that is not there), the move still
     * dispatches the way it always did. A confirmation layer that could SWALLOW a user's edit
     * because its planner was missing would be a regression dressed as a safety feature — the
     * plan-less dispatch is R4's `unplanned` arm and it reports the typed absence of a
     * prediction rather than inventing one.
     */
    private async _commitWallMoveThroughConfirmation(
        id: string,
        payload: { wallId: string; newBaseLine: unknown; prevBaseLine: unknown },
    ): Promise<void> {
        const bus = this._ctx?.runtime?.bus ?? window.runtime?.bus;
        // C78 §10.2 — a plan-less dispatch is a TYPED outcome, never a console line.
        // This used to call `bus.executeCommand` directly and log the reason, which made
        // a missing planner indistinguishable from a successful, fully-predicted move:
        // no consequence answer, no read-back, nothing rendered. `dispatchPlanless` runs
        // the SAME bus dispatch through the R4 executor with no plan, so the caller (and
        // the R5 report surface) get the `unplanned` arm with `NO_PLAN_SUPPLIED` and the
        // independent read-back of what actually changed.
        const dispatchDirect = (why: string): void => {
            if (!bus) return;
            void dispatchPlanless(bus as never, { type: 'wall.updateBaseline', payload }, why)
                .catch((e: unknown) => console.error('[MoveTool] wall.updateBaseline failed:', e));
        };
        if (!bus) { console.warn('[MoveTool] No command bus — move dropped'); return; }

        const command = { type: 'wall.updateBaseline', payload };
        try {
            const request = await requestWallMoveConfirmation(bus as never, command);
            if (request.kind === 'refused') {
                // ⭐ §B.4 / C78 §8.8 — THE ESCAPE HATCH, and the cause travels WITH it.
                //
                // This read `request.refusal.kind`, which is the constant `'NO_PLAN_AVAILABLE'`
                // for all four causes — so the `why` recorded on the plan-less dispatch was the
                // same string whether no planner family exists for this verb, the payload was
                // malformed, the family exists but is unwired, or the planner threw. The typed
                // refusal was carried to the one place a human could act on it and thrown away
                // there. The move still goes through (a confirmation layer must never swallow
                // an edit because its planner was missing), but the typed reason now rides
                // along, so the `unplanned` outcome names WHICH gap it fell through.
                const r = request.refusal;
                dispatchDirect(
                    `${r.reason}${r.subReason !== undefined ? `/${r.subReason}` : ''}: ${r.detail}`,
                );
                return;
            }

            if (request.autoProceed) {
                // Below the threshold: execute the plan the flow is holding, bound to its hash.
                const outcome = await proceedWithoutConfirmation(bus as never, request.plan.planHash);
                if (outcome.kind !== 'executed') {
                    // The model moved between minting and this call (a collaborator, a sync
                    // merge). Even with no card on screen the binding still refuses — it is not
                    // the CARD that makes the approval safe, it is the hash.
                    console.warn(`[MoveTool] R6 auto-proceed refused as ${outcome.kind} — nothing executed; the model changed under the plan.`);
                }
                return;
            }
            // Above the threshold: the card is up and owns the decision. Nothing dispatches
            // here — that is the whole point of "the user never confirms before seeing the plan".
            console.log('[MoveTool] R6 — confirmation', request.policy.requirement, 'for wall', id,
                '· reasons:', request.policy.reasons.join(', '), '· plan', request.plan.planHash);
        } catch (e) {
            dispatchDirect('confirmation flow threw: ' + String(e));
        }
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
