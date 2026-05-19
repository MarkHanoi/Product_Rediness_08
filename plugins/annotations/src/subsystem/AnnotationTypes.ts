/**
 * §ANN-A2 — View-Owned Annotation Data Model
 *
 * AnnotationElement is the canonical data record for every annotation in PRYZM.
 * Each annotation belongs to exactly one view (ownerViewId) and is invisible in
 * all other views — matching Revit's OwnerViewId semantics.
 *
 * Contract compliance:
 *   §05 §7.8  — No bim-* / @thatopen/ui elements
 *   §01 §5    — Pure data types; no DOM, no Three.js imports
 *   §01 §3.3  — Fully serialisable (plain objects / primitives only)
 */

import { StableReference } from './AnnotationReference';

// ─────────────────────────────────────────────────────────────────────────────
// Annotation type discriminant
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationType =
    | 'linear-dim'      // Phase B1 — Linear dimension
    | 'angular-dim'     // Phase B2 — Angular dimension
    | 'text-note'       // Phase B3 — Free text note
    | 'detail-line'     // Phase B3 — 2D detail line
    | 'tag'             // Phase B4 — Element parameter tag
    | 'spot-elevation'  // Phase B5 — Spot elevation
    | 'keynote'         // Phase B6 — Classification keynote
    | 'radius-dim'      // DOC-2.4 — Radius dimension (R label + leader to arc)
    | 'diameter-dim'    // DOC-2.4 — Diameter dimension (Ø label + across line)
    | 'slope-dim'       // DOC-2.4 — Slope dimension (slope ratio + rise/run arrow)
    | 'door-tag'        // DOC-2.5 — Door tag (type, width, height, mark)
    | 'window-tag'      // DOC-2.5 — Window tag (type, width, height, mark)
    | 'level-tag'       // DOC-2.5 — Level tag (triangle head + elevation in metres)
    | 'grid-bubble'     // DOC-2.5 — Grid bubble (circle + alphanumeric label at grid endpoint)
    | 'section-mark'   // DOC-2.7 — Section mark (cut line + head circles with sheet/detail ref)
    | 'elevation-mark' // DOC-2.7 — Elevation mark (circle with direction arrow + sheet/detail ref)
    | 'callout-detail' // DOC-2.8 — Callout bubble linking to a detail ViewDefinition
    | 'revision-cloud' // DOC-2.8 — Revision cloud (polygon of arc segments)
    | 'room-tag'        // DOC-2.5b — Room tag (name + number + area at centroid)
    | 'room-fill'       // DOC-2.5b — Room polygon fill (hatched/solid fill for plan views)
    | 'level-datum-line'  // DOC-2.5d — Level datum line label (elevation label at left of datum line in section/elevation)
    | 'section-grid-line' // DOC-2.5e — Grid bubble label at the top of a vertical grid line in section/elevation
    | 'roof-slope-arrow'  // DOC-2.5f — Slope ratio label at the centroid of a roof face in plan view
    // DOC-2.9 — F-1 notation symbols
    | 'north-arrow'       // DOC-2.9 — North-arrow symbol (circle + compass needle + 'N')
    | 'scale-bar'         // DOC-2.9 — Graphic scale bar (segmented bar with distance labels)
    | 'matchline'         // DOC-2.9 — Match line (heavy dashed line + 'MATCH LINE' label + sheet ref)
    ;

// ─────────────────────────────────────────────────────────────────────────────
// Visual style
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationStyle {
    lineWeight: number;          // in paper-space mm (default 0.35)
    lineColor: string;           // CSS colour (default '#1a2035')
    fillColor?: string;
    textSizeMm: number;          // paper-space text height in mm (default 2.5)
    textColor: string;           // CSS colour (default '#1a2035')
    fontFamily: string;
    arrowStyle: 'filled' | 'open' | 'dot' | 'none';
    arrowSizeMm: number;         // paper-space arrow head size in mm
}

export const DEFAULT_ANNOTATION_STYLE: Readonly<AnnotationStyle> = Object.freeze({
    lineWeight: 0.35,
    lineColor: '#1a2035',
    textSizeMm: 2.5,
    textColor: '#1a2035',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    arrowStyle: 'filled',
    arrowSizeMm: 2.0,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2D geometry in view/paper space
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationGeometry2D {
    /** Control points in model-space (world coordinates); projected to screen at render time */
    modelPoints: { x: number; y: number; z: number }[];
    /** Perpendicular offset from the reference line, in metres (for linear dims) */
    offset: number;
    /** For text/tag: override position in screen-pixel space, set after first placement */
    screenOverride?: { x: number; y: number };
    /**
     * §DIM-ORTHO: Stored measurement axis for linear dimensions between parallel walls.
     * When present, the renderer uses this direction (wall face normal) instead of
     * deriving the axis from (refB − refA), ensuring the dimension line is always
     * perpendicular to the wall faces regardless of where along each wall the user clicked.
     * Stored at creation time by LinearDimensionAnnotationTool when _wallANormal is known.
     */
    measurementNormal?: { x: number; y: number; z: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// §ANN-C2 — Semantic annotation fields (Phase C — Beyond Revit)
// Carries meaning beyond measurement: design intent, regulation, performance.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationSemantics {
    /**
     * Human-readable design intent, e.g.
     * "Shear wall — seismic zone B — do not penetrate without structural approval"
     */
    intent?: string;
    /**
     * Applicable regulation or standard reference, e.g.
     * "Complies with BS EN 1634-1 — Fire door 30 min rating"
     */
    regulation?: string;
    /**
     * Performance criteria, e.g.
     * "Minimum wheelchair turning radius 1200mm — DO NOT REDUCE"
     */
    performanceCriteria?: string;
    /**
     * Severity level for semantic warnings/constraints.
     * 'info' = informational only; 'warning' = soft constraint; 'critical' = hard constraint
     */
    severity?: 'info' | 'warning' | 'critical';
    /**
     * Free-form structured data (e.g. IFC classification codes, Uniclass references).
     */
    classificationCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core annotation element — the single data structure for all annotation types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationElement {
    /** Unique stable ID */
    id: string;
    /** Discriminant */
    type: AnnotationType;
    /** View that owns this annotation — invisible in all other views */
    ownerViewId: string;
    /** Resolved world-space reference points (rebuilt by DependencyGraph on element change) */
    references: StableReference[];
    /** 2D layout geometry */
    geometry2D: AnnotationGeometry2D;
    /** Visual style overrides (merged on top of DEFAULT_ANNOTATION_STYLE) */
    style: Partial<AnnotationStyle>;
    /**
     * Type-specific parameters:
     *   linear-dim  → { unit: 'mm'|'cm'|'m', prefix?: string, suffix?: string, override?: string }
     *   text-note   → { text: string, bold?: boolean, italic?: boolean }
     *   tag         → { targetElementId: string, labelExpression: string, cachedLabel: string, showLeader: boolean }
     *   spot-elev   → { unit: 'm'|'mm', relative?: boolean }
     *   detail-line → {}
     */
    parameters: Record<string, any>;
    /** If true, this dimension constrains geometry (driving dimension — Phase C) */
    isDriving: boolean;
    /**
     * §ANN-C2 — Optional semantic metadata (Phase C — Beyond Revit).
     * Carries design intent, regulatory context, and performance criteria.
     * When present, the render layer renders a semantic badge alongside the annotation.
     */
    semantics?: AnnotationSemantics;
    /** Creation timestamp */
    createdAt: number;
    /** Last-updated timestamp */
    updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §DIM-VIII-1 — DimensionElement (Contract 23 §K)
//
// A lightweight, view-owned, 2D-only dimension record.  Unlike AnnotationElement
// (which carries full 3D StableReferences + semantics), DimensionElement is a
// flat serialisable struct used directly by the plan-view Canvas renderer.
//
// Rendering rules (Contract 23 §K):
//   value       = textOverride ?? Math.round(dist(p1,p2)*1000) + ' mm'
//   Extension lines: perpendicular to p1→p2, length = offsetMm + 2 mm overshoot
//   Tick marks: 2 mm @ 45° at each dim-line endpoint
//   Text: 2.5 mm height, centred on dim line
//   Pen: 0.18 mm annotation weight
// ─────────────────────────────────────────────────────────────────────────────

/** World-XZ point (metres).  x = world X axis, y = world Z axis. */
export interface DimPoint2D {
    x: number;
    y: number;
}

/**
 * DimensionElement — §DIM-VIII-1
 *
 * A flat, serialisable 2D dimension record owned by exactly one view.
 * Created via `annotationStore.addDimension()` or the
 * `AnnotationManager.createDimension()` factory.
 */
export interface DimensionElement {
    /** Stable UUID for this dimension */
    id:           string;
    /** Discriminant — always 'linear-dimension' */
    type:         'linear-dimension';
    /** First reference point in world XZ (metres) */
    p1:           DimPoint2D;
    /** Second reference point in world XZ (metres) */
    p2:           DimPoint2D;
    /**
     * Perpendicular offset from the p1→p2 line, in millimetres.
     * Positive = left of the p1→p2 direction.
     */
    offsetMm:     number;
    /**
     * Optional text override.
     * null  → computed as Math.round(distance(p1,p2) * 1000) + ' mm'
     * string → displayed verbatim instead of the computed value
     */
    textOverride: string | null;
    /** The view this dimension belongs to — invisible in all other views */
    viewId:       string;
    /** Creation timestamp (ms since epoch) */
    createdAt:    number;
    /** Last-updated timestamp */
    updatedAt:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §DIM-VI-1 — String dimension typed helpers
//
// Stored in AnnotationElement.parameters for linear-dim annotations with
// isString === true.  Both types are plain serialisable objects (§01 §3.3).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single segment descriptor in a string (chain) dimension.
 * `refIndex` maps into AnnotationElement.references[]; `label` is an optional
 * per-segment value override (displayed instead of the computed distance).
 */
export interface LinearDimSegment {
    /** Index into AnnotationElement.references[] for the right endpoint of this segment */
    refIndex: number;
    /** Optional per-segment value override shown instead of the computed distance */
    label?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────────────────────────────────────

export function makeAnnotationElement(
    id: string,
    type: AnnotationType,
    ownerViewId: string,
    references: StableReference[],
    geometry2D: AnnotationGeometry2D,
    parameters: Record<string, any> = {},
    style: Partial<AnnotationStyle> = {},
    semantics?: AnnotationSemantics
): AnnotationElement {
    const now = Date.now();
    return {
        id,
        type,
        ownerViewId,
        references,
        geometry2D,
        style,
        parameters,
        isDriving: false,
        ...(semantics ? { semantics } : {}),
        createdAt: now,
        updatedAt: now,
    };
}
