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
 * ⭐ 2026-09-10 — THE STROKE WAS EXTRACTED. THIS FILE NO LONGER OWNS ONE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Everything this file used to hold about *how a polyline is drawn* — the ortho
 * constraint, the three-click arc, the closed-loop shapes, Backspace, Enter-closes,
 * the refusal that survives a pointer sample, the preview painter — is now
 * `PlanPolylineStroke`, and this handler configures one and supplies a FINISH TARGET.
 *
 * ⛔ THAT WAS THE WHOLE POINT AND IT IS OWED TO A DIFFERENT FAMILY.
 * `siteworksRailTools.ts` shipped WITHOUT a draw gesture and named the reason: writing
 * a `SiteworksPlanToolHandler` beside this one would be a SECOND polyline-stroke
 * implementation ([[same-rule-two-implementations]]), *"and the guarding test would
 * stay green on whichever copy it happened to measure"*. Recorded as C116 §11. The
 * correct move was to extract the stroke and have BOTH call it, and that is what
 * happened: `SiteworksPlanToolHandler` is the second caller, and it re-implements
 * nothing.
 *
 * ⚠ THE BEHAVIOUR IS UNCHANGED BY CONSTRUCTION, NOT BY CARE. Every rule that used to
 * live here moved VERBATIM into the driver, including the ones with founder reports
 * attached to them (L-9301's surviving refusal, L-10501's Enter-closes,
 * `MIN_PATH_VERTS = 2`). `boundaryLineEnterCloses.spec.ts` and
 * `boundaryLinePointerReach.spec.ts` drive this class, not the driver, and are the
 * control on that claim.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE CONTAINS NO BOUNDARY-LINE GEOMETRY AND NO DIMENSIONAL LITERAL.
 * ═══════════════════════════════════════════════════════════════════════════════
 * It supplies a POLYLINE's destination and dispatches ONE command. Every dimension
 * resolves through `resolveBoundaryLineDimensions()` in `@pryzm/geometry-boundary-line`,
 * and the closed rings come from `boundaryLoopVertices()` — the SAME generator the
 * wall, slab, floor-finish, ceiling and pool tools call. The founder asked for *"the
 * same modes for creation — line, ortho, rectangle, ellipse, curve, circle"*; all six
 * are served by machinery that already shipped, so the strip cannot offer a shape the
 * generator does not implement (§FIX-STAIR-SHAPE-DESYNC's lesson).
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
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import {
    PlanPolylineStroke,
    loopGestureHint,
    DASHED_CONSTRUCTION_STYLE,
    type StrokePoint,
} from './PlanPolylineStroke';
import {
    resolveActiveBoundaryLineDrawMode,
    activeBoundaryLineLoopMode,
    activeBoundaryLineHasVolume,
} from './activeBoundaryLineDrawMode';
// §FIX-PLAN-TOOL-FINISH-GESTURE (L-9301) — the LIVE confirmation channel. The overlay
// draw is the second leg, not the only one; see `notifyPlanToolCreated`'s header.
import { notifyPlanToolCreated } from '@app/ui/create/activatePlanOnlyTool';

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
    /**
     * ⭐ ONE STROKE, CONFIGURED. Bound in the field initialiser so `hasActiveStroke()`
     * is answerable before the first `activate()` — which is exactly when
     * `anyPlanSurfaceHasStroke()` asks it, on Escape (L-9303).
     */
    private readonly _stroke = new PlanPolylineStroke({
        minPathVerts: MIN_PATH_VERTS,
        minLoopVerts: MIN_LOOP_VERTS,
        resolveMode: resolveActiveBoundaryLineDrawMode,
        resolveLoopMode: activeBoundaryLineLoopMode,
        // ⭐ A CENTRELINE, DRAWN AS LINEWORK — NEVER FILLED. The pool, slab and balcony
        // previews fill their ring because they are AREAS. A boundary line is a LINE:
        // filling it would make an open polyline look like a closed plate and, worse,
        // would make a closed setting-out line indistinguishable on screen from the
        // slab an architect might be about to draw inside it. Dashed, because it is a
        // construction line and not built fabric.
        style: DASHED_CONSTRUCTION_STYLE,
        hint: (s) => this._hint(s.mode, s.loopMode, s.vertexCount, s.awaitingArcEnd, s.canClose),
        finish: (pts, closed, ctx, stroke) => this._create(pts, closed, ctx, stroke),
    });

    /** §T-B1 — a half-drawn line survives an excursion to the toolbar. */
    hasActiveStroke(): boolean {
        return this._stroke.hasActiveStroke();
    }

    activate(ctx: PlanToolDrawContext): void { this._stroke.attach(ctx); }
    deactivate(): void { this._stroke.detach(); }

    onMouseMove(pt: WorldPoint): void { this._stroke.onMouseMove(pt); }
    onClick(pt: WorldPoint): void { this._stroke.onClick(pt); }

    /**
     * ⚠ DOUBLE-CLICK IS DELIBERATELY *NOT* THE SAME GESTURE AS ENTER, and this is the
     * one place this tool must NOT copy the wall. `WallPlanToolHandler.onDoubleClick`
     * closes, because a wall chain has no meaningful open form to commit. A boundary
     * line's open form is FIRST-CLASS — `MIN_PATH_VERTS` is 2 precisely because *"a
     * single 10 m run is a perfectly good setting-out line"* — so if double-click
     * closed too, there would be NO gesture left that finishes an open path. The two
     * keys therefore mean two different things, and the hint says which is which
     * rather than leaving the architect to discover it.
     */
    onDoubleClick(_pt: WorldPoint): void { this._stroke.onDoubleClick(); }

    /**
     * ⭐ §FIX-BOUNDARY-LINE-ENTER-CLOSES (founder, 2026-08-24) — L-10501 · C84 EI-9.
     *
     * ⛔ ENTER DID NOT CLOSE. The founder: *"I started to define the lines in plan view,
     * and once I was happy, to connect back to the first point I clicked ENTER, but the
     * line did not connect as a wall does."* He was right, and the mechanism was one
     * argument: the branch called `commit(false)`. Every ENTER produced an OPEN path,
     * however many vertices had been clicked — so the gesture that exists to close a
     * loop was the gesture that guaranteed it stayed open. `closed` is AUTHORED on this
     * family (the schema says so in as many words).
     *
     * The rule now lives in `PlanPolylineStroke.onKeyDown` + `canClose()`, ONE
     * predicate that the hint also asks, so the hint can never advertise a key that
     * refuses — the C87 §13.8 CW-Poly-1 defect.
     *
     * ⚠ IT ADDS NO VERTEX. `closed: true` IS the closing segment — the schema refuses a
     * closed line whose last vertex repeats its first (*"must be an OPEN loop"*), and
     * `BoundaryLineMeshBuilder` re-closes the polyline itself for drawing.
     */
    onKeyDown(e: KeyboardEvent): boolean { return this._stroke.onKeyDown(e); }

    cancel(): void { this._stroke.cancel(); }
    redraw(): void { this._stroke.redraw(); }

    // ── The FINISH TARGET ────────────────────────────────────────────────────

    private _create(
        points: readonly StrokePoint[],
        closed: boolean,
        ctx: PlanToolDrawContext,
        stroke: PlanPolylineStroke,
    ): void {
        const levelId = ctx.viewDef.spatial?.levelId;
        if (!levelId) {
            // ⛔ Refuse rather than defaulting to a level the user is not looking at.
            stroke.refuse('This view has no level, so there is nothing to draw a boundary line on.');
            return;
        }

        // The polyline the user drew IS the record. Nothing derived is sent: length,
        // segment count and the extruded solid are all computed from these vertices
        // (C84 §8.i — a derived value stored goes stale on the first vertex drag).
        const vertices = points.map((p) => ({ x: p.x, y: 0, z: p.z }));

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

        const dispatch = ctx.runtime?.bus?.executeCommand('boundaryLine.create', payload)
            ?? window.runtime?.bus?.executeCommand('boundaryLine.create', payload);

        if (!dispatch) {
            stroke.refuse('The command bus is not available, so no boundary line was created.');
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
            stroke.refuse(why);
        });
    }

    // ── The hint ─────────────────────────────────────────────────────────────

    /**
     * ⭐ THE HINT ASKS THE PREDICATE (L-10501). It does not re-derive "can I close?"
     * from a vertex count of its own: a hint that names ENTER while ENTER refuses
     * teaches the architect the feature is broken, which is precisely how the founder's
     * report reads. One rule, two readers.
     */
    private _hint(
        mode: string,
        loopMode: string | null,
        vertexCount: number,
        awaitingArcEnd: boolean,
        canClose: boolean,
    ): string {
        if (loopMode) return loopGestureHint(loopMode as never);

        const label = mode === 'ortho' ? 'Orthogonal' : mode === 'curved' ? 'Curved' : 'Linear';
        const volume = activeBoundaryLineHasVolume() ? ' · VOLUME on' : '';

        if (mode === 'curved' && vertexCount > 0) {
            if (awaitingArcEnd) return 'Curved · Click the arc END point · Backspace to re-pick midpoint';
            const tail = canClose
                ? ' · Enter to CLOSE · Dbl-click to finish open'
                : (vertexCount >= MIN_PATH_VERTS ? ' · Enter to finish' : '');
            return `Curved · Click the arc MIDPOINT${tail}`;
        }
        if (canClose) {
            return `${label}${volume} · Enter to CLOSE the ring · Dbl-click to finish it open`;
        }
        const missing = MIN_PATH_VERTS - vertexCount;
        return vertexCount >= MIN_PATH_VERTS
            ? `${label}${volume} · Dbl-click or Enter to finish · 1 more point to close a ring`
            : `${label}${volume} · ${missing} more point${missing !== 1 ? 's' : ''} needed`;
    }
}
