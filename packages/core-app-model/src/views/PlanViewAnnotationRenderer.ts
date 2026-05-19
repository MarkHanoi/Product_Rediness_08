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

import { annotationStore } from '@pryzm/plugin-annotations';
import {
    AnnotationElement,
    AnnotationStyle,
    DEFAULT_ANNOTATION_STYLE,
    DimensionElement,
} from '@pryzm/plugin-annotations';
import { formatDimension } from '@pryzm/plugin-annotations';
import { viewDefinitionStore } from './ViewDefinitionStore';
import type { ViewDefinition } from './ViewDefinitionTypes';
// Contract 23 §7 — GraphicsRulesEngine integration for annotation pen resolution
import { graphicsRulesEngine } from '../drawing/GraphicsRulesEngine';
import type { PenStyle } from '../drawing/PenWeightTable';
import { SCREEN_PX_PER_MM } from '../drawing/DrawingConstants';

export type PlanWorldToScreen = (worldX: number, worldZ: number) => { sx: number; sy: number };

export interface PlanViewAnnotationRenderOptions {
    activeLinkedViewId?: string | null;
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
]);

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
        if (this._isSectionLike()) return this._sectionHAxis === 'x' ? pt.x : pt.z;
        return pt.x;
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

        // Contract 23 §7 — resolve annotation base pen once per render call.
        // Priority: element override (10000) > view override (9000) > system (0).
        // The resolved pen feeds into _annotationLineColor() / _annotationLineWidthPx().
        this._engineAnnotationPen = graphicsRulesEngine.resolveStyle(
            'PROJECTION',
            'annotation',
            { viewId, viewType: options.viewType ?? this._viewType },
        );

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

    hitTestAnnotation(
        viewId: string,
        sx: number,
        sy: number,
        worldToScreen: PlanWorldToScreen,
        thresholdPx = 12,
    ): string | null {
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
            'linear-dimension', 'angular-dim', 'radius-dim', 'diameter-dim', 'slope-dim',
        ]);
        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            if (!DRAGGABLE_ANNOTATION_TYPES.has(ann.type)) continue;
            const pts = ann.geometry2D.modelPoints;
            if (!pts || pts.length === 0) continue;

            if (SEGMENT_TYPES.has(ann.type) && pts.length >= 2) {
                // Check all point anchors first (generous radius)
                for (const pt of pts) {
                    const { sx: ax, sy: ay } = worldToScreen(pt.x, pt.z);
                    if (Math.hypot(sx - ax, sy - ay) <= thresholdPx + 10) return ann.id;
                }
                // Then check all segments for line annotations
                for (let k = 0; k + 1 < pts.length; k++) {
                    const sA = worldToScreen(pts[k].x, pts[k].z);
                    const sB = worldToScreen(pts[k + 1].x, pts[k + 1].z);
                    if (distanceToSegment(sx, sy, sA.sx, sA.sy, sB.sx, sB.sy) <= thresholdPx + 4) return ann.id;
                }
            } else {
                // Point-based: check first anchor with a generous radius
                const pt = ann.references[0]?.cachedPosition ?? pts[0];
                if (!pt) continue;
                const { sx: ax, sy: ay } = worldToScreen(pt.x, pt.z);
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

    private _renderLinearDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const refs = ann.references;
        if (refs.length < 2) return;

        const mpA = refs[0].cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        const mpB = refs[1].cachedPosition ?? ann.geometry2D.modelPoints?.[1];
        if (!mpA || !mpB) return;

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
            if (len < 0.001) return;
            dirX = dx / len; dirZ = dz / len;
            bProjX = bx; bProjZ = bz;
            rawDist = len;
        }

        // Perpendicular side (XZ: rotate dir by 90°)
        const sideX = -dirZ;
        const sideZ =  dirX;

        const offset = ann.geometry2D.offset;

        // Dimension line endpoints (offset perpendicularly from reference line)
        const dAx = ax + sideX * offset, dAz = az + sideZ * offset;
        const dBx = bProjX + sideX * offset, dBz = bProjZ + sideZ * offset;

        const sRefA = w2s(ax, az);
        const sRefB = w2s(bProjX, bProjZ);
        const sDimA = w2s(dAx, dAz);
        const sDimB = w2s(dBx, dBz);

        // ── Extension lines (reference → dim line)
        ctx.save();
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

        const { sx: leaderSx, sy: leaderSy } = w2s(leaderPt.x, leaderPt.z);

        // Label box position: use screenOverride if set, else offset from leader
        let boxSx: number, boxSy: number;
        if (ann.geometry2D.screenOverride) {
            boxSx = ann.geometry2D.screenOverride.x;
            boxSy = ann.geometry2D.screenOverride.y;
        } else {
            const tagPt = ann.geometry2D.modelPoints?.[1];
            if (tagPt) {
                const sp = w2s(tagPt.x, tagPt.z);
                boxSx = sp.sx; boxSy = sp.sy;
            } else {
                boxSx = leaderSx; boxSy = leaderSy - 24;
            }
        }

        const textPx = Math.max(8, mmToPx(style.textSizeMm));
        ctx.save();
        ctx.font = `${textPx}px ${FONT}`;
        const metrics = ctx.measureText(label);
        const pad = 4;
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

    // ── Door Tag ──────────────────────────────────────────────────────────────
    // Standard BIM symbol: circle bubble at the door centre with the door mark
    // on the top half and optional W×H dimensions on the bottom half.
    // A thin leader line connects the bubble to the door position when the
    // user placed the tag at a different screen point.

    private _renderDoorTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const mark  = (ann.parameters.cachedLabel ?? ann.parameters.label ?? ann.parameters.mark ?? '') as string;
        const leaderPt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!leaderPt || !mark) return;

        const { sx: leaderSx, sy: leaderSy } = w2s(leaderPt.x, leaderPt.z);

        // Tag bubble position — second modelPoint if present, else offset from leader
        let bx = leaderSx;
        let by = leaderSy;
        const tagPt = ann.geometry2D.modelPoints?.[1];
        if (tagPt) { const sp = w2s(tagPt.x, tagPt.z); bx = sp.sx; by = sp.sy; }

        const isSelected = this._getSelectedAnnotationId() === ann.id;
        const lineColor  = isSelected ? ANNOT_SEL_COLOR : (style.lineColor ?? '#1a2035');
        const textColor  = isSelected ? ANNOT_SEL_COLOR : (style.textColor ?? '#1a2035');

        // Size string e.g. "900×2100" derived from width/height parameters (mm)
        const wMm = ann.parameters.widthMm  as number | undefined;
        const hMm = ann.parameters.heightMm as number | undefined;
        const hasSize = (wMm != null && wMm > 0) || (hMm != null && hMm > 0);
        const sizeStr = hasSize ? `${Math.round(wMm ?? 0)}×${Math.round(hMm ?? 0)}` : '';

        const r = sizeStr ? 16 : 13;
        const markPx = Math.max(7, mmToPx(style.textSizeMm) * 0.9);
        const sizePx = Math.max(6, markPx * 0.8);

        ctx.save();

        // Leader line
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
                // Dot at door centre
                ctx.fillStyle = lineColor;
                ctx.beginPath();
                ctx.arc(leaderSx, leaderSy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Circle bubble
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Horizontal divider when size is shown
        if (sizeStr) {
            ctx.beginPath();
            ctx.moveTo(bx - r, by);
            ctx.lineTo(bx + r, by);
            ctx.stroke();
        }

        // Mark number (top half or centred)
        ctx.font = `bold ${markPx}px ${FONT}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mark, bx, sizeStr ? by - r * 0.3 : by);

        // Dimensions (bottom half)
        if (sizeStr) {
            ctx.font = `${sizePx}px ${FONT}`;
            ctx.fillText(sizeStr, bx, by + r * 0.38);
        }

        ctx.restore();
    }

    // ── Window Tag ────────────────────────────────────────────────────────────
    // Standard BIM symbol: circle bubble with a horizontal strike-through line
    // (differentiating it visually from a door tag), window mark on top,
    // optional W×H dimensions on bottom.

    private _renderWindowTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w2s: PlanWorldToScreen,
        style: AnnotationStyle,
    ): void {
        const mark  = (ann.parameters.cachedLabel ?? ann.parameters.label ?? ann.parameters.mark ?? '') as string;
        const leaderPt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!leaderPt || !mark) return;

        const { sx: leaderSx, sy: leaderSy } = w2s(leaderPt.x, leaderPt.z);

        let bx = leaderSx;
        let by = leaderSy;
        const tagPt = ann.geometry2D.modelPoints?.[1];
        if (tagPt) { const sp = w2s(tagPt.x, tagPt.z); bx = sp.sx; by = sp.sy; }

        const isSelected = this._getSelectedAnnotationId() === ann.id;
        const lineColor  = isSelected ? ANNOT_SEL_COLOR : (style.lineColor ?? '#0f4c81');
        const textColor  = isSelected ? ANNOT_SEL_COLOR : (style.textColor ?? '#0f4c81');

        const wMm = ann.parameters.widthMm  as number | undefined;
        const hMm = ann.parameters.heightMm as number | undefined;
        const hasSize = (wMm != null && wMm > 0) || (hMm != null && hMm > 0);
        const sizeStr = hasSize ? `${Math.round(wMm ?? 0)}×${Math.round(hMm ?? 0)}` : '';

        const r = sizeStr ? 16 : 13;
        const markPx = Math.max(7, mmToPx(style.textSizeMm) * 0.9);
        const sizePx = Math.max(6, markPx * 0.8);

        ctx.save();

        // Leader line
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
                ctx.arc(leaderSx, leaderSy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Circle bubble (blue tint for window)
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.fillStyle = 'rgba(240,247,255,0.95)';
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Divider line always shown for window tags (visual differentiator)
        ctx.beginPath();
        ctx.moveTo(bx - r, by);
        ctx.lineTo(bx + r, by);
        ctx.stroke();

        ctx.font = `bold ${markPx}px ${FONT}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mark, bx, by - r * 0.3);

        if (sizeStr) {
            ctx.font = `${sizePx}px ${FONT}`;
            ctx.fillText(sizeStr, bx, by + r * 0.38);
        }

        ctx.restore();
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

        const pt = ann.references[0]?.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        if (!pt) return;

        const { sx, sy } = w2s(pt.x, pt.z);
        const textPx = Math.max(8, mmToPx(style.textSizeMm));
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
            const SEL_INK = '#f59e0b';                      // amber — selected sector
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
        const scope = this._computeElevationScope(ann, viewDef);
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

        const depth = Math.max(0.1, viewDef.spatial.sectionVolume?.far ?? viewDef.crop?.farClip?.offset ?? 8);
        const scope = this._scopeWorld(ann, viewDef);
        if (!scope) return;

        const a = w2s(scope.a.x, scope.a.z);
        const b = w2s(scope.b.x, scope.b.z);
        const fb = w2s(scope.farB.x, scope.farB.z);
        const fa = w2s(scope.farA.x, scope.farA.z);
        const depthHandle = { sx: (fa.sx + fb.sx) / 2, sy: (fa.sy + fb.sy) / 2 };

        ctx.save();
        this._renderScopeZoneFills(ctx, scope, w2s);

        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.92)';
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(fa.sx, fa.sy);
        ctx.moveTo(b.sx, b.sy);
        ctx.lineTo(fb.sx, fb.sy);
        ctx.moveTo(fa.sx, fa.sy);
        ctx.lineTo(fb.sx, fb.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(180, 83, 9, 0.95)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
        ctx.lineTo(depthHandle.sx, depthHandle.sy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(180, 83, 9, 0.95)';
        drawArrowTip(ctx, depthHandle, {
            x: depthHandle.sx - (a.sx + b.sx) / 2,
            y: depthHandle.sy - (a.sy + b.sy) / 2,
        }, 7);

        const cornerHandles = [a, b, fa, fb, depthHandle];
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.95)';
        ctx.lineWidth = 1.2;
        for (const p of cornerHandles) {
            ctx.beginPath();
            ctx.rect(p.sx - 4, p.sy - 4, 8, 8);
            ctx.fill();
            ctx.stroke();
        }

        const wh = this._scopeWidthHandleScreenPoints(ann, w2s);
        if (wh) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(180, 83, 9, 0.95)';
            ctx.lineWidth = 1.2;
            for (const p of [wh.left, wh.right]) {
                ctx.beginPath();
                ctx.rect(p.sx - 5, p.sy - 5, 10, 10);
                ctx.fill();
                ctx.stroke();
            }
        }

        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = 'rgba(120, 53, 15, 0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Depth ${depth.toFixed(2)} m`, depthHandle.sx, depthHandle.sy - 7);
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
        ctx.fillStyle = 'rgba(245, 158, 11, 0)';
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.75)';
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
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.98)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = 'rgba(120, 53, 15, 0.95)';
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

    private _sectionScopeWorld(ann: AnnotationElement, depth: number): ScopeWorld | null {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return null;
        const a = { x: pts[0].x, z: pts[0].z };
        const b = { x: pts[1].x, z: pts[1].z };
        const fallback = normalize2({ x: -(b.z - a.z), z: b.x - a.x });
        const dir = normalize2((ann.parameters.tailDirection as { x: number; z: number } | undefined) ?? fallback);
        return {
            a,
            b,
            farA: { x: a.x + dir.x * depth, z: a.z + dir.z * depth },
            farB: { x: b.x + dir.x * depth, z: b.z + dir.z * depth },
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
    ): ScopeWorld | null {
        const pt = ann.geometry2D.modelPoints?.[0];
        if (!pt) return null;
        const dir = normalize2((ann.parameters.facingDirection as { x: number; z: number } | undefined) ?? { x: 0, z: -1 });
        const perp = { x: -dir.z, z: dir.x };
        const depth = Math.max(0.1, viewDef.crop?.farClip?.offset ?? 8);
        const DEFAULT_HALF = 3;
        const leftPerp  = viewDef.crop?.region?.min[0]  ?? -DEFAULT_HALF;
        const rightPerp = viewDef.crop?.region?.max[0]  ??  DEFAULT_HALF;
        const a = { x: pt.x + perp.x * leftPerp,  z: pt.z + perp.z * leftPerp };
        const b = { x: pt.x + perp.x * rightPerp, z: pt.z + perp.z * rightPerp };
        return {
            a,
            b,
            farA: { x: a.x + dir.x * depth, z: a.z + dir.z * depth },
            farB: { x: b.x + dir.x * depth, z: b.z + dir.z * depth },
        };
    }

    private _scopeWorld(ann: AnnotationElement, viewDef: ViewDefinition): ScopeWorld | null {
        const volume = viewDef.spatial.sectionVolume;
        if (volume) {
            const [ox, , oz] = volume.origin;
            const dir = normalize2({ x: volume.direction[0], z: volume.direction[2] });
            const right = { x: -dir.z, z: dir.x };
            const half = Math.max(0.05, volume.width / 2);
            const near = Math.max(0, volume.near);
            const far = Math.max(near + 0.1, volume.far);
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
        const depth = Math.max(0.1, viewDef.crop?.farClip?.offset ?? 8);
        return ann.type === 'section-mark'
            ? this._sectionScopeWorld(ann, depth)
            : this._computeElevationScope(ann, viewDef);
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
        ctx.fillStyle = debug ? `rgba(59, 130, 246, ${alpha})` : `rgba(245, 158, 11, ${alpha})`;
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

        // Rotation: northAngle in degrees (0 = pointing up), convert to radians, flip for screen
        const northDeg  = (ann.parameters.northAngle as number | undefined) ?? 0;
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
