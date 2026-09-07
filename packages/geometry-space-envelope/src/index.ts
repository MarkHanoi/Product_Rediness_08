// @pryzm/geometry-space-envelope — the space-envelope geometry subsystem.
//
// §FEAT-SPACE-ENVELOPE (L-12900) · **C114** · ADR-0380 · founder directive
// `STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS PACKAGE IS
// ═══════════════════════════════════════════════════════════════════════════════
//
// The pure solver behind an AUTHORED spatial volume — the founder's *"basic and
// initial representation of spaces as living entities, aware of their surroundings"*.
// It owns four things and deliberately owns nothing else:
//
//   1. THE PRISM and its derived metrics — and it is the ONE writer of
//      `footprintAreaM2` / `volumeM3` (C114 §2b).
//   2. THE FACE-MOVE PLANNER — move one face along its own normal; the connected
//      faces adapt; a move that would invert the solid REFUSES by name with both
//      numbers. ⭐ AND ITS DRAG HALF (`SpaceEnvelopeFaceDrag`): the projection of a
//      world-space pointer movement onto ONE face's own outward axis. The same
//      function feeds the live preview and the committed edit, which is what stops a
//      preview promising a move the commit then refuses.
//   3. THE AWARENESS RELATIONS — containment, adjacency, stacking, boundary
//      distance — computed ON DEMAND and never stored.
//   4. THE SOLAR JOIN — per-face exposure through `@pryzm/solar-analysis`.
//
// ⛔ IT DOES NOT OWN: the element record (that is `@pryzm/schemas`), the store, the
// commands, or any drawing. A planner that also mutated would make the live drag
// preview and the committed edit two different code paths, and the preview could
// then promise something the commit refuses.
//
// ─── LAYER / PURITY (L2) ────────────────────────────────────────────────────────
// Imports `@opentelemetry/api`, `@pryzm/schemas` (L0), `@pryzm/solar-analysis` (L1)
// and `@pryzm/site-parcel-data` (L2). ⛔ NO THREE (P2), NO DOM, and NO
// `@pryzm/spatial-index` — that package imports THREE, and depending on it would
// cost this one the `node` test environment that makes its verdicts provable.
//
// P8: every exported FUNCTION below carries an OpenTelemetry span, except the small
// pure predicates in `SpaceEnvelopeGeometry` that are called inside spans already
// open — wrapping those would produce a span per polygon vertex and drown the trace.

export {
    describeFaceRef,
    assertNeverSpaceEnvelope,
    MIN_FOOTPRINT_AREA_M2,
    MIN_HEIGHT_M,
    PARALLEL_CROSS_EPSILON,
    SPACE_ENVELOPE_REFUSAL_CODES,
    SPACE_ENVELOPE_REFUSAL_SENTENCE,
    type SpaceEnvelopeCensus,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
    type SpaceEnvelopeRefusal,
    type SpaceEnvelopeRefusalCode,
    type SpaceEnvelopeRefusalGround,
} from './SpaceEnvelopeTypes.js';

export {
    footprintAreaM2,
    outwardNormal,
    pointInRing,
    prismVerticalExtent,
    recomputeSpaceEnvelopeMetrics,
    ringCentroid,
    ringIsDegenerate,
    ringIsOnLevelPlane,
    ringSelfIntersects,
    signedFootprintAreaM2,
    spaceEnvelopeFaces,
    type EnvelopePoint,
    type SpaceEnvelopeMetrics,
} from './SpaceEnvelopeGeometry.js';

// §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS (lane FACE-DRAG, 2026-09-07) — WHICH FACE IS UNDER
// THE POINTER, as arithmetic. ⭐ This is what removes L-13045's dominant cost line: a
// ray/prism intersection answers the `pickFace` port on EVERY surface, so no rasteriser
// has to mint n + 2 pickable primitives per envelope and no second "which face?" rule
// exists to drift. Pure, and therefore provable in `node` — unlike the RAY, which each
// surface must build at its own edge and which no headless test can falsify.
export {
    FACE_BOUNDS_EPSILON_M,
    RAY_PLANE_PARALLEL_EPSILON,
    pickNearestSpaceEnvelopeFace,
    pickNearestSpaceEnvelopeSideFaceInPlan,
    pickSpaceEnvelopeFace,
    pickSpaceEnvelopeSideFaceInPlan,
    type SpaceEnvelopeFaceHit,
    type SpaceEnvelopeFacePickResult,
} from './SpaceEnvelopeFacePick.js';

export {
    computeSpaceEnvelopeFaceMoveCensus,
    planSpaceEnvelopeFaceMove,
    type SpaceEnvelopeFaceMoveCensus,
    type SpaceEnvelopeFaceMoveEntry,
    type SpaceEnvelopeFaceMoveRequest,
} from './SpaceEnvelopeFaceMove.js';

export {
    closestPointOnFaceAxis,
    prismOfSpaceEnvelopeRecord,
    readSpaceEnvelopeFaceDrag,
    spaceEnvelopeFaceAxis,
    spaceEnvelopeFaceCentre,
    type DragVec3,
    type SpaceEnvelopeFaceDragReading,
} from './SpaceEnvelopeFaceDrag.js';

// §25.6 gesture 1 (2026-09-06) — WHERE THE LITTLE ARROW SITS. Pure placement
// arithmetic; the cones that realise it are L7 and are NOT imported here (P2).
export {
    GIZMO_HALF_LENGTH_FRACTION,
    GIZMO_HEAD_FRACTION,
    GIZMO_HEAD_RADIUS_FRACTION,
    GIZMO_MAX_HALF_LENGTH_M,
    GIZMO_MIN_HALF_LENGTH_M,
    GIZMO_SHAFT_RADIUS_FRACTION,
    GIZMO_STANDOFF_FACTOR,
    spaceEnvelopeFaceExtentM,
    spaceEnvelopeFaceHandle,
    spaceEnvelopeFaceHandles,
    type SpaceEnvelopeFaceHandle,
    type SpaceEnvelopeFaceHandleOptions,
} from './SpaceEnvelopeFaceGizmo.js';

export {
    SPACE_ENVELOPE_COINCIDENT_M,
    adaptRoomToMovedLevel,
    findSharedFaces,
    levelOrphanRefusal,
    planSpaceEnvelopeFaceMoveInContext,
    roomContainmentRefusal,
    type SpaceEnvelopeContextEntry,
    type SpaceEnvelopeContextPlan,
    type SpaceEnvelopeContextRequest,
    type SpaceEnvelopeNeighbourUndetermined,
    type SpaceEnvelopeNeighbourUndeterminedReason,
    type SpaceEnvelopeSharedFace,
} from './SpaceEnvelopeContext.js';

export {
    adjacency,
    assessSpaceEnvelopeContainment,
    boundaryDistance,
    stackRelation,
    type BoundaryDistanceFinding,
    type SpaceEnvelopeAdjacency,
    type SpaceEnvelopeContainmentFinding,
    type SpaceEnvelopeStackRelation,
} from './SpaceEnvelopeRelations.js';

export {
    assertFaceSurfaceCoverage,
    buildSpaceEnvelopeFaceSurfaces,
    spaceEnvelopeFaceSurfaceId,
    spaceEnvelopeGlazing,
    spaceEnvelopeHeatGain,
    SPACE_ENVELOPE_DEFAULT_GLAZED_FRACTION,
    SPACE_ENVELOPE_SOLAR_FRAME_CAVEAT,
    type SpaceEnvelopeFaceSurface,
    type SpaceEnvelopeGlazingAssumption,
} from './SpaceEnvelopeSolar.js';

// §RESI-STAGE-G (2026-09-06) — the FOOTPRINT ↔ authoring-frame map behind C114 §11 item 7
// (profile edit). Pure arithmetic; the surface it feeds is L7 and is NOT imported here.
export {
    footprintFromProfileRing,
    headroomFor,
    isProfileFrameRefusal,
    spaceEnvelopeProfileFrame,
    MAX_PROFILE_HEADROOM_M,
    MIN_HORIZONTAL_EXTENT_M,
    MIN_PROFILE_HEADROOM_M,
    PROFILE_HEADROOM_FRACTION,
    type ProfileFrameRefusal,
    type ProfileFrameRefusalCode,
    type ProfileFrameVertex,
    type SpaceEnvelopeProfileFrame,
} from './SpaceEnvelopeProfileFrame.js';
