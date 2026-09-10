/**
 * PlanPolylineStroke — THE ONE plan-view polyline stroke, with a pluggable FINISH TARGET.
 *
 * C116 §11 · ADR-0384 · C84 EI-9 · [[same-rule-two-implementations]] · [[grep-for-the-existing-solver-first]].
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS, AND WHY IT IS AN EXTRACTION RATHER THAN A NEW TOOL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `siteworksRailTools.ts` shipped WITHOUT a draw gesture and said so in its own
 * header, with the reason:
 *
 *   ⛔ "`BoundaryLinePlanToolHandler.ts` is 549 lines and ALREADY draws an
 *      ortho/curved/looping polyline with snapping. Writing a
 *      `SiteworksPlanToolHandler` beside it would be a SECOND polyline-stroke
 *      implementation — [[same-rule-two-implementations]], this repository's
 *      most-repeated defect, and the guarding test would stay green on whichever
 *      copy it happened to measure. The correct move is to EXTRACT the stroke from
 *      that handler and have both call it. Recorded as C116 §11."
 *
 * This is that extraction. `BoundaryLinePlanToolHandler` now OWNS no stroke state at
 * all — it configures one of these and supplies a `finish`. `SiteworksPlanToolHandler`
 * does the same with a different `finish`. One gesture, two sinks.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ THIS IS **NOT** THE `armEnvelopeDraw` STROKE, AND CONFLATING THEM IS A DEFECT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The sibling ARRAY-ALONG-PATH lane (`44f4cf09`) shipped *"ONE stroke driver with a
 * second finish target"* for the site-envelope spine, and the obvious move was to be
 * its third caller. ⚠ THAT COMMIT ITSELF RULES OTHERWISE, and the reason is
 * structural rather than stylistic — its own words:
 *
 *   "⚠ THE OTHER STROKE FAMILY IS NOT THIS ONE, and conflating them would be the
 *    same defect inverted. `BoundaryLinePlanToolHandler` strokes the BIM plan view
 *    through `PlanToolDrawContext`, hard-bound to `HTMLCanvasElement`;
 *    `envelopeDrawSurface.ts` already records that no Cesium or MapLibre adapter can
 *    satisfy it. Both families already delegate their RULES to the same
 *    `@pryzm/geometry-slab` primitives, which is the sharing that matters. Recorded
 *    for C116 §11 / `siteworksRailTools.ts`, which waits on the OTHER one."
 *
 * The two families differ in their SURFACE, not their rules:
 *
 *   `armEnvelopeDraw`      → Cesium globe + MapLibre map · lat/lon · 3D Site / 2D Site
 *   `PlanPolylineStroke`   → `HTMLCanvasElement` + `PlanViewCanvas.worldToScreen`
 *                            · metres on the level's XZ plane · PRYZM 2D / PRYZM 3D
 *
 * The founder's report names PRYZM 2D and PRYZM 3D, which is this surface. So this
 * file is the SECOND stroke driver in the repository and deliberately so; what would
 * be the defect is a THIRD one inside `SiteworksPlanToolHandler`. Both drivers reach
 * the same `@pryzm/geometry-slab` rule primitives (`orthoConstrain`,
 * `boundaryLoopVertices`, `arcSegmentThroughMidpoint`), which is where an actual
 * divergence between them would show up.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT IS CONFIGURABLE, AND WHAT IS DELIBERATELY NOT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CONFIGURABLE — the things that genuinely differ between two families:
 *   · the mode source (each family owns a surface-independent mode store)
 *   · the loop-mode source
 *   · the minimum vertex counts
 *   · the hint sentence
 *   · the preview STYLE, and an optional world-space UNDERLAY (the road band)
 *   · the FINISH TARGET
 *
 * NOT CONFIGURABLE, because a second answer is how two tools come to disagree:
 *   · the ortho constraint            → `orthoConstrain` (geometry-slab)
 *   · the 3-click arc                 → `arcSegmentThroughMidpoint` (geometry-slab)
 *   · the closed-loop ring + refusal  → `boundaryLoopVertices` / `boundaryLoopRefusal`
 *   · Enter-closes / Enter-finishes   → `canClose()` below, ONE predicate, and the
 *                                       hint ASKS it rather than re-deriving it
 *                                       (the C87 §13.8 CW-Poly-1 defect)
 *   · Backspace unwinds the arc midpoint first, then vertices
 *   · a refusal SURVIVES the next pointer sample (L-9301) and is cleared by the
 *     next CLICK, because a new attempt is when the old reason stops being true
 */

import {
    boundaryLoopVertices, boundaryLoopRefusal, BOUNDARY_LOOP_GESTURE,
    arcSegmentThroughMidpoint, orthoConstrain,
    type BoundaryLoopMode,
} from '@pryzm/geometry-slab';
import type { PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import { notifyPlanToolRefusal } from '@app/ui/create/activatePlanOnlyTool';

/** PRYZM purple — the shared preview colour every plan tool draws in. */
export const PLAN_STROKE_PURPLE = '#6600ff';

/** A ground-plane point in metres. The vocabulary `Vec3.y === 0` families share. */
export interface StrokePoint {
    readonly x: number;
    readonly z: number;
}

/** A point in CSS pixels on the overlay canvas. */
export interface ScreenPoint {
    readonly sx: number;
    readonly sy: number;
}

/** Everything a hint needs to know, so no family re-derives "can I close?". */
export interface StrokeHintState {
    readonly mode: string;
    readonly loopMode: BoundaryLoopMode | null;
    readonly vertexCount: number;
    /** True between the arc MIDPOINT click and the arc END click. */
    readonly awaitingArcEnd: boolean;
    /** The ONE closure predicate — see `canClose()`. */
    readonly canClose: boolean;
}

/** How the centreline itself is painted. */
export interface PlanStrokeStyle {
    readonly colour: string;
    readonly lineWidth: number;
    /** `[]` for a solid line. Boundary lines are dashed because they are construction. */
    readonly dash: readonly number[];
    /** Radius of the vertex dots, in CSS px. `0` draws none. */
    readonly vertexDotRadius: number;
}

export const DASHED_CONSTRUCTION_STYLE: PlanStrokeStyle = Object.freeze({
    colour: PLAN_STROKE_PURPLE,
    lineWidth: 1.8,
    dash: Object.freeze([10, 4]) as readonly number[],
    vertexDotRadius: 4,
});

/** What an underlay painter is handed. World→screen is the caller's, never re-derived. */
export interface StrokeUnderlayContext {
    readonly ctx: CanvasRenderingContext2D;
    /** The vertices as they stand, INCLUDING the trailing cursor point. Metres. */
    readonly points: readonly StrokePoint[];
    readonly closed: boolean;
    readonly toScreen: (x: number, z: number) => ScreenPoint;
}

export interface PlanPolylineStrokeConfig {
    /** Minimum vertices for an OPEN finish. 2 for a path family, 3 for an area family. */
    readonly minPathVerts: number;
    /** Minimum vertices for a CLOSED finish. Three to enclose anything. */
    readonly minLoopVerts: number;
    /** Re-read on EVERY sample, so a mode-strip switch applies to the very next click. */
    readonly resolveMode: () => string;
    /** `null` unless the active mode is one of the closed-loop shapes. */
    readonly resolveLoopMode: () => BoundaryLoopMode | null;
    /** The sentence painted bottom-left. Asks `state.canClose`, never a count of its own. */
    readonly hint: (state: StrokeHintState) => string;
    /**
     * ⭐ THE FINISH TARGET — the only thing that differs between the two families.
     *
     * Called with the vertices in METRES on the level's XZ plane. It must dispatch
     * through the bus (P6) and mint its own id (C16 CA-2). Calling `stroke.refuse()`
     * from inside it is supported and SUPPRESSES the reset/clear that would otherwise
     * erase the reason — see `_commit`.
     */
    readonly finish: (
        points: readonly StrokePoint[],
        closed: boolean,
        ctx: PlanToolDrawContext,
        stroke: PlanPolylineStroke,
    ) => void;
    readonly style?: PlanStrokeStyle;
    /** Painted UNDER the centreline every frame. Roads use it for the swept band. */
    readonly underlay?: (u: StrokeUnderlayContext) => void;
}

/**
 * One in-progress polyline on one plan surface.
 *
 * ⚠ ONE INSTANCE PER SURFACE. `planToolHandlerRegistry` hands each overlay its OWN
 * handler instances precisely so the split pane's half-drawn stroke cannot alias the
 * main pane's; a shared stroke object would undo that in one line.
 */
export class PlanPolylineStroke {
    private _ctx:         PlanToolDrawContext | null = null;
    private _points:      WorldPoint[] = [];
    private _cursorPoint: WorldPoint | null = null;
    private _loopAnchor:  WorldPoint | null = null;
    private _arcMidPt:    WorldPoint | null = null;
    /** The last refusal, shown on the overlay so it reaches a PERSON, not a console. */
    private _refusal:     string | null = null;

    constructor(private readonly _cfg: PlanPolylineStrokeConfig) {}

    // ── Lifecycle ────────────────────────────────────────────────────────────

    attach(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this.reset();
    }

    detach(): void {
        this.clearOverlay();
        this.reset();
        this._ctx = null;
    }

    /** §T-B1 — a half-drawn line survives an excursion to the toolbar. */
    hasActiveStroke(): boolean {
        return this._points.length > 0 || this._loopAnchor !== null || this._arcMidPt !== null;
    }

    /** The vertices as they stand, in metres. Read-only — for tests and hints. */
    vertices(): readonly StrokePoint[] {
        return this._points.map((p) => ({ x: p.worldX, z: p.worldZ }));
    }

    // ── Interaction ──────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        // ⭐ L-9301 — A REFUSAL OUTLIVES THE POINTER. The overlay clears the canvas at
        // the head of every sample and this stroke draws NOTHING at zero points, so
        // without this the reason the last gesture failed is erased by the architect's
        // next 16 ms of mouse movement. Cleared by the next CLICK, because a new
        // attempt is when the old reason stops being true.
        if (this._refusal) {
            this._cursorPoint = pt;
            this._drawRefusal();
            return;
        }
        // Mode is re-read on EVERY sample (the `WallModePicker.getActiveMode()`
        // contract) so a switch on the mode strip applies to the very next click
        // without re-activating the tool and destroying the stroke.
        const mode = this._cfg.resolveMode();

        if (this._cfg.resolveLoopMode() && this._loopAnchor) {
            this._cursorPoint = pt;
            this.redraw();
            return;
        }
        if (mode === 'ortho' && this._points.length > 0) {
            this._cursorPoint = this._orthoSnap(this._points[this._points.length - 1]!, pt);
            this.redraw();
            return;
        }
        if (this._points.length > 0) {
            this._cursorPoint = pt;
            this.redraw();
        }
    }

    onClick(pt: WorldPoint): void {
        const mode = this._cfg.resolveMode();
        // A new click is a new attempt: clear any refusal still on screen so the user
        // is never told why the LAST gesture failed while making a new one.
        this._refusal = null;

        // ── CLOSED-LOOP modes: RECTANGULAR / CIRCULAR / ELLIPTICAL ───────────
        const loopMode = this._cfg.resolveLoopMode();
        if (loopMode) {
            if (!this._loopAnchor) {
                this._loopAnchor  = pt;
                this._points      = [pt];
                this._cursorPoint = pt;
                this.redraw();
                return;
            }
            const first  = { x: this._loopAnchor.worldX, z: this._loopAnchor.worldZ };
            const second = { x: pt.worldX, z: pt.worldZ };
            const ring = boundaryLoopVertices(loopMode, first, second);
            if (ring.length < this._cfg.minLoopVerts) {
                // ⛔ C16 CA-18 — name the reason AND what does work. Never silently
                // fall back to another shape: a circle that quietly became a rectangle
                // is a worse outcome than a refusal.
                this.refuse(boundaryLoopRefusal(loopMode, first, second)
                    ?? 'That outline is too small to draw.');
                return;
            }
            this._points = ring.map((v) => ({ worldX: v.x, worldZ: v.z } as WorldPoint));
            this._commit(true);
            return;
        }

        // ── CURVED — vertex → arc MIDPOINT → arc END (the wall tool's 3-click) ──
        if (mode === 'curved' && this._points.length > 0) {
            if (!this._arcMidPt) {
                this._arcMidPt    = pt;
                this._cursorPoint = pt;
                this.redraw();
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
            this.redraw();
            return;
        }

        // ── LINEAR / ORTHO — accumulate vertices ─────────────────────────────
        const vertex = (mode === 'ortho' && this._points.length > 0)
            ? this._orthoSnap(this._points[this._points.length - 1]!, pt)
            : pt;
        this._points.push(vertex);
        this.redraw();
    }

    onDoubleClick(): void {
        if (this._cfg.resolveLoopMode()) return;   // closed loops commit on the 2nd click
        if (this._arcMidPt) return;                // don't eat the pending arc END click
        if (this._points.length >= this._cfg.minPathVerts) this._commit(false);
    }

    /**
     * ⭐ THE ONE closure predicate. ENTER and the on-screen hint both ask THIS, so the
     * hint can never advertise a key that refuses — the exact defect
     * `CurtainWallTool._canClosePolyline()` was minted to kill (C87 §13.8 CW-Poly-1:
     * its HUD button was labelled `↵` while ENTER was bound to *finish*, and the key
     * that actually closed was `C`, advertised nowhere).
     */
    canClose(): boolean {
        return !this._cfg.resolveLoopMode()
            && this._arcMidPt === null
            && this._points.length >= this._cfg.minLoopVerts;
    }

    onKeyDown(e: KeyboardEvent): boolean {
        // ⭐ L-10501 — ENTER CLOSES THE RING when there is a ring to close, and
        // FINISHES otherwise. Two vertices are a chain, not a loop, and finishing it
        // is the only correct reading.
        //
        // ⚠ DOUBLE-CLICK IS DELIBERATELY *NOT* CHANGED TO MATCH. A path family's OPEN
        // form is first-class (`minPathVerts` is 2 precisely because a single 10 m run
        // is a perfectly good setting-out line, and a two-point road centreline is a
        // perfectly good road), so if double-click closed too there would be NO
        // gesture left that finishes an open path.
        if (e.key === 'Enter' && !this._cfg.resolveLoopMode() && !this._arcMidPt) {
            if (this.canClose()) {
                e.preventDefault();
                this._commit(true);
                return true;
            }
            if (this._points.length >= this._cfg.minPathVerts) {
                e.preventDefault();
                this._commit(false);
                return true;
            }
        }
        if (e.key === 'Backspace' && this._arcMidPt) {
            this._arcMidPt = null;
            this.redraw();
            return true;
        }
        if (e.key === 'Backspace' && this._points.length > 0) {
            this._points.pop();
            if (this._points.length === 0) this._loopAnchor = null;
            this.redraw();
            return true;
        }
        return false;
    }

    cancel(): void {
        this.reset();
        this.clearOverlay();
    }

    // ── Refusal ──────────────────────────────────────────────────────────────

    /**
     * Record a refusal AND put it on the overlay AND in front of a person.
     *
     * ⭐ A `console.warn` is not a refusal — it is a refusal nobody reads, and a
     * refusal painted on the preview canvas is erased ~16 ms later (L-9301). Both
     * legs, every time. Every path that declines to create comes through here.
     */
    refuse(message: string): void {
        this._refusal = message;
        this.reset();
        this._drawRefusal();
        notifyPlanToolRefusal(message);
    }

    /** Test seam — was a refusal recorded, and what did it say? */
    refusal(): string | null {
        return this._refusal;
    }

    // ── Commit ───────────────────────────────────────────────────────────────

    private _commit(closed: boolean): void {
        const ctx = this._ctx;
        const need = closed ? this._cfg.minLoopVerts : this._cfg.minPathVerts;
        if (!ctx || this._points.length < need) return;

        const pts = this._points.map((p) => ({ x: p.worldX, z: p.worldZ }));
        this._refusal = null;
        this._cfg.finish(pts, closed, ctx, this);

        // ⭐ A finish that REFUSED has ALREADY reset the stroke and painted its reason.
        // Clearing here would erase that reason in the same tick — L-9301 re-minted
        // from the inside. `refuse()` is the only thing that can set `_refusal` here,
        // and it is synchronous; an async rejection lands later and repaints itself.
        if (this._refusal !== null) return;

        this.reset();
        this.clearOverlay();
    }

    // ── Painting ─────────────────────────────────────────────────────────────

    reset(): void {
        this._points      = [];
        this._cursorPoint = null;
        this._loopAnchor  = null;
        this._arcMidPt    = null;
    }

    clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
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

    redraw(): void {
        const c = this._ctx;
        if (!c || this._points.length === 0) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        const style   = this._cfg.style ?? DASHED_CONSTRUCTION_STYLE;
        const mode    = this._cfg.resolveMode();
        const toScreen = (x: number, z: number): ScreenPoint => planCanvas.worldToScreen(x, z);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        // ── CLOSED-LOOP preview ──────────────────────────────────────────────
        // ⭐ Generated from THE SAME ring the commit will use, so what the user aims at
        // cannot diverge from what lands.
        const loopMode = this._cfg.resolveLoopMode();
        if (loopMode && this._loopAnchor && this._cursorPoint) {
            const ring = boundaryLoopVertices(
                loopMode,
                { x: this._loopAnchor.worldX,  z: this._loopAnchor.worldZ  },
                { x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ },
            );
            if (ring.length >= this._cfg.minLoopVerts) {
                this._cfg.underlay?.({
                    ctx,
                    points: ring.map((v) => ({ x: v.x, z: v.z })),
                    closed: true,
                    toScreen,
                });
                this._strokePath(ctx, style, ring.map((v) => toScreen(v.x, v.z)), true);
            }
            this._drawHint(ctx, cssH, this._cfg.hint({
                mode,
                loopMode,
                vertexCount: ring.length,
                awaitingArcEnd: false,
                canClose: false,
            }));
            ctx.restore();
            return;
        }

        const world: StrokePoint[] = this._points.map((p) => ({ x: p.worldX, z: p.worldZ }));

        if (this._cursorPoint) {
            if (mode === 'curved' && this._arcMidPt && this._points.length > 0) {
                const last = this._points[this._points.length - 1]!;
                for (const v of arcSegmentThroughMidpoint(
                    { x: last.worldX,              z: last.worldZ              },
                    { x: this._arcMidPt.worldX,    z: this._arcMidPt.worldZ    },
                    { x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ },
                )) world.push({ x: v.x, z: v.z });
            } else {
                world.push({ x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ });
            }
        }

        this._cfg.underlay?.({ ctx, points: world, closed: false, toScreen });
        this._strokePath(ctx, style, world.map((p) => toScreen(p.x, p.z)), false);

        if (mode === 'curved' && this._arcMidPt) {
            const m = toScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            ctx.fillStyle = style.colour;
            ctx.beginPath(); ctx.arc(m.sx, m.sy, 5, 0, Math.PI * 2); ctx.fill();
        }

        if (style.vertexDotRadius > 0) {
            ctx.fillStyle = style.colour;
            for (const p of this._points) {
                const s = toScreen(p.worldX, p.worldZ);
                ctx.beginPath(); ctx.arc(s.sx, s.sy, style.vertexDotRadius, 0, Math.PI * 2); ctx.fill();
            }
        }

        this._drawHint(ctx, cssH, this._cfg.hint({
            mode,
            loopMode: null,
            vertexCount: this._points.length,
            awaitingArcEnd: this._arcMidPt !== null,
            canClose: this.canClose(),
        }));
        ctx.restore();
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

    private _strokePath(
        ctx: CanvasRenderingContext2D,
        style: PlanStrokeStyle,
        pts: ReadonlyArray<ScreenPoint>,
        close: boolean,
    ): void {
        if (pts.length === 0) return;
        ctx.setLineDash([...style.dash]);
        ctx.lineWidth   = style.lineWidth;
        ctx.strokeStyle = style.colour;
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
}

/** The gesture sentence a closed-loop mode advertises — shared, never re-typed. */
export function loopGestureHint(loopMode: BoundaryLoopMode): string {
    return `${BOUNDARY_LOOP_GESTURE[loopMode].second} · Esc to cancel`;
}
