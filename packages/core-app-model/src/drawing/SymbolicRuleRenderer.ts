/**
 * SymbolicRuleRenderer — Contract 25a §3.4 (Phase 3)
 *
 * Draws 2D symbolic elements (door swings, window cased openings, …) in Canvas2D plan views.
 *
 * Called from PlanViewCanvas.render() for elements whose layer carries a registered
 * `symbolicRule`. Its job is SYMBOL DISPATCH — which geometry a door/window contributes to a
 * plan — and NOTHING ELSE.
 *
 * ═══ §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280) — THIS MODULE WAS A SECOND PEN AUTHORITY ═══
 *
 * It used to take an `ElementStateAppearance` and stroke `appearance.line.weight`, and
 * `PlanViewCanvas` resolved that appearance with the state **HARD-CODED to `'projection'`**.
 * Three consequences, all shipped:
 *
 *  1. **THE ZONE WAS DISCARDED FOR EXACTLY THE TWO ELEMENT TYPES THAT HAVE SYMBOLS.** Any
 *     door/window sub-layer that is not `-CUT` and not `-BEYOND` (both of which
 *     `symbolicRuleForLayer` explicitly declines) came through here — and that includes
 *     `A-DOOR-HIDDEN` / `A-GLAZ-HIDDEN`, the layers `applyOcclusion()` DEMOTES onto
 *     (HiddenLineRemoval → `siblingZoneLayer(…, 'hidden')`). An OCCLUDED door frame was
 *     therefore painted SOLID, at PROJECTION weight, on the PROJECTION colour. L-277 gave the
 *     `hidden` zone a name, a producer and a dashed pen; this module then threw all three away
 *     at the last mile, for doors and windows. **The zone ladder was flattened here.**
 *
 *  2. **THE GRAPHICS-RULES CHAIN WAS SKIPPED.** `resolveIntentStyle()` is only the INTENT tier
 *     (priority 1000). `graphicsRulesEngine.resolveStyle()` — the call the generic path makes,
 *     and per Contract-23 §7.1 the ONLY sanctioned style entry point — runs that SAME intent
 *     tier and then layers the VIEW (9000) and ELEMENT (10000) overrides on top. So a per-view
 *     or per-element pen override applied to every line in the drawing EXCEPT the door and
 *     window symbols, and the VG governance line-weight/edge-colour factor never reached them
 *     at all. The founder could re-weight his windows and watch nothing happen.
 *
 *  3. …and therefore a NEW pen axis could never reach a symbol either. §FEAT-PEN-WEIGHT-BY-
 *     WALL-FUNCTION (L-285) would have been built, tested at the seam, and been invisible on
 *     screen for hosted elements. The two tickets were one bug.
 *
 * THE FIX: **ONE PEN AUTHORITY.** The canvas resolves the pen ONCE — through
 * `graphicsRulesEngine.resolveStyle(zone, category, { …, elementFunction })`, with the segment's
 * REAL zone — composes it with the VG factor and the hairline exactly as it does for every
 * other line in the drawing, and hands the finished stroke state here as a {@link SymbolPen}.
 * This module no longer imports the intent resolver, the pen table, or `SCREEN_PX_PER_MM`; it
 * cannot re-decide a weight, because it is no longer given the means to.
 *
 * Extensibility contract (Contract 25a §3.4) is UNCHANGED: new symbols are added to
 * SYMBOL_RENDERERS without touching this module's orchestration. Each renderer receives:
 *     - ctx:      the active Canvas2D context
 *     - segments: the screen-space segment pairs for this element
 *     - pen:      the caller-resolved stroke state (Contract-23 §7.1)
 *
 * Contract compliance:
 *   Contract 23 §7.1  — resolveStyle() is the ONLY style entry point; this module makes NO
 *                        pen decision of its own (it has no pen-table or intent import)
 *   Contract 25 §8.2  — rule precedence; the pen is fully resolved by the caller
 *   Contract 25a §3.4 — extensible symbol dispatch; no renderer logic changes on extension
 *   Contract 05 §4    — no DOM, no Three.js, no store imports; Canvas2D only
 *   C09 §4.6.4        — the zone ladder reaches the symbol, because the caller passes the zone
 */

// ─── Segment type ─────────────────────────────────────────────────────────────

/** A single screen-space line segment (pixel coordinates). */
export interface SymbolSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

// ─── The pen, as the caller resolved it ───────────────────────────────────────

/**
 * A fully-resolved stroke state, in SCREEN units.
 *
 * §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280): deliberately NOT a `PenStyle` (mm) and NOT an
 * `ElementStateAppearance`. Both would invite this module to do the mm→px conversion, the
 * hairline clamp or the VG composition a second time — and a second conversion is a second
 * authority, which is the bug. What arrives here is what gets painted.
 */
export interface SymbolPen {
    /** Final stroke width in CSS pixels — already hairline-clamped and VG-composed. */
    widthPx: number;
    /** Final stroke colour (VG edge override already applied). */
    color:   string;
    /** Final dash pattern in CSS pixels, or null for solid. Already hairline-scaled. */
    dashPx:  number[] | null;
    /** Final opacity 0–1. */
    opacity: number;
}

// ─── Symbol renderer type ─────────────────────────────────────────────────────

type SymbolRenderFn = (
    ctx: CanvasRenderingContext2D,
    segments: SymbolSegment[],
    pen: SymbolPen,
) => void;

// ─── Base segment renderer ────────────────────────────────────────────────────

/**
 * Render all segments in a single beginPath / stroke call using the pen the CALLER resolved.
 * This is the default renderer used by 'plan-door-swing' and 'plan-window-cased' to draw the
 * already-projected symbol geometry.
 */
function _renderSegmentsWithPen(
    ctx: CanvasRenderingContext2D,
    segments: SymbolSegment[],
    pen: SymbolPen,
): void {
    // opacity 0 is how the intent chain expresses "not visible" (appearanceToPenStyle zeroes
    // width AND opacity) — painting it would be a no-op anyway, but skipping is cheaper and
    // keeps the "invisible element draws nothing" invariant explicit.
    if (segments.length === 0 || pen.opacity <= 0) return;

    ctx.save();
    ctx.strokeStyle = pen.color;
    ctx.lineWidth   = pen.widthPx;
    ctx.globalAlpha = pen.opacity;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.miterLimit  = 4;
    ctx.setLineDash(pen.dashPx ?? []);

    ctx.beginPath();
    for (const seg of segments) {
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
    }
    ctx.stroke();
    ctx.restore();
}

// ─── Symbol renderer registry ─────────────────────────────────────────────────

/**
 * Map of symbolicRule key → Canvas2D render function.
 *
 * Keys match the `symbolicRule` values defined in ElementTypeRegistry and
 * VisibilityIntentTypes.ElementStateAppearance.symbolicRule.
 *
 * To add a new symbol:
 *   1. Define a SymbolRenderFn below.
 *   2. Add it to this map with its unique key string.
 *   3. Reference the key in ELEMENT_TYPE_REGISTRY or an intent viewTypeModifier.
 *   — No other changes are required. —
 */
const SYMBOL_RENDERERS: Record<string, SymbolRenderFn> = {

    /**
     * 'plan-door-swing' — door panel + quarter-circle swing arc.
     *
     * The geometry is already injected into the TechnicalDrawing by
     * DoorPlanSymbolBuilder.inject() (called from EdgeProjectorService).
     * This renderer applies the intent-resolved appearance to that geometry
     * instead of the generic line traversal style.
     *
     * Per Contract 25a §3.4: "THE WALLS LINES IN THE HOSTED AREA IN PLAN
     * VIEW NEED TO BE CUT" — the gap in the wall is handled at projection
     * time by EdgeProjectorService classifyByVertexY + cut-layer culling;
     * this renderer does not need to clip wall lines.
     */
    'plan-door-swing': (ctx, segments, pen) => {
        _renderSegmentsWithPen(ctx, segments, pen);
    },

    /**
     * 'plan-window-cased' — two parallel lines with end caps (cased opening).
     *
     * Geometry is already injected by WindowPlanSymbolBuilder.inject().
     * This renderer applies intent-resolved styling.
     */
    'plan-window-cased': (ctx, segments, pen) => {
        _renderSegmentsWithPen(ctx, segments, pen);
    },

    /**
     * 'elev-window' — the AUTHORED window elevation symbol (§ELEV-SYMBOL-OPENING, L-1240).
     *
     * Geometry is injected by `OpeningElevationSymbolBuilder.inject()`, which sets the opening
     * out from its own record through `OpeningElevationSymbol.buildOpeningElevationSymbol()` —
     * head and sill horizontal BY CONSTRUCTION, profile-driven, on the true world plane of the
     * void's face. This renderer only strokes it with the pen the caller resolved.
     *
     * ⚠ **STATED NARROWLY SO IT IS NOT OVERSOLD.** Registering this key does NOT, by itself,
     * change any pen: the elevation path never had the L-280 bypass — `symbolicRuleForLayer()`
     * declined every non-plan view, so elevation opening linework has always gone down the
     * GENERIC path, which already resolves the pen through the full Contract-23 §7.1 chain from
     * the segment's real zone. What the key buys is dispatch: the drawing can now SAY what an
     * opening is in elevation, the C25a §3.4 extensibility contract covers both view families
     * rather than one, and a symbol-specific stroke treatment has a place to live that is not a
     * second pen authority.
     */
    'elev-window': (ctx, segments, pen) => {
        _renderSegmentsWithPen(ctx, segments, pen);
    },

    /**
     * 'elev-door' — the AUTHORED door elevation symbol (§ELEV-SYMBOL-OPENING, L-1240).
     *
     * Same seam as 'elev-window'. The door's extra content — the meeting stile of a double leaf
     * and the EN ISO 7519 swing chevrons — arrives here as ordinary segments on their own ZONE:
     * a leaf that opens away carries `hidden`, the one zone that dashes (C09 §4.6.0), so the
     * dashed convention is expressed through the ladder and never by this module choosing a
     * dash array. That is the L-280 rule restated: the pen is an INPUT here, not a decision.
     */
    'elev-door': (ctx, segments, pen) => {
        _renderSegmentsWithPen(ctx, segments, pen);
    },

    /**
     * 'elev-wall' — the AUTHORED wall elevation symbol (§ELEV-SYMBOL-WALL, L-1242).
     *
     * The wall's NEAR FACE, once: base, top and the two ends — and for a curved wall the base
     * and top are CONTINUOUS polylines rather than the `2 x (segments + 1)` tessellation seams
     * `EdgesGeometry` was promoting to drawn verticals. Geometry is injected by
     * `OpeningElevationSymbolBuilder.inject()`; this renderer only strokes it with the pen the
     * caller resolved.
     */
    'elev-wall': (ctx, segments, pen) => {
        _renderSegmentsWithPen(ctx, segments, pen);
    },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns whether a symbolicRule key has a registered renderer.
 */
export function hasSymbolicRenderer(rule: string): boolean {
    return rule in SYMBOL_RENDERERS;
}

/**
 * Render a symbolic element with the pen the CALLER resolved.
 *
 * This is the primary entry point called from PlanViewCanvas.render() when a LineSegments
 * child's layer carries a registered symbolicRule and the view type is 'plan'.
 *
 * §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280) — the `appearance` + `hairline` parameters are
 * GONE. They were the bypass: they let this module resolve a weight from the intent tier
 * alone, at a hard-coded `'projection'` state, and paint it over the pen the canvas had
 * already resolved from the segment's real zone through the full Contract-23 §7 chain. The pen
 * is now an INPUT, not a decision. See the module header.
 *
 * @param ctx      Active Canvas2D rendering context.
 * @param rule     The symbolicRule key (e.g. 'plan-door-swing').
 * @param segments Screen-space segments for this element (pre-converted).
 * @param pen      The fully-resolved screen-space stroke state (Contract-23 §7.1).
 *
 * @returns true when a matching renderer was found and invoked; false otherwise.
 */
export function renderSymbol(
    ctx: CanvasRenderingContext2D,
    rule: string,
    segments: SymbolSegment[],
    pen: SymbolPen,
): boolean {
    const renderer = SYMBOL_RENDERERS[rule];
    if (!renderer) {
        console.warn(`[SymbolicRuleRenderer] No renderer registered for rule: "${rule}"`);
        return false;
    }
    renderer(ctx, segments, pen);
    return true;
}

/**
 * Determine whether a layer tag corresponds to a symbolic element type and
 * return the layer's resolved symbolicRule key, or null.
 *
 * This helper is used by PlanViewCanvas.render() to decide whether a
 * LineSegments child should be routed through SymbolicRuleRenderer instead
 * of the generic pen-style path.
 *
 * Only applies when viewType === 'plan'.
 *
 * @param layerTag The concatenated layerName/name/parent tag string.
 * @param viewType The active view type.
 */
export function symbolicRuleForLayer(layerTag: string, viewType: string): string | null {
    const tag = layerTag.trim();

    // ═══ §ELEV-SYMBOL-OPENING (L-1240) — THE ELEVATION ARM ═══════════════════════
    //
    // This function used to open `if (viewType !== 'plan') return null;`. That one line was the
    // whole of *"there is no elevation symbol for a door or a window"*: every non-plan view fell
    // straight through to the generic path, where an opening is `EdgesGeometry(mesh.geometry)`
    // — the SOLID's wireframe, both faces, plus the depth edges joining them. This module's own
    // line 4 said so (*"in Canvas2D **plan** views"*) and line 241 named the consequence
    // (*"projected silhouette, not an authored symbol"*).
    //
    // The `-SYM` suffix is what makes the arm SAFE rather than a widening. Only linework that
    // `OpeningElevationSymbolBuilder` INJECTED carries it; the host wall's own projected
    // linework on `A-GLAZ:proj` does not, and keeps its existing generic path byte-identical.
    // So this cannot re-route a single line that exists today — it can only route lines that
    // did not exist before it.
    if (viewType === 'elevation' || viewType === 'building-elevation' || viewType === 'section') {
        if (!/-SYM\b/i.test(tag)) return null;
        if (/A-DOOR|door/i.test(tag)) return 'elev-door';
        if (/A-GLAZ|window|curtain-panel/i.test(tag)) return 'elev-window';
        // §ELEV-SYMBOL-WALL (L-1242). Tested LAST so a hosted-element token in the tag still
        // wins — a door's symbol layer must never be claimed by the wall rule because the two
        // happen to share a parent name.
        if (/A-WALL|wall/i.test(tag)) return 'elev-wall';
        return null;
    }

    if (viewType !== 'plan') return null;
    // §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280) — NOTE what these two declines now do, and what
    // they NO LONGER do. They select which RENDERER runs; they no longer select a STYLE, because
    // there is only one pen authority left (the caller's `SymbolPen`) and every zone — including
    // `hidden`, which used to be flattened to `projection` here — reaches it. Keeping them is a
    // GEOMETRY decision, not a styling one:
    //   • BEYOND door/window linework is projected silhouette, not an authored symbol.
    if (/[:-]beyond\b/i.test(tag)) return null;
    //   • CUT door/window linework (A-DOOR-CUT, A-GLAZ-CUT — the frame jambs and the door leaf
    //     physically sliced by the floor-plan section plane) belongs on the generic path
    //     because that path ALSO runs the poché fill pass: a cut solid is a FILLED region
    //     (C09 §4.6.2), and the symbol renderers only stroke. (§DOOR-WINDOW-PLAN-FRAME,
    //     2026-05-22 — originally written to escape the hard-coded 'projection' weight; that
    //     reason is now dead, the poché reason is not.)
    if (/[:-]cut\b/i.test(tag)) return null;
    if (/A-DOOR|door/i.test(tag)) return 'plan-door-swing';
    if (/A-GLAZ|window|curtain-panel/i.test(tag)) return 'plan-window-cased';
    return null;
}

/**
 * Map layer tag to the element type string used by IntentRuleResolver.
 * Returns the canonical elementType for intent lookups, or null.
 */
export function elementTypeForSymbolLayer(layerTag: string): string | null {
    const tag = layerTag.trim();
    if (/A-DOOR|door/i.test(tag)) return 'door';
    if (/A-GLAZ|window|curtain-panel/i.test(tag)) return 'window';
    return null;
}
