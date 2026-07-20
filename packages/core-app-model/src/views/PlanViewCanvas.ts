import * as THREE from '@pryzm/renderer-three/three';
import { viewTechnicalDrawingCache } from './ViewTechnicalDrawingCache';
import { planViewAnnotationRenderer } from './PlanViewAnnotationRenderer';
import { annotationStore } from '@pryzm/plugin-annotations';
import { PocheFillBuilder, type PochePolygon } from './PocheFillBuilder';
import { RoomColourSystem } from '@pryzm/room-topology';
// A-1: DrawingSelectionIndex — primary UUID resolution path for hitTest
import { lookupElementUUID } from './DrawingSelectionIndex';
import type { ViewDefinition, ViewCropSettings } from './ViewDefinitionTypes';
// §FIX-ELEVATION-CROP-EXTEND (L-175) — crop-boundary handle drag needs the live
// ViewDefinition (crop region + sectionVolume) to invert screen → region coords.
import { viewDefinitionStore } from './ViewDefinitionStore';
// §FIX-ELEVATION-POCHE (L-119) — poché (solid cut fills) is a CUT-view concept.
// ViewScope.poche is false for elevation/3d, so the façade is never painted black.
import { resolveViewScope, resolveBeyondLineStyle } from './ViewScope';
// Contract 23 §8 — pen weight table (zone/category helpers)
import { categoryFromFlags } from '../drawing/PenWeightTable';
// §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) / C09 §4.6 — the four-zone classifier.
import { drawingZoneFromLayerName, penZoneOf, BEYOND_DASH_PX } from '../drawing/DrawingZone';
// §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) / C09 §4.6.4a — the third pen axis. The projector
// stamps the element TYPE's function on the projected LineSegments; this is where it is read.
import { elementFunctionFrom, ELEMENT_FUNCTION_KEY } from '../drawing/ElementFunction';
import type { PenStyle } from '../drawing/PenWeightTable';
import { SCREEN_PX_PER_MM } from '../drawing/DrawingConstants';
// §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the backing store must have enough DEVICE PIXELS to
// draw the pen table's thinnest pen, or every pen at or below the raster floor collapses onto it
// and the C09 §4.6.4 ladder is invisible on screen. The PENS ARE CORRECT; the rasteriser was not.
import { resolveCanvasRenderScale, minStrokePx, dashScale } from '../drawing/CanvasRenderScale';
// Contract 23 §7 — GraphicsRulesEngine: resolveStyle() replaces direct resolvePen() calls
import { graphicsRulesEngine } from '../drawing/GraphicsRulesEngine';
// Contract 23 §3 (Day 3-4) — centralised poche fill table
// §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — + the per-construction-layer tone spread.
import { ISO_CUT_LAYER_TO_POCHE_FILL, resolveWallLayerPocheFill } from '../drawing/PocheFillTable';
// Contract 23 §9 (Day 9) — VGGovernanceStore view overrides → GraphicsRulesEngine injection
import { vgGovernanceStore } from '../presentation/VGGovernanceStore';
// Contract 23 §14 — Worker Thread Pipeline (Stage 1)
import { drawingPipelineOrchestrator } from '../drawing/DrawingPipelineOrchestrator';
import type { PipelineResult } from '../drawing/DrawingPipelineTypes';
// Contract 25a Phase 3 — Symbolic Rule Renderer (door swing, window cased)
import {
    renderSymbol,
    symbolicRuleForLayer,
    type SymbolSegment,
    type SymbolPen,
} from '../drawing/SymbolicRuleRenderer';
// Contract 25a Phase 3 — HatchPatternLibrary for intent-based fill rendering
import { getHatchPattern } from '../drawing/HatchPatternLibrary';
// Contract 25a Phase 3 — Intent stores for appearance resolution
import { visibilityIntentStore } from '../presentation/VisibilityIntentStore';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
import { resolveIntentStyle } from '../presentation/IntentRuleResolver';
import { getDefaultSystemIntentId } from '../presentation/SystemIntents';
import { floorPlanUnderlayRef } from './FloorPlanUnderlayRef';
// Phase L — Lighting plan symbol overlay (placed fixtures)
import { renderLightingSymbols } from './symbols/LightingPlanSymbolRenderer';

export const DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM = 30;
export const MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM = 3;

// §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — `MAX_PLAN_VIEW_CANVAS_DPR = 4` LIVED HERE. It is now
// `MAX_BACKING_SCALE` in `drawing/CanvasRenderScale.ts`, beside the floor it bounds and beside
// the pen table it is derived against. It is the SAME NUMBER and the same policy: this canvas has
// always been allowed to rasterise at 4×. Two call sites in this file (`render()` and the
// worker-result renderer) each re-derived the scale AND the floor from `devicePixelRatio`, and
// each got the floor wrong in the same way. There is now ONE resolver, and nobody re-derives it.

const ISO_LAYER_TO_VG_CATEGORY: Readonly<Record<string, string>> = {
    'A-WALL': 'wall',
    'A-FLOR': 'slab',
    'A-COLS': 'column',
    'A-BEAM': 'beam',
    'A-DOOR': 'door',
    'A-GLAZ': 'window',
    'A-STRS': 'stair',
    'A-ROOF': 'roof',
    'A-FURN': 'furniture',
    'A-PLMB': 'plumbing',
    'A-CEIL': 'ceiling',
    'A-GRID': 'grid',
    'A-LEVL': 'level',
};

// ISO_CUT_LAYER_TO_POCHE_FILL is imported from ../drawing/PocheFillTable (Contract 23 §3)

/**
 * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P5 — the VG "normal" line weight.
 *
 * `VGGovernanceStore.BUILT_IN_DEFAULT.lineWeight` is 1; the built-in templates
 * emphasise structure relative to it (wall = 2, column = 2). The VG weight is
 * therefore a RELATIVE emphasis index, NOT a pixel width and NOT a millimetre
 * width — dividing by this base turns it into the factor it always was, so it
 * can multiply (rather than obliterate) the Contract-23 §8 pen width.
 */
const VG_BASE_LINE_WEIGHT = 1;

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

export interface PlanViewCanvasStyle {
    visible: boolean;
    edgeColor?: string | null;
    fillColor?: string | null;
    fillPattern?: string | null;
    lineWeight?: number | null;
    transparency?: number | null;
}

/**
 * §L-431 slice 2 — SITE CONTEXT for the Canvas2D plan projection: the committed C19 parcel
 * ring and the C58 buildable-envelope inset ring, in WORLD plan-XZ metres.
 *
 * LAYERING (why this is injected, not imported): `PlanViewCanvas` lives in
 * `packages/core-app-model` (a LOWER layer) while the parcel/envelope live in the app layer
 * (`siteDispatch`). A lower layer may never import from a higher one, so the app layer PUSHES
 * this data in via a provider callback — exactly the pattern `styleResolver` already uses.
 * The canvas stays a pure renderer with no knowledge of the site subsystem.
 */
export interface PlanSiteContext {
    /** Committed parcel boundary ring (world XZ metres), or null when none. */
    readonly parcelRing: ReadonlyArray<{ x: number; z: number }> | null;
    /** Buildable-envelope inset ring (world XZ metres), or null when no valid envelope. */
    readonly envelopeRing: ReadonlyArray<{ x: number; z: number }> | null;
    /**
     * §L-430 slice 2d — θ (project→true north, radians) from `SiteLocation.trueNorth`.
     * Carried on the SAME provider as the rings because it is the same site read; keeping it
     * here means the plan pane cannot draw site geometry in one frame and annotate it with
     * another. Consumed by the north arrow (C34 §1.4). 0 / absent ⇒ identity.
     */
    readonly projectNorthRad?: number;
}

export interface PlanViewCanvasOptions {
    gridVisible?: boolean;
    styleResolver?: (category: string, layerTag: string) => PlanViewCanvasStyle | null;
    /** §L-431 — provider for the parcel + envelope site-context rings (see PlanSiteContext). */
    siteContextProvider?: () => PlanSiteContext | null;
}

export interface PlanViewCanvasRenderOptions {
    activeLinkedViewId?: string | null;
}

export class PlanViewCanvas {
    private readonly _canvas: HTMLCanvasElement;
    private readonly _ctx: CanvasRenderingContext2D;
    private readonly _styleResolver: ((category: string, layerTag: string) => PlanViewCanvasStyle | null) | null;
    /** §L-431 — injected site-context provider (parcel + envelope rings). See PlanSiteContext. */
    private readonly _siteContextProvider: (() => PlanSiteContext | null) | null;
    private _frustumH = DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM;
    private _camTarget = new THREE.Vector3();
    private _gridVisible = true;
    private _cssW = 0;
    private _cssH = 0;
    private _lastViewId: string | null = null;
    private _disposed = false;
    private _snapIndicator: { sx: number; sy: number } | null = null;
    private _levelId: string | null = null;
    private _viewType: string = 'plan';
    private _hWorldAxis: 'x' | 'z' = 'x';
    private _hWorldSign: 1 | -1 = 1;
    private _sectionFlipV: boolean = false;
    /** Phase 3 (Sprint 2): UUID of the element the cursor is hovering over, or null. */
    private _hoveredElementId: string | null = null;

    /** Cached HTMLImageElement for the floor plan underlay, keyed by blobUrl. */
    private _underlayImage: HTMLImageElement | null = null;
    private _underlayImageUrl: string | null = null;

    /** Currently selected grid ID for highlighting + dimension rendering. */
    private _selectedGridId: string | null = null;

    /** Cached hit-areas for grid dimension labels, rebuilt each render pass. */
    private _gridDimHitAreas: Array<{
        gridId: string;
        targetPosition: number;
        labelSx: number; labelSy: number;
        labelW: number;  labelH: number;
    }> = [];

    /** Currently selected level ID for section/elevation view highlighting. */
    private _selectedLevelId: string | null = null;

    /** Cached hit-areas for level datum lines + heads, rebuilt each render pass. */
    private _levelDatumHitAreas: Array<{
        levelId:      string;
        elevation:    number;
        lineSy:       number;
        lineLeftSx:   number;
        lineRightSx:  number;
        headCx:       number;
        headCy:       number;
        headR:        number;
    }> = [];

    /**
     * Contract 23 §14 — latest PipelineResult from the worker, keyed by viewId.
     * Set by scheduleWorkerRender() when the worker returns.  renderFromPipelineResult()
     * draws from this cache on the next animation frame.
     */
    private _pipelineCache = new Map<string, PipelineResult>();

    /**
     * Contract 23 §14 — generation counter per viewId for worker render requests.
     * Prevents stale results from overwriting newer ones when requests are in-flight.
     */
    private _workerGeneration = new Map<string, number>();

    constructor(canvas: HTMLCanvasElement, options: PlanViewCanvasOptions = {}) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('[PlanViewCanvas] Failed to get Canvas2D context');
        this._canvas = canvas;
        this._ctx = ctx;
        this._styleResolver = options.styleResolver ?? null;
        this._siteContextProvider = options.siteContextProvider ?? null;
        this._gridVisible = options.gridVisible ?? true;
    }

    /**
     * §L-436 — the current site-context rings (parcel + buildable-envelope setback line), or
     * null. Exposed so `PlanSnapEngine` can offer them as snap targets in the PLAN pane.
     *
     * WHY THIS EXISTS: the plan pane snaps through `PlanSnapEngine`, an ENTIRELY separate
     * system from the 3D `SnapManager` that L-432's `SiteContextSnapProvider` plugs into — so
     * site snapping worked in 3D and silently did nothing in plan. Reading through the canvas
     * (which already owns the provider) keeps ONE source for the rings that are DRAWN and the
     * rings that are SNAPPED TO; two readers could disagree.
     */
    getSiteContextRings(): PlanSiteContext | null {
        try {
            return this._siteContextProvider?.() ?? null;
        } catch {
            return null;
        }
    }

    setLevelId(levelId: string | null): void {
        this._levelId = levelId;
    }

    setViewType(viewType: string): void {
        this._viewType = viewType;
    }

    /**
     * Configure the world-space axes used for Canvas2D projection.
     * Must be called for section and elevation views so that the correct
     * world axes (X horizontal + Y vertical, flipped) are used instead of
     * the plan-view default (X horizontal + Z vertical, not flipped).
     *
     * @param hAxis   Which world axis maps to screen X: 'x' for front/back
     *                sections, 'z' for left/right sections.
     * @param flipV   When true the vertical axis is world Y (height), mapped
     *                so that higher world Y = higher on screen (lower sy).
     *                Always true for section/elevation views.
     */
    setSectionAxes(hAxis: 'x' | 'z', flipV: boolean, hSign: 1 | -1 = 1): void {
        this._hWorldAxis = hAxis;
        this._sectionFlipV = flipV;
        this._hWorldSign = hSign;
    }

    /**
     * §FIX-TAG-DRAG-2D (L-291c) — the canvas's (H, V) PLANE, published.
     *
     * `screenToWorld()` returns its result in `{worldX, worldZ}` — PLAN names for what are, in
     * a vertical view, the H and V axes. Anything that consumes a screen DELTA and writes a
     * world point must therefore know which plane it is in, or it will silently write the plan
     * axes: that is exactly how the tag drag came to move a tag in world Z (the invisible depth
     * axis) when the user dragged it UP an elevation, leaving world Y — the axis they could
     * see — untouched. The plane is not a secret; it is published here so no consumer has to
     * assume `plan` and be wrong.
     */
    viewPlaneFrame(): { isVertical: boolean; hWorldAxis: 'x' | 'z'; hSign: 1 | -1 } {
        return {
            isVertical: this._viewType === 'section'
                || this._viewType === 'elevation'
                || this._viewType === 'building-elevation',
            hWorldAxis: this._hWorldAxis,
            hSign: this._hWorldSign,
        };
    }

    private _vertexToHV(v: THREE.Vector3): { h: number; vert: number } {
        return {
            h:    this._worldPointToCanvasH(v.x, v.z),
            vert: this._sectionFlipV       ? v.y : v.z,
        };
    }

    private _worldHToCanvasH(value: number): number {
        return this._sectionFlipV ? this._hWorldSign * value : value;
    }

    private _worldPointToCanvasH(x: number, z: number): number {
        return this._worldHToCanvasH(this._hWorldAxis === 'x' ? x : z);
    }

    render(viewDef: ViewDefinition, options: PlanViewCanvasRenderOptions = {}): void {
        if (this._disposed) return;
        const viewId = viewDef.id;
        this._lastViewId = viewId;

        // Contract 23 §9 — Sync VGGovernanceStore per-view category overrides into
        // GraphicsRulesEngine before every render so resolveStyle() returns correct values.
        this._syncVGViewOverrides(viewDef);
        const w = this._cssW || this._canvas.clientWidth;
        const h = this._cssH || this._canvas.clientHeight;
        if (w <= 0 || h <= 0) return;

        this.setSize(w, h);

        // §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — render into a backing store big enough to
        // DRAW the pen table, not merely big enough to match the display. See CanvasRenderScale.
        const scale = resolveCanvasRenderScale(window.devicePixelRatio);
        const ctx = this._ctx;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        if (this._gridVisible) this._drawGrid(ctx, w, h);

        const isPlanLike = this._viewType === 'plan' || this._viewType === 'structural-plan' ||
                           this._viewType === 'ceiling-plan' || this._viewType === 'detail';

        const cropClipApplied = this._applyCropClip(ctx, viewDef);
        if (isPlanLike) this._drawUnderlay(ctx);
        if (isPlanLike) this._renderRoomFills(ctx);
        // §L-431 slice 2 — site context (parcel + buildable envelope) UNDER the datums/elements
        // so model linework always reads on top of the reference rings.
        if (isPlanLike) this._renderSiteContext(ctx);
        if (isPlanLike) this._renderBimGridDatums(ctx, viewDef);
        if (!isPlanLike && this._sectionFlipV) this._renderLevelDatums(ctx);

        const drawing = viewTechnicalDrawingCache.get(viewId);
        if (!drawing) {
            if (cropClipApplied) ctx.restore();
            ctx.fillStyle = 'rgba(100,100,100,0.55)';
            ctx.font = '13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const placeholderText = isPlanLike
                ? 'Add walls to see the floor plan'
                : 'Generating view…';
            ctx.fillText(placeholderText, w / 2, h / 2);
            return;
        }

        // §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — `hairline` used to mean TWO things at once
        // (the minimum stroke width AND the dash-pattern scale), which is why the flattened
        // ladder could not be fixed in place. They are now separate and answer to different
        // things: the stroke floor is ONE DEVICE PIXEL of the BACKING STORE (the thinnest mark
        // the rasteriser can physically make); the dash scale still follows the DISPLAY's ratio,
        // exactly as before, so every dash in the drawing looks identical to yesterday's.
        const hairline = minStrokePx(scale);
        const dashPxScale = dashScale(window.devicePixelRatio);

        // §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) / C09 §4.6.4d — how THIS view draws the `beyond`
        // zone. Resolved ONCE, here, through the one resolver (the view's own override beats its
        // TYPE's default — elevation/section 'dashed', plan 'solid'), and handed to the pen engine
        // as a resolved ANSWER. The canvas must not ask "is this an elevation?" and neither must
        // the engine: that scattered `viewType ===` branching is exactly what ViewScope abolished.
        const _beyondLineStyle = resolveBeyondLineStyle(viewDef.output, resolveViewScope(this._viewType));

        // §FIX-ELEVATION-POCHE (L-119) — only CUT-family views (plan / section) get
        // poché solid fills. Elevations are pure line drawings; running the poché pass
        // for them painted every façade cut layer solid black over the linework.
        if (resolveViewScope(this._viewType).poche) {
            this._renderPocheFills(ctx, drawing, viewDef);
        }

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;
            const layerTag = [
                child.userData?.layerName,
                child.name,
                child.parent?.userData?.layerName,
                child.parent?.name,
            ].filter(Boolean).join(' ');
            // §DOOR-WINDOW-PLAN-FRAME (2026-05-22): accept BOTH the legacy
            // colon convention (`A-WALL:cut`) and the hyphenated ISO sub-layer
            // convention emitted by the hosted-element symbol builders
            // (`A-DOOR-CUT`, `A-GLAZ-CUT`). Previously `/:cut$/` only matched
            // the colon form, so door/window frame jambs — authored on the
            // `-CUT` sub-layer to be drawn HEAVY as a section cut — were
            // mis-classified as projection zone and rendered with light pen
            // weight, so the "section cut frame" never read as a frame.
            //
            // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — THE ZONE IS NAMED, NOT INFERRED FROM
            // TWO BOOLEANS. This was `penZoneFromFlags(isCut, isBeyond)`: two booleans, three
            // reachable answers — so **`HIDDEN` was structurally unreachable at the one place
            // in the product that paints a line.** Even a correctly-produced `:hidden` layer
            // would have been classified `PROJECTION` and drawn SOLID. That is why occlusion
            // had to be dumped into `:beyond` (the only zone with a dashed pen) and why
            // "far" therefore rendered as "hidden". The zone now comes from the canonical
            // `DrawingZone` classifier and all four zones reach the pen table.
            const _zone = drawingZoneFromLayerName(layerTag) ?? 'projection';
            const isWall = /A-WALL|wall/i.test(layerTag);
            const isDoor = /A-DOOR|door/i.test(layerTag);
            const isSlab = /A-FLOR|slab/i.test(layerTag);
            const isCol = /A-COLS|column|beam/i.test(layerTag);
            const isStair = /A-STRS|stair/i.test(layerTag);
            const isRoof = /A-ROOF|roof/i.test(layerTag);
            const isCeiling = /A-CEIL|ceiling/i.test(layerTag);
            const isFurniture = /A-FURN|furniture/i.test(layerTag);
            const isHandrail = /A-HRAL|handrail/i.test(layerTag);
            const isWindow = /A-GLAZ|window/i.test(layerTag);

            const vgCat = this._vgCategoryForLayer(layerTag);
            let vgEdge: string | null = null;
            let vgLineWeight: number | null = null;
            if (vgCat && this._styleResolver) {
                const resolved = this._styleResolver(vgCat, layerTag);
                if (resolved && !resolved.visible) return;
                vgEdge = resolved?.edgeColor ?? null;
                vgLineWeight = resolved?.lineWeight ?? null;
            }
            // Contract 23 §7 — GraphicsRulesEngine.resolveStyle() is the ONLY
            // style entry point.  It layers view/element overrides on top of the
            // locked SYSTEM_PEN_TABLE values from PenWeightTable.resolvePen().
            const _penZone     = penZoneOf(_zone);
            const _penCategory = categoryFromFlags({ isWall, isDoor, isSlab, isCol, isStair, isRoof, isCeiling, isFurniture, isHandrail, isWindow });
            const _elementId   = child.userData?.elementUUID as string | undefined;
            // §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — the THIRD pen axis, read from the
            // stamp `EdgeProjectorService` put on this LineSegments. It is the element TYPE's
            // ISO 13567 / Revit FUNCTION — never its thickness (a 300 mm acoustic partition is
            // INTERIOR; a thin infill panel is EXTERIOR). An unstamped element resolves `null`
            // and is unmodulated, i.e. draws exactly as it did before L-285.
            const _elementFunction = elementFunctionFrom(child.userData?.[ELEMENT_FUNCTION_KEY]);
            const _pen = graphicsRulesEngine.resolveStyle(_penZone, _penCategory, {
                viewId:    viewId,
                elementId: _elementId,
                viewType:  viewDef.viewType,
                elementFunction: _elementFunction,
                beyondLineStyle: _beyondLineStyle,
            });

            ctx.strokeStyle = vgEdge ?? _pen.color;
            ctx.globalAlpha = _pen.opacity;
            ctx.setLineDash(_pen.dashPx ? _pen.dashPx.map(v => v * dashPxScale) : []);

            // ── §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P5 — LINEWEIGHT HIERARCHY ──
            //
            // ROOT CAUSE of "every plan line renders at the same hairline weight"
            // (founder: image 1 = uniform thin lineweight, no readable cut/projection
            // hierarchy). TWO defects stacked, and BOTH bypassed the Contract-23 §8
            // pen table entirely — so the whole zone × category hierarchy was DEAD on
            // screen, for every element type, not just doors:
            //
            //  1. `material.linewidth` was read as a "VG line weight". THREE's
            //     LineBasicMaterial DEFAULTS `linewidth` to 1 — so EVERY LineSegments
            //     child in the drawing looked like it carried an authored weight of 1.
            //     (Deleted: the drawing's weight authority is the pen table + the VG
            //     override, never a THREE material default. Symbol builders keep their
            //     `userData.lineWeight`/`role` metadata, which is exported to DXF/PDF.)
            //
            //  2. `ctx.lineWidth = vgLineWeight * hairline` treated the VG weight as if
            //     it were PIXELS and OVERWROTE the pen width unconditionally. The VG
            //     resolver ALWAYS returns a weight (BUILT_IN_DEFAULT.lineWeight = 1;
            //     wall = 2), so the pen's `widthMm × SCREEN_PX_PER_MM` was overwritten
            //     on every single line — collapsing 0.50 mm cut and 0.18 mm projection
            //     to `1 × hairline` and `1 × hairline`. Identical. Every time.
            //
            // CORRECT COMPOSITION (Contract 23 §7.1: the pen table is the locked base;
            // VG *layers on top of* it): the PEN decides the physical width in mm per
            // (zone × category); the VG weight is a RELATIVE emphasis factor normalised
            // against its own built-in default (1 = "normal", 2 = "heavier"). A door CUT
            // (0.35 mm) now genuinely outweighs a door PROJECTION (0.18 mm), and a wall
            // CUT (0.50 mm × wall's VG emphasis) outweighs both — which is exactly the
            // hierarchy the founder's reference drawings read by.
            const _penPx    = _pen.widthMm * SCREEN_PX_PER_MM;
            const _vgFactor = (vgLineWeight !== null && Number.isFinite(vgLineWeight) && vgLineWeight > 0)
                ? vgLineWeight / VG_BASE_LINE_WEIGHT
                : 1;
            ctx.lineWidth = Math.max(hairline, _penPx * _vgFactor);

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.miterLimit = 4;

            // ── Phase 3 — Symbolic rendering for door/window in plan view ────────
            //
            // For elements with a registered symbolic rule (A-DOOR → 'plan-door-swing',
            // A-GLAZ → 'plan-window-cased'), delegate the STROKE to SymbolicRuleRenderer
            // (Contract 25a §3.4) instead of the generic beginPath/stroke below.
            //
            // ═══ §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280) — THE PEN-TABLE BYPASS, CLOSED ═══
            //
            // THIS BLOCK USED TO BE A SECOND PEN AUTHORITY. It called `resolveIntentStyle(…,
            // 'projection', …)` — the state HARD-CODED — and handed the resulting appearance to
            // `renderSymbol`, which stroked `appearance.line.weight` straight onto the context,
            // OVERWRITING the `_pen` resolved 40 lines above. Two things died there:
            //
            //   • THE ZONE. `symbolicRuleForLayer()` declines `-CUT` and `-BEYOND`, so the
            //     layers that reached here were `-PROJ` … **and `A-DOOR-HIDDEN` / `A-GLAZ-HIDDEN`
            //     — the layers `applyOcclusion()` DEMOTES onto.** An occluded door frame was
            //     painted SOLID at PROJECTION weight. L-277 named the `hidden` zone, produced it
            //     and gave it a dashed pen; this line then flattened it back to `projection` for
            //     doors and windows, the only two types with symbols. The founder's own
            //     hierarchy, undone at the last mile.
            //
            //   • THE RULE CHAIN. `resolveIntentStyle` is the INTENT tier ALONE (priority 1000).
            //     `graphicsRulesEngine.resolveStyle()` runs that same tier and then layers the
            //     VIEW (9000) and ELEMENT (10000) overrides on top — and it is, per Contract-23
            //     §7.1, THE ONLY SANCTIONED STYLE ENTRY POINT. So per-view and per-element pen
            //     overrides, the VG governance weight factor and the VG edge colour applied to
            //     every line in the drawing EXCEPT door and window symbols.
            //
            // FIX: there is now ONE pen. `_pen` — resolved above from this segment's REAL zone,
            // through the full chain, with the L-285 function axis — is composed with the VG
            // factor and the stroke floor EXACTLY as the generic path composes it (the identical
            // `_penPx * _vgFactor` and `dashPx * dashPxScale` expressions, computed once, above),
            // and handed to the symbol renderer as a finished `SymbolPen`. The renderer can no
            // longer re-decide a weight: it is no longer given the means to.
            const _symbolicRule = symbolicRuleForLayer(layerTag, viewDef.viewType ?? '');
            const count = posAttr.count;

            if (_symbolicRule) {
                // Collect screen-space segments for this LineSegments child.
                const _segs: SymbolSegment[] = [];
                for (let i = 0; i < count - 1; i += 2) {
                    let _shv1: { h: number; vert: number };
                    let _shv2: { h: number; vert: number };
                    if (this._sectionFlipV) {
                        _shv1 = { h: posAttr.getX(i),     vert: -posAttr.getZ(i)     };
                        _shv2 = { h: posAttr.getX(i + 1), vert: -posAttr.getZ(i + 1) };
                    } else {
                        const _sv1 = _tmpV1.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
                        const _sv2 = _tmpV2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                        _shv1 = this._vertexToHV(_sv1);
                        _shv2 = this._vertexToHV(_sv2);
                    }
                    const _sp1 = this.worldToScreen(_shv1.h, _shv1.vert);
                    const _sp2 = this.worldToScreen(_shv2.h, _shv2.vert);
                    _segs.push({ x1: _sp1.sx, y1: _sp1.sy, x2: _sp2.sx, y2: _sp2.sy });
                }

                if (_segs.length > 0) {
                    // The pen the canvas ALREADY resolved — the same values it just wrote onto
                    // the context for the generic path. One resolution, one authority.
                    const _symPen: SymbolPen = {
                        widthPx: ctx.lineWidth,
                        color:   vgEdge ?? _pen.color,
                        dashPx:  _pen.dashPx ? _pen.dashPx.map(v => v * dashPxScale) : null,
                        opacity: _pen.opacity,
                    };
                    renderSymbol(ctx, _symbolicRule, _segs, _symPen);
                    return; // Skip generic rendering for this symbolic element
                }
            }

            // ── Generic segment rendering (non-symbolic path) ─────────────────────
            ctx.beginPath();

            for (let i = 0; i < count - 1; i += 2) {
                let hv1: { h: number; vert: number };
                let hv2: { h: number; vert: number };
                if (this._sectionFlipV) {
                    // OBC TechnicalDrawing.toDrawingSpace() ALWAYS sets the Y component
                    // to 0 (it flattens all geometry onto the drawing XZ plane).  For
                    // elevation/section views, world-Y (height) ends up in drawing-local Z,
                    // negated: posAttr.getZ(i) = –worldY.  Negate it back so that vert
                    // represents true world height, which worldToScreen maps correctly.
                    // drawing-local X is always the horizontal component for all 6
                    // cardinal directions supported by TechnicalDrawing.orientTo().
                    hv1 = { h: posAttr.getX(i),     vert: -posAttr.getZ(i)     };
                    hv2 = { h: posAttr.getX(i + 1), vert: -posAttr.getZ(i + 1) };
                } else {
                    const v1 = _tmpV1.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
                    const v2 = _tmpV2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                    hv1 = this._vertexToHV(v1);
                    hv2 = this._vertexToHV(v2);
                }
                const p1 = this.worldToScreen(hv1.h, hv1.vert);
                const p2 = this.worldToScreen(hv2.h, hv2.vert);
                ctx.moveTo(p1.sx, p1.sy);
                ctx.lineTo(p2.sx, p2.sy);
            }
            ctx.stroke();
        });

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;  // Contract 23 §8 — reset after BEYOND opacity pass

        if (cropClipApplied && !viewDef.crop?.annotationCrop) ctx.restore();

        planViewAnnotationRenderer.render(
            ctx,
            viewId,
            (wx, wz) => this.worldToScreen(wx, wz),
            {
                activeLinkedViewId: options.activeLinkedViewId ?? null,
                viewType:     this._viewType,
                sectionHAxis: (this._hWorldAxis ?? 'x') as 'x' | 'z',
                // §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — the geometry above is
                // projected through _worldPointToCanvasH(), which applies _hWorldSign.
                // Annotations must use the SAME sign, or they are mirrored relative to
                // the elements they annotate on any hSign === -1 elevation.
                hSign:        this._hWorldSign,
                // §L-430 slice 2d — θ for the north arrow (C34 §1.4). The plan is drawn in
                // the PROJECT frame, so the arrow must point at TRUE north (−θ on the sheet).
                // Read from the SAME provider as the site rings, so the pane can never draw
                // site geometry in one frame and annotate it with another.
                projectNorthRad: this._siteContextProvider?.()?.projectNorthRad ?? 0,
            },
        );

        if (cropClipApplied && viewDef.crop?.annotationCrop) ctx.restore();

        // Phase L — overlay placed lighting fixtures as plan symbols, scoped to this view's level.
        this._renderLightingPlanSymbols();

        this._renderCropBoundary(ctx, viewDef);

        // Phase 3 (Sprint 2): Selection and hover highlights rendered on top of linework.
        this._renderSelectionHighlights(ctx, drawing);

        this._drawSnapIndicator(ctx);
    }

    setSnapIndicator(sx: number, sy: number): void {
        this._snapIndicator = { sx, sy };
    }

    clearSnapIndicator(): void {
        this._snapIndicator = null;
    }

    /** Phase 3 (Sprint 2): Called by PlanViewInteraction on every mousemove. */
    setHoveredElementId(id: string | null): void {
        this._hoveredElementId = id;
    }

    /**
     * §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — forward the scope/crop handle
     * currently under the cursor to the annotation renderer, so the selected-mark
     * scope overlay can draw it enlarged + accented (the crop grab affordance).
     * Called by PlanViewInteraction on hover; purely visual (no mutation).
     */
    setHoveredScopeHandle(handle: 'depth' | 'width-left' | 'width-right' | 'cut-plane' | null): void {
        planViewAnnotationRenderer.setHoveredScopeHandle(handle);
    }

    /** Set/clear the selected grid ID — used for highlight + dimension rendering. */
    setSelectedGridId(id: string | null): void {
        this._selectedGridId = id;
    }

    getSelectedGridId(): string | null {
        return this._selectedGridId;
    }

    /** Set/clear the selected level ID — used for highlighting datum lines. */
    setSelectedLevelId(id: string | null): void {
        this._selectedLevelId = id;
    }

    getSelectedLevelId(): string | null {
        return this._selectedLevelId;
    }

    /**
     * Hit-tests the 2D level datum lines drawn by _renderLevelDatums.
     * Returns the level ID whose rendered datum line is closest to (sx, sy), or null.
     */
    hitTestLevel(sx: number, sy: number, thresholdPx = 10): string | null {
        const headHit = this.hitTestLevelHead(sx, sy);
        if (headHit) return headHit.levelId;

        let bestId: string | null = null;
        let bestDist = thresholdPx;
        for (const ha of this._levelDatumHitAreas) {
            const dist = this._distanceToSegment(sx, sy, ha.lineLeftSx, ha.lineSy, ha.lineRightSx, ha.lineSy);
            if (dist < bestDist) {
                bestDist = dist;
                bestId = ha.levelId;
            }
        }
        return bestId;
    }

    /**
     * Hit-tests the level head bubbles (circles at the right end of datum lines).
     * Returns { levelId, elevation } if the cursor is inside/near a head, else null.
     */
    hitTestLevelHead(sx: number, sy: number): { levelId: string; elevation: number } | null {
        for (const ha of this._levelDatumHitAreas) {
            const dist = Math.hypot(sx - ha.headCx, sy - ha.headCy);
            if (dist <= ha.headR + 10) {
                return { levelId: ha.levelId, elevation: ha.elevation };
            }
        }
        return null;
    }

    /**
     * Converts a screen Y coordinate to a world elevation (Y) value.
     * Only valid when _sectionFlipV is true (section/elevation views).
     */
    screenYToElevation(sy: number): number {
        const h = Math.max(this._cssH || this._canvas.clientHeight, 1);
        const fH = this._frustumH;
        return this._camTarget.z + fH - (sy / h) * (2 * fH);
    }

    /**
     * Hit-tests the 2D grid datums drawn by _renderBimGridDatums.
     * Returns the grid ID whose rendered line is closest to (sx, sy) within
     * thresholdPx, or null if none.
     */
    hitTestGrid(sx: number, sy: number, thresholdPx = 10): string | null {
        const bimManager = window.bimManager;
        const grids = bimManager?.getGrids?.();
        if (!Array.isArray(grids) || grids.length === 0) return null;

        let bestId: string | null = null;
        let bestDist = thresholdPx;

        for (const grid of grids) {
            if (!grid?.isVisible) continue;

            const extentMin = Number.isFinite(grid.extentMin) ? grid.extentMin : -100;
            const extentMax = Number.isFinite(grid.extentMax) ? grid.extentMax : 100;

            // §40 §2.2 — Linear-mode grids hit-test against their explicit
            // (startX,startZ)→(endX,endZ) segment, not the legacy axis/position pair.
            let a: { sx: number; sy: number };
            let b: { sx: number; sy: number };
            if (this._isLinearGrid(grid)) {
                a = this.worldToScreen(grid.startX, grid.startZ);
                b = this.worldToScreen(grid.endX,   grid.endZ);
            } else if (grid.axis === 'X') {
                a = this.worldToScreen(grid.position, extentMin);
                b = this.worldToScreen(grid.position, extentMax);
            } else {
                a = this.worldToScreen(extentMin, grid.position);
                b = this.worldToScreen(extentMax, grid.position);
            }

            const dist = this._distanceToSegment(sx, sy, a.sx, a.sy, b.sx, b.sy);
            if (dist < bestDist) {
                bestDist = dist;
                bestId = grid.id;
            }
        }
        return bestId;
    }

    /**
     * Returns the grid dim label hit if the cursor is over one of the cached
     * dimension labels that were rendered in the last _renderBimGridDatums pass.
     * Returns { gridId, targetPosition } so the caller can open an inline editor.
     */
    hitTestGridDim(sx: number, sy: number): { gridId: string; targetPosition: number } | null {
        for (const ha of this._gridDimHitAreas) {
            if (
                sx >= ha.labelSx - ha.labelW / 2 - 4 &&
                sx <= ha.labelSx + ha.labelW / 2 + 4 &&
                sy >= ha.labelSy - ha.labelH / 2 - 4 &&
                sy <= ha.labelSy + ha.labelH / 2 + 4
            ) {
                return { gridId: ha.gridId, targetPosition: ha.targetPosition };
            }
        }
        return null;
    }

    setFrustum(frustumH: number, camTarget: THREE.Vector3): void {
        this._frustumH = Math.max(2, Math.min(200, frustumH));
        this._camTarget.copy(camTarget);
    }

    getFrustumH(): number {
        return this._frustumH;
    }

    getCamTarget(): THREE.Vector3 {
        return this._camTarget.clone();
    }

    setGridVisible(visible: boolean): void {
        this._gridVisible = visible;
    }

    private _renderBimGridDatums(ctx: CanvasRenderingContext2D, viewDef: ViewDefinition): void {
        const bimManager = window.bimManager;
        const grids = bimManager?.getGrids?.();
        if (!Array.isArray(grids) || grids.length === 0) return;

        const cropRegion = viewDef.crop?.enabled ? viewDef.crop?.region : undefined;
        const crop = cropRegion
            ? {
                minX: cropRegion.min[0],
                minZ: cropRegion.min[1],
                maxX: cropRegion.max[0],
                maxZ: cropRegion.max[1],
            }
            : null;

        const selectedId = this._selectedGridId;
        this._gridDimHitAreas = [];

        ctx.save();
        ctx.lineCap = 'round';

        for (const grid of grids) {
            if (!grid?.isVisible) continue;
            const isSelected = grid.id === selectedId;

            const extentMin = Number.isFinite(grid.extentMin) ? grid.extentMin : -100;
            const extentMax = Number.isFinite(grid.extentMax) ? grid.extentMax : 100;
            let a: { sx: number; sy: number };
            let b: { sx: number; sy: number };

            // §40 §2.2 — Linear-mode grids render between their explicit XZ
            // endpoints, ignoring the axis/position/extent fallback. Crop is
            // skipped: free-angle datums are not box-clipped here (renderer
            // contract treats linear grids as full-length until a dedicated
            // segment-rectangle clip is added).
            if (this._isLinearGrid(grid)) {
                a = this.worldToScreen(grid.startX, grid.startZ);
                b = this.worldToScreen(grid.endX,   grid.endZ);
            } else if (grid.axis === 'X') {
                if (crop && (grid.position < crop.minX || grid.position > crop.maxX)) continue;
                const minZ = crop ? Math.max(extentMin, crop.minZ) : extentMin;
                const maxZ = crop ? Math.min(extentMax, crop.maxZ) : extentMax;
                a = this.worldToScreen(grid.position, minZ);
                b = this.worldToScreen(grid.position, maxZ);
            } else {
                if (crop && (grid.position < crop.minZ || grid.position > crop.maxZ)) continue;
                const minX = crop ? Math.max(extentMin, crop.minX) : extentMin;
                const maxX = crop ? Math.min(extentMax, crop.maxX) : extentMax;
                a = this.worldToScreen(minX, grid.position);
                b = this.worldToScreen(maxX, grid.position);
            }

            const lineColor = grid.color ?? (isSelected ? '#7c3aed' : '#4b5563');

            // ── Selection glow ────────────────────────────────────────────────
            if (isSelected) {
                ctx.save();
                ctx.strokeStyle = 'rgba(124,58,237,0.25)';
                ctx.lineWidth = 8;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
                ctx.restore();
            }

            // ── Dashed grid line ──────────────────────────────────────────────
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = isSelected ? 1.6 : 1.1;
            ctx.setLineDash([7, 4]);
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            // ── Bubble at the far (max) endpoint ──────────────────────────────
            this._drawGridBubble(ctx, b.sx, b.sy, grid.name, lineColor, isSelected, grid.isPinned);

            // ── Position label near the near (min) endpoint ───────────────────
            // §40 §2.2 — Linear-mode grids have no single perpendicular
            // "position" that's meaningful, so the X=…/Y=… label is suppressed.
            if (!this._isLinearGrid(grid)) {
                this._drawGridPositionLabel(ctx, a.sx, a.sy, grid.axis, grid.position, lineColor, isSelected);
            }
        }

        // ── Dimension lines for the selected grid ─────────────────────────────
        if (selectedId) {
            const sel = grids.find((g: any) => g.id === selectedId && g.isVisible);
            if (sel) {
                this._renderGridDimensions(ctx, sel, grids, crop);
            }
        }

        ctx.restore();
    }

    /** Draws a filled circle with the grid name — Revit-style datum bubble. */
    private _drawGridBubble(
        ctx: CanvasRenderingContext2D,
        sx: number, sy: number,
        label: string,
        color: string,
        isSelected: boolean,
        isPinned?: boolean,
    ): void {
        const R = 10;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, R, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = `bold ${Math.min(9, Math.floor(R * 1.25))}px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy);

        // Pin indicator: small lock dot at top-right of bubble
        if (isPinned) {
            ctx.beginPath();
            ctx.arc(sx + R * 0.65, sy - R * 0.65, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
        }
        ctx.restore();
    }

    /** Draws an X= or Z= position tag near the opposite bubble end. */
    private _drawGridPositionLabel(
        ctx: CanvasRenderingContext2D,
        sx: number, sy: number,
        axis: 'X' | 'Y',
        position: number,
        color: string,
        isSelected: boolean,
    ): void {
        const text = `${axis === 'X' ? 'X' : 'Z'}=${position.toFixed(2)}m`;
        ctx.save();
        ctx.font = `${isSelected ? 'bold ' : ''}10px system-ui,sans-serif`;
        const tw = ctx.measureText(text).width;
        const pad = 4;
        const bx = sx - tw / 2 - pad;
        const by = sy - 9;
        const bw = tw + pad * 2;
        const bh = 14;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx, sy - 2);
        ctx.restore();
    }

    /**
     * Renders dimension strings from the selected grid to its nearest
     * neighbours on the same axis.  Populates _gridDimHitAreas so that
     * PlanViewInteraction can detect a click on a dim label and open an
     * inline position editor.
     */
    private _renderGridDimensions(
        ctx: CanvasRenderingContext2D,
        sel: any,
        allGrids: any[],
        _crop: { minX: number; minZ: number; maxX: number; maxZ: number } | null,
    ): void {
        const sameAxis = allGrids
            .filter((g: any) => g.axis === sel.axis && g.isVisible && g.id !== sel.id)
            .sort((a: any, b: any) => a.position - b.position);

        if (sameAxis.length === 0) return;

        const selPos = sel.position;

        // Find nearest lower + nearest upper neighbour
        const lower = [...sameAxis].filter((g: any) => g.position < selPos).pop() ?? null;
        const upper = sameAxis.find((g: any) => g.position > selPos) ?? null;
        const neighbours = [lower, upper].filter(Boolean) as any[];

        const DIM_OFFSET = 28; // px offset perpendicular to the grid line direction
        const TICK = 6;

        ctx.save();
        ctx.strokeStyle = '#7c3aed';
        ctx.fillStyle = '#7c3aed';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);

        for (const nb of neighbours) {
            // Determine screen positions along the midpoint of each grid line extent
            const extMid = ((sel.extentMin ?? -100) + (sel.extentMax ?? 100)) / 2;

            let selSc: { sx: number; sy: number };
            let nbSc: { sx: number; sy: number };

            if (sel.axis === 'X') {
                // Vertical lines — dims run horizontally; place dim line at extMid Z
                selSc = this.worldToScreen(sel.position, extMid);
                nbSc  = this.worldToScreen(nb.position,  extMid);
            } else {
                // Horizontal lines — dims run vertically; place dim line at extMid X
                selSc = this.worldToScreen(extMid, sel.position);
                nbSc  = this.worldToScreen(extMid, nb.position);
            }

            // Offset the dim line perpendicular to the grid direction
            const perpX = sel.axis === 'X' ? 0 : DIM_OFFSET;
            const perpY = sel.axis === 'X' ? -DIM_OFFSET : 0;

            const ax = selSc.sx + perpX;
            const ay = selSc.sy + perpY;
            const bx = nbSc.sx  + perpX;
            const by = nbSc.sy  + perpY;

            // Extension lines from grid to dim line
            ctx.beginPath();
            ctx.moveTo(selSc.sx, selSc.sy);
            ctx.lineTo(ax, ay);
            ctx.moveTo(nbSc.sx, nbSc.sy);
            ctx.lineTo(bx, by);
            ctx.stroke();

            ctx.setLineDash([]);

            // Dimension line between the two extension lines
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();

            // Ticks at each end
            const lineAngle = Math.atan2(by - ay, bx - ax);
            const perpAngle = lineAngle + Math.PI / 2;
            for (const [tx, ty] of [[ax, ay], [bx, by]]) {
                ctx.beginPath();
                ctx.moveTo(tx - Math.cos(perpAngle) * TICK, ty - Math.sin(perpAngle) * TICK);
                ctx.lineTo(tx + Math.cos(perpAngle) * TICK, ty + Math.sin(perpAngle) * TICK);
                ctx.stroke();
            }

            // Distance label at the midpoint of the dim line
            const dist = Math.abs(nb.position - sel.position);
            const label = `${dist.toFixed(2)}m`;
            const midX = (ax + bx) / 2;
            const midY = (ay + by) / 2;

            ctx.font = 'bold 10px system-ui,sans-serif';
            const tw = ctx.measureText(label).width;
            const lw = tw + 8;
            const lh = 15;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(midX - lw / 2, midY - lh / 2, lw, lh);
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 0.7;
            ctx.strokeRect(midX - lw / 2, midY - lh / 2, lw, lh);
            ctx.fillStyle = '#7c3aed';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);

            // Store hit area — clicking the label opens an offset editor for nb
            this._gridDimHitAreas.push({
                gridId: nb.id,
                targetPosition: nb.position,
                labelSx: midX,
                labelSy: midY,
                labelW: lw,
                labelH: lh,
            });

            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
        }
        ctx.restore();
    }

    /**
     * Renders horizontal level datum lines with Revit-style level heads for
     * section and elevation views (_sectionFlipV = true).  Each level is drawn
     * as a long dashed horizontal line at its world-Y elevation, with a circular
     * bubble at the right end containing the abbreviated level name, and the
     * full name + elevation shown nearby.
     */
    private _renderLevelDatums(ctx: CanvasRenderingContext2D): void {
        const bimManager = window.bimManager;
        const levels = bimManager?.getLevels?.();
        if (!Array.isArray(levels) || levels.length === 0) return;

        const w = Math.max(this._cssW || this._canvas.clientWidth, 1);
        const h = Math.max(this._cssH || this._canvas.clientHeight, 1);
        const fH = this._frustumH;
        const fW = fH * (w / Math.max(h, 1));

        // Datum lines span from past the left edge to ~80 px from the right,
        // leaving room for the level head bubble at the right margin.
        const extentLeft  = this._camTarget.x - fW * 1.08;
        const extentRight = this._camTarget.x + fW * 0.82;

        this._levelDatumHitAreas = [];

        ctx.save();
        for (const level of levels) {
            if (level.isVisible === false) continue;

            const isSelected  = level.id === this._selectedLevelId;
            const baseColor   = level.color ?? '#1e3a8a';
            const lineColor   = isSelected ? '#7c3aed' : baseColor;
            const elevation   = level.elevation ?? level.height ?? 0;

            const leftPt  = this.worldToScreen(extentLeft,  elevation);
            const rightPt = this.worldToScreen(extentRight, elevation);
            const sy      = leftPt.sy;

            if (sy < -30 || sy > h + 30) continue;

            // ── Selection glow ────────────────────────────────────────────────
            if (isSelected) {
                ctx.save();
                ctx.strokeStyle = 'rgba(124,58,237,0.20)';
                ctx.lineWidth = 9;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(leftPt.sx, sy);
                ctx.lineTo(rightPt.sx, sy);
                ctx.stroke();
                ctx.restore();
            }

            // ── Datum line (long dashed) ──────────────────────────────────────
            ctx.strokeStyle = lineColor;
            ctx.lineWidth   = isSelected ? 1.6 : 1.0;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(leftPt.sx, sy);
            ctx.lineTo(rightPt.sx, sy);
            ctx.stroke();
            ctx.setLineDash([]);

            // ── Short solid tick at left end ──────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(leftPt.sx - 6, sy);
            ctx.lineTo(leftPt.sx, sy);
            ctx.stroke();

            // ── Level head bubble at right end ────────────────────────────────
            const headR  = 12;
            const headCx = rightPt.sx + headR + 4;
            const headCy = sy;
            this._drawLevelHead(ctx, headCx, headCy, headR, level.name ?? '', elevation, lineColor, isSelected);

            this._levelDatumHitAreas.push({
                levelId:     level.id,
                elevation,
                lineSy:      sy,
                lineLeftSx:  leftPt.sx,
                lineRightSx: rightPt.sx,
                headCx,
                headCy,
                headR,
            });
        }
        ctx.restore();
    }

    /** Draws a Revit-style level head: circle with abbreviated name inside,
     *  full name above, and elevation tag to the right. */
    private _drawLevelHead(
        ctx: CanvasRenderingContext2D,
        cx: number, cy: number, R: number,
        name: string, elevation: number,
        color: string, isSelected: boolean,
    ): void {
        ctx.save();

        // Circle bubble
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.stroke();

        // Abbreviated name inside bubble (up to 4 chars)
        const abbr = (name.replace(/\s+/g, '').slice(0, 4)) || name.slice(0, 4);
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.min(9, Math.floor(R * 0.82))}px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(abbr, cx, cy);

        // Full name above the circle
        ctx.font = `${isSelected ? 'bold ' : ''}9px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const nameTm = ctx.measureText(name);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(cx - nameTm.width / 2 - 2, cy - R - 15, nameTm.width + 4, 13);
        ctx.fillStyle = color;
        ctx.fillText(name, cx, cy - R - 2);

        // Elevation tag to the right
        const sign = elevation >= 0 ? '+' : '';
        const elevLabel = `${sign}${elevation.toFixed(3)} m`;
        ctx.font = '9.5px system-ui,sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const elevTm = ctx.measureText(elevLabel);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(cx + R + 3, cy - 7, elevTm.width + 6, 14);
        ctx.fillStyle = color;
        ctx.fillText(elevLabel, cx + R + 6, cy);

        ctx.restore();
    }

    getPixelsPerUnit(): number {
        const w = Math.max(this._cssW || this._canvas.clientWidth, 1);
        const h = Math.max(this._cssH || this._canvas.clientHeight, 1);
        const fH = this._frustumH;
        const fW = fH * (w / Math.max(h, 1));
        return w / (2 * fW);
    }

    worldToScreen(worldH: number, worldV: number): { sx: number; sy: number } {
        const w = Math.max(this._cssW || this._canvas.clientWidth, 1);
        const h = Math.max(this._cssH || this._canvas.clientHeight, 1);
        const fH = this._frustumH;
        const fW = fH * (w / Math.max(h, 1));
        const sx = (worldH - this._camTarget.x + fW) / (2 * fW) * w;
        const sy = this._sectionFlipV
            // Section/elevation: world Y increases upward → flip so higher Y = lower sy.
            ? (this._camTarget.z + fH - worldV) / (2 * fH) * h
            // Plan view: world Z increases downward on canvas (default).
            : (worldV - this._camTarget.z + fH) / (2 * fH) * h;
        return { sx, sy };
    }

    screenToWorld(sx: number, sy: number): { worldX: number; worldZ: number } {
        const w = Math.max(this._cssW || this._canvas.clientWidth, 1);
        const h = Math.max(this._cssH || this._canvas.clientHeight, 1);
        const fH = this._frustumH;
        const fW = fH * (w / Math.max(h, 1));
        const worldV = this._sectionFlipV
            ? this._camTarget.z + fH - (sy / h) * (2 * fH)
            : (sy / h) * (2 * fH) - fH + this._camTarget.z;
        return {
            worldX: (sx / w) * (2 * fW) - fW + this._camTarget.x,
            worldZ: worldV,
        };
    }

    /**
     * Draw the imported floor plan underlay image behind BIM elements in plan view.
     *
     * The image is mapped using an affine transform derived from the mesh's three
     * world-space corners so that rotation, scale, and position all match the 3D scene.
     */
    private _drawUnderlay(ctx: CanvasRenderingContext2D): void {
        const ref = floorPlanUnderlayRef.current;
        if (!ref) return;
        if (ref.visible === false) return;

        // Load or reload the image when the blobUrl changes
        if (ref.blobUrl !== this._underlayImageUrl) {
            this._underlayImage = null;
            this._underlayImageUrl = ref.blobUrl;
            const img = new Image();
            img.onload = () => { this._underlayImage = img; };
            img.onerror = () => console.warn('[PlanViewCanvas] Failed to load floor plan underlay image');
            img.src = ref.blobUrl;
            return; // will render on the next frame once loaded
        }

        const img = this._underlayImage;
        if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return;

        const { mesh, planWidthMeters, planHeightMeters } = ref;
        mesh.updateWorldMatrix(true, false);

        // THREE.js TextureLoader with flipY=true maps:
        //   image top-left (0,0)  → local (-W/2,  H/2, 0)  → world XZ (cx-W/2, cz-H/2)
        //   image top-right       → local ( W/2,  H/2, 0)  → world XZ (cx+W/2, cz-H/2)
        //   image bottom-left     → local (-W/2, -H/2, 0)  → world XZ (cx-W/2, cz+H/2)
        // These are computed in local mesh space then transformed to world space.
        const tl = new THREE.Vector3(-planWidthMeters / 2,  planHeightMeters / 2, 0);
        const tr = new THREE.Vector3( planWidthMeters / 2,  planHeightMeters / 2, 0);
        const bl = new THREE.Vector3(-planWidthMeters / 2, -planHeightMeters / 2, 0);
        mesh.localToWorld(tl);
        mesh.localToWorld(tr);
        mesh.localToWorld(bl);

        // Project world XZ positions to screen (CSS pixels)
        const tlS = this.worldToScreen(tl.x, tl.z);
        const trS = this.worldToScreen(tr.x, tr.z);
        const blS = this.worldToScreen(bl.x, bl.z);

        const iw = img.naturalWidth;
        const ih = img.naturalHeight;

        // Affine transform coefficients that map image pixels → screen pixels:
        //   image (0,0)   → screen (tlS.sx, tlS.sy)
        //   image (iw,0)  → screen (trS.sx, trS.sy)
        //   image (0,ih)  → screen (blS.sx, blS.sy)
        const a = (trS.sx - tlS.sx) / iw;
        const b = (trS.sy - tlS.sy) / iw;
        const c = (blS.sx - tlS.sx) / ih;
        const d = (blS.sy - tlS.sy) / ih;

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // ctx.transform concatenates with the existing DPR transform so CSS-pixel
        // coordinates flow through correctly without needing to bake DPR in manually.
        ctx.transform(a, b, c, d, tlS.sx, tlS.sy);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
    }

    hitTest(sx: number, sy: number, thresholdPx = 8): string | null {
        const drawing = this._lastViewId ? viewTechnicalDrawingCache.get(this._lastViewId) : null;
        if (!drawing) return null;
        let bestId: string | null = null;
        let bestDist = thresholdPx;

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            // A-1: DrawingSelectionIndex is the PRIMARY UUID resolution path.
            // It is populated by EdgeProjectorService per projected LineSegments.
            // Fallback to userData fields for backward-compatibility with any
            // LineSegments that were tagged directly (IFC objects, symbol bridges).
            const id = (
                lookupElementUUID(drawing as object, child)
                ?? child.userData?.elementUUID
                ?? child.userData?.elementId
                ?? child.parent?.userData?.elementUUID
                ?? child.parent?.userData?.elementId
            ) as string | undefined;
            if (!id) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;
            for (let i = 0; i < posAttr.count - 1; i += 2) {
                let hv1: { h: number; vert: number };
                let hv2: { h: number; vert: number };
                if (this._sectionFlipV) {
                    hv1 = { h: posAttr.getX(i),     vert: -posAttr.getZ(i)     };
                    hv2 = { h: posAttr.getX(i + 1), vert: -posAttr.getZ(i + 1) };
                } else {
                    const v1 = _tmpV1.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
                    const v2 = _tmpV2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                    hv1 = this._vertexToHV(v1);
                    hv2 = this._vertexToHV(v2);
                }
                const p1 = this.worldToScreen(hv1.h, hv1.vert);
                const p2 = this.worldToScreen(hv2.h, hv2.vert);
                const dist = this._distanceToSegment(sx, sy, p1.sx, p1.sy, p2.sx, p2.sy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestId = id;
                }
            }
        });

        return bestId;
    }

    hitTestAnnotation(sx: number, sy: number, thresholdPx = 12): string | null {
        if (!this._lastViewId) return null;
        // §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — the annotation renderer is a
        // SINGLETON shared by every PlanViewCanvas (split view has two). Its
        // projection is otherwise whatever the last render() left behind, which in a
        // split view can belong to the OTHER canvas. Set it explicitly from THIS
        // canvas before hit-testing so the pick projects exactly as this canvas drew.
        planViewAnnotationRenderer.setViewProjection(
            this._viewType,
            (this._hWorldAxis ?? 'x') as 'x' | 'z',
            this._hWorldSign,
        );
        return planViewAnnotationRenderer.hitTestAnnotation(
            this._lastViewId,
            sx,
            sy,
            (wx, wz) => this.worldToScreen(wx, wz),
            thresholdPx,
        );
    }

    hitTestScopeHandle(sx: number, sy: number, thresholdPx = 10): { annotationId: string; linkedViewId: string; handle: 'depth' | 'width-left' | 'width-right' | 'cut-plane' } | null {
        if (!this._lastViewId) return null;
        return planViewAnnotationRenderer.hitTestScopeHandle(
            this._lastViewId,
            sx,
            sy,
            (wx, wz) => this.worldToScreen(wx, wz),
            thresholdPx,
        );
    }

    fitToDrawing(viewOrId: string | ViewDefinition, canvasW = this._cssW, canvasH = this._cssH): void {
        const viewId = typeof viewOrId === 'string' ? viewOrId : viewOrId.id;
        const drawing = viewTechnicalDrawingCache.get(viewId);
        if (!drawing) return;
        const cropBounds = typeof viewOrId === 'string' ? null : this._resolveCropCanvasBounds(viewOrId);
        const bounds = cropBounds ?? this._computeDrawingFootprintBounds(drawing);
        if (!bounds) return;

        // FIX: For elevation/section views the vertical axis is world Y (height).
        // Always extend the bottom bound to at least (floor − 0.5 m) so that the
        // floor slab (which sits at or slightly below the level elevation) is
        // always included in the crop regardless of whether its projected edges
        // were captured by the edge projector.
        if (this._sectionFlipV) {
            const SLAB_MARGIN = 0.5; // metres below the lowest projected geometry
            bounds.minV = bounds.minV - SLAB_MARGIN;
        }

        const width = Math.max(bounds.maxH - bounds.minH, 0.01);
        const height = Math.max(bounds.maxV - bounds.minV, 0.01);
        const aspect = canvasW / Math.max(canvasH, 1);
        const padding = 1.14;
        const fitByHeight = (height * padding) / 2;
        const fitByWidth = (width * padding) / (2 * Math.max(aspect, 0.01));

        // _camTarget.x = horizontal centre, _camTarget.z = vertical centre
        // (for sections, vertical is world Y; for plans, it is world Z).
        this._camTarget.set((bounds.minH + bounds.maxH) / 2, this._camTarget.y, (bounds.minV + bounds.maxV) / 2);
        this._frustumH = Math.max(MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM, Math.min(80, Math.max(fitByHeight, fitByWidth)));
    }

    private _resolveCropCanvasBounds(viewDef: ViewDefinition): { minH: number; maxH: number; minV: number; maxV: number } | null {
        const region = viewDef.crop?.enabled ? viewDef.crop.region : undefined;
        if (!region) return null;

        let minH = region.min[0];
        let maxH = region.max[0];
        let minV = region.min[1];
        let maxV = region.max[1];
        if (minH > maxH) [minH, maxH] = [maxH, minH];
        if (minV > maxV) [minV, maxV] = [maxV, minV];

        if (!this._sectionFlipV) {
            return { minH, maxH, minV, maxV };
        }

        if (viewDef.spatial.sectionVolume) {
            minH = this._worldHToCanvasH(minH);
            maxH = this._worldHToCanvasH(maxH);
            if (minH > maxH) [minH, maxH] = [maxH, minH];
            return { minH, maxH, minV, maxV };
        }

        const frame = this._elevationCropFrame(viewDef);
        if (!frame) return { minH, maxH, minV, maxV };

        const toH = (offset: number) => this._worldPointToCanvasH(
            frame.origin.x + frame.right.x * offset,
            frame.origin.z + frame.right.z * offset,
        );
        minH = toH(region.min[0]);
        maxH = toH(region.max[0]);
        if (minH > maxH) [minH, maxH] = [maxH, minH];
        return { minH, maxH, minV, maxV };
    }

    /**
     * §FIX-ELEVATION-CROP-EXTEND (L-175) — the anchor origin + perpendicular
     * `right` axis of the linked section/elevation mark. For elevation/section
     * views WITHOUT a stored sectionVolume, `crop.region.min[0]` / `max[0]` hold
     * signed perpendicular OFFSETS from this frame (not absolute world-H), so both
     * the forward projection (`_resolveCropCanvasBounds`) and the inverse
     * (`_projectRegionHToCanvasH`) must share this derivation. Returns null when
     * no linked mark exists (the sectionVolume path is used instead).
     */
    private _elevationCropFrame(viewDef: ViewDefinition): { origin: { x: number; z: number }; right: { x: number; z: number } } | null {
        const ann = annotationStore.getAll().find(item =>
            (item.type === 'elevation-mark' || item.type === 'section-mark') &&
            item.parameters.linkedViewId === viewDef.id
        );
        if (!ann) return null;

        if (ann.type === 'elevation-mark') {
            const anchor = ann.geometry2D.modelPoints?.[0];
            if (!anchor) return null;
            const dir = ann.parameters.facingDirection as { x?: number; z?: number } | undefined;
            const len = Math.hypot(dir?.x ?? 0, dir?.z ?? 0) || 1;
            return {
                origin: { x: anchor.x, z: anchor.z },
                right: { x: -((dir?.z ?? -1) / len), z: (dir?.x ?? 0) / len },
            };
        }

        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return null;
        const len = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) || 1;
        return {
            origin: { x: (pts[0].x + pts[1].x) / 2, z: (pts[0].z + pts[1].z) / 2 },
            right: { x: (pts[1].x - pts[0].x) / len, z: (pts[1].z - pts[0].z) / len },
        };
    }

    /**
     * §FIX-ELEVATION-CROP-EXTEND (L-175) — forward-project a single stored
     * `crop.region` horizontal value into canvas-H, matching the exact frame
     * `_resolveCropCanvasBounds()` uses (plan → identity; section/elevation with
     * sectionVolume → absolute world-H; otherwise → perpendicular offset from the
     * linked mark). Used to calibrate the screen→region inverse in
     * `cropFromHandleDrag()`. Returns null when the frame cannot be resolved.
     */
    private _projectRegionHToCanvasH(viewDef: ViewDefinition, regionH: number): number | null {
        if (!this._sectionFlipV) return regionH;
        if (viewDef.spatial.sectionVolume) return this._worldHToCanvasH(regionH);
        const frame = this._elevationCropFrame(viewDef);
        if (!frame) return null;
        return this._worldPointToCanvasH(
            frame.origin.x + frame.right.x * regionH,
            frame.origin.z + frame.right.z * regionH,
        );
    }

    /**
     * §FIX-ELEVATION-CROP-EXTEND (L-175) — hit-test the four crop-boundary corner
     * handles that `_renderCropBoundary()` draws in section/elevation views. Gated
     * to `_sectionFlipV` (elevation/section only, per L-175 scope) — plan-view crop
     * editing keeps the section-mark scope-box path (`hitTestScopeHandle`). Returns
     * the corner id (nw/ne/se/sw) nearest the cursor within `thresholdPx`, or null.
     */
    hitTestCropHandle(sx: number, sy: number, thresholdPx = 10): { handle: 'nw' | 'ne' | 'se' | 'sw' } | null {
        if (!this._sectionFlipV || !this._lastViewId) return null;
        const viewDef = viewDefinitionStore.get(this._lastViewId);
        if (!viewDef) return null;
        const bounds = this._resolveCropCanvasBounds(viewDef);
        if (!bounds) return null;

        // Canvas-space corners: worldToScreen flips V for sections (higher V = lower
        // sy), so maxV maps to the visual top, minV to the bottom.
        const corners: Array<{ handle: 'nw' | 'ne' | 'se' | 'sw'; h: number; v: number }> = [
            { handle: 'nw', h: bounds.minH, v: bounds.maxV },
            { handle: 'ne', h: bounds.maxH, v: bounds.maxV },
            { handle: 'se', h: bounds.maxH, v: bounds.minV },
            { handle: 'sw', h: bounds.minH, v: bounds.minV },
        ];
        let best: { handle: 'nw' | 'ne' | 'se' | 'sw' } | null = null;
        let bestDist = thresholdPx;
        for (const c of corners) {
            const p = this.worldToScreen(c.h, c.v);
            const d = Math.hypot(sx - p.sx, sy - p.sy);
            if (d < bestDist) {
                bestDist = d;
                best = { handle: c.handle };
            }
        }
        return best;
    }

    /**
     * §FIX-ELEVATION-CROP-EXTEND (L-175) — given a grabbed crop-boundary corner and
     * the current cursor position, return the new `ViewCropSettings` to dispatch via
     * the `view.setCrop` command (P6 — the ONLY mutation path; this method itself is
     * pure and writes nothing). Works in canvas-H/canvas-V space (the frame
     * `_resolveCropCanvasBounds` returns), then inverts back to the stored
     * `crop.region` representation via an affine calibration from the current region
     * corners — so it is correct for every frame (plan identity, section-volume
     * absolute world-H, and elevation perpendicular-offset) without duplicating the
     * per-frame math. Returns null when the drag would collapse the crop.
     */
    cropFromHandleDrag(handle: 'nw' | 'ne' | 'se' | 'sw', sx: number, sy: number): ViewCropSettings | null {
        if (!this._sectionFlipV || !this._lastViewId) return null;
        const viewDef = viewDefinitionStore.get(this._lastViewId);
        const region = viewDef?.crop?.region;
        if (!viewDef || !region) return null;
        const bounds = this._resolveCropCanvasBounds(viewDef);
        if (!bounds) return null;

        // Cursor → canvas-H/canvas-V (inverse of worldToScreen).
        const { worldX: dragH, worldZ: dragV } = this.screenToWorld(sx, sy);

        // Move only the grabbed corner's H and V extremes; the opposite corner stays.
        const hIsMin = handle === 'nw' || handle === 'sw'; // left corners → minH edge
        const vIsMax = handle === 'nw' || handle === 'ne'; // top corners  → maxV edge
        let cMinH = bounds.minH;
        let cMaxH = bounds.maxH;
        let cMinV = bounds.minV;
        let cMaxV = bounds.maxV;
        if (hIsMin) cMinH = dragH; else cMaxH = dragH;
        if (vIsMax) cMaxV = dragV; else cMinV = dragV;

        // Affine calibration of the H inverse from the current region↔canvas corners.
        const cRegMinH = this._projectRegionHToCanvasH(viewDef, region.min[0]);
        const cRegMaxH = this._projectRegionHToCanvasH(viewDef, region.max[0]);
        if (cRegMinH === null || cRegMaxH === null) return null;
        const denomH = cRegMaxH - cRegMinH;
        const slopeH = Math.abs(denomH) < 1e-6 ? 1 : (region.max[0] - region.min[0]) / denomH;
        const toRegionH = (canvasH: number) => region.min[0] + (canvasH - cRegMinH) * slopeH;

        let regMinH = toRegionH(cMinH);
        let regMaxH = toRegionH(cMaxH);
        if (regMinH > regMaxH) [regMinH, regMaxH] = [regMaxH, regMinH];
        // Vertical axis is identity in every frame: crop.region[1] === canvas-V (world Y).
        let regMinV = cMinV;
        let regMaxV = cMaxV;
        if (regMinV > regMaxV) [regMinV, regMaxV] = [regMaxV, regMinV];

        // Reject drags that would collapse (or invert) the crop below a usable span.
        const MIN_SPAN = 0.1;
        if (regMaxH - regMinH < MIN_SPAN || regMaxV - regMinV < MIN_SPAN) return null;

        const r3 = (n: number) => Number(n.toFixed(3));
        return {
            ...viewDef.crop,
            enabled: true,
            region: {
                min: [r3(regMinH), r3(regMinV)],
                max: [r3(regMaxH), r3(regMaxV)],
            },
        };
    }

    setSize(w: number, h: number): void {
        if (this._disposed) return;
        // §ZERO-SIZE-CANVAS-GUARD (founder 2026-06-17 "GL_INVALID_FRAMEBUFFER_OPERATION:
        // Attachment has zero size" flood on split/plan-view activation). A canvas with
        // width=0 or height=0 allocates a 0×0 backing buffer; anything that later reads it
        // as a texture/framebuffer attachment is "incomplete". Clamp to ≥1 — a 1×1 buffer
        // is harmless (the render is still gated on the real pane size upstream) and never
        // 0×0. (Was Math.max(0, …).)
        this._cssW = Math.max(1, Math.round(w));
        this._cssH = Math.max(1, Math.round(h));
        // §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the BACKING STORE and the render TRANSFORM
        // must use the SAME scale, or every stroke is drawn at the wrong size. One resolver.
        const scale = resolveCanvasRenderScale(window.devicePixelRatio);
        const pw = Math.round(this._cssW * scale);
        const ph = Math.round(this._cssH * scale);
        if (this._canvas.width !== pw) this._canvas.width = pw;
        if (this._canvas.height !== ph) this._canvas.height = ph;
    }

    // ── Contract 23 §14 — Worker Thread Pipeline ────────────────────────────────

    /**
     * Submit the current TechnicalDrawing to the DrawingPipelineWorker for
     * off-thread processing (stages 1–6).  When the worker returns, the result
     * is stored in the pipeline cache and `onComplete` is called so the caller
     * can trigger a repaint.
     *
     * The method is a fire-and-forget from the caller's perspective.  A second
     * call for the same viewId supersedes any in-flight request (generation guard
     * is enforced inside DrawingPipelineOrchestrator).
     *
     * @param viewDef     The active view definition.
     * @param onComplete  Optional callback invoked when the pipeline result is
     *                    stored and ready for renderFromPipelineResult().
     */
    scheduleWorkerRender(
        viewDef:    ViewDefinition,
        onComplete?: (result: PipelineResult) => void,
    ): void {
        if (this._disposed) return;

        const drawing = viewTechnicalDrawingCache.get(viewDef.id);
        if (!drawing) return;

        const gen = (this._workerGeneration.get(viewDef.id) ?? 0) + 1;
        this._workerGeneration.set(viewDef.id, gen);

        drawingPipelineOrchestrator.submitJob(drawing, {
            viewId:      viewDef.id,
            sectionFlipV: this._sectionFlipV,
            hWorldAxis:  this._hWorldAxis,
        }).then((result) => {
            if (this._disposed) return;
            // Generation guard — drop stale results
            if ((this._workerGeneration.get(viewDef.id) ?? 0) !== gen) return;
            this._pipelineCache.set(viewDef.id, result);
            console.log(
                `[PlanViewCanvas] Worker pipeline: ${result.edges.length} edges,` +
                ` ${result.polygons.length} polygons in ${result.durationMs.toFixed(1)}ms` +
                ` (geo:${result.stageTimes.geometry.toFixed(1)} cls:${result.stageTimes.classify.toFixed(1)}` +
                ` int:${result.stageTimes.intersect.toFixed(1)} hlr:${result.stageTimes.hlr.toFixed(1)}` +
                ` sty:${result.stageTimes.style.toFixed(1)})`,
            );
            onComplete?.(result);
        }).catch((err: Error) => {
            if (err.message.includes('superseded')) return;   // expected cancellation
            console.warn('[PlanViewCanvas] Worker pipeline error:', err.message);
        });
    }

    /**
     * Render the canvas from a pre-computed PipelineResult (StyledEdge[] +
     * StyledPolygon[]) produced by the DrawingPipelineWorker.
     *
     * This is the fast, main-thread-only Stage 7 (CanvasRenderer) path.
     * It avoids traversing the THREE.js scene graph — all geometry is provided
     * as plain typed arrays already in 2D drawing-space coordinates.
     *
     * Call order mirrors render():
     *   1. Clear + grid
     *   2. Room fills
     *   3. Poche polygons  (from result.polygons)
     *   4. Edge linework   (from result.edges)
     *   5. Annotations
     *   6. Crop boundary
     *   7. Selection highlights (falls back to scene-graph path for hit data)
     *   8. Snap indicator
     *
     * @param viewDef   Active view definition.
     * @param result    PipelineResult from the worker (may be from cache).
     * @param options   Same options as render().
     */
    renderFromPipelineResult(
        viewDef:  ViewDefinition,
        result:   PipelineResult,
        options:  PlanViewCanvasRenderOptions = {},
    ): void {
        if (this._disposed) return;

        const viewId = viewDef.id;
        this._lastViewId = viewId;
        const w = this._cssW || this._canvas.clientWidth;
        const h = this._cssH || this._canvas.clientHeight;
        if (w <= 0 || h <= 0) return;

        this.setSize(w, h);

        // §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the SECOND stroke path in this file (the
        // worker-pipeline result renderer). It had the SAME 1-px floor and would have kept the
        // ladder flat for every drawing that came back through the worker — a fix applied to one
        // of two identical paths is not a fix.
        const scale    = resolveCanvasRenderScale(window.devicePixelRatio);
        const ctx      = this._ctx;
        const hairline = minStrokePx(scale);
        const dashPxScale = dashScale(window.devicePixelRatio);

        // §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) / C09 §4.6.4d — how THIS view draws the `beyond`
        // zone. Resolved ONCE, here, through the one resolver (the view's own override beats its
        // TYPE's default — elevation/section 'dashed', plan 'solid'), and handed to the pen engine
        // as a resolved ANSWER. The canvas must not ask "is this an elevation?" and neither must
        // the engine: that scattered `viewType ===` branching is exactly what ViewScope abolished.
        const _beyondLineStyle = resolveBeyondLineStyle(viewDef.output, resolveViewScope(this._viewType));

        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        if (this._gridVisible) this._drawGrid(ctx, w, h);

        const isPlanLike =
            this._viewType === 'plan' || this._viewType === 'structural-plan' ||
            this._viewType === 'ceiling-plan' || this._viewType === 'detail';

        const cropClipApplied = this._applyCropClip(ctx, viewDef);
        if (isPlanLike) this._drawUnderlay(ctx);
        if (isPlanLike) this._renderRoomFills(ctx);
        // §L-431 slice 2 — site context (parcel + buildable envelope) UNDER the datums/elements
        // so model linework always reads on top of the reference rings.
        if (isPlanLike) this._renderSiteContext(ctx);
        if (isPlanLike) this._renderBimGridDatums(ctx, viewDef);
        if (!isPlanLike && this._sectionFlipV) this._renderLevelDatums(ctx);

        // ── Poche polygons (Stage 7a) ─────────────────────────────────────────
        // §FIX-ELEVATION-POCHE (L-119) — same CUT-view gate as the main render()
        // path: elevations are line drawings and must never receive solid fills.
        if (result.polygons.length > 0 && resolveViewScope(this._viewType).poche) {
            ctx.save();
            ctx.setLineDash([]);
            for (const poly of result.polygons) {
                const verts = poly.vertices;
                if (verts.length < 6) continue;

                ctx.globalAlpha = Math.max(0, Math.min(1, poly.opacity));

                if (poly.fillPattern && poly.fillPattern !== 'solid') {
                    ctx.fillStyle = this._canvasFillStyleForPoche(ctx, {
                        points:       '',   // not used by _canvasFillStyleForPoche
                        fill:         poly.fillColor,
                        opacity:      poly.opacity,
                        fillPattern:  poly.fillPattern,
                        strokeColor:  poly.strokeColor,
                    });
                } else {
                    ctx.fillStyle = poly.fillColor;
                }

                ctx.beginPath();
                const p0 = this.worldToScreen(verts[0], verts[1]);
                ctx.moveTo(p0.sx, p0.sy);
                for (let i = 2; i + 1 < verts.length; i += 2) {
                    const p = this.worldToScreen(verts[i], verts[i + 1]);
                    ctx.lineTo(p.sx, p.sy);
                }
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // ── Edge linework (Stage 7b) ─────────────────────────────────────────
        //
        // Edges are already sorted CUT → PROJECTION → BEYOND by the worker.
        // Per-zone globalAlpha resets: BEYOND uses pen.opacity (0.55), others 1.0.
        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 4;

        for (const edge of result.edges) {
            // VG visibility check — honour the external styleResolver if provided
            const vgCat = this._vgCategoryFromZoneCategory(edge.layerTag);
            if (vgCat && this._styleResolver) {
                const resolved = this._styleResolver(vgCat, edge.layerTag);
                if (resolved && !resolved.visible) continue;
            }

            const p1 = this.worldToScreen(edge.h0, edge.v0);
            const p2 = this.worldToScreen(edge.h1, edge.v1);

            // §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) — the BEYOND dash is VIEW INTENT, and the
            // WORKER CANNOT KNOW IT: it resolves its pens from (zone × category) alone and has no
            // `ViewDefinition`, so it can never answer "does THIS view dash its beyond zone?".
            // The view-scoped decision is therefore applied HERE, on the same resolved answer the
            // main path uses, from the SAME `BEYOND_DASH_PX` constant — so a stair's lower run in
            // an elevation reads identically whether the drawing came back through the worker or
            // not. A fix applied to one of two identical paths is not a fix (L-288 taught this
            // file that twice).
            //
            // (The deeper issue — that the worker resolves pens through its OWN mini rules engine
            // rather than `graphicsRulesEngine.resolveStyle()` — is a PRE-EXISTING divergence from
            // Contract-23 §7.1, the same class of defect as L-280's symbol renderer. It also means
            // the L-285 function axis does not reach this path. Recorded, not smuggled into this
            // ticket: it needs the worker message protocol to carry the view's intent.)
            const _edgeDash = (edge.zone === 'BEYOND' && _beyondLineStyle === 'dashed')
                ? [...BEYOND_DASH_PX]
                : edge.dashPx;

            ctx.strokeStyle = edge.color;
            ctx.lineWidth   = Math.max(hairline, edge.widthMm * SCREEN_PX_PER_MM);
            ctx.globalAlpha = edge.opacity;
            ctx.setLineDash(_edgeDash ? _edgeDash.map(v => v * dashPxScale) : []);

            ctx.beginPath();
            ctx.moveTo(p1.sx, p1.sy);
            ctx.lineTo(p2.sx, p2.sy);
            ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();

        if (cropClipApplied && !viewDef.crop?.annotationCrop) ctx.restore();

        planViewAnnotationRenderer.render(
            ctx,
            viewId,
            (wx, wz) => this.worldToScreen(wx, wz),
            {
                activeLinkedViewId: options.activeLinkedViewId ?? null,
                viewType:     this._viewType,
                sectionHAxis: (this._hWorldAxis ?? 'x') as 'x' | 'z',
                // §FIX-DIM-ELEV-PROJECTION (L-256/L-263) — the geometry above is
                // projected through _worldPointToCanvasH(), which applies _hWorldSign.
                // Annotations must use the SAME sign, or they are mirrored relative to
                // the elements they annotate on any hSign === -1 elevation.
                hSign:        this._hWorldSign,
                // §L-430 slice 2d — θ for the north arrow (C34 §1.4). The plan is drawn in
                // the PROJECT frame, so the arrow must point at TRUE north (−θ on the sheet).
                // Read from the SAME provider as the site rings, so the pane can never draw
                // site geometry in one frame and annotate it with another.
                projectNorthRad: this._siteContextProvider?.()?.projectNorthRad ?? 0,
            },
        );

        if (cropClipApplied && viewDef.crop?.annotationCrop) ctx.restore();

        // Phase L — overlay placed lighting fixtures as plan symbols, scoped to this view's level.
        this._renderLightingPlanSymbols();

        this._renderCropBoundary(ctx, viewDef);

        // Selection highlights still use the scene-graph path (hitTest unchanged)
        const drawing = viewTechnicalDrawingCache.get(viewId);
        if (drawing) this._renderSelectionHighlights(ctx, drawing);

        this._drawSnapIndicator(ctx);
    }

    /**
     * Retrieve the most recent cached PipelineResult for a viewId, or null if
     * no worker result is available yet.
     */
    getCachedPipelineResult(viewId: string): PipelineResult | null {
        return this._pipelineCache.get(viewId) ?? null;
    }

    /** Invalidate the pipeline cache for a specific viewId (e.g. after geometry change). */
    invalidatePipelineCache(viewId: string): void {
        this._pipelineCache.delete(viewId);
        this._workerGeneration.set(viewId, (this._workerGeneration.get(viewId) ?? 0) + 1);
    }

    dispose(): void {
        this._disposed = true;
        this._pipelineCache.clear();
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    private _applyCropClip(ctx: CanvasRenderingContext2D, viewDef: ViewDefinition): boolean {
        const bounds = this._resolveCropCanvasBounds(viewDef);
        if (!bounds) return false;

        const p1 = this.worldToScreen(bounds.minH, bounds.minV);
        const p2 = this.worldToScreen(bounds.maxH, bounds.maxV);
        const left = Math.min(p1.sx, p2.sx);
        const top = Math.min(p1.sy, p2.sy);
        const width = Math.abs(p2.sx - p1.sx);
        const height = Math.abs(p2.sy - p1.sy);
        if (width < 1 || height < 1) return false;

        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, width, height);
        ctx.clip();
        return true;
    }

    /**
     * §L-431 slice 2 — draw the SITE CONTEXT (committed parcel outline + buildable-envelope
     * inset) into the Canvas2D plan projection.
     *
     * WHY THIS EXISTS: the plan pane projects BIM ELEMENTS only, so the parcel + envelope —
     * which are site context, not model geometry — never appeared there (founder: "not showing
     * the envelope on the plan view / elevations"). Enabling EDITOR_LAYER (L-431 slice 1) fixed
     * the three.js plan camera but could not affect this separate Canvas2D renderer.
     *
     * C34 (print/drawing standards): these are REFERENCE lines, not model linework — drawn as
     * thin dashed strokes so they read as context an architect sets out against and never get
     * mistaken for built geometry. Plan mapping is the canvas's own convention: world {x,z} →
     * worldToScreen(x, -z). Pure paint: no state mutation, fully guarded (a provider failure
     * must never break the plan pane).
     */
    private _renderSiteContext(ctx: CanvasRenderingContext2D): void {
        try {
            const site = this._siteContextProvider?.() ?? null;
            if (!site) return;
            // Site context belongs in PLAN-type views (it is a ground-plane footprint); an
            // elevation/section would show it edge-on as a meaningless line.
            if (this._viewType !== 'plan') return;

            const strokeRing = (
                ring: ReadonlyArray<{ x: number; z: number }>,
                color: string,
                dash: readonly number[],
                widthPx: number,
            ): void => {
                if (ring.length < 3) return;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = widthPx;
                ctx.setLineDash([...dash]);
                ctx.beginPath();
                for (let i = 0; i < ring.length; i++) {
                    const p = ring[i]!;
                    // §L-436 — RAW world XZ. This previously passed `-p.z`, which MIRRORED the
                    // parcel and envelope in Z relative to every other thing in the pane: BIM
                    // geometry and annotations both feed `worldToScreen(wx, wz)` unnegated, and
                    // `worldToScreen` already owns the world→screen flip. The rings are the
                    // SAME scene-XZ coordinates walls are authored in, so they take the SAME
                    // mapping — no East/North reinterpretation belongs here.
                    //
                    // The bug hid because a mirrored rectangle is still a rectangle: the
                    // orientation looked right, only the POSITION was wrong, and nothing was
                    // drawn against the rings until walls could be snapped to them.
                    const s = this.worldToScreen(p.x, p.z);
                    if (i === 0) ctx.moveTo(s.sx, s.sy);
                    else ctx.lineTo(s.sx, s.sy);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            };

            // Parcel = the legal lot line (longer dash, slightly stronger).
            if (site.parcelRing && site.parcelRing.length >= 3) {
                strokeRing(site.parcelRing, 'rgba(102, 0, 255, 0.75)', [7, 4], 1.1);
            }
            // Envelope = the setback-reduced buildable limit you must design within
            // (tighter dash so the two rings are visually distinguishable at any zoom).
            if (site.envelopeRing && site.envelopeRing.length >= 3) {
                strokeRing(site.envelopeRing, 'rgba(102, 0, 255, 0.95)', [3, 3], 1.4);
            }
        } catch {
            // Site context is a NICE-TO-HAVE overlay — never let it break the plan render.
        }
    }

    private _renderCropBoundary(ctx: CanvasRenderingContext2D, viewDef: ViewDefinition): void {
        const bounds = this._resolveCropCanvasBounds(viewDef);
        if (!bounds) return;

        const p1 = this.worldToScreen(bounds.minH, bounds.minV);
        const p2 = this.worldToScreen(bounds.maxH, bounds.maxV);
        const left = Math.min(p1.sx, p2.sx);
        const top = Math.min(p1.sy, p2.sy);
        const width = Math.abs(p2.sx - p1.sx);
        const height = Math.abs(p2.sy - p1.sy);
        if (width < 1 || height < 1) return;

        ctx.save();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.78)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(left, top, width, height);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
        for (const pt of [
            [left, top],
            [left + width, top],
            [left + width, top + height],
            [left, top + height],
        ] as const) {
            ctx.beginPath();
            ctx.rect(pt[0] - 3, pt[1] - 3, 6, 6);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Phase 3 (Sprint 2) — Canvas2D selection + hover highlights.
     *
     * Renders on top of the normal linework pass:
     *   • Hovered element  → semi-transparent blue stroke (4 px) over its segments.
     *   • Selected element → solid purple stroke (3 px) over its segments
     *                        + dashed purple bounding-rect with corner tick handles.
     *
     * Both lookups use the same UUID resolution chain as hitTest():
     *   DrawingSelectionIndex → userData.elementUUID → userData.elementId → parent.userData
     *
     * No store reads — all geometry comes from the projected drawing itself.
     */
    /**
     * Phase L — overlay placed lighting fixtures onto the plan as 2D symbols.
     * Read-through to LightingStore; scoped to this canvas's bound levelId so
     * fixtures only appear on the level whose plan is being rendered.
     */
    private _renderLightingPlanSymbols(): void {
        if (this._viewType !== 'plan' &&
            this._viewType !== 'ceiling-plan' &&
            this._viewType !== 'structural-plan') return;
        const ctx = this._ctx;
        const ppu = this.getPixelsPerUnit();
        const selectedId = window.selectionManager?.selectedObject?.userData?.id
                       ?? window.selectionManager?.selectedObject?.userData?.elementUUID
                       ?? null;
        renderLightingSymbols(
            ctx, ppu,
            (wx, wz) => this.worldToScreen(wx, wz),
            { levelId: this._levelId, selectedId },
        );
    }

    private _renderSelectionHighlights(ctx: CanvasRenderingContext2D, drawing: object): void {
        const selectedId = window.selectionManager?.selectedObject?.userData?.id as string | undefined;
        const hoveredId  = this._hoveredElementId ?? undefined;

        if (!selectedId && !hoveredId) return;

        // ── Collect screen-space segments per entity ──────────────────────
        interface Seg { x1: number; y1: number; x2: number; y2: number }
        const selectedSegs: Seg[] = [];
        const hoveredSegs:  Seg[] = [];

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            const uuid = (
                lookupElementUUID(drawing, child)
                ?? child.userData?.elementUUID
                ?? child.userData?.elementId
                ?? child.parent?.userData?.elementUUID
                ?? child.parent?.userData?.elementId
            ) as string | undefined;
            if (!uuid) return;

            const isSelected = uuid === selectedId;
            const isHovered  = uuid === hoveredId && uuid !== selectedId;
            if (!isSelected && !isHovered) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;
            const count = posAttr.count;

            for (let i = 0; i < count - 1; i += 2) {
                let hv1: { h: number; vert: number };
                let hv2: { h: number; vert: number };
                if (this._sectionFlipV) {
                    hv1 = { h: posAttr.getX(i),     vert: -posAttr.getZ(i)     };
                    hv2 = { h: posAttr.getX(i + 1), vert: -posAttr.getZ(i + 1) };
                } else {
                    const v1 = _tmpV1.set(posAttr.getX(i),     posAttr.getY(i),     posAttr.getZ(i)).applyMatrix4(mat);
                    const v2 = _tmpV2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                    hv1 = this._vertexToHV(v1);
                    hv2 = this._vertexToHV(v2);
                }
                const p1 = this.worldToScreen(hv1.h, hv1.vert);
                const p2 = this.worldToScreen(hv2.h, hv2.vert);
                const seg: Seg = { x1: p1.sx, y1: p1.sy, x2: p2.sx, y2: p2.sy };
                if (isSelected) selectedSegs.push(seg);
                else            hoveredSegs.push(seg);
            }
        });

        // ── Blue hover stroke ─────────────────────────────────────────────
        if (hoveredSegs.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)';   // blue-500 @ 55%
            ctx.lineWidth   = 4;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of hoveredSegs) {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            ctx.restore();
        }

        // ── Purple selection glow outline (matches 3D view style — app accent #6600FF) ──
        if (selectedSegs.length > 0) {
            // Pass 1: broad soft glow halo — wide, very transparent
            ctx.save();
            ctx.shadowColor  = 'rgba(139, 92, 246, 0.9)';
            ctx.shadowBlur   = 18;
            ctx.strokeStyle  = 'rgba(102, 0, 255, 0.18)';
            ctx.lineWidth    = 14;
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of selectedSegs) {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            ctx.restore();

            // Pass 2: mid glow — medium width
            ctx.save();
            ctx.shadowColor  = 'rgba(102, 0, 255, 0.85)';
            ctx.shadowBlur   = 10;
            ctx.strokeStyle  = 'rgba(102, 0, 255, 0.45)';
            ctx.lineWidth    = 6;
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of selectedSegs) {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            ctx.restore();

            // Pass 3: crisp bright core line on top
            ctx.save();
            ctx.shadowColor  = 'rgba(167, 139, 250, 0.7)';
            ctx.shadowBlur   = 4;
            ctx.strokeStyle  = 'rgba(102, 0, 255, 0.95)';
            ctx.lineWidth    = 2;
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            for (const s of selectedSegs) {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    private _renderRoomFills(ctx: CanvasRenderingContext2D): void {
        const roomStore = window.roomStore; // TODO(TASK-08)
        if (!roomStore) return;

        try {
            const rooms: any[] = this._levelId
                ? roomStore.getByLevel(this._levelId)
                : roomStore.getAll();

            if (!rooms || rooms.length === 0) return;

            for (const room of rooms) {
                const polygon = room.boundary?.polygon;
                if (!polygon || polygon.length < 3) continue;

                const color   = RoomColourSystem.resolve(room);
                const opacity = RoomColourSystem.resolveOpacity(room);
                ctx.save();
                ctx.globalAlpha = opacity * 0.7; // plan view is slightly more transparent than 3D
                ctx.fillStyle = color;
                ctx.beginPath();
                const p0 = this.worldToScreen(polygon[0].x, polygon[0].z);
                ctx.moveTo(p0.sx, p0.sy);
                for (let i = 1; i < polygon.length; i++) {
                    const p = this.worldToScreen(polygon[i].x, polygon[i].z);
                    ctx.lineTo(p.sx, p.sy);
                }
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
        } catch {
            // Non-fatal — room store may not be ready
        }
    }

    private _renderPocheFills(ctx: CanvasRenderingContext2D, drawing: object, viewDef?: ViewDefinition): void {
        const polygons: PochePolygon[] = [];

        // Phase 3 §3.2 — Resolve intent instance once for this render pass.
        const _viewId = viewDef?.id;
        const _intentInstance = _viewId ? viewIntentInstanceStore.get(_viewId) : undefined;
        const _intentId = _intentInstance?.intentId ?? getDefaultSystemIntentId();
        const _intent = visibilityIntentStore.get(_intentId);
        const _virtInstance = (_intentInstance ?? (_viewId ? {
            id: `default-${_viewId}`,
            viewId: _viewId,
            intentId: _intentId,
            localOverrides: { visibilityOverrides: [], graphicOverrides: [], isolateActive: false },
            createdAt: '',
            updatedAt: '',
        } : null));

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;

            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 6) return;

            const layerTag = [
                child.userData?.layerName,
                child.name,
                child.parent?.userData?.layerName,
                child.parent?.name,
            ].filter(Boolean).join(' ');
            if (!/:cut$/i.test(layerTag)) return;

            const baseLayer = this._baseIsoLayer(layerTag);
            if (!baseLayer) return;

            const vgCat = this._vgCategoryForLayer(layerTag);
            const resolved = vgCat && this._styleResolver
                ? this._styleResolver(vgCat, layerTag)
                : null;
            if (resolved && !resolved.visible) return;

            // ── Phase 3 §3.2 — Intent-based fill override ─────────────────────
            // Resolve intent cut fill for this element type. The intent fill takes
            // precedence over the VG fill and the ISO_CUT_LAYER_TO_POCHE_FILL default.
            // Falls back gracefully when no intent / intent fill style is 'none'.
            let intentFillColour: string | null = null;
            let intentFillPattern: string | null = null;
            let intentFillOpacity: number | null = null;

            if (_intent && _virtInstance && vgCat) {
                try {
                    const _cutAppearance = resolveIntentStyle(
                        _virtInstance as Parameters<typeof resolveIntentStyle>[0],
                        _intent,
                        vgCat,
                        'cut',
                        viewDef?.viewType ?? this._viewType,
                        { elementType: vgCat, category: vgCat },
                    );
                    if (_cutAppearance.fill.style !== 'none' && _cutAppearance.visible) {
                        intentFillColour  = _cutAppearance.fill.colour ?? null;
                        intentFillPattern = (_cutAppearance.fill as any).pattern ?? null;
                        intentFillOpacity = _cutAppearance.fill.opacity;
                    }
                } catch {
                    // Intent resolve is non-critical for poche fills; fall back to VG.
                }
            }
            // ──────────────────────────────────────────────────────────────────────

            const baseFill = intentFillColour ?? resolved?.fillColor ?? ISO_CUT_LAYER_TO_POCHE_FILL[baseLayer];
            if (!baseFill) return;

            // ── §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — LAYERED WALL: ONE TONE PER LAYER ──
            //
            // `baseFill` is the colour the INTENT chain resolved for (category × cut) — the
            // single authority over the poché colour, exactly as it is for a plain wall.
            // A layered wall's cut section arrives as one closed ring PER CONSTRUCTION LAYER
            // (EdgeProjectorService stamps `pocheLayer` from the mesh built out of the wall's
            // STORED `layers` array — L-127: never a magic literal, never a hardcoded count).
            // The layer's stored `function` only SPREADS that one colour into the grey-scale,
            // so overriding the intent moves every tone with it and the drawing keeps ONE
            // source of truth for "what colour is a cut wall".
            const _pocheLayer = (child.userData?.pocheLayer ?? null) as {
                layerFunction?: string;
                tieOrdinal?: number;
            } | null;
            const fill = _pocheLayer
                ? resolveWallLayerPocheFill(baseFill, _pocheLayer.layerFunction, _pocheLayer.tieOrdinal ?? 0)
                : baseFill;

            const transparency = Math.max(0, Math.min(100, Number(resolved?.transparency ?? 0)));
            const vgOpacity = 1 - (transparency / 100);
            const opacity = intentFillOpacity ?? vgOpacity;
            if (opacity <= 0) return;

            const built = PocheFillBuilder.fromGeometry(child.geometry, fill, opacity);
            const fillPattern = intentFillPattern ?? resolved?.fillPattern;
            if (fillPattern && fillPattern !== 'solid') {
                for (const poly of built) {
                    poly.fillPattern = fillPattern;
                    poly.strokeColor = resolved?.edgeColor ?? fill;
                }
            }
            polygons.push(...built);
        });

        if (polygons.length === 0) return;

        ctx.save();
        ctx.setLineDash([]);
        for (const poly of polygons) {
            const points = this._parsePochePoints(poly);
            if (points.length < 3) continue;

            ctx.globalAlpha = Math.max(0, Math.min(1, poly.opacity));
            ctx.fillStyle = this._canvasFillStyleForPoche(ctx, poly);
            ctx.beginPath();
            const p0 = this.worldToScreen(points[0].h, points[0].v);
            ctx.moveTo(p0.sx, p0.sy);
            for (let i = 1; i < points.length; i++) {
                const p = this.worldToScreen(points[i].h, points[i].v);
                ctx.lineTo(p.sx, p.sy);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    private _parsePochePoints(poly: PochePolygon): Array<{ h: number; v: number }> {
        return poly.points
            .split(/\s+/)
            .map(pair => {
                const [xRaw, zRaw] = pair.split(',');
                const x = Number(xRaw);
                const z = Number(zRaw);
                if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
                return { h: x, v: this._sectionFlipV ? -z : z };
            })
            .filter((pt): pt is { h: number; v: number } => pt !== null);
    }

    private _canvasFillStyleForPoche(ctx: CanvasRenderingContext2D, poly: PochePolygon): string | CanvasPattern {
        const pattern = poly.fillPattern;
        if (!pattern || pattern === 'solid') return poly.fill;

        const strokeColour = poly.strokeColor ?? '#333333';

        // Phase 3 §3.2 — Try HatchPatternLibrary first (named pattern keys).
        // This covers 'diagonal-45', 'diagonal-cross', 'dot-grid', 'brick', etc.
        const libraryPattern = getHatchPattern(ctx, pattern, poly.fill, strokeColour);
        if (libraryPattern) return libraryPattern;

        // Fallback: inline tile generation for legacy pattern name variants.
        const tile = document.createElement('canvas');
        tile.width = 12;
        tile.height = 12;
        const tctx = tile.getContext('2d');
        if (!tctx) return poly.fill;

        tctx.fillStyle = poly.fill;
        tctx.fillRect(0, 0, tile.width, tile.height);
        tctx.strokeStyle = strokeColour;
        tctx.lineWidth = 1;
        tctx.beginPath();
        if (/cross/i.test(pattern)) {
            tctx.moveTo(0, 6);
            tctx.lineTo(12, 6);
            tctx.moveTo(6, 0);
            tctx.lineTo(6, 12);
        } else if (/dot/i.test(pattern)) {
            tctx.fillStyle = strokeColour;
            tctx.arc(6, 6, 1.2, 0, Math.PI * 2);
            tctx.fill();
        } else {
            tctx.moveTo(-2, 12);
            tctx.lineTo(12, -2);
            tctx.moveTo(4, 14);
            tctx.lineTo(14, 4);
        }
        tctx.stroke();

        return ctx.createPattern(tile, 'repeat') ?? poly.fill;
    }

    private _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const fH = this._frustumH;
        const fW = fH * (w / Math.max(h, 1));
        const ppu = w / (2 * fW);
        const gridStep = ppu >= 6 ? 1 : ppu >= 1.5 ? 5 : 10;
        const gPx = gridStep * ppu;
        if (gPx < 8) return;

        const originX = (0 - this._camTarget.x + fW) / (2 * fW) * w;
        const originY = (0 - this._camTarget.z + fH) / (2 * fH) * h;

        ctx.strokeStyle = 'rgba(120,120,120,0.12)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        const startCol = Math.floor(-originX / gPx);
        const endCol = Math.ceil((w - originX) / gPx);
        for (let c = startCol; c <= endCol; c++) {
            const x = originX + c * gPx;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }

        const startRow = Math.floor(-originY / gPx);
        const endRow = Math.ceil((h - originY) / gPx);
        for (let r = startRow; r <= endRow; r++) {
            const y = originY + r * gPx;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
    }

    private _vgCategoryForLayer(layerTag: string): string | null {
        const tag = layerTag.trim();
        for (const [prefix, category] of Object.entries(ISO_LAYER_TO_VG_CATEGORY)) {
            if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) return category;
        }
        return null;
    }

    /**
     * Contract 23 §14 — VG category lookup for worker-rendered edges.
     * Mirrors _vgCategoryForLayer() but accepts the composite layerTag string
     * that the worker embeds in each StyledEdge.  Returns null when no match.
     */
    private _vgCategoryFromZoneCategory(layerTag: string): string | null {
        return this._vgCategoryForLayer(layerTag);
    }

    /**
     * Contract 23 §9 — Sync per-view VGGovernanceStore category overrides into
     * GraphicsRulesEngine as priority-9000 rules before every render.
     *
     * This is the ONLY place that bridges the VGGovernanceStore view-override tier
     * with the GraphicsRulesEngine style authority (Contract 23 §7.1).  Without
     * this call, changes made via the VGGovernancePanel "View" tab would be stored
     * in VGGovernanceStore but never reflected in Canvas2D rendering.
     *
     * Algorithm:
     *   1. Remove all previous priority-9000 rules for this viewId (stale clear).
     *   2. Read VGGovernanceStore.getView(viewId)?.categoryOverrides — sparse map
     *      containing only properties that the user has explicitly overridden.
     *   3. For each category with at least one override, derive zone-specific
     *      Partial<PenStyle> objects and call graphicsRulesEngine.addViewOverride().
     *
     * VGCategoryStyle → PenStyle translation:
     *   lineWeight        → widthMm (PROJECTION + BEYOND fallback)
     *   cutLineWeight     → widthMm (CUT zone)
     *   projectionLineWeight → widthMm (PROJECTION zone)
     *   beyondLineWeight  → widthMm (BEYOND zone)
     *   edgeColor         → color  (CUT + PROJECTION zones)
     *   beyondEdgeColor   → color  (BEYOND zone)
     *   transparency      → opacity (converted: 0→1, 100→0)
     */
    private _syncVGViewOverrides(viewDef: ViewDefinition): void {
        const viewId = viewDef.id;

        // Step 1 — flush stale view rules so the engine never accumulates orphan entries.
        graphicsRulesEngine.removeViewOverrides(viewId);

        // Step 2 — read the sparse override map for this view.
        const viewRecord = vgGovernanceStore.getView(viewId);
        if (!viewRecord || Object.keys(viewRecord.categoryOverrides).length === 0) return;

        // Step 3 — translate each partial VGCategoryStyle into zone-specific PenStyle rules.
        for (const [vgCategory, partial] of Object.entries(viewRecord.categoryOverrides)) {
            if (!partial || Object.keys(partial).length === 0) continue;

            const cutPen:    Partial<PenStyle> = {};
            const projPen:   Partial<PenStyle> = {};
            const beyondPen: Partial<PenStyle> = {};

            // Line weights — zone-specific first, fallback to generic lineWeight
            const lw = (partial as any).lineWeight;
            if (typeof lw === 'number' && lw > 0) {
                cutPen.widthMm    = lw;
                projPen.widthMm   = lw;
                beyondPen.widthMm = lw;
            }
            const cutLw = (partial as any).cutLineWeight;
            if (typeof cutLw === 'number' && cutLw > 0) cutPen.widthMm = cutLw;
            const projLw = (partial as any).projectionLineWeight;
            if (typeof projLw === 'number' && projLw > 0) projPen.widthMm = projLw;
            const beyondLw = (partial as any).beyondLineWeight;
            if (typeof beyondLw === 'number' && beyondLw > 0) beyondPen.widthMm = beyondLw;

            // Edge colours
            const edgeColor = (partial as any).edgeColor;
            if (typeof edgeColor === 'string' && edgeColor) {
                cutPen.color  = edgeColor;
                projPen.color = edgeColor;
            }
            const beyondColor = (partial as any).beyondEdgeColor;
            if (typeof beyondColor === 'string' && beyondColor) {
                beyondPen.color = beyondColor;
            } else if (edgeColor) {
                beyondPen.color = edgeColor;
            }

            // Transparency → opacity (VGCategoryStyle: 0=opaque, 100=transparent)
            const trans = (partial as any).transparency;
            if (typeof trans === 'number') {
                const opacity = Math.max(0, Math.min(1, 1 - trans / 100));
                cutPen.opacity    = opacity;
                projPen.opacity   = opacity;
                beyondPen.opacity = opacity;
            }

            if (Object.keys(cutPen).length    > 0) graphicsRulesEngine.addViewOverride(viewId, 'CUT',        vgCategory, cutPen);
            if (Object.keys(projPen).length   > 0) graphicsRulesEngine.addViewOverride(viewId, 'PROJECTION', vgCategory, projPen);
            if (Object.keys(beyondPen).length > 0) graphicsRulesEngine.addViewOverride(viewId, 'BEYOND',     vgCategory, beyondPen);
        }
    }

    private _baseIsoLayer(layerTag: string): string | null {
        const tag = layerTag.trim();
        for (const prefix of Object.keys(ISO_CUT_LAYER_TO_POCHE_FILL)) {
            if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) return prefix;
        }
        return null;
    }

    private _computeDrawingFootprintBounds(drawing: any): { minH: number; maxH: number; minV: number; maxV: number } | null {
        let minH = Infinity;
        let maxH = -Infinity;
        let minV = Infinity;
        let maxV = -Infinity;

        drawing.three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 1) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;
            for (let i = 0; i < posAttr.count; i++) {
                let h: number;
                let vert: number;
                if (this._sectionFlipV) {
                    // OBC toDrawingSpace() always sets local Y=0; height is in local Z negated.
                    h    = posAttr.getX(i);
                    vert = -posAttr.getZ(i);
                } else {
                    _tmpV1.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
                    const hv = this._vertexToHV(_tmpV1);
                    h    = hv.h;
                    vert = hv.vert;
                }
                minH = Math.min(minH, h);
                maxH = Math.max(maxH, h);
                minV = Math.min(minV, vert);
                maxV = Math.max(maxV, vert);
            }
        });

        if (!Number.isFinite(minH) || !Number.isFinite(maxH) || !Number.isFinite(minV) || !Number.isFinite(maxV)) return null;
        return { minH, maxH, minV, maxV };
    }

    private _drawSnapIndicator(ctx: CanvasRenderingContext2D): void {
        const snap = this._snapIndicator;
        if (!snap) return;
        const r = 5;
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(37,99,235,0.15)';
        ctx.beginPath();
        ctx.arc(snap.sx, snap.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /**
     * §40 §2.2 — Returns true when the grid is a linear-mode datum with a
     * fully-specified XZ segment. Renderers and hit-testers MUST use the
     * (startX,startZ)→(endX,endZ) endpoints in this case.
     */
    private _isLinearGrid(grid: any): grid is { startX: number; startZ: number; endX: number; endZ: number } {
        return grid?.mode === 'linear'
            && Number.isFinite(grid.startX) && Number.isFinite(grid.startZ)
            && Number.isFinite(grid.endX)   && Number.isFinite(grid.endZ);
    }

    private _distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
}
