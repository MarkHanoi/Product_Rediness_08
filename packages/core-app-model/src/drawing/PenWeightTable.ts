/**
 * PenWeightTable — Contract 23 §8
 *
 * Single source of truth for all pen styles: line width (mm), colour, dash
 * pattern, and opacity — keyed by (VRZone × ElementCategory).
 *
 * Usage in Canvas2D rendering:
 *   const pen = resolvePen(zone, category);
 *   ctx.lineWidth   = Math.max(hairlinePx, pen.widthMm * SCREEN_PX_PER_MM);
 *   ctx.strokeStyle = pen.color;
 *   ctx.globalAlpha = pen.opacity;
 *   ctx.setLineDash(pen.dashPx ?? []);
 *
 * dash values are in CSS-pixel units, scaled by the caller's hairline factor
 * so they look correct on both standard and high-DPI displays.
 *
 * Contract compliance:
 *   Contract 23 §8 — zone × category pen weight table (locked values)
 *   Contract 23 §7 — pixel conversion formula (widthMm × pxPerMm)
 *
 * Migration: Wave 10 Task 1 (W10-A). Lifted from src/core/drawing/PenWeightTable.ts.
 * The original path is now a re-export shim pointing here.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All four properties that define a single pen style.
 * Width is in millimetres; dash values are in CSS-pixel units
 * (multiply by the caller's hairline scalar for high-DPI safety).
 */
export interface PenStyle {
    /** Line width in millimetres.  Multiply by pxPerMm(dpi) to get pixel width. */
    widthMm:  number;
    /** CSS colour string — hex preferred for determinism. */
    color:    string;
    /**
     * Dash pattern in CSS pixel units, or null for a solid line.
     * Caller SHOULD scale these by the hairline factor:
     *   ctx.setLineDash(pen.dashPx?.map(v => v * hairline) ?? [])
     * so that high-DPI screens produce proportionally finer dashes.
     */
    dashPx:   number[] | null;
    /** Opacity 0–1.  Applied via ctx.globalAlpha or via colour alpha. */
    opacity:  number;
}

/**
 * Zone classification — DERIVED from the canonical `DrawingZone` union (C09 §4.6).
 * Re-exported here so every existing `import { PenZone } from './PenWeightTable'` keeps
 * working while there remains exactly ONE declaration of the four zones.
 */
import { type DrawingZone, type PenZone, penZoneOf, drawingZoneFromLayerName, HIDDEN_DASH_PX } from './DrawingZone';
export type { PenZone };

/**
 * §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — the THIRD axis. See `ElementFunction.ts`.
 * The table below is keyed (zone × category); FUNCTION is a MODULATION applied on top of it,
 * so the locked Contract-23 §8 values remain literally the values in this file.
 */
import { type ElementFunction, penWidthScale } from './ElementFunction';

// ─── Internal builder ────────────────────────────────────────────────────────

function pen(
    widthMm: number,
    color:   string,
    dashPx:  number[] | null = null,
    opacity  = 1,
): PenStyle {
    return { widthMm, color, dashPx, opacity };
}

// ─── System pen table (Contract 23 §8 — locked values) ──────────────────────

/**
 * Default pen style for every (zone × category) combination.
 * These are Contract 23 §8 values — do not modify without a contract revision.
 *
 * Override mechanism: inject higher-priority GraphicsRules via
 * GraphicsRulesEngine rather than modifying this table.
 *
 * ═══ §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — THE ZONE→PEN MAP IS THE CONTRACT ═══
 *
 * C09 §4.6.4, from the founder verbatim: **"Dashed lines should be reserved ONLY for true
 * hidden edges."** This table is the ONE place that decides what dashes, and it now says:
 *
 *   CUT        — SOLID, heaviest, filled (poché).      NEVER dashed.
 *   PROJECTION — SOLID, thinner.                       NEVER dashed. Distance is irrelevant.
 *   BEYOND     — SOLID, lighter than PROJECTION.       NEVER dashed (it is DELIBERATELY shown).
 *   HIDDEN     — DASHED, thin, no fill.                THE ONLY ZONE THAT DASHES.
 *
 * WHAT CHANGED, AND WHY EACH ONE WAS A BUG (see `DrawingZone.ts` for the full chain):
 *
 *   • BEYOND lost its dash `[4,3]`. `:beyond` is produced by DISTANCE
 *     (`classifyByProjectionDepth`: `avgDepth > projectionDepth → beyond`; `classifyByVertexY`:
 *     below the floor → beyond). Dashing it meant **an edge that is merely FAR was drawn as
 *     if something were IN FRONT OF IT.** That is L-277's headline defect, and this single
 *     line was where it was rendered. The founder's canonical example — the lower run of a
 *     stair — now reads SOLID and lighter, exactly as he specified.
 *   • BEYOND width 0.13 → 0.09 mm, so the C09 §4.6.4 ladder
 *     `weight(CUT) > weight(PROJECTION) > weight(BEYOND) ≥ weight(HIDDEN)` holds STRICTLY
 *     for every category (PROJECTION's thinnest entry is 0.13). It was not strict before —
 *     `furniture` was 0.13 in BOTH zones, so "lighter than projection" was, for four
 *     categories, false. Guarded by the merge-blocking ladder test.
 *   • ROOF PROJECTION lost `[3,2]` and CEILING PROJECTION lost `[2,2]`. These dashed an
 *     element for being ABOVE the cut plane — the ISO "overhead" convention. The founder's
 *     model has no overhead zone: *"objects above/below the cut plane that are directly
 *     visible"* are PROJECTION and are SOLID. The overhead-dash convention remains
 *     available, but as an EXPLICIT intent override (`GraphicsRulesEngine`), never as the
 *     default — that is the P7 rule (graphics are view intent) applied honestly.
 *   • HIDDEN went from `{}` — an EMPTY object, i.e. every category fell through to
 *     `FALLBACK_PEN` (0.18 mm SOLID BLACK) — to a real, dashed, thin, translucent pen.
 *     HIDDEN was not "not rendered": it was **unrenderable**, because nothing ever produced
 *     it. Occlusion had nowhere to go, so it was dumped into BEYOND. Now it has a home.
 *
 * THE DATUM EXEMPTION (`grid`, `level`, `annotation` — `DATUM_CATEGORIES`): these are not
 * solids. Their chain/centre-line dash is an ISO 128-24 category convention, not a
 * hidden-line reading, and the ladder guard skips them EXPLICITLY rather than silently.
 */
const SYSTEM_PEN_TABLE: Partial<Record<PenZone, Partial<Record<string, PenStyle>>>> = {

    // ── CUT zone — heaviest weights; elements physically sliced by the cut plane ──
    //    SOLID by construction. A cut solid is a filled region (C09 §4.6.2), never a dash.
    CUT: {
        wall:       pen(0.50, '#000000'),
        slab:       pen(0.50, '#000000'),
        column:     pen(0.70, '#000000'),
        structural: pen(0.70, '#000000'),
        beam:       pen(0.70, '#000000'),
        door:       pen(0.35, '#000000'),
        window:     pen(0.35, '#000000'),
        stair:      pen(0.35, '#000000'),
        roof:       pen(0.50, '#000000'),
        ceiling:    pen(0.35, '#000000'),
    },

    // ── PROJECTION zone — directly VISIBLE, not cut. SOLID, thinner than CUT. ──
    //    *** DISTANCE FROM THE VIEWER DOES NOT MAKE AN EDGE HIDDEN. *** Projection stays
    //    solid however far away it is (C09 §4.6.4 / L-277).
    PROJECTION: {
        wall:       pen(0.25, '#000000'),
        slab:       pen(0.25, '#000000'),
        column:     pen(0.25, '#1e293b'),
        structural: pen(0.25, '#1e293b'),
        beam:       pen(0.25, '#1e293b'),
        door:       pen(0.18, '#1f2937'),
        window:     pen(0.18, '#1f2937'),
        stair:      pen(0.18, '#334155'),
        roof:       pen(0.18, '#475569'),          // L-277: dash [3,2] DELETED — overhead ≠ hidden
        ceiling:    pen(0.13, '#64748b'),          // L-277: dash [2,2] DELETED — overhead ≠ hidden
        furniture:  pen(0.13, '#303030'),
        lighting:   pen(0.13, '#303030'),
        plumbing:   pen(0.13, '#374151'),
        grid:       pen(0.13, '#0000cc', [8, 4]),  // DATUM — ISO 128-24 chain line, not a zone dash
        annotation: pen(0.18, '#000000'),
        level:      pen(0.13, '#334155', [5, 3]),  // DATUM — ISO 128-24 chain line, not a zone dash
        // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7950) — DATUM, in PROJECTION ONLY, exactly
        // as `grid` and `level` are. A construction line has no CUT (it is not sliced by
        // the cut plane — it IS the plane's own notation), no BEYOND and no HIDDEN: a
        // setting-out line that vanished behind a wall would be useless for setting out.
        // Absent zones fall to `FALLBACK_PEN`, which is the correct and stated behaviour
        // for a category the zone does not apply to.
        //
        //
        // ═══ ⭐ BLACK, AND THAT OVERTURNS THE PURPLE THIS ROW SHIPPED WITH (L-10503) ═══
        //
        // The founder, 2026-08-24, verbatim: *"please make the boundary construction
        // line DASHED BLACK by default."* This row previously read `#6600ff` with the
        // rationale *"the same colour `BoundaryLinePlanToolHandler` previews in — so
        // what the architect aims at and what lands are the same colour rather than
        // two."*
        //
        // That argument was sound and it is still REJECTED, because it optimised the
        // wrong pair. The PREVIEW is tool chrome — drawn on the overlay canvas, alive
        // for the two seconds a gesture lasts, and PRYZM purple is what EVERY plan tool
        // previews in (`STROKE = '#6600ff'` in all of them). The COMMITTED line is
        // DRAWING, and a drawing is printed, exported to DXF and read by a contractor.
        // Matching the committed line to the transient preview made the setting-out
        // line the ONE datum on the sheet that is not a drafting colour — `grid` is
        // `#0000cc`, `level` is `#334155`, `annotation` is `#000000`. It now joins them.
        //
        // ⚠ THE DASH IS UNCHANGED AND IS NOT A ZONE DASH. `[10, 4]` is an ISO 128-24
        // category convention for a DATUM — the same exemption `grid` `[8, 4]` and
        // `level` `[5, 3]` take from C09 §4.6.4's *"dashed ONLY for true hidden edges"*,
        // which is why `DATUM_CATEGORIES` exists and why the ladder guard skips these
        // four explicitly.
        //
        // ⛔ AND THIS DOES NOT TOUCH 3-D. `BoundaryLineMeshBuilder`'s
        // `BOUNDARY_LINE_PEN_HEX` is still `#6600ff` and is DELIBERATELY left so — see
        // that constant's own header, and §L-426. The pen table governs the 2-D
        // DRAWING; the 3-D scene has its own (C09-pen-shaped) authority, and they are
        // allowed to differ because a viewport is not a sheet. Collapsing them would be
        // a second bug wearing the first one's fix as a disguise.
        'boundary-line': pen(0.13, '#000000', [10, 4]),
    },

    // ── BEYOND zone — past the cut plane, DELIBERATELY still shown. ──
    //    SOLID and LIGHTER than projection. This is NOT hidden geometry (C09 §4.6.4).
    //    The stair's lower run; the storey below in a plan's view range.
    BEYOND: {
        wall:       pen(0.09, '#6b7280', null, 0.55),
        slab:       pen(0.09, '#6b7280', null, 0.55),
        column:     pen(0.09, '#6b7280', null, 0.55),
        structural: pen(0.09, '#6b7280', null, 0.55),
        beam:       pen(0.09, '#6b7280', null, 0.55),
        door:       pen(0.09, '#6b7280', null, 0.55),
        window:     pen(0.09, '#6b7280', null, 0.55),
        stair:      pen(0.09, '#6b7280', null, 0.55),
        roof:       pen(0.09, '#6b7280', null, 0.55),
        ceiling:    pen(0.09, '#6b7280', null, 0.55),
        furniture:  pen(0.09, '#6b7280', null, 0.55),
        lighting:   pen(0.09, '#6b7280', null, 0.55),
        plumbing:   pen(0.09, '#6b7280', null, 0.55),
    },

    // ── HIDDEN zone — OCCLUDED by a solid, shown with hidden-line graphics. ──
    //    THE ONLY ZONE THAT DASHES BY DEFAULT. Thin, no fill. Produced ONLY by the
    //    occlusion engine (`applyOcclusion`), NEVER by a depth/distance test.
    HIDDEN: {
        wall:       pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        slab:       pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        column:     pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        structural: pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        beam:       pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        door:       pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        window:     pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        stair:      pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        roof:       pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        ceiling:    pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        furniture:  pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        lighting:   pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
        plumbing:   pen(0.09, '#6b7280', [...HIDDEN_DASH_PX], 0.55),
    },
};

// ─── The thinnest pen the table can produce ──────────────────────────────────

/**
 * §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the LIGHTEST width in the locked table (mm).
 *
 * DERIVED by scanning the table, never re-typed. It is the input to
 * `CanvasRenderScale.MIN_LEGIBLE_BACKING_SCALE`: the screen must have enough device pixels to
 * render THIS pen without clamping, or every pen at or below it collapses onto the raster floor
 * and the whole C09 §4.6.4 ladder flattens. Deriving it means the day someone adds a finer pen
 * to the table, the canvas's backing scale follows it automatically — a hand-typed constant here
 * would silently re-introduce L-288 for exactly the new pen that motivated the change.
 */
export const THINNEST_SYSTEM_PEN_MM: number = (() => {
    let min = Infinity;
    for (const byCategory of Object.values(SYSTEM_PEN_TABLE)) {
        for (const style of Object.values(byCategory ?? {})) {
            if (style && style.widthMm > 0) min = Math.min(min, style.widthMm);
        }
    }
    return Number.isFinite(min) ? min : 0.13;
})();

// ─── Fallback ────────────────────────────────────────────────────────────────

/**
 * Applied when no specific (zone × category) entry exists in the table.
 * Contract 23 §8 — fallback: 0.18 mm, black, solid, opacity 1.
 */
export const FALLBACK_PEN: PenStyle = pen(0.18, '#000000');

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Look up the pen style for a (zone × category × function) triple.
 *
 * Returns the system default for that combination, or FALLBACK_PEN when no entry
 * is defined for the (zone × category) pair.
 *
 * This function is the ONLY entry point for pen resolution in Canvas2D renders.
 * It does NOT apply GraphicsRules overrides — use GraphicsRulesEngine.resolveStyle()
 * for the full rules + override pipeline.
 *
 * ═══ §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — THE FUNCTION AXIS ═══
 *
 * `elementFunction` scales the entry's `widthMm` (see `ElementFunction.FUNCTION_WEIGHT_SCALE`).
 * It is applied EXACTLY ONCE per resolution, and `GraphicsRulesEngine.resolveStyle()` applies
 * it at the END of its rule chain — NOT by passing it here. Both would double-scale, and the
 * chain-end application is the correct one: FUNCTION must modulate whatever width the intent /
 * view / element chain resolved, not just the table's base value, or a user who re-weights the
 * `wall` category would silently lose the envelope hierarchy again. Guarded:
 * `resolveStyle(z, c, {elementFunction: f})` ≡ `resolvePen(z, c, f)` when no rule overrides
 * the width. Callers that legitimately want the raw TABLE answer — the DXF/PDF pen exporters,
 * and the guards — pass it here.
 *
 * *** THE FALLBACK IS NOT MODULATED. *** A (zone × category) pair with no locked entry has no
 * locked LADDER to preserve (`FALLBACK_PEN` 0.18 mm is heavier than several categories' real
 * PROJECTION pens, so scaling it could invert a ladder that was never authored). No entry, no
 * modulation: the fallback stays the fallback.
 *
 * @param zone             VRZone classification: 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN'
 * @param category         Element category string, e.g. 'wall', 'door', 'slab'
 * @param elementFunction  ISO 13567 / Revit function of the element's TYPE, when the model
 *                         knows it. `undefined` ⇒ unmodulated ⇒ the pre-L-285 pen, exactly.
 */
export function resolvePen(
    zone: PenZone,
    category: string,
    elementFunction?: ElementFunction | null,
): PenStyle {
    const base = SYSTEM_PEN_TABLE[zone]?.[category];
    if (!base) return FALLBACK_PEN;

    // Only the HIERARCHY zones (CUT, PROJECTION) are modulated — never the DE-EMPHASIS zones
    // (BEYOND, HIDDEN), which share a base width and would have their ladder INVERTED by it.
    // See `ElementFunction.FUNCTION_MODULATED_ZONES`.
    const scale = penWidthScale(zone, elementFunction);
    // Hot path: the overwhelmingly common case is an unmodulated pen. Return the table's own
    // frozen-by-convention object rather than allocating a copy per segment.
    if (scale === 1) return base;

    return { ...base, widthMm: base.widthMm * scale };
}

/**
 * §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — `penZoneFromFlags(isCut, isBeyond)` IS DELETED.
 *
 * It took TWO booleans and could therefore only ever return THREE of the four zones. It was
 * `PlanViewCanvas`'s sole zone classifier, so **HIDDEN was structurally unreachable at the
 * only place that paints a line**: even a correctly-produced `:hidden` layer would have been
 * classified `PROJECTION` and drawn SOLID. A zone that cannot be NAMED cannot be STYLED —
 * and that is precisely how occlusion ended up dumped into `:beyond` (the only bucket with a
 * dashed pen) and how PROJECTION ended up dashed.
 *
 * The replacement is {@link penZoneFromLayerName} — one argument, four possible answers,
 * resolved from the canonical `DrawingZone` classifier. Do not reintroduce a boolean-pair
 * zone resolver: it is not a convenience, it is a type that cannot hold the domain.
 */

/** Zone of a projected segment from its ISO sub-layer name, in the DOMAIN spelling. */
export function drawingZoneFromLayer(layerTag: string): DrawingZone | null {
    return drawingZoneFromLayerName(layerTag);
}

/**
 * §FIX-PLAN-CUT-POCHE-OCCLUSION (L-260 B) — canonical layer-name → pen-zone classifier.
 *
 * The drawing carries TWO sub-layer conventions, both legitimate and both in the
 * founder's live drawings:
 *   • the projector's colon form   — `A-WALL:cut`, `A-FLOR:proj`, `A-ROOF:beyond`
 *     (EdgeProjectorService `_layerCut()` / `_layerProj()` / `_layerBeyond()`);
 *   • the symbol builders' hyphen form — `A-DOOR-CUT`, `A-DOOR-PROJ`, `A-GLAZ-CUT`
 *     (Door/Window plan symbol builders authoring their frame as a section CUT).
 *
 * Every consumer that must decide "is this linework CUT, PROJECTION or BEYOND?" resolves
 * it HERE, so the zone ladder is derived from ONE rule rather than re-typed as a regex at
 * each call site. (HiddenLineRemoval's v1 `/:cut$/` accepted only the colon form, so a
 * door frame's CUT jambs were never registered as occluders — the same class of silent
 * drop L-257 fixed at the layer-creation end.)
 *
 * Layers with no zone suffix (`A-WALL`, `A-GRID`, the `projection-visible` /
 * `projection-hidden` IFC fallback) return `null` — they carry no zone and must NOT be
 * coerced into one.
 *
 * Pure classifier, no I/O — no span (same precedent as `categoryFromFlags` below, cited in
 * ViewScope.ts).
 *
 * §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277): the regexes moved to `DrawingZone.ts`, which is
 * now the ONE encoding of the four zones. This is a spelling adapter onto it, nothing more —
 * so a fifth zone, or a fifth naming convention, cannot be born in a second file again.
 */
export function penZoneFromLayerName(layerTag: string): PenZone | null {
    const zone = drawingZoneFromLayerName(layerTag);
    return zone === null ? null : penZoneOf(zone);
}

/**
 * Convenience: derive ISO-13567 element category string from the boolean type
 * flags already computed in the PlanViewCanvas render loop.
 */
export function categoryFromFlags(flags: {
    isWall:      boolean;
    isDoor:      boolean;
    isSlab:      boolean;
    isCol:       boolean;
    isStair:     boolean;
    isRoof:      boolean;
    isCeiling:   boolean;
    isFurniture?: boolean;
    isHandrail?:  boolean;
    isWindow?:    boolean;
    /**
     * §FIX-BOUNDARY-LINE-INVISIBLE-IN-PLAN (L-10502) — the construction / setting-out
     * line. Optional, like the three flags above it, so no existing caller changes.
     */
    isBoundaryLine?: boolean;
}): string {
    // ⭐ FIRST. `boundary-line` is a DATUM (`DrawingZone.DATUM_CATEGORIES`), and a datum
    // must not be claimed by a fabric family that happens to also match. It cannot
    // collide today — `A-CONS` shares no substring with the ten fabric layers — and
    // ordering it first means it still cannot when an eleventh is added.
    if (flags.isBoundaryLine) return 'boundary-line';
    if (flags.isWall)      return 'wall';
    if (flags.isCol)       return 'column';
    if (flags.isDoor)      return 'door';
    if (flags.isWindow)    return 'window';
    if (flags.isSlab)      return 'slab';
    if (flags.isStair)     return 'stair';
    if (flags.isHandrail)  return 'handrail';
    if (flags.isRoof)      return 'roof';
    if (flags.isCeiling)   return 'ceiling';
    if (flags.isFurniture) return 'furniture';
    return 'projection'; // safe fallback — generic projected geometry
}

/**
 * §HIDDEN-IS-NOT-PICKABLE (L-3902) — the ISO-13567 pen category of a composed layer tag.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN A SECOND COPY OF THE TEN REGEXES
 * ─────────────────────────────────────────────────────────────────────────────
 * The ten `/A-WALL|wall/i`-style tests used to live INLINE in
 * `PlanViewCanvas.render()`, feeding `categoryFromFlags()` — and nowhere else could
 * reach them. `PlanViewCanvas.hitTest()` needed exactly the same answer to decide
 * whether a line the intent HID may still be clicked, and the obvious move was to
 * paste the block a second time.
 *
 * This repo has already paid for that shape more than once: `vgCategoryForLayer()`
 * existed twice and the copies DRIFTED (one lacked the ISO hyphen sub-layer arm, so
 * `A-GLAZ-CUT` / `A-FURN-SHADOW` resolved to a null category — see
 * `DrawingLayerIdentity.ts`), and L-1600 was seven hand-copied answers to "which layer
 * is this line on", one of which had silently gone wrong. A second copy of the pen
 * category would have gone the same way: `render()` and `hitTest()` would disagree
 * about what a line IS, which is precisely how "hidden but still selectable" is born.
 *
 * So the derivation is ONE function, and both callers ask it. `categoryFromFlags()` is
 * kept as-is — it is the flags-shaped entry point other callers already use — and this
 * is the tag-shaped entry point layered directly on top of it, so the two can never
 * answer differently.
 *
 * Pure: no DOM, no THREE, no store reads. P8 note: same "pure hot-path classifier, no
 * span" precedent as `categoryFromFlags` / `drawingZoneFromLayerName`.
 */
export function penCategoryForLayerTag(layerTag: string): string {
    return categoryFromFlags({
        isWall:      /A-WALL|wall/i.test(layerTag),
        isDoor:      /A-DOOR|door/i.test(layerTag),
        isSlab:      /A-FLOR|slab/i.test(layerTag),
        isCol:       /A-COLS|column|beam/i.test(layerTag),
        isStair:     /A-STRS|stair/i.test(layerTag),
        isRoof:      /A-ROOF|roof/i.test(layerTag),
        isCeiling:   /A-CEIL|ceiling/i.test(layerTag),
        isFurniture: /A-FURN|furniture/i.test(layerTag),
        isHandrail:  /A-HRAL|handrail/i.test(layerTag),
        isWindow:    /A-GLAZ|window/i.test(layerTag),
        // ⚠ `A-CONS|boundary-line`, NOT a bare /boundary/. `RoomBoundingLine` is a
        // different object entirely (an invisible room-detection splitter — C106 §0.2
        // tabulates all three "boundary" things this repo owns), and a loose regex would
        // hand it the construction-line pen the first time anything projected one.
        isBoundaryLine: /A-CONS|boundary-line/i.test(layerTag),
    });
}
