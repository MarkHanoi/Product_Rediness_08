/**
 * PlanViewAnnotationRenderer — Contract 19, Phase 4
 *
 * Canvas2D annotation render pass for the unified plan view.
 *
 * Called at the END of `PlanViewCanvas.render()` so annotations draw on top
 * of all projected linework.
 *
 * Coordinate projection:
 *   AnnotationRenderLayer uses THREE.Camera.project() (3D NDC pipeline).
 *   This renderer uses the PlanViewCanvas linear XZ → screen mapping:
 *     worldToScreen(worldX, worldZ) → { sx, sy }
 *   No camera matrix, no GPU — pure arithmetic, identical to plan linework.
 *
 * Architecture rules (Contract 19 §7):
 *   - PlanViewCanvas MUST NOT import from PRYZM stores. This renderer is a
 *     separate class so it may import annotationStore directly.
 *   - render() has no side effects on any store.
 *   - Does not register tick listeners; its caller drives the render cadence.
 */

import { annotationStore } from '../annotations/AnnotationStore.js';
import {
    type AnnotationElement,
    type AnnotationStyle,
    DEFAULT_ANNOTATION_STYLE,
    type DimensionElement,
} from '../annotations/AnnotationTypes.js';
import { formatDimension } from '../annotations/DimensionFormatter.js';
import { viewDefinitionStore } from './ViewDefinitionStore';
import type { ViewDefinition } from './ViewDefinitionTypes';
// §ELEV-SCOPE-DEPTH (L-1855) — ONE far-clip expression. The three sites below used
// to inline `?? 8` while EdgeProjectorService.resolveClipRange() inlined `?? 200`,
// so an untouched elevation PROJECTED the whole building but drew its depth handle
// 8 m from a mark seeded 24 m away — unreachable, and committing it sliced the
// building. See ViewDefinitionTypes for the derivation.
import {
    // §CROP-IS-THE-CLIP (L-4500) — the rectangle this file DRAWS and the planes the
    // projector CLIPS to are now one expression, so they cannot disagree.
    resolveElevationClipRange,
    DEFAULT_ELEVATION_SCOPE_DEPTH_M,
} from './ViewDefinitionTypes';
import type { ElevationClipRange } from './ViewDefinitionTypes';
// §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — a tag's size is PAPER, scaled by the
// view (C24). The same mechanism as the dimension tier gap (L-281); tags never got it.
import {
    TAG_PAPER_MM,
    DEFAULT_SCALE_DENOMINATOR,
    paperMmToPx,
    resolveScaleDenominator,
    pxPerWorldMetre,
} from '../annotations/paperScale';
// Contract 23 §7 — GraphicsRulesEngine integration for annotation pen resolution
import { graphicsRulesEngine } from '../drawing/GraphicsRulesEngine';
import type { PenStyle } from '../drawing/PenWeightTable';
import { SCREEN_PX_PER_MM } from '../drawing/DrawingConstants';
// §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300) — the view-authoring overlay palette. The
// scope box used to hard-code five amber literals here while PlanViewCanvas drew the
// SAME affordance in blue; both now read the one two-value PRYZM-purple ramp.
import { CROP_INK, cropZoneFill } from './ViewCropPalette';

export type PlanWorldToScreen = (worldX: number, worldZ: number) => { sx: number; sy: number };

export interface PlanViewAnnotationRenderOptions {
    activeLinkedViewId?: string | null;
    /**
     * §L-430 slice 2d — θ, the PROJECT→TRUE-north angle in RADIANS, supplied by the app layer
     * (from `SiteLocation.trueNorth`).
     *
     * WHY INJECTED: this renderer is L1 and may not import the L5 dual-north transform or read
     * the site store directly. The app layer already owns that read, so it passes the value in
     * — the same pattern `PlanViewCanvas` uses for its site-context provider.
     *
     * WHY IT MATTERS (C34 §1.4): the north arrow MUST resolve its direction from project
     * context and MUST NOT carry a hard-coded numeric direction. Once the authoring frame is
     * rotated to project north, an arrow drawn from a literal angle points at PROJECT north
     * while labelling itself TRUE north — a drawing that is wrong in the one place a reader
     * trusts absolutely, and wrong silently. Default 0 ⇒ unchanged for un-rotated projects.
     */
    projectNorthRad?: number;
    /**
     * §ANN-ELEV-SEC: Current view type, forwarded from PlanViewCanvas._viewType.
     * Used to select the correct world-axis projection for annotation model points.
     * 'plan' (default) maps points as (pt.x, pt.z).
     * 'section' | 'elevation' | 'building-elevation' maps points as (pt[hAxis], pt.y).
     */
    viewType?: string;
    /**
     * §ANN-ELEV-SEC: Which world axis maps to screen X in section/elevation views.
     * Only used when viewType is section/elevation-like. Defaults to 'x'.
     */
    sectionHAxis?: 'x' | 'z';
    /**
     * §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — the sign of the horizontal world
     * axis, forwarded from `PlanViewCanvas._hWorldSign`.
     *
     * PlanViewCanvas projects its GEOMETRY through `_worldPointToCanvasH()`, which
     * multiplies the chosen world axis by `_hWorldSign` so that a back/right
     * elevation reads left-to-right the way it is actually drawn. The annotation
     * renderer did NOT apply it, so on any elevation with `hSign === -1` the
     * annotations were MIRRORED relative to the geometry they annotate — a dim
     * would sit on the opposite side of the building from the wall it measures.
     * Never noticed because elevations carried no auto-dimensions until L-263.
     * Defaults to +1 (every plan view, and every front/left elevation).
     */
    hSign?: 1 | -1;
}

type ScopeWorld = {
    a: { x: number; z: number };
    b: { x: number; z: number };
    farA: { x: number; z: number };
    farB: { x: number; z: number };
    projectionA?: { x: number; z: number };
    projectionB?: { x: number; z: number };
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DIM_LINE_COLOR  = '#1a2035';
const DIM_TEXT_COLOR  = '#1a2035';
const TEXT_NOTE_COLOR = '#374151';
const TAG_BG_COLOR    = 'rgba(255,255,255,0.92)';
const TAG_BD_COLOR    = '#374151';
const GRID_COLOR      = '#374151';
const ARROW_PX        = 6;
const FONT            = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ANNOT_SEL_COLOR = '#6600FF';

/** Annotation types that render at a single anchor point and may be drag-moved. */
// ALL point-based and movable annotation types are draggable and selectable.
// Annotations are semantic JavaScript elements — they must be selectable,
// editable, and movable in every view (Contract §03, §22, §24).
// Two-point/multi-point types (linear-dimension, matchline, revision-cloud,
// callout-detail, angular/radius/diameter/slope-dim) are included here so
// they respond to hitTest; their drag logic moves all model points together.
export const DRAGGABLE_ANNOTATION_TYPES = new Set<string>([
    'room-tag',
    'door-tag',
    'window-tag',
    // §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — an auto-placed tag the user cannot MOVE
    // is an auto-placed tag the user cannot USE: the leader rule is a default, not a
    // decree. Same selection/drag path as its door/window siblings.
    'wall-tag',
    'text-note',
    'tag',
    'keynote',
    'spot-elevation',
    'north-arrow',
    'scale-bar',
    'level-tag',
    'grid-bubble',
    'callout-detail',
    'revision-cloud',
    'matchline',
    'angular-dim',
    'radius-dim',
    'diameter-dim',
    'slope-dim',
    'linear-dimension',
    // §FIX-AUTODIM-DIMS-SELECTABLE-EDITABLE (L-161) — the RENDERED dimension type
    // written by BOTH the manual LinearDimPlanToolHandler AND the AutoDimension
    // executor (ADR-0119) is `'linear-dim'`, NOT the historical `'linear-dimension'`.
    // Omitting it made hitTestAnnotation() skip every dim, so plan-view dims were
    // inert (not selectable, not draggable) — the founder-reported regression.
    'linear-dim',
]);

/**
 * §FIX-DIMENSION-PICK-CORRIDOR (L-256) — the annotation types drawn by
 * `_renderLinearDim`, and therefore the types whose pick corridor must follow the
 * DIMENSION LINE (offset out from the geometry) rather than the reference line.
 * Both spellings: `'linear-dim'` is what the manual tool and the AutoDimension
 * executor actually write; `'linear-dimension'` is the historical spelling still
 * present in older documents.
 */
const LINEAR_DIM_TYPES = new Set<string>(['linear-dim', 'linear-dimension']);

/**
 * §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — the LEADER'D tags: annotations drawn as
 * a SYMBOL at one end of a LEADER whose other end sits on the element. They are picked on
 * the symbol AND on the leader (a hairline is as hard to hit as a dimension line was —
 * L-256), never on the anchor alone.
 *
 * `room-tag` is deliberately absent: it has no leader (it sits at the room centroid), so it
 * is a point annotation and the point branch is correct for it.
 */
const TAG_TYPES = new Set<string>(['door-tag', 'window-tag', 'wall-tag', 'tag', 'keynote']);

/**
 * §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — the four grabbable crop/scope handles
 * on a selected section/elevation mark. `depth` extends the view depth, `width-left`
 * / `width-right` extend the crop width, `cut-plane` shifts the cut line.
 */
export type ScopeHandleId = 'depth' | 'width-left' | 'width-right' | 'cut-plane';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mergeStyle(partial: Partial<AnnotationStyle>): AnnotationStyle {
    return { ...DEFAULT_ANNOTATION_STYLE, ...partial };
}

function mmToPx(mm: number): number {
    return (mm / 25.4) * 96;
}

function drawArrowTip(
    ctx: CanvasRenderingContext2D,
    tip: { sx: number; sy: number },
    dir: { x: number; y: number },
    sizePx: number,
): void {
    const angle = Math.atan2(dir.y, dir.x);
    const a1 = angle + (Math.PI * 5) / 6;
    const a2 = angle - (Math.PI * 5) / 6;
    ctx.beginPath();
    ctx.moveTo(tip.sx, tip.sy);
    ctx.lineTo(tip.sx + Math.cos(a1) * sizePx, tip.sy + Math.sin(a1) * sizePx);
    ctx.lineTo(tip.sx + Math.cos(a2) * sizePx, tip.sy + Math.sin(a2) * sizePx);
    ctx.closePath();
    ctx.fill();
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-6) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function normalize2(v: { x: number; z: number }): { x: number; z: number } {
    const len = Math.hypot(v.x, v.z) || 1;
    return { x: v.x / len, z: v.z / len };
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanViewAnnotationRenderer
// ─────────────────────────────────────────────────────────────────────────────

export class PlanViewAnnotationRenderer {

    /** Tracks elevation-mark anchor keys already drawn this frame to avoid duplicate group symbols. */
    private readonly _renderedElevAnchors = new Set<string>();

    /**
     * §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — the scope/crop handle currently
     * under the cursor (set by PlanViewInteraction on hover). The selected-mark
     * scope overlay draws this handle enlarged + accented so the crop grab targets
     * are DISCOVERABLE (the L-154 bug was invisible ~10px handles). Purely visual —
     * the actual hit-test/drag lives in hitTestScopeHandle + PlanViewInteraction and
     * all crop mutation stays on the view.setCrop command (P6).
     */
    private _hoveredScopeHandle: ScopeHandleId | null = null;

    /** §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — set the hovered scope/crop handle. */
    setHoveredScopeHandle(handle: ScopeHandleId | null): void {
        this._hoveredScopeHandle = handle;
    }

    /**
     * Contract 23 §7 — rules-engine resolved base style for annotations.
     * Set at the start of every render() call so _render* helpers can use it
     * as a lower-priority fallback when AnnotationStyle does not override.
     *
     * Resolved from: graphicsRulesEngine.resolveStyle('PROJECTION', 'annotation', { viewId })
     * Fallback applied per-property: engine color < constant < AnnotationStyle.lineColor
     */
    private _engineAnnotationPen: PenStyle | null = null;

    /**
     * §ANN-ELEV-SEC: Active view type — controls how annotation model points are
     * projected from 3D world space into the 2D (H, V) space of the Canvas.
     *   'plan' (default): H = pt.x, V = pt.z
     *   'section' | 'elevation' | 'building-elevation': H = pt[_sectionHAxis], V = pt.y
     */
    private _viewType: string = 'plan';
    private _sectionHAxis: 'x' | 'z' = 'x';
    /** §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — see PlanViewAnnotationRenderOptions.hSign. */
    private _hSign: 1 | -1 = 1;
    /** §L-430 slice 2d — θ (project→true north, radians) for this render pass. 0 = identity. */
    private _projectNorthRad = 0;

    /** Returns true when the current view is a vertical cut (section or elevation). */
    private _isSectionLike(): boolean {
        return this._viewType === 'section'
            || this._viewType === 'elevation'
            || this._viewType === 'building-elevation';
    }

    /**
     * Extract the "horizontal" canvas axis value from a 3D world point.
     * For plan: returns pt.x.  For section/elevation: returns pt.x or pt.z
     * depending on _sectionHAxis.
     */
    private _ptH(pt: { x: number; y: number; z: number }): number {
        if (this._isSectionLike()) {
            // §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — apply the view's horizontal
            // SIGN, exactly as PlanViewCanvas._worldPointToCanvasH() does for the
            // geometry. Without it, annotations on an hSign === -1 elevation are
            // mirrored relative to the walls they annotate. Plan views are unaffected
            // (this branch does not run, and hSign is +1 there regardless).
            return this._hSign * (this._sectionHAxis === 'x' ? pt.x : pt.z);
        }
        return pt.x;
    }

    /**
     * §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — project a model point into the view's
     * (H, V) canvas space using the SAME axis mapping the render pass uses.
     *
     * The hit-test used to project every point as `(pt.x, pt.z)` — the PLAN mapping,
     * hardcoded — while `_renderLinearDim` projected through `_ptH`/`_ptV`. In a plan
     * view the two agree by coincidence (H = x, V = z). In an ELEVATION they do not:
     * the dim was DRAWN at (H = x|z, V = y) and HIT-TESTED at (x, z), so the click
     * target sat somewhere else entirely — usually off-canvas. That is why a
     * dimension on an elevation could not be selected. Render and hit-test must share
     * one projection or selection is a lie about what you can see.
     */
    private _project(pt: { x: number; y: number; z: number }): { h: number; v: number } {
        return { h: this._ptH(pt), v: this._ptV(pt) };
    }

    /**
     * §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — project a MODEL point to screen through
     * the ACTIVE VIEW's plane, then to screen. The one call every point-anchored
     * annotation must make.
     *
     * The bug this closes: every tag renderer below used to call `w2s(pt.x, pt.z)` —
     * the PLAN mapping, hardcoded — while `_renderLinearDim` went through `_ptH`/`_ptV`.
     * In a plan view the two agree by coincidence (H = x, V = z). In an ELEVATION they
     * do not: a tag anchored at a door's real world position (x, y, z) was drawn using
     * its DEPTH (z) as the vertical axis instead of its HEIGHT (y) — i.e. somewhere
     * else entirely, usually off-canvas. Elevation tags could therefore never have
     * rendered, no matter how correctly they were created. Exactly the same defect the
     * hit-test carried until L-256, and the reason L-265 could not be "plan with
     * different numbers".
     */
    private _w2sModel(
        w2s: PlanWorldToScreen,
        pt: { x: number; y: number; z: number },
    ): { sx: number; sy: number } {
        const p = this._project(pt);
        return w2s(p.h, p.v);
    }

    // ── §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — PAPER, NOT PIXELS ─────
    //
    // A tag's size is a property of the SHEET. It used to be a property of the SCREEN
    // (`const r = 16` — a fixed pixel radius), which is invariant under zoom: zoom out and
    // the building shrinks while the bubble does not, until the bubble is the size of a
    // room. The size now travels the full path — paper mm ─(× view scale)→ world m ─(× zoom)
    // → screen px — so a tag holds a CONSTANT SIZE RELATIVE TO THE BUILDING at every zoom,
    // and a 1:50 sheet draws it at half the world size of a 1:100 sheet. Both are the same
    // size on paper, which is the only place a tag's size is defined.

    /** The view's drawing-scale denominator, refreshed each render pass. */
    private _scaleDenominator: number = DEFAULT_SCALE_DENOMINATOR;
    /** Pixels per world metre — the canvas ZOOM, derived from the same w2s the geometry uses. */
    private _pxPerWorldM = 0;

    /** Convert a PAPER millimetre to screen pixels for the current view + zoom. */
    private _paperPx(mm: number): number {
        return paperMmToPx(mm, this._scaleDenominator, this._pxPerWorldM);
    }

    /**
     * §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — set the projection used by BOTH
     * `render()` and `hitTestAnnotation()`.
     *
     * `render()` already set these fields from its options every frame, and the
     * hit-test runs against whatever the last render left behind. That is fine for a
     * single canvas but not for split-view (two canvases, one singleton renderer), so
     * `PlanViewCanvas` now sets the projection explicitly before hit-testing, making
     * the shared state a deliberate parameter rather than a leftover.
     */
    setViewProjection(viewType: string, sectionHAxis: 'x' | 'z', hSign: 1 | -1): void {
        this._viewType = viewType;
        this._sectionHAxis = sectionHAxis;
        this._hSign = hSign;
    }

    /**
     * Extract the "vertical" canvas axis value from a 3D world point.
     * For plan: returns pt.z.  For section/elevation: returns pt.y (world height).
     */
    private _ptV(pt: { x: number; y: number; z: number }): number {
        if (this._isSectionLike()) return pt.y;
        return pt.z;
    }

    /**
     * Main entry point — called by PlanViewCanvas.render() at the end of each frame.
     *
     * @param ctx           The same CanvasRenderingContext2D used by PlanViewCanvas.
     * @param viewId        The active view ID — used to filter annotations by ownerViewId.
     * @param worldToScreen Coordinate bridge from PlanViewCanvas: (wx, wz) → {sx, sy}.
     */
    render(
        ctx: CanvasRenderingContext2D,
        viewId: string,
        worldToScreen: PlanWorldToScreen,
        options: PlanViewAnnotationRenderOptions = {},
    ): void {
        const annotations = this._dedupeRoomTags(annotationStore.getByView(viewId));
        const dimensions  = annotationStore.getDimensionsByView(viewId);
        if (annotations.length === 0 && dimensions.length === 0) return;

        // §ANN-ELEV-SEC: Store the view context for this render pass so
        // _ptH() / _ptV() helpers return the correct axis for the current view type.
        if (options.viewType !== undefined) this._viewType = options.viewType;
        if (options.sectionHAxis !== undefined) this._sectionHAxis = options.sectionHAxis;
        if (options.hSign !== undefined) this._hSign = options.hSign;
        // §L-430 slice 2d — carry θ for this render pass (north arrow, C34 §1.4).
        this._projectNorthRad = Number.isFinite(options.projectNorthRad)
            ? (options.projectNorthRad as number) : 0;

        // Contract 23 §7 — resolve annotation base pen once per render call.
        // Priority: element override (10000) > view override (9000) > system (0).
        // The resolved pen feeds into _annotationLineColor() / _annotationLineWidthPx().
        this._engineAnnotationPen = graphicsRulesEngine.resolveStyle(
            'PROJECTION',
            'annotation',
            { viewId, viewType: options.viewType ?? this._viewType },
        );

        // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — resolve the two transforms a
        // paper-space annotation must travel through, ONCE per pass:
        //   • the VIEW's drawing scale  (how many world metres one sheet millimetre buys)
        //   • the canvas ZOOM           (how many screen pixels one world metre buys),
        //     derived from the SAME worldToScreen the geometry is drawn with, so a tag can
        //     never be scaled by a transform that disagrees with the one on screen.
        this._scaleDenominator = resolveScaleDenominator(viewDefinitionStore.get(viewId)?.output);
        this._pxPerWorldM = pxPerWorldMetre(worldToScreen);

        this._renderedElevAnchors.clear();

        ctx.save();

        for (const ann of annotations) {
            try {
                this._renderAnnotation(ann, ctx, worldToScreen);
            } catch (e) {
                console.error('[PlanViewAnnotationRenderer] render error for', ann.id, e);
            }
        }

        // §DIM-VIII-1 — render flat DimensionElement records
        for (const dim of dimensions) {
            try {
                this._renderDimensionElement(dim, ctx, worldToScreen);
            } catch (e) {
                console.error('[PlanViewAnnotationRenderer] dimension render error for', dim.id, e);
            }
        }

        this._renderActiveLinkedScopeOverlay(annotations, ctx, worldToScreen, options.activeLinkedViewId ?? null);
        this._renderSelectedScopeOverlay(annotations, ctx, worldToScreen);

        ctx.restore();

        this._engineAnnotationPen = null;
    }

    /**
     * Resolve the annotation line colour for the current frame.
     *
     * Priority (lowest → highest):
     *   1. Hardcoded constant (DIM_LINE_COLOR) — always present
     *   2. GraphicsRulesEngine PROJECTION/annotation pen colour — view/element override
     *   3. AnnotationStyle.lineColor — per-annotation override
     *
     * @param styleOverride  Optional per-annotation colour from AnnotationStyle.
     */
    private _annotationLineColor(styleOverride?: string | null): string {
        const engineColor = this._engineAnnotationPen?.color;
        // engineColor only replaces the hardcoded constant when it differs from
        // the system default ('#000000') — i.e. when a view/element override is active.
        const base = (engineColor && engineColor !== '#000000') ? engineColor : DIM_LINE_COLOR;
        return styleOverride ?? base;
    }

    /**
     * Resolve the annotation line width (CSS pixels) for the current frame.
     *
     * Priority (lowest → highest):
     *   1. Hardcoded scale from AnnotationStyle.lineWeight (pre-existing behaviour)
     *   2. GraphicsRulesEngine pen widthMm × SCREEN_PX_PER_MM (when style is default)
     *
     * @param styleMm  Line weight in mm from AnnotationStyle.
     * @param scale    Multiplier applied to the result (e.g. 0.35 for extension lines).
     * @param minPx    Minimum pixel width (never goes below this value).
     */
    private _annotationLineWidthPx(styleMm: number, scale = 0.5, minPx = 0.5): number {
        const engineMm = this._engineAnnotationPen?.widthMm;
        const effectiveMm = (engineMm !== undefined && engineMm > 0) ? engineMm : styleMm;
        return Math.max(minPx, effectiveMm * SCREEN_PX_PER_MM * scale);
    }

    private _dedupeRoomTags(annotations: AnnotationElement[]): AnnotationElement[] {
        const seenRoomIds = new Set<string>();
        return annotations.filter(ann => {
            if (ann.type !== 'room-tag') return true;
            const roomId = ann.parameters?.roomId;
            if (typeof roomId !== 'string' || !roomId) return true;
            if (seenRoomIds.has(roomId)) return false;
            seenRoomIds.add(roomId);
            return true;
        });
    }

    /**
     * §FIX-DIMENSION-PICK-CORRIDOR (L-256) — is the click inside the dimension's
     * VISIBLE pick corridor?
     *
     * The founder's acceptance test is "a dimension should be selected as easily as a
     * door". A door is a filled symbol tens of pixels across; a dimension is a
     * hairline. Parity therefore needs a corridor around every part of the mark the
     * user can actually aim at, all of it derived from the SAME geometry the renderer
     * draws (`_linearDimViewGeometry`) so the pick target can never drift from the
     * paint:
     *
     *   1. the DIMENSION LINE   — the thing you look at and point at;
     *   2. the EXTENSION LINES  — reference → dim line, the two witness legs;
     *   3. the LABEL BOX        — the text at the dim line's midpoint, which for a
     *                             SHORT dim is by far the biggest target it has;
     *   4. the ENDPOINT HANDLES — a generous radius on the two dim-line ends, which
     *                             are also the drag grips.
     *
     * The reference line is deliberately NOT part of the corridor: it lies on the
     * wall, and picking there must continue to select the WALL.
     */
    private _hitLinearDim(
        ann: AnnotationElement,
        sx: number,
        sy: number,
        w2s: PlanWorldToScreen,
        thresholdPx: number,
    ): boolean {
        const geo = this._linearDimViewGeometry(ann);
        if (!geo) return false;

        const sRefA = w2s(geo.refA.h, geo.refA.v);
        const sRefB = w2s(geo.refB.h, geo.refB.v);
        const sDimA = w2s(geo.dimA.h, geo.dimA.v);
        const sDimB = w2s(geo.dimB.h, geo.dimB.v);

        // (4) endpoint handles — the drag grips, generous like every other annotation.
        for (const s of [sDimA, sDimB]) {
            if (Math.hypot(sx - s.sx, sy - s.sy) <= thresholdPx + 10) return true;
        }

        // (1) the dimension line itself.
        if (distanceToSegment(sx, sy, sDimA.sx, sDimA.sy, sDimB.sx, sDimB.sy) <= thresholdPx + 4) return true;

        // (2) the two extension / witness lines.
        if (distanceToSegment(sx, sy, sRefA.sx, sRefA.sy, sDimA.sx, sDimA.sy) <= thresholdPx) return true;
        if (distanceToSegment(sx, sy, sRefB.sx, sRefB.sy, sDimB.sx, sDimB.sy) <= thresholdPx) return true;

        // (3) the label box at the dim line's midpoint. Sized the same way the label
        // is drawn (`_renderLinearDim`): textPx = max(9, mmToPx(textSizeMm)), centred
        // and middle-baselined. The half-width is a deterministic proxy for the glyph
        // run — no canvas measureText here (the hit-test has no 2D context), and a
        // proxy that is a little generous is exactly what "as easy as a door" wants.
        const style = mergeStyle(ann.style ?? {});
        const textPx = Math.max(9, mmToPx(style.textSizeMm));
        const label = formatDimension(
            geo.rawDist,
            ann.parameters.unit ?? 'mm',
            ann.parameters.prefix,
            ann.parameters.suffix,
            ann.parameters.override,
        );
        const halfW = Math.max(textPx, (label.length * textPx * 0.6) / 2);
        const halfH = textPx * 0.75;
        const midSx = (sDimA.sx + sDimB.sx) * 0.5;
        const midSy = (sDimA.sy + sDimB.sy) * 0.5;
        if (Math.abs(sx - midSx) <= halfW + thresholdPx && Math.abs(sy - midSy) <= halfH + thresholdPx) {
            return true;
        }

        return false;
    }

    hitTestAnnotation(
        viewId: string,
        sx: number,
        sy: number,
        worldToScreen: PlanWorldToScreen,
        thresholdPx = 12,
    ): string | null {
        // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — the pick corridor is sized in the
        // SAME paper millimetres the symbol is drawn in, so it must resolve the SAME two
        // transforms. Resolved here rather than inherited from the last render pass: the
        // hit-test may run for a canvas that did not paint last (split view), and a corridor
        // computed from another canvas's zoom is a corridor in the wrong place.
        this._scaleDenominator = resolveScaleDenominator(viewDefinitionStore.get(viewId)?.output);
        this._pxPerWorldM = pxPerWorldMetre(worldToScreen);

        const annotations = this._dedupeRoomTags(annotationStore.getByView(viewId));

        // ── Elevation marks: quadrant-aware hit test ───────────────────────────
        // When the click lands inside the "cheese" circle, find which sector was
        // clicked by computing the click angle from the circle centre and matching
        // it to the closest sibling's facing direction.
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (ann.type !== 'elevation-mark') continue;
            const pts = ann.geometry2D.modelPoints;
            if (!pts || pts.length < 1) continue;
            const a = worldToScreen(pts[0].x, pts[0].z);
            const dist = Math.hypot(sx - a.sx, sy - a.sy);
            if (dist > 17 + thresholdPx) continue;          // outside cheese circle

            // Gather all siblings at this anchor
            const group = annotations.filter(a2 =>
                a2.type === 'elevation-mark' &&
                a2.geometry2D.modelPoints?.[0] &&
                Math.abs(a2.geometry2D.modelPoints[0].x - pts[0].x) < 0.1 &&
                Math.abs(a2.geometry2D.modelPoints[0].z - pts[0].z) < 0.1,
            );

            if (group.length <= 1) return ann.id;           // single mark — trivial

            // Click angle from circle centre
            const clickAngle = Math.atan2(sy - a.sy, sx - a.sx); // −π…π

            let bestId: string | null = null;
            let bestDelta = Infinity;
            for (const sibling of group) {
                const fd = sibling.parameters.facingDirection as { x: number; z: number } | undefined;
                if (!fd) continue;
                const flen = Math.hypot(fd.x, fd.z);
                if (flen < 0.01) continue;
                const faceAngle = Math.atan2(fd.z, fd.x);
                // Normalise angular difference to [−π, π]
                let delta = clickAngle - faceAngle;
                while (delta >  Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                const absDelta = Math.abs(delta);
                if (absDelta < bestDelta) { bestDelta = absDelta; bestId = sibling.id; }
            }
            return bestId ?? ann.id;
        }

        // ── Section marks ──────────────────────────────────────────────────────
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (ann.type === 'section-mark' && this._hitSectionMark(ann, sx, sy, worldToScreen, thresholdPx)) return ann.id;
        }

        // ── All draggable annotation types — point and multi-point ──────────────
        // Point-based: hit test is a simple radius check on the first anchor.
        // Multi-point (matchline, revision-cloud, linear-dim, etc.): hit test
        // checks ALL model points as anchors AND all inter-point segments so the
        // user can click anywhere along the annotation to select/drag it.
        const SEGMENT_TYPES = new Set([
            'matchline', 'revision-cloud', 'callout-detail',
            // §FIX-AUTODIM-DIMS-SELECTABLE-EDITABLE (L-161) — `'linear-dim'` is the
            // 2-point measure the plan actually renders; treat it as a segment
            // annotation so a click anywhere ALONG the dim line (not just on an
            // endpoint) selects it.
            'linear-dimension', 'linear-dim', 'angular-dim', 'radius-dim', 'diameter-dim', 'slope-dim',
        ]);
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (!DRAGGABLE_ANNOTATION_TYPES.has(ann.type)) continue;
            const pts = ann.geometry2D.modelPoints;
            if (!pts || pts.length === 0) continue;

            // §FIX-DIMENSION-PICK-CORRIDOR (L-256) — a linear dimension is picked on
            // what the user can SEE: the dimension LINE, its extension lines and its
            // TEXT — not on the reference line lying under the wall. See
            // `_linearDimViewGeometry` for the full root cause.
            if (LINEAR_DIM_TYPES.has(ann.type)) {
                if (this._hitLinearDim(ann, sx, sy, worldToScreen, thresholdPx)) return ann.id;
                continue;
            }

            if (SEGMENT_TYPES.has(ann.type) && pts.length >= 2) {
                // §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — project through the SAME
                // view-aware mapping `_renderLinearDim` draws with (`_project`), not the
                // hardcoded plan mapping `(pt.x, pt.z)`. In plan the two are identical
                // (H = x, V = z), so plan-view picking is bit-for-bit unchanged; in an
                // ELEVATION the dim is now hit-testable where it is actually drawn.
                //
                // The point-based branch below still projects as (x, z) — deliberately.
                // Point annotations (tags, notes, keynotes) are still RENDERED with the
                // plan mapping too (`_renderTag` et al. call `w2s(pt.x, pt.z)`), so
                // hit-test and render remain in agreement. Projecting only the hit-test
                // would DESYNC them. That the point-annotation RENDER path is plan-only
                // is a real, separate gap (the same plan-first disease as L-262/L-263/
                // L-265) — it is not silently half-fixed here.
                for (const pt of pts) {
                    const p = this._project(pt);
                    const { sx: ax, sy: ay } = worldToScreen(p.h, p.v);
                    if (Math.hypot(sx - ax, sy - ay) <= thresholdPx + 10) return ann.id;
                }
                // Then check all segments for line annotations
                for (let k = 0; k + 1 < pts.length; k++) {
                    const pA = this._project(pts[k]);
                    const pB = this._project(pts[k + 1]);
                    const sA = worldToScreen(pA.h, pA.v);
                    const sB = worldToScreen(pB.h, pB.v);
                    if (distanceToSegment(sx, sy, sA.sx, sA.sy, sB.sx, sB.sy) <= thresholdPx + 4) return ann.id;
                }
            } else if (TAG_TYPES.has(ann.type) && pts.length >= 2) {
                // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — PICK WHAT THE USER SEES.
                //
                // A leader'd tag is TWO things on screen: the SYMBOL (the bubble/diamond, at
                // modelPoints[1]) and the LEADER (the hairline from the element to it). The
                // old branch tested ONLY `references[0].cachedPosition` — the leader ANCHOR,
                // i.e. the dot ON THE ELEMENT — so clicking the bubble itself selected
                // nothing, and the leader was unpickable. It also projected as (x, z), the
                // hardcoded PLAN mapping, while the render path now projects through
                // `_project` (L-265): in an elevation the hit-test was looking somewhere the
                // tag is not. Both halves are fixed here, and both use the SAME projection
                // the renderer draws with — a pick corridor that disagrees with the drawing
                // is a lie about what you can click.
                //
                // The corridor is PAPER-sized (like the symbol itself), plus the caller's
                // pixel threshold: a hairline leader needs the same generosity the dimension
                // pick corridor got in L-256, or a tag is "fairly hard" to select for exactly
                // the same reason a dimension was.
                const anchor = this._w2sModel(worldToScreen, pts[0]!);
                const symbol = ann.geometry2D.screenOverride
                    ? { sx: ann.geometry2D.screenOverride.x, sy: ann.geometry2D.screenOverride.y }
                    : this._w2sModel(worldToScreen, pts[pts.length - 1]!);

                const bubblePx = this._paperPx(TAG_PAPER_MM.bubbleRadiusMm);
                const tolPx = this._paperPx(TAG_PAPER_MM.pickToleranceMm) + thresholdPx;

                // (1) the SYMBOL — a generous disc around the bubble/diamond.
                if (Math.hypot(sx - symbol.sx, sy - symbol.sy) <= bubblePx + tolPx) return ann.id;
                // (2) the LEADER — the corridor along the line from the element to the symbol.
                if (distanceToSegment(sx, sy, anchor.sx, anchor.sy, symbol.sx, symbol.sy) <= tolPx) {
                    return ann.id;
                }
                // (3) the ANCHOR dot on the element (unchanged behaviour — still pickable).
                if (Math.hypot(sx - anchor.sx, sy - anchor.sy) <= tolPx) return ann.id;
            } else {
                // Point-based (room tag, text note, north arrow…): one point, and it IS where
                // the annotation is drawn. Projected view-aware, for the same reason as above.
                //
                // §FIX-ROOM-TAG-NOT-MOVABLE (L-309) — a ROOM TAG is picked where it is DRAWN: at
                // its PRESENTATION point (`modelPoints[0]`, where a drag writes — L-287), not at
                // its reference (the room centroid, which the point-ref caches forever). Without
                // this, a dragged room tag rendered at the drop point yet stayed grabbable only
                // back at the centroid — pick and paint would disagree, which is the L-256/L-291
                // lesson: a pick corridor that lies about where you can click. Other point types
                // (which track an element through their reference) keep reference-first.
                const pt = ann.type === 'room-tag'
                    ? (pts[0] ?? ann.references[0]?.cachedPosition)
                    : (ann.references[0]?.cachedPosition ?? pts[0]);
                if (!pt) continue;
                const { sx: ax, sy: ay } = this._w2sModel(worldToScreen, pt);
                if (Math.hypot(sx - ax, sy - ay) <= thresholdPx + 8) return ann.id;
            }
        }

        return null;
    }

    hitTestScopeHandle(
        viewId: string,
        sx: number,
        sy: number,
        worldToScreen: PlanWorldToScreen,
        thresholdPx = 10,
    ): { annotationId: string; linkedViewId: string; handle: 'depth' | 'width-left' | 'width-right' | 'cut-plane' } | null {
        const selectedId = this._getSelectedAnnotationId();
        if (!selectedId) return null;
        const ann = annotationStore.getById(selectedId);
        if (!ann || ann.ownerViewId !== viewId) return null;
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        if (!linkedViewId || (ann.type !== 'elevation-mark' && ann.type !== 'section-mark')) return null;
        const viewDef = viewDefinitionStore.get(linkedViewId);
        const scope = viewDef ? this._scopeWorld(ann, viewDef) : null;

        const depthHandle = this._scopeDepthHandleScreenPoint(ann, worldToScreen);
        if (depthHandle && Math.hypot(sx - depthHandle.sx, sy - depthHandle.sy) <= thresholdPx + 2) {
            return { annotationId: ann.id, linkedViewId, handle: 'depth' };
        }

        const widthHandles = this._scopeWidthHandleScreenPoints(ann, worldToScreen);
        if (widthHandles) {
            if (Math.hypot(sx - widthHandles.left.sx,  sy - widthHandles.left.sy)  <= thresholdPx) {
                return { annotationId: ann.id, linkedViewId, handle: 'width-left' };
            }
            if (Math.hypot(sx - widthHandles.right.sx, sy - widthHandles.right.sy) <= thresholdPx) {
                return { annotationId: ann.id, linkedViewId, handle: 'width-right' };
            }
        }

        if (scope) {
            const a = worldToScreen(scope.a.x, scope.a.z);
            const b = worldToScreen(scope.b.x, scope.b.z);
            const fa = worldToScreen(scope.farA.x, scope.farA.z);
            const fb = worldToScreen(scope.farB.x, scope.farB.z);
            for (const p of [a, fa]) {
                if (Math.hypot(sx - p.sx, sy - p.sy) <= thresholdPx + 2) return { annotationId: ann.id, linkedViewId, handle: 'width-left' };
            }
            for (const p of [b, fb]) {
                if (Math.hypot(sx - p.sx, sy - p.sy) <= thresholdPx + 2) return { annotationId: ann.id, linkedViewId, handle: 'width-right' };
            }
            if (distanceToSegment(sx, sy, a.sx, a.sy, b.sx, b.sy) <= thresholdPx) {
                return { annotationId: ann.id, linkedViewId, handle: 'cut-plane' };
            }
        }

        return null;
    }

    // ── Dispatch ───────────────────────────────────────────────────────────────

    private _renderAnnotation(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
    ): void {
        const style = mergeStyle(ann.style);

        switch (ann.type) {
            case 'linear-dim':      this._renderLinearDim(ann, ctx, w2s, style);    break;
            case 'text-note':       this._renderTextNote(ann, ctx, w2s, style);     break;
            case 'tag':             this._renderTag(ann, ctx, w2s, style);           break;
            case 'door-tag':        this._renderDoorTag(ann, ctx, w2s, style);       break;
            case 'window-tag':      this._renderWindowTag(ann, ctx, w2s, style);     break;
            // §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the wall diamond.
            case 'wall-tag':        this._renderWallTag(ann, ctx, w2s, style);       break;
            case 'room-tag':        this._renderRoomTag(ann, ctx, w2s, style);       break;
            case 'grid-bubble':     this._renderGridBubble(ann, ctx, w2s, style);   break;
            case 'detail-line':     this._renderDetailLine(ann, ctx, w2s, style);   break;
            case 'keynote':         this._renderKeynote(ann, ctx, w2s, style);      break;
            // Phase 2 — E-1
            case 'angular-dim':     this._renderAngularDim(ann, ctx, w2s, style);   break;
            // Phase 2 — E-3
            case 'section-mark':    this._renderSectionMark(ann, ctx, w2s, style);  break;
            case 'elevation-mark':  this._renderElevationMark(ann, ctx, w2s, style); break;
            // Phase 3 — E-2
            case 'slope-dim':       this._renderSlopeDim(ann, ctx, w2s, style);     break;
            // Phase 3 — E-4
            case 'callout-detail':  this._renderCalloutDetail(ann, ctx, w2s, style); break;
            case 'revision-cloud':  this._renderRevisionCloud(ann, ctx, w2s, style); break;
            // Phase 3 — E-5
            case 'roof-slope-arrow':   this._renderRoofSlopeArrow(ann, ctx, w2s, style);   break;
            case 'level-datum-line':   this._renderLevelDatumLine(ann, ctx, w2s, style);   break;
            case 'section-grid-line':  this._renderSectionGridLine(ann, ctx, w2s, style);  break;
            // Phase 3 — F-1
            case 'north-arrow':     this._renderNorthArrow(ann, ctx, w2s, style);   break;
            case 'scale-bar':       this._renderScaleBar(ann, ctx, w2s, style);     break;
            case 'matchline':       this._renderMatchline(ann, ctx, w2s, style);    break;
            default: break;
        }
    }

    // ── Linear Dimension ───────────────────────────────────────────────────────

    /**
     * §FIX-DIMENSION-PICK-CORRIDOR (L-256) — the ONE authority for where a linear
     * dimension actually lies in view (H, V) space.
     *
     * WHY THIS EXTRACTION EXISTS — the root cause of "a dimension is very hard to
     * select". A linear dim is drawn as FOUR things: the REFERENCE line (on the
     * geometry it measures), two EXTENSION lines, the DIMENSION LINE — offset
     * perpendicularly from the reference line by `geometry2D.offset` — and the
     * LABEL at the dim line's midpoint. What the user SEES and aims at is the
     * dimension line and its text. What `hitTestAnnotation` used to measure was the
     * distance to the REFERENCE line, i.e. the line lying ON THE WALL.
     *
     * For an auto-dimension that offset is 0.5 m (row 0) to 2.0 m (the overall
     * string) of WORLD standoff (§FIX-AUTODIM-OFFSET-WORLD-SCALE, L-155) — tens to
     * hundreds of screen pixels at any usable plan zoom. So to select a dimension
     * you had to click not on the dimension but on the wall it measures, and if a
     * wall was there you selected the WALL instead. That is the founder's "if it is
     * possible to select at all, it is fairly hard": it was never a tolerance
     * problem, it was a hit-test aimed at the wrong line.
     *
     * (This also REFUTES the standing hypothesis that annotations were never given a
     * pick representation. They were — `DRAGGABLE_ANNOTATION_TYPES` + `SEGMENT_TYPES`
     * + a 16 px corridor, since L-161. The representation existed; it was pointed at
     * the wrong geometry.)
     *
     * Render and pick now both consume this, so they cannot drift apart again.
     * Returns null for a dimension with no drawable geometry.
     */
    private _linearDimViewGeometry(ann: AnnotationElement): {
        refA: { h: number; v: number };
        refB: { h: number; v: number };
        dimA: { h: number; v: number };
        dimB: { h: number; v: number };
        rawDist: number;
    } | null {
        const refs = ann.references;
        if (refs.length < 2) return null;

        const mpA = refs[0].cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        const mpB = refs[1].cachedPosition ?? ann.geometry2D.modelPoints?.[1];
        if (!mpA || !mpB) return null;

        // §ANN-ELEV-SEC: Project reference points using view-aware axis helpers.
        // Plan: H=X, V=Z. Section/Elevation: H=sectionHAxis, V=Y (world height).
        const ax = this._ptH(mpA), az = this._ptV(mpA);
        const bx = this._ptH(mpB), bz = this._ptV(mpB);

        // Measurement direction (H/V plane, view-aware)
        const mn = ann.geometry2D.measurementNormal;
        let dirX: number, dirZ: number;
        let bProjX: number, bProjZ: number;
        let rawDist: number;

        const mnH = mn ? this._ptH(mn as { x: number; y: number; z: number }) : 0;
        const mnV = mn ? this._ptV(mn as { x: number; y: number; z: number }) : 0;

        if (mn && (Math.abs(mnH) > 0.001 || Math.abs(mnV) > 0.001)) {
            // Orthogonal measurement: use stored measurement normal in view-space H/V
            const len = Math.hypot(mnH, mnV);
            dirX = mnH / len;
            dirZ = mnV / len;
            const dot = (bx - ax) * dirX + (bz - az) * dirZ;
            bProjX = ax + dirX * dot;
            bProjZ = az + dirZ * dot;
            rawDist = Math.abs(dot);
        } else {
            // Diagonal or section/elevation: A→B direction in view space
            const dx = bx - ax, dz = bz - az;
            const len = Math.hypot(dx, dz);
            if (len < 0.001) return null;
            dirX = dx / len; dirZ = dz / len;
            bProjX = bx; bProjZ = bz;
            rawDist = len;
        }

        // Perpendicular side (rotate dir by 90° in the view plane)
        const sideX = -dirZ;
        const sideZ =  dirX;
        const offset = ann.geometry2D.offset;

        return {
            refA: { h: ax,     v: az },
            refB: { h: bProjX, v: bProjZ },
            // Dimension line endpoints — offset perpendicularly from the reference line.
            dimA: { h: ax     + sideX * offset, v: az     + sideZ * offset },
            dimB: { h: bProjX + sideX * offset, v: bProjZ + sideZ * offset },
            rawDist,
        };
    }

    private _renderLinearDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const geo = this._linearDimViewGeometry(ann);
        if (!geo) return;

        const ax = geo.refA.h, az = geo.refA.v;
        const bProjX = geo.refB.h, bProjZ = geo.refB.v;
        const dAx = geo.dimA.h, dAz = geo.dimA.v;
        const dBx = geo.dimB.h, dBz = geo.dimB.v;
        const rawDist = geo.rawDist;

        const sRefA = w2s(ax, az);
        const sRefB = w2s(bProjX, bProjZ);
        const sDimA = w2s(dAx, dAz);
        const sDimB = w2s(dBx, dBz);

        // ── Extension lines (reference → dim line)
        ctx.save();

        // §FIX-AUTODIM-DIMS-SELECTABLE-EDITABLE (L-161) — selection affordance.
        // When this dim is the selected annotation, underlay a soft highlight along
        // the dimension line + endpoint handles so the user can SEE it is picked
        // (parity with section/elevation-mark selection). Purely visual; the actual
        // hit-test/drag is driven by hitTestAnnotation + PlanViewInteraction.
        const isSelected = this._getSelectedAnnotationId() === ann.id;
        if (isSelected) {
            ctx.save();
            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth = 3.5;
            ctx.globalAlpha = 0.35;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(sDimA.sx, sDimA.sy); ctx.lineTo(sDimB.sx, sDimB.sy);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#6600ff';
            for (const s of [sDimA, sDimB]) {
                ctx.beginPath(); ctx.arc(s.sx, s.sy, 4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // Contract 23 §7 — colour/weight resolved through GraphicsRulesEngine
        ctx.strokeStyle = this._annotationLineColor(style.lineColor);
        ctx.lineWidth   = this._annotationLineWidthPx(style.lineWeight, 0.35, 0.5);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sRefA.sx, sRefA.sy); ctx.lineTo(sDimA.sx, sDimA.sy);
        ctx.moveTo(sRefB.sx, sRefB.sy); ctx.lineTo(sDimB.sx, sDimB.sy);
        ctx.stroke();

        // ── Dimension line
        ctx.strokeStyle = this._annotationLineColor(style.lineColor);
        ctx.lineWidth   = this._annotationLineWidthPx(style.lineWeight, 0.5, 0.8);
        ctx.beginPath();
        ctx.moveTo(sDimA.sx, sDimA.sy); ctx.lineTo(sDimB.sx, sDimB.sy);
        ctx.stroke();

        // ── Arrow heads
        const dimDx = sDimB.sx - sDimA.sx;
        const dimDz = sDimB.sy - sDimA.sy;
        const dimLen = Math.hypot(dimDx, dimDz);
        if (dimLen > 0.001) {
            const nx = dimDx / dimLen, ny = dimDz / dimLen;
            ctx.fillStyle = this._annotationLineColor(style.lineColor);
            drawArrowTip(ctx, sDimA, { x: -nx, y: -ny }, ARROW_PX);
            drawArrowTip(ctx, sDimB, { x:  nx, y:  ny }, ARROW_PX);
        }

        // ── Label
        const label = formatDimension(
            rawDist,
            ann.parameters.unit ?? 'mm',
            ann.parameters.prefix,
            ann.parameters.suffix,
            ann.parameters.override,
        );
        const midSx = (sDimA.sx + sDimB.sx) * 0.5;
        const midSy = (sDimA.sy + sDimB.sy) * 0.5;
        const textPx = Math.max(9, mmToPx(style.textSizeMm));
        ctx.font = `${textPx}px ${FONT}`;
        ctx.fillStyle = style.textColor ?? DIM_TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Background clear for legibility
        const metrics = ctx.measureText(label);
        const pad = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(
            midSx - metrics.width * 0.5 - pad, midSy - textPx * 0.5 - pad,
            metrics.width + pad * 2, textPx + pad * 2,
        );
        ctx.fillStyle = style.textColor ?? DIM_TEXT_COLOR;
        ctx.fillText(label, midSx, midSy);

        ctx.restore();
    }

    // ── §DIM-VIII-1 — DimensionElement renderer ───────────────────────────────

    /**
     * Render a flat DimensionElement onto the plan canvas.
     *
     * Contract 23 §K rendering rules:
     *   Pen:        0.18 mm annotation weight
     *   Ticks:      2 mm @ 45° at each dim-line endpoint (ISO 128-20)
     *   Extensions: perpendicular to p1→p2; 2 mm overshoot past each ref point
     *   Text:       2.5 mm height, centred on dim line, white background pad
     *   Value:      textOverride ?? Math.round(dist(p1,p2)*1000) + ' mm'
     */
    private _renderDimensionElement(
        dim: DimensionElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
    ): void {
        const { p1, p2, offsetMm, textOverride } = dim;

        // Direction vector in world XZ
        const rawDx = p2.x - p1.x;
        const rawDz = p2.y - p1.y;   // DimPoint2D.y is world Z
        const len = Math.hypot(rawDx, rawDz);
        if (len < 0.001) return;

        const dirX = rawDx / len;
        const dirZ = rawDz / len;

        // Left-hand perpendicular (positive offset = left of p1→p2)
        const perpX = -dirZ;
        const perpZ =  dirX;

        const offsetM   = offsetMm   / 1000;
        const overshootM = 0.002;          // 2 mm overshoot past the ref point
        const tickHalfM  = 0.001;          // half-tick length (1 mm each side → 2 mm total)

        // ── Dim-line endpoints in world XZ ───────────────────────────────────
        const dAx = p1.x + perpX * offsetM;
        const dAz = p1.y + perpZ * offsetM;
        const dBx = p2.x + perpX * offsetM;
        const dBz = p2.y + perpZ * offsetM;

        // ── Ref points for extension line roots (overshoot 2 mm past ref) ───
        const eA1x = p1.x - perpX * overshootM;   // start (past ref, away from dim line)
        const eA1z = p1.y - perpZ * overshootM;
        const eB1x = p2.x - perpX * overshootM;
        const eB1z = p2.y - perpZ * overshootM;

        // ── Screen coordinates ────────────────────────────────────────────────
        const sDimA  = w2s(dAx, dAz);
        const sDimB  = w2s(dBx, dBz);
        const sExt1A = w2s(eA1x, eA1z);
        const sExt1B = w2s(eB1x, eB1z);

        // ── Pen weight: engine override → 0.18 mm default ────────────────────
        const engineMm  = this._engineAnnotationPen?.widthMm;
        const penMm     = (engineMm !== undefined && engineMm > 0) ? engineMm : 0.18;
        const penPx     = Math.max(0.5, penMm * SCREEN_PX_PER_MM);
        const penColor  = this._annotationLineColor();

        ctx.save();
        ctx.strokeStyle = penColor;
        ctx.fillStyle   = penColor;
        ctx.lineWidth   = penPx;
        ctx.setLineDash([]);

        // ── Extension lines ────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(sExt1A.sx, sExt1A.sy);  ctx.lineTo(sDimA.sx, sDimA.sy);
        ctx.moveTo(sExt1B.sx, sExt1B.sy);  ctx.lineTo(sDimB.sx, sDimB.sy);
        ctx.stroke();

        // ── Dimension line ────────────────────────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(sDimA.sx, sDimA.sy);
        ctx.lineTo(sDimB.sx, sDimB.sy);
        ctx.stroke();

        // ── Tick marks at each dim-line endpoint (2 mm @ 45° — ISO 128-20) ───
        // Tick direction: diagonal of dir + perp, normalised to tickHalfM each side
        const tickDirX = (dirX + perpX) * Math.SQRT1_2;
        const tickDirZ = (dirZ + perpZ) * Math.SQRT1_2;

        const drawTick = (cx: number, cz: number) => {
            const tAx = cx - tickDirX * tickHalfM;
            const tAz = cz - tickDirZ * tickHalfM;
            const tBx = cx + tickDirX * tickHalfM;
            const tBz = cz + tickDirZ * tickHalfM;
            const sa = w2s(tAx, tAz);
            const sb = w2s(tBx, tBz);
            ctx.lineWidth = penPx * 1.4;   // ticks slightly heavier for visibility
            ctx.beginPath();
            ctx.moveTo(sa.sx, sa.sy);
            ctx.lineTo(sb.sx, sb.sy);
            ctx.stroke();
            ctx.lineWidth = penPx;
        };

        drawTick(dAx, dAz);
        drawTick(dBx, dBz);

        // ── Label ─────────────────────────────────────────────────────────────
        const label = textOverride ?? `${Math.round(len * 1000)} mm`;

        const midSx  = (sDimA.sx + sDimB.sx) * 0.5;
        const midSy  = (sDimA.sy + sDimB.sy) * 0.5;
        const textPx = Math.max(9, mmToPx(2.5));

        ctx.font         = `${textPx}px ${FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(label);
        const pad     = 3;

        // White knockout background for legibility
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(
            midSx - metrics.width * 0.5 - pad,
            midSy - textPx * 0.5 - pad,
            metrics.width + pad * 2,
            textPx + pad * 2,
        );

        ctx.fillStyle = DIM_TEXT_COLOR;
        ctx.fillText(label, midSx, midSy);

        ctx.restore();
    }

    // ── Text Note ─────────────────────────────────────────────────────────────

    private _renderTextNote(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const text = ann.parameters.text as string | undefined;
        if (!text) return;

        const pt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!pt) return;

        const { sx, sy } = w2s(pt.x, pt.z);
        const textPx = Math.max(9, mmToPx(style.textSizeMm));

        ctx.save();
        ctx.font = `${ann.parameters.bold ? 'bold ' : ''}${ann.parameters.italic ? 'italic ' : ''}${textPx}px ${FONT}`;
        ctx.fillStyle = style.textColor ?? TEXT_NOTE_COLOR;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    // ── Tag (element tag, door tag, window tag) ────────────────────────────────

    private _renderTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const label = (ann.parameters.cachedLabel ?? ann.parameters.label ?? '') as string;
        if (!label) return;

        const leaderPt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!leaderPt) return;

        // §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — view-aware projection (see _w2sModel).
        const { sx: leaderSx, sy: leaderSy } = this._w2sModel(w2s, leaderPt);

        // Label box position: use screenOverride if set, else offset from leader
        let boxSx: number, boxSy: number;
        if (ann.geometry2D.screenOverride) {
            boxSx = ann.geometry2D.screenOverride.x;
            boxSy = ann.geometry2D.screenOverride.y;
        } else {
            const tagPt = ann.geometry2D.modelPoints?.[1];
            if (tagPt) {
                const sp = this._w2sModel(w2s, tagPt);
                boxSx = sp.sx; boxSy = sp.sy;
            } else {
                boxSx = leaderSx; boxSy = leaderSy - 24;
            }
        }

        // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — PAPER, not pixels (see _paperPx).
        const textPx = this._paperPx(TAG_PAPER_MM.markTextMm);
        ctx.save();
        ctx.font = `${textPx}px ${FONT}`;
        const metrics = ctx.measureText(label);
        const pad = this._paperPx(TAG_PAPER_MM.padMm);
        const bw = metrics.width + pad * 2;
        const bh = textPx + pad * 2;

        // Leader line
        if (ann.parameters.showLeader !== false) {
            ctx.strokeStyle = style.lineColor ?? TAG_BD_COLOR;
            ctx.lineWidth = 0.75;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(leaderSx, leaderSy);
            ctx.lineTo(boxSx, boxSy + bh * 0.5);
            ctx.stroke();
        }

        // Tag box
        ctx.fillStyle = TAG_BG_COLOR;
        ctx.strokeStyle = style.lineColor ?? TAG_BD_COLOR;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(boxSx - pad, boxSy - pad, bw, bh, 2);
        } else {
            ctx.rect(boxSx - pad, boxSy - pad, bw, bh);
        }
        ctx.fill();
        ctx.stroke();

        // Label text
        ctx.fillStyle = style.textColor ?? TAG_BD_COLOR;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, boxSx, boxSy);

        ctx.restore();
    }

    // ── Element tags: door · window · wall ────────────────────────────────────
    //
    // §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — ONE renderer, three symbols.
    //
    // `_renderDoorTag` and `_renderWindowTag` were two ~70-line copies of the same
    // drawing (leader + dot + bubble + mark + optional W×H), differing only in stroke
    // colour, fill tint, and whether the divider is always drawn. Adding a WALL tag as
    // a third copy would have made the divergence permanent — so the three now share
    // `_renderMarkedTag`, parameterised by the SYMBOL. The symbol is the only thing
    // that is genuinely different, and it is the thing the convention names:
    //
    //   door   → circle bubble          (mark, + W×H when the tag carries sizes)
    //   window → circle bubble + divider (the classic visual differentiator)
    //   wall   → DIAMOND                 (the wall TYPE mark, per the reference drawing)
    //
    // The leader always runs from the ELEMENT (a dot on the door/window/wall) to the
    // symbol, and both ends are projected through the ACTIVE VIEW's plane — so the
    // same tag draws correctly in a plan AND in an elevation.

    private _renderMarkedTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
        symbol: {
            shape: 'circle' | 'diamond';
            /** Draw the horizontal divider even when the tag carries no size string. */
            alwaysDivide: boolean;
            defaultLineColor: string;
            fillColor: string;
        },
    ): void {
        const mark  = (ann.parameters.cachedLabel ?? ann.parameters.label ?? ann.parameters.mark ?? '') as string;
        const leaderPt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!leaderPt || !mark) return;

        const { sx: leaderSx, sy: leaderSy } = this._w2sModel(w2s, leaderPt);

        // Symbol position — second modelPoint if present, else on the element itself.
        let bx = leaderSx;
        let by = leaderSy;
        const tagPt = ann.geometry2D.modelPoints?.[1];
        if (tagPt) { const sp = this._w2sModel(w2s, tagPt); bx = sp.sx; by = sp.sy; }
        if (ann.geometry2D.screenOverride) {
            bx = ann.geometry2D.screenOverride.x;
            by = ann.geometry2D.screenOverride.y;
        }

        const isSelected = this._getSelectedAnnotationId() === ann.id;
        const lineColor  = isSelected ? ANNOT_SEL_COLOR : (style.lineColor ?? symbol.defaultLineColor);
        const textColor  = isSelected ? ANNOT_SEL_COLOR : (style.textColor ?? symbol.defaultLineColor);

        // §FIX-TAG-CONTENT-MARK-ONLY (L-291c) — A TAG DISPLAYS THE MARK. NOTHING ELSE.
        //
        // The bubble used to print "1200×1200" under the type name. Those dimensions are what
        // the SCHEDULE says when you look the mark up (C28) — printing them here DUPLICATES THE
        // SCHEDULE ONTO THE DRAWING, which is how a drawing drifts from its model, and it is
        // why the circle dwarfed the wall diamond. The record still CARRIES the sizes (they are
        // true, and the panel reads them); the drawing simply does not repeat them.
        //
        // A view that genuinely wants sizes on the face of the drawing opts in — `showSize`,
        // an INTENT (P7), not a default.
        const showSize = ann.parameters.showSize === true;
        const wMm = ann.parameters.widthMm  as number | undefined;
        const hMm = ann.parameters.heightMm as number | undefined;
        const hasSize = showSize && ((wMm != null && wMm > 0) || (hMm != null && hMm > 0));
        const sizeStr = hasSize ? `${Math.round(wMm ?? 0)}×${Math.round(hMm ?? 0)}` : '';

        // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — EVERY size below is a PAPER
        // millimetre carried through the view's scale and the canvas zoom. There is no
        // pixel literal and no world literal left in this function: the previous
        // `const r = sizeStr ? 16 : 13` was a fixed SCREEN radius, which is exactly why the
        // bubble stayed put while the building shrank away underneath it.
        const markPx = this._paperPx(TAG_PAPER_MM.markTextMm);
        const sizePx = this._paperPx(TAG_PAPER_MM.sizeTextMm);
        const padPx = this._paperPx(TAG_PAPER_MM.padMm);
        const dotPx = this._paperPx(TAG_PAPER_MM.leaderDotMm);

        ctx.save();
        ctx.font = `bold ${markPx}px ${FONT}`;
        // The symbol must CONTAIN the mark — a wall type name ("Concrete 200") is far
        // wider than a door number — so the radius is MEASURED against the (already
        // paper-scaled) glyph run, never assumed. Because the text is paper-scaled, so is
        // the radius that wraps it: the symbol grows with its content, on paper, at any zoom.
        const textW = ctx.measureText(mark).width;
        const rBase = this._paperPx(TAG_PAPER_MM.bubbleRadiusMm);
        const r = symbol.shape === 'diamond'
            ? Math.max(rBase, textW * 0.75 + padPx)
            : Math.max(rBase, textW / 2 + padPx);

        // Leader line + dot on the element
        if (ann.parameters.showLeader !== false) {
            const ldx = bx - leaderSx, ldy = by - leaderSy;
            const ldLen = Math.hypot(ldx, ldy);
            if (ldLen > r + 2) {
                const ux = ldx / ldLen, uy = ldy / ldLen;
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 0.75;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(leaderSx, leaderSy);
                ctx.lineTo(bx - ux * r, by - uy * r);
                ctx.stroke();
                ctx.fillStyle = lineColor;
                ctx.beginPath();
                ctx.arc(leaderSx, leaderSy, dotPx, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // The symbol
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.fillStyle = symbol.fillColor;
        ctx.beginPath();
        if (symbol.shape === 'diamond') {
            const rh = r;                                      // half-width
            // Half-height — a flatter, drawing-standard diamond. Proportional to the (paper-
            // scaled) half-width, with a PAPER floor: no pixel literal survives here either.
            const rv = Math.max(this._paperPx(TAG_PAPER_MM.bubbleRadiusMm) * 0.8, r * 0.62);
            ctx.moveTo(bx, by - rv);
            ctx.lineTo(bx + rh, by);
            ctx.lineTo(bx, by + rv);
            ctx.lineTo(bx - rh, by);
            ctx.closePath();
        } else {
            ctx.arc(bx, by, r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        // Horizontal divider (window always; door/wall only when a size is shown)
        const divide = symbol.alwaysDivide || !!sizeStr;
        if (divide && symbol.shape === 'circle') {
            ctx.beginPath();
            ctx.moveTo(bx - r, by);
            ctx.lineTo(bx + r, by);
            ctx.stroke();
        }

        // Mark (top half when the symbol is divided, otherwise centred)
        ctx.font = `bold ${markPx}px ${FONT}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const divided = divide && symbol.shape === 'circle';
        ctx.fillText(mark, bx, divided ? by - r * 0.3 : by);

        // Size (bottom half)
        if (sizeStr && symbol.shape === 'circle') {
            ctx.font = `${sizePx}px ${FONT}`;
            ctx.fillText(sizeStr, bx, by + r * 0.38);
        }

        ctx.restore();
    }

    /** Door tag — circle bubble, mark (+ W×H when the tag carries sizes). */
    private _renderDoorTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        this._renderMarkedTag(ann, ctx, w2s, style, {
            shape: 'circle',
            alwaysDivide: false,
            defaultLineColor: '#1a2035',
            fillColor: 'rgba(255,255,255,0.95)',
        });
    }

    /** Window tag — circle bubble with the divider always drawn (the differentiator). */
    private _renderWindowTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        this._renderMarkedTag(ann, ctx, w2s, style, {
            shape: 'circle',
            alwaysDivide: true,
            defaultLineColor: '#0f4c81',
            fillColor: 'rgba(240,247,255,0.95)',
        });
    }

    /**
     * Wall tag — the DIAMOND carrying the wall TYPE mark, on a leader to the wall.
     * §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265): the third symbol of the same tag family,
     * and the drawing's join to the wall schedule (C28).
     */
    private _renderWallTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        this._renderMarkedTag(ann, ctx, w2s, style, {
            shape: 'diamond',
            alwaysDivide: false,
            defaultLineColor: '#1a2035',
            fillColor: 'rgba(255,255,255,0.95)',
        });
    }

    // ── Room Tag ──────────────────────────────────────────────────────────────

    private _renderRoomTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const name = (ann.parameters.roomName ?? ann.parameters.name ?? '') as string;
        const area = ann.parameters.area as number | undefined;

        // §FIX-ROOM-TAG-NOT-MOVABLE (L-309) — A ROOM TAG IS DRAWN AT ITS PRESENTATION POINT.
        //
        // A room tag has no leader (see TAG_TYPES): its single model point IS where it is
        // drawn, and a DRAG writes that point (`UpdateAnnotationPresentationCommand` stamps the
        // dragged position into `modelPoints[0]`, L-287). `references[0].cachedPosition` is the
        // room CENTROID — the reference anchor the tag is born on. Preferring it, as this used
        // to, redrew the bubble back at the centroid on every projection, so the founder's drag
        // was invisible and "snapped back". Presentation wins; the centroid is only the fallback
        // for a tag the user has never moved (at creation the two are identical, so an un-dragged
        // tag is byte-for-byte unchanged). The hit-test resolves the same way — pick what is drawn.
        const pt = ann.geometry2D.modelPoints?.[0] ?? ann.references[0]?.cachedPosition;
        if (!pt) return;

        // §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — view-aware projection (see _w2sModel).
        const { sx, sy } = this._w2sModel(w2s, pt);
        // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — a room name is paper text too.
        const textPx = this._paperPx(TAG_PAPER_MM.roomNameMm);
        const isSelected = this._getSelectedAnnotationId() === ann.id;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const line1 = name;
        const line2 = area != null ? `${area.toFixed(1)} m²` : '';

        // Measure widths for the selection highlight box
        ctx.font = `bold ${textPx}px ${FONT}`;
        const w1 = ctx.measureText(line1).width;
        ctx.font = `${textPx * 0.85}px ${FONT}`;
        const w2 = line2 ? ctx.measureText(line2).width : 0;
        const boxW = Math.max(w1, w2, 24) + 16;
        const boxH = line2 ? textPx * 2.6 + 6 : textPx + 10;
        const boxX = sx - boxW / 2;
        const boxY = sy - boxH / 2;

        // Selection highlight: purple dashed rectangle + grab handle dot
        if (isSelected) {
            ctx.save();
            ctx.strokeStyle = ANNOT_SEL_COLOR;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            ctx.setLineDash([]);
            ctx.fillStyle = ANNOT_SEL_COLOR;
            ctx.beginPath();
            ctx.arc(sx, boxY, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Room name (bold)
        ctx.font = `bold ${textPx}px ${FONT}`;
        ctx.fillStyle = isSelected ? ANNOT_SEL_COLOR : (style.textColor ?? DIM_TEXT_COLOR);
        ctx.fillText(line1, sx, sy);

        // Area label
        if (line2) {
            ctx.font = `${textPx * 0.85}px ${FONT}`;
            ctx.fillStyle = isSelected ? ANNOT_SEL_COLOR : (style.textColor ?? DIM_TEXT_COLOR);
            ctx.fillText(line2, sx, sy + textPx * 1.3);
        }

        ctx.restore();
    }

    // ── Grid Bubble ───────────────────────────────────────────────────────────

    private _renderGridBubble(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const label = (ann.parameters.label ?? ann.parameters.name ?? ann.parameters.cachedLabel ?? ann.parameters.gridName ?? '') as string;
        const pt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!pt) return;

        const { sx, sy } = w2s(pt.x, pt.z);
        const r = 13;
        const textPx = Math.max(9, mmToPx(style.textSizeMm));

        ctx.save();

        // Circle
        ctx.strokeStyle = style.lineColor ?? GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.font = `700 ${textPx}px ${FONT}`;
        ctx.fillStyle = style.textColor ?? GRID_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy);

        ctx.restore();
    }

    // ── Detail Line ───────────────────────────────────────────────────────────

    private _renderDetailLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        ctx.save();
        // Contract 23 §7 — colour/weight resolved through GraphicsRulesEngine
        ctx.strokeStyle = this._annotationLineColor(style.lineColor);
        ctx.lineWidth   = this._annotationLineWidthPx(style.lineWeight, 0.5, 0.5);
        ctx.setLineDash([]);
        ctx.beginPath();

        for (let i = 0; i < pts.length; i++) {
            const { sx, sy } = w2s(pts[i].x, pts[i].z);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.restore();
    }

    // ── Keynote ───────────────────────────────────────────────────────────────

    private _renderKeynote(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const key = (ann.parameters.key ?? ann.parameters.code ?? '') as string;
        if (!key) return;

        const pt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!pt) return;

        const { sx, sy } = w2s(pt.x, pt.z);
        const r = 10;
        const textPx = Math.max(7, mmToPx(style.textSizeMm) * 0.85);

        ctx.save();

        // Hexagonal-ish: just a circle for simplicity, matching AEC convention
        ctx.strokeStyle = style.lineColor ?? DIM_LINE_COLOR;
        ctx.lineWidth = 0.75;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = `bold ${textPx}px ${FONT}`;
        ctx.fillStyle = style.textColor ?? DIM_TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(key, sx, sy);

        ctx.restore();
    }

    // ── E-1: Angular Dimension ────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = vertex (arc centre)
    // geometry2D.modelPoints[1] = ray A endpoint
    // geometry2D.modelPoints[2] = ray B endpoint
    // parameters.unit: 'deg' | 'rad' (default 'deg')

    private _renderAngularDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 3) return;

        const sv  = w2s(pts[0].x, pts[0].z);  // vertex
        const sA  = w2s(pts[1].x, pts[1].z);  // ray A end
        const sB  = w2s(pts[2].x, pts[2].z);  // ray B end

        const rAx = sA.sx - sv.sx, rAy = sA.sy - sv.sy;
        const rBx = sB.sx - sv.sx, rBy = sB.sy - sv.sy;
        const lenA = Math.hypot(rAx, rAy);
        const lenB = Math.hypot(rBx, rBy);
        if (lenA < 1 || lenB < 1) return;

        // Angles in screen space
        const angA = Math.atan2(rAy, rAx);
        const angB = Math.atan2(rBy, rBx);

        // Interior angle (always take the smaller arc)
        let delta = angB - angA;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        while (delta >  Math.PI) delta -= 2 * Math.PI;

        // Arc radius = 40 % of the shorter ray, clamped
        const arcR = Math.max(16, Math.min(0.4 * Math.min(lenA, lenB), 60));

        const textPx = Math.max(9, mmToPx(style.textSizeMm));
        const lineColor = style.lineColor ?? DIM_LINE_COLOR;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = Math.max(0.8, mmToPx(style.lineWeight) * 0.5);
        ctx.setLineDash([]);

        // Ray A (from vertex to A endpoint)
        ctx.beginPath();
        ctx.moveTo(sv.sx, sv.sy);
        ctx.lineTo(sA.sx, sA.sy);
        ctx.stroke();

        // Ray B (from vertex to B endpoint)
        ctx.beginPath();
        ctx.moveTo(sv.sx, sv.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();

        // Arc between the two rays
        ctx.beginPath();
        ctx.arc(sv.sx, sv.sy, arcR, angA, angA + delta);
        ctx.stroke();

        // Arrowheads on the arc endpoints
        const axA = Math.cos(angA) * arcR, ayA = Math.sin(angA) * arcR;
        const axB = Math.cos(angA + delta) * arcR, ayB = Math.sin(angA + delta) * arcR;
        ctx.fillStyle = lineColor;
        // tangent at start of arc (perpendicular to radius, in arc direction)
        const tanAxDir = delta >= 0 ? { x: -Math.sin(angA), y:  Math.cos(angA) }
                                    : { x:  Math.sin(angA), y: -Math.cos(angA) };
        const tanBxDir = delta >= 0 ? { x:  Math.sin(angA + delta), y: -Math.cos(angA + delta) }
                                    : { x: -Math.sin(angA + delta), y:  Math.cos(angA + delta) };
        drawArrowTip(ctx, { sx: sv.sx + axA, sy: sv.sy + ayA }, tanAxDir, ARROW_PX);
        drawArrowTip(ctx, { sx: sv.sx + axB, sy: sv.sy + ayB }, tanBxDir, ARROW_PX);

        // Angle label at midpoint of arc
        const midAng = angA + delta * 0.5;
        const labelR = arcR + 14;
        const lcx = sv.sx + Math.cos(midAng) * labelR;
        const lcy = sv.sy + Math.sin(midAng) * labelR;

        const rawAngleDeg = Math.abs(delta * 180 / Math.PI);
        const unit = (ann.parameters.unit as string | undefined) ?? 'deg';
        const label = unit === 'rad'
            ? `${(Math.abs(delta)).toFixed(3)} rad`
            : `${rawAngleDeg.toFixed(1)}°`;

        ctx.font = `${textPx}px ${FONT}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(lcx - tw * 0.5 - 3, lcy - textPx * 0.5 - 2, tw + 6, textPx + 4);
        ctx.fillStyle = style.textColor ?? DIM_TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lcx, lcy);

        ctx.restore();
    }

    // ── E-3: Section Mark ─────────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = section line start
    // geometry2D.modelPoints[1] = section line end
    // parameters.markLabel: string (e.g. "A")
    // parameters.sheetRef:  string (sheet number)
    // parameters.detailRef: string (detail number)

    private _renderSectionMark(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = w2s(pts[0].x, pts[0].z);
        const sB = w2s(pts[1].x, pts[1].z);

        const lineColor  = style.lineColor ?? '#1a2035';
        const textPx     = Math.max(8, mmToPx(style.textSizeMm) * 0.85);
        const markLabel  = (ann.parameters.markLabel as string | undefined) ?? 'S';
        const sheetRef   = (ann.parameters.sheetRef  as string | undefined) ?? '';
        const detailRef  = (ann.parameters.detailRef as string | undefined) ?? '';
        const HEAD_R     = 11;

        ctx.save();

        // Screen-space direction vectors for cut line and tail
        const cutDx  = sB.sx - sA.sx;
        const cutDy  = sB.sy - sA.sy;
        const cutLen = Math.hypot(cutDx, cutDy);

        // tailDir stored in parameters.tailDirection as { x, z } in world space.
        // Convert to screen direction: world X → screen X, world Z → screen Y (inverted).
        const tailDir = ann.parameters.tailDirection as { x: number; z: number } | undefined;
        // Left-hand perpendicular of the cut line in screen space (same as tool's tailDir).
        const tailSx = cutLen > 0.5 ? -cutDy / cutLen : 0;
        const tailSy = cutLen > 0.5 ?  cutDx / cutLen : 1;

        // Dashed cut line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 1.2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Perpendicular tick marks at each endpoint (viewing-side flags)
        if (cutLen > 0.5) {
            const TICK = 14;
            for (const { sx, sy } of [sA, sB]) {
                ctx.strokeStyle = lineColor;
                ctx.lineWidth   = 1.5;
                ctx.beginPath();
                ctx.moveTo(sx + tailSx * 3,    sy + tailSy * 3);
                ctx.lineTo(sx + tailSx * TICK,  sy + tailSy * TICK);
                ctx.stroke();
            }
        }

        // Viewing-direction arrow at cut-line midpoint
        if (cutLen > 2) {
            const midSx    = (sA.sx + sB.sx) / 2;
            const midSy    = (sA.sy + sB.sy) / 2;
            const ARROW_LEN = Math.min(36, cutLen * 0.28);
            const tipX = midSx + tailSx * ARROW_LEN;
            const tipY = midSy + tailSy * ARROW_LEN;
            const ang  = Math.atan2(tailSy, tailSx);
            const HS   = 6;
            ctx.strokeStyle = lineColor;
            ctx.fillStyle   = lineColor;
            ctx.lineWidth   = 1.2;
            ctx.beginPath();
            ctx.moveTo(midSx, midSy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX + Math.cos(ang + Math.PI * 0.78) * HS, tipY + Math.sin(ang + Math.PI * 0.78) * HS);
            ctx.lineTo(tipX + Math.cos(ang - Math.PI * 0.78) * HS, tipY + Math.sin(ang - Math.PI * 0.78) * HS);
            ctx.closePath();
            ctx.fill();
        }

        // Section head circles at each end
        for (const { sx, sy } of [sA, sB]) {
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, HEAD_R, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Horizontal divider inside circle
            ctx.beginPath();
            ctx.moveTo(sx - HEAD_R, sy);
            ctx.lineTo(sx + HEAD_R, sy);
            ctx.stroke();

            // Mark label (top half) + ref (bottom half)
            ctx.font = `bold ${textPx}px ${FONT}`;
            ctx.fillStyle = lineColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(markLabel, sx, sy - HEAD_R * 0.35);

            const refStr = sheetRef && detailRef ? `${detailRef}/${sheetRef}` : (sheetRef || detailRef);
            if (refStr) {
                ctx.font = `${textPx * 0.8}px ${FONT}`;
                ctx.fillText(refStr, sx, sy + HEAD_R * 0.45);
            }
        }

        // Suppress unused-variable warning — tailDir retained in params for IFC export
        void tailDir;

        ctx.restore();
    }

    // ── E-3: Elevation Mark ───────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = anchor (where the mark is placed in plan)
    // geometry2D.modelPoints[1] = (optional) direction point for the view arrow
    // parameters.markLabel: string (e.g. "E1")
    // parameters.sheetRef:  string
    // parameters.detailRef: string

    private _renderElevationMark(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 1) return;

        const anchor = pts[0];
        const anchorKey = `${Math.round(anchor.x * 100)}_${Math.round(anchor.z * 100)}`;
        const isSelected = this._getSelectedAnnotationId() === ann.id;
        const sAnchor = w2s(anchor.x, anchor.z);

        // ── Draw the shared group symbol (Revit-style circular "cheese") once per anchor ──
        if (!this._renderedElevAnchors.has(anchorKey)) {
            this._renderedElevAnchors.add(anchorKey);

            // Collect all elevation marks belonging to this group (same anchor position)
            const viewAnns = annotationStore.getByView(ann.ownerViewId);
            const group = viewAnns.filter(a =>
                a.type === 'elevation-mark' &&
                a.geometry2D.modelPoints?.[0] &&
                Math.abs(a.geometry2D.modelPoints[0].x - anchor.x) < 0.1 &&
                Math.abs(a.geometry2D.modelPoints[0].z - anchor.z) < 0.1,
            );
            const selectedId = this._getSelectedAnnotationId();
            const anySelected = selectedId !== null && group.some(a => a.id === selectedId);
            const INK     = style.lineColor ?? '#1a4731';
            // §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300) — was amber `#f59e0b`. The rose is
            // not a crop affordance, but it IS the selected-state indicator of the same
            // mark whose crop overlay is now purple, and this file already paints its
            // other selection accents #6600ff. Two selection colours on one mark was the
            // defect; see ViewCropPalette.CROP_INK.SELECTED for the full rationale.
            const SEL_INK = CROP_INK.SELECTED;              // PRYZM purple — selected sector
            const R       = 17;                             // circle radius in CSS px
            const cx      = sAnchor.sx;
            const cy      = sAnchor.sy;

            ctx.save();

            // ── 1. Draw one filled sector per facing direction ──────────────────
            // Sectors are separated by lines at 45° offsets from the facing directions.
            // Each sector spans ±45° around its bisector (the facing angle).
            // For N directions: sector boundary lines bisect the gaps between them.
            if (group.length > 0) {
                // Collect facing screen angles
                const entries: { sibling: typeof group[0]; angle: number }[] = [];
                for (const sibling of group) {
                    const fd = sibling.parameters.facingDirection as { x: number; z: number } | undefined;
                    if (!fd) continue;
                    const len = Math.hypot(fd.x, fd.z);
                    if (len < 0.01) continue;
                    entries.push({ sibling, angle: Math.atan2(fd.z, fd.x) });
                }

                const n = entries.length;
                for (let i = 0; i < n; i++) {
                    const { sibling, angle } = entries[i];
                    const isThisSelected = sibling.id === selectedId;

                    // Sector spans ±(halfSector) around the facing angle
                    const halfSector = (n > 0 ? Math.PI * 2 / n : Math.PI * 2) / 2;
                    const a1 = angle - halfSector;
                    const a2 = angle + halfSector;

                    // Sector fill
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, R, a1, a2);
                    ctx.closePath();
                    if (isThisSelected) {
                        ctx.fillStyle = 'rgba(245,158,11,0.30)';
                    } else {
                        ctx.fillStyle = anySelected ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.92)';
                    }
                    ctx.fill();

                    // Arrow tip in the sector: a solid filled triangle at the arc edge
                    const tipX  = cx + Math.cos(angle) * R;
                    const tipY  = cy + Math.sin(angle) * R;
                    const baseR = R * 0.52;                  // arrowhead base pulls inward
                    const hw    = R * 0.30;                  // half-width of arrowhead base
                    const perpA = angle + Math.PI / 2;
                    const bx1   = cx + Math.cos(angle) * baseR + Math.cos(perpA) * hw;
                    const by1   = cy + Math.sin(angle) * baseR + Math.sin(perpA) * hw;
                    const bx2   = cx + Math.cos(angle) * baseR - Math.cos(perpA) * hw;
                    const by2   = cy + Math.sin(angle) * baseR - Math.sin(perpA) * hw;

                    ctx.beginPath();
                    ctx.moveTo(tipX, tipY);
                    ctx.lineTo(bx1, by1);
                    ctx.lineTo(bx2, by2);
                    ctx.closePath();
                    ctx.fillStyle = isThisSelected ? SEL_INK : INK;
                    ctx.fill();
                }
            } else {
                // Fallback single white circle — no group data yet
                ctx.beginPath();
                ctx.arc(cx, cy, R, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fill();
            }

            // ── 2. Outer circle ─────────────────────────────────────────────────
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.strokeStyle = anySelected ? SEL_INK : INK;
            ctx.lineWidth   = anySelected ? 1.8 : 1.2;
            ctx.stroke();

            // ── 3. Sector divider lines ─────────────────────────────────────────
            // Draw thin radial lines separating sectors
            if (group.length > 1) {
                ctx.strokeStyle = anySelected ? 'rgba(245,158,11,0.55)' : `${INK}88`;
                ctx.lineWidth   = 0.8;
                const n = group.length;
                for (let i = 0; i < n; i++) {
                    const entry = group[i];
                    const fd = entry.parameters.facingDirection as { x: number; z: number } | undefined;
                    if (!fd) continue;
                    const flen = Math.hypot(fd.x, fd.z);
                    if (flen < 0.01) continue;
                    const baseAngle = Math.atan2(fd.z, fd.x);
                    const halfSector = Math.PI * 2 / n / 2;
                    const divAngle = baseAngle + halfSector;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + Math.cos(divAngle) * R, cy + Math.sin(divAngle) * R);
                    ctx.stroke();
                }
            }

            // ── 4. Centre dot ───────────────────────────────────────────────────
            ctx.fillStyle = anySelected ? SEL_INK : INK;
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // ── 5. Mark label below the symbol ──────────────────────────────────
            const markLabel = (ann.parameters.markLabel as string | undefined) ?? 'E';
            const textPx = Math.max(8, mmToPx(style.textSizeMm) * 0.75);
            ctx.font = `bold ${textPx}px ${FONT}`;
            ctx.fillStyle = anySelected ? SEL_INK : INK;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(markLabel, cx, cy + R + 3);

            ctx.restore();
        }

        // ── Draw cut line for the selected direction ──
        if (isSelected) {
            this._renderElevationCutLine(ann, ctx, w2s, style);
        }
    }

    private _renderElevationCutLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        _style: AnnotationStyle,
    ): void {
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const viewDef = linkedViewId ? viewDefinitionStore.get(linkedViewId) : undefined;
        if (!viewDef) return;
        // ⚠ §ELEV-SCOPE-FRAME (L-1856) — THIS LINE USED TO CALL `_computeElevationScope`
        // DIRECTLY, and that was the founder's *"line staying static pointing to the
        // wrong place"* (2026-08-21). `_computeElevationScope` reads `crop.region[0]`
        // as a SIGNED PERPENDICULAR OFFSET from the mark anchor — but every writer that
        // also stores a `sectionVolume` (the scope drag, `CreateElevationMarkCommand`)
        // writes it as an ABSOLUTE world-H coordinate. Adding an absolute coordinate to
        // the anchor displaces the cut line by the anchor's OWN H value: on the
        // founder's South elevation the crop spanned world-H -15.69 → 0.15 while this
        // line was drawn 7.8 m to its left, unmoving, beside a crop rectangle that was
        // correct. Two producers of one surface (C06 §13.3).
        //
        // `_scopeWorld` is that ONE producer: it prefers `spatial.sectionVolume` — the
        // same frame the projector and the crop rectangle use — and falls back to
        // `_computeElevationScope` only when no volume exists, which is the only case
        // in which the OFFSET encoding is the correct reading. Do not re-point this at
        // `_computeElevationScope`; the dual encoding is documented on
        // `ViewCropSettings.region` and is not yet unified.
        const scope = this._scopeWorld(ann, viewDef);
        if (!scope) return;

        const a = w2s(scope.a.x, scope.a.z);
        const b = w2s(scope.b.x, scope.b.z);
        const dir = normalize2((ann.parameters.facingDirection as { x: number; z: number } | undefined) ?? { x: 0, z: -1 });

        ctx.save();
        ctx.strokeStyle = 'rgba(245,158,11,0.95)';
        ctx.fillStyle   = 'rgba(245,158,11,0.95)';
        ctx.lineWidth   = 1.8;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Viewing-direction tick marks at each end
        const sdx = dir.x;
        const sdy = dir.z;
        const tlen = Math.hypot(sdx, sdy);
        if (tlen > 0.01) {
            const tx = sdx / tlen;
            const ty = sdy / tlen;
            const TICK = 14;
            for (const { sx, sy } of [a, b]) {
                ctx.beginPath();
                ctx.moveTo(sx + tx * 3, sy + ty * 3);
                ctx.lineTo(sx + tx * TICK, sy + ty * TICK);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    private _getSelectedAnnotationId(): string | null {
        const selected = window.selectionManager?.selectedObject?.userData;
        return (
            selected?.annotationId ??
            selected?.id ??
            selected?.elementId ??
            window.__pryzmSelectedAnnotationId ??
            null
        ) as string | null;
    }

    private _renderSelectedScopeOverlay(
        annotations: AnnotationElement[],
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
    ): void {
        const selectedId = this._getSelectedAnnotationId();
        if (!selectedId) return;
        const ann = annotations.find(a => a.id === selectedId);
        if (!ann || (ann.type !== 'section-mark' && ann.type !== 'elevation-mark')) return;
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const viewDef = linkedViewId ? viewDefinitionStore.get(linkedViewId) : undefined;
        if (!viewDef) return;

        // §CROP-IS-THE-CLIP (L-4500) — the label reads the SAME resolver as the
        // rectangle it annotates and as the projector. It used to read
        // `sectionVolume.far ?? resolveElevationFarDepth(...)` — sectionVolume FIRST,
        // the exact INVERSE of the projector's precedence — so after a panel depth
        // edit the caption stated a depth the drawing did not have.
        const depth = resolveElevationClipRange(viewDef, DEFAULT_ELEVATION_SCOPE_DEPTH_M).far;
        const scope = this._scopeWorld(ann, viewDef);
        if (!scope) return;

        const a = w2s(scope.a.x, scope.a.z);
        const b = w2s(scope.b.x, scope.b.z);
        const fb = w2s(scope.farB.x, scope.farB.z);
        const fa = w2s(scope.farA.x, scope.farA.z);
        const depthHandle = { sx: (fa.sx + fb.sx) / 2, sy: (fa.sy + fb.sy) / 2 };

        // §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — grab affordance palette. Handles
        // read as amber squares by default; the one under the cursor turns the PRYZM
        // selection purple (#6600ff, the same accent linear-dimension selection uses)
        // and enlarges, so the crop grab targets are obvious BEFORE the user commits.
        // §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300) — REST and HOVER are two rungs of ONE
        // brand-purple ramp, never the same value. `HOVER` was already #6600ff here, so
        // painting the resting state the same purple would have deleted the hover state
        // rather than unified the colour; `CROP_INK.EDGE` is the brand hue at reduced
        // alpha and `CROP_INK.HOVER` is it at full strength. See ViewCropPalette.
        const hov = this._hoveredScopeHandle;
        const ACCENT = CROP_INK.EDGE;
        const HOVER = CROP_INK.HOVER;

        ctx.save();
        this._renderScopeZoneFills(ctx, scope, w2s);

        // Cut line (near plane) — the `cut-plane` grab; thickens + turns purple on hover.
        ctx.setLineDash([]);
        ctx.strokeStyle = hov === 'cut-plane' ? HOVER : ACCENT;
        ctx.lineWidth = hov === 'cut-plane' ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = CROP_INK.GUIDE;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(fa.sx, fa.sy);
        ctx.moveTo(b.sx, b.sy);
        ctx.lineTo(fb.sx, fb.sy);
        ctx.moveTo(fa.sx, fa.sy);
        ctx.lineTo(fb.sx, fb.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = CROP_INK.EDGE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
        ctx.lineTo(depthHandle.sx, depthHandle.sy);
        ctx.stroke();
        ctx.fillStyle = CROP_INK.EDGE;
        drawArrowTip(ctx, depthHandle, {
            x: depthHandle.sx - (a.sx + b.sx) / 2,
            y: depthHandle.sy - (a.sy + b.sy) / 2,
        }, 7);

        // §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — draw a prominent grab square.
        // Hovered handles enlarge (12→16 px) and fill purple; the rest stay white
        // amber-bordered but are still noticeably larger than the old 8 px targets.
        const drawGrab = (p: { sx: number; sy: number }, hovered: boolean, base: number): void => {
            const s = hovered ? base + 4 : base;
            ctx.beginPath();
            ctx.rect(p.sx - s / 2, p.sy - s / 2, s, s);
            ctx.fillStyle = hovered ? HOVER : CROP_INK.HANDLE_FILL;
            ctx.fill();
            ctx.strokeStyle = hovered ? HOVER : ACCENT;
            ctx.lineWidth = hovered ? 2 : 1.4;
            ctx.stroke();
        };

        // Far corners frame the scope box (visual anchors, small); the depth midpoint
        // and the two width midpoints are the primary grab targets (larger).
        ctx.fillStyle = CROP_INK.HANDLE_FILL;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.2;
        for (const p of [a, b, fa, fb]) {
            ctx.beginPath();
            ctx.rect(p.sx - 4, p.sy - 4, 8, 8);
            ctx.fill();
            ctx.stroke();
        }
        drawGrab(depthHandle, hov === 'depth', 12);

        const wh = this._scopeWidthHandleScreenPoints(ann, w2s);
        if (wh) {
            drawGrab(wh.left,  hov === 'width-left',  12);
            drawGrab(wh.right, hov === 'width-right', 12);
        }

        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = CROP_INK.LABEL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Depth ${depth.toFixed(2)} m`, depthHandle.sx, depthHandle.sy - 9);
        // Discoverability hint: the mark is BOTH a crop editor (drag handles) and a
        // navigation target (double-click) — spell it out so neither is hidden.
        ctx.font = `10px ${FONT}`;
        ctx.fillStyle = CROP_INK.LABEL_SOFT;
        ctx.textBaseline = 'top';
        ctx.fillText('Drag handles to crop · double-click to open', (a.sx + b.sx) / 2, (a.sy + b.sy) / 2 + 9);
        ctx.restore();
    }

    private _renderActiveLinkedScopeOverlay(
        annotations: AnnotationElement[],
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        activeLinkedViewId: string | null,
    ): void {
        if (!activeLinkedViewId) return;
        const selectedId = this._getSelectedAnnotationId();
        const ann = annotations.find(a =>
            a.id !== selectedId &&
            (a.type === 'section-mark' || a.type === 'elevation-mark') &&
            a.parameters.linkedViewId === activeLinkedViewId
        );
        if (!ann) return;
        const viewDef = viewDefinitionStore.get(activeLinkedViewId);
        if (!viewDef) return;

        const scope = this._scopeWorld(ann, viewDef);
        if (!scope) return;

        const a = w2s(scope.a.x, scope.a.z);
        const b = w2s(scope.b.x, scope.b.z);
        const fb = w2s(scope.farB.x, scope.farB.z);
        const fa = w2s(scope.farA.x, scope.farA.z);

        ctx.save();
        this._renderScopeZoneFills(ctx, scope, w2s, true);
        ctx.fillStyle = cropZoneFill(0);
        ctx.strokeStyle = CROP_INK.GUIDE;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(fb.sx, fb.sy);
        ctx.lineTo(fa.sx, fa.sy);
        ctx.closePath();
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = CROP_INK.EDGE_ACTIVE;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = CROP_INK.LABEL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Active cut', (a.sx + b.sx) / 2, (a.sy + b.sy) / 2 - 7);
        ctx.restore();
    }

    private _scopeDepthHandleScreenPoint(ann: AnnotationElement, w2s: PlanWorldToScreen): { sx: number; sy: number } | null {
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const viewDef = linkedViewId ? viewDefinitionStore.get(linkedViewId) : undefined;
        if (!viewDef) return null;
        const scope = this._scopeWorld(ann, viewDef);
        if (!scope) return null;
        const fa = w2s(scope.farA.x, scope.farA.z);
        const fb = w2s(scope.farB.x, scope.farB.z);
        return { sx: (fa.sx + fb.sx) / 2, sy: (fa.sy + fb.sy) / 2 };
    }

    private _sectionScopeWorld(ann: AnnotationElement, clip: ElevationClipRange): ScopeWorld | null {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return null;
        const p0 = { x: pts[0].x, z: pts[0].z };
        const p1 = { x: pts[1].x, z: pts[1].z };
        const fallback = normalize2({ x: -(p1.z - p0.z), z: p1.x - p0.x });
        const dir = normalize2((ann.parameters.tailDirection as { x: number; z: number } | undefined) ?? fallback);
        // §CROP-IS-THE-CLIP (L-4500) — the NEAR edge sits at `clip.near`, not at the
        // mark line, whenever a near offset is stored. Drawing it at the mark while the
        // projector clipped at the offset is the same lying-edge shape as the far end.
        const at = (p: { x: number; z: number }, d: number) => ({ x: p.x + dir.x * d, z: p.z + dir.z * d });
        return {
            a: at(p0, clip.near),
            b: at(p1, clip.near),
            farA: at(p0, clip.far),
            farB: at(p1, clip.far),
        };
    }

    /**
     * Computes the elevation scope using signed perpendicular offsets stored in
     * crop.region (min[0] = left offset, max[0] = right offset from anchor centre).
     * Supports asymmetric width when left/right handles are dragged independently.
     */
    private _computeElevationScope(
        ann: AnnotationElement,
        viewDef: ViewDefinition,
        clip: ElevationClipRange,
    ): ScopeWorld | null {
        const pt = ann.geometry2D.modelPoints?.[0];
        if (!pt) return null;
        const dir = normalize2((ann.parameters.facingDirection as { x: number; z: number } | undefined) ?? { x: 0, z: -1 });
        const perp = { x: -dir.z, z: dir.x };
        const DEFAULT_HALF = 3;
        const leftPerp  = viewDef.crop?.region?.min[0]  ?? -DEFAULT_HALF;
        const rightPerp = viewDef.crop?.region?.max[0]  ??  DEFAULT_HALF;
        const baseA = { x: pt.x + perp.x * leftPerp,  z: pt.z + perp.z * leftPerp };
        const baseB = { x: pt.x + perp.x * rightPerp, z: pt.z + perp.z * rightPerp };
        // §CROP-IS-THE-CLIP (L-4500) — both ends from the shared range. See _sectionScopeWorld.
        const at = (p: { x: number; z: number }, d: number) => ({ x: p.x + dir.x * d, z: p.z + dir.z * d });
        return {
            a: at(baseA, clip.near),
            b: at(baseB, clip.near),
            farA: at(baseA, clip.far),
            farB: at(baseB, clip.far),
        };
    }

    private _scopeWorld(ann: AnnotationElement, viewDef: ViewDefinition): ScopeWorld | null {
        const volume = viewDef.spatial.sectionVolume;
        if (volume) {
            const [ox, , oz] = volume.origin;
            const dir = normalize2({ x: volume.direction[0], z: volume.direction[2] });
            const right = { x: -dir.z, z: dir.x };
            const half = Math.max(0.05, volume.width / 2);
            // §CROP-IS-THE-CLIP (L-4500) — near/far come from the SHARED resolver, not
            // from `volume.near`/`volume.far` directly. `sectionVolume.far` is only ONE
            // of three stores for this quantity: the ViewPropertiesPanel "View Depth (m)"
            // input writes `crop.farClip.offset` and does NOT touch the section volume,
            // so reading the volume here drew a rectangle at the OLD depth beside an
            // elevation clipped at the NEW one — a lying rectangle (cf. L-267, L-1856).
            // Same expression as EdgeProjectorService.resolveClipRange() by construction.
            const { near, far } = resolveElevationClipRange(viewDef, DEFAULT_ELEVATION_SCOPE_DEPTH_M);
            const proj = Math.max(near, Math.min(viewDef.viewRange?.depth?.offset ?? viewDef.spatial.viewRange?.farOffset ?? far, far));
            const centerAt = (depth: number) => ({ x: ox + dir.x * depth, z: oz + dir.z * depth });
            const nearCenter = centerAt(near);
            const farCenter = centerAt(far);
            const projCenter = centerAt(proj);
            return {
                a: { x: nearCenter.x - right.x * half, z: nearCenter.z - right.z * half },
                b: { x: nearCenter.x + right.x * half, z: nearCenter.z + right.z * half },
                farA: { x: farCenter.x - right.x * half, z: farCenter.z - right.z * half },
                farB: { x: farCenter.x + right.x * half, z: farCenter.z + right.z * half },
                projectionA: { x: projCenter.x - right.x * half, z: projCenter.z - right.z * half },
                projectionB: { x: projCenter.x + right.x * half, z: projCenter.z + right.z * half },
            };
        }
        // §CROP-IS-THE-CLIP (L-4500) — NO sectionVolume: the same resolver still owns
        // both ends. `near` matters here because `roomInteriorElevations` writes
        // `viewRange.nearOffset` on exactly these volume-less views, and the rectangle
        // used to start at the anchor while the projector clipped at that offset.
        const clip = resolveElevationClipRange(viewDef, DEFAULT_ELEVATION_SCOPE_DEPTH_M);
        return ann.type === 'section-mark'
            ? this._sectionScopeWorld(ann, clip)
            : this._computeElevationScope(ann, viewDef, clip);
    }

    private _renderScopeZoneFills(ctx: CanvasRenderingContext2D, scope: ScopeWorld, w2s: PlanWorldToScreen, subdued = false): void {
        const debug = Boolean(window.__PRYZM_DEBUG_ZONES__);
        const a = w2s(scope.a.x, scope.a.z);
        const b = w2s(scope.b.x, scope.b.z);
        const fa = w2s(scope.farA.x, scope.farA.z);
        const fb = w2s(scope.farB.x, scope.farB.z);
        const pa = scope.projectionA ? w2s(scope.projectionA.x, scope.projectionA.z) : fa;
        const pb = scope.projectionB ? w2s(scope.projectionB.x, scope.projectionB.z) : fb;
        const alpha = subdued ? 0.055 : 0.105;
        ctx.save();
        ctx.setLineDash([]);
        if (scope.projectionA && scope.projectionB) {
            ctx.fillStyle = debug ? `rgba(34, 197, 94, ${alpha})` : `rgba(34, 197, 94, ${alpha * 0.65})`;
            ctx.beginPath();
            ctx.moveTo(pa.sx, pa.sy);
            ctx.lineTo(pb.sx, pb.sy);
            ctx.lineTo(fb.sx, fb.sy);
            ctx.lineTo(fa.sx, fa.sy);
            ctx.closePath();
            ctx.fill();
        }
        // §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300) — the CUT zone wash follows the brand.
        // The projection zone above stays GREEN on purpose: it encodes a different fact
        // ("what projects into this view"), and collapsing both to one hue deletes it.
        ctx.fillStyle = debug ? `rgba(59, 130, 246, ${alpha})` : cropZoneFill(alpha);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.lineTo(pa.sx, pa.sy);
        ctx.closePath();
        ctx.fill();
        if (debug) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Returns screen-space positions of the left and right width handles
     * (midpoints of the left and right sides of the scope rectangle).
     */
    private _scopeWidthHandleScreenPoints(
        ann: AnnotationElement,
        w2s: PlanWorldToScreen,
    ): { left: { sx: number; sy: number }; right: { sx: number; sy: number } } | null {
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const viewDef = linkedViewId ? viewDefinitionStore.get(linkedViewId) : undefined;
        if (!viewDef) return null;
        const scope = this._scopeWorld(ann, viewDef);
        if (!scope) return null;
        const a  = w2s(scope.a.x,   scope.a.z);
        const fa = w2s(scope.farA.x, scope.farA.z);
        const b  = w2s(scope.b.x,   scope.b.z);
        const fb = w2s(scope.farB.x, scope.farB.z);
        return {
            left:  { sx: (a.sx  + fa.sx) / 2, sy: (a.sy  + fa.sy) / 2 },
            right: { sx: (b.sx  + fb.sx) / 2, sy: (b.sy  + fb.sy) / 2 },
        };
    }

    private _hitSectionMark(ann: AnnotationElement, sx: number, sy: number, w2s: PlanWorldToScreen, thresholdPx: number): boolean {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return false;
        const a = w2s(pts[0].x, pts[0].z);
        const b = w2s(pts[1].x, pts[1].z);
        return distanceToSegment(sx, sy, a.sx, a.sy, b.sx, b.sy) <= thresholdPx ||
            Math.hypot(sx - a.sx, sy - a.sy) <= thresholdPx + 8 ||
            Math.hypot(sx - b.sx, sy - b.sy) <= thresholdPx + 8;
    }

    // ── E-2: Slope Dimension ──────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = pointA (lower / start)
    // geometry2D.modelPoints[1] = pointB (upper / end)
    // parameters.slopeRatio:   number  (rise/run, e.g. 0.25 = 1:4)
    // parameters.slopePercent: number  (e.g. 25 for 25%)
    // parameters.unit:         'ratio'|'percent'|'degrees'

    private _renderSlopeDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = w2s(pts[0].x, pts[0].z);
        const sB = w2s(pts[1].x, pts[1].z);

        const lineColor = style.lineColor ?? DIM_LINE_COLOR;
        const textPx    = Math.max(9, mmToPx(style.textSizeMm));

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = Math.max(0.8, mmToPx(style.lineWeight) * 0.5);
        ctx.setLineDash([]);
        ctx.fillStyle   = lineColor;

        // Main inclined line A → B
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();

        // Arrowhead at B pointing from A to B
        const dx = sB.sx - sA.sx, dy = sB.sy - sA.sy;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
            drawArrowTip(ctx, sB, { x: dx / len, y: dy / len }, ARROW_PX);
        }

        // Rise/run indicator: small horizontal baseline from A + vertical rise at B
        const baseLen = Math.max(10, Math.abs(dx) * 0.3);
        ctx.lineWidth = 0.75;
        // horizontal from A
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sA.sx + baseLen, sA.sy);
        ctx.stroke();
        // vertical at A+baseLen to sA.sy - abs(dy)*0.3
        const riseLen = Math.max(6, Math.abs(dy) * 0.3);
        ctx.beginPath();
        ctx.moveTo(sA.sx + baseLen, sA.sy);
        ctx.lineTo(sA.sx + baseLen, sA.sy - riseLen);
        ctx.stroke();
        // Small right-angle tick mark
        const tick = 4;
        ctx.beginPath();
        ctx.moveTo(sA.sx + baseLen - tick, sA.sy);
        ctx.lineTo(sA.sx + baseLen - tick, sA.sy - tick);
        ctx.lineTo(sA.sx + baseLen, sA.sy - tick);
        ctx.stroke();

        // Label
        const unit  = (ann.parameters.unit as string | undefined) ?? 'ratio';
        const ratio = (ann.parameters.slopeRatio as number | undefined) ?? 0;
        const pct   = (ann.parameters.slopePercent as number | undefined) ?? ratio * 100;

        let label: string;
        if (unit === 'percent') {
            label = `${pct.toFixed(1)}%`;
        } else if (unit === 'degrees') {
            label = `${(Math.atan(ratio) * 180 / Math.PI).toFixed(1)}°`;
        } else {
            const run = ratio > 0 ? Math.round(1 / ratio) : 0;
            label = run > 0 ? `1:${run}` : `${ratio.toFixed(3)}`;
        }

        const midSx = (sA.sx + sB.sx) * 0.5;
        const midSy = (sA.sy + sB.sy) * 0.5 - 10;
        ctx.font = `${textPx}px ${FONT}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(midSx - tw * 0.5 - 3, midSy - textPx * 0.5 - 2, tw + 6, textPx + 4);
        ctx.fillStyle = lineColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midSx, midSy);

        ctx.restore();
    }

    // ── E-4a: Callout Detail ──────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = top-left corner   [1] = bottom-right corner
    // parameters.detailViewId: string  (linked detail view)
    // parameters.calloutLabel: string  (e.g. "1/A2")

    private _renderCalloutDetail(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = w2s(pts[0].x, pts[0].z);
        const sB = w2s(pts[1].x, pts[1].z);

        const rx = Math.min(sA.sx, sB.sx);
        const ry = Math.min(sA.sy, sB.sy);
        const rw = Math.abs(sB.sx - sA.sx);
        const rh = Math.abs(sB.sy - sA.sy);

        const lineColor = style.lineColor ?? DIM_LINE_COLOR;
        const textPx    = Math.max(8, mmToPx(style.textSizeMm) * 0.85);
        const label     = (ann.parameters.calloutLabel ?? ann.parameters.detailViewId ?? '') as string;

        ctx.save();

        // Dashed rectangle (crop region boundary)
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 1;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.stroke();
        ctx.setLineDash([]);

        // Corner ticks (solid)
        const tic = 6;
        ctx.lineWidth = 1.5;
        for (const [cx, cy] of [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]] as [number, number][]) {
            const tx = cx === rx ? 1 : -1;
            const ty = cy === ry ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + tx * tic, cy);
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx, cy + ty * tic);
            ctx.stroke();
        }

        // Callout bubble (round rect at top-right corner)
        if (label) {
            const bPad = 3;
            ctx.font = `bold ${textPx}px ${FONT}`;
            const tw  = ctx.measureText(label).width;
            const bw  = tw + bPad * 2;
            const bh  = textPx + bPad * 2;
            const bx  = rx + rw - bw;
            const by  = ry - bh - 2;

            ctx.fillStyle   = 'rgba(255,255,255,0.92)';
            ctx.strokeStyle = lineColor;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3);
            else ctx.rect(bx, by, bw, bh);
            ctx.fill(); ctx.stroke();

            // Leader line from bubble corner to callout rect corner
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(bx + bw * 0.5, by + bh);
            ctx.lineTo(rx + rw, ry);
            ctx.stroke();

            ctx.fillStyle    = lineColor;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bx + bw * 0.5, by + bh * 0.5);
        }

        ctx.restore();
    }

    // ── E-4b: Revision Cloud ──────────────────────────────────────────────────
    // geometry2D.modelPoints — polygon vertices
    // parameters.revisionCode: string  (e.g. "A")
    // parameters.note:         string

    private _renderRevisionCloud(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 3) return;

        const sPts = pts.map(p => w2s(p.x, p.z));

        const lineColor = style.lineColor ?? '#d97706';
        const textPx    = Math.max(8, mmToPx(style.textSizeMm) * 0.85);
        const ARC_R     = 8;  // arc bump radius in px

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 1.2;
        ctx.setLineDash([]);

        // Draw scalloped cloud outline: each segment uses one or more arc bumps
        ctx.beginPath();
        for (let i = 0; i < sPts.length; i++) {
            const pA  = sPts[i];
            const pB  = sPts[(i + 1) % sPts.length];
            const sdx = pB.sx - pA.sx;
            const sdy = pB.sy - pA.sy;
            const segLen = Math.hypot(sdx, sdy);
            if (segLen < 0.5) continue;

            const arcCount = Math.max(1, Math.round(segLen / (ARC_R * 2)));
            const ux = sdx / segLen, uy = sdy / segLen;
            const nx = -uy,         ny =  ux;  // outward normal

            for (let a = 0; a < arcCount; a++) {
                const t0 = a       / arcCount;
                const t1 = (a + 1) / arcCount;
                const mx = pA.sx + sdx * (t0 + t1) * 0.5;
                const my = pA.sy + sdy * (t0 + t1) * 0.5;
                const cx = mx + nx * ARC_R * 0.5;
                const cy = my + ny * ARC_R * 0.5;
                const angA = Math.atan2(pA.sy + sdy * t0 - cy, pA.sx + sdx * t0 - cx);
                const angB = Math.atan2(pA.sy + sdy * t1 - cy, pA.sx + sdx * t1 - cx);
                ctx.arc(cx, cy, ARC_R * 0.7, angA, angB, false);
            }
        }
        ctx.stroke();

        // Optional label at centroid
        const revCode = (ann.parameters.revisionCode as string | undefined) ?? '';
        if (revCode) {
            const cx = sPts.reduce((s, p) => s + p.sx, 0) / sPts.length;
            const cy = sPts.reduce((s, p) => s + p.sy, 0) / sPts.length;
            const tw = ctx.measureText(revCode).width;
            ctx.font      = `bold ${textPx}px ${FONT}`;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(cx - tw * 0.5 - 3, cy - textPx * 0.5 - 2, tw + 6, textPx + 4);
            ctx.fillStyle    = lineColor;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(revCode, cx, cy);
        }

        ctx.restore();
    }

    // ── E-5a: Roof Slope Arrow ────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = centroid (arrow base)
    // geometry2D.modelPoints[1] = optional direction point (tail)
    // parameters.slopeRatio:   number  (rise/run)
    // parameters.slopePercent: number

    private _renderRoofSlopeArrow(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 1) return;

        const sC  = w2s(pts[0].x, pts[0].z);
        const sD  = pts.length >= 2 ? w2s(pts[1].x, pts[1].z) : null;

        const lineColor = style.lineColor ?? DIM_LINE_COLOR;
        const textPx    = Math.max(9, mmToPx(style.textSizeMm));

        const ARROW_LEN = 40;

        // Arrow direction: toward sD if available, else pointing "up" (negative Y = screen up)
        let ang = -Math.PI / 2;
        if (sD) {
            const dx = sD.sx - sC.sx, dy = sD.sy - sC.sy;
            if (Math.hypot(dx, dy) > 1) ang = Math.atan2(dy, dx);
        }

        const tipX = sC.sx + Math.cos(ang) * ARROW_LEN;
        const tipY = sC.sy + Math.sin(ang) * ARROW_LEN;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.fillStyle   = lineColor;
        ctx.lineWidth   = 1.5;

        ctx.beginPath();
        ctx.moveTo(sC.sx, sC.sy);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        drawArrowTip(ctx, { sx: tipX, sy: tipY }, { x: Math.cos(ang), y: Math.sin(ang) }, ARROW_PX);

        // Tick mark perpendicular at base
        const px = Math.cos(ang + Math.PI / 2) * 6;
        const py = Math.sin(ang + Math.PI / 2) * 6;
        ctx.beginPath();
        ctx.moveTo(sC.sx - px, sC.sy - py);
        ctx.lineTo(sC.sx + px, sC.sy + py);
        ctx.stroke();

        // Slope label
        const ratio = (ann.parameters.slopeRatio   as number | undefined) ?? 0;
        const pct   = (ann.parameters.slopePercent  as number | undefined) ?? ratio * 100;
        const label = pct > 0 ? `${pct.toFixed(0)}%` : ratio > 0 ? `1:${Math.round(1 / ratio)}` : '';

        if (label) {
            const lx = sC.sx + Math.cos(ang) * ARROW_LEN * 0.5 + Math.cos(ang + Math.PI / 2) * 10;
            const ly = sC.sy + Math.sin(ang) * ARROW_LEN * 0.5 + Math.sin(ang + Math.PI / 2) * 10;
            ctx.font = `${textPx}px ${FONT}`;
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            ctx.fillRect(lx - tw * 0.5 - 2, ly - textPx * 0.5 - 2, tw + 4, textPx + 4);
            ctx.fillStyle    = lineColor;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, lx, ly);
        }

        ctx.restore();
    }

    // ── E-5b: Level Datum Line ────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = left end   [1] = right end
    // parameters.elevation: number (metres)
    // parameters.unit: 'm'|'mm' (default 'm')

    private _renderLevelDatumLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = w2s(pts[0].x, pts[0].z);
        const sB = w2s(pts[1].x, pts[1].z);

        const lineColor = style.lineColor ?? DIM_LINE_COLOR;
        const textPx    = Math.max(9, mmToPx(style.textSizeMm));
        const elev      = (ann.parameters.elevation as number | undefined) ?? 0;
        const unit      = (ann.parameters.unit as string | undefined) ?? 'm';
        const label     = unit === 'mm' ? `${(elev * 1000).toFixed(0)} mm` : `${elev.toFixed(3)} m`;

        ctx.save();

        // Horizontal datum line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 1.2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();

        // Triangle datum symbol at left end (pointing down)
        const TRI = 8;
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sA.sx - TRI, sA.sy - TRI);
        ctx.lineTo(sA.sx + TRI, sA.sy - TRI);
        ctx.closePath();
        ctx.fill();

        // Elevation label just left of triangle
        ctx.font         = `${textPx}px ${FONT}`;
        ctx.fillStyle    = lineColor;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        const pad = 5;
        const tw  = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(sA.sx - TRI - tw - pad * 2, sA.sy - textPx * 0.5 - 2, tw + pad * 2, textPx + 4);
        ctx.fillStyle = lineColor;
        ctx.fillText(label, sA.sx - TRI - pad, sA.sy);

        ctx.restore();
    }

    // ── E-5c: Section Grid Line ───────────────────────────────────────────────
    // geometry2D.modelPoints[0] = bottom   [1] = top
    // parameters.label: string (grid designator, e.g. "A" or "1")

    private _renderSectionGridLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sBot = w2s(pts[0].x, pts[0].z);
        const sTop = w2s(pts[1].x, pts[1].z);

        const lineColor = style.lineColor ?? GRID_COLOR;
        const textPx    = Math.max(8, mmToPx(style.textSizeMm) * 0.85);
        const label     = (ann.parameters.label ?? ann.parameters.name ?? '') as string;
        const BUBBLE_R  = 11;

        ctx.save();

        // Vertical grid line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 0.75;
        ctx.setLineDash([10, 4]);
        ctx.beginPath();
        ctx.moveTo(sBot.sx, sBot.sy);
        ctx.lineTo(sTop.sx, sTop.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Grid bubble at top
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        ctx.arc(sTop.sx, sTop.sy - BUBBLE_R - 2, BUBBLE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (label) {
            ctx.font         = `${textPx}px ${FONT}`;
            ctx.fillStyle    = lineColor;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, sTop.sx, sTop.sy - BUBBLE_R - 2);
        }

        ctx.restore();
    }

    // ── F-1: North Arrow ──────────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = anchor position
    // geometry2D.modelPoints[1] = optional: direction of North in world space
    // parameters.northAngle: number  (rotation in degrees; 0 = up, CW positive)

    private _renderNorthArrow(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 1) return;

        const sAnchor = w2s(pts[0].x, pts[0].z);

        const lineColor = style.lineColor ?? DIM_LINE_COLOR;
        const textPx    = Math.max(10, mmToPx(style.textSizeMm));
        const R         = 20;

        // Rotation: northAngle in degrees (0 = pointing up), convert to radians, flip for screen.
        //
        // §L-430 slice 2d / C34 §1.4 — DIRECTION RESOLVES FROM PROJECT CONTEXT, not a literal.
        // The plan is drawn in the PROJECT-north frame, so "up" on the sheet is project north,
        // not true north. TRUE north therefore sits at −θ on the sheet (the inverse of the
        // project→true rotation), and that is what a north arrow must point at: the arrow is
        // the reader's only cue that the drawing frame is not the world frame.
        //
        // Leaving the old literal in place would have produced a drawing that LOOKS correct and
        // is wrong in the one place a reader trusts absolutely — and wrong silently, since the
        // arrow renders happily either way.
        //
        // MANUAL OVERRIDE (C34 §1.4): honoured ONLY when the annotation explicitly declares
        // `northArrowMode: 'manual'`. A bare `northAngle` is treated as legacy data and ignored
        // in favour of project context, because that is exactly the hard-coded direction the
        // contract forbids. θ = 0 ⇒ identical to the previous behaviour.
        const isManual  = ann.parameters.northArrowMode === 'manual';
        const northDeg  = isManual
            ? ((ann.parameters.northAngle as number | undefined) ?? 0)
            : -(this._projectNorthRad * 180) / Math.PI;
        const northAng  = (-Math.PI / 2) + (northDeg * Math.PI / 180);

        ctx.save();

        // Outer circle
        ctx.fillStyle   = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(sAnchor.sx, sAnchor.sy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Compass needle: filled half (north) and open half (south)
        const tipX   = sAnchor.sx + Math.cos(northAng) * (R - 3);
        const tipY   = sAnchor.sy + Math.sin(northAng) * (R - 3);
        const tailX  = sAnchor.sx + Math.cos(northAng + Math.PI) * (R - 3);
        const tailY  = sAnchor.sy + Math.sin(northAng + Math.PI) * (R - 3);
        const needleW = 4;
        const perpX  = Math.cos(northAng + Math.PI / 2) * needleW;
        const perpY  = Math.sin(northAng + Math.PI / 2) * needleW;

        // Filled north half (dark)
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(sAnchor.sx + perpX, sAnchor.sy + perpY);
        ctx.lineTo(tailX, tailY);
        ctx.lineTo(sAnchor.sx - perpX, sAnchor.sy - perpY);
        ctx.closePath();
        ctx.fill();

        // Hollow south half (white with border)
        ctx.fillStyle   = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(sAnchor.sx + perpX, sAnchor.sy + perpY);
        ctx.lineTo(tailX, tailY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 'N' label just above the tip
        const labelX = sAnchor.sx + Math.cos(northAng) * (R + 12);
        const labelY = sAnchor.sy + Math.sin(northAng) * (R + 12);
        ctx.font         = `bold ${textPx}px ${FONT}`;
        ctx.fillStyle    = lineColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', labelX, labelY);

        ctx.restore();
    }

    // ── F-1: Scale Bar ────────────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = left anchor of scale bar
    // parameters.scale:        number  (e.g. 100 for 1:100)
    // parameters.segmentCount: number  (number of segments, default 4)
    // parameters.unit:         'mm'|'m' (default 'm')
    // parameters.segmentSize:  number  (paper length of each segment in mm, default 20)

    private _renderScaleBar(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 1) return;

        const sA = w2s(pts[0].x, pts[0].z);

        const lineColor    = style.lineColor ?? DIM_LINE_COLOR;
        const textPx       = Math.max(8, mmToPx(style.textSizeMm) * 0.85);
        const scaleDenom   = (ann.parameters.scale        as number | undefined) ?? 100;
        const segments     = Math.max(2, Math.min(8, (ann.parameters.segmentCount as number | undefined) ?? 4));
        const segPaperMm   = (ann.parameters.segmentSize  as number | undefined) ?? 20;
        const unit         = (ann.parameters.unit         as string | undefined) ?? 'm';

        const segPx = mmToPx(segPaperMm);
        const barH  = 6;

        // World distance represented by one segment
        const segWorldM = (segPaperMm / 1000) * scaleDenom;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 0.75;

        for (let i = 0; i < segments; i++) {
            const rx = sA.sx + i * segPx;
            const ry = sA.sy - barH;
            ctx.fillStyle = i % 2 === 0 ? lineColor : 'rgba(255,255,255,0.92)';
            ctx.beginPath();
            ctx.rect(rx, ry, segPx, barH);
            ctx.fill();
            ctx.stroke();
        }

        // Tick labels: 0, each segment boundary, total
        ctx.fillStyle    = lineColor;
        ctx.font         = `${textPx}px ${FONT}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= segments; i++) {
            const tx  = sA.sx + i * segPx;
            const ty  = sA.sy + 2;
            const val = segWorldM * i;
            const lbl = unit === 'mm'
                ? `${(val * 1000).toFixed(0)}`
                : val < 1 ? `${(val * 1000).toFixed(0)} mm` : `${val.toFixed(0)} m`;
            ctx.fillText(lbl, tx, ty);
        }

        // Unit label at top right of bar
        const totalPx = segments * segPx;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`1:${scaleDenom}`, sA.sx + totalPx, sA.sy - barH - 2);

        ctx.restore();
    }

    // ── F-1: Matchline ────────────────────────────────────────────────────────
    // geometry2D.modelPoints[0] = line start   [1] = line end
    // parameters.sheetRef: string (e.g. "A1.01")
    // parameters.label:    string (override; default "MATCH LINE")

    private _renderMatchline(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = w2s(pts[0].x, pts[0].z);
        const sB = w2s(pts[1].x, pts[1].z);

        const lineColor = style.lineColor ?? DIM_LINE_COLOR;
        const textPx    = Math.max(9, mmToPx(style.textSizeMm));
        const sheetRef  = (ann.parameters.sheetRef as string | undefined) ?? '';
        const baseLabel = (ann.parameters.label    as string | undefined) ?? 'MATCH LINE';
        const label     = sheetRef ? `${baseLabel} — ${sheetRef}` : baseLabel;

        ctx.save();

        // Heavy dashed line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 2;
        ctx.setLineDash([16, 6]);
        ctx.beginPath();
        ctx.moveTo(sA.sx, sA.sy);
        ctx.lineTo(sB.sx, sB.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Diagonal end caps
        const dx = sB.sx - sA.sx, dy = sB.sy - sA.sy;
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
            const px = (-dy / len) * 8, py = (dx / len) * 8;
            for (const sp of [sA, sB]) {
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(sp.sx + px, sp.sy + py);
                ctx.lineTo(sp.sx - px, sp.sy - py);
                ctx.stroke();
            }
        }

        // Label at midpoint — on a white pill background
        const midSx = (sA.sx + sB.sx) * 0.5;
        const midSy = (sA.sy + sB.sy) * 0.5;
        ctx.font = `bold ${textPx}px ${FONT}`;
        const tw  = ctx.measureText(label).width;
        const pad = 4;
        ctx.fillStyle   = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(midSx - tw * 0.5 - pad, midSy - textPx * 0.5 - pad, tw + pad * 2, textPx + pad * 2, 3);
        else ctx.rect(midSx - tw * 0.5 - pad, midSy - textPx * 0.5 - pad, tw + pad * 2, textPx + pad * 2);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle    = lineColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midSx, midSy);

        ctx.restore();
    }
}

/** Module-level singleton — passed to PlanViewCanvas at construction. */
export const planViewAnnotationRenderer = new PlanViewAnnotationRenderer();
