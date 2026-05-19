/**
 * DimensionTypes — DIMENSION-SYSTEM-AUDIT-2026 §A1 (post-cleanup)
 *
 * The legacy `LinearDimensionEntity` (THREE.Group + DOM-label hybrid) and its
 * companion `LinearDimensionData` record were retired by §A1 of the audit.
 * The modern pipeline represents linear dimensions as
 * `AnnotationElement('linear-dim')` instances inside `AnnotationStore`.
 *
 * What remains here is the small `DimensionReference` shape kept for
 * forward-compatibility — `WallFaceDetector` continues to expose
 * `WallFaceType`, and downstream callers (LinearDimensionAnnotationTool,
 * LinearDimPlanToolHandler) build their own ad-hoc `{ wallId, faceType,
 * param }` triples that mirror this interface.  Keeping the canonical
 * type here makes the shape discoverable.
 *
 * CONTRACT COMPLIANCE:
 *   §01 §1.1 — type-only; no runtime side effects.
 *   §05 §7.8 — no DOM, no THREE imports.
 */
import type { WallFaceType } from '@pryzm/plugin-annotations';

export interface DimensionReference {
    wallId: string;
    /** Position along the wall baseline expressed as a 0–1 parameter. */
    param: number;
    /**
     * Semantic face type captured at pick time.  Optional — undefined for
     * legacy references that pre-date the Revit-grade face-aware redesign.
     */
    faceType?: WallFaceType;
}
