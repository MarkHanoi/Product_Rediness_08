/**
 * BathroomPodPlanToolHandler — §BATH102 (L-11480..L-11486) · C109 · C11 · C16 CA-18.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER: *"CREATE LOD 300 TOILET COMPOUNDS - MODULES - PARAMETRIC - MEANS
 *    THAT I CAN ADAPT THE MODULE TO THE ROOM DIMENSIONS … ADD THIS NEW CATEGORY IN
 *    SERVICES."*
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THIS FILE CONTAINS NO SANITARYWARE GEOMETRY AND NOT ONE DIMENSIONAL LITERAL
 * (C109 R-6). It resolves a ROOM ENVELOPE from the gesture, draws the module the
 * SOLVER produces as a preview, and dispatches ONE command. Every footprint comes
 * out of `solveBathroomPodLayout`, which reads the plumbing family's own tables
 * through `resolveFixtureFootprint` — the same resolver the plan symbol builder and
 * the elevation symbol builder call. So what the architect aims at cannot diverge
 * from what lands (§FIX-DOOR-PREVIEW-EXACT, L-127, applied at authoring time rather
 * than retrofitted).
 *
 * ─── ⭐ WHY THE GESTURE IS A TWO-CLICK RECTANGLE AND NOT A ONE-CLICK PLACE ──────
 * A pod's whole model is *"fit this module to THIS room"* (C109 §5.1), and the room
 * envelope — `clearWidth` × `clearDepth`, an origin and a rotation — is **STORED**
 * because it is *"the QUESTION the solver was asked"* (C109 §4). A one-click tool
 * would have to INVENT that question: guess a room from the walls near the cursor,
 * or from the `rooms` store, or from a default rectangle. Each guess is a number the
 * architect did not state, and C109 §1.2 is explicit that a pod may be placed *"against
 * a wall in a space that will become one"* — i.e. before any room record exists. So
 * the architect draws the envelope, and the stored answer is exactly what they drew.
 *
 * ─── SPACE PICKS THE WET WALL. H FLIPS THE HAND. BOTH ARE NAMED ON SCREEN ──────
 * `LiftPlanToolHandler` (§LIFT94, L-11344) is the precedent, including the reason:
 * *"a placement modifier nobody is told about is, from the user's side,
 * indistinguishable from one that does not exist — which is exactly how this one was
 * reported."* The two axes a pod has are which edge of the rectangle is the PRIMARY
 * (wet, drainage) wall, and which end of it the shower takes. Both are drawn.
 *
 * ⛔ AND THERE IS DELIBERATELY NO MODE STRIP. The pod has no shape modes — the
 * arrangement (`single-wall` / `l-shaped`) is DERIVED by the solver from the room
 * (C109 §4), never chosen. Offering an "L-shaped" pill would be a control that
 * reports a capability the payload cannot carry (C84 EI-3, the defect the pool's
 * shape strip was built to avoid), and it would let an architect pick the
 * more-expensive-to-build arrangement when the cheap one fits — which C109 §5.3
 * forbids the solver itself from doing.
 *
 * ─── THE REFUSAL REACHES A PERSON, TWICE ───────────────────────────────────────
 * C109 §5.4 / R-3: the module fits or it refuses WITH BOTH NUMBERS. The solver's
 * sentence is drawn on the overlay AND sent to `runtime.toasts`, because
 * `activatePlanOnlyTool.ts` measured that a refusal painted on the preview canvas is
 * erased ~16 ms later by the next `mousemove`'s `clearRect` — which is the whole of
 * *"the swimming pool would not create"*.
 */

import { createId } from '@pryzm/schemas';
import {
    BATHROOM_POD_DEFAULT_MEMBERS,
    bathroomPodMemberOrder,
    solveBathroomPodLayout,
    type BathroomPodHandedness,
    type BathroomPodMember,
    type BathroomPodMemberKind,
    type BathroomPodRoom,
} from '@pryzm/geometry-plumbing';
import { notifyPlanToolRefusal, notifyPlanToolCreated } from '@app/ui/create/activatePlanOnlyTool';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

/** PRYZM purple — the shared preview colour every plan tool draws in. */
const STROKE = '#6600ff';
const FILL_A = 'rgba(102,0,255,0.10)';
/** The refusal colour, shared with `PlumbingPlanToolHandler`'s invalid state. */
const INVALID = '#EF4444';

/** The four edges of a rectangle. A topology fact, not a dimension. */
const QUARTER_TURNS = 4;

/** Which edge SPACE has chosen as the wet wall, by quarter-turn index. */
const PRIMARY_WALL_LABELS = ['top', 'right', 'bottom', 'left'] as const;

/**
 * The smallest rectangle worth solving, in metres.
 *
 * ⚠ NOT A SANITARYWARE DIMENSION (C109 R-6) — it is a GESTURE floor, the same class
 * of number as `LiftPlanToolHandler`'s `HOST_REACH_M`. It exists so a stray click-pair
 * one pixel apart asks the solver to fit a module into a 0.02 m room and gets back a
 * refusal sentence the architect never meant to trigger. Below it the tool simply
 * keeps drawing rather than refusing.
 */
const MIN_DRAG_M = 0.20;

export class BathroomPodPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;
    /** The first corner, once placed. `null` means "waiting for the first click". */
    private _anchor: WorldPoint | null = null;
    /** The last refusal, shown on the overlay so it reaches a PERSON, not a console. */
    private _refusal: string | null = null;
    /** SPACE: which rectangle edge is the PRIMARY (wet) wall. Sticky across placements. */
    private _primaryQuarterTurns = 0;
    /** H: which end of the primary wall the shower takes. Sticky across placements. */
    private _handedness: BathroomPodHandedness = 'left';

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._reset();
    }

    deactivate(): void {
        this._clearOverlay();
        this._reset();
        // ⛔ The two MODIFIERS are cleared here and in `cancel()` but NOT in `_reset()`
        // — "put the tool down" and "start over" mean start over; "that one landed"
        // does not. Placing a row of identical pods along a corridor must not mean
        // re-pressing SPACE for each (LiftPlanToolHandler's §LIFT94 argument).
        this._primaryQuarterTurns = 0;
        this._handedness = 'left';
        this._ctx = null;
    }

    // ── Interaction ───────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this._draw();
    }

    onClick(pt: WorldPoint): void {
        // A new click is a new attempt: clear any refusal still on screen so the user
        // is never told why the LAST gesture failed while making a new one.
        this._refusal = null;
        this._cursor = pt;
        if (this._anchor === null) {
            this._anchor = pt;
            this._draw();
            return;
        }
        this._commit(this._anchor, pt);
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            this.cancel();
            return true;
        }
        // Three spellings, because `DoorPlanToolHandler` tests three: `e.code` is the
        // reliable one, `' '` is the modern `e.key`, `'Spacebar'` is legacy Edge.
        // Returning `true` tells the overlay to preventDefault/stopPropagation, so the
        // page never scrolls and no other SPACE shortcut fires.
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
            this._primaryQuarterTurns = (this._primaryQuarterTurns + 1) % QUARTER_TURNS;
            this._draw();
            return true;
        }
        if (e.key === 'h' || e.key === 'H') {
            this._handedness = this._handedness === 'left' ? 'right' : 'left';
            this._draw();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._reset();
        this._primaryQuarterTurns = 0;
        this._handedness = 'left';
        this._clearOverlay();
    }

    /** §FIX-PLAN-TOOL-FINISH-GESTURE (L-9303) — is there an uncommitted stroke here? */
    hasActiveStroke(): boolean {
        return this._anchor !== null;
    }

    redraw(): void {
        this._draw();
    }

    // ── The room envelope, derived from the two corners ────────────────────────

    /**
     * ⭐ THE ONE PLACE THE ROOM ENVELOPE IS COMPUTED, called by BOTH the preview and
     * the commit.
     *
     * ⚠ IT EXISTS BECAUSE COMPUTING IT TWICE IS HOW A PREVIEW COMES TO SHOW SOMETHING
     * THE COMMIT DOES NOT BUILD (C84 EI-1) — `LiftPlanToolHandler._angleFor` carries
     * the same note after exactly that defect (§LIFT94, L-11345).
     *
     * The rectangle is axis-aligned; SPACE chooses which of its four edges is the
     * PRIMARY (wet) wall, and the room's local frame is the corresponding quarter
     * turn. Local **+X** runs along the primary wall from its LEFT end (which is the
     * ORIGIN); local **+Z** runs into the room. Those are C109 §5.1's axes verbatim,
     * and the four cases below are the only four a quarter turn can produce:
     *
     *   turn 0 (rotation 0)    +X → +x, +Z → +z   primary = the min-Z edge
     *   turn 1 (rotation π/2)  +X → +z, +Z → −x   primary = the max-X edge
     *   turn 2 (rotation π)    +X → −x, +Z → −z   primary = the max-Z edge
     *   turn 3 (rotation 3π/2) +X → −z, +Z → +x   primary = the min-X edge
     */
    private _roomOf(a: WorldPoint, b: WorldPoint): BathroomPodRoom {
        const minX = Math.min(a.worldX, b.worldX);
        const maxX = Math.max(a.worldX, b.worldX);
        const minZ = Math.min(a.worldZ, b.worldZ);
        const maxZ = Math.max(a.worldZ, b.worldZ);
        const spanX = maxX - minX;
        const spanZ = maxZ - minZ;

        switch (this._primaryQuarterTurns) {
            case 1:
                return {
                    clearWidth: spanZ, clearDepth: spanX,
                    origin: { x: maxX, y: 0, z: minZ }, rotation: Math.PI / 2,
                };
            case 2:
                return {
                    clearWidth: spanX, clearDepth: spanZ,
                    origin: { x: maxX, y: 0, z: maxZ }, rotation: Math.PI,
                };
            case 3:
                return {
                    clearWidth: spanZ, clearDepth: spanX,
                    origin: { x: minX, y: 0, z: maxZ }, rotation: (3 * Math.PI) / 2,
                };
            default:
                return {
                    clearWidth: spanX, clearDepth: spanZ,
                    origin: { x: minX, y: 0, z: minZ }, rotation: 0,
                };
        }
    }

    /** The member set a pod declares. One source, so the preview and the commit agree. */
    private _members(): readonly BathroomPodMemberKind[] {
        return BATHROOM_POD_DEFAULT_MEMBERS;
    }

    // ── Commit ────────────────────────────────────────────────────────────────

    private _commit(a: WorldPoint, b: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            this._refuse('This view has no level, so there is no storey to place a bathroom pod on.');
            return;
        }

        const room = this._roomOf(a, b);
        if (room.clearWidth < MIN_DRAG_M || room.clearDepth < MIN_DRAG_M) {
            // Not a refusal — a mis-click. Keep the anchor and let them try again.
            this._cursor = b;
            this._draw();
            return;
        }

        // ⭐ CA-2 — ids are minted ONCE, HERE, and passed in. `execute()` runs again on
        // REDO, so minting inside the handler would silently produce a DIFFERENT pod
        // the second time. The member COUNT is asked of the geometry package
        // (`bathroomPodMemberOrder`) rather than typed, because a hand-typed count is a
        // second statement of a number the normaliser already owns — and it would be
        // wrong the moment a pod declares two accessories.
        const kinds = this._members();
        const payload = {
            podId: createId('bathroomPod'),
            levelId,
            room,
            handedness: this._handedness,
            members: kinds,
            memberIds: bathroomPodMemberOrder(kinds).map(() => createId('plumbing')),
        };

        // ONE dispatch = ONE undo entry (C16 §8.6 B-6). The handler uses
        // `produceCommand` over the ONE store it writes; nothing is batched here and
        // no child command is dispatched. See `CreateBathroomPod.ts`'s header for why
        // `'plumbing'` is deliberately NOT a second declared store.
        const dispatch =
            c.runtime?.bus?.executeCommand('bathroomPod.create', payload) ??
            window.runtime?.bus?.executeCommand('bathroomPod.create', payload);

        if (!dispatch) {
            this._refuse('The command bus is not available, so no bathroom pod was created.');
            return;
        }

        void Promise.resolve(dispatch)
            .then(() => {
                // ⭐ CONFIRM BY NAME. §FIX-PLAN-TOOL-FINISH-GESTURE (L-9305): until a
                // render path exists for this family, a confirmation is the ONLY signal
                // separating "created" from "silently refused", and shipping the two
                // apart is what turned a correct refusal into three founder reports.
                notifyPlanToolCreated(
                    `Bathroom pod placed on this level — ${kinds.length} fixtures, ` +
                    `${room.clearWidth.toFixed(2)} × ${room.clearDepth.toFixed(2)} m room.`,
                );
            })
            .catch((e: unknown) => {
                // ⭐ SURFACE THE BUS'S OWN REASON, VERBATIM. `canExecute` rejections
                // arrive as `bathroomPod.create: canExecute rejected — <why>`, and that
                // `<why>` is the solver's both-numbers sentence (C109 §5.4). Swallowing
                // it is exactly the "reported activation, activated nothing" defect.
                const why = e instanceof Error ? e.message : String(e);
                console.error('[BathroomPodPlanToolHandler] bathroomPod.create failed:', why);
                this._refuse(why);
            });

        this._reset();
        this._clearOverlay();
    }

    // ── Preview ───────────────────────────────────────────────────────────────

    private _draw(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        if (this._refusal) {
            this._drawHint(ctx, cssH, this._refusal, INVALID);
            ctx.restore();
            return;
        }

        const a = this._anchor;
        const b = this._cursor;
        if (a === null || b === null) {
            this._drawHint(
                ctx,
                cssH,
                'Bathroom pod · click the first corner of the room the module must fit',
                STROKE,
            );
            ctx.restore();
            return;
        }

        const room = this._roomOf(a, b);

        // The room rectangle, from the two corners.
        const ring = BathroomPodPlanToolHandler._roomRing(room);
        const pts = ring.map((v) => planCanvas.worldToScreen(v.x, v.z));
        this._fillPath(ctx, pts, STROKE, FILL_A);
        this._strokePath(ctx, pts, STROKE);
        // ⭐ THE WET WALL, DRAWN HEAVILY. Without this, pressing SPACE would move a
        // few pixels of a nearly-symmetric rectangle and the architect would see
        // nothing happen — the failure §LIFT94 records for the lift's landing side.
        // `_roomRing` emits local (0,0) → (W,0) first, which IS the primary wall.
        this._strokeHeavy(ctx, pts[0]!, pts[1]!, STROKE);

        // ── THE MODULE ITSELF, FROM THE SOLVER ────────────────────────────────
        // ⛔ NOT "rectangles about the right size". `solveBathroomPodLayout` is the
        // SAME function the handler runs, so the preview and the commit cannot
        // disagree — and when it refuses, the sentence drawn below is the sentence the
        // bus would have thrown.
        const kinds = this._members();
        const solved = solveBathroomPodLayout({
            room,
            handedness: this._handedness,
            members: kinds,
            // Preview ids are never dispatched; the solver only needs the COUNT to
            // match. The real ids are minted in `_commit` (CA-2).
            memberIds: bathroomPodMemberOrder(kinds).map((_k, i) => `preview_${i}`),
        });

        if (solved.ok) {
            for (const m of solved.members) {
                const mp = BathroomPodPlanToolHandler._memberRing(m).map((v) =>
                    planCanvas.worldToScreen(v.x, v.z),
                );
                this._fillPath(ctx, mp, STROKE, FILL_A);
                this._strokePath(ctx, mp, STROKE);
            }
            this._drawHint(
                ctx,
                cssH,
                `Bathroom pod · ${solved.arrangement} · ` +
                    `${room.clearWidth.toFixed(2)} × ${room.clearDepth.toFixed(2)} m · ` +
                    `wet wall: ${PRIMARY_WALL_LABELS[this._primaryQuarterTurns]} (SPACE) · ` +
                    `shower: ${this._handedness} (H) · click to place`,
                STROKE,
            );
        } else {
            this._strokePath(ctx, pts, INVALID);
            // C109 §5.4 — BOTH numbers, live, while the architect is still dragging.
            // A refusal they read before committing is worth more than one they read
            // after, and it is the same sentence either way.
            this._drawHint(ctx, cssH, solved.reason, INVALID);
        }

        ctx.restore();
    }

    /** The room's own outline as a world-XZ ring, starting at the PRIMARY wall. */
    private static _roomRing(room: BathroomPodRoom): ReadonlyArray<{ x: number; z: number }> {
        const cos = Math.cos(room.rotation);
        const sin = Math.sin(room.rotation);
        const toWorld = (lx: number, lz: number): { x: number; z: number } => ({
            x: room.origin.x + lx * cos - lz * sin,
            z: room.origin.z + lx * sin + lz * cos,
        });
        return [
            toWorld(0, 0),
            toWorld(room.clearWidth, 0),
            toWorld(room.clearWidth, room.clearDepth),
            toWorld(0, room.clearDepth),
        ];
    }

    /** One placed member's footprint as a world-XZ ring, about its own centre. */
    private static _memberRing(m: BathroomPodMember): ReadonlyArray<{ x: number; z: number }> {
        const hw = m.footprint.width / 2;
        const hl = m.footprint.length / 2;
        const cos = Math.cos(m.rotationY);
        const sin = Math.sin(m.rotationY);
        return [
            [-hw, -hl],
            [hw, -hl],
            [hw, hl],
            [-hw, hl],
        ].map(([u, v]) => ({
            x: m.position.x + u! * cos - v! * sin,
            z: m.position.z + u! * sin + v! * cos,
        }));
    }

    private _fillPath(
        ctx: CanvasRenderingContext2D,
        pts: ReadonlyArray<{ sx: number; sy: number }>,
        _stroke: string,
        fill: string,
    ): void {
        if (pts.length < 3) return;
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.sx, pts[i]!.sy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    private _strokePath(
        ctx: CanvasRenderingContext2D,
        pts: ReadonlyArray<{ sx: number; sy: number }>,
        stroke: string,
    ): void {
        if (pts.length === 0) return;
        ctx.setLineDash([6, 3]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.sx, pts[i]!.sy);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /** A thick solid bar — the WET WALL, so a SPACE press is unmistakable. */
    private _strokeHeavy(
        ctx: CanvasRenderingContext2D,
        a: { sx: number; sy: number },
        b: { sx: number; sy: number },
        stroke: string,
    ): void {
        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        ctx.restore();
    }

    private _drawHint(
        ctx: CanvasRenderingContext2D,
        cssH: number,
        text: string,
        colour: string,
    ): void {
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = colour;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, 12, cssH - 12);
    }

    /**
     * Record a refusal, put it on the overlay AND put it in a toast.
     *
     * ⭐ THE TOAST IS NOT BELT-AND-BRACES. `activatePlanOnlyTool.ts` measured that
     * `SvpPlanToolOverlay._onMouseMove` begins EVERY pointer sample with
     * `ctx.clearRect(...)` and then calls the handler — so a refusal painted on the
     * canvas is erased ~16 ms later, which is the whole of *"the swimming pool would
     * not create"*. The canvas is the SECOND channel here, not the only one.
     */
    private _refuse(message: string): void {
        this._refusal = message;
        this._draw();
        notifyPlanToolRefusal(message);
    }

    private _reset(): void {
        this._anchor = null;
        this._cursor = null;
        this._refusal = null;
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
