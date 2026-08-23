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

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Enter' && this._points.length >= MIN_PATH_VERTS
            && !activeBoundaryLineLoopMode() && !this._arcMidPt) {
            e.preventDefault();
            this._commit(false);
            return true;
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

        void Promise.resolve(dispatch).catch((e: unknown) => {
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
        if (mode === 'curved' && this._points.length > 0) {
            return this._arcMidPt
                ? 'Curved · Click the arc END point · Backspace to re-pick midpoint'
                : `Curved · Click the arc MIDPOINT${this._points.length >= MIN_PATH_VERTS ? ' · Enter to finish' : ''}`;
        }
        const missing = MIN_PATH_VERTS - this._points.length;
        return this._points.length >= MIN_PATH_VERTS
            ? `${label}${volume} · Dbl-click or Enter to finish the boundary line`
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
