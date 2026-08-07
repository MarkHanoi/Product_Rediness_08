/**
 * PlanElementDragController — 2D Plan View Element Movement
 *
 * Implements Revit-style drag movement for walls, doors, and windows in the
 * 2D plan view canvas. Architecture matches the annotation-drag pattern in
 * PlanViewInteraction: live store preview → CommandManager commit on mouseup.
 *
 * Supported workflows
 * ───────────────────
 *   • Wall drag     — translates both endpoints by (ΔX, ΔZ); 100 mm grid snap
 *   • Door drag     — constrained 1D movement along host wall; live offset
 *   • Window drag   — same as door
 *
 * Overlay rendering
 * ─────────────────
 * The controller owns a transparent <canvas> element overlaid on the plan view
 * canvas. It clears and redraws this overlay on every rAF tick while a drag is
 * active, then removes it on end/cancel. This avoids any coupling back into the
 * PlanViewCanvas render pipeline.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { Point3D } from '../types/GeometryDTO';
import type { PlanViewCanvas } from './PlanViewCanvas';
// §FEAT-WALL-MOVE-DIMENSIONS (founder L-29) — pure move-time perpendicular set-out.
// Direct file import (not the barrel) to avoid barrel-at-module-load coupling
// (memory: SCC — no barrel access at module load in core-app-model).
import {
    computeWallMoveDimensions,
    type MoveWallSegment,
} from '../geometry/wallMoveDimensions';
// §FEAT-HOSTED-MOVE-DIMENSIONS (founder L-30) — pure along-wall set-out for a hosted
// door/window dragged along its host wall. Sibling to the L-29 wall move dims; same
// direct-file import to avoid barrel-at-module-load coupling (memory: SCC).
import {
    computeHostedMoveDimensions,
    type HostedNeighbourOpening,
} from '../geometry/hostedMoveDimensions';
// §FEAT-PLAN-HOSTED-DRAG-HANDLES (founder, 2026-08-07) — the host-PARAMETER layer of
// the hosted drag: arc-aware cursor→offset projection, the occupancy-clamped slide,
// and the two-arrow affordance layout shared with the plan renderer. Same direct-file
// import convention as the two dimension modules above (memory: SCC — no barrel access
// at module load in core-app-model).
import {
    projectCursorToHostOffset,
    resolveHostedSlide,
    computeHostedHandleLayout,
    hitTestHostedHandles,
    type HostedDragHost,
    type HostedHandleLayout,
} from '../geometry/hostedDragParam';
// Arc primitives for the constraint rail + dimension witnesses. `@pryzm/geometry-wall`
// is the single owner of wall centreline maths (agent-8's §FEAT-HOSTED-ON-CURVED-WALL);
// this module CALLS it and never reimplements it.
import { wallCentreline, arcFrameAt } from '@pryzm/geometry-wall';

const GRID_SNAP_M    = 0.1;   // 100 mm grid
const DRAG_THRESHOLD = 4;     // px before drag activates
// §FIX-PLAN-WALL-TRANSFORM (founder L-43) — grab radius (px) around a wall
// endpoint that switches the drag from whole-wall MOVE to endpoint ROTATE/stretch.
// Mirrors the 3D WallEndpointController hit-zone; this is the plan-view rotate
// affordance (drag an end to swing the wall about the opposite end).
const ENDPOINT_GRAB_PX = 14;

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function clonePt(p: Point3D): Point3D { return { x: p.x, y: p.y, z: p.z }; }

function gridSnap(v: number): number {
    return Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;
}

// §FEAT-PLAN-HOSTED-DRAG-HANDLES — the former `projectOntoSegment` chord helper is
// gone: hosted openings now project onto the host CENTRELINE via
// `projectCursorToHostOffset` (arc-aware), and the wall branch never used it.

function formatM(m: number): string {
    return m < 0.01 ? `${Math.round(m * 1000)} mm` : `${m.toFixed(2)} m`;
}

/**
 * §FEAT-PLAN-HOSTED-DRAG-HANDLES — the host's CENTRELINE as a screen-space
 * polyline. One point for a straight wall's two ends; the sampled arc for a
 * curved one. This is the path the opening's single degree of freedom actually
 * runs along, so it is what the constraint rail must trace.
 */
export function hostCentrelineScreenPath(
    host: HostedDragHost,
    toScreen: (wx: number, wz: number) => { sx: number; sy: number },
): Array<{ sx: number; sy: number }> {
    return wallCentreline(host).pts.map(p => toScreen(p.x, p.z));
}

/**
 * §FEAT-PLAN-HOSTED-DRAG-HANDLES — draw the founder's two arrows.
 *
 * The plan reading of the 3-D gizmo idiom (`HostedElementDragController`'s amber
 * rail with a cone at each end): a filled triangular head on a short stem, one at
 * each end of the opening, pointing ALONG the host. Purple `#6600FF` is the app
 * accent already used for plan selection (`_renderSelectionHighlights`) and for
 * preview geometry, so the arrows read as "this selected thing is grabbable"
 * rather than as a new, unexplained colour.
 *
 * Exported so the static (pre-drag) affordance in `PlanViewCanvas` and the live
 * drag overlay draw the IDENTICAL glyph — the arrows must not change shape at the
 * moment the user grabs them.
 */
export function drawHostedArrows(
    ctx: CanvasRenderingContext2D,
    layout: HostedHandleLayout,
    color: string,
): void {
    const HEAD = 8;      // head length, px
    const HALF = 4.5;    // head half-width, px

    ctx.save();
    for (const h of layout.handles) {
        // Stem
        ctx.beginPath();
        ctx.moveTo(h.baseSx, h.baseSy);
        ctx.lineTo(h.tipSx - h.dirSx * HEAD, h.tipSy - h.dirSy * HEAD);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Head — a triangle whose apex is the tip; `perp` is the screen normal.
        const px = -h.dirSy;
        const py = h.dirSx;
        const bx = h.tipSx - h.dirSx * HEAD;
        const by = h.tipSy - h.dirSy * HEAD;
        ctx.beginPath();
        ctx.moveTo(h.tipSx, h.tipSy);
        ctx.lineTo(bx + px * HALF, by + py * HALF);
        ctx.lineTo(bx - px * HALF, by - py * HALF);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag state
// ─────────────────────────────────────────────────────────────────────────────

type DragState =
    | {
          kind: 'wall';
          elementId:      string;
          levelId:        string | undefined;
          prevBaseLine:   [Point3D, Point3D];
          currentBaseLine:[Point3D, Point3D];
          startWorldX:    number; startWorldZ: number;
          startSx:        number; startSy: number;
          activated:      boolean;
          // §FIX-PLAN-WALL-TRANSFORM (founder L-43) — which drag mode this gesture is:
          //   null  → whole-wall MOVE (translate both endpoints; grid-snapped delta)
          //   0 | 1 → endpoint ROTATE/stretch of baseLine[endpoint] about the other end
          // Set at drag-start from the grab point's proximity to a screen endpoint.
          endpoint:       0 | 1 | null;
      }
    | {
          kind: 'door' | 'window';
          elementId:    string;
          wallId:       string;
          /** Opening width, metres — captured once; the drag never changes it. */
          width:        number;
          /**
           * §OPENING-OFFSET-LEFTEDGE-UNIFY — LEFT-EDGE offsets, the canonical datum
           * (`WallOccupancyStore.OpeningDims`, `SetDoorOffsetCommand`, C15 §2).
           */
          prevOffset:   number;
          currentOffset:number;
          /**
           * §FEAT-PLAN-HOSTED-DRAG-HANDLES — the HOST itself, not a pair of
           * endpoints. Everything positional is derived from its CENTRELINE via
           * `@pryzm/geometry-wall`'s arc parameterisation, so a curved host works
           * unchanged (the chord would put the opening off the wall face).
           */
          host:         HostedDragHost;
          /** Host CENTRELINE (arc) length, metres — the extent of the single DOF. */
          hostLength:   number;
          startSx:      number; startSy: number;
          activated:    boolean;
          /**
           * Which affordance started the gesture. All three drive the SAME 1-D
           * parameter edit — a hosted opening has one degree of freedom, so the
           * grab point cannot change the MEANING of the drag, only its discovery.
           */
          grabbed:      'start' | 'end' | 'body';
          /** Live constraint state — drives the red overlay while dragging. */
          blocked:      boolean;
          blockReason?: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────────────────────────────────────

export class PlanElementDragController {
    private _state:       DragState | null     = null;
    private _planCanvas:  PlanViewCanvas | null = null;
    private _domCanvas:   HTMLCanvasElement | null = null;

    /** Overlay canvas for drag ghost + dimension labels. */
    private _overlay:     HTMLCanvasElement | null = null;
    private _rafPending   = false;

    get isDragging():  boolean { return this._state !== null; }
    get isActivated(): boolean { return this._state?.activated ?? false; }

    // ──────────────────────────────────────────────────────────────────────
    // Hit-test
    // ──────────────────────────────────────────────────────────────────────

    hitTestDraggable(
        sx: number,
        sy: number,
        planCanvas: PlanViewCanvas,
    ): { elementId: string; kind: 'wall' | 'door' | 'window'; grabbed?: 'start' | 'end' | 'body' } | null {
        // §FEAT-PLAN-HOSTED-DRAG-HANDLES — the two arrows on the SELECTED opening
        // are tested FIRST and win outright. They are a deliberate 12 px grab zone
        // drawn on top of the plan linework, so without priority the wall segment
        // underneath (8–10 px threshold) would frequently steal the gesture and the
        // affordance would feel broken exactly where it is most visible.
        //
        // Placing this INSIDE hitTestDraggable — rather than adding a branch to
        // PlanViewInteraction — is what preserves §FIX-PLAN-VIEW-PARITY (L-73): the
        // main plan pane and the split-view pane both drive this one singleton, so
        // both acquire the affordance from a single change and cannot diverge.
        const handleHit = this.hitTestHostedHandle(sx, sy, planCanvas);
        if (handleHit) return handleHit;

        const elementId = planCanvas.hitTest(sx, sy, 10);
        if (!elementId) return null;
        const ws = this._ws();
        if (!ws) return null;
        if (ws.getDoor(elementId))   return { elementId, kind: 'door',   grabbed: 'body' };
        if (ws.getWindow(elementId)) return { elementId, kind: 'window', grabbed: 'body' };
        if (ws.getById(elementId))   return { elementId, kind: 'wall' };
        return null;
    }

    /**
     * §FEAT-PLAN-HOSTED-DRAG-HANDLES — resolve the currently-selected hosted
     * opening (if any) together with its host wall. Shared by the hit-test and by
     * `PlanViewCanvas`'s handle renderer, so the arrows drawn and the arrows
     * grabbable are derived from ONE resolution of "what is selected".
     *
     * Returns `null` whenever no hosted opening is selected — in particular during
     * an active drag, because the drag overlay then owns the feedback and leaving
     * static arrows underneath it would double-draw the affordance.
     */
    resolveSelectedHosted(): {
        elementId: string;
        kind: 'door' | 'window';
        host: HostedDragHost;
        offset: number;
        width: number;
    } | null {
        if (this._state) return null;                   // drag overlay owns the view
        const ws = this._ws();
        if (!ws) return null;

        const sel = (window as unknown as {
            selectionManager?: { selectedObject?: { userData?: { id?: string; elementUUID?: string } } };
        }).selectionManager?.selectedObject?.userData;
        const elementId = sel?.id ?? sel?.elementUUID;
        if (!elementId) return null;

        const door = ws.getDoor?.(elementId);
        const win  = door ? undefined : ws.getWindow?.(elementId);
        const el   = door ?? win;
        if (!el) return null;

        const host = ws.getById?.(el.wallId) as HostedDragHost | undefined;
        if (!host?.baseLine) return null;
        if (typeof el.offset !== 'number' || typeof el.width !== 'number') return null;

        return {
            elementId,
            kind: door ? 'door' : 'window',
            host,
            offset: el.offset,
            width:  el.width,
        };
    }

    /**
     * §FEAT-PLAN-HOSTED-DRAG-HANDLES — the affordance layout for the selected
     * hosted opening, in this canvas's screen space, or `null` if there is none.
     * This is the SINGLE definition of where the arrows are; `PlanViewCanvas`
     * draws exactly what this returns and `hitTestHostedHandle` grabs exactly what
     * this returns, so the visual and the interactive affordance cannot drift.
     */
    handleLayoutFor(planCanvas: PlanViewCanvas): HostedHandleLayout | null {
        const sel = this.resolveSelectedHosted();
        if (!sel) return null;
        return computeHostedHandleLayout(
            sel.host, sel.offset, sel.width,
            (wx, wz) => planCanvas.worldToScreen(wx, wz),
        );
    }

    /** §FEAT-PLAN-HOSTED-DRAG-HANDLES — did the pointer land on one of the arrows? */
    hitTestHostedHandle(
        sx: number,
        sy: number,
        planCanvas: PlanViewCanvas,
    ): { elementId: string; kind: 'door' | 'window'; grabbed: 'start' | 'end' } | null {
        const sel = this.resolveSelectedHosted();
        if (!sel) return null;
        const layout = computeHostedHandleLayout(
            sel.host, sel.offset, sel.width,
            (wx, wz) => planCanvas.worldToScreen(wx, wz),
        );
        const hit = hitTestHostedHandles(layout, sx, sy);
        if (!hit) return null;
        return { elementId: sel.elementId, kind: sel.kind, grabbed: hit.side };
    }

    // ──────────────────────────────────────────────────────────────────────
    // Start
    // ──────────────────────────────────────────────────────────────────────

    startDrag(
        hit:       { elementId: string; kind: 'wall' | 'door' | 'window'; grabbed?: 'start' | 'end' | 'body' },
        sx:        number,
        sy:        number,
        planCanvas:PlanViewCanvas,
        domCanvas: HTMLCanvasElement,
    ): boolean {
        this.cancel();
        this._planCanvas = planCanvas;
        this._domCanvas  = domCanvas;

        const ws = this._ws();
        if (!ws) return false;

        const { worldX, worldZ } = planCanvas.screenToWorld(sx, sy);

        if (hit.kind === 'wall') {
            const wall = ws.getById(hit.elementId);
            if (!wall) return false;
            // §FIX-PLAN-WALL-TRANSFORM (founder L-43) — decide MOVE vs ROTATE by the
            // grab point's screen proximity to an endpoint. Only arm the endpoint
            // (rotate) mode when the wall is long enough on screen that the two grab
            // zones don't overlap the middle — otherwise a short wall would never be
            // movable. Reuses the same worldToScreen projection the overlay uses.
            const endpoint = this._pickWallEndpoint(
                sx, sy, wall.baseLine[0], wall.baseLine[1], planCanvas,
            );
            this._state = {
                kind:           'wall',
                elementId:      hit.elementId,
                levelId:        (wall as { levelId?: string }).levelId,
                prevBaseLine:   [clonePt(wall.baseLine[0]), clonePt(wall.baseLine[1])],
                currentBaseLine:[clonePt(wall.baseLine[0]), clonePt(wall.baseLine[1])],
                startWorldX:    worldX, startWorldZ: worldZ,
                startSx:        sx,     startSy:     sy,
                activated:      false,
                endpoint,
            };
        } else {
            const opening = hit.kind === 'door' ? ws.getDoor(hit.elementId) : ws.getWindow(hit.elementId);
            if (!opening) return false;
            const wall = ws.getById(opening.wallId) as HostedDragHost | undefined;
            if (!wall?.baseLine) return false;

            // §FEAT-PLAN-HOSTED-DRAG-HANDLES — the host's extent is its CENTRELINE
            // ARC length, not the chord between its endpoints. `resolveHostedSlide`
            // reports it (via `wallCentrelineLength`) as a by-product of validating
            // the opening's CURRENT position, so one call establishes both. For a
            // straight wall the arc IS the chord and this is the previous number
            // exactly — no straight-wall behaviour change.
            const probe = resolveHostedSlide(wall, opening.offset, opening.width, hit.elementId);
            if (!(probe.hostLength > 0)) return false;

            this._state = {
                kind:          hit.kind,
                elementId:     hit.elementId,
                wallId:        opening.wallId,
                width:         opening.width,
                prevOffset:    opening.offset,
                currentOffset: opening.offset,
                host:          wall,
                hostLength:    probe.hostLength,
                startSx:       sx, startSy: sy,
                activated:     false,
                grabbed:       hit.grabbed === 'start' || hit.grabbed === 'end' ? hit.grabbed : 'body',
                blocked:       false,
            };
        }

        this._ensureOverlay(domCanvas);
        console.log(`[PlanDrag] ${hit.kind} drag started:`, hit.elementId);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Move
    // ──────────────────────────────────────────────────────────────────────

    onMove(sx: number, sy: number): void {
        const state = this._state;
        if (!state || !this._planCanvas) return;

        if (!state.activated) {
            if (Math.hypot(sx - state.startSx, sy - state.startSy) < DRAG_THRESHOLD) return;
            state.activated = true;
            // §FIX-WALLMOVE-REDETECT-DEFER / §FIX-WALLMOVE-PLAN-INCREMENTAL (ADR-0098
            // F3 / queue Q6, 2026-07-02) — INVARIANT: a plan-view wall drag live-updates
            // the WallStore per mousemove (`_moveWall → ws.update`). Each such update
            // fans out to BOTH the WallRebuildCoordinator (whole-level resolve +
            // `bim-wall-mutation-committed`) AND the ViewDependencyTracker (plan
            // re-projection) AND the RoomTopologyObserver (redetect). Without a
            // drag-in-progress signal the ENTIRE cascade fired PER mousemove → main-
            // thread peg → freeze. Raise the SAME flag the 3D gizmo uses (ADR-061) at
            // drag-activation for a WALL so those three consumers defer to release;
            // the mesh still follows live (the store update rebuilds the wall body via
            // the deferred flush drained at drag-end). Cleared in `onEnd`/`cancel`
            // BEFORE the authoritative commit so exactly one cascade runs on release.
            if (state.kind === 'wall' && typeof window !== 'undefined') {
                (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = true;
            }
        }

        const { worldX, worldZ } = this._planCanvas.screenToWorld(sx, sy);
        const ws = this._ws();
        if (!ws) return;

        if (state.kind === 'wall') {
            this._moveWall(state, worldX, worldZ, ws);
        } else {
            this._moveDoorWindow(state, worldX, worldZ, ws);
        }

        this._scheduleOverlayRender();
    }

    private _moveWall(
        state:   Extract<DragState, { kind: 'wall' }>,
        worldX:  number,
        worldZ:  number,
        ws:      any,
    ): void {
        // §FIX-PLAN-WALL-TRANSFORM (founder L-43) — ROTATE/stretch branch: swing the
        // grabbed endpoint about the opposite (fixed) end. The plan-view parity of the
        // 3D WallEndpointController. VISUAL-ONLY during the drag (no live store write):
        //   • a rotate can swing the baseline past 90°, which WallStore.update rejects
        //     with BaselineReversalError for walls that host openings — mutating live
        //     would throw mid-move and abort the gesture. The single authoritative
        //     commit on release (UpdateWallBaselineCommand) handles the reversal via
        //     its §FT4 endpoint-normalisation, exactly like the 3D endpoint drag.
        //   • the blue ghost overlay shows the live angle; the wall settles on release.
        if (state.endpoint !== null) {
            const movingIdx = state.endpoint;
            const fixedIdx  = movingIdx === 0 ? 1 : 0;
            const fixed     = state.prevBaseLine[fixedIdx];
            const moving: Point3D = {
                x: gridSnap(worldX),
                y: state.prevBaseLine[movingIdx].y,
                z: gridSnap(worldZ),
            };
            // Ignore frames that would collapse the wall below the command's 0.1 m floor.
            if (Math.hypot(moving.x - fixed.x, moving.z - fixed.z) < 0.1) return;
            const newBaseLine: [Point3D, Point3D] = movingIdx === 0
                ? [moving, clonePt(fixed)]
                : [clonePt(fixed), moving];
            state.currentBaseLine = newBaseLine;
            return;
        }

        // MOVE branch — translate both endpoints by the grid-snapped delta.
        const deltaX = gridSnap(worldX - state.startWorldX);
        const deltaZ = gridSnap(worldZ - state.startWorldZ);
        const newA: Point3D = { x: state.prevBaseLine[0].x + deltaX, y: state.prevBaseLine[0].y, z: state.prevBaseLine[0].z + deltaZ };
        const newB: Point3D = { x: state.prevBaseLine[1].x + deltaX, y: state.prevBaseLine[1].y, z: state.prevBaseLine[1].z + deltaZ };
        state.currentBaseLine = [newA, newB];

        // Live store update — triggers 3D rebuild and plan re-projection
        const wall = ws.getById(state.elementId);
        ws.update(state.elementId, {
            baseLine: [newA, newB],
            _renderVersion: (wall?._renderVersion ?? 0) + 1,
        });
    }

    /**
     * §FIX-PLAN-WALL-TRANSFORM (founder L-43) — classify a wall grab as an endpoint
     * (ROTATE) or a body (MOVE) drag. Returns the endpoint index when the cursor is
     * within ENDPOINT_GRAB_PX of a baseline endpoint AND the wall is long enough on
     * screen that the two endpoint zones don't swallow the whole segment; otherwise
     * null (whole-wall move). Pure screen-space geometry — no store writes.
     */
    private _pickWallEndpoint(
        sx: number, sy: number,
        a: Point3D, b: Point3D,
        planCanvas: PlanViewCanvas,
    ): 0 | 1 | null {
        const aSc = planCanvas.worldToScreen(a.x, a.z);
        const bSc = planCanvas.worldToScreen(b.x, b.z);
        const wallPx = Math.hypot(bSc.sx - aSc.sx, bSc.sy - aSc.sy);
        // Too short on screen → keep it movable (rotate would be ambiguous/unusable).
        if (wallPx < ENDPOINT_GRAB_PX * 2.5) return null;
        const dA = Math.hypot(sx - aSc.sx, sy - aSc.sy);
        const dB = Math.hypot(sx - bSc.sx, sy - bSc.sy);
        if (dA > ENDPOINT_GRAB_PX && dB > ENDPOINT_GRAB_PX) return null;
        return dA <= dB ? 0 : 1;
    }

    /**
     * §FEAT-PLAN-HOSTED-DRAG-HANDLES — the 1-D parameter edit at the heart of the
     * gesture. A hosted opening has exactly ONE degree of freedom, so this is not
     * a constrained 2-D translation: the cursor is projected onto the host
     * CENTRELINE and the result is a scalar `offset`.
     *
     * Three defects in the previous implementation are closed here.
     *
     * 1. ⚠ WRONG DATUM (the shipping bug behind "moving a door in plan is
     *    difficult"). It clamped to `[width/2, wallLength − width/2]` and stored
     *    that as `offset` — i.e. it treated `offset` as the opening's CENTRE.
     *    The canonical datum is the LEFT EDGE: `WallOccupancyStore.OpeningDims`
     *    documents "LEFT-EDGE offset", `canPlace` tests the interval
     *    `[offset, offset + width]`, `clampToWall` clamps to
     *    `[0, wallLength − width]`, and the 3-D controller subtracts `width/2`
     *    from the projected centre (§OPENING-OFFSET-LEFTEDGE-UNIFY). So every
     *    plan drag landed the opening HALF ITS WIDTH further along the wall than
     *    the cursor, and near the far end pushed the span past the wall.
     *
     * 2. CHORD, NOT ARC. `projectOntoSegment` onto `baseLine[0]→baseLine[1]`
     *    ignores `wall.curve`. On a curved host the opening left the wall face.
     *
     * 3. NO CONSTRAINT UNTIL DROP. Nothing consulted `WallOccupancyStore`, so the
     *    preview wrote an overlapping offset into the store per mousemove and
     *    `SetDoorOffsetCommand.canExecute` refused the commit on release —
     *    leaving the store holding an illegal position with NO undo entry behind
     *    it. `resolveHostedSlide` now clamps to the nearest legal offset, so the
     *    previewed value is legal by construction and the commit cannot be
     *    refused; `state.blocked` drives the red overlay so the user sees the
     *    obstruction BEFORE releasing.
     */
    private _moveDoorWindow(
        state:  Extract<DragState, { kind: 'door' | 'window' }>,
        worldX: number,
        worldZ: number,
        ws:     any,
    ): void {
        // Cursor grabs the opening's CENTRE → LEFT-EDGE offset (arc-aware).
        const rawOffset = projectCursorToHostOffset(state.host, worldX, worldZ, state.width);
        const snapped   = gridSnap(rawOffset);

        // `state.currentOffset` makes a neighbouring opening act as a physical STOP
        // rather than a magnet — see `resolveHostedSlide`'s `fromOffset`.
        const slide = resolveHostedSlide(
            state.host, snapped, state.width, state.elementId, state.currentOffset,
        );
        state.blocked = slide.blocked;
        if (slide.reason) state.blockReason = slide.reason; else delete state.blockReason;

        // No legal position anywhere on this host — hold the last legal offset.
        if (slide.offset === null) return;
        if (slide.offset === state.currentOffset) return;    // no-op frame; skip the store write

        state.currentOffset = slide.offset;

        if (state.kind === 'door')   ws.updateDoor(state.elementId,   { offset: slide.offset });
        else                         ws.updateWindow(state.elementId, { offset: slide.offset });
    }

    // ──────────────────────────────────────────────────────────────────────
    // End
    // ──────────────────────────────────────────────────────────────────────

    async onEnd(): Promise<void> {
        const state = this._state;
        this._state = null;
        this._removeOverlay();
        this._planCanvas = null;
        this._domCanvas  = null;

        // §FIX-WALLMOVE-REDETECT-DEFER — clear the drag flag BEFORE the authoritative
        // commit so the store `update` the command produces takes the immediate path
        // (one whole-level flush → one `bim-wall-mutation-committed` → one redetect +
        // one plan re-projection). Any per-mousemove wall events that WERE deferred are
        // drained by this same commit's flush; the safety-net drain below covers the
        // sub-threshold / no-command case. Runs for every drag kind (only walls ever
        // set the flag, so clearing unconditionally is safe + cheap).
        const wasWallDrag = state?.kind === 'wall';
        if (typeof window !== 'undefined') {
            (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
        }

        if (!state || !state.activated) {
            // Activated never became true (or state cleared) — still drain any deferred
            // wall-drag events so a partial drag doesn't leave the wall un-rebuilt.
            if (wasWallDrag) {
                try { (window as unknown as { __wallRebuildControl?: { resumeAndFlushDeferredDrag?: () => void } }).__wallRebuildControl?.resumeAndFlushDeferredDrag?.(); }
                catch { /* coordinator optional */ }
            }
            return;
        }

        const bus = this._bus();
        if (!bus) {
            console.warn('[PlanDrag] No command bus — drag has no undo');
            // §FIX-WALLMOVE-REDETECT-DEFER — still drain deferred events so the wall settles.
            if (wasWallDrag) {
                try { (window as unknown as { __wallRebuildControl?: { resumeAndFlushDeferredDrag?: () => void } }).__wallRebuildControl?.resumeAndFlushDeferredDrag?.(); }
                catch { /* coordinator optional */ }
            }
            return;
        }

        if (state.kind === 'wall') {
            // §FIX-PLAN-WALL-MOVE-UNDO-UNIFY (L-51) — route the plan-view wall
            // move/rotate commit through the BUS (`wall.updateBaseline`), exactly as
            // the 3D transform gizmo (registerTransformDragHandler) and the plan
            // Move/Align tools already do. The bus pushes the forward/inverse patch
            // pair to the unified ring-buffer timeline AND (via the initBusHandlers
            // bridge) calls commandManager.execute for the WallRebuildCoordinator —
            // the same dual-dispatch as a 3D-gizmo move, which performUndoRedo
            // reconciles (ring-first + shadow-drop). Previously THIS lone path used
            // `commandManager.execute(new UpdateWallBaselineCommand(...))` directly,
            // so a plan move landed ONLY on the commandManager stack while a 3D-gizmo
            // move landed on the ring buffer — the two stacks have independent cursors
            // (ADR-051), so an interleaved plan+3D move sequence undid OUT OF ORDER.
            bus.executeCommand('wall.updateBaseline', {
                wallId:       state.elementId,
                newBaseLine:  state.currentBaseLine,
                prevBaseLine: state.prevBaseLine,
            })?.catch((e: unknown) => console.error('[PlanDrag] wall.updateBaseline failed:', e));
            console.log('[PlanDrag] Wall committed Δ(',
                (state.currentBaseLine[0].x - state.prevBaseLine[0].x).toFixed(3), ',',
                (state.currentBaseLine[0].z - state.prevBaseLine[0].z).toFixed(3), ')');
            return;
        }

        // ── Hosted opening: ONE gesture ⇒ ONE undoable command ────────────────
        // §FEAT-PLAN-HOSTED-DRAG-HANDLES. The whole drag coalesces here and
        // nowhere else: `onMove` only mutates a live PREVIEW, and the single
        // authoritative dispatch happens once, on release. `prevOffset` was
        // captured at drag-START, so the command's inverse restores the exact
        // pre-drag offset no matter how many mousemove frames occurred.
        //
        // §P6 / C14 §2.1 — dispatched through the BUS (`door.setOffset` /
        // `window.setOffset`), which is the identical entry point the 3-D
        // `HostedElementDragController.handleDragEnd` uses. Previously this branch
        // called `window.commandManager.execute(new Set*OffsetCommand(...))`
        // directly. That was:
        //   • a live violation of the `check:commandmanager` CI ratchet, which
        //     forbids `commandManager.execute()` anywhere under `packages/`
        //     (this file is `packages/core-app-model/`) — the wall branch above
        //     was migrated by §FIX-PLAN-WALL-MOVE-UNDO-UNIFY (L-51) and the two
        //     opening branches were simply left behind; and
        //   • a second dispatch shape for a mutation that already had one, so
        //     plan and 3-D could drift. They are now the same call.
        // The `door.setOffset` bus handler wraps the SAME Set*OffsetCommand
        // (initBusHandlers), so `canExecute`, undo/redo idempotency and the
        // WallOccupancyStore validation are all unchanged.
        //
        // A sub-threshold drag never reaches here (`state.activated` is false), so
        // a plain click to select cannot emit a command.
        if (state.currentOffset === state.prevOffset) {
            // Blocked for the whole gesture, or dragged back to the start: nothing
            // moved, so record nothing rather than an empty undo step.
            return;
        }

        if (state.kind === 'door') {
            bus.executeCommand('door.setOffset', {
                doorId:     state.elementId,
                newOffset:  state.currentOffset,
                prevOffset: state.prevOffset,
            })?.catch((e: unknown) => console.error('[PlanDrag] door.setOffset failed:', e));
            console.log('[PlanDrag] Door offset committed', state.prevOffset.toFixed(3), '→', state.currentOffset.toFixed(3));
        } else {
            bus.executeCommand('window.setOffset', {
                windowId:   state.elementId,
                newOffset:  state.currentOffset,
                prevOffset: state.prevOffset,
            })?.catch((e: unknown) => console.error('[PlanDrag] window.setOffset failed:', e));
            console.log('[PlanDrag] Window offset committed', state.prevOffset.toFixed(3), '→', state.currentOffset.toFixed(3));
        }
    }

    /** Escape / cancel — restore original position. */
    cancel(): void {
        const state = this._state;
        if (!state) return;
        this._state = null;
        this._removeOverlay();
        this._planCanvas = null;
        this._domCanvas  = null;

        // §FIX-WALLMOVE-REDETECT-DEFER — clear the drag flag BEFORE the restore
        // `ws.update` so the restore mutation takes the immediate path and settles the
        // wall (one flush + one redetect + one re-projection back to the original line).
        if (state.kind === 'wall' && typeof window !== 'undefined') {
            (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
        }

        if (!state.activated) return;

        const ws = this._ws();
        if (!ws) return;
        if (state.kind === 'wall') {
            ws.update(state.elementId, { baseLine: state.prevBaseLine });
        } else if (state.kind === 'door') {
            ws.updateDoor(state.elementId, { offset: state.prevOffset });
        } else {
            ws.updateWindow(state.elementId, { offset: state.prevOffset });
        }
        console.log('[PlanDrag] Cancelled — position restored');
    }

    // ──────────────────────────────────────────────────────────────────────
    // Overlay canvas
    // ──────────────────────────────────────────────────────────────────────

    private _ensureOverlay(domCanvas: HTMLCanvasElement): void {
        this._removeOverlay();

        const ov = document.createElement('canvas');
        ov.style.cssText = [
            'position:absolute',
            'inset:0',
            'pointer-events:none',
            'z-index:10',
        ].join(';');
        ov.width  = domCanvas.width;
        ov.height = domCanvas.height;

        const container = domCanvas.parentElement;
        if (container) {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            container.appendChild(ov);
        } else {
            // Fallback: position over domCanvas via fixed coords
            ov.style.position = 'fixed';
            const r = domCanvas.getBoundingClientRect();
            ov.style.left   = `${r.left}px`;
            ov.style.top    = `${r.top}px`;
            ov.style.width  = `${r.width}px`;
            ov.style.height = `${r.height}px`;
            document.body.appendChild(ov);
        }

        this._overlay = ov;
    }

    private _removeOverlay(): void {
        this._overlay?.remove();
        this._overlay = null;
        this._rafPending = false;
    }

    /**
     * S85.D-finish.3: coalesce overlay re-renders to one per frame via the
     * canonical `getFrameScheduler().scheduleOnce()` API (architectural
     * replacement for `rAF(cb)`).  The `_rafPending`
     * flag is preserved as the coalescing latch — same semantics: while a
     * render is queued, additional `_scheduleOverlayRender()` calls are
     * dropped.  Drag flushes use `'overlay'` priority so they paint
     * after the main render pass.
     */
    private _scheduleOverlayRender(): void {
        if (this._rafPending || !this._overlay) return;
        this._rafPending = true;
        getFrameScheduler().scheduleOnce('plan-element-drag-overlay', () => {
            this._rafPending = false;
            this._renderOverlay();
        }, 'overlay');
    }

    private _renderOverlay(): void {
        const ov = this._overlay;
        const state = this._state;
        const planCanvas = this._planCanvas;
        if (!ov || !state || !state.activated || !planCanvas) return;

        // Sync size with parent canvas
        const domCanvas = this._domCanvas;
        if (domCanvas && (ov.width !== domCanvas.width || ov.height !== domCanvas.height)) {
            ov.width  = domCanvas.width;
            ov.height = domCanvas.height;
        }

        const ctx = ov.getContext('2d');
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio, 4);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = ov.width  / dpr;
        const cssH = ov.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        if (state.kind === 'wall') {
            this._renderWallOverlay(ctx, state, planCanvas);
        } else {
            this._renderDoorWindowOverlay(ctx, state, planCanvas);
        }
    }

    private _renderWallOverlay(
        ctx:       CanvasRenderingContext2D,
        state:     Extract<DragState, { kind: 'wall' }>,
        planCanvas:PlanViewCanvas,
    ): void {
        const { currentBaseLine: cur, prevBaseLine: prev } = state;

        const aSc = planCanvas.worldToScreen(cur[0].x, cur[0].z);
        const bSc = planCanvas.worldToScreen(cur[1].x, cur[1].z);
        const oldA = planCanvas.worldToScreen(prev[0].x, prev[0].z);
        const oldB = planCanvas.worldToScreen(prev[1].x, prev[1].z);

        // Ghost wall — solid blue stroke
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(aSc.sx, aSc.sy);
        ctx.lineTo(bSc.sx, bSc.sy);
        ctx.strokeStyle = 'rgba(30, 144, 255, 0.85)';
        ctx.lineWidth   = 3;
        ctx.setLineDash([10, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Ghost endpoints (filled circles)
        for (const pt of [aSc, bSc]) {
            ctx.beginPath();
            ctx.arc(pt.sx, pt.sy, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#1E90FF';
            ctx.fill();
        }

        // §FIX-PLAN-WALL-TRANSFORM (founder L-43) — ROTATE overlay: emphasise the
        // pivot (fixed end) + the swinging end, and read out the live length + angle
        // change instead of the perpendicular translate set-out (which only makes
        // sense for a pure move).
        if (state.endpoint !== null) {
            const pivotSc  = state.endpoint === 0 ? bSc : aSc;
            const movingSc = state.endpoint === 0 ? aSc : bSc;
            // Pivot ring
            ctx.beginPath();
            ctx.arc(pivotSc.sx, pivotSc.sy, 7, 0, Math.PI * 2);
            ctx.strokeStyle = '#0A5DCC';
            ctx.lineWidth   = 2;
            ctx.stroke();
            // Swinging end — filled marker
            ctx.beginPath();
            ctx.arc(movingSc.sx, movingSc.sy, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#1E90FF';
            ctx.fill();

            const wallDist = Math.hypot(cur[1].x - cur[0].x, cur[1].z - cur[0].z);
            const prevAng  = Math.atan2(prev[1].z - prev[0].z, prev[1].x - prev[0].x);
            const curAng   = Math.atan2(cur[1].z - cur[0].z,   cur[1].x - cur[0].x);
            let dDeg = (curAng - prevAng) * 180 / Math.PI;
            while (dDeg > 180)  dDeg -= 360;
            while (dDeg < -180) dDeg += 360;
            const midSx = (aSc.sx + bSc.sx) / 2;
            const midSy = (aSc.sy + bSc.sy) / 2;
            this._drawLabel(ctx, midSx, midSy - 14, formatM(wallDist), '#0A5DCC');
            this._drawLabel(ctx, movingSc.sx, movingSc.sy - 16, `${dDeg >= 0 ? '+' : ''}${dDeg.toFixed(1)}°`, '#0A5DCC');
            return;
        }

        // Movement delta dimension
        const deltaX = cur[0].x - prev[0].x;
        const deltaZ = cur[0].z - prev[0].z;
        const dist   = Math.hypot(deltaX, deltaZ);
        if (dist > 0.005) {
            const midOldSx = (oldA.sx + oldB.sx) / 2;
            const midOldSy = (oldA.sy + oldB.sy) / 2;
            const midNewSx = (aSc.sx + bSc.sx) / 2;
            const midNewSy = (aSc.sy + bSc.sy) / 2;
            this._drawDimensionLine(ctx, midOldSx, midOldSy, midNewSx, midNewSy, formatM(dist));
        }

        // Wall length label
        const wallDist = Math.hypot(cur[1].x - cur[0].x, cur[1].z - cur[0].z);
        if (wallDist > 0.1) {
            const midSx = (aSc.sx + bSc.sx) / 2;
            const midSy = (aSc.sy + bSc.sy) / 2;
            this._drawLabel(ctx, midSx, midSy - 14, formatM(wallDist), '#0A5DCC');
        }

        // §FEAT-WALL-MOVE-DIMENSIONS (founder L-29) — live PERPENDICULAR set-out to
        // the nearest PARALLEL neighbour walls above/below. A wall translates
        // perpendicular to itself, so the meaningful feedback while dragging is the
        // gap it is closing / opening on each side. Reuses the SAME blue dashed
        // dimension renderer (`_drawDimensionLine`) the move-delta + hosted-opening
        // dims already use, so the look matches the wall-DRAW set-out affordance.
        this._drawWallMoveDimensions(ctx, state, planCanvas);
    }

    /**
     * §FEAT-WALL-MOVE-DIMENSIONS — draw the perpendicular gap dimension(s) from the
     * moving wall to its nearest parallel neighbour(s). Pure geometry lives in
     * `computeWallMoveDimensions`; this only projects world→screen and delegates
     * to the shared dimension renderer. Read-only (no store writes, no commands) —
     * a transient preview affordance, cleared automatically when the overlay is
     * removed on drag end / cancel.
     */
    private _drawWallMoveDimensions(
        ctx:        CanvasRenderingContext2D,
        state:      Extract<DragState, { kind: 'wall' }>,
        planCanvas: PlanViewCanvas,
    ): void {
        const cur = state.currentBaseLine;
        const movingWall: MoveWallSegment = {
            a: { x: cur[0].x, z: cur[0].z },
            b: { x: cur[1].x, z: cur[1].z },
        };
        const neighbours = this._collectNeighbourSegments(state.elementId, state.levelId);
        if (neighbours.length === 0) return;

        const dims = computeWallMoveDimensions(movingWall, neighbours);
        for (const d of dims) {
            const from = planCanvas.worldToScreen(d.from.x, d.from.z);
            const to   = planCanvas.worldToScreen(d.to.x,   d.to.z);
            this._drawDimensionLine(ctx, from.sx, from.sy, to.sx, to.sy, formatM(d.distanceMm / 1000));
        }
    }

    /**
     * §FEAT-WALL-MOVE-DIMENSIONS — the level's OTHER wall baselines as 2D segments
     * (plan XZ, metres) for the pure move set-out. Excludes the moving wall itself
     * and (when a level is known) walls on other levels. Same access pattern as the
     * draw-time `WallPlanToolHandler._collectLevelWallSegments`.
     */
    private _collectNeighbourSegments(
        movingId: string,
        levelId:  string | undefined,
    ): MoveWallSegment[] {
        const ws = this._ws();
        const all: Array<{ id?: string; levelId?: string; baseLine?: Array<{ x: number; z: number }> }> =
            (ws?.getAll?.() as never) ?? [];
        const segs: MoveWallSegment[] = [];
        for (const w of all) {
            if (w.id === movingId) continue;                       // never dimension to self
            if (levelId && w.levelId && w.levelId !== levelId) continue; // this level only
            const bl = w.baseLine;
            if (!bl || bl.length < 2) continue;
            segs.push({ a: { x: bl[0].x, z: bl[0].z }, b: { x: bl[1].x, z: bl[1].z } });
        }
        return segs;
    }

    private _renderDoorWindowOverlay(
        ctx:       CanvasRenderingContext2D,
        state:     Extract<DragState, { kind: 'door' | 'window' }>,
        planCanvas:PlanViewCanvas,
    ): void {
        const toScreen = (wx: number, wz: number) => planCanvas.worldToScreen(wx, wz);

        // §FEAT-PLAN-HOSTED-DRAG-HANDLES — the constraint rail follows the host
        // CENTRELINE, not the chord. On a curved host a straight rail would promise
        // travel through open air off the wall face; this traces exactly the path
        // the 1 DOF actually permits. Straight host → a straight line, as before.
        // (Same reasoning as the 3-D controller's `showConstraintRail`.)
        const railLayout = computeHostedHandleLayout(
            state.host, state.currentOffset, state.width, toScreen,
        );
        const rail = hostCentrelineScreenPath(state.host, toScreen);

        // Blocked → the whole affordance goes red, so the user learns the opening
        // cannot go there WHILE dragging rather than on release.
        const railColor = state.blocked ? 'rgba(220, 38, 38, 0.75)' : 'rgba(255, 165, 0, 0.65)';
        const ghostStroke = state.blocked ? 'rgba(220, 38, 38, 0.95)' : 'rgba(30, 144, 255, 0.9)';
        const ghostFill   = state.blocked ? 'rgba(220, 38, 38, 0.15)' : 'rgba(30, 144, 255, 0.12)';

        ctx.save();
        ctx.beginPath();
        rail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
        ctx.strokeStyle = railColor;
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Host ends
        for (const pt of [rail[0], rail[rail.length - 1]]) {
            if (!pt) continue;
            ctx.beginPath();
            ctx.arc(pt.sx, pt.sy, 4, 0, Math.PI * 2);
            ctx.strokeStyle = railColor;
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Ghost of the opening at its live (always LEGAL) offset, drawn as the
        // real span between its two edges rather than a nominal disc.
        if (railLayout) {
            const spanPx = Math.max(
                8,
                Math.hypot(railLayout.endSx - railLayout.startSx, railLayout.endSy - railLayout.startSy),
            );
            ctx.beginPath();
            ctx.arc(railLayout.centreSx, railLayout.centreSy, spanPx / 2, 0, Math.PI * 2);
            ctx.strokeStyle = ghostStroke;
            ctx.lineWidth   = 2.5;
            ctx.stroke();
            ctx.fillStyle = ghostFill;
            ctx.fill();

            // Keep the two arrows visible THROUGH the drag — the affordance the
            // user grabbed must not vanish under their cursor mid-gesture.
            drawHostedArrows(ctx, railLayout, state.blocked ? '#DC2626' : '#6600FF');

            if (state.blocked && state.blockReason) {
                this._drawLabel(
                    ctx, railLayout.centreSx, railLayout.centreSy - spanPx / 2 - 16,
                    state.blockReason === 'Wall end' ? 'Wall end' : 'Blocked',
                    '#DC2626',
                );
            }
        }

        // §FEAT-HOSTED-MOVE-DIMENSIONS (founder L-30) — live ALONG-WALL set-out from
        // the moving opening's edges to the nearest reference on each side: the wall
        // end OR the facing edge of an adjacent opening on the SAME wall, whichever is
        // closer. A hosted opening slides only along its host wall, so this mirrors
        // L-29's whole-wall move dims but in the wall's own 1D parameter space. Pure
        // geometry lives in `computeHostedMoveDimensions`; here we only project each
        // returned 1D offset onto the wall's on-screen line (t = offset / wallLength,
        // lerp between the two projected endpoints) and reuse the SAME blue dashed
        // `_drawDimensionLine`. Read-only transient preview — no store writes, no
        // commands; cleared automatically when the overlay is removed on end / cancel.
        // ⚠ DATUM ADAPTER. `computeHostedMoveDimensions` documents its `offset`
        // inputs as CENTRE offsets and computes `leftEdge = offset − width/2` for
        // BOTH the moving opening and its neighbours. The STORE, however, holds
        // LEFT-EDGE offsets (§OPENING-OFFSET-LEFTEDGE-UNIFY;
        // `WallOccupancyStore.OpeningDims`). The previous call site passed raw
        // store offsets straight in, so every L-30 set-out gap was reported
        // width/2 short on the start side and width/2 long on the end side.
        // Convert left-edge → centre at the boundary, which is the module's actual
        // contract. (Unifying that module onto the left-edge datum is the cleaner
        // fix but would rewrite L-30's committed numeric test expectations; it is
        // recorded as a follow-up rather than churned here.)
        const toCentre = (leftEdge: number, w: number): number => leftEdge + w / 2;

        // Offsets are projected onto the host CENTRELINE, so a curved host's
        // dimension witnesses land on the arc instead of the chord.
        const projectOffset = (offsetLeftEdge: number): { sx: number; sy: number } => {
            const f = arcFrameAt(state.host, offsetLeftEdge);
            return toScreen(f.x, f.z);
        };

        const dims = computeHostedMoveDimensions({
            offset:     toCentre(state.currentOffset, state.width),
            width:      state.width,
            wallLength: state.hostLength,
            neighbours: this._collectHostedNeighbours(state.wallId, state.elementId)
                .map(n => ({ offset: toCentre(n.offset, n.width), width: n.width })),
        });
        for (const d of dims) {
            const from = projectOffset(d.fromOffset);
            const to   = projectOffset(d.toOffset);
            this._drawDimensionLine(ctx, from.sx, from.sy, to.sx, to.sy, formatM(d.distanceMm / 1000));
        }
    }

    /**
     * §FEAT-HOSTED-MOVE-DIMENSIONS — the OTHER openings (doors + windows) hosted on
     * the SAME wall, as `{ offset, width }` for the pure along-wall set-out. Excludes
     * the moving opening itself. Mirrors `_collectNeighbourSegments`' store-access
     * pattern (tolerant of a partial WallStore shim in tests). Read-only.
     */
    private _collectHostedNeighbours(
        wallId:   string,
        movingId: string,
    ): HostedNeighbourOpening[] {
        const ws = this._ws();
        const out: HostedNeighbourOpening[] = [];
        const push = (
            list: Array<{ id?: string; wallId?: string; offset?: number; width?: number }> | undefined,
        ): void => {
            for (const o of list ?? []) {
                if (!o || o.id === movingId) continue;               // never dimension to self
                if (o.wallId !== wallId) continue;                   // same host wall only
                if (typeof o.offset !== 'number' || typeof o.width !== 'number') continue;
                out.push({ offset: o.offset, width: o.width });
            }
        };
        push(ws?.getAllDoors?.() as never);
        push(ws?.getAllWindows?.() as never);
        return out;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Drawing primitives
    // ──────────────────────────────────────────────────────────────────────

    private _drawDimensionLine(
        ctx:  CanvasRenderingContext2D,
        x1:   number, y1: number,
        x2:   number, y2: number,
        label:string,
    ): void {
        ctx.save();

        // Line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#1E90FF';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tick marks
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const perp  = angle + Math.PI / 2;
        for (const [tx, ty] of [[x1, y1], [x2, y2]]) {
            ctx.beginPath();
            ctx.moveTo(tx + Math.cos(perp) * 5, ty + Math.sin(perp) * 5);
            ctx.lineTo(tx - Math.cos(perp) * 5, ty - Math.sin(perp) * 5);
            ctx.strokeStyle = '#1E90FF';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Label
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        this._drawLabel(ctx, midX, midY, label, '#1E90FF');

        ctx.restore();
    }

    private _drawLabel(
        ctx:   CanvasRenderingContext2D,
        sx:    number, sy: number,
        text:  string,
        color: string,
    ): void {
        ctx.save();
        ctx.font         = 'bold 11px system-ui,sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(text);
        const padX = 4, padY = 3;
        const bW = metrics.width + padX * 2;
        const bH = 14 + padY * 2;

        // Background
        ctx.fillStyle    = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        const bx = sx - bW / 2, by = sy - bH / 2;
        if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(bx, by, bW, bH, 3);
        } else {
            ctx.rect(bx, by, bW, bH);
        }
        ctx.fill();

        // Border
        ctx.strokeStyle  = color;
        ctx.lineWidth    = 1;
        ctx.stroke();

        // Text
        ctx.fillStyle    = color;
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    // ──────────────────────────────────────────────────────────────────────
    // WallStore accessor
    // ──────────────────────────────────────────────────────────────────────

    private _ws(): any {
        return window.wallStore // TODO(TASK-08)
            ?? window.bimManager?.wallStore
            ?? null;
    }

    /**
     * §P6 — the typed command bus, the ONLY mutation path out of this controller.
     * Late-bound (the runtime is composed after this singleton is constructed),
     * exactly like the 3-D `HostedElementDragController`'s `getBus` callback.
     */
    private _bus(): { executeCommand(type: string, payload: unknown): Promise<unknown> | undefined } | null {
        return (window as unknown as {
            runtime?: { bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> | undefined } };
        }).runtime?.bus ?? null;
    }
}

/** Singleton — one active drag at a time across all plan views. */
export const planElementDragController = new PlanElementDragController();
