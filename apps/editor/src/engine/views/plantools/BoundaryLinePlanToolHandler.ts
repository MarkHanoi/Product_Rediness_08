/**
 * BoundaryLinePlanToolHandler — §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7931) · C106 · ADR-0348.
 *
 * THE PLAN-VIEW ROUTE THAT MAKES THE CONSTRUCTION / SETTING-OUT LINE REACHABLE. It is
 * axis 3 of the four the pool taught this repository to check (L-5200):
 *
 *   1. nothing CONSTRUCTS the store              → closed by `PluginRegistry`
 *   2. no `boundaryLine` storeKey, so the bus threw → closed by `PluginRegistry`
 *   3. NOTHING DISPATCHES `boundaryLine.create`  → CLOSED HERE
 *   4. the AI chat must classify it              → closed in `ChatCommandClassification`
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE CONTAINS NO BOUNDARY-LINE GEOMETRY AND NO DIMENSIONAL LITERAL.
 * ═══════════════════════════════════════════════════════════════════════════════
 * It draws a POLYLINE and dispatches ONE command. Every dimension resolves through
 * `resolveBoundaryLineDimensions()` in `@pryzm/geometry-boundary-line`, and the closed
 * rings come from `boundaryLoopVertices()` — the SAME generator the wall, slab,
 * floor-finish, ceiling and pool tools call. The founder asked for *"the same modes
 * for creation — line, ortho, rectangle, ellipse, curve, circle"*; all six are served
 * by machinery that already shipped, so the strip cannot offer a shape the generator
 * does not implement (§FIX-STAIR-SHAPE-DESYNC's lesson).
 *
 * ─── ⛔ AND IT IS NOT THE PARCEL BOUNDARY ─────────────────────────────────────
 * `Parcel.boundary` (C19 §1.4) is the LEGAL lot outline: surveyed, recorded, and
 * ONE-SHOT IMMUTABLE for the lifetime of the Site — C19 §1.4 says in as many words
 * that there is no `site.editParcelBoundary` command. This tool never reads it, never
 * writes it and never derives from it. A reader who conflates the two will corrupt
 * legally-sourced data with an ordinary drawing gesture.
 *
 * ─── WHAT A BOUNDARY LINE IS FOR, AND WHY CREATION MAKES NOTHING ELSE ─────────
 * Early-stage design. Draw the envelope of a scheme, then populate it — by hand, or by
 * asking RAC *"create a 3-bedroom apartment on this boundary line"*. Creating the line
 * deliberately does NOT create walls or massing: a setting-out line is what an
 * architect draws BEFORE deciding what goes on it, and building something implicitly
 * would take that decision away at exactly the moment the tool exists to support it.
 */

import { createId } from '@pryzm/schemas';
import {
    boundaryLoopVertices, boundaryLoopRefusal, BOUNDARY_LOOP_GESTURE,
    arcSegmentThroughMidpoint, orthoConstrain,
} from '@pryzm/geometry-slab';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import {
    resolveActiveBoundaryLineDrawMode,
    activeBoundaryLineLoopMode,
    activeBoundaryLineHasVolume,
} from './activeBoundaryLineDrawMode';
// §FIX-PLAN-TOOL-FINISH-GESTURE (L-9301) — the LIVE refusal channel. The overlay draw
// is the second leg, not the only one; see `notifyPlanToolRefusal`'s header.
import { notifyPlanToolRefusal, notifyPlanToolCreated } from '@app/ui/create/activatePlanOnlyTool';

/** PRYZM purple — the shared preview colour every plan tool draws in. */
const STROKE = '#6600ff';

/**
 * The minimum vertices a LINE needs. ⚠ TWO, not three — and that is the one place this
 * tool genuinely differs from the pool, the slab and the balcony. A boundary line is a
 * PATH first: a single 10 m run is a perfectly good setting-out line. Only the CLOSED
 * modes need three, and the L0 schema's own refine enforces that half.
 */
const MIN_PATH_VERTS = 2;
/** A closed ring needs three to enclose anything. */
const MIN_LOOP_VERTS = 3;

export class BoundaryLinePlanToolHandler implements PlanToolHandler {
    private _ctx:         PlanToolDrawContext | null = null;
    private _points:      WorldPoint[] = [];
    private _cursorPoint: WorldPoint | null = null;
    private _loopAnchor:  WorldPoint | null = null;
    private _arcMidPt:    WorldPoint | null = null;
    /** The last refusal, shown on the overlay so it reaches a PERSON, not a console. */
    private _refusal:     string | null = null;

    /** §T-B1 — a half-drawn line survives an excursion to the toolbar. */
    hasActiveStroke(): boolean {
        return this._points.length > 0 || this._loopAnchor !== null || this._arcMidPt !== null;
    }

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._resetStroke();
    }

    deactivate(): void {
        this._clearOverlay();
        this._resetStroke();
        this._ctx = null;
    }

    // ── Interaction ──────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        // ⭐ §FIX-PLAN-TOOL-FINISH-GESTURE (L-9301) — A REFUSAL OUTLIVES THE POINTER.
        // The overlay clears the canvas at the head of every sample and this handler
        // draws NOTHING at zero points, so without this the reason the last gesture
        // failed is erased by the architect's next 16 ms of mouse movement. It is
        // cleared by the next CLICK (`onClick`'s first line), because a new attempt is
        // when the old reason stops being true.
        if (this._refusal) {
            this._cursorPoint = pt;
            this._drawRefusal();
            return;
        }
        // Mode is re-read on EVERY sample (the `WallModePicker.getActiveMode()`
        // contract) so a switch on the mode strip applies to the very next click
        // without re-activating the tool and destroying the stroke.
        const mode = resolveActiveBoundaryLineDrawMode();

        if (activeBoundaryLineLoopMode() && this._loopAnchor) {
            this._cursorPoint = pt;
            this._drawPreview();
            return;
        }
        if (mode === 'ortho' && this._points.length > 0) {
            this._cursorPoint = this._orthoSnap(this._points[this._points.length - 1]!, pt);
            this._drawPreview();
            return;
        }
        if (this._points.length > 0) {
            this._cursorPoint = pt;
            this._drawPreview();
        }
    }

    onClick(pt: WorldPoint): void {
        const mode = resolveActiveBoundaryLineDrawMode();
        // A new click is a new attempt: clear any refusal still on screen so the user
        // is never told why the LAST gesture failed while making a new one.
        this._refusal = null;

        // ── CLOSED-LOOP modes: RECTANGULAR / CIRCULAR / ELLIPTICAL ───────────
        const loopMode = activeBoundaryLineLoopMode();
        if (loopMode) {
            if (!this._loopAnchor) {
                this._loopAnchor  = pt;
                this._points      = [pt];
                this._cursorPoint = pt;
                this._drawPreview();
                return;
            }
            const first  = { x: this._loopAnchor.worldX, z: this._loopAnchor.worldZ };
            const second = { x: pt.worldX, z: pt.worldZ };
            const ring = boundaryLoopVertices(loopMode, first, second);
            if (ring.length < MIN_LOOP_VERTS) {
                // ⛔ C16 CA-18 — name the reason AND what does work. Never silently
                // fall back to another shape: a circle that quietly became a rectangle
                // is a worse outcome than a refusal.
                this._refuse(boundaryLoopRefusal(loopMode, first, second)
                    ?? 'That outline is too small to make a boundary line.');
                return;
            }
            this._points = ring.map(v => ({ worldX: v.x, worldZ: v.z } as WorldPoint));
            this._commit(true);
            return;
        }

        // ── CURVED — vertex → arc MIDPOINT → arc END (the wall tool's 3-click) ──
        if (mode === 'curved' && this._points.length > 0) {
            if (!this._arcMidPt) {
                this._arcMidPt    = pt;
                this._cursorPoint = pt;
                this._drawPreview();
                return;
            }
            const last = this._points[this._points.length - 1]!;
            const run = arcSegmentThroughMidpoint(
                { x: last.worldX,           z: last.worldZ           },
                { x: this._arcMidPt.worldX, z: this._arcMidPt.worldZ },
                { x: pt.worldX,             z: pt.worldZ             },
            );
            for (const v of run) this._points.push({ worldX: v.x, worldZ: v.z } as WorldPoint);
            this._arcMidPt = null;
            this._drawPreview();
            return;
        }

        // ── LINEAR / ORTHO — accumulate vertices ─────────────────────────────
        const vertex = (mode === 'ortho' && this._points.length > 0)
            ? this._orthoSnap(this._points[this._points.length - 1]!, pt)
            : pt;
        this._points.push(vertex);
        this._drawPreview();
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (activeBoundaryLineLoopMode()) return;   // closed loops commit on the 2nd click
        if (this._arcMidPt) return;                 // don't eat the pending arc END click
        if (this._points.length >= MIN_PATH_VERTS) this._commit(false);
    }

    /**
     * ⭐ §FIX-BOUNDARY-LINE-ENTER-CLOSES (founder, 2026-08-24) — L-10501 · C84 EI-9.
     *
     * THE ONE closure predicate for this tool. ENTER and the on-screen hint both ask
     * THIS, so the hint can never advertise a key that refuses — the exact defect
     * `CurtainWallTool._canClosePolyline()` was minted to kill (C87 §13.8 CW-Poly-1:
     * its HUD button was labelled `↵` while ENTER was bound to *finish*, and the key
     * that actually closed was `C`, advertised nowhere).
     *
     * THREE vertices, not two, and the floor is the SCHEMA's, not a taste:
     * `BoundaryLine`'s second refine is *"A closed boundary line needs at least 3
     * vertices"*. Asking here means a refusable ring is refused BEFORE the gesture
     * ends, rather than surfacing as a Zod message after the architect thought he had
     * drawn one.
     *
     * ⛔ NOT reused from the wall, and that is a MEASURED decision rather than a
     * shrug. `WallPlanToolHandler`'s rule (`:376` — `_wallSegmentCount >= 2 &&
     * _polylineFirstPoint && _wallFirstPoint`) is expressed over THREE pieces of
     * wall-private state that this tool does not have and must not grow: the wall
     * commits ONE `wall.create` PER SEGMENT as you click, so its "close" means *emit
     * one more segment back to the origin*. A boundary line accumulates vertices and
     * commits ONE record carrying a `closed` FLAG, so its "close" means *set the flag*
     * — the schema's third refine explicitly forbids repeating the first vertex to
     * signal closure. Same word, two different operations; sharing the predicate would
     * force one of them to lie. C87 §13.8 already recorded that wall exposes nothing
     * to reuse and that its own rule is re-typed FIVE times with the copies DRIFTED;
     * extracting those five is a lane of its own and is NOT done here.
     */
    private _canClosePolyline(): boolean {
        return !activeBoundaryLineLoopMode()
            && this._arcMidPt === null
            && this._points.length >= MIN_LOOP_VERTS;
    }

    /**
     * Close the chain back to its origin and commit it as a RING.
     *
     * ⚠ IT ADDS NO VERTEX. `closed: true` IS the closing segment — the schema refuses
     * a closed line whose last vertex repeats its first (*"must be an OPEN loop"*), and
     * `BoundaryLineMeshBuilder` re-closes the polyline itself for drawing. Pushing
     * `this._points[0]` here would produce a record that fails `canExecute` at the bus
     * and a zero-length final segment if it did not.
     *
     * ⚠ AND IT RESETS THE STROKE, via `_commit`'s tail. C84 EI-9 — a close that draws
     * the ring but leaves the tool's own state dirty is a half-fix; `CurtainWallTool`'s
     * `C`-key alias carried exactly that bug (it omitted `_polySegmentCount = 0`) until
     * it was made to delegate. `_commit()` cannot early-return here because
     * `_canClosePolyline()` has already guaranteed `length >= MIN_LOOP_VERTS`, which is
     * the `need` it checks.
     */
    private _closePolyline(): void {
        if (!this._canClosePolyline()) return;
        this._commit(true);
    }

    onKeyDown(e: KeyboardEvent): boolean {
        // ⭐ §FIX-BOUNDARY-LINE-ENTER-CLOSES (L-10501) — ENTER CLOSES THE RING.
        //
        // ⛔ IT DID NOT. The founder: *"I started to define the lines in plan view, and
        // once I was happy, to connect back to the first point I clicked ENTER, but the
        // line did not connect as a wall does."* He was right, and the mechanism was one
        // argument: this branch called `this._commit(false)`. Every ENTER produced an
        // OPEN path, however many vertices had been clicked and wherever the last one
        // sat — so the gesture that exists to close a loop was the gesture that
        // guaranteed it stayed open. `closed` is AUTHORED on this family (the schema
        // says so in as many words), and nothing in the plan tool ever authored it true
        // outside the rectangle/circle/ellipse modes.
        //
        // ENTER now CLOSES when there is a ring to close, and FINISHES otherwise — two
        // vertices are a chain, not a loop, and finishing it is the only correct reading
        // (the previous behaviour is preserved exactly there). Same ladder as
        // `CurtainWallTool`'s ENTER after C87 §13.8.
        //
        // ⚠ DOUBLE-CLICK IS DELIBERATELY *NOT* CHANGED TO MATCH, and this is the one
        // place this tool must NOT copy the wall. `WallPlanToolHandler.onDoubleClick`
        // closes, because a wall chain has no meaningful open form to commit. A boundary
        // line's open form is FIRST-CLASS — `MIN_PATH_VERTS` is 2 precisely because *"a
        // single 10 m run is a perfectly good setting-out line"* — so if double-click
        // closed too, there would be NO gesture left that finishes an open path. The
        // two keys therefore mean two different things, and the hint says which is which
        // rather than leaving the architect to discover it.
        if (e.key === 'Enter' && !activeBoundaryLineLoopMode() && !this._arcMidPt) {
            if (this._canClosePolyline()) {
                e.preventDefault();
                this._closePolyline();
                return true;
            }
            if (this._points.length >= MIN_PATH_VERTS) {
                e.preventDefault();
                this._commit(false);
                return true;
            }
        }
        if (e.key === 'Backspace' && this._arcMidPt) {
            this._arcMidPt = null;
            this._drawPreview();
            return true;
        }
        if (e.key === 'Backspace' && this._points.length > 0) {
            this._points.pop();
            if (this._points.length === 0) this._loopAnchor = null;
            this._drawPreview();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._resetStroke();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._points.length > 0) this._drawPreview();
    }

    // ── Commit ───────────────────────────────────────────────────────────────

    private _commit(closed: boolean): void {
        const c = this._ctx;
        const need = closed ? MIN_LOOP_VERTS : MIN_PATH_VERTS;
        if (!c || this._points.length < need) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            // ⛔ Refuse rather than defaulting to a level the user is not looking at.
            this._refuse('This view has no level, so there is nothing to draw a boundary line on.');
            return;
        }

        // The polyline the user drew IS the record. Nothing derived is sent: length,
        // segment count and the extruded solid are all computed from these vertices
        // (C84 §8.i — a derived value stored goes stale on the first vertex drag).
        const vertices = this._points.map(p => ({ x: p.worldX, y: 0, z: p.worldZ }));

        // CA-2 — the id is minted ONCE, HERE, and passed in. `execute()` runs again on
        // REDO, so minting inside the handler would silently produce a DIFFERENT line
        // the second time and orphan every attachment pointing at the first.
        const payload = {
            boundaryLineId: createId('boundaryLine'),
            levelId,
            vertices,
            closed,
            drawMode: resolveActiveBoundaryLineDrawMode(),
            // The authoring default from the shared store. ⚠ Note that this is the
            // RECORD's intent only — the VIEW's visibility intent still wins where it
            // has an opinion (C106 §5, `resolveBoundaryLineSolidity`).
            hasVolume: activeBoundaryLineHasVolume(),
        };

        const dispatch = c.runtime?.bus?.executeCommand('boundaryLine.create', payload)
            ?? window.runtime?.bus?.executeCommand('boundaryLine.create', payload);

        if (!dispatch) {
            this._refuse('The command bus is not available, so no boundary line was created.');
            return;
        }

        void Promise.resolve(dispatch).then(() => {
            // ⭐ §FIX-PLAN-TOOL-FINISH-GESTURE (L-9305) — SAY THAT IT EXISTS.
            // `boundaryLine.create` has no `case` in `CommandEventBridge` and no
            // renderer anywhere, so the record is real and completely invisible
            // (measured — see `notifyPlanToolCreated`'s header). Without this line the
            // founder's *"it doesn't create"* is the only reading available to him.
            notifyPlanToolCreated(
                `Boundary line created — ${vertices.length} points${closed ? ', closed' : ''}.`,
            );
        }).catch((e: unknown) => {
            // ⭐ SURFACE THE BUS'S OWN REASON, VERBATIM. `canExecute` rejections arrive
            // as `CommandBusError: boundaryLine.create: canExecute rejected — <why>`,
            // and that `<why>` is the most accurate sentence available (a degenerate
            // line, a duplicate id, or the C100 "volume with no material" refusal).
            // Swallowing it here is exactly the "reported activation, activated
            // nothing" defect this whole lane exists to avoid.
            const why = e instanceof Error ? e.message : String(e);
            console.error('[BoundaryLinePlanToolHandler] boundaryLine.create failed:', why);
            this._refuse(why);
        });

        this._resetStroke();
        this._clearOverlay();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** The ONE ortho constraint — the wall tool's, shared via `@pryzm/geometry-slab`. */
    private _orthoSnap(from: WorldPoint, to: WorldPoint): WorldPoint {
        const v = orthoConstrain(
            { x: from.worldX, z: from.worldZ },
            { x: to.worldX,   z: to.worldZ   },
        );
        return { worldX: v.x, worldZ: v.z } as WorldPoint;
    }

    private _resetStroke(): void {
        this._points      = [];
        this._cursorPoint = null;
        this._loopAnchor  = null;
        this._arcMidPt    = null;
    }

    /**
     * Record a refusal AND put it on the overlay.
     *
     * ⭐ A `console.warn` is not a refusal — it is a refusal nobody reads. The founder's
     * "Create Stair" report was exactly this shape: the tool reported success and did
     * nothing. Every path that declines to create a line comes through here.
     */
    private _refuse(message: string): void {
        this._refusal = message;
        this._resetStroke();
        this._drawRefusal();
        // ⭐⭐ §FIX-PLAN-TOOL-FINISH-GESTURE (L-9301) — AND SAY IT WHERE IT SURVIVES.
        // The overlay draw above is erased by the very next pointer sample. The founder's
        // *"doesn't actually work — it doesn't create"* is what a computed, correct reason
        // looks like after it has been painted onto a canvas that is cleared 16 ms later.
        // `runtime.toasts` is the channel `initUI` uses for every message the user reads.
        notifyPlanToolRefusal(message);
    }

    private _drawRefusal(): void {
        const c = this._ctx;
        if (!c || !this._refusal) return;
        const { ctx, overlayCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();
        this._drawHint(ctx, cssH, this._refusal);
        ctx.restore();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || this._points.length === 0) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        const mode = resolveActiveBoundaryLineDrawMode();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        // ── CLOSED-LOOP preview ──────────────────────────────────────────────
        // ⭐ Generated from THE SAME ring the commit will use, so what the user aims at
        // cannot diverge from what lands.
        const loopMode = activeBoundaryLineLoopMode();
        if (loopMode && this._loopAnchor && this._cursorPoint) {
            const ring = boundaryLoopVertices(
                loopMode,
                { x: this._loopAnchor.worldX,  z: this._loopAnchor.worldZ  },
                { x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ },
            );
            const pts = ring.map(v => planCanvas.worldToScreen(v.x, v.z));
            if (pts.length >= MIN_LOOP_VERTS) this._strokePath(ctx, pts, true);
            this._drawHint(ctx, cssH, `${BOUNDARY_LOOP_GESTURE[loopMode].second} · Esc to cancel`);
            ctx.restore();
            return;
        }

        const screenPts = this._points.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        const trailing: Array<{ sx: number; sy: number }> = [];
        if (this._cursorPoint) {
            if (mode === 'curved' && this._arcMidPt && this._points.length > 0) {
                const last = this._points[this._points.length - 1]!;
                for (const v of arcSegmentThroughMidpoint(
                    { x: last.worldX,              z: last.worldZ              },
                    { x: this._arcMidPt.worldX,    z: this._arcMidPt.worldZ    },
                    { x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ },
                )) trailing.push(planCanvas.worldToScreen(v.x, v.z));
            } else {
                trailing.push(planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ));
            }
        }

        this._strokePath(ctx, [...screenPts, ...trailing], false);

        if (mode === 'curved' && this._arcMidPt) {
            const m = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            ctx.fillStyle = STROKE;
            ctx.beginPath(); ctx.arc(m.sx, m.sy, 5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = STROKE;
        for (const p of screenPts) { ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill(); }

        this._drawHint(ctx, cssH, this._hintFor(mode));
        ctx.restore();
    }

    private _hintFor(mode: string): string {
        const label = mode === 'ortho' ? 'Orthogonal' : mode === 'curved' ? 'Curved' : 'Linear';
        const volume = activeBoundaryLineHasVolume() ? ' · VOLUME on' : '';
        // ⭐ §FIX-BOUNDARY-LINE-ENTER-CLOSES (L-10501) — THE HINT ASKS THE PREDICATE.
        // It does not re-derive "can I close?" from a vertex count of its own: a hint
        // that names ENTER while ENTER refuses teaches the architect the feature is
        // broken, which is precisely how the founder's report reads. One rule, two
        // readers.
        if (mode === 'curved' && this._points.length > 0) {
            if (this._arcMidPt) return 'Curved · Click the arc END point · Backspace to re-pick midpoint';
            const tail = this._canClosePolyline()
                ? ' · Enter to CLOSE · Dbl-click to finish open'
                : (this._points.length >= MIN_PATH_VERTS ? ' · Enter to finish' : '');
            return `Curved · Click the arc MIDPOINT${tail}`;
        }
        if (this._canClosePolyline()) {
            return `${label}${volume} · Enter to CLOSE the ring · Dbl-click to finish it open`;
        }
        const missing = MIN_PATH_VERTS - this._points.length;
        return this._points.length >= MIN_PATH_VERTS
            ? `${label}${volume} · Dbl-click or Enter to finish · 1 more point to close a ring`
            : `${label}${volume} · ${missing} more point${missing !== 1 ? 's' : ''} needed`;
    }

    /**
     * ⭐ A CENTRELINE, DRAWN AS LINEWORK — NEVER FILLED.
     *
     * The pool, slab and balcony previews fill their ring because they are AREAS. A
     * boundary line is a LINE: filling its preview would make an open polyline look
     * like a closed plate and, worse, would make a closed setting-out line
     * indistinguishable on screen from the slab an architect might be about to draw
     * inside it. Dashed, because it is a construction line and not built fabric.
     */
    private _strokePath(
        ctx: CanvasRenderingContext2D,
        pts: ReadonlyArray<{ sx: number; sy: number }>,
        close: boolean,
    ): void {
        if (pts.length === 0) return;
        ctx.setLineDash([10, 4]);
        ctx.lineWidth   = 1.8;
        ctx.strokeStyle = STROKE;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.sx, pts[i]!.sy);
        if (close) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }

    private _drawHint(ctx: CanvasRenderingContext2D, cssH: number, text: string): void {
        ctx.font         = 'bold 11px sans-serif';
        ctx.fillStyle    = 'rgba(102,0,255,0.9)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, 12, cssH - 12);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
