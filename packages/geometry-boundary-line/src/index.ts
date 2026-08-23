// @pryzm/geometry-boundary-line — public surface.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900..L-7910) · **C105** · ADR-0348.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT A CONSTRUCTION BOUNDARY LINE IS — AND THE TWO LINES IT IS NOT
// ═══════════════════════════════════════════════════════════════════════════════
//
// An AUTHORED setting-out line an architect draws to lay a scheme out at early-stage
// design, with the wall's own creation modes (linear, ortho, curved, rectangular,
// circular, elliptical). It is a HOST: what is built on it moves with it (C105 §3).
// It may optionally carry VOLUME, turning it into a massing edge.
//
// ⛔ IT IS **NOT** `Parcel.boundary` (C19 §1.4). That is the legal lot outline —
// surveyed, recorded, and ONE-SHOT IMMUTABLE for the lifetime of the Site; C19 §1.4
// says in as many words that *"there is no `site.editParcelBoundary` command"*, and a
// project that needs a different lot must replace the whole Site. Reusing or writing
// through it from this family would corrupt legally-sourced data with an ordinary
// edit gesture. The two share nothing: different brand, different store, different
// contract.
//
// ⛔ IT IS **NOT** `RoomBoundingLine` (`@pryzm/core-app-model`,
// `CommandType.CREATE_ROOM_BOUNDING_LINE`). That is a two-point INVISIBLE splitter
// consumed by room DETECTION to divide an open-plan space. It hosts nothing, has no
// volume, no LOD and no attachments.
//
// ─── P2 / PURITY ────────────────────────────────────────────────────────────────
// This package is PURE. It reaches neither THREE nor the DOM at module-eval time or
// anywhere else, which is what keeps the propagation PLANNER a function of its inputs
// and therefore testable at the same fidelity production runs it.

export type {
    BoundaryLineData,
    BoundaryLineAttachment,
    BoundaryLineDrawMode,
    BoundaryLineLoopMode,
    BoundaryLineStorePort,
    DependentShape,
    Vec2XZ,
    Vec3XYZ,
} from './BoundaryLineTypes';
export {
    BOUNDARY_LINE_DRAW_MODES,
    BOUNDARY_LINE_LOOP_MODES,
    isBoundaryLineDrawMode,
    isBoundaryLineLoopMode,
} from './BoundaryLineTypes';

export type { BoundaryLineSegment, BoundaryLineSolidSlice } from './BoundaryLineGeometry';
export {
    BOUNDARY_LINE_EPSILON_M,
    anchorDisplacement,
    anchorOnBoundaryLine,
    boundaryLineCentroid,
    boundaryLineLength,
    boundaryLineSegments,
    boundaryLineSolid,
    poseOnBoundaryLine,
    spanOnBoundaryLine,
} from './BoundaryLineGeometry';

export type {
    BoundaryLineSystemType,
    ResolvedBoundaryLineDimensions,
    BoundaryLineMaterialResolution,
} from './BoundaryLineDimensions';
export {
    BOUNDARY_LINE_DEFAULTS,
    resolveBoundaryLineDimensions,
    resolveBoundaryLineMaterial,
    resolveBoundaryLineSolidity,
} from './BoundaryLineDimensions';

export type {
    BoundaryLineAdaptation,
    BoundaryLineFamilyRule,
    BoundaryLineMovePlan,
    BoundaryLineRefusal,
    PropagationVerdict,
} from './BoundaryLinePropagation';
export {
    BOUNDARY_LINE_FAMILY_RULES,
    boundaryLineAdaptingFamilies,
    boundaryLineRefusingFamilies,
    boundaryLineRuleFor,
    planBoundaryLineMove,
    summariseBoundaryLineRefusals,
} from './BoundaryLinePropagation';
