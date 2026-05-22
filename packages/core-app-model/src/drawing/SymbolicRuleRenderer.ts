/**
 * SymbolicRuleRenderer — Contract 25a §3.4 (Phase 3)
 *
 * Applies intent-derived styling to 2D symbolic elements (door swings, window
 * cased openings, etc.) in Canvas2D plan views.
 *
 * This renderer is called from PlanViewCanvas.render() for elements whose
 * intent `projection.symbolicRule` is set and the active view is a plan view.
 * It replaces the generic line-traversal style with appearance rules sourced
 * from IntentRuleResolver, ensuring symbolic geometry respects the active
 * VisibilityIntent (line weight, colour, opacity, dash pattern).
 *
 * Extensibility contract (Contract 25a §3.4):
 *   New symbols are added to SYMBOL_RENDERERS without modifying this module's
 *   core orchestration logic.  Each renderer receives:
 *     - ctx: the active Canvas2D context
 *     - segments: the screen-space segment pairs for this element
 *     - appearance: intent-resolved ElementStateAppearance
 *     - hairline: the minimum pixel width at the current DPR
 *     - SCREEN_PX_PER_MM: the global px-per-mm constant
 *
 * Contract compliance:
 *   Contract 25 §8.2  — rule precedence; appearance already resolved by caller
 *   Contract 25a §3.4 — extensible symbol dispatch; no renderer logic changes on extension
 *   Contract 05 §4    — no DOM, no Three.js, no store imports; Canvas2D only
 *   Contract 23 §7.1  — style only applied via pre-resolved ElementStateAppearance;
 *                        no direct PenWeightTable or GraphicsRulesEngine calls here
 */

import type { ElementStateAppearance } from '../presentation/VisibilityIntentTypes';
import { SCREEN_PX_PER_MM } from './DrawingConstants';

// ─── Segment type ─────────────────────────────────────────────────────────────

/** A single screen-space line segment (pixel coordinates). */
export interface SymbolSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

// ─── Symbol renderer type ─────────────────────────────────────────────────────

type SymbolRenderFn = (
    ctx: CanvasRenderingContext2D,
    segments: SymbolSegment[],
    appearance: ElementStateAppearance,
    hairline: number,
) => void;

// ─── Dash lookup ──────────────────────────────────────────────────────────────

const LINE_STYLE_TO_DASH: Record<ElementStateAppearance['line']['style'], number[] | null> = {
    solid:  null,
    dashed: [4, 3],
    dotted: [2, 2],
    chain:  [8, 4, 2, 4],
};

// ─── Base segment renderer ────────────────────────────────────────────────────

/**
 * Render all segments in a single beginPath / stroke call using the resolved
 * appearance. This is the default renderer used by 'plan-door-swing' and
 * 'plan-window-cased' to draw the already-projected symbol geometry.
 */
function _renderSegmentsWithAppearance(
    ctx: CanvasRenderingContext2D,
    segments: SymbolSegment[],
    appearance: ElementStateAppearance,
    hairline: number,
): void {
    if (!appearance.visible || segments.length === 0) return;

    ctx.save();
    ctx.strokeStyle = appearance.line.colour ?? '#1a1a1a';
    ctx.lineWidth   = Math.max(hairline, appearance.line.weight * SCREEN_PX_PER_MM);
    ctx.globalAlpha = appearance.line.opacity;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.miterLimit  = 4;

    const dash = LINE_STYLE_TO_DASH[appearance.line.style];
    ctx.setLineDash(dash ? dash.map(v => v * hairline) : []);

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
    'plan-door-swing': (ctx, segments, appearance, hairline) => {
        _renderSegmentsWithAppearance(ctx, segments, appearance, hairline);
    },

    /**
     * 'plan-window-cased' — two parallel lines with end caps (cased opening).
     *
     * Geometry is already injected by WindowPlanSymbolBuilder.inject().
     * This renderer applies intent-resolved styling.
     */
    'plan-window-cased': (ctx, segments, appearance, hairline) => {
        _renderSegmentsWithAppearance(ctx, segments, appearance, hairline);
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
 * Render a symbolic element using intent-derived appearance.
 *
 * This is the primary entry point called from PlanViewCanvas.render() when
 * the active intent's `projection.symbolicRule` is set for an element and
 * the view type is 'plan'.
 *
 * @param ctx        Active Canvas2D rendering context.
 * @param rule       The symbolicRule key (e.g. 'plan-door-swing').
 * @param segments   Screen-space segments for this element (pre-converted).
 * @param appearance Intent-resolved ElementStateAppearance for this element
 *                   in the 'projection' state (Contract 25 §8.3 step 2d).
 * @param hairline   Minimum pixel width at the current device pixel ratio.
 *
 * @returns true when a matching renderer was found and invoked; false otherwise.
 */
export function renderSymbol(
    ctx: CanvasRenderingContext2D,
    rule: string,
    segments: SymbolSegment[],
    appearance: ElementStateAppearance,
    hairline: number,
): boolean {
    const renderer = SYMBOL_RENDERERS[rule];
    if (!renderer) {
        console.warn(`[SymbolicRuleRenderer] No renderer registered for rule: "${rule}"`);
        return false;
    }
    renderer(ctx, segments, appearance, hairline);
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
    if (viewType !== 'plan') return null;
    const tag = layerTag.trim();
    // Beyond-zone layers must not use symbolic rendering — they fall through to
    // the generic dashed path so they share the same style as all other :beyond elements.
    if (/[:-]beyond\b/i.test(tag)) return null;
    // §DOOR-WINDOW-PLAN-FRAME (2026-05-22): CUT-zone sub-layers (A-DOOR-CUT,
    // A-GLAZ-CUT) carry the frame jambs + door leaf that are physically cut by
    // the floor-plan section plane. They MUST render as HEAVY generic CUT lines
    // (the "section cut frame" the architect requested) via the generic pen path
    // — where `isCut` resolves the CUT pen weight + poché — NOT through the
    // light, hard-coded 'projection'-state symbolic renderer. Returning null
    // routes them to the generic path. The swing arc / cased glazing on the
    // `…-PROJ` sub-layer keeps its symbolic rule (light projection symbol).
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
